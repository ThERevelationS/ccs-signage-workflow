// CNC pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE CNCEstimator with frozen remote leaf sources and
// boundary stubs. calcCncPricing, the scanners, the totals panel, the save
// path, and the copy path are all REAL. Asserts: malformed/unavailable
// pricing blocks Save / Save-As-Copy with zero writes, saved acknowledged
// totals stay visible (or "Not saved"), diagnostics land on flagged inputs,
// blank edits are preserved, and — the CNC-unique defect — changing the
// project setup percentage reprices immediately so a save can never persist
// the stale stored snapshot.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./cnc-frozen.mjs";

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
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline CNC proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/cnc-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/CNCEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".cnc-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(E + "cnc-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "cnc-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".cnc-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
// Valid panel item: cutLength (96+48)*2 = 288 in, cut 288/50 = 5.76 min,
// machineTime 0.096 h, machine_cost 0.096*75 = 7.20 @ rate 75.
const CNC_ITEM = (over = {}) => ({
  builder_item_id: "it-1", description: "4x8 panel", item_type: "panel",
  material_type: "Wood", material_thickness: "3/4", quantity: 1,
  length: 96, width: 48, letter_height: 0, num_letters: 0,
  carve_area_sqin: 0, carve_depth: 0.125, cut_speed_ipm: 50, carve_speed_sqipm: 10,
  machine_time_hours: 0.096, setup_time_hours: 0.0192, machine_cost: 7.2, labor_cost: 0.864,
  force_enhanced: false, cutter_diameter_in: 0, smallest_detail_in: 0,
  workholding_method: "", creates_loose_pieces: false,
  ...over,
});
const PROJECT = (over = {}) => ({
  id: "cnc-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [CNC_ITEM()], machine_rate_per_hour: 75, labor_rate: 45,
  setup_time_percentage: 20, fixed_setup_hours: 0, notes: "",
  status: "draft", ...over,
});
const SAVED_PROJECT = (over = {}) => ({
  ...PROJECT(),
  total_machine_cost: 7.2, total_labor_cost: 0.864, total_cost: 8.064,
  ...over,
});
const SETTING_ROWS = (rows = {}) => Object.entries(rows).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const flush = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__settingRows = opts.settings ?? [];
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=cnc-1"] },
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
  const btn = c.root.findAll(el => el.type === "button" && /Save Estimate/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const errorBox = (c) => c.root.findAll(el => el.props?.role === "alert");
const banner = (c) => c.root.findAll(el => el.props?.id === "cnc-pricing-issues");
const spies = () => globalThis.__spies;
const saveWrites = () => spies().filter(s => s[0] === "saveSource");
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ================= scenarios =================
// S1 — clean project: no banner, finite totals shown, Save writes real
// derived-fresh numbers (items persist derived costs, not stale snapshots).
{
  const c = await mount({ project: SAVED_PROJECT() });
  if (banner(c).length) console.log("S1-DEBUG banner text:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  if (errorBox(c).length) console.log("S1-DEBUG error:", textOf(errorBox(c)[0].props.children), "pageText:", pageText(c).slice(0, 300));
  assert.equal(errorBox(c).length, 0);
  assert.ok(pageText(c).includes("$"), "S1 money rendered");
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  assert.ok(Number.isFinite(payload.total_machine_cost), "S1 machine total finite");
  assert.ok(Number.isFinite(payload.total_labor_cost), "S1 labor total finite");
  assert.ok(Number.isFinite(payload.total_cost), "S1 total finite");
  assert.ok(near(payload.total_machine_cost, 7.2), "S1 machine total = derived 7.20");
  assert.ok(near(payload.items[0].machine_cost, 7.2), "S1 item persisted derived-fresh cost");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
}

// S2 — malformed item field: banner shows, aria-invalid on the input,
// Save + Copy both blocked with ZERO entity writes; saved acknowledged
// totals stay visible as "Saved amounts".
{
  const c = await mount({ project: SAVED_PROJECT({ items: [CNC_ITEM({ item_type: "lettering", letter_height: "bogus", num_letters: 10 })] }) });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("letter height"), "S2 banner names the field");
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 1, "S2 aria-invalid present on a flagged input");
  assert.ok(pageText(c).includes("Saved amounts (not current pricing)"), "S2 saved-fallback label shown");
  assert.ok(pageText(c).includes("$7.20"), "S2 saved machine total still visible");
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
  const c = await mount({ project: PROJECT({ items: [CNC_ITEM({ quantity: "" })] }) });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S3 zero writes");
}

// S4 — malformed live Settings row (catalog hold): project-level message,
// "CNC Settings" save error, blocked.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ cnc_letter_perimeter_factor: "not-a-factor" }),
  });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("cnc_letter_perimeter_factor"), "S4 banner names the setting");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S4 zero writes");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("CNC Settings"), "S4 settings-specific message");
}

// S5 — explicit-zero settings rows honored, not resurrected: saves fine.
// (Recorded "0" is a real value — remote parseFloat||default resurrected it.)
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ min_cnc_labor_hours: "0" }),
  });
  assert.equal(banner(c).length, 0, "S5 explicit-zero min labor hours produces no banner");
  await clickSave(c);
  assert.equal(saveWrites().length, 1, "S5 save proceeds with honored zeros");
}
// S5b — authored project rate 0 honored: machine cost $0 saved legitimately.
{
  const c = await mount({ project: SAVED_PROJECT({ machine_rate_per_hour: 0 }) });
  assert.equal(banner(c).length, 0, "S5b authored-0 machine rate produces no banner");
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S5b save proceeds");
  assert.equal(saves[0][1].data.total_machine_cost, 0, "S5b honored-0 machine cost persists as $0");
}

// S6 — positive-required settings key at 0: banner + block.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ wood_cnc_cut_multiplier: "0" }),
  });
  assert.ok(banner(c).length, "S6 multiplier=0 flagged (silently cancels the cut leg)");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S6 zero writes");
}

// S7 — blank setup-percentage input preserved mid-edit (not laundered to 0),
// flags the field, blocks save.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const pctInput = c.root.findAll(el => el.type === "input" && el.props.max === "100");
  assert.ok(pctInput.length, "S7 pct input exists");
  await act(async () => { pctInput[0].props.onChange({ target: { value: "" } }); await flush(); });
  const after = c.root.findAll(el => el.type === "input" && el.props.max === "100")[0];
  assert.equal(after.props.value, "", "S7 blank value preserved in input");
  assert.ok(banner(c).length, "S7 blank pct flagged");
  assert.equal(after.props["aria-invalid"], true, "S7 aria-invalid on pct input");
  await clickSave(c);
  assert.equal(saveWrites().length, 0, "S7 zero writes");
}

// S8 — CNC-unique reprice-staleness: stored item snapshot was priced at
// pct=20 (labor 0.864); editing setup_time_percentage to 50 must reprice
// immediately and the save must persist the FRESH 2.16, never the stale 0.864.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const pctInput = c.root.findAll(el => el.type === "input" && el.props.max === "100");
  await act(async () => { pctInput[0].props.onChange({ target: { value: "50" } }); await flush(); });
  await clickSave(c);
  const saves = saveWrites();
  assert.equal(saves.length, 1, "S8 save proceeds after repriced edit");
  const payload = saves[0][1].data;
  // Fresh: machineTime 0.096h × 50% = 0.048h setup × $45 = $2.16 labor.
  assert.ok(near(payload.items[0].labor_cost, 2.16), "S8 item labor repriced to 2.16");
  assert.ok(near(payload.total_labor_cost, 2.16), "S8 total labor repriced to 2.16 (stale 0.864 would persist under remote)");
  assert.ok(!near(payload.total_labor_cost, 0.864), "S8 stale snapshot NOT persisted");
}

// S9 — estimate context: recordBuilderSave receives a finite liveTotal.
{
  globalThis.__estimate = { id: "est-1", client_name: "EC", customer_id: "cust-1", estimate_number: "E-1" };
  const c = await mount({ route: "/?id=cnc-1&estimateId=est-1", project: SAVED_PROJECT() });
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
console.log("PASS cnc-page (Save blocked while held; saved totals shown; reprice-on-edit verified; clean paths save)");
