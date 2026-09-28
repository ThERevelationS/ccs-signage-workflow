// Actual global focus widget in isolated Chromium; no Base44 SDK, credentials,
// employee time records, network calls to CCS, or production browser session.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FOCUS_PLAYWRIGHT_PATH ||
  "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "ccs-focus-browser-"));
let server;
let browser;
let passed = 0;
function monitor(page, origin, errors) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith("http") && !request.url().startsWith(origin))
      errors.push("Unexpected outside request: " + request.url());
  });
  page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue();
  });
}
async function freshCase(name, origin, viewport, run) {
  const context = await browser.newContext({ viewport });
  const errors = [];
  try {
    const page = await context.newPage();
    monitor(page, origin, errors);
    await page.goto(origin + "/?user=synthetic-person-a", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Open focus timer/ }).waitFor();
    await run(page, context, errors);
    assert.deepEqual(errors, [], "No page exceptions or outside-origin requests");
    passed++;
    console.log("PASS " + name);
  } finally {
    await context.close();
  }
}
const stateKey = "ccs_focus_timer:v1:synthetic-person-a";
try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const assets = await readdir(path.join(appRoot, "dist/assets"));
  const css = assets.find((name) => name.endsWith(".css"));
  assert.ok(css, "First build the CCS site to produce Tailwind CSS");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
    '<script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import GlobalFocusTimer from "/@fs' +
      path.join(appRoot, "src/components/timeclock/GlobalFocusTimer.jsx") + '";',
    'const id = new URLSearchParams(location.search).get("user") || "synthetic-person-a";',
    'createRoot(document.getElementById("root")).render(<GlobalFocusTimer key={id} currentUser={{ id }} />);',
  ].join("\n"));
  server = await createServer({
    configFile: false, root: scratch, plugins: [react()],
    resolve: { alias: [
      { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [appRoot, scratch] } },
    logLevel: "error",
  });
  await server.listen();
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  await freshCase("Desktop start, pause, reload recovery and reset", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      await dialog.waitFor();
      await dialog.getByLabel("The one thing I'm working on").fill("Finish synthetic estimate");
      await dialog.getByLabel("Focus minutes").selectOption("10");
      await dialog.getByRole("button", { name: "Start focusing" }).click();
      const first = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(first.status, "running");
      assert.equal(first.focusMinutes, 10);
      await dialog.getByRole("button", { name: "Pause", exact: true }).click();
      const paused = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(paused.status, "paused");
      assert.ok(paused.remainingSeconds <= 600 && paused.remainingSeconds > 0);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      const recovered = page.getByRole("dialog", { name: "My Focus Timer" });
      await recovered.getByLabel("The one thing I'm working on").waitFor();
      assert.equal(await recovered.getByLabel("The one thing I'm working on").inputValue(),
        "Finish synthetic estimate");
      assert.equal(await recovered.getByLabel("Focus minutes").inputValue(), "10");
      await recovered.getByRole("button", { name: "Resume" }).click();
      await recovered.getByRole("button", { name: "Reset" }).click();
      const reset = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(reset.status, "idle");
      assert.equal(reset.remainingSeconds, 600);
    });

  await freshCase("Narrow mobile: visual countdown stays within viewport", origin,
    { width: 360, height: 700 }, async (page) => {
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      await dialog.waitFor();
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= 361, "Focus dialog fits mobile width");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await dialog.getByRole("button", { name: "Short Break" }).click();
      assert.equal(await dialog.getByRole("timer").getAttribute("aria-label"),
        "Break timer: 05:00 remaining");
      await dialog.getByRole("button", { name: "Start break" }).click();
      const current = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(current.mode, "break");
      assert.equal(current.status, "running");
    });

  await freshCase("End of focus opens completion dialog once; break is manual", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
        mode: "focus", status: "running", focusMinutes: 25, breakMinutes: 5,
        durationSeconds: 1500, remainingSeconds: 1, deadlineMs: Date.now() + 850,
        task: "Synthetic short focus", finishedFocusBlocks: 0,
      })), stateKey);
      await page.reload({ waitUntil: "networkidle" });
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      await dialog.waitFor({ timeout: 6000 });
      await dialog.getByText("Focus block complete. Take a break or start another.").waitFor();
      const done = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(done.finishedFocusBlocks, 1);
      assert.equal(done.status, "finished");
      await dialog.getByRole("button", { name: "Switch to a short break" }).click();
      assert.equal(await dialog.getByRole("timer").getAttribute("aria-label"),
        "Break timer: 05:00 remaining");
      const next = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);
      assert.equal(next.status, "idle");
      assert.equal(next.finishedFocusBlocks, 1);
    });

  await freshCase("Second account cannot see first account's task or timer", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      await page.getByLabel("The one thing I'm working on").fill("Private synthetic task A");
      await page.getByRole("button", { name: "Start focusing" }).click();
      await page.goto(origin + "/?user=synthetic-person-b", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      assert.equal(await page.getByLabel("The one thing I'm working on").inputValue(), "");
      assert.equal(await page.getByRole("timer").getAttribute("aria-label"),
        "Focus timer: 25:00 remaining");
      await page.goto(origin + "/?user=synthetic-person-a", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      assert.equal(await page.getByLabel("The one thing I'm working on").inputValue(),
        "Private synthetic task A");
    });

  console.log("PASS " + passed + "/" + passed + " isolated Focus Timer Chromium scenarios");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(scratch, { recursive: true, force: true });
}
