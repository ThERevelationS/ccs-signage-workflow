// Equipment-pricing availability hardening — model proof.
// Bundles the real calc chain (candidate foundationCalc against remote-frozen
// wallCalculator/poleCalculator/wallCapCalculator/legacyFoundationCalc/
// foundationCatalogIntegrity/foundationEquipmentBindings/
// foundationInputValidation) and exercises calcEquipmentPricing + calcProject
// invariants. EQUIPMENT_MODEL_RED=1 runs the pre-hardening remote
// foundationCalc — the hardening checks must fail there (they encode the
// hardened contract) while plain valid pricing still works (silent laundering).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement21/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("equipment-pricing-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.EQUIPMENT_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
if (!RED) {
  sources.set(F + "foundationCalc.js", fs.readFileSync(DIR + "equipment-pricing-candidate-foundationCalc.js", "utf8"));
}
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "equipment-pricing-candidate-hashes.json", "utf8"));
if (!RED) {
  assert.equal(hash(sources.get(F + "foundationCalc.js")), CANDIDATE_HASHES["foundationCalc.js"], "calc candidate");
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
const entry = "/app/equipment-model-entry.js";
sources.set(entry, `
export { calcProject, calcItem, calcEquipment, calcEquipmentPricing, equipmentCostTotal, money } from "${F}foundationCalc.js";
export { foundationItemInputIssues, foundationProjectInputIssues } from "${F}foundationInputValidation.js";
export { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "${F}foundationCatalogIntegrity.js";
export { resolveFoundationEquipment } from "${F}foundationEquipmentBindings.js";
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "equipment-model-red-bundle.mjs" : "equipment-model-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "equipment-model-red-bundle.mjs" : "equipment-model-bundle.mjs"))));
if (!RED) {
  assert.equal(loaded[F + "foundationCalc.js"], CANDIDATE_HASHES["foundationCalc.js"], "candidate loaded");
}

// ---------- fixtures ----------
const { fixture: seed } = read("equipment-pricing-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
const EQ = 0, ITEM = 0;
const codes = (issues) => issues.map((i) => i.code);
const EV = seed.expectedValid;
const pricing = (selected, inv, options) => api.calcEquipmentPricing(selected, inv, options);

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen valid-formula parity ----------
check("valid equipment prices identically to ported formulas; no authored mutation", () => {
  const p = baseProject(), inv = baseInv();
  const before = clone({ entry: p.selected_equipment[EQ], inv });
  const rows = pricing(p.selected_equipment, inv, { savedEquipment: savedOf(p).selected_equipment });
  assert.equal(rows.length, 1);
  const d = rows[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.baseCost, EV.equipment.baseCost);
  assert.equal(d.deliveryCost, EV.equipment.deliveryCost);
  assert.equal(d.totalCost, EV.equipment.totalCost);
  assert.equal(d.attachmentRows[0].cost, EV.equipment.bucketCost);
  assert.equal(d.subAttachmentRows[0].cost, EV.equipment.toothCost);
  assert.equal(d.pricedEntry.equipment_cost, EV.equipment.totalCost);
  assert.equal(d.rentalPeriod, "day");
  assert.equal(d.duration, 2);
  assert.deepEqual({ entry: p.selected_equipment[EQ], inv }, before, "no source mutation");
});

check("calcProject totals match ported math for valid equipment + item", () => {
  const p = baseProject(), saved = savedOf(p);
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.inputIssues.length, 0);
  assert.equal(r.equipmentPricing[EQ].available, true);
  assert.equal(r.totals.total_equipment_cost, EV.equipment.totalCost);
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  assert.equal(r.delivery.concreteTotal, EV.deliveryConcreteTotal);
  assert.equal(r.totals.grand_total, EV.grandTotal);
});

check("weekly period multiplies every rented row by the weekly catalog rate", () => {
  const p = baseProject();
  p.selected_equipment[EQ].rental_period = "week";
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.totalCost, EV.equipment.weeklyTotal);
});

check("include_delivery adds the catalog delivery charge once", () => {
  const p = baseProject();
  p.selected_equipment[EQ].include_delivery = true;
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.deliveryCost, 75);
  assert.equal(d.totalCost, EV.equipment.withDelivery);
});

check("custom_qty overrides duration for the base and every rented row", () => {
  const p = baseProject();
  p.selected_equipment[EQ].custom_qty = 3;
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.duration, 3);
  assert.equal(d.totalCost, EV.equipment.customQtyThree);
});

check("custom_rate prices the base only — attachments keep catalog rates", () => {
  const p = baseProject();
  p.selected_equipment[EQ].custom_rate = 100;
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.baseCost, 200);
  assert.equal(d.totalCost, EV.equipment.customRateHundred);
});

// ---------- explicit-zero semantics ----------
check("explicit-zero custom rate is a legitimate free rental (base only)", () => {
  const p = baseProject();
  p.selected_equipment[EQ].custom_rate = 0;
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.baseCost, 0);
  assert.equal(d.totalCost, EV.equipment.freeRate);
});

check("explicit-zero custom delivery charge is a legitimate free delivery", () => {
  const p = baseProject();
  p.selected_equipment[EQ].include_delivery = true;
  p.selected_equipment[EQ].custom_delivery_charge = 0;
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0);
  assert.equal(d.deliveryCost, 0);
  assert.equal(d.totalCost, EV.equipment.totalCost);
});

check("blank or absent duration keeps the ported one-period default", () => {
  for (const v of [undefined, null, ""]) {
    const p = baseProject();
    p.selected_equipment[EQ].rental_duration = v;
    const d = pricing(p.selected_equipment, baseInv())[EQ];
    assert.equal(d.issues.length, 0, "v=" + JSON.stringify(v) + " :: " + JSON.stringify(d.issues));
    assert.equal(d.duration, 1);
    assert.equal(d.totalCost, EV.equipment.defaultDuration);
  }
});

check("numeric-string duration/qty/rate normalize on the calculation copy only", () => {
  const p = baseProject();
  p.selected_equipment[EQ].rental_duration = "3";
  p.selected_equipment[EQ].custom_rate = "100";
  p.selected_equipment[EQ].custom_delivery_charge = "0";
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.duration, 3);
  assert.equal(d.baseCost, 300);
  assert.equal(p.selected_equipment[EQ].rental_duration, "3", "authored string preserved");
  assert.equal(p.selected_equipment[EQ].custom_rate, "100", "authored string preserved");
});

// ---------- duration 0 / malformed duration holds ----------
// Decision (mirrors the wall/pole panels): a rental duration of 0 bills nothing
// and is NOT a legitimate explicit zero — the ported `|| 1` would have silently
// repriced it to a single period, so the row is held for review instead.
for (const [label, value] of [["zero", 0], ["negative", -2], ["malformed", "abc"], ["unit-suffixed", "2 days"], ["NaN", NaN], ["Infinity", Infinity], ["record", {}]]) {
  check(`invalid rental_duration holds acknowledged amounts (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.selected_equipment[EQ].rental_duration = value;
    const rows = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment });
    const d = rows[EQ];
    const issue = d.issues.find((i) => i.field === "rental_duration");
    assert.equal(issue?.code, "equipment_duration_unavailable", "v=" + String(value));
    assert.equal(issue?.kind, "equipment");
    assert.equal(issue?.componentId, "synthetic-eq-1");
    assert.equal(d.baseCost, null);
    assert.equal(d.totalCost, 680, "held acknowledged equipment_cost");
    assert.equal(d.pricedEntry.equipment_cost, 680);
    assert.equal(d.attachmentRows[0].cost, null, "attachment rows held");
  });
}

check("rental_duration 0 with custom_qty set is not consumed — no hold", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment[EQ].rental_duration = 0;      // dormant: custom_qty wins
  p.selected_equipment[EQ].custom_qty = 2;
  const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.duration, 2);
});

// ---------- custom_qty / custom_rate / custom_delivery_charge holds ----------
for (const [label, value] of [["zero", 0], ["negative", -1], ["malformed", "abc"], ["NaN", NaN]]) {
  check(`invalid custom_qty holds (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.selected_equipment[EQ].custom_qty = value;
    const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
    const issue = d.issues.find((i) => i.field === "custom_qty");
    assert.equal(issue?.code, "custom_qty_unavailable", "v=" + String(value));
    assert.equal(d.totalCost, 680, "held acknowledged equipment_cost");
  });
}
for (const [label, value] of [["negative", -5], ["malformed", "abc"], ["NaN", NaN], ["record", {}]]) {
  check(`invalid custom_rate holds (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.selected_equipment[EQ].custom_rate = value;
    const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
    const issue = d.issues.find((i) => i.field === "custom_rate");
    assert.equal(issue?.code, "custom_rate_unavailable", "v=" + String(value));
    assert.equal(d.totalCost, 680);
  });
}
for (const [label, value] of [["negative", -1], ["malformed", "abc"], ["NaN", NaN]]) {
  check(`invalid custom_delivery_charge holds when delivery included (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.selected_equipment[EQ].include_delivery = true;
    p.selected_equipment[EQ].custom_delivery_charge = value;
    const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
    const issue = d.issues.find((i) => i.field === "custom_delivery_charge");
    assert.equal(issue?.code, "custom_delivery_charge_unavailable", "v=" + String(value));
    assert.equal(d.totalCost, 680);
  });
}
check("dormant overrides are not consumed — inactive malformed delivery/rate values do not hold", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment[EQ].custom_delivery_charge = "abc"; // inactive: delivery excluded
  const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
});

// ---------- catalog price availability ----------
check("missing catalog day price produces equipment_price_unavailable + hold", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv.find((i) => i.id === "synthetic-excavator").cost_per_day;
  const d = pricing(p.selected_equipment, inv, { savedEquipment: saved.selected_equipment })[EQ];
  const issue = d.issues.find((i) => i.field === "cost_per_day");
  assert.equal(issue?.code, "equipment_price_unavailable");
  assert.equal(issue?.inventoryId, "synthetic-excavator");
  assert.equal(d.totalCost, 680);
  assert.equal(d.baseCost, null);
});

check("missing catalog price on a rented attachment row holds", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv.find((i) => i.id === "synthetic-bucket").cost_per_day;
  const d = pricing(p.selected_equipment, inv, { savedEquipment: saved.selected_equipment })[EQ];
  const issue = d.issues.find((i) => i.field === "cost_per_day" && i.kind === "attachment");
  assert.equal(issue?.code, "equipment_price_unavailable");
  assert.equal(issue?.inventoryId, "synthetic-bucket");
  assert.equal(d.totalCost, 680);
});

check("custom rate covers the base — missing catalog base price is not consumed", () => {
  const p = baseProject(), inv = baseInv();
  p.selected_equipment[EQ].custom_rate = 100;
  delete inv.find((i) => i.id === "synthetic-excavator").cost_per_day;
  const d = pricing(p.selected_equipment, inv)[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.totalCost, EV.equipment.customRateHundred);
});

check("missing pickup_delivery_cost holds only when delivery is included", () => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  delete inv.find((i) => i.id === "synthetic-excavator").pickup_delivery_cost;
  const d0 = pricing(p.selected_equipment, inv, { savedEquipment: saved.selected_equipment })[EQ];
  assert.equal(d0.issues.length, 0, "delivery excluded → charge not consumed");
  p.selected_equipment[EQ].include_delivery = true;
  const d1 = pricing(p.selected_equipment, inv, { savedEquipment: saved.selected_equipment })[EQ];
  const issue = d1.issues.find((i) => i.field === "pickup_delivery_cost");
  assert.equal(issue?.code, "equipment_delivery_price_unavailable");
  assert.equal(d1.totalCost, 680);
});

check("custom delivery charge covers missing catalog delivery price", () => {
  const p = baseProject(), inv = baseInv();
  p.selected_equipment[EQ].include_delivery = true;
  p.selected_equipment[EQ].custom_delivery_charge = 25;
  delete inv.find((i) => i.id === "synthetic-excavator").pickup_delivery_cost;
  const d = pricing(p.selected_equipment, inv)[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.deliveryCost, 25);
  assert.equal(d.totalCost, EV.equipment.totalCost + 25);
});

// ---------- rental period / attachment quantity ----------
check("unrecognized rental period holds when the period drives pricing", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment[EQ].rental_period = "quarter";
  const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
  const issue = d.issues.find((i) => i.field === "rental_period");
  assert.equal(issue?.code, "equipment_period_unavailable");
  assert.equal(d.rentalPeriod, "quarter");
  assert.equal(d.totalCost, 680);
});

check("unrecognized period with a custom rate and no rented attachments is not consumed", () => {
  const p = baseProject();
  const e = p.selected_equipment[EQ];
  e.rental_period = "quarter";
  e.custom_rate = 100;
  e.attachment_counts = {};
  e.sub_attachment_counts = {};
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.totalCost, 200);
});

for (const [label, value] of [["malformed", "abc"], ["negative", -1], ["NaN", NaN]]) {
  check(`invalid attachment quantity holds (${label})`, () => {
    const p = baseProject(), saved = savedOf(p);
    p.selected_equipment[EQ].attachment_counts = { "synthetic-bucket": value };
    const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
    const issue = d.issues.find((i) => i.field === "attachment_counts" || i.kind === "attachment");
    assert.equal(issue?.code, "equipment_attachment_qty_unavailable", "v=" + String(value) + " :: " + JSON.stringify(d.issues));
    assert.equal(d.totalCost, 680);
  });
}

check("zero-count legacy attachment rows price as skipped (not held)", () => {
  const p = baseProject();
  p.selected_equipment[EQ].attachment_counts = { "gone-attachment": 0 };
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  const attIssues = d.issues.filter((i) => i.kind === "attachment");
  assert.equal(attIssues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.attachmentRows[0].cost, 0);
});

// ---------- acknowledged snapshot semantics ----------
check("new held equipment row has no acknowledged amount — no equipment_cost", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment.push({ component_id: "synthetic-eq-new", equipment_id: "synthetic-excavator",
    rental_period: "day", rental_duration: "abc", equipment_cost: 555 });
  const rows = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment });
  const d = rows[1];
  assert.ok(d.issues.length > 0);
  assert.equal(d.pricedEntry.equipment_cost, undefined, "rendered preview cannot persist");
  assert.equal(d.totalCost, null);
});

check("non-explicit snapshot keeps authored equipment_cost on held rows", () => {
  const p = baseProject();
  p.selected_equipment[EQ].rental_duration = "abc";
  const d = pricing(p.selected_equipment, baseInv())[EQ];
  assert.equal(d.pricedEntry.equipment_cost, 680, "no snapshot arg → authored basis kept");
});

check("duplicate component ids cannot restore an ambiguous saved row", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment.push({ ...clone(p.selected_equipment[EQ]), rental_duration: "abc" });
  saved.selected_equipment[EQ].equipment_cost = 999;
  const rows = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment });
  assert.equal(rows[1].pricedEntry.equipment_cost, undefined);
  assert.equal(rows[1].totalCost, null);
});

check("calcProject exposes equipmentPricing, merges issues once, blocks via catalogIssues", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment[EQ].rental_duration = "abc";
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.equipmentPricing[EQ].available, false);
  const eqIssues = r.catalogIssues.filter((i) => i.code === "equipment_duration_unavailable");
  assert.equal(eqIssues.length, 1, "single source — assembly scan filtered");
  assert.equal(r.totals.total_equipment_cost, 680, "acknowledged category total kept");
  assert.equal(r.totals.grand_total, EV.grandTotal, "acknowledged amounts still grand-total");
  assert.equal(r.equipment[EQ].equipment_cost, 680, "payload keeps acknowledged value");
});

check("new unsaved held row nulls the equipment total and grand total", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment.push({ component_id: "synthetic-eq-new", equipment_id: "synthetic-excavator",
    rental_period: "day", rental_duration: "abc" });
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.equipmentPricing[1].available, false);
  assert.equal(r.totals.total_equipment_cost, 680, "category() falls back to acknowledged project total");
  assert.equal(r.totals.grand_total, null, "unsaved invalid row cannot feed grand_total");
});

check("missing equipment assignment is a bindings issue routed through the pricing gate", () => {
  const p = baseProject(), saved = savedOf(p);
  p.selected_equipment[EQ].equipment_id = "gone-excavator";
  const d = pricing(p.selected_equipment, baseInv(), { savedEquipment: saved.selected_equipment })[EQ];
  const issue = d.issues.find((i) => i.field === "equipment_id");
  assert.equal(issue?.code, "catalog_item_unavailable");
  assert.equal(d.totalCost, 680);
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.catalogIssues.filter((i) => i.field === "equipment_id").length, 1, "reported once");
});

check("equipmentCostTotal returns null when any priced row lacks a cost snapshot", () => {
  assert.equal(api.equipmentCostTotal([{ equipment_cost: 10 }, { equipment_cost: 20 }]), 30);
  assert.equal(api.equipmentCostTotal([{ equipment_cost: 10 }, {}]), null);
  assert.equal(api.equipmentCostTotal([{ equipment_cost: 10 }, { equipment_cost: "20" }]), null);
  assert.equal(api.equipmentCostTotal([]), 0);
});

const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + (RED ? "equipment-model-red-verification.json" : "equipment-model-verification.json"),
  JSON.stringify({ results }, null, 2));
console.log(`equipment-model${RED ? "-red" : ""} passed=${okCount} failed=${results.length - okCount} total=${results.length}`);
if (!RED && okCount !== results.length) process.exit(1);
if (RED && okCount === results.length) { console.log("RED unexpectedly clean — hardening contract not exercised"); process.exit(1); }
