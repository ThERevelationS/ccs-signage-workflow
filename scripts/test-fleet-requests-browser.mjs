// Isolated Chromium acceptance for the existing Fleet Requests page and dialogs.
// All entity/function responses stay in a synthetic in-memory fixture; outside requests are blocked.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-requests-browser-"));
const source = path.join(appRoot, "scripts/fleet-browser-harness");
let vite, browser, passed = 0;

const alias = [
  { find: "@/api/base44Client", replacement: path.join(source, "mockFleetRequests.js") },
  { find: "@/utils", replacement: path.join(source, "mockFleetRequests.js") },
  { find: "@/components/fleet/FleetModuleNav", replacement: path.join(source, "mockComponents.jsx") },
  { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
];

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const css = (await readdir(path.join(appRoot, "dist/assets"))).find((name) => name.endsWith(".css"));
  if (!css) throw new Error("Run npm run build before browser acceptance.");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/styles.css'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { MemoryRouter } from "react-router-dom";',
    'import FleetRequests from "/@fs/app/src/pages/FleetRequests.jsx";',
    'createRoot(document.getElementById("root")).render(<MemoryRouter><FleetRequests /></MemoryRouter>);',
  ].join("\n"));

  vite = await createServer({
    configFile: false, root: scratch, plugins: [react()], resolve: { alias },
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
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("request", (request) => {
      if (request.url().startsWith("http") && !request.url().startsWith(origin)) outsideRequests.push(request.url());
    });
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith("http") && !route.request().url().startsWith(origin)) return route.abort("blockedbyclient");
      return route.continue();
    });
    try {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Fleet Requests" }).waitFor();
      await page.getByRole("button", { name: "New Request" }).waitFor();
      await run(page);
      assert.deepEqual(runtimeErrors, [], "Browser runtime errors");
      assert.deepEqual(outsideRequests, [], "Synthetic acceptance must not contact outside origins");
      console.log("PASS " + name);
      passed += 1;
    } finally {
      await page.close();
    }
  }

  await caseRun("Desktop: create a Fleet-only parts request", { width: 1440, height: 900 }, async (page) => {
    await page.getByRole("button", { name: "New Request" }).click();
    const dialog = page.getByRole("dialog", { name: "New Fleet Request" });
    await dialog.getByLabel("Item Name").fill("Synthetic oil filter");
    await dialog.getByLabel("Part Number").fill("SYN-FILTER-02");
    await dialog.getByLabel("Quantity").fill("4");
    await dialog.getByLabel("Justification").fill("Browser acceptance only");
    await dialog.getByRole("button", { name: "Submit Request" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__fleetRequestsFixture.actions.length), 1);
    const action = await page.evaluate(() => window.__fleetRequestsFixture.actions[0]);
    assert.equal(action.name, "fleetRequestAction");
    assert.equal(action.payload.action, "create");
    assert.ok(action.payload.creation_key);
    assert.equal(action.payload.request.item_name, "Synthetic oil filter");
    assert.equal(action.payload.request.item_type, "part");
    assert.equal(Number(action.payload.request.quantity_needed), 4);
    assert.match(await page.locator("body").innerText(), /Synthetic oil filter/);
    assert.match(await page.locator("body").innerText(), /Fleet-only/);
  });

  await caseRun("Mobile: order then confirm receipt into the exact linked Fleet part", { width: 390, height: 844 }, async (page) => {
    await page.getByRole("button", { name: "Mark Ordered" }).click();
    const orderDialog = page.getByRole("dialog", { name: "Order Synthetic linked brake pad" });
    await orderDialog.getByLabel("Estimated Delivery").fill("2026-11-04");
    await orderDialog.getByLabel("Unit Cost").fill("12.50");
    await orderDialog.getByRole("button", { name: "Save Order Details" }).click();
    await orderDialog.waitFor({ state: "hidden" });

    const row = page.locator("div.rounded-xl").filter({ hasText: "Synthetic linked brake pad" }).first();
    await row.getByRole("button", { name: "Receive" }).click();
    const receiveDialog = page.getByRole("dialog", { name: "Receive Synthetic linked brake pad" });
    await receiveDialog.getByText("Exact Fleet inventory item linked").waitFor();
    assert.equal(await receiveDialog.getByLabel("Storage Location").isDisabled(), true);
    assert.equal(await receiveDialog.getByLabel("Stock Unit").isDisabled(), true);
    await receiveDialog.getByLabel("Quantity Received").fill("3");
    await receiveDialog.getByRole("button", { name: "Receive Into Fleet Inventory" }).click();

    const confirmation = page.getByRole("alertdialog", { name: "Receive Synthetic linked brake pad?" });
    await confirmation.waitFor();
    assert.equal(await page.evaluate(() => window.__fleetRequestsFixture.actions.length), 1,
      "Opening the receive confirmation must not mutate request or inventory");
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__fleetRequestsFixture.actions.length), 1);

    await receiveDialog.getByRole("button", { name: "Receive Into Fleet Inventory" }).click();
    await page.getByRole("alertdialog", { name: "Receive Synthetic linked brake pad?" })
      .getByRole("button", { name: "Receive Into Inventory" }).click();
    await receiveDialog.waitFor({ state: "hidden" });

    const state = await page.evaluate(() => window.__fleetRequestsFixture);
    assert.equal(state.actions.length, 2, "Order and confirmed receive each submit once");
    assert.equal(state.actions[0].payload.action, "order");
    assert.equal(state.actions[0].payload.id, "request-pending");
    assert.equal(state.actions[0].payload.estimated_delivery_date, "2026-11-04");
    assert.equal(Number(state.actions[0].payload.unit_cost), 12.5);
    assert.equal(state.actions[1].payload.action, "receive");
    assert.equal(state.actions[1].payload.id, "request-pending");
    assert.equal(state.actions[1].payload.expected_updated_date, "2026-10-21T12:00:00Z");
    assert.equal(Number(state.actions[1].payload.quantity_received), 3);
    assert.equal(state.parts.find((item) => item.id === "part-exact").quantity_on_hand, 10,
      "Only the exact Fleet part linked by ID receives the quantity");
    assert.equal(state.requests[0].status, "received");
    assert.ok(state.requests[0].receipt_applied_at, "Synthetic durable receipt marker is set once");
    assert.match(await row.innerText(), /received/);
  });

  console.log("BROWSER_ACCEPTANCE_PASS=" + passed);
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
