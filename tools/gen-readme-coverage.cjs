#!/usr/bin/env node
/**
 * Regenerate the README's Coverage table from the catalog.
 *
 * Why generated rather than hand-written:
 *   - The README shipped claiming "95 US government open-data tools" against a
 *     live 114. A hand-maintained number rots the moment a batch ships, and it
 *     rots on the npm page and the GitHub page simultaneously, which are the two
 *     places a stranger evaluates this project.
 *   - Every actor deserves a link. An agent builder reading this page cannot
 *     tell whether their use case is covered from a prose blob; a named,
 *     linked list is the difference between "some environmental stuff" and
 *     "yes, it does FEMA repetitive-loss".
 *
 * Store categories are useless for grouping here — 110 of 114 actors are
 * DEVELOPER_TOOLS — so the buckets are keyed off the slug and title instead.
 * Anything that matches no bucket is REPORTED, never silently dropped into a
 * catch-all, because a silently-dropped actor is an actor nobody can find.
 *
 * Usage: node tools/gen-readme-coverage.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'catalog.json'), 'utf8'));

// Ordered: first match wins, so put the specific before the general.
const BUCKETS = [
    ['Contamination & environmental due diligence',
        /contaminated|rcra|tsca|superfund|brownfield|tri-facility|airtoxscreen|erns|fuds|historic-land-use|repowering|due-diligence|impaired-waters|sole-source|drinking-water|ghgrp|hazwaste|nonattainment|tank-spill|historical-topo/],
    ['Flood, fire, quake & ground hazard',
        /flood|nfip|fema-nri|wildfire|calfire|seismic|landslide|karst|sea-level|slr|storm-events|levee|repetitive-loss|bedrock-geology|lithology/],
    ['Habitat, wetlands, protected & historic land',
        /wetland|critical-habitat|efh|padus|nrhp|historic-place|wild-scenic|sage-grouse|coastal-barrier|tribal|cbrs/],
    ['Energy siting, grid & pipelines',
        /grid|interconnection|pipeline|energy-corridor|solar|wind|boem|eia-|nrel|pvwatts|uswtdb|oil-gas|blm-mining|orphaned-well|energy-economics|ira-energy|energy-bonus|nmtc/],
    ['Farmland, soil & water',
        /farmland|cdl|ssurgo|soil|water-rights|nwis|streamflow|groundwater|nhd-surface|aquifer/],
    ['Banking, lending & credit',
        /fdic|ncua|fhlbank|hmda|sba-loan|bank-enforcement|deposit|branch-network|structure-change/],
    ['Securities, audit, pensions & sanctions',
        /pcaob|ria-registration|short-interest|ftd|pbgc|pension|consolidated-screening|adcvd|trade-remedy|fec-campaign|debarment|reg-cf|crowdfunding|edgar|reg-a-plus|uflpa|forced-labor/],
    ['Licensing, exclusion & workforce screening',
        /license|licence|realtor|liquor|medicaid-exclusion|kyb|gleif|sos-registry|clinician|hrsa|npi|nppes/],
    ['Real estate, parcels, deeds & leads',
        /parcel|acris|deed|landlord|absentee|distressed|childcare-provider|city-business-license|hud-|qct|lihtc|section8|affordable/],
    ['Infrastructure, transport & airspace',
        /bridge|tunnel|dam|rail|crossing|drone|airspace|faa|gsa-site|ntad|mirta|installation|vpic|vin-decoder|airline|ontime|on-time|flight/],
    ['Health, clinical & drug supply',
        /clinical-trials|drug-shortage|nadac|cms-|part-d|open-payments|nndss|outbreak|usmin/],
    ['Patents, IP & company data',
        /uspto|patent|ptab|sbom|npm-package|gov-data/],
    ['Labor & enforcement',
        /warn-layoff|dol-enforcement|osha/],
];

const assigned = new Map();
const unmatched = [];
for (const a of catalog.actors) {
    const hay = `${a.slug} ${a.title}`.toLowerCase();
    const hit = BUCKETS.find(([, re]) => re.test(hay));
    if (!hit) { unmatched.push(a.slug); continue; }
    if (!assigned.has(hit[0])) assigned.set(hit[0], []);
    assigned.get(hit[0]).push(a);
}

if (unmatched.length) {
    console.error(`\n${unmatched.length} actor(s) matched no bucket — they would be invisible in the README:`);
    for (const u of unmatched) console.error('   ' + u);
    console.error('\nAdd them to a bucket in tools/gen-readme-coverage.cjs and re-run.');
    process.exit(1);
}

// Counts are DERIVED from the live tool surface, never written down. The
// hardcoded "15 ... twelve" that used to live here was correct on the day it
// was typed and would have rotted silently the moment a 13th tool was
// featured — the same failure this whole generator exists to prevent.
async function toolSurface() {
    const { FEATURED, META_TOOLS } = await import('../src/tools.js');
    const featured = FEATURED.length;
    const names = Object.values(META_TOOLS);
    return {
        featured, meta: names.length, names,
        exposed: featured + names.length,
        reachable: catalog.count - featured,
    };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
const word = (n) => WORDS[n] || String(n);

async function main() {
const surface = await toolSurface();

let body = `## Coverage\n\n**${catalog.count} tools**, every one reading an official US government API or bulk file. `
    + `The MCP server exposes ${surface.exposed} of them directly — ${word(surface.featured)} named tools plus `
    + `${surface.names.slice(0, -1).map(n => `\`${n}\``).join(', ')} and \`${surface.names[surface.names.length - 1]}\`, `
    + `which reach the rest — because agents choose badly when handed more than about twenty tools.\n\n`
    + `Each entry links to its full input/output schema, pricing and worked examples.\n\n`;

for (const [name, re] of BUCKETS) {
    const list = assigned.get(name);
    if (!list || !list.length) continue;
    list.sort((a, b) => a.slug.localeCompare(b.slug));
    body += `**${name}** (${list.length})\n\n`;
    body += list.map((a) => `[${a.slug}](${a.storeUrl})`).join(' · ');
    body += '\n\n';
}

const START = '<!-- COVERAGE:START -->';
const END = '<!-- COVERAGE:END -->';
const readmePath = path.join(ROOT, 'README.md');
let md = fs.readFileSync(readmePath, 'utf8');

const block = `${START}\n${body.trimEnd()}\n${END}`;
if (md.includes(START) && md.includes(END)) {
    md = md.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
    // First run: replace the hand-written Coverage section wholesale.
    md = md.replace(/## Coverage\n[\s\S]*?(?=\n## Development)/, `${block}\n`);
}

// Counts also live in prose OUTSIDE the generated block, and that is exactly
// where they rotted: the README shipped "the other 83" and "search all 95"
// against a live 114 long after the block itself was correct. Each rewrite
// below MUST match — a silent no-op here is how the drift came back.
const REWRITES = [
    [/\*\*Plus \w+ tools that reach the other \d+:\*\*/,
        `**Plus ${word(surface.meta)} tools that reach the other ${surface.reachable}:**`],
    [/and it will search all \d+\./,
        `and it will search all ${catalog.count}.`],
    // The meta tool names themselves are listed in the README, and they were
    // renamed in v1.1.0. Derive them so a future rename cannot leave the docs
    // telling agents to call a tool that no longer exists.
    [/- `[a-z_-]+` — find a tool by keyword, agency or topic/,
        `- \`${surface.names[0]}\` — find a tool by keyword, agency or topic`],
    [/- `[a-z_-]+` — full input schema for any tool in the catalog/,
        `- \`${surface.names[1]}\` — full input schema for any tool in the catalog`],
    [/- `[a-z_-]+` — run any tool in the catalog/,
        `- \`${surface.names[2]}\` — run any tool in the catalog`],
];
for (const [re, replacement] of REWRITES) {
    if (!re.test(md)) {
        console.error(`\nREADME rewrite target not found: ${re}\nThe sentence was reworded or removed. Fix the pattern in tools/gen-readme-coverage.cjs — do not leave a hand-maintained count in the README.`);
        process.exit(1);
    }
    md = md.replace(re, replacement);
}

// The headline count lives in the intro too, and rotted there first.
md = md.replace(/\*\*\d+ US government open-data tools, as one MCP server\.\*\*/,
    `**${catalog.count} US government open-data tools, as one MCP server.**`);

fs.writeFileSync(readmePath, md);
const linked = [...assigned.values()].reduce((n, l) => n + l.length, 0);
console.log(`README coverage regenerated: ${linked} actors linked across ${assigned.size} groups, headline count ${catalog.count}, ${surface.exposed} tools exposed (${surface.featured} featured + ${surface.meta} meta), ${surface.reachable} reachable via meta tools.`);
}

main().catch(err => { console.error(err); process.exit(1); });
