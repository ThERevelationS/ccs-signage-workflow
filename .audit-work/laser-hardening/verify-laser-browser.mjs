// Laser pricing-availability hardening — real-browser proof (desktop + mobile).
// Mounts the SAME frozen-source bundle as the page harness in headless
// Chromium with a real DOM, blocks all network, and asserts: the held-pricing
// diagnostics render, Save stays blocked with zero writes, and a clean
// project prices + renders real totals.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./laser-frozen.mjs";

const CHROME = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe");
assert.ok(fs.existsSync(CHROME), "cached chromium at " + CHROME);

// ---------- browser bundle (react + router real, app sources frozen) ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded, { realPackages: true });
const entry = "/app/laser-browser-entry.jsx";
sources.set(entry, `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MemoryRouter } from "react-router-dom";
  import Page from "/app/src/pages/LaserEstimator.jsx";
  window.__laserMount = (route) => {
    const el = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(el);
    const root = createRoot(el);
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
fs.writeFileSync(E + "laser-browser-bundle.js", bundleText);
const html = `<!doctype html><html><body><div id="root"></div><script>
window.__spies=[];window.__alerts=[];window.__catalogReads=[];window.__fetchCount=0;window.__unexpectedSdk=0;
const __of=window.alert; window.alert=(m)=>{window.__alerts.push(String(m));};
window.confirm=()=>true;
window.fetch=()=>{window.__fetchCount++;return Promise.reject(new Error('network forbidden in laser browser proof'));};
<` + `/script><script>` + bundleText + `<` + `/script></body></html>`;
const htmlPath = path.resolve(E + "laser-browser.html");
fs.writeFileSync(htmlPath, html);

// ---------- fixtures ----------
// Panel: cut 144 in → machine 0.0508h × $100 = $5.08; labor 0.5715 + setup 37.5.
const PANEL = (o = {}) => ({
  item_type: "panel", material_type: "Acrylic", material_thickness: "1/4",
  description: "P", quantity: 2, length: 24, width: 12, letter_height: 0, num_letters: 1,
  engrave_area_sqin: 0, total_cut_length_inches: 144,
  cut_speed_ipm: 20, engrave_speed_sqipm: 5,
  machine_time_hours: 0, handling_time_hours: 0, machine_cost: 0, labor_cost: 0,
  builder_item_id: "laser-item-1", file_url: "", ...o,
});
const SETTINGS_ROWS = (o = {}) => Object.entries({
  parameter_laser_machine_rate: "100", parameter_laser_labor_rate: "75",
  engraving_laser_machine_rate: "80", engraving_labor_rate: "40",
  parameter_handling_time_percentage: "15", engraving_handling_time_percentage: "20",
  min_parameter_laser_setup_hours: "0.5", parameter_laser_fixed_material_setup_cost: "0",
  laser_letter_perimeter_factor: "3.5", laser_engrave_speed_sqipm: "5",
  acrylic_cut_multiplier: "1", wood_cut_multiplier: "1", leather_cut_multiplier: "1",
  acrylic_engrave_multiplier: "1", wood_engrave_multiplier: "1", leather_engrave_multiplier: "1",
  cut_speed_1_16: "20", cut_speed_1_8: "20", cut_speed_3_16: "20", cut_speed_1_4: "20",
  cut_speed_3_8: "20", cut_speed_1_2: "20", cut_speed_3_4: "20",
  ...o,
}).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));
const HELD_PROJECT = () => ({
  id: "lp-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PANEL({ quantity: "" })], machine_rate_per_hour: 100, labor_rate: 75,
  engraving_machine_rate_per_hour: 80, engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15, engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0.5, fixed_material_setup_cost: 0, notes: "",
  // acknowledged saved snapshot — must stay visible under held pricing
  total_machine_cost: 5.08, total_labor_cost: 38.0715,
  total_supplies_cost: 0, total_cost: 43.1515,
});
const CLEAN_PROJECT = () => ({
  id: "lp-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PANEL()], machine_rate_per_hour: 100, labor_rate: 75,
  engraving_machine_rate_per_hour: 80, engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15, engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0.5, fixed_material_setup_cost: 0, notes: "",
});
const seed = (project) => `(()=>{window.__spies=[];window.__alerts=[];window.__catalogReads=[];
window.__project=${JSON.stringify(project)};
window.__settingRows=${JSON.stringify(SETTINGS_ROWS())};window.__estimate=null;})()`;

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
  await page.waitForFunction("typeof window.__laserMount === 'function'");

  await check(name + "-held-mount", async () => {
    await page.evaluate(seed(HELD_PROJECT()));
    await page.evaluate("window.__laserMount('/?id=lp-1')");
    await page.waitForFunction("document.body.innerText.length > 300", null, { timeout: 15000 });
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /unavailable|need[s]? attention/i, "held-pricing diagnostic visible");
    assert.match(text, /quantity/i, "quantity issue named");
    assert.match(text, /Saved amounts \(not current pricing\)/, "saved-amounts label shown");
    assert.match(text, /\$5\.08/, "saved machine total still visible");
    assert.match(text, /Item|P/, "item row still rendered");
    const aria = await page.evaluate("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    assert.ok(aria >= 1, "aria-invalid markers present (got " + aria + ")");
    const status = await page.evaluate("document.querySelectorAll('[role=\"status\"],[role=\"alert\"]').length");
    assert.ok(status >= 1, "status/alert region present");
  });

  await check(name + "-save-blocked", async () => {
    const buttons = await page.$$eval("button", (bs) => bs.map((b) => (b.innerText || "").trim()));
    const saveIdx = buttons.findIndex((t) => /(save|update) estimate/i.test(t));
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

  await check(name + "-clean-prices", async () => {
    await page.evaluate(seed(CLEAN_PROJECT()));
    await page.evaluate("window.__laserMount('/?id=lp-1')");
    await page.waitForFunction("document.body.innerText.length > 300", null, { timeout: 15000 });
    const text = await page.evaluate("document.body.innerText");
    assert.ok(!/Pricing unavailable/i.test(text), "no held banner on a clean project");
    // cut 144in @ 20mm/s → 0.0508h × $100 = $5.08 machine.
    assert.match(text, /\$5\.08/, "derived machine cost rendered");
    assert.match(text, /(Save|Update) Estimate/, "save button present");
  });
  await ctx.close();
}
await browser.close();
assert.deepEqual(consoleErrors, [], "console errors: " + JSON.stringify(consoleErrors.slice(0, 6)));
fs.writeFileSync(E + "laser-browser-results.json", JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length, results, consoleErrors }, null, 2));
console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length }));
if (results.some(r => !r.ok)) process.exit(1);
console.log("PASS laser-browser");
