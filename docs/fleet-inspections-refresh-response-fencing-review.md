# Fleet Inspections refresh response fencing and dialog error surfacing

Reviewed: 2026-10-22. App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).

## Findings and changes

Overlapping Fleet Inspections page loads applied whichever response finished last. The page's `load`
has five callers — initial mount, `startInspection`, `saveTemplate`, and the inspection runner's
`onSaved`/`onCompleted` — so a draft save, completion, template save, or inspection start could overlap
an earlier refresh. A slower earlier response could restore stale template, inspection, equipment, and
user state over a newer snapshot, project its failure over a pending refresh, or clear the loading
indicator while a newer load was still in flight.

`FleetInspections.jsx` now sequences each load with `loadSequenceRef`, matching the Fleet Requests and
Fleet Maintenance fencing. Only the latest-started request applies state; older responses settle without
projecting stale snapshots or clearing a newer loading state.

Two dialog actions previously swallowed failures into the page-level `setError`, which renders behind
the open modals. `startInspection` failures were invisible inside `StartInspectionDialog` (which had no
error display at all), and `saveTemplate` failures never reached `TemplateDialog`'s existing error state
because `onSave` resolved normally. Both handlers now reject on failure: the start dialog wraps `onStart`
and shows a local error banner, and the template dialog's existing catch displays save errors. Server-side
`creation_key` idempotency on `inspection_start` and `expected_updated_date` on `template_update` are
unchanged; retried actions remain safe.

## Verification

- Three deterministic extracted-handler races reproduced the stale-write, loading-clear, and error-bleed
  failures before the guard and pass after it.
- Four extracted-handler dialog tests proved start/save failures previously resolved silently and confirm
  they now reject for the open dialog to display, while success paths still open the runner / close the
  dialog and refresh.
- Fleet request unit-cost, load-race, work-order refresh, and maintenance load-race regressions.
- Targeted ESLint, production build (`BASE44_LEGACY_SDK_IMPORTS=true`), and `git diff --check`.
- Global typecheck diagnostics remain pre-existing; zero mention Fleet or Bouncie.

No production Fleet records were modified. Nothing was published or deployed.
