# Backlog Masterplan — 226 open items

Working ledger for the unattended backlog sweep. Source of truth for item status is `ESTIMATOR_BACKLOG.md` ([DONE] marks); this doc is the execution plan + per-phase ledger.

## Rules for every agent

1. **Re-verify each item against current remote code before implementing** — annotations may be stale. If an item is already satisfied, report it "already-done"; if infeasible, report "blocked: <reason>" — never fake a fix.
2. **Pull remote before editing** (`npx base44@latest sandbox read`); the sandbox is source of truth. Verify timed-out writes landed before retrying.
3. **Do not edit `ESTIMATOR_BACKLOG.md` or `INTEGRATION_PROGRESS.md`** — the parent marks items after your report.
4. `esbuild` compile every touched file; run the listed contract suites; report per-item status.
5. Honest degradation for external deps (SMTP env, publish, webhooks) — code-complete with explicit fallback, note as "degraded".
6. No site publish. Function deploys happen parent-side.

## Phase ledger (parent updates status)

| Phase | Scope | Items | Status |
|---|---|---|---|
| A | §15 Data Integrity & Concurrency | #351–375 (25) | DONE |
| B | §4–11 feature completions + standalone | #77,78,79,83,88,92,104,118,127,145,167,170,174,180,185,192,201,205,242,244,246,251,255,257,262,271 + reorder/drive/map/job-msgs | |
| C | §14 Notifications & Alerts | #326–350 (25) | |
| D | §12 Reporting & Dashboards | #277–300 (11) | |
| E | §13 Search/Deep-links/Saved views | #301–325 (14) | |
| F | §19 Import/Export & Migration | #451–475 (25) | |
| G | §20 Admin/Settings/Misc | #476–500 (25) | |
| H | §17 Performance & Rate-Limit | #401–425 (25) | |
| I | §18 Accessibility & UX | #426–450 (25) | |
| J | §16 Test Coverage | #376–400 (25) | |
| K | Final sweep + verification | stragglers | |

Phase order rationale: correctness/hardening first; big feature surfaces middle; sweeps (perf/a11y) after churn settles; tests last so they cover final code.
