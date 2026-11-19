import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const source = fs.readFileSync("src/components/estimator/builder/partSync.js", "utf8");
const dependencies = new Map();
for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g))
  dependencies.set(m[2], m[1].split(",").map(s => s.trim()).filter(Boolean));
globalThis.__syncExternalCalls = [];
const compiled = await build({
  stdin: { contents: source + "\nexport { setAtPath };\n", sourcefile: "partSync-planning-fixture.js", resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false, outdir: "out",
  plugins: [{ name: "block-all-live-operations", setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (/foundationReinforcement(?:PartDescriptors|Basis|FrozenPricing)(?:\.js)?$/.test(args.path))
        return { path: path.resolve("src/components/estimator/foundation", path.basename(args.path) + (args.path.endsWith(".js") ? "" : ".js")) };
      if (args.path === "./foundationGeometryInputs" && args.importer.endsWith("foundationReinforcementBasis.js"))
        return { path: path.resolve("src/components/estimator/foundation/foundationGeometryInputs.js") };
      if (!dependencies.has(args.path)) throw Error(`Unexpected import ${args.path}`);
      return { path: args.path, namespace: "blocked" };
    });
    b.onLoad({ filter: /.*/, namespace: "blocked" }, args => ({
      contents: dependencies.get(args.path).map(name => `export const ${name}=()=>{globalThis.__syncExternalCalls.push(${JSON.stringify(name)});throw Error("Live/persistence dependency forbidden in planning fixture");};`).join("\n"), loader: "js",
    }));
  } }],
});
const { syncBuilderParts: sync, setAtPath, extractBuilderParts, acceptBuilderPartPrices } =
  await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const clone = structuredClone;
const base = JSON.parse(fs.readFileSync(dir + "part-descriptors-fixture.json", "utf8"));
const selectedRow = { id: "selected-other", material_name: "Selected steel", material_type: "rebar", rebar_size: "#8",
  cost_per_unit: 2, unit: "ft", rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, updated_date: "v1" };
const legacyRow = { id: "legacy-by-size", material_name: "Legacy #4", material_type: "rebar", rebar_size: "#4", cost_per_unit: 9, unit: "ft" };
const catalogs = { FoundationInventory: { rows: [legacyRow, selectedRow], byId: new Map([[legacyRow.id, legacyRow], [selectedRow.id, selectedRow]]) } };
const builder = { id: "synthetic-builder", module_key: "foundation", price_state: "current" };
const timestamp = "2026-11-06T12:00:00.000Z";
const plan = (item, existing, options = {}) => sync({ builderProduct: builder, sourceProject: { items: [item] },
  catalogsOverride: catalogs, existingPartsOverride: existing, planOnly: true, planTimestamp: timestamp, ...options });
const identify = parts => parts.map((p, i) => ({ ...clone(p), id: `synthetic-part-${i}`, updated_date: "part-v1" }));
const manual = () => {
  const x = clone(base); x.reinforcement_material = { kind: "manual", name: "Quoted manual steel", reason: "Supplier quote" };
  Object.assign(x.reinforcement_cost_snapshot.material, { kind: "manual", name: "Quoted manual steel", inventory_id: null,
    inventory_updated_date: null, reason: "Supplier quote", rate_source: "manual" });
  return x;
};
const zero = () => {
  const x = clone(base); Object.assign(x, { rebar_rate: 0, custom_rebar_cost_per_ft: 0, rebar_material_cost: 0, rebar_cost: 72 });
  Object.assign(x.reinforcement_cost_snapshot.material, { cost_per_ft: 0, rate_source: "custom_rebar_cost_per_ft" });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  x.reinforcement_cost_snapshot.basis.cost_per_ft = 0; return x;
};
const freeze = x => { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const changedCatalog = patch => {
  const selected = { ...clone(selectedRow), ...patch }, old = clone(legacyRow);
  return { FoundationInventory: { rows: [old, selected], byId: new Map([[old.id, old], [selected.id, selected]]) } };
};
const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); } };
const seeded = identify((await plan(base, [], { builderProduct: { ...builder, price_state: "unchecked" } })).parts);
await check("unchecked baseline preserves exact split and per-unit labor manual cost", async () => {
  const p = await plan(base, [], { builderProduct: { ...builder, price_state: "unchecked" } });
  assert.equal(p.frozenPartsTotal, 112); assert.equal(p.currentPartsTotal, 112);
  assert.equal(p.parts[0].frozen_unit_cost, 2); assert.equal(p.parts[0].frozen_extended_cost, 40);
  assert.equal(p.parts[1].manual_cost, 60); assert.equal(p.parts[1].frozen_unit_cost, 60); assert.equal(p.parts[1].frozen_extended_cost, 72);
});
await check("explicit zero baseline never uses positive inventory price", async () => {
  const p = await plan(zero(), [], { builderProduct: { ...builder, price_state: "unchecked" } });
  assert.equal(p.parts[0].frozen_unit_cost, 0); assert.equal(p.parts[0].current_unit_cost, 0);
  assert.equal(p.parts[0].frozen_extended_cost, 0); assert.equal(p.frozenPartsTotal, 72);
});
await check("recalculated zero current price does not silently accept over frozen40", async () => {
  const p = await plan(zero(), seeded);
  assert.equal(p.parts[0].current_extended_cost, 0); assert.equal(p.parts[0].frozen_extended_cost, 40);
  assert.equal(p.parts[0].frozen_unit_cost, 2); assert.equal(p.frozenPartsTotal, 112); assert.equal(p.currentPartsTotal, 72);
});
await check("catalog to manual clears current link/candidates, keeps original and frozen history", async () => {
  const p = await plan(manual(), seeded), m = p.parts[0];
  assert.equal(m.inventory_item_id, ""); assert.equal(m.inventory_entity, ""); assert.equal(m.inventory_link_state, "manual");
  assert.equal(m.original_inventory_item_id, "selected-other"); assert.equal(m.reattach_candidate_id, "");
  assert.equal(m.reattach_candidate_name, ""); assert.deepEqual(m.current_inventory_snapshot, {});
  assert.deepEqual(m.frozen_inventory_snapshot, seeded[0].frozen_inventory_snapshot);
  assert.equal(m.manual_cost_override, true); assert.equal(m.manual_cost, 2);
  assert.equal(p.detachedCount, 0); assert.equal(p.frozenPartsTotal, 112); assert.equal(m.price_state, "changed");
});
await check("repeat manual saves never reattach through historical original ID", async () => {
  const first = identify((await plan(manual(), seeded)).parts), p = await plan(manual(), first);
  assert.equal(p.parts[0].inventory_link_state, "manual"); assert.equal(p.parts[0].inventory_entity, "");
  assert.equal(p.parts[0].reattach_candidate_id, ""); assert.equal(p.detachedCount, 0); assert.equal(p.changedCount, 0);
});
await check("manual to catalog disables manual override and attaches only selected ID", async () => {
  const previous = identify((await plan(manual(), seeded)).parts), p = await plan(base, previous), m = p.parts[0];
  assert.equal(m.inventory_entity, "FoundationInventory"); assert.equal(m.inventory_item_id, "selected-other");
  assert.equal(m.inventory_link_state, "attached"); assert.equal(m.manual_cost_override, false); assert.equal(m.frozen_extended_cost, 40);
  const update = p.partWritePlan.find(step => step.operation === "update" && step.part_key === m.part_key);
  assert.equal(Object.hasOwn(update.patch, "manual_cost"), false, "Catalog patch omits manual_cost; JSON drops undefined but CAS still compares desired keys");
});
await check("only explicit accept replaces frozen40 with known manual0", async () => {
  const x = manual(); x.rebar_rate = 0; x.rebar_material_cost = 0; x.rebar_cost = 72;
  x.reinforcement_cost_snapshot.material.cost_per_ft = 0; x.reinforcement_cost_snapshot.basis.cost_per_ft = 0;
  Object.assign(x.reinforcement_cost_snapshot.amounts, { material_cost: 0, steel_cost: 72 });
  const p = await plan(x, seeded, { acceptPrices: true }), m = p.parts[0];
  assert.equal(m.frozen_unit_cost, 0); assert.equal(m.frozen_extended_cost, 0); assert.equal(m.manual_cost, 0);
  assert.deepEqual(m.frozen_inventory_snapshot, {}); assert.equal(m.last_price_update_at, timestamp); assert.equal(p.frozenPartsTotal, 72);
});
await check("intentional detached override retains amount, quantity and manual value", async () => {
  const old = clone(seeded); Object.assign(old[0], { builder_sync_state: "detached_override", quantity: 7,
    frozen_unit_cost: 5, frozen_extended_cost: 35, current_unit_cost: 5, current_extended_cost: 35, manual_cost_override: true, manual_cost: 5 });
  const p = await plan(manual(), old, { acceptPrices: true }), m = p.parts[0];
  for (const k of ["builder_sync_state", "quantity", "frozen_unit_cost", "frozen_extended_cost", "current_unit_cost", "current_extended_cost", "manual_cost_override", "manual_cost"])
    assert.equal(m[k], old[0][k], k);
  assert.equal(p.detachedCount, 1);
});
await check("replacement path changes inventory ID, never destroys the material object", async () => {
  const [m] = extractBuilderParts("foundation", { items: [base] }, catalogs), patched = { items: [clone(base)] };
  assert.equal(m.source_path, "items[0].reinforcement_material.inventory_id");
  assert.equal(setAtPath(patched, m.source_path, "replacement-id"), true);
  assert.equal(patched.items[0].reinforcement_material.kind, "catalog");
  assert.equal(patched.items[0].reinforcement_material.inventory_id, "replacement-id");
  assert.throws(() => extractBuilderParts("foundation", patched, catalogs), "Recalculation is still required before syncing a changed material basis");
});
await check("legacy unlinked labor keeps its existing per-job amount convention", async () => {
  const x = clone(base); x.reinforcement_calculation_version = 1;
  const p = await plan(x, [], { builderProduct: { ...builder, price_state: "unchecked" } });
  const l = p.parts.find(part => part.part_type === "labor"); assert.equal(l.quantity, 1); assert.equal(l.manual_cost, 72);
});
await check("fresh saved catalog proof works without trusting a caller recalculation flag", async () => {
  const p = await plan(base, seeded), m = p.parts[0];
  assert.equal(p.recalcRequired, false);
  assert.equal(m.pricing_basis_snapshot.reinforcement_catalog_basis_current, true);
  assert.deepEqual(m.pricing_basis_snapshot.builder_calculated_inventory_pricing, m.pricing_basis_snapshot.inventory_pricing);
});
await check("caller recalculated=true cannot stamp a stale saved catalog as calculated", async () => {
  const p = await plan(base, seeded, { catalogsOverride: changedCatalog({ cost_per_unit: 9, updated_date: "v2" }), builderRecalculated: true });
  const m = p.parts[0];
  assert.equal(p.recalcRequired, true); assert.equal(p.frozenPartsTotal, 112);
  assert.equal(m.current_unit_cost, 2); assert.equal(m.current_extended_cost, 40);
  assert.equal(m.current_inventory_snapshot.cost_per_unit, 9);
  assert.equal(m.pricing_basis_snapshot.reinforcement_catalog_basis_current, false);
  assert.deepEqual(m.pricing_basis_snapshot.builder_calculated_inventory_pricing, {});
});
await check("new parts added to an existing priced builder also carry the recalculation requirement", async () => {
  const p = await plan(base, [], { catalogsOverride: changedCatalog({ updated_date: "v2" }), builderRecalculated: true });
  assert.equal(p.recalcRequired, true); assert.match(p.recalcReason, /reinforcement catalog basis/i);
  assert.equal(p.parts[0].frozen_extended_cost, 0); assert.equal(p.parts[0].current_extended_cost, 40);
  assert.equal(p.parts[0].pricing_basis_snapshot.reinforcement_catalog_basis_current, false);
});
await check("size changes with unchanged price still require source recalculation", async () => {
  const p = await plan(base, seeded, { catalogsOverride: changedCatalog({ rebar_diameter_inches: 0.75 }), builderRecalculated: true });
  assert.equal(p.recalcRequired, true); assert.equal(p.frozenPartsTotal, 112);
});
await check("unsupported catalog units cannot be certified by a stored ft label", async () => {
  const p = await plan(base, seeded, { catalogsOverride: changedCatalog({ unit: "each" }), builderRecalculated: true });
  assert.equal(p.recalcRequired, true); assert.equal(p.parts[0].pricing_basis_snapshot.reinforcement_catalog_basis_current, false);
});
await check("unknown weight or missing catalog revision never becomes current proof", async () => {
  for (const patch of [{ rebar_weight_lb_per_ft: null }, { updated_date: "" }]) {
    const p = await plan(base, seeded, { catalogsOverride: changedCatalog(patch), builderRecalculated: true });
    assert.equal(p.recalcRequired, true); assert.equal(p.frozenPartsTotal, 112);
  }
});
await check("stale basis cannot establish an unchecked baseline or accept frozen prices", async () => {
  const catalog = changedCatalog({ updated_date: "v2" });
  for (const options of [{ acceptPrices: true }, { builderProduct: { ...builder, price_state: "unchecked" } }]) {
    await assert.rejects(plan(base, seeded, { ...options, catalogsOverride: catalog, builderRecalculated: true }),
      error => error.code === "FOUNDATION_REINFORCEMENT_RECALC_REQUIRED");
  }
});
await check("missing catalog retains detached review rather than fabricating a fresh basis", async () => {
  const c = { FoundationInventory: { rows: [legacyRow], byId: new Map([[legacyRow.id, legacyRow]]) } };
  const p = await plan(base, seeded, { catalogsOverride: c, builderRecalculated: true });
  assert.equal(p.detachedCount, 1); assert.equal(p.frozenPartsTotal, 112);
  assert.equal(p.parts[0].pricing_basis_snapshot.reinforcement_catalog_basis_current, false);
});
await check("part acceptance rejects stale proof even if parent flag or monetary prices look unchanged", async () => {
  const p = await plan(base, seeded, { catalogsOverride: changedCatalog({ rebar_diameter_inches: 0.75 }), builderRecalculated: true });
  for (const price_state of ["current", "unchecked"]) {
    const result = await acceptBuilderPartPrices(builder.id, { builderOverride: { ...builder, price_state, price_recalc_required: false },
      partsOverride: identify(p.parts), apply: false, timestamp });
    assert.equal(result.recalcRequired, true); assert.equal(result.changedParts.length, 0);
  }
});
await check("fresh explicit zero override is retained with positive catalog pricing", async () => {
  const p = await plan(zero(), seeded, { builderRecalculated: true });
  assert.equal(p.recalcRequired, false); assert.equal(p.parts[0].current_unit_cost, 0);
  assert.equal(p.parts[0].pricing_basis_snapshot.reinforcement_catalog_basis_current, true);
});
await check("new frozen baselines record both price quantities and their correct units", async () => {
  const p = await plan(base, [], { builderProduct: { ...builder, price_state: "unchecked" } });
  const material = p.parts[0].pricing_basis_snapshot.reinforcement_frozen_pricing;
  const labor = p.parts[1].pricing_basis_snapshot.reinforcement_frozen_pricing;
  assert.equal(material.state, "recorded"); assert.equal(material.quantity, 20); assert.equal(material.unit, "ft"); assert.equal(material.extended_cost, 40);
  assert.equal(labor.quantity, 1.2); assert.equal(labor.unit, "hr"); assert.equal(labor.unit_cost, 60); assert.equal(labor.extended_cost, 72);
});
await check("legacy per-job budgets never acquire an invented frozen hourly basis", async () => {
  const legacy = clone(base); legacy.reinforcement_calculation_version = 1;
  const old = identify((await plan(legacy, [], { builderProduct: { ...builder, price_state: "unchecked" } })).parts);
  const p = await plan(base, old), labor = p.parts.find(row => row.part_type === "labor");
  assert.equal(labor.unit, "hr"); assert.equal(labor.frozen_unit_cost, 72); assert.equal(labor.frozen_extended_cost, 72);
  assert.deepEqual(labor.pricing_basis_snapshot.reinforcement_frozen_pricing, { version: 1, state: "unrecorded" });
});
const largerDeclaredSnapshot = () => {
  const x = clone(base); Object.assign(x, { rebar_feet: 40, rebar_geometry_feet: 40,
    rebar_weight_lbs: 26.72, rebar_geometry_weight_lbs: 26.72, rebar_material_cost: 80, rebar_cost: 152 });
  Object.assign(x.reinforcement_cost_snapshot.amounts, { priced_feet: 40, geometry_feet: 40,
    priced_weight_lbs: 26.72, geometry_weight_lbs: 26.72, material_cost: 80, steel_cost: 152 });
  return x;
};
await check("current40ft80 does not overwrite frozen20ft40 or its physical snapshot", async () => {
  const p = await plan(largerDeclaredSnapshot(), seeded), m = p.parts[0], f = m.pricing_basis_snapshot.reinforcement_frozen_pricing;
  assert.equal(m.quantity, 40); assert.equal(m.current_extended_cost, 80); assert.equal(m.frozen_extended_cost, 40);
  assert.equal(f.quantity, 20); assert.equal(f.extended_cost, 40); assert.equal(f.reinforcement_snapshot.physical_quantity_ft, 20);
  assert.equal(m.pricing_basis_snapshot.reinforcement.physical_quantity_ft, 40);
});
await check("explicit sync price acceptance records current40ft80 as the new financial basis", async () => {
  const p = await plan(largerDeclaredSnapshot(), seeded, { acceptPrices: true }), f = p.parts[0].pricing_basis_snapshot.reinforcement_frozen_pricing;
  assert.equal(f.quantity, 40); assert.equal(f.extended_cost, 80); assert.equal(p.frozenPartsTotal, 152);
});
await check("price-acceptance planning records new context without mutating the previous basis", async () => {
  const p = await plan(largerDeclaredSnapshot(), seeded), input = identify(p.parts), before = JSON.stringify(input);
  const r = await acceptBuilderPartPrices(builder.id, { builderOverride: builder, partsOverride: input, apply: false, timestamp });
  const patch = r.acceptancePlan.part_updates.find(row => row.part_id === input[0].id).patch;
  assert.equal(patch.pricing_basis_snapshot.reinforcement_frozen_pricing.quantity, 40);
  assert.equal(patch.pricing_basis_snapshot.reinforcement_frozen_pricing.extended_cost, 80);
  const change = r.changedParts.find(row => row.part_id === input[0].id);
  assert.equal(change.previous_reinforcement_frozen_pricing.quantity, 20);
  assert.equal(change.new_reinforcement_frozen_pricing.quantity, 40);
  assert.equal(JSON.stringify(input), before);
});
await check("accepted removals clear the active frozen context rather than fabricating a zero-rate recipe", async () => {
  const off = clone(base); off.include_rebar = false;
  const p = await plan(off, seeded), rows = identify(p.parts);
  const r = await acceptBuilderPartPrices(builder.id, { builderOverride: builder, partsOverride: rows, apply: false, timestamp });
  for (const step of r.acceptancePlan.part_updates) {
    assert.equal(step.patch.is_active, false); assert.equal(step.patch.frozen_extended_cost, 0);
    assert.deepEqual(step.patch.pricing_basis_snapshot.reinforcement_frozen_pricing, { version: 1, state: "unrecorded" });
  }
});
await check("ordinary refresh rejects a corrupt recorded context instead of silently repairing it", async () => {
  const bad = clone(seeded); bad[0].pricing_basis_snapshot.reinforcement_frozen_pricing.quantity = 21;
  await assert.rejects(plan(base, bad), error => error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID");
});
await check("unrecorded contexts are isolated between parts and later planning calls", async () => {
  const p = await plan(base, []), m = p.parts[0].pricing_basis_snapshot.reinforcement_frozen_pricing;
  const l = p.parts[1].pricing_basis_snapshot.reinforcement_frozen_pricing;
  assert.notStrictEqual(m, l); m.unexpected = "changed copy";
  assert.equal(l.unexpected, undefined);
  const next = await plan(base, []);
  assert.deepEqual(next.parts[0].pricing_basis_snapshot.reinforcement_frozen_pricing, { version: 1, state: "unrecorded" });
});
await check("explicit v2 removal needs no replacement for a deleted catalog item, but live detached parts still block", async () => {
  const off = clone(base); off.include_rebar = false;
  const old = clone(seeded); Object.assign(old[0], { inventory_link_state: "detached", current_inventory_snapshot: {} });
  old[0].pricing_basis_snapshot.reinforcement_catalog_basis_current = false;
  const missing = { FoundationInventory: { rows: [legacyRow], byId: new Map([[legacyRow.id, legacyRow]]) } };
  const p = await plan(off, old, { catalogsOverride: missing }), rows = identify(p.parts);
  const r = await acceptBuilderPartPrices(builder.id, { builderOverride: builder, partsOverride: rows, apply: false, timestamp });
  assert.equal(r.detachedCount, 0); assert.equal(r.recalcRequired, false);
  assert.equal(r.acceptancePlan.part_updates.length, 2);
  for (const step of r.acceptancePlan.part_updates) {
    assert.equal(step.patch.is_active, false); assert.equal(step.patch.frozen_extended_cost, 0);
    assert.deepEqual(step.patch.pricing_basis_snapshot.reinforcement_frozen_pricing, { version: 1, state: "unrecorded" });
  }
  const live = clone(old[0]); Object.assign(live, { id: "live-detached-part", part_key: "another-live-foundation-rebar" });
  const blocked = await acceptBuilderPartPrices(builder.id, { builderOverride: builder, partsOverride: [...rows, live], apply: false, timestamp });
  assert.equal(blocked.detachedCount, 1); assert.equal(blocked.acceptancePlan, undefined);
});
await check("reattachment cannot relabel an old v2 cost snapshot with a replacement inventory id", async () => {
  const source = { items: [clone(base)] }, before = JSON.stringify(source);
  assert.equal(setAtPath(source, "items[0].reinforcement_material.inventory_id", "replacement"), true);
  const patched = JSON.stringify(source);
  assert.notEqual(patched, before);
  await assert.rejects(plan(source.items[0], seeded), error =>
    error.code === "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID" &&
    /Recalculate and save Foundation/.test(error.message));
  assert.equal(JSON.stringify(source), patched);
  assert.deepEqual(globalThis.__syncExternalCalls, []);
});
await check("fresh replacement source keeps the original frozen material until explicit same-money acceptance", async () => {
  const replacement = { ...clone(selectedRow), id: "replacement", updated_date: "v2" };
  const nextCatalog = { FoundationInventory: { rows: [legacyRow, replacement],
    byId: new Map([[legacyRow.id, legacyRow], [replacement.id, replacement]]) } };
  const fresh = clone(base); fresh.reinforcement_material.inventory_id = replacement.id;
  Object.assign(fresh.reinforcement_cost_snapshot.material, {
    inventory_id: replacement.id, inventory_updated_date: replacement.updated_date,
  });
  const p = await plan(fresh, seeded, { catalogsOverride: nextCatalog });
  const material = p.parts.find(row => row.part_type === "material");
  assert.equal(material.inventory_item_id, "replacement"); assert.equal(p.recalcRequired, false);
  assert.equal(p.frozenPartsTotal, 112); assert.equal(p.currentPartsTotal, 112);
  assert.equal(material.pricing_basis_snapshot.reinforcement.material.inventory_id, "replacement");
  assert.equal(material.pricing_basis_snapshot.reinforcement_frozen_pricing.reinforcement_snapshot.material.inventory_id, "selected-other");
  const rows = identify(p.parts);
  const accepted = await acceptBuilderPartPrices(builder.id, {
    builderOverride: builder, partsOverride: rows, apply: false, timestamp,
  });
  const change = accepted.changedParts.find(row => row.part_id === rows.find(row => row.part_type === "material").id);
  assert.equal(change.previous_reinforcement_frozen_pricing.reinforcement_snapshot.material.inventory_id, "selected-other");
  assert.equal(change.new_reinforcement_frozen_pricing.reinforcement_snapshot.material.inventory_id, "replacement");
  assert.equal(change.previous_reinforcement_frozen_pricing.extended_cost, 40);
  assert.equal(change.new_reinforcement_frozen_pricing.extended_cost, 40);
});
await check("planning is frozen-input safe and never executes live operations", async () => {
  const x = freeze(clone(base)), old = freeze(clone(seeded)), before = JSON.stringify([x, old]);
  const p = await plan(x, old); assert.equal(JSON.stringify([x, old]), before); assert.equal(p.writesPerformed, 0);
  assert.deepEqual(globalThis.__syncExternalCalls, []);
});
fs.writeFileSync(dir + "shared-sync-verification.json", JSON.stringify({ synthetic: true, planOnly: true,
  externalCalls: globalThis.__syncExternalCalls, results }, null, 2) + "\n");
console.log(`Shared sync planning: ${results.filter(r => r.ok).length}/${results.length}; failed=${results.filter(r => !r.ok).length}`);
process.exitCode = results.some(r => !r.ok) ? 1 : 0;
