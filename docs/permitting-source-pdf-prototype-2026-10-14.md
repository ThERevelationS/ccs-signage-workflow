# Retained source in-app PDF preview — October 14, 2026

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3, Task 2 remains partial. Fixed progress counts unchanged.

## Functional change

Retained PDFs in the document catalog can open the existing PDFViewer inside the workspace, including source-only archives without profile search/PDF tooling. Preview uses the exact selected retained URL, scoped to the jurisdiction and navigation request. It preserves saved currentness/classification context without approving authority or verifying citation bytes.

Back returns to the originating source heading, reopening its details. Catalog filters reset when needed to make the origin reachable. Switching jurisdiction or source request closes the preview. A completed catalog read that no longer contains the selected retained URL closes it with a clear notice; failed metadata reads remain explicit. No new backend function, extraction, upload or AI call is involved.

Known recorded sizes above 12 MiB suppress the new inline preview; the retained external link remains available. Profile stored/source byte metadata is included for this guard. Unknown sizes are not byte-verified by this native browser embed; this is not a transfer-size verification or a change to existing PDF parser/archive budgets. Non-PDF sources and unsafe/missing retained URLs do not offer an inline PDF action. URL extension evidence is not MIME/byte validation.

The shared permitting PDFViewer has responsive controls and a two-line toolbar title, initial Back focus, loading status, a 12-second stalled-load timeout, retry, safe external opening and a Preview not working? fallback. Browser iframe load is explicitly not proof of correct PDF display, content or authority. Cross-origin HTML/error responses may report frame loading; staff can invoke fallback rather than treating it as verified PDF evidence.

Existing profile PDF controls still use this actual viewer. Opening a profile PDF clears obsolete catalog selection so its original return-focus behavior remains intact.

## Verification

Actual parent, catalog, requirements/monitor and PDFViewer tested together with production CSS, synthetic metadata and a valid one-page PDF fixture. Full Chromium renderer used because its headless shell does not report the native PDF load event. Phone 320/390 and desktop 1280 scenarios passed:
- citation to catalog-only historical PDF, exact retained URL and visible saved context;
- initial Back focus and return to source heading;
- frame load status, manual fallback/retry, 12s stalled-frame timeout/retry;
- known oversized source/profile copies, non-PDF/unsafe/missing retained links;
- responsive preview/header without horizontal viewport overflow;
- existing profile PDF opening and return focus;
- switching jurisdiction removes the frame;
- no provider/AI calls or production writes.

A dispatched synthetic iframe error event was not recognized by the native Chromium PDF frame and is not claimed as a passing browser check. Manual fallback and controlled stalled-frame behavior were verified instead. Browser frame loading is tested; faithful rendering/printing of production file contents is not certified.

Existing document catalog and exact source-navigation browser checks remain relevant regression checks. Targeted lint and final build/diff results are verified in the completion report. Old PDF keyboard harness failures are not retested or claimed fixed.

Harness: scripts/test-permitting-source-pdf-browser.mjs.
Receipt: docs/permitting-source-pdf-browser-2026-10-14.json.

## Scope and next

Frontend/component and synthetic test changes only. No backend/schema/permissions/settings/dispatch changes; nothing published. No production client/job/permitting records changed. Archives, manual/pinned/hash evidence, source review handlers and unrelated concurrent CCS work preserved.

Authenticated employee/admin acceptance, production PDF display and real device behavior remain pending. Google geocoding REQUEST_DENIED remains a separate blocker.

Next meaningful functional batch: add saved source text previews and search for catalog-only archives, respecting segmented text scope and the existing deterministic text handler. Show partial/missing/OCR states, preserve physical-page/source-version evidence, and never turn extracted or AI text into authority. Inspect actual handlers and UI before implementation.
