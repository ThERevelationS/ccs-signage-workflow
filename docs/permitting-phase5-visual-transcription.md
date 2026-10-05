# Phase 5 — Visual transcription candidates
Implemented 2026-10-05 in CCS Signage Workflow. This remains Phase 5 in the original 15-phase roadmap.

Scanned-page OCR can now be accompanied by selected visual transcription candidates, without replacing raw OCR, extracted PDF text, source approvals, or extraction completeness. The existing permittingSourceOcrEvidence handler adds:
- retain_transcription (admin): stable request_id, expected_updated_date, source_sha256, ocr_record_key, declared render receipt {sha256, method, width, height}, and one to five spans {text, kind, region_label, region}.
- read_transcription (staff): source_document_id and record_key.
- get_transcription_request (staff): source_document_id and request_id.
- cite_transcription (staff): source_document_id, record_key, span (1-based) and exact excerpt.

Regions use normalized [x,y,width,height] coordinates from the top-left of the physical page. Text is bounded to 1,000 characters per span. Kinds are instruction_excerpt or example_label, never adopted limits. A candidate has selected_excerpts_only coverage and pending_staff_review status. Input approval/coverage flags cannot promote it.

The candidate is bound to the archived PDF hash/URL/bytes, physical page, immutable OCR receipt hash, render declaration, region and text payload. The archive is downloaded/hash-verified and the actual gap page parsed again before one conditional append. Stale versions, concurrent OCR/text/pin/candidate edits, altered anchors, request reuse and unknown outcomes are guarded. An exact saved receipt can reconcile a lost response; no blind write retry is performed.

Five candidate receipts per source are allowed; each may hold up to five excerpts. Same-request readback and citations require no archive re-fetch or write. Staff reads use caller RLS. Original entity permissions remain unchanged.

The backend cannot prove that supplied render metadata is an image of this PDF or that a human approved the transcription. Accordingly candidates explicitly identify agent_visual_transcription and remain pending staff review. No auto-approval, ordinary page-reader substitution, structured-rule import, source-currentness promotion or real-job instruction changes are part of this chunk.

## Cincinnati evidence
Source 6ac3a54ac1ce2adba5b92cb8, physical page 1.
Original OCR receipt 5277569645f94e8f19aebabfbb712856086f256528aa6054cf2d9256a2ef51da.
Visual candidate a6add3d145891492c1b462243565b23576b9914a464230d447bf2b9449b93851.
Two instruction regions were inspected on the retained PDF render: top paragraph and bottom-left paragraph. Diagram dimensions are examples and remain outside the transcribed instruction evidence.
The live request readback and corrected-text citation passed; a fabricated dimensional excerpt was refused. Only ocr_transcriptions and updated_date changed on the catalog source. Raw OCR and all authority/currentness fields were preserved.
87 OCR/transcription/handler/runtime checks, backend bundle, build and diff checks passed. No frontend publication.

## Next
Finish Cincinnati sign/application applicability and office coverage review using retained official evidence. Keep the 24-hour PDF/48-hour HTML upload conflict unresolved. Visual candidates still need an explicit staff review decision before any downstream use as reviewed instructions.
