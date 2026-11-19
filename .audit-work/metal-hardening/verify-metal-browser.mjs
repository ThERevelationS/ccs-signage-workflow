// Metal pricing-availability hardening — real-browser proof (desktop + mobile).
// Mounts the SAME frozen-source bundle as the page harness in headless
// Chromium with a real DOM, blocks all network, and asserts the held-pricing
// diagnostics render and Save stays blocked with zero writes.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./metal-frozen.mjs";

const CHROME = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe");
assert.ok(fs.existsSync(CHROME), "cached chromium at " + CHROME);

// ---------- browser bundle (react + router real, app sources frozen) ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded, { realPackages: true });
const entry = "/app/metal-browser-entry.jsx";
sources.set(entry, `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MemoryRouter } from "react-router-dom";
  import Page from "/app/src/pages/MetalEstimator.jsx";
  window.__metalMount = (route) => {
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
fs.writeFileSync(E + "metal-browser-bundle.js", bundleText);
const html = `<!doctype html><html><body><div id="root"></div><script>
window.__spies=[];window.__alerts=[];window.__catalogReads=[];window.__fetchCount=0;window.__unexpectedSdk=0;
const __of=window.alert; window.alert=(m)=>{window.__alerts.push(String(m));};
window.confirm=()=>true;
window.fetch=()=>{window.__fetchCount++;return Promise.reject(new Error('network forbidden in metal browser proof'));};
<` + `/script><script>` + bundleText + `<` + `/script></body></html>`;
const htmlPath = path.resolve(E + "metal-browser.html");
fs.writeFileSync(htmlPath, html);

// ---------- fixtures ----------
const ITEM = (over = {}) => ({
  builder_item_id: "bi-1", item_type: "fabricated_letters", description: "Bracket",
  inventory_item_id: "inv-1", material_length_ft: 10, supplies_cost: 5, quantity: 2,
  fabrication_hours: "abc", welding_hours: 0.5, finishing_hours: 0.25,
  material_cost: 125, fabrication_cost: null, welding_cost: 37.5, finishing_cost: 13.75,
  ...over,
});
const PROJECT = () => ({
  id: "metal-1", updated_date: "v1", project_name: "P", client_name: "C",
  fabrication_rate: 65, welding_rate: 75, finishing_rate: 55,
  items: [ITEM()], notes: "", status: "draft",
  // acknowledged saved snapshot — must stay visible under held pricing
  total_material_cost: 250, total_supplies_cost: 10, total_fabrication_cost: 195,
  total_welding_cost: 75, total_finishing_cost: 27.5, total_cost: 557.5,
});
const seed = `(()=>{window.__spies=[];window.__alerts=[];window.__catalogReads=[];
window.__project=${JSON.stringify(PROJECT())};
window.__settingRows=[];window.__inventoryRows=[{id:"inv-1",material_type:"Aluminum",product_type:"sheet",size:"0.125x48x96",cost_per_unit:12.5,unit_type:"per_foot"}];window.__estimate=null;})()`;

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
  await page.waitForFunction("typeof window.__metalMount === 'function'");

  await check(name + "-held-mount", async () => {
    await page.evaluate(seed);
    await page.evaluate("window.__metalMount('/?id=metal-1')");
    await page.waitForFunction("document.body.innerText.length > 300", null, { timeout: 15000 });
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /Pricing unavailable/i, "held-pricing diagnostic visible");
    assert.match(text, /fabrication hours/i, "hours issue named");
    assert.match(text, /Saved amounts \(not current pricing\)/, "saved-amounts label shown");
    assert.match(text, /\$557\.50/, "saved grand total still visible");
    assert.match(text, /Bracket/, "item row still rendered");
    const aria = await page.evaluate("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    assert.ok(aria >= 1, "aria-invalid markers present (got " + aria + ")");
    const status = await page.evaluate("document.querySelectorAll('[role=\"status\"],[role=\"alert\"]').length");
    assert.ok(status >= 1, "status/alert region present");
  });

  await check(name + "-save-blocked", async () => {
    const buttons = await page.$$eval("button", (bs) => bs.map((b) => (b.innerText || "").trim()));
    const saveIdx = buttons.findIndex((t) => /update estimate|save estimate/i.test(t));
    assert.ok(saveIdx >= 0, "save button present: " + JSON.stringify(buttons.filter(Boolean).slice(0, 10)));
    const disabled = await page.evaluate(`document.querySelectorAll('button')[${saveIdx}].disabled`);
    assert.equal(disabled, true, "save button disabled while held");
    await page.evaluate(`document.querySelectorAll('button')[${saveIdx}].click()`);
    await page.waitForTimeout(400);
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
fs.writeFileSync(E + "metal-browser-results.json", JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length, results, consoleErrors }, null, 2));
console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length }));
if (results.some(r => !r.ok)) process.exit(1);
console.log("PASS metal-browser");
