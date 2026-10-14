// Real Chromium acceptance of the existing SIPS page with two isolated browser
// contexts and a shared in-memory, CAS-protected synthetic Work Order. This
// never imports production auth/SDK, makes external requests, or changes live data.
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
const scratch = await mkdtemp(path.join(tmpdir(), "sips-browser-acceptance-"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const dateOnly = (date) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");
const initialDate = dateOnly(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
const newerDate = dateOnly(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 3));
const targetMonth = new Date(Number(newerDate.slice(0, 4)), Number(newerDate.slice(5, 7)) - 1, 1)
  .toLocaleString("en-US", { month: "long", year: "numeric" });
let fixture;
let vite;
let browser;
let passed = 0;

function reset() {
  fixture = {
    row: {
      id: "synthetic-sips-order", title: "Synthetic SIPS order",
      client_name: "Synthetic Revisit QA", description: "Local synthetic browser acceptance",
      current_task_assigned_to: "SIPs", current_task_description: "Synthetic install",
      is_rider: false, completed: false, deleted: false, sip_completed: false,
      sip_revisit_date: initialDate, sip_checklist: [], estimate_amount: 100,
      created_date: "2026-09-01T12:00:00Z", updated_date: "000000001",
    },
    writes: [],
  };
}
reset();

function syntheticBackend() {
  return {
    name: "sips-synthetic-browser-backend",
    configureServer(server) {
      server.middlewares.use("/__sips_fixture", async (req, res) => {
        try {
          if (req.method !== "POST") throw new Error("Fixture accepts POST only");
          let body = "";
          for await (const chunk of req) body += chunk;
          const request = JSON.parse(body);
          let result;
          if (request.op === "list") {
            const q = request.query || {};
            const row = fixture.row;
            const matching = (!q.is_rider || !row.is_rider) &&
              (!Object.hasOwn(q, "completed") || row.completed === q.completed) &&
              (!q.deleted || row.deleted !== true);
            result = matching ? [clone(row)].slice(request.skip || 0, (request.skip || 0) + (request.limit || 500)) : [];
          } else if (request.op === "get") {
            result = request.id === fixture.row.id ? clone(fixture.row) : null;
          } else if (request.op === "updateMany") {
            const query = request.query || {};
            const patch = request.patch || {};
            if (fixture.failNextWriteMessage) {
              const message = fixture.failNextWriteMessage;
              fixture.failNextWriteMessage = null;
              throw new Error(message);
            }
            if (fixture.updateDelayMs) {
              await new Promise((resolve) => setTimeout(resolve, fixture.updateDelayMs));
            }
            assert.deepEqual(Object.keys(patch), ["$set"], "Synthetic fixture accepts only conditional field replacements");
            const matches = query.id === fixture.row.id &&
              query.updated_date === fixture.row.updated_date && fixture.row.deleted !== true;
            if (matches) {
              Object.assign(fixture.row, clone(patch.$set));
              fixture.row.updated_date = String(Number(fixture.row.updated_date) + 1).padStart(9, "0");
              fixture.writes.push(clone(patch.$set));
            }
            result = { updated: matches ? 1 : 0 };
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

async function waitFor(writeCount, targetDate) {
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    if (fixture.writes.length === writeCount && fixture.row.sip_revisit_date === targetDate) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for synthetic conditional Work Order save; writes=${JSON.stringify(fixture.writes)} date=${fixture.row.sip_revisit_date} expected=${targetDate}`);
}

const alias = [
  { find: "@/api/base44Client", replacement: path.join(source, "mockBase44.js") },
  { find: "@/components/auth/EmailGate", replacement: path.join(source, "mockUI.jsx") },
  { find: "@/components/workflow/WorkOrderDetailsDialog", replacement: path.join(source, "mockUI.jsx") },
  { find: "@/components/sips/ProductChecklistDialog", replacement: path.join(source, "mockUI.jsx") },
  { find: "@/components/sips/TemplateBuilder", replacement: path.join(source, "mockUI.jsx") },
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

async function openClear(page, mobile) {
  if (mobile) {
    await page.locator("#sips-revisit-later")
      .getByRole("button", { name: "Change Revisit Date" }).click();
    await page.getByRole("button", { name: "Clear date & return to active" }).click();
  } else {
    await page.locator("#sips-revisit-later table tbody tr td:last-child button").first().click();
    await page.getByRole("button", { name: "Clear date", exact: true }).last().click();
  }
  const dialog = page.getByRole("alertdialog", { name: "Return this item to active SIPs?" });
  await dialog.waitFor();
  return dialog;
}

async function changeDate(page, mobile) {
  if (mobile) {
    await page.locator("#sips-revisit-later")
      .getByRole("button", { name: "Change Revisit Date" }).click();
  } else {
    await page.locator("#sips-revisit-later table tbody tr td:last-child button").first().click();
  }
  const calendar = page.locator(".rdp:visible").last();
  await calendar.waitFor();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const caption = (await calendar.locator('[aria-live="polite"][role="presentation"]').innerText()).trim();
    if (caption === targetMonth) break;
    await calendar.getByRole("button", { name: /next month/i }).click();
  }
  assert.equal((await calendar.locator('[aria-live="polite"][role="presentation"]').innerText()).trim(), targetMonth);
  // The last visible “3” can be a trailing day in the following month.
  // The first matching day belongs to the displayed month (not prior-month overflow).
  await calendar.locator('button[name="day"]').filter({ hasText: /^3$/ }).first().click();
  await waitFor(1, newerDate);
}

function boardHeadingFocused(page) {
  return page.waitForFunction(() => {
    const node = document.activeElement;
    return node?.tagName === "H1" && node.textContent?.includes("SIPs Meeting Board");
  });
}

function reopenedWorkOrderFocused(page) {
  return page.waitForFunction(() => document.activeElement?.dataset?.sipsActiveFocusId === "synthetic-sips-order");
}

async function checkDialogOnScreen(page) {
  const rect = await page.getByRole("alertdialog").boundingBox();
  const size = page.viewportSize();
  assert.ok(rect && rect.x >= -1 && rect.y >= -1, "Dialog must begin inside viewport");
  assert.ok(rect.x + rect.width <= size.width + 1, "Dialog cannot overflow mobile width");
  assert.ok(rect.y + rect.height <= size.height + 1, "Dialog cannot overflow mobile height");
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
      await page.getByRole("heading", { name: "SIPs Meeting Board" }).waitFor();
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
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import {createRoot} from "react-dom/client";',
    'import SIPs from "/@fs' + path.join(appRoot, "src/pages/SIPs.jsx") + '";',
    'createRoot(document.getElementById("root")).render(<SIPs />);',
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

  await caseRun("Desktop: Escape closes confirmation, returns heading focus and writes nothing",
    origin, [desktop], async ([page]) => {
      const dialog = await openClear(page, false);
      assert.equal(await dialog.getByRole("button", { name: "Keep revisit date" })
        .evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await boardHeadingFocused(page);
      assert.equal(fixture.writes.length, 0);
      assert.equal(fixture.row.sip_revisit_date, initialDate);
    });

  await caseRun("Mobile: Clear confirmation stays in viewport and moves item to Active",
    origin, [mobile], async ([page]) => {
      const dialog = await openClear(page, true);
      await checkDialogOnScreen(page);
      await dialog.getByRole("button", { name: "Clear & return to active" }).click();
      await dialog.waitFor({ state: "hidden" });
      await boardHeadingFocused(page);
      assert.equal(fixture.writes.length, 1);
      assert.equal(fixture.row.sip_revisit_date, "");
      await page.getByText("Showing 1 of 1 active item").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });

  for (const [name, sizes, mobileA, mobileB] of [
    ["Desktop stale-clear versus mobile reschedule", [desktop, mobile], false, true],
    ["Mobile stale-clear versus desktop reschedule", [mobile, desktop], true, false],
  ]) {
    await caseRun(name + ": no newer date cleared; review then retry succeeds",
      origin, sizes, async ([a, b]) => {
        const dialog = await openClear(a, mobileA);
        await changeDate(b, mobileB);
        await dialog.getByRole("button", { name: "Clear & return to active" }).click();
        await dialog.getByRole("alert").waitFor();
        await dialog.getByRole("button", { name: "Close & review board" }).waitFor();
        assert.equal(await dialog.getByRole("button", { name: "Clear & return to active" }).isDisabled(), true);
        assert.equal(await dialog.getByRole("button", { name: "Close & review board" })
          .evaluate((element) => document.activeElement === element), true, "Conflict focuses enabled review action");
        await checkDialogOnScreen(a);
        assert.equal(fixture.writes.length, 1, "Only session B has saved");
        assert.equal(fixture.row.sip_revisit_date, newerDate);
        await a.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await boardHeadingFocused(a);
        const retried = await openClear(a, mobileA);
        await retried.getByRole("button", { name: "Clear & return to active" }).click();
        await retried.waitFor({ state: "hidden" });
        await waitFor(2, "");
        await boardHeadingFocused(a);
        await a.getByText("Showing 1 of 1 active item").waitFor();
      });
  }
  await caseRun("Mobile: reopening legacy future-dated WIP atomically returns it to Active",
    origin, [mobile], async ([page]) => {
      await page.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor();
      await page.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click();
      await waitFor(1, "");
      await page.getByText("Showing 1 of 1 active item").waitFor();
      assert.equal(fixture.row.sip_completed, false);
      await reopenedWorkOrderFocused(page);
      assert.deepEqual(fixture.writes, [{ sip_completed: false, sip_revisit_date: "" }]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, (state) => { state.row.sip_completed = true; });

  await caseRun("Two browsers: concurrent completed-WIP reopen writes once and returns both boards to Active",
    origin, [desktop, mobile], async ([a, b]) => {
      await Promise.all([
        a.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor(),
        b.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor(),
      ]);
      await Promise.all([
        a.getByRole("checkbox", { name: "Reopen Synthetic Revisit QA in active SIPs" }).click(),
        b.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click(),
      ]);
      await waitFor(1, "");
      await Promise.all([
        a.getByText("Showing 1 of 1 active item").waitFor(),
        b.getByText("Showing 1 of 1 active item").waitFor(),
      ]);
      console.log("SIMULTANEOUS_FOCUS_DIAGNOSTIC", await Promise.all([a, b].map(page => page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0, 70), connected: document.activeElement?.isConnected, visible: Boolean(document.activeElement?.getClientRects().length), activeId: document.activeElement?.dataset?.sipsActiveFocusId })) )));
      await Promise.all([reopenedWorkOrderFocused(a), reopenedWorkOrderFocused(b)]);
      assert.equal(fixture.row.sip_completed, false);
      assert.equal(fixture.row.sip_revisit_date, "");
      assert.equal(fixture.writes.length, 1, "The conditional second reopen must not make a duplicate write");
    }, (state) => { state.row.sip_completed = true; });

  await caseRun("Mobile: stale undated WIP reopen cannot erase a different session's future Revisit",
    origin, [mobile], async ([page]) => {
      await page.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor();
      // Simulate a distinct scheduler saving between the mobile page's load
      // and its Reopen click; the normal browser mock uses the same shared CAS
      // state but cannot date-edit a completed item directly from this board.
      fixture.row.sip_revisit_date = newerDate;
      fixture.row.updated_date = String(Number(fixture.row.updated_date) + 1).padStart(9, "0");
      await page.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click();
      await page.getByRole("alert").filter({ hasText: "changed in another session (sip_revisit_date)" }).waitFor();
      await page.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor();
      assert.equal(fixture.row.sip_revisit_date, newerDate);
      assert.equal(fixture.row.sip_completed, true);
      assert.equal(fixture.writes.length, 0, "The stale reopen must not write anything");
      await page.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click();
      await waitFor(1, "");
      await page.getByText("Showing 1 of 1 active item").waitFor();
      await reopenedWorkOrderFocused(page);
      assert.equal(fixture.row.sip_completed, false);
    }, (state) => {
      state.row.sip_completed = true;
      state.row.sip_revisit_date = "";
    });

  await caseRun("Mobile: when filters hide a reopened WIP, focus falls back to the board heading",
    origin, [mobile], async ([page]) => {
      await page.getByRole("button", { name: /Needs attention/ }).click();
      await page.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor();
      await page.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click();
      await waitFor(1, "");
      await page.getByText("Showing 0 of 1 active item").waitFor();
      await boardHeadingFocused(page);
      assert.equal(fixture.row.sip_completed, false);
      assert.equal(fixture.row.sip_revisit_date, "");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, (state) => { state.row.sip_completed = true; });

  await caseRun("Mobile: reopening does not steal focus from another control used during the save",
    origin, [mobile], async ([page]) => {
      await page.getByRole("heading", { name: "Completed WIP Items (1)" }).waitFor();
      await page.getByRole("button", { name: "Reopen Synthetic Revisit QA in the active SIPs queue" }).click();
      await page.getByRole("button", { name: "Reopening Synthetic Revisit QA in the active SIPs queue" }).waitFor();
      const search = page.getByPlaceholder(/Search customer/);
      await search.focus();
      await waitFor(1, "");
      await page.getByText("Showing 1 of 1 active item").waitFor();
      assert.equal(await search.evaluate(node => document.activeElement === node), true,
        "A deliberate focus change during save must be preserved");
      assert.equal(fixture.row.sip_completed, false);
    }, (state) => {
      state.row.sip_completed = true;
      state.updateDelayMs = 450;
    });


  await caseRun("320px phone: Revisit calendar, Clear dialog and keyboard stay inside the viewport",
    origin, [{ width: 320, height: 568 }], async ([page]) => {
      const trigger = page.locator("#sips-revisit-later")
        .getByRole("button", { name: "Change Revisit Date" });
      await trigger.click();
      const calendar = page.locator(".rdp:visible").last();
      await calendar.waitFor();
      const rect = await calendar.boundingBox();
      const viewport = page.viewportSize();
      assert.ok(rect && rect.x >= -1 && rect.x + rect.width <= viewport.width + 1,
        "The actual Revisit calendar must fit within a 320px viewport");
      await page.getByRole("button", { name: "Clear date & return to active" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Return this item to active SIPs?" });
      await dialog.waitFor();
      await checkDialogOnScreen(page);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await boardHeadingFocused(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(fixture.writes.length, 0);
    });


  await caseRun("320px short phone: long Clear failure remains scrollable, keyboard-safe and write-free",
    origin, [{ width: 320, height: 480 }], async ([page]) => {
      const dialog = await openClear(page, true);
      await dialog.getByRole("button", { name: "Clear & return to active" }).click();
      const error = dialog.getByRole("alert");
      await error.waitFor();
      assert.match(await error.innerText(), /Synthetic long error detail/);
      await checkDialogOnScreen(page);
      const close = dialog.getByRole("button", { name: "Close & review board" });
      await close.waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("Close & review board"));
      assert.equal(await close.evaluate(node => document.activeElement === node), true);
      assert.equal(await dialog.getByRole("button", { name: "Clear & return to active" }).isDisabled(), true);
      assert.equal(fixture.writes.length, 0);
      assert.equal(fixture.row.sip_revisit_date, initialDate);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await boardHeadingFocused(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, (state) => {
      state.failNextWriteMessage = "Synthetic long error detail: " + "Revisit changed in another session. ".repeat(45);
    });


  await caseRun("320px phone: pending Clear blocks Escape and duplicate submission until saved",
    origin, [{ width: 320, height: 568 }], async ([page]) => {
      const dialog = await openClear(page, true);
      await dialog.getByRole("button", { name: "Clear & return to active" }).click();
      await dialog.getByRole("button", { name: "Clear & return to active" }).waitFor({ state: "visible" });
      assert.equal(await dialog.getByRole("button", { name: "Clear & return to active" }).isDisabled(), true);
      assert.equal(await dialog.getByRole("button", { name: "Keep revisit date" }).isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), true, "Pending Clear cannot dismiss its confirmation");
      await checkDialogOnScreen(page);
      await waitFor(1, "");
      await dialog.waitFor({ state: "hidden" });
      await boardHeadingFocused(page);
      assert.deepEqual(fixture.writes, [{ sip_revisit_date: "" }], "Clear must write only once");
      await page.getByText("Showing 1 of 1 active item").waitFor();
    }, (state) => { state.updateDelayMs = 700; });

  console.log("PASS " + passed + " isolated Chromium SIPS browser scenarios");
  console.log("Synthetic conditional Work Order fixture only; authenticated nonproduction QA still required.");
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
