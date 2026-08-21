# gov-data-mcp

**114 US government open-data tools, as one MCP server.**

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

<!-- COVERAGE:START -->
## Coverage

**114 tools**, every one reading an official US government API or bulk file. The MCP server exposes 15 of them directly — twelve named tools plus `search_gov_data_tools`, `describe_gov_data_tool` and `run_gov_data_tool`, which reach the rest — because agents choose badly when handed more than about twenty tools.

Each entry links to its full input/output schema, pricing and worked examples.

**Contamination & environmental due diligence** (18)

[epa-airtoxscreen-cancer-risk-screener](https://apify.com/malonestar/epa-airtoxscreen-cancer-risk-screener) · [epa-contaminated-site-screener](https://apify.com/malonestar/epa-contaminated-site-screener) · [epa-drinking-water-quality-screener](https://apify.com/malonestar/epa-drinking-water-quality-screener) · [epa-ghgrp-emitter-screener](https://apify.com/malonestar/epa-ghgrp-emitter-screener) · [epa-impaired-waters-303d-screener](https://apify.com/malonestar/epa-impaired-waters-303d-screener) · [epa-nonattainment-air-permit-screener](https://apify.com/malonestar/epa-nonattainment-air-permit-screener) · [epa-rcra-corrective-action-cleanup-monitor](https://apify.com/malonestar/epa-rcra-corrective-action-cleanup-monitor) · [epa-rcra-hazwaste-generator-rollup](https://apify.com/malonestar/epa-rcra-hazwaste-generator-rollup) · [epa-repowering-brownfield-to-solar-site-finder](https://apify.com/malonestar/epa-repowering-brownfield-to-solar-site-finder) · [epa-sole-source-aquifer-screener](https://apify.com/malonestar/epa-sole-source-aquifer-screener) · [epa-tri-facility-release-rollup](https://apify.com/malonestar/epa-tri-facility-release-rollup) · [epa-tsca-cdr-chemical-site-screener](https://apify.com/malonestar/epa-tsca-cdr-chemical-site-screener) · [erns-nrc-release-incident-screener](https://apify.com/malonestar/erns-nrc-release-incident-screener) · [fuds-defense-site-screener](https://apify.com/malonestar/fuds-defense-site-screener) · [historic-land-use-sic-contaminant-screener](https://apify.com/malonestar/historic-land-use-sic-contaminant-screener) · [site-due-diligence-bundle](https://apify.com/malonestar/site-due-diligence-bundle) · [state-tank-spill-registry-screener](https://apify.com/malonestar/state-tank-spill-registry-screener) · [usgs-historical-topo-records-review](https://apify.com/malonestar/usgs-historical-topo-records-review)

**Flood, fire, quake & ground hazard** (13)

[calfire-fhsz-screener](https://apify.com/malonestar/calfire-fhsz-screener) · [cbrs-coastal-barrier-screener](https://apify.com/malonestar/cbrs-coastal-barrier-screener) · [fema-nri-county-risk-profile](https://apify.com/malonestar/fema-nri-county-risk-profile) · [fema-repetitive-loss-flood-market-screener](https://apify.com/malonestar/fema-repetitive-loss-flood-market-screener) · [karst-sinkhole-risk-screener](https://apify.com/malonestar/karst-sinkhole-risk-screener) · [nfip-flood-loss-risk-screener](https://apify.com/malonestar/nfip-flood-loss-risk-screener) · [noaa-slr-inundation-threshold-screener](https://apify.com/malonestar/noaa-slr-inundation-threshold-screener) · [noaa-storm-events-peril-climatology](https://apify.com/malonestar/noaa-storm-events-peril-climatology) · [usace-levee-flood-risk-screener](https://apify.com/malonestar/usace-levee-flood-risk-screener) · [usgs-bedrock-geology-lithology-screener](https://apify.com/malonestar/usgs-bedrock-geology-lithology-screener) · [usgs-landslide-proximity-screener](https://apify.com/malonestar/usgs-landslide-proximity-screener) · [usgs-seismic-design-screener](https://apify.com/malonestar/usgs-seismic-design-screener) · [wildfire-asset-exposure-screener](https://apify.com/malonestar/wildfire-asset-exposure-screener)

**Habitat, wetlands, protected & historic land** (9)

[blm-sage-grouse-siting-screener](https://apify.com/malonestar/blm-sage-grouse-siting-screener) · [fws-critical-habitat-screener](https://apify.com/malonestar/fws-critical-habitat-screener) · [fws-wetlands-proximity-screener](https://apify.com/malonestar/fws-wetlands-proximity-screener) · [nhd-surface-water-404-screener](https://apify.com/malonestar/nhd-surface-water-404-screener) · [noaa-efh-consultation-screener](https://apify.com/malonestar/noaa-efh-consultation-screener) · [nrhp-historic-place-screener](https://apify.com/malonestar/nrhp-historic-place-screener) · [padus-protected-lands-screener](https://apify.com/malonestar/padus-protected-lands-screener) · [tribal-land-jurisdiction-screener](https://apify.com/malonestar/tribal-land-jurisdiction-screener) · [wild-scenic-river-proximity-screener](https://apify.com/malonestar/wild-scenic-river-proximity-screener)

**Energy siting, grid & pipelines** (14)

[blm-mining-claims](https://apify.com/malonestar/blm-mining-claims) · [blm-solar-siting-area-screener](https://apify.com/malonestar/blm-solar-siting-area-screener) · [boem-offshore-wind-lease-tracker](https://apify.com/malonestar/boem-offshore-wind-lease-tracker) · [cdfi-nmtc-lowincome-energy-bonus-screener](https://apify.com/malonestar/cdfi-nmtc-lowincome-energy-bonus-screener) · [eia-v2-site-energy-economics](https://apify.com/malonestar/eia-v2-site-energy-economics) · [energy-corridor-368-screener](https://apify.com/malonestar/energy-corridor-368-screener) · [hifld-grid-proximity-screener](https://apify.com/malonestar/hifld-grid-proximity-screener) · [interconnection-queue-tracker](https://apify.com/malonestar/interconnection-queue-tracker) · [ira-energy-community-bonus-screener](https://apify.com/malonestar/ira-energy-community-bonus-screener) · [nrel-pvwatts-solar-resource-scorer](https://apify.com/malonestar/nrel-pvwatts-solar-resource-scorer) · [ntad-gas-pipeline-proximity-screener](https://apify.com/malonestar/ntad-gas-pipeline-proximity-screener) · [oil-gas-well-permits](https://apify.com/malonestar/oil-gas-well-permits) · [orphaned-well-proximity-screener](https://apify.com/malonestar/orphaned-well-proximity-screener) · [uswtdb-turbine-proximity-screener](https://apify.com/malonestar/uswtdb-turbine-proximity-screener)

**Farmland, soil & water** (5)

[ssurgo-soil-suitability-screener](https://apify.com/malonestar/ssurgo-soil-suitability-screener) · [usda-cdl-farmland-siting-screener](https://apify.com/malonestar/usda-cdl-farmland-siting-screener) · [usgs-groundwater-depth-screener](https://apify.com/malonestar/usgs-groundwater-depth-screener) · [usgs-nwis-streamflow-monitor](https://apify.com/malonestar/usgs-nwis-streamflow-monitor) · [water-rights-availability-screener](https://apify.com/malonestar/water-rights-availability-screener)

**Banking, lending & credit** (8)

[bank-enforcement-tracker](https://apify.com/malonestar/bank-enforcement-tracker) · [fdic-branch-network-churn-rollup](https://apify.com/malonestar/fdic-branch-network-churn-rollup) · [fdic-ncua-health-rollup](https://apify.com/malonestar/fdic-ncua-health-rollup) · [fdic-sod-deposit-market-share-rollup](https://apify.com/malonestar/fdic-sod-deposit-market-share-rollup) · [fdic-structure-change-delta-monitor](https://apify.com/malonestar/fdic-structure-change-delta-monitor) · [fhlbank-membership-delta-monitor](https://apify.com/malonestar/fhlbank-membership-delta-monitor) · [hmda-fair-lending-disparity-rollup](https://apify.com/malonestar/hmda-fair-lending-disparity-rollup) · [sba-loan-portfolio-explorer](https://apify.com/malonestar/sba-loan-portfolio-explorer)

**Securities, audit, pensions & sanctions** (7)

[adcvd-trade-remedy-tracker](https://apify.com/malonestar/adcvd-trade-remedy-tracker) · [consolidated-screening-list-delta](https://apify.com/malonestar/consolidated-screening-list-delta) · [fec-campaign-finance-delta](https://apify.com/malonestar/fec-campaign-finance-delta) · [pbgc-pension-failure-monitor](https://apify.com/malonestar/pbgc-pension-failure-monitor) · [pcaob-auditor-engagement-monitor](https://apify.com/malonestar/pcaob-auditor-engagement-monitor) · [ria-registration-delta-monitor](https://apify.com/malonestar/ria-registration-delta-monitor) · [short-interest-ftd-monitor](https://apify.com/malonestar/short-interest-ftd-monitor)

**Licensing, exclusion & workforce screening** (10)

[city-business-license-leads](https://apify.com/malonestar/city-business-license-leads) · [gleif-ownership-graph](https://apify.com/malonestar/gleif-ownership-graph) · [hrsa-clinician-workforce-monitor](https://apify.com/malonestar/hrsa-clinician-workforce-monitor) · [hrsa-shortage-designation-monitor](https://apify.com/malonestar/hrsa-shortage-designation-monitor) · [kyb-company-verifier](https://apify.com/malonestar/kyb-company-verifier) · [license-verifier](https://apify.com/malonestar/license-verifier) · [liquor-license-new-openings-tracker](https://apify.com/malonestar/liquor-license-new-openings-tracker) · [medicaid-exclusion-screener](https://apify.com/malonestar/medicaid-exclusion-screener) · [realtor-license-roster-delta](https://apify.com/malonestar/realtor-license-roster-delta) · [sos-registry-monitor](https://apify.com/malonestar/sos-registry-monitor)

**Real estate, parcels, deeds & leads** (9)

[absentee-owner-lead-list-builder](https://apify.com/malonestar/absentee-owner-lead-list-builder) · [acris-deed-transfer-intel](https://apify.com/malonestar/acris-deed-transfer-intel) · [childcare-provider-leads](https://apify.com/malonestar/childcare-provider-leads) · [distressed-property-signal-stacker](https://apify.com/malonestar/distressed-property-signal-stacker) · [hud-affordable-housing-explorer](https://apify.com/malonestar/hud-affordable-housing-explorer) · [hud-qct-lihtc-boost-screener](https://apify.com/malonestar/hud-qct-lihtc-boost-screener) · [hud-section8-contract-expiration-monitor](https://apify.com/malonestar/hud-section8-contract-expiration-monitor) · [nyc-landlord-registry-lead-list](https://apify.com/malonestar/nyc-landlord-registry-lead-list) · [parcel-owner-lookup](https://apify.com/malonestar/parcel-owner-lookup)

**Infrastructure, transport & airspace** (8)

[dod-mirta-military-installation-siting-screener](https://apify.com/malonestar/dod-mirta-military-installation-siting-screener) · [faa-drone-airspace-checker](https://apify.com/malonestar/faa-drone-airspace-checker) · [fhwa-nbi-bridge-risk-monitor](https://apify.com/malonestar/fhwa-nbi-bridge-risk-monitor) · [gsa-site-scanning-auditor](https://apify.com/malonestar/gsa-site-scanning-auditor) · [national-tunnel-inventory-risk-monitor](https://apify.com/malonestar/national-tunnel-inventory-risk-monitor) · [nhtsa-vpic-vin-decoder](https://apify.com/malonestar/nhtsa-vpic-vin-decoder) · [nid-dam-risk-monitor](https://apify.com/malonestar/nid-dam-risk-monitor) · [ntad-fra-rail-crossing-risk-screener](https://apify.com/malonestar/ntad-fra-rail-crossing-risk-screener)

**Health, clinical & drug supply** (7)

[cdc-nndss-outbreak-monitor](https://apify.com/malonestar/cdc-nndss-outbreak-monitor) · [clinical-trials-meta-search](https://apify.com/malonestar/clinical-trials-meta-search) · [cms-open-payments](https://apify.com/malonestar/cms-open-payments) · [cms-part-d-prescriber-delta](https://apify.com/malonestar/cms-part-d-prescriber-delta) · [drug-shortage-delta-monitor](https://apify.com/malonestar/drug-shortage-delta-monitor) · [nadac-price-movers](https://apify.com/malonestar/nadac-price-movers) · [usmin-mine-feature-proximity-screener](https://apify.com/malonestar/usmin-mine-feature-proximity-screener)

**Patents, IP & company data** (4)

[npm-package-health-scorer](https://apify.com/malonestar/npm-package-health-scorer) · [ptab-trial-tracker](https://apify.com/malonestar/ptab-trial-tracker) · [sbom-vulnerability-rollup](https://apify.com/malonestar/sbom-vulnerability-rollup) · [uspto-patent-lapse-fto-monitor](https://apify.com/malonestar/uspto-patent-lapse-fto-monitor)

**Labor & enforcement** (2)

[dol-enforcement-rollup](https://apify.com/malonestar/dol-enforcement-rollup) · [warn-layoff-aggregator](https://apify.com/malonestar/warn-layoff-aggregator)
<!-- COVERAGE:END -->

## Development

```bash
npm install
npm test              # offline suite, no network
node tools/mutate.cjs # re-injects known defects, asserts the suite catches them
npm run catalog -- <apify-token>   # regenerate src/catalog.json from the live API
```

## License

MIT
