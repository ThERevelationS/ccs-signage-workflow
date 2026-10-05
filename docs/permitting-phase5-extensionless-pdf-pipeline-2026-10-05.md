# Phase 5 — extensionless PDF discovery and archive handoff

This is a reusable scanner improvement. No production locality, job, source-review, queue or dispatcher-settings records were changed for verification. No new LLM calls or production file uploads were performed.

## Completed behavior

The shared response reader distinguishes static HTML from application/pdf and checks the PDF signature even when the URL lacks a file extension. PDF probing reads only the signature, cancels the response body, and returns a URL-bound routing hint. It does not claim that the complete document is downloaded, readable, current, or authoritative.

The discovery scanner retains that classification on the source document. Refresh preserves it in the document collection. Both immediate archive selection and the scheduled archive backlog can select a classified extensionless PDF. The archive worker checks its canonical official host and redirect, rechecks PDF MIME and signature, uploads the full bytes with a PDF filename/type, and compares source/stored hashes and byte counts. Existing catalog registration and PDF extraction can then continue normally.

Manual/pinned/archive-pinned collections, active leases, retry backoff, uncertain uploads, concurrent source/classification changes and existing file/hash receipts remain protected. Classification changes cannot silently replace an archive-in-progress. This does not alter automated research budgets or introduce a manual research quota. External-host PDFs need separately reviewed scope.

## Verification

94 targeted tests passed. The isolated pipeline test uses in-memory entity adapters and a real generated PDF with the existing PDF.js extraction path. It verifies extensionless link discovery → PDF classification → verified upload/readback → one catalog registration → page text extraction. Evidence remains needs_verification with unknown currentness; no rules are approved. Repeat delivery cannot upload again.

Other checks cover false MIME claims, truncated signatures, HTML substitution, unsupported content types, split response streams, HTML byte limits, off-host redirects, URL-bound hints, concurrent classification replacement, pinned/manual records, lost upload acknowledgment and readback-only retry.

Affected refreshJurisdiction, continueJurisdictionArchives and permittingResearchBacklogDispatch backend bundles passed. npm run build returned zero and generated a fresh dist/index.html. git diff --check passed. The schema addition is only documents[].resource_classification; RLS and existing schema fields are unchanged.

## Remaining progression

Durable cross-run discovery frontier is next. The worker currently returns pending pages but does not persist its traversal cursor. Then run supervised acceptance across varied Ohio/Kentucky website patterns, covering discovery through review-ready evidence. HTML capture, external department/portal referrals, other document formats, OCR and requirement extraction retain their separate gaps and review gates. Phase 5 is not complete.
