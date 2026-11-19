// Vinyl pricing-availability hardening — real-page Save proof.
// Mounts the remote-frozen VinylEstimator page with candidate modules;
// stubs are limited to entity/service boundaries and visual-leaf components.
// calcVinylWorkflow, vinylProjectInputIssues, rollupVinylProject, the workflow
// card tree, the summary card, and the save path are all REAL.
// Asserts: malformed/unavailable pricing blocks Save with zero writes,
// saved acknowledged amounts stay visible, and valid/explicit-zero paths save.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./vinyl-frozen.mjs";

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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline vinyl proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/vinyl-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/VinylEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".vinyl-page-bundle.mjs", metafile: true, logLevel: "silent",
});
assert.deepEqual(pageBuild.warnings, []);
{
  const sdkInputs = Object.keys(pageBuild.metafile.inputs).filter(f => /base44Client\.js|node_modules\/@base44/.test(f));
  if (sdkInputs.length) console.error("SDK inputs leaked:", sdkInputs);
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
  fs.writeFileSync(E + "vinyl-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "vinyl-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".vinyl-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter, useLocation, useNavigate } = await import("react-router-dom");

// ---------- fixtures ----------
const VINYL = { id: "v1", vinyl_name: "Cast 54", roll_width_inches: 54, roll_length_yards: 50, pricing_mode: "per_sqft", cost_per_sqft: 0.5 };
const PRINTER = { id: "p1", machine_name: "Printer", machine_type: "printer", is_default_for_type: true, machine_hourly_rate: 35, print_speed_sqft_per_hour: 400, warmup_minutes: 2, media_load_minutes: 1, calibration_minutes_per_job: 1, print_cost_per_sqin: 0.002, operator_hourly_rate: 45, left_margin_inches: 0.5, right_margin_inches: 0.5, leading_edge_inches: 4, trailing_edge_inches: 2, default_gutter_horizontal_inches: 0.25, default_gutter_vertical_inches: 0.25, default_bleed_inches: 0.125, max_media_width_inches: 54 };
const CUTTER = { id: "c1", machine_name: "Cutter", machine_type: "cutter", is_default_for_type: true, machine_hourly_rate: 25, cut_speed_inches_per_second: 30, cut_setup_minutes_per_job: 2, cut_blade_life_minutes: 6000, cut_blade_cost: 12, cut_pull_off_inches_per_job: 6, operator_hourly_rate: 45, max_media_width_inches: 48 };
const WF = (over = {}) => ({
  id: "wf1", name: "W1", vinyl_id: "v1", laminate_id: "", transfer_tape_id: "",
  printer_id: "p1", cutter_id: "c1", laminator_id: "",
  apply_print: true, apply_cut: true, apply_laminate: false, apply_transfer_tape: false,
  print_quality: "", weeding_difficulty: "moderate",
  weeding_minutes_per_part_override: "", install_minutes_per_part: "",
  spoilage_buffer_percent: "", setup_fee_floor: "",
  gutter_h_override: "", gutter_v_override: "",
  items: [{ id: "i1", description: "Decal", width_inches: 12, height_inches: 8, quantity: 2, bleed_inches: 0.125 }],
  personnel: [], ...over,
});
const PROJECT = (over = {}) => ({
  id: "vinyl-1", updated_date: "v1", project_name: "P", client_name: "C",
  workflows: [WF()], items: [],
  selected_equipment: [], personnel: [],
  travel_miles_round_trip: 0, total_travel_cost: 0,
  supplies_percent_of_materials: 5, extra_supplies_cost: 0, markup_percent: 0,
  ...over,
});

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const locations = [], navigates = [];
const LocSpy = () => { const l = useLocation(); globalThis.window.location.search = l.search; locations.push(l); return null; };
const NavSpy = () => { navigates.push(useNavigate()); return null; };
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__vinylRows = opts.vinyls ?? [VINYL];
  globalThis.__machineRows = opts.machines ?? [PRINTER, CUTTER];
  globalThis.__settingRows = opts.settings ?? [];
  globalThis.__equipRows = opts.equipment ?? [];
  globalThis.__laborRows = [];
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=vinyl-1"] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page)));
    await flush();
  });
  return c;
};
const elByType = (c, name) => c.root.findAll((el) => el.type?.name === name);
const summaryCard = (c) => { const e = elByType(c, "VinylProjectSummaryCard"); assert.ok(e.length, "summary card mounted"); return e[0]; };
const textOf = (node) => {
  let out = "";
  const walk = (x) => {
    if (x == null || typeof x === "boolean") return;
    if (typeof x === "string" || typeof x === "number") { out += x + " "; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x.findAll === "function" && Array.isArray(x.children)) { x.children.forEach(walk); return; }
    if (x.props?.children !== undefined) walk(x.props.children);
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
};
const spyCount = (k) => globalThis.__spies.filter((x) => x[0] === k).length;
const WRITE_KINDS = ["saveSource", "ensureIdempotent", "recordBuilderSave", "saveCopy", "pricing"];
const zeroWrites = () => { for (const k of WRITE_KINDS) assert.equal(spyCount(k), 0, "zero " + k); };
const trySave = async (c) => {
  const onSave = summaryCard(c).props.onSave; assert.ok(onSave);
  await act(async () => { await onSave(); await flush(); });
};
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1400) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};

// case 1 — valid existing project saves (one write, real total)
await check("valid-existing-saves", async () => {
  const c = await mount();
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, false);
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1, "one project write");
    const call = globalThis.__spies.find(x => x[0] === "saveSource")[1];
    assert.ok(Number.isFinite(call.data.total_cost), "payload total is a real number");
    assert.ok(call.data.total_cost > 0);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 2 — valid new project creates once via idempotent create
await check("valid-new-creates", async () => {
  const c = await mount({ route: "/", project: null });
  try {
    // Seed project_name + client_name via the rendered inputs — the project
    // name input is the one immediately after the client-name input in tree
    // order (both live in the same grid on the Project tab).
    const nameInput = c.root.findAll((el) => el.type === "input" && el.props?.placeholder === "Enter client name")[0];
    assert.ok(nameInput, "client name input");
    await act(async () => { nameInput.props.onChange({ target: { value: "Acme" } }); });
    const inputs = c.root.findAll((el) => el.type === "input");
    const projName = inputs[inputs.indexOf(nameInput) + 1];
    assert.ok(projName, "project name input");
    await act(async () => { projName.props.onChange({ target: { value: "Job 1" } }); await flush(); });
    await trySave(c);
    assert.equal(spyCount("ensureIdempotent"), 1, "one create");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 3 — missing vinyl price blocks save, zero writes
await check("held-missing-vinyl-price-blocks", async () => {
  const v = { ...VINYL }; delete v.cost_per_sqft;
  const c = await mount({ vinyls: [v] });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
    assert.ok(globalThis.__alerts.length >= 1, "blocked alert shown");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 4 — malformed machine rate blocks save
await check("held-bad-machine-rate-blocks", async () => {
  const p = { ...PRINTER, machine_hourly_rate: "abc" };
  const c = await mount({ machines: [p, CUTTER] });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 5 — malformed part dimension blocks save
await check("held-bad-part-dimension-blocks", async () => {
  const wf = WF(); wf.items[0].width_inches = "abc";
  const c = await mount({ project: PROJECT({ workflows: [wf] }) });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 6 — malformed markup blocks save
await check("held-bad-markup-blocks", async () => {
  const c = await mount({ project: PROJECT({ markup_percent: "abc" }) });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 7 — malformed equipment total blocks save
await check("held-equipment-cost-blocks", async () => {
  const p = PROJECT({ selected_equipment: [{ equipment_id: "e1", equipment_name: "Boom", total_cost: "abc" }] });
  const c = await mount({ project: p, equipment: [{ id: "e1", equipment_name: "Boom" }] });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 8 — unplaced part blocks save
await check("held-unplaced-part-blocks", async () => {
  const wf = WF(); wf.items[0].width_inches = 200;
  const c = await mount({ project: PROJECT({ workflows: [wf] }) });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 9 — acknowledged saved amounts stay visible while held
await check("held-saved-snapshot-visible", async () => {
  const v = { ...VINYL }; delete v.cost_per_sqft;
  const p = PROJECT({
    total_vinyl_cost: 40, total_machine_cost: 10, labor_cost: 30,
    total_supplies_cost: 4.5, base_supplies_cost: 4.5,
    total_equipment_cost: 100, total_personnel_cost: 50, total_travel_cost: 25,
    subtotal: 259.5, markup_amount: 0, total_cost: 259.5,
  });
  const c = await mount({ vinyls: [v], project: p });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Saved amounts (not current pricing)"), "held caption rendered");
    assert.ok(text.includes("$40.00"), "saved vinyl amount visible");
    assert.ok(text.includes("$259.50"), "saved total visible");
    assert.equal(summaryCard(c).props.pricingUnavailable, true);
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 10 — explicit $0 price is a real zero and saves
await check("explicit-zero-price-saves", async () => {
  const v = { ...VINYL, cost_per_sqft: 0 };
  const c = await mount({ vinyls: [v] });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, false);
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1);
    const call = globalThis.__spies.find(x => x[0] === "saveSource")[1];
    assert.equal(call.data.total_vinyl_cost, 0, "authored free vinyl persisted as 0");
    assert.ok(call.data.total_cost > 0, "machine+labor still billed");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 11 — save-as-copy is also blocked while held
await check("copy-blocked-when-held", async () => {
  const v = { ...VINYL }; delete v.cost_per_sqft;
  const c = await mount({ vinyls: [v] });
  try {
    const copyBtn = c.root.findAll((el) => el.props?.["data-stub"] === "copy")[0];
    assert.ok(copyBtn, "copy action rendered");
    await act(async () => { copyBtn.props.onClick(); await flush(); });
    zeroWrites();
    assert.ok(globalThis.__alerts.length >= 1);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 12 — issue banner + aria diagnostics render on the workflows tab
await check("held-diagnostics-render", async () => {
  const wf = WF(); wf.items[0].width_inches = "abc";
  const c = await mount({ project: PROJECT({ workflows: [wf] }) });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Pricing unavailable"), "page banner rendered");
    assert.ok(text.includes("positive, finite width"), "part message rendered");
    const bad = c.root.findAll((el) => el.type === "input" && el.props?.["aria-invalid"] === true);
    assert.ok(bad.length >= 1, "aria-invalid flagged input present");
    assert.equal(bad[0].props["aria-describedby"], "vinyl-wf-0-issues-part-0");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 13 — dormant workflow (no parts) does not block
await check("empty-workflow-saves", async () => {
  const wf = WF({ items: [] });
  const c = await mount({ project: PROJECT({ workflows: [wf] }) });
  try {
    assert.equal(summaryCard(c).props.pricingBlocked, false);
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 14 — held workflow keeps the part + roll layout visible
await check("held-rows-stay-visible", async () => {
  const v = { ...VINYL }; delete v.cost_per_sqft;
  const c = await mount({ vinyls: [v] });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Decal"), "part row still rendered");
    assert.ok(text.includes("Roll Layout"), "roll layout card still rendered");
    assert.ok(text.includes("Not saved"), "held totals show Not saved");
    assert.ok(!text.includes("$0.00 Vinyl"), "no laundered $0 material line");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const failed = results.filter(r => !r.ok);
fs.writeFileSync(E + "vinyl-page-verification.json", JSON.stringify({
  totalChecks: results.length, passed: results.length - failed.length, failed: failed.length,
  unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk, results,
}, null, 2));
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);
