// Painting pricing-availability hardening — real-browser proof (desktop + mobile).
// Mounts the SAME frozen-source bundle as the page harness in headless
// Chromium with a real DOM, blocks all network, and asserts the held-pricing
// diagnostics render and Save stays blocked with zero writes.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./painting-frozen.mjs";

const CHROME = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe");
assert.ok(fs.existsSync(CHROME), "cached chromium at " + CHROME);

// ---------- browser bundle (react + router real, app sources frozen) ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded, { realPackages: true });
const entry = "/app/paint-browser-entry.jsx";
sources.set(entry, `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MemoryRouter } from "react-router-dom";
  import Page from "/app/src/pages/PaintingEstimator.jsx";
  window.__paintMount = (route) => {
    const root = createRoot(document.getElementById("root"));
    root.render(React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(Page)));
    return true;
  };
`);
const build = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "iife", platform: "browser",
  write: false, plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" },
  jsx: "automatic", metafile: true, logLevel: "silent",
});
assert.deepEqual(build.warnings, []);
const bundleText = build.outputFiles[0].text;
fs.writeFileSync(E + "painting-browser-bundle.js", bundleText);
const html = `<!doctype html><html><body><div id="root"></div><script>
window.__spies=[];window.__alerts=[];window.__catalogReads=[];window.__fetchCount=0;window.__unexpectedSdk=0;
const __of=window.alert; window.alert=(m)=>{window.__alerts.push(String(m));};
window.confirm=()=>true;
window.fetch=()=>{window.__fetchCount++;return Promise.reject(new Error('network forbidden in painting browser proof'));};
<` + `/script><script>` + bundleText + `<` + `/script></body></html>`;
const htmlPath = path.resolve(E + "painting-browser.html");
fs.writeFileSync(htmlPath, html);

// ---------- fixtures ----------
const PAINT_ITEM = (over = {}) => ({
  description: "4x8 ACM", item_type: "panel", thickness: "bogus",
  length: 96, width: 48, quantity: 2, paint_sides: "one_side",
  paint_colors: ["PMS 186"], paint_mask_sqft: 0,
  edge_complexity_multiplier: 1, fixed_waste_gallons: 0, base_supplies_cost: 0,
  ...over,
});
const PROJECT = () => ({
  id: "paint-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PAINT_ITEM()], paint_supplies_per_sqft: 1.25, notes: "",
  status: "draft",
  // acknowledged saved snapshot — must stay visible under held pricing
  total_paint_mask_cost: 5, total_liquid_paint_and_supplies_cost: 120.5, total_labor_cost: 300,
});
const seed = `(()=>{window.__spies=[];window.__alerts=[];window.__catalogReads=[];
window.__project=${JSON.stringify(PROJECT())};
window.__settingRows=[];window.__estimate=null;})()`;

// ---------- run ----------
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1400) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};
const consoleErrors = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const viewports = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
for (const [name, vp] of Object.entries(viewports)) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/duplicate.*key|encountered two children with the same key/i.test(t)) consoleErrors.push(name + ": duplicate-key: " + t.slice(0, 200));
    else if (!/React Router Future Flag|Download the React DevTools/i.test(t)) consoleErrors.push(name + ": " + t.slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(name + " pageerror: " + String(e).slice(0, 300)));
  await page.goto("file:///" + htmlPath.replace(/\\/g, "/"));
  await page.waitForFunction("typeof window.__paintMount === 'function'");

  await check(name + "-held-mount", async () => {
    await page.evaluate(seed);
    await page.evaluate("window.__paintMount('/?id=paint-1')");
    await page.waitForFunction("document.body.innerText.length > 300", null, { timeout: 15000 });
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /unavailable|need[s]? attention/i, "held-pricing diagnostic visible");
    assert.match(text, /thickness/i, "thickness issue named");
    assert.match(text, /Saved amounts \(not current pricing\)/, "saved-amounts label shown");
    assert.match(text, /\$300\.00/, "saved labor total still visible");
    assert.match(text, /4x8 ACM/, "item row still rendered");
    const aria = await page.evaluate("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    assert.ok(aria >= 1, "aria-invalid markers present (got " + aria + ")");
    const status = await page.evaluate("document.querySelectorAll('[role=\"status\"],[role=\"alert\"]').length");
    assert.ok(status >= 1, "status/alert region present");
  });

  await check(name + "-save-blocked", async () => {
    const buttons = await page.$$eval("button", (bs) => bs.map((b) => (b.innerText || "").trim()));
    const saveIdx = buttons.findIndex((t) => /save painting/i.test(t));
    assert.ok(saveIdx >= 0, "save button present: " + JSON.stringify(buttons.filter(Boolean).slice(0, 10)));
    await page.evaluate(`document.querySelectorAll('button')[${saveIdx}].click()`);
    await page.waitForTimeout(400);
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /Save paused/i, "save-paused message shown");
    const spies = await page.evaluate("window.__spies.map(s=>s[0])");
    for (const k of ["saveSource", "ensureIdempotent", "recordBuilderSave", "saveCopy"])
      assert.ok(!spies.includes(k), "zero " + k + " writes, got " + JSON.stringify(spies));
    const fetches = await page.evaluate("window.__fetchCount");
    assert.equal(fetches, 0, "zero fetch calls");
  });
  await ctx.close();
}
await browser.close();
assert.deepEqual(consoleErrors, [], "console errors: " + JSON.stringify(consoleErrors.slice(0, 6)));
fs.writeFileSync(E + "painting-browser-results.json", JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length, results, consoleErrors }, null, 2));
console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length }));
if (results.some(r => !r.ok)) process.exit(1);
console.log("PASS painting-browser");
