# Permitting continuation handoff — October 17, 2026

## Latest completed unit — loaded-only saved-draft follow-ups and direct step navigation

This is the current continuation state and supersedes older next-chunk sections below. CCS Signage Workflow, app 68dfcc5e57bbbc35387da97c, account brettheinlein1@gmail.com. Legacy app 69b1840cf75aba55e115d020 remains reference-only.

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; Task 2 partial; 2 of 4 tasks complete. No fixed coverage counts advanced. Ohio first. Current official OpenAI guidance was checked; GPT-6.1 Sol High was recommended. Picker access was unavailable; no switch was claimed.

Previous verified checkpoint: 6ad401236266c494cc4f1e25, “Permitting saved workflow staff planning review checklist verified”, Git 6d524f3cdafd1d406ff123405e3c46cc046b1ec7.
This chunk started from that fresh clean HEAD. After the pause, clean HEAD 3c2ef97deadbfd6bfc3b39a231d1cebbc3f83da7 retained the complete implementation/tests but temporary verification logs and browser tooling were absent. Results were re-established and durable validation receipts were added. No blind source retries or production writes.
New concurrent Time Clock changes were preserved, including src/components/timeclock/GlobalWorkPauseControl.jsx, scripts/validate-timeclock-global-pause-event-ui.mjs and docs/timeclock-prepublication-acceptance.md. Target-source fingerprints confirmed the permitting files were unchanged by concurrent work before the final count-label clarification.

### Implemented
- Saved-draft library now shows per-snapshot planning review counts, open follow-up counts, explicit missing legacy reviews, unrecognized decisions and other recorded follow-up areas.
- Filters for planning decision and evidence/office-provider/documents-forms follow-up match the same retained step. A decision from one step cannot match an area on another.
- Search includes saved draft fields and matching step titles, offices, actions, reasons and notes. Search, state, decision and follow-up filters cover loaded snapshots only. Filter changes do not issue API requests.
- Counts are explicitly per snapshot, not unique projects or statewide/global totals. Ancestors/sibling branches remain separate; no single current revision is inferred. Cards retain draft ID, recorded dates and revision root context.
- Existing evidence/basis gap count is now labeled “evidence / confirmation items” so it is not mistaken for the staff follow-up count.
- Review-step details list matching saved positions and open the selected position in the actual designer. The step expands, scrolls into view and receives focus even if its saved step_index differs from its array position.
- Read-only return restores the exact opener, filters and loaded browse without re-fetching. If the opener is no longer present, focus falls back to the library heading.
- Initial direct-step focus runs once per opened designer; ordinary opens remain compatible. Step headers now expose aria-expanded/aria-controls.
- Explicit 100-row cursor reads, append/deduplication, same-cursor retry, loaded-page retention on older-load failure and manual older-page expansion remain intact.
- Saving a new immutable revision retains the existing library-refresh behavior; loaded-page/focus retention was verified for read-only returns. No change was made to save semantics or job integration.

### Source / receipts
New:
- src/components/permitting/savedDraftReviewFilters.mjs
- scripts/permitting-draft-follow-up.test.mjs
- scripts/test-permitting-draft-follow-up-browser.mjs
- docs/permitting-draft-follow-up-browser-2026-10-17.json
- docs/permitting-draft-follow-up-validation-2026-10-17.json

Updated:
- src/components/permitting/PermittingDraftLibrary.jsx
- src/components/permitting/PermitWorkflowDesigner.jsx
- this handoff

The validation receipt records build exit 0, passed browser exit 0 and a SHA-256 fingerprint of the three target UI/helper files. It was checked against the actual final source.

### Verification
Passed:
- Three focused filter tests: same-step decision/area/search matching; explicit missing legacy, unknown decisions/areas and empty snapshots; nonmutation and separate sibling branches.
- Three existing planning-review rule/comparison tests.
- Targeted ESLint and git diff --check.
- Final npm run build, exit 0; only existing browser-database warnings.
- Actual library/designer browser scenarios at 320, 390 and 1280 px with 205 immutable synthetic snapshots, production CSS and external requests blocked.
- No filter API calls; 100-row cursor pages; older-page failure retention and same-cursor retry; review-note search for the oldest snapshot; saved-position expansion/focus/visibility despite mismatched step_index; exact return focus and retained filters/pages; explicit legacy/unknown annotations; distinct sibling branches; 44px direct-step controls; no overflow, snapshot mutations or source/provider/AI/job calls.
- Existing library/ancestor-comparison/205-draft pagination browser regression passed at all three widths. The later product change only clarified the evidence-count wording; the final follow-up browser run asserted that wording at all three widths.
- Mobile card layout visually inspected.

One initial browser assertion incorrectly demanded the legacy-review phrase be the entire summary paragraph. The assertion was corrected to match the retained phrase; product behavior was not altered for that test. The evidence-count label was separately clarified for honest presentation.

Temporary Playwright/Chromium/system browser dependencies were restored outside the repository after the pause; no app dependency changes. These remain synthetic component checks, not authenticated employee acceptance. Employee sign-in/persistence, native print-dialog acceptance, live physical-page text acceptance and the earlier external PDF byte-loading check remain pending. No failed login flow was repeated.

### Deployment / records / settings
This unit did not publish/deploy the frontend, change backend/entity/schema/RLS/integrations, write production/client/job/shared records or files, refresh sources, approve authority, call research AI or change dispatcher/settings. Live settings were not remeasured. Preserve all concurrent CCS changes. Research/archive policy defaults below remain unchanged and are not newly measured settings.

### Next — one bounded Ohio office-reconciliation chunk
Inspect fresh HEAD/status, current Phase 10 office-reconciliation source/notes and retained permitting-only office/source evidence. Select a bounded Ohio batch (no more than five canonical jurisdictions if research is needed) and complete one meaningful issuer/inspection reconciliation improvement or evidence batch. Keep electrical permit issuer and inspection provider responsibilities separate; require exact location/service-area/delegation evidence and official sources, retain unknown roles explicitly, and preserve manual/archived documents. Use jurisdictionResearchAgent/refreshJurisdiction only where genuinely needed, first verify live queue/credit controls and obey existing gates without manual bypass. No authority approvals, job/client/shared-data writes or frontend publication. Verify the actual changed roles/evidence and report any count changes only if established from fresh evidence; checkpoint and stop.

Checkpoint name for this unit: “Permitting saved draft follow-up filters and direct step navigation verified”. Exact checkpoint ID/final Git are returned after checkpoint creation; use the final tool receipt/report or version history.

Observed pre-handoff HEAD: 2ef26b9bbdec380ece1f646e35001a29e90469e4; status before the handoff update: clean. Inspect fresh HEAD/status before continuing.


## Previous completed unit — saved workflow staff planning review checklist

This is the current continuation state and supersedes older next-chunk sections below. Prior packet/citation-evidence implementation history remains preserved.

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; Task 2 partial; 2 of 4 tasks complete. No fixed coverage counts advanced. Ohio first. Official OpenAI guidance was rechecked: GPT-6.1 Sol High remains recommended for this functional chunk. The picker was unavailable; no model switch was claimed.

Previous verified checkpoint: 6ad3f8b684a68ad708ef3097, “Permitting saved workflow print-ready review packet verified — handoff included”, Git b539dfe475ddcb0f506c353912c91c9e2b5555f5.
This chunk started at that fresh clean HEAD. All changes since it were confined to the permitting checklist, designer, comparison, packet labels, focused tests/receipts and this handoff. All earlier concurrent CCS work remains preserved.

### Implemented
- Open a saved draft, choose Create editable revision, expand a step and use Staff planning review.
- Each step supports Not reviewed, Needs follow-up, Reviewed for planning and Proposed not applicable, with a reason, notes and evidence/office-provider/documents-forms follow-up areas.
- Review progress explicitly does not establish evidence completeness, authority approval or readiness for job work. Proposed not applicable does not remove steps.
- Selecting a follow-up area sets Needs follow-up. Follow-up/not-applicable decisions require a reason. Open follow-up areas prevent another decision from being saved until resolved/cleared. Invalid/unknown decisions remain visible and must be reviewed before saving.
- Editing a proposed action/office/document/timing detail after an earlier planning review invalidates that review to Needs follow-up, retains its reason/notes, records the changed field and opens the appropriate follow-up area. Existing staff-override basis demotion remains intact.
- Checklist-only edits retain the action's original evidence basis, citations, source metadata, gaps and other planning fields. They do not grant operational eligibility or authority approval.
- Uses the existing append-only draft save path; the original record is never updated. Review annotations live under snapshot.steps[position].staff_review; no schema changes.
- Cancelled Close/Edit inputs prompts preserve unsaved checklist work. Dirty reviews install a beforeunload guard and are protected from initialSavedDraft re-initialization while dirty. Failed saves retain edits for retry; review controls become read-only during save.
- Saved reviews reopen read-only after reload. Missing legacy annotations remain explicitly Not reviewed without backfilling the old snapshot.
- Revision comparison has a dedicated Staff planning review group; unchanged annotations remain visible. Print packets retain review decisions, all follow-up fields and complete notes, with human-readable planning decisions.

### Source
New:
- src/components/permitting/WorkflowPlanningReview.jsx
- src/components/permitting/workflowPlanningReview.mjs
- scripts/permitting-workflow-planning-review.test.mjs
- scripts/test-permitting-workflow-planning-review-browser.mjs
- docs/permitting-workflow-planning-review-browser-2026-10-17.json

Updated:
- src/components/permitting/PermitWorkflowDesigner.jsx
- src/components/permitting/permitDraftComparison.mjs
- src/components/permitting/WorkflowReviewPacket.jsx
- this handoff

### Verification
Passed:
- Three focused Node tests: reason/open-area consistency and detached updates; changed-plan review invalidation without losing retained context; unchanged/changed review comparison visibility without altering source basis/citations.
- Existing immutable comparison/ancestor validation.
- Targeted ESLint, git diff --check and npm run build.
- Actual library/designer/checklist/revision/history/packet Chromium scenarios at 320, 390 and 1280 px.
- Required reasons and follow-up consistency; cancelled navigation and unload guard; failed-save retry; append-only save with original snapshots/citations/source metadata/basis/gaps unchanged; actual browser reload/reopen using synthetic session-persisted draft API fixtures; saved read-only review; changed-proposal invalidation and re-review; no horizontal overflow; 44px decision control.
- Actual nine-page Chromium PDF at desktop width: full long note beginning/end markers, both review decisions, saved source metadata and original action retained; unrelated client text omitted.
- Existing actual generation/save/reopen/revision browser scenarios passed at all three widths.
- Mobile checklist screenshot visually inspected.

Tests used synthetic API fixtures and production CSS with external requests blocked; no production records were touched. Authenticated employee persistence/sign-in and native print-dialog acceptance remain pending. The sandbox lacked temporary browser tooling, so Playwright/Chromium/system browser libraries were restored outside the repository. No app dependency changes. Only existing browser-database warnings.

### Records / deployment / settings
Nothing published or frontend-deployed. No backend/entity/schema/RLS/integration changes, production/client/job/shared-file writes, source refreshes, authority approvals, research AI calls or dispatcher/settings changes. Policy defaults and archive limits below remain unchanged; live settings were not remeasured.

### Next — completed
The follow-up library feature is now complete. Use the current next chunk at the top of this handoff.

Checkpoint name for this completed unit: “Permitting saved workflow staff planning review checklist verified”. Exact checkpoint ID/final Git are returned after the handoff commit and checkpoint; use the final tool receipt/report or version history.

Verified pre-handoff HEAD: a425a22499ad00c40dad0673874590012b835fec; working tree was clean. Inspect fresh HEAD/status before continuing.


## Previous completed unit — saved workflow print-ready review packet

This section supersedes the earlier “next chunk” below; the prior citation-evidence implementation history remains preserved.

Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; Task 2 remains partial; 2 of 4 tasks complete. No fixed coverage counts advanced. Ohio first. This was one functional prototype chunk sized for GPT-6.1 Sol High. Official OpenAI model guidance was checked and supports that recommendation; the picker was unavailable and no model switch was claimed.

Prior verified Permitting checkpoint: 6ad3ee2a9cf6058ba81246f7, “Permitting saved workflow citation evidence review and source snapshots verified”, Git b964bc9ceb77b5d2e55d26301089cc39b252010d.
This unit first verified clean HEAD f48e9d288bf669e529170f5b92e3e1d735c9c895, then observed clean 5e3e8f156b0a69b14ca50d70ac0e0af2927dedeb before implementation. Preserved all concurrent Admin, Sales and Time Clock source, test and documentation changes. Intermittent MCP read/write/command timeouts occurred. A single shell inspection confirmed both timed-out writes and the designer edit had landed; they were not blindly retried. Verification results were recovered through explicit log/exit receipts. No unresolved writes or known unfinished code remain.

### Implemented
- “Open saved review packet” is available only for an opened saved row with an ID. An editable unsaved revision has no packet action.
- Opening captures a detached copy of that saved row. The packet never reads the current form or editable steps, queries source records, regenerates evidence or saves anything.
- A read-only modal preserves the saved designer state. Escape and Return restore focus to the packet opener.
- Includes saved draft identity, revision links and recorded dates; all project inputs and jurisdiction context; recorded offices and separate electrical issuer/inspection planning; proposed actions, documents/forms, dependency positions, relative timing/follow-up and inspection fields; full citations; captured source metadata; gaps and saved review notes. Additional snapshot fields remain visible.
- Clearly labels an unapproved proposal, location/authority uncertainty, proposed timing and unverified or missing legacy source metadata. Retained currentness, classification, review and supersession context is printed without consulting a current source record.
- Recorded HTTP(S) links use the existing safe URL helper. Unusable/credential-bearing links are not made clickable.
- Print / Save as PDF invokes native browser printing where supported and reports an unavailable-print fallback. Printing does not close the packet.
- Print rules hide every other direct body surface while this packet is open and remove modal/scroll bounds for pagination. A scoped visibility override handles the existing App.css quote-only print rule; App.css and unrelated quote behavior were not modified. Page-margin rules are mounted only with the packet.

### Source / verification
New:
- src/components/permitting/WorkflowReviewPacket.jsx
- src/components/permitting/workflowReviewPacket.css
- scripts/test-permitting-workflow-review-packet-browser.mjs
- docs/permitting-workflow-review-packet-browser-2026-10-17.json

Updated: src/components/permitting/PermitWorkflowDesigner.jsx (import, local state, saved-only opener and modal) and this handoff.

Passed after the final product change:
- Targeted ESLint and git diff --check.
- npm run build, exit 0; only existing browser-database warnings.
- Actual library/designer/packet Chromium scenarios at 320, 390 and 1280 px using production CSS and synthetic immutable drafts with external requests blocked.
- Saved-only entry and unsaved-revision exclusion; full saved evidence/documents/offices; unsafe-link omission; 44px print controls; no horizontal overflow; print invocation and unavailable fallback; Escape/Return focus; unchanged saved notes and rows; explicit legacy gaps; no source reads, AI/provider calls or job writes.
- Actual Chromium Letter PDF: 13 pages for deliberately long quotation/notes fixtures. PDF text extraction found beginning and ending quotation/note markers, saved action, both separate electrical offices, captured metadata, gaps, source/rule IDs and recorded dates. Unrelated client text, designer navigation and print controls were absent.
- Actual printed PDF pages 1 and 5 were rendered with the existing PDF.js dependency and visually inspected; title/identity, form links, timing, full citation and paginated quotation were readable.
- Existing source-evidence tests (3), exact citation-navigation test (1), and immutable comparison/ancestor tests passed earlier in this chunk; the subsequent product change was scoped print CSS only.

The first PDF run exposed the existing global quote-print visibility conflict and correctly failed on blank output. The scoped override fixed it; the final complete run passed.
Browser print invocation was stubbed to verify wiring/fallback. The PDF itself was generated by Chromium, not a stub. Native OS/mobile print-dialog acceptance and authenticated employee persistence/sign-in acceptance remain pending. No real employee login attempts were made. Existing external PDF byte-loading and physical-page text acceptance remain pending as described below.

### Deployment / records / settings
Nothing published or frontend-deployed. No backend/entity/schema/RLS/integration changes. No production records, jobs, clients, shared files, relationships, authority approvals, source refreshes, research AI calls or dispatcher/settings changes. Live settings were not remeasured. No application dependency changes. Temporary visual-QA files remain outside the repository.

### Next — one functional chunk
This checklist is now implemented and verified in the latest completed unit at the top. Follow its new next-chunk direction.

The completed unit is saved under the checkpoint name “Permitting saved workflow print-ready review packet verified”. Its exact checkpoint ID and final Git are returned after checkpoint creation; use the final tool receipt/report or version history. The prior checkpoint above is historical. The final observed pre-document/checkpoint HEAD is recorded immediately below; inspect fresh HEAD/status before the next change.

Pre-document/checkpoint HEAD: 0e23f4505d9545f886970d4d5a1c23c9f6fe2622.


## Project and required start
CCS Signage Workflow — Permitting Intelligence. App ID: 68dfcc5e57bbbc35387da97c. Account: brettheinlein1@gmail.com. Legacy app 69b1840cf75aba55e115d020 is reference-only.
Before every continuation, check current official OpenAI ChatGPT Work model guidance and recommend model/effort for the actual task. If the picker is unavailable, disclose that account options are not visible; continue without waiting for a switch.
Brett requested a larger unit sized for GPT-6.1 Sol High. Official model guidance was checked; High supports this connected feature. Do not claim the user's picker was changed.
Inspect fresh HEAD/status and target source first; live source overrides this handoff.

## Starting state / preserved concurrent work
Previous verified Permitting checkpoint: 6ad3b56297f5d2fbe95c65a7, Git bcd01f800a2924da8ff51da684ea764c654c67b8, clean. Completed immutable saved-draft ancestor history/comparison; the central library and explicit 100-row cursor paging already existed.
This unit started at clean cd62dd072b0210ba0042d7efbaee041124415701 and then observed 12791e6cf42d99dc8e7042ec6c3814e66b1e5362 during read-only orientation. Newer concurrent Time Clock/Admin changes were preserved.
After the multi-hour pause, fresh HEAD was clean 7c910f93fbec62d511baada0589251d7f15c4b82. The implementation and tests had landed. The ephemeral pending tool-result handle had expired; results were re-established from source and focused verification.
No unrelated source was overwritten or reverted. Preserve newer Admin navigation and Time Clock global-pause source/tests/acceptance work.

## Completed functional unit
Added in-place saved citation evidence review from saved workflows and BOTH sides of a revision comparison.
- Normal saved-step citations open the evidence dialog instead of closing the designer. History citation buttons pass the exact earlier/opened draft row, citation and focus-return target.
- The dialog retains full saved quotation, section/physical-page reference, rule/source IDs, citation fingerprints/review state and safe recorded links.
- Source reads use one exact source ID AND the snapshot's canonical jurisdiction ID, with a bounded metadata field list. Missing/inaccessible/foreign/ambiguous results show retry against that same identity; no title/URL substitution.
- Citation and generation-captured archive hashes/URLs are compared independently with the loaded record. Matching metadata never establishes byte authenticity, quote accuracy or adopted authority. Conflicting retained references remain visible even if one fingerprint matches.
- Older snapshots without a usable retained hash remain explicitly unverified. Changed archive metadata is identified separately from changes in currentness, classification, review, reviewer, revision/effective dates, office/scope and supersession.
- Historical/draft/superseded context stays visibly flagged. The original saved snapshot is never refreshed or rewritten by this view.
- Reuses SourceTextEvidenceBrowser and PDFViewer. Text is clearly labeled as belonging to the source record loaded now; it is never presented as recovered original text when versions differ. Text reads remain explicit and bounded to five saved physical pages. PDF preview respects the existing 12 MiB recorded-size cap; official PDF URLs can identify extensionless retained-copy URLs.
- Return/Escape restores the citation button and preserves draft/comparison state. Closed/unmounted read responses cannot replace a later citation.
- Future generated drafts retain source_evidence metadata only for exact cited IDs among the already loaded canonical source records. No new source read, provider call or AI call is added to generation. Full text/extraction payloads are excluded. Revised snapshots inherit this metadata unchanged; legacy drafts are not backfilled.
- Existing unsaved-preview navigation callbacks remain compatible.

## Source and evidence
New:
- src/components/permitting/WorkflowSourceEvidenceDialog.jsx
- src/components/permitting/workflowSourceEvidence.mjs
- scripts/permitting-workflow-source-evidence.test.mjs
- scripts/test-permitting-workflow-source-evidence-browser.mjs
- docs/permitting-workflow-source-evidence-browser-2026-10-17.json

Updated:
- src/components/permitting/PermitWorkflowDesigner.jsx
- src/components/permitting/PermittingDraftHistory.jsx
- src/components/permitting/WorkflowCitationList.jsx
- src/components/permitting/permitWorkflowDesigner.js
- scripts/test-permitting-workflow-draft-browser.mjs (generation capture / immutable inheritance assertions)
- docs/permitting-workflow-draft-browser-2026-10-15.json (existing receipt rewritten by harness; no schema/data changes)

Existing relevant files:
- src/components/permitting/PermittingDraftLibrary.jsx — unchanged; 100-row explicit SDK cursor pages, append/deduplication, same-cursor retry and loaded-only filters
- src/components/permitting/permitDraftComparison.mjs — unchanged; field comparison and verified ancestor traversal
- base44/entities/PermittingWorkflowDraft.jsonc — unchanged; prior live readback: admin/user create/read, update false, admin delete
- base44/entities/PermittingSourceDocument.jsonc — unchanged; only authenticated metadata reads introduced
- src/components/permitting/SourceTextEvidenceBrowser.jsx and PDFViewer.jsx — reused, unchanged

## Verification / limits
Four focused Node tests passed: metadata capture/nonmutation/exact canonical identity, fingerprint/legacy/changed versions, contradictory citation/captured metadata, and existing exact source-navigation callback compatibility.
Immutable draft comparison tests passed earlier in this unit.
Actual source-evidence UI passed Chromium checks at 320, 390 and 1280 px, with synthetic draft/source/text API fixtures, production CSS and external requests blocked. Includes both saved snapshots, full quotes, match/difference/unknown states, changed review metadata, explicit text reads, exact-record retries, missing/foreign/unlinked source, unsafe URL omission, late-read exclusion, preserved focus/draft/comparison, no snapshot mutations, job actions or overflow.
Actual generation/review/save/reopen/revision harness also passed all three viewports, including deterministic source metadata capture and unchanged inheritance, synthetic save retry and no job writes. The earlier 205-draft pagination/revision harness passed all three viewports during this unit.
One initial evidence-browser assertion expected an unknown version for an unsafe recorded archive URL; its actual unequal metadata was correctly flagged, and the assertion was corrected. No product behavior was changed to satisfy that assertion.
After the sandbox restarted, temporary Playwright/Chromium/system browser dependencies were restored outside the repository. The latest restored run passed. No app dependency manifest/lockfile change.
Targeted ESLint and git diff --check passed. Final npm run build exited 0 after the final product change; ordinary success output is suppressed by Vite logLevel error. Existing browser-data warnings remain.
These are synthetic checks, not authenticated employee or deployed frontend acceptance. External PDF byte loading in the new dialog was not independently exercised; preview uses the existing viewer. No employee login retries attempted.

## Deployment / records / settings
No frontend publication/deployment. No backend/entity/RLS/integration changes. No production records, clients/jobs/shared files or relationships were modified. No source refresh, authority approval, research AI calls or dispatcher/settings changes. No live dispatcher settings were remeasured.
Research defaults remain policy: enabled; 15 minutes; 5 jurisdictions/cycle; 20 active/in-flight; 40 attempts/day; retry limit 3; failed LLM attempts count. Do not present defaults as newly measured live settings.
Archive limits remain one new downloadable file/refresh, fetch 12s/upload 15s/extraction 20s. Preserve manual/pinned/hashed archives. HTML portals are links. Same-host deterministic harvesting and exact jurisdiction evidence remain required.

## Progress / next chunk / checkpoint
Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; Task 2 partial; 2 of 4 tasks complete. No fixed coverage counts advanced. Ohio first.
This dated handoff is saved with the named checkpoint “Permitting saved workflow citation evidence review and source snapshots verified”. The exact checkpoint ID/Git are returned after saving; use the final report/tool receipt or version history. The previous checkpoint above is not the completed unit's checkpoint.
The saved workflow review packet is now complete; see the latest completed unit and next chunk at the top of this handoff.
Authenticated employee persistence, physical-page text acceptance and broader employee sign-in acceptance remain pending. Use a real session if available; do not loop on login or stall independent prototype work.
Remaining roadmap: source collection/archiving/text acceptance; office/parent authority reconciliation; OH then KY coverage; source monitoring; exact matching/maps/action progress; evidence-based workflow features; explicit safe job integration; rollout/accessibility/mobile/concurrency acceptance. Historical source exceptions remain open where documented.
Protect all live client/shared records, files, permissions and relationships and every concurrent CCS change. Permitting-only disposable fixtures remain authorized by docs/permitting-development-authorization-2026-10-14.md. No frontend publication without explicit permission. One meaningful work unit per Continue, verify, checkpoint and stop.
