# Retained PDF visual rendering — October 14, 2026

Phase 10, Milestone 1, Task 2 remains partial. Fixed progress counts do not change.

## Diagnosis and bounded functional change

The original hand-constructed synthetic PDF yielded extractable text under a parser but did not paint that text in a direct Chromium PDF view. A standards-generated single-page PDF displays text directly in Chromium and inside a simple standalone iframe. In the full permitting-page harness, the native embedded Chromium frame still showed a gray area (including after removing intercepted routing and URL fragments, and when a second iframe was appended). The precise cause of the integrated native frame's gray painting remains unknown; neither the production source URL nor real employee browsers were tested.

The catalog-only retained PDF preview now uses the app's already-installed react-pdf/pdf.js canvas renderer and locally bundled worker. The existing shared PDFViewer toolbar, Back/return focus, manual fallback/retry/timeout/external opening remain. Existing JurisdictionDetailPanel profile PDFs still use their unchanged native iframe mode, preserving profile PDF/search flows. No dependency added or frontend published.

PDF canvas fetches the exact selected HTTP(S) retained URL, with a hard 12 MiB byte cap (Content-Length early rejection and streamed byte counting), 12-second fetch abort, PDF signature check, and no server-side proxy. A failed load returns to the safe retry/new-tab fallback. Known oversized files remain blocked by the catalog metadata guard; an unknown-size oversized fixture also reaches the fallback without parsing. Client-side PDF rendering still requires source CORS access; authenticated real-file behavior remains unverified. Rendering does not certify version bytes, legal authority, currentness, physical page lineage or requirements applicability.

## Synthetic browser acceptance

Full Chromium with production CSS, actual JurisdictionDetailPanel, DocumentRepositoryBrowser, shared PDFViewer, requirements/source navigation and source monitors; unrelated heavyweight children are stubbed, and all records and PDF files are synthetic. Generated fixture: `scripts/fixtures/permitting-retained-source.pdf`. Harness: `scripts/test-permitting-source-pdf-browser.mjs`.

The selected historical `/older.pdf` was requested, and same-title `/latest.pdf` was not substituted. The canvas painted visible text, with dark pixels measured from canvas pixel data:

| Viewport | Dark PDF text pixels | Result |
| --- | ---: | --- |
| 320 px | 393 | Pass |
| 390 px | 710 | Pass |
| 1280 px | 7014 | Pass |

Verified: historical classification/currentness context; no lateral overflow; Back and return focus; manual fallback and retry; controlled stalled-fetch timeout and retry; unknown-size over-12-MiB guard; missing, unsafe, non-PDF and known-large inline-action guards; native profile viewer link/Back focus; jurisdiction switch cleanup; no simulated writes or provider/AI calls. Browser errors/outside fetches were empty in these scenarios. The rendering result is **synthetic canvas painting**, not authenticated production acceptance.

Receipts: `docs/permitting-source-pdf-browser-2026-10-14.json` plus this report. Other catalog and exact-source-navigation browser suites run at 320/390/1280. Targeted lint zero errors (six preexisting JurisdictionDetailPanel warnings). Production build and final Git check are to be confirmed with the checkpoint.

## Remaining limits and next chunk

Authenticated staff/admin acceptance of actual archived files, cross-origin CORS, real devices and large/multipage PDFs is pending. Chrome native embedded-page behavior remains unexplained but profile mode is preserved. Google exact-address lookup REQUEST_DENIED remains unrelated and unresolved. No client/job, backend, schema, dispatcher, research settings or permission changes.

Next meaningful chunk after this checkpoint: catalog-only saved text preview/search, carefully scoped to segmented text with source version/physical page evidence; do not confuse extracted snippets with authoritative current rules. Before that work, inspect fresh HEAD/status and preserve unrelated CCS changes.
