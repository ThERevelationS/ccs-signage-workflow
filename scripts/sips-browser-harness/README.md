# SIPS Revisit browser acceptance

## Isolated Chromium suite (safe to run against this repository)

Run from `/app` after a successful `npm run build`:

```bash
mkdir -p /tmp/sips-browser-check
npm install --prefix /tmp/sips-browser-check --no-save --no-package-lock --ignore-scripts playwright@1.63.0
/tmp/sips-browser-check/node_modules/.bin/playwright install chromium
# Only if required on a fresh sandbox:
# /tmp/sips-browser-check/node_modules/.bin/playwright install-deps chromium
node scripts/test-sips-clear-revisit-browser.mjs
node scripts/test-sips-checklist-reload-focus-browser.mjs
```

The runner mounts the **actual SIPS page and production CSS** inside a temporary local Vite server. It replaces Base44 auth, Work Order data, global settings and unrelated dialogs with isolated synthetic fixtures. Two independent Chromium browser contexts share a conditional-write fixture. Requests outside the temporary local origin are blocked and fail the suite. Nothing is published, no credentials are loaded, and no production records are created or changed. The browser driver is installed outside `/app` to avoid changing production dependencies.

Covered: desktop/mobile Clear Revisit and Escape; concurrent stale-clear versus newer scheduling; safe review and retry; legacy completed-WIP reopening; simultaneous reopen; **browser-forced superseded completed-WIP recovery reads with matching and divergent Revisit outcomes**; conflict-safe reopen after another date edit; focus restoration when a reopened item is visible or hidden by filters; preserving intentional focus changes during a save; 320px calendar and dialog fit; long failures on a 320×480 screen; blocked dismissal and repeat submission during an in-flight Clear.

## Actual checklist-dialog reload-focus acceptance

The additional `test-sips-checklist-reload-focus-browser.mjs` runner mounts the **real `ProductChecklistDialog.jsx`** with the production CSS and isolated synthetic Work Order, authorization-list and settings fixtures. All external requests are blocked. Save attempts are deliberately rejected by a local replacement for the persistence function; no Work Order (real or synthetic) is written. The suite checks desktop and 320px successful-reload heading focus, an interrupted reload's error focus followed by a successful retry, and mobile unsaved-draft discard confirmation (cancel preserves the draft; confirm reload clears it and restores focus). It does not test authenticated permissions, production network behavior or actual saved writes.

## Verified concurrent reopening focus recovery (October 15, 2026)

The board's completed-WIP reopen now recognizes a concurrent identical save **only after its existing read-only board refresh verifies both `sip_completed === false` and the expected Revisit date**. The losing session does not resubmit a stale conditional write, and focus returns to the visible Active row (or board heading if the filters hide it). A mismatch or unreadable refresh remains a conflict rather than being reported as successful. The isolated Clear Revisit/WIP Chromium suite passes all 14 scenarios, including simultaneous desktop/mobile reopening and the forced supersession cases; the separate real-checklist reload-focus suite passes all four scenarios. These synthetic checks do not replace authenticated nonproduction acceptance.

## Superseded WIP recovery verification (October 16, 2026)

The read-only WIP reopen reconciliation now tolerates one board-refresh supersession with **at most one bounded additional verification read**. A superseded response is never trusted to clear a conflict or request focus; only a successful current board snapshot matching **both** the intended `sip_completed` and `sip_revisit_date` can do so. If the fresh Revisit date differs or the verification read fails, the conflict stays visible and no additional write occurs. Deterministic synthetic regressions in `validate-sips-refresh-ordering.mjs` exercise the superseded matching case, divergent Revisit, and failed read. Chromium now also forces this race against the actual SIPS page: a synthetic conditional-write loser, a paused recovery snapshot, and the real Work Order Details `onUpdate` callback that supersedes it. The test asserts exactly one bounded verification read, zero resubmitted writes, and the correct focus/error behavior for both matching and divergent dates. Authenticated nonproduction acceptance remains separate.

## Outstanding: authenticated two-browser QA

**The synthetic suite does not demonstrate backend authorization or authenticated cross-session behavior.** Before claiming full acceptance, use an explicitly authorized *nonproduction* CCS environment with two real, independent test accounts and test Work Orders. Do not test mutations on production Work Orders, use production credentials in scripts, bypass the normal sign-in system, copy confidential production records into fixtures, or publish as part of QA.

Acceptance checklist:

1. Verify the nonproduction environment has the current SIPS code, Work Order schema, permission rules, and conditional-write backend. Confirm both test accounts have the intended roles and employee boundaries.
2. Create disposable **nonproduction** Active, future-Revisit and completed-WIP records. Confirm future dates sort in Revisit Later (earliest first); today, past and no date stay Active.
3. In two separate authenticated browser contexts, start Clear Revisit in session A, schedule a new future date in session B, then confirm A. A must show a conflict, must not clear B's newer date, and must require review before a new confirmation.
4. Repeat on narrow mobile and reverse which browser edits first. Check focus, Escape, screen width, long errors, pending/disabled controls, no duplicate saves and the expected final queue.
5. Exercise simultaneous completed-WIP reopening. Verify a single conditional change, correct queue, preserved unrelated edits, and refusal of stale reopen after a different session adds a future date.
6. With an account **not permitted to edit**, confirm writes fail at the backend as well as being disabled in the UI. Verify authorized users remain within their own allowed records and that confidential Work Order information is not exposed.
7. Verify all test records and audit history are retained or cleaned up using the nonproduction environment's approved procedure. Record the environment, build/commit, browser versions and actual results.

Only mark authenticated QA complete after those steps run successfully; a local synthetic PASS is not a substitute.
