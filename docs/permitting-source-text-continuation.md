# Bounded permitting PDF text extraction

Implemented 2026-10-04 as Phase 3.1 in CCS Signage Workflow. Live and regression evidence is recorded in permitting-source-text-live-verification-2026-10-04.json.

## Pipeline

The existing 15-minute research dispatcher runs one bounded text-continuation step after known-file archival and evidence-catalog registration. Each invocation selects at most one catalog source and processes at most five physical PDF pages. Text extraction makes no Base44 LLM or extraction-integration calls. It continues even when automated research has exhausted its daily credit cap.

The PDF runtime is dynamically loaded inside an isolated try/catch. Loading, parsing, or backlog failures cannot prevent a credit-capped dispatcher response or launch extra research. The shared automatic pause also stops text continuation.

The admin endpoint continuePermittingSourceText accepts either automatic: true (selects its own backlog) or a stable source_document_id (explicit manual work). Manual work is available during the automatic pause and is exempt from automatic failure backoff/retry caps. Existing protected text, source identity, and integrity checks always remain enforced. No frontend action was added or published.

## Deterministic extraction and provenance

The runtime uses the already installed pdfjs-dist 4.8.69 dependency, without changing package declarations. Deno runtime extraction was verified. It reads only text operators, disables evaluated font code, and does not render, run PDF scripts, OCR, or infer regulatory facts.

Before parsing, the stored archive is fetched once and must match the catalog snapshot's SHA-256 and byte count. HTML, non-PDF bytes, changed hashes, and oversized files fail safely.

Every extracted page retains the physical PDF page number, source-document ID, exact archive SHA-256, text SHA-256, parser method, extraction time, and truncation/OCR-review flags. The compatibility extracted_text field includes source/hash/page markers. Physical PDF page numbers may differ from printed section/page labels.

Page progression is derived from the durable extracted_pages sequence. A long document resumes from the next saved page. A conditional versioned catalog write atomically saves page text, compatibility text, and the cursor. Lost acknowledgements are checked against the saved receipt. A conflicting staff edit, pinned text, or replaced archive prevents stale attachment.

Successful parsing does not change content_status, authority_classification, authority_confidence, verification_status, reviewer, effective date, jurisdiction scope, or derived_facts. No PermittingRule rows or active job workflows are created or modified.

## Processing bounds and gaps

- One source and five pages per invocation; automatic candidate scan is 20 source records.
- 10 MiB archive read limit; 12 seconds for fetch/read and 12 seconds for parse work.
- At most 50,000 text characters per page and 500,000 compatibility text characters per source.
- 90-second extraction lease; automatic transient failures have increasing hourly backoff and stop after three failures.
- Larger documents and invalid/mismatched archives retain a blocked receipt and their source/archive evidence.
- Truncated text produces partial_limit rather than a false completeness claim.
- Blank or very short pages retain page provenance and produce needs_ocr review after the page pass. A blank page may be intentional; no automatic OCR certainty is asserted.
- Existing unowned/manual searchable text is preserved. Newly registered automated sources can continue automatically; legacy sources require an explicit selected manual target.
- Automatic work also checks the linked JurisdictionProfile for opt-out/manual/pinned protections and exact matching archive/catalog identity before parsing and before attachment.

These are processing-rate/storage bounds, not total jurisdiction or document-coverage ceilings. Source documents are never removed because extraction cannot finish.

## Verification

Focused tests cover seven-page PDF continuation, real parser text and hashes, fake HTML/PDF failures, concurrency, lost acknowledgements, staff edits, stale archive identity, pinned text, opt-out protection, OCR gaps, truncation, automatic retry limits, admin authorization, manual work during automatic pause, and isolated dispatcher failures. The complete permitting regression set passes 122 tests, including a fresh bundled runtime with a deliberately missing relative worker file.

Morrow's variance form (catalog 6ac2593367c75c73d83cf39b) completed a two-page extraction with the real Deno runtime and connected Base44 persistence tools. Source/authority fields, original archives, all 16 Morrow profile documents, and all 36 Boone profile documents were preserved. Boone's 48 catalog evidence records were also unchanged. The automated research counter remained 40 and the prior enabled state was restored.

A first acceptance harness mistakenly passed the Deno script on stdin rather than as the required eval code argument. It saved a known failed receipt without text or uploads. After inspecting the cause, one corrected explicit manual attempt succeeded. No blind upload/deploy/research retry was made.

The sandbox Base44 CLI session was already expired before this phase. No CLI reauthentication or cross-app token architecture was used. Live manual acceptance executed the exact core helper through authenticated entity tools, with the actual Deno runtime for the file parsing. The admin backend route was tested as a compiled handler. Scheduled backend observations are recorded separately in the JSON evidence. The first deployed scheduled attempt exposed a missing relative pdf.worker.mjs module. The runtime now explicitly imports/preloads WorkerMessageHandler, which passed both real Deno and fresh bundled-runtime regressions with an intentionally invalid worker path. A selected Batavia recovery then saved five pages of its 179-page code and left page six pending, without promoting its unknown adoption status.

## Next dependency

Phase 3.2: inspect and repair the existing structured-rule extraction callers/SDK pagination before using them with the new text. Introduce segmented page persistence for long codes that exceed the per-source text bound; the full archive remains retained and partial text must never masquerade as a full-code review. Add source/page/excerpt validation, archive snapshot identity, explicit completeness/gap context, and authority review gates. Do not interpret searchable text as adopted law or launch uncontrolled LLM batches. Source monitoring must distinguish the retained archive snapshot hash from the newly observed official-source hash.
