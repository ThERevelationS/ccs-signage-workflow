import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18", FILE = "src/components/estimator/foundation/foundationReinforcementProposal.js";
buildSync({ entryPoints: [FILE], bundle: true, platform: "node", format: "esm", outfile: `${DIR}/proposal-bundle.mjs` });
const { createFoundationReinforcementProposal: create, acceptFoundationReinforcementProposal: accept } =
  await import(pathToFileURL(path.resolve(`${DIR}/proposal-bundle.mjs`)));
const clone = structuredClone, timestamp = "2026-11-06T12:00:00.000Z";
const item = { component_id: "foundation-one", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true, include_finishing: true, rebar_size: "#4" };
const base = {
  proposalId: "preview-one", componentId: "foundation-one",
  project: { id: "project-one", updated_date: timestamp, items: [item] },
  savedProject: { id: "project-one", updated_date: timestamp, items: [{ ...item, rebar_cost: 262.8, item_total_cost: 439.05 }] },
  context: { loaded: true, ownerId: "synthetic-owner", sourceId: "project-one", sourceUpdatedAt: timestamp,
    estimateId: "estimate-one", estimateUpdatedAt: timestamp, generation: 1, editRevision: 1 },
  inventory: [{ id: "synthetic-rebar", material_type: "rebar", rebar_size: "#4", cost_per_unit: 2,
    rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, unit: "ft" }],
  settings: {},
  rawDraft: { schema_version: 1,
    design: { version: 2, bar_diameter_inches: "0.5", cover_inches: { side: "3", top: "3", bottom: "3" },
      supports: { mode: "off", reason: "Synthetic exclusion, not structural advice" },
      spread: { mats: [{ id: "top", bearing_elevation_inches: "32", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] } },
    material: { kind: "manual", name: "Synthetic manual rebar", reason: "Synthetic explicit per-foot basis", unit: "ft",
      bar_diameter_inches: "0.5", weight_lb_per_ft: "0.668", cost_per_ft: "2" },
    overrides: { quantity_ft: null, cost_per_ft: null } },
};
const results = [];
const near = (a, b) => assert.ok(typeof a === "number" && Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function ready(input = clone(base)) {
  const initial = create(input);
  input.acknowledgments = { preliminary: true, warningCodes: [...(initial.warningCodes || [])] };
  return { input, proposal: create(input) };
}
function apply(proposal, input, extras = {}) {
  return accept({ ...input, proposal, requestedId: proposal.id, activeProposalId: input.proposalId, acceptedAt: timestamp, ...extras });
}
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("unacknowledged valid monetary preview cannot be accepted", () => {
  const p = create(base); assert.equal(p.projection.priceAvailable, true); assert.equal(p.canAccept, false);
  assert.ok(p.issues.some(i => i.code === "reinforcement_proposal_acknowledgment_required"));
});
check("fresh proposal compares current252.8steel/429.05item against112/288.25", () => {
  const { proposal: p } = ready(); assert.equal(p.canAccept, true);
  near(p.comparisons.steel.before, 252.8); near(p.comparisons.steel.proposed, 112); near(p.comparisons.steel.delta, -140.8);
  near(p.comparisons.item.before, 429.05); near(p.comparisons.item.proposed, 288.25); near(p.comparisons.item.delta, -140.8);
  near(p.comparisons.savedSteel, 262.8); near(p.comparisons.savedItem, 439.05);
  assert.equal(p.comparisons.currentProvenance, "Current legacy calculation");
  assert.equal(p.engineeringApproved, false);
});
check("accept returns one immutable project update, typed configuration, exact split and explicit receipt", () => {
  const { input, proposal } = ready(), before = JSON.stringify(input), result = apply(proposal, input);
  assert.equal(result.ok, true); const next = result.project.items[0];
  assert.equal(next.component_id, "foundation-one"); assert.equal(next.reinforcement_calculation_version, 2);
  assert.equal(next.reinforcement_design.bar_diameter_inches, 0.5); near(next.rebar_cost, 112);
  near(next.rebar_material_cost, 40); near(next.rebar_labor_cost, 72); near(next.item_total_cost, 288.25);
  assert.equal(next.reinforcement_acceptance.engineering_approved, false);
  assert.equal(next.reinforcement_acceptance.source_id, "project-one"); assert.equal(next.reinforcement_cost_snapshot.version, 1);
  assert.equal(JSON.stringify(input), before); assert.notEqual(result.project, input.project);
  assert.equal(input.project.items[0].reinforcement_calculation_version, undefined);
});
check("accepted zero aggregate override remains0 and never scales to1ft", () => {
  const input = clone(base); input.rawDraft.overrides.quantity_ft = "0"; const r = ready(input);
  const result = apply(r.proposal, r.input); assert.equal(result.ok, true);
  const next = result.project.items[0]; assert.equal(next.custom_rebar_qty, 0); near(next.rebar_feet, 0); near(next.rebar_labor_cost, 48);
  assert.equal(next.reinforcement_cost_snapshot.amounts.priced_feet, 0);
});
check("accepted zero rate remains0material, not legacy catalog rate", () => {
  const input = clone(base); input.rawDraft.overrides.cost_per_ft = "0"; const r = ready(input);
  const next = apply(r.proposal, r.input).project.items[0]; assert.equal(next.custom_rebar_cost_per_ft, 0);
  near(next.rebar_material_cost, 0); near(next.rebar_labor_cost, 72);
});
check("every raw context identity/revision field invalidates an eligible preview", () => {
  const { input, proposal } = ready();
  for (const field of ["ownerId", "sourceId", "sourceUpdatedAt", "estimateId", "estimateUpdatedAt", "generation", "editRevision", "loaded"]) {
    const next = clone(input); next.context[field] = typeof next.context[field] === "number" ? next.context[field] + 1
      : typeof next.context[field] === "boolean" ? !next.context[field] : next.context[field] + "-changed";
    assert.equal(apply(proposal, next).ok, false, field);
  }
});
check("edit then Undo of raw design still rejects when edit revision advanced", () => {
  const { input, proposal } = ready(); const next = clone(input);
  next.context.editRevision += 2; assert.equal(apply(proposal, next).code, "reinforcement_proposal_stale");
});
check("A-B-A project route cycle rejects with generation advanced", () => {
  const { input, proposal } = ready(); const next = clone(input);
  next.context.generation += 2; assert.equal(apply(proposal, next).code, "reinforcement_proposal_stale");
});
check("raw dimension, override and proposed material changes require new deltas", () => {
  const { input, proposal } = ready();
  for (const alter of [x => { x.project.items[0].length_inches = 48; }, x => { x.rawDraft.overrides.quantity_ft = 0; },
    x => { x.rawDraft.material.cost_per_ft = "3"; }, x => { x.project.excavation_method = "equipment"; }]) {
    const next = clone(input); alter(next); assert.equal(apply(proposal, next).ok, false);
  }
});
check("catalog price/diameter/weight/unit and settings changes reject, including manual-basis catalog refresh", () => {
  const { input, proposal } = ready();
  for (const [field, value] of [["cost_per_unit", 3], ["rebar_diameter_inches", 0.625], ["rebar_weight_lb_per_ft", 1], ["unit", "each"]]) {
    const next = clone(input); next.inventory[0][field] = value; assert.equal(apply(proposal, next).ok, false);
  }
  const next = clone(input); next.settings.foundation_main_labor_rate = 70; assert.equal(apply(proposal, next).ok, false);
});
check("acknowledged source revision changes invalidate even when design is unchanged", () => {
  const { input, proposal } = ready(); const next = clone(input), newer = "2026-11-06T13:00:00.000Z";
  next.savedProject.updated_date = newer; next.context.sourceUpdatedAt = newer;
  assert.equal(apply(proposal, next).code, "reinforcement_proposal_stale");
});
check("acknowledged source monetary changes invalidate comparison without trusting Undo metadata", () => {
  const { input, proposal } = ready(); const next = clone(input); next.savedProject.items[0].rebar_cost = 263;
  assert.equal(apply(proposal, next).ok, false);
});
check("transient item results and unapplied proposal metadata are excluded from raw basis", () => {
  const { input, proposal } = ready(); const next = clone(input);
  Object.assign(next.project.items[0], { rebar_cost: 999999, item_total_cost: -1,
    reinforcement_proposal: { transientPreview: "ignored" }, reinforcement_cost_snapshot: { transientResult: "ignored" } });
  next.project.total_rebar_cost = 99999; next.project.builder_calculation = { total: 99999 };
  assert.equal(apply(proposal, next).ok, true);
});
check("cached wall/pole costs remain in basis because missing-catalog behavior may depend on them", () => {
  const { input, proposal } = ready(); const next = clone(input);
  next.project.poles = [{ component_id: "p", pole_cost: 100 }]; assert.equal(apply(proposal, next).ok, false);
});
check("unrelated component reorder is rejected instead of applying by array index", () => {
  const input = clone(base); input.project.items.push({ ...clone(item), component_id: "foundation-two" });
  const r = ready(input); const next = clone(r.input); next.project.items.reverse();
  assert.equal(apply(r.proposal, next).ok, false); assert.equal(next.project.items[1].component_id, "foundation-one");
});
check("missing or duplicate target component IDs never accept", () => {
  for (const duplicate of [false, true]) {
    const input = clone(base); if (duplicate) input.project.items.push(clone(item)); else input.project.items = [];
    assert.equal(create(input).canAccept, false);
  }
});
check("unknown active version including string2 is not silently downgraded", () => {
  for (const value of [0, "2", 3, "__proto__"]) {
    const input = clone(base); input.project.items[0].reinforcement_calculation_version = value;
    assert.equal(create(input).canAccept, false);
  }
});
check("failed catalog/settings reads yield unavailable proposals without throwing", () => {
  for (const patch of [{ inventory: null }, { inventory: [null] }, { settings: null }, { settings: new Map() }]) {
    assert.equal(create({ ...clone(base), ...patch }).canAccept, false);
  }
});
check("wrong owner/source snapshot and unknown linked-estimate revision fail closed", () => {
  for (const alter of [x => { x.savedProject.id = "different"; }, x => { x.context.estimateUpdatedAt = null; },
    x => { x.context.sourceUpdatedAt = null; }, x => { x.context.generation = 1.5; }]) {
    const input = clone(base); alter(input); assert.equal(create(input).canAccept, false);
  }
});
check("standalone source permits explicit null estimate context but not an omitted context identity", () => {
  const input = clone(base); input.context.estimateId = null; input.context.estimateUpdatedAt = null;
  assert.equal(ready(input).proposal.canAccept, true); delete input.context.estimateId; assert.equal(create(input).canAccept, false);
});
check("negative historical saved costs stay signed when used for current fallback", () => {
  const input = clone(base); input.project.items[0].rebar_layers = -1;
  Object.assign(input.savedProject.items[0], { rebar_cost: -10, item_total_cost: -20 });
  const { proposal } = ready(input); assert.equal(proposal.canAccept, true);
  near(proposal.comparisons.steel.before, -10); near(proposal.comparisons.steel.delta, 122);
  near(proposal.comparisons.item.before, -20); near(proposal.comparisons.item.delta, 308.25);
  assert.equal(proposal.comparisons.currentProvenance, "Acknowledged saved amount");
});
check("unknown prior totals remain unknown, not0 or a fabricated savings delta", () => {
  const input = clone(base); input.project.items[0].rebar_layers = -1; input.savedProject.items = [];
  const { proposal } = ready(input); assert.equal(proposal.canAccept, false);
  assert.equal(proposal.comparisons.steel.before, null); assert.equal(proposal.comparisons.item.delta, null);
});
check("changed/missing warning acknowledgments cannot use an older reviewed basis", () => {
  const { input, proposal } = ready(); assert.ok(proposal.warningCodes.includes("reinforcement_supports_off_explained"));
  const next = clone(input); next.acknowledgments.warningCodes = [];
  assert.equal(apply(proposal, next).ok, false); assert.equal(create(next).canAccept, false);
});
check("exact ID and valid acceptance time are mandatory", () => {
  const { input, proposal } = ready();
  for (const requestedId of ["different", "", null, 1]) assert.equal(apply(proposal, input, { requestedId }).ok, false);
  assert.equal(apply(proposal, input, { acceptedAt: "invalid" }).ok, false);
});
check("superseded or consumed preview ID rejects even when all monetary inputs remain identical", () => {
  const { input, proposal } = ready();
  assert.equal(apply(proposal, input, { activeProposalId: "newer-preview" }).ok, false);
  assert.equal(apply(proposal, input, { activeProposalId: null }).ok, false);
  assert.equal(apply(proposal, input, { activeProposalId: undefined }).ok, false);
});
check("cached preview quantities/costs are never applied; acceptance recomputes fresh", () => {
  const { input, proposal } = ready(); proposal.projection.itemCost.rebar_cost = 999999;
  proposal.prepared.material.cost_per_ft = 999999;
  const result = apply(proposal, input); assert.equal(result.ok, true); near(result.project.items[0].rebar_cost, 112);
  assert.equal(result.project.items[0].reinforcement_material.cost_per_ft, 2);
});
check("one returned commit preserves unrelated rows; simulated single Undo restores full prior project", () => {
  const input = clone(base); input.project.items.push({ ...clone(item), component_id: "foundation-two" });
  input.project.items[0].reinforcement_proposal = clone(input.rawDraft);
  const r = ready(input), before = r.input.project, result = apply(r.proposal, r.input);
  assert.equal(result.ok, true); assert.equal(result.project.items[1], before.items[1]);
  assert.equal(Object.hasOwn(result.project.items[0], "reinforcement_proposal"), false);
  const history = [before]; history.push(result.project); history.pop();
  assert.equal(history[0], before); assert.equal(before.items[0].reinforcement_calculation_version, undefined);
  assert.deepEqual(before.items[0].reinforcement_proposal, input.rawDraft);
});
check("actual version2 current amount comes from accepted config, not legacy rows", () => {
  const first = ready(), accepted = apply(first.proposal, first.input);
  const input = clone(base); input.project = accepted.project;
  input.rawDraft.material.cost_per_ft = "3"; input.context.editRevision++;
  const { proposal } = ready(input); assert.equal(proposal.canAccept, true);
  near(proposal.comparisons.steel.before, 112); near(proposal.comparisons.steel.proposed, 132);
  near(proposal.comparisons.steel.delta, 20); assert.equal(proposal.comparisons.currentProvenance, "Current version-2 calculation");
});
check("blocked active version2 uses acknowledged price, not a new preliminary unapproved amount", () => {
  const first = ready(), accepted = apply(first.proposal, first.input), input = clone(base);
  input.project = accepted.project; input.savedProject = clone(accepted.project);
  input.project.items[0].reinforcement_material.weight_lb_per_ft = null;
  input.project.items[0].reinforcement_material.cost_per_ft = 999;
  input.rawDraft.material.cost_per_ft = "3";
  const { proposal } = ready(input); assert.equal(proposal.canAccept, true);
  near(proposal.comparisons.steel.before, 112); near(proposal.comparisons.steel.proposed, 132);
  assert.equal(proposal.comparisons.currentProvenance, "Acknowledged saved amount");
});
check("finite prior and proposed prices with overflowing delta remain unavailable, not0", () => {
  const input = clone(base); input.project.items[0].rebar_layers = -1;
  input.savedProject.items[0].rebar_cost = -Number.MAX_VALUE;
  input.savedProject.items[0].item_total_cost = -Number.MAX_VALUE;
  input.rawDraft.material.cost_per_ft = Number.MAX_VALUE / 40;
  const { proposal } = ready(input); assert.equal(proposal.projection.priceAvailable, true);
  assert.equal(proposal.canAccept, false); assert.equal(proposal.comparisons.steel.delta, null);
});
check("frozen raw/acknowledged/preview inputs are never mutated or aliased into receipt", () => {
  const r = ready(); freeze(r.input); freeze(r.proposal); const before = JSON.stringify(r.input);
  const result = apply(r.proposal, r.input); assert.equal(result.ok, true);
  result.project.items[0].reinforcement_design.cover_inches.side = 9;
  assert.equal(r.input.rawDraft.design.cover_inches.side, "3"); assert.equal(JSON.stringify(r.input), before);
});
fs.writeFileSync(`${DIR}/proposal-verification.json`, JSON.stringify({
  synthetic: true, localOnly: true, integrated: false,
  sourceSha256: crypto.createHash("sha256").update(fs.readFileSync(FILE)).digest("hex"), results,
}, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`Proposal: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
