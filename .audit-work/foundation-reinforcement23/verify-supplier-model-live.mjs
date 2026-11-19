// Supplier-defaults availability hardening — model proof.
// Bundles the real calc chain (candidate legacyFoundationCalc + foundationCalc
// against remote-frozen wallCalculator/poleCalculator/wallCapCalculator/
// foundationCatalogIntegrity/foundationEquipmentBindings/
// foundationInputValidation) and exercises calcConcreteDelivery + calcProject
// invariants. SUPPLIER_MODEL_RED=1 runs the pre-hardening remote sources — the
// hardening checks must fail there (they encode the hardened contract) while
// plain valid pricing still works (silent laundering).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement23/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read("supplier-defaults-baseline.json").files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const RED = process.env.SUPPLIER_MODEL_RED === "1";
const F = "/app/src/components/estimator/foundation/";
if (!RED) {
  sources.set(F + "legacyFoundationCalc.js", fs.readFileSync(DIR + "supplier-defaults-candidate-legacyFoundationCalc.js", "utf8"));
  sources.set(F + "foundationCalc.js", fs.readFileSync(DIR + "supplier-defaults-candidate-foundationCalc.js", "utf8"));
}
for (const k of [...sources.keys()]) if (k.startsWith("/app/src/") && fs.existsSync(k.slice(5))) sources.set(k, fs.readFileSync(k.slice(5), "utf8"));
const LIVE = true;
const CANDIDATE_HASHES = JSON.parse(fs.readFileSync(DIR + "supplier-defaults-candidate-hashes.json", "utf8"));
if (!RED && !LIVE) {
  assert.equal(hash(sources.get(F + "legacyFoundationCalc.js")), CANDIDATE_HASHES["legacyFoundationCalc.js"], "legacy candidate");
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
    let resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) { const disk = [base, base + ".js", base + ".jsx"].find((p) => p.startsWith("/app/") && fs.existsSync(p.slice(5)) && fs.statSync(p.slice(5)).isFile()); if (disk) { sources.set(disk, fs.readFileSync(disk.slice(5), "utf8")); resolved = disk; } }
    if (!resolved) throw Error("Missing frozen source: " + a.path + " (imported by " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};
const entry = "/app/supplier-model-entry.js";
sources.set(entry, `
export { calcProject, calcItem, captureConcreteDeliverySnapshot, money } from "${F}foundationCalc.js";
export { calcConcreteDelivery, calcItemCost, getConcreteMixes, getConcreteAdmixtures,
  getSmallLoadFee, getFuelSurcharge, normalizeConcreteSupplier } from "${F}legacyFoundationCalc.js";
export { foundationItemInputIssues, foundationProjectInputIssues } from "${F}foundationInputValidation.js";
export { foundationAssemblyCatalogIssues, hasFoundationCostSnapshot } from "${F}foundationCatalogIntegrity.js";
`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  plugins: [plug], logLevel: "silent",
  outfile: DIR + (RED ? "supplier-model-red-bundle.mjs" : "supplier-model-live-bundle.mjs"),
});
const api = await import(pathToFileURL(path.resolve(DIR + (RED ? "supplier-model-red-bundle.mjs" : "supplier-model-live-bundle.mjs"))));
if (!RED) {
  if (!LIVE) assert.equal(loaded[F + "legacyFoundationCalc.js"], CANDIDATE_HASHES["legacyFoundationCalc.js"], "legacy candidate loaded");
  if (!LIVE) assert.equal(loaded[F + "foundationCalc.js"], CANDIDATE_HASHES["foundationCalc.js"], "calc candidate loaded");
}

// ---------- fixtures ----------
const { fixture: seed } = read("supplier-defaults-fixture.json");
const clone = (o) => JSON.parse(JSON.stringify(o));
const baseProject = () => clone(seed.project);
const baseInv = () => clone(seed.inventory);
const baseSettings = () => clone(seed.settings);
const savedOf = (project) => clone(project);
const ITEM = 0;
const codes = (issues) => issues.map((i) => i.code);
const EV = seed.expectedValid;
const SUP = "synthetic-readymix";
const delivery = (project, items, inv) => api.calcConcreteDelivery(project, items, inv);
const projDelivery = (p, inv, options) => api.calcProject(p, inv ?? baseInv(), baseSettings(), options ?? { savedProject: savedOf(p) });

const results = [];
const check = (name, run) => {
  try { run(); results.push({ name, ok: true }); console.log("ok " + name); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.log("FAIL " + name + " :: " + String(error.message).slice(0, 400)); }
};

// ---------- frozen valid-formula parity ----------
check("valid supplier prices produce identical truck math; no authored mutation", () => {
  const p = baseProject(), inv = baseInv();
  const before = clone({ project: p, inv });
  const d = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.pricingUnavailable, undefined);
  assert.equal(d.concreteTotal, EV.delivery.concreteTotal);
  assert.equal(d.roundedYards, EV.delivery.roundedYards);
  assert.equal(d.ratePerYard, EV.delivery.ratePerYard);
  assert.equal(d.trucksList.length, 1);
  assert.equal(d.trucksList[0].cost, EV.delivery.truckCost);
  assert.equal(d.trucksList[0].smallOrderFee, EV.delivery.truckSmallOrderFee);
  assert.equal(d.trucksList[0].fuelFee, EV.delivery.truckFuelFee);
  assert.equal(d.additionalStopsCost, EV.delivery.additionalStopsCost);
  assert.deepEqual({ project: p, inv }, before, "no source mutation");
});

check("availableMixes/admixes carry finite catalog prices and authored field names", () => {
  const p = baseProject();
  const d = delivery({ ...p, settings: baseSettings() }, p.items, baseInv());
  assert.equal(d.availableMixes.find((m) => m.id === "4000_ae").price, 210);
  assert.equal(d.availableMixes.find((m) => m.id === "4000_ae").field, "mix_4000_price");
  assert.equal(d.availableAdmixes.find((a) => a.id === "calcium_chloride").price, 9);
});

check("calcProject totals match ported math for valid supplier + item", () => {
  const p = baseProject(), saved = savedOf(p);
  const r = api.calcProject(p, baseInv(), baseSettings(), { savedProject: saved });
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.inputIssues.length, 0);
  assert.equal(r.delivery.pricingUnavailable, undefined);
  assert.equal(r.delivery.concreteTotal, EV.delivery.concreteTotal);
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost);
  assert.equal(r.totals.total_concrete_cost, EV.delivery.concreteTotal);
  assert.equal(r.totals.concrete_delivery_cost, EV.delivery.concreteTotal);
  assert.equal(r.totals.grand_total, EV.grandTotal);
});

check("$100 new-location stop is an authored constant — counted, not config-priced", () => {
  const p = baseProject();
  p.items[ITEM].is_new_sign_location = true;
  const d = delivery({ ...p, settings: baseSettings() }, p.items, baseInv());
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.additionalStopsCost, 100);
  assert.equal(d.concreteTotal, EV.deliveryWithStop);
});

check("multi-truck delivery prices each bracket identically to ported math", () => {
  const p = baseProject();
  p.items[ITEM].quantity = 32; // ~9.48 CY → 9.5 rounded → 9yd + 0.5yd trucks
  const d = delivery({ ...p, settings: baseSettings() }, p.items, baseInv());
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.trucksList.length, 2);
  assert.equal(d.trucksList[0].smallOrderFee, 0, "9yd truck pays no small-load fee");
  assert.deepEqual(d.trucksList.map((t) => t.cost), EV.qty32Trucks);
  assert.equal(d.concreteTotal, EV.qty32Total);
});

// ---------- explicit-zero semantics ----------
check("explicit-zero catalog prices are legitimate free prices", () => {
  const inv = baseInv();
  inv.find((i) => i.id === SUP).fuel_surcharge = 0;
  const p = baseProject();
  const d0 = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d0.issues.length, 0, JSON.stringify(d0.issues));
  assert.equal(d0.concreteTotal, EV.fuelZeroTotal);
  inv.find((i) => i.id === SUP).small_load_fee_1_1_75 = 0;
  const d1 = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d1.issues.length, 0, JSON.stringify(d1.issues));
  assert.equal(d1.concreteTotal, EV.feeZeroTotal);
  inv.find((i) => i.id === SUP).mix_4000_price = 0;
  const d2 = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d2.issues.length, 0, JSON.stringify(d2.issues));
  assert.equal(d2.concreteTotal, EV.freeMixTotal);
});

check("explicit-0 settings are honored — the ported `|| def` overrode them", () => {
  const p = baseProject();
  const settings = baseSettings();
  settings.foundation_pouring_cost_per_cy = 0; // numeric zero
  const legacy = api.calcItemCost(p.items[ITEM], baseInv(), settings);
  assert.equal(legacy.pouringCost, 0, "explicit 0 pouring rate kept");
  assert.equal(legacy.total, EV.item.excavation_cost);
  const s2 = baseSettings();
  s2.foundation_hand_dig_time_per_cy = "0"; // string zero was always honored
  const l2 = api.calcItemCost(p.items[ITEM], baseInv(), s2);
  assert.equal(l2.excavationCost, 0);
  const s3 = baseSettings();
  s3.foundation_main_labor_rate = 0;
  const item3 = { ...clone(p.items[ITEM]), include_rebar: true };
  const l3 = api.calcItemCost(item3, baseInv(), s3);
  assert.equal(l3.rebarCost, 0, "explicit 0 labor rate kept — rebar feet remain, labor is free");
});

check("numeric-string supplier prices normalize on the calculation copy only", () => {
  const inv = baseInv();
  const sup = inv.find((i) => i.id === SUP);
  sup.mix_4000_price = "210";
  sup.admix_calcium_chloride_price = "9";
  sup.small_load_fee_1_1_75 = "145";
  sup.fuel_surcharge = "35";
  const p = baseProject();
  const d = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.concreteTotal, EV.delivery.concreteTotal);
  assert.equal(sup.mix_4000_price, "210", "authored string preserved");
  assert.equal(sup.fuel_surcharge, "35", "authored string preserved");
});

// ---------- prices not consumed are never checked ----------
check("unselected mix/admixture prices are not consumed", () => {
  const inv = baseInv();
  const sup = inv.find((i) => i.id === SUP);
  delete sup.mix_5000_price;
  delete sup.admix_fibers_price;
  const p = baseProject();
  const d = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.concreteTotal, EV.delivery.concreteTotal);
  assert.equal(d.availableMixes.find((m) => m.id === "5000_ae").price, null);
});

check("unconsumed small-load bracket is not checked", () => {
  const inv = baseInv();
  delete inv.find((i) => i.id === SUP).small_load_fee_2_2_75; // 0.75 CY → only the 1-1.75 bracket ships
  const p = baseProject();
  const d = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.concreteTotal, EV.delivery.concreteTotal);
  // the same missing bracket IS consumed at 2.5 rounded yards
  p.items[ITEM].quantity = 8;
  const d2 = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.ok(d2.issues.some((i) => i.code === "supplier_price_unavailable" && i.field === "small_load_fee"), JSON.stringify(d2.issues));
  assert.equal(d2.pricingUnavailable, true);
});

check("zero-yard delivery consumes no supplier prices", () => {
  const p = baseProject();
  p.items = [];
  const inv = baseInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const d = delivery({ ...p, settings: baseSettings() }, p.items, inv);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.concreteTotal, 0);
  assert.equal(d.trucksList.length, 0);
});

check("bagged-concrete items never consume ready-mix supplier prices", () => {
  const p = baseProject(), inv = baseInv();
  p.items[ITEM].selected_concrete_id = "synthetic-bagged";
  delete inv.find((i) => i.id === SUP).mix_4000_price; // unpriced supplier — not selected
  const r = projDelivery(p, inv);
  assert.equal(r.catalogIssues.length, 0, JSON.stringify(r.catalogIssues));
  assert.equal(r.delivery.pricingUnavailable, undefined);
});

// ---------- missing/invalid consumed catalog prices → issue + hold ----------
const heldCase = (mutate, field, code = "supplier_price_unavailable") => {
  const p = baseProject(), inv = baseInv(), saved = savedOf(p);
  mutate(p, inv);
  const r = api.calcProject(p, inv, baseSettings(), { savedProject: saved });
  const issue = r.catalogIssues.find((i) => i.code === code && (field === undefined || i.field === field));
  return { r, issue };
};

check("missing mix price → supplier_price_unavailable + acknowledged hold", () => {
  const { r, issue } = heldCase((p, inv) => { delete inv.find((i) => i.id === SUP).mix_4000_price; }, "mix_4000_price");
  assert.ok(issue, "issue present");
  assert.equal(issue.kind, "concrete_delivery");
  assert.equal(issue.inventoryId, SUP);
  assert.equal(r.delivery.pricingUnavailable, true);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal, "acknowledged snapshot held");
  assert.equal(r.totals.total_concrete_cost, EV.heldConcreteCostTotal);
  assert.equal(r.totals.grand_total, EV.heldGrandTotal, "current items + acknowledged delivery");
  assert.equal(r.items[ITEM].item_total_cost, EV.item.item_total_cost, "items still reprice — only delivery held");
});

for (const [label, value] of [["negative", -5], ["malformed", "abc"], ["NaN", NaN], ["record", {}], ["empty string", ""]]) {
  check(`invalid mix price holds (${label})`, () => {
    const { r, issue } = heldCase((p, inv) => { inv.find((i) => i.id === SUP).mix_4000_price = value; }, "mix_4000_price");
    assert.ok(issue, "issue for " + label);
    assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
  });
}

check("missing selected admixture price holds", () => {
  const { r, issue } = heldCase((p, inv) => { delete inv.find((i) => i.id === SUP).admix_calcium_chloride_price; }, "admix_calcium_chloride_price");
  assert.ok(issue);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("missing fuel surcharge holds", () => {
  const { r, issue } = heldCase((p, inv) => { delete inv.find((i) => i.id === SUP).fuel_surcharge; }, "fuel_surcharge");
  assert.ok(issue);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("missing small-load bracket holds", () => {
  const { r, issue } = heldCase((p, inv) => { delete inv.find((i) => i.id === SUP).small_load_fee_1_1_75; }, "small_load_fee");
  assert.ok(issue);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("mix selection not in the supplier catalog holds (was silently repriced to 4000 AE)", () => {
  const { r, issue } = heldCase((p) => { p.project_concrete_type = "9000_fantasy"; }, "project_concrete_type");
  assert.ok(issue);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("admixture selection not in the supplier catalog holds (was silently $0)", () => {
  const { r, issue } = heldCase((p) => { p.project_concrete_admixtures = ["mystery_admix"]; }, "project_concrete_admixtures");
  assert.ok(issue);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("no ready-mix supplier assigned + yards to ship → supplier_unavailable", () => {
  const { r, issue } = heldCase((p) => { p.items[ITEM].selected_concrete_id = ""; }, "selected_concrete_id", "supplier_unavailable");
  assert.ok(issue);
  assert.equal(issue.inventoryId, null);
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("normalized labor-services supplier without authored prices holds (was silently $0)", () => {
  const laborRow = clone(seed.laborServiceRows[0]);
  delete laborRow.mix_4000_price; // normalized to null — not a fabricated 0
  const sup = api.normalizeConcreteSupplier(laborRow);
  assert.equal(sup.mix_4000_price, null, "normalizer preserves missing vs explicit 0");
  const p = baseProject();
  p.items[ITEM].selected_concrete_id = "synthetic-labor-mix";
  const r = projDelivery(p, [sup]);
  assert.ok(r.catalogIssues.some((i) => i.code === "supplier_price_unavailable" && i.field === "mix_4000_price"));
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

check("normalized supplier with authored prices prices identically to a raw row", () => {
  const sup = api.normalizeConcreteSupplier(clone(seed.laborServiceRows[0]));
  const p = baseProject();
  p.items[ITEM].selected_concrete_id = "synthetic-labor-mix";
  const d = delivery({ ...p, settings: baseSettings() }, p.items, [sup]);
  assert.equal(d.issues.length, 0, JSON.stringify(d.issues));
  assert.equal(d.concreteTotal, EV.delivery.concreteTotal);
});

check("unsaved held delivery has no acknowledged snapshot — totals withheld, not guessed", () => {
  const p = baseProject(), inv = baseInv();
  delete p.concrete_delivery_snapshot;
  delete p.total_concrete_cost;
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const r = api.calcProject(p, inv, baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.delivery.pricingUnavailable, true);
  assert.equal(r.delivery.concreteTotal, undefined, "no snapshot → nothing acknowledged");
  assert.equal(r.totals.concrete_delivery_cost, undefined);
  assert.equal(r.totals.grand_total, null, "withheld, not $0 or guessed");
});

check("non-explicit snapshot keeps authored delivery basis — no saved project arg", () => {
  const p = baseProject(), inv = baseInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const r = api.calcProject(p, inv, baseSettings());
  assert.equal(r.delivery.pricingUnavailable, true);
  assert.equal(r.delivery.concreteTotal, p.concrete_delivery_snapshot.concrete_total, "authored snapshot kept");
});

check("captureConcreteDeliverySnapshot round-trips the acknowledged hold", () => {
  const p = baseProject(), inv = baseInv();
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const r = api.calcProject(p, inv, baseSettings(), { savedProject: savedOf(p) });
  const snap = api.captureConcreteDeliverySnapshot(r.delivery);
  assert.equal(snap.concrete_total, EV.heldConcreteTotal);
  assert.equal(snap.trucks[0].cost, 301.5);
  assert.equal(snap.trucks[0].small_order_fee, 102.25);
});

check("supplier issues merge once into catalogIssues and never attach to an item", () => {
  const { r } = heldCase((p, inv) => { delete inv.find((i) => i.id === SUP).mix_4000_price; });
  assert.equal(r.catalogIssues.filter((i) => i.code === "supplier_price_unavailable" && i.field === "mix_4000_price").length, 1);
  assert.equal(r.itemPricing[ITEM].available, true, "delivery issues do not mark the item card unavailable");
  assert.equal(r.itemPricing[ITEM].issues.length, 0);
});

check("unavailable items still short-circuit delivery — no duplicate supplier scan", () => {
  const p = baseProject(), inv = baseInv();
  p.items[ITEM].quantity = "abc"; // input issue → item unavailable → deliveryCheck skipped
  delete inv.find((i) => i.id === SUP).mix_4000_price;
  const r = api.calcProject(p, inv, baseSettings(), { savedProject: savedOf(p) });
  assert.equal(r.delivery.pricingUnavailable, true, "item gate still holds the delivery");
  assert.equal(r.catalogIssues.filter((i) => i.kind === "concrete_delivery").length, 0, "supplier scan not run under the item gate");
  assert.equal(r.delivery.concreteTotal, EV.heldConcreteTotal);
});

// ---------- getters stay usable standalone ----------
check("getSmallLoadFee/getFuelSurcharge return null, never a guessed amount", () => {
  const sup = { small_load_fee_1_1_75: 145, fuel_surcharge: 35 };
  assert.equal(api.getSmallLoadFee(0.75, sup), 145);
  assert.equal(api.getSmallLoadFee(6, sup), 0, ">=5 yards is free by formula");
  assert.equal(api.getFuelSurcharge(sup), 35);
  assert.equal(api.getSmallLoadFee(0.75, {}), null);
  assert.equal(api.getFuelSurcharge({}), null);
  assert.equal(api.getFuelSurcharge({ fuel_surcharge: 0 }), 0);
});

const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + (RED ? "supplier-model-red-verification.json" : "supplier-model-verification.json"),
  JSON.stringify({ results }, null, 2));
console.log(`supplier-model${RED ? "-red" : ""} passed=${okCount} failed=${results.length - okCount} total=${results.length}`);
if (!RED && okCount !== results.length) process.exit(1);
if (RED && okCount === results.length) { console.log("RED unexpectedly clean — hardening contract not exercised"); process.exit(1); }
