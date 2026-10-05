# Phase 4.7 — Retained official HTML evidence

Completed for CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`) under authorized account `brettheinlein1@gmail.com`, October 4–5, 2026 UTC.

## Result

Official website evidence now has a native manual retention and citation path. The new immutable `PermittingHtmlEvidence` entity retains the complete original UTF-8 response bytes as base64, the source/final URLs, byte count and SHA-256, retrieval provenance, conservative static text and numbered HTML text blocks.

A new authenticated backend supports preview, capture, list/read, original-byte download and literal citations. Staff controls are prepared in the existing admin evidence panel. The frontend remains unpublished.

HTML text blocks are distinct from physical PDF pages. Capturing a website or validating a quote does not establish office responsibility, geographic scope or adopted law. Existing PDF authority reviews, regulatory rules and extraction routes remain unchanged.

## Persistence and bounds

- Only explicit manual capture is supported; no crawler, automated queue hook or AI call was added.
- HTTPS requests stay on the canonical profile's official website/permitting host. Redirects are validated and limited to three.
- Fetch timeout is 12 seconds; response maximum is 512,000 bytes. Static text is bounded to 80,000 characters, 1,000 blocks, 50,000 markup tokens and 200 nesting levels.
- Readers verify original byte count/hash and recompute the text projection/hash. Reads return at most five blocks. Quotes must be literal within one retained block and are limited to 1,000 characters.
- Each save reserves the profile's isolated `html_evidence_state` before creating an immutable record. A unique operation token prevents simultaneous same-request claim takeover. Lost acknowledgments reconcile exact retained evidence; missing uncertain creates are never repeated.
- Same-version captures reuse existing immutable evidence. Canonical identity changes yield distinct provenance. Original profile documents and authority receipts are preserved.
- Admins may capture; authenticated staff read through caller RLS. Evidence update/delete permissions are false.
- Raw HTML is never rendered or executed by the application. Original bytes can be downloaded as `.html.txt`.

The text projection is deliberately conservative: external CSS, scripts and linked pages are not evaluated. Navigation, header/footer and explicitly hidden/script content are excluded from text, while all original response bytes remain retained. Unsupported encoding or processing bounds stop capture safely.

## Bounded live verification

One Alexandria official zoning page was previewed and captured once through the authenticated Base44 editor's **preview-version function tester against production entities**.

- Profile: `6ac19ef89c23eb7c0fdbf6f1`
- HTML evidence: `6ac2f628a5e8d3e42019f3d7`
- Request: `ccs_alexandria_html_phase47_v1`
- Official/final URL: https://alexandriaky.gov/zoning-department/
- Original bytes: 165,415
- Original SHA-256: `5d3a32d3214b0b3e573f176bbd1fedbccfb782141001367fae26c245e640b904`
- Text SHA-256: `ec9498d7eeae84a675d02c00a656683d33be9309934cfae71bfa9d9a97668b2b`
- Status: `retained_unreviewed`
- Receipt: complete; committed readback confirmed.
- Native block 7 contains the city's explicit service statement. Persisted citation validation succeeded with block hash `0fb3ce7d03cf806807ba530e40ea35340e1d985f8eea8a830e4eb775eecb01e6` and `authority_established:false`.

The original response hash matches the complete HTML retained in Phase 4.6. Evidence count for Alexandria changed from zero to one. No authority review was created or changed.

New backend/schema resources synchronized through sandbox writes. This verification does not claim a separate production-version deployment. No project-wide deployment command or frontend publication occurred.

## Validation and preservation

91 focused tests passed: 27 new HTML tests and 64 existing office-authority, source-authority and archive-catalog regressions. Coverage includes original bytes, literal quotations, parser injection exclusions, tampering, lost receipts, uncertain creates, late reconciliation, simultaneous claims, canonical identity changes, host/redirect/size bounds, permissions and the retained Alexandria fixture.

Affected frontend ESLint passed. The affected backend bundle passed. One full `npm run build` passed near completion; only existing browser-data freshness warnings appeared. `git diff --check` passed.

Live before/after comparisons:
- Campbell County profile: entirely unchanged.
- Alexandria profile: only the isolated HTML receipt and updated timestamp changed; all original documents and office-authority receipts unchanged.
- Shared office catalog, automated research configuration and dispatch state: exact equality.

No production jobs/work orders were modified or used for testing. No LLM call, new binary upload or dispatch pause occurred. Concurrent Time Clock edits were preserved.

Machine-readable receipts and validation results: `docs/permitting-phase4-7-html-evidence-validation-2026-10-04.json`.

## Next coherent phase

Integrate native HTML citations into explicit office responsibility and scope review. Distinguish the website's publishing jurisdiction from a delegated responsible office, verify aliases/identity against current official evidence, and preserve immutable history and changed-evidence withdrawal. HTML retention alone must never authorize an office relationship.
