// Isolated Chromium acceptance of the REAL TimeOffApprovalPanel UI and the REAL
// timeClockAction backend handler under the synthetic VM from the recovery suite.
// No Base44 SDK, production auth, live records, or outside-origin HTTP requests.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { pathToFileURL } from "node:url";
import { setupSyntheticTimeClock } from "./validate-timeclock-pay-period-recovery.mjs";

const root = process.cwd();
const driver = process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(driver).href);
// realpath normalizes Windows 8.3 short temp names so Vite's fs.allow check,
// which compares realpaths, accepts the scratch root.
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), "timeclock-timeoff-browser-")));
const mockDir = path.join(root, "scripts/timeclock-browser-harness");
const clone = (value) => structuredClone(value);
const desktop = { width: 1366, height: 900 };
let fixture;
let vite;
let browser;
let passed = 0;

const administrator = { id: "synthetic-admin", email: "admin@synthetic.invalid", full_name: "Synthetic Admin", role: "admin" };
const employee = { id: "synthetic-employee", email: "worker@synthetic.invalid", full_name: "Synthetic Employee", role: "employee" };

function requestRow(overrides = {}) {
  return {
    id: "tor-browser-" + Math.random().toString(36).slice(2, 10),
    user_email: employee.email,
    user_name: employee.full_name,
    request_type: "vacation",
    start_date: "2026-11-02",
    end_date: "2026-11-03",
    hours_requested: 16,
    reason: "synthetic browser smoke",
    status: "pending",
    archived_test_data: false,
    updated_date: "2026-10-26T00:00:00.000Z",
    created_date: "2026-10-25T00:00:00.000Z",
    ...overrides,
  };
}

function reset() {
  const h = setupSyntheticTimeClock({ entryCount: 0 });
  h.rows.TimeOffRequest = [];
  fixture = { h, loseNextDecisionAck: false, invokes: [] };
}

function syntheticBackend() {
  return {
    name: "isolated-timeclock-timeoff-backend",
    configureServer(server) {
      server.middlewares.use("/__timeclock_fixture", async (req, res) => {
        try {
          assert.equal(req.method, "POST");
          let input = "";
          for await (const chunk of req) input += chunk;
          const body = JSON.parse(input);
          let result;
          let status = 200;
          if (body.op === "invoke") {
            const payload = body.payload || {};
            assert.ok(["list_time_off_requests", "time_off_decision"].includes(payload.action),
              "Unexpected fixture action: " + payload.action);
            fixture.invokes.push(clone(payload));
            if (fixture.loseNextDecisionAck && payload.action === "time_off_decision") {
              fixture.loseNextDecisionAck = false;
              result = { success: false, retry_same_request: true,
                error: "Synthetic interrupted decision before commit" };
              status = 409;
            } else {
              const actor = payload.session_token === "synthetic-employee-session"
                ? employee : administrator;
              const response = await fixture.h.invokeAs(actor, payload);
              result = response.body;
              status = response.status;
            }
          } else {
            throw new Error("Unexpected fixture operation: " + body.op);
          }
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error?.message || "Synthetic fixture error" }));
        }
      });
    },
  };
}

function monitor(page, origin, failures) {
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith(origin)) {
      failures.push("Forbidden outside-origin request: " + url);
    }
  });
  page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue();
  });
}

const emitted = () => fixture.h.emittedEvents.map((e) => e.payload?.event_type);
const decisionAudits = () => fixture.h.rows.TimeClockAudit.filter((a) => a.action === "time_off_decision");

async function openReview(page, name) {
  const row = page.locator("div", { hasText: name }).filter({ has: page.getByRole("button", { name: "Review" }) }).last();
  await row.getByRole("button", { name: "Review" }).click();
  const dialog = page.getByRole("dialog", { name: "Review Time-Off Request" });
  await dialog.waitFor();
  return dialog;
}

async function caseRun(name, origin, run, before = () => {}) {
  reset();
  before(fixture);
  const failures = [];
  const context = await browser.newContext({ viewport: desktop });
  const page = await context.newPage();
  try {
    monitor(page, origin, failures);
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByText("Time-Off Requests").waitFor();
    await page.getByText("awaiting review").waitFor();
    await run(page);
    assert.deepEqual(failures, [], "No browser errors or outside-origin requests");
    console.log("PASS " + name);
    passed += 1;
  } finally {
    await context.close();
    fixture?.h?.setAfterRowUpdate(null);
  }
}

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const assets = await readdir(path.join(root, "dist/assets"));
  const css = assets.find((name) => name.endsWith(".css"));
  assert.ok(css, "Build the CCS site first to generate Tailwind CSS");
  await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head>' +
    '<body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import TimeOffApprovalPanel from "/@fs/' +
      path.join(root, "src/components/timeclock/TimeOffApprovalPanel.jsx").replace(/\\/g, "/") + '";',
    'createRoot(document.getElementById("root")).render(' +
      '<TimeOffApprovalPanel sessionToken="synthetic-admin-session" />);',
  ].join("\n"));

  vite = await createServer({
    configFile: false,
    root: scratch,
    plugins: [react(), syntheticBackend()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: path.join(mockDir, "mockBase44.js") },
      { find: "@/components/estimator/loadAllEntityRows", replacement: path.join(mockDir, "mockRows.js") },
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  await caseRun("Admin approves a pending request with notes; audit and event confirm once",
    origin, async (page) => {
      await page.getByText("1 awaiting review").waitFor();
      await page.getByText("Synthetic Employee").waitFor();
      // Denied and archived rows are excluded from the admin list.
      assert.equal(await page.getByText("Hidden Denied").count(), 0);
      assert.equal(await page.getByText("Hidden Archived").count(), 0);
      const dialog = await openReview(page, "Synthetic Employee");
      await dialog.locator("textarea").fill("Approved in synthetic browser smoke");
      await dialog.getByRole("button", { name: "Approve", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const saved = fixture.h.rows.TimeOffRequest.find((r) => r.user_name === "Synthetic Employee");
      assert.equal(saved.status, "approved");
      assert.equal(saved.approved_by, administrator.email);
      assert.equal(saved.admin_notes, "Approved in synthetic browser smoke");
      assert.equal(decisionAudits().length, 1);
      assert.equal(decisionAudits()[0].outcome, "confirmed");
      assert.deepEqual(emitted(), ["time_off_approved"]);
      await page.getByText("approved").first().waitFor();
    },
    ({ h }) => {
      h.rows.TimeOffRequest.push(
        requestRow({ id: "tor-browser-approve" }),
        requestRow({ id: "tor-browser-denied", user_name: "Hidden Denied", status: "denied" }),
        requestRow({ id: "tor-browser-archived", user_name: "Hidden Archived", archived_test_data: true }),
      );
    });

  await caseRun("Admin denies a pending request; it leaves the review list",
    origin, async (page) => {
      const dialog = await openReview(page, "Synthetic Employee");
      await dialog.getByRole("button", { name: "Deny", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const saved = fixture.h.rows.TimeOffRequest[0];
      assert.equal(saved.status, "denied");
      assert.equal(decisionAudits().length, 1);
      assert.deepEqual(emitted(), ["time_off_denied"]);
      await page.getByText("No pending or approved time-off requests.").waitFor();
    },
    ({ h }) => { h.rows.TimeOffRequest.push(requestRow({ id: "tor-browser-deny" })); });

  await caseRun("Admin cancels an approved request through the review dialog",
    origin, async (page) => {
      const dialog = await openReview(page, "Synthetic Employee");
      await dialog.getByText(/Approved by manager@synthetic\.invalid/).waitFor();
      await dialog.getByRole("button", { name: "Cancel Request", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const saved = fixture.h.rows.TimeOffRequest[0];
      assert.equal(saved.status, "cancelled");
      assert.equal(decisionAudits().length, 1);
      assert.deepEqual(emitted(), ["time_off_cancelled"]);
      await page.getByText("No pending or approved time-off requests.").waitFor();
    },
    ({ h }) => {
      h.rows.TimeOffRequest.push(requestRow({
        id: "tor-browser-cancel", status: "approved",
        approved_by: "manager@synthetic.invalid", approved_date: "2026-10-25T12:00:00.000Z",
      }));
    });

  await caseRun("Interrupted decision locks the dialog; retry replays the same request id once",
    origin, async (page) => {
      const dialog = await openReview(page, "Synthetic Employee");
      fixture.loseNextDecisionAck = true;
      await dialog.getByRole("button", { name: "Approve", exact: true }).click();
      await dialog.getByText(/interrupted|Retry the same decision/).waitFor();
      await dialog.getByText(/locked until you retry the same decision/).waitFor();
      assert.equal(fixture.h.rows.TimeOffRequest[0].status, "pending",
        "A pre-commit interruption must not mutate the request");
      await dialog.getByRole("button", { name: "Retry Approval", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const saved = fixture.h.rows.TimeOffRequest[0];
      assert.equal(saved.status, "approved");
      const decisions = fixture.invokes.filter((item) => item.action === "time_off_decision");
      assert.equal(decisions.length, 2);
      assert.equal(decisions[0].request_id, decisions[1].request_id);
      assert.equal(decisions[0].expected_updated_date, decisions[1].expected_updated_date);
      assert.equal(decisionAudits().length, 1);
      assert.equal(decisionAudits()[0].outcome, "confirmed");
      assert.deepEqual(emitted(), ["time_off_approved"]);
    },
    ({ h }) => { h.rows.TimeOffRequest.push(requestRow({ id: "tor-browser-retry" })); });

  console.log("PASS " + passed + "/" + passed + " isolated Time-Off decision Chromium scenarios");
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  await rm(scratch, { recursive: true, force: true });
}
