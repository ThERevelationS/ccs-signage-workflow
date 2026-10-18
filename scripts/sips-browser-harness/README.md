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
node scripts/test-sips-template-selection-browser.mjs
node scripts/test-sips-template-unsaved-navigation-browser.mjs
```

The runner mounts the **actual SIPS page and production CSS** inside a temporary local Vite server. It replaces Base44 auth, Work Order data, global settings and unrelated dialogs with isolated synthetic fixtures. Two independent Chromium browser contexts share a conditional-write fixture. Requests outside the temporary local origin are blocked and fail the suite. Nothing is published, no credentials are loaded, and no production records are created or changed. The browser driver is installed outside `/app` to avoid changing production dependencies.

Covered: desktop/mobile Clear Revisit and Escape; concurrent stale-clear versus newer scheduling; safe review and retry; legacy completed-WIP reopening; simultaneous reopen; **browser-forced superseded completed-WIP recovery reads with matching, divergent, failed-verification and repeatedly superseded outcomes**; conflict-safe reopen after another date edit; focus restoration when a reopened item is visible or hidden by filters; preserving intentional focus changes during a save; 320px calendar and dialog fit; long failures on a 320×480 screen; blocked dismissal and repeat submission during an in-flight Clear.

## Actual checklist-dialog reload-focus acceptance

The additional `test-sips-checklist-reload-focus-browser.mjs` runner mounts the **real `ProductChecklistDialog.jsx`** with the production CSS and isolated synthetic Work Order, authorization-list and settings fixtures. All external requests are blocked. Save attempts are deliberately rejected by a local replacement for the persistence function; no Work Order (real or synthetic) is written. The suite checks desktop and 320px successful-reload heading focus, an interrupted reload's error focus followed by a successful retry, and mobile unsaved-draft discard confirmation (cancel preserves the draft; confirm reload clears it and restores focus). It does not test authenticated permissions, production network behavior or actual saved writes.

## Actual Template Builder selection acceptance (October 16, 2026)

`test-sips-template-selection-browser.mjs` mounts the **real Template Builder and production CSS** in isolated Chromium contexts at desktop (1366px) and narrow-phone (320px) widths. It provides synthetic saved checklist rows (including answers and approvers), product templates, and reusable checklist options through read-only replacement readers. No production SDK or credentials are imported; external requests are blocked, and any persistence write is treated as a test failure. Eight browser scenarios exercise locked saved products and applied options, clear Saved/To add counts, pending-option selection/deselection, removing only a new pending checklist, disabled no-op Apply, and the actual Apply callback producing only newly selected option rows while preserving saved answers. Both viewports are checked for document overflow. This is synthetic UI acceptance, **not authenticated integration or permission testing**.

## Template Builder unsaved-navigation Chromium acceptance (October 17, 2026)

`test-sips-template-unsaved-navigation-browser.mjs` mounts the **real admin Template Builder component and production CSS** in isolated Chromium at desktop (1366px) and narrow-phone (320px) sizes. Synthetic readers supply two product checklists and two reusable checklist options, plus a separate already-saved Work Order answer. A test-only deferred-promise replacement for checklist-template persistence records attempted saves in browser memory and allows explicit resolution or rejection; **nothing reaches any backend**, production SDK or live Work Order. All outside-origin HTTP requests are blocked. Eighteen browser scenarios (nine per viewport) verify cancel/confirm behavior when switching an edited checklist option or product checklist, navigating tabs with unfinished item text, and closing with an unfinished checklist-option name; plus blocking editor/tab/close navigation during a pending save, preventing duplicate submits, retaining newer drafts after an older save resolves, and preserving failed drafts for deliberate retry. Following a failed save, Reload latest requires explicit confirmation before discarding dirty drafts; a successful read refreshes the actual editor from newly loaded data, while a failed read preserves the local draft and keeps the error visible. Cancel keeps drafts; explicit discard restores the last saved editor snapshot or closes only when confirmed. Both viewports have no document-wide horizontal overflow. These synthetic UI checks do not verify backend authorization, authenticated sessions or live persistence.

## Verified concurrent reopening focus recovery (October 15, 2026)

The board's completed-WIP reopen now recognizes a concurrent identical save **only after its existing read-only board refresh verifies both `sip_completed === false` and the expected Revisit date**. The losing session does not resubmit a stale conditional write, and focus returns to the visible Active row (or board heading if the filters hide it). A mismatch or unreadable refresh remains a conflict rather than being reported as successful. The isolated Clear Revisit/WIP Chromium suite passes all 16 scenarios, including simultaneous desktop/mobile reopening, forced supersession, and failed/repeated verification; the separate real-checklist reload-focus suite passes all four scenarios. These synthetic checks do not replace authenticated nonproduction acceptance.

## Superseded WIP recovery verification (October 16, 2026)

The read-only WIP reopen reconciliation now tolerates one board-refresh supersession with **at most one bounded additional verification read**. A superseded response is never trusted to clear a conflict or request focus; only a successful current board snapshot matching **both** the intended `sip_completed` and `sip_revisit_date` can do so. If the fresh Revisit date differs or the verification read fails, the conflict stays visible and no additional write occurs. Deterministic synthetic regressions in `validate-sips-refresh-ordering.mjs` exercise the superseded matching case, divergent Revisit, and failed read. Chromium now also forces this race against the actual SIPS page: a synthetic conditional-write loser, a paused recovery snapshot, and the real Work Order Details `onUpdate` callback that supersedes it. The test asserts exactly one bounded verification read, zero resubmitted writes, and the correct focus/error behavior for both matching and divergent dates. Two additional browser cases inject a failure into that final verification read or supersede that read again with another Work Order Details refresh; they verify the conflict stays visible, no unbounded retry occurs, and deliberate focus changes are respected. Authenticated nonproduction acceptance remains separate.

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
