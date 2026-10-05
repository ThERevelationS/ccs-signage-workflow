# Phase 5 — Retained OCR evidence
Implemented 2026-10-05 in CCS Signage Workflow. Original canonical roadmap phase 5: official-source collection and verified archives.

The permittingSourceOcrEvidence backend supports explicit admin retention and staff reads for administrator-supplied OCR from an already verified PDF archive. It does not run OCR or call an LLM. The offline Tesseract result for Cincinnati site-plan page 1 is now retained in the app under its original SHA-256 and physical page.

## Contract
- preview: source_document_id → current source version, archive hash, known OCR gaps and record limits. Admin only.
- retain: source_document_id, request_id (16–100 letters/digits/_/-), expected_updated_date, source_sha256, page, text (up to 30,000 characters), method, extracted_at. Admin only.
- read: source_document_id and record_key. Staff caller RLS.
- get_request: source_document_id and request_id. Receipt readback without another write.
- cite: source_document_id, record_key and exact excerpt (up to 1,000 characters). Always evidence_kind unreviewed_ocr and authority_established false.

Retention re-fetches and hashes the stored archive and parses the physical page to confirm that the recorded OCR gap is real. It supports inline catalog gap pages only, not segmented gap pages. Five retained records per source are allowed. Supplied method/date are provenance labels; the backend does not claim it reran Tesseract or inspected the diagram.

Records are append-only through this handler, with request, payload, text and record integrity hashes, server retention date and authenticated actor. Same request/payload/actor reconciles without another parse or write. Changed payloads cannot reuse the request ID. One conditional update writes the isolated OCR array; stale versions and concurrent text/archive/pin/receipt edits are preserved. Unknown outcomes reconcile by one read, never a blind write retry. Existing entity admin RLS remains unchanged.

Neither extracted_text nor extracted_pages, text_extraction_state, authority_review, source currency or staff approval fields are changed. The ordinary page reader/structured extraction never automatically substitute this OCR. Full-document completeness remains false when PDF operator extraction is incomplete.

## Live verification
Cincinnati source: 6ac3a54ac1ce2adba5b92cb8; physical page 1.
Request: cincinnati-site-plan-ocr-20261005-v1.
Record: 5277569645f94e8f19aebabfbb712856086f256528aa6054cf2d9256a2ef51da.
OCR text SHA-256: 34409310cee5dba28ea317fde73bf4df26fdf3378996eb0b68695e5e36d2f26e.
Signed-in editor preview, retention, get_request, exact citation and fabricated citation rejection were checked. New function registration required one editor refresh. Only ocr_evidence and updated_date changed on the catalog source. Source still needs_ocr; receipt is unreviewed. Printed diagram dimensions are labelled examples and must not become regulatory limits.

44 OCR/handler checks passed, along with 41 source text/runtime regressions (85 total). Backend bundle and build passed. Concurrent Time Clock changes were preserved. No frontend publication was requested or performed.

## Remaining
Add version-bound visual transcription/review evidence before considering any OCR excerpt reviewed. Diagram errors remain visible and unresolved. Keep the Cincinnati electronic guide's 24-hour PDF/48-hour HTML conflict unresolved; office authority and applicability remain source-specific decisions. Extend segmented OCR support only with its own physical-page provenance checks.
