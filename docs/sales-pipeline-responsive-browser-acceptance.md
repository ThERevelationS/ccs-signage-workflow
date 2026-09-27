# Sales Pipeline — Phase 5 authenticated responsive browser acceptance

Status: **NOT RUN**. Code-level regression tests and builds do not substitute for authenticated browser/device testing. No live records should be changed solely for this checklist.

## Preconditions
- Confirm fresh Git HEAD, production-versus-preview environment, and a test account with appropriate permissions. Do not publish to perform acceptance.
- Use an existing authorized, non-sensitive test opportunity, or read-only checks where no safe test record exists. Do not use destructive actions or change production pricing, stages, Smartsheet mappings, or customer data just to test.
- Record browser, operating system, viewport dimensions, account role, environment, observed behavior, and screenshots of any defect without exposing private notes or costs.

## Responsive matrix — execute each scenario on each viewport

| Scenario | Narrow phone 360–390 px | Tablet 768–1024 px | Desktop 1280+ px |
| --- | --- | --- | --- |
| Workspace and Table/Board/Daily/Insights controls reachable without clipped menu or accidental horizontal page scroll | Not run | Not run | Not run |
| Current Pipeline search and compact filter controls usable, including clear/reset | Not run | Not run | Not run |
| Always-visible compact column checkboxes and horizontal preview preserved in column management | Not run | Not run | Not run |
| Column preset edit, Undo/Redo, Save & Close, and unsaved-navigation confirmation | Not run | Not run | Not run |
| Table/mobile cards and Board open same opportunity detail; Table ↔ Board preserves selected row when applicable | Not run | Not run | Not run |
| Previous/Next details navigation respects current filtered queue; filtering selected row away closes row-bound actions | Not run | Not run | Not run |
| Insights/Daily entry closes row-bound dialogs; return to Table has no stale search or hidden actions | Not run | Not run | Not run |
| Follow-up due/overdue indicators, reschedule options, and completion history visible without layout overflow | Not run | Not run | Not run |
| Won/Lost Outcomes versus Legacy History separation; outcome period does not narrow Current Insights | Not run | Not run | Not run |
| Non-admin cannot access admin-only actions, restricted notes, or costs; no console/runtime errors | Not run | Not run | Not run |

## Save and integration acceptance (only with approved safe test data)
1. Verify a non-destructive quick edit persists after refresh and remains conflict-safe across two sessions. Check CellHistory for the authorized user.
2. Verify status changes require Lost reason, preserve Won downstream handoff, and update stage timing only on a real transition. Do not change a live job solely for testing.
3. Verify quote timing is based on `date_estimate_sent`, missing dates show Quote Timing Missing, and future dates are blocked.
4. Inspect Smartsheet sync status read-only. Do not enable sync or create/delete records for browser acceptance; any two-way mutation requires a separate controlled integration test.

## Exit criteria
Record pass/fail/blocked per viewport and role with reproducible steps. A blocked authenticated browser session remains **unverified**, even if all static regressions and the production build pass. Do not mark Phase 5 browser acceptance complete until these checks have actually run. Phase 6 visual-reference research and proposal must precede visual edits.
