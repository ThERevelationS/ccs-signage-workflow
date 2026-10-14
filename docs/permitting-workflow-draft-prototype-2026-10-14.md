# Permitting workflow designer prototype — October 14, 2026

Phase 10, Milestone 1, Task 2 remains partial. This functional batch does not change fixed coverage counts.

Implemented preview → review → save immutable draft → reopen saved draft in the jurisdiction designer. Added permitting-only PermittingWorkflowDraft, separate from VinylWorkflowTemplate, WorkOrder and PermitLineItem. Draft name, project input snapshot, proposed steps/citations/gaps, review acknowledgment time and notes are retained. Saving never approves rules or creates job lines. Existing job-line action now requires a saved draft and approved-rule steps; production job integration was not exercised.

Rule hierarchy excludes draft/historical context before operational classification. AI step labels are demoted when cited rule identities do not support them. Draft/proposed/historical/superseded/comprehensive-rewrite documents are excluded from composition context. Canonical jurisdiction IDs scope rule/source reads when supplied. Address resolution requires the existing apply_allowed gate and matched profile ID; no guessed address authority is assigned. These labels do not prove the AI faithfully paraphrased every cited fact; full operational approval is future work.

Actual component/pipeline Chromium scenarios passed at 320, 390 and 1280 pixels. Synthetic API/AI fixtures and production CSS; all external requests blocked. Checks cover approved/pending/unknown labels, unresolved requirement visibility, review gate, save failure and retry, one successful draft, reopening retained notes, no job writes and no horizontal page overflow. Receipt: permitting-workflow-draft-browser-2026-10-14.json. Harness: scripts/test-permitting-workflow-draft-browser.mjs. Temporary browser tooling was restored after the sandbox restarted; the first harness close selector was corrected to select one of two Close controls.

Focused ESLint passed. git diff --check passed. Final npm run build exited 0 after the last functional edits. Existing browser-data warnings remain.

Live connector schema readback confirmed PermittingWorkflowDraft fields and RLS: admin/user create and read, no update, admin delete. Normal authenticated production-browser create/load, real AI output, and employee Sign Shop session compatibility remain unverified. No real client/job or live permitting records were created or changed by these tests. No frontend publication, explicit backend deployment, shared permissions change or dispatcher/settings change. Entity schema auto-synced.

Next chunk: complete an employee-facing draft library/review entry in Permitting so drafts can be found outside a single jurisdiction dialog, including clear empty/load-error states and synthetic mobile/desktop acceptance. Verify normal authenticated draft persistence when available; preserve live client/shared data.
