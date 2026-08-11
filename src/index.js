#!/usr/bin/env node
/**
 * gov-data-mcp — MCP server exposing 95 published US government open-data tools.
 *
 * Wiring only. All decision logic lives in src/tools.js (pure, offline-tested)
 * and src/apify.js (fetch injected). A test asserts this file holds no logic
 * beyond dispatch.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createClient, ApifyError } from './apify.js';
import { indexCatalog, listTools, searchCatalog, describeTool, resolveCall, formatRunResult, META_TOOLS } from './tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'));
const index = indexCatalog(catalog);

const server = new Server(
  { name: 'gov-data-mcp', version: pkg.version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(index) }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const text = (s, isError = false) => ({ content: [{ type: 'text', text: s }], isError });

  try {
    if (name === META_TOOLS.SEARCH) {
      const results = searchCatalog(index, args?.query, args?.limit ?? 10);
      if (results.length === 0) {
        return text(`No tool in this catalog matches "${args?.query}". The catalog covers ${index.actors.length} US government data sources; this is a catalog miss, not a statement about whether the data exists.`);
      }
      return text(JSON.stringify({ query: args?.query, matches: results.length, results }, null, 2));
    }

    if (name === META_TOOLS.DESCRIBE) {
      const d = describeTool(index, args?.tool);
      return text(JSON.stringify(d, null, 2), !d.ok);
    }

    const call = resolveCall(index, name, args);
    if (!call.ok) return text(call.error, true);

    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
    const client = createClient({ token });
    const result = await client.runActor(`${catalog.owner}/${call.slug}`, call.input, {
      maxItems: call.maxItems ?? 200,
    });
    const formatted = formatRunResult(call.slug, result);
    return text(formatted.text, formatted.isError);
  } catch (err) {
    if (err instanceof ApifyError) return text(`${err.message}`, true);
    return text(`gov-data-mcp failed to complete the call to "${name}": ${err.message}. No data was returned and no conclusion should be drawn about the underlying source.`, true);
  }
});

async function main() {
  if (index.missingFeatured.length) {
    // Loud on stderr, never on stdout — stdout is the MCP transport.
    console.error(`[gov-data-mcp] WARNING: featured tools missing from catalog: ${index.missingFeatured.join(', ')}`);
  }
  await server.connect(new StdioServerTransport());
  console.error(`[gov-data-mcp] ready — ${index.actors.length} government data tools (catalog generated ${catalog.generatedAt})`);
}

main().catch(err => {
  console.error('[gov-data-mcp] fatal:', err);
  process.exit(1);
});
