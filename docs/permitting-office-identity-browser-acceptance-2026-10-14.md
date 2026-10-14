# Identity preview isolated Chromium acceptance — October 14, 2026

Phase 10 → Milestone 1 of 3 → Task 2 remains partial. No statewide/task-count advancement.
Fresh initial HEAD d39bf756b69d8b563ec5f2337db38f14b8ca3a38; clean. Newer package.json/package-lock.json changes were preserved; permitting target files unchanged.

Ran actual OfficeCandidateEvidencePanel, OfficeIdentityComparisonPanel and OfficeIdentityLivePreview components with app CSS in isolated Chromium 156.0.8078.4. Local Vite fixture replaces only the SDK with synthetic read-only responses. All external HTTP requests blocked and checked; no production API/website requests, login, writes, LLM, scans or publishing.

Initial Chromium launch lacked libglib and related shared libraries after sandbox restart. Restored Playwright browser/system test dependencies outside the app repository; no app package edits.

First browser run: 9/12 checks passed. Only layout/tap checks failed: preview button height 34 pixels at 320/390/1280 widths. Fixed one runtime class: min-h-11 gives a minimum 44-pixel target.

Final browser receipt:
docs/permitting-office-identity-browser-2026-10-14.json
All 12/12 checks pass:
- no initial API calls, horizontal overflow or undersized preview target at 320/390/1280;
- keyboard activation and duplicate request fencing; readable historical/current snapshot at all three widths;
- unsaved draft refused before invocation;
- late response hidden after edit and after returning to old selection;
- explicit conflict, digest mismatch and unexpected approval flag failures;
- panel closure suppresses late response.
No browser runtime errors, external requests or synthetic writes in passing checks.

Additional focused UI request/interaction suite, lint, diff check and one build ran in the same set -e pipeline before the final browser run. Its command-channel response timed out at 60 seconds, but the final completed receipt was subsequently read once (tested_at 2026-10-14T14:41:05.252Z). Since the browser script is last in the set -e pipeline, its completed receipt confirms prior checks/build finished successfully. No build or browser retry after that timeout. CSS min-h-11 independently read back present.

Screenshots:
docs/permitting-identity-browser-screenshots/preview-320.png
docs/permitting-identity-browser-screenshots/preview-390.png
docs/permitting-identity-browser-screenshots/preview-1280.png
320- and 1280-pixel screenshots visually inspected; text wraps, historical/current labels remain distinct, snapshots and unapproved identity boundaries visible. Screenshots show synthetic receipt values, not production results. First-run failure receipt retained separately as permitting-office-identity-browser-before-2026-10-14.json.

No production records modified. No source/candidate/contact/role/currentness approval. No backend resource changes/deployment. No frontend publication. This is isolated browser acceptance, not authenticated production acceptance or deployed identity_preview verification. CLI authentication blocker from prior chunk remains; no login/code retries here.

Next ONE chunk: verify real deployed identity_preview against the exact saved Sharonville candidate with normal authenticated SDK access and fresh catalog version when available. Preserve unverified state and all records; record the digest, versions and zero-write boundary. If authentication is unavailable, retain that blocker and do not bypass it. Full live Task 4 and statewide completeness remain pending.
