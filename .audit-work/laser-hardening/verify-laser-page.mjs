// Laser pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE LaserEstimator with frozen remote sources and boundary
// stubs. calcLaserPricing, the scanners, the totals panel, the save path, and
// the copy path are all REAL. Asserts: malformed/unavailable pricing blocks
// Save / Save-As-Copy with zero writes, saved acknowledged totals stay
// visible (or "Not saved"), diagnostics land on flagged inputs, blank edits
// are preserved, explicit-zero seed values are honored (not resurrected),
// and a rate/setup edit reprices immediately so a save can never persist
// the stale stored snapshot.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./laser-frozen.mjs";

// ---------- window/browser shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "" },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  confirm: () => true,
  open: () => null,
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
};
globalThis.location = globalThis.window.location;
globalThis.confirm = () => true;
globalThis.alert = (m) => { globalThis.__alerts.push(String(m)); };
globalThis.window.alert = globalThis.alert;
// addItem's setTimeout focus lands on document.querySelector — shim it so
// item-add clicks don't crash the new-project scenario.
globalThis.document = { querySelector: () => null };
globalThis.window.document = globalThis.document;
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline laser proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/laser-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/LaserEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".laser-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(E + "laser-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "laser-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".laser-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
// Valid panel item: cutLength (24+12)*2*2 = 144 in, cut 144*25.4/20 = 182.88 s,
// machineTime 0.0508 h, machine_cost 0.0508*100 = 5.08 @ rate 100,
// handling 0.00762 h, labor 0.00762*75 = 0.5715; + fixed setup 0.5h*75 = 37.5.
// → total_machine 5.08, total_labor 38.0715, total_supplies 0, total 43.1515.
const PANEL = (o = {}) => ({
  item_type: "panel", material_type: "Acrylic", material_thickness: "1/4",
  description: "P", quantity: 2, length: 24, width: 12, letter_height: 0, num_letters: 1,
  engrave_area_sqin: 0, total_cut_length_inches: 144,
  cut_speed_ipm: 20, engrave_speed_sqipm: 5,
  machine_time_hours: 0.0508, handling_time_hours: 0.00762, machine_cost: 5.08, labor_cost: 0.5715,
  builder_item_id: "laser-item-1", file_url: "", ...o,
});
const PROJECT = (o = {}) => ({
  id: "lp-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PANEL()], machine_rate_per_hour: 100, labor_rate: 75,
  engraving_machine_rate_per_hour: 80, engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15, engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0.5, fixed_material_setup_cost: 0, notes: "",
  ...o,
});
const SAVED_PROJECT = (o = {}) => ({
  ...PROJECT(),
  total_machine_cost: 5.08, total_labor_cost: 38.0715,
  total_supplies_cost: 0, total_cost: 43.1515,
  ...o,
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

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const flush = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__settingRows = opts.settings ?? SETTINGS_ROWS();
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=lp-1"] },
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
  const btn = c.root.findAll(el => el.type === "button" && /(Save|Update) Estimate/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickAddItem = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && /Add Item/.test(textOf(el.children)));
  assert.ok(btn.length, "Add Item button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const fillInput = async (c, pred, value) => {
  const el = c.root.findAll(e => e.type === "input" && pred(e.props))[0];
  assert.ok(el, "fill target input found");
  await act(async () => { el.props.onChange({ target: { value } }); await flush(); });
};
const errorBox = (c) => c.root.findAll(el => el.props?.role === "alert");
const banner = (c) => c.root.findAll(el => el.props?.id === "laser-pricing-issues");
const spies = () => globalThis.__spies;
const saveWrites = () => spies().filter(s => s[0] === "saveSource");
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ================= scenarios =================
// S1 — clean project: no banner, finite totals shown, Save writes real
// derived-fresh numbers (the stored item's STALE derived snapshot is replaced
// by the live calc — it can never be persisted).
{
  const c = await mount({ project: SAVED_PROJECT({ items: [PANEL({ machine_cost: 99, labor_cost: 99, machine_time_hours: 9, handling_time_hours: 9 })] }) });
  if (banner(c).length) console.log("S1-DEBUG banner text:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  if (errorBox(c).length) console.log("S1-DEBUG error:", textOf(errorBox(c)[0].props.children), "pageText:", pageText(c).slice(0, 300));
  assert.equal(errorBox(c).length, 0);
  assert.ok(pageText(c).includes("$5.08"), "S1 derived machine cost rendered (not the stale $99)");
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  assert.ok(Number.isFinite(payload.total_machine_cost), "S1 machine total finite");
  assert.ok(Number.isFinite(payload.total_labor_cost), "S1 labor total finite");
  assert.ok(Number.isFinite(payload.total_cost), "S1 total finite");
  assert.ok(near(payload.total_machine_cost, 5.08), "S1 machine total = derived 5.08");
  assert.ok(near(payload.items[0].machine_cost, 5.08), "S1 item persisted derived-fresh 5.08 (not stale 99)");
  assert.ok(!near(payload.items[0].machine_cost, 99), "S1 stale snapshot NOT persisted");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
}

// S2 — malformed item field: banner shows, aria-invalid on the input,
// Save + Copy both blocked with ZERO entity writes; saved acknowledged
// totals stay visible as "Saved amounts".
{
  const c = await mount({ project: SAVED_PROJECT({ items: [PANEL({ quantity: "" })] }) });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("quantity"), "S2 banner names the field");
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 1, "S2 aria-invalid present on a flagged input");
  assert.ok(pageText(c).includes("Saved amounts (not current pricing)"), "S2 saved-fallback label shown");
  assert.ok(pageText(c).includes("$5.08"), "S2 saved machine total still visible");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S2 zero save writes while held");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S2 zero estimate writes");
  assert.ok(errorBox(c).length, "S2 save error shown");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Save paused"), "S2 pause message");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S2 zero copy writes while held");
}

// S3 — same hold with NO acknowledged totals on record → "Not saved", never $0.
{
  const c = await mount({ project: PROJECT({ items: [PANEL({ quantity: "" })] }) });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S3 zero writes");
}

// S4 — malformed live Settings row (catalog hold): project-level message,
// "Laser Settings" save error, blocked.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTINGS_ROWS({ cut_speed_1_4: "not-a-speed" }),
  });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("cut_speed_1_4"), "S4 banner names the setting");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S4 zero writes");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Laser Settings"), "S4 settings-specific message");
}

// S5 — explicit-zero settings row honored, not resurrected: a NEW project
// seeded from `parameter_handling_time_percentage: "0"` carries a real 0%
// and saves fine (remote `parseFloat||15` resurrected it — red R6).
{
  const c = await mount({
    route: "/", project: null,
    settings: SETTINGS_ROWS({ parameter_handling_time_percentage: "0" }),
  });
  await fillInput(c, (p) => p.placeholder === "Enter client name", "C");
  await fillInput(c, (p) => p.id === "project_name", "P");
  await clickAddItem(c);
  // Fresh item ships total_cut_length_inches: 0 — drive one calc-triggering
  // field edit so updateItem re-derives it (this is the normal user path).
  await fillInput(c, (p) => p.step === "0.125" && p.value === 24, "24");
  if (banner(c).length) console.log("S5-DEBUG banner:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S5 explicit-zero handling % produces no banner");
  await clickSave(c);
  const creates = spies().filter(s => s[0] === "ensureIdempotent");
  assert.equal(creates.length, 1, "S5 new project created");
  assert.equal(creates[0][1].data.parameter_handling_time_percentage, 0, "S5 authored 0% handling persisted as 0");
}

// S6 — positive-required settings key at 0: banner + block.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTINGS_ROWS({ cut_speed_1_4: "0" }),
  });
  assert.ok(banner(c).length, "S6 cut_speed=0 flagged (silently collapses the cut leg)");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S6 zero writes");
}

// S7 — blank fixed-setup-hours input preserved mid-edit (not laundered to 0),
// flags the field, blocks save.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const pctInput = c.root.findAll(el => el.type === "input" && el.props.step === "0.1" && el.props.min === "0");
  assert.ok(pctInput.length, "S7 setup-hours input exists");
  await act(async () => { pctInput[0].props.onChange({ target: { value: "" } }); await flush(); });
  const after = c.root.findAll(el => el.type === "input" && el.props.step === "0.1" && el.props.min === "0")[0];
  assert.equal(after.props.value, "", "S7 blank value preserved in input");
  assert.ok(banner(c).length, "S7 blank setup hours flagged");
  assert.equal(after.props["aria-invalid"], true, "S7 aria-invalid on setup input");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S7 zero writes");
}

// S8 — reprice-staleness: stored totals were priced at setup 0.5 (labor
// 38.0715); editing fixed_setup_hours to 2 must reprice immediately and the
// save must persist the FRESH 150.5715, never the stale 38.0715.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const setupInput = c.root.findAll(el => el.type === "input" && el.props.step === "0.1" && el.props.min === "0");
  await act(async () => { setupInput[0].props.onChange({ target: { value: "2" } }); await flush(); });
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S8 save proceeds after repriced edit");
  const payload = saves[0][1].data;
  // Fresh: handling labor 0.5715 + 2h setup × $75 = 150.5715.
  assert.ok(near(payload.total_labor_cost, 150.5715), "S8 total labor repriced to 150.5715 (stale 38.0715 would persist under remote)");
  assert.ok(!near(payload.total_labor_cost, 38.0715), "S8 stale snapshot NOT persisted");
  assert.equal(payload.fixed_setup_hours, 2, "S8 edited setup hours persisted");
}

// S9 — estimate context: recordBuilderSave receives a finite liveTotal.
{
  globalThis.__estimate = { id: "est-1", client_name: "EC", customer_id: "cust-1", estimate_number: "E-1" };
  const c = await mount({ route: "/?id=lp-1&estimateId=est-1", project: SAVED_PROJECT() });
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S9 save write");
  const rbs = spies().filter(s => s[0] === "recordBuilderSave");
  assert.equal(rbs.length, 1, "S9 builder handoff fired");
  assert.ok(Number.isFinite(rbs[0][1].liveTotal) && rbs[0][1].liveTotal > 0, "S9 liveTotal finite and real");
  globalThis.__estimate = null;
}

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
console.log("PASS laser-page (Save blocked while held; saved totals shown; explicit-zero seeds honored; reprice-on-edit verified; clean paths save)");
