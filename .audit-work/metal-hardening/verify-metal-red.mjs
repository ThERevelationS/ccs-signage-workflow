// Metal pricing-availability — RED verification.
// Mounts the REAL REMOTE MetalEstimator.jsx (verbatim remote source, defects
// intact) under the same frozen-source harness and proves the vulnerabilities
// the hardening fixes: malformed inputs silently launder to 0/NaN/defaults,
// saved payloads carry non-finite or silently-defaulted numbers, and no
// diagnostics channel exists at all.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./metal-frozen.mjs";

// ---------- window/browser shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "" },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  confirm: () => true,
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
  open: () => ({ document: { write() {}, close() {} }, print() {} }),
};
globalThis.location = globalThis.window.location;
globalThis.confirm = () => true;
globalThis.alert = (m) => { globalThis.__alerts.push(String(m)); };
globalThis.window.alert = globalThis.alert;
globalThis.document = { querySelector: () => null, createElement: () => ({}), body: { appendChild() {}, removeChild() {} } };
globalThis.URL = globalThis.URL || {};
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline metal RED proof"); };

// ---------- frozen sources: REMOTE page bundle ----------
const sources = frozenSources({ remotePage: true });
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/metal-red-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/MetalEstimator.jsx";`);
const build = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".metal-red-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(build.warnings, []);
const { Page } = await import(pathToFileURL(path.resolve(E + ".metal-red-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const INV = (over = {}) => ({
  id: "inv-1", material_type: "Aluminum", product_type: "sheet",
  size: "0.125x48x96", cost_per_unit: 12.5, unit_type: "per_foot", ...over,
});
const ITEM = (over = {}) => ({
  builder_item_id: "bi-1", item_type: "fabricated_letters", description: "Bracket",
  inventory_item_id: "inv-1", material_length_ft: 10, supplies_cost: 5, quantity: 2,
  fabrication_hours: 1.5, welding_hours: 0.5, finishing_hours: 0.25,
  material_cost: 125, fabrication_cost: 97.5, welding_cost: 37.5, finishing_cost: 13.75,
  ...over,
});
const PROJECT = (over = {}) => ({
  id: "metal-1", updated_date: "v1", project_name: "P", client_name: "C",
  fabrication_rate: 65, welding_rate: 75, finishing_rate: 55,
  items: [ITEM()], notes: "", status: "draft", ...over,
});
const SETTING_ROWS = (rows = {}) => Object.entries(rows).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__settingRows = opts.settings ?? [];
  globalThis.__inventoryRows = opts.inventory ?? [INV()];
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=metal-1"] },
      React.createElement(Page)));
    await flush();
  });
  return c;
};
const textOf = (node) => {
  let out = "";
  const walk = (x) => {
    if (x == null || typeof x === "boolean") return;
    if (typeof x === "string" || typeof x === "number") { out += x + " "; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.props) { if (x.props.children !== undefined) walk(x.props.children); return; }
    walk(x);
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
};
const pageText = (c) => textOf(c.root.findAll(() => true).map(el => el.children));
const clickSave = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && /Save Estimate|Update Estimate/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const typeInput = async (c, idx, value) => {
  const inputs = c.root.findAll(el => el.type === "input");
  assert.ok(inputs.length > idx, "input " + idx + " exists");
  await act(async () => { inputs[idx].props.onChange({ target: { value } }); await flush(); });
};
const spies = () => globalThis.__spies;
const defects = [];
let pass = 0;
const T = (name, fn) => {
  try { fn(); pass++; defects.push(name); }
  catch (e) { console.error("FAIL", name, "::", String(e.message || e).slice(0, 500)); process.exitCode = 1; }
};
const noDiagnostics = (c) => {
  assert.equal(c.root.findAll(el => el.props?.["aria-invalid"] === true).length, 0, "remote has zero aria-invalid markers");
  assert.equal(pageText(c).includes("pricing is held") || pageText(c).includes("Pricing unavailable"), false, "remote has no held-pricing diagnostic");
};

// R1 — malformed fabrication_hours silently produces NaN totals AND the save
// writes them (JSON-persisted as null/corrupt downstream).
{
  const c = await mount({ project: PROJECT({ items: [ITEM({ fabrication_hours: "abc", fabrication_cost: NaN })] }) });
  noDiagnostics(c);
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "remote saved anyway");
  T("remote laundered a malformed stored fabrication_cost (NaN) to $0 silently — and persisted the NaN itself", () => {
    assert.equal(saves[0][1].data.total_fabrication_cost, 0, "NaN || 0 laundered the total to $0");
    assert.equal(Number.isFinite(saves[0][1].data.items[0].fabrication_cost), false, "the corrupt NaN stays on the saved record");
    assert.equal(saves[0][1].data.total_cost, 362.5, "grand total fabricated $0 for the corrupt line");
  });
}
// R2 — malformed Metal Settings row silently seeds the fallback (75), and the
// save writes it — the authored value is lost without a word.
{
  const c = await mount({
    route: "/",
    project: null,
    settings: SETTING_ROWS({ metal_welding_rate: "abc", metal_fabrication_rate: "65", metal_finishing_rate: "55" }),
  });
  // Type the two required name fields (first two text inputs).
  await typeInput(c, 0, "Proj"); await typeInput(c, 1, "Client");
  noDiagnostics(c);
  await clickSave(c);
  const creates = spies().filter(s => s[0] === "ensureIdempotent");
  assert.equal(creates.length, 1, "remote created anyway");
  T("remote silently wrote fallback welding_rate=75 for malformed setting", () => {
    assert.equal(creates[0][1].data.welding_rate, 75);
  });
}
// R3 — recorded quantity 0 silently reprices as ×1 in every total.
{
  const c = await mount({ project: PROJECT({ items: [ITEM({ quantity: 0 })] }) });
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1);
  T("remote repriced quantity 0 as quantity 1 silently", () => {
    // qty-1 math: material 125 + supplies 5 + fab 97.5 + weld 37.5 + fin 13.75 = 278.75
    assert.equal(saves[0][1].data.total_cost, 278.75);
    assert.equal(saves[0][1].data.items[0].quantity, 0, "stored qty stays 0 — totals disagree with the record");
  });
}
// R4 — dropped inventory row keeps a stale stored material_cost flowing into
// the saved totals with no signal.
{
  const c = await mount({
    project: PROJECT({ items: [ITEM({ inventory_item_id: "gone", material_cost: 50 })] }),
    inventory: [INV()],
  });
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  T("remote kept stale material_cost=50 * 2 = $100 in totals for a dropped material link", () => {
    assert.equal(saves[0][1].data.total_material_cost, 100);
  });
}
// R5 — blank hours input: remote launders "" to 0 via parseFloat||0 AND the
// input re-renders blank (|| ""), hiding that 0 was written.
{
  const c = await mount({ project: PROJECT() });
  const numInputs = () => c.root.findAll(el => el.type === "input" && el.props.type === "number");
  // Fabrication hours is the 4th number input (length, supplies, qty, fab...).
  await act(async () => { numInputs()[3].props.onChange({ target: { value: "" } }); await flush(); });
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1);
  T("remote laundered blank hours to 0 and saved silently", () => {
    assert.equal(saves[0][1].data.items[0].fabrication_hours, 0);
    assert.equal(saves[0][1].data.items[0].fabrication_cost, 0);
  });
}
// R6 — a recorded 0 on a settings seed row is silently resurrected to the
// module default (75) rather than honored.
{
  const c = await mount({
    route: "/", project: null,
    settings: SETTING_ROWS({ metal_welding_rate: "0", metal_fabrication_rate: "65", metal_finishing_rate: "55" }),
  });
  await typeInput(c, 0, "Proj"); await typeInput(c, 1, "Client");
  await clickSave(c);
  const creates = spies().filter(s => s[0] === "ensureIdempotent");
  assert.equal(creates.length, 1);
  T("remote resurrected authored 0 welding rate to default 75", () => {
    assert.equal(creates[0][1].data.welding_rate, 75);
  });
}
// R7 — no availability channel existed at all.
T("remote exposes no issues/pricingUnavailable channel", () => {
  assert.equal(/pricingUnavailable|aria-invalid|metal_\w+_unavailable/.test(
    fs.readFileSync(E + "remote/src/pages/MetalEstimator.jsx", "utf8")), false);
});

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
const out = { suite: "metal-red", passed: pass, failed: 7 - pass, result: process.exitCode ? "FAIL" : "PASS", defects };
fs.writeFileSync(E + "metal-red-verification.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
if (process.exitCode) process.exit(1);
console.log("PASS metal-red");
