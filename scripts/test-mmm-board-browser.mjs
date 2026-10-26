// Real Chromium acceptance of the rebuilt Monday Morning Meeting board with
// isolated browser contexts and a shared in-memory, CAS-protected synthetic
// Work Order fixture. This never imports production auth/SDK, makes external
// requests, or changes live data.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const browserDriver = process.env.SIPS_PLAYWRIGHT_PATH || "/tmp/sips-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(browserDriver);
const source = path.join(appRoot, "scripts/sips-browser-harness");
const scratch = await mkdtemp(path.join(tmpdir(), "mmm-browser-acceptance-"));
const clone = (value) => JSON.parse(JSON.stringify(value));
let fixture;
let vite;
let browser;
let passed = 0;

const nextMonday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sinceMonday = (today.getDay() + 6) % 7;
  const weekStart = new Date(today.getTime() - sinceMonday * 86400000);
  const next = new Date(weekStart.getTime() + 7 * 86400000);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
};

function reset() {
  fixture = {
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
    ],
    writes: [],
    listReads: 0,
  };
}
reset();

function syntheticBackend() {
  return {
    name: "mmm-synthetic-browser-backend",
    configureServer(server) {
      server.middlewares.use("/__mmm_fixture", async (req, res) => {
        try {
          if (req.method !== "POST") throw new Error("Fixture accepts POST only");
          let body = "";
          for await (const chunk of req) body += chunk;
          const request = JSON.parse(body);
          let result;
          if (request.op === "list") {
            const q = request.query || {};
            const matching = fixture.rows.filter(row =>
              (!q.is_rider || !row.is_rider) &&
              (!Object.hasOwn(q, "completed") || row.completed === q.completed) &&
              (!q.deleted || row.deleted !== true));
            fixture.listReads++;
            result = matching.slice(request.skip || 0, (request.skip || 0) + (request.limit || 500)).map(clone);
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
              fixture.writes.push(clone(request.patch?.$set || {}));
              result = { updated: 1 };
            }
          } else if (request.op === "fixtureStatus") {
            result = {
              listReads: fixture.listReads,
              writeCount: fixture.writes.length,
              rows: fixture.rows.map(r => ({
                id: r.id,
                discussed: r.mmm_last_discussed_at || "",
                defer: r.mmm_defer_until || "",
                mmmTasks: (r.mmm_tasks || []).map(t => ({ text: t.text, completed: t.completed, assigned_to: t.assigned_to })),
                workNotes: (r.work_notes || []).map(n => ({ text: n.text, created_by: n.created_by, type: n.type })),
              })),
            };
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

async function fixtureAction(page, origin, op, data = {}) {
  const response = await page.request.post(origin + "/__mmm_fixture", { data: { op, ...data } });
  assert.equal(response.ok(), true, "Synthetic fixture action succeeded: " + op);
  return response.json();
}

async function awaitFixture(page, origin, condition, explanation) {
  const until = Date.now() + 9000;
  while (Date.now() < until) {
    const state = await fixtureAction(page, origin, "fixtureStatus");
    if (condition(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for synthetic fixture: " + explanation);
}

const alias = [
  { find: "@/api/base44Client", replacement: path.join(scratch, "mockBase44.js") },
  { find: "@/components/auth/EmailGate", replacement: path.join(scratch, "mockAuth.jsx") },
  { find: "@/components/workflow/WorkOrderDetailsDialog", replacement: path.join(scratch, "mockDetails.jsx") },
  { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
];

function monitor(page, origin, failures) {
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith(origin)) failures.push("Forbidden outside-origin request: " + url);
  });
  page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue();
  });
}

async function caseRun(name, origin, sizes, run, setup = () => {}) {
  reset();
  setup(fixture);
  const sessions = [];
  const failures = [];
  try {
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      monitor(page, origin, failures);
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Monday Morning Meeting" }).waitFor();
      sessions.push({ context, page });
    }
    await run(sessions.map((session) => session.page));
    assert.deepEqual(failures, [], "No browser errors or outside-origin requests");
    console.log("PASS " + name);
    passed++;
  } finally {
    for (const session of sessions) await session.context.close();
  }
}

const desktop = { width: 1366, height: 900 };
const mobile = { width: 360, height: 640 };

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const assets = await readdir(path.join(appRoot, "dist/assets"));
  const css = assets.find((name) => name.endsWith(".css"));
  if (!css) throw new Error("Build the production CSS before browser acceptance");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
    '<script type="module" src="/main.jsx"></script></body></html>');

  // Test-only facade for the real page's Work Order Details onUpdate callback.
  await writeFile(path.join(scratch, "mockDetails.jsx"), [
    'export default function SyntheticDetails({onUpdate, onClose}) {',
    'return <div role="dialog" aria-label="Synthetic Work Order Details">',
    '<button type="button" onClick={() => { onUpdate(); }}>Synthetic Details Refresh</button>',
    '<button type="button" onClick={() => { onClose(); }}>Close Synthetic Details</button>',
    '</div>; }',
  ].join("\n"));

  // Isolated, synthetic registered-user context matching every EmailGate
  // export the page's transitive imports can reach. No production auth.
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

  // MMM-flavored copy of the isolated Base44 fixture: shared CAS write path,
  // multi-row Work Order list, MMM task descriptions, two assignable users.
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
    '  if (request?.action !== "save" || request.entity_type !== "WorkOrder" || !request.entity_id) {',
    '    throw new Error("Unsupported isolated field-history request");',
    '  }',
    '  const before = await fixture("get", { id: request.entity_id });',
    '  if (!before) return { data: { success: false, error: "Synthetic Work Order not found" } };',
    '  const changed = Object.entries(request.next_fields || {}).find(([field, next]) =>',
    '    !Object.hasOwn(request.expected_fields || {}, field) ||',
    '    (!equal(before[field], request.expected_fields[field]) && !equal(before[field], next))',
    '  );',
    '  if (changed) return { data: { success: false, error: `This field changed in another session (${changed[0]}). Reload before saving.` } };',
    '  const changedGuard = Object.entries(request.guard_fields || {}).find(([field, expected]) => !equal(before[field], expected));',
    '  if (changedGuard) return { data: { success: false, error: "The record no longer matches its loaded state." } };',
    '  if (Object.entries(request.next_fields || {}).every(([field, next]) => equal(before[field], next))) {',
    '    return { data: { success: true, record: before } };',
    '  }',
    '  try {',
    '    const result = await fixture("updateMany", {',
    '      query: { id: request.entity_id, updated_date: before.updated_date },',
    '      patch: { $set: request.next_fields },',
    '    });',
    '    if (result.updated !== 1) {',
    '      return { data: { success: false, error: "This record changed during saving. Reload before trying again." } };',
    '    }',
    '    const after = await fixture("get", { id: request.entity_id });',
    '    if (!after) throw new Error("Synthetic saved Work Order disappeared");',
    '    return { data: { success: true, record: after } };',
    '  } catch (error) {',
    '    return { data: { success: false, error: error.message } };',
    '  }',
    '}',
    'export const base44 = {',
    '  functions: {',
    '    invoke: (name, request) => {',
    '      if (name !== "fieldHistoryAction") throw new Error("Unexpected synthetic backend function: " + name);',
    '      return syntheticFieldHistoryAction(request);',
    '    },',
    '  },',
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

  vite = await createServer({
    configFile: false, root: scratch, plugins: [react(), syntheticBackend()],
    resolve: { alias },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [appRoot, scratch] } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  await caseRun("Desktop: board mounts with WIP + MMM-assigned rows and meeting columns",
    origin, [desktop], async ([page]) => {
      await page.getByText("Alpha Signs").waitFor();
      await page.getByText("Beta Retail").waitFor();
      for (const header of ["Discussed", "Snooze", "Customer", "Job", "Task (next step)", "Install", "Deadline", "Flags", "Updates"]) {
        await page.getByRole("columnheader", { name: header }).first().waitFor();
      }
      // Beta's open meeting task expands its second line automatically.
      await page.getByText("Confirm lift reservation").waitFor();
      await page.getByText("Waiting on landlord sign-off").waitFor();
      await page.getByRole("button", { name: "+1 job task in details" }).waitFor();
    });

  await caseRun("Mobile: board mounts inside the viewport without document overflow",
    origin, [mobile], async ([page]) => {
      await page.getByText("Alpha Signs").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });

  await caseRun("Desktop: marking a job discussed parks it in the bottom section",
    origin, [desktop], async ([page]) => {
      await page.getByRole("checkbox", { name: "Mark Alpha Signs as discussed this week" }).click();
      await page.locator("#mmm-parked").getByText("Alpha Signs").waitFor();
      await page.locator("#mmm-parked").getByText(/discussed /).waitFor();
      const state = await fixtureAction(page, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.ok(alpha.discussed, "Discussed timestamp written");
      assert.equal(alpha.defer, "");
      assert.equal(fixture.writes.length, 1);
      assert.deepEqual(Object.keys(fixture.writes[0]).sort(), ["mmm_defer_until", "mmm_last_discussed_at"]);
    });

  await caseRun("Desktop: returning a parked job restores it to To Discuss",
    origin, [desktop], async ([page]) => {
      await page.getByRole("checkbox", { name: "Mark Alpha Signs as discussed this week" }).click();
      await page.locator("#mmm-parked").getByText("Alpha Signs").waitFor();
      await page.getByRole("checkbox", { name: "Return Alpha Signs to the To Discuss list" }).click();
      await page.locator("#mmm-parked").waitFor({ state: "detached" });
      const state = await fixtureAction(page, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alpha.discussed, "");
      assert.equal(alpha.defer, "");
    });

  await caseRun("Desktop: snooze to Next Monday parks the row with a returns chip",
    origin, [desktop], async ([page]) => {
      await page.getByRole("button", { name: "Schedule Alpha Signs to return on a future Monday" }).click();
      await page.getByRole("button", { name: /Next Monday/ }).click();
      await page.locator("#mmm-parked").getByText("Alpha Signs").waitFor();
      await page.locator("#mmm-parked").getByText(/returns \d+\/\d+/).waitFor();
      const state = await fixtureAction(page, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alpha.defer, nextMonday());
      assert.equal(alpha.discussed, "");
    });

  await caseRun("Desktop: add an inline meeting task, then completing it removes it",
    origin, [desktop], async ([page]) => {
      await page.getByRole("button", { name: "Show meeting tasks and notes for Alpha Signs" }).click();
      const input = page.getByPlaceholder("Add a meeting task…");
      await input.waitFor();
      await input.fill("Order mounting hardware");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByText("Order mounting hardware").waitFor();
      const state = await fixtureAction(page, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alpha.mmmTasks.length, 1);
      assert.equal(alpha.mmmTasks[0].text, "Order mounting hardware");
      assert.equal(alpha.mmmTasks[0].completed, false);
      await page.getByRole("checkbox", { name: "Complete meeting task: Order mounting hardware" }).click();
      await page.getByText("Order mounting hardware").waitFor({ state: "detached" });
      const after = await fixtureAction(page, origin, "fixtureStatus");
      const alphaAfter = after.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alphaAfter.mmmTasks.filter(t => !t.completed).length, 0);
    });

  await caseRun("Desktop: recording a meeting update appends an author-stamped note",
    origin, [desktop], async ([page]) => {
      await page.getByRole("button", { name: "Show meeting tasks and notes for Alpha Signs" }).click();
      const input = page.getByPlaceholder("Record a meeting update…");
      await input.waitFor();
      await input.fill("Waiting on engineering drawings");
      await page.getByRole("button", { name: "Add note" }).click();
      await page.getByText("Waiting on engineering drawings").waitFor();
      const state = await fixtureAction(page, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alpha.workNotes.length, 1);
      assert.equal(alpha.workNotes[0].text, "Waiting on engineering drawings");
      assert.equal(alpha.workNotes[0].created_by, "sips.qa@example.test");
    });

  await caseRun("Desktop: search filters the board and Clear restores it",
    origin, [desktop], async ([page]) => {
      await page.getByPlaceholder(/Search customer/).fill("no-such-job");
      await page.getByText("No jobs match the current search or filter.").waitFor();
      await page.getByRole("button", { name: "Clear search & filters" }).click();
      await page.getByText("Alpha Signs").waitFor();
      await page.getByText("Beta Retail").waitFor();
    });

  await caseRun("Two browsers: discussed on one device + task add on another both persist",
    origin, [desktop, desktop], async ([a, b]) => {
      await a.getByRole("checkbox", { name: "Mark Alpha Signs as discussed this week" }).click();
      await b.getByRole("button", { name: "Show meeting tasks and notes for Alpha Signs" }).click();
      const input = b.getByPlaceholder("Add a meeting task…");
      await input.waitFor();
      await input.fill("Verify anchor bolts");
      await b.getByRole("button", { name: "Add", exact: true }).click();
      await awaitFixture(a, origin, s => {
        const alpha = s.rows.find(r => r.id === "synthetic-mmm-alpha");
        return alpha.discussed !== "" && alpha.mmmTasks.length === 1;
      }, "both sessions' writes persist");
      const state = await fixtureAction(a, origin, "fixtureStatus");
      const alpha = state.rows.find(r => r.id === "synthetic-mmm-alpha");
      assert.equal(alpha.mmmTasks[0].text, "Verify anchor bolts");
      assert.equal(alpha.mmmTasks[0].completed, false);
    });

  await caseRun("Desktop: job-task chip opens details and its refresh reloads the board",
    origin, [desktop], async ([page]) => {
      await page.getByRole("button", { name: "+1 job task in details" }).click();
      await page.getByRole("dialog", { name: "Synthetic Work Order Details" }).waitFor();
      const before = (await fixtureAction(page, origin, "fixtureStatus")).listReads;
      await page.getByRole("button", { name: "Synthetic Details Refresh" }).click();
      await awaitFixture(page, origin, s => s.listReads > before, "board reload after details update");
      await page.getByRole("button", { name: "Close Synthetic Details" }).click();
      await page.getByText("Alpha Signs").waitFor();
    });

  await caseRun("Desktop: row-number focus applies the orange zoom styling",
    origin, [desktop], async ([page]) => {
      await page.getByText("Alpha Signs").waitFor();
      const rowNum = page.locator("tr.mmm-board-row td button").first();
      await rowNum.click();
      await page.locator("tr.mmm-focus-row").waitFor();
      assert.ok(await page.locator(".mmm-focus-num").count() >= 1, "Orange focus number styling applied");
      await rowNum.click();
      await page.locator("tr.mmm-focus-row").waitFor({ state: "detached" });
    });

  console.log(passed + "/" + passed + " MMM board browser scenarios passed");
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  await rm(scratch, { recursive: true, force: true });
}
