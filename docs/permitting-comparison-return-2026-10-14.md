# Source comparison round-trip navigation

Phase 10 — Ohio/Kentucky coverage, milestone 1. Geographic identity/office reconciliation remains partial. Authenticated employee/admin acceptance remains pending.

Source details opened from comparison now offer Return to source comparison. The action restores focus and scroll position to the originating exact comparison button while preserving selected records. If clearing/changing comparison removes that button, focus falls back to the comparison region. Return state is cleared on jurisdiction change, catalog refresh and new citation request. Only the last source opened from comparison receives the return action; unrelated collected links are excluded. No source/page-text reads, provider calls or writes are triggered.

Changed SourceVersionComparison.jsx and DocumentRepositoryBrowser.jsx. Expanded scripts/test-permitting-documents-browser.mjs with both originating-button returns, selection preservation, removed-origin fallback, jurisdiction reset, touch sizing and no-extra-read assertions.

Checks passed: targeted ESLint; one production build; document repository and exact source navigation synthetic browser suites at 320/390/1280; git diff --check. Existing receipts updated. A duplicate Clear comparison test step was removed after it timed out against the already-cleared disabled control; rerun passed. No product changes were needed after the build.

No frontend publication, backend/schema changes or production record mutations. Authenticated browser acceptance remains unverified.

Next meaningful batch: inspect office/electrical research presentation and build a consolidated role/gap overview with direct workspace navigation, using only saved evidence and explicit unknown states. Keep exact location/authority distinctions; no inferred office assignments or statewide expansion. If authenticated staff access becomes available, prioritize real read-only saved-text acceptance.
