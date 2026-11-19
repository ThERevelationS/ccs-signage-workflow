// Channel Letter pricing-availability hardening — real-page Save proof.
// Mounts the candidate ChannelLetterEstimator page with the REAL component tree
// (candidates + frozen remote leaves) and stubs limited to entity/service
// boundaries and network/visual leaves. calcChannelProject, channelProjectIssues,
// LettersPurchaseTab, ItemsList, EquipmentSelector, PersonnelSelector,
// LadderSelector, InstallSummaryCard, SummaryDetailsCard, ValidationWarnings
// and the save path are all REAL.
// Asserts: malformed/unavailable pricing blocks Save with zero writes,
// saved acknowledged amounts stay visible labeled, and valid/explicit-zero/
// numeric-string paths save.
import esbuild from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

import { E, frozenSources, makeStubs, makeFrozenPlugin } from "./channel-frozen.mjs";

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
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("Unexpected network access in offline channel proof"); };

// ---------- frozen sources + stubs + bundle ----------
const sources = frozenSources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/channel-page-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/ChannelLetterEstimator.jsx";`);
const pageBuild = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".channel-page-bundle.mjs", metafile: true, logLevel: "silent",
});
// Candidate files must build with ZERO warnings. Remote-frozen files carry
// pre-existing JSX warts (duplicate type="button" attributes) that are
// outside the audit scope — recorded, not fixed, since remote stays byte-exact.
const CANDIDATE_PATHS = new Set([
  "channelLetterPricingAvailability.js", "BackerFabPanel.jsx", "BackerSection.jsx",
  "DimensionalFabPanel.jsx", "EquipmentSelector.jsx", "InstallLineItem.jsx",
  "InstallSummaryCard.jsx", "ItemsList.jsx", "LadderSelector.jsx",
  "LetterPurchaseRow.jsx", "LettersPurchaseTab.jsx", "MaterialsList.jsx",
  "PersonnelSelector.jsx", "SummaryDetailsCard.jsx", "ValidationWarnings.jsx",
  "installExport.jsx", "ChannelLetterEstimator.jsx",
]);
const remoteWarnings = [], candidateWarnings = [];
for (const w of pageBuild.warnings) {
  const f = w.location?.file || "";
  (CANDIDATE_PATHS.has(f.split("/").pop()) ? candidateWarnings : remoteWarnings).push({ file: f, text: w.text, line: w.location?.line });
}
assert.deepEqual(candidateWarnings, [], "candidate-file warnings: " + JSON.stringify(candidateWarnings));
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
  fs.writeFileSync(E + "channel-page-import-edges.json", JSON.stringify(edges, null, 2));
}
fs.writeFileSync(E + "channel-page-meta.json", JSON.stringify({ inputs: Object.keys(pageBuild.metafile.inputs), loaded }, null, 2));
const { Page } = await import(pathToFileURL(path.resolve(E + ".channel-page-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter, useLocation, useNavigate } = await import("react-router-dom");

// ---------- fixtures ----------
// Settings land via {setting_name, setting_value} rows, exactly like the page.
const SETTINGS_OBJ = {
  letters_channel_flush_per_inch: 9.03,
  letters_channel_raceway_per_inch: 7.10,
  letters_channel_halo_per_inch: 11.75,
  letters_capsule_logo_per_sqft: 45.37,
  letters_raceway_1st_per_ft: 22.53,
  letters_raceway_2nd_per_ft: 23.53,
  letters_raceway_3rd_per_ft: 24.53,
  letters_raceway_4th_per_ft: 25.53,
  install_labor_rate: 65,
  install_installer_rate: 65,
  install_crew_lead_rate: 85,
  install_helper_rate: 45,
  install_drill_rate_medium__exterior__h0_12: 50,
  install_prep_rate_medium__exterior__h0_12: 100,
  install_electrical_rate_medium__exterior__h0_12: 15,
  install_wall_eifs_multiplier: 1.0,
  install_gasoline_price_per_gallon: 3.5,
  install_diesel_price_per_gallon: 4.0,
  install_travel_labor_rate: 45,
  install_travel_avg_speed_mph: 55,
};
const settingRows = (obj = SETTINGS_OBJ, drop = []) =>
  Object.entries(obj).filter(([k]) => !drop.includes(k)).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));

const PURCHASE = {
  id: "lp1", letter_type: "channel_flush_mounted", description: "Front letters",
  qty: 5, size_value: 24, raceway_length_feet: 0, raceway_qty: 0,
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: true, install_height_feet: 12, wall_material: "eifs",
  backer_enabled: false,
};
const DIM_PURCHASE = {
  id: "lp3", letter_type: "dimensional_letters", description: "Lobby dims",
  qty: 8, size_value: 0, raceway_length_feet: 0, raceway_qty: 0,
  unit_cost: 0, unit_cost_override: false, letters_total_override: false,
  create_install_item: true, install_height_feet: 8, wall_material: "drywall_interior",
  backer_enabled: false, fab_config: null,
};
const ITEM = {
  description: "Install", installation_type: "flush_mount",
  qty_letters: 10, letter_size: "medium", letter_height_inches: 24,
  installation_height_feet: 12, wall_material: "eifs",
  thick_hollow_walls: false, parapet: false, poor_electrical_access: false,
  escort_required: false, badging_checkin: false, after_hours_weekend: false,
  set_hours_installation: false, poor_site_access: false, materials: [],
};
const EQUIP_ROW = {
  equipment_id: "eq1", equipment_name: "Bucket Boom", equipment_type: "boom_lift",
  pricing_mode: "per_day", duration: 1, unit_cost: 350, total_cost: 350,
  include_delivery: false, delivery_pickup_cost: 0,
};
const PERSON_ROW = { role: "Installer", name: "Jo", hourly_rate: 65, hours: 8, total_cost: 520 };
const INV = [
  { id: "m1", item_name: "Sleeve anchors", pricing_mode: "per_letter_flat", cost_per_letter: 0.35, is_default: false },
];
const EQUIP_INV = [
  { id: "eq1", equipment_name: "Bucket Boom", equipment_type: "boom_lift", pricing_mode: "per_day", cost_per_day: 350, max_height_feet: 45, delivery_pickup_cost: 75, idle_running_cost_per_hour: 0 },
];
const PROJECT = (over = {}) => ({
  id: "cl-1", updated_date: "v1",
  project_name: "P", client_name: "C", estimate_number: "",
  project_scope: "full", install_environment: "exterior",
  letter_purchases: [structuredClone(PURCHASE)],
  items: [structuredClone(ITEM)],
  selected_equipment: [structuredClone(EQUIP_ROW)],
  personnel: [structuredClone(PERSON_ROW)],
  letters_delivery_fee: 25, letters_design_fee: 0,
  letters_install_supplies_fee: 0, letters_permitting_fee: 0, letters_other_fee: 0,
  letters_markup_percent: 10,
  travel_miles_round_trip: 40, total_travel_cost: 120,
  supplies_percent_of_materials: 10, extra_supplies_cost: 0, markup_percent: 20,
  base_supplies_cost: 0, notes: "",
  ...over,
});

// ---------- mount + helpers ----------
globalThis.__estimate = null;
const locations = [], navigates = [];
const LocSpy = () => { const l = useLocation(); globalThis.window.location.search = l.search; locations.push(l); return null; };
const NavSpy = () => { navigates.push(useNavigate()); return null; };
const flush = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project === undefined ? PROJECT() : opts.project;
  globalThis.__settingRows = opts.settings ?? settingRows();
  globalThis.__invRows = opts.inventory ?? INV;
  globalThis.__equipRows = opts.equipment ?? EQUIP_INV;
  globalThis.__dimRows = opts.dimensional ?? [];
  let c;
  await act(async () => {
    c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=cl-1&estimateId=est-1"] },
      React.createElement(LocSpy), React.createElement(NavSpy), React.createElement(Page)));
    await flush();
  });
  return c;
};
const elByType = (c, name) => c.root.findAll((el) => el.type?.name === name);
const summaryCard = (c) => { const e = elByType(c, "InstallSummaryCard"); assert.ok(e.length, "summary card mounted"); return e[0]; };
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
const WRITE_KINDS = ["saveSource", "ensureIdempotent", "recordBuilderSave", "saveCopy", "pricing", "custSummary", "preflight"];
const zeroWrites = () => { for (const k of WRITE_KINDS) assert.equal(spyCount(k), 0, "zero " + k); };
const trySave = async (c) => {
  const onSave = summaryCard(c).props.onSave; assert.ok(onSave);
  await act(async () => { await onSave(); await flush(); });
};
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1600) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};

// case 1 — valid existing project saves (one write, real total, builder handoff)
await check("valid-existing-saves", async () => {
  const c = await mount();
  try {
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1, "one project write");
    assert.equal(spyCount("recordBuilderSave"), 1, "estimate handoff fired");
    const call = globalThis.__spies.find(x => x[0] === "saveSource")[1];
    assert.ok(Number.isFinite(call.data.total_cost), "payload total is a real number");
    assert.ok(call.data.total_cost > 0);
    assert.equal(call.data.__held, undefined, "transient fields stripped");
    assert.equal(call.data.issues, undefined);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 2 — malformed purchase qty blocks save, zero writes
await check("held-blank-qty-blocks", async () => {
  const p = PROJECT(); p.letter_purchases[0].qty = "";
  const c = await mount({ project: p });
  try {
    await trySave(c);
    zeroWrites();
    assert.ok(globalThis.__alerts.some(a => a.includes("pricing issue")), "blocked alert shown: " + globalThis.__alerts);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 3 — missing letter-rate setting blocks save (catalog issue)
await check("held-missing-letter-rate-blocks", async () => {
  const c = await mount({ settings: settingRows(SETTINGS_OBJ, ["letters_channel_flush_per_inch"]) });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 4 — missing install minutes setting blocks save (item held)
await check("held-missing-install-minutes-blocks", async () => {
  const c = await mount({ settings: settingRows(SETTINGS_OBJ, ["install_drill_rate_medium__exterior__h0_12"]) });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 5 — inventory material missing price blocks save
await check("held-material-price-blocks", async () => {
  const inv = [{ ...INV[0] }]; delete inv[0].cost_per_letter;
  const p = PROJECT(); p.items[0].materials = [{ inventory_item_id: "m1", item_name: "Sleeve anchors", pricing_mode: "per_letter_flat", unit_cost: 0.35, quantity: 10, total_cost: 3.5 }];
  const c = await mount({ project: p, inventory: inv });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 6 — malformed equipment total blocks save
await check("held-equipment-cost-blocks", async () => {
  const p = PROJECT(); p.selected_equipment[0].total_cost = "abc";
  const c = await mount({ project: p });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 7 — crew row with hours but no rate blocks save
await check("held-personnel-rate-blocks", async () => {
  const p = PROJECT(); p.personnel = [{ role: "Installer", name: "Jo", hourly_rate: "", hours: 8, total_cost: 0 }];
  const c = await mount({ project: p });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 8 — miles set + missing fuel price blocks save (travel catalog hold)
await check("held-travel-setting-blocks", async () => {
  const c = await mount({ settings: settingRows(SETTINGS_OBJ, ["install_gasoline_price_per_gallon"]) });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 9 — malformed project markup blocks save
await check("held-bad-markup-blocks", async () => {
  const c = await mount({ project: PROJECT({ markup_percent: "abc" }) });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 10 — dimensional row without fab config blocks save
await check("held-dimensional-fab-blocks", async () => {
  const p = PROJECT({ letter_purchases: [structuredClone(DIM_PURCHASE)] });
  const c = await mount({ project: p });
  try {
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 11 — Save-As-Copy is blocked too
await check("copy-blocked-when-held", async () => {
  const p = PROJECT(); p.letter_purchases[0].qty = "";
  const c = await mount({ project: p });
  try {
    const copyBtn = c.root.findAll((el) => el.props?.["data-stub"] === "copy")[0];
    assert.ok(copyBtn, "copy action rendered");
    await act(async () => { copyBtn.props.onClick(); await flush(); });
    zeroWrites();
    assert.ok(globalThis.__alerts.length >= 1);
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 12 — acknowledged saved amounts stay visible, labeled, while held
await check("held-saved-snapshot-visible", async () => {
  const p = PROJECT({ letters_subtotal: 1083.5 });
  p.letter_purchases[0].qty = "";
  const c = await mount({ project: p });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Saved amounts (not current pricing)"), "held caption rendered");
    assert.ok(text.includes("$1,083.50") || text.includes("$1083.50"), "saved letters subtotal visible");
    await trySave(c);
    zeroWrites();
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 13 — explicit $0 fee + $0 markup are real zeros and save
await check("explicit-zero-saves", async () => {
  const p = PROJECT({ letters_delivery_fee: 0, markup_percent: 0, travel_miles_round_trip: 0, total_travel_cost: 0, supplies_percent_of_materials: 0 });
  const c = await mount({ project: p });
  try {
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1);
    const call = globalThis.__spies.find(x => x[0] === "saveSource")[1];
    assert.equal(call.data.markup_amount, 0, "authored zero markup persisted");
    assert.ok(Number.isFinite(call.data.total_cost));
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 14 — numeric-string inputs are real values and save
await check("numeric-string-saves", async () => {
  const p = PROJECT(); p.letter_purchases[0].qty = "5"; p.letter_purchases[0].size_value = "24"; p.letters_markup_percent = "10";
  const c = await mount({ project: p });
  try {
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1);
    const call = globalThis.__spies.find(x => x[0] === "saveSource")[1];
    assert.ok(call.data.letter_purchases[0].total_cost > 0, "computed row total persisted");
    assert.ok(Number.isFinite(call.data.total_cost));
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 15 — pricing diagnostics render: banner + aria-invalid + inline issue
await check("held-diagnostics-render", async () => {
  const p = PROJECT(); p.items[0].qty_letters = "";
  const c = await mount({ project: p });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Pricing needs attention"), "input-issue banner rendered");
    assert.ok(text.includes("letter quantity"), "inline field message rendered");
    const bad = c.root.findAll((el) => el.type === "input" && el.props?.["aria-invalid"] === true);
    assert.ok(bad.length >= 1, "aria-invalid flagged input present");
    assert.equal(bad[0].props["aria-describedby"], "cli-0-qty_letters-issue");
    const msg = c.root.findAll((el) => el.props?.id === "cli-0-qty_letters-issue" && el.props?.role === "alert");
    assert.ok(msg.length >= 1, "inline issue node present with matching id");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 16 — catalog diagnostics render separately from input diagnostics
await check("catalog-diagnostics-render", async () => {
  const c = await mount({ settings: settingRows(SETTINGS_OBJ, ["install_labor_rate"]) });
  try {
    const text = textOf(c.root);
    assert.ok(text.includes("Pricing records unavailable"), "catalog banner rendered");
    assert.ok(text.includes("install_labor_rate"), "setting name surfaced");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

// case 17 — letters_only scope: install side stays dormant and saves
await check("letters-only-scope-saves", async () => {
  const p = PROJECT({ project_scope: "letters_only", selected_equipment: [], personnel: [], items: [] });
  const c = await mount({ project: p });
  try {
    await trySave(c);
    assert.equal(spyCount("saveSource"), 1, "letters-only project writes once");
  } finally { try { await act(async () => c.unmount()); } catch {} }
});

assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
const failed = results.filter(r => !r.ok);
fs.writeFileSync(E + "channel-page-verification.json", JSON.stringify({
  totalChecks: results.length, passed: results.length - failed.length, failed: failed.length,
  unexpectedNetwork: globalThis.__unexpectedNetwork,
  preExistingRemoteWarnings: remoteWarnings,
  results,
}, null, 2));
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);
