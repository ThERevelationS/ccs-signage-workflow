// Cabinets/landscape pricing-availability + clone-guard hardening — model proof.
// Bundles the real calc chain (candidate foundationCalc /
// foundationInputValidation / landscapeMaterials / foundationAssemblyModel
// against remote-frozen wallCalculator/poleCalculator/wallCapCalculator/
// legacyFoundationCalc/foundationCatalogIntegrity/foundationEquipmentBindings)
// and exercises the new exports + calcProject invariants.
// CABLAND_MODEL_RED=1 runs the pre-hardening remote sources — the hardening
// checks must fail there while plain valid pricing still works.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement22/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const SPEC = read("cabinets-landscape-flow-proof-spec.json");

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read(SPEC.sourceArtifact).files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.CABLAND_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
// The model bundle only exercises the calc-layer candidates; the page + panel
// JSX candidates are proven by the page harness and browser checks instead.
const MODEL_CANDIDATES = Object.entries(SPEC.candidates)
  .filter(([rel]) => rel.startsWith("src/components/estimator/foundation/")
    && rel.endsWith(".js"));
if (!RED) {
  for (const [rel, meta] of MODEL_CANDIDATES)
    sources.set("/app/" + rel, fs.readFileSync(DIR + meta.file, "utf8"));
  for (const [rel, meta] of MODEL_CANDIDATES)
    assert.equal(hash(sources.get("/app/" + rel) ?? ""), meta.hash, "candidate " + rel);
}

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source: " + a.path + " (imported by " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};
const entry = "/app/cabland-model-entry.js";
// Namespace re-exports: on the pre-hardening RED build the new exports are
// simply undefined, so the hardening checks fail at call time as intended
// instead of failing the whole bundle.
sources.set(entry, `
import * as _calc from "${F}foundationCalc.js";
import * as _input from "${F}foundationInputValidation.js";
import * as _land from "${F}landscapeMaterials.js";
import * as _integrity from "${F}foundationCatalogIntegrity.js";
import * as _assembly from "${F}foundationAssemblyModel.js";
export const calcProject = _calc.calcProject;
export const calcItem = _calc.calcItem;
export const calcSignageCabinetPricing = _calc.calcSignageCabinetPricing;
export const signageCabinetCostTotal = _calc.signageCabinetCostTotal;
export const money = _calc.money;
export const foundationItemInputIssues = _input.foundationItemInputIssues;
export const foundationProjectInputIssues = _input.foundationProjectInputIssues;
export const signageCabinetInputIssues = _input.signageCabinetInputIssues;
export const signageCabinetsInputIssues = _input.signageCabinetsInputIssues;
export const landscapeSummary = _land.landscapeSummary;
export const landscapeInputIssues = _land.landscapeInputIssues;
export const materialByKey = _land.materialByKey;
export const foundationAssemblyCatalogIssues = _integrity.foundationAssemblyCatalogIssues;
export const hasFoundationCostSnapshot = _integrity.hasFoundationCostSnapshot;
export const normalizeFoundationAssembly = _assembly.normalizeFoundationAssembly;
export const cloneFoundationComponents = _assembly.cloneFoundationComponents;
export const foundationAssemblyIssues = _assembly.foundationAssemblyIssues;
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "cabland-model-red-bundle.mjs" : "cabland-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "cabland-model-red-bundle.mjs" : "cabland-model-bundle.mjs"))));
if (!RED) {
  for (const [rel, meta] of MODEL_CANDIDATES)
    assert.equal(loaded["/app/" + rel], meta.hash, "candidate loaded " + rel);
}

// ---------- fixtures ----------
const { fixture: seed } = read("cabinets-landscape-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
const CAB0 = 0, CAB1 = 1, ITEM = 0;
const codes = (issues) => issues.map((i) => i.code);
const EV = seed.expectedValid;
const pricing = (cabinets) => api.calcSignageCabinetPricing(cabinets);
let keySeq = 0;
const createId = (kind) => `test-${kind}-${++keySeq}`;

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen valid-formula parity ----------
check("valid cabinets price identically to ported formulas; no authored mutation", () => {
  const cabs = clone(seed.project.signage_cabinets);
  const before = clone(cabs);
  const rows = pricing(cabs);
  assert.equal(rows.length, 2);
  assert.equal(rows[CAB0].issues.length, 0, JSON.stringify(rows[CAB0].issues));
  assert.equal(rows[CAB0].cost, EV.cabinetRows[0]);
  assert.equal(rows[CAB1].cost, EV.cabinetRows[1]);
  assert.equal(rows[CAB0].available, true);
  assert.deepEqual(cabs, before, "no source mutation");
});

check("calcProject totals match ported math for valid cabinets + landscape", () => {
  const p = baseProject(), saved = savedOf(p);
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.inputIssues.length, 0, JSON.stringify(r.inputIssues));
  assert.equal(r.signageCabinetPricing.every((x) => x.available), true);
  assert.equal(r.landscapePricing.available, true);
  assert.equal(r.totals.total_signage_cabinet_cost, EV.cabinetCost);
  assert.equal(r.totals.total_landscape_cost, EV.landscapeCost);
  assert.equal(r.totals.total_pole_cost, EV.pole.pole_cost);
  assert.equal(r.totals.grand_total, EV.grandTotal);
});

check("landscapeSummary prices the recorded grid identically to the ported rollup", () => {
  const s = api.landscapeSummary(baseProject().landscape);
  assert.equal(s.total, EV.landscapeCost);
  for (const exp of EV.landscapeLines) {
    const line = s.lines.find((l) => l.key === exp.key);
    assert.ok(line, "line " + exp.key);
    assert.equal(line.sqft, exp.sqft);
    assert.equal(line.cost, exp.cost);
  }
});

// ---------- cabinet quantity semantics ----------
check("absent/blank quantity keeps the ported single-cabinet default", () => {
  for (const v of [undefined, null, ""]) {
    const cabs = [{ mount: "foundation", unit_cost: 100, quantity: v }];
    const rows = pricing(cabs);
    assert.equal(rows[0].issues.length, 0, "v=" + JSON.stringify(v) + " :: " + JSON.stringify(rows[0].issues));
    assert.equal(rows[0].cost, 100);
  }
});

for (const [label, value] of [["zero", 0], ["negative", -2], ["malformed", "abc"], ["NaN", NaN], ["Infinity", Infinity], ["record", {}]]) {
  check(`invalid cabinet quantity holds the row (${label})`, () => {
    const rows = pricing([{ mount: "foundation", unit_cost: 100, quantity: value, component_id: "c-bad" }]);
    const issue = rows[0].issues.find((i) => i.field === "quantity");
    assert.equal(issue?.code, "signage_cabinet_quantity_unavailable", "v=" + String(value));
    assert.equal(issue?.kind, "signage_cabinet");
    assert.equal(issue?.componentId, "c-bad");
    assert.equal(rows[0].available, false);
    assert.equal(rows[0].cost, null, "no repriced amount on a held row");
  });
}

check("fractional positive quantity stays valid — it already billed at face value", () => {
  const rows = pricing([{ mount: "foundation", unit_cost: 100, quantity: 2.5 }]);
  assert.equal(rows[0].issues.length, 0, JSON.stringify(rows[0].issues));
  assert.equal(rows[0].cost, 250);
});

check("numeric-string quantity normalizes on the calculation copy only", () => {
  const cabs = [{ mount: "foundation", unit_cost: 100, quantity: "3" }];
  const rows = pricing(cabs);
  assert.equal(rows[0].issues.length, 0, JSON.stringify(rows[0].issues));
  assert.equal(rows[0].cost, 300);
  assert.equal(cabs[0].quantity, "3", "authored string preserved");
});

// ---------- cabinet unit cost semantics ----------
check("explicit-zero unit cost is a legitimate free cabinet", () => {
  const rows = pricing([{ mount: "foundation", unit_cost: 0, quantity: 2 }]);
  assert.equal(rows[0].issues.length, 0, JSON.stringify(rows[0].issues));
  assert.equal(rows[0].cost, 0);
});

for (const [label, value] of [["missing", undefined], ["null", null], ["blank", ""], ["negative", -5], ["malformed", "abc"], ["NaN", NaN], ["record", {}]]) {
  check(`invalid unit cost holds the row (${label})`, () => {
    const cabs = [{ mount: "foundation", quantity: 1, component_id: "c-price" }];
    if (value !== undefined) cabs[0].unit_cost = value;
    const rows = pricing(cabs);
    const issue = rows[0].issues.find((i) => i.field === "unit_cost");
    assert.equal(issue?.code, "signage_cabinet_price_unavailable", "v=" + String(value));
    assert.equal(rows[0].cost, null);
  });
}

check("cabinet dimensions are not price-consuming — malformed dims do not hold", () => {
  const rows = pricing([{ mount: "foundation", unit_cost: 100, quantity: 1, width_inches: "abc", depth_inches: {} }]);
  assert.equal(rows[0].issues.length, 0, JSON.stringify(rows[0].issues));
  assert.equal(rows[0].cost, 100);
});

// ---------- project-level cabinet totals (hold semantics) ----------
check("one bad row withholds the cabinet subtotal — acknowledged total held", () => {
  const p = baseProject(), saved = savedOf(p);
  p.signage_cabinets[CAB0].quantity = 0;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  const issue = r.inputIssues.find((i) => i.kind === "signage_cabinet");
  assert.equal(issue?.code, "signage_cabinet_quantity_unavailable");
  assert.equal(r.signageCabinetPricing[CAB0].available, false);
  assert.equal(r.totals.total_signage_cabinet_cost, 950, "held acknowledged cabinet total");
});

check("bad row with no acknowledged total reports null, not $0", () => {
  const p = baseProject(), saved = savedOf(p);
  p.signage_cabinets[CAB0].quantity = 0;
  delete saved.total_signage_cabinet_cost;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.totals.total_signage_cabinet_cost, null, "null — never laundered to $0");
});

check("non-explicit snapshot keeps the authored basis for totals", () => {
  const p = baseProject();
  p.signage_cabinets[CAB0].quantity = 0;
  const r = api.calcProject(p, baseInv(), baseSettings());
  assert.equal(r.totals.total_signage_cabinet_cost, 950, "project's own recorded total kept");
});

check("cabinet issues do not leak into item pricing or catalog gate", () => {
  const p = baseProject(), saved = savedOf(p);
  p.signage_cabinets[CAB0].unit_cost = "abc";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.itemPricing[ITEM].available, true, "item still available");
  assert.equal(r.catalogIssues.filter((i) => i.kind === "signage_cabinet").length, 0);
  assert.equal(r.inputIssues.some((i) => i.kind === "signage_cabinet" && i.index === CAB0), true);
});

// ---------- landscape semantics ----------
check("landscape missing cell size is unavailable, not guessed-12", () => {
  const land = { cells: { "0,0": "grass", "1,0": "concrete" } };
  const s = api.landscapeSummary(land);
  const issue = s.issues.find((i) => i.field === "cell_size_inches");
  assert.equal(issue?.code, "landscape_cell_size_unavailable");
  assert.equal(issue?.kind, "landscape");
  assert.equal(s.total, null, "total withheld");
  assert.equal(s.lines[0].sqft, null, "sqft withheld");
  assert.equal(s.lines[0].cells, 1, "cell count still shown");
});

for (const [label, value] of [["zero", 0], ["negative", -12], ["malformed", "abc"], ["NaN", NaN], ["record", {}]]) {
  check(`invalid cell_size_inches unavailable (${label})`, () => {
    const s = api.landscapeSummary({ cell_size_inches: value, cells: { "0,0": "grass" } });
    assert.equal(s.issues.some((i) => i.code === "landscape_cell_size_unavailable"), true, "v=" + String(value));
    assert.equal(s.total, null);
  });
}

check("missing cell size with nothing painted is not an issue — nothing bills", () => {
  for (const land of [{ cells: {} }, { cells: { "0,0": "dirt" } }, null, undefined, {}]) {
    const s = api.landscapeSummary(land);
    assert.equal(s.issues.length, 0, JSON.stringify({ land, issues: s.issues }));
    assert.equal(s.total, 0);
  }
});

check("numeric-string cell size normalizes like the ported coercion", () => {
  const s = api.landscapeSummary({ cell_size_inches: "24", cells: { "0,0": "grass" } });
  assert.equal(s.issues.length, 0, JSON.stringify(s.issues));
  assert.equal(s.lines[0].sqft, 4);
  assert.equal(s.lines[0].cost, 3);
});

check("unknown material key is unavailable, never a silent $0", () => {
  const s = api.landscapeSummary({ cell_size_inches: 12, cells: { "0,0": "mystery_mulch", "1,0": "grass" } });
  const issue = s.issues.find((i) => i.code === "landscape_material_unavailable");
  assert.ok(issue, JSON.stringify(s.issues));
  const line = s.lines.find((l) => l.key === "mystery_mulch");
  assert.equal(line.sqft, 1, "area still shown — cell size is known");
  assert.equal(line.cost, null);
  assert.equal(s.total, null);
  const grass = s.lines.find((l) => l.key === "grass");
  assert.equal(grass.cost, 0.75, "known lines still priced");
});

check("malformed cells record is unavailable, not silently empty", () => {
  const s = api.landscapeSummary({ cell_size_inches: 12, cells: "junk" });
  assert.equal(s.issues.some((i) => i.code === "landscape_cells_unavailable"), true);
  assert.equal(s.lines.length, 0);
});

check("landscape issues hold the acknowledged project total", () => {
  const p = baseProject(), saved = savedOf(p);
  delete p.landscape.cell_size_inches;
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.landscapePricing.available, false);
  assert.equal(r.landscapePricing.issues[0].code, "landscape_cell_size_unavailable");
  assert.equal(r.totals.total_landscape_cost, 15.5, "held acknowledged landscape total");
  assert.equal(r.inputIssues.some((i) => i.kind === "landscape"), true, "merged into input gate");
});

check("dirt cells and eraser rows never price or flag", () => {
  const s = api.landscapeSummary({ cell_size_inches: 12, cells: { "0,0": "dirt", "1,0": "dirt" } });
  assert.equal(s.issues.length, 0);
  assert.equal(s.lines.length, 0);
  assert.equal(s.total, 0);
});

// ---------- clone-guard: malformed wall shape.segments ----------
check("clone preserves a malformed segments row raw — no crash, source untouched", () => {
  const proj = {
    items: [{ component_id: "it-1" }],
    walls: [
      { component_id: "w-1", shape: { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], closed: false, segments: "garbage" } },
      { component_id: "w-2", shape: { points: [{ x: 0, z: 0 }, { x: 5, z: 0 }], closed: false, segments: [{ length: 5, component_id: "seg-a" }] } },
    ],
  };
  const before = clone(proj);
  const { components, idMap } = api.cloneFoundationComponents(proj, { createId });
  assert.equal(components.walls.length, 2);
  assert.equal(components.walls[0].shape.segments, "garbage", "malformed preserved raw");
  assert.equal(components.walls[1].shape.segments.length, 1, "valid segments remapped");
  assert.notEqual(components.walls[1].shape.segments[0].component_id, "seg-a");
  assert.ok(idMap.get("w-1"), "wall id remapped despite malformed shape");
  assert.deepEqual(proj, before, "no source mutation");
});

for (const [label, segs] of [["record", { bogus: 1 }], ["number", 42], ["boolean", true]]) {
  check(`clone tolerates nonarray segments (${label})`, () => {
    const proj = { walls: [{ component_id: "w-x", shape: { segments: segs } }] };
    const { components } = api.cloneFoundationComponents(proj, { createId });
    assert.deepEqual(components.walls[0].shape.segments, segs, "preserved verbatim");
    if (typeof segs === "object") assert.notStrictEqual(components.walls[0].shape.segments, segs, "raw object is copied, not reference-shared");
  });
}

check("wall cap segment index resolves to undefined on a malformed parent wall", () => {
  const proj = {
    walls: [{ component_id: "w-cap-wall", shape: { segments: "garbage" } }],
    wall_caps: [{ component_id: "cap-1", wall_component_id: "w-cap-wall", segment_component_id: "seg-9" }],
  };
  const { components } = api.cloneFoundationComponents(proj, { createId });
  const cap = components.wall_caps[0];
  assert.equal(cap.wall_index, 0);
  assert.equal(cap.segment_index, undefined, "no crash; dangling index unresolved");
});

check("normalize still rejects malformed segments on the load path", () => {
  const proj = { walls: [{ component_id: "w-1", shape: { segments: "garbage" } }] };
  // Pre-hardening behaviour is preserved: the load path still refuses the row
  // (remote rejects in the collectRefs walk before the friendly throw is reached).
  assert.throws(() => api.normalizeFoundationAssembly(proj, { createId }));
});

check("clone with no walls or clean walls is byte-identical to pre-guard output", () => {
  const proj = {
    items: [{ component_id: "it-1" }],
    walls: [
      { component_id: "w-1", shape: { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], closed: false, segments: [{ length: 10, component_id: "seg-1" }] } },
      { component_id: "w-2", shape: { points: [{ x: 0, z: 0 }] } },
    ],
    poles: [{ component_id: "p-1", foundation_component_id: "it-1", signs: [{ component_id: "s-1" }] }],
    wall_caps: [{ component_id: "cap-1", wall_component_id: "w-1", segment_component_id: "seg-1" }],
    signage_cabinets: [{ component_id: "cab-1", mount: "foundation", foundation_component_id: "it-1" }],
  };
  const { components } = api.cloneFoundationComponents(proj, { createId });
  assert.equal(components.walls[0].shape.segments.length, 1);
  assert.deepEqual(components.walls[1].shape.segments, [], "absent segments still emit the ported empty array");
  assert.equal(components.wall_caps[0].wall_index, 0);
  assert.equal(components.wall_caps[0].segment_index, 0);
  assert.equal(components.signage_cabinets[0].foundation_index, 0);
});

check("project input issues still reject nonarray items", () => {
  assert.throws(() => api.foundationProjectInputIssues({ items: "nope" }), /must be an array/);
});

const okCount = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const report = { red: RED, results, okCount, failCount: failed.length };
fs.writeFileSync(DIR + (RED ? "cabland-model-red-verification.json" : "cabland-model-verification.json"), JSON.stringify(report, null, 2));
console.log(`cabland-model ${RED ? "RED " : ""}passed=${okCount} failed=${failed.length}`);
if (!RED && failed.length) process.exit(1);
if (RED && !failed.length) { console.error("RED expected failures but all passed"); process.exit(1); }
