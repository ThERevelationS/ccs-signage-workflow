// Isolated Chromium acceptance of the REAL PayPeriodManager UI and the REAL
// timeClockAction backend handler under the synthetic VM from the recovery suite.
// No Base44 SDK, production auth, live records, or outside-origin HTTP requests.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { setupSyntheticTimeClock } from "./validate-timeclock-pay-period-recovery.mjs";

const root = process.cwd();
const driver = process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(driver);
const scratch = await mkdtemp(path.join(tmpdir(), "timeclock-browser-"));
const mockDir = path.join(root, "scripts/timeclock-browser-harness");
const clone = (value) => structuredClone(value);
const desktop = { width: 1366, height: 900 };
const mobile = { width: 360, height: 640 };
let fixture;
let vite;
let browser;
let passed = 0;

function reset() {
  const h = setupSyntheticTimeClock({ entryCount: 0 });
  h.rows.TimeClockPayPeriod = [];
  fixture = { h, loseNextCreateAck: false, invokes: [] };
}

function syntheticBackend() {
  return {
    name: "isolated-timeclock-browser-backend",
    configureServer(server) {
      server.middlewares.use("/__timeclock_fixture", async (req, res) => {
        try {
          assert.equal(req.method, "POST");
          let input = "";
          for await (const chunk of req) input += chunk;
          const body = JSON.parse(input);
          let result;
          let status = 200;
          if (body.op === "periods") {
            result = clone(fixture.h.rows.TimeClockPayPeriod).sort((a, b) =>
              b.start_date.localeCompare(a.start_date));
          } else if (body.op === "invoke") {
            assert.ok(["pay_period_create", "pay_period_status"].includes(body.payload?.action));
            fixture.invokes.push(clone(body.payload));
            const response = await fixture.h.invoke(body.payload);
            result = response.body;
            status = response.status;
            if (fixture.loseNextCreateAck &&
                body.payload.action === "pay_period_create" && status === 200) {
              fixture.loseNextCreateAck = false;
              result = { simulate_lost_ack: true };
              status = 503;
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

async function fillCreate(page, label, startDate, endDate) {
  await page.getByRole("button", { name: "New Pay Period" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Pay Period" });
  await dialog.waitFor();
  await dialog.getByPlaceholder("Example: Sept 1–15").fill(label);
  await dialog.locator('input[type="date"]').nth(0).fill(startDate);
  await dialog.locator('input[type="date"]').nth(1).fill(endDate);
  return dialog;
}

function assertClean() {
  const { TimeClockPayPeriod, TimeClockPayPeriodCreateGate, TimeClockAudit } = fixture.h.rows;
  assert.equal(TimeClockPayPeriodCreateGate.length, 1);
  assert.equal(TimeClockPayPeriodCreateGate[0].status, "idle");
  assert.equal(TimeClockPayPeriodCreateGate[0].request_id, "");
  assert.equal(TimeClockPayPeriodCreateGate[0].claim_token, "");
  assert.equal(TimeClockPayPeriodCreateGate[0].payload_hash, "");
  assert.equal(TimeClockPayPeriod.length, 1);
  assert.equal(TimeClockAudit.length, 1);
  assert.equal(TimeClockAudit[0].outcome, "confirmed");
  assert.equal(TimeClockAudit[0].details.pay_period_id, TimeClockPayPeriod[0].id);
}

async function caseRun(name, origin, viewports, run, before = () => {}) {
  reset();
  before(fixture);
  const contexts = [];
  const failures = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      monitor(page, origin, failures);
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "New Pay Period" }).waitFor();
      contexts.push({ context, page });
    }
    await run(contexts.map((item) => item.page));
    assert.deepEqual(failures, [], "No browser errors or outside-origin requests");
    console.log("PASS " + name);
    passed += 1;
  } finally {
    for (const item of contexts) await item.context.close();
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
    'import PayPeriodManager from "/@fs' +
      path.join(root, "src/components/timeclock/PayPeriodManager.jsx") + '";',
    'createRoot(document.getElementById("root")).render(' +
      '<PayPeriodManager sessionToken="synthetic-admin-session" />);',
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

  await caseRun("Desktop: create persists one audited period and clears the coordinator",
    origin, [desktop], async ([page]) => {
      const dialog = await fillCreate(page, "Synthetic browser period", "2026-10-01", "2026-10-14");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByText("Synthetic browser period").waitFor();
      assertClean();
      assert.equal(fixture.h.rows.TimeClockPayPeriod[0].status, "open");
    });

  await caseRun("Mobile: create dialog stays within viewport and dates remain editable",
    origin, [mobile], async ([page]) => {
      const dialog = await fillCreate(page, "Synthetic mobile period", "2026-10-01", "2026-10-14");
      const rect = await dialog.boundingBox();
      assert.ok(rect && rect.x >= -1 && rect.x + rect.width <= mobile.width + 1,
        "Create dialog must fit narrow mobile viewport");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true, "No horizontal page overflow");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assertClean();
      await page.getByText("Synthetic mobile period").waitFor();
    });

  await caseRun("Two isolated administrators: held create blocks competing overlap",
    origin, [desktop, mobile], async ([first, second]) => {
      let entered;
      const hasClaim = new Promise((resolve) => { entered = resolve; });
      let release;
      fixture.h.setAfterRowUpdate(async (name, _query, update, row) => {
        if (name === "TimeClockPayPeriodCreateGate" && update.$set?.status === "creating") {
          entered();
          await new Promise((resolve) => { release = resolve; });
        }
      });
      const firstDialog = await fillCreate(first, "Synthetic admin A", "2026-10-01", "2026-10-14");
      const secondDialog = await fillCreate(second, "Synthetic admin B", "2026-10-08", "2026-10-21");
      const firstClick = firstDialog.getByRole("button", { name: "Create", exact: true }).click();
      await hasClaim;
      await secondDialog.getByRole("button", { name: "Create", exact: true }).click();
      await second.getByText(/Another pay-period creation is in progress/).waitFor();
      assert.equal(fixture.h.rows.TimeClockPayPeriod.length, 0,
        "No period is persisted while first claim is held");
      release();
      await firstClick;
      await firstDialog.waitFor({ state: "hidden" });
      await first.getByText("Synthetic admin A").waitFor();
      // Second administrator may retry after A releases; backend now rejects overlap.
      await secondDialog.getByRole("button", { name: "Create", exact: true }).click();
      await second.getByText(/overlaps Synthetic admin A/).waitFor({ timeout: 4500 }).catch(async (error) => {
        console.error("CONCURRENT_RETRY_DIAGNOSTIC", JSON.stringify({
          gate: fixture.h.rows.TimeClockPayPeriodCreateGate,
          periods: fixture.h.rows.TimeClockPayPeriod,
          invokes: fixture.invokes.map((item) => ({ action: item.action, request_id: item.request_id, label: item.label })),
          screen: (await second.locator("body").innerText()).slice(0, 1800),
        }));
        throw error;
      });
      assertClean();
      assert.equal(fixture.h.rows.TimeClockPayPeriod[0].label, "Synthetic admin A");
    });

  await caseRun("Lost acknowledgement: reload retries the same ID without duplicating a period",
    origin, [desktop], async ([page]) => {
      const dialog = await fillCreate(page, "Synthetic lost response", "2026-10-01", "2026-10-14");
      fixture.loseNextCreateAck = true;
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await page.getByText("Synthetic lost server acknowledgement").waitFor();
      const pending = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("ccs_timeclock_pay_period_request:create")));
      assert.equal(pending.submitted, true);
      assert.equal(fixture.h.rows.TimeClockPayPeriod.length, 1);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByText("Synthetic lost response").waitFor();
      await page.waitForFunction(() =>
        !sessionStorage.getItem("ccs_timeclock_pay_period_request:create"));
      assertClean();
      const requests = fixture.invokes.filter((item) => item.action === "pay_period_create");
      assert.equal(requests.length, 2);
      assert.equal(requests[0].request_id, requests[1].request_id);
    });

  console.log("PASS " + passed + "/" + passed + " isolated Time Clock Chromium scenarios");
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  await rm(scratch, { recursive: true, force: true });
}
