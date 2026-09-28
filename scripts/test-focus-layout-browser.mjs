// Real CCS Layout + real Focus Timer in isolated Chromium.
// App-specific network/data components are mocked; no Base44 credentials,
// production sessions or Time Clock business records are used.
import assert from "node:assert/strict";
import {
  copyFile, mkdtemp, readFile, readdir, rm, symlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FOCUS_PLAYWRIGHT_PATH ||
  "/tmp/sips-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "ccs-focus-layout-"));
const harnessRoot = path.join(appRoot, "scripts/focus-layout-harness");
let server;
let browser;
let passed = 0;

function monitor(page, origin, errors) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith("http") && !request.url().startsWith(origin)) {
      errors.push("Unexpected outside request: " + request.url());
    }
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
    await run(page, context, errors);
    assert.deepEqual(errors, [], "No page exceptions or outside-origin requests");
    passed += 1;
    console.log("PASS " + name);
  } finally {
    await context.close();
  }
}

const aliases = [
  ["@/components/auth/EmailGate", "mockAuth.jsx"],
  ["@/components/auth/LoginGate", "mockShellComponents.jsx"],
  ["@/components/workflow/GlobalSearch", "mockShellComponents.jsx"],
  ["@/components/workflow/AddTaskDialog", "mockShellComponents.jsx"],
  ["@/components/layout/MultiPageView", "mockShellComponents.jsx"],
  ["@/components/shared/ImportProgressContext", "mockShellComponents.jsx"],
  ["@/components/permitting/ResearchProgressContext", "mockShellComponents.jsx"],
  ["@/components/shared/MultiImportContext", "mockShellComponents.jsx"],
  ["@/components/permitting/ResearchProgressBar", "mockShellComponents.jsx"],
  ["@/components/announcements/AnnouncementManager", "mockShellComponents.jsx"],
  ["@/components/announcements/AnnouncementContext", "mockShellComponents.jsx"],
  ["@/components/announcements/AnnouncementBanner", "mockShellComponents.jsx"],
  ["@/components/timeclock/WorkPauseOverlay", "mockWorkPauseOverlay.jsx"],
  ["@/components/timeclock/GlobalWorkPauseControl", "mockWorkPauseControl.jsx"],
  ["@/components/admin/SmartsheetSyncWidget", "mockShellComponents.jsx"],
].map(([find, file]) => ({ find, replacement: path.join(harnessRoot, file) }));

try {
  const [layoutSource, focusSource, pauseSource] = await Promise.all([
    readFile(path.join(appRoot, "src/Layout.jsx"), "utf8"),
    readFile(path.join(appRoot, "src/components/timeclock/GlobalFocusTimer.jsx"), "utf8"),
    readFile(path.join(appRoot, "src/components/timeclock/WorkPauseOverlay.jsx"), "utf8"),
  ]);
  assert.match(layoutSource, /<FocusPausePair[\s\S]*currentUser=\{currentUser\}/,
    "Layout mounts the paired Focus + official Work Pause control with authenticated identity");
  assert.doesNotMatch(layoutSource, /<GlobalFocusTimer/,
    "Layout no longer mounts a separate floating Focus Timer trigger");
  assert.match(layoutSource, /data-shell-compact-toggle/,
    "Layout exposes the tiny Compact View control");
  assert.match(layoutSource, /data-shell-collapse-toggle/,
    "Layout exposes the Collapse Bar control");
  assert.match(layoutSource, /ccsShellCollapsed/,
    "Collapsed shell preference persists locally");
  assert.match(layoutSource, /ccsShellCompact/,
    "Compact shell preference persists locally");
  assert.match(layoutSource, /180ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    "Shell uses the approved fast smooth transition curve");
  assert.match(layoutSource, /mobile-bottom-nav[^"]*z-50/,
    "Mobile navigation retains its z-50 shell layer");
  assert.match(focusSource, /data-focus-timer-trigger/,
    "Focus Timer exposes a reusable paired trigger");
  assert.match(focusSource, /<Dialog open=\{open\} onOpenChange=\{setOpen\} modal=\{false\}>/,
    "Personal Focus dialog does not impose a modal interaction lock over official Work Pause");
  assert.match(focusSource, /DialogContent className="z-\[90\]/,
    "Focus dialog stays below official Work Pause");
  assert.match(pauseSource, /pointer-events-auto fixed inset-0 z-\[100\]/,
    "Official Work Pause remains interactive and highest-priority over Focus UI");
  passed += 1;
  console.log("PASS Source stacking and Layout integration contracts");

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
    'import { BrowserRouter, Link, useLocation } from "react-router-dom";',
    'import Layout from "/@fs' + path.join(appRoot, "src/Layout.jsx") + '";',
    'function SyntheticPage() {',
    '  const location = useLocation();',
    '  return <div className="p-4" data-testid="synthetic-page">',
    '    <div data-testid="synthetic-path">{location.pathname}</div>',
    '    <Link to="/synthetic-next">Synthetic Route</Link>',
    '  </div>;',
    '}',
    'createRoot(document.getElementById("root")).render(',
    '  <BrowserRouter><Layout currentPageName="Synthetic"><SyntheticPage /></Layout></BrowserRouter>',
    ');',
  ].join("\n"));

  server = await createServer({
    configFile: false,
    root: scratch,
    plugins: [react()],
    resolve: {
      alias: [
        ...aliases,
        { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [appRoot, scratch] },
    },
    logLevel: "error",
  });
  await server.listen();
  const origin = "http://127.0.0.1:" + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  await freshCase("Desktop top navigation and route persistence use the real CCS Layout", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      await page.locator(".top-nav").waitFor({ state: "visible" });
      const focusButton = page.getByRole("button", { name: /Open focus timer/ });
      await focusButton.waitFor();
      await focusButton.click();
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      await dialog.getByLabel("The one thing I'm working on").fill("Layout route persistence");
      await dialog.getByLabel("Focus minutes").selectOption("10");
      await dialog.getByRole("button", { name: "Start focusing" }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Synthetic Route" }).click();
      await page.getByTestId("synthetic-path").filter({ hasText: "/synthetic-next" }).waitFor();
      await page.getByRole("button", { name: /Open focus timer, .*remaining/ }).click();
      assert.equal(await page.getByLabel("The one thing I'm working on").inputValue(),
        "Layout route persistence");
      const state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("ccs_focus_timer:v1:synthetic-layout-user-a")));
      assert.equal(state.status, "running");
      assert.equal(state.focusMinutes, 10);
    });

  await freshCase("Signed-out state hides Focus Timer and account remounts remain isolated", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      await page.getByLabel("The one thing I'm working on").fill("Private layout task A");
      await page.keyboard.press("Escape");

      await page.goto(origin + "/?guest=1", { waitUntil: "networkidle" });
      assert.equal(await page.getByRole("button", { name: /Open focus timer/ }).count(), 0);

      await page.goto(origin + "/?user=synthetic-layout-user-b", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      assert.equal(await page.getByLabel("The one thing I'm working on").inputValue(), "");
      await page.keyboard.press("Escape");

      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      assert.equal(await page.getByLabel("The one thing I'm working on").inputValue(),
        "Private layout task A");
    });

  await freshCase("Mobile keeps Focus paired inside More menu with no floating obstruction or overflow", origin,
    { width: 360, height: 740 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      const nav = page.locator(".mobile-bottom-nav");
      await nav.waitFor({ state: "visible" });
      assert.equal(await page.locator("[data-focus-timer-trigger]:visible").count(), 0,
        "Focus trigger is not floating over mobile work content");
      await page.getByRole("button", { name: "More" }).click();
      const focusButton = page.locator("[data-focus-timer-trigger]:visible");
      await focusButton.waitFor();
      const pair = page.locator("[data-focus-pause-pair]:visible");
      await pair.waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await focusButton.click();
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      const dialogBox = await dialog.boundingBox();
      assert.ok(dialogBox && dialogBox.x >= -1 && dialogBox.x + dialogBox.width <= 361,
        "Focus dialog fits narrow mobile viewport");
    });

  await freshCase("Official Work Pause layer outranks Focus UI without altering personal timer state", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Open focus timer/ }).click();
      await page.getByLabel("The one thing I'm working on").fill("Independent personal focus state");
      await page.getByRole("button", { name: "Start focusing" }).click();
      const before = await page.evaluate(() =>
        localStorage.getItem("ccs_focus_timer:v1:synthetic-layout-user-a"));

      await page.evaluate(() => window.dispatchEvent(new CustomEvent("synthetic-work-pause", {
        detail: { paused: true },
      })));
      const pauseOverlay = page.getByTestId("synthetic-work-pause-overlay");
      await pauseOverlay.waitFor();
      const pauseZ = Number(await pauseOverlay.evaluate((node) => getComputedStyle(node).zIndex));
      const dialogZ = Number(await page.getByRole("dialog", { name: "My Focus Timer" })
        .evaluate((node) => getComputedStyle(node).zIndex));
      assert.equal(pauseZ, 100);
      assert.equal(dialogZ, 90);
      assert.ok(pauseZ > dialogZ);

      await pauseOverlay.getByRole("button", { name: "Resume synthetic Work" }).click();
      await pauseOverlay.waitFor({ state: "detached" });
      await page.getByRole("dialog", { name: "My Focus Timer" }).waitFor();
      const after = await page.evaluate(() =>
        localStorage.getItem("ccs_focus_timer:v1:synthetic-layout-user-a"));
      assert.equal(after, before, "Work Pause UI does not mutate Focus Timer storage");
    });

  console.log("PASS " + passed + "/" + passed + " real-Layout Focus Timer acceptance scenarios");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(scratch, { recursive: true, force: true });
}
