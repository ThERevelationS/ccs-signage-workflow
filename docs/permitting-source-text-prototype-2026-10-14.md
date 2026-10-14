# Permitting catalog physical-page text preview and search — October 14, 2026

**Phase:** 10 — Ohio/Kentucky coverage. **Milestone:** 1 of 3, identity and office reconciliation; Task 2 remains partial. Fixed Phase 10 completion counts are unchanged. This is a single functional prototype batch.

## Implementation

The saved document catalog now exposes **Inspect saved physical-page text** for canonical PermittingSourceDocument records that have a recorded archive URL, a valid SHA-256 archive fingerprint and a positive committed extraction cursor. It does not use title matching or profile-collected text as substitutes. Files with only collected URLs, missing fingerprint or no committed extraction cursor do not offer the action.

The new read-only **SourceTextEvidenceBrowser** consumes the existing staff-gated **getPermittingSourceTextPages** function. It requests **no more than five physical PDF pages** per action. Existing backend validation checks archive identity, source evidence and hashes, segment commitment, contiguous physical page ranges and source snapshot stability using caller RLS. The UI additionally rejects any response with a mismatched source record ID, archive SHA-256, retained archive URL, page identity or page sequence. A failed/ambiguous read reports a source-specific failure and offers retry; it never falls back to another version.

The UI shows physical PDF page numbers (distinct from printed page labels), saved page text, extraction method and truncated/OCR-review flags, committed extraction extent, and explicit partial/preview-only warnings. **Search applies only to the five currently loaded physical pages**, not all documents, unread segments, OCR evidence or the whole PDF. Results contain page labels and excerpts; missing text is never characterized as no permit required. Previous/next pages request the next bounded batch. Source changes, jurisdiction switches, new source-navigation requests or archive revisions reset the component. Delayed reads are ignored after unmount or replacement.

Existing catalog title/type/currentness filters, exact source navigation, retained PDF canvas preview, old profile PDF/search tools, classification and authority gates are unchanged. No new backend function, entity, dependency or schema.

## Synthetic browser verification

Harness: `scripts/test-permitting-documents-browser.mjs`. Actual parent/detail panel, catalog, text component and production CSS; synthetic canonical sources, mock read-only page endpoint and unrelated heavy-child stubs. Chromium at 320, 390 and 1280 pixels:

- No endpoint call before opening text.
- A request for source `saved-form`, physical pages 1–5; paginated request for pages 6–7, each with `page_count: 5`.
- Search `electrical` is absent in pages 1–5 but found on physical page 6 when that batch is loaded.
- Physical page 2 flagged truncated; page 7 flagged OCR-review; committed through 7 of 9 is described as partial.
- Mismatched source hash is rejected without displaying text, followed by successful retry.
- Rejected read is surfaced and successfully retried.
- Delayed page read after changing jurisdiction cannot display previous-jurisdiction text.
- Missing archive fingerprint/cursor does not offer the action.
- Existing catalog filtering, collected-source search/return focus, navigation, link safety, empty/failure/retry states and viewport overflow checks remain.
- No mocked production writes, background research or AI calls.

Screenshot captures at `/tmp/permitting-source-text-{320,390,1280}.png` are temporary test artifacts, not repository assets. Test receipt: `docs/permitting-documents-browser-2026-10-14.json`.

Independent regression suites for **exact source navigation** and **retained PDF canvas rendering** also passed all three viewport widths. Authenticated production employee/admin endpoint calls and real persisted segment records were **not** exercised. PDF text parser/archive authenticity and legislative currentness remain separate from this UI. Google address lookup REQUEST_DENIED remains unresolved. Production research settings not read or changed.

## Change and safety scope

Files: `src/components/permitting/SourceTextEvidenceBrowser.jsx`, `src/components/permitting/DocumentRepositoryBrowser.jsx`, existing synthetic catalog harness and documentation receipts. No frontend publication or backend deployment. No real permitting, customer, job, Order Form, Sales, Time Clock, SIPS, Fleet, Admin, or linked records updated. Shared permissions, archives, manual overrides, authority review and generation budgets preserved.

## Next chunk (not started)

Perform authenticated, read-only employee/admin acceptance of the existing saved-text endpoint and catalog against appropriately scoped real permitting source records. If authentication/corpus access is unavailable, isolate a meaningful next Permitting prototype UI batch from the roadmap without using protected client records. Verify cross-jurisdiction and archive-revision behavior with a real record before claiming production usability. Ohio and Kentucky statewide research and exact-address geocoding acceptance are still pending.
