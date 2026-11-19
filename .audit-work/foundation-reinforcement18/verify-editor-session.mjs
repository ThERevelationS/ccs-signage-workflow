import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: ["src/components/estimator/foundation/foundationReinforcementEditorSession.js"],
  bundle: true, platform: "node", format: "esm", outfile: DIR + "editor-session-bundle.mjs", metafile: true,
});
assert.ok(!Object.keys(built.metafile.inputs).some(file => /base44Client|staffEntities|node_modules\/@base44/.test(file)));
const { createFoundationReinforcementEditorSession: create } =
  await import(pathToFileURL(path.resolve(DIR + "editor-session-bundle.mjs")));
const fixture = JSON.parse(fs.readFileSync(DIR + "versioned-persistence-frozen-inputs.json", "utf8"));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const initial = freeze({
  id: "session-source", updated_date: "2026-11-07T12:00:00.000Z",
  items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1,
    length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true,
    include_finishing: true, rebar_size: "#4", rebar_cost: 262.8, item_total_cost: 439.05 }],
  signage_cabinets: [{ unit_cost: 12, quantity: 2 }],
  landscape: { cell_size_inches: 12, cells: { "0,0": "grass" } },
});
function harness(source = initial) {
  let project = source, saved = source, revision = 0, generation = 1, blocked = false, identity = source.id;
  const inventory = [{ id: "synthetic-rebar", material_type: "rebar", rebar_size: "#4", cost_per_unit: 2,
    rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, unit: "ft" }];
  const settings = {}, past = [], future = [], commits = [], changes = [];
  let id = 0, beforeCommit;
  const getCurrent = () => ({
    project, savedProject: saved, inventory, settings, blocked,
    context: { loaded: true, ownerId: "synthetic-owner", sourceId: identity, sourceUpdatedAt: saved.updated_date,
      estimateId: null, estimateUpdatedAt: null, generation, editRevision: revision },
  });
  const session = create({
    getCurrent, createId: () => `session-preview-${++id}`, now: () => "2026-11-07T12:01:00.000Z",
    onChange: () => changes.push(true),
    commit: updater => {
      beforeCommit?.();
      const before = project, patch = updater(project);
      past.push(before); future.length = 0;
      project = freeze({ ...project, ...patch }); revision += 1; commits.push({ before, after: project });
      return true;
    },
  });
  const h = {
    session, past, commits, changes, get project() { return project; }, inventory, settings,
    editProject: patch => { project = freeze({ ...project, ...patch }); revision += 1; },
    blocked: value => { blocked = value; },
    changeScope: value => { identity = value; generation += 1; },
    beforeCommit: fn => { beforeCommit = fn; },
    undo() { future.unshift(project); project = past.pop(); revision += 1; },
    redo() { past.push(project); project = future.shift(); revision += 1; },
    acknowledgeSave(value) { saved = freeze(value); },
  };
  return h;
}
function prepare(h, id = "one") {
  assert.equal(h.session.start(id), true);
  assert.equal(h.session.changeDraft(id, structuredClone(fixture.rawDraft)), true);
  assert.equal(h.session.preview(id), true);
  const initialPreview = h.session.read(id).preview;
  assert.equal(h.session.acknowledge(id, { preliminary: true, warningCodes: [...initialPreview.warningCodes] }), true);
  assert.equal(h.session.read(id).preview.stale, true);
  assert.equal(h.session.preview(id), true);
  return h.session.read(id).preview;
}
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
}
const cost = (view, label) => view.costs.find(row => row.label === label)?.value;
check("starting and editing raw proposal are source-only commits that preserve legacy prices and design", () => {
  const h = harness(); h.session.start("one");
  assert.equal(h.commits.length, 1);
  assert.equal(h.project.items[0].reinforcement_proposal.design.supports.mode, "unconfigured");
  const draft = structuredClone(fixture.rawDraft); draft.design.cover_inches.side = "-unfinished";
  h.session.changeDraft("one", draft);
  assert.equal(h.commits.length, 2); assert.equal(h.project.items[0].reinforcement_proposal.design.cover_inches.side, "-unfinished");
  assert.equal(h.project.items[0].rebar_cost, 262.8); assert.equal(h.project.items[0].item_total_cost, 439.05);
  assert.equal(h.project.items[0].reinforcement_calculation_version, undefined);
  assert.equal(h.project.items[0].reinforcement_design, undefined);
});
check("preview shows fresh full-section and foundation deltas including signage and landscape without committing", () => {
  const h = harness(), preview = prepare(h);
  assert.equal(h.commits.length, 2); assert.equal(preview.canAccept, true);
  assert.equal(cost(preview, "Current steel"), "$252.80"); assert.equal(cost(preview, "Proposed steel"), "$112.00");
  assert.equal(cost(preview, "Current foundation"), "$429.05"); assert.equal(cost(preview, "Proposed foundation"), "$288.25");
  // One 36-inch cube orders 1 CY: 201 mix + 150 small-load + 30 fuel.
  // Include that unchanged 381 delivery, 24 signage and .75 landscape.
  assert.equal(cost(preview, "Current section"), "$834.80"); assert.equal(cost(preview, "Proposed section"), "$694.00");
  assert.equal(cost(preview, "Section delta"), "$-140.80");
  assert.equal(cost(preview, "Saved steel"), "$262.80"); assert.equal(cost(preview, "Saved foundation"), "$439.05");
  assert.deepEqual(preview.quantities[0], { label: "Physical steel (ft)", before: "Not recorded", after: "20" });
});
check("acceptance consumes active ID before exactly one parent commit and one Undo restores the whole prior proposal", () => {
  const h = harness(), preview = prepare(h), before = h.project, count = h.commits.length;
  let reentrant = null;
  h.beforeCommit(() => { reentrant = h.session.accept("one", preview.id); });
  assert.equal(h.session.accept("one", preview.id), true); h.beforeCommit(null);
  assert.equal(reentrant, false); assert.equal(h.commits.length, count + 1);
  const accepted = h.project;
  assert.equal(accepted.items[0].reinforcement_calculation_version, 2);
  assert.equal(Math.round(accepted.items[0].rebar_cost * 100), 11200);
  assert.equal(accepted.items[0].reinforcement_acceptance.component_id, "one");
  assert.equal(Object.hasOwn(accepted.items[0], "reinforcement_proposal"), false);
  assert.equal(h.session.accept("one", preview.id), false); assert.equal(h.commits.length, count + 1);
  h.undo(); assert.equal(h.project, before); assert.equal(h.project.items[0].reinforcement_calculation_version, undefined);
  h.redo(); assert.equal(h.project, accepted); assert.equal(h.session.read("one").preview, null);
});
check("acknowledgments neither commit nor edit the source and require explicit fresh preview", () => {
  const h = harness(); h.session.start("one"); h.session.changeDraft("one", structuredClone(fixture.rawDraft)); h.session.preview("one");
  const view = h.session.read("one"), count = h.commits.length, before = h.project;
  assert.equal(view.preview.canAccept, false);
  h.session.acknowledge("one", { preliminary: true, warningCodes: [...view.preview.warningCodes] });
  assert.equal(h.commits.length, count); assert.equal(h.project, before);
  assert.equal(h.session.accept("one", view.preview.id), false);
  assert.equal(h.session.read("one").preview.stale, true);
  h.session.preview("one"); assert.equal(h.session.read("one").preview.canAccept, true);
});
check("raw parent edits invalidate previews and a superseded opaque ID cannot accept a refreshed amount", () => {
  const h = harness(), old = prepare(h);
  h.editProject({ notes: "New current design context" });
  assert.equal(h.session.read("one").preview.stale, true); assert.equal(h.session.accept("one", old.id), false);
  h.session.preview("one"); const fresh = h.session.read("one").preview;
  assert.notEqual(fresh.id, old.id); assert.equal(fresh.canAccept, true);
  assert.equal(h.session.accept("one", old.id), false); assert.equal(h.session.accept("one", fresh.id), true);
});
check("same-reference catalog mutation is caught by fresh core acceptance rather than trusting preview anchors", () => {
  const h = harness(), old = prepare(h), count = h.commits.length;
  h.inventory.push({ id: "unrelated-new-row", material_type: "rebar", cost_per_unit: 99 });
  assert.equal(h.session.accept("one", old.id), false); assert.equal(h.commits.length, count);
  assert.match(h.session.read("one").error, /changed/);
});
check("blocked save/recovery context refuses all mutating proposal actions without history or backend writes", () => {
  const h = harness(), view = prepare(h), count = h.commits.length, before = h.project;
  h.blocked(true);
  for (const action of [() => h.session.start("one"), () => h.session.changeDraft("one", fixture.rawDraft),
    () => h.session.discard("one"), () => h.session.preview("one"),
    () => h.session.acknowledge("one", { preliminary: true, warningCodes: [] }), () => h.session.accept("one", view.id)])
    assert.equal(action(), false);
  assert.equal(h.commits.length, count); assert.equal(h.project, before); assert.equal(h.session.read("one").disabled, true);
});
check("component reordering never redirects an acceptance or proposal edit to another index", () => {
  const h = harness({ ...initial, items: [...initial.items, { ...initial.items[0], component_id: "two", description: "Untouched second" }] });
  const old = prepare(h);
  h.editProject({ items: [...h.project.items].reverse() });
  assert.equal(h.session.accept("one", old.id), false);
  h.session.preview("one"); assert.equal(h.session.accept("one", h.session.read("one").preview.id), true);
  assert.equal(h.project.items[0].component_id, "two"); assert.equal(h.project.items[0].reinforcement_calculation_version, undefined);
  assert.equal(h.project.items[1].component_id, "one"); assert.equal(h.project.items[1].reinforcement_calculation_version, 2);
});
check("missing or duplicate component identity cannot generate commits, previews or borrowed acknowledgment", () => {
  const h = harness({ ...initial, items: [initial.items[0], initial.items[0]] });
  assert.equal(h.session.start("one"), false); assert.equal(h.session.start("missing"), false);
  assert.equal(h.session.preview("one"), false); assert.equal(h.commits.length, 0);
  assert.equal(h.session.read("one").disabled, true);
});
check("route generation changes clear opaque previews and warning acknowledgments, including return to same source", () => {
  const h = harness(), view = prepare(h), count = h.commits.length;
  h.changeScope("another-source"); h.changeScope("session-source");
  assert.equal(h.session.accept("one", view.id), false); assert.equal(h.commits.length, count);
  assert.equal(h.session.read("one").preview, null);
  assert.deepEqual(h.session.read("one").acknowledgments, { preliminary: false, warningCodes: [] });
});
check("unconfigured supports remain visible and cannot replace live prices even with all warnings acknowledged", () => {
  const h = harness(); prepare(h);
  const draft = structuredClone(fixture.rawDraft); draft.design.supports = { mode: "unconfigured", reason: "" };
  h.session.changeDraft("one", draft); h.session.preview("one");
  const view = h.session.read("one").preview; assert.equal(view.canAccept, false);
  assert.ok(view.issues.some(issue => issue.code === "reinforcement_support_cost_unknown"));
  h.session.acknowledge("one", { preliminary: true, warningCodes: view.warningCodes }); h.session.preview("one");
  assert.equal(h.session.read("one").preview.canAccept, false);
  assert.equal(h.session.accept("one", h.session.read("one").preview.id), false);
  assert.equal(h.project.items[0].rebar_cost, 262.8);
});
check("full-section unavailability in another component blocks an otherwise valid target replacement", () => {
  const h = harness({ ...initial, items: [initial.items[0], { ...initial.items[0], component_id: "other", depth_inches: -1, item_total_cost: undefined }] });
  const view = prepare(h);
  assert.equal(view.canAccept, false); assert.equal(cost(view, "Section delta"), "Unavailable");
  assert.ok(view.issues.some(issue => issue.code === "reinforcement_section_delta_unavailable"));
  assert.equal(h.session.accept("one", view.id), false);
});
check("discard removes only the raw draft and keeps accepted definition and historical origin receipt unchanged", () => {
  const h = harness(), view = prepare(h); h.session.accept("one", view.id);
  const accepted = h.project.items[0]; h.session.start("one"); assert.ok(h.project.items[0].reinforcement_proposal);
  h.session.discard("one");
  assert.deepEqual(h.project.items[0], accepted); assert.equal(h.session.read("one").preview, null);
});
check("browser-restored raw draft never restores preview authority or warning acknowledgments", () => {
  const h = harness(), view = prepare(h), restored = harness(structuredClone(h.project));
  assert.deepEqual(restored.session.read("one").draft, fixture.rawDraft);
  assert.equal(restored.session.read("one").preview, null);
  assert.equal(restored.session.accept("one", view.id), false);
});
fs.writeFileSync(DIR + "editor-session-verification.json", JSON.stringify({
  synthetic: true, actualPageUndoVerified: false, noSDKGraph: true, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Editor session: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
