#!/usr/bin/env node
/**
 * Is the shipped catalog still true?
 *
 * The offline suite can assert that the catalog is well-formed and not ancient,
 * but AGE IS NOT THE SIGNAL. The catalog that shipped wrong on 2026-08-18 was
 * eight days old: in that window five actors were published and ten scoping
 * fields became REQUIRED. Any staleness bound loose enough not to be annoying
 * is far too loose to catch that.
 *
 * The only real check is a diff against the live API. This is that diff, and it
 * gates the release.
 *
 * Usage: node tools/check-catalog-live.cjs <apify-token>
 * Exit 0 = catalog matches live. Exit 1 = regenerate before publishing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = process.argv[2] || process.env.APIFY_TOKEN;
if (!TOKEN) {
    console.error('FAILED: no Apify token. Pass it as argv[1] or set APIFY_TOKEN.');
    console.error('Refusing to pass a release that could not be verified — an unverified');
    console.error('catalog is exactly the defect this check exists to prevent.');
    process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'catalog.json'), 'utf8'));

async function get(url, attempt = 1) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (res.status === 429 || res.status >= 500) {
        if (attempt >= 5) throw new Error(`${url} -> HTTP ${res.status} after ${attempt} attempts`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
        return get(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
}

(async () => {
    const list = await get('https://api.apify.com/v2/acts?my=1&limit=500');
    const items = (list.data && list.data.items) || [];
    if (!items.length) throw new Error('actor list came back empty');

    const live = new Map();
    for (const it of items) {
        // The LIST endpoint reports isPublic:false for every actor; only the
        // detail endpoint is truthful.
        const detail = (await get(`https://api.apify.com/v2/acts/${it.id}`)).data;
        if (!detail.isPublic || detail.isDeprecated) continue;
        const buildId = detail.taggedBuilds && detail.taggedBuilds.latest && detail.taggedBuilds.latest.buildId;
        if (!buildId) throw new Error(`${detail.name}: no build tagged "latest"`);
        const build = (await get(`https://api.apify.com/v2/actor-builds/${buildId}`)).data;
        const input = (build.actorDefinition || {}).input;
        if (!input || !input.properties) throw new Error(`${detail.name}: latest build has no input schema`);
        live.set(detail.name, {
            required: [...(input.required || [])].sort(),
            props: Object.keys(input.properties).sort(),
        });
    }

    const inCatalog = new Map(catalog.actors.map((a) => [a.slug, {
        required: [...(a.inputSchema.required || [])].sort(),
        props: Object.keys(a.inputSchema.properties).sort(),
    }]));

    const problems = [];
    for (const slug of live.keys()) {
        if (!inCatalog.has(slug)) problems.push(`MISSING  ${slug} is published but absent from the catalog — agents cannot see it`);
    }
    for (const slug of inCatalog.keys()) {
        if (!live.has(slug)) problems.push(`PHANTOM  ${slug} is in the catalog but is not a live public actor — agents would call a tool that does not exist`);
    }
    for (const [slug, l] of live) {
        const c = inCatalog.get(slug);
        if (!c) continue;
        if (l.required.join(',') !== c.required.join(',')) {
            problems.push(`REQUIRED ${slug}: live [${l.required.join(', ') || '-'}] vs catalog [${c.required.join(', ') || '-'}]`
                + ' — an agent would build a call the actor rejects, or omit a field it thinks is mandatory');
        }
        if (l.props.join(',') !== c.props.join(',')) {
            const added = l.props.filter((p) => !c.props.includes(p));
            const gone = c.props.filter((p) => !l.props.includes(p));
            problems.push(`FIELDS   ${slug}: ${added.length ? 'live adds ' + added.join(', ') : ''}`
                + `${added.length && gone.length ? '; ' : ''}${gone.length ? 'catalog has stale ' + gone.join(', ') : ''}`);
        }
    }

    const ageDays = ((Date.now() - Date.parse(catalog.generatedAt)) / 86400000).toFixed(1);
    console.log(`catalog: ${catalog.actors.length} actors, generated ${ageDays} days ago`);
    console.log(`live:    ${live.size} published actors`);

    if (problems.length) {
        console.error(`\n${problems.length} DIVERGENCE(S) — regenerate before publishing (\`npm run catalog -- <token>\`):\n`);
        for (const p of problems) console.error('  ' + p);
        process.exit(1);
    }
    console.log('\nCatalog matches live. Safe to publish.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
