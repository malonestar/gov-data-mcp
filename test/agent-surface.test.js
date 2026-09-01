// What an agent can learn about this server BEFORE it spends the caller's money.
//
// Two defect classes are pinned here, and both had already shipped once.
//
// 1. UNDISCLOSED SIDE EFFECTS. Every data tool starts a metered run on the
//    caller's own Apify account. Nothing in the tool surface said so: there
//    were no MCP annotations at all, and only run_gov_data_tool mentioned
//    billing in prose. An independent reviewer scored the surface 2/5 on
//    exactly this — "does not disclose whether the operation is read-only,
//    potentially destructive, or has side effects".
//
// 2. COUNTS WRITTEN DOWN IN PROSE. "95" shipped to npm, to Glama's meta tag,
//    and twice into the README against a live 114, plus a derived "the other
//    83". Every one of those was correct on the day it was typed. Nothing went
//    red as they rotted. A count that is not derived must not exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    FEATURED, META_TOOLS, ANNOTATIONS, COST_NOTE, ROUTING,
    indexCatalog, listTools, featuredToolDefinitions, metaToolDefinitions,
} from '../src/tools.js';

const catalog = JSON.parse(readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const index = indexCatalog(catalog);

const FREE_TOOLS = [META_TOOLS.SEARCH, META_TOOLS.DESCRIBE];
const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

test('every tool carries annotations an agent can act on', () => {
    for (const t of listTools(index)) {
        assert.ok(t.annotations, `${t.name}: no annotations, so an agent cannot tell what calling it does`);
        assert.ok(t.annotations.title, `${t.name}: annotations carry no human title`);
        for (const h of HINTS) {
            assert.equal(typeof t.annotations[h], 'boolean',
                `${t.name}: ${h} is not a boolean — an absent hint is indistinguishable from false to a cautious agent`);
        }
    }
});

test('the free tools are annotated free, and are genuinely local', () => {
    const meta = metaToolDefinitions(index);
    for (const name of FREE_TOOLS) {
        const t = meta.find(x => x.name === name);
        assert.ok(t, `${name} is missing from the meta tools`);
        assert.deepEqual(
            HINTS.reduce((o, h) => ({ ...o, [h]: t.annotations[h] }), {}),
            ANNOTATIONS.CATALOG_LOCAL,
            `${name} must be annotated as a free local catalog read`);
        assert.match(t.description, /FREE/,
            `${name}: an agent should be told this costs nothing, or it will ration discovery calls`);
        assert.ok(!COST_NOTE_IN(t.description),
            `${name} must NOT carry the billing note — it starts no run`);
    }
});

test('every billed tool discloses cost and side effects in words, not just hints', () => {
    const billed = [...featuredToolDefinitions(index),
        metaToolDefinitions(index).find(t => t.name === META_TOOLS.RUN)];
    for (const t of billed) {
        assert.deepEqual(
            HINTS.reduce((o, h) => ({ ...o, [h]: t.annotations[h] }), {}),
            ANNOTATIONS.BILLED_LIVE_READ,
            `${t.name} starts a billed run and must be annotated as such`);
        assert.ok(COST_NOTE_IN(t.description),
            `${t.name}: description does not disclose that calling it bills the caller`);
        assert.match(t.description, /Nothing is charged when a run fails/,
            `${t.name}: a caller must know a failure is free, or it will not retry a transient outage`);
    }
});

// readOnlyHint deliberately reads FALSE on the data tools even though they only
// ever read government data, because they modify the caller's account state by
// spending money. This test exists so that "tidying it up to true" is a
// deliberate act with a failing test attached, not a passing cleanup.
test('billing is treated as a side effect, not hidden behind a comfortable true', () => {
    assert.equal(ANNOTATIONS.BILLED_LIVE_READ.readOnlyHint, false,
        'a tool that spends the caller money is not read-only from the caller perspective');
    assert.equal(ANNOTATIONS.BILLED_LIVE_READ.destructiveHint, false,
        'nothing is destroyed — say so, or a cautious agent will refuse a safe call');
    assert.equal(ANNOTATIONS.BILLED_LIVE_READ.idempotentHint, false,
        'live sources change; a caller must not cache a flood or sanctions answer as fixed');
    assert.equal(ANNOTATIONS.CATALOG_LOCAL.openWorldHint, false,
        'the catalog is bundled — searching it reaches no external system');
});

test('every routing note points at tools that actually exist', () => {
    for (const [slug, note] of Object.entries(ROUTING)) {
        assert.ok(FEATURED.includes(slug),
            `ROUTING has a note for "${slug}", which is not a featured tool — the note would never be shown`);
        assert.ok(index.bySlug.has(slug),
            `ROUTING references "${slug}", which is not in the catalog`);
        for (const referenced of note.match(/[a-z0-9]+(?:-[a-z0-9]+){2,}/g) || []) {
            if (referenced === slug) continue;
            assert.ok(index.bySlug.has(referenced),
                `${slug}'s routing note sends an agent to "${referenced}", which is not in the catalog`);
        }
    }
});

test('the overlapping screeners all say when they are the wrong choice', () => {
    // These four answer adjacent questions about the same coordinate. An agent
    // handed all four with no guidance picks by keyword overlap.
    for (const slug of ['site-due-diligence-bundle', 'epa-contaminated-site-screener',
        'fws-wetlands-proximity-screener', 'nhd-surface-water-404-screener']) {
        assert.ok(ROUTING[slug], `${slug} overlaps its siblings and needs a routing note`);
        assert.match(ROUTING[slug], /CHOOSE THIS/, `${slug}: routing note does not say when to pick it`);
    }
});

// --- counts that must never be written down by hand -------------------------

test('package.json description carries no count that can rot', () => {
    // This exact string is what npm prints under the package name and what
    // Glama republished as its meta description. It said 95 for eleven days
    // after the catalog moved to 114, because nothing asserted anything about
    // it — server.json was gated and this was not.
    assert.ok(!/\d/.test(pkg.description),
        `package.json description contains a digit: "${pkg.description}". `
        + 'It is republished verbatim by npm and by directories that scrape npm, '
        + 'and no release gate can tell you it went stale. Describe the scope, not the size.');
});

test('README states no count that disagrees with the catalog', () => {
    const count = String(catalog.count);
    const featured = FEATURED.length;
    const expected = [
        new RegExp(`\\*\\*${count} US government open-data tools, as one MCP server\\.\\*\\*`),
        new RegExp(`\\*\\*Plus three tools that reach the other ${catalog.count - featured}:\\*\\*`),
        new RegExp(`search all ${count}\\.`),
        new RegExp(`\\*\\*${count} tools\\*\\*, every one reading an official US government API`),
        new RegExp(`exposes ${featured + Object.keys(META_TOOLS).length} of them directly`),
    ];
    for (const re of expected) {
        assert.match(readme, re,
            `README no longer states the derived count matching this pattern. Run \`npm run readme\`.`);
    }
});

test('README carries no orphaned tool count from an earlier catalog', () => {
    // Catch the shape of the defect, not just the specific numbers that caused
    // it: any "N tools"/"all N"/"other N" claim in the README must equal either
    // the catalog size or the exposed tool count.
    const legal = new Set([catalog.count, catalog.count - FEATURED.length,
        FEATURED.length, FEATURED.length + Object.keys(META_TOOLS).length]);
    const claims = [...readme.matchAll(/(?:all|other|only)\s+(\d{2,4})\b|\b(\d{2,4})\s+(?:tools|actors|sources)\b/g)];
    for (const m of claims) {
        const n = Number(m[1] ?? m[2]);
        assert.ok(legal.has(n),
            `README claims "${m[0].trim()}" but the catalog holds ${catalog.count} `
            + `(${FEATURED.length} featured, ${catalog.count - FEATURED.length} reachable via meta tools). `
            + 'Run `npm run readme`, or derive the sentence in tools/gen-readme-coverage.cjs.');
    }
});

function COST_NOTE_IN(description) {
    return description.includes(COST_NOTE);
}
