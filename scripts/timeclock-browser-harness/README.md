# Isolated Time Clock Pay Period browser acceptance

Run from the CCS app repository root:

```bash
node scripts/setup-timeclock-browser.mjs
npm run build
node scripts/test-timeclock-pay-period-browser.mjs
```

Chromium/Playwright are not declared as production dependencies. The setup command installs pinned Playwright 1.64.1 in the operating system temporary directory under `timeclock-browser-check` and downloads its matching Chromium into Playwright's browser cache. The harness uses that dedicated installation by default. This removes the dependency on a Fleet test installation. To use another installation, set `TIMECLOCK_PLAYWRIGHT_PATH` to its absolute `index.mjs` path and install its matching Chromium. Setup can be rerun after sandbox recreation or temporary directory cleanup; it leaves the app package manifests unchanged. The harness creates and deletes a temporary Vite project; it reads built CCS CSS from `dist/assets`.

The tests mount **the actual** `src/components/timeclock/PayPeriodManager.jsx` in desktop and mobile Chromium contexts. Calls from the page are redirected to a localhost-only fixture; the fixture invokes the **actual** `base44/functions/timeClockAction/entry.ts` handler under the in-memory synthetic SDK exported by `validate-timeclock-pay-period-recovery.mjs`. Two independent browser contexts share the same synthetic backend data and coordinator. They cover ordinary create, narrow-phone sizing, simultaneous administrator overlap conflict, and lost-response recovery on reload with the same request ID. Browser errors and any outside-origin HTTP requests fail the suite.

**Verified 2026-10-16 (America/New_York):** all four scenarios passed in headless Chromium 156 with Playwright 1.64.1 inside the Base44 sandbox. This includes two isolated browser contexts and a real page reload after a simulated lost acknowledgement. No production records or authentication were used.

**Isolation:** Never import production Base44 auth or SDK in this harness. Do not send user cookies, live employee/payroll data, or production session tokens to fixtures. This harness creates no Base44 records; fixture storage is in memory and resets each case. It does not prove that Base44's *real* `updateMany` provides atomic conditional updates or that live multi-session concurrency and hosted authentication work. Those remain separate gated nonproduction acceptance steps before publication.
