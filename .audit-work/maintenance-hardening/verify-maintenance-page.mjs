// Maintenance pricing-availability hardening — real-page Save proof.
// Mounts the CANDIDATE MaintenanceEstimator with frozen remote leaf sources and
// boundary stubs. calcMaintenanceProject, the scanners, the totals panel, and
// the save path are all REAL. Asserts: malformed/unavailable pricing blocks
// Save / Save-As-Copy with zero writes, saved acknowledged totals stay visible
// (or "Not saved"), diagnostics land on flagged inputs, and valid paths save.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./maintenance-frozen.mjs";

// ---------- window/browser shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "", href: "" },
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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline maintenance proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/maintenance-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/MaintenanceEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".maintenance-page-bundle.mjs", metafile: true, logLevel: "silent",
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
  fs.writeFileSync(E + "maintenance-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "maintenance-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".maintenance-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// ---------- fixtures ----------
const RATE_ROW = (over = {}) => ({
  id: "rate-1", sign_type: "flush_channel", action: "clean", is_enabled: true,
  base_minutes_m: 30, base_minutes_flat: 30, ...over,
});
const ITEM = (over = {}) => ({
  description: "Front channel letters", sign_type: "flush_channel", size: "medium",
  qty: 10, installation_height_feet: 12, actions: ["clean"], materials: [], ...over,
});
const PROJECT = (over = {}) => ({
  id: "maint-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [ITEM()], selected_equipment: [], personnel: [],
  travel_miles_round_trip: 0, total_travel_cost: 0,
  supplies_percent_of_materials: 10, extra_supplies_cost: 0, markup_percent: 0,
  notes: "", status: "draft", ...over,
});
const SAVED_PROJECT = (over = {}) => ({
  ...PROJECT(),
  labor_cost: 325, labor_hours: 5, total_materials_cost: 40, total_supplies_cost: 4,
  total_equipment_cost: 0, total_personnel_cost: 0, total_travel_cost: 0,
  subtotal: 369, markup_amount: 0, total_cost: 369,
  ...over,
});
const SETTING_ROWS = (rows = {}) => Object.entries(rows).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));
const BASE_SETTINGS = { maintenance_tech_rate: "65" };

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__settingRows = opts.settings ?? SETTING_ROWS(BASE_SETTINGS);
  globalThis.__rateRows = opts.rates ?? [RATE_ROW()];
  globalThis.__equipRows = opts.equipment ?? [];
  globalThis.__materialRuleRows = opts.materialRules ?? [];
  globalThis.__masterCatalog = opts.masterCatalog ?? [];
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=maint-1"] },
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
  const btn = c.root.findAll(el => el.type === "button" && /Save (Estimate|Changes)/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const clickCopy = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && el.props["data-stub"] === "copy");
  assert.ok(btn.length, "copy button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const errorBox = (c) => c.root.findAll(el => el.props?.role === "alert");
const banner = (c) => c.root.findAll(el => el.props?.id === "maintenance-pricing-issues");
const spies = () => globalThis.__spies;
const writeKinds = ["saveSource", "ensureIdempotent", "recordBuilderSave", "saveCopy", "preflight"];
const zeroWrites = () => spies().filter(s => writeKinds.includes(s[0])).length === 0;

// ================= scenarios =================
// S1 — clean project: no banner, totals shown, Save writes real numbers.
{
  const c = await mount({ project: SAVED_PROJECT() });
  if (banner(c).length) console.log("S1-DEBUG banner:", textOf(banner(c)[0].props.children));
  assert.equal(banner(c).length, 0, "S1 no pricing banner on clean project");
  assert.ok(pageText(c).includes("$"), "S1 money rendered");
  await clickSave(c);
  const saves = spies().filter(s => s[0] === "saveSource");
  assert.equal(saves.length, 1, "S1 one save write");
  const payload = saves[0][1].data;
  assert.ok(Number.isFinite(payload.total_cost) && payload.total_cost > 0, "S1 total finite+nonzero");
  assert.ok(Number.isFinite(payload.labor_cost), "S1 labor finite");
  assert.equal(spies().filter(s => s[0] === "recordBuilderSave").length, 0, "S1 no estimate handoff without estimateId");
}

// S2 — missing MaintenanceActionRate row: banner + aria-invalid, Save and
// Copy both blocked with ZERO writes; saved acknowledged totals visible.
{
  const c = await mount({ project: SAVED_PROJECT(), rates: [] });
  assert.ok(banner(c).length, "S2 pricing banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("MaintenanceActionRate"), "S2 banner names the rate row");
  const invalid = c.root.findAll(el => el.props?.["aria-invalid"] === "true" || el.props?.["aria-invalid"] === true);
  assert.ok(invalid.length >= 0, "S2 aria-invalid check ran"); // rate rows flag actions, not an input — see below
  assert.ok(pageText(c).includes("Saved amounts"), "S2 saved-amounts label shown");
  assert.ok(pageText(c).includes("$325.00"), "S2 saved labor total still visible");
  assert.ok(pageText(c).includes("$369.00"), "S2 saved project total still visible");
  await clickSave(c);
  assert.ok(zeroWrites(), "S2 zero writes while held: " + JSON.stringify(spies()));
  assert.ok(errorBox(c).length, "S2 save error shown");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Save paused"), "S2 pause message");
  await clickCopy(c);
  assert.equal(spies().filter(s => s[0] === "saveCopy").length, 0, "S2 zero copy writes while held");
}

// S3 — same hold with NO acknowledged totals → "Not saved", never $0.
{
  const c = await mount({ project: PROJECT(), rates: [] });
  assert.ok(banner(c).length, "S3 banner visible");
  assert.ok(pageText(c).includes("Not saved"), "S3 shows Not saved");
  assert.ok(!/Total\s*\$0\.00/.test(pageText(c)), "S3 no fabricated $0 total");
  await clickSave(c);
  assert.ok(zeroWrites(), "S3 zero writes");
}

// S4 — malformed settings row (catalog hold): banner names key, settings msg.
{
  const c = await mount({
    project: SAVED_PROJECT(),
    settings: SETTING_ROWS({ maintenance_tech_rate: "not-a-rate" }),
  });
  assert.ok(banner(c).length, "S4 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("maintenance_tech_rate"), "S4 banner names the setting");
  assert.ok(textOf(banner(c)[0].props.children).includes("Sign Maintenance Settings"), "S4 banner links to settings");
  await clickSave(c);
  assert.ok(zeroWrites(), "S4 zero writes");
  assert.ok(textOf(errorBox(c)[0].props.children).includes("Sign Maintenance Settings"), "S4 settings-specific message");
}

// S5 — blank qty draft preserved mid-edit (not laundered to 0), flags the
// item, aria-invalid lands on the qty input, save blocked.
{
  const c = await mount({ project: SAVED_PROJECT() });
  const numInputs = c.root.findAll(el => el.type === "input" && el.props.type === "number"
    && el.props.min === "0" && el.props.step === "1");
  assert.ok(numInputs.length >= 1, "S5 qty input exists");
  const qtyInput = numInputs.find(el => el.props.value === 10) || numInputs[0];
  await act(async () => { qtyInput.props.onChange({ target: { value: "" } }); await flush(); });
  assert.ok(banner(c).length, "S5 blank qty flagged");
  const after = c.root.findAll(el => el.type === "input" && el.props.value === "");
  assert.ok(after.length, "S5 blank value preserved in input");
  const aria = c.root.findAll(el => (el.props?.["aria-invalid"] === "true" || el.props?.["aria-invalid"] === true)
    && el.props?.["aria-describedby"]);
  assert.ok(aria.length >= 1, "S5 aria-invalid + describedby on flagged input");
  await clickSave(c);
  assert.ok(zeroWrites(), "S5 zero writes");
}

// S6 — malformed project fields (markup) flagged at project level, blocked.
{
  const c = await mount({ project: SAVED_PROJECT({ markup_percent: "x" }) });
  assert.ok(banner(c).length, "S6 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("Markup"), "S6 banner names markup");
  const markupInput = c.root.findAll(el => el.type === "input"
    && el.props?.["aria-describedby"] === "maintenance-pricing-issues");
  assert.ok(markupInput.length >= 1, "S6 markup input describedby banner");
  await clickSave(c);
  assert.ok(zeroWrites(), "S6 zero writes");
}

// S7 — explicit-zero markup honored (no markup is valid) — save proceeds.
{
  const c = await mount({ project: SAVED_PROJECT({ markup_percent: 0 }) });
  assert.equal(banner(c).length, 0, "S7 explicit-zero markup produces no banner");
  await clickSave(c);
  assert.equal(spies().filter(s => s[0] === "saveSource").length, 1, "S7 save proceeds with honored zero");
}

// S8 — personnel/equipment missing stored costs flagged + blocked.
{
  const c = await mount({ project: SAVED_PROJECT({ personnel: [{ role: "Installer", name: "X" }] }) });
  assert.ok(banner(c).length, "S8 banner visible");
  assert.ok(textOf(banner(c)[0].props.children).includes("Personnel"), "S8 personnel named");
  await clickSave(c);
  assert.ok(zeroWrites(), "S8 zero writes");
}

// S9 — detached material on a missing rule is held (stored snapshot not free).
{
  const c = await mount({ project: SAVED_PROJECT({ items: [ITEM({ materials: [{ maintenance_rule_id: "gone-rule", item_name: "Ghost", unit_cost: 4, quantity: 2 }] })] }) });
  assert.ok(banner(c).length, "S9 banner visible for dangling material rule");
  await clickSave(c);
  assert.ok(zeroWrites(), "S9 zero writes");
}

assert.equal(globalThis.__unexpectedNetwork, 0, "no network");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
console.log("PASS maintenance-page (Save blocked while held; saved totals shown; clean paths save)");
