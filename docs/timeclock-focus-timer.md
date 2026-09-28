# CCS personal Focus Timer

The global, opt-in **Focus Timer** is a Pomodoro-style visual planning aid, mounted once in `src/Layout.jsx` for signed-in users. Its floating button remains accessible on the CCS pages, above the mobile bottom navigation. The dialog contains a visual countdown, an optional 120-character task, focus presets (10/15/25/45/60 minutes), short-break presets (3/5/10/15 minutes), Start/Pause/Resume/Reset and a manual Focus/Break switch. Finishing a block opens a visual prompt; a break does not start automatically.

**Separation from payroll is deliberate:** This timer must never read or modify official punches, break records, Work Pause, Current Work labor segments, approvals, corrections, pay periods or audit records. Its countdown uses device wall-clock deadlines only for personal planning. A Focus Timer break is NOT an official unpaid or paid break and does NOT change tracked work hours.

Per-user state is stored only in the current browser's localStorage key, scoped by authenticated user ID (or email when an ID is absent). The mounted component is keyed by the current account to avoid carrying one person's task into another person's view. The countdown uses an absolute deadline, so refresh, background tabs and missed intervals do not shorten or extend the session. Tabs on the same browser origin synchronize using storage events; **it does not sync between devices**, and if browser storage is disabled, refresh persistence cannot be guaranteed. Only a completed focus block increments the personal count, and a duplicate refresh cannot increment it again. It is not a productivity, attendance, job-costing or payroll metric.

Testing:

```sh
node scripts/validate-focus-timer.mjs
npm run build
node scripts/test-focus-timer-browser.mjs
```

The browser harness uses an isolated local Vite page, actual focus-timer UI, synthetic account IDs, and a separate Playwright Chromium installation. It blocks all outside-origin web requests. To supply another Playwright installation, set `FOCUS_PLAYWRIGHT_PATH` to its absolute `index.mjs` path. Do not import live Base44 auth or SDK into this harness.

**Release:** Source/checkpoint does not make the feature live. Obtain explicit permission to publish, then verify the actual hosted app's mobile positioning, accessibility, route changes, browser refresh, signed-out behavior, and Work Pause priority. Preserve existing Time Clock safeguards.
