# Fleet Settings operations-health refresh fencing review

Date: 2026-10-23
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), branch `main`.

## Scope

Fence the two reloadable server-health refresh paths on the Fleet Settings admin
page so only the newest-started refresh projects operations-health state. This
completes load-response fencing across all Fleet module pages.

## Defects reproduced

`scripts/test-fleet-settings-load-race.mjs` executes the real extracted handler
bodies against deterministic deferred promises. 4/5 failed pre-fix (the fifth
asserts preserved rejection semantics and passes both ways):

1. **`runServerCheck`** is the shared operations-health refresh. It is re-fired
   by six callers: the "Refresh operations health" button (only state-guarded
   by `checking`), `runManualAutomation` after a manual automation run,
   `revokeMechanicLink`, `reconcileMechanicReceipt`, `runCutoverAction`, and
   `FleetSettingsEditor.onSaved`. The programmatic callers are not guarded by
   `checking`, so e.g. a revoke-triggered refresh can overlap a
   reconcile-triggered refresh — a slower earlier response overwrote newer
   `serverStatus`, `settings`, `connection`, `automationLogs`, `queueRows`,
   `receiptRows`, `mechanicLinks`, and `mechanicEquipment`, and its `finally`
   cleared the newer check's `checking` indicator.
2. **`runIntegrityAudit`** has the same shape: the "Refresh Setup Status"
   button plus unguarded calls from `revokeMechanicLink` and
   `reconcileMechanicReceipt` allowed a stale audit result to replace a newer
   one and flicker `integrityBusy`.

## Changes

- `src/pages/FleetSettings.jsx`
  - `checkSequenceRef` sequences `runServerCheck`: stale responses return before
    applying `serverStatus` (first await boundary) and before the whole second
    apply block (settings/connection/logs/queue/receipts/links/equipment);
    a superseded check cannot clear the newer check's `checking` indicator.
  - `integritySequenceRef` sequences `runIntegrityAudit` the same way for
    `integrity` and `integrityBusy`.
  - Error semantics preserved: neither function catches, so a failed refresh
    still rejects to its own caller (`revokeMechanicLink` shows the mechanic
    error, `runManualAutomation` shows the manual-run error, etc.) — fencing
    only suppresses state application and indicator clearing, never rejection.

## Tests

- `scripts/test-fleet-settings-load-race.mjs` — 5 deterministic real-handler
  tests: stale-check overwrite, `checking` control, preserved caller rejection
  with no stale state projection, stale-audit overwrite, and `integrityBusy`
  control.
- Pre-fix run reproduced the defects (4/5 fail); post-fix 5/5 pass.

## Boundaries preserved

- No production data read or written; tests use extracted source bodies and
  synthetic fixtures only.
- Mechanic bearer-link admin flows (create/revoke/reconcile/scope/estimate
  permission), cutover gate payloads including the frozen-source confirmation
  string, and the exact legacy QR URL are untouched.
- The mount-time load is a single-shot effect with no repeat callers and was
  left unchanged.
