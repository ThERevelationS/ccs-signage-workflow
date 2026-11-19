// Brick & Stone pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE BrickStoneEstimator with frozen remote leaf sources and
// boundary stubs. calcBrickStoneProject, the scanners, the totals panel, and
// the save/copy paths are all REAL. Asserts: malformed/unavailable pricing
// blocks Save AND Save-As-Copy with zero writes, saved acknowledged totals
// stay visible (or "Not saved"), diagnostics land on the flagged inputs, and
// valid paths save.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./brick-frozen.mjs";

// ---------- window/browser shim ----------
const winHandlers = {};
const storage = new Map();
globalThis.window = {
  location: { search: "" },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  confirm: () => true,
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
};
globalThis.location = globalThis.window.location;
globalThis.confirm = () => true;
globalThis.alert = (m) => { globalThis.__alerts.push(String(m)); };
globalThis.window.alert = globalThis.alert;
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
};
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline brick proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/brick-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/BrickStoneEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".brick-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(E + "brick-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "brick-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".brick-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const MATERIAL_ROW = (over = {}) => ({
  id: "mat-1", material_name: "Standard Brick", material_type: "brick_stone",
  brick_length_inches: 7.625, brick_width_inches: 3.625, brick_height_inches: 2.25,
  cost_per_unit: 0.55, show_in_foundation: true, ...over,
});
const PROJECT = (over = {}) => ({
  id: "brick-1", updated_date: "v1", project_name: "Garden Wall", client_name: "C",
  selected_material_id: "mat-1", material_name: "Standard Brick",
  bricks_along_length: 6, bricks_along_width: 9, courses_high: 5, layers: 1,
  mortar_gap: 0.375, waste_factor: 1.1, mortar_bag_cost: 12,
  bricks_per_hour: 40, labor_rate_per_hour: 55, markup_percent: 15,
  notes: "", status: "draft", ...over,
});
const SAVED_PROJECT = (over = {}) => ({
  ...PROJECT(),
  calculated_bricks: 198, mortar_bags_needed: 2, labor_hours: 4.95,
  material_cost: 108.9, mortar_cost: 24, labor_cost: 272.25,
  subtotal: 405.15, markup_amount: 60.77, total_cost: 465.92,
  calculated_surface_area: 21.875,
  ...over,
});

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__foundationRows = opts.foundationRows === undefined ? [MATERIAL_ROW()] : opts.foundationRows;
  globalThis.__legacyRows = opts.legacyRows ?? [];
  globalThis.window.location.search = opts.search ?? "?id=brick-1";
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=brick-1"] },
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
  const btn = c.root.findAll(el => el.type === "button" && /Save Section/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const banner = (c) => c.root.findAll(el => el.props?.id === "brick-pricing-issues");
const spies = () => globalThis.__spies;
const alerts = () => globalThis.__alerts;

// ================= scenarios =================
// S1 — clean project: no banner, finite totals shown, Save writes real numbers.
{
  const c = await mount({ project: SAVED_PROJECT() });
  if (banner(c).length) console.log("S1-DEBUG banner:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  assert.ok(pageText(c).includes("$"), "S1 money rendered");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  assert.ok(Number.isFinite(payload.material_cost), "S1 material cost finite");
  assert.ok(Number.isFinite(payload.mortar_cost), "S1 mortar cost finite");
  assert.ok(Number.isFinite(payload.labor_cost), "S1 labor cost finite");
  assert.ok(payload.labor_cost > 0, "S1 labor nonzero on a real project");
  assert.ok(Number.isFinite(payload.total_cost), "S1 total finite");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
}

// S2 — malformed mortar_bag_cost: banner shows, aria-invalid on the input,
// Save + Copy both blocked with ZERO entity writes; saved acknowledged totals
// stay visible as "Saved amounts".
{
  const c = await mount({ project: SAVED_PROJECT({ mortar_bag_cost: "free" }) });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("mortar bag cost"), "S2 banner names the field: " + textOf(banner(c)[0].props.children));
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 1, "S2 aria-invalid present on a flagged input");
  assert.ok(pageText(c).includes("Saved amounts (not current pricing)"), "S2 saved-fallback label shown");
  assert.ok(pageText(c).includes("$272.25"), "S2 saved labor total still visible");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S2 zero save writes while held");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S2 zero estimate writes");
  assert.ok(alerts().some(a => /Save paused/.test(a)), "S2 pause alert shown");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S2 zero copy writes while held (the mop-up guard gap)");
  assert.ok(alerts().some(a => /before saving a copy/.test(a)), "S2 copy-pause alert shown");
}

// S3 — same hold with NO acknowledged totals on record → "Not saved", never $0.
{
  const c = await mount({ project: PROJECT({ mortar_bag_cost: "free" }) });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  assert.ok(!/\$0\.00/.test(pageText(c)), "S3 no fabricated zeros in totals: " + pageText(c).slice(0, 400));
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S3 zero writes");
}

// S4 — catalog hold (dangling selected material): blocked with the catalog-
// specific alert; zero writes on both paths.
{
  const c = await mount({ project: SAVED_PROJECT({ selected_material_id: "mat-gone" }) });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("no longer available"), "S4 banner explains the missing record");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S4 zero writes");
  assert.ok(alerts().some(a => /masonry catalog/.test(a)), "S4 catalog-specific alert");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S4 zero copy writes");
}

// S5 — explicit-zero values are honored, not flagged: saves fine.
{
  const c = await mount({ project: SAVED_PROJECT({ markup_percent: 0, mortar_bag_cost: 0, labor_rate_per_hour: 0 }) });
  assert.equal(banner(c).length, 0, "S5 explicit zeros produce no banner");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 1, "S5 save proceeds with honored zeros");
  const payload = spies().filter(s => s[0] === "saveSource")[0][1].data;
  assert.equal(payload.markup_amount, 0, "S5 markup 0 persisted");
  assert.equal(payload.mortar_cost, 0, "S5 mortar cost 0 persisted");
  assert.equal(payload.labor_cost, 0, "S5 labor cost 0 persisted");
}

// S6 — waste_factor 0 (positive-required): flagged + blocked — the silent-$0
// class the remote gate could not see (surface area stays positive).
{
  const c = await mount({ project: SAVED_PROJECT({ waste_factor: 0 }) });
  assert.ok(banner(c).length, "S6 waste=0 flagged");
  assert.ok(textOf(banner(c)[0].props.children).includes("waste factor"), "S6 banner names the waste factor: " + textOf(banner(c)[0].props.children));
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S6 zero writes");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S6 zero copy writes");
}

// S7 — blank-preserving rate input: typing "" keeps "" on the field, flags it,
// and blocks save — never laundered to 0 mid-edit.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const inputs = c.root.findAll(el => el.type === "input" && el.props.type === "number");
  assert.ok(inputs.length >= 8, "S7 number inputs exist");
  // The Rates block inputs are the last four (mortar_bag_cost … markup_percent).
  const bagInput = inputs[inputs.length - 4];
  assert.equal(bagInput.props.value, 12, "S7 mortar bag input shows 12");
  await act(async () => { bagInput.props.onChange({ target: { value: "" } }); await flush(); });
  const after = c.root.findAll(el => el.type === "input" && el.props.type === "number");
  assert.equal(after[after.length - 4].props.value, "", "S7 blank value preserved in input");
  assert.ok(banner(c).length, "S7 blank bag cost flagged");
  assert.equal(after[after.length - 4].props["aria-invalid"], true, "S7 aria-invalid on the blanked input");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S7 zero writes");
}

// S8 — clean project: Save-As-Copy still works end-to-end (one copy write).
{
  const c = await mount({ project: SAVED_PROJECT() });
  await clickCopy(c);
  const copies = spies().filter(s => s[0] === "saveCopy");
  assert.equal(copies.length, 1, "S8 one copy write on a clean project");
  const payload = copies[0][1].payload;
  assert.ok(Number.isFinite(payload.total_cost) && payload.total_cost > 0, "S8 real totals cloned");
  assert.equal(payload.status, "calculated", "S8 copy keeps calculated status");
}

// S9 — estimate handoff gated too: held pricing → zero recordBuilderSave.
{
  const c = await mount({ project: SAVED_PROJECT({ bricks_per_hour: "fast" }), search: "?id=brick-1&estimateId=est-9" });
  assert.ok(banner(c).length, "S9 banner visible");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S9 zero save writes");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S9 zero estimate handoff writes");
}
// S9b — same mount with clean pricing → recordBuilderSave fires once.
{
  const c = await mount({ project: SAVED_PROJECT(), search: "?id=brick-1&estimateId=est-9" });
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 1, "S9b clean save hands off to the estimate");
}

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
console.log("PASS brick-page (Save + Save-As-Copy blocked while held; saved totals shown; clean paths save)");
