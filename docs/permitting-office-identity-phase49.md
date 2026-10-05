# Phase 4.9 — Cincinnati office identities

The existing shared Buildings & Inspections office is now identity verified against the retained official department, contact and Permit Center pages. Its shared customer-service email is corrected to ccpbpermitcenter@cincinnati-oh.gov. Its stable ID, name, type, notes and five workflow steps are preserved.

City of Cincinnati Department of City Planning and Engagement is registered separately as office-cincinnati-planning-engagement-oh. Official department contact: (513) 352-4845, planning@cincinnati-oh.gov, 805 Central Avenue, Suite 720, Cincinnati, OH 45202. The separately listed zoning contact is retained in the review evidence and notes. No permit type or workflow was invented for this office.

Both identity reviews explicitly record Codex acting under the user's authorization, the original identity, current identity, literal source quotes and hash-bound original page provenance. These are point-in-time identity reviews. Permit roles, jurisdiction coverage, source ownership/currentness, adopted law and job-address authority still require their separate reviews.

## Retention and safe persistence

Seven original official HTML pages, their deterministic text projections, and two original official PDFs are retained in docs/official-evidence/cincinnati-2026-10-05. The manifest records exact URLs, final URLs, retrieval times, hashes, byte counts and unreviewed PDF status. Capture used bounded explicit links, 12-second fetch deadlines, official-host redirect restrictions, and no LLM. The capture script refuses to overwrite existing originals. Source bytes are excluded from Git line-ending transformation.

The sign handout and outdoor-advertising application are Git-backed originals, not yet completed Base44 storage/catalog archives. They are distinct sources; the outdoor-advertising application is not assigned to every business sign. The relocation notice is retained as dated historical evidence, without converting its older instructions into current requirements.

The first narrow nested-array push request returned a field-type rejection. A single readback confirmed the catalog was entirely unchanged. The compatible save then used the same expected-version JSON compare-and-set approach as the existing candidate-registration implementation. It updated exactly one catalog row and matched the prepared proposal on readback. No stale catalog was overwritten.

## Validation

- Nine retained originals: byte/hash verification; seven text projection/hash checks; two PDF signatures.
- Ten literal identity/contact proofs.
- 44 existing focused tests passed: catalog identity (13), locality catalog links (8), retained identity preservation (6), candidate concurrency and uncertain saves (17).
- Live readback: nine offices; all seven other offices, existing Buildings & Inspections workflow/type/name/notes, both tracker localities and all four Cincinnati profile documents preserved.
- No authority relationships, jobs, work orders, automated dispatch settings, permissions or source catalog records were changed.
- No backend deployment needed. Frontend remains unpublished.

Machine-readable proposal and live verification accompany this document. Final build and diff-check results are recorded separately after completion.

Next dependency: safely register the retained official Cincinnati sign PDFs in app storage/catalog, extract page evidence, and prepare separate evidence-backed source/office role and scope reviews. Do not infer Cincinnati authority from the copied Hamilton County tracker office.
