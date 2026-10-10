/**
 * Pure tool-surface logic. No I/O, no SDK imports — everything here is directly
 * testable offline, and src/index.js is wiring only.
 */

/**
 * Actors promoted to first-class MCP tools. The catalog holds well over a
 * hundred actors; handing an agent that many tool definitions degrades tool
 * selection and blows up the context of every request. These are the
 * highest-signal ones (revenue-proven plus the flagships); every other actor
 * stays reachable through search/describe/run.
 *
 * No count is written down in this file on purpose — the catalog is the only
 * source of truth for how many there are, and prose counts here rotted from
 * 95 to 109 to 114 to 116 without a single test going red.
 */
export const FEATURED = [
  'site-due-diligence-bundle',
  'epa-contaminated-site-screener',
  'faa-drone-airspace-checker',
  'hifld-grid-proximity-screener',
  'interconnection-queue-tracker',
  'fdic-ncua-health-rollup',
  'fema-nri-county-risk-profile',
  'fws-wetlands-proximity-screener',
  'nhd-surface-water-404-screener',
  'epa-drinking-water-quality-screener',
  'parcel-owner-lookup',
  'license-verifier',
];

/**
 * Meta tools are hyphen-case for one reason: so that EVERY tool this server
 * exposes follows a single rule, and for catalog tools the rule is stronger
 * still — the tool name IS the Apify slug, which is also the value you pass to
 * describe/run and the tail of the Store URL. The old snake_case meta names
 * split the surface arbitrarily in two, which an independent review scored 2/5,
 * and the alternative (snake_case everywhere) would have made 12 tool names
 * differ from the slug they resolve to, trading one inconsistency for another.
 *
 * Renamed in v1.1.0. The pre-1.1 names are recognised in resolveCall and
 * answered with an explicit rename notice rather than silently aliased — a
 * caller with a hardcoded name deserves to be told, not quietly patched.
 */
export const META_TOOLS = {
  SEARCH: 'search-gov-data-tools',
  DESCRIBE: 'describe-gov-data-tool',
  RUN: 'run-gov-data-tool',
};

export const RENAMED_IN_1_1 = {
  search_gov_data_tools: 'search-gov-data-tools',
  describe_gov_data_tool: 'describe-gov-data-tool',
  run_gov_data_tool: 'run-gov-data-tool',
};

/**
 * Server-level guide, sent in the MCP `initialize` response as `instructions`.
 *
 * Written because the measured failure mode is agents GUESSING inputs: an agent
 * that calls a screener with no state, no coordinates and no name starts a
 * metered run that refuses the question (or matches nothing) and costs the
 * caller an actor-start fee for no answer. Every rule below targets that.
 */
export function serverInstructions(index) {
  const n = index.actors.length;
  return [
    `gov-data-mcp: ${n} tools over official US government open data (EPA, FEMA, USGS, FDIC, SEC, state licensing boards and registries, ...).${index.scopeNote || ''}`,
    '',
    'HOW TO CALL THESE TOOLS WELL',
    `1. Find the tool: ${META_TOOLS.SEARCH} (free). 2. Read it: ${META_TOOLS.DESCRIBE} (free) - it returns mustSupply, exampleInput and run-verified examples. 3. Run it.`,
    '4. Start from exampleInput or one of the examples and change only the values you need. These inputs are verified to return rows; a hand-built input usually is not.',
    '5. Always SCOPE the question: a state, county, coordinates, a name, an NPI, a date window. Unscoped calls are refused by most tools or bill for whole national lists.',
    '6. Use real values the source knows: two-letter state codes unless the schema says otherwise, decimal-degree lat/lon, ISO dates (YYYY-MM-DD). Never invent enum values - use the enum in the schema.',
    '7. Keep the first call small (low maxResults / few assets) and widen once the shape works. Each call bills per row (see the price in the tool description).',
    '',
    'READING RESULTS',
    '- run_status other than SUCCEEDED means the question was NOT answered. Read `note` (the tool explains what was wrong), fix the input, and do not retry the identical input.',
    '- SUCCEEDED with zero rows means the source was reached and matched nothing for exactly that input. Before concluding "none exist", check the scope (radius, date window, spelling, state).',
    '- null in a field means "not checked / not published", never "no". Many rows carry per-source status fields; read them before stating a negative.',
  ].join('\n');
}

/**
 * Free, local pre-flight check run BEFORE a metered call: required fields the
 * caller must supply (required with no server default) and closed vocabularies.
 * Apify would reject these too, but only after the agent has learned nothing
 * useful; answering here returns the example to copy instead.
 */
export function preflight(actor, input) {
  const problems = [];
  const props = (actor.inputSchema && actor.inputSchema.properties) || {};
  const given = input && typeof input === 'object' ? input : {};
  for (const k of actor.mustSupply || []) {
    const v = given[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) problems.push(`"${k}" is required and was not supplied`);
  }
  for (const [k, v] of Object.entries(given)) {
    const p = props[k];
    if (!p) { problems.push(`"${k}" is not an input of this tool (known inputs: ${Object.keys(props).join(', ')})`); continue; }
    if (Array.isArray(p.enum) && v !== undefined && v !== null && !p.enum.includes(v)) problems.push(`"${k}" must be one of ${JSON.stringify(p.enum)}, got ${JSON.stringify(v)}`);
    const itemEnum = p.items && Array.isArray(p.items.enum) ? p.items.enum : null;
    if (itemEnum && Array.isArray(v)) {
      const bad = v.filter(x => !itemEnum.includes(x));
      if (bad.length) problems.push(`"${k}" items must be from ${JSON.stringify(itemEnum)}, got ${JSON.stringify(bad)}`);
    }
  }
  return problems;
}

/** What an agent should do next, attached to every non-SUCCEEDED or zero-row result. */
export function guidanceFor(actor, kind) {
  const ex = actor && actor.exampleInput ? actor.exampleInput : null;
  const examples = actor && Array.isArray(actor.examples) ? actor.examples : [];
  const base = kind === 'failed'
    ? 'The question was not answered and no result rows were billed. Read `note` above for the reason, fix the input, and do not resend the same input.'
    : kind === 'preflight'
      ? 'Nothing was run and nothing was charged. Fix the input and call again.'
      : 'Zero rows is an answer only for exactly this input. Before concluding nothing exists, check the scope: spelling, state code, radius, date window, mode.';
  return {
    next_step: `${base} Compare your input with example_input (verified to return rows) and change only the values you need.`,
    must_supply: actor ? (actor.mustSupply || []) : [],
    example_input: ex,
    examples: examples.length ? examples : undefined,
    describe: actor ? `${META_TOOLS.DESCRIBE} {"tool":"${actor.slug}"}` : undefined,
  };
}

/** MCP tool names must match ^[a-zA-Z0-9_-]{1,64}$. Slugs already do. */
export function toolNameFor(slug) {
  return slug;
}

/**
 * Build the tool index. With no options this is the full catalog fronted by
 * FEATURED — byte-identical to every release before presets existed.
 *
 * With a preset, the WHOLE index is restricted: `actors` (what search,
 * describe and run can reach) is filtered to the preset's tools, and
 * `featured` becomes the preset's own list. A preset tool that is not in the
 * catalog is a hard error, not a warning — a scoped server advertising a tool
 * that does not exist is precisely the defect a stderr line would hide.
 */
export function indexCatalog(catalog, options = {}) {
  const all = catalog.actors || [];
  const preset = options.preset || null;
  const presetName = options.presetName || null;
  if (preset) {
    const missing = preset.tools.filter(s => !all.some(a => a.slug === s));
    if (missing.length) {
      throw new Error(`preset "${presetName}" names tools that are not in the bundled catalog: ${missing.join(', ')}. `
        + 'Regenerate the catalog or fix the preset before starting a server that would advertise them.');
    }
  }
  const allSlugs = new Set(all.map(a => a.slug));
  const featured = preset ? [...preset.tools] : [...FEATURED];
  const keep = preset ? new Set(preset.tools) : null;
  const actors = keep ? all.filter(a => keep.has(a.slug)) : all;
  const bySlug = new Map(actors.map(a => [a.slug, a]));
  const missingFeatured = featured.filter(s => !bySlug.has(s));
  const scopeNote = preset
    ? ` This server is scoped to the "${presetName}" preset (${actors.length} of ${all.length} catalog tools); start gov-data-mcp without --preset for the full catalog.`
    : '';
  return { actors, bySlug, missingFeatured, featured, presetName, scopeNote, catalogTotal: all.length, allSlugs };
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * MCP tool annotations — the machine-readable half of "what does this do to the
 * world before I call it".
 *
 * WHY `readOnlyHint: false` ON THE DATA TOOLS, despite them only ever reading:
 * they never write to any government system, but every call starts a metered
 * run on the caller's own Apify account and costs them money. `readOnlyHint`
 * means "does not modify its environment", and an agent that reads `true`
 * reasonably concludes the call is free to make speculatively — which is the
 * one wrong conclusion that costs the caller real money. Billing is a side
 * effect. We declare it rather than hide it behind a comfortable `true`, and
 * `destructiveHint: false` carries the other half of the truth: nothing is
 * destroyed, no external state is altered, and a call is always safe to make
 * once you accept its cost.
 *
 * `idempotentHint: false` because these read live sources — the same input
 * tomorrow can legitimately return different rows, and a caller must not cache
 * a flood or sanctions answer as if it were fixed.
 */
export const ANNOTATIONS = {
  /** Reads the bundled catalog. No network, no run, no charge. */
  CATALOG_LOCAL: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  /** Starts a billed Apify run against a live government source. */
  BILLED_LIVE_READ: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

/** Format a price so an agent can compare tools without doing arithmetic. */
export function priceLine(pricing) {
  if (!pricing) return 'Price unavailable for this tool — check its Store page before calling.';
  const per1k = pricing.usdPer1000;
  const cheapest = pricing.tierDiscountsUsdPerUnit
    ? Math.min(...Object.values(pricing.tierDiscountsUsdPerUnit))
    : pricing.usdPerUnit;
  if (pricing.perResult === false) {
    // Billed per discrete event (e.g. one report), not per row: a per-1,000 figure would mislead.
    const lower = cheapest < pricing.usdPerUnit ? ` Lower on paid Apify plans, down to $${cheapest}.` : '';
    return `$${pricing.usdPerUnit} per ${pricing.unit}.${lower} Any underlying screeners it calls bill their own rows separately.`;
  }
  const discount = cheapest < pricing.usdPerUnit
    ? ` Lower on paid Apify plans, down to $${(cheapest * 1000).toFixed(2)} per 1,000.`
    : '';
  return `$${pricing.usdPerUnit} per ${pricing.unit} ($${per1k} per 1,000).${discount}`;
}

export function costNote(pricing) {
  return 'COST AND SIDE EFFECTS: read-only with respect to the government source — it never writes to any external system — '
    + `but each call starts a metered run on YOUR Apify account, billed ${priceLine(pricing)} `
    + 'Nothing is charged when a run fails.';
}

/** The generic, price-free wording used by the run tool, which can run anything. */
export const COST_NOTE =
  'COST AND SIDE EFFECTS: read-only with respect to the government source — it never writes to any external system — '
  + 'but each call starts a metered run on YOUR Apify account, billed per result row at the rate this tool reports. '
  + 'Call describe-gov-data-tool first to see the exact price before running anything. '
  + 'Nothing is charged when a run fails.';

/**
 * Routing notes for tools whose scope genuinely overlaps.
 *
 * Four of the featured tools answer adjacent questions about the same
 * coordinate, and an agent handed all four with no guidance picks by keyword
 * overlap rather than by which regulatory question is actually being asked.
 * These sentences say, in each tool's own description, when it is the wrong
 * choice — which is the part a bare capability blurb never tells you.
 */
export const ROUTING = {
  'site-due-diligence-bundle':
    'CHOOSE THIS when you want one combined go / caution / no-go verdict for a coordinate across many unrelated layers. '
    + 'It is NOT an ASTM records review: its contamination layer reads RCRA and TRI through ECHO only and omits coordinate-less Superfund records. '
    + 'For a contamination-first question use epa-contaminated-site-screener.',
  'epa-contaminated-site-screener':
    'CHOOSE THIS for the ASTM E1527-21 Phase I records search at regulation distances around one or more properties. '
    + 'For a single combined verdict across twenty unrelated layers use site-due-diligence-bundle; for drinking-water quality use epa-drinking-water-quality-screener.',
  'fws-wetlands-proximity-screener':
    'CHOOSE THIS for National Wetlands Inventory polygons and their decode columns within a radius. '
    + 'It does NOT answer Clean Water Act §404 jurisdiction — for surface-water features and relative permanence use nhd-surface-water-404-screener. The two are usually needed together.',
  'nhd-surface-water-404-screener':
    'CHOOSE THIS for Clean Water Act §404 surface-water screening — streams, waterbodies and their relative permanence. '
    + 'For mapped wetland polygons use fws-wetlands-proximity-screener.',
  'epa-drinking-water-quality-screener':
    'CHOOSE THIS for public water-system quality: SDWA violations, lead 90th-percentile results and PFAS occurrence. '
    + 'It is NOT a property contamination screen — for soil and groundwater records at a site use epa-contaminated-site-screener.',
  'faa-drone-airspace-checker':
    'CHOOSE THIS for drone (Part 107) airspace questions at specific US points: airspace class, LAANC ceiling, restricted and special-use areas, temporary flight restrictions. '
    + 'It does NOT screen ground conditions — for a site environmental or hazard screen use site-due-diligence-bundle. It reports what the FAA layers say; it does not request or grant an authorization.',
};

/**
 * Parameter guidance for the featured tools: which inputs matter, how they
 * interact, and how to keep a first call small. Input schemas already document
 * each field on its own; what they cannot say is which combinations an agent
 * should reach for, which inputs override others, and which one is the cost cap.
 * Every input named here in backticks is asserted to exist in the live schema
 * (test/guidance.test.js), so a renamed field fails the build rather than
 * leaving advice that points at nothing.
 */
export const SCOPING = {
  'site-due-diligence-bundle':
    'INPUTS: `assets` is required (lat/lon per site). `radiusMiles` sets the proximity layers only; point-in-polygon layers ignore it. `maxAssets` is the cost cap, one billed row per site, so start with 1-3 sites.',
  'epa-contaminated-site-screener':
    'INPUTS: `mode` decides everything else. In "assets" mode supply `assets` (address or lat/lon) and `radiusMiles`; `states`, `onlyNpl` and `onlyWithCoords` are ignored. In "inventory" mode supply `states` and the asset inputs are ignored. One row per site hit is billed, so `maxHitsPerProgram` and `maxResults` are the cost levers; keep them low on a first call near dense industrial areas.',
  'faa-drone-airspace-checker':
    'INPUTS: `points` is required. `layers` narrows which FAA layers are checked; leave it empty for all eight. `maxPoints` is the cost cap, one billed row per point.',
  'hifld-grid-proximity-screener':
    'INPUTS: `assets` is required. `radiusMiles` bounds every layer. `minVoltageKv` filters lines only, never substations or plants, and drops lines with unknown voltage. `includeSubstations`, `includePowerPlants` and `includeUtility` add columns, not rows; turn them off to speed up large batches. `maxResults` caps assets, one billed row each.',
  'interconnection-queue-tracker':
    'INPUTS: leave `isos` empty for all seven ISOs, or name one or two to keep a first call small. `maxResults` is applied in ISO order, so a low value silently drops the later ISOs; raise it or narrow `isos` instead. For change monitoring use `deltaOnly` in snapshot mode rather than re-pulling the full queue.',
  'fdic-ncua-health-rollup':
    'INPUTS: always set `state`; an empty state scores the whole country and bills far more rows. `minAssets` and `maxAssets` are in THOUSANDS of dollars (1000000 = $1B) and together with `peerBasis` define who counts as a peer. `institutionType` "credit_union" is not available yet and fails the run. `maxResults` is the cost cap.',
  'fema-nri-county-risk-profile':
    'INPUTS: supply `assets` (FIPS, state+county, or lat/lon) for specific places; `states` and `counties` are used ONLY when `assets` is empty (inventory mode). `resolution` "tract" applies only to lat/lon assets and inventory pulls; FIPS or state+county assets always get county data. `maxResults` caps rows in both modes.',
  'fws-wetlands-proximity-screener':
    'INPUTS: `assets` is required. `radiusMeters` is the presence check (a true circle); `nearestSearchRadiusMeters` is independent and only bounds the nearest-wetland distance, so a site can read no wetland in radius and still report a nearest one. `maxResults` caps assets, one billed row each.',
  'nhd-surface-water-404-screener':
    'INPUTS: `assets` is required. `radiusMeters` 1000 covers a typical Phase I adjacent-property review; widen it only on purpose. Keep `includeNonNetworkFlowlines` on for a conservative screen. `runBudgetSeconds` trades completeness for speed when the USGS service is slow; a site cut by the budget reports null counts, not zero. `maxResults` caps sites, exactly one row each.',
  'epa-drinking-water-quality-screener':
    'INPUTS: supply `assets` (lat/lon, matched to a water system boundary) or `pwsids` (9-character EPA system ids) or both. `includePfas` is the slow leg; turn it off when PFAS is not the question. `violationYears` only changes the recent-violation flags, not the history summary. `maxAssets` is the cost cap.',
  'parcel-owner-lookup':
    'INPUTS: `addresses` is required, one full street address with city and state per entry. Coverage is a fixed list of county and state assessor rolls; every address still yields exactly one row, so read its lookup_status before treating a missing owner as an answer. `maxResults` caps addresses, one billed row each.',
  'license-verifier':
    'INPUTS: always scope with `states` (a state code searches every board in it; a board id targets one). The most precise search is `licenseNumber`; otherwise `lastName` plus `firstName`. `roster` runs a batch instead of a single search, and `mode` "roster-delta" switches to the newly-credentialed feed with `professions` and `sinceDays`. `maxResults` applies PER BOARD, so a bare state code can bill several boards; start with a low value.',
};

export function scopingNoteFor(slug) {
  return SCOPING[slug] ? ` ${SCOPING[slug]}` : '';
}

/**
 * A routing note is only shown when every tool it points at is reachable on
 * THIS server. Under a preset, a note that sends the agent to a tool outside
 * the preset would be a dead end dressed as advice, so the note is dropped
 * rather than edited — a half-note that names a missing tool is worse than none.
 */
export function routingNoteFor(index, slug) {
  const note = ROUTING[slug];
  if (!note) return '';
  // Only tokens that are catalog slugs count as references; hyphenated prose is not a tool.
  const isSlug = (r) => index.allSlugs ? index.allSlugs.has(r) : index.bySlug.has(r);
  const referenced = (note.match(/[a-z0-9]+(?:-[a-z0-9]+){2,}/g) || []).filter(r => r !== slug && isSlug(r));
  return referenced.every(r => index.bySlug.has(r)) ? ` ${note}` : '';
}

export function featuredToolDefinitions(index) {
  const featured = index.featured || FEATURED;
  return featured.filter(s => index.bySlug.has(s)).map(slug => {
    const a = index.bySlug.get(slug);
    const routing = routingNoteFor(index, slug);
    return {
      name: toolNameFor(slug),
      description: `${a.title}. ${truncate(a.description, 400)}${routing}${scopingNoteFor(slug)} Reads live from the official government source. Call ${META_TOOLS.DESCRIBE} (free) for a verified example input. ${costNote(a.pricing)} Store page: ${a.storeUrl}`,
      inputSchema: a.inputSchema,
      annotations: { title: a.title, ...ANNOTATIONS.BILLED_LIVE_READ },
    };
  });
}

export function metaToolDefinitions(index) {
  const n = index.actors.length;
  return [
    {
      name: META_TOOLS.SEARCH,
      description: `Search the full catalog of ${n} US government data tools by keyword, agency, or topic (e.g. "wetlands", "FDIC", "flood", "drone airspace", "business licenses"). Returns matching tool names with descriptions. Use this first when the task is not covered by one of the dedicated tools above.${index.scopeNote || ''} FREE: reads a catalog bundled with this server — no network call, no run, nothing charged.`,
      annotations: { title: 'Search the government data catalog', ...ANNOTATIONS.CATALOG_LOCAL },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to match against tool name, title, description and category.' },
          limit: { type: 'integer', description: 'Maximum number of results to return. Default 10.', minimum: 1, maximum: 50 },
        },
        required: ['query'],
      },
    },
    {
      name: META_TOOLS.DESCRIBE,
      description: `Return the full input schema and documentation for any one of the ${n} tools in the catalog. Call this before ${META_TOOLS.RUN} so the input is correctly shaped. FREE: reads a catalog bundled with this server — no network call, no run, nothing charged.`,
      annotations: { title: 'Describe one government data tool', ...ANNOTATIONS.CATALOG_LOCAL },
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'The tool name, e.g. "noaa-slr-inundation-threshold-screener".' },
        },
        required: ['tool'],
      },
    },
    {
      name: META_TOOLS.RUN,
      description: `Run any one of the ${n} catalog tools with the given input and return its rows. Call ${META_TOOLS.DESCRIBE} first to shape the input. `
        + `${COST_NOTE} A run that FAILS returns an error and no rows rather than an empty result, so a zero-row answer means the source was reached and matched nothing for exactly that input. Failed and zero-row results carry next_step, must_supply and a verified example_input to copy. Inputs are checked locally first: a missing required field or an invalid enum value is reported free, without starting a run.`,
      annotations: { title: 'Run any government data tool', ...ANNOTATIONS.BILLED_LIVE_READ },
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'The tool name to run, e.g. "usgs-seismic-design-screener".' },
          input: { type: 'object', description: `Input object matching the schema returned by ${META_TOOLS.DESCRIBE}.` },
          maxItems: { type: 'integer', description: 'Maximum rows to return. Default 200.', minimum: 1, maximum: 1000 },
        },
        required: ['tool', 'input'],
      },
    },
  ];
}

export function listTools(index) {
  return [...featuredToolDefinitions(index), ...metaToolDefinitions(index)];
}

export function searchCatalog(index, query, limit = 10) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored = index.actors.map(a => {
    const hay = `${a.slug} ${a.title} ${a.description} ${(a.categories || []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (a.slug.toLowerCase().includes(t)) score += 5;
      else if (a.title.toLowerCase().includes(t)) score += 3;
      else if (hay.includes(t)) score += 1;
    }
    return { actor: a, score };
  }).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.actor.slug.localeCompare(b.actor.slug));
  return scored.slice(0, limit).map(x => ({
    tool: toolNameFor(x.actor.slug),
    title: x.actor.title,
    description: truncate(x.actor.description, 300),
    categories: x.actor.categories,
    // Price rides along on every search hit so an agent can weigh cost while
    // choosing, rather than discovering it only after it has already called.
    usdPer1000Results: x.actor.pricing && x.actor.pricing.perResult !== false ? x.actor.pricing.usdPer1000 : null,
    usdPerUnit: x.actor.pricing ? x.actor.pricing.usdPerUnit : null,
    priceUnit: x.actor.pricing ? x.actor.pricing.unit : null,
    storeUrl: x.actor.storeUrl,
  }));
}

export function describeTool(index, name) {
  const actor = index.bySlug.get(name);
  if (!actor) {
    const near = searchCatalog(index, String(name || '').replace(/[-_]/g, ' '), 5).map(r => r.tool);
    return {
      ok: false,
      error: `No tool named "${name}" in this catalog.${near.length ? ` Closest matches: ${near.join(', ')}.` : ''} Use ${META_TOOLS.SEARCH} to find one. This is a lookup miss, not a statement about the underlying data.${index.scopeNote || ''}`,
    };
  }
  return {
    ok: true,
    tool: toolNameFor(actor.slug),
    title: actor.title,
    description: actor.description,
    categories: actor.categories,
    pricing: actor.pricing
      ? { ...actor.pricing, summary: priceLine(actor.pricing) }
      : null,
    storeUrl: actor.storeUrl,
    must_supply: actor.mustSupply || [],
    example_input: actor.exampleInput || null,
    examples: actor.examples || [],
    how_to_call: 'Start from example_input (or one of examples): these inputs are verified to return rows. Change only the values you need, keep the call scoped (state / coordinates / name / date window) and keep the first call small. '
      + `Run it with ${META_TOOLS.RUN} {"tool":"${actor.slug}","input":{...}}${index.featured && index.featured.includes(actor.slug) ? ` or call the dedicated "${actor.slug}" tool directly` : ''}.`,
    inputSchema: actor.inputSchema,
  };
}

/** Resolve a tool call to { slug, input } or an error, for both featured and meta RUN calls. */
export function resolveCall(index, toolName, args) {
  const checked = (slug, input, maxItems) => {
    const problems = preflight(index.bySlug.get(slug), input);
    if (problems.length) {
      return { ok: false, error: JSON.stringify({ tool: slug, run_status: 'NOT_RUN_INPUT_INVALID', problems, ...guidanceFor(index.bySlug.get(slug), 'preflight') }, null, 2) };
    }
    return { ok: true, slug, input, maxItems };
  };
  if (index.bySlug.has(toolName)) return checked(toolName, args || {}, undefined);
  if (toolName === META_TOOLS.RUN) {
    const slug = args && args.tool;
    if (!slug) return { ok: false, error: `${META_TOOLS.RUN} requires a "tool" argument naming which catalog tool to run.` };
    if (!index.bySlug.has(slug)) {
      const near = searchCatalog(index, String(slug).replace(/[-_]/g, ' '), 5).map(r => r.tool);
      return { ok: false, error: `No tool named "${slug}" in this catalog.${near.length ? ` Closest matches: ${near.join(', ')}.` : ''}${index.scopeNote || ''}` };
    }
    return checked(slug, (args && args.input) || {}, args && args.maxItems);
  }
  // A caller with a hardcoded pre-1.1 name gets told what happened rather than
  // silently aliased, so the hardcode gets fixed instead of quietly persisting.
  if (RENAMED_IN_1_1[toolName]) {
    return { ok: false, error: `"${toolName}" was renamed to "${RENAMED_IN_1_1[toolName]}" in gov-data-mcp v1.1.0, so that every tool on this server uses one naming convention. Call "${RENAMED_IN_1_1[toolName]}" instead — the arguments are unchanged.` };
  }
  return { ok: false, error: `Unknown tool "${toolName}". Call ${META_TOOLS.SEARCH} to list what this server offers.` };
}

/** Shape a run result into MCP text content. Never collapses a failure into an empty answer. */
export function formatRunResult(slug, result, actor = null) {
  const header = {
    tool: slug,
    run_status: result.status,
    run_id: result.runId,
    rows_returned: result.itemCount,
    apify_run_url: result.runId ? `https://console.apify.com/actors/runs/${result.runId}` : null,
  };
  if (result.statusMessage) header.note = result.statusMessage;
  const failed = result.status !== 'SUCCEEDED';
  // A run still in flight on Apify is not a wrong input; do not tell the agent to change it.
  const pending = result.status === 'CLIENT_TIMEOUT' || result.status === 'DATASET_UNSETTLED';
  if (actor && failed && !pending) Object.assign(header, guidanceFor(actor, 'failed'));
  if (actor && !failed && result.itemCount === 0) Object.assign(header, guidanceFor(actor, 'zero'));
  return {
    isError: failed,
    text: JSON.stringify(failed ? header : { ...header, rows: result.items }, null, 2),
  };
}
