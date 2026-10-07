#!/usr/bin/env node
/**
 * Generate src/catalog.json from the LIVE Apify API.
 *
 * Fails loudly. A partial catalog is worse than no catalog: it would silently
 * tell an agent that a real, published tool does not exist. Any actor that
 * cannot be fully resolved aborts the whole run.
 *
 * Usage: node tools/gen-catalog.cjs <apify-token>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('usage: gen-catalog.cjs <apify-token>'); process.exit(1); }

const USERNAME = 'malonestar';
const OUT = path.join(__dirname, '..', 'src', 'catalog.json');

async function get(url, attempt = 1) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${url} -> HTTP ${res.status} after ${attempt} attempts`);
    await new Promise(r => setTimeout(r, 500 * attempt));
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Apify input schemas are JSON-Schema-shaped but carry editor hints and, crucially,
// `default` values that Apify injects SERVER-SIDE into every run. We keep `default`
// out of the MCP schema (an agent should not be told a filter is pre-applied) but
// surface `prefill` as an example in the description.
const MAX_EXAMPLE = 400;
function brief(v) {
  const s = JSON.stringify(v);
  return s.length <= MAX_EXAMPLE ? s : s.slice(0, MAX_EXAMPLE - 1) + '…(truncated)';
}

function sanitiseProperty(name, p) {
  const out = {};
  if (p.type) out.type = p.type;
  let desc = (p.description || '').trim();
  if (p.prefill !== undefined) {
    desc += (desc ? ' ' : '') + `Example: ${brief(p.prefill)}.`;
  }
  if (p.default !== undefined && JSON.stringify(p.default) !== JSON.stringify(p.prefill)) {
    desc += (desc ? ' ' : '') + `Applied by default if omitted: ${brief(p.default)}.`;
  }
  if (desc) out.description = desc;
  if (Array.isArray(p.enum)) out.enum = p.enum;
  if (p.type === 'array') out.items = p.items && typeof p.items === 'object' ? p.items : { type: 'string' };
  if (p.minimum !== undefined) out.minimum = p.minimum;
  if (p.maximum !== undefined) out.maximum = p.maximum;
  return out;
}

/**
 * Extract what a call actually costs, from the ACTIVE pricing entry.
 *
 * Three traps, all of them measured on this account:
 *
 * 1. `pricingInfos` is a HISTORY, not a value. Reading the last element blindly
 *    can publish a price that is not yet in effect — Apify schedules a price
 *    change with a FUTURE `startedAt` and a notification period, and the entry
 *    sits in the array the whole time. The active entry is the latest one whose
 *    `startedAt` has already passed.
 * 2. `actorChargeEvents` is KEYED, and the first key is `apify-actor-start`, not
 *    the result event. Reading [0] reports the wrong number for every actor.
 * 3. `eventTieredPricingUsd.FREE` is an OBJECT — the price is one level deeper at
 *    `.tieredEventPriceUsd`. Reading it like the flat `eventPriceUsd` yields
 *    undefined for every tiered actor, which is all of them.
 */
function activePricing(detail, now = Date.now()) {
  const infos = Array.isArray(detail.pricingInfos) ? detail.pricingInfos : [];
  const started = infos
    .filter(p => p.startedAt && Date.parse(p.startedAt) <= now)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const active = started[started.length - 1];
  if (!active) return null;

  const events = (active.pricingPerEvent && active.pricingPerEvent.actorChargeEvents) || {};
  const entries = Object.entries(events);
  const primary = entries.find(([, e]) => e.isPrimaryEvent)
    || entries.find(([, e]) => e.eventTieredPricingUsd)
    || entries.find(([k]) => k !== 'apify-actor-start');
  if (!primary) return null;

  const [eventName, ev] = primary;
  const tiers = ev.eventTieredPricingUsd || null;
  const listPrice = tiers
    ? (tiers.FREE && tiers.FREE.tieredEventPriceUsd)
    : ev.eventPriceUsd;
  if (typeof listPrice !== 'number' || !Number.isFinite(listPrice)) return null;

  const startEvent = events['apify-actor-start'];
  return {
    model: active.pricingModel,
    event: eventName,
    // true = billed per dataset row (a per-1,000 figure is meaningful); false = billed
    // per discrete event such as one generated report, where "per 1,000" misleads.
    perResult: eventName === 'apify-default-dataset-item',
    unit: ev.eventTitle || 'result',
    usdPerUnit: listPrice,
    usdPer1000: Number((listPrice * 1000).toFixed(4)),
    tierDiscountsUsdPerUnit: tiers
      ? Object.fromEntries(Object.entries(tiers).map(([t, v]) => [t, v.tieredEventPriceUsd]))
      : null,
    actorStartUsd: startEvent ? startEvent.eventPriceUsd : null,
    since: active.startedAt,
  };
}

// A per-1k price far outside the portfolio's real band is the signature of the
// 1000x overprice defect: a pricing PUT that sets per-1k dollars where Apify
// expects per-EVENT dollars returns HTTP 200 and silently overcharges. Refuse to
// publish a catalog carrying one — an agent quoting that price to a buyer is the
// worst version of this bug.
const MIN_USD_PER_1000 = 0.5;
const MAX_USD_PER_1000 = 200;
// Per-event (non-row) pricing, e.g. environmental-records-report's report-generated event.
const MIN_USD_PER_EVENT = 0.05;
const MAX_USD_PER_EVENT = 50;

/**
 * A known-good starting input: every property's `prefill`, assembled into one
 * object. Prefill is what Apify's own auto-QA sends every ~3 days and what each
 * actor is built to answer non-empty, so it is the single best "first call" an
 * agent can make. (`default` is deliberately NOT used — see sanitiseProperty.)
 */
function exampleInputOf(input) {
  const out = {};
  for (const [k, v] of Object.entries(input.properties || {})) {
    if (v.prefill !== undefined) out[k] = v.prefill;
  }
  return Object.keys(out).length ? out : null;
}

// Required fields an agent MUST supply: required and with no server-side default.
function mustSupplyOf(input) {
  const req = Array.isArray(input.required) ? input.required : [];
  return req.filter(k => !(input.properties && input.properties[k] && input.properties[k].default !== undefined));
}

const MAX_EXAMPLE_BYTES = 1500;
const MAX_EXAMPLES = 2;

function toJsonSchema(input) {
  const props = {};
  for (const [k, v] of Object.entries(input.properties || {})) props[k] = sanitiseProperty(k, v);
  const schema = { type: 'object', properties: props };
  if (Array.isArray(input.required) && input.required.length) schema.required = input.required;
  return schema;
}

(async () => {
  const list = await get(`https://api.apify.com/v2/acts?my=1&limit=500`);
  const items = list.data && list.data.items;
  if (!Array.isArray(items) || items.length === 0) throw new Error('actor list came back empty');
  console.error(`[gen] ${items.length} actors owned`);

  // Published demo tasks are run-verified, real use cases with a human title.
  // They are public landing pages already, so their inputs are safe to ship.
  // The TASK list's isPublic is truthful (unlike the ACT list's).
  const taskList = await get(`https://api.apify.com/v2/actor-tasks?limit=1000`);
  const tasksByActId = new Map();
  for (const t of (taskList.data && taskList.data.items) || []) {
    if (!t.isPublic) continue;
    if (!tasksByActId.has(t.actId)) tasksByActId.set(t.actId, []);
    tasksByActId.get(t.actId).push(t);
  }

  const catalog = [];
  const skipped = [];
  for (const it of items) {
    // GOTCHA: the LIST endpoint returns isPublic:false for every actor. Only the
    // detail endpoint is truthful. Never audit publication state off the list.
    const detail = (await get(`https://api.apify.com/v2/acts/${it.id}`)).data;
    if (!detail.isPublic) { skipped.push({ name: detail.name, why: 'not public' }); continue; }
    if (detail.isDeprecated) { skipped.push({ name: detail.name, why: 'deprecated' }); continue; }

    const buildId = detail.taggedBuilds && detail.taggedBuilds.latest && detail.taggedBuilds.latest.buildId;
    if (!buildId) throw new Error(`${detail.name}: no build tagged "latest"`);
    const build = (await get(`https://api.apify.com/v2/actor-builds/${buildId}`)).data;
    const defn = build.actorDefinition || {};
    const input = defn.input;
    if (!input || !input.properties) throw new Error(`${detail.name}: build ${buildId} has no input schema`);

    // Cost is not optional metadata. An agent that cannot see the price cannot
    // weigh whether to call, and this catalog is the only place it could look.
    const pricing = activePricing(detail);
    if (!pricing) throw new Error(`${detail.name}: no active pricing could be resolved — refusing to publish a tool whose cost an agent cannot see`);
    if (!pricing.perResult) {
      // Per-event pricing (e.g. one report): the per-1k band does not apply, but the
      // 1000x defect still shows as an absurd per-unit price, so band the unit price.
      if (pricing.usdPerUnit < MIN_USD_PER_EVENT || pricing.usdPerUnit > MAX_USD_PER_EVENT) {
        throw new Error(`${detail.name}: $${pricing.usdPerUnit} per ${pricing.unit} is outside the per-event band $${MIN_USD_PER_EVENT}-$${MAX_USD_PER_EVENT} — check the actor's pricing before regenerating.`);
      }
    } else if (pricing.usdPer1000 < MIN_USD_PER_1000 || pricing.usdPer1000 > MAX_USD_PER_1000) {
      throw new Error(`${detail.name}: $${pricing.usdPer1000}/1000 is outside the sane band $${MIN_USD_PER_1000}-$${MAX_USD_PER_1000}. `
        + 'This is the signature of a pricing PUT that set per-1k dollars where Apify expects per-EVENT dollars (a 1000x error that returns HTTP 200). Check the actor before regenerating.');
    }

    const examples = [];
    for (const t of (tasksByActId.get(detail.id) || []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (examples.length >= MAX_EXAMPLES) break;
      // This endpoint returns the raw input object, not a { data } envelope.
      const tin = await get(`https://api.apify.com/v2/actor-tasks/${t.id}/input`);
      if (!tin || typeof tin !== 'object' || Array.isArray(tin)) continue;
      // Only fields the live schema still declares, so a stale task cannot teach a dead field.
      const clean = Object.fromEntries(Object.entries(tin).filter(([k]) => input.properties[k] !== undefined));
      if (!Object.keys(clean).length || JSON.stringify(clean).length > MAX_EXAMPLE_BYTES) continue;
      examples.push({ title: t.title || t.name, input: clean });
    }

    catalog.push({
      slug: detail.name,
      actorId: `${USERNAME}/${detail.name}`,
      title: detail.title || defn.title || detail.name,
      description: (detail.description || defn.description || '').trim(),
      categories: detail.categories || [],
      storeUrl: `https://apify.com/${USERNAME}/${detail.name}`,
      pricing,
      inputSchema: toJsonSchema(input),
      exampleInput: exampleInputOf(input),
      mustSupply: mustSupplyOf(input),
      examples,
    });
    console.error(`[gen] + ${detail.name} (${Object.keys(input.properties).length} inputs, $${pricing.usdPer1000}/1k)`);
  }

  catalog.sort((a, b) => a.slug.localeCompare(b.slug));
  if (catalog.length < 50) throw new Error(`only ${catalog.length} published actors resolved — refusing to write a suspiciously small catalog`);

  const payload = {
    generatedAt: new Date().toISOString(),
    owner: USERNAME,
    count: catalog.length,
    actors: catalog,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.error(`[gen] wrote ${OUT}: ${catalog.length} published actors, ${skipped.length} skipped`);
  for (const s of skipped) console.error(`[gen]   skip ${s.name}: ${s.why}`);
})().catch(e => { console.error('[gen] FAILED:', e.message); process.exit(1); });
