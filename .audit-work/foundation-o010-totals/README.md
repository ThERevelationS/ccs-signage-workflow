# O-010 (CMP-A10) — Totals / Tiers / Overrides / Accepted-Snapshot Reconciliation

Audit + candidate package for Base44 app `68dfcc5e57bbbc35387da97c`, branch `main`,
verified against remote HEAD `4b2f3ad606e21a237f8abe0349410761cb6408ea`.

**No remote writes.** Everything here is local: pulled baselines, candidate files,
verification harnesses, results, and this ledger. Nothing was edited via
`sandbox edit`/`write`, no checkpoint, deploy, or publish.

## What the candidates change (4 files)

| remote path | change |
|---|---|
| `src/components/estimator/builder/builderService.js` | export `FOUNDATION_RECORD_TOTAL_FIELDS` (12-field persisted partition) + `foundationRecordSavedTotal(record)`; `sourceProjectTotal` foundation branch consumes the shared list — one ownership definition for both source-total derivation and saved-total reconciliation |
| `src/pages/FoundationEstimator.jsx` | import the helper, compute `savedSectionTotal` from the acknowledged saved record, pass saved + live totals into `FoundationTotals` (advisory only) |
| `src/components/estimator/foundation/FoundationTotals.jsx` | render a `[role=status]` advisory strip when `|current − saved| > 0.005` (up/down, absolute delta, "Save to update the estimate"); "current pricing unavailable" variant; silent on never-priced records; never blocks |
| `src/components/estimator/foundation/CustomerPricingPanel.jsx` | precedence notes: applied-tier-shadows-manual and engine-owns-sell-side; suppressed when no precedence / unapplied / unsaved-tier / equal-to-baseline; manual math untouched |

Diffs against pulled baselines: `diffs/*.diff`. All four candidates are
baseline + O-010 edits only — verified by diff inspection.

## Ledger (claim-safe)

> **O-010 ledger entry.** Pulled fresh remote sources at HEAD `4b2f3ad606`
> (prior baseline `cbee8813d`; only in-scope drift was an unrelated external-agent
> `FoundationEstimator.jsx` change, re-based and preserved). Established that the
> persisted foundation total is exactly the 12-field split partition —
> `total_brick_cost`/`total_fill_cost` are wall-cost subsets and are excluded —
> and that cabinets + landscape enter the section total exactly once via
> `sectionTotal = grand_total + cabinets + landscape`. Centralized that partition
> in `FOUNDATION_RECORD_TOTAL_FIELDS` so `sourceProjectTotal` and the new
> `foundationRecordSavedTotal` share one ownership definition; candidate totals
> are byte-identical to baseline on every record shape (parity case). Mapped
> ownership end-to-end: `foundationCalc` owns live math → `FoundationEstimator`
> owns save → `AllInOneEstimate.line_items` keeps `total_snapshot`/
> `customer_price_snapshot` frozen until explicit acceptance while
> `live_*_snapshot` fields carry current values (0.005 tolerance in
> `useSectionSync`/`ProductRow`) → `aioPricing`, `customerQuote`, and
> `workOrderConversion` consume accepted values only. Documented and tested the
> precedence ladder pricing-engine > applied saved tier > price override >
> markup % (override 0 → markup; tier without numeric total → manual;
> `applied:false` → manual; editing manual fields clears `applied`). Added an
> advisory, float-tolerant (0.005) saved-vs-current indicator and precedence
> notes that never block. Verified: model harness **PASS 38 cases**, real-page
> browser harness **PASS 14 cases** at 1280px + 390px with 0 page errors and 0
> foreign requests, esbuild syntax OK on all 4 candidates. **OPEN:** work-order →
> invoice tail exact-once — source consumers read frozen/accepted values
> consistently, but exact-once on live WO/invoice records requires live-record
> evidence and remains unproven by this package.

## Artifact inventory

- `SPEC.json` — structured spec: provenance, ownership chain, field partition,
  precedence ladder, per-file candidate changes, verification coverage, claims.
- `baseline/` — `sandbox read` pulls of reconciliation files + `*.read.json`
  envelopes; verified content-identical to HEAD `4b2f3ad606` (modulo read-API
  CRLF→LF + trailing-newline normalization — see SPEC `baseline_provenance`).
- `fixture-pulls/` — additional pulled dependencies (pricing engine, WO
  persistence, deposit gate, calculators); same provenance + verification.
- `candidates/` — 4 candidate files (see table).
- `diffs/` — regenerated baseline→candidate unified diffs (55+35+44+65 lines).
- `verify-totals-model.mjs` + `verify-totals-model-results.json` — pure-model
  harness, 38 cases, PASS (re-run post-rebase).
- `verify-totals-browser.mjs` + `totals-browser-verification.json` — real-page
  esbuild/playwright harness, 14 cases, PASS (re-run post-rebase).
- `totals-*.png`, `panel-*.png` — desktop/mobile screenshots of the advisory
  strip + precedence notes (delta up, equal/no-strip, pricing-blocked, tier,
  engine; 1280px + 390px).
- `fixture/`, `fixture-browser/` — stubs + bundled sources used by the harnesses.
- `remote-md5*.json`, `crlf-check.json`, `tail-check.json`, `head-*.json`,
  `remote-after/` — remote-HEAD verification + normalization forensics.
- `grep-*.json` — remote grep evidence used for the ownership/consumer map.

## How to re-verify

```bash
cd .audit-work/foundation-o010-totals
node verify-totals-model.mjs      # -> PASS totals-model o010 (38 cases)
node verify-totals-browser.mjs    # -> PASS totals-browser o010 (14 cases)
npx esbuild candidates/FoundationEstimator.jsx --loader:.jsx=jsx --outfile=NUL
```

If remote HEAD moves past `4b2f3ad606`, re-pull the four baseline files before
trusting the diffs; `sandbox read` output is LF + no trailing newline regardless
of on-disk endings.
