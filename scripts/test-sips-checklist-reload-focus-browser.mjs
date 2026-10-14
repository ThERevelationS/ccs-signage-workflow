// Isolated Chromium acceptance for the REAL SIPS checklist dialog and CSS.
// Only synthetic Work Orders; no app auth, SDK, network destinations or writes.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const source = path.join(root, "src");
const driver = process.env.SIPS_PLAYWRIGHT_PATH || "/tmp/sips-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(driver);
const scratch = await mkdtemp(path.join(tmpdir(), "sips-checklist-focus-"));
const row = {
  id: "synthetic-checklist-work-order", client_name: "Synthetic Checklist Focus",
  description: "Local read-only browser test", current_task_assigned_to: "SIPs",
  current_task_description: "Synthetic install", current_stage: "Production",
  is_rider: false, completed: false, deleted: false, sip_completed: false,
  sip_revisit_date: "", sip_checklist: [], products: [],
  updated_date: "synthetic-v1",
};
const fixture = { failNextRead: false, reads: 0, attemptedWrites: 0 };
let vite;
let browser;
let passed = 0;
const clone = v => JSON.parse(JSON.stringify(v));

function backend() {
  return {
    name: "isolated-sips-checklist-focus-fixture",
    configureServer(server) {
      server.middlewares.use("/__sips_focus_fixture", async (req, res) => {
        try {
          if (req.method !== "POST") throw Error("Only synthetic POST requests allowed");
          let body = "";
          for await (const chunk of req) body += chunk;
          const { op, id } = JSON.parse(body);
          let result;
          if (op === "read") {
            fixture.reads++;
            if (fixture.failNextRead) {
              fixture.failNextRead = false;
              throw Error("Synthetic reload network failure");
            }
            result = id === row.id ? [clone(row)] : [];
          } else if (op === "failNextRead") {
            fixture.failNextRead = true;
            result = { acknowledged: true };
          } else if (op === "stats") {
            result = { ...fixture };
          } else {
            throw Error("Unsupported fixture action: " + op);
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

function observe(page, origin, failures) {
  page.on("pageerror", error => failures.push("Runtime error: " + error.message));
  page.on("request", request => {
    const url = request.url();
    if (url.startsWith("http") && !url.startsWith(origin))
      failures.push("Forbidden external request: " + url);
  });
  page.route("**/*", route => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith(origin)
      ? route.abort("blockedbyclient") : route.continue();
  });
}

async function focusOn(page, role, name) {
  return page.waitForFunction(({ role, name }) => {
    const active = document.activeElement;
    return active?.getAttribute("role") === role && active.getAttribute("aria-label") === name;
  }, { role, name }, { timeout: 9000 });
}

async function focusHeading(page) {
  await page.waitForFunction(() => {
    const el = document.activeElement;
    return el?.tagName === "H2" && el.textContent?.includes("Synthetic Checklist Focus");
  }, { timeout: 9000 });
}

async function showSaveFailure(page) {
  await page.getByRole("button", { name: "Save & Revisit" }).click();
  const choice = page.getByRole("dialog", { name: "When should this return to SIPs?" });
  await choice.waitFor();
  await choice.getByRole("button", { name: "Keep in Active Queue (No Revisit)" }).click();
  await choice.waitFor({ state: "hidden" });
  const alert = page.getByRole("alert", { name: "SIP checklist save error" });
  await alert.waitFor();
  await page.waitForFunction(() =>
    document.activeElement?.getAttribute("aria-label") === "SIP checklist save error"
  );
  return alert;
}

async function scenario(name, origin, viewport, test) {
  fixture.failNextRead = false;
  const failures = [];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    observe(page, origin, failures);
    await page.goto(origin, { waitUntil: "networkidle" });
    const heading = page.getByRole("heading", { name: /Synthetic Checklist Focus/ });
    await heading.waitFor();
    await test(page);
    assert.deepEqual(failures, [], "No external requests or runtime errors");
    assert.equal(fixture.attemptedWrites, 0, "Fixture performed no persistence writes");
    console.log("PASS " + name);
    passed++;
  } finally {
    await context.close();
  }
}

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const assets = await readdir(path.join(root, "dist/assets"));
  const css = assets.find(name => name.endsWith(".css"));
  if (!css) throw Error("Build production CSS first");
  await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react"; import { createRoot } from "react-dom/client";',
    'import ProductChecklistDialog from "/@fs' + path.join(source, "components/sips/ProductChecklistDialog.jsx") + '";',
    'const workOrder = { id: "synthetic-checklist-work-order", client_name: "Synthetic Checklist Focus", description: "Local read-only browser test" };',
    'function Fixture() { const [open, setOpen] = React.useState(true); return <ProductChecklistDialog isOpen={open} workOrder={workOrder} isRegistered={true} isAdmin={false} onClose={() => setOpen(false)} onUpdate={() => {}} />; }',
    'createRoot(document.getElementById("root")).render(<Fixture />);',
  ].join("\n"));
  await writeFile(path.join(scratch, "mockClient.js"), `
async function call(op, data = {}) {
  const res = await fetch("/__sips_focus_fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ...data }) });
  const json = await res.json();
  if (!res.ok) throw Error(json.error || "Synthetic fixture failure");
  return json;
}
export const base44 = {
  entities: {
    WorkOrder: { filter: ({ id }) => call("read", { id }) },
    AuthorizedEmail: { list: async () => [] },
    GlobalSettings: { filter: async ({ setting_key }) => setting_key === "salesTaskDescriptions"
      ? [{ setting_key, setting_value: { items: [{ text: "Synthetic install", page: "SIPs", wip: true }] } }]
      : [] },
  }
};`);
  await writeFile(path.join(scratch, "mockPersistence.js"), `
export async function replaceWorkOrderFieldsIfUnchanged() {
  // Definitive synthetic rejection to exercise the actual SIPS error/reload UI.
  // No real or synthetic Work Order is ever written.
  throw Error("The record no longer matches its loaded state.");
}`);
  const alias = [
    { find: "@/api/base44Client", replacement: path.join(scratch, "mockClient.js") },
    { find: "@/components/workflow/workOrderPersistence", replacement: path.join(scratch, "mockPersistence.js") },
    { find: /^@\//, replacement: source + "/" },
  ];
  vite = await createServer({
    configFile: false, root: scratch, plugins: [react(), backend()],
    resolve: { alias }, server: { host: "127.0.0.1", port: 0, fs: { allow: [root, scratch] } },
    logLevel: "error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  for (const [label, viewport] of [
    ["Desktop", { width: 1366, height: 900 }],
    ["320px mobile", { width: 320, height: 568 }],
  ]) {
    await scenario(label + ": verified Reload latest restores focus only after loading", origin, viewport, async page => {
      const heading = page.getByRole("heading", { name: /Synthetic Checklist Focus/ });
      assert.equal(await heading.evaluate(el => document.activeElement === el), false,
        "Initial load should not automatically focus heading");
      const alert = await showSaveFailure(page);
      await alert.getByRole("button", { name: "Reload latest" }).click();
      await focusHeading(page);
      assert.equal(await page.getByRole("button", { name: "Save & Revisit" }).isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        "Restored dialog must not overflow its viewport");
    });
  }

  await scenario("Desktop: failed reload focuses its error; retry success focuses heading", origin,
    { width: 1366, height: 900 }, async page => {
      const alert = await showSaveFailure(page);
      await page.request.post(origin + "/__sips_focus_fixture",
        { data: { op: "failNextRead" } });
      await alert.getByRole("button", { name: "Reload latest" }).click();
      const error = page.getByRole("alert", { name: "SIP checklist loading error" });
      await error.waitFor();
      await focusOn(page, "alert", "SIP checklist loading error");
      await page.getByRole("button", { name: "Retry loading checklist" }).click();
      await focusHeading(page);
    });

  await scenario("320px mobile: cancel discard preserves edit, confirm reload restores heading", origin,
    { width: 320, height: 568 }, async page => {
      const alert = await showSaveFailure(page);
      await page.getByRole("button", { name: "Add Item" }).click();
      await page.getByPlaceholder("New item...").fill("Keep my synthetic draft");
      await alert.getByRole("button", { name: "Reload latest" }).click();
      const warning = page.getByRole("alertdialog", { name: "Discard edits and reload latest?" });
      await warning.waitFor();
      await warning.getByRole("button", { name: "Keep Editing" }).click();
      await warning.waitFor({ state: "hidden" });
      await page.getByDisplayValue("Keep my synthetic draft").waitFor();
      await alert.getByRole("button", { name: "Reload latest" }).click();
      await warning.waitFor();
      await warning.getByRole("button", { name: "Discard & Reload" }).click();
      await warning.waitFor({ state: "hidden" });
      await focusHeading(page);
      assert.equal(await page.getByDisplayValue("Keep my synthetic draft").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
  console.log("PASS " + passed + " isolated Chromium checklist focus scenarios (no writes)");
  console.log("Authenticated nonproduction two-browser acceptance remains outstanding.");
} finally {
  await browser?.close();
  await vite?.close();
  await rm(scratch, { recursive: true, force: true });
}
