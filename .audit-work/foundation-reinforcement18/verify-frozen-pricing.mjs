import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  stdin: { contents: `
    export * from "./src/components/estimator/foundation/foundationReinforcementFrozenPricing.js";
    export * from "./src/components/estimator/foundation/foundationReinforcementPartDescriptors.js";
  `, resolveDir: process.cwd(), sourcefile: "frozen-pricing-fixture.js" },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { captureFoundationReinforcementFrozenPricing: capture,
  preserveFoundationReinforcementFrozenPricing: preserve,
  foundationReinforcementPricingPresentation: present,
  foundationReinforcementPartDescriptors: descriptors } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const clone = structuredClone;
const base = JSON.parse(fs.readFileSync(dir + "part-descriptors-fixture.json", "utf8"));
const part = (item = base, index = 0) => {
  const d = descriptors({ item, itemIndex: 0 })[index];
  return { ...d, builder_sync_state: "linked", source_module_key: "foundation",
    current_unit_cost: d.unit_cost, current_extended_cost: d.extended_cost,
    frozen_unit_cost: d.unit_cost, frozen_extended_cost: d.extended_cost };
};
const saved = p => ({ ...p, pricing_basis_snapshot: { ...p.pricing_basis_snapshot, reinforcement_frozen_pricing: capture(p) } });
const invalid = fn => assert.throws(fn, error => error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID");
const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); } };
check("material basis records20ft at2 for40 without engineering/procurement approval", () => {
  const f = capture(part());
  assert.equal(f.quantity, 20); assert.equal(f.unit, "ft"); assert.equal(f.unit_cost, 2); assert.equal(f.extended_cost, 40);
  assert.equal(f.reinforcement_snapshot.physical_quantity_ft, 20);
  assert.equal(f.reinforcement_snapshot.engineering_approved, false); assert.equal(f.reinforcement_snapshot.procurement_ready, false);
});
check("labor basis records1.2hr at60 for72, not a per-job72 hourly rate", () => {
  const f = capture(part(base, 1));
  assert.equal(f.quantity, 1.2); assert.equal(f.unit, "hr"); assert.equal(f.unit_cost, 60); assert.equal(f.extended_cost, 72);
});
check("current component and quantity changes never retag a recorded frozen basis", () => {
  const p = saved(part()); p.quantity = 40; p.current_extended_cost = 80;
  p.pricing_basis_snapshot.reinforcement.component_id = "different-current-component";
  p.pricing_basis_snapshot.reinforcement.physical_quantity_ft = 40;
  const f = preserve(p);
  assert.equal(f.quantity, 20); assert.equal(f.extended_cost, 40);
  assert.equal(f.reinforcement_snapshot.component_id, "stable-component"); assert.equal(f.reinforcement_snapshot.physical_quantity_ft, 20);
});
check("missing legacy context stays explicitly unrecorded, never inferred from current fields", () => {
  const p = part(base, 1); p.frozen_unit_cost = 72; p.quantity = 2.4;
  assert.deepEqual(preserve(p), { version: 1, state: "unrecorded" });
});
check("zero rate retains actual frozen20ft, even when current quantity becomes0", () => {
  const x = clone(base); Object.assign(x, { rebar_rate: 0, rebar_material_cost: 0, rebar_cost: 72, custom_rebar_cost_per_ft: 0 });
  Object.assign(x.reinforcement_cost_snapshot.material, { cost_per_ft: 0, rate_source: "custom_rebar_cost_per_ft" });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  const p = saved(part(x)); p.quantity = 0;
  const f = preserve(p); assert.equal(f.quantity, 20); assert.equal(f.unit_cost, 0); assert.equal(f.extended_cost, 0);
});
check("invalid frozen-money reconciliation fails closed", () => {
  const p = saved(part()); p.frozen_extended_cost = 41; invalid(() => preserve(p));
});
check("unknown material weight cannot masquerade as a recorded basis", () => {
  const p = saved(part()); p.pricing_basis_snapshot.reinforcement_frozen_pricing.reinforcement_snapshot.material.weight_lb_per_ft = null;
  invalid(() => preserve(p));
});
check("future versions and unsupported states fail closed", () => {
  for (const patch of [{ version: 2 }, { state: "accepted" }]) {
    const p = saved(part()); Object.assign(p.pricing_basis_snapshot.reinforcement_frozen_pricing, patch); invalid(() => preserve(p));
  }
});
check("unrecorded context cannot smuggle invented quantities", () => {
  const p = part(); p.pricing_basis_snapshot.reinforcement_frozen_pricing = { version: 1, state: "unrecorded", quantity: 20 };
  invalid(() => preserve(p));
});
check("missing current rate cannot silently become0 at capture", () => {
  const p = part(); delete p.current_unit_cost; invalid(() => capture(p));
});
check("wrong stored role or purchasing unit fails closed", () => {
  const p = saved(part()); p.part_type = "labor"; invalid(() => preserve(p));
  const q = saved(part()); q.pricing_basis_snapshot.reinforcement_frozen_pricing.unit = "each"; invalid(() => preserve(q));
});
check("coercive numeric objects are never evaluated", () => {
  const p = saved(part()); let calls = 0;
  p.pricing_basis_snapshot.reinforcement_frozen_pricing.unit_cost = { valueOf() { calls++; return 2; } };
  invalid(() => preserve(p)); assert.equal(calls, 0);
});
check("positive multiplication underflow never creates free steel", () => {
  const p = saved(part()), f = p.pricing_basis_snapshot.reinforcement_frozen_pricing;
  f.quantity = Number.MIN_VALUE; f.unit_cost = Number.MIN_VALUE; f.extended_cost = 0;
  p.frozen_unit_cost = Number.MIN_VALUE; p.frozen_extended_cost = 0; invalid(() => preserve(p));
});
check("capture and preserve clone all nested context independently", () => {
  const p = saved(part()), f = preserve(p);
  f.reinforcement_snapshot.material.name = "Changed copy";
  assert.equal(p.pricing_basis_snapshot.reinforcement_frozen_pricing.reinforcement_snapshot.material.name, "Selected steel");
  assert.equal(p.pricing_basis_snapshot.reinforcement.material.name, "Selected steel");
});
check("malformed root inputs return coded errors", () => {
  for (const value of [null, [], new Date(), "part"]) { invalid(() => capture(value)); invalid(() => preserve(value)); }
});
check("presentation distinguishes recorded frozen and last-calculated quantities", () => {
  const p = saved(part()), view = present(p);
  assert.equal(view.frozenStatus, "recorded"); assert.equal(view.frozen.quantity, 20);
  assert.equal(view.current.quantity, 20); assert.equal(view.frozenAmount, 40);
});
check("unrecorded legacy labor never presents72 as an hourly frozen rate", () => {
  const p = part(base, 1); p.frozen_unit_cost = 72;
  const view = present(p);
  assert.equal(view.frozenStatus, "unrecorded"); assert.equal(view.frozen.unit_cost, undefined);
  assert.equal(view.frozenAmount, 72); assert.equal(view.current.unit_cost, 60);
});
check("independent and non-v2 parts never present source geometry as their live definition", () => {
  for (const state of ["manual", "manual_addon", "detached_override"]) {
    const p = part(); p.builder_sync_state = state; assert.equal(present(p), null);
  }
  assert.equal(present({ ...part(), pricing_basis_snapshot: {} }), null);
});
check("missing last-calculated rate is unavailable, not a displayed zero", () => {
  const p = saved(part()); delete p.current_unit_cost;
  const view = present(p); assert.equal(view.current, null); assert.equal(view.frozenAmount, 40);
});
check("pending removal does not display obsolete geometry as an active zero-rate design", () => {
  const p = saved(part()); Object.assign(p, { current_unit_cost: 0, current_extended_cost: 0 });
  p.builder_data.__builder_pending_removal = true;
  p.pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
  const view = present(p); assert.equal(view.removalPending, true); assert.equal(view.current, null);
  assert.equal(view.catalogUnverified, false); assert.equal(view.frozenAmount, 40);
});
check("zero priced feet never erase20 physical feet in presentation", () => {
  const x = clone(base); Object.assign(x, { rebar_feet: 0, rebar_weight_lbs: 0, rebar_material_cost: 0, rebar_cost: 72, custom_rebar_qty: 0 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 0, priced_weight_lbs: 0, material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.basis.quantity_override_ft = 0;
  const view = present(part(x));
  assert.equal(view.current.quantity, 0); assert.equal(view.current.extended_cost, 0);
  assert.equal(view.current.reinforcement_snapshot.physical_quantity_ft, 20);
});
fs.writeFileSync(dir + "frozen-pricing-verification.json", JSON.stringify({ synthetic: true, results }, null, 2) + "\n");
console.log(`Frozen pricing context: ${results.filter(r => r.ok).length}/${results.length}; failed=${results.filter(r => !r.ok).length}`);
process.exitCode = results.some(r => !r.ok) ? 1 : 0;
