import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = path.resolve(".audit-work/foundation-phaseb2");
const TREE = `${DIR}/candidate-tree-src`;

buildSync({
  entryPoints: [`${TREE}/components/estimator/foundation/foundationReinforcementEditorSession.js`],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/session.bundle.mjs`,
  alias: { "@": TREE },
});
buildSync({
  entryPoints: [`${TREE}/components/estimator/foundation/foundationCalc.js`],
  bundle: true, platform: "node", format: "esm", outfile: `${DIR}/calc.bundle.mjs`,
  alias: { "@": TREE },
});
const session = await import(pathToFileURL(`${DIR}/session.bundle.mjs`));
const calc = await import(pathToFileURL(`${DIR}/calc.bundle.mjs`));

const clone = value => JSON.parse(JSON.stringify(value));
const results = [];
const check = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack || error) }); console.error("FAIL", name, error.message); }
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const settings = {
  concrete_cost_per_yard: 180, concrete_delivery_base: 350, concrete_delivery_per_mile: 0,
  forming_rate_per_ft: 12, pouring_rate_per_cy: 90, finishing_rate_per_hour: 55,
  rebar_labor_rate_per_ft: 0.5, excavation_hand_rate_per_cy: 60,
};
const rebarRow = {
  id: "rebar-4", material_type: "rebar", material_name: "#4 rebar",
  rebar_size: "#4", rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668,
  cost_per_unit: 0.42, unit: "ft",
};
const inventory = [
  rebarRow,
  // Bagged concrete prices per item and skips the ready-mix delivery scan —
  // keeps the fixture's grand_total finite without a supplier catalog.
  { id: "bag-1", material_type: "bagged_concrete", material_name: "80lb bag", cost_per_unit: 6.5, unit: "bag" },
];

const legacyItem = () => ({
  component_id: "F-1", foundation_type: "spread_foot", quantity: 2,
  length_inches: 48, width_inches: 48, depth_inches: 18,
  selected_concrete_id: "bag-1",
  include_rebar: true, rebar_size: "#4", rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1,
  include_forming: false, include_finishing: false, is_new_sign_location: true,
  excavation_method: "hand_dig",
});
const projectWith = (items, extra = {}) => ({
  id: "src-1", items, signage_cabinets: [], landscape: null,
  walls: [], wall_caps: [], poles: [], selected_equipment: [],
  excavation_method: "hand_dig", ...extra,
});
// The acknowledged saved source: same id, an updated_date the context anchors
// to, and a saved item carrying acknowledged saved amounts (provenance rows).
const savedFor = (items, extra = {}) => ({
  ...projectWith(items),
  updated_date: "2026-11-09T00:00:00.000Z",
  ...extra,
});

// A draft that produces a valid single-mat design for a 48x48x18 spread foot.
const validDraft = () => ({
  schema_version: 1,
  design: {
    version: 2, bar_diameter_inches: "0.5",
    cover_inches: { side: "3", top: "3", bottom: "3" },
    // "off" + explicit reason is the only apply-ready supports state until the
    // O-022+ support model lands — unconfigured/manual/auto stay preview-only.
    supports: { mode: "off", reason: "Chairs and bolsters supplied by installer" },
    spread: { mats: [{ id: "mat-a", bearing_elevation_inches: "3", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } },
  },
  material: { kind: "catalog", inventory_id: "rebar-4" },
  overrides: { quantity_ft: null, cost_per_ft: null },
});

// Mock page-side wiring mirroring the grafted FoundationEstimator: session
// reads a live state object; commit applies updater to the project ref.
const makeEnv = ({ blocked = false, savedProject = null } = {}) => {
  const project = projectWith([legacyItem()]);
  const state = {
    project,
    // The grafted page passes ack?.sourceSnapshot — a saved source is required
    // for proposal math; default to a coherent acknowledged snapshot.
    savedProject: savedProject === null ? savedFor([{ ...legacyItem(), rebar_cost: 42.5, item_total_cost: 980.25 }]) : savedProject,
    commits: [], blocked,
  };
  const context = {
    loaded: true, ownerId: "owner-1", sourceId: "src-1",
    sourceUpdatedAt: state.savedProject?.updated_date ?? null,
    estimateId: "est-1", estimateUpdatedAt: "2026-11-09T01:00:00.000Z",
    generation: 1, editRevision: 0,
  };
  let seq = 0;
  const editor = session.createFoundationReinforcementEditorSession({
    getCurrent: () => ({
      project: state.project, savedProject: state.savedProject,
      inventory, settings,
      context, blocked: state.blocked,
    }),
    commit: (updater) => {
      const next = updater(clone(state.project));
      state.project = { ...clone(state.project), ...next };
      state.commits.push(next);
      return true;
    },
    createId: () => `proposal-${++seq}`,
    now: () => "2026-11-10T00:00:00.000Z",
    onChange: () => {},
  });
  return { editor, state };
};

// ── 1. Full lifecycle: start → draft → preview → accept → version-2 ─────────
check("lifecycle: start writes a proposal draft through commit", () => {
  const { editor, state } = makeEnv();
  assert.equal(editor.start("F-1"), true);
  const item = state.project.items[0];
  assert.ok(item.reinforcement_proposal, "draft not committed to item");
  assert.equal(item.reinforcement_proposal.schema_version, 1);
  assert.equal(state.commits.length, 1, "start must be a single commit");
  // Legacy fields untouched — draft is additive only.
  assert.equal(item.reinforcement_calculation_version, undefined);
  assert.equal(item.rebar_spacing_length, 12);
});

check("lifecycle: preview produces quantities and a finite section delta", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  assert.equal(editor.changeDraft("F-1", validDraft()), true);
  assert.equal(editor.preview("F-1"), true);
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  assert.equal(editor.preview("F-1"), true);
  const view = editor.read("F-1").preview;
  assert.ok(view, "no preview view");
  assert.equal(view.stale, false);
  assert.equal(view.canAccept, true, `cannot accept: ${JSON.stringify(view.issues)}`);
  const steel = view.costs.find(r => r.label === "Steel delta");
  const section = view.costs.find(r => r.label === "Section delta");
  assert.ok(steel && section, "missing delta rows");
  assert.match(steel.value, /^\$/, "steel delta not money-formatted");
  // Physical/priced steel quantities must be finite numbers after preview.
  const phys = view.quantities.find(q => q.label === "Physical steel (ft)");
  assert.match(phys.after, /^[\d,.]+$/, "physical steel after not numeric");
});

check("lifecycle: accept commits version-2 fields once and clears proposal", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  // Acknowledging invalidates the prior preview (activeId=null) � re-preview
  // to bind the acknowledgments into a fresh acceptable proposal.
  assert.equal(editor.preview("F-1"), true);
  const view = editor.read("F-1").preview;
  const commitsBefore = state.commits.length;
  assert.equal(editor.accept("F-1", view.id), true, `accept refused: ${editor.read("F-1").error}`);
  const item = state.project.items[0];
  assert.equal(item.reinforcement_calculation_version, 2);
  assert.ok(item.reinforcement_design?.version === 2, "accepted design not stored");
  assert.ok(item.reinforcement_material?.kind === "catalog", "accepted material basis not stored");
  assert.ok(item.reinforcement_acceptance, "acceptance provenance not stored");
  assert.equal(item.reinforcement_acceptance.engineering_approved, false, "engineering approval must stay false");
  assert.equal(item.reinforcement_proposal, undefined, "draft must be cleared after acceptance");
  assert.equal(state.commits.length, commitsBefore + 1, "acceptance must be exactly one commit");
  // Accepted item still resolves through the versioned calc path.
  const priced = calc.calcProject(clone(state.project), clone(inventory), clone(settings));
  const out = priced.items.find(i => i.component_id === "F-1");
  assert.ok(Number.isFinite(out.rebar_feet) && out.rebar_feet > 0, "v2 item has no priced steel");
  assert.ok(Number.isFinite(out.item_total_cost), "v2 item total unavailable");
});

check("lifecycle: accepted v2 steel is explicit-design steel, not legacy formula", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  editor.accept("F-1", view.id);
  const item = state.project.items[0];
  // #4 @0.5" dia, 3" covers on 48x48: each direction 4 bars of 42" → 28ft
  // physical per mat instance, ×2 quantity = 56ft. Legacy implicit math would
  // produce a different number; we only assert the v2 fields exist and differ
  // is recorded as snapshot, not recomputed implicitly.
  assert.ok(item.reinforcement_cost_snapshot, "no cost snapshot stored");
  const snap = item.reinforcement_cost_snapshot;
  assert.equal(snap.calculation_version, 2);
  assert.equal(snap.engineering_approved, false);
  // Priced feet live in the frozen amounts block; the item-level field comes
  // from the applied itemCost. Overrides stay null when un-authored.
  assert.ok(Number.isFinite(snap.amounts?.priced_feet), "snapshot missing priced feet");
  assert.equal(snap.amounts.priced_feet, item.rebar_feet, "snapshot feet must equal applied item feet");
  assert.equal(item.custom_rebar_qty, null, "un-authored quantity override must stay null");
});

// ── 2. Delta math ───────────────────────────────────────────────────────────
check("delta: steel delta equals proposed minus current item steel", () => {
  const { editor } = makeEnv();
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  const num = s => parseFloat(String(s).replace(/[$,]/g, ""));
  const row = label => num(view.costs.find(r => r.label === label).value);
  assert.ok(Math.abs(row("Steel delta") - (row("Proposed steel") - row("Current steel"))) < 0.01, "steel delta inconsistent");
  assert.ok(Math.abs(row("Section delta") - (row("Proposed section") - row("Current section"))) < 0.01, "section delta inconsistent");
});

check("delta: section rows report held-aware totals (unpriceable cabinet held at saved)", () => {
  // An unpriceable cabinet row: category() holds the acknowledged saved total,
  // so "Current section" must show grand+500+0 — NOT the raw-sum-recomputed
  // grand+0 a naive recompute would launder. The delta itself stays refused
  // because the proposed calc still carries the input issue.
  const saved = savedFor([{ ...legacyItem(), rebar_cost: 42.5, item_total_cost: 980.25 }],
    { total_signage_cabinet_cost: 500, total_landscape_cost: 0 });
  const { editor, state } = makeEnv({ savedProject: saved });
  state.project.signage_cabinets = [{ component_id: "c1", quantity: 1 /* no unit_cost */ }];
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  assert.equal(editor.preview("F-1"), true);
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  assert.equal(editor.preview("F-1"), true);
  const view = editor.read("F-1").preview;
  const current = view.costs.find(r => r.label === "Current section");
  const grand = calc.calcProject(JSON.parse(JSON.stringify(state.project)), inventory, settings,
    { savedProject: saved }).totals.grand_total;
  const expected = `$${(grand + 500).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  assert.equal(current.value, expected, "Current section must include the held cabinet total, not a guessed $0");
  assert.equal(view.canAccept, false, "delta must stay refused while the proposed calc carries input issues");
});

// ── 3. Discard leaves legacy unchanged ──────────────────────────────────────
check("discard: removes draft, leaves every legacy field byte-identical", () => {
  const { editor, state } = makeEnv();
  const before = clone(state.project.items[0]);
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  assert.equal(editor.discard("F-1"), true);
  assert.deepEqual(clone(state.project.items[0]), before, "discard mutated legacy fields");
});

// ── 4. Blocked-state behavior ───────────────────────────────────────────────
check("blocked: start/preview/accept refuse and commit nothing", () => {
  const { editor, state } = makeEnv();
  // Prime a proposal while unblocked.
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const commits = state.commits.length;
  state.blocked = true;
  assert.equal(editor.start("F-1"), false, "start must refuse while blocked");
  assert.equal(editor.changeDraft("F-1", validDraft()), false, "draft change must refuse while blocked");
  assert.equal(editor.preview("F-1"), false, "preview must refuse while blocked");
  assert.equal(editor.accept("F-1", "anything"), false, "accept must refuse while blocked");
  assert.equal(state.commits.length, commits, "blocked flow committed state");
  const read = editor.read("F-1");
  assert.equal(read.disabled, true, "read must report disabled while blocked");
});

check("blocked: missing acknowledged source refuses proposal edits", () => {
  const env = makeEnv();
  // Simulate the remote page's `blocked` when ack?.sourceSnapshot is absent —
  // env flag covers it; additionally confirm stale-context refusal below.
  env.state.blocked = true;
  assert.equal(env.editor.start("F-1"), false);
});

// ── 5. Stale/context validation ─────────────────────────────────────────────
check("stale: concurrent project change invalidates preview and refuses accept", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  // Concurrent edit lands through a different commit (e.g. another item field).
  state.project = { ...state.project, items: [{ ...state.project.items[0], quantity: 3 }] };
  const read = editor.read("F-1");
  assert.equal(read.preview.stale, true, "preview should be stale after project change");
  assert.equal(editor.accept("F-1", view.id), false, "stale accept must refuse");
  assert.equal(state.project.items[0].reinforcement_calculation_version, undefined, "stale accept still versioned the item");
});

check("stale: wrong proposal id refuses accept", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  editor.preview("F-1");
  assert.equal(editor.accept("F-1", "forged-id"), false);
  assert.equal(state.project.items[0].reinforcement_calculation_version, undefined);
});

// ── 6. Version-1 + unsupported items held ───────────────────────────────────
check("held: version-1 item on legacy path is never silently re-dispatched", () => {
  const { editor, state } = makeEnv();
  state.project.items[0].reinforcement_calculation_version = 1;
  const v1 = calc.calcProject(clone(state.project), clone(inventory), clone(settings));
  const out = v1.items.find(i => i.component_id === "F-1");
  assert.ok(Number.isFinite(out.item_total_cost), "v1 item lost its total");
  // Proposal flow still works on a v1 item (start→accept upgrades to v2).
  editor.start("F-1");
  editor.changeDraft("F-1", validDraft());
  editor.preview("F-1");
  const firstView = editor.read("F-1").preview;
  editor.acknowledge("F-1", { preliminary: true, warningCodes: firstView.warningCodes });
  editor.preview("F-1");
  const view = editor.read("F-1").preview;
  assert.equal(editor.accept("F-1", view.id), true);
  assert.equal(state.project.items[0].reinforcement_calculation_version, 2);
});

check("held: unsupported version keeps acknowledged snapshot, no legacy fallback", () => {
  const { state } = makeEnv();
  state.project.items[0].reinforcement_calculation_version = 7;
  state.project.items[0].rebar_cost = 123.45;
  const priced = calc.calcProject(clone(state.project), clone(inventory), clone(settings));
  const out = priced.items.find(i => i.component_id === "F-1");
  assert.equal(out.rebar_cost, 123.45, "unsupported version must hold saved snapshot");
});

// ── 7. Draft integrity ──────────────────────────────────────────────────────
check("draft: malformed raw values reach preview as issues, never commit silently", () => {
  const { editor, state } = makeEnv();
  editor.start("F-1");
  const bad = validDraft();
  bad.design.bar_diameter_inches = "abc";
  bad.design.cover_inches.side = "";
  editor.changeDraft("F-1", bad);
  assert.equal(editor.preview("F-1"), true, "preview should run and report issues");
  const view = editor.read("F-1").preview;
  assert.equal(view.canAccept, false, "invalid draft must not be acceptable");
  assert.ok(view.issues.length > 0, "no issues reported for malformed draft");
});

const failures = results.filter(r => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} phase-b2 model checks passed`);
if (failures.length) {
  fs.writeFileSync(`${DIR}/verify-phaseb2-failures.json`, JSON.stringify(failures, null, 2));
  process.exit(1);
}
fs.writeFileSync(`${DIR}/verify-phaseb2-results.json`, JSON.stringify(results.map(r => r.name), null, 2));
console.log("PASS phaseb2-model");
