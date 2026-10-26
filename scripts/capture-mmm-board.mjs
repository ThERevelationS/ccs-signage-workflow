// Visual capture of the rebuilt Monday Morning Meeting board: mounts the real
// page in headless Chromium against the same isolated synthetic fixture as the
// acceptance suite, then writes desktop + mobile PNGs to /tmp/mmm-shots.
// No production auth/SDK, no external requests, no live data.
import { mkdtemp, writeFile, symlink, copyFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const browserDriver = process.env.SIPS_PLAYWRIGHT_PATH || "/tmp/sips-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(browserDriver);
const scratch = await mkdtemp(path.join(tmpdir(), "mmm-capture-"));
const outDir = "/tmp/mmm-shots";
const clone = (value) => JSON.parse(JSON.stringify(value));

const fixture = {
  rows: [
    {
      id: "synthetic-mmm-alpha", title: "Alpha channel letters",
      client_name: "Alpha Signs", description: "Fabricate channel letters",
      current_task_assigned_to: "Monday Morning Meeting",
      current_task_description: "MMM walkthrough",
      is_rider: false, completed: false, deleted: false, sip_completed: false,
      mmm_last_discussed_at: "", mmm_defer_until: "", mmm_tasks: [],
      notes: [], work_notes: [], estimate_amount: 4200,
      created_date: "2026-09-01T12:00:00Z", updated_date: "000000001",
    },
    {
      id: "synthetic-mmm-beta", title: "Beta pylon reface",
      client_name: "Beta Retail", description: "Synthetic install",
      current_task_assigned_to: "Installation",
      current_task_description: "Synthetic install",
      is_rider: false, completed: false, deleted: false, sip_completed: false,
      mmm_last_discussed_at: "", mmm_defer_until: "",
      mmm_tasks: [{ id: "t1", text: "Confirm lift reservation", assigned_to: "Sam Installer", due_date: "", completed: false, created_by: "Meeting User", timestamp: "2026-10-20T14:00:00Z" }],
      notes: [{ id: "n1", text: "Send permit revision", completed: false, assigned_to: "Pat PM" }],
      work_notes: [{ id: "w1", text: "Waiting on landlord sign-off", type: "permitting", created_by: "Pat PM", timestamp: "2026-10-22T15:00:00Z" }],
      estimate_amount: 9800,
      created_date: "2026-09-02T12:00:00Z", updated_date: "000000001",
    },
    {
      id: "synthetic-mmm-gamma", title: "Gamma monument sign",
      client_name: "Gamma Health", description: "Post-WIP check-in",
      current_task_assigned_to: "Installation",
      current_task_description: "Punch list",
      is_rider: false, completed: false, deleted: false, sip_completed: true,
      mmm_last_discussed_at: "", mmm_defer_until: "", mmm_tasks: [],
      notes: [], work_notes: [], estimate_amount: 15750,
      created_date: "2026-09-03T12:00:00Z", updated_date: "000000001",
    },
  ],
};

function syntheticBackend() {
  return {
    name: "mmm-capture-backend",
    configureServer(server) {
      server.middlewares.use("/__mmm_fixture", async (req, res) => {
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const request = JSON.parse(body);
          let result;
          if (request.op === "list") {
            const q = request.query || {};
            result = fixture.rows.filter(row =>
              (!q.is_rider || !row.is_rider) &&
              (!Object.hasOwn(q, "completed") || row.completed === q.completed) &&
              (!q.deleted || row.deleted !== true)).map(clone);
          } else if (request.op === "get") {
            const row = fixture.rows.find(r => r.id === request.id);
            result = row ? clone(row) : null;
          } else if (request.op === "updateMany") {
            const q = request.query || {};
            const row = fixture.rows.find(r => r.id === q.id && String(r.updated_date) === String(q.updated_date));
            if (!row) {
              result = { updated: 0 };
            } else {
              Object.assign(row, request.patch?.$set || {});
              row.updated_date = String(Number(row.updated_date) + 1).padStart(9, "0");
              result = { updated: 1 };
            }
          } else {
            throw new Error("Unexpected synthetic operation: " + request.op);
          }
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

const alias = [
  { find: "@/api/base44Client", replacement: path.join(scratch, "mockBase44.js") },
  { find: "@/components/auth/EmailGate", replacement: path.join(scratch, "mockAuth.jsx") },
  { find: "@/components/workflow/WorkOrderDetailsDialog", replacement: path.join(scratch, "mockDetails.jsx") },
  { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
];

await mkdir(outDir, { recursive: true });
await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
const assets = await readdir(path.join(appRoot, "dist/assets"));
const css = assets.find((name) => name.endsWith(".css"));
await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
await writeFile(path.join(scratch, "index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
  '<script type="module" src="/main.jsx"></script></body></html>');

await writeFile(path.join(scratch, "mockDetails.jsx"), [
  'export default function SyntheticDetails({onUpdate, onClose}) {',
  'return <div role="dialog" aria-label="Synthetic Work Order Details">',
  '<button type="button" onClick={() => { onUpdate(); }}>Synthetic Details Refresh</button>',
  '<button type="button" onClick={() => { onClose(); }}>Close Synthetic Details</button>',
  '</div>; }',
].join("\n"));

await writeFile(path.join(scratch, "mockAuth.jsx"), [
  'export function getSessionToken() { return "synthetic-session"; }',
  'export function clearAdminSettingsAuthorization() {}',
  'export function getStoredAdminSettingsCapability() { return null; }',
  'export function getStoredAdminSettingsCapabilityExpiry() { return null; }',
  'export function hasStoredAdminSettingsAuthorization() { return false; }',
  'export function storeAdminSettingsAuthorization() {}',
  'export const useAuth = () => ({',
  '  currentUser: { id: "synthetic-user", email: "sips.qa@example.test", role: "admin" },',
  '  isRegistered: true,',
  '});',
  'export function AuthProvider({ children }) { return children; }',
  'export default function UnusedGate() { return null; }',
].join("\n"));

await writeFile(path.join(scratch, "mockBase44.js"), [
  'async function fixture(op, data = {}) {',
  '  const response = await fetch("/__mmm_fixture", {',
  '    method: "POST", headers: { "content-type": "application/json" },',
  '    body: JSON.stringify({ op, ...data }),',
  '  });',
  '  const result = await response.json();',
  '  if (!response.ok) throw new Error(result.error || "Synthetic fixture request failed");',
  '  return result;',
  '}',
  'const equal = (a, b) => {',
  '  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return true;',
  '  const normalize = value => Array.isArray(value) ? value.map(normalize) :',
  '    value && typeof value === "object" ? Object.keys(value).sort().reduce((result, key) => {',
  '      result[key] = normalize(value[key]); return result;',
  '    }, {}) : value;',
  '  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));',
  '};',
  'async function syntheticFieldHistoryAction(request) {',
  '  const before = await fixture("get", { id: request.entity_id });',
  '  if (!before) return { data: { success: false, error: "Synthetic Work Order not found" } };',
  '  const changed = Object.entries(request.next_fields || {}).find(([field, next]) =>',
  '    !Object.hasOwn(request.expected_fields || {}, field) ||',
  '    (!equal(before[field], request.expected_fields[field]) && !equal(before[field], next))',
  '  );',
  '  if (changed) return { data: { success: false, error: "changed in another session" } };',
  '  const changedGuard = Object.entries(request.guard_fields || {}).find(([field, expected]) => !equal(before[field], expected));',
  '  if (changedGuard) return { data: { success: false, error: "no longer matches loaded state" } };',
  '  if (Object.entries(request.next_fields || {}).every(([field, next]) => equal(before[field], next))) {',
  '    return { data: { success: true, record: before } };',
  '  }',
  '  const result = await fixture("updateMany", {',
  '    query: { id: request.entity_id, updated_date: before.updated_date },',
  '    patch: { $set: request.next_fields },',
  '  });',
  '  if (result.updated !== 1) return { data: { success: false, error: "changed during saving" } };',
  '  const after = await fixture("get", { id: request.entity_id });',
  '  return { data: { success: true, record: after } };',
  '}',
  'export const base44 = {',
  '  functions: { invoke: (name, request) => syntheticFieldHistoryAction(request) },',
  '  entities: {',
  '    WorkOrder: {',
  '      filter: (query, sort, limit, skip) => fixture("list", { query, sort, limit, skip }),',
  '      get: (id) => fixture("get", { id }),',
  '      updateMany: (query, patch) => fixture("updateMany", { query, patch }),',
  '    },',
  '    AuthorizedEmail: {',
  '      list: async () => [',
  '        { email: "sam@example.test", full_name: "Sam Installer", sales_roles: ["Task Assigned"] },',
  '        { email: "pat@example.test", full_name: "Pat PM", sales_roles: ["Task Assigned", "Project Manager", "Designer"] },',
  '      ],',
  '    },',
  '    GlobalSettings: {',
  '      filter: async (query) => query?.setting_key === "salesTaskDescriptions"',
  '        ? [{ setting_key: "salesTaskDescriptions", setting_value: { items: [',
  '          { text: "Synthetic install", page: "SIPs", wip: true },',
  '          { text: "MMM walkthrough", page: "MondayMorningMeeting", wip: false },',
  '          { text: "Punch list", page: "SIPs", wip: true },',
  '        ] } }]',
  '        : [],',
  '    },',
  '  },',
  '};',
].join("\n"));

await writeFile(path.join(scratch, "main.jsx"), [
  'import React from "react";',
  'import {createRoot} from "react-dom/client";',
  'import MondayMorningMeeting from "/@fs' + path.join(appRoot, "src/pages/MondayMorningMeeting.jsx") + '";',
  'createRoot(document.getElementById("root")).render(<MondayMorningMeeting />);',
].join("\n"));

const vite = await createServer({
  configFile: false, root: scratch, plugins: [react(), syntheticBackend()],
  resolve: { alias },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [appRoot, scratch] } },
  logLevel: "error",
});
await vite.listen();
const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

// Desktop: full board, then a row focused, then one row marked discussed so
// the parked section renders too.
let context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
let page = await context.newPage();
await page.goto(origin, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Monday Morning Meeting" }).waitFor();
await page.getByText("Alpha Signs").waitFor();
await page.getByText("Confirm lift reservation").waitFor();
await page.screenshot({ path: outDir + "/desktop-board.png", fullPage: true });

// Mark Beta discussed so the parked section shows its "discussed" chip.
await page.getByRole("checkbox", { name: "Mark Beta Retail as discussed this week" }).click();
await page.locator("#mmm-parked").getByText("Beta Retail").waitFor();
await page.screenshot({ path: outDir + "/desktop-discussed.png", fullPage: true });

// Focus-zoom on Alpha's row number.
await page.getByRole("button", { name: /Focus.*Alpha Signs|Alpha Signs.*focus/i }).first().click().catch(() => {});
await page.locator(".mmm-focus-row").first().waitFor({ timeout: 3000 }).catch(() => {});
await page.screenshot({ path: outDir + "/desktop-focused.png", fullPage: true });
await context.close();

// Mobile: board inside the viewport.
context = await browser.newContext({ viewport: { width: 360, height: 640 } });
page = await context.newPage();
await page.goto(origin, { waitUntil: "networkidle" });
await page.getByText("Alpha Signs").waitFor();
await page.screenshot({ path: outDir + "/mobile-board.png", fullPage: true });
await context.close();

await browser.close();
await vite.close();
console.log("CAPTURED: " + outDir + "/{desktop-board,desktop-discussed,desktop-focused,mobile-board}.png");
