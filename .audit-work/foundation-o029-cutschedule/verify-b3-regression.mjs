import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
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
fs.writeFileSync(`${stubsDir}/three.js`, `
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setFromUnitVectors() { return this; }
}
class Object3D {
  constructor() { this.children = []; this.userData = {}; this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; this.quaternion = new Vector3(); }
  add(o) { this.children.push(o); return this; }
  traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); }
}
class Group extends Object3D {}
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class Line extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } computeLineDistances() {} }
const geo = class { constructor() {} dispose() {} };
const mat = class { constructor(opts) { Object.assign(this, opts || {}); } dispose() {} };
class BufferGeometry { constructor() { this.points = []; } setFromPoints(p) { this.points = p; return this; } dispose() {} }
export { Vector3, Group, Mesh, Line, BufferGeometry, Object3D };
export const Scene = Group;
export const CylinderGeometry = geo, TorusGeometry = geo, BoxGeometry = geo, SphereGeometry = geo, PlaneGeometry = geo;
export const MeshStandardMaterial = mat, LineDashedMaterial = mat, MeshBasicMaterial = mat;
export const PerspectiveCamera = class extends Object3D { updateProjectionMatrix() {} };
export const WebGLRenderer = class { constructor() { this.domElement = { addEventListener() {}, removeEventListener() {}, style: {}, getRootNode: () => document }; } render() {} setSize() {} dispose() {} setPixelRatio() {} };
export const AmbientLight = Group, DirectionalLight = Group, HemisphereLight = Group;
export const Color = class { constructor(c) { this.c = c; } set() {} };
export const Fog = class {};
export const Raycaster = class {};
export const Vector2 = class {};
export const MathUtils = { degToRad: d => d * Math.PI / 180 };
export const DoubleSide = 2, FrontSide = 0;
`);
fs.writeFileSync(`${stubsDir}/ui.js`, `
const stub = (name) => {
  const fn = (props) => ({ type: "ui", props: { ...(props || {}), uiComponent: name } });
  return fn;
};
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
  "three": `${stubsDir}/three.js`,
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

// Marks unresolvable imports external — used only for the page-level compile check.
// Synchronous filesystem resolution: the async b.resolve round-trip per import
// stalls the esbuild service child for minutes on Windows and the harness reaps
// it mid-build ("service was stopped"). Same semantics, ~100x faster.
const require_ = createRequire(path.resolve("package.json"));
const RES_EXTS = ["", ".js", ".jsx", ".ts", ".tsx", ".json", ".mjs", ".cjs"];
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const tryResolveFs = base => {
  for (const e of RES_EXTS) if (isFile(base + e)) return base + e;
  if (isDir(base)) {
    for (const e of RES_EXTS.slice(1)) { const f = tryResolveFs(path.join(base, "index" + e)); if (f) return f; }
  }
  return null;
};
const missingExternal = {
  name: "missing-external",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      let spec = args.path;
      for (const [k, v] of Object.entries(alias)) {
        if (spec === k) { spec = v; break; }
        if (spec.startsWith(k + "/")) { spec = v + spec.slice(k.length); break; }
      }
      if (spec.startsWith(".") || path.isAbsolute(spec)) {
        const f = tryResolveFs(path.isAbsolute(spec) ? spec : path.resolve(args.resolveDir, spec));
        return f ? { path: f } : { path: args.path, external: true };
      }
      try { return { path: require_.resolve(spec, { paths: [args.resolveDir, process.cwd()] }) }; }
      catch { return { path: spec, external: true }; }
    });
  },
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
const itemProj = await bundle("components/estimator/foundation/foundationReinforcementItemProjection.js", "itemproj");
const modelMod = await bundle("components/estimator/foundation/foundationReinforcementModel.js", "model");
const supportMod = await bundle("components/estimator/foundation/foundationReinforcementSupport.js", "support");
const calcMod = await bundle("components/estimator/foundation/foundationCalc.js", "calc");
const draftMod = await bundle("components/estimator/foundation/foundationReinforcementDraft.js", "draft");
const sessionMod = await bundle("components/estimator/foundation/foundationReinforcementEditorSession.js", "session");
const bomRowsMod = await bundle("components/estimator/foundation/foundationReinforcementBOMRows.js", "bomrows");
const descriptorsMod = await bundle("components/estimator/foundation/foundationReinforcementPartDescriptors.js", "descriptors");
const previewMod = await bundle("components/estimator/foundation/foundationReinforcementPreview3D.js", "preview");
const threeMod = await bundle("components/estimator/foundation/foundationReinforcementThreePreview.js", "threepreview");
const woPartMod = await bundle("components/estimator/foundation/foundationReinforcementWorkOrderPart.js", "wopart");
const frozenMod = await bundle("components/estimator/foundation/foundationReinforcementFrozenPricing.js", "frozen");
const partSyncMod = await bundle("components/estimator/builder/partSync.js", "partsync");
const geometryMod = await bundle("components/estimator/foundation/ReinforcementDraftGeometry.jsx", "geometryjsx", true);
const panelMod = await bundle("components/estimator/foundation/FoundationReinforcementProposalPanel.jsx", "paneljsx", true);
const itemCardMod = await bundle("components/estimator/foundation/FoundationItemCard.jsx", "itemcardjsx", true);
const bomMod = await bundle("components/estimator/foundation/FoundationBOM.jsx", "bomjsx", true);
const preview3dMod = await bundle("components/estimator/foundation/Foundation3DPreview.jsx", "preview3djsx", true);
check("bundle: all modules+components compiled", () => {
  for (const [n, m] of Object.entries({ itemProj, modelMod, supportMod, calcMod, draftMod, sessionMod, bomRowsMod, descriptorsMod, previewMod, threeMod, woPartMod, frozenMod, partSyncMod, geometryMod, panelMod, itemCardMod, bomMod, preview3dMod })) {
    assert.ok(m, `${n} missing`);
  }
});

const { calculateFoundationReinforcementModel } = modelMod;
const { resolveFoundationReinforcementSupports } = supportMod;
const { calculateFoundationReinforcementItemProjection } = itemProj;
const { calcItem, calcProject } = calcMod;
const { createFoundationReinforcementDraft, prepareFoundationReinforcementDraft } = draftMod;
const { createFoundationReinforcementEditorSession } = sessionMod;
const { foundationReinforcementBOMRows } = bomRowsMod;
const { foundationReinforcementPartDescriptors } = descriptorsMod;
const { buildFoundationReinforcementPreview3D } = previewMod;
const { createFoundationReinforcement3DGroup, FOUNDATION_REINFORCEMENT_3D_ROLES } = threeMod;
const { projectFoundationReinforcementWorkOrderPart, readFoundationReinforcementWorkOrderPart } = woPartMod;
const { captureFoundationReinforcementFrozenPricing, foundationReinforcementPricingPresentation } = frozenMod;
const { extractBuilderParts } = partSyncMod;
const ReinforcementDraftGeometry = geometryMod.default;
const FoundationItemCard = itemCardMod.default;
const FoundationBOM = bomMod.default;

// ── Fixtures ───────────────────────────────────────────────────────────────
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
const bagRow = { id: "bag-1", material_type: "bagged_concrete", material_name: "80lb bag", cost_per_unit: 6.5, unit: "bag" };
const support3 = {
  id: "sup-3", material_type: "rebar_support", material_name: '3" slab chair',
  rebar_support_kind: "chair", foundation_usage: "spread_foot",
  rebar_support_height_inches: 3,
  rebar_support_footprint_length_inches: 4, rebar_support_footprint_width_inches: 4,
  rebar_support_pack_size: 8, rebar_support_compatible_bar_sizes: ["#4", "#5"],
  cost_per_unit: 1.25, sort_order: 1, rebar_support_placement_notes: "Space per layout",
};
const support4 = { ...support3, id: "sup-4", material_name: '4" slab chair', rebar_support_height_inches: 4, sort_order: 2 };
const supportCheap = { ...support3, id: "sup-3-cheap", material_name: '3" economy chair', cost_per_unit: 0.9, sort_order: 0 };
const supportRange = { ...support3, id: "sup-range", material_name: "adjustable bolster", rebar_support_height_inches: null, rebar_support_height_min_inches: 2.5, rebar_support_height_max_inches: 3.5 };
const supportPillar = { ...support3, id: "sup-pillar", material_name: '4" cage stand', foundation_usage: "pillar", rebar_support_height_inches: 4, rebar_support_footprint_length_inches: 3, rebar_support_footprint_width_inches: 3, rebar_support_pack_size: 6, cost_per_unit: 2 };
const supportNoPrice = { ...support3, id: "sup-noprice", material_name: '3" unpriced chair', cost_per_unit: null };
const supportBadPack = { ...support3, id: "sup-badpack", material_name: '3" badpack chair', rebar_support_pack_size: 2.5 };
const supportNoBars = { ...support3, id: "sup-nobars", material_name: '3" unknown-bars chair', rebar_support_compatible_bar_sizes: undefined };
const supportNoFoot = { ...support3, id: "sup-nofoot", material_name: '3" unknown-foot chair', rebar_support_footprint_length_inches: null, rebar_support_footprint_width_inches: null };
const supportWrongUsage = { ...support3, id: "sup-wronguse", material_name: "pillar-only stand", foundation_usage: "pillar" };
const supportTall = { ...support3, id: "sup-tall", material_name: '10" tower', rebar_support_height_inches: 10 };
const supportEmptyBars = { ...support3, id: "sup-emptybars", material_name: '3" empty-list chair', rebar_support_compatible_bar_sizes: [] };
const inventory = [rebarRow, bagRow, support3, support4, supportCheap, supportRange, supportPillar];

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
const material = { kind: "catalog", inventory_id: "rebar-4" };
const projectWith = (items, extra = {}) => ({
  id: "src-1", items, signage_cabinets: [], landscape: null,
  walls: [], wall_caps: [], poles: [], selected_equipment: [], project_concrete_admixtures: [],
  excavation_method: "hand_dig", ...extra,
});
const catalogs = { FoundationInventory: { rows: inventory, byId: new Map(inventory.map(r => [r.id, r])) } };

const modelFor = (item, design, options) => calculateFoundationReinforcementModel(item, design, options);
const projectionFor = (item, design, inv = inventory) =>
  calculateFoundationReinforcementItemProjection({ item, design, material, inventory: inv, settings });
const calcFor = (item, inv = inventory) => calcItem(item, projectWith([item]), inv, settings);
const pricedV2Item = (item, design, inv = inventory) => {
  const cost = calcFor({ ...item, reinforcement_design: design, reinforcement_material: material }, inv);
  return { ...item, reinforcement_design: design, reinforcement_material: material, ...cost };
};

// ══════════════════════ O-022: support modes ═══════════════════════════════
check("O-022 auto: modeled supports with positions and count", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  assert.equal(m.status, "valid");
  assert.equal(m.supports.status, "modeled");
  assert.equal(m.supports.mode, "auto");
  // edge=3.25, span=41.5 → ceil(41.5/24)+1=3 stations/axis → 9 placements.
  assert.equal(m.supports.count, 9);
  assert.equal(m.supports.placements.length, 9);
  assert.equal(m.supports.requirements.length, 1);
  assert.equal(m.supports.uncovered.length, 0);
});

check("O-022 manual count: exact positions, never inflated", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "manual", mats: [{ mat_id: "mat-a", count: 5 }] }));
  assert.equal(m.status, "valid");
  assert.equal(m.supports.count, 5);
  assert.equal(m.supports.placements.length, 5);
  assert.equal(m.supports.requirements[0].count, 5);
  assert.equal(m.supports.requirements[0].positions.length, 5);
});

check("O-022 manual placements: exact authored positions", () => {
  const m = modelFor(spreadItem(), spreadDesign({
    mode: "manual",
    placements: [
      { mat_id: "mat-a", x_inches: 6, z_inches: 6 },
      { mat_id: "mat-a", x_inches: 24, z_inches: 24 },
      { mat_id: "mat-a", x_inches: 42, z_inches: 42 },
    ],
  }));
  assert.equal(m.supports.count, 3);
  assert.deepEqual(m.supports.placements.map(p => [p.x, p.z]), [[6, 6], [24, 24], [42, 42]]);
});

check("O-022 manual partial coverage reports uncovered mats, not silent zeros", () => {
  const m = modelFor(spreadItem(), spreadDesign(
    { mode: "manual", mats: [{ mat_id: "mat-a", count: 4 }] }, [matA, matB]));
  assert.equal(m.status, "valid");
  assert.equal(m.supports.count, 4);
  assert.equal(m.supports.uncovered.length, 1);
  assert.equal(m.supports.uncovered[0].target_id, "mat-b");
  assert.ok(issueCodes(m).includes("reinforcement_support_mat_unsupported"));
});

check("O-022 off+reason is explained and build-eligible", () => {
  const design = spreadDesign({ mode: "off", reason: "Site-supplied chairs per spec" });
  const m = modelFor(spreadItem(), design);
  assert.equal(m.status, "valid");
  assert.equal(m.supports.status, "off_explained");
  assert.equal(m.supports.count, 0);
  assert.ok(issueCodes(m).includes("reinforcement_supports_off_explained"));
  const proj = projectionFor(spreadItem(), design);
  assert.equal(proj.reinforcement.supports.status, "off_explained");
  assert.equal(proj.itemCost.support_cost, 0);
  assert.equal(proj.canApplyToEstimate, true);
});

check("O-022 off without reason is RED: incomplete, no silent off", () => {
  const design = spreadDesign({ mode: "off", reason: "   " });
  const m = modelFor(spreadItem(), design);
  assert.equal(m.status, "incomplete");
  const issue = m.issues.find(i => i.field === "supports.reason");
  assert.ok(issue, "missing supports.reason issue");
  assert.equal(issue.code, "reinforcement_input_required");
  const proj = projectionFor(spreadItem(), design);
  assert.equal(proj.priceAvailable, false);
  assert.equal(proj.canApplyToEstimate, false);
});

check("O-022 invalid mode errors instead of guessing", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "guesswork" }));
  assert.equal(m.status, "invalid");
  assert.ok(issueCodes(m).includes("reinforcement_support_mode_invalid"));
});

check("O-022 unconfigured warns and blocks pricing application", () => {
  const design = spreadDesign({ mode: "unconfigured" });
  const m = modelFor(spreadItem(), design);
  assert.equal(m.status, "valid");
  assert.equal(m.supports.status, "unconfigured");
  const proj = projectionFor(spreadItem(), design);
  // Steel still priced but the model cannot replace saved estimate amounts.
  assert.equal(proj.canApplyToEstimate, false);
});

check("O-022 pillar auto mode is explicitly unavailable", () => {
  const item = { ...spreadItem(), foundation_type: "pillar", diameter: 24, depth_inches: 96, length_inches: undefined, width_inches: undefined, quantity: 1 };
  delete item.length_inches; delete item.width_inches;
  const design = {
    version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "auto", spacing_inches: 24 },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: {
      hoops: [
        { id: "h1", center_y_inches: 12, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h2", center_y_inches: 48, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h3", center_y_inches: 84, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
      ],
      longitudinal: { count: 6, radius_inches: 8, bottom_end_inches: 4, top_end_inches: 90 },
    },
  };
  const m = modelFor(item, design);
  assert.equal(m.status, "invalid");
  assert.ok(issueCodes(m).includes("reinforcement_support_mode_unavailable"));
});

// ══════════════════════ O-023: geometry/bases ══════════════════════════════
check("O-023 lowest mat rests on concrete bottom (base elev 0)", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const req = m.supports.requirements[0];
  assert.equal(req.base, "concrete_bottom");
  assert.equal(req.base_elevation_inches, 0);
  assert.equal(req.required_height_inches, 3); // bearing 3 − base 0
  for (const p of m.supports.placements) {
    assert.equal(p.base, "concrete_bottom");
    assert.equal(p.base_elevation_inches, 0);
    assert.equal(p.required_height_inches, 3);
  }
});

check("O-023 upper mat rests on lower mat steel envelope (base+2Ø)", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }, [matA, matB]));
  const reqA = m.supports.requirements.find(r => r.target_id === "mat-a");
  const reqB = m.supports.requirements.find(r => r.target_id === "mat-b");
  assert.equal(reqB.base, "mat_below");
  assert.equal(reqB.base_elevation_inches, 4); // 3 + 2*0.5
  assert.equal(reqB.required_height_inches, 4); // 8 − 4
  assert.equal(reqA.base, "concrete_bottom");
  assert.equal(m.supports.count, 18);
});

check("O-023 pillar cage target bottoms on concrete", () => {
  const item = { component_id: "P-1", foundation_type: "pillar", diameter: 24, depth_inches: 96, quantity: 1, selected_concrete_id: "bag-1", include_rebar: true, include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig", reinforcement_calculation_version: 2 };
  const design = {
    version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "manual", placements: [{ x_inches: 12, z_inches: 12 }] },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: {
      hoops: [
        { id: "h1", center_y_inches: 12, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h2", center_y_inches: 50, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
        { id: "h3", center_y_inches: 88, centerline_diameter_inches: 17, cut_allowance_inches: 4 },
      ],
      longitudinal: { count: 6, radius_inches: 8, bottom_end_inches: 4, top_end_inches: 90 },
    },
  };
  const m = modelFor(item, design);
  assert.equal(m.status, "valid", JSON.stringify(m.issues));
  assert.equal(m.supports.requirements.length, 1);
  const req = m.supports.requirements[0];
  assert.equal(req.target_id, "cage");
  assert.equal(req.base, "concrete_bottom");
  assert.equal(req.base_elevation_inches, 0);
  assert.equal(req.required_height_inches, 4);
  assert.equal(m.supports.count, 1);
});

check("O-023 out-of-bounds spread placement is RED", () => {
  const m = modelFor(spreadItem(), spreadDesign({
    mode: "manual", placements: [{ mat_id: "mat-a", x_inches: 46, z_inches: 24 }],
  }));
  assert.equal(m.status, "invalid");
  assert.ok(issueCodes(m).includes("reinforcement_support_placement_out_of_bounds"));
});

check("O-023 mat bearing below cover rejects before supports modeled", () => {
  const m = modelFor(spreadItem(), spreadDesign(
    { mode: "auto", spacing_inches: 24 },
    [{ id: "mat-a", bearing_elevation_inches: 1, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }]));
  assert.equal(m.status, "invalid");
  assert.ok(issueCodes(m).includes("reinforcement_clearance_invalid"));
});

check("O-023 mat resting directly on base warns 'unneeded', supports on it error", () => {
  const design = spreadDesign(
    { mode: "auto", spacing_inches: 24 },
    [{ id: "mat-a", bearing_elevation_inches: 0, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }]);
  design.cover_inches.bottom = 0;
  const m = modelFor(spreadItem(), design);
  assert.equal(m.status, "valid");
  assert.ok(issueCodes(m).includes("reinforcement_support_unneeded"));
  const m2 = modelFor(spreadItem(), spreadDesign(
    { mode: "manual", mats: [{ mat_id: "mat-a", count: 2 }] },
    [{ id: "mat-a", bearing_elevation_inches: 0, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }]));
  m2; // bearing bound min is cover.bottom=3 here → invalid instead
  assert.equal(m2.status, "invalid");
  const d3 = spreadDesign(
    { mode: "manual", mats: [{ mat_id: "mat-a", count: 2 }] },
    [{ id: "mat-a", bearing_elevation_inches: 0, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }]);
  d3.cover_inches.bottom = 0;
  const m3 = modelFor(spreadItem(), d3);
  assert.equal(m3.status, "invalid");
  assert.ok(issueCodes(m3).includes("reinforcement_support_height_infeasible"));
});

check("O-023 ambiguous manual coverage (count + placement) is RED", () => {
  const m = modelFor(spreadItem(), spreadDesign({
    mode: "manual",
    mats: [{ mat_id: "mat-a", count: 3 }],
    placements: [{ mat_id: "mat-a", x_inches: 10, z_inches: 10 }],
  }));
  assert.equal(m.status, "invalid");
  assert.ok(issueCodes(m).includes("reinforcement_support_manual_ambiguous"));
});

// ══════════════════════ O-024: height → catalog pick ═══════════════════════
check("O-024 nominal-height row picked for exact requirement", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "resolved");
  assert.equal(s.selections.length, 1);
  assert.equal(s.selections[0].inventory_id, "sup-3");
  assert.equal(s.selections[0].required_height_inches, 3);
  assert.equal(s.selections[0].support_height_inches, 3);
  assert.equal(s.selections[0].compatibility, "verified");
});

check("O-024 ranged-height row fits requirement inside min..max", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportRange], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "resolved");
  assert.equal(s.selections[0].inventory_id, "sup-range");
});

check("O-024 deterministic pick: cheapest proven row wins", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3, supportCheap], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.selections[0].inventory_id, "sup-3-cheap");
});

check("O-024 no compatible catalog row → structured error, never a guess", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportTall], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_no_compatible"));
});

check("O-024 empty bar-size list means unknown, not universal", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportEmptyBars], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_no_compatible"));
});

check("O-024 wrong foundation_usage is provably incompatible", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportWrongUsage], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
});

check("O-024 oversized footprint cannot verify → unresolved", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, { ...support3, id: "sup-big", rebar_support_footprint_length_inches: 20 }], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
});

check("O-024 pinned catalog applies to every requirement; incompatible pin errors", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24, catalog_id: "sup-4" }, [matA, matB]);
  const m = modelFor(spreadItem(), design);
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design, model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3, support4], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_pinned_incompatible"));
  // valid pin for both heights:
  const design2 = spreadDesign({ mode: "auto", spacing_inches: 24, catalog_id: "sup-3" });
  const m2 = modelFor(spreadItem(), design2);
  const s2 = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: design2, model: m2, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3, supportCheap], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s2.status, "resolved");
  assert.equal(s2.selections[0].inventory_id, "sup-3"); // pin beats the cheaper row
  assert.equal(s2.pin.inventory_id, "sup-3");
});

check("O-024 pin unavailable/ambiguous/malformed ids are RED", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const bad = (catalog_id, inv) => resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24, catalog_id }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" }, inventory: inv,
    basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(bad("sup-missing", [support3]).issues[0].code, "reinforcement_support_catalog_unavailable");
  assert.equal(bad("sup-dup", [{ ...support3, id: "sup-dup" }, { ...support3, id: "sup-dup" }]).issues[0].code, "reinforcement_support_catalog_ambiguous");
  assert.equal(bad("  padded  ", [support3]).issues[0].code, "reinforcement_support_catalog_id_invalid");
});

check("O-024 unverifiable-but-not-incompatible pin stands with warning", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24, catalog_id: "sup-nobars" });
  const m = modelFor(spreadItem(), design);
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design, model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportNoBars], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "resolved");
  assert.equal(s.selections[0].compatibility, "authored_unverified");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_compatibility_unverified" && i.severity === "warning"));
});

check("O-024 manual rebar cannot prove bar size → auto unresolved, pin allowed", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const m = modelFor(spreadItem(), design);
  const manualMaterial = { kind: "manual", name: "Site stock", reason: "Leftover bundled steel" };
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design, model: m, material: { kind: "manual", inventory_id: null },
    inventory: [rebarRow, support3], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_no_compatible"));
});

// ══════════════════════ O-025: counts ══════════════════════════════════════
check("O-025 auto count is exact grid product of span/spacing", () => {
  // span 41.5, spacing 24 → 3×3 = 9; spacing 12 → 5×5 = 25.
  const a = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const b = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 12 }));
  assert.equal(a.supports.count, 9);
  assert.equal(b.supports.count, 25);
  const c = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 50 }));
  assert.equal(c.supports.count, 4); // ceil(41.5/50)+1 = 2 → 4
});

check("O-025 count equals emitted positions — never silently inflated", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }, [matA, matB]));
  assert.equal(m.supports.count, 18);
  assert.equal(m.supports.placements.length, m.supports.count);
  assert.equal(m.supports.requirements.reduce((s, r) => s + r.count, 0), m.supports.count);
  const manual = modelFor(spreadItem(), spreadDesign({ mode: "manual", mats: [{ mat_id: "mat-a", count: 7 }] }));
  assert.equal(manual.supports.count, 7);
  assert.equal(manual.supports.placements.length, 7);
});

check("O-025 auto grid spacing never exceeds authored spacing", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const xs = [...new Set(m.supports.placements.map(p => p.x))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] - xs[i - 1] <= 24 + 1e-9, `gap ${xs[i] - xs[i - 1]}`);
});

check("O-025 missing/malformed spacing is RED not assumed", () => {
  const m1 = modelFor(spreadItem(), spreadDesign({ mode: "auto" }));
  assert.equal(m1.status, "incomplete");
  assert.ok(m1.issues.some(i => i.field === "supports.spacing_inches"));
  const m2 = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: "abc" }));
  assert.equal(m2.status, "invalid");
});

// ══════════════════════ O-026/O-027: economics ═════════════════════════════
check("O-027 unit cost + pack rounding: 18 required → 24 purchased (packs of 8)", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  const sel = s.selections[0];
  assert.equal(sel.units_required, 18); // 9 per instance × 2
  assert.equal(sel.packs, 3);
  assert.equal(sel.units_purchased, 24);
  assert.equal(sel.unit_cost, 1.25);
  assert.equal(sel.material_cost, 30);          // 24 × 1.25
  assert.equal(sel.labor_hours, 0.9);           // 18 × 0.05
  assert.equal(sel.labor_cost, 54);             // 0.9 × 60
  assert.equal(sel.cost, 84);
  assert.equal(s.amounts.support_cost, 84);
  assert.equal(s.amounts.support_count, 18);
});

check("O-027 missing unit price stays unresolved, never zero", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportNoPrice], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.status, "unresolved");
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_cost_unknown"));
  assert.equal(s.selections[0].material_cost, null);
});

check("O-027 malformed pack size warns and prices individually", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, supportBadPack], basis: { labor_rate_per_hour: 60, labor_hours_per_support: 0.05 },
  });
  assert.equal(s.selections[0].packs, 18);
  assert.equal(s.selections[0].units_purchased, 18);
  assert.ok(s.issues.some(i => i.code === "reinforcement_support_pack_invalid" && i.severity === "warning"));
});

check("O-027 missing install-labor basis stays unresolved", () => {
  const m = modelFor(spreadItem(), spreadDesign({ mode: "auto", spacing_inches: 24 }));
  const s = resolveFoundationReinforcementSupports({
    item: spreadItem(), design: spreadDesign({ mode: "auto", spacing_inches: 24 }),
    model: m, material: { kind: "catalog", inventory_id: "rebar-4" },
    inventory: [rebarRow, support3], basis: {},
  });
  assert.equal(s.status, "unresolved");
  assert.equal(s.selections[0].labor_cost, null);
});

check("O-026 item projection rolls support cost into item total", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const proj = projectionFor(spreadItem(), design);
  assert.equal(proj.priceAvailable, true, JSON.stringify(proj.issues));
  const ic = proj.itemCost;
  assert.equal(ic.support_count, 18);
  assert.equal(ic.support_purchased_units, 24);
  assert.equal(ic.support_packs, 3);
  assert.ok(close(ic.support_material_cost, 21.6)); // cheapest proven pick: 24 × 0.90
  assert.ok(close(ic.support_labor_cost, 54));
  assert.ok(close(ic.support_cost, 75.6));
  assert.ok(close(ic.item_total_cost, ic.concrete_cost + ic.rebar_cost + ic.support_cost + ic.excavation_cost + ic.pouring_cost + ic.forming_cost + ic.finishing_cost));
});

check("O-026 unresolved support economics block item pricing application", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const proj = projectionFor(spreadItem(), design, [rebarRow, bagRow, supportTall]);
  assert.equal(proj.priceAvailable, false);
  assert.ok(proj.issues.some(i => i.code === "reinforcement_support_no_compatible"));
  assert.equal(proj.canApplyToEstimate, false);
});

check("O-026 calcItem emits support fields + snapshot.supports", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = { ...spreadItem(), reinforcement_design: design, reinforcement_material: material };
  const cost = calcFor(item, [rebarRow, bagRow, support3]);
  assert.equal(cost.support_count, 18);
  assert.equal(cost.support_purchased_units, 24);
  assert.equal(cost.support_packs, 3);
  assert.ok(close(cost.support_material_cost, 30));
  assert.ok(close(cost.support_labor_cost, 54));
  assert.ok(close(cost.support_cost, 84));
  assert.equal(cost.reinforcement_cost_snapshot.supports.status, "resolved");
  assert.equal(cost.reinforcement_cost_snapshot.supports.selections[0].inventory_id, "sup-3");
  assert.equal(cost.reinforcement_cost_snapshot.supports.selections[0].base, "concrete_bottom");
});

check("O-026 held item keeps acknowledged fields when supports unresolvable", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = { ...spreadItem(), reinforcement_design: design, reinforcement_material: material, rebar_cost: 111.11, support_cost: 22.22 };
  const cost = calcFor(item, [rebarRow, bagRow]); // no support rows at all
  assert.equal(cost.rebar_cost, 111.11);
  assert.equal(cost.support_cost, 22.22);
});

// ══════════════════════ O-028: BOM/3D/handoff ══════════════════════════════
check("O-028 BOM rows list per-pick support material + install labor", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const rows = foundationReinforcementBOMRows(item);
  const supportMaterial = rows.find(r => r.support && r.cost === 30);
  const supportLabor = rows.find(r => r.support && /install labor/.test(r.material));
  assert.ok(supportMaterial, JSON.stringify(rows.map(r => r.material)));
  assert.ok(/x24 purchased/.test(supportMaterial.material));
  assert.equal(supportLabor.cost, 54);
  assert.ok(rows.every(r => r.engineeringApproved !== true));
});

check("O-028 saved item predating support model surfaces the gap honestly", () => {
  const item = {
    ...spreadItem(), include_rebar: true, rebar_cost: 50, rebar_feet: 35,
    rebar_material_cost: 30, rebar_labor_cost: 20,
    reinforcement_cost_snapshot: { version: 1, calculation_version: 2, engineering_approved: false },
  };
  const rows = foundationReinforcementBOMRows(item, { saved: true });
  assert.ok(rows.some(r => /not recorded/.test(r.material)), "expected 'supports not recorded' row");
});

check("O-028 part descriptors emit support material + labor parts", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const parts = foundationReinforcementPartDescriptors({ item, itemIndex: 0 });
  const kinds = parts.map(p => p.part_subtype);
  assert.deepEqual(kinds, ["rebar", "rebar_labor", "rebar_support", "rebar_support_labor"]);
  const sup = parts.find(p => p.part_subtype === "rebar_support");
  assert.equal(sup.quantity, 24);
  assert.equal(sup.unit, "ea");
  assert.equal(sup.unit_cost, 1.25);
  assert.equal(sup.extended_cost, 30);
  assert.equal(sup.inventory_item_id, "sup-3");
  const labor = parts.find(p => p.part_subtype === "rebar_support_labor");
  assert.equal(labor.unit, "hr");
  assert.ok(close(labor.quantity, 0.9));
  assert.ok(close(labor.extended_cost, 54));
  assert.equal(sup.pricing_basis_snapshot.reinforcement.supports.amounts.support_cost, 84);
});

check("O-028 descriptors fail closed when item has support fields but no snapshot", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const broken = clone(item);
  delete broken.reinforcement_cost_snapshot.supports;
  assert.throws(() => foundationReinforcementPartDescriptors({ item: broken, itemIndex: 0 }),
    /supports must be a resolved support resolution|reinforcement_cost_snapshot/);
});

check("O-028 descriptors fail on manipulated selection math", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const broken = clone(item);
  broken.reinforcement_cost_snapshot.supports.selections[0].units_purchased = 999;
  assert.throws(() => foundationReinforcementPartDescriptors({ item: broken, itemIndex: 0 }),
    /FOUNDATION_REINFORCEMENT|pack|material_cost|reconcile/);
});

check("O-028 preview3D emits support markers on the same concrete frame", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = { ...spreadItem({ quantity: 1 }), reinforcement_design: design };
  const project = projectWith([item]);
  const preview = buildFoundationReinforcementPreview3D(project);
  assert.equal(preview.instances.length, 1);
  const inst = preview.instances[0];
  assert.equal(inst.supports.length, 9);
  const marker = inst.supports[0];
  assert.equal(marker.role, "support");
  assert.equal(marker.base, "concrete_bottom");
  assert.equal(marker.requiredHeightInches, 3);
  // feet at concrete bottom plane (local y = -depth/2) rising to bearing
  assert.ok(close(marker.from[1], -9 / 12));
  assert.ok(close(marker.to[1], -6 / 12));
  assert.ok(close(marker.lengthFeet, 0.25));
});

check("O-028 preview budget never changes support counts", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = { ...spreadItem({ quantity: 1 }), reinforcement_design: design };
  const m = modelFor(item, design, {});
  assert.equal(m.supports.count, 9);
  const m2 = modelFor(item, design, { geometryLimit: 4 });
  assert.equal(m2.supports.count, 9, "geometry budget clipped supports");
  assert.equal(m2.geometry.length <= 4, true);
});

check("O-028 three.js group accepts support role markers", () => {
  assert.ok(FOUNDATION_REINFORCEMENT_3D_ROLES.some(r => r.role === "support"));
  const group = createFoundationReinforcement3DGroup([
    { id: "support:mat-a:0", role: "support", kind: "segment", radiusFeet: 0.02, from: [0, -0.75, 0], to: [0, -0.5, 0], lengthFeet: 0.25 },
  ]);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].userData.role, "support");
  assert.equal(group.userData.engineeringApproved, false);
});

check("O-028 extractBuilderParts hands support parts to Builder", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const project = projectWith([item]);
  const parts = extractBuilderParts("foundation", project, catalogs);
  const supportParts = parts.filter(p => p.part_subtype === "rebar_support" || p.part_subtype === "rebar_support_labor");
  assert.equal(supportParts.length, 2);
  assert.equal(supportParts[0].quantity, 24);
  assert.equal(supportParts[0].inventory_item_id, "sup-3");
});

check("O-028 unsupported version throws in extractFoundation", () => {
  const item = { ...spreadItem(), reinforcement_calculation_version: 7 };
  const project = projectWith([item]);
  assert.throws(() => extractBuilderParts("foundation", project, catalogs),
    /version is unsupported|FOUNDATION_REINFORCEMENT_VERSION_UNSUPPORTED/);
});

const linkedPart = (descriptor, { frozenRecorded = false } = {}) => ({
  // The shape partSync persists on a linked Builder Part: descriptor fields plus
  // synced current/frozen columns.
  ...descriptor,
  builder_sync_state: "linked",
  current_unit_cost: descriptor.unit_cost,
  current_extended_cost: descriptor.extended_cost,
  frozen_unit_cost: frozenRecorded ? descriptor.unit_cost : undefined,
  frozen_extended_cost: descriptor.extended_cost,
});

check("O-028 work-order part projection preserves support provenance", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const parts = foundationReinforcementPartDescriptors({ item, itemIndex: 0 });
  const sup = parts.find(p => p.part_subtype === "rebar_support");
  const part = linkedPart(sup);
  const projected = projectFoundationReinforcementWorkOrderPart(part);
  assert.ok(projected, "projection refused the linked support part");
  const handoff = projected.foundation_reinforcement_handoff;
  assert.equal(handoff.engineering_approved, false);
  assert.equal(handoff.procurement_ready, false);
  assert.deepEqual(handoff.purchasing, { state: "unplanned" });
  const read = readFoundationReinforcementWorkOrderPart({
    ...projected, part_type: "material", part_name: sup.part_name, part_subtype: sup.part_subtype, part_key: sup.part_key,
  });
  assert.ok(read && read.part_subtype === "rebar_support");
});

check("O-028 frozen pricing captures support rows without inventing rates", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const parts = foundationReinforcementPartDescriptors({ item, itemIndex: 0 });
  const sup = parts.find(p => p.part_subtype === "rebar_support");
  const part = linkedPart(sup);
  const frozen = captureFoundationReinforcementFrozenPricing(part);
  assert.equal(frozen.state, "recorded");
  assert.equal(frozen.support_selection_index, 0);
  assert.equal(frozen.quantity, 24);
  assert.equal(frozen.unit, "ea");
  const presentation = foundationReinforcementPricingPresentation({ ...part, frozen_inventory_snapshot: { id: "sup-3" } });
  assert.ok(presentation && presentation.current, "no presentation for a linked support part");
});

// ══════════════════════ Draft/session wiring ═══════════════════════════════
check("draft: supports fields seeded and prepared with numeric parsing", () => {
  const d = createFoundationReinforcementDraft(spreadItem());
  assert.equal(d.design.supports.mode, "unconfigured");
  const d2 = createFoundationReinforcementDraft();
  assert.equal(d2.design.supports.mode, "unconfigured");
  const raw = {
    schema_version: 1,
    design: {
      version: 2, bar_diameter_inches: "0.5",
      cover_inches: { side: "3", top: "3", bottom: "3" },
      supports: { mode: "auto", reason: "", spacing_inches: "24", catalog_id: "sup-3", mats: [{ mat_id: "mat-a", count: "5" }], placements: [{ mat_id: "mat-a", x_inches: "10", z_inches: "10" }] },
      spread: { mats: [{ id: "mat-a", bearing_elevation_inches: "3", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] },
      pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
    },
    material: { kind: "catalog", inventory_id: "rebar-4" },
    overrides: { quantity_ft: null, cost_per_ft: null },
  };
  const { prepared, issues } = prepareFoundationReinforcementDraft(raw);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  assert.equal(prepared.design.supports.spacing_inches, 24);
  assert.equal(prepared.design.supports.mats[0].count, 5);
  assert.equal(prepared.design.supports.placements[0].x_inches, 10);
});

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
  const editor = createFoundationReinforcementEditorSession({
    getCurrent: () => ({ project: state.project, savedProject: state.savedProject, inventory, settings, context, blocked: state.blocked }),
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

const autoDraft = () => ({
  schema_version: 1,
  design: {
    version: 2, bar_diameter_inches: "0.5",
    cover_inches: { side: "3", top: "3", bottom: "3" },
    supports: { mode: "auto", reason: "", spacing_inches: "24", catalog_id: "", mats: [], placements: [] },
    spread: { mats: [{ id: "mat-a", bearing_elevation_inches: "3", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
  },
  material: { kind: "catalog", inventory_id: "rebar-4" },
  overrides: { quantity_ft: null, cost_per_ft: null },
});

check("editor: full lifecycle with auto supports commits support fields", () => {
  const { editor, state } = makeEnv();
  assert.equal(editor.start("F-1"), true);
  assert.equal(editor.changeDraft("F-1", autoDraft()), true);
  assert.equal(editor.preview("F-1"), true);
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  assert.equal(editor.preview("F-1"), true);
  const view = editor.read("F-1").preview;
  assert.equal(view.canAccept, true, JSON.stringify(view.issues));
  const supportsAfter = view.quantities.find(q => q.label === "Supports (required)");
  assert.equal(supportsAfter.after, "18"); // aggregate over quantity 2
  const commitsBefore = state.commits.length;
  assert.equal(editor.accept("F-1", view.id), true, editor.read("F-1").error);
  const item = state.project.items[0];
  assert.equal(item.reinforcement_calculation_version, 2);
  assert.equal(item.support_count, 18);
  assert.equal(item.support_purchased_units, 24);
  assert.equal(item.reinforcement_cost_snapshot.supports.status, "resolved");
  assert.equal(state.commits.length, commitsBefore + 1);
});

check("editor: unexplained off stays non-acceptable", () => {
  const { editor } = makeEnv();
  editor.start("F-1");
  const d = autoDraft();
  d.design.supports = { mode: "off", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] };
  editor.changeDraft("F-1", d);
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  assert.equal(view.canAccept, false);
  assert.ok(view.issues.length > 0);
});

check("editor: explained off accepts with zero support cost", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  const d = autoDraft();
  d.design.supports = { mode: "off", reason: "Installer supplies chairs", spacing_inches: "", catalog_id: "", mats: [], placements: [] };
  editor.changeDraft("F-1", d);
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  assert.equal(view.canAccept, true, JSON.stringify(view.issues));
  editor.accept("F-1", view.id);
  const item = state.project.items[0];
  assert.equal(item.support_cost, 0);
  assert.equal(item.reinforcement_cost_snapshot.supports.status, "off_explained");
});

// ══════════════════════ Legacy parity ══════════════════════════════════════
check("parity: v1/unmarked items price through unchanged legacy path", () => {
  const legacy = {
    component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
    length_inches: 48, width_inches: 48, depth_inches: 18,
    selected_concrete_id: "bag-1", include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
    include_forming: false, include_finishing: false, is_new_sign_location: true, excavation_method: "hand_dig",
  };
  const cost = calcFor(legacy);
  assert.ok(Number.isFinite(cost.rebar_feet) && cost.rebar_feet > 0);
  assert.equal(cost.support_count, undefined);
  assert.equal(cost.reinforcement_cost_snapshot, undefined);
  assert.equal(foundationReinforcementBOMRows(legacy), null);
  const v1 = calcFor({ ...legacy, reinforcement_calculation_version: 1 });
  assert.ok(Number.isFinite(v1.item_total_cost));
});

check("parity: unsupported version holds acknowledged snapshot", () => {
  const item = { ...spreadItem(), reinforcement_calculation_version: 7, rebar_cost: 123.45, item_total_cost: 999.99 };
  const cost = calcFor(item);
  assert.equal(cost.rebar_cost, 123.45);
  assert.equal(cost.item_total_cost, 999.99);
  const project = projectWith([item]);
  const priced = calcProject(clone(project), clone(inventory), clone(settings));
  const out = priced.items.find(i => i.component_id === "F-1");
  assert.equal(out.rebar_cost, 123.45);
});

// ══════════════════════ Real component render checks ═══════════════════════
const texts = (node, out = []) => {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach(n => texts(n, out)); return out; }
  if (typeof node === "object" && node.props) texts(node.props.children, out);
  return out;
};
const elements = (node, out = []) => {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach(n => elements(n, out)); return out; }
  out.push(node);
  elements(node.props?.children, out);
  return out;
};

check("component: geometry editor renders auto/manual/off modes + spacing", () => {
  const draft = autoDraft();
  const tree = ReinforcementDraftGeometry({ draft, item: spreadItem(), supportCatalog: [support3], disabled: false, onChange: () => {} });
  const els = elements(tree);
  const supportSelect = els.find(e => e.props?.["aria-label"] === "Supports");
  assert.ok(supportSelect, "supports mode select missing");
  const optionValues = [];
  elements(supportSelect.props.children, []).forEach(e => { if (e.type === "option") optionValues.push(e.props.value); });
  for (const mode of ["auto", "manual", "off", "unconfigured"]) assert.ok(optionValues.includes(mode), `mode ${mode} missing`);
  // auto mode renders the spacing field
  assert.ok(els.some(e => e.props?.label === "Max support spacing (in)"), "spacing field missing in auto");
  // catalog pin select lists support catalog rows
  const catSelect = els.find(e => e.props?.["aria-label"] === "Support catalog");
  assert.ok(catSelect, "support catalog select missing");
  const catText = texts(catSelect.props.children).join("|");
  assert.ok(/sup-3|3" slab chair|slab chair/.test(catText), "catalog row not listed");
});

check("component: manual mode renders count + placement lists; off renders reason", () => {
  const draft = autoDraft();
  draft.design.supports = { mode: "manual", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] };
  const tree = ReinforcementDraftGeometry({ draft, item: spreadItem(), supportCatalog: [support3], disabled: false, onChange: () => {} });
  const els = elements(tree);
  assert.ok(els.some(e => e.props?.listKey === "support-mats"), "manual count list missing");
  assert.ok(els.some(e => e.props?.listKey === "support-placements"), "manual placements list missing");
  const draft2 = autoDraft();
  draft2.design.supports = { mode: "off", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] };
  const tree2 = ReinforcementDraftGeometry({ draft: draft2, item: spreadItem(), supportCatalog: [support3], disabled: false, onChange: () => {} });
  assert.ok(elements(tree2).some(e => e.props?.label === "Reason"), "off reason field missing");
});

check("component: ItemCard shows versioned support readout", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const tree = FoundationItemCard({ item, index: 0, catalog: inventory, onChange: () => {}, onRemove: () => {}, onDuplicate: () => {}, pricing: null });
  const text = texts(tree).join(" ");
  assert.ok(/Supports:\s*18\s*required\s*\/\s*24\s*purchased/.test(text), `support readout missing: ${text.slice(0, 400)}`);
});

check("component: FoundationBOM renders support rows", () => {
  const design = spreadDesign({ mode: "auto", spacing_inches: 24 });
  const item = pricedV2Item(spreadItem(), design, [rebarRow, bagRow, support3]);
  const tree = FoundationBOM({ items: [item], itemPricing: [{ available: true }], inventory });
  const text = texts(tree).join(" ");
  assert.ok(/support install labor/i.test(text), "install labor row missing");
  assert.ok(/x24 purchased/.test(text), "purchased-quantity row missing");
});

check("component: page compiles with externals for missing modules", async () => {
  const result = await build({
    entryPoints: [`${TREE}/pages/FoundationEstimator.jsx`],
    bundle: true, platform: "node", format: "esm",
    outfile: `${OUT}/page.bundle.mjs`, alias,
    loader: { ".jsx": "jsx" }, jsx: "automatic",
    plugins: [missingExternal],
  });
  assert.ok(result.errors.length === 0);
});

await Promise.all(pending);

const failures = results.filter(r => r.ok === false);
console.log(`\n${results.length - failures.length}/${results.length} phase-b3-regression checks passed`);
if (failures.length) {
  fs.writeFileSync(`${OUT}/verify-b3regression-failures.json`, JSON.stringify(failures, null, 2));
  process.exit(1);
}
fs.writeFileSync(`${OUT}/verify-b3regression-results.json`, JSON.stringify(results.map(r => r.name), null, 2));
console.log("PASS b3-regression-on-o029-tree");
