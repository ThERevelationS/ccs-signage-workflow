import { pathToFileURL } from "node:url";
const session = await import(pathToFileURL(".audit-work/foundation-phaseb2/session.bundle.mjs"));
const settings = { concrete_cost_per_yard: 180 };
const inventory = [
  { id: "rebar-4", material_type: "rebar", material_name: "#4", rebar_size: "#4", rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, cost_per_unit: 0.42, unit: "ft" },
  { id: "bag-1", material_type: "bagged_concrete", material_name: "80lb", cost_per_unit: 6.5, unit: "bag" },
];
const item = { component_id: "F-1", foundation_type: "spread_foot", quantity: 2, length_inches: 48, width_inches: 48, depth_inches: 18, selected_concrete_id: "bag-1", include_rebar: true, rebar_size: "#4", rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1, excavation_method: "hand_dig" };
const project = { id: "src-1", items: [item], signage_cabinets: [], walls: [], wall_caps: [], poles: [], selected_equipment: [], landscape: null, excavation_method: "hand_dig" };
const saved = JSON.parse(JSON.stringify(project)); saved.updated_date = "t"; saved.items[0].rebar_cost = 42.5; saved.items[0].item_total_cost = 980.25;
const state = { project };
const ctx = { loaded: true, ownerId: "o", sourceId: "src-1", sourceUpdatedAt: "t", estimateId: "e", estimateUpdatedAt: "t2", generation: 1, editRevision: 0 };
const ed = session.createFoundationReinforcementEditorSession({
  getCurrent: () => ({ project: state.project, savedProject: saved, inventory, settings, context: ctx, blocked: false }),
  commit: u => { Object.assign(state.project, u(JSON.parse(JSON.stringify(state.project)))); return true; },
  createId: () => "p1", now: () => "now",
});
ed.start("F-1");
const draft = { schema_version: 1, design: { version: 2, bar_diameter_inches: "0.5", cover_inches: { side: "3", top: "3", bottom: "3" }, supports: { mode: "unconfigured", reason: "" }, spread: { mats: [{ id: "m", bearing_elevation_inches: "3", max_spacing_x_inches: "12", max_spacing_z_inches: "12" }], inter_mat_ties: [] }, pillar: { hoops: [], longitudinal: {} } }, material: { kind: "catalog", inventory_id: "rebar-4" }, overrides: {} };
ed.changeDraft("F-1", draft);
ed.preview("F-1");
const view = ed.read("F-1").preview;
console.log(JSON.stringify({ canAccept: view.canAccept, issues: view.issues, costs: view.costs, quantities: view.quantities }, null, 1));
