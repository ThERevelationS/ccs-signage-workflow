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
  assert.match(layoutSource, /const SHELL_SPRING = \{[\s\S]*stiffness: 210,[\s\S]*damping: 30,[\s\S]*mass: 0\.82/,
    "Shell collapse uses a continuous spring rather than a short CSS jump");
  assert.match(layoutSource, /\.ccs-glass-shell \{[\s\S]*linear-gradient\(142deg, rgba\(241,245,249,0\.78\)[\s\S]*backdrop-filter: blur\(34px\) saturate\(185%\)/,
    "Light mode uses the approved brighter crystal glass shell");
  assert.match(layoutSource, /\.dark \.ccs-glass-shell \{[\s\S]*linear-gradient\(145deg, rgba\(20,27,48,0\.84\)/,
    "Dark mode preserves the approved deep navy glass shell");
  assert.match(layoutSource, /\.ccs-glass-nav-item \{[\s\S]*rgb\(var\(--glass-accent-rgb\) \/ 0\.18\)/,
    "Light-mode navigation items retain colored refraction without the dark base");
  assert.match(layoutSource, /\.dark \.ccs-glass-nav-item \{[\s\S]*rgb\(var\(--glass-accent-rgb\) \/ 0\.30\)/,
    "Dark mode preserves visible per-button color refraction");
  assert.match(layoutSource, /\.ccs-focus-pause-glass \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    "Focus and Pause Work use two true equal-width segments");
  assert.match(layoutSource, /\.ccs-focus-segment[\s\S]*\.ccs-pause-segment/,
    "Focus and Pause Work use independent glass segment treatments");
  assert.match(layoutSource, /data-shell-navigation-handle="(?:side|top)"/,
    "Collapsed navigation exposes a dedicated bump-out handle");
  assert.match(layoutSource, />Navigation Bar</,
    "Collapsed handle is visibly labeled Navigation Bar");
  assert.match(layoutSource, /<motion\.main/,
    "Working canvas animates with the same spring as the navigation shell");
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
      const topNav = page.locator(".top-nav");
      await topNav.waitFor({ state: "visible" });
      await page.waitForTimeout(700);
      const topNavBox = await topNav.boundingBox();
      const mainPadding = Number.parseFloat(await page.locator("main").evaluate((node) => getComputedStyle(node).paddingTop));
      assert.ok(topNavBox && mainPadding >= topNavBox.height - 2,
        `Desktop work content starts below the expanded top shell (nav=${topNavBox?.height}, padding=${mainPadding})`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        "Desktop shell creates no horizontal page overflow");
      const topLinks = page.locator("[data-top-navigation-links]:visible");
      const topLinksBox = await topLinks.boundingBox();
      assert.ok(topNavBox && topLinksBox &&
        Math.abs((topLinksBox.y + topLinksBox.height / 2) - (topNavBox.y + topNavBox.height / 2)) <= 8,
        `Roomy top navigation links are vertically centered in the bar (navCenter=${topNavBox ? topNavBox.y + topNavBox.height / 2 : "?"}, linksCenter=${topLinksBox ? topLinksBox.y + topLinksBox.height / 2 : "?"})`);
      const pair = page.locator("[data-focus-pause-pair]:visible");
      const focusButton = page.getByRole("button", { name: /Open focus timer/ });
      const pauseButton = page.locator("[data-work-pause-trigger]:visible");
      await pair.waitFor();
      await focusButton.waitFor();
      await pauseButton.waitFor();
      const [focusBox, pauseBox] = await Promise.all([focusButton.boundingBox(), pauseButton.boundingBox()]);
      assert.ok(focusBox && pauseBox && Math.abs(focusBox.width - pauseBox.width) <= 1.5,
        `Focus and Pause Work are true 50/50 segments (focus=${focusBox?.width}, pause=${pauseBox?.width})`);
      const [focusBackground, pauseBackground] = await Promise.all([
        focusButton.evaluate((node) => getComputedStyle(node).backgroundImage),
        pauseButton.evaluate((node) => getComputedStyle(node).backgroundImage),
      ]);
      assert.notEqual(focusBackground, pauseBackground, "Focus and Pause Work have independently tinted glass halves");
      assert.equal(await topNav.evaluate((node) => getComputedStyle(node).color), "rgb(15, 23, 42)",
        "Light-mode shell uses dark text on the brighter glass material");
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

  await freshCase("Compact View persists and actually tightens desktop navigation density", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      const compactToggle = page.locator("[data-shell-compact-toggle]:visible");
      const workflowLink = page.getByRole("link", { name: "My Workflow" }).first();
      const beforeNavBox = await page.locator(".top-nav").boundingBox();
      await compactToggle.waitFor();
      const beforePadding = Number.parseFloat(await workflowLink.evaluate((node) => getComputedStyle(node).paddingTop));
      await compactToggle.click();
      await page.waitForTimeout(700);
      const afterPadding = Number.parseFloat(await workflowLink.evaluate((node) => getComputedStyle(node).paddingTop));
      assert.ok(afterPadding < beforePadding, "Compact View reduces navigation padding");
      const compactNavBox = await page.locator(".top-nav").boundingBox();
      const compactMainPadding = Number.parseFloat(await page.locator("main").evaluate((node) => getComputedStyle(node).paddingTop));
      assert.ok(compactNavBox && compactMainPadding >= compactNavBox.height - 1,
        "Compact shell still reserves enough space for page content");
      assert.ok(beforeNavBox && compactNavBox.height <= beforeNavBox.height * 0.82,
        `Compact mode materially reduces top shell height (before=${beforeNavBox?.height}, after=${compactNavBox?.height})`);
      assert.equal(await compactToggle.getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => localStorage.getItem("ccsShellCompact")), "true");

      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await page.locator("[data-shell-compact-toggle]:visible").getAttribute("aria-pressed"), "true",
        "Compact View survives reload");
    });

  await freshCase("Top bar spring-collapse is multi-frame; Navigation Bar bump previews and pins", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      const collapseToggle = page.locator("[data-shell-collapse-toggle]:visible");
      const topNav = page.locator(".top-nav");
      await collapseToggle.waitFor();
      await collapseToggle.click();

      const collapseSamples = await page.evaluate(async () => {
        const node = document.querySelector(".top-nav");
        const values = [];
        for (let index = 0; index < 16; index += 1) {
          await new Promise(requestAnimationFrame);
          values.push(node.getBoundingClientRect().y);
        }
        return values;
      });
      assert.ok(new Set(collapseSamples.map((value) => Math.round(value))).size >= 5,
        "Top shell moves through multiple rendered positions instead of jumping in two frames");

      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => localStorage.getItem("ccsShellCollapsed")), "true");
      let box = await topNav.boundingBox();
      assert.ok(box && box.y < -Math.max(20, box.height / 2), "Collapsed top bar clears working content");

      const handle = page.locator('[data-shell-navigation-handle="top"]');
      await handle.waitFor({ state: "visible" });
      assert.match(await handle.textContent(), /Navigation Bar/i);

      await handle.hover();
      await page.waitForTimeout(700);
      box = await topNav.boundingBox();
      assert.ok(box && box.y >= -1, "Hovering the centered bump smoothly previews the full top bar");
      const openTopHandleBox = await handle.boundingBox();
      assert.ok(box && openTopHandleBox && openTopHandleBox.y >= box.y + box.height - 2,
        "Expanded top navigation moves the Navigation Bar bump below the controls instead of covering them");

      await page.mouse.move(700, 500);
      await page.waitForTimeout(700);
      box = await topNav.boundingBox();
      assert.ok(box && box.y < -Math.max(20, box.height / 2), "Top bar smoothly retracts after hover leaves");

      await handle.click();
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => localStorage.getItem("ccsShellCollapsed")), "false",
        "Navigation Bar bump can pin the shell open");
    });

  await freshCase("Sidebar becomes truly compact and uses the same smooth bump-out collapse", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      await page.locator("[data-shell-compact-toggle]:visible").click();
      await page.waitForTimeout(700);
      await page.getByTitle("Switch to Sidebar").click();
      const sideNav = page.locator(".side-nav");
      await sideNav.waitFor({ state: "visible" });
      await page.waitForTimeout(700);
      let box = await sideNav.boundingBox();
      assert.ok(box && box.width <= 160, `Compact sidebar is materially narrow (width=${box?.width})`);
      assert.equal(await page.locator("[data-focus-pause-pair]:visible").count(), 1,
        "Paired Focus/Pause control remains available in compact sidebar mode");

      await page.locator("[data-shell-collapse-toggle]:visible").click();
      const collapseSamples = await page.evaluate(async () => {
        const node = document.querySelector(".side-nav");
        const values = [];
        for (let index = 0; index < 16; index += 1) {
          await new Promise(requestAnimationFrame);
          values.push(node.getBoundingClientRect().x);
        }
        return values;
      });
      assert.ok(new Set(collapseSamples.map((value) => Math.round(value))).size >= 5,
        "Sidebar moves through multiple rendered positions instead of jumping");

      await page.waitForTimeout(700);
      box = await sideNav.boundingBox();
      assert.ok(box && box.x < -Math.max(20, box.width / 2), "Collapsed sidebar clears working content");
      const mainMargin = Number.parseFloat(await page.locator("main").evaluate((node) => getComputedStyle(node).marginLeft));
      assert.equal(Math.round(mainMargin), 10, "Working canvas expands to the narrow hover rail");

      const handle = page.locator('[data-shell-navigation-handle="side"]');
      await handle.waitFor({ state: "visible" });
      assert.match(await handle.textContent(), /Navigation Bar/i);
      await handle.hover();
      await page.waitForTimeout(700);
      box = await sideNav.boundingBox();
      assert.ok(box && box.x >= -1, "Hovering side bump smoothly previews the full sidebar");
      const openSideHandleBox = await handle.boundingBox();
      assert.ok(box && openSideHandleBox && openSideHandleBox.x >= box.x + box.width - 2,
        "Expanded compact sidebar moves the Navigation Bar bump outside the buttons instead of covering them");

      await page.mouse.move(700, 500);
      await page.waitForTimeout(700);
      box = await sideNav.boundingBox();
      assert.ok(box && box.x < -Math.max(20, box.width / 2), "Sidebar smoothly retracts after pointer leaves");

      await handle.click();
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => localStorage.getItem("ccsShellCollapsed")), "false");
    });

  await freshCase("Glass shell and Focus dialog remain dark-mode compatible", origin,
    { width: 1366, height: 900 }, async (page) => {
      await page.addInitScript(() => localStorage.setItem("darkMode", "true"));
      await page.goto(origin + "/?user=synthetic-layout-user-a", { waitUntil: "networkidle" });
      assert.equal(await page.locator("html").evaluate((node) => node.classList.contains("dark")), true);
      assert.equal(await page.locator(".top-nav").evaluate((node) => getComputedStyle(node).color), "rgb(248, 250, 252)",
        "Dark mode keeps the existing light-on-deep-navy color treatment");
      const pair = page.locator("[data-focus-pause-pair]:visible");
      await pair.waitFor();
      const backdrop = await pair.evaluate((node) => getComputedStyle(node).backdropFilter);
      assert.notEqual(backdrop, "none", "Glass pair keeps its backdrop treatment in dark mode");

      const salesBorder = await page.getByRole("link", { name: "Sales Pipeline" }).first()
        .evaluate((node) => getComputedStyle(node).borderColor);
      const estimatingBorder = await page.getByRole("link", { name: "Estimating" }).first()
        .evaluate((node) => getComputedStyle(node).borderColor);
      assert.notEqual(salesBorder, estimatingBorder,
        "Dark-mode navigation buttons retain distinct category-colored glass edges");

      await page.locator("[data-focus-timer-trigger]:visible").click();
      const dialog = page.getByRole("dialog", { name: "My Focus Timer" });
      await dialog.waitFor();
      const background = await dialog.evaluate((node) => getComputedStyle(node).backgroundColor);
      assert.notEqual(background, "rgb(255, 255, 255)", "Focus dialog switches away from pure white in dark mode");
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

      const pairedWorkPause = page.locator("[data-work-pause-trigger]:visible");
      await pairedWorkPause.waitFor();
      await pairedWorkPause.click();
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
