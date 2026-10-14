# Explicit read-only Office Catalog identity preview — October 14, 2026

Phase 10 → Milestone 1 of 3 → Task 2 remains partial. Fixed task counts unchanged.
Initial HEAD cf72a99680c4441f137cc92529035595567e690e; clean. Newer package.json/package-lock.json work preserved. Target permitting files were unchanged from the previous checkpoint.

OfficeCandidateEvidencePanel now includes OfficeIdentityLivePreview. Its explicit button uses officeIdentityPreviewRequest.mjs to make one permission-scoped saved-catalog read and one identity_preview invocation. No auto-run on render, retry, scan, LLM, approval or save.

Fresh catalog selection must match the entire normalized office draft. Missing/duplicate/unversioned catalog rows and changed/unsaved selections refuse invocation. Exact candidate/registration and fresh catalog version bind the request. Response status, zero-write/zero-LLM flags, every unapproved authority/identity flag, versions, office/registration/page/source lineage and recomputed SHA-256 are checked before rendering. Browser Web Crypto is required for digest validation.

Historical registration classification and current saved source classification/currentness appear separately, with catalog/source/profile versions, physical page, snapshot digest, response time and unresolved publisher/alias questions. This rereads stored evidence, not the official website. Results are snapshots, not ongoing locks.

Duplicate clicks are suppressed. Selection changes invalidate pending tickets and hide completed results immediately. Late responses/errors and unmounted components cannot update another selection. A 20-second request bound displays an explicit read-only timeout; late catalog resolution cannot then start an invocation. No save or approval occurs on failure.

Validation: 36/36 focused tests passed across request/UI interaction, identity preview/backend, both evidence panels and verification guard. Actual React component tests cover no render calls, one request for duplicate clicks, selection change during request, hiding old completed previews, unmount, conflict and response digest/approval guards. Two initial test renderer scheduling errors were corrected before the final passing run. Focused ESLint, git diff --check and one npm run build passed. Existing baseline-browser-mapping/Browserslist warnings remain.

Fresh permission-scoped catalog readback: 69e14b004e01bf082f0f8c75; version 2026-10-14T12:07:33.616000; 10 visible items; exact Sharonville candidate remains needs_verification. No production record changes, contacts/roles/currentness/identity approval or frontend publication. No backend resources changed in this chunk. Prior identity_preview backend changes may have auto-synced; deployed invocation verification is recorded separately below if available. Authenticated visual browser acceptance remains pending.

Next ONE chunk: safely verify the real deployed identity_preview against exact Sharonville registration and check the preview UI with synthetic browser responses at desktop/phone sizes, preserving all live data. If authentication is unavailable, retain that precise blocker; do not repeat login/preview loops or promote the candidate.
