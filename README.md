# 100+ US government data tools for AI agents (MCP)

[malonestar](https://apify.com/malonestar) publishes a growing catalog of Apify Actors built directly on keyless US federal and state open-data APIs -- EPA, FEMA, USGS, FDIC, HUD, FAA, USACE, NOAA, county assessor rolls, state licensing boards, and more. 95 are live on the Apify Store today, out of 100+ built; every one of them is also an MCP tool, callable by any MCP-compatible AI agent with zero extra integration work.

No scraping, no rate-limit roulette, no HTML parsing. Every actor here reads directly from an official government API or bulk data file, normalizes the output into clean structured rows, and (where the source is prone to it) actively guards against truncation, silent zeros, and stale data -- see each actor's own README for the specific gotchas it defends against.

## How this works

Apify runs a hosted MCP server at `https://mcp.apify.com`. Any Actor in the Apify Store -- including all of the ones listed below -- is reachable as an MCP tool without you writing or hosting any server code. You authenticate once with an Apify API token (a generous free tier is enough to try every actor in this catalog), and your agent gets tool-calling access to as many actors as you choose to expose.

Each actor is addressable individually:

```
https://mcp.apify.com?tools=malonestar/<actor-name>
```

You can expose more than one actor in a single connection by comma-separating them, and you can mix in Apify's own general-purpose tools (`actors`, `docs`) for actor discovery:

```
https://mcp.apify.com?tools=malonestar/epa-contaminated-site-screener,malonestar/site-due-diligence-bundle,docs
```

Full protocol and query-parameter reference: https://docs.apify.com/platform/integrations/mcp

## Quick start

You need an Apify account and an API token from https://console.apify.com/settings/integrations. Apify's free tier includes monthly platform credit that's enough to run every actor in this catalog many times over while you evaluate them.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com?tools=malonestar/site-due-diligence-bundle,malonestar/epa-contaminated-site-screener",
      "headers": {
        "Authorization": "Bearer YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

(Claude Desktop also supports OAuth against `https://mcp.apify.com` with no headers block, if you'd rather authenticate interactively.)

### Claude Code

One-command install:

```bash
apify mcp install claude-code
```

Or add it directly to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com?tools=malonestar/site-due-diligence-bundle,malonestar/epa-contaminated-site-screener",
      "headers": {
        "Authorization": "Bearer YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` (same shape as Claude Desktop):

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com?tools=malonestar/site-due-diligence-bundle,malonestar/epa-contaminated-site-screener",
      "headers": {
        "Authorization": "Bearer YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

Cursor also supports `apify mcp install cursor` for the same one-command setup, alongside `vscode`, `vscode-insiders`, `codex`, `kiro`, and `antigravity`.

Swap the `tools=` list for whichever actors from the catalog below you want your agent to have access to -- or list `docs` alongside a smaller set so the agent can discover more actors on demand.

## Worked example

A Phase I environmental due-diligence check, using [`site-due-diligence-bundle`](https://apify.com/malonestar/site-due-diligence-bundle) (a 20-federal-layer property screen) connected as an MCP tool in Claude Desktop:

> **You:** I'm underwriting an industrial property at 29.7355, -95.2601 (Houston Ship Channel). Run the site due-diligence screen at a 1-mile radius and tell me if there's anything that would kill the deal.
>
> **Claude:** *[calls `malonestar/site-due-diligence-bundle` with `{"assets":[{"lat":29.7355,"lon":-95.2601,"label":"Houston Ship Channel industrial site, TX"}],"radiusMiles":1}`]*
>
> That site comes back with a **`caution`** verdict, composite score 61/100.
>
> The main driver is a Tier B flag: it's within a mile of an EPA-listed RCRA hazardous-waste site and inside a Clean Air Act nonattainment area for ozone, which raises NSR/PSD permitting friction if you're planning any combustion equipment. It also sits in FEMA Zone AE (Tier B), so expect a flood-insurance requirement on any loan. No Tier A fatal flaws -- it's not on or bordering a Superfund NPL site, not in a mapped wetland, not behind an unaccredited levee, and clear on seismic, karst, and critical-habitat screens.
>
> Given the flood zone and the air-permitting friction, I'd budget for a flood elevation certificate and a pre-application call with the regional air permitting office before you firm up the timeline. Want me to pull the full EPA contamination detail (Superfund/RCRA/TRI/UST/LUST) for a proper Phase I database report on this parcel?

This is illustrative -- the exact score, verdict, and flagged layers depend on the live upstream data at the time you run it. The composite score is `100 - 35 x TierA - 18 x TierB - 6 x TierC` (floored at 0), and the verdict is one of `proceed`, `caution`, `no-go`, `incomplete-screen`, or `not-screened` -- it is deliberately gated so it can never read `proceed` while a data layer failed to respond. Full field reference: https://apify.com/malonestar/site-due-diligence-bundle

## Catalog by vertical

Every actor below is callable at `https://mcp.apify.com?tools=malonestar/<name>`. All are pay-per-event (PPE) -- no subscription, no minimum spend, billed only for rows actually returned. Full portfolio (100+ actors) browsable at https://apify.com/malonestar.

### Property due diligence

Phase I ESA and site-screening tools for CRE acquisition, lending, and environmental consulting.

| Actor | What it does | Store |
|---|---|---|
| `site-due-diligence-bundle` | One call returns a go/caution/no-go-style verdict and 0-100 composite score across 20 federal layers (EPA contamination, FEMA flood, wetlands, habitat, air nonattainment, historic, karst, landslide, levee, dams, coastal barrier, tanks, pipelines, seismic). | [Store](https://apify.com/malonestar/site-due-diligence-bundle) |
| `epa-contaminated-site-screener` | Phase I ESA environmental database search for any US address: Superfund/NPL, RCRA, TRI, UST, LUST, Brownfields, plus opt-in NPDES/AIR/TSCA/RMP, scored against ASTM E1527-21 search distances. | [Store](https://apify.com/malonestar/epa-contaminated-site-screener) |
| `fema-nri-county-risk-profile` | Joins any asset to FEMA's National Risk Index at county or census-tract resolution: composite risk score, expected annual loss, social vulnerability, and ranked top hazards across all 18 FEMA perils. | [Store](https://apify.com/malonestar/fema-nri-county-risk-profile) |
| `usace-levee-flood-risk-screener` | Checks whether a property sits behind a US levee and how much to trust it, with a composite score from FEMA accreditation, overtopping chance, and rehab status. | [Store](https://apify.com/malonestar/usace-levee-flood-risk-screener) |
| `fws-wetlands-proximity-screener` | Wetland presence within radius, Cowardin classification, acreage, and a Section 404 dredge-and-fill screening flag from USFWS National Wetlands Inventory data. | [Store](https://apify.com/malonestar/fws-wetlands-proximity-screener) |
| `usgs-seismic-design-screener` | Batch coordinates to ASCE 7-22 and 7-16 seismic design values (SDS, SD1, SDC, PGA_M, design spectra) from the keyless USGS building-codes service. | [Store](https://apify.com/malonestar/usgs-seismic-design-screener) |
| `nhd-surface-water-404-screener` | Distance to the nearest perennial/intermittent/ephemeral stream reach, waterbody type, HUC codes, and a jurisdictional-likelihood / Section 404 (WOTUS) call. | [Store](https://apify.com/malonestar/nhd-surface-water-404-screener) |
| `usgs-historical-topo-records-review` | Full USGS historical topographic map chronology for a coordinate, mapped to the ASTM E1527-21 Sec. 8.3.4 historical records review requirement. | [Store](https://apify.com/malonestar/usgs-historical-topo-records-review) |
| `karst-sinkhole-risk-screener` | Point-in-polygon check against USGS's national karst compilation (carbonate, evaporite, sandstone, pseudokarst) with an editorial sinkhole-risk tier. | [Store](https://apify.com/malonestar/karst-sinkhole-risk-screener) |
| `state-tank-spill-registry-screener` | UST/LUST and spill registry screen against the national EPA UST Finder plus NY, CA, TX and FL state registries. | [Store](https://apify.com/malonestar/state-tank-spill-registry-screener) |

### Environmental & hazards

Broader hazard and ecological-risk screening beyond the standard Phase I set -- insurance, siting, and catastrophe modeling use cases.

| Actor | What it does | Store |
|---|---|---|
| `wildfire-asset-exposure-screener` | Screens assets against live NIFC wildfire perimeters plus USFS Wildfire Hazard Potential class and historical burn history. | [Store](https://apify.com/malonestar/wildfire-asset-exposure-screener) |
| `noaa-slr-inundation-threshold-screener` | The NOAA sea-level-rise increment (0-10 ft above MHHW) at which a coastal site first floods, with confidence class and levee-exclusion handling. | [Store](https://apify.com/malonestar/noaa-slr-inundation-threshold-screener) |
| `fws-critical-habitat-screener` | Checks coordinates against live USFWS Critical Habitat polygons: species, Final vs Proposed status, and an ESA Section 7 consultation flag. | [Store](https://apify.com/malonestar/fws-critical-habitat-screener) |
| `epa-impaired-waters-303d-screener` | Proximity to CWA Section 303(d) impaired/threatened waters from EPA ATTAINS, with pollutant causes, TMDL status, and an NPDES flag. | [Store](https://apify.com/malonestar/epa-impaired-waters-303d-screener) |
| `epa-nonattainment-air-permit-screener` | Point-in-polygon check against 11 EPA Clean Air Act NAAQS pollutant standards, with classification and an NSR/PSD permitting-risk flag. | [Store](https://apify.com/malonestar/epa-nonattainment-air-permit-screener) |
| `noaa-storm-events-peril-climatology` | County-level severe-weather climatology from NOAA Storm Events: per-peril event frequency, casualties, and damage for underwriting and catastrophe siting. | [Store](https://apify.com/malonestar/noaa-storm-events-peril-climatology) |
| `fhwa-nbi-bridge-risk-monitor` | Screens 620,000+ US bridges from the FHWA National Bridge Inventory by condition and scour-critical status, with a composite 0-100 risk score. | [Store](https://apify.com/malonestar/fhwa-nbi-bridge-risk-monitor) |
| `nid-dam-risk-monitor` | US dam safety risk from the USACE National Inventory of Dams: hazard potential, condition, inspection staleness, and missing-EAP flags. | [Store](https://apify.com/malonestar/nid-dam-risk-monitor) |
| `orphaned-well-proximity-screener` | Screens any US coordinate against 117,672 documented orphaned oil and gas wells across 27 states, with distance, bearing, and a Phase I ESA risk signal. | [Store](https://apify.com/malonestar/orphaned-well-proximity-screener) |
| `epa-ghgrp-emitter-screener` | Every large US greenhouse-gas emitter from EPA GHGRP on EPA's own basis (direct CO2e, biogenic excluded), with per-gas split and YoY trend. | [Store](https://apify.com/malonestar/epa-ghgrp-emitter-screener) |

### Banking & finance

Regulatory and market-structure data for bank M&A, deposit strategy, and compliance monitoring, built on FDIC/NCUA/SEC/PCAOB/FINRA bulk data.

| Actor | What it does | Store |
|---|---|---|
| `fdic-ncua-health-rollup` | Bank & credit-union financial-health rollup: assets, deposits, equity, ROA, ROE, NIM and asset quality, with QoQ deltas and peer-percentile scoring. | [Store](https://apify.com/malonestar/fdic-ncua-health-rollup) |
| `fdic-structure-change-delta-monitor` | Typed delta feed of FDIC bank structure changes: mergers paired acquirer-to-target, de-novo charters, failures, and regulator conversions. | [Store](https://apify.com/malonestar/fdic-structure-change-delta-monitor) |
| `fdic-branch-network-churn-rollup` | Net FDIC branch churn by bank, county and quarter -- openings, closings, purchases, and divestitures, with a verified standing branch count. | [Store](https://apify.com/malonestar/fdic-branch-network-churn-rollup) |
| `fdic-sod-deposit-market-share-rollup` | County/MSA/state deposit market share from FDIC Summary of Deposits: per-bank share, rank, and HHI concentration against DOJ thresholds. | [Store](https://apify.com/malonestar/fdic-sod-deposit-market-share-rollup) |
| `bank-enforcement-tracker` | Merges OCC/FDIC/Fed bank and credit-union enforcement actions into one normalized, delta-monitorable feed tagged by type and severity. | [Store](https://apify.com/malonestar/bank-enforcement-tracker) |
| `ria-registration-delta-monitor` | Month-over-month RIA registration intelligence from SEC data: new registrations, terminations, AUM changes, and ERA-to-RIA graduations. | [Store](https://apify.com/malonestar/ria-registration-delta-monitor) |
| `pcaob-auditor-engagement-monitor` | Tracks auditor switches and engagement-partner rotations across every SEC issuer from PCAOB Form AP filings, with a new-since-last-run delta mode. | [Store](https://apify.com/malonestar/pcaob-auditor-engagement-monitor) |
| `short-interest-ftd-monitor` | Merges SEC fails-to-deliver and FINRA short-interest disclosures into one per-ticker time series with change and spike flags. | [Store](https://apify.com/malonestar/short-interest-ftd-monitor) |
| `hmda-fair-lending-disparity-rollup` | Fair-lending exam analytics on CFPB HMDA data: denial-rate disparity with two-proportion z-tests, redlining screens, and lender-vs-market benchmarks. | [Store](https://apify.com/malonestar/hmda-fair-lending-disparity-rollup) |
| `sba-loan-portfolio-explorer` | SBA 7(a) and 504 loan-level data: lookup by state/industry/lender/year, portfolio rollups, and risk-outlier flags. | [Store](https://apify.com/malonestar/sba-loan-portfolio-explorer) |

### Real-estate lead gen

Owner, buyer, and transaction intelligence built from county assessor rolls and municipal open data -- for wholesalers, agents, proptech, and prop-mgmt/insurance sales.

| Actor | What it does | Store |
|---|---|---|
| `absentee-owner-lead-list-builder` | Absentee-owner leads from county assessor rolls (Cook County IL, Philadelphia, NYC): out-of-state/out-of-city situs-vs-mailing mismatches, LLC/trust owners. | [Store](https://apify.com/malonestar/absentee-owner-lead-list-builder) |
| `nyc-landlord-registry-lead-list` | Bulk NYC landlord/managing-agent contact leads from HPD registrations, filterable by portfolio size (e.g. owners of 5-50 buildings). | [Store](https://apify.com/malonestar/nyc-landlord-registry-lead-list) |
| `distressed-property-signal-stacker` | NYC motivated-seller leads: stacks open violations, tax lien sale notices, and executed evictions per parcel, with a distress score and owner contact. | [Store](https://apify.com/malonestar/distressed-property-signal-stacker) |
| `acris-deed-transfer-intel` | NYC deed-transfer intel from ACRIS with LLC-buyer, out-of-state-buyer and cash-sale flags; delta mode emits only new deeds. | [Store](https://apify.com/malonestar/acris-deed-transfer-intel) |
| `parcel-owner-lookup` | Turns street addresses into parcel IDs, owner names, mailing addresses, and assessed values from official assessor rolls, with Census-geocoder fallback. | [Store](https://apify.com/malonestar/parcel-owner-lookup) |
| `realtor-license-roster-delta` | Real-estate licensee lead feeds for recruiters: new applications, newly licensed agents, and broker-affiliation-change events. | [Store](https://apify.com/malonestar/realtor-license-roster-delta) |
| `liquor-license-new-openings-tracker` | Pre-opening bar and restaurant leads from state liquor registries (TX, NY, FL): new applications, pending licenses, and status changes. | [Store](https://apify.com/malonestar/liquor-license-new-openings-tracker) |
| `city-business-license-leads` | New business-license lead feed across Chicago, LA, SF, NYC and Seattle, with new-vs-renewal and active-vs-dead flags. | [Store](https://apify.com/malonestar/city-business-license-leads) |
| `childcare-provider-leads` | Licensed childcare provider leads from Texas HHSC with direct phone and email contacts, filterable by county, capacity, and deficiency history. | [Store](https://apify.com/malonestar/childcare-provider-leads) |

### Licensing & compliance

Primary-source verification and screening for KYB/AML, healthcare compliance, and regulatory monitoring.

| Actor | What it does | Store |
|---|---|---|
| `license-verifier` | Primary-source verification for US professional licenses across 19 state boards, cross-checked against the NPPES NPI registry and HHS-OIG exclusion list. | [Store](https://apify.com/malonestar/license-verifier) |
| `medicaid-exclusion-screener` | Screens names and NPIs against merged OIG LEIE and state Medicaid exclusion lists, with a screen-verdict mode and match confidence. | [Store](https://apify.com/malonestar/medicaid-exclusion-screener) |
| `kyb-company-verifier` | KYB/AML company verification that fans a company name out to French (INSEE/RNE), GLEIF LEI, and US state registries in one call. | [Store](https://apify.com/malonestar/kyb-company-verifier) |
| `gleif-ownership-graph` | Resolves a company name to its GLEIF LEI and traverses parent/child relationships into a normalized corporate ownership graph. | [Store](https://apify.com/malonestar/gleif-ownership-graph) |
| `sos-registry-monitor` | Business entity search and new-business monitor across official US Secretary of State registries, sourced from state open-data (no anti-bot). | [Store](https://apify.com/malonestar/sos-registry-monitor) |
| `consolidated-screening-list-delta` | Diffs the US Trade.gov Consolidated Screening List (OFAC/BIS/State DDTC) against the last run and emits added/removed/modified entries. | [Store](https://apify.com/malonestar/consolidated-screening-list-delta) |
| `dol-enforcement-rollup` | Rolls up US Department of Labor WHD wage-theft enforcement actions per employer, with repeat-violator flags. | [Store](https://apify.com/malonestar/dol-enforcement-rollup) |
| `cms-open-payments` | CMS Open Payments (Sunshine Act) lookup by physician, NPI, or manufacturer, rolled up per physician x manufacturer. | [Store](https://apify.com/malonestar/cms-open-payments) |
| `ptab-trial-tracker` | Tracks USPTO PTAB AIA trials (IPR/PGR/CBM): search by party or patent, a new-petition delta feed, and an institution-rate score. | [Store](https://apify.com/malonestar/ptab-trial-tracker) |

### Aviation

| Actor | What it does | Store |
|---|---|---|
| `faa-drone-airspace-checker` | Batch lat/lon to FAA UAS airspace verdicts: LAANC ceilings and availability, charted Class B/C/D/E airspace, prohibited areas, TFRs, and special use airspace -- gated so it never reads clear when a layer failed to answer. | [Store](https://apify.com/malonestar/faa-drone-airspace-checker) |

This is currently the only actor in the aviation vertical. More US airspace and aircraft-registry tooling is on the roadmap -- open an issue if there's a specific FAA or NTSB dataset you'd want covered.

## Browsing the rest of the catalog

This README highlights 49 of the 95+ published actors. The full catalog -- including additional environmental adapters (NRHP historic places, tribal land jurisdiction, wild & scenic rivers, sole source aquifers, energy-community and solar-siting bonus screens), a flagship 20-layer property bundle, VIN decoding, streamflow monitoring, and more -- is browsable at:

https://apify.com/malonestar

Or ask any agent connected with the `docs` tool enabled (see Quick start above) to search the catalog for you.

## Pricing

Every actor listed here uses Apify's Pay-Per-Event pricing: you are billed per result row actually returned, not a flat per-run or subscription fee, and most actors bill nothing on a well-formed query that legitimately returns zero rows. Exact per-1,000-result pricing (with volume discount tiers) is shown on each actor's Store page.

## Contributing

Found a data-source gotcha, a broken field, or want an actor added to this README? Open an issue or a PR. If you build something on top of one of these tools, we'd like to hear about it.

## License

[MIT](LICENSE)
