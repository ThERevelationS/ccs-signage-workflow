// Metal pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE MetalEstimator with frozen remote leaf sources and
// boundary stubs. calcMetalProject, the scanners, the totals panels, and the
// save path are all REAL. Asserts: malformed/unavailable pricing blocks Save /
// Save-As-Copy with zero writes, saved acknowledged totals stay visible (or
// "Not saved"), diagnostics land on the flagged inputs, and valid paths save.
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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline metal proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/metal-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/MetalEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".metal-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
{
  const sdkInputs = Object.keys(pageBuild.metafile.inputs).filter(f => /base44Client\.js|node_modules\/@base44/.test(f));
  assert.equal(sdkInputs.length, 0, "no SDK in bundle");
}
{
  const edges = [];
  for (const [out, info] of Object.entries(pageBuild.metafile.outputs))
    for (const imp of info.imports || []) edges.push({ output: out, ...imp });
  for (const e of edges) {
    assert.equal(e.external, true, "non-external import edge: " + JSON.stringify(e));
    assert.match(e.path, /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|react-test-renderer|react-router-dom|scheduler(?:\/.*)?)$/, "unexpected external: " + e.path);
  }
  fs.writeFileSync(E + "metal-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "metal-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".metal-page-bundle.mjs")));
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
const SAVED_PROJECT = (over = {}) => ({
  ...PROJECT(),
  total_material_cost: 250, total_supplies_cost: 10, total_fabrication_cost: 195,
  total_welding_cost: 75, total_finishing_cost: 27.5, total_cost: 557.5,
  ...over,
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
      React.createElement(Page, opts.props || {})));
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
  assert.equal(btn[0].props.disabled, false, "save button clickable");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const errorBox = (c) => c.root.findAll(el => typeof el.props?.className === "string" && el.props.className.includes("bg-red-50") && el.props.className.includes("text-red-800"));
const banner = (c) => c.root.findAll(el => el.props?.role === "alert" && typeof el.props?.className === "string" && el.props.className.includes("bg-amber-50"));
const bannerText = (c) => banner(c).length ? textOf(banner(c)[0].props.children) : "";
const spies = () => globalThis.__spies;
const checks = [];

// ================= scenarios =================
// S1 — clean saved project: no banner, finite totals persisted, one write,
// no estimate handoff without estimateId.
{
  const c = await mount({ project: SAVED_PROJECT() });
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  assert.equal(errorBox(c).length, 0);
  assert.ok(pageText(c).includes("$557.50"), "S1 grand total rendered");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  for (const f of ["total_material_cost", "total_supplies_cost", "total_fabrication_cost", "total_welding_cost", "total_finishing_cost", "total_cost"])
    assert.ok(Number.isFinite(payload[f]), "S1 " + f + " finite");
  assert.equal(payload.total_cost, 557.5);
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
  checks.push("S1 clean project: no banner, finite totals persisted, one saveSource write, no estimate handoff");
}
// S1b — clean NEW project: create path saves through ensureIdempotent.
{
  const c = await mount({ route: "/", project: null });
  const inputs = c.root.findAll(el => el.type === "input");
  await act(async () => { inputs[0].props.onChange({ target: { value: "New" } }); inputs[1].props.onChange({ target: { value: "Client" } }); await flush(); });
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "preflight").length, 1, "S1b preflight ran");
  assert.equal(spies().filter(s => s[0] === "ensureIdempotent").length, 1, "S1b one create write");
  checks.push("S1b clean new project: preflight + idempotent create write");
}
// S2 — malformed fabrication_hours: banner + aria-invalid + saved-fallback;
// Save and Save-As-Copy each zero writes.
{
  const c = await mount({ project: SAVED_PROJECT({ items: [ITEM({ fabrication_hours: "abc", fabrication_cost: NaN })] }) });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.match(bannerText(c), /fabrication hours/i, "S2 banner names the field");
  assert.match(bannerText(c), /cannot price labor/, "S2 banner carries the metal_hours_unavailable message");
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 1, "S2 aria-invalid present on a flagged input");
  assert.ok(pageText(c).includes("Saved amounts (not current pricing)"), "S2 saved-fallback label shown");
  assert.ok(pageText(c).includes("$557.50"), "S2 saved grand total still visible");
  await clickSave(c).catch(() => {});
  // save button is DISABLED while blocked — assert zero writes either way.
  const saveBtn = c.root.findAll(el => el.type === "button" && /Update Estimate|Save Estimate/.test(textOf(el.children)))[0];
  assert.equal(saveBtn.props.disabled, true, "S2 save button disabled while blocked");
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S2 zero save writes while held");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S2 zero copy writes while held");
  assert.ok(errorBox(c).length, "S2 save error shown after copy attempt");
  assert.match(textOf(errorBox(c)[0].props.children), /Save paused/, "S2 pause message");
  checks.push("S2 malformed fabrication_hours: banner + aria-invalid + saved-fallback; Save disabled and Save-As-Copy each zero writes");
}
// S3 — held with NO acknowledged totals → "Not saved", never a fabricated $0.
{
  const c = await mount({ project: PROJECT({ items: [ITEM({ fabrication_hours: "abc", fabrication_cost: NaN })] }) });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  assert.ok(!/\$NaN|NaN\.00/.test(pageText(c)), "S3 no NaN totals rendered");
  checks.push("S3 held without acknowledged totals: 'Not saved' shown, no NaN/fabricated totals");
}
// S4 — malformed Metal Settings row on a NEW project (seeded): catalog hold,
// settings-specific message, zero writes.
{
  const c = await mount({
    route: "/", project: null,
    settings: SETTING_ROWS({ metal_welding_rate: "abc", metal_fabrication_rate: "65", metal_finishing_rate: "55" }),
  });
  const inputs = c.root.findAll(el => el.type === "input");
  await act(async () => { inputs[0].props.onChange({ target: { value: "New" } }); inputs[1].props.onChange({ target: { value: "Client" } }); await flush(); });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.match(bannerText(c), /metal_welding_rate/, "S4 banner names the setting");
  assert.match(bannerText(c), /Metal Settings/, "S4 names the settings surface");
  const saveBtn = c.root.findAll(el => el.type === "button" && /Save Estimate/.test(textOf(el.children)))[0];
  assert.equal(saveBtn.props.disabled, true, "S4 save disabled");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S4 zero copy writes");
  assert.match(errorBox(c).length ? textOf(errorBox(c)[0].props.children) : "", /Metal Settings or Master Inventory/, "S4 catalog-specific pause message");
  checks.push("S4 malformed settings row: project-level hold, 'Metal Settings' save message, zero writes");
}
// S5 — explicit zeros honored: stored rate 0, zero hours/supplies/length →
// no banner, save proceeds and writes the real zeros.
{
  const c = await mount({
    project: SAVED_PROJECT({
      welding_rate: 0,
      items: [ITEM({ welding_hours: 0, welding_cost: 0, supplies_cost: 0, material_length_ft: 0, material_cost: 0 })],
    }),
  });
  assert.equal(banner(c).length, 0, "S5 explicit zeros produce no banner");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S5 save proceeds with honored zeros");
  assert.equal(saves[0][1].data.total_welding_cost, 0);
  checks.push("S5 explicit-zero rates/hours/supplies honored: no banner, save proceeds");
}
// S6 — quantity 0 (silent ×1 laundering) flagged and blocked.
{
  const c = await mount({ project: SAVED_PROJECT({ items: [ITEM({ quantity: 0 })] }) });
  assert.ok(banner(c).length, "S6 quantity=0 flagged");
  assert.match(bannerText(c), /quantity of 1 or more/);
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S6 zero writes");
  checks.push("S6 quantity=0 flagged and blocked");
}
// S7 — blank fabrication-hours input preserved mid-edit, field flagged, zero writes.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const numInputs = () => c.root.findAll(el => el.type === "input" && el.props.type === "number");
  const fab = numInputs()[3];
  await act(async () => { fab.props.onChange({ target: { value: "" } }); await flush(); });
  const after = numInputs()[3];
  assert.equal(after.props.value, "", "S7 blank value preserved in input");
  assert.equal(after.props["aria-invalid"], true, "S7 aria-invalid on hours input");
  assert.ok(banner(c).length, "S7 blank hours flagged");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S7 zero writes");
  checks.push("S7 blank hours input preserved mid-edit, field flagged, zero writes");
}
// S8 — dropped inventory link with material draw: catalog flag + block.
{
  const c = await mount({ project: SAVED_PROJECT({ items: [ITEM({ inventory_item_id: "gone", material_cost: 50 })] }) });
  assert.ok(banner(c).length, "S8 banner visible");
  assert.match(bannerText(c), /Master Inventory row no longer exists/);
  assert.match(bannerText(c), /Master Inventory/, "S8 names the catalog surface");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S8 zero writes");
  checks.push("S8 dropped inventory link: catalog flag + blocked");
}
// S9 — linked inventory row missing cost_per_unit with material draw:
// catalog flag + block.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    inventory: [INV({ cost_per_unit: "" })],
  });
  assert.ok(banner(c).length, "S9 banner visible");
  assert.match(bannerText(c), /no usable cost_per_unit/);
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S9 zero writes");
  checks.push("S9 missing cost_per_unit on linked material: catalog flag + blocked");
}
// S10 — fix the malformed value → flags clear, save proceeds.
{
  const c = await mount({ project: SAVED_PROJECT({ items: [ITEM({ fabrication_hours: "abc", fabrication_cost: NaN })] }) });
  assert.ok(banner(c).length, "S10 starts flagged");
  const numInputs = () => c.root.findAll(el => el.type === "input" && el.props.type === "number");
  await act(async () => { numInputs()[3].props.onChange({ target: { value: "2" } }); await flush(); });
  assert.equal(banner(c).length, 0, "S10 banner clears after fix");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S10 save proceeds after fix");
  assert.ok(Number.isFinite(saves[0][1].data.total_fabrication_cost));
  checks.push("S10 fixing the flagged value clears diagnostics and saves");
}

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
const out = { suite: "metal-page", scenarios: checks.length, result: "PASS", checks };
fs.writeFileSync(E + "metal-page-verification.json", JSON.stringify(out, null, 1));
console.log("PASS metal-page (" + checks.length + " scenarios)");
