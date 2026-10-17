// Real QuickClockSection + ClockOutDialog in isolated Chromium. The actual
// backend handler runs only against in-memory fixtures. No hosted API or auth.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { setupSyntheticTimeClock } from "./validate-timeclock-pay-period-recovery.mjs";

const root = process.cwd();
const { chromium } = await import(process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs"));
const scratch = await mkdtemp(path.join(tmpdir(), "timeclock-quickclock-browser-"));
const worker = { id: "synthetic-employee", email: "worker@synthetic.invalid",
  full_name: "Synthetic Employee", role: "employee" };
const second = { id: "synthetic-second", email: "second@synthetic.invalid",
  full_name: "Second Synthetic Employee", role: "employee" };
const users = [worker, second];
const tokens = new Map([["synthetic-worker", worker], ["synthetic-second", second]]);
const snapshotKey = (user = worker) => "ccs_timeclock_pending_clock_out:" + user.email;
const requestKey = (user = worker) => "ccs_timeclock_request:clock_out:" + user.email;
const notes = "Private synthetic allocation note";
let fixture, vite, browser, passed = 0;

async function reset() {
  const h = setupSyntheticTimeClock({ entryCount: 0, serverNow: "2026-10-16T15:00:00.000Z" });
  h.rows.TimeClockPayPeriod = [];
  h.rows.AuthorizedEmail.push(structuredClone(second));
  for (const user of users) {
    const authorized = h.rows.AuthorizedEmail.find((row) => row.email === user.email);
    if (authorized) authorized.can_work_pause = true;
  }
  h.rows.TimeClockEmployeeState.push({
    ...structuredClone(h.rows.TimeClockEmployeeState.find((row) => row.user_email === worker.email)),
    id: "state-synthetic-second", user_email: second.email,
  });
  for (const user of users) {
    const result = await h.invokeAs(user, { action: "clock_in", target_email: user.email,
      request_id: "synthetic-clock-in-" + user.id });
    assert.equal(result.body.success, true, JSON.stringify(result.body));
  }
  h.setServerNow("2026-10-16T16:00:00.000Z");
  fixture = { h, invokes: [], drop: "" };
}
const clockOuts = () => fixture.invokes.filter((item) => item.action === "clock_out");
const completed = () => fixture.h.rows.TimeEntry.filter((row) => row.clock_out);

function fixturePlugin() {
  return { name: "isolated-quickclock-backend", configureServer(server) {
    server.middlewares.use("/__timeclock_fixture", async (req, res) => {
      try {
        assert.equal(req.method, "POST");
        let input = "";
        for await (const chunk of req) input += chunk;
        const { payload } = JSON.parse(input);
        assert.ok(["status", "labor_allocation_preview", "clock_out", "break_start", "break_end",
          "work_pause_start", "work_pause_resume", "labor_start", "labor_change", "labor_stop"].includes(payload?.action),
          "Unexpected action: " + payload?.action);
        const user = tokens.get(payload.session_token);
        assert.ok(user, "Only disposable fixture session identities are permitted");
        fixture.invokes.push(structuredClone(payload));
        const drop = payload.action === "clock_out" ? fixture.drop : "";
        if (drop) fixture.drop = "";
        const result = drop === "before" ? null : await fixture.h.invokeAs(user, payload);
        res.statusCode = drop ? 503 : result.status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(drop ? { simulate_lost_ack: true } : result.body));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } };
}

async function storage(page, key) {
  return page.evaluate((name) => sessionStorage.getItem(name), key);
}
async function dialogFor(page) {
  const dialog = page.getByRole("dialog", { name: "Clock Out", exact: true });
  await dialog.waitFor();
  return dialog;
}
async function fillClockOut(page, note = notes) {
  const dialog = await dialogFor(page);
  await dialog.getByPlaceholder("Enter 0 if none").fill("0");
  await dialog.getByRole("button", { name: "In House", exact: true }).click();
  await dialog.getByRole("combobox").last().click();
  await page.getByRole("option", { name: "Shop", exact: true }).click();
  await dialog.getByPlaceholder("0", { exact: true }).nth(0).fill("1");
  await dialog.getByPlaceholder("Add any notes about your work day that you'd like admin to see...").fill(note);
  return dialog;
}
async function submit(page) {
  await page.getByRole("dialog").getByRole("button", { name: "Clock Out", exact: true }).click();
}
async function expectUncertain(page) {
  await page.getByRole("dialog").getByText("Synthetic lost server acknowledgement", { exact: true }).waitFor();
}
async function expectConfirmed(page, user = worker) {
  await page.getByText("Successfully Clocked Out", { exact: true }).waitFor();
  assert.equal(await storage(page, snapshotKey(user)), null);
  assert.equal(await storage(page, requestKey(user)), null);
}
async function caseRun(name, origin, run, { denyStorage = false, twoContexts = false } = {}) {
  await reset();
  const contexts = [];
  const failures = [];
  try {
    for (let i = 0; i < (twoContexts ? 2 : 1); i++) {
      const context = await browser.newContext({ viewport: { width: i ? 390 : 1366, height: 900 } });
      contexts.push(context);
      if (denyStorage) await context.addInitScript(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("ccs_timeclock_pending_clock_out:")) throw new DOMException("Denied", "SecurityError");
          return original.call(this, key, value);
        };
      });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith("http") && new URL(url).origin !== origin) {
          failures.push("Forbidden outside-origin request: " + url);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto(origin + (i ? "?employee=second" : ""), { waitUntil: "networkidle" });
      await dialogFor(page);
    }
    await run(contexts.map((context) => context.pages()[0]));
    assert.deepEqual(failures, [], "No runtime errors or outside-origin requests");
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    for (const context of contexts) {
      const page = context.pages()[0];
      if (page) console.error((await page.locator("body").innerText()).slice(-5000));
    }
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
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
  entities: { WorkOrder: { synthetic: true } },
  functions: { async invoke(name, payload) {
    if (name !== "timeClockAction") throw new Error("Unexpected function");
    const response = await fetch("/__timeclock_fixture", { method:"POST",
      headers:{"content-type":"application/json"}, body:JSON.stringify({payload}) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.simulate_lost_ack ? "Synthetic lost server acknowledgement" : data.error);
      if (!data.simulate_lost_ack) error.response = {status:response.status,data};
      throw error;
    }
    return {data};
  } }
};
export const useAuth = () => ({sessionToken:"",currentUser:null});
export const loadAllEntityRows = async () => [];
export const createFaceMatcher = () => () => null;
export const detectDetailedFace = async () => null;
export const loadFaceModelsOnce = async () => {};
export class Html5Qrcode {}
`);
  await writeFile(path.join(scratch, "main.jsx"), `
import React from "react";
import {createRoot} from "react-dom/client";
import QuickClockSection from "/@fs${path.join(root, "src/components/timeclock/QuickClockSection.jsx")}";
const users = ${JSON.stringify(users)};
const isSecond = new URLSearchParams(location.search).get("employee") === "second";
createRoot(document.getElementById("root")).render(
  <QuickClockSection allUsers={users} employeeSessionUser={users[isSecond ? 1 : 0]}
    employeeSessionToken={isSecond ? "synthetic-second" : "synthetic-worker"} />);
`);
  const mock = path.join(scratch, "mock.js");
  const stubImports = ["@/api/base44Client", "@/components/auth/EmailGate",
    "@/components/estimator/loadAllEntityRows", "@/components/timeclock/faceScanRuntime", "html5-qrcode"];
  vite = await createServer({ configFile: false, root: scratch,
    plugins: [react(), fixturePlugin()],
    resolve: { alias: [
      ...stubImports.map((find) => ({ find, replacement: mock })),
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } }, logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});

  await caseRun("Clock Out persists one shift, clears recovery storage, and remains closed after refresh",
    origin, async ([page]) => {
      await fillClockOut(page); await submit(page); await expectConfirmed(page);
      assert.equal(completed().length, 1);
      assert.equal(clockOuts().length, 1);
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await page.getByRole("dialog", {name:"Clock Out",exact:true}).count(), 0);
      assert.equal(await storage(page, snapshotKey()), null);
    });

  await caseRun("Interrupted Clock Out reload restores exact body and replays original request ID",
    origin, async ([page]) => {
      fixture.drop = "before";
      await fillClockOut(page); await submit(page); await expectUncertain(page);
      const original = structuredClone(clockOuts()[0]);
      const saved = await storage(page, snapshotKey());
      assert.ok(saved);
      assert.doesNotMatch(saved, /session_token|password|badge_code|synthetic-worker/);
      assert.equal(JSON.parse(saved).requestId, original.request_id);
      await page.reload({waitUntil:"networkidle"});
      const retry = page.getByRole("button", {name:"Retry Original Clock Out",exact:true});
      await retry.waitFor();
      assert.equal(await page.locator("textarea").inputValue(), notes);
      await retry.click(); await expectConfirmed(page);
      assert.deepEqual(clockOuts()[1], original);
      assert.equal(completed().length, 1);
    });

  await caseRun("Committed Clock Out with lost acknowledgement clears recovery on refresh without resubmission",
    origin, async ([page]) => {
      fixture.drop = "after";
      await fillClockOut(page); await submit(page); await expectUncertain(page);
      assert.equal(completed().length, 1);
      assert.ok(await storage(page, snapshotKey()));
      await page.reload({waitUntil:"networkidle"});
      assert.equal(await page.getByRole("dialog", {name:"Clock Out",exact:true}).count(), 0);
      assert.equal(await storage(page, snapshotKey()), null);
      assert.equal(await storage(page, requestKey()), null);
      assert.equal(clockOuts().length, 1);
    });

  await caseRun("Same-tab employee switch isolates pending notes and preserves the original employee retry",
    origin, async ([page]) => {
      fixture.drop = "before";
      await fillClockOut(page); await submit(page); await expectUncertain(page);
      const original = structuredClone(clockOuts()[0]);
      await page.goto(origin + "?employee=second", {waitUntil:"networkidle"});
      await dialogFor(page);
      assert.equal(await page.locator("textarea").inputValue(), "");
      assert.equal(await page.getByRole("button", {name:"Retry Original Clock Out",exact:true}).count(), 0);
      await fillClockOut(page, "Second employee note"); await submit(page);
      await expectConfirmed(page, second);
      assert.notEqual(clockOuts()[1].request_id, original.request_id);
      assert.ok(await storage(page, snapshotKey()));
      await page.goto(origin, {waitUntil:"networkidle"});
      await page.getByRole("button", {name:"Retry Original Clock Out",exact:true}).click();
      await expectConfirmed(page);
      assert.deepEqual(clockOuts()[2], original);
      assert.equal(completed().length, 2);
    });

  await caseRun("Independent employee browser contexts never share pending tab storage",
    origin, async ([first, other]) => {
      fixture.drop = "before";
      await fillClockOut(first); await submit(first); await expectUncertain(first);
      assert.equal(await storage(other, snapshotKey()), null);
      await fillClockOut(other, "Independent second employee"); await submit(other);
      await expectConfirmed(other, second);
      assert.ok(await storage(first, snapshotKey()));
      assert.equal(completed().length, 1);
    }, {twoContexts:true});

  await caseRun("Denied pending recovery storage blocks Clock Out before any backend punch",
    origin, async ([page]) => {
      await fillClockOut(page); await submit(page);
      await page.getByRole("dialog").getByText(/This browser cannot preserve the original Clock Out/).waitFor();
      assert.equal(clockOuts().length, 0);
      assert.equal(completed().length, 0);
    }, {denyStorage:true});

  await caseRun("Paid break and unpaid lunch start/end reconcile exact server minutes and block conflicting actions",
    origin, async ([page]) => {
      const dialog = await dialogFor(page);
      await dialog.getByRole("button", {name:"Start Work",exact:true}).click();
      await dialog.getByRole("button", {name:"Change Work",exact:true}).waitFor();
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 1);
      await dialog.getByRole("button", {name:"Start Paid Break",exact:true}).click();
      await page.getByText("On Break", {exact:true}).waitFor();
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 0);
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "completed" && row.end_reason === "break").length, 1);
      assert.equal(await dialog.getByRole("button", {name:"Start Work",exact:true}).isDisabled(), true);
      fixture.h.setServerNow("2026-10-16T16:10:00.000Z");
      await page.getByRole("button", {name:"End Break",exact:true}).click();
      await page.getByRole("button", {name:"Start Paid Break",exact:true}).waitFor();
      const paid = fixture.h.rows.TimeClockBreak.find((row) => row.is_paid === true);
      assert.equal(paid.status, "completed");
      assert.equal(paid.duration_minutes, 10);
      await page.getByRole("button", {name:"Start Unpaid Lunch",exact:true}).click();
      await page.getByText("On Break", {exact:true}).waitFor();
      fixture.h.setServerNow("2026-10-16T16:30:00.000Z");
      await page.getByRole("button", {name:"End Break",exact:true}).click();
      await page.getByRole("button", {name:"Start Unpaid Lunch",exact:true}).waitFor();
      const lunch = fixture.h.rows.TimeClockBreak.find((row) => row.break_type === "lunch");
      assert.equal(lunch.is_paid, false);
      assert.equal(lunch.status, "completed");
      assert.equal(lunch.duration_minutes, 20);
      const status = await fixture.h.invokeAs(worker, {action:"status"});
      assert.equal(status.body.break_status, "working");
      assert.equal(status.body.break_summary.paid_minutes, 10);
      assert.equal(status.body.break_summary.unpaid_minutes, 20);
    });

  await caseRun("Work Pause closes active Current Work and Resume restores working status",
    origin, async ([page]) => {
      const dialog = await dialogFor(page);
      await dialog.getByRole("button", {name:"Start Work",exact:true}).click();
      await dialog.getByRole("button", {name:"Change Work",exact:true}).waitFor();
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 1);
      await dialog.getByRole("button", {name:"Pause Work",exact:true}).click();
      await page.getByRole("heading", {name:"WORK PAUSED",exact:true}).waitFor();
      const activePause = fixture.h.rows.TimeClockWorkPause.find((row) => row.status === "active");
      assert.ok(activePause?.id);
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 0);
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "completed" && row.end_reason === "work_pause").length, 1);
      await page.getByRole("button", {name:"Resume Work",exact:true}).click();
      await page.getByRole("heading", {name:"WORK PAUSED",exact:true}).waitFor({state:"detached"});
      const status = await fixture.h.invokeAs(worker, {action:"status"});
      assert.equal(status.body.work_pause_status, "working");
      assert.equal(fixture.h.rows.TimeClockWorkPause.find((row) => row.id === activePause.id).status, "completed");
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 0);
      await page.getByText("Tap the button, then identify with face recognition, a secure QR badge, or username/password.", {exact:true}).waitFor();
      assert.equal(await page.getByRole("dialog", {name:"Clock Out",exact:true}).count(), 0);
    });

  await caseRun("Current Work can start, change activity, and stop without leaving an active segment",
    origin, async ([page]) => {
      const dialog = await dialogFor(page);
      await dialog.getByRole("button", {name:"Start Work",exact:true}).click();
      await dialog.getByRole("button", {name:"Change Work",exact:true}).waitFor();
      let active = fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active");
      assert.equal(active.length, 1);
      assert.equal(active[0].activity_type, "shop");
      await dialog.getByRole("combobox").first().click();
      await page.getByRole("option", {name:"Fabrication",exact:true}).click();
      await dialog.getByRole("button", {name:"Change Work",exact:true}).click();
      active = fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active");
      assert.equal(active.length, 1);
      assert.equal(active[0].activity_type, "fabrication");
      await dialog.getByRole("button", {name:"Stop Work",exact:true}).click();
      await dialog.getByRole("button", {name:"Start Work",exact:true}).waitFor();
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "active").length, 0);
      assert.equal(fixture.h.rows.TimeClockLaborSegment.filter((row) => row.status === "completed").length, 2);
    });

  console.log("PASS " + passed + "/9 isolated Quick Clock Chromium scenarios");
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  await rm(scratch, {recursive:true,force:true});
}
