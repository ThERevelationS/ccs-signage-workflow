# Sharonville guide bounded PDF text extraction — 2026-10-14

Phase 10 / Milestone 1 of 3 / Task 2 remains partial; fixed task counts unchanged.
Fresh starting HEAD 9ffebeaa26eaf88a6fbac3b6895a85a92c7d15fe, clean working tree, diff check passed.

Confirmed blocker: PDF_TEXT_MAX_BYTES was 10 MiB, below the exact byte-verified guide size 11002258. Changed only the hard byte limit to 12 MiB in base44/shared/jurisdictionSourcePdfText.mjs. Five-page batches, 12-second individual PDF read/parse budgets, hash/byte validation, text bounds and concurrency protection remain. This shared limit applies to the existing extractor's automatic and manual reads, not a caller-controlled bypass. No queue release/credit settings changed.

Added scripts/permitting-sharonville-guide-text-limit.test.mjs exercising the retained real guide's first five physical pages and mandatory stream cancellation beyond the new hard bound. 29 focused tests passed. Build exit 0 and diff check passed. Existing baseline-browser-mapping/Browserslist warnings plus PDF.js rendering-polyfill warnings during text-only tests; no rendering acceptance claimed.

Named deployed continuePermittingSourceText pull matched repository bytes for entry.ts, jurisdictionSourcePdfText.mjs, jurisdictionSourceTextRuntime.ts and jurisdictionSourceTextContinuation.mjs. Sandbox auto-sync observed; no explicit deploy or frontend publication. Other dependencies/functions were not exhaustively compared.

One normal-SDK manual invocation selected exact catalog 6aced7f49bda8d3e61944a9d after fresh profile/archive/catalog identity checks. Profile 6ac19f0e23bd8a65822f6d51, Sharonville / OH / city; profile document 19bc3643-d404-4bcf-8cde-92c91897fd21. PDF SHA-256 4086899c8a7bceb4ebc12bc891bc2107729d17616503e4941c60390ed62104d9; 11002258 bytes. Account brettheinlein1@gmail.com/admin verified, no privileged mode.

Live result: success true, partial, pages processed/extracted 5, total pages 28, next page 6, llm_calls 0. Saved source version 2026-10-14T01:30:52.161000. Page numbers 1–5 and each text SHA-256 independently recomputed from getPermittingSourceTextPages response under normal caller access. No truncated or needs_ocr flags in this first batch; this does not prove visual/full-document completeness. Full source profile JSON unchanged.

Production changes: selected source text_extraction_state, extracted_pages and extracted_text only. No new archive/upload/catalog/office/job/permission/queue writes. Authority classification unknown_review_required and verification needs_verification remain. Guide page 7 has not been extracted into live page lineage yet. No office candidate preview or approval performed.

Receipt: docs/official-evidence/ohio-sharonville-2026-10-07/guide-text-first-batch-2026-10-14.json
Next ONE chunk: inspect fresh source state, continue one five-page batch from saved next_page 6 using the supported segmented path; verify pages 6–10 and exact page 7 text against retained expected hash 1cc9f1b15503ba2b01b46c966c8fa41f24d8ea7f77d2de705953adac60ca38d5. Stop on changed evidence/hash/segments. Do not infer current commercial-sign delegation or fabricate office IDs. Publisher candidate work follows only after exact archive/catalog/page lineage passes. Browser acceptance remains outstanding.
