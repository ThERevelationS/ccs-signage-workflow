# Fleet Requests refresh response fencing

Reviewed: 2026-10-21. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).

## Finding and change

Overlapping Fleet Requests page loads applied whichever response finished last. A slower earlier refresh could restore an old request status and stale Fleet parts/fluids quantities after a newer refresh had completed. It could also clear the loading indicator while a newer refresh was still pending.

`FleetRequests.jsx` now sequences each load. Only the latest-started request can update request, equipment, Fleet part/fluid, current-user, admin, and loading state. Older requests settle without projecting stale snapshots. The read path still uses Fleet entities and does not change receiving receipts or inventory mutations.

## Verification

- Two deterministic extracted-handler races reproduced both failures before the guard and pass after it.
- Fleet request unit-cost and load-race regressions: 6/6.
- Isolated Chromium Fleet Requests acceptance: 2/2 at desktop and mobile sizes; all external-origin requests were blocked.
- Targeted ESLint, production build, and `git diff --check`: pass.
- Global typecheck reports 8,143 existing diagnostics; zero mention Fleet or Bouncie.

No production Fleet records were modified. Nothing was published or deployed.
