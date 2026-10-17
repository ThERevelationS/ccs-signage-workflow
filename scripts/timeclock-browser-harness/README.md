# Isolated Time Clock browser acceptance

Run from the CCS app repository root:

```bash
node scripts/setup-timeclock-browser.mjs
npm run build
node scripts/test-timeclock-pay-period-browser.mjs
node scripts/test-timeclock-quickclock-browser.mjs
```

Chromium/Playwright are not declared as production dependencies. The setup command installs pinned Playwright 1.64.1 in the operating system temporary directory under `timeclock-browser-check` and downloads its matching Chromium into Playwright's browser cache. The harness uses that dedicated installation by default. This removes the dependency on a Fleet test installation. To use another installation, set `TIMECLOCK_PLAYWRIGHT_PATH` to its absolute `index.mjs` path and install its matching Chromium. Setup can be rerun after sandbox recreation or temporary directory cleanup; it leaves the app package manifests unchanged. The harness creates and deletes a temporary Vite project; it reads built CCS CSS from `dist/assets`.

The tests mount **the actual** `src/components/timeclock/PayPeriodManager.jsx` in desktop and mobile Chromium contexts. Calls from the page are redirected to a localhost-only fixture; the fixture invokes the **actual** `base44/functions/timeClockAction/entry.ts` handler under the in-memory synthetic SDK exported by `validate-timeclock-pay-period-recovery.mjs`. Two independent browser contexts share the same synthetic backend data and coordinator. They cover ordinary create, narrow-phone sizing, simultaneous administrator overlap conflict, and lost-response recovery on reload with the same request ID. Browser errors and any outside-origin HTTP requests fail the suite.

**Verified 2026-10-16 (America/New_York):** all four scenarios passed in headless Chromium 156 with Playwright 1.64.1 inside the Base44 sandbox. This includes two isolated browser contexts and a real page reload after a simulated lost acknowledgement. No production records or authentication were used.

## Quick Clock and Clock Out browser acceptance

The Quick Clock harness mounts the real `QuickClockSection`, `ClockOutDialog`, and related controls. The same real backend handler runs against disposable in-memory identities and rows. Hardware recognition, shell authentication, and WorkOrder loading are explicitly replaced by local fixture modules. Every backend action is allowlisted; no hosted SDK, production token, or outside-origin HTTP request is permitted.

**Verified 2026-10-16 (America/New_York): 6/6 Chromium scenarios passed.** These cover confirmed Clock Out and refresh cleanup; uncertain Clock Out followed by a real page reload and exact request/body replay; lost acknowledgement after commit followed by authoritative completion without resubmission; same-tab employee switching with isolated private notes and retained original retry; independent desktop/phone browser contexts with separate session storage; and denied recovery storage failing before any backend Clock Out. Session storage assertions verify snapshots contain no credentials. The fixture establishes each active shift through the real backend Clock In handler before browser testing.

These six scenarios use real browser reload and browser storage but synthetic identities and database storage. They do not establish hosted login behavior, deployed database atomicity, physical-device behavior, or release readiness.

**Isolation:** Never import production Base44 auth or SDK in this harness. Do not send user cookies, live employee/payroll data, or production session tokens to fixtures. This harness creates no Base44 records; fixture storage is in memory and resets each case. It does not prove that Base44's *real* `updateMany` provides atomic conditional updates or that live multi-session concurrency and hosted authentication work. Those remain separate gated nonproduction acceptance steps before publication.
