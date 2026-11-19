# foundation-o119-notices — claim note

**Unit:** `foundation-o119-notices` — O-119 (CMP-I18): persistent "Preliminary estimating only - final engineering required" on generated structural concepts, client estimate notes, and handoff exports.
**App:** `68dfcc5e57bbbc35387da97c`, branch `main`, remote HEAD verified `8b0fcf92171373ea3dec071399f10e203135c00f` (clean).
**Mode:** LOCAL candidates only. No remote write / checkpoint / deploy performed or claimed.

## Files claimed by this unit (candidates)

- `src/components/estimator/foundation/foundationPreliminaryNotice.js` — NEW. `PRELIMINARY_NOTICE_TEXT` + `hasPreliminaryNotice` + `ensurePreliminaryNotice` + `PreliminaryNotice` component (role="status", never role="alert"; opt-in `dismissible` per view).
- `src/components/estimator/foundation/foundationTemplateModel.js` — `stampTemplateNotesNotice` wired at snapshot AND apply (idempotent preamble stamp; absent/null pass-through; non-string fails closed).
- `src/components/estimator/foundation/FoundationSectionBanner.jsx` — mounts `<PreliminaryNotice/>` as a collapse-proof sibling (persistent per concept; page needs zero edits).
- `src/components/estimator/foundation/FoundationTemplateDialog.jsx` — display-only save-mode disclosure + "Includes project notes" row indicator.
- `src/components/estimator/foundation/convertToBrickStone.js` — authored notes wrapped with `ensurePreliminaryNotice`.

## Files NOT claimed (explicitly out of scope)

- `src/pages/FoundationEstimator.jsx`, `foundationCalc.js`, `foundationReinforcement*`, `partSync.js`, `FoundationBOM.jsx` — Phase B-3/page owners. The page's single `prepareFoundationTemplatePatch` call site already exercises the stamp; BOM's print mount is a documented one-line remainder in SPEC.json.
- `FoundationProject.jsonc`, `FoundationSettings.jsx` — O-104 unit owns.
- `foundationAiReview.js`, `AiEngineeringAssistant.jsx` — AI-review channel already self-labels `preliminary_only`; stamping AI-authored markdown rejected (provenance).
- `foundationSellPricing.js`, `foundationTemplateService.js`, `foundationDraftRecovery.js`, `foundationAssemblyModel.js` — pulled for inspection/bundling only; no change needed.

## Deferred mounts (documented 1-line wiring remainders, SPEC.json `deferred_wiring_remainders`)

- `FoundationBOM.jsx` — `<PreliminaryNotice />` atop the print/BOM block.
- `FoundationEstimator.jsx` — `<PreliminaryNotice />` beside any future notes entry UI.
- Handoff/export text builders — append `PRELIMINARY_NOTICE_TEXT` / run authored text through `ensurePreliminaryNotice`.

## Concurrency

- No other agent/builder activity observed; remote worktree clean at pull time.
- Baselines are CRLF-normalized-to-LF copies of remote content at HEAD `8b0fcf921`; verify base shas (SPEC.json) before writing.
- On landing: the o007-templates verify suite + `scripts/test-foundation-template.mjs` may need a notes-allowlist exception (template notes now gain the preamble), same class of note as the O-007t followups.

**Claim window:** 2026-11-08 — task-scoped, released on handoff of SPEC.json.
