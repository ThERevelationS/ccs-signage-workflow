# Foundation Navigation 15 - Browser-Tab Design Recovery

## Scope And Baseline

- Concrete estimator only; no router, authentication service, backend, schema, or pricing-engine changes.
- Materials14 checkpoint: `6aed76ee7322493a6099ca82`, commit `74039de907f94c1ef39942733991e08c94f643cf`.
- `page-before.jsx` preserves the accepted page; `baseline-browser-results.json` and `baseline-n*.png` preserve the actual-router loss reproduction.
- Native Back/Forward and an app-shell link reproduced loss of unsent description edits with zero backend writes.
- The real reload warning already retained edits when dismissed.
- The pure `foundationDraftRecovery.js` storage boundary has separate synthetic tests; this does not prove page integration.
- No production records, paid integrations, publishing, or deployment.

## Settled Integration

1. Read the verified staff identity from `EmailGate.useAuth()`, not the platform AuthContext.
2. Scope sessionStorage by owner, Foundation source ID, and estimate ID through the existing versioned helper.
3. Read only after the current source/estimate load is accepted. Never auto-restore, auto-save, or delete an offered draft.
4. Scope every offer/warning to the exact store instance. Owner changes invalidate the editor generation and reload the source.
5. Write design drafts synchronously from accepted commit, Undo, and Redo, using the matching acknowledged backend version as the base.
6. Preserve current in-memory edits when storage fails. Show a truthful warning; ordinary explicit source Save remains available.
7. Pause editing, autosave, and mutation paths while a stored draft needs an explicit decision. Guard handlers as well as native controls.
8. Restore only after rereading the exact offered storage revision. Merge sanitized design fields onto the fresh backend object and normalize as one undoable edit.
9. Confirm replacement when the backend version changed or the current editor is dirty. Preserve source identity, current CAS version, receipts, customer identity, pricing metadata, and acknowledged cost snapshots.
10. Discard only after confirmation and an exact CAS clear. A newer stored revision must survive.
11. Capture the draft store/revision with a source-save attempt. Clear only after verified, fully-current source acknowledgment for the same owner/store/context.
12. Never clear drafts on failure, superseded edits, old-context or unmounted completion, Back, or Save As Copy.
13. A fully-current source save with partial Builder synchronization may clear its exact browser draft; existing durable source receipts retain Builder recovery.
14. Keep beforeunload protection additive. Do not monkeypatch history or replace the app router.

## Explicit Limitations

- Recovery includes only the helper's design allowlist. Customer identity, customer pricing, markup/override values, authoritative totals, status, receipts, and delivery snapshots are not restored.
- UI must say design edits are backed up, not that every unsent change is recoverable.
- sessionStorage is browser-tab recovery, not a backend save, cross-device backup, or authorization boundary.
- Native/app navigation may leave the editor; this unit recovers design edits on return rather than universally intercepting navigation.
- Storage denial, quota exhaustion, and oversized drafts must be visible. Closing the tab can destroy its sessionStorage.
- O-004 remains open for broader conflict, pricing-edit navigation, and live authorization acceptance.

## Required Synthetic Browser Evidence

- N1: Real Back/Forward offers the draft, shows backend description before choice, restores the exact unsent description, stable component ID, dirty state, and zero writes.
- N2: App-shell leave/return; canceled discard preserves the offer/raw storage; confirmed discard removes only that revision and keeps backend data.
- N3: Actual beforeunload dismissal retains edits; accepted reload offers recovery, then explicit Restore recovers the exact description without writes.
- N4: Explicit successful Save uses the current source CAS, synchronizes once, clears the exact matching browser draft, and shows saved state.
- N5: Genuinely delayed source save plus newer edits retains the newer raw draft/dirty state, skips stale Builder/observer calls, survives navigation, and retries against the latest acknowledged source version.
- N6: Owner A's draft never appears for B and remains recoverable when A returns.
- N7: A changed backend version requires confirmation; forbidden tampered fields cannot overwrite current identity, version, receipts, or customer/pricing metadata; Save uses the new CAS version.
- N8: Throwing storage/quota failure shows a warning, retains current edits, makes no false backup claim, and still permits valid explicit source Save.
- Browser fixtures use the actual page/router/store, synthetic service boundaries, independent frozen financial expectations, strict network/error telemetry, and guaranteed server/browser teardown.

## Activation Gate

- Review the entire page delta against `page-before.jsx` and every changed fixture/helper.
- Inspect actual test results, source-bundle inputs, and visual evidence; do not equate fixture success with live RLS/provider verification.
- Recheck current remote source and builder/worktree state before writes; stop for conflicting changes.
- Create a restore checkpoint, use CLI edit/write for the reviewed unit only, verify exact readback/build/status, then create the final named checkpoint.
