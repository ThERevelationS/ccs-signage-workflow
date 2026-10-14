# Document repository browsing and source details — October 14, 2026

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3, Task 2 partial. Fixed progress counts unchanged.

## Functional change

Documents now contains a read-only source catalog spanning canonical PermittingSourceDocument records and profile collected links. Employees can search titles/types/offices/scopes/gaps, browse document types, and filter recorded currentness versus unknown or draft/historical context. Saved classification, currentness and human review remain distinct. Draft/proposed/rewrite/historical/superseded context overrides a stale current flag in browsing groups.

Expanded source cards show issuing office, geographic scope, reviewer, effective/adopted date, revision date, collection/check/change dates, notes/gaps, extraction processing state, saved archive fingerprint and byte count. Missing official links, retained copy URLs, classifications and dates remain explicit. Safe HTTP(S) links expose official sources, separate portals and retained copies. Extraction and collection never imply authority or approve requirements.

Source versions are not merged by title or locality name. Existing profile search/PDF tools are offered only where an explicit original profile-document id and identical archive URL match, or where neither record has an archive and the exact official URL matches. Different retained versions stay separate. Matching establishes access to the same recorded URL, not a fresh byte verification. Source-only versions keep their own retained-copy/official links.

Read scope is canonical jurisdiction_id only, latest 200 source records with selected metadata fields; no name-only promotion and no bulk extracted-text reads. Late responses are ignored on switch/unmount. Failed reads preserve collected links and expose classification unavailability. Refresh retries read-only data. Catalog actions focus existing collected headings, including repeated clicks on an already expanded document, and navigate to Requirements/Monitoring.

The original document/PDF/search surfaces remain. Collected date rendering handles invalid timestamps. Missing file text distinguishes online sources from archive gaps. AI summary labels explicitly remain unverified.

## Validation

- Live schema readback inspected for PermittingSourceDocument; selected permitting-only metadata sample read without mutation.
- Actual DocumentRepositoryBrowser and JurisdictionDetailPanel in synthetic Chromium at 320, 390, 1280 widths: all passed. Production CSS, unrelated heavy children stubbed, external requests blocked.
- Verified document-type and currentness filters, draft precedence over stale currentness, separate versions, official/archive/portal links, unknown/repository-only archives, invalid dates, recorded extraction state and zero byte metadata, search/no-match, failed read/retry, jurisdiction switch/empty, canonical query/limit, existing text search and repeat focus, Requirements/Monitoring navigation, no provider calls/writes, no horizontal overflow.
- Existing jurisdiction workspace harness: 320/390/1280 passed after adding an empty synthetic source read.
- Phone/desktop screenshots visually inspected.
- Targeted ESLint: zero errors, six existing parent warnings.
- One production build exited zero; existing Browserslist/baseline data warnings.
- git diff --check passed.

Receipts: docs/permitting-documents-browser-2026-10-14.json and docs/permitting-workspace-browser-2026-10-14.json.
Harness: scripts/test-permitting-documents-browser.mjs.

## Boundaries and remaining checks

No production client/job/permitting writes, backend/schema/permission changes, settings changes, dispatcher changes or frontend publication. Synthetic catalog fixtures exist only in the browser harness. Archives/manual/pinned/hashes and authority handlers untouched.

Authenticated production employee/admin source reads and full in-app PDF acceptance remain unverified. Existing PDF keyboard harness failures were not rerun or claimed fixed. Google geocoding REQUEST_DENIED remains the separate known blocker.

Next functional chunk: integrate selected-source navigation from requirement citations and monitoring into this catalog so staff can open the exact saved source version directly. Preserve canonical scope, missing/unlinked states, and authority boundaries. Later authenticated acceptance, coverage and job integration remain open.
