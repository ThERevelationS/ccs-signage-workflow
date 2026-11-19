// Vinyl pricing-availability hardening — real-browser proof (desktop + mobile).
// Mounts the SAME frozen-source bundle as the page harness in headless
// Chromium with a real DOM, blocks all network, and asserts the held-pricing
// diagnostics render and Save stays blocked with zero writes.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./vinyl-frozen.mjs";

const CHROME = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe");
assert.ok(fs.existsSync(CHROME), "cached chromium at " + CHROME);

// ---------- browser bundle (react + router real, app sources frozen) ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded, { realPackages: true });
const entry = "/app/vinyl-browser-entry.jsx";
sources.set(entry, `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MemoryRouter } from "react-router-dom";
  import Page from "/app/src/pages/VinylEstimator.jsx";
  window.__vinylMount = (route) => {
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
fs.writeFileSync(E + "vinyl-browser-bundle.js", bundleText);
const html = `<!doctype html><html><body><div id="root"></div><script>
window.__spies=[];window.__alerts=[];window.__catalogReads=[];window.__fetchCount=0;window.__unexpectedSdk=0;
const __of=window.alert; window.alert=(m)=>{window.__alerts.push(String(m));};
window.confirm=()=>true;
window.fetch=()=>{window.__fetchCount++;return Promise.reject(new Error('network forbidden in vinyl browser proof'));};
<` + `/script><script>` + bundleText + `<` + `/script></body></html>`;
const htmlPath = path.resolve(E + "vinyl-browser.html");
fs.writeFileSync(htmlPath, html);

// ---------- fixtures (same shapes as the page harness) ----------
const VINYL_BAD_PRICE = { id: "v1", vinyl_name: "Cast 54", roll_width_inches: 54, roll_length_yards: 50, pricing_mode: "per_sqft", cost_per_sqft: "not-a-number" };
const PRINTER = { id: "p1", machine_name: "Printer", machine_type: "printer", is_default_for_type: true, machine_hourly_rate: 35, print_speed_sqft_per_hour: 400, warmup_minutes: 2, media_load_minutes: 1, calibration_minutes_per_job: 1, print_cost_per_sqin: 0.002, operator_hourly_rate: 45, left_margin_inches: 0.5, right_margin_inches: 0.5, leading_edge_inches: 4, trailing_edge_inches: 2, default_gutter_horizontal_inches: 0.25, default_gutter_vertical_inches: 0.25, default_bleed_inches: 0.125, max_media_width_inches: 54 };
const CUTTER = { id: "c1", machine_name: "Cutter", machine_type: "cutter", is_default_for_type: true, machine_hourly_rate: 25, cut_speed_inches_per_second: 30, cut_setup_minutes_per_job: 2, cut_blade_life_minutes: 6000, cut_blade_cost: 12, cut_pull_off_inches_per_job: 6, operator_hourly_rate: 45, max_media_width_inches: 48 };
const WF = () => ({
  id: "wf1", name: "W1", vinyl_id: "v1", laminate_id: "", transfer_tape_id: "",
  printer_id: "p1", cutter_id: "c1", laminator_id: "",
  apply_print: true, apply_cut: true, apply_laminate: false, apply_transfer_tape: false,
  print_quality: "", weeding_difficulty: "moderate",
  weeding_minutes_per_part_override: "", install_minutes_per_part: "",
  spoilage_buffer_percent: "", setup_fee_floor: "",
  gutter_h_override: "", gutter_v_override: "",
  items: [{ id: "i1", description: "Decal", width_inches: 12, height_inches: 8, quantity: 2, bleed_inches: 0.125 }],
  personnel: [],
});
const PROJECT = () => ({
  id: "vinyl-1", updated_date: "v1", project_name: "P", client_name: "C",
  workflows: [WF()], items: [],
  selected_equipment: [], personnel: [],
  travel_miles_round_trip: 0, total_travel_cost: 0,
  supplies_percent_of_materials: 5, extra_supplies_cost: 0, markup_percent: 0,
});
const seed = `(()=>{window.__spies=[];window.__alerts=[];window.__catalogReads=[];
window.__project=${JSON.stringify(PROJECT())};
window.__vinylRows=${JSON.stringify([VINYL_BAD_PRICE])};
window.__machineRows=${JSON.stringify([PRINTER, CUTTER])};
window.__settingRows=[];window.__equipRows=[];window.__laborRows=[];window.__estimate=null;})()`;

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
  await page.waitForFunction("typeof window.__vinylMount === 'function'");

  await check(name + "-held-mount", async () => {
    await page.evaluate(seed);
    await page.evaluate("window.__vinylMount('/?id=vinyl-1')");
    await page.waitForFunction("document.body.innerText.length > 400", null, { timeout: 15000 });
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /unavailable|unable to price/i, "held-pricing diagnostic visible");
    assert.match(text, /Decal/, "part row still rendered");
    const aria = await page.evaluate("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    assert.ok(aria >= 1, "aria-invalid markers present (got " + aria + ")");
    const status = await page.evaluate("document.querySelectorAll('[role=\"status\"],[role=\"alert\"]').length");
    assert.ok(status >= 1, "status/alert region present");
  });

  await check(name + "-save-blocked", async () => {
    const buttons = await page.$$eval("button", (bs) => bs.map((b) => (b.innerText || "").trim()));
    const saveIdx = buttons.findIndex((t) => /save estimate/i.test(t));
    assert.ok(saveIdx >= 0, "save button present: " + JSON.stringify(buttons.filter(Boolean).slice(0, 10)));
    const disabled = await page.evaluate(`document.querySelectorAll('button')[${saveIdx}].disabled`);
    assert.equal(disabled, true, "Save Estimate disabled while pricing is held");
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
fs.writeFileSync(E + "vinyl-browser-results.json", JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length, results, consoleErrors }, null, 2));
console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length }));
