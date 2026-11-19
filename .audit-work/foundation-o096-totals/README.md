# O-096 (CMP-H05) — Sticky totals: cost/sell/margin + itemized takeoff + missing-input checklist

**Acceptance text** (ESTIMATOR_MASTERPLAN.md):
> `O-096 [OPEN] (CMP-H05) Sticky totals with separate cost/sell/margin, itemized takeoff, and missing-input checklist.`

**App:** `68dfcc5e57bbbc35387da97c` · **Branch:** `main` · **Remote HEAD verified:** `db94d76159265e342c56ad7dd766ad926d93f1b1` (re-checked after verification — unchanged).

**Mode:** audit-candidate only. No remote writes, no checkpoint, no deploy, no publish, no entity ops.

## Candidates (`candidates/`)

| File | Change |
|---|---|
| `foundationTotalsSummary.js` | **NEW** — pure helper (451 lines, no imports): `resolveFoundationStickySummary`, `buildFoundationTakeoff`, `buildFoundationInputChecklist`, `FOUNDATION_STICKY_PARTITION_FIELDS` |
| `FoundationTotals.jsx` | Baseline 79 → 251 lines, strictly additive. Two **new optional props** (`project`, `calc`); original 4-prop signature works unchanged. Adds sticky cost/sell/margin trio, collapsible itemized takeoff, collapsible missing-input checklist. |
| `CustomerPricingPanel.jsx` | +13 lines: "Tier N snapshot margin (acknowledged)" row when an applied `customer_pricing` tier shadows the manual baseline and `raw_subtotal` is finite. |

## Semantics

**Sell precedence** mirrors `customerPricing.sourceProjectEconomics`' foundation branch: pricing engine → applied tier snapshot → price override → markup %. Computed sells (engine, markup) require the **live** cost — never projected over a held amount. Recorded sells (tier snapshot, override) still display on paused pricing because they are acknowledged values. **Margin** requires finite cost AND sell — `—` otherwise; basis labeled "sell − cost" vs "vs saved cost". Applied-tier acknowledged pair (`total` vs `raw_subtotal`) is footnoted when it differs from displayed cost by > $0.005.

**Takeoff**: per-component rows grouped Foundations / Masonry / Poles / Wall caps / Equipment / Cabinets / Landscape, each with quantity basis + amount. Held rows flagged "(saved)"; amountless held rows render "Not saved".

**Checklist**: groups = Design inputs (blocking, `calc.inputIssues`) · Catalog & settings (blocking, `calc.catalogIssues`) · Placement (advisory, `foundationAssemblyIssues(project)`) · Construction checks (advisory, `calc.constructionWarnings`) · Held amounts (partition-field enumeration — catches wall-cap holds that never reach issue channels). Auto-expands on blocking issues; "All inputs recorded" only when channels were actually consulted and empty.

## Verification

- **Model:** `node verify-o096-model.mjs` → **PASS 38/38** (`verify-o096-model-results.json`) — margin math, all sell sources, held suppression, footnote differs/equals, checklist severities/dedup/catch-all/unwired, partition parity vs `FOUNDATION_RECORD_TOTAL_FIELDS`, garbage-input robustness.
- **Real-component browser:** `node verify-o096-browser.mjs` → **PASS 17/17**, 0 console/page errors, 0 foreign requests (`o096-browser-verification.json`). Real esbuild bundle: 30 inputs — actual candidate components + real `foundationCalc`/`foundationSellPricing`/`foundationAssemblyModel`/`landscapeMaterials` chain + React (`o096-browser-metafile.json`). 1280px + 390px screenshots attached (`trio-*.png`, `takeoff-open-1280.png`, `wallcap-hold-1280.png`, `unwired-1280.png`, `panel-tier-margin-1280.png`).
- **Baseline integrity:** pulled baselines md5-verified byte-identical to remote git blobs @ HEAD (modulo read-API LF normalization); remote working tree clean; HEAD re-verified `db94d761…` post-verification.

## Deferred wiring (page is ownership-protected — NOT modified)

`FoundationEstimator.jsx:1347` — append two props to the existing call:

```diff
- <FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} savedSectionTotal={savedSectionTotal} sectionTotal={sectionTotal} />
+ <FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} savedSectionTotal={savedSectionTotal} sectionTotal={sectionTotal} project={project} calc={calc} />
```

Both symbols already in scope (`calc` @ L294, `project` state). Unwired, the panel still renders cost column + totals-quantity takeoff + held-amounts checklist — it never claims issue channels were checked when they weren't passed.

## Claim-safe ledger paragraph

> O-096 (CMP-H05): Candidate implementation verified in the audit workspace at remote HEAD `db94d7615…`. Sticky totals now carry a separate cost/sell/margin trio — sell resolved with the economics-engine precedence (engine → applied tier → override → markup), margin computed only on finite cost-vs-sell pairs (acknowledged `customer_pricing` snapshot pair footnoted when the tier sell is live), held sides rendered as saved/— rather than $0. Itemized takeoff lists per-component quantity + amount rows across foundations, masonry, poles, wall caps, equipment, cabinets, and landscape with "(saved)"/"Not saved" held flags. Missing-input checklist enumerates the page's existing issue channels (input, catalog, placement, construction advisories) plus a partition-derived held-amounts channel that catches wall-cap holds upstream lists miss; the "all recorded" state is claimed only when channels are actually consulted. Evidence: 38-case pure-model PASS + 17-case real-component browser PASS (real dependency bundle, 1280/390 screenshots, zero console/page errors). Not yet deployed: full surface needs the one-line prop wiring at `FoundationEstimator.jsx:1347` (page owned by another phase — deferred, documented). Candidates only — no sandbox writes, checkpoint, deploy, publish, or entity ops performed.
