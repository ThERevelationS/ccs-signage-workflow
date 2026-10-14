# Sharonville explicit saved department discovery — 2026-10-14

Phase 10, Milestone 1 of 3, Task 2 remains partial. Two of four milestone tasks complete.

Implemented a distinct authenticated-admin selected_saved_document action in refreshJurisdiction. Exact saved ID/URL, profile ID/name/state/type/version, supported OH/KY identity, unprotected collection, duplicate identity/URL, bounded history and protected/archive/PDF checks precede fetch. Public URL validation precedes scan reporting writes; same-host redirect restriction precedes redirect connections. A fresh profile read precedes fetch and version-guarded persistence rejects concurrent edits. Existing original seed/frontier is retained; the separate one-page receipt is nested under discovery_scan_state.saved_document_scans and is not an automated backlog. Duplicate selected-source scans require review. Ordinary rescans retain their original eligibility guard.

UI: OfficialSourceRescans offers explicit saved-page selection through existing action progress. Frontend was not published. Authenticated browser acceptance remains pending.

Checks: 41 focused tests passed across permitting-saved-document-discovery, permitting-sharonville-guide-discovery and permitting-discovery-refresh. Build exit 0; existing baseline-browser-mapping/Browserslist warnings only. Diff check passed. Named deployed refreshJurisdiction pull in /tmp/permitting-selected-deployed matched repository bytes for entry.ts, permittingSavedDocumentDiscovery.mjs and permittingDiscoveryScan.mjs. No explicit deploy performed; sandbox resource autosync was observed. No exhaustive dependency comparison claimed.

One real normal-SDK authenticated-admin action:
profile 6ac19f0e23bd8a65822f6d51, Sharonville / OH / city.
selected ai_2026-10-04T00:36:39Z_4
https://www.sharonville.org/123/Building-Zoning-and-Planning
profile version before 2026-10-14T00:43:53.215000
receipt time 2026-10-14T01:05:24.573Z
profile version after 2026-10-14T01:05:24.788000
success true, attempted_pages 1, research_attempts 0, llm_calls 0, archival null.
12 harvested resources; saved collection increased from 4 to 15 because one URL already existed.
All four original document IDs, canonical permitting_url and every original frontier field were preserved exactly by fresh readback.
Nested receipt contains 11 pending page candidates and 3 external referrals; none were fetched or scheduled automatically.
Some candidates are general site navigation or unrelated referrals (MyAccount, civil service rules); these remain unverified discovery observations, not coverage or authority evidence.

Exact new guide document:
19bc3643-d404-4bcf-8cde-92c91897fd21
https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026
title Residential Permitting Guide; source official_page_harvest; doc_type other.
No PDF signature classification, upload, archive, catalog, office review or authority approval was performed.
Guide currentness, commercial signage scope and office delegation remain unverified.
No jobs, queue settings, permissions or office events changed.
Normal SDK identity verified brettheinlein1@gmail.com/admin; no privileged mode used.

Full live receipt: docs/official-evidence/ohio-sharonville-2026-10-07/saved-department-discovery-live-2026-10-14.json

Next single chunk: bounded archival of this exact saved guide, using existing manual selected-document and known_pdf receipt path with retained SHA-256/byte evidence and fresh readback/catalog reconciliation. Do not repeat department scan, infer authority, or fetch nested pending/external pages automatically.

Remote validation and an edit request timed out; fresh inspections confirmed the changes landed before continuing. Failed isolated npx --prefix pull made no repository changes; named pull succeeded after isolated node_modules symlink. Concurrent CCS work was preserved.
