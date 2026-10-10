// Agent guidance: the measured failure mode is agents GUESSING inputs and
// paying for runs that answer nothing. These tests pin every piece of help
// the server gives so it cannot quietly disappear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  META_TOOLS, indexCatalog, describeTool, resolveCall, formatRunResult,
  preflight, guidanceFor, serverInstructions, metaToolDefinitions, featuredToolDefinitions,
} from '../src/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '..', 'src', 'catalog.json'), 'utf8'));
const index = indexCatalog(catalog);

test('catalog carries a verified example input for nearly every tool', () => {
  const withExample = catalog.actors.filter(a => a.exampleInput && Object.keys(a.exampleInput).length).length;
  assert.ok(withExample >= catalog.actors.length - 3, `only ${withExample} of ${catalog.actors.length} tools have an example input`);
  for (const a of catalog.actors) {
    assert.ok(Array.isArray(a.mustSupply), `${a.slug} mustSupply missing`);
    assert.ok(Array.isArray(a.examples), `${a.slug} examples missing`);
    for (const e of a.examples) assert.ok(e.title && e.input && typeof e.input === 'object', `${a.slug} malformed example`);
  }
});

test('exampleInput is built from schema PREFILLS (verified), never from defaults', () => {
  // The generator documents each prefill in the property description as "Example: <json>.".
  let checked = 0;
  for (const a of catalog.actors) {
    for (const [k, v] of Object.entries(a.exampleInput || {})) {
      const s = JSON.stringify(v);
      if (s.length > 300) continue;
      const desc = (a.inputSchema.properties[k] && a.inputSchema.properties[k].description) || '';
      assert.ok(desc.includes(`Example: ${s}.`), `${a.slug}.${k}: example value is not the documented prefill`);
      checked++;
    }
  }
  assert.ok(checked > 200, `only ${checked} example values checked`);
});

test('every verified input (prefill + published task inputs) passes preflight - no false rejections', () => {
  for (const a of catalog.actors) {
    assert.deepEqual(preflight(a, a.exampleInput || {}), [], `${a.slug} prefill rejected`);
    for (const e of a.examples) assert.deepEqual(preflight(a, e.input), [], `${a.slug} example "${e.title}" rejected`);
  }
});

test('preflight reports a missing required field, an unknown field and a bad enum value', () => {
  const a = index.bySlug.get('faa-drone-airspace-checker');
  assert.ok(a.mustSupply.includes('points'));
  assert.ok(preflight(a, {}).some(p => p.includes('"points" is required')));
  assert.ok(preflight(a, { points: [] }).some(p => p.includes('"points" is required')), 'an empty array is not supplied');
  assert.ok(preflight(a, { ...a.exampleInput, pointz: 1 }).some(p => p.includes('"pointz" is not an input')));
  const withEnum = catalog.actors.find(x => Object.values(x.inputSchema.properties).some(p => Array.isArray(p.enum)));
  const [k] = Object.entries(withEnum.inputSchema.properties).find(([, p]) => Array.isArray(p.enum));
  assert.ok(preflight(withEnum, { ...(withEnum.exampleInput || {}), [k]: 'definitely-not-a-value' }).some(p => p.includes(`"${k}" must be one of`)));
});

test('a call that fails preflight is refused locally with the example to copy, and nothing runs', () => {
  const r = resolveCall(index, META_TOOLS.RUN, { tool: 'faa-drone-airspace-checker', input: {} });
  assert.equal(r.ok, false);
  const body = JSON.parse(r.error);
  assert.equal(body.run_status, 'NOT_RUN_INPUT_INVALID');
  assert.match(body.next_step, /nothing was charged/i);
  assert.deepEqual(body.example_input, index.bySlug.get('faa-drone-airspace-checker').exampleInput);
  assert.ok(body.must_supply.includes('points'));
  const direct = resolveCall(index, 'faa-drone-airspace-checker', { pointz: [] });
  assert.equal(direct.ok, false, 'the dedicated tool is preflighted too');
});

test('a FAILED run carries next_step and the verified example; a pending run does not tell the agent to change input', () => {
  const a = index.bySlug.get('epa-contaminated-site-screener');
  const failed = JSON.parse(formatRunResult(a.slug, { status: 'FAILED', runId: 'r1', itemCount: 0, items: [], statusMessage: 'x' }, a).text);
  assert.match(failed.next_step, /not answered/);
  assert.deepEqual(failed.example_input, a.exampleInput);
  assert.equal(failed.rows, undefined, 'a failure still never carries a rows key');
  const pending = JSON.parse(formatRunResult(a.slug, { status: 'CLIENT_TIMEOUT', runId: 'r2', itemCount: 0, items: [] }, a).text);
  assert.equal(pending.next_step, undefined);
});

test('a zero-row SUCCEEDED run tells the agent to check scope before concluding none exist', () => {
  const a = index.bySlug.get('license-verifier');
  const out = JSON.parse(formatRunResult(a.slug, { status: 'SUCCEEDED', runId: 'r3', itemCount: 0, items: [] }, a).text);
  assert.match(out.next_step, /check the scope/);
  assert.deepEqual(out.rows, []);
  const withRows = JSON.parse(formatRunResult(a.slug, { status: 'SUCCEEDED', runId: 'r4', itemCount: 1, items: [{ a: 1 }] }, a).text);
  assert.equal(withRows.next_step, undefined, 'a non-empty answer carries no remediation noise');
});

test('describe returns must_supply, example_input, examples and how_to_call', () => {
  const d = describeTool(index, 'medicaid-exclusion-screener');
  assert.equal(d.ok, true);
  assert.ok(d.example_input && typeof d.example_input === 'object');
  assert.ok(Array.isArray(d.must_supply));
  assert.ok(Array.isArray(d.examples));
  assert.match(d.how_to_call, /example_input/);
  assert.match(d.how_to_call, new RegExp(META_TOOLS.RUN));
});

test('server instructions teach the workflow, scoping, and how to read failures and zeros', () => {
  const s = serverInstructions(index);
  for (const needle of [META_TOOLS.SEARCH, META_TOOLS.DESCRIBE, 'exampleInput', 'SCOPE', 'NOT answered', 'zero rows', 'null']) {
    assert.ok(s.includes(needle), `instructions missing "${needle}"`);
  }
  assert.ok(s.includes(String(index.actors.length)), 'instructions state the live tool count');
});

test('tool descriptions point agents at the free describe call and the local input check', () => {
  const run = metaToolDefinitions(index).find(t => t.name === META_TOOLS.RUN);
  assert.match(run.description, /checked locally first/);
  for (const t of featuredToolDefinitions(index)) assert.ok(t.description.includes(META_TOOLS.DESCRIBE), `${t.name} does not mention describe`);
});

test('index.js sends the instructions and passes the actor into formatRunResult', () => {
  const src = readFileSync(join(here, '..', 'src', 'index.js'), 'utf8');
  assert.ok(src.includes('instructions: serverInstructions(index)'));
  assert.ok(src.includes('formatRunResult(call.slug, result, index.bySlug.get(call.slug))'));
});

test('guidanceFor never invents an example for an unknown actor', () => {
  const g = guidanceFor(null, 'failed');
  assert.equal(g.example_input, null);
  assert.deepEqual(g.must_supply, []);
});

test('every featured tool carries parameter guidance, and every input it names exists in the live schema', async () => {
  const { SCOPING, FEATURED } = await import('../src/tools.js');
  for (const slug of FEATURED) {
    assert.ok(SCOPING[slug], `${slug} has no SCOPING note`);
    const props = index.bySlug.get(slug).inputSchema.properties;
    const named = [...SCOPING[slug].matchAll(/`([A-Za-z0-9_]+)`/g)].map(m => m[1]);
    assert.ok(named.length >= 2, `${slug} SCOPING names fewer than 2 inputs`);
    for (const n of named) assert.ok(props[n], `${slug} SCOPING names \`${n}\`, which is not an input`);
  }
  for (const t of featuredToolDefinitions(index)) assert.ok(t.description.includes('INPUTS:'), `${t.name} description lacks the INPUTS guidance`);
});

test('faa-drone-airspace-checker says when it is the wrong tool', () => {
  const t = featuredToolDefinitions(index).find(x => x.name === 'faa-drone-airspace-checker');
  assert.match(t.description, /CHOOSE THIS/);
  assert.match(t.description, /site-due-diligence-bundle/);
});
