# Fleet Work Orders browser acceptance (synthetic only)

Run `node scripts/test-fleet-work-order-browser.mjs` from `/app` after `npm run build`. The suite mounts the **existing** Fleet Work Orders page and its real work-order, Start Work and confirmation dialogs in isolated, local Vite, using the production build's CSS. Only unrelated Fleet navigation and repair-estimate UI are stubbed.

The `mockBase44.js` module supplies synthetic work orders/equipment and implements fake `fleetWorkOrderAction` responses entirely in browser memory. Every outside-origin network request is blocked and fails the suite. **Never replace the mock with the production Base44 client or add live-record browser tests.** This suite does not publish and cannot prove authenticated production acceptance, Bouncie behavior or server-side mutation semantics.

Playwright and Chromium are deliberately installed *outside* the app so they don't alter production dependencies:

```bash
mkdir -p /tmp/fleet-browser-check
npm install --prefix /tmp/fleet-browser-check --no-save --no-package-lock playwright@1.63.0
/tmp/fleet-browser-check/node_modules/.bin/playwright install chromium
# If a clean Debian sandbox lacks Chromium system libraries:
# /tmp/fleet-browser-check/node_modules/.bin/playwright install-deps chromium
cd /app
npm run build
node scripts/test-fleet-work-order-browser.mjs
```

Use `FLEET_PLAYWRIGHT_PATH=/absolute/path/to/playwright/index.mjs` if the package was installed elsewhere. The suite creates and removes a temporary Vite harness under `/tmp`.

Windows note: point `FLEET_PLAYWRIGHT_PATH` at the install with a `file:///` URL (e.g. `file:///C:/tmp/fleet-browser-check/node_modules/playwright/index.mjs`). The generated Vite entry resolves pages through `/@fs/${appRoot}`, and the dev server sets `fs.strict:false` because `os.tmpdir()` can return an 8.3 short path whose realpath escapes the allow-list string match. The runner verifies both desktop and narrow mobile viewports; creation/editing, filtered-out results, board migration, completion and reopen confirmations, keyboard Escape/Tab, and refresh retry following a successful synthetic mutation.

For the **real Fleet Repair Estimate dialog** (rather than the stub in the work-order suite), run `node scripts/test-fleet-repair-estimate-browser.mjs` after the build. It uses the same external Playwright installation and an in-memory synthetic `fleetRepairEstimateAction` fixture. The recovery scenarios cover failed loads, keyboard retry, lost submission acknowledgments, server-status reconciliation, conflicting drafts and late GET responses across reopen. Every outside-origin request is blocked. Never point either suite at live records.

For **Fleet Requests**, run `node scripts/test-fleet-requests-browser.mjs` after the build. It mounts the existing requests page and dialogs with synthetic requests, Fleet parts and fluids; the coverage checks request creation, ordering, the nested receive confirmation, and exact linked Fleet inventory updates. Outside-origin requests are blocked, and no live records are used.

For **Bouncie trip selection**, run `node scripts/test-fleet-tracking-trip-race-browser.mjs` after the build. It mounts the existing Fleet Tracking page with synthetic Bouncie responses and deterministically delays earlier trip-history requests across vehicle and date-range changes. Outside-origin requests are blocked.

Retain real, authenticated production browser acceptance as a separate manual check: do not save or complete a live Fleet work order just for testing.
