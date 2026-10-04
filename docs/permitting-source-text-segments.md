# Segmented permitting PDF page evidence

Phase 3.2 completed 2026-10-04 in CCS Signage Workflow (68dfcc5e57bbbc35387da97c). Live verification is recorded in permitting-source-text-segments-live-verification-2026-10-04.json. This extends the Phase 3.1 text worker without replacing existing source text or authority review.

## Storage and progression

The first extraction batch remains in PermittingSourceDocument.extracted_pages and extracted_text. Existing inline pages, including reviewed text, are preserved. Once a source has an initial five-page batch, subsequent work creates one PermittingSourceTextSegment containing at most five physical PDF pages. No whole-document character ceiling applies to segmented storage. The 50,000-character per-page bound and 10 MiB / 12-second archive and parsing bounds remain.

Each segment retains the source record ID, exact archive URL/hash/bytes, parser method, physical page range, total PDF page count, original page text/hash/extraction time, and OCR/truncation flags. Its payload hash uses canonical sorted JSON, so server key ordering cannot alter identity. The entity is append-only in worker behavior; ordinary client updates/deletes are denied by RLS. Staff can read it using the same admin/user roles as the source catalog.

The parent source keeps a fixed-size cursor receipt: inline count, committed page count, next page, segment count, last committed segment identity, and optional pending create intent. Original inline pages/text do not grow as later batches are saved. The compatibility text is explicitly marked inline_preview / preview_only after segmented pages are attached. Completion refers to all committed evidence pages, not the compatibility preview. OCR/truncation counts retain explicit gaps; representative gap-page lists are capped at 100 without capping total document coverage.

The existing dispatcher still performs at most one text source / five pages per scheduled cycle, independently of research LLM credit availability. It continues at the daily research cap. No new LLM, upload, OCR, or regulatory-inference call is introduced. Manual selected-source work remains exempt from automatic retry/backoff and research credit caps, while ownership, pinned evidence, archive identity, and bounded processing protections remain.

## Safe writes and recovery

A conditional source lease precedes parsing. A durable pending segment identity/hash/range is saved before the non-idempotent segment create. One exact matching record must be read back and its complete payload/page hashes validated before the source cursor advances.

Lost create acknowledgements are reconciled once against the saved identity. Unknown creates with no matching record become segment_uncertain and are excluded from automatic retries. Explicit manual recovery reconciles an existing delayed record; it never recreates an uncertain missing segment or reparses its pages. Duplicate/conflicting records and orphan evidence remain retained for review.

An expired pending lease also reconciles rather than creating again. The previous committed segment is verified before another batch is parsed. Source versioned writes protect unrelated concurrent notes, archive changes, pins, and reviewer edits. The converged-receipt check now also verifies the retained text/page snapshot before allowing later writes.

Automatic profile protection and exact profile/archive/catalog linkage are checked before work, before segment creation, and before attachment. A race may retain an orphan segment, but cannot advance a changed or protected source cursor.

## Bounded source/page reading

getPermittingSourceTextPages accepts a source_document_id and one to five physical PDF pages. It uses caller RLS, never service-role reads, and returns the exact archive snapshot and original authority/review metadata. It combines the preserved preview with overlapping committed segments, validates page and payload hashes, rejects missing/overlapping evidence, and excludes pending/uncommitted records. A second source read prevents returning a stale snapshot after a concurrent replacement.

This provides the page evidence needed for future literal excerpt validation. It does not interpret page text as current adopted law.

The legacy permittingRuleExtraction route now explicitly excludes managed partial text and segmented previews. Its older SDK pagination/caller defects are not repaired in this phase and it was not invoked. Structured-rule extraction must be repaired as a separate coherent phase before operational use.

## Live acceptance

Batavia catalog source 6ac25879c6eeff85438f9ba6 retains a 179-page code archive. The live continuation saved physical pages 6–10 in segment 6ac2711a03041cfb9f5dde02 and advanced the cursor to page 11. All five initial inline pages/text and every other source field remained unchanged. Adoption remains unknown_review_required / content unknown / needs_verification. A page read spanning physical pages 4–8 verified the preview/segment boundary without another file fetch.

Manual acceptance executed the exact current core helper with authenticated Base44 entity adapters and the actual remote Deno PDF runtime. The orchestration host lacks Web Crypto/TextEncoder; a UTF-8 encoder plus Python standard-library SHA-256 supplied test-only hashing, matching all original parser page hashes. This was not a direct backend HTTP invocation. Compiled admin/staff handlers and dispatcher integration were validated separately. Resource files auto-sync through the Base44 sandbox; the new entity schema was confirmed live. An actual post-change scheduled segment invocation was not observed during the acceptance window.

The first acceptance harness incorrectly treated PDF.js warning lines on stdout as JSON. It stored one known failed receipt, created no segment, and preserved the preview/archive. After inspecting that receipt, one corrected explicit manual retry used a uniquely framed JSON result. Both attempts made zero LLM calls/uploads. The successful core/persistence pass took about 14.8 seconds, and the readback/verification about 16.8 seconds in total. No blind create/deploy retry occurred.

Automatic research was paused with conditional versioned updates and restored after each attempt. The config is enabled, 15 minutes / 5 research per cycle / 20 in flight / 40 attempts per day / retry 3. The research dispatch state and counter of 40 are exactly unchanged.

Boone's 36 profile documents and 48 entire catalog records, Batavia's four profile documents, and Morrow/Campbell completed source text records compare exactly equal before/after. No original source/archive was removed or replaced, and no rule, real job, work-order record, or frontend publication was changed by this phase. Concurrent unrelated Git work was retained.

## Validation and remaining dependencies

147 targeted tests pass: continuation, >500,000 total characters, canonical payload ordering, page hashes, duplicate/conflicting records, late/unknown creates, lost receipts, leases, staff edits, protection races, preview preservation, OCR/truncation progression, bounded caller-RLS reads, compiled manual worker wiring, dispatcher credit isolation, archive/catalog/discovery/Boone regression coverage. Four affected backend bundles, targeted helper lint, git diff --check, and one full npm run build pass. Existing browser-data warnings remain non-blocking.

Next: Phase 3.3 — repair structured-rule extraction around selected source/page evidence. Fix real SDK array pagination/callers; validate exact literal excerpts, page numbers and snapshot hashes; make completeness/gaps and authority scope explicit; preserve staff approval and uncertain/draft/historical protections. Do not launch a jurisdiction-wide LLM batch.

Later gaps: archives exceeding the current 10 MiB processing bound; OCR/truncated-page follow-up; source monitoring must separate observed official-source hashes from retained archive hashes. Existing evidence stays retained until those targeted capabilities are implemented.
