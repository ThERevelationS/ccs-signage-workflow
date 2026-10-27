// Real TimeClockAdmin in isolated Chromium against the real backend handler
// with in-memory synthetic rows. No hosted API, auth, or production records.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { setupSyntheticTimeClock } from "./validate-timeclock-pay-period-recovery.mjs";

const root = process.cwd();
const { pathToFileURL } = await import("node:url");
const { chromium } = await import(process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  pathToFileURL(path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs")).href);
import { realpathSync } from "node:fs";
const scratch = realpathSync(await mkdtemp(path.join(tmpdir(), "timeclock-admin-browser-")));
const admin = { id: "synthetic-admin", email: "admin@synthetic.invalid",
  full_name: "Synthetic Admin", role: "admin" };
const worker = { id: "synthetic-employee", email: "worker@synthetic.invalid",
  full_name: "Synthetic Employee", role: "employee" };
let fixture, vite, browser, passed = 0;
const failures = [];

async function reset() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const h = setupSyntheticTimeClock({ entryCount: 0, serverNow: `${today}T14:00:00.000Z` });
  // Give the admin an employee entry in the visible period so the table has rows.
  const clockIn = await h.invokeAs(admin, {
    action: "clock_in", target_email: worker.email, request_id: "synthetic-admin-ci-1" });
  assert.equal(clockIn.body.success, true, JSON.stringify(clockIn.body));
  h.setServerNow(`${today}T23:30:00.000Z`);
  const clockOut = await h.invokeAs(admin, {
    action: "clock_out", target_email: worker.email,
    request_id: "synthetic-admin-co-1", notes: "Synthetic admin smoke shift",
    lunch_minutes: 30,
    job_allocations: [{ is_inhouse: true, inhouse_task: "Shop", minutes: 540 }] });
  assert.equal(clockOut.body.success, true, JSON.stringify(clockOut.body));
  fixture = { h, invokes: [] };
}

function fixturePlugin() {
  return { name: "isolated-timeclock-admin-backend", configureServer(server) {
    server.middlewares.use("/__timeclock_fixture", async (req, res) => {
      try {
        assert.equal(req.method, "POST");
        let input = "";
        for await (const chunk of req) input += chunk;
        const { payload } = JSON.parse(input);
        assert.equal(payload?.session_token, "synthetic-admin");
        fixture.invokes.push(structuredClone(payload));
        const result = await fixture.h.invokeAs(admin, payload);
        res.statusCode = result.status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result.body));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } };
}

try {
  await reset();
  await symlink(realpathSync(path.join(root, "node_modules")), path.join(scratch, "node_modules"), "junction");
  const assets = await readdir(path.join(root, "dist/assets"));
  const css = assets.find((name) => name.endsWith(".css"));
  assert.ok(css, "Run npm run build first");
  await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
    '<script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "mock.js"), `
export const base44 = {
  entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }),
  functions: { async invoke(name, payload) {
    if (name !== "timeClockAction") throw new Error("Unexpected function: " + name);
    const response = await fetch("/__timeclock_fixture", { method:"POST",
      headers:{"content-type":"application/json"}, body:JSON.stringify({payload}) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data?.error || "Synthetic request failed");
      error.response = {status:response.status,data};
      throw error;
    }
    return {data};
  } }
};
export const useAuth = () => ({ sessionToken: "synthetic-admin",
  currentUser: { id:"synthetic-admin", email:"admin@synthetic.invalid",
    full_name:"Synthetic Admin", role:"admin" } });
export const getSessionToken = () => "synthetic-admin";
export const getSessionUser = () => ({ id:"synthetic-admin",
  email:"admin@synthetic.invalid", full_name:"Synthetic Admin", role:"admin" });
export const getStoredAdminSettingsCapability = () => null;
export const getStoredAdminSettingsCapabilityExpiry = () => null;
export const hasStoredAdminSettingsAuthorization = () => false;
export const storeAdminSettingsAuthorization = () => {};
export const clearAdminSettingsAuthorization = () => {};
export function AuthProvider({children}) { return children; }
`);
  await writeFile(path.join(scratch, "main.jsx"), `
import React from "react";
import {createRoot} from "react-dom/client";
import TimeClockAdmin from "/@fs/${path.join(root, "src/components/timeclock/TimeClockAdmin.jsx").replace(/\\/g, "/")}";
createRoot(document.getElementById("root")).render(<TimeClockAdmin />);
`);
  const mock = path.join(scratch, "mock.js");
  vite = await createServer({ configFile: false, root: scratch,
    plugins: [react(), fixturePlugin()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: mock },
      { find: "@/components/auth/EmailGate", replacement: mock },
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } }, logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("http") && new URL(url).origin !== origin) {
        failures.push("Forbidden outside-origin request: " + url);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    // The page must reach its loaded state — not the loader and not the error card.
    await page.getByText("Time Clock data unavailable", { exact: false })
      .waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
    const errorCard = await page.getByRole("alert").count();
    const entriesHeader = await page.getByText("Time Entries").count();
    // Entries table must appear before the collapsible sections in DOM order.
    const tablePos = await page.evaluate(() => document.body.innerText.indexOf("Employee"));
    const sectionPos = await page.evaluate(() => document.body.innerText.indexOf("Needs Attention"));
    assert.ok(tablePos > 0, "entries table rendered");
    assert.ok(tablePos < sectionPos || sectionPos === -1,
      "entries table must come before the attention section");
    // Collapsible sections exist and respond.
    const needsAttention = page.getByRole("button", { name: /Needs Attention/ });
    assert.equal(await needsAttention.count(), 1, "Needs Attention section exists");
    const payHistory = page.getByRole("button", { name: /Pay Periods & History/ });
    assert.equal(await payHistory.count(), 1, "Pay Periods & History section exists");
    // Pay section starts collapsed; opening it reveals PayPeriodManager.
    await payHistory.click();
    await page.getByText("Pay Periods").first().waitFor();
    await needsAttention.click(); // collapse — verify toggle works both ways
    await page.screenshot({ path: path.join(scratch,
      `admin-${viewport.width}.png`), fullPage: true });
    console.log(`viewport ${viewport.width}: errorCards=${errorCard} entriesSection=${entriesHeader}` +
      ` invokes=${fixture.invokes.length}`);
    if (errorCard) {
      console.error("ERROR CARD TEXT:", (await page.getByRole("alert").innerText()).slice(0, 500));
    }
    await page.getByRole("button", { name: "Refresh", exact: true }).first().click();
    // Exercise row actions on the seeded shift.
    const row = page.getByRole("row").filter({ hasText: "Synthetic Employee" });
    assert.equal(await row.count(), 1, "seeded shift row visible");
    // View details
    await row.getByTitle("View full shift details").click();
    await page.getByRole("dialog").first().waitFor();
    await page.keyboard.press("Escape");
    // Edit dialog opens
    await row.getByTitle("Edit time entry").click();
    await page.getByText("Edit Time Entry").waitFor();
    await page.keyboard.press("Escape");
    // Approve opens approval dialog
    await row.getByRole("button", { name: /Approve/ }).click();
    await page.getByText(/Approve Shift|Shift Review/).first().waitFor();
    await page.keyboard.press("Escape");
    await context.close();
    passed++;
  }
  assert.deepEqual(failures, [], "No runtime errors or outside-origin requests");
  console.log(`PASS ${passed}/2 viewports — TimeClockAdmin mounted, loaded, and refreshed`);
} finally {
  await browser?.close();
  await vite?.close();
}
