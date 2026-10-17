// Isolated desktop/mobile Chromium acceptance of the REAL SIPS Template Builder.
// Synthetic saved checklist answers and template settings only. No production
// SDK, auth, backend requests, real Work Orders, or persistence writes.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const scratch = await mkdtemp(path.join(tmpdir(), "sips-template-browser-"));
const playwrightPath = process.env.SIPS_PLAYWRIGHT_PATH ||
  "/tmp/sips-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
let vite;
let browser;
let passed = 0;

function observe(page, origin, errors) {
  page.on("pageerror", error => errors.push("Browser error: " + error.message));
  page.on("request", request => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith(origin)) {
      errors.push("External request forbidden: " + url);
    }
  });
  page.route("**/*", route => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue();
  });
}

async function checkViewport(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true, "The Template Builder must not overflow the document horizontally");
  const wrapper = page.locator(".fixed.inset-0.bg-black\\/60");
  const rect = await wrapper.boundingBox();
  assert.ok(rect && rect.x >= -1 && rect.width <= page.viewportSize().width + 1,
    "Modal backdrop must fit inside the viewport");
}

async function scenario(name, origin, viewport, run) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const failures = [];
  try {
    observe(page, origin, failures);
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByText("1 saved on Work Order · 0 new to add").waitFor();
    await run(page);
    assert.deepEqual(failures, [], "No runtime errors or external HTTP requests");
    assert.equal(await page.evaluate(() => window.__sipsSaved.length), 2,
      "Synthetic saved checklist rows must remain intact");
    assert.equal(await page.evaluate(() => window.__sipsWriteAttempts), 0,
      "No actual or synthetic persistence write attempts");
    await checkViewport(page);
    console.log("PASS " + name);
    passed++;
  } finally {
    await context.close();
  }
}

async function assertSaved(page) {
  const savedName = page.getByRole("textbox", { name: "Saved product name Existing Cabinet" });
  assert.equal(await savedName.isDisabled(), true, "Saved product names are read-only here");
  assert.equal(await savedName.inputValue(), "Existing Cabinet");
  assert.equal(await page.getByRole("button", {
    name: "Deselect pending checklist Existing Cabinet; saved Work Order data is unchanged",
  }).count(), 0, "Saved products must not have a pending-template removal control");
  assert.equal(await page.getByLabel("Saved checklist — order unchanged").count(), 1);
  assert.equal(await page.getByRole("button", {
    name: "Safety Review, already applied to saved Work Order checklist",
  }).getAttribute("aria-disabled"), "true", "Saved option cannot be deselected");
  assert.equal(await page.getByRole("button", {
    name: "Safety Review, already applied to saved Work Order checklist",
  }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByRole("button", {
    name: "Nothing new selected to add to project",
  }).isDisabled(), true, "Saved-only selection cannot run Apply");
}

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const assets = await readdir(path.join(root, "dist/assets"));
  const css = assets.find(asset => asset.endsWith(".css"));
  if (!css) throw Error("Build production CSS before browser acceptance");
  await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "mockClient.js"), [
    "// These marker entities never connect to Base44.",
    'export const base44 = { entities: { ChecklistSubItem: { fixtureKind: "options" },',
    'AuthorizedEmail: { fixtureKind: "users" }, GlobalSettings: { fixtureKind: "settings" } } };',
  ].join("\n"));
  await writeFile(path.join(scratch, "mockReaders.js"), [
    "// Read-only synthetic template data. Any save attempt is a test failure.",
    "export async function loadAllEntityRows({ entity }) {",
    ' if (entity.fixtureKind === "users") return [];',
    ' if (entity.fixtureKind === "options") return [',
    '   { id: "safety", name: "Safety Review", applies_to_product_types: ["Cabinet Sign"], order: 0 },',
    '   { id: "permit", name: "Permit Review", applies_to_product_types: ["Cabinet Sign"], order: 1 },',
    " ];",
    ' throw Error("Unexpected synthetic entity read");',
    "}",
    "export async function loadSingleGlobalSetting({ settingKey }) {",
    " const settings = {",
    '  productTypes: { items: ["Cabinet Sign"] },',
    '  productTypeTemplates: { "Cabinet Sign": { items: [{ id: "base-one", text: "Build cabinet" }] } },',
    '  subTemplateItems: { safety: { items: [{ id: "safety-one", text: "Review safety" }] },',
    '    permit: { items: [{ id: "permit-one", text: "Verify permit" }] } },',
    "  dropdownConditions: { items: [] },",
    " };",
    ' if (!(settingKey in settings)) throw Error("Unexpected synthetic settings read: " + settingKey);',
    " return { id: settingKey, setting_key: settingKey, setting_value: settings[settingKey] };",
    "}",
    "export async function saveGlobalSettingValueIfUnchanged() {",
    ' window.__sipsWriteAttempts++; throw Error("Forbidden isolated Template Builder save");',
    "}",
  ].join("\n"));
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react"; import {createRoot} from "react-dom/client";',
    'import TemplateBuilder from "/@fs' + path.join(root, "src/components/sips/TemplateBuilder.jsx") + '";',
    'window.__sipsSaved = [',
    '  {id:"saved-base", product_name:"Existing Cabinet", product_type:"Cabinet Sign", text:"Base checklist", status:"Completed", approved_by:"Supervisor"},',
    '  {id:"saved-option", product_name:"Existing Cabinet", product_type:"Cabinet Sign", sub_template_name:"Safety Review", text:"Review safety", status:"Completed", approved_by:"Supervisor"}',
    '];',
    'window.__sipsApplied = []; window.__sipsWriteAttempts = 0;',
    'function Fixture() { return <TemplateBuilder isOpen={true} isAdmin={false}',
    ' existingChecklist={window.__sipsSaved} workOrderProducts={[]}',
    ' onApplyTemplate={rows => window.__sipsApplied.push(rows)} onClose={() => {}} />; }',
    'createRoot(document.getElementById("root")).render(<Fixture />);',
  ].join("\n"));

  vite = await createServer({
    configFile: false,
    root: scratch,
    plugins: [react()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: path.join(scratch, "mockClient.js") },
      { find: "@/components/estimator/loadAllEntityRows", replacement: path.join(scratch, "mockReaders.js") },
      { find: "@/components/permitting/permitGlobalSettingsPersistence", replacement: path.join(scratch, "mockReaders.js") },
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
    ] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  for (const [label, viewport] of [
    ["Desktop", { width: 1366, height: 900 }],
    ["320px phone", { width: 320, height: 568 }],
  ]) {
    await scenario(label + ": saved checklist and already-applied option stay locked", origin, viewport, async page => {
      await assertSaved(page);
      await page.getByRole("button", { name: "Safety Review, already applied to saved Work Order checklist" }).click();
      assert.equal(await page.getByText("1 saved on Work Order · 0 new to add").isVisible(), true);
      assert.equal(await page.getByRole("button", { name: "Nothing new selected to add to project" }).isDisabled(), true);
      assert.equal(await page.evaluate(() => window.__sipsApplied.length), 0);
    });

    await scenario(label + ": pending option can be selected and deselected without deleting saved answers",
      origin, viewport, async page => {
        await page.getByRole("button", { name: "Select checklist option Permit Review to add to Existing Cabinet" }).click();
        await page.getByText("1 saved on Work Order · 1 new to add").waitFor();
        assert.equal(await page.getByText("To add", { exact: true }).isVisible(), true);
        assert.equal(await page.getByRole("button", { name: "Apply 1 new checklist selection to project" }).isEnabled(), true);
        await page.getByRole("button", {
          name: "Deselect pending checklist option Permit Review for Existing Cabinet; saved answers stay unchanged",
        }).click();
        await page.getByText("1 saved on Work Order · 0 new to add").waitFor();
        assert.equal(await page.getByRole("button", { name: "Nothing new selected to add to project" }).isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__sipsApplied.length), 0);
        await assertSaved(page);
      });

    await scenario(label + ": new checklist add and deselect preserves saved setup", origin, viewport, async page => {
      await page.getByRole("button", { name: "Add Cabinet Sign checklist with 1 items" }).click();
      await page.getByText("1 saved on Work Order · 1 new to add").waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Product name for Cabinet Sign checklist" }).isEnabled(), true);
      await page.getByRole("button", {
        name: "Deselect pending checklist Cabinet Sign; saved Work Order data is unchanged",
      }).click();
      await page.getByText("1 saved on Work Order · 0 new to add").waitFor();
      assert.equal(await page.getByRole("button", { name: "Nothing new selected to add to project" }).isDisabled(), true);
      await assertSaved(page);
    });
  }

  await scenario("Desktop: applying one new option emits additions only, never rewrites answered checklist",
    origin, { width: 1366, height: 900 }, async page => {
      await page.getByRole("button", { name: "Select checklist option Permit Review to add to Existing Cabinet" }).click();
      await page.getByRole("button", { name: "Apply 1 new checklist selection to project" }).click();
      const result = await page.evaluate(() => ({
        additions: window.__sipsApplied,
        saved: window.__sipsSaved,
      }));
      assert.equal(result.additions.length, 1, "Exactly one local apply callback");
      assert.equal(result.additions[0].length, 1, "Only the selected option is emitted");
      assert.equal(result.additions[0][0].type, "sub_template");
      assert.equal(result.additions[0][0].parentProduct, "Existing Cabinet");
      assert.equal(result.additions[0][0].subTemplateName, "Permit Review");
      assert.equal(result.additions[0][0].items[0].text, "Verify permit");
      assert.deepEqual(result.saved.map(row => row.status), ["Completed", "Completed"]);
      assert.deepEqual(result.saved.map(row => row.approved_by), ["Supervisor", "Supervisor"]);
    });

  console.log("PASS " + passed + " isolated Chromium Template Builder selection scenarios (read-only)");
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
