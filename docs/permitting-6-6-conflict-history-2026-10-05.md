# 6.6 conflict and historical safeguards

Confirmed gaps: ordinary approval cleared conflicting_sources and material edits demoted it to under_review. Material edits also replaced historical status with needs_review. Shared approval now blocks conflicting_sources; the review handler preserves both explicit source conflicts and historical classification during material edits. Existing records and source evidence are preserved. Missing text/OCR, current-authority and literal-citation gates remain intact.

49 focused/compiled-handler tests, extraction/review bundles, full build and diff checks passed. Tests use fixtures/stubs, with zero actual AI calls or production record edits. A separate evidence-backed staff conflict-resolution workflow remains open under 6.8; ordinary edits/approval cannot resolve conflicts. Live/browser acceptance remains open. Next: 6.7 OH/KY supervised extraction acceptance. Phase 5 reconciliation and closeout remain open.
