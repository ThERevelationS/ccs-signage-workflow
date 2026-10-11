# Reusable Permitting Downloader — 2026-10-10

Phase 10, milestone 2 of 3. This batch improves shared discovery and download logic; no additional locality dossier was created.

## Current pipeline and remaining gaps

| Stage | Existing implementation | This batch / remaining work |
| --- | --- | --- |
| Discover official resources | Same-host static HTML links, relevance ranking, duplicate URL rejection | Added object, embed and iframe document references through the same gates. External CMS/CDN, code publisher and portal referrals still need an explicit provenance/scope path. |
| Continue discovery | Saved frontier, page/link offsets and change detection | Preserved; embedded references participate in the existing ordered resource snapshot. No complete-locality coverage claim. |
| Identify extensionless files | PDF MIME and five-byte signature probe | Preserved. Other extensionless formats and JavaScript-rendered forms remain gaps. An embedded PDF MIME attribute is not byte proof. |
| Collect original bytes | SSRF-safe fetch, byte/time budgets, source claim and upload receipt | Added shared format admission checks before upload. No guessed alternate paths or retries bypassing HTTP 403. |
| Verify retained originals | SHA-256 and byte-count storage readback | Added format checks during readback, including legacy uploaded receipt recovery. Word/Excel error pages cannot finalize merely because their hashes match. |
| Register documents | Stable catalog registration, independent retry, review-pending evidence | Preserved; no automatic regulatory approval. |
| Extract information | Existing verified-PDF text pipeline | No new Word/Excel content extraction in this batch. Format checks do not establish content completeness or legal authority. |

## Shared changes

- jurisdictionPermittingLinkDiscovery.mjs now discovers relevant same-host embedded documents, deduplicates them with ordinary links and excludes scripts/comments and off-host or credential-bearing destinations.
- permittingDocumentValidation.mjs supplies PDF signatures, legacy Office container signatures, DOCX/XLSX ZIP directory and package-subtype checks, and UTF-8 text/binary checks. HTML responses are rejected even when headers claim a document type.
- jurisdictionArchiveContinuation.mjs invokes validation before upload and during retained-byte verification, recording format, validation method, source content type and final source URL for new uploads.
- downloadPermitPDF/entry.ts uses the same admission checks while keeping its existing pinned-source fingerprint requirements.

These are container/signature admission checks, not complete Word/Excel parsing, decompression, malware inspection or a legal review. Unusual Office packages and non-UTF-8 text fail for review rather than receiving a false success receipt. Already completed archives are not rewritten.

## Verification

Four previously retained originals from Deer Park and Elmwood Place pass the validator and isolated download/upload/readback tests. Tests cover forged HTML, ZIP subtype mismatch, truncation, invalid directory offsets, embedded discovery scope/dedupe, direct backend rejection before upload and legacy receipt recovery. Existing archive concurrency, uncertain-upload, retry/backoff, catalog and extensionless-PDF tests remain in the focused suite.

No production records, files or dispatcher settings were changed by tests. No LLM calls, Integration uploads or live research jobs were invoked. Nothing published.

## Next coherent Downloader batch

Expose external resources linked directly by an official locality page as a provenance-bound referral inventory. Distinguish document CDN, delegated department, publisher and online form destinations. Preserve source-page and exact-link provenance; never infer regulatory authority from a shared hosting hostname. Then connect verified document-host scope to archival without loosening the existing SSRF or locality-identity checks.


## External referral inventory implemented after the initial batch

The shared scanner now captures external links in discovery_scan_state.external_referrals. This inventory is provenance-bound to its official page, resolution base, original href and page SHA-256. It does not populate JurisdictionProfile.documents or expand the same-host frontier. Category labels are hints, not host ownership or regulatory approval. Existing source, identity, version and manual-protection guards persist the cursor atomically.

Replay of retained Sharonville, Symmes Township and Cincinnati pages found 8 external references. No fresh network verification is claimed. The next implementation step is scoped direct-document retrieval, preserving source locality and redirect provenance, followed by original-byte archive validation and catalog registration. Review displays and automatic cross-host archival are not completed in this batch.


### 2026-10-10 — Shared external document archival
Phase 10, milestone 2 of 3 remains active. Connected manually selected saved external direct-document referrals to the shared archive worker. The official HTML page is rechecked for the exact link before staging and before a failed-source retry; original requests and redirects are limited to the selected source/document host. Durable upload receipts, stored-byte validation and catalog registration use the existing worker. Source-page provenance is preserved in the jurisdiction document schema and tied to jurisdiction identity. Authority and applicability remain unapproved.

Validation: 174 isolated automated tests passed, including 10 external archive-path and 4 actual scoped-fetch tests. Archive worker, backlog dispatcher and download handler backend bundles passed. No production test-record writes or publishing.

Remaining: expose selected external collection in the review UI, then connect explicitly scoped referrals to the opted-in automatic backlog. Portals and code publishers still require separate scope and review. This completes the shared backend unit, not Ohio/Kentucky coverage or the whole Downloader.


### 2026-10-10 — External document collection on locality details
Phase 10, milestone 2 of 3 remains active. Added the external referral review section to locality details: target and official source-page links, resource category, archive receipt status, admin-selected direct-document collection/retry, and 20-row pagination. Non-admins can review links; online forms and code publishers have no download action. Protected/changed-source profiles and uncertain upload receipts disable collection. Duplicate clicks are fenced, durable receipts reload after errors, and late responses cannot update a closed locality panel.

Corrected www-host normalization in the actual collection route. External documents now cannot enter the legacy generic manual or automatic original-download path; only the scoped referral helper authorizes their archive worker call. Automatic referral scheduling remains unfinished.

Validation: 184 focused downloader/backend/component tests passed, including compiled endpoint scope/admin/payload tests and rendered React interaction tests. Full Vite build, archive backend bundle and new-component lint passed. Separate PDF keyboard script: 9/12 passed, with the same three failures reproduced against the pre-change panel at Git 1e0f9b50 (stale source assertion/fixture assumptions); PDF behavior was not modified. Isolated mocked APIs only; no production record test writes, no publication. Live browser verification remains outstanding.

Next: connect explicitly scoped external referrals to opted-in automatic scheduling, retaining Ohio priority, credit limits and source rechecks. Overall jurisdiction coverage remains incomplete.


### 2026-10-10 — Scoped automatic external document recovery
Phase 10, milestone 2 of 3 remains active. Connected already selected external direct-document sources to both the scheduled research dispatcher and automatic archive endpoint. Only profiles with auto_refresh exactly true may resume these sources. New, unselected referrals remain review-only. Ohio original-file work (regular and external) is checked before Kentucky original-file work, with bounded 20-profile queries and one original-file archive attempt per cycle. Catalog registration continues separately.

Recovery uses the same scoped original/source-page fetcher as manual collection; source retries recheck the exact official link. Durable archive receipts enforce backoff, active leases and three total source attempts. Uploaded receipts resume storage verification without refetch or reupload. Every external archive transition checks automatic-refresh opt-out; an opt-out during fetch blocks upload. Manual recovery remains available and clears the automatic-only guard. Authority and applicability stay unapproved. The existing research cycle and credit configuration were not changed, and isolated dispatcher tests cover continuation at the daily LLM cap.

Validation: 202 focused automated tests passed; automatic archive and scheduled dispatcher backend bundles passed; Git whitespace check passed. No live collection cycle or production test writes were run; nothing published. Existing PDF keyboard harness failures from the previous entry remain outside this backend change.

Next: durable first-attempt records and bounded failure/backoff tracking for newly discovered external referrals before automatic initial collection. Live browser verification and overall Ohio/Kentucky coverage remain incomplete.


### 2026-10-10 — Automatic first-time external document collection
Phase 10, milestone 2 of 3 remains active. Added bounded first-time collection of saved external direct-document referrals to the shared automatic archive backlog. Eligibility requires auto_refresh exactly true, OH/KY scope, current official discovery source and unprotected documents. Ohio regular/recovery/initial original-file work is checked before Kentucky. Each branch scans at most 20 profiles; one original-file attempt returns control to the existing dispatcher. Online forms, code publishers and department pages do not enter this path.

Automatic initial staging persists the observed source-page provenance and a stable document identity before network work. It does not claim that the page has been rechecked. The archive worker then claims the source, rechecks the exact official link, and saves the current page hash/time in archive_state.source_link_recheck before upload. A missing recheck receipt blocks upload. Official-page failures and removed links now produce durable failure receipts/backoff instead of repeating a fresh initial attempt. Existing retry caps, scoped redirects, upload receipt recovery and byte verification are reused. Concurrent initial attempts cannot duplicate the source or upload. Authority and applicability remain unapproved.

The saved discovery cursor records when its direct-document initial inventory is drained. This removes completed inventories from the initial backlog and preserves existing manual/AI document identities. Each fresh official scan resets the marker so new referrals can be considered. Cursor updates retain version and document/opt-out/source guards.

Validation: 210 isolated automated tests passed; archive endpoint, research dispatcher and refresh backend bundles passed; Git whitespace check passed. No live scheduled cycle, production test-record writes or publication.

Next: live browser verification and a controlled real scheduled-cycle check, then assess remaining Downloader coverage gaps. Ohio/Kentucky locality coverage and the overall Permitting project remain incomplete.


### 2026-10-10 — Downloader Chromium verification and live readiness
Phase 10, milestone 2 of 3 remains active. Added a reusable real-Chromium acceptance harness for the actual external referral component with production CSS. All 8 checks passed: 320/390/1280-pixel layouts and source links; keyboard collection and duplicate fencing; reader/protected/uncertain-receipt controls; lost-acknowledgement reload and retry; locality-switch response isolation; pagination retaining later referrals. Harness APIs are synthetic and outside network requests are blocked. Saved evidence: permitting-external-referral-browser-verification-2026-10-10.json. Full app build passed before browser checks.

Read-only live readiness inspection verified enabled dispatcher settings: 15-minute interval, 5 research dispatches/cycle, 20 in flight, 40/day, 3 retries. Saved research state reported 40 dispatched today and last_cycle_at 2026-10-10T07:01:52.155Z. This timestamp alone does not establish a stalled scheduler: the current daily-cap continuation branch returns without updating research state. The last recorded backlog count of 1187 is historical, not a fresh backlog count.

Live OH/KY query returned zero explicitly enabled profiles containing a downloadable_document external referral. Therefore a real external collection cycle was not executed or claimed. The available browser had only about:blank; the current Base44 connector does not expose backend function invocation. No artificial production records, opt-in changes, publication or production test writes. Saved readiness evidence: permitting-downloader-live-readiness-2026-10-10.json.

Next: obtain a real eligible direct-document referral through normal discovery and verify its scheduled collection receipt, then assess remaining Downloader coverage gaps. Authenticated production-browser verification remains distinct from the completed isolated Chromium acceptance checks.


### 2026-10-10 — Independent collection-cycle receipts and visibility
Phase 10, milestone 2 of 3 remains active. Added an independent collection_cycle receipt inside the existing dispatcher state. Scheduled collection claims that state with updated_date CAS before discovery/archive/text work, saves a token and five-minute lease, and persists bounded stage outcomes and completion time afterward. The collection interval uses its own started_at, so daily-credit-cap returns no longer leave collection invisible or permit immediate repeated scans from a stale research timestamp. Active claims suppress concurrent work; an expired claim can resume after the configured interval, and an old owner cannot overwrite the newer receipt. Missing dispatcher state skips collection until normal research initializes it, avoiding a new singleton-creation race. Lost claim acknowledgements reconcile the same token rather than repeating the claim.

Receipt writes preserve current research counters and unrelated state fields. Dispatcher research eligibility is recalculated after collection using refreshed state. Normal research state writes preserve collection metadata. Discovery/archive/text failures are independently recorded; catalog errors remain visible in the archive summary. This does not change dispatch credit configuration or authorize broader collection scope.

Permitting research settings now show Last AI research cycle separately from document collection start/finish and per-stage outcomes. Interrupted/expired leases and stage errors remain visible; a completed cycle explicitly does not establish locality coverage.

Validation: 221 isolated automated tests passed, including collection ownership, concurrency, lost acknowledgements, counter preservation, interval suppression at the daily cap and rendered receipt UI. Full app build, dispatcher bundle, targeted UI lint and Git whitespace checks passed. No production dispatcher invocation, test-record writes or publication.

Next: verify the first real saved collection_cycle receipt from scheduled operation when an authenticated invocation/production session is available, then resolve remaining Downloader coverage gaps. Prior isolated Chromium checks remain valid; this receipt UI has rendered component/build verification, not a new production-browser check.
