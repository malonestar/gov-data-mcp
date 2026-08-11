/**
 * Pure tool-surface logic. No I/O, no SDK imports — everything here is directly
 * testable offline, and src/index.js is wiring only.
 */

/**
 * Actors promoted to first-class MCP tools. The catalog holds 95 actors; handing
 * an agent 95 tool definitions degrades tool selection and blows up the context
 * of every request. These are the highest-signal ones (revenue-proven plus the
 * flagships); the remaining 80 stay reachable through search/describe/run.
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

export const META_TOOLS = {
  SEARCH: 'search_gov_data_tools',
  DESCRIBE: 'describe_gov_data_tool',
  RUN: 'run_gov_data_tool',
};

/** MCP tool names must match ^[a-zA-Z0-9_-]{1,64}$. Slugs already do. */
export function toolNameFor(slug) {
  return slug;
}

export function indexCatalog(catalog) {
  const actors = catalog.actors || [];
  const bySlug = new Map(actors.map(a => [a.slug, a]));
  const missingFeatured = FEATURED.filter(s => !bySlug.has(s));
  return { actors, bySlug, missingFeatured };
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

export function featuredToolDefinitions(index) {
  return FEATURED.filter(s => index.bySlug.has(s)).map(slug => {
    const a = index.bySlug.get(slug);
    return {
      name: toolNameFor(slug),
      description: `${a.title}. ${truncate(a.description, 400)} Reads live from the official government source. Store page: ${a.storeUrl}`,
      inputSchema: a.inputSchema,
    };
  });
}

export function metaToolDefinitions(index) {
  const n = index.actors.length;
  return [
    {
      name: META_TOOLS.SEARCH,
      description: `Search the full catalog of ${n} US government data tools by keyword, agency, or topic (e.g. "wetlands", "FDIC", "flood", "drone airspace", "business licenses"). Returns matching tool names with descriptions. Use this first when the task is not covered by one of the dedicated tools above.`,
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
      description: `Return the full input schema and documentation for any one of the ${n} tools in the catalog. Call this before ${META_TOOLS.RUN} so the input is correctly shaped.`,
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
      description: `Run any one of the ${n} catalog tools with the given input and return its rows. Billed to your own Apify account at the tool's published rate.`,
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'The tool name to run, e.g. "usgs-seismic-design-screener".' },
          input: { type: 'object', description: 'Input object matching the schema returned by describe_gov_data_tool.' },
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
    storeUrl: x.actor.storeUrl,
  }));
}

export function describeTool(index, name) {
  const actor = index.bySlug.get(name);
  if (!actor) {
    const near = searchCatalog(index, String(name || '').replace(/[-_]/g, ' '), 5).map(r => r.tool);
    return {
      ok: false,
      error: `No tool named "${name}" in this catalog.${near.length ? ` Closest matches: ${near.join(', ')}.` : ''} Use ${META_TOOLS.SEARCH} to find one. This is a lookup miss, not a statement about the underlying data.`,
    };
  }
  return {
    ok: true,
    tool: toolNameFor(actor.slug),
    title: actor.title,
    description: actor.description,
    categories: actor.categories,
    storeUrl: actor.storeUrl,
    inputSchema: actor.inputSchema,
  };
}

/** Resolve a tool call to { slug, input } or an error, for both featured and meta RUN calls. */
export function resolveCall(index, toolName, args) {
  if (index.bySlug.has(toolName)) return { ok: true, slug: toolName, input: args || {}, maxItems: undefined };
  if (toolName === META_TOOLS.RUN) {
    const slug = args && args.tool;
    if (!slug) return { ok: false, error: `${META_TOOLS.RUN} requires a "tool" argument naming which catalog tool to run.` };
    if (!index.bySlug.has(slug)) {
      const near = searchCatalog(index, String(slug).replace(/[-_]/g, ' '), 5).map(r => r.tool);
      return { ok: false, error: `No tool named "${slug}" in this catalog.${near.length ? ` Closest matches: ${near.join(', ')}.` : ''}` };
    }
    return { ok: true, slug, input: (args && args.input) || {}, maxItems: args && args.maxItems };
  }
  return { ok: false, error: `Unknown tool "${toolName}".` };
}

/** Shape a run result into MCP text content. Never collapses a failure into an empty answer. */
export function formatRunResult(slug, result) {
  const header = {
    tool: slug,
    run_status: result.status,
    run_id: result.runId,
    rows_returned: result.itemCount,
    apify_run_url: result.runId ? `https://console.apify.com/actors/runs/${result.runId}` : null,
  };
  if (result.statusMessage) header.note = result.statusMessage;
  const failed = result.status !== 'SUCCEEDED';
  return {
    isError: failed,
    text: JSON.stringify(failed ? header : { ...header, rows: result.items }, null, 2),
  };
}
