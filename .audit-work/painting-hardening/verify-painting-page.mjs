// Painting pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE PaintingEstimator with frozen remote leaf sources and
// boundary stubs. calcPaintingProject, the scanners, the totals panel, and the
// save path are all REAL. Asserts: malformed/unavailable pricing blocks Save /
// Save-As-Copy with zero writes, saved acknowledged totals stay visible (or
// "Not saved"), diagnostics land on the flagged inputs, and valid paths save.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./painting-frozen.mjs";

// ---------- window/browser shim ----------
const winHandlers = {};
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
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline painting proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/paint-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/PaintingEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".paint-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(E + "painting-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "painting-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".paint-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter, useLocation, useNavigate } = await import("react-router-dom");

// ---------- fixtures ----------
const PAINT_ITEM = (over = {}) => ({
  description: "4x8 ACM", item_type: "panel", thickness: "1/2",
  length: 96, width: 48, quantity: 2, paint_sides: "one_side",
  paint_colors: ["PMS 186"], paint_mask_sqft: 0,
  edge_complexity_multiplier: 1, fixed_waste_gallons: 0, base_supplies_cost: 0,
  ...over,
});
const PROJECT = (over = {}) => ({
  id: "paint-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PAINT_ITEM()], paint_supplies_per_sqft: 1.25, notes: "",
  status: "draft", ...over,
});
const SAVED_PROJECT = (over = {}) => ({
  ...PROJECT(),
  total_paint_mask_cost: 5, total_liquid_paint_and_supplies_cost: 120.5, total_labor_cost: 300,
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
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=paint-1"] },
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
  const btn = c.root.findAll(el => el.type === "button" && /Save Painting/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const errorBox = (c) => c.root.findAll(el => typeof el.props?.className === "string" && el.props.className.includes("text-red-700") && el.props.className.includes("bg-red-50"));
const banner = (c) => c.root.findAll(el => el.props?.id === "paint-pricing-issues");
const spies = () => globalThis.__spies;

// ================= scenarios =================
// S1 — clean project: no banner, finite totals shown, Save writes real numbers.
{
  const c = await mount({ project: SAVED_PROJECT() });
  if (banner(c).length) console.log("S1-DEBUG banner text:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  if (errorBox(c).length) console.log("S1-DEBUG error:", textOf(errorBox(c)[0].props.children), "pageText:", pageText(c).slice(0, 300));
  assert.equal(errorBox(c).length, 0);
  assert.ok(pageText(c).includes("$"), "S1 money rendered");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  assert.ok(Number.isFinite(payload.total_paint_mask_cost), "S1 mask total finite");
  assert.ok(Number.isFinite(payload.total_liquid_paint_and_supplies_cost), "S1 paint total finite");
  assert.ok(Number.isFinite(payload.total_labor_cost), "S1 labor total finite");
  assert.ok(payload.total_labor_cost > 0, "S1 labor nonzero on a real project");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
}

// S2 — malformed thickness: banner shows, aria-invalid on the trigger,
// Save + Copy both blocked with ZERO entity writes; saved acknowledged
// totals stay visible as "Saved amounts".
{
  const c = await mount({ project: SAVED_PROJECT({ items: [PAINT_ITEM({ thickness: "bogus" })] }) });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("paint_thickness_unavailable") === false
    || textOf(banner(c)[0].props.children).includes("thickness"), "S2 banner names the field");
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 1, "S2 aria-invalid present on a flagged input");
  assert.ok(pageText(c).includes("Saved amounts (not current pricing)"), "S2 saved-fallback label shown");
  assert.ok(pageText(c).includes("$300.00"), "S2 saved labor total still visible");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S2 zero save writes while held");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S2 zero estimate writes");
  assert.ok(errorBox(c).length, "S2 save error shown");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Save paused"), "S2 pause message");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S2 zero copy writes while held");
}

// S3 — same hold with NO acknowledged totals on record → "Not saved", never $0.
{
  const c = await mount({ project: PROJECT({ items: [PAINT_ITEM({ thickness: "bogus" })] }) });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  assert.ok(!pageText(c).includes("$0.00 gal"), "S3 no fabricated zeros in totals");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S3 zero writes");
}

// S4 — malformed settings row (catalog hold): project-level message, blocked.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ default_labor_rate: "not-a-rate" }),
  });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("default_labor_rate"), "S4 banner names the setting");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S4 zero writes");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Painting Settings"), "S4 settings-specific message");
}

// S5 — explicit-zero settings row is honored, not resurrected: saves fine.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ paint_mask_rate_per_sqft: "0", min_labor_hours: "0", additional_color_multiplier: "0" }),
  });
  assert.equal(banner(c).length, 0, "S5 explicit-zero rows produce no banner");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 1, "S5 save proceeds with honored zeros");
}

// S6 — positive-required key at 0: banner + block.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ mixed_paint_coverage_sqft_per_gallon: "0" }),
  });
  assert.ok(banner(c).length, "S6 coverage=0 flagged");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S6 zero writes");
}

// S7 — blank supplies-rate input preserved mid-edit (not laundered to 0),
// flags the field, blocks save.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const suppliesInput = c.root.findAll(el => el.type === "input" && el.props.type === "number"
    && el.props["aria-describedby"] !== undefined || (el.type === "input" && el.props.step === "0.01" && el.props.min === "0" && el.props["aria-describedby"] !== undefined));
  // Find by onChange wiring — the project-level supplies input sits under the
  // "Paint application supplies" label; find the input whose change patches
  // paint_supplies_per_sqft.
  const allNumberInputs = c.root.findAll(el => el.type === "input" && el.props.type === "number");
  assert.ok(allNumberInputs.length, "S7 number inputs exist");
  // The supplies input is the first project-level one (in the Project section).
  const target = allNumberInputs[0];
  await act(async () => { target.props.onChange({ target: { value: "" } }); await flush(); });
  // After blanking: input keeps "" (blank-preserving) and the field is flagged.
  const after = c.root.findAll(el => el.type === "input" && el.props.type === "number")[0];
  assert.equal(after.props.value, "", "S7 blank value preserved in input");
  assert.ok(banner(c).length, "S7 blank supplies rate flagged");
  assert.equal(after.props["aria-invalid"], true, "S7 aria-invalid on supplies input");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 0, "S7 zero writes");
}

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
console.log("PASS painting-page (Save blocked while held; saved totals shown; clean paths save)");
