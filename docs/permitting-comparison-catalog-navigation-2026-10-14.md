# Compared source catalog navigation

Phase 10 — Ohio/Kentucky coverage, milestone 1. Geographic identity/office reconciliation remains partial; authenticated read-only acceptance remains pending.

Each explicitly compared canonical source now offers Open source 1/2 catalog details. Navigation validates the exact ID against the current loaded jurisdiction catalog, clears catalog search/type/currentness/availability filters, expands the exact source card and focuses its summary after rendering. Comparison selections remain intact. Pending navigation is bound to jurisdiction and refresh identity; no title/URL substitution. No additional source reads, page-text reads, PDF fetches, research, AI or writes are triggered by navigation. Existing citation navigation remains separate.

Source: src/components/permitting/SourceVersionComparison.jsx and DocumentRepositoryBrowser.jsx.

Validation: targeted ESLint passed; one production build passed; enhanced document browser synthetic tests and existing exact-source navigation synthetic tests passed at 320/390/1280 pixels; git diff --check passed. Both compared records were tested with all catalog filters hiding them; checks cover exact focus, expanded card, retained comparison IDs, cleared filters, touch target size, viewport overflow and no extra reads. Receipts: docs/permitting-documents-browser-2026-10-14.json and docs/permitting-source-navigation-browser-2026-10-14.json.

No backend/schema changes or frontend publication. No production record modifications. Authenticated employee/admin acceptance remains unverified.

Next meaningful chunk: add a return-to-comparison action from the opened source details with focus restored to the originating comparison button; preserve selection and exact citation navigation. If authenticated staff access becomes available, prioritize real read-only saved-text acceptance. Statewide expansion is separate.
