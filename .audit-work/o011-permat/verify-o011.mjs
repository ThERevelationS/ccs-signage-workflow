// O-011 (CMP-A11) -- v2 per-mat part model: the accepted snapshot's
// cut_schedule decomposes steel into per-mat/role material parts; a priced
// override or pre-schedule snapshot keeps the aggregate part; malformed
// schedules fail the handoff closed.
import assert from "node:assert/strict";
import { foundationReinforcementPartDescriptors as desc } from "./bundle.mjs";

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log("ok", name); };
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const steel = (parts) => parts.filter(p => p.part_subtype === "rebar");

const makeItem = ({ feet = 85, pricedFeet = feet, weightFt = 0.668, schedule = undefined } = {}) => {
  const rate = 2, laborRate = 60, hours = pricedFeet * 0.1;
  const material_cost = pricedFeet * rate, labor_cost = hours * laborRate;
  const snapshot = {
    version: 1, calculation_version: 2, engineering_approved: false,
    amounts: {
      geometry_feet: feet, priced_feet: pricedFeet, connection_count: 0,
      material_cost, labor_hours: hours, labor_cost, steel_cost: material_cost + labor_cost,
      priced_weight_lbs: pricedFeet * weightFt, geometry_weight_lbs: feet * weightFt,
    },
    material: { kind: "manual", reason: "shop mix", pricing_unit: "ft", cost_per_ft: rate, name: "#4 rebar" },
    basis: { unit: "ft", cost_per_ft: rate, labor_rate_per_hour: laborRate, weight_lb_per_ft: weightFt },
    rate_sources: [], supports: null,
  };
  if (schedule !== undefined) snapshot.cut_schedule = schedule;
  const item = {
    component_id: "F-1", reinforcement_calculation_version: 2, include_rebar: true,
    reinforcement_design: { version: 2 }, reinforcement_material: { kind: "manual", reason: "shop mix" },
    rebar_feet: pricedFeet, rebar_rate: rate, rebar_material_cost: material_cost,
    rebar_labor_cost: labor_cost, rebar_labor_hours: hours, rebar_cost: material_cost + labor_cost,
    rebar_geometry_feet: feet, rebar_weight_lbs: pricedFeet * weightFt,
    rebar_geometry_weight_lbs: feet * weightFt, rebar_connection_count: 0,
    reinforcement_cost_snapshot: snapshot,
  };
  return { item, snapshot };
};

check("scheduled snapshot emits per-mat + role steel parts reconciling exactly", () => {
  const s2 = { instance_count: 1, cut_lines: [
    { source_run_id: "mat-a/x", role: "horizontal", mat_id: "mat-a", cut_length_inches: 42, quantity_per_instance: 5, quantity_total: 5 },
    { source_run_id: "mat-a/z", role: "horizontal", mat_id: "mat-a", cut_length_inches: 42, quantity_per_instance: 5, quantity_total: 5 },
    { source_run_id: "mat-b/x", role: "horizontal", mat_id: "mat-b", cut_length_inches: 30, quantity_per_instance: 4, quantity_total: 4 },
    { source_run_id: "pillar/longitudinal", role: "longitudinal", mat_id: null, cut_length_inches: 90, quantity_per_instance: 4, quantity_total: 4 },
  ]}; // mat-a 35, mat-b 10, longitudinal 30 => 75
  const { item } = makeItem({ feet: 75, schedule: s2 });
  const parts = desc({ item, itemIndex: 0 });
  const sp = steel(parts);
  assert.equal(sp.length, 3, `expected 3 steel buckets, got ${sp.map(p=>p.part_key)}`);
  assert.deepEqual(sp.map(p => p.part_key).sort(), [
    "foundation:item:0:rebar:mat:mat-a", "foundation:item:0:rebar:mat:mat-b", "foundation:item:0:rebar:role:longitudinal",
  ]);
  assert.equal(sum(sp, p => p.quantity), 75, "quantities reconcile exactly");
  assert.equal(sum(sp, p => p.extended_cost), item.rebar_material_cost, "extended sums to material_cost");
  assert.equal(sum(sp, p => p.extended_cost), 150);
  assert.ok(sp.every(p => p.part_type === "material" && p.part_subtype === "rebar"));
  const mp = sp[0].pricing_basis_snapshot.reinforcement.mat_parts;
  assert.equal(mp.length, 3);
  assert.ok(Math.abs(mp.find(m => m.id === "mat-a").weight_lbs - 35 * 0.668) < 1e-9);
});

check("quantity override keeps the aggregate part (no invented per-mat price split)", () => {
  const { item } = makeItem({ feet: 75, pricedFeet: 90, schedule: { instance_count: 1, cut_lines: [
    { source_run_id: "m/x", role: "horizontal", mat_id: "m", cut_length_inches: 90, quantity_total: 10 },
  ]}});
  const parts = desc({ item, itemIndex: 0 });
  const sp = steel(parts);
  assert.equal(sp.length, 1);
  assert.equal(sp[0].part_key, "foundation:item:0:rebar");
  assert.equal(sp[0].quantity, 90);
  assert.equal(sp[0].pricing_basis_snapshot.reinforcement.mat_parts.length, 1); // breakdown still rides the basis
});

check("pre-schedule snapshot keeps the aggregate part and empty breakdown", () => {
  const { item } = makeItem({ feet: 75 });
  const parts = desc({ item, itemIndex: 0 });
  const sp = steel(parts);
  assert.equal(sp.length, 1);
  assert.equal(sp[0].part_key, "foundation:item:0:rebar");
  assert.deepEqual(sp[0].pricing_basis_snapshot.reinforcement.mat_parts, []);
});

check("unreconciled schedule fails the handoff closed", () => {
  const { item } = makeItem({ feet: 75, schedule: { instance_count: 1, cut_lines: [
    { source_run_id: "m/x", role: "horizontal", mat_id: "m", cut_length_inches: 12, quantity_total: 5 },
  ]}}); // 5ft != 75
  assert.throws(() => desc({ item, itemIndex: 0 }), /FOUNDATION_REINFORCEMENT_HANDOFF_INVALID|reconcile/);
});

check("malformed cut line fails closed", () => {
  const { item } = makeItem({ feet: 75, schedule: { instance_count: 1, cut_lines: [
    { source_run_id: "m/x", role: "horizontal", mat_id: "m", cut_length_inches: 90, quantity_total: -2 },
  ]}});
  assert.throws(() => desc({ item, itemIndex: 0 }), /quantity_total/);
});

console.log("PASS o011-permat", passed, "checks");
