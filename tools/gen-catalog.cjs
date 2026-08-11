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

    catalog.push({
      slug: detail.name,
      actorId: `${USERNAME}/${detail.name}`,
      title: detail.title || defn.title || detail.name,
      description: (detail.description || defn.description || '').trim(),
      categories: detail.categories || [],
      storeUrl: `https://apify.com/${USERNAME}/${detail.name}`,
      inputSchema: toJsonSchema(input),
    });
    console.error(`[gen] + ${detail.name} (${Object.keys(input.properties).length} inputs)`);
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
