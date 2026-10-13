# Sharonville guide archive/catalog readiness — 2026-10-13

Phase 10 / Milestone 1 / Task 2 remains partial. Initial HEAD `731a6f52e1eb5589251189ac820b077e84ae0860`; clean tree. Read-only live inspection and documentation only.

Fresh exact JurisdictionProfile query returned `6ac19f0e23bd8a65822f6d51`, Sharonville / OH / city, updated_date `2026-10-04T00:36:39.283000`, auto_refresh true. Four documents `_1` through `_4` under prefix `ai_2026-10-04T00:36:39Z`; all returned file_url values null. No residential guide document ID or archive receipt returned. `_manual_documents` was not returned; do not treat missing visibility as verified false. Do not use the old profile timestamp as a future write token without rereading.

## Existing path

Handler `base44/functions/continueJurisdictionArchives/entry.ts` requires authenticated admin. Manual archive selects jurisdiction_id and an existing document_id. known_pdf requires retained SHA-256 and bytes (5 through 50 MiB); it cannot be combined with catalog_only. It does not accept a repository file upload or manufacture a saved document.

`base44/shared/jurisdictionArchiveContinuation.mjs` fetches the selected official URL, checks PDF format and retained expected hash/byte count before upload, persists an uploading intent, uploads once, retains the returned URL, rereads stored bytes and compares them before committing archive completion. Uncertain upload is fenced; no blind resubmission. Fetch 12 seconds and upload 15 seconds remain bounded. Protected/manual/pinned/hashed archives and manual collections are not overridden even for an employee-triggered call.

`base44/shared/jurisdictionArchiveCatalog.mjs` requires an exact complete archive receipt, file_url, matching source/stored hashes and bytes and an unprotected saved document. catalog_only cannot archive or add the missing guide link. Catalog creates persist an intent first, and uncertain creates only reconcile. Initial content remains unknown and needs_verification, not current law or verified office authority. Manual operation selection does not mean source:'manual' records become eligible for this worker.

The external-referral path requires saved discovery cursor/referral/visit evidence and rechecks an exact official-page link. It is not a generic arbitrary-URL insertion path. The guide is a retained same-host link; do not label it external or manufacture discovery state to bypass admission. No external-referral invocation was made.

## Guide prerequisites

Official URL: https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026 . Existing retained PDF: `docs/official-evidence/ohio-sharonville-2026-10-07/residential-guide-2026.pdf`, SHA-256 `4086899c8a7bceb4ebc12bc891bc2107729d17616503e4941c60390ed62104d9`, bytes 11002258. These are repository expectations, not a remote-storage verification. The retained department HTML has the exact guide href; fresh website referral/currentness has not been rechecked.

Required order:

1. Inspect the existing official same-host discovery or manual document admission path; establish an exact guide link with a stable saved ID and preserved manual/concurrent documents. Do not invent an ID, source provenance or consent to mutation from this audit.
2. Once eligible, perform one selected known-PDF archive with the retained expectation. If official bytes changed, stop before upload and retain both histories for review.
3. Verify exact stored bytes and committed archive receipt; reconcile catalog once. Unknown upload/create outcomes require same-receipt readback, never another blind upload/create.
4. Obtain actual catalog/profile/page IDs and committed extraction evidence before publisher candidate preview. Repository page hashes alone are not a catalog extraction receipt.
5. Keep currentness, office identity, electrical issuance/inspection and commercial-sign applicability as separate reviews.

No live registration request was sent: it would skip the absent saved guide. No production record, discovery state, office catalog, permissions, queue or archive changed. Nothing deployed or published. Browser acceptance remains pending.

Validation: focused selected-PDF archive and archive-catalog synthetic suites; final diff check and clean-tree verification reported with checkpoint. No runtime changes; build not needed.

Next bounded chunk: inspect official same-host deterministic discovery and manual document admission for this exact guide. Choose the supported route and prepare a concrete safe admission change only if necessary; preserve existing links and no authority promotion. Avoid another audit of the already-established absent guide/archive prerequisites.
