# Permitting continuation handoff — October 17, 2026

## Project and required start
CCS Signage Workflow — Permitting Intelligence. App ID: 68dfcc5e57bbbc35387da97c. Account: brettheinlein1@gmail.com. Legacy app 69b1840cf75aba55e115d020 is reference-only.
Before EVERY continuation, check current official OpenAI ChatGPT Work model guidance and recommend model/effort for the actual task. Check the visible picker when available; otherwise disclose that account options are not visible. Continue without waiting for a switch. GPT-6.1 Sol Medium was recommended for this bounded feature.
Inspect fresh HEAD/status and target source before changes; live source overrides this handoff.

## Starting verified state / concurrent work
Started from clean HEAD 4509a70783525b5ea0642fd636e814b582d9e2c8, checkpoint 6ad3b1bb5a6bbf48ebe4fef8.
The central saved-draft library already existed. Its older-draft browsing supports explicit 100-row SDK cursor pages, append/deduplication, same-cursor retry and local loaded-only filters. Prior 205-draft mobile/desktop synthetic checks remain valid and were rerun in the new combined harness.
The separate Time Clock fix from 1f3fda5b370f499df18a9f5a3231a05ec850716f / checkpoint 6ad34f58b57dbc7e09fdde46 is preserved. No Time Clock work was done in this unit.

## Completed functional unit
Added staff-facing saved-draft revision history and comparison inside the actual PermitWorkflowDesigner.
- Open Review draft in the library, then Show revision history & comparison.
- Opens on the saved snapshot, with no automatic ancestor scan. Load previous revision fetches one recorded parent by ID using the authenticated entity SDK. Explicit clicks continue toward the root.
- Loaded ancestors can be selected for comparison with the opened saved draft. This is ancestor history only: newer revisions and sibling branches are explicitly not listed.
- Changed fields cover project/planning inputs, jurisdiction, electrical office planning handoff, individual proposed step office/action/schedule/inspection/dependency/requirement/basis/override fields, draft context and notes.
- Citations, saved gaps and review notes are shown even when unchanged. Full saved citation excerpts and identifiers are retained without truncation or refreshing. A checkbox shows every other unchanged field.
- Earlier/opened values appear side by side on larger screens and stack on mobile. Missing, false, zero and empty-list values remain distinct.
- Step comparisons are by saved position, explicitly labeled, without guessed step identity.
- Read failure shows retry and preserves any loaded comparison. Incomplete/mismatched-root/cyclic links cannot be presented as verified history.
- History is visible only for a saved draft; creating an editable revision unmounts it. Unmounted reads are ignored.
- No AI calls, source refresh, authority approval, record mutations, job actions or schema changes were introduced.

## Relevant source and evidence
- src/components/permitting/PermittingDraftHistory.jsx — actual read-only UI and bounded parent reads
- src/components/permitting/permitDraftComparison.mjs — pure comparison and ancestor validation
- src/components/permitting/PermitWorkflowDesigner.jsx — saved-only history entry
- src/components/permitting/PermittingDraftLibrary.jsx — existing central library, unchanged in this unit
- base44/entities/PermittingWorkflowDraft.jsonc — unchanged; live schema readback confirmed admin/user read/create, update false, admin delete
- scripts/permitting-draft-comparison.test.mjs — comparison, additions/removals, false/zero, retained citations, invalid links and nonmutation
- scripts/test-permitting-draft-revision-browser.mjs — actual library/designer/history with isolated synthetic fixtures
- docs/permitting-draft-revision-browser-2026-10-17.json — three viewport receipt
Existing draft save/parent/root behavior remains in src/components/permitting/permitWorkflowDesigner.js and PermitWorkflowDesigner.jsx.

## Verification and limits
Pure comparison/ancestor checks passed. Targeted ESLint passed for the three touched frontend sources and both new harnesses. git diff --check passed.
Actual components passed Chromium checks at 320, 390 and 1280 px using production CSS and synthetic API fixtures, with external requests blocked. Covered three linked snapshots, explicit ancestor loading, first/later failures and retries, retained comparisons, source excerpts longer than 120 characters, planning/office/action differences, gaps/notes, unchanged toggle, ancestor switching, original/no-history state, unchanged fixture snapshots, no job action and no horizontal overflow. The same run also passed the existing 205-draft pagination scenarios.
npm run build exited 0. Vite config suppresses normal build-success logs. Existing browser-data warnings remain. The initial build command did not preserve its exit status, so the final build explicitly captured and reported exit 0.
These are synthetic browser checks, not authenticated employee acceptance or deployed frontend acceptance. No live employee session was available through the connector, and no login retries were attempted.

## Deployment / data / settings
No frontend publication or deployment. No backend/entity/permission/integration changes. No production records, client/shared data, job records or files were modified. No dispatcher/settings changes or research/AI calls. Prior live dispatcher settings were not remeasured in this UI unit.
Research defaults/limits still apply: enabled; 15 minutes; 5 jurisdictions/cycle; 20 active/in-flight; 40 attempts/day; retry limit 3; failed LLM attempts count. Do not describe defaults as newly verified live settings.
Archive limits remain one new downloadable file/refresh; fetch 12s/upload 15s/extraction 20s; preserve manual/pinned/hashed archives. HTML portals are links. Keep same-host deterministic forms harvesting and exact jurisdiction evidence rules.

## Checkpoint and continuation
This dated handoff is saved with the named checkpoint “Permitting saved-draft revision history and snapshot comparison verified”. The checkpoint ID and final Git are returned after this file is saved; use the final tool receipt/report or inspect version history. Do not substitute the starting checkpoint above for the completed unit.
Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; Task 2 partial; 2 of 4 tasks complete. No fixed coverage counts advanced. Ohio precedes Kentucky.
Continue prototype-first. Next bounded functional chunk: source-detail drill-through from saved-draft revision comparisons, reusing the existing source-document viewer and retaining the exact saved citation/version context. Acceptance: a staff member can open a retained citation's source details from either compared snapshot; missing/inaccessible or changed source evidence remains explicit; no regeneration, rule approval or job writes; synthetic mobile/desktop checks; checkpoint without publishing.
Authenticated employee persistence, saved physical-page source text acceptance and broader employee sign-in acceptance remain pending. Use a real session if available without looping on login or stalling independent prototype work.
Remaining roadmap: bounded source collection/archiving and retained text acceptance; office/parent authority reconciliation; OH then KY coverage; source monitoring; exact matching/maps/action progress; evidence-based workflow features; explicit safe job integration; rollout/accessibility/mobile/concurrency acceptance. Phases 5/6 historical source exceptions stay open where recorded.
Protect every live client/shared system, related permissions, files and relationships, and all concurrent CCS changes. Permitting-only disposable testing remains authorized by docs/permitting-development-authorization-2026-10-14.md. No frontend publishing without explicit permission. One coherent unit per Continue, then checkpoint and stop.

