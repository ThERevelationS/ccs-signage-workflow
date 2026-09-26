# SIPS Revisit + completed-WIP browser acceptance

Status: **Pending authenticated browser acceptance.** The Base44 coding sandbox has no browser executable, Playwright/Puppeteer, or authenticated browser session. Do not mark these cases as browser-tested on the strength of simulated tests.

## Automated baseline (safe: no production calls)

Run `node --test scripts/validate-sips-board-revisit.mjs scripts/validate-sips-revisit-completion.mjs scripts/validate-sips-template-navigation.mjs scripts/validate-sips-template-saving.mjs`. The board script exercises actual SIPS handlers and the shared Work Order compare-and-set helper against isolated in-memory records, including two independently loaded sessions. It does **not** render the React UI or test authentication, network behavior, focus, or actual multi-browser updates.

## Prerequisites for browser sign-off

- Use an explicitly authorized **non-production test environment** with schema/settings parity and disposable synthetic Work Orders. Never create, edit, reopen, or clear real customer Work Orders merely to test. Do not modify authentication/RLS. If no such environment exists, perform only read-only visual checks in production and leave write cases pending.
- Sign in as two authorized QA users (Session A and Session B) in **separate browser profiles**. Confirm both legitimately have SIPS access to the same disposable Work Order.
- Prepare test-only jobs: a normal SIPS Work Order with a checklist; a WIP task-description Work Order with a valid completed checklist; and a **completed WIP** test record carrying a legacy future `sip_revisit_date` for the reopen case. Use the existing WIP configuration; do not alter production settings.
- Record test date/timezone and use locally interpreted `yyyy-MM-dd` dates for today, yesterday, tomorrow, and two distinct future dates. Check desktop and approximately 390px-wide phone viewports. Screenshots and logs must be free of real customer details, tokens, and internal prices.

## Browser cases — all remain pending until observed

| Case | Browser actions | Required result |
| --- | --- | --- |
| Date boundary and board sorting | Set test job Revisit to no date, yesterday, today, tomorrow, and two different future dates. Refresh A and B. | No date/today/past appear in Active; tomorrow and later appear only in Revisit Later, earliest first. No horizontal SIPS overflow on phone or desktop. |
| Checklist Save → Revisit | Open disposable job checklist in A. Complete/continue as allowed, Save, use Revisit confirmation to set a future date, then Save changes. | Checklist inputs persist; validation is not bypassed; board re-sorts to Revisit Later after save. |
| Competing quick edits | Load same dated job in A and B; change Revisit in A; without refreshing B, select a *different* date in B. | B's stale change is blocked with a clear message and latest data reload; A's saved date remains authoritative. |
| Open confirmation, stale clear | On a future-dated job, open Clear Revisit confirmation in B. Change its date in A. Confirm Clear in B. | B's confirmation does **not** erase A's newer date; conflict banner displays and board reloads. |
| Successful clear | On a future-dated job in A, open Clear confirmation and confirm without concurrent edits; refresh B. | Both boards show the item in Active; Revisit date is cleared once. |
| Completed WIP, legacy future date | Open the seeded, synthetic completed-WIP job in both sessions. In A select Reopen; refresh B. | Future legacy Revisit is cleared atomically with completion flag; both show the job in Active, not Revisit Later. |
| Completed WIP, simultaneous reopen | In A and B, click Reopen at nearly the same time on the same synthetic completed WIP. | One effective change; both settle on the same Active item, without duplicate records or errors that imply loss. |
| Stale reopen against newly scheduled date | Load a synthetic completed WIP with no Revisit in A and B. Set a future Revisit using an authorized test editor in B. Attempt to Reopen from A's stale view. | A's stale reopen is rejected, latest record is shown, and the future date and completed status are preserved. |
| Today/past-date reopen | Reopen a synthetic completed WIP dated today, then repeat with yesterday. | Existing today/past date remains recorded, and item returns to Active. |
| Save pending / double-click | During a slow test-only connection, click clear/reopen twice; separately refresh another browser during saving. | No duplicate write or silent rollback. Confirmation remains safely busy; latest board state is ultimately displayed. |
| Mobile, keyboard, and error | Repeat clear and reopen actions at phone width; use keyboard Tab, Enter and Escape for date controls and confirmation. Trigger a simulated conflict. | No hidden primary action/horizontal scroll; reachable actions, readable alert, safe focus behavior and no premature success indication. |

## Evidence and stop conditions

For each browser case, record browser/version, session roles, viewport, date/timezone, synthetic record ID, observed before/after queue, result, and any sanitized screenshot or console error. If a conflict corrupts data or the UI contradicts stored state, **stop**, preserve the synthetic fixture and logs, and open a contained follow-up. Do not retry on real records or publish changes to make the test pass.

Sign-off requires both the automated suite and the actual authenticated browser cases above. Code-level regression tests alone are not sign-off.
