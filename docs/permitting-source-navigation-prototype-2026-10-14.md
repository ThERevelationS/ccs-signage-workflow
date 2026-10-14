# Linked saved source navigation — October 14, 2026

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3, Task 2 remains partial. Fixed progress counts unchanged.

## Functional batch

Saved requirement citations now offer Open saved source details when a source_document_id is present. Missing identifiers are explicit and existing official/archive links remain. Monitor Review documents passes its linked source id; monitors without one explain the gap and open ordinary browsing.

The jurisdiction workspace forwards a scoped request to DocumentRepositoryBrowser. It performs a read-only lookup by exact source id plus canonical jurisdiction_id, limit 1, selected metadata fields. Returned identity is checked again. No title, URL or name-only match substitutes for a missing/inaccessible/unlinked source. A selected source outside the latest-200 catalog list is included separately and the count text explains that additional record.

Selection resets filters, opens/highlights the retained record and focuses its heading. Repeat navigation reopens a collapsed selected card. Filter reset and source response can commit separately; focus waits for the selected card and runs once per request rather than hijacking later filter changes. Failed reads offer Retry linked source. Clear source selection returns to the regular catalog. Parent jurisdiction switching clears the request; late responses are ignored on selection change/unmount.

Opening a record does not prove historical citation bytes, current adoption or project applicability. The selection banner directs staff to compare its retained version against citation/monitor evidence. Existing review/approval handlers, rules, monitor alerts, archives, manual/pinned/hash evidence, PDF/search tools and job data remain unchanged.

## Verification

Actual parent JurisdictionDetailPanel, JurisdictionRequirements, SourceMonitorPanel and DocumentRepositoryBrowser ran together in synthetic Chromium with production CSS at 320, 390, 1280. All passed:
- requirement-to-source and monitor-to-source routing;
- identically titled newer/older source records and distinct archived URLs;
- source outside loaded list;
- filter reset, open/highlight/focus and repeat navigation;
- missing source ID, missing source record, wrong-jurisdiction response rejection;
- failure and retry, clear selection and ordinary document browsing;
- late response ignored after jurisdiction switch;
- canonical ID queries with bounded limits;
- no provider/AI calls, production writes, external requests or viewport overflow.

Existing document repository, saved requirements and source review browser suites also passed all three viewports. Four suites, twelve viewport scenarios total. Phone and desktop selected-source screenshots were visually inspected; footer buttons wrap within narrow source cards.

Targeted ESLint: zero errors, six preexisting parent warnings. Final production build verified exit 0. git diff --check passed. Existing baseline/Browserslist warnings remain.

The combined validation tool call timed out after browser receipts were written. Inspection confirmed fresh passing receipts for all four suites. Build status was then verified separately; no test/source writes were blindly repeated.

Receipts:
- docs/permitting-source-navigation-browser-2026-10-14.json
- docs/permitting-documents-browser-2026-10-14.json
- docs/permitting-requirements-browser-2026-10-14.json
- docs/permitting-source-review-browser-2026-10-14.json

## Boundaries and next

No production records, backend/schema, permissions, settings, dispatch or frontend publication changed. All fixtures are synthetic in-memory browser data. Concurrent CCS source changes preserved.

Authenticated employee/admin acceptance remains pending. Source links do not establish immutable citation version proof. Known PDF keyboard harness failures and Google address REQUEST_DENIED remain separate open items, not retested or claimed fixed.

Next meaningful functional batch: allow catalog-only retained PDFs to open in the existing in-app PDF viewer, with return to their selected source details, clear unavailable/loading/error states, safe links and existing PDF limits. Preserve profile PDF/search controls and authority gates; test phone/desktop synthetically without touching live jobs.
