// Chromium race acceptance for the existing FleetTracking page.
// Bouncie and Fleet reads are synthetic; requests to all outside origins are blocked.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-tracking-trip-race-"));
const harness = path.join(appRoot, "scripts/fleet-browser-harness");
const mockUi = path.join(harness, "mockFleetTracking.jsx");
let vite, browser, passed = 0;
const aliases = [
  { find: "@/api/base44Client", replacement: path.join(harness, "mockFleetTracking.js") },
  { find: "@/components/auth/EmailGate", replacement: mockUi },
  { find: "@/components/fleet/FleetModuleNav", replacement: mockUi },
  { find: "@/components/fleet/FleetSidebar", replacement: mockUi },
  { find: "@/components/fleet/FleetMap", replacement: mockUi },
  { find: "@/components/fleet/VehiclePanel", replacement: mockUi },
  { find: "@/components/fleet/AlertSettingsModal", replacement: mockUi },
  { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
];

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const css = (await readdir(path.join(appRoot, "dist/assets"))).find(name => name.endsWith(".css"));
  if (!css) throw new Error("Run npm run build before browser acceptance.");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/styles.css'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { MemoryRouter } from "react-router-dom";',
    `import FleetTracking from "/@fs/${appRoot.replace(/\\/g, "/")}/src/pages/FleetTracking.jsx";`,
    'createRoot(document.getElementById("root")).render(<MemoryRouter><FleetTracking /></MemoryRouter>);',
  ].join("\n"));
  vite = await createServer({
    configFile: false, root: scratch, plugins: [react()], resolve: { alias: aliases },
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [appRoot, scratch], strict: false } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  async function runCase(name, run) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const runtimeErrors = [];
    const outsideRequests = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("request", request => {
      if (request.url().startsWith("http") && !request.url().startsWith(origin)) outsideRequests.push(request.url());
    });
    await page.route("**/*", route => route.request().url().startsWith("http") && !route.request().url().startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue());
    try {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Select VIN-SYNTH-A" }).waitFor();
      await run(page);
      assert.deepEqual(runtimeErrors, [], "Browser runtime errors");
      assert.deepEqual(outsideRequests, [], "Synthetic tracking acceptance must not contact outside origins");
      console.log("PASS " + name);
      passed += 1;
    } finally {
      await page.close();
    }
  }

  await runCase("Late vehicle trip response cannot replace current vehicle or clear its loading state", async page => {
    await page.evaluate(() => { window.__fleetTrackingFixture.deferNextTripImei = "IMEI-SYNTH-A"; });
    await page.getByRole("button", { name: "Select VIN-SYNTH-A" }).click();
    await page.waitForFunction(() => window.__fleetTrackingFixture.pendingTripResolvers.length === 1);
    await page.evaluate(() => { window.__fleetTrackingFixture.deferNextTripImei = "IMEI-SYNTH-B"; });
    await page.getByRole("button", { name: "Select VIN-SYNTH-B" }).click();
    await page.waitForFunction(() => window.__fleetTrackingFixture.pendingTripResolvers.length === 2);
    assert.equal(await page.getByTestId("selected-vehicle").last().innerText(), "VIN-SYNTH-B");

    await page.evaluate(() => {
      const index = window.__fleetTrackingFixture.pendingTripResolvers.findIndex(item => item.imei === "IMEI-SYNTH-A");
      window.__fleetTrackingFixture.pendingTripResolvers.splice(index, 1)[0].resolve();
    });
    await page.waitForFunction(() => window.__fleetTrackingFixture.completedTripRequests.some(query => query.imei === "IMEI-SYNTH-A"));
    await page.waitForTimeout(50);
    assert.equal(await page.getByTestId("trip-load-state").last().innerText(), "loading",
      "An older request must not clear the current vehicle's loading state");
    assert.equal(await page.getByTestId("trip-list").last().innerText(), "",
      "An older vehicle's trips must not appear under the current vehicle");

    await page.evaluate(() => {
      const index = window.__fleetTrackingFixture.pendingTripResolvers.findIndex(item => item.imei === "IMEI-SYNTH-B");
      window.__fleetTrackingFixture.pendingTripResolvers.splice(index, 1)[0].resolve();
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="trip-list"]')?.innerText.includes("trip-IMEI-SYNTH-B"));
    assert.equal(await page.getByTestId("trip-load-state").last().innerText(), "ready");
    assert.equal(await page.getByTestId("selected-vehicle").last().innerText(), "VIN-SYNTH-B");
  });

  await runCase("Late range response cannot replace the more recent history range", async page => {
    await page.getByRole("button", { name: "Select VIN-SYNTH-B" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="trip-list"]')?.innerText.includes("trip-IMEI-SYNTH-B"));
    const initialCount = await page.getByTestId("trip-list").last().locator("button").count();
    await page.evaluate(() => { window.__fleetTrackingFixture.deferNextTripImei = "IMEI-SYNTH-B"; });
    const range = page.getByRole("combobox", { name: "Trip history range" });
    await range.selectOption("30");
    await page.waitForFunction(() => window.__fleetTrackingFixture.pendingTripResolvers.length === 1);
    await range.selectOption("90");
    await page.waitForFunction(count => document.querySelectorAll('[data-testid="trip-list"] button').length > count + 4, initialCount);
    const currentRangeTrips = await page.getByTestId("trip-list").last().innerText();

    await page.evaluate(() => window.__fleetTrackingFixture.pendingTripResolvers.shift().resolve());
    await page.waitForFunction(() => window.__fleetTrackingFixture.completedTripRequests.filter(query => query.imei === "IMEI-SYNTH-B").length > 5);
    await page.waitForTimeout(50);
    assert.equal(await page.getByTestId("trip-list").last().innerText(), currentRangeTrips,
      "The older 30-day response must not overwrite the current 90-day results");
    assert.equal(await page.getByTestId("trip-load-state").last().innerText(), "ready");
  });

  console.log("BROWSER_ACCEPTANCE_PASS=" + passed);
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
