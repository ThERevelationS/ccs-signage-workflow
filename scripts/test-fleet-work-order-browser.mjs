// Real Chromium keyboard acceptance for the existing Fleet Work Orders UI.
// The entire test app uses a synthetic Base44 module; outside requests are blocked.
// Requires Playwright + Chromium installed outside /app (set FLEET_PLAYWRIGHT_PATH).
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-browser-acceptance-"));
const source = path.join(appRoot, "scripts/fleet-browser-harness");
let vite;
let browser;
let passed = 0;

const alias = [
  { find: "@/api/base44Client", replacement: path.join(source, "mockBase44.js") },
  { find: "@/utils", replacement: path.join(source, "mockBase44.js") },
  { find: "@/components/fleet/FleetModuleNav", replacement: path.join(source, "mockComponents.jsx") },
  { find: "@/components/fleet/FleetRepairEstimateDialog", replacement: path.join(source, "mockComponents.jsx") },
  { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
];

try {
  // Serve the actual Fleet Work Orders page and dialogs, not a reconstructed UI.
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const builtAssets = await readdir(path.join(appRoot, "dist/assets"));
  const css = builtAssets.find((name) => name.endsWith(".css"));
  if (!css) throw new Error("Production CSS is missing. Run npm run build before browser acceptance.");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"), [
    "<!doctype html><html><head><meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<link rel='stylesheet' href='/styles.css'></head>",
    "<body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>",
  ].join(""));
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { MemoryRouter } from "react-router-dom";',
    'import FleetWorkOrders from "/@fs/app/src/pages/FleetWorkOrders.jsx";',
    'createRoot(document.getElementById("root")).render(',
    '  <MemoryRouter><FleetWorkOrders /></MemoryRouter>',
    ');',
  ].join("\n"));
  vite = await createServer({
    configFile: false, root: scratch, plugins: [react()],
    resolve: { alias },
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [appRoot, scratch] } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  async function caseRun(name, viewport, run) {
    const page = await browser.newPage({ viewport });
    const runtimeErrors = [];
    const outsideRequests = [];
    page.on("pageerror", (err) => runtimeErrors.push(err.message));
    page.on("request", (request) => {
      if (request.url().startsWith("http") && !request.url().startsWith(origin)) {
        outsideRequests.push(request.url());
      }
    });
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith("http") && !route.request().url().startsWith(origin)) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    try {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Fleet Work Orders" }).waitFor();
      await page.locator("#fleet-work-order-toggle-wo-open").waitFor();
      await run(page);
      assert.deepEqual(runtimeErrors, [], "Browser runtime errors");
      assert.deepEqual(outsideRequests, [], "External requests are forbidden in synthetic acceptance");
      console.log("PASS " + name);
      passed += 1;
    } finally {
      await page.close();
    }
  }

  await caseRun("Desktop: create under Completed filter restores focus to status", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("combobox", { name: "Filter by work order status" }).selectOption("completed");
    await page.getByRole("button", { name: "New Fleet Work Order" }).click();
    const dialog = page.getByRole("dialog", { name: "New Fleet Work Order" });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Close Fleet work order dialog" })
      .evaluate((el) => document.activeElement === el), true, "Dialog close button gets initial focus");
    await dialog.getByRole("combobox", { name: "Equipment" }).selectOption("eq-synthetic");
    await dialog.getByRole("textbox", { name: "Title" }).fill("Created in browser acceptance");
    await dialog.getByRole("button", { name: "Create Work Order" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
    assert.match(await page.getByRole("status").innerText(), /Created WO-SYNTH-NEW-1.*no longer matches/);
    assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
    await page.getByRole("combobox", { name: "Filter by work order status" }).selectOption("all");
    await page.locator("#fleet-work-order-toggle-wo-created-1").waitFor();
  });

  await caseRun("Desktop: edit to Cancelled under Active filter keeps a safe focus", { width: 1440, height: 900 }, async (page) => {
    await page.locator("#fleet-work-order-toggle-wo-open").click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit WO-SYNTH-OPEN" });
    await dialog.getByRole("combobox", { name: "Status" }).selectOption("cancelled");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
    assert.match(await page.getByRole("status").innerText(), /Saved WO-SYNTH-OPEN.*no longer matches/);
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await caseRun((viewport.width < 500 ? "Mobile" : "Desktop") + ": Start Work board migration restores focus",
      viewport, async (page) => {
        await page.getByRole("button", { name: "Board", exact: true }).click();
        await page.getByRole("button", { name: /Start work on WO-SYNTH-OPEN/ }).click();
        const dialog = page.getByRole("dialog", { name: "Start Work" });
        await dialog.getByRole("button", { name: "Start Work", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.dataset?.fleetBoardOpen === "wo-open");
        assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.orders.find((w) => w.id === "wo-open").status), "in_progress");
        assert.equal(await page.locator('button[data-fleet-board-open="wo-open"]:visible').count(), 1);
      });
  }

  await caseRun("Desktop: confirmed save plus refresh failure exposes retry, not resubmit", { width: 1440, height: 900 },
    async (page) => {
      await page.locator("#fleet-work-order-toggle-wo-open").click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit WO-SYNTH-OPEN" });
      await dialog.getByRole("textbox", { name: "Title" }).fill("Saved despite synthetic refresh failure");
      await page.evaluate(() => { window.__fleetBrowserFixture.failNextWorkOrderList = true; });
      await dialog.getByRole("button", { name: "Save Changes" }).click();
      await dialog.waitFor({ state: "hidden" });
      const retry = page.getByRole("button", { name: "Retry refresh" });
      await retry.waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("Retry refresh"));
      assert.equal(await retry.evaluate((el) => document.activeElement === el), true);
      assert.match(await page.getByRole("alert").innerText(), /Saved WO-SYNTH-OPEN successfully.*do not repeat/);
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
      await retry.click();
      await retry.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
      assert.equal(await page.locator("#fleet-work-order-toggle-wo-open").innerText()
        .then((text) => text.includes("Saved despite synthetic refresh failure")), true);
    });

  await caseRun("Desktop: nested completion Escape stays in dialog; confirmed completion restores filtered focus",
    { width: 1440, height: 900 }, async (page) => {
      await page.locator("#fleet-work-order-toggle-wo-open").click();
      await page.getByRole("button", { name: "Complete", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Complete WO-SYNTH-OPEN" });
      await dialog.getByRole("textbox", { name: "Corrective Action *" }).fill("Synthetic completed work");
      await dialog.getByRole("button", { name: "Complete Work Order" }).click();
      const confirmation = page.getByRole("alertdialog", { name: /Complete WO-SYNTH-OPEN/ });
      await confirmation.waitFor();
      assert.equal(await confirmation.getByRole("button", { name: "Cancel" })
        .evaluate((el) => document.activeElement === el), true);
      await page.keyboard.press("Shift+Tab");
      assert.equal(await confirmation.getByRole("button", { name: "Complete Work Order" })
        .evaluate((el) => document.activeElement === el), true);
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      await dialog.waitFor();
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 0);
      await dialog.getByRole("button", { name: "Complete Work Order" }).click();
      await confirmation.getByRole("button", { name: "Complete Work Order" }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
      assert.match(await page.getByRole("status").innerText(), /Completed WO-SYNTH-OPEN.*no longer matches/);
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
    });

  await caseRun("Desktop: reopening a Completed work order restores filtered focus",
    { width: 1440, height: 900 }, async (page) => {
      await page.getByRole("combobox", { name: "Filter by work order status" }).selectOption("completed");
      await page.locator("#fleet-work-order-toggle-wo-done").click();
      await page.getByRole("button", { name: "Reopen", exact: true }).click();
      const confirmation = page.getByRole("alertdialog", { name: /Reopen WO-SYNTH-DONE/ });
      await confirmation.waitFor();
      await confirmation.getByRole("button", { name: "Reopen Work Order" }).click();
      await confirmation.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
      assert.match(await page.getByRole("status").innerText(), /Reopened WO-SYNTH-DONE.*no longer matches/);
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.orders.find((w) => w.id === "wo-done").status), "in_progress");
    });

  await caseRun("Mobile: refresh failure retry stays keyboard-accessible without duplicating edit",
    { width: 390, height: 844 }, async (page) => {
      await page.locator("#fleet-work-order-toggle-wo-open").click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit WO-SYNTH-OPEN" });
      await dialog.getByRole("textbox", { name: "Title" }).fill("Synthetic mobile refresh recovery");
      await page.evaluate(() => { window.__fleetBrowserFixture.failNextWorkOrderList = true; });
      await dialog.getByRole("button", { name: "Save Changes" }).click();
      await dialog.waitFor({ state: "hidden" });
      const retry = page.getByRole("button", { name: "Retry refresh" });
      await retry.waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("Retry refresh"));
      assert.equal(await retry.evaluate((el) => document.activeElement === el), true);
      await page.keyboard.press("Enter");
      await retry.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filter by work order status");
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 1);
    });

  await caseRun("Desktop: dialog keyboard trap and Escape return to opener", { width: 1440, height: 900 },
    async (page) => {
      const opener = page.getByRole("button", { name: "New Fleet Work Order" });
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "New Fleet Work Order" });
      await dialog.waitFor();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.getByRole("button", { name: "Create Work Order" })
        .evaluate((el) => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await opener.evaluate((el) => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => window.__fleetBrowserFixture.actions.length), 0);
    });

  console.log("BROWSER_ACCEPTANCE_PASS=" + passed);
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
