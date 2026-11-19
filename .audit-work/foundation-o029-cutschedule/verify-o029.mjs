import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync, build } from "esbuild";

const DIR = path.resolve(".audit-work/foundation-o029-cutschedule");
const TREE = `${DIR}/candidate-tree-src`;
const OUT = `${DIR}/verify`;
fs.mkdirSync(OUT, { recursive: true });

// ── Stubs for bundling real components/modules ─────────────────────────────
const stubsDir = `${OUT}/stubs`;
fs.mkdirSync(stubsDir, { recursive: true });
fs.writeFileSync(`${stubsDir}/jsx-runtime.js`, `
export const jsx = (type, props) => ({ type, props: props || {} });
export const jsxs = jsx;
export const Fragment = "Fragment";
`);
fs.writeFileSync(`${stubsDir}/lucide-react.js`, `
const icon = (name) => (props) => ({ type: "icon", props: { ...(props || {}), icon: name } });
export const Trash2 = icon("Trash2"), Box = icon("Box"), Copy = icon("Copy");
export const Maximize2 = icon("Maximize2"), RotateCcw = icon("RotateCcw");
export const Eye = icon("Eye"), EyeOff = icon("EyeOff"), Plus = icon("Plus"), Edit = icon("Edit");
export const Package = icon("Package"), Building2 = icon("Building2"), Layers = icon("Layers");
export const Wrench = icon("Wrench"), Square = icon("Square"), Loader2 = icon("Loader2");
export const LogIn = icon("LogIn"), AlertCircle = icon("AlertCircle"), X = icon("X");
export const CheckCircle = icon("CheckCircle"), ChevronDown = icon("ChevronDown"), Info = icon("Info");
export const AlertTriangle = icon("AlertTriangle"), Anchor = icon("Anchor"), ArrowLeft = icon("ArrowLeft");
export const ArrowLeftRight = icon("ArrowLeftRight"), BookmarkPlus = icon("BookmarkPlus"), ClipboardList = icon("ClipboardList");
export const GitCompareArrows = icon("GitCompareArrows"), HelpCircle = icon("HelpCircle"), LayoutGrid = icon("LayoutGrid");
export const LayoutTemplate = icon("LayoutTemplate"), Link2 = icon("Link2"), Redo2 = icon("Redo2"), RefreshCw = icon("RefreshCw");
export const Save = icon("Save"), Tag = icon("Tag"), Trees = icon("Trees"), TrendingUp = icon("TrendingUp"), Undo2 = icon("Undo2");
`);
fs.writeFileSync(`${stubsDir}/ui.js`, `
const stub = (name) => (props) => ({ type: "ui", props: { ...(props || {}), uiComponent: name } });
export const Input = stub("Input"), Button = stub("Button"), Label = stub("Label"), Badge = stub("Badge");
export const Tabs = stub("Tabs"), TabsContent = stub("TabsContent"), TabsList = stub("TabsList"), TabsTrigger = stub("TabsTrigger");
export const Select = stub("Select"), SelectContent = stub("SelectContent"), SelectItem = stub("SelectItem"), SelectTrigger = stub("SelectTrigger"), SelectValue = stub("SelectValue");
export const Card = stub("Card"), CardContent = stub("CardContent"), CardHeader = stub("CardHeader"), CardTitle = stub("CardTitle");
export const Dialog = stub("Dialog"), DialogContent = stub("DialogContent"), DialogHeader = stub("DialogHeader"), DialogTitle = stub("DialogTitle"), DialogDescription = stub("DialogDescription");
export const Switch = stub("Switch"), Checkbox = stub("Checkbox"), Textarea = stub("Textarea");
`);
fs.writeFileSync(`${stubsDir}/react-router-dom.js`, `
export const Link = (props) => ({ type: "link", props: props || {} });
export const useNavigate = () => () => {};
export const useLocation = () => ({ pathname: "/", search: "" });
export const useParams = () => ({});
`);

const uiModules = ["badge", "button", "card", "dialog", "input", "label", "select", "tabs"];
const alias = {
  "@": TREE,
  ...Object.fromEntries(uiModules.map(m => [`@/components/ui/${m}`, `${stubsDir}/ui.js`])),
  "react": `${TREE}/react-stub.js`,
  "react/jsx-runtime": `${stubsDir}/jsx-runtime.js`,
  "lucide-react": `${stubsDir}/lucide-react.js`,
  "react-router-dom": `${stubsDir}/react-router-dom.js`,
  "react-dom": `${TREE}/react-stub.js`,
};

const bundle = (entry, name, jsx = false) => {
  buildSync({
    entryPoints: [`${TREE}/${entry}`], bundle: true, platform: "node", format: "esm",
    outfile: `${OUT}/${name}.bundle.mjs`, alias,
    loader: jsx ? { ".jsx": "jsx", ".js": "jsx" } : {},
    jsx: jsx ? "automatic" : "transform",
  });
  return import(pathToFileURL(`${OUT}/${name}.bundle.mjs`).href);
};

const results = [];
const pending = [];
const check = (name, fn) => {
  const record = { name };
  results.push(record);
  try {
    const out = fn();
    if (out instanceof Promise) {
      const p = out
        .then(() => { record.ok = true; console.log("ok", name); })
        .catch(error => { record.ok = false; record.error = String(error.stack || error); console.error("FAIL", name, error.message); });
      pending.push(p);
      return p;
    }
    record.ok = true; console.log("ok", name);
  } catch (error) { record.ok = false; record.error = String(error.stack || error); console.error("FAIL", name, error.message); }
};
const clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const issueCodes = m => (m?.issues || []).map(i => i.code);

// ── Bundles ────────────────────────────────────────────────────────────────
const schedMod = await bundle("components/estimator/foundation/foundationReinforcementCutSchedule.js", "cutschedule");
const modelMod = await bundle("components/estimator/foundation/foundationReinforcementModel.js", "model");
const itemProj = await bundle("components/estimator/foundation/foundationReinforcementItemProjection.js", "itemproj");
const calcMod = await bundle("components/estimator/foundation/foundationCalc.js", "calc");
const bomRowsMod = await bundle("components/estimator/foundation/foundationReinforcementBOMRows.js", "bomrows");
const sessionMod = await bundle("components/estimator/foundation/foundationReinforcementEditorSession.js", "session");
const bomMod = await bundle("components/estimator/foundation/FoundationBOM.jsx", "bomjsx", true);
check("bundle: all modules compiled", () => {
  for (const [n, m] of Object.entries({ schedMod, modelMod, itemProj, calcMod, bomRowsMod, sessionMod, bomMod })) {
    assert.ok(m, `${n} missing`);
  }
});

const { calculateFoundationReinforcementCutSchedule } = schedMod;
const { calculateFoundationReinforcementModel } = modelMod;
const { calculateFoundationReinforcementItemProjection } = itemProj;
const { calcItem, calcProject } = calcMod;
const { foundationReinforcementBOMRows } = bomRowsMod;
const { createFoundationReinforcementEditorSession } = sessionMod;
const FoundationBOM = bomMod.default;

// ── Fixtures (phaseb3 shapes; stock metadata added on rebar rows) ──────────
const settings = {
  concrete_cost_per_yard: 180, concrete_delivery_base: 350, concrete_delivery_per_mile: 0,
  forming_rate_per_ft: 12, pouring_rate_per_cy: 90, finishing_rate_per_hour: 55,
  rebar_labor_rate_per_ft: 0.5, excavation_hand_rate_per_cy: 60,
  foundation_main_labor_rate: 60, foundation_rebar_time_linear_ft: 0.02,
  foundation_rebar_time_cross_section: 0.05, foundation_rebar_support_time_each: 0.05,
};
const rebarRow = {
  id: "rebar-4", material_type: "rebar", material_name: "#4 rebar",
  rebar_size: "#4", rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668,
  cost_per_unit: 0.42, unit: "ft", updated_date: "2026-11-01T00:00:00.000Z",
};
const rebarStock = { ...rebarRow, id: "rebar-4s", rebar_stock_length_inches: 240 };
const rebarStockList = { ...rebarRow, id: "rebar-4l", rebar_stock_length_inches: null, rebar_stock_lengths_inches: [240, 480] };
const rebarStockShort = { ...rebarRow, id: "rebar-4t", rebar_stock_length_inches: 20 };
const bagRow = { id: "bag-1", material_type: "bagged_concrete", material_name: "80lb bag", cost_per_unit: 6.5, unit: "bag" };
const support3 = {
  id: "sup-3", material_type: "rebar_support", material_name: '3" slab chair',
  rebar_support_kind: "chair", foundation_usage: "spread_foot",
  rebar_support_height_inches: 3,
  rebar_support_footprint_length_inches: 4, rebar_support_footprint_width_inches: 4,
  rebar_support_pack_size: 8, rebar_support_compatible_bar_sizes: ["#4", "#5"],
  cost_per_unit: 1.25, sort_order: 1, rebar_support_placement_notes: "Space per layout",
};
const inventory = [rebarRow, bagRow, support3];

const spreadItem = (over = {}) => ({
  component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
  length_inches: 48, width_inches: 48, depth_inches: 18,
  selected_concrete_id: "bag-1",
  include_rebar: true, include_forming: false, include_finishing: false,
  is_new_sign_location: true, excavation_method: "hand_dig",
  reinforcement_calculation_version: 2, ...over,
});
const matA = { id: "mat-a", bearing_elevation_inches: 3, max_spacing_x_inches: 12, max_spacing_z_inches: 12 };
const matB = { id: "mat-b", bearing_elevation_inches: 8, max_spacing_x_inches: 12, max_spacing_z_inches: 12 };
const spreadDesign = (supports, mats = [matA]) => ({
  version: 2, bar_diameter_inches: 0.5,
  cover_inches: { side: 3, top: 3, bottom: 3 },
  supports,
  spread: { mats, inter_mat_ties: [] },
  pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
});
const autoSupports = { mode: "auto", spacing_inches: 24 };
const material = { kind: "catalog", inventory_id: "rebar-4" };
const materialStock = { kind: "catalog", inventory_id: "rebar-4s" };
const materialStockList = { kind: "catalog", inventory_id: "rebar-4l" };
const projectWith = (items, extra = {}) => ({
  id: "src-1", items, signage_cabinets: [], landscape: null,
  walls: [], wall_caps: [], poles: [], selected_equipment: [], project_concrete_admixtures: [],
  excavation_method: "hand_dig", ...extra,
});

const modelFor = (item, design, options) => calculateFoundationReinforcementModel(item, design, options);
const scheduleFor = (item, design, inv = inventory, mat = material) =>
  calculateFoundationReinforcementCutSchedule({
    item, design, model: modelFor(item, design), material: mat, inventory: inv,
  });
const projectionFor = (item, design, inv = inventory, mat = material) =>
  calculateFoundationReinforcementItemProjection({ item, design, material: mat, inventory: inv, settings });
const calcFor = (item, inv = inventory) => calcItem(item, projectWith([item]), inv, settings);
const pricedV2Item = (item, design, inv = inventory, mat = material) => {
  const cost = calcFor({ ...item, reinforcement_design: design, reinforcement_material: mat }, inv);
  return { ...item, reinforcement_design: design, reinforcement_material: mat, ...cost };
};

// ══════════════════ Cut lines from authored bar runs ═══════════════════════
check("straight-bar runs emit exact cut lines (shape straight, no invented bend)", () => {
  const design = spreadDesign(autoSupports);
  const s = scheduleFor(spreadItem(), design, [rebarStock, bagRow, support3], materialStock);
  assert.equal(s.status, "resolved");
  // 48x48 foot, cover 3: x-span = z-span = 41.5 → ceil(41.5/12)+1 = 5 bars each way.
  assert.equal(s.cut_lines.length, 2);
  const x = s.cut_lines.find(l => l.source_run_id === "mat-a/x");
  const z = s.cut_lines.find(l => l.source_run_id === "mat-a/z");
  assert.equal(x.role, "horizontal");
  assert.equal(x.mat_id, "mat-a");
  assert.equal(x.cut_length_inches, 42);        // 48 − 2×3
  assert.equal(x.quantity_per_instance, 5);      // nz
  assert.equal(x.quantity_total, 10);            // × quantity 2
  assert.equal(z.quantity_per_instance, 5);
  assert.equal(x.shape, "straight");
  assert.equal(x.bend_code, null);
  assert.equal(x.bar_size, "#4");
  assert.equal(x.bar_diameter_inches, 0.5);
  assert.equal(s.bar_size, "#4");
  assert.equal(s.instance_count, 2);
  assert.equal(s.piece_count_total, 20);
});

check("hoop + longitudinal + tie runs carry derivable shapes only", () => {
  const item = { component_id: "P-1", foundation_type: "pillar", diameter: 24, depth_inches: 96, quantity: 1, selected_concrete_id: "bag-1", include_rebar: true, include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig", reinforcement_calculation_version: 2 };
  const design = {
    version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "manual", placements: [{ x_inches: 12, z_inches: 12 }] },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: {
      hoops: [
        { id: "h1", center_y_inches: 12, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h2", center_y_inches: 50, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
      ],
      longitudinal: { count: 6, radius_inches: 8, bottom_end_inches: 4, top_end_inches: 90 },
    },
  };
  const s = scheduleFor(item, design, [rebarStock, bagRow, support3], materialStock);
  assert.equal(s.status, "resolved");
  const long = s.cut_lines.find(l => l.source_run_id === "pillar/longitudinal");
  assert.equal(long.shape, "straight");
  assert.equal(long.cut_length_inches, 86);       // 90 − 4
  assert.equal(long.quantity_total, 6);
  const hoops = s.cut_lines.filter(l => l.role === "hoop");
  assert.equal(hoops.length, 2);
  assert.equal(hoops[0].shape, "hoop");
  assert.ok(close(hoops[0].cut_length_inches, Math.PI * 17 + 4));
  assert.equal(hoops[0].bend_code, null);
  // inter-mat tie: authored cut length, unspecified shape — never invented
  const spreadD = spreadDesign(autoSupports, [matA, matB]);
  spreadD.spread.inter_mat_ties = [{ id: "tie-1", from_mat_id: "mat-a", to_mat_id: "mat-b", x_inches: 12, z_inches: 12, cut_length_inches: 7 }];
  const s2 = scheduleFor(spreadItem(), spreadD, [rebarStock, bagRow, support3], materialStock);
  const tie = s2.cut_lines.find(l => l.role === "inter_mat_tie");
  assert.equal(tie.shape, "as_authored");
  assert.equal(tie.bend_code, null);
  assert.equal(tie.cut_length_inches, 7);
});

// ══════════════════ FFD stock packing / waste accounting ═══════════════════
check("FFD packing: exact bins, stock counts, offcuts, waste pct", () => {
  // cuts: 3×100 + 2×60 against 240 stock → bins [100,100|off40] [100,60,60|off20]
  const model = {
    version: 2, status: "valid", instanceCount: 1, issues: [],
    groups: [
      { id: "g1/x", role: "horizontal", count: 3, cut_length_inches: 100, diameter_inches: 0.5 },
      { id: "g2/x", role: "horizontal", count: 2, cut_length_inches: 60, diameter_inches: 0.5 },
    ],
  };
  const s = calculateFoundationReinforcementCutSchedule({ model, material: materialStock, inventory: [rebarStock] });
  assert.equal(s.status, "resolved");
  assert.equal(s.stock.groups.length, 1);
  const g = s.stock.groups[0];
  assert.equal(g.totals.pieces, 5);
  assert.equal(g.totals.stock_count, 2);
  assert.equal(g.bins.length, 2);
  assert.deepEqual(g.bins[0].cuts, [{ cut_length_inches: 100, quantity: 2 }]);
  assert.ok(close(g.bins[0].offcut_inches, 40));
  assert.deepEqual(g.bins[1].cuts, [{ cut_length_inches: 100, quantity: 1 }, { cut_length_inches: 60, quantity: 2 }]);
  assert.ok(close(g.bins[1].offcut_inches, 20));
  const byLen = g.by_length[0];
  assert.equal(byLen.stock_length_inches, 240);
  assert.equal(byLen.stock_count, 2);
  assert.deepEqual(byLen.pieces_per_stock, [2, 3]);
  assert.ok(close(byLen.offcut_inches, 60));
  const t = s.stock.totals;
  assert.equal(t.total_linear_inches_required, 420);
  assert.equal(t.stock_linear_inches_purchased, 480);
  assert.ok(close(t.waste_inches, 60));
  assert.ok(close(t.waste_pct, 60 / 480 * 100));
});

check("FFD deterministic + idempotent: identical inputs → identical plan", () => {
  const model = {
    version: 2, status: "valid", instanceCount: 2, issues: [],
    groups: [
      { id: "g1/x", role: "horizontal", count: 4, cut_length_inches: 90, diameter_inches: 0.5 },
      { id: "g2/z", role: "horizontal", count: 3, cut_length_inches: 150, diameter_inches: 0.5 },
      { id: "g3", role: "longitudinal", count: 2, cut_length_inches: 200, diameter_inches: 0.5 },
    ],
  };
  const a = calculateFoundationReinforcementCutSchedule({ model, material: materialStockList, inventory: [rebarStockList] });
  const b = calculateFoundationReinforcementCutSchedule({ model, material: materialStockList, inventory: [rebarStockList] });
  assert.deepEqual(a, b);
  // JSON round-trip (snapshot persistence path never sees Maps/functions)
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

check("multi-length stock: smallest adequate length opens; grouping per length", () => {
  // cuts 3×300 + 4×100 with stock [240,480]:
  // 300s open 480s (240 too short) → bin1 300 rem180 → 100 fits rem80 →
  // second 300 opens another 480 → 100 rem80 → 100 rem... wait recount below.
  const model = {
    version: 2, status: "valid", instanceCount: 1, issues: [],
    groups: [
      { id: "g1/x", role: "horizontal", count: 3, cut_length_inches: 300, diameter_inches: 0.5 },
      { id: "g2/x", role: "horizontal", count: 4, cut_length_inches: 100, diameter_inches: 0.5 },
    ],
  };
  const s = calculateFoundationReinforcementCutSchedule({ model, material: materialStockList, inventory: [rebarStockList] });
  assert.equal(s.status, "resolved");
  const g = s.stock.groups[0];
  // FFD order: 300,300,300,100,100,100,100
  // bin1 (480): 300 rem180; bin2 (480): 300 rem180; bin3 (480): 300 rem180
  // 100 → bin1 rem80; 100 → bin2 rem80; 100 → bin3 rem80; 100 → none ≥100 → new 240
  assert.equal(g.bins.length, 4);
  assert.equal(g.bins[3].stock_length_inches, 240);
  assert.ok(close(g.bins[3].offcut_inches, 140));
  const byLen = Object.fromEntries(g.by_length.map(e => [e.stock_length_inches, e]));
  assert.equal(byLen[480].stock_count, 3);
  assert.deepEqual(byLen[480].pieces_per_stock, [2, 2, 2]);
  assert.ok(close(byLen[480].offcut_inches, 240));
  assert.equal(byLen[240].stock_count, 1);
  const t = s.stock.totals;
  assert.equal(t.stock_linear_inches_purchased, 3 * 480 + 240);
  assert.equal(t.total_linear_inches_required, 3 * 300 + 4 * 100);
  assert.ok(close(t.waste_inches, t.stock_linear_inches_purchased - t.total_linear_inches_required));
});

check("mixed bar groups pack per group, never across diameters", () => {
  const model = {
    version: 2, status: "valid", instanceCount: 1, issues: [],
    groups: [
      { id: "a/x", role: "horizontal", count: 2, cut_length_inches: 200, diameter_inches: 0.5 },
      { id: "b/x", role: "horizontal", count: 2, cut_length_inches: 200, diameter_inches: 0.625 },
    ],
  };
  const s = calculateFoundationReinforcementCutSchedule({ model, material: materialStock, inventory: [rebarStock] });
  assert.equal(s.status, "resolved");
  assert.equal(s.stock.groups.length, 2);
  for (const g of s.stock.groups) {
    // 2×200 cannot share one 240 stock → each diameter opens two stock pieces.
    assert.equal(g.totals.stock_count, 2);
    assert.ok(g.bins.every(bin => close(bin.offcut_inches, 40)));
  }
  assert.equal(s.stock.totals.stock_count_total, 4);
  assert.equal(s.stock.totals.total_linear_inches_required, 800);
});

// ══════════════════ Fail-closed stock handling ═════════════════════════════
check("missing stock metadata → unresolved warning, cut lines still emitted", () => {
  const design = spreadDesign(autoSupports);
  const s = scheduleFor(spreadItem(), design, inventory, material); // rebar-4 has no stock fields
  assert.equal(s.status, "unresolved");
  assert.equal(s.stock, null);
  assert.equal(s.cut_lines.length, 2);
  const issue = s.issues.find(i => i.code === "reinforcement_stock_length_unconfigured");
  assert.ok(issue);
  assert.equal(issue.severity, "warning");
});

check("manual basis → unresolved warning (no catalog stock authority)", () => {
  const design = spreadDesign(autoSupports);
  const s = scheduleFor(spreadItem(), design, inventory, { kind: "manual", name: "Site stock", reason: "leftover" });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_stock_length_unconfigured"));
});

check("malformed stock entries ignored; all-malformed → unconfigured", () => {
  const row = { ...rebarRow, id: "rebar-bad", rebar_stock_length_inches: "abc", rebar_stock_lengths_inches: [240, -5, "x"] };
  const s = scheduleFor(spreadItem(), spreadDesign(autoSupports), [row, bagRow, support3], { kind: "catalog", inventory_id: "rebar-bad" });
  assert.equal(s.status, "resolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_stock_length_invalid" && i.severity === "warning"));
  assert.deepEqual(s.stock.lengths_inches, [240]);
  const rowAllBad = { ...rebarRow, id: "rebar-allbad", rebar_stock_length_inches: "abc" };
  const s2 = scheduleFor(spreadItem(), spreadDesign(autoSupports), [rowAllBad, bagRow, support3], { kind: "catalog", inventory_id: "rebar-allbad" });
  assert.equal(s2.status, "unresolved");
  assert.ok(s2.issues.some(i => i.code === "reinforcement_stock_length_unconfigured"));
});

check("cut exceeding longest configured stock → error (fail closed)", () => {
  const s = scheduleFor(spreadItem(), spreadDesign(autoSupports), [rebarStockShort, bagRow, support3], { kind: "catalog", inventory_id: "rebar-4t" });
  assert.equal(s.status, "unresolved");
  const issue = s.issues.find(i => i.code === "reinforcement_cut_exceeds_stock");
  assert.ok(issue);
  assert.equal(issue.severity, "error");
  // joined into the projection as an error → item cannot apply
  const proj = projectionFor(spreadItem(), spreadDesign(autoSupports), [rebarStockShort, bagRow, support3], { kind: "catalog", inventory_id: "rebar-4t" });
  assert.equal(proj.canApplyToEstimate, false);
  assert.ok(proj.issues.some(i => i.code === "reinforcement_cut_exceeds_stock" && i.scope === "cut_schedule"));
  // missing stock only warns — steel still applies
  const proj2 = projectionFor(spreadItem(), spreadDesign(autoSupports), inventory, material);
  assert.equal(proj2.canApplyToEstimate, true);
  assert.ok(proj2.issues.some(i => i.code === "reinforcement_stock_length_unconfigured" && i.scope === "cut_schedule" && i.severity === "warning"));
});

check("piece budget exceeded → warning, packing skipped, lines stand", () => {
  const model = {
    version: 2, status: "valid", instanceCount: 1, issues: [],
    groups: [{ id: "g1/x", role: "horizontal", count: 300, cut_length_inches: 100, diameter_inches: 0.5 }],
  };
  const s = calculateFoundationReinforcementCutSchedule({ model, material: materialStock, inventory: [rebarStock], maxPieces: 10 });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_cut_schedule_budget_exceeded" && i.severity === "warning"));
  assert.equal(s.stock, null);
  assert.equal(s.cut_lines.length, 1);
  assert.equal(s.piece_count_total, 300);
});

check("off / invalid models → not_required / unavailable, never fabricated", () => {
  const off = calculateFoundationReinforcementCutSchedule({ model: { version: 2, status: "off", instanceCount: 3 } });
  assert.equal(off.status, "not_required");
  assert.equal(off.cut_lines.length, 0);
  const bad = calculateFoundationReinforcementCutSchedule({ model: { version: 2, status: "invalid" } });
  assert.equal(bad.status, "unavailable");
  const noModel = calculateFoundationReinforcementCutSchedule({});
  assert.equal(noModel.status, "unavailable");
});

// ══════════════════ Elevation summary (section/exploded view data) ═════════
check("multi-mat elevation summary: index, tier, elevations, layout counts", () => {
  const design = spreadDesign(autoSupports, [matB, matA]); // authored high→low
  const s = scheduleFor(spreadItem(), design, [rebarStock, bagRow, support3], materialStock);
  assert.equal(s.status, "resolved");
  assert.equal(s.elevation_summary.length, 2);
  const [first, second] = s.elevation_summary;
  assert.equal(first.kind, "mat");
  assert.equal(first.index, 0);                    // authored order preserved
  assert.equal(first.mat_id, "mat-b");
  assert.equal(first.tier, 1);                     // bearing 8 = upper tier
  assert.equal(first.bearing_elevation_inches, 8);
  assert.equal(second.mat_id, "mat-a");
  assert.equal(second.tier, 0);
  assert.equal(second.bearing_elevation_inches, 3);
  // bar elevations: x-run at bearing + r, z-run at bearing + 3r (model contract)
  assert.ok(close(second.x_bars.elevation_inches, 3.25));
  assert.ok(close(second.z_bars.elevation_inches, 3.75));
  assert.equal(second.x_bars.count, 5);
  assert.equal(second.x_bars.cut_length_inches, 42);
  assert.equal(second.z_bars.count, 5);
  assert.equal(second.crossings, 25);
});

check("pillar elevation summary: cage extent + per-hoop levels", () => {
  const item = { component_id: "P-1", foundation_type: "pillar", diameter: 24, depth_inches: 96, quantity: 1, selected_concrete_id: "bag-1", include_rebar: true, include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig", reinforcement_calculation_version: 2 };
  const design = {
    version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "engineered cage" },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: {
      hoops: [
        { id: "h1", center_y_inches: 12, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h2", center_y_inches: 50, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
      ],
      longitudinal: { count: 6, radius_inches: 8, bottom_end_inches: 4, top_end_inches: 90 },
    },
  };
  const s = scheduleFor(item, design, [rebarStock, bagRow], materialStock);
  assert.equal(s.status, "resolved");
  const cage = s.elevation_summary.find(e => e.kind === "pillar_cage");
  assert.ok(cage);
  assert.equal(cage.bar_count, 6);
  assert.equal(cage.bottom_elevation_inches, 4);
  assert.equal(cage.top_elevation_inches, 90);
  assert.equal(cage.cut_length_inches, 86);
  const hoops = s.elevation_summary.filter(e => e.kind === "pillar_hoop");
  assert.equal(hoops.length, 2);
  assert.equal(hoops[0].hoop_id, "h1");
  assert.equal(hoops[0].center_y_inches, 12);
  assert.equal(hoops[0].centerline_diameter_inches, 17);
  assert.ok(close(hoops[0].cut_length_inches, Math.PI * 17 + 4));
});

// ══════════════════ v2 wiring: snapshot + BOM + accept path ════════════════
check("calcItem snapshot carries resolved cut_schedule", () => {
  const design = spreadDesign(autoSupports);
  const item = { ...spreadItem(), reinforcement_design: design, reinforcement_material: materialStock };
  const cost = calcFor(item, [rebarStock, bagRow, support3]);
  const cs = cost.reinforcement_cost_snapshot?.cut_schedule;
  assert.ok(cs, "cut_schedule missing on snapshot");
  assert.equal(cs.status, "resolved");
  assert.equal(cs.bar_size, "#4");
  assert.equal(cs.stock.totals.stock_count_total > 0, true);
  // 42-in cuts on 240 stock: 20 pieces → 5 per stock → 4 stock pieces
  assert.equal(cs.cut_lines.reduce((s, l) => s + l.quantity_total, 0), 20);
  assert.equal(cs.stock.totals.stock_count_total, 4);
  assert.ok(close(cs.stock.totals.total_linear_inches_required, 20 * 42));
  assert.ok(close(cs.stock.totals.stock_linear_inches_purchased, 4 * 240));
  assert.ok(close(cs.stock.totals.waste_inches, 960 - 840));
  assert.equal(cs.elevation_summary.length, 1);
});

check("BOM lists rebar stock rows + cut/waste summary; $0 informational", () => {
  const design = spreadDesign(autoSupports);
  const item = pricedV2Item(spreadItem(), design, [rebarStock, bagRow, support3], materialStock);
  const rows = foundationReinforcementBOMRows(item);
  const stock = rows.filter(r => r.stock);
  assert.ok(stock.length >= 2, JSON.stringify(rows.map(r => r.material)));
  assert.ok(stock.some(r => /rebar stock #4 240 in \(x4\)/.test(r.material)), JSON.stringify(stock.map(r => r.material)));
  const summary = stock.find(r => /cut\/waste summary/.test(r.material));
  assert.ok(summary);
  assert.ok(/70 LF required \/ 80 LF stock/.test(summary.quantity), summary.quantity);
  assert.ok(/120 in offcut/.test(summary.note));
  assert.ok(stock.every(r => r.cost === 0), "stock rows must carry $0 informational cost");
});

check("BOM: unresolved stock plan surfaces gap row, never invented counts", () => {
  const design = spreadDesign(autoSupports);
  const item = pricedV2Item(spreadItem(), design, inventory, material); // no stock metadata
  const rows = foundationReinforcementBOMRows(item);
  const stock = rows.filter(r => r.stock);
  assert.equal(stock.length, 1);
  assert.ok(/plan unresolved/.test(stock[0].material));
  assert.equal(stock[0].basisUnavailable, true);
  assert.equal(stock[0].cost, 0);
});

check("BOM: saved item predating cut schedule shows honest 'not recorded'", () => {
  const item = {
    ...spreadItem(), include_rebar: true, rebar_cost: 50, rebar_feet: 35,
    rebar_material_cost: 30, rebar_labor_cost: 20,
    reinforcement_cost_snapshot: { version: 1, calculation_version: 2, engineering_approved: false },
  };
  const rows = foundationReinforcementBOMRows(item, { saved: true });
  assert.ok(rows.some(r => r.stock && /not recorded/.test(r.material)), JSON.stringify(rows.map(r => r.material)));
});

// ══════════════════ Accept path: snapshot.cut_schedule persists ════════════
const makeEnv = ({ savedProject = null } = {}) => {
  const item = {
    component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
    length_inches: 48, width_inches: 48, depth_inches: 18,
    selected_concrete_id: "bag-1", include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
    include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig",
  };
  const project = projectWith([item]);
  const state = {
    project,
    savedProject: savedProject ?? { ...projectWith([{ ...item, rebar_cost: 42.5, item_total_cost: 980.25 }]), updated_date: "2026-11-09T00:00:00.000Z" },
    commits: [], blocked: false,
  };
  const context = {
    loaded: true, ownerId: "owner-1", sourceId: "src-1",
    sourceUpdatedAt: state.savedProject?.updated_date ?? null,
    estimateId: "est-1", estimateUpdatedAt: "2026-11-09T01:00:00.000Z",
    generation: 1, editRevision: 0,
  };
  let seq = 0;
  const envInventory = [rebarStock, bagRow, support3];
  const editor = createFoundationReinforcementEditorSession({
    getCurrent: () => ({ project: state.project, savedProject: state.savedProject, inventory: envInventory, settings, context, blocked: state.blocked }),
    commit: (updater) => {
      const next = updater(clone(state.project));
      state.project = { ...clone(state.project), ...next };
      state.commits.push(next);
      return true;
    },
    createId: () => `proposal-${++seq}`,
    now: () => "2026-11-10T00:00:00.000Z",
    onChange: () => {},
  });
  return { editor, state };
};

check("accept path persists cut_schedule inside reinforcement_cost_snapshot", () => {
  const { editor, state } = makeEnv();
  assert.equal(editor.start("F-1"), true);
  editor.changeDraft("F-1", {
    schema_version: 1,
    design: {
      version: 2, bar_diameter_inches: "0.5",
      cover_inches: { side: "3", top: "3", bottom: "3" },
      supports: { mode: "auto", reason: "", spacing_inches: "24", catalog_id: "", mats: [], placements: [] },
      spread: { mats: [{ id: "mat-a", bearing_elevation_inches: "3", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] },
      pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
    },
    material: { kind: "catalog", inventory_id: "rebar-4s" },
    overrides: { quantity_ft: null, cost_per_ft: null },
  });
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  assert.equal(view.canAccept, true, JSON.stringify(view.issues));
  assert.equal(editor.accept("F-1", view.id), true, editor.read("F-1").error);
  const item = state.project.items[0];
  const cs = item.reinforcement_cost_snapshot?.cut_schedule;
  assert.ok(cs, "cut_schedule not persisted on accept");
  assert.equal(cs.status, "resolved");
  assert.equal(cs.stock.totals.stock_count_total, 4);
  assert.equal(cs.elevation_summary.length, 1);
});

// ══════════════════ v1 / unmarked parity ═══════════════════════════════════
check("parity: v1/unmarked items never gain schedule fields or BOM rows", () => {
  const legacy = {
    component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
    length_inches: 48, width_inches: 48, depth_inches: 18,
    selected_concrete_id: "bag-1", include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
    include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig",
  };
  const cost = calcFor(legacy, [rebarStock, bagRow, support3]);
  assert.equal(cost.reinforcement_cost_snapshot, undefined);
  assert.equal(cost.cut_schedule, undefined);
  assert.ok(Number.isFinite(cost.rebar_feet) && cost.rebar_feet > 0);
  assert.equal(foundationReinforcementBOMRows(legacy), null);
  const v1 = calcFor({ ...legacy, reinforcement_calculation_version: 1 }, [rebarStock, bagRow, support3]);
  assert.equal(v1.reinforcement_cost_snapshot, undefined);
  assert.ok(Number.isFinite(v1.item_total_cost));
});

check("parity: unsupported version holds acknowledged snapshot untouched", () => {
  const item = { ...spreadItem(), reinforcement_calculation_version: 7, rebar_cost: 123.45, item_total_cost: 999.99 };
  const cost = calcFor(item);
  assert.equal(cost.rebar_cost, 123.45);
  assert.equal(cost.item_total_cost, 999.99);
  const project = projectWith([item]);
  const priced = calcProject(clone(project), clone(inventory), clone(settings));
  const out = priced.items.find(i => i.component_id === "F-1");
  assert.equal(out.rebar_cost, 123.45);
});

check("held v2 item keeps acknowledged fields when schedule can't resolve", () => {
  const design = spreadDesign(autoSupports);
  const item = {
    ...spreadItem(), reinforcement_design: design, reinforcement_material: { kind: "catalog", inventory_id: "rebar-4t" },
    rebar_cost: 111.11, item_total_cost: 999.99,
  };
  // short stock provably infeasible → projection errors → held snapshot
  const cost = calcFor(item, [rebarStockShort, bagRow, support3]);
  assert.equal(cost.rebar_cost, 111.11);
  assert.equal(cost.item_total_cost, 999.99);
});

// ══════════════════ Component: FoundationBOM renders stock rows ════════════
const texts = (node, out = []) => {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach(n => texts(n, out)); return out; }
  if (typeof node === "object" && node.props) texts(node.props.children, out);
  return out;
};

check("component: FoundationBOM renders rebar stock + waste rows", () => {
  const design = spreadDesign(autoSupports);
  const item = pricedV2Item(spreadItem(), design, [rebarStock, bagRow, support3], materialStock);
  const tree = FoundationBOM({ items: [item], itemPricing: [{ available: true }], inventory: [rebarStock, bagRow, support3] });
  const text = texts(tree).join(" ");
  assert.ok(/rebar stock #4 240 in/.test(text), `stock row missing: ${text.slice(0, 800)}`);
  assert.ok(/cut\/waste summary/.test(text), "waste summary row missing");
});

await Promise.all(pending);

const failures = results.filter(r => r.ok === false);
console.log(`\n${results.length - failures.length}/${results.length} o029 checks passed`);
if (failures.length) {
  fs.writeFileSync(`${OUT}/verify-o029-failures.json`, JSON.stringify(failures, null, 2));
  process.exit(1);
}
fs.writeFileSync(`${OUT}/verify-o029-results.json`, JSON.stringify(results.map(r => r.name), null, 2));
console.log("PASS o029");
