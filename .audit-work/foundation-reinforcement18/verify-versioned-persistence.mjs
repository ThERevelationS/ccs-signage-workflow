import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url), JSON5 = require("json5");
const DIR = ".audit-work/foundation-reinforcement18/", ROOT = "src/components/estimator/foundation/";
const read = file => JSON5.parse(fs.readFileSync(file, "utf8"));
const schema = read("base44/entities/FoundationProject.jsonc");
const previousSchema = read(DIR + "persistence-before-remote-FoundationProject.jsonc");
const inventorySchema = read("base44/entities/FoundationInventory.jsonc");
const previousInventory = read(DIR + "persistence-before-remote-FoundationInventory.jsonc");
const partSchema = read(DIR + "persistence-before-remote-BuilderPart.jsonc");
const json = value => JSON.parse(JSON.stringify(value));
const fields = {
  reinforcement_calculation_version: "integer", reinforcement_design: "object",
  reinforcement_material: "object", reinforcement_proposal: "object",
  reinforcement_cost_snapshot: "object", reinforcement_acceptance: "object",
  rebar_material_cost: "number", rebar_labor_cost: "number", rebar_labor_hours: "number",
  rebar_geometry_feet: "number", rebar_geometry_weight_lbs: "number", rebar_connection_count: "integer",
};
const props = schema.properties.items.items.properties;
await build({
  stdin: {
    contents: `export { calcProject } from "./${ROOT}foundationCalc.js";
export { createFoundationReinforcementDraft } from "./${ROOT}foundationReinforcementDraft.js";
export { createFoundationReinforcementProposal, acceptFoundationReinforcementProposal } from "./${ROOT}foundationReinforcementProposal.js";
export { foundationReinforcementPartDescriptors } from "./${ROOT}foundationReinforcementPartDescriptors.js";
export { createFoundationTemplateSnapshot, prepareFoundationTemplatePatch } from "./${ROOT}foundationTemplateModel.js";`,
    resolveDir: process.cwd(), loader: "js", sourcefile: "persistence-pure-entry.js",
  }, bundle: true, platform: "node", format: "esm", outfile: DIR + "persistence-pure-bundle.mjs",
});
const builtIO = await build({
  entryPoints: ["src/components/estimator/builder/sourceProjectPersistence.js"],
  bundle: true, platform: "node", format: "esm", outfile: DIR + "persistence-io-bundle.mjs", metafile: true,
  plugins: [{ name: "only-offline-io-seams", setup(builder) {
    builder.onResolve({ filter: /^@\/components\/(staff\/staffEntities|estimator\/estimateMutationGuard)$/ },
      args => ({ path: args.path, namespace: "offline" }));
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({
      contents: args.path.endsWith("staffEntities")
        ? `export const staffEntities = new Proxy({}, { get() { throw Error("Unexpected business-data API in offline persistence gate."); } });`
        : `export function assertEstimateProductMutationAllowed() { throw Error("Linked-estimate authorization is outside this offline, unlinked-source gate."); }`,
      loader: "js",
    }));
  } }],
});
assert.ok(!Object.keys(builtIO.metafile.inputs).some(file => file.includes("base44Client") || file.includes("node_modules/@base44/")));
const core = await import(pathToFileURL(path.resolve(DIR + "persistence-pure-bundle.mjs")));
const io = await import(pathToFileURL(path.resolve(DIR + "persistence-io-bundle.mjs")));
const base = read(DIR + "active-v2-dispatch-frozen-inputs.json").item;
const stamp = "2026-11-07T12:00:00.000Z", sourceId = "synthetic-persistence-source";
const legacyItem = structuredClone(base);
for (const key of Object.keys(fields)) delete legacyItem[key];
Object.assign(legacyItem, { reinforcement_calculation_version: 1, rebar_cost: 262.8, item_total_cost: 439.05 });
const legacy = { id: sourceId, updated_date: stamp, project_name: "Synthetic persistence only", items: [legacyItem] };
const rawDraft = core.createFoundationReinforcementDraft(base);
rawDraft.design.cover_inches.side = "3";
const context = project => ({ loaded: true, ownerId: "synthetic-owner", sourceId,
  sourceUpdatedAt: project.updated_date, estimateId: null, estimateUpdatedAt: null, generation: 1, editRevision: 1 });
function accepted(project = legacy, draft = rawDraft, proposalId = "synthetic-persistence-preview") {
  const input = { project, savedProject: project, inventory: [], settings: {}, context: context(project),
    componentId: "synthetic", proposalId, rawDraft: draft };
  const preliminary = core.createFoundationReinforcementProposal(input);
  input.acknowledgments = { preliminary: true, warningCodes: [...preliminary.warningCodes] };
  const proposal = core.createFoundationReinforcementProposal(input);
  assert.equal(proposal.canAccept, true, JSON.stringify(proposal.issues));
  const result = core.acceptFoundationReinforcementProposal({ ...input, proposal,
    requestedId: proposalId, activeProposalId: proposalId, acceptedAt: stamp });
  assert.equal(result.ok, true, result.message);
  return result.project;
}
// The mock deliberately retains only declared item fields, to discriminate a
// missing schema declaration from successful, exact client-side readback.
function entity(initial, declaration = props, nextStamp = "2026-11-07T12:00:01.000Z") {
  let row = json(initial);
  const calls = { writes: 0, gets: 0 };
  return {
    calls, inspect: () => json(row),
    async updateMany(query, update) {
      if (query.id !== row.id || query.updated_date !== row.updated_date) return { updated: 0 };
      const data = json(update.$set);
      if (data.items) data.items = data.items.map(item =>
        Object.fromEntries(Object.entries(item).filter(([key]) => Object.hasOwn(declaration, key))));
      row = { ...row, ...data, updated_date: nextStamp }; calls.writes += 1;
      return { updated: 1 };
    },
    async get(id) { calls.gets += 1; assert.equal(id, row.id); return json(row); },
  };
}
const patch = project => ({ items: project.items });
const save = (target, project, expectedUpdatedAt = stamp) => io.updateBuilderSourceProject({
  entity: target, sourceId, expectedUpdatedAt, data: patch(project), estimateId: "", label: "Synthetic source",
});
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
}
const adopted = accepted();
fs.writeFileSync(DIR + "versioned-persistence-frozen-inputs.json", JSON.stringify({ legacy, rawDraft, adopted }, null, 2) + "\n");
await check("source schema adds exactly twelve optional fields without modifying old fields, RLS or defaults", () => {
  const stripped = json(schema), itemProps = stripped.properties.items.items.properties;
  for (const [key, type] of Object.entries(fields)) {
    assert.equal(props[key].type, type); assert.equal(Object.hasOwn(props[key], "default"), false);
    assert.ok(!(schema.properties.items.items.required || []).includes(key));
    if (type === "object") assert.equal(props[key].additionalProperties, true);
    delete itemProps[key];
  }
  assert.deepEqual(stripped, previousSchema);
});
await check("catalog adds only explicit optional diameter and weight; missing metadata stays missing", () => {
  const stripped = json(inventorySchema);
  for (const key of ["rebar_diameter_inches", "rebar_weight_lb_per_ft"]) {
    assert.equal(stripped.properties[key].type, "number");
    assert.equal(Object.hasOwn(stripped.properties[key], "default"), false);
    assert.ok(!(stripped.required || []).includes(key)); delete stripped.properties[key];
  }
  assert.deepEqual(stripped, previousInventory);
  assert.deepEqual(json({ rebar_size: "#4" }), { rebar_size: "#4" });
});
await check("existing BuilderPart containers explicitly preserve opaque source, calculation and frozen-basis data", () => {
  for (const key of ["builder_data", "calculation_snapshot", "pricing_basis_snapshot"])
    assert.equal(partSchema.properties[key].additionalProperties, true);
});
await check("unapplied incomplete draft survives transport without changing legacy version or stored amounts", () => {
  const draft = json(rawDraft); draft.design.cover_inches.side = "-unfinished"; draft.material.cost_per_ft = "999";
  const record = json({ ...legacy, items: [{ ...legacy.items[0], reinforcement_proposal: draft }] }).items[0];
  assert.equal(record.reinforcement_calculation_version, 1); assert.equal(record.rebar_cost, 262.8);
  assert.equal(record.item_total_cost, 439.05); assert.deepEqual(record.reinforcement_proposal, draft);
  assert.equal(record.reinforcement_design, undefined);
});
await check("acceptance receipt records exact origin component and source, never engineering approval", () => {
  const item = adopted.items[0], receipt = item.reinforcement_acceptance;
  assert.equal(receipt.component_id, "synthetic"); assert.equal(receipt.source_id, sourceId);
  assert.equal(receipt.owner_id, "synthetic-owner"); assert.equal(receipt.source_updated_at, stamp);
  assert.equal(receipt.engineering_approved, false); assert.equal(item.reinforcement_cost_snapshot.engineering_approved, false);
  assert.equal(Math.round(item.rebar_cost * 100), 11200); assert.equal(Math.round(item.item_total_cost * 100), 28825);
  assert.equal(Object.hasOwn(item, "reinforcement_proposal"), false);
});
await check("real conditional-update helper exactly reads back version, design, material, split, basis and receipt", async () => {
  const target = entity(legacy), saved = await save(target, adopted);
  assert.equal(target.calls.writes, 1); assert.equal(target.calls.gets, 1);
  assert.deepEqual(saved.items, json(adopted.items));
  for (const key of Object.keys(fields).filter(key => key !== "reinforcement_proposal"))
    assert.ok(Object.hasOwn(saved.items[0], key), key);
  assert.equal(io.sourcePatchMatches(saved, patch(adopted)), true);
});
await check("a backend dropping undeclared versioned metadata fails client readback instead of acknowledging partial data", async () => {
  const target = entity(legacy, previousSchema.properties.items.items.properties);
  await assert.rejects(save(target, adopted), /changed in another session/);
  assert.equal(target.calls.writes, 1); assert.equal(target.calls.gets, 1);
  assert.equal(io.sourcePatchMatches(target.inspect(), patch(adopted)), false);
});
await check("stale source CAS cannot overwrite a different current description or versioned basis", async () => {
  const current = { ...adopted, updated_date: "2026-11-07T12:00:02.000Z" };
  const target = entity(current), edited = json(adopted); edited.items[0].description = "Different stale edit";
  await assert.rejects(save(target, edited), /changed in another session/);
  assert.equal(target.calls.writes, 0); assert.deepEqual(target.inspect(), json(current));
});
await check("authored zero rate and separate labor remain exact after acceptance and schema-projected readback", async () => {
  const draft = json(rawDraft); draft.overrides.cost_per_ft = 0;
  const zero = accepted(adopted, draft, "synthetic-zero-preview"), target = entity(adopted);
  const saved = await save(target, zero), item = saved.items[0];
  assert.equal(item.custom_rebar_cost_per_ft, 0); assert.equal(item.rebar_rate, 0);
  assert.equal(item.rebar_material_cost, 0); assert.equal(Math.round(item.rebar_labor_cost * 100), 7200);
  assert.equal(Math.round(item.item_total_cost * 100), 24825); assert.equal(item.rebar_geometry_feet, 20);
  assert.equal(item.reinforcement_cost_snapshot.material.rate_source, "custom_rebar_cost_per_ft");
  assert.deepEqual(item, json(zero.items[0]));
});
await check("newly edited raw proposals persist at source but never enter authoritative Builder definitions", async () => {
  const edited = json(adopted); edited.items[0].reinforcement_proposal = json(rawDraft);
  edited.items[0].reinforcement_proposal.material.cost_per_ft = "999";
  const target = entity(legacy), saved = await save(target, edited);
  assert.equal(saved.items[0].reinforcement_proposal.material.cost_per_ft, "999");
  const parts = core.foundationReinforcementPartDescriptors({ item: saved.items[0], itemIndex: 0 });
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map(part => Math.round(part.extended_cost * 100)), [4000, 7200]);
  for (const part of json(parts)) {
    assert.equal(Object.hasOwn(part.builder_data, "reinforcement_proposal"), false);
    assert.equal(part.builder_data.reinforcement_acceptance.component_id, "synthetic");
    assert.equal(part.pricing_basis_snapshot.reinforcement.procurement_ready, false);
  }
});
await check("disabled v2 needs no material/design and removes old live steel snapshot in JSON replacement", async () => {
  const raw = json(adopted); raw.items[0].include_rebar = false;
  delete raw.items[0].reinforcement_design; delete raw.items[0].reinforcement_material;
  const calculation = core.calcProject(raw, [], {}, { savedProject: adopted });
  assert.equal(calculation.inputIssues.length, 0); assert.equal(calculation.catalogIssues.length, 0);
  const target = entity(adopted), saved = await save(target, { ...raw, items: calculation.items });
  assert.equal(saved.items[0].rebar_cost, 0);
  assert.equal(Object.hasOwn(saved.items[0], "reinforcement_cost_snapshot"), false);
  assert.deepEqual(core.foundationReinforcementPartDescriptors({ item: saved.items[0], itemIndex: 0 }), []);
});
await check("template copies retain raw draft and historical origin receipt without inventing a new acceptance", () => {
  const raw = json(adopted); raw.items[0].reinforcement_proposal = json(rawDraft);
  let id = 0;
  const snapshot = core.createFoundationTemplateSnapshot(raw);
  const copy = core.prepareFoundationTemplatePatch(snapshot, { createId: kind => `copied-${kind}-${++id}` });
  const item = copy.items[0];
  assert.notEqual(item.component_id, "synthetic");
  assert.deepEqual(item.reinforcement_acceptance, raw.items[0].reinforcement_acceptance);
  assert.equal(item.reinforcement_acceptance.component_id, "synthetic");
  assert.deepEqual(item.reinforcement_proposal, rawDraft);
  assert.equal(item.reinforcement_acceptance.engineering_approved, false);
});
fs.writeFileSync(DIR + "versioned-persistence-verification.json", JSON.stringify({
  synthetic: true, liveAuthorizationVerified: false, realBase44StorageVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Versioned persistence: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
