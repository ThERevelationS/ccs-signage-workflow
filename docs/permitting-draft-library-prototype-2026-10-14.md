# Central permitting workflow draft library

Phase 10 / Milestone 1 / Task 2 remains partial. No fixed coverage counts changed.

Permitting Tracker and Jurisdictions now expose Workflow drafts. The library reads only PermittingWorkflowDraft, shows up to the most recent 100 records, searches names/jurisdictions/states/sign types/review notes and filters Ohio/Kentucky. Draft cards distinguish unapproved proposals, display proposed step and review-item counts, preserve review notes and open the actual designer from its saved snapshot without an AI call. Incomplete snapshots cannot be opened. Empty library, no matches, loading, failed load and retry are separate states. Reopening from the central library passes no WorkOrder, so no job-line action appears.

Actual library plus actual designer browser checks passed at 320/390/1280 with synthetic provider records, production CSS and external requests blocked. Covers state/search filters, saved snapshot and notes, disabled duplicate save, absence of job-line action, no results, failed load/retry, empty library and no horizontal overflow. Receipt: permitting-draft-library-browser-2026-10-14.json. Prior workflow draft browser scenarios also passed at all three widths after the initialSavedDraft addition.

Focused ESLint passed on library, designer and Permitting page. Final build exited 0. Diff check passed. Final list-limit explanatory wording changed after build; it is plain JSX text. Authenticated production-browser persistence/employee session compatibility remain pending; no real AI calls or production record writes were used in these checks. No frontend published, backend explicitly deployed, schema modified, shared permission changed or live client/job records changed. Concurrent CCS work preserved.

Next meaningful batch: review the document/source monitoring workspace and complete its most consequential missing employee flow (source changes → inspect evidence → clear next action), with synthetic desktop/mobile checks. Do not return to unrelated office identity audits. Exact live address resolution remains blocked by Google REQUEST_DENIED as documented in prior receipts.
