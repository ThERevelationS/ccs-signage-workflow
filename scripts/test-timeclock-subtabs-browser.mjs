// Real Time Clock admin subtabs (Reports / PTO / Overtime) in isolated Chromium
// with synthetic reads. No hosted API, auth, or production records.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const { pathToFileURL } = await import("node:url");
const { chromium } = await import(process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  pathToFileURL(path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs")).href);
const scratch = realpathSync(await mkdtemp(path.join(tmpdir(), "timeclock-subtabs-browser-")));
const failures = [];
let vite, browser, passed = 0;

// Synthetic read rows keyed by entity name for the staffDataRead fixture.
const ROWS = {
  TimeEntry: [
    { id: "te-1", user_email: "worker@synthetic.invalid", user_name: "Synthetic Employee",
      status: "clocked_out", clock_in: "2026-10-26T13:00:00.000Z",
      clock_out: "2026-10-26T22:30:00.000Z", total_hours: 9, lunch_minutes: 30,
      approval_status: "unreviewed",
      job_allocations: [{ is_inhouse: true, inhouse_task: "Shop", minutes: 540 }] },
  ],
  WorkOrder: [{ id: "wo-1", client_name: "Synthetic Client", title: "Synthetic WO",
    status: "in_production", deleted: false, created_date: "2026-10-01T00:00:00.000Z",
    due_date: "2026-10-20T00:00:00.000Z" }],
  UserPTOBalance: [{ id: "pto-1", user_email: "worker@synthetic.invalid",
    vacation_hours: 40, sick_hours: 24, personal_hours: 8 }],
  AuthorizedEmail: [
    { id: "ae-1", email: "admin@synthetic.invalid", full_name: "Synthetic Admin", role: "admin" },
    { id: "ae-2", email: "worker@synthetic.invalid", full_name: "Synthetic Employee", role: "employee" },
  ],
  GlobalSettings: [{ id: "gs-1", key: "time_clock_overtime_rules", value: "" }],
  TimeOffRequest: [],
};

function fixturePlugin() {
  return { name: "isolated-timeclock-subtabs", configureServer(server) {
    server.middlewares.use("/__read", async (req, res) => {
      let input = "";
      for await (const chunk of req) input += chunk;
      const { entity } = JSON.parse(input);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ items: ROWS[entity] || [], item: null }));
    });
  } };
}

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "junction");
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
  functions: { async invoke(name) { throw new Error("Unexpected function: " + name); } },
  integrations: { Core: new Proxy({}, { get: () => async () => ({}) }) },
};
export const staffEntities = new Proxy({}, { get: (_t, name) => new Proxy({}, {
  get: (_u, method) => async (...args) => {
    if (!["filter","list","get"].includes(method)) throw new Error(name+"."+String(method)+" blocked");
    const response = await fetch("/__read", { method:"POST",
      headers:{"content-type":"application/json"}, body:JSON.stringify({entity:name,method,args}) });
    const data = await response.json();
    return method === "get" ? data.item : data.items;
  } }) });
export const useAuth = () => ({ sessionToken: "synthetic-admin",
  currentUser: { id:"synthetic-admin", email:"admin@synthetic.invalid",
    full_name:"Synthetic Admin", role:"admin" } });
export const getSessionToken = () => "synthetic-admin";
export const getSessionUser = () => useAuth().currentUser;
export const getStoredAdminSettingsCapability = () => null;
export const getStoredAdminSettingsCapabilityExpiry = () => null;
export const hasStoredAdminSettingsAuthorization = () => false;
export const storeAdminSettingsAuthorization = () => {};
export const clearAdminSettingsAuthorization = () => {};
export function AuthProvider({children}) { return children; }
export async function loadAllEntityRows({ entity }) { return entity.filter(); }
export async function loadSingleGlobalSetting() { return null; }
export async function saveGlobalSettingValueIfUnchanged() { return { success: true, saved: false }; }
export async function invokeFleet(name) { throw new Error("Unexpected fleet call: " + name); }
`);
  const f = (p) => "/@fs/" + path.join(root, p).split(path.sep).join("/");
  await writeFile(path.join(scratch, "main.jsx"), `
import React from "react";
import {createRoot} from "react-dom/client";
import ReportsDashboard from "${f("src/components/timeclock/TimeClockReportsDashboard.jsx")}";
import PTOManagement from "${f("src/components/admin/PTOManagement.jsx")}";
import OvertimeRulesManager from "${f("src/components/admin/OvertimeRulesManager.jsx")}";
const which = new URLSearchParams(location.search).get("tab") || "reports";
const views = { reports: <ReportsDashboard/>, pto: <PTOManagement/>, overtime: <OvertimeRulesManager/> };
createRoot(document.getElementById("root")).render(views[which]);
`);
  const mock = path.join(scratch, "mock.js");
  vite = await createServer({ configFile: false, root: scratch,
    plugins: [react(), fixturePlugin()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: mock },
      { find: "@/components/auth/EmailGate", replacement: mock },
      { find: "@/components/staff/staffEntities", replacement: mock },
      { find: "@/components/estimator/loadAllEntityRows", replacement: mock },
      { find: "@/components/shared/globalSettingsPersistence", replacement: mock },
      { find: "@/components/fleet/fleetInvoke", replacement: mock },
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.join(root, "node_modules/react/jsx-dev-runtime.js") },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } }, logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  for (const [tab, label] of [["reports", "Reports"], ["pto", "PTO"], ["overtime", "Overtime"]]) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("http") && new URL(url).origin !== origin) {
        failures.push(`Outside-origin request in ${label}: ` + url);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}?tab=${tab}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    // No error boundary / blank page allowed
    const bodyText = await page.locator("body").innerText();
    assert.ok(bodyText.trim().length > 50, `${label} tab rendered content`);
    await page.screenshot({ path: path.join(scratch, `subtab-${tab}.png`), fullPage: true });
    if (pageErrors.length) {
      console.error(`${label} page errors:`, pageErrors);
      failures.push(...pageErrors.map((e) => `${label}: ${e}`));
    }
    console.log(`${label}: ${pageErrors.length === 0 ? "PASS" : "FAIL"} (${bodyText.trim().length} chars rendered)`);
    await context.close();
    if (!pageErrors.length) passed++;
  }
  assert.deepEqual(failures, [], "No runtime errors or outside-origin requests");
  console.log(`PASS ${passed}/3 subtabs mounted without runtime errors`);
} finally {
  await browser?.close();
  await vite?.close();
}
