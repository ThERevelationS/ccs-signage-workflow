// O-030 (CMP-B16) — model proof.
// Bundles the real calc chain (candidate foundationConstructionChecks +
// foundationCalc against remote-frozen foundationInputValidation /
// legacyFoundationCalc / foundationEquipmentBindings / wallCalculator /
// poleCalculator / wallCapCalculator / foundationCatalogIntegrity /
// landscapeMaterials) and exercises calcProject across authored-choice
// mutations. Asserts: each advisory check fires exactly when its condition
// holds, never in control cases, never inside inputIssues/catalogIssues,
// and never marks an itemPricing unavailable.
// O030_MODEL_RED=1 runs the pre-change remote sources — the warning
// assertions must fail there (the channel does not exist) while the calc
// totals still compute (additive-change proof).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-o030-diagnostics/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("o030-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.O030_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
const CANDIDATES = ["foundationConstructionChecks.js", "foundationCalc.js"];
if (!RED) {
  for (const name of CANDIDATES)
    sources.set(F + name, fs.readFileSync(DIR + "o030-candidate-" + name, "utf8"));
} else {
  sources.delete(F + "foundationConstructionChecks.js");
}
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "o030-candidate-hashes.json", "utf8"));
if (!RED) {
  for (const name of CANDIDATES)
    assert.equal(hash(sources.get(F + name)), CANDIDATE_HASHES[name], "candidate " + name);
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
const entry = "/app/o030-model-entry.js";
sources.set(entry, `
export { calcProject, calcItem, money } from "${F}foundationCalc.js";
${RED ? "" : `export { foundationConstructionWarnings } from "${F}foundationConstructionChecks.js";`}
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "o030-model-red-bundle.mjs" : "o030-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "o030-model-red-bundle.mjs" : "o030-model-bundle.mjs"))));
if (!RED) {
  for (const name of CANDIDATES)
    assert.equal(loaded[F + name], CANDIDATE_HASHES[name], "candidate loaded " + name);
}

// ---------- fixtures ----------
const { fixture: seed } = read("o030-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInventory = () => clone(seed.inventory);
const settings = clone(seed.settings);
const baseItem = () => clone(seed.project.items[0]);
const mk = (items, extras = {}) => ({ ...baseProject(), items, ...extras });
const calc = (project, inventory = baseInventory(), opts = {}) =>
  api.calcProject(project, inventory, settings, opts);
const codes = (warnings) => (warnings || []).map((w) => w.code);
const hasCode = (warnings, code) => codes(warnings).includes(code);

const results = [];
const check = (id, fn) => {
  try { fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1200) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};

if (RED) {
  // The pre-change remote has no warnings channel — every fire-assertion
  // must fail while calc still computes the same totals.
  const c = calc(mk([baseItem()]));
  assert.equal(c.constructionWarnings, undefined, "pre-change remote must not emit constructionWarnings");
  assert.ok(Number.isFinite(c.totals.grand_total), "remote calc still prices");
  results.push({ id: "red-no-warnings-channel", ok: true });
  fs.writeFileSync(DIR + "o030-model-red-verification.json", JSON.stringify({ results, pass: true }, null, 1));
  console.log("PASS o030-model-red (channel absent, totals intact)");
  process.exit(0);
}

// ---------- warning-fire + control cases ----------

// 1 — baseline: valid formed+finished hand-dig item → only the standing
// spoil-assumption advisory; no blocking issues anywhere.
await check("baseline-only-spoil-warning", () => {
  const c = calc(mk([baseItem()]));
  assert.deepEqual(c.catalogIssues, [], "no catalog issues");
  assert.deepEqual(c.inputIssues, [], "no input issues");
  assert.equal(c.itemPricing[0].available, true, "item priced");
  assert.deepEqual(codes(c.constructionWarnings), ["excavation_spoil_unaccounted"]);
  const w = c.constructionWarnings[0];
  assert.equal(w.severity, "advisory");
  assert.equal(w.kind, "foundation");
  assert.equal(w.index, 0);
  assert.equal(w.componentId, "synthetic-item-1");
  assert.match(w.message, /125%/);
  assert.match(w.message, /haul-off, disposal, and backfill are not priced/i);
  assert.match(w.message, /hand dig/i);
});

// 2 — equipment excavation without a rental row: spoil (equipment label) +
// equipment-unpriced advisory.
await check("equipment-method-unpriced-rental", () => {
  const item = { ...baseItem(), excavation_method: "equipment_excavation" };
  const c = calc(mk([item]));
  assert.ok(hasCode(c.constructionWarnings, "excavation_spoil_unaccounted"));
  const spoil = c.constructionWarnings.find(w => w.code === "excavation_spoil_unaccounted");
  assert.match(spoil.message, /equipment/i);
  assert.ok(hasCode(c.constructionWarnings, "excavation_equipment_unpriced"));
  assert.ok(!hasCode(c.constructionWarnings, "excavation_method_unspecified"));
  assert.deepEqual(c.inputIssues, []);
});

// 3 — control: equipment method + a rental row → no equipment-unpriced
// warning (spoil still stands).
await check("equipment-method-with-rental-no-warning", () => {
  const item = { ...baseItem(), excavation_method: "equipment_excavation" };
  const c = calc(mk([item], {
    selected_equipment: [{ component_id: "eq-1", equipment_id: "synthetic-excavator" }],
  }));
  assert.ok(hasCode(c.constructionWarnings, "excavation_spoil_unaccounted"));
  assert.ok(!hasCode(c.constructionWarnings, "excavation_equipment_unpriced"));
});

// 4 — no method on item AND no project default → unspecified + hand-dig spoil.
await check("method-unspecified-assumes-hand-dig", () => {
  const item = { ...baseItem() };
  delete item.excavation_method;
  const c = calc(mk([item], { excavation_method: null }));
  assert.ok(hasCode(c.constructionWarnings, "excavation_method_unspecified"));
  assert.ok(hasCode(c.constructionWarnings, "excavation_spoil_unaccounted"));
  const un = c.constructionWarnings.find(w => w.code === "excavation_method_unspecified");
  assert.match(un.message, /assuming hand dig/i);
});

// 5 — control: item blank but project default recorded → inherited, no
// unspecified warning.
await check("project-default-method-no-unspecified", () => {
  const item = { ...baseItem() };
  delete item.excavation_method;
  const c = calc(mk([item], { excavation_method: "equipment_excavation" }));
  assert.ok(!hasCode(c.constructionWarnings, "excavation_method_unspecified"));
  assert.ok(hasCode(c.constructionWarnings, "excavation_equipment_unpriced"));
});

// 6 — forming on / finishing off → forming_without_finishing.
await check("forming-without-finishing", () => {
  const item = { ...baseItem(), include_finishing: false };
  const c = calc(mk([item]));
  assert.ok(hasCode(c.constructionWarnings, "forming_without_finishing"));
  const w = c.constructionWarnings.find(w => w.code === "forming_without_finishing");
  assert.equal(w.index, 0);
  assert.match(w.message, /Verify whether finishing is in scope/i);
  assert.ok(!hasCode(c.constructionWarnings, "finishing_without_forming"));
});

// 7 — finishing on / forming off → finishing_without_forming.
await check("finishing-without-forming", () => {
  const item = { ...baseItem(), include_forming: false, selected_forming_id: null };
  const c = calc(mk([item]));
  assert.ok(hasCode(c.constructionWarnings, "finishing_without_forming"));
  assert.ok(!hasCode(c.constructionWarnings, "forming_without_finishing"));
  assert.deepEqual(c.inputIssues, [], "still fully priced");
});

// 8 — control: both toggles off → neither warning.
await check("neither-forming-nor-finishing-no-warning", () => {
  const item = { ...baseItem(), include_forming: false, include_finishing: false, selected_forming_id: null };
  const c = calc(mk([item]));
  assert.ok(!hasCode(c.constructionWarnings, "forming_without_finishing"));
  assert.ok(!hasCode(c.constructionWarnings, "finishing_without_forming"));
});

// 9 — pillar + forming → straight-stock advisory (forming+finishing both on
// so no mismatch warning).
await check("pillar-forming-straight-stock", () => {
  const item = {
    ...baseItem(), component_id: "pillar-1", foundation_type: "pillar",
    diameter: 24, depth_inches: 48, length_inches: undefined, width_inches: undefined,
  };
  const c = calc(mk([item]));
  assert.ok(hasCode(c.constructionWarnings, "pillar_forming_straight_stock"));
  const w = c.constructionWarnings.find(w => w.code === "pillar_forming_straight_stock");
  assert.match(w.message, /16-ft/i);
  assert.match(w.message, /round formwork/i);
});

// 10 — control: pillar without forming → no straight-stock warning.
await check("pillar-no-forming-no-warning", () => {
  const item = {
    ...baseItem(), component_id: "pillar-1", foundation_type: "pillar",
    diameter: 24, depth_inches: 48, include_forming: false, selected_forming_id: null,
    length_inches: undefined, width_inches: undefined,
  };
  const c = calc(mk([item]));
  assert.ok(!hasCode(c.constructionWarnings, "pillar_forming_straight_stock"));
});

// 11 — no recorded mix → priced on the silent 4000-AE fallback.
await check("mix-unspecified-fallback", () => {
  const c = calc(mk([baseItem()], { project_concrete_type: null }));
  assert.ok(hasCode(c.constructionWarnings, "concrete_mix_unspecified"));
  const w = c.constructionWarnings.find(w => w.code === "concrete_mix_unspecified");
  assert.match(w.message, /4000 AIR ENTRAINED/i);
});

// 12 — control: recorded mix → no fallback warning.
await check("mix-recorded-no-warning", () => {
  const c = calc(mk([baseItem()]));
  assert.ok(!hasCode(c.constructionWarnings, "concrete_mix_unspecified"));
});

// 13 — calcium chloride + rebar → corrosion advisory (the supplier catalog's
// own warning text).
await check("admix-calcium-chloride-rebar", () => {
  const item = {
    ...baseItem(), include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  };
  const c = calc(mk([item], { project_concrete_admixtures: ["calcium_chloride"] }));
  assert.ok(hasCode(c.constructionWarnings, "admixture_rebar_corrosion"));
  const w = c.constructionWarnings.find(w => w.code === "admixture_rebar_corrosion");
  assert.match(w.message, /corrodes rebar/i);
  assert.equal(c.itemPricing[0].available, true, "advisory does not hold the item");
});

// 14 — control: calcium chloride without rebar → no corrosion warning.
await check("admix-calcium-chloride-no-rebar", () => {
  const c = calc(mk([baseItem()], { project_concrete_admixtures: ["calcium_chloride"] }));
  assert.ok(!hasCode(c.constructionWarnings, "admixture_rebar_corrosion"));
});

// 15 — accelerator + retarder → pace conflict.
await check("admix-accelerator-plus-retarder", () => {
  const c = calc(mk([baseItem()], { project_concrete_admixtures: ["calcium_chloride", "set_retarding"] }));
  assert.ok(hasCode(c.constructionWarnings, "admixture_set_pace_conflict"));
});

// 16 — FAST SET + retarder → pace conflict.
await check("fastset-mix-plus-retarder", () => {
  const c = calc(mk([baseItem()], { project_concrete_type: "fast_set", project_concrete_admixtures: ["set_retarding"] }));
  assert.ok(hasCode(c.constructionWarnings, "mix_admixture_pace_conflict"));
});

// 17 — control: FAST SET without retarder → no pace conflict.
await check("fastset-mix-alone-no-warning", () => {
  const c = calc(mk([baseItem()], { project_concrete_type: "fast_set" }));
  assert.ok(!hasCode(c.constructionWarnings, "mix_admixture_pace_conflict"));
});

// 18 — winter service + retarder → contradictory site assumptions.
await check("winter-service-plus-retarder", () => {
  const c = calc(mk([baseItem()], { project_concrete_admixtures: ["winter_service", "set_retarding"] }));
  assert.ok(hasCode(c.constructionWarnings, "admixture_weather_conflict"));
});

// 19 — admixtures on an all-bagged project → nothing to apply them to.
await check("admixtures-on-bagged-only", () => {
  const item = { ...baseItem(), selected_concrete_id: "synthetic-bagged" };
  const c = calc(mk([item], { project_concrete_admixtures: ["fibers", "winter_service"] }));
  assert.ok(hasCode(c.constructionWarnings, "admixtures_without_ready_mix"));
  assert.ok(!hasCode(c.constructionWarnings, "admixture_rebar_corrosion"));
  assert.ok(!hasCode(c.constructionWarnings, "concrete_mix_unspecified"));
});

// 20 — control: no admixtures → no admixture warnings at all.
await check("no-admixtures-no-warnings", () => {
  const c = calc(mk([baseItem()]));
  for (const w of c.constructionWarnings) assert.ok(!w.code.startsWith("admixture"), w.code);
});

// 21 — empty project → zero warnings, zero issues.
await check("empty-project-no-warnings", () => {
  const c = calc(mk([], { project_concrete_admixtures: ["fibers"] }));
  assert.deepEqual(c.constructionWarnings, []);
  assert.deepEqual(c.inputIssues, []);
});

// 22 — two items, mixed methods → one spoil advisory per method.
await check("mixed-methods-two-spoil-warnings", () => {
  const a = baseItem();
  const b = { ...baseItem(), component_id: "synthetic-item-2", excavation_method: "equipment_excavation" };
  const c = calc(mk([a, b]));
  const spoil = c.constructionWarnings.filter(w => w.code === "excavation_spoil_unaccounted");
  assert.equal(spoil.length, 2);
  assert.ok(spoil.some(w => /hand dig/i.test(w.message)));
  assert.ok(spoil.some(w => /equipment/i.test(w.message)));
});

// 23 — held (invalid) item still surfaces authored-choice warnings, and the
// warnings never leak into the blocking channels.
await check("held-item-advisory-still-fires", () => {
  const item = { ...baseItem(), length_inches: 0, include_finishing: false };
  const c = calc(mk([item]));
  assert.ok(c.inputIssues.length > 0, "input blocked");
  assert.equal(c.itemPricing[0].available, false, "item held");
  assert.ok(hasCode(c.constructionWarnings, "forming_without_finishing"),
    "authored mismatch still reported: " + JSON.stringify(c.constructionWarnings));
  for (const w of c.constructionWarnings) assert.equal(w.severity, "advisory");
  // no warning code may appear in either blocking channel
  const blocking = new Set([...c.inputIssues, ...c.catalogIssues].map(i => i.code));
  for (const w of c.constructionWarnings) assert.ok(!blocking.has(w.code), w.code + " leaked into blocking channel");
});

// 24 — shape contract: every warning is a complete advisory record.
await check("warning-record-shape", () => {
  const item = { ...baseItem(), include_finishing: false, excavation_method: "equipment_excavation" };
  const c = calc(mk([item], {
    project_concrete_type: null,
    project_concrete_admixtures: ["calcium_chloride", "set_retarding"],
  }));
  assert.ok(c.constructionWarnings.length >= 4, JSON.stringify(codes(c.constructionWarnings)));
  for (const w of c.constructionWarnings) {
    assert.equal(w.severity, "advisory");
    assert.ok(["foundation", "concrete_delivery"].includes(w.kind), w.kind);
    assert.equal(typeof w.code, "string");
    assert.equal(typeof w.message, "string");
    assert.ok("index" in w && "componentId" in w && "field" in w, "issue-shape keys present");
    assert.equal(w.inventoryId, null);
  }
});

const pass = results.every(r => r.ok);
fs.writeFileSync(DIR + "o030-model-verification.json", JSON.stringify({ results, pass }, null, 1));
console.log((pass ? "PASS" : "FAIL") + " o030-model " + results.filter(r => r.ok).length + "/" + results.length);
if (!pass) process.exit(1);
