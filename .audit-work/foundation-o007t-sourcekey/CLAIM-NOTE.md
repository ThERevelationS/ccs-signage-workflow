# foundation-o007t-sourcekey — claim note

**Unit:** `foundation-o007t-sourcekey` — O-007 (CMP-A07) remainder: `ai_engineering_data.source_key` provenance staleness on template apply.
**App:** `68dfcc5e57bbbc35387da97c`, branch `main`, remote HEAD verified `f2d2fe3e0b1c3fc852d3de7175643f8c896f2e37` (clean).
**Mode:** LOCAL candidates only. No remote write / checkpoint / deploy performed or claimed.

## Files claimed by this unit (candidates)

- `src/components/estimator/foundation/foundationTemplateModel.js` — apply-time provenance stamp (`stampTemplateAppliedAiData`), signature `{createId, appliedAt}`, field-semantics comment.
- `src/components/estimator/foundation/FoundationTemplateDialog.jsx` — display-only "Includes an AI review note — stale on this project" row indicator.

## Files NOT claimed (explicitly out of scope)

- `src/pages/FoundationEstimator.jsx`, `foundationCalc.js`, `foundationReinforcement*` — Phase B-2 owns. No touch needed anyway: the page's single `prepareFoundationTemplatePatch` call site already exercises the stamp.
- `foundationAiReview.js`, `AiEngineeringAssistant.jsx` — consumer contract satisfied by additive data fields; no code change (verified by rendering the real baseline component: applied target renders the existing stale-banner branch, never "Preliminary review").
- `foundationAssemblyModel.js`, `foundationTemplateService.js`, `foundationDraftRecovery.js`, `base44/entities/*.jsonc` — baseline pulls for bundling/schema verification only.

## Concurrency

- No other agent/builder activity observed; remote worktree clean at pull time.
- Prior unit `foundation-o007-templates` has LANDED on remote (31-field allowlist + `sanitizeTemplateCustomerPricing` present in this baseline). If landing both lines of work in one session, apply this candidate on top of the landed model — the diffs are disjoint hunks but verify the base sha (`b70eaa38883d…`) matches before writing.
- On landing: re-run `node scripts/test-foundation-template.mjs` (repo-local, exercises `src/`); patch-path assertions are unaffected but the prior unit's harness expectations for `ai_engineering_data` verbatim round-trip become intentionally stale (see SPEC.json `followups_noted`).

**Claim window:** 2026-11-08 — task-scoped, released on handoff of SPEC.json.
