# gov-data-mcp

**95 US government open-data tools, as one MCP server.**

EPA, FEMA, USGS, NOAA, FAA, USACE, FDIC, HUD, NRCS, HRSA, CMS, county assessor rolls and state licensing boards — all reachable as agent-callable tools, all reading directly from official government APIs and bulk files. No scraping, no HTML parsing, no rate-limit roulette.

`mcp-name: io.github.malonestar/gov-data-mcp`

```bash
npx gov-data-mcp
```

## Install

You need a free Apify API token from [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations). Apify's free tier includes monthly platform credit that covers evaluating every tool here.

### Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "gov-data": {
      "command": "npx",
      "args": ["-y", "gov-data-mcp"],
      "env": { "APIFY_TOKEN": "apify_api_..." }
    }
  }
}
```

Claude Desktop reads `claude_desktop_config.json`; Claude Code reads `.mcp.json` in your project; Cursor reads `.cursor/mcp.json`. The block is identical in all three.

## What you get

**12 dedicated tools** for the highest-traffic questions, callable directly:

| Tool | Answers |
|---|---|
| `site-due-diligence-bundle` | 20-layer go / caution / no-go verdict for one coordinate |
| `epa-contaminated-site-screener` | Phase I ESA database search at ASTM E1527-21 distances |
| `faa-drone-airspace-checker` | Part 107 LAANC and airspace verdicts, batched |
| `hifld-grid-proximity-screener` | Nearest transmission line, substation, serving utility, ISO/RTO |
| `interconnection-queue-tracker` | Generator interconnection queues across 7 ISOs |
| `fdic-ncua-health-rollup` | Bank and credit-union health with real peer cohorts |
| `fema-nri-county-risk-profile` | County and census-tract natural-hazard risk |
| `fws-wetlands-proximity-screener` | NWI wetlands within a radius, with decode columns |
| `nhd-surface-water-404-screener` | Clean Water Act §404 surface-water screen |
| `epa-drinking-water-quality-screener` | SDWA violations, lead, PFAS occurrence |
| `parcel-owner-lookup` | Assessor-roll owner of record for an address |
| `license-verifier` | 19 professional licensing boards across 9 states + OIG exclusions |

**Plus three tools that reach the other 83:**

- `search_gov_data_tools` — find a tool by keyword, agency or topic
- `describe_gov_data_tool` — full input schema for any tool in the catalog
- `run_gov_data_tool` — run any tool in the catalog

The catalog is bundled, so discovery costs nothing. Ask your agent *"what government data tools do you have for flood risk?"* and it will search all 95.

## Example prompts

> Screen 1200 Broadway, Denver CO for environmental risk under ASTM E1527-21 and tell me which findings fall inside the standard's search distance.

> I'm siting a 40 MW solar project at 41.88, -93.10. Check grid proximity, prime farmland, wetlands, critical habitat and the interconnection queue, then tell me what would kill the project.

> Can I fly a Part 107 mission at these six coordinates, and which ones need a DroneZone authorization rather than LAANC?

> Which Texas banks show the 2006 CRE-concentration guidance flagged on both prongs?

## How it works

Each tool is a published [Apify Actor](https://apify.com/malonestar) that this server invokes through the Apify API. The server starts the run, waits for a terminal state, and returns the rows.

**Billing** is to your own Apify account at each actor's published pay-per-result rate, listed on its Store page. Free-tier credit covers evaluation. A run that fails bills nothing beyond a fractional actor-start charge.

Every result carries the `run_id` and a `console.apify.com` URL, so any claim an agent makes from this server can be traced back to the exact run that produced it.

## On honest answers

These actors are built around one rule: **a failure must never be presentable as "nothing was found."** That distinction matters most in exactly the cases people use this for — telling a buyer a property is clear of contamination, telling a pilot an airspace is uncontrolled, telling a lender a borrower is unlicensed.

So this server:

- reports `run_status` on every call, and never attaches a `rows` key to a run that did not succeed
- distinguishes *"the run SUCCEEDED and the source genuinely matched nothing"* from *"the run failed"* in the response text, explicitly
- retries transient Apify 429/5xx, then fails loudly saying the platform failed and no conclusion should be drawn about the government source
- treats an unknown tool name as a catalog miss, never as an empty result

The underlying actors carry the same discipline: per-source status on every row, `null` meaning *not checked* rather than *checked and negative*, live drift assertions that fail the run when an upstream silently truncates, and pagination guards on sources that answer HTTP 200 with a partial payload. Each actor's Store page documents the specific traps it defends against.

## Coverage

Environmental & contamination · flood, wildfire, seismic, landslide, karst & sea-level rise · wetlands, critical habitat, protected lands & historic places · energy siting, grid, pipelines & interconnection · farmland, soils & water rights · banking, credit unions & fair lending · securities, auditors & pension plans · professional licensing & exclusion screening · real-estate leads, parcels, deeds & distress signals · drone airspace, bridges, tunnels & dams.

Run `search_gov_data_tools` with any of those terms for the full list, or browse [apify.com/malonestar](https://apify.com/malonestar).

## Development

```bash
npm install
npm test              # offline suite, no network
node tools/mutate.cjs # re-injects known defects, asserts the suite catches them
npm run catalog -- <apify-token>   # regenerate src/catalog.json from the live API
```

## License

MIT
