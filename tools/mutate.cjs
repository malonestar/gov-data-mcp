#!/usr/bin/env node
/**
 * Mutation harness. Re-injects each known defect class into src/, confirms the
 * suite goes RED, then restores. A green suite that stays green under mutation
 * is not evidence of anything.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MUTATIONS = [
  { file: 'src/tools.js', from: 'isError: failed,', to: 'isError: false,', why: 'a FAILED run stops being flagged as an error' },
  { file: 'src/tools.js', from: '{ ...header, rows: result.items }', to: '{ ...header, rows: result.items || [] }, ', skip: true },
  { file: 'src/tools.js', from: 'return {\n    isError: failed,\n    text: JSON.stringify(failed ? header : { ...header, rows: result.items }, null, 2),', to: 'return {\n    isError: failed,\n    text: JSON.stringify({ ...header, rows: result.items }, null, 2),', why: 'a failed run leaks an empty rows key an agent reads as "nothing found"' },
  { file: 'src/tools.js', from: "if (a.slug.toLowerCase().includes(t)) score += 5;", to: "if (a.slug.toLowerCase().includes(t)) score += 1;", why: 'slug hits stop outranking description hits' },
  { file: 'src/apify.js', from: "if (status !== 'SUCCEEDED') {", to: "if (false) {", why: 'a failed run falls through and reads its dataset as if it had succeeded' },
  { file: 'src/apify.js', from: 'if (res.status === 429 || res.status >= 500) {', to: 'if (false) {', why: 'transient platform errors stop being retried' },
  { file: 'src/apify.js', from: "? 'The run SUCCEEDED and the actor emitted zero rows.", to: "? 'No results.", why: 'a genuine zero stops being distinguished from a failure' },
  // The dataset-lag defect measured live on 2026-08-11.
  { file: 'src/apify.js', from: 'const settled = await settleDataset(datasetId, maxItems);', to: 'const settled = { ok: true, items: (await request(`/datasets/${datasetId}/items?limit=${maxItems}&clean=true`)) || [] };', why: 'the settle loop is removed and a single early read is believed' },
  { file: 'src/apify.js', from: 'if (lastCount === 0 && reads >= minReads && elapsed >= minWindowMs)', to: 'if (lastCount === 0 && reads >= 1)', why: 'a zero is accepted on the first read instead of after a real window' },
  { file: 'src/apify.js', from: 'lastCount = Math.max(rows.length, (meta && meta.itemCount) || 0);', to: 'lastCount = rows.length;', why: 'a non-zero itemCount stops disproving an empty items read' },
  { file: 'src/apify.js', from: 'if (lastCount > 0) {\n          return {\n            ok: false,', to: 'if (false) {\n          return {\n            ok: false,', why: 'rows that never propagate get published as a zero instead of an error' },
  // The exact bug that shipped in the first draft: assume one envelope shape.
  { file: 'src/apify.js', from: "if (Array.isArray(json)) return json;\n    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;", to: 'return json ? json.data : null;', why: 'the bare-array dataset envelope is read for a .data key and every row vanishes' },

  // --- agent-surface defects, all of which had shipped at least once --------
  { file: 'src/tools.js', from: '      annotations: { title: a.title, ...ANNOTATIONS.BILLED_LIVE_READ },', to: '', why: 'featured tools stop declaring what calling them does to the world' },
  { file: 'src/tools.js', from: '  BILLED_LIVE_READ: { readOnlyHint: false,', to: '  BILLED_LIVE_READ: { readOnlyHint: true,', why: 'a tool that spends the caller money claims to be read-only' },
  { file: 'src/tools.js', from: '  CATALOG_LOCAL: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }', to: '  CATALOG_LOCAL: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }', why: 'a bundled catalog read claims to reach the open world' },
  { file: 'src/tools.js', from: 'Reads live from the official government source. ${costNote(a.pricing)}', to: 'Reads live from the official government source. ${\'\'}', why: 'billing stops being disclosed on the tools that bill' },
  { file: 'src/tools.js', from: "  'nhd-surface-water-404-screener':", to: "  'nhd-surface-water-404-screeners':", why: 'a routing note points at a tool name that does not exist' },
  { file: 'package.json', from: 'MCP server exposing published US government', to: 'MCP server exposing 95 published US government', why: 'the npm headline description carries a count that will rot' },
  { file: 'README.md', from: 'and it will search all ', to: 'and it will search all 95. Ignore: ', why: 'a stale catalog count is reintroduced into README prose' },

  // --- pricing and naming, v1.1.0 ------------------------------------------
  { file: 'src/tools.js', from: 'billed ${priceLine(pricing)}', to: 'billed at the rate on the Store page.', why: 'featured tools stop quoting a price an agent can actually read' },
  { file: 'src/tools.js', from: "    usdPer1000Results: x.actor.pricing ? x.actor.pricing.usdPer1000 : null,", to: '', why: 'search hits stop carrying price, so an agent chooses blind' },
  { file: 'src/tools.js', from: "  SEARCH: 'search-gov-data-tools',", to: "  SEARCH: 'search_gov_data_tools',", why: 'the naming convention splits in two again' },
  { file: 'src/tools.js', from: '  if (RENAMED_IN_1_1[toolName]) {', to: '  if (false) {', why: 'a pre-1.1 tool name gets a bare "unknown tool" with no way to recover' },
  { file: 'src/catalog.json', from: '"usdPerUnit": 0.01,', to: '"usdPerUnit": 10,', why: 'a 1000x overpriced rate reaches the shipped catalog' },
];

let pass = 0, fail = 0;
for (const m of MUTATIONS) {
  if (m.skip) continue;
  const p = path.join(ROOT, m.file);
  const original = fs.readFileSync(p, 'utf8');
  if (!original.includes(m.from)) { console.error(`SKIP (pattern not found) ${m.file}: ${m.why}`); fail++; continue; }
  fs.writeFileSync(p, original.replace(m.from, m.to));
  let red = false;
  try {
    execSync('node --test test/tools.test.js test/apify.test.js test/catalog.test.js test/agent-surface.test.js', { cwd: ROOT, stdio: 'pipe' });
  } catch { red = true; }
  fs.writeFileSync(p, original);
  if (red) { console.log(`RED   ${m.why}`); pass++; }
  else { console.error(`GREEN ${m.why}  <-- the suite did NOT catch this`); fail++; }
}

// The suite must be green again after every restore.
try { execSync('node --test test/tools.test.js test/apify.test.js test/catalog.test.js test/agent-surface.test.js', { cwd: ROOT, stdio: 'pipe' }); }
catch { console.error('FATAL: suite is red after restore'); process.exit(1); }

console.log(`\n${pass} caught, ${fail} missed`);
process.exit(fail === 0 ? 0 : 1);
