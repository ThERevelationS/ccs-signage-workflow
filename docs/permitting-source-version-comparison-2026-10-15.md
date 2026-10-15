# Explicit saved source comparison

Phase 10, milestone 1; geographic reconciliation remains partial and authenticated read-only acceptance pending.

Added SourceVersionComparison to DocumentRepositoryBrowser. Two explicit distinct canonical source IDs from the loaded latest-200 catalog are required. Collected links and separately fetched linked records are excluded. Selectors remain independent of catalog filters. Jurisdiction and catalog refresh reset selections. Metadata includes exact IDs, retained URL/hash, raw recorded dates, classification/currentness/review, reviewer, office/scope and both supersession references. Missing/invalid hashes, identical normalized SHA-256 and differing SHA-256 are distinguished without authority or legal-change inference. Metadata comparison performs no calls, writes, AI or PDF fetches. Each exact-source panel now reuses the existing read-only saved-page viewer, so staff can open both panes and compare stored physical-page text. Each pane requests at most five pages, validates the returned record ID, archive URL and hash, and reports partial text/OCR warnings. Closed panes make no page-text request; no comparison result or legal-change inference is produced.

Validation: targeted ESLint passed; one production build completed; enhanced document catalog synthetic browser suite passed at 320/390/1280 including comparison identity, hashes, no extra reads, jurisdiction reset, overflow, existing catalog filters and saved-page tools. git diff --check passed. Initial synthetic assertions were corrected to wait for React rendering and account for the explicitly tested empty jurisdiction read. Receipt: docs/permitting-documents-browser-2026-10-14.json.

Validation for the comparison text panes: targeted ESLint and Vite production build passed. The hosted preview still displays “Preview is starting up” after the build; authenticated employee/admin and deployed endpoint acceptance remain blocked.

No frontend publication, backend/schema changes or production record mutations. Authenticated employee/admin browser acceptance and deployed source-page endpoint acceptance remain unverified.

Next: authenticated employee/admin browser and deployed source-page endpoint acceptance when the hosted preview is available. Until then, keep the preview blocker recorded and continue only bounded permitting-only improvements. Statewide expansion remains separate.
