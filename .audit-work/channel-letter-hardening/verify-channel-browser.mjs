// Channel Letter pricing-availability hardening — real-browser proof (desktop + mobile).
// Mounts the SAME frozen-source bundle as the page harness in headless
// Chromium with a real DOM, blocks all network, and asserts the held-pricing
// diagnostics render and Save stays blocked with zero writes.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./channel-frozen.mjs";

const CHROME = path.join(os.homedir(), "AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe");
assert.ok(fs.existsSync(CHROME), "cached chromium at " + CHROME);

// ---------- browser bundle (react + router real, app sources frozen) ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded, { realPackages: true });
const entry = "/app/channel-browser-entry.jsx";
sources.set(entry, `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { MemoryRouter } from "react-router-dom";
  import Page from "/app/src/pages/ChannelLetterEstimator.jsx";
  window.__channelMount = (route) => {
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
// Candidate files must build with ZERO warnings; remote wart warnings are recorded.
const CANDIDATE_NAMES = new Set([
  "channelLetterPricingAvailability.js", "BackerFabPanel.jsx", "BackerSection.jsx",
  "DimensionalFabPanel.jsx", "EquipmentSelector.jsx", "InstallLineItem.jsx",
  "InstallSummaryCard.jsx", "ItemsList.jsx", "LadderSelector.jsx",
  "LetterPurchaseRow.jsx", "LettersPurchaseTab.jsx", "MaterialsList.jsx",
  "PersonnelSelector.jsx", "SummaryDetailsCard.jsx", "ValidationWarnings.jsx",
  "installExport.jsx", "ChannelLetterEstimator.jsx",
]);
const candidateWarnings = [], remoteWarnings = [];
for (const w of build.warnings) {
  const f = w.location?.file || "";
  (CANDIDATE_NAMES.has(f.split("/").pop()) ? candidateWarnings : remoteWarnings).push({ file: f, text: w.text });
}
assert.deepEqual(candidateWarnings, [], "candidate-file warnings: " + JSON.stringify(candidateWarnings));
const bundleText = build.outputFiles[0].text;
fs.writeFileSync(E + "channel-browser-bundle.js", bundleText);
const html = `<!doctype html><html><body><div id="root"></div><script>
window.__spies=[];window.__alerts=[];window.__catalogReads=[];window.__fetchCount=0;window.__unexpectedSdk=0;
window.alert=(m)=>{window.__alerts.push(String(m));};
window.confirm=()=>true;
window.fetch=()=>{window.__fetchCount++;return Promise.reject(new Error('network forbidden in channel browser proof'));};
<` + `/script><script>` + bundleText + `<` + `/script></body></html>`;
const htmlPath = path.resolve(E + "channel-browser.html");
fs.writeFileSync(htmlPath, html);

// ---------- fixtures (same shapes as the page harness) ----------
const SETTINGS_OBJ = {
  letters_channel_flush_per_inch: 9.03,
  install_labor_rate: 65, install_installer_rate: 65,
  install_drill_rate_medium__exterior__h0_12: 50,
  install_prep_rate_medium__exterior__h0_12: 100,
  install_electrical_rate_medium__exterior__h0_12: 15,
  install_wall_eifs_multiplier: 1.0,
  install_gasoline_price_per_gallon: 3.5, install_diesel_price_per_gallon: 4.0,
  install_travel_labor_rate: 45, install_travel_avg_speed_mph: 55,
};
const settingRows = (obj, drop = []) => Object.entries(obj).filter(([k]) => !drop.includes(k)).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));
const PURCHASE = {
  id: "lp1", letter_type: "channel_flush_mounted", description: "Front letters",
  qty: "", size_value: 24, raceway_length_feet: 0, raceway_qty: 0,   // held: blank qty
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: true, install_height_feet: 12, wall_material: "eifs",
  backer_enabled: false,
};
const ITEM = {
  description: "Install", installation_type: "flush_mount",
  qty_letters: 10, letter_size: "medium", letter_height_inches: 24,
  installation_height_feet: 12, wall_material: "eifs", materials: [],
};
const EQUIP_ROW = {
  equipment_id: "eq1", equipment_name: "Bucket Boom", equipment_type: "boom_lift",
  pricing_mode: "per_day", duration: 1, unit_cost: 350, total_cost: 350,
};
const PROJECT = (over = {}) => ({
  id: "cl-1", updated_date: "v1",
  project_name: "P", client_name: "C", estimate_number: "",
  project_scope: "full", install_environment: "exterior",
  letter_purchases: [structuredClone(PURCHASE)],
  items: [structuredClone(ITEM)],
  selected_equipment: [structuredClone(EQUIP_ROW)],
  personnel: [],
  letters_delivery_fee: 25, letters_design_fee: 0,
  letters_install_supplies_fee: 0, letters_permitting_fee: 0, letters_other_fee: 0,
  letters_markup_percent: 10,
  travel_miles_round_trip: 0, total_travel_cost: 0,
  supplies_percent_of_materials: 10, extra_supplies_cost: 0, markup_percent: 20,
  base_supplies_cost: 0, notes: "",
  letters_subtotal: 1083.5,
  ...over,
});
const EQUIP_INV = [
  { id: "eq1", equipment_name: "Bucket Boom", equipment_type: "boom_lift", pricing_mode: "per_day", cost_per_day: 350, max_height_feet: 45 },
];
const seed = `(()=>{window.__spies=[];window.__alerts=[];window.__catalogReads=[];
window.__project=${JSON.stringify(PROJECT())};
window.__settingRows=${JSON.stringify(settingRows(SETTINGS_OBJ))};
window.__invRows=[];window.__equipRows=${JSON.stringify(EQUIP_INV)};window.__dimRows=[];window.__estimate=null;})()`;

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
    else if (!/React Router Future Flag|Download the React DevTools|Travel prefetch failed/i.test(t)) consoleErrors.push(name + ": " + t.slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(name + " pageerror: " + String(e).slice(0, 300)));
  await page.goto("file:///" + htmlPath.replace(/\\/g, "/"));
  await page.waitForFunction("typeof window.__channelMount === 'function'");

  await check(name + "-held-mount", async () => {
    await page.evaluate(seed);
    await page.evaluate("window.__channelMount('/?id=cl-1&estimateId=est-1')");
    await page.waitForFunction("document.body.innerText.length > 400", null, { timeout: 20000 });
    const text = await page.evaluate("document.body.innerText");
    assert.match(text, /Pricing needs attention|unavailable/i, "held-pricing diagnostic visible");
    assert.match(text, /Front letters/, "held purchase row still rendered");
    assert.match(text, /Saved amounts \(not current pricing\)/, "saved-amounts caption rendered");
    const aria = await page.evaluate("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    assert.ok(aria >= 1, "aria-invalid markers present (got " + aria + ")");
    const describedby = await page.evaluate("document.querySelector('[aria-invalid=\"true\"]')?.getAttribute('aria-describedby')");
    assert.match(describedby || "", /issue$/, "aria-describedby points at an issue node");
    const issueNodes = await page.evaluate("document.querySelectorAll('[role=\"alert\"]').length");
    assert.ok(issueNodes >= 1, "alert/issue region present");
  });

  await check(name + "-save-blocked-zero-writes", async () => {
    const buttons = await page.$$eval("button", (bs) => bs.map((b) => (b.innerText || "").trim()));
    const saveIdx = buttons.findIndex((t) => /update estimate|save estimate/i.test(t));
    assert.ok(saveIdx >= 0, "save button present: " + JSON.stringify(buttons.filter(Boolean).slice(0, 12)));
    await page.evaluate(`document.querySelectorAll('button')[${saveIdx}].click()`);
    await page.waitForTimeout(500);
    const spies = await page.evaluate("window.__spies.map(s=>s[0])");
    for (const k of ["saveSource", "ensureIdempotent", "recordBuilderSave", "saveCopy"])
      assert.ok(!spies.includes(k), "zero " + k + " writes, got " + JSON.stringify(spies));
    const alerts = await page.evaluate("window.__alerts");
    assert.ok(alerts.some(a => /pricing issue/i.test(a)), "blocked alert shown: " + JSON.stringify(alerts));
    const fetches = await page.evaluate("window.__fetchCount");
    assert.equal(fetches, 0, "zero fetch calls");
  });
  await ctx.close();
}
await browser.close();
assert.deepEqual(consoleErrors, [], "console errors: " + JSON.stringify(consoleErrors.slice(0, 6)));
fs.writeFileSync(E + "channel-browser-results.json", JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length, remoteWarnings, results, consoleErrors }, null, 2));
console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.ok).length }));
