# Document availability filters — October 14, 2026

Phase 10 — Ohio/Kentucky coverage, Milestone 1 identity and office reconciliation. Task 2 remains partial and authenticated acceptance remains pending. Roadmap completion counts unchanged.

The saved document repository now filters loaded entries by saved physical-page text, retained copy URL, missing retained copy URL, or recorded OCR review need. Counts cover loaded entries only and combine with title/type/currentness filters. Source selection, jurisdiction/refresh changes and return from PDF reset the availability filter consistently with existing filters. Version records remain separate. Filtering makes no text, research, AI or write calls.

The saved-text availability predicate is shared with SourceTextEvidenceBrowser to keep the filter and viewer eligibility consistent: canonical record ID, valid archive hash, retained HTTP(S) URL, positive integer committed cursor. This is metadata eligibility only, not successful endpoint permission or verified bytes. Retained URL availability does not assert fetch success; OCR flags do not establish source authority.

Validation: targeted ESLint and one production build completed before the catalog harness in the sequential validation chain; catalog receipt confirms all three scenarios passed at 320, 390 and 1280 pixels. The combined tool call later timed out, so receipts were inspected and remaining navigation/PDF checks were run separately. Exact-source navigation and retained PDF harnesses each passed at 320, 390 and 1280 pixels. git diff --check passed. Receipts: permitting-documents-browser-2026-10-14.json, permitting-source-navigation-browser-2026-10-14.json, permitting-source-pdf-browser-2026-10-14.json. Synthetic data only; no authenticated real-record acceptance claimed.

New concurrent Order Form and Time Clock changes were preserved; inspected Permitting target diff contains only this batch. No backend/schema/package/permission changes, deployment, frontend publication or production record writes. No unfinished feature writes.

Staff-session acceptance remains blocked by lack of an authenticated browser session/function invocation capability in the available connector surface; no repeated CLI login attempt. Next meaningful chunk: document source-version comparison, showing exact archive/revision differences without inferring supersession or authority, unless an authenticated staff session becomes available first.
