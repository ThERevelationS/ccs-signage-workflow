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
