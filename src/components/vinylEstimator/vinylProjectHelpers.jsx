// Helpers for building a blank Vinyl project + blank workflow + rolling up
// totals across all workflows.

export const blankWorkflow = (index = 0) => ({
  id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: `Workflow ${index + 1}`,
  vinyl_id: "",
  laminate_id: "",
  transfer_tape_id: "",
  printer_id: "",
  cutter_id: "",
  laminator_id: "",
  apply_print: true,
  apply_cut: true,
  apply_laminate: false,
  apply_transfer_tape: false,
  print_quality: "high_quality",      // #2 — default high quality
  weeding_difficulty: "moderate",     // #5 — "Normal" default
  weeding_minutes_per_part_override: "",
  install_minutes_per_part: "",       // #6
  personnel: [],                      // #7
  spoilage_buffer_percent: "",        // #4
  setup_fee_floor: "",                // #3
  items: [],
  gutter_h_override: "",
  gutter_v_override: "",
});

export const blankVinylProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  install_environment: "exterior",
  status: "draft",
  // NEW: multi-workflow model. Legacy projects (single vinyl_id at the top)
  // get auto-migrated into a single workflow at load time.
  workflows: [blankWorkflow(0)],
  items: [], // legacy — kept blank to satisfy the entity schema
  // Installation
  selected_equipment: [],
  personnel: [],
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  // Project-level cost knobs
  supplies_percent_of_materials: 5,
  extra_supplies_cost: 0,
  markup_percent: 0,
  notes: "",
});

// Migrate a legacy single-workflow project (default_vinyl_id at the root) into the new shape.
export const migrateProject = (saved) => {
  const merged = { ...blankVinylProject(), ...saved };
  if (!Array.isArray(merged.workflows) || merged.workflows.length === 0) {
    const wf = blankWorkflow(0);
    wf.vinyl_id   = saved?.default_vinyl_id || "";
    wf.laminate_id = saved?.default_laminate_id || "";
    wf.printer_id  = saved?.printer_id || "";
    wf.cutter_id   = saved?.cutter_id  || "";
    wf.laminator_id = saved?.laminator_id || "";
    wf.apply_laminate = !!saved?.default_laminate_id;
    wf.items = Array.isArray(saved?.items) ? saved.items : [];
    merged.workflows = [wf];
  }
  return merged;
};

// Sum a numeric calc field across all workflows
export const sumWorkflowField = (workflows, field) =>
  (workflows || []).reduce((s, wf) => s + (parseFloat(wf?._calc?.[field]) || 0), 0);

// Build the project rollup used by the summary panel + save payload.
export const rollupVinylProject = (project) => {
  const wfs = project.workflows || [];
  const num = (v) => parseFloat(v) || 0;

  const materialCost = sumWorkflowField(wfs, "materialCost");
  const machineCost  = sumWorkflowField(wfs, "machineCost");
  const laborCost    = sumWorkflowField(wfs, "laborCost");
  const laborHours   = sumWorkflowField(wfs, "laborHours");

  const vinylCost    = sumWorkflowField(wfs, "vinylCost");
  const laminateCost = sumWorkflowField(wfs, "laminateCost");
  const inkCost      = sumWorkflowField(wfs, "inkCost");
  const bladeCost    = sumWorkflowField(wfs, "bladeCost");

  const usedSqFt        = sumWorkflowField(wfs, "usedSqFt");
  const totalRollSqFt   = sumWorkflowField(wfs, "totalRollSqFtPulled");
  const laminateSqFt    = sumWorkflowField(wfs, "laminateSqFt");

  const equipmentCost = (project.selected_equipment || []).reduce((s, e) => s + num(e.total_cost), 0);
  const personnelCost = (project.personnel || []).reduce((s, p) => s + num(p.total_cost), 0);
  const travelCost    = num(project.total_travel_cost);

  const baseSupplies  = materialCost * (num(project.supplies_percent_of_materials) / 100);
  const supplies      = baseSupplies + num(project.extra_supplies_cost);

  const subtotal      = materialCost + machineCost + laborCost + equipmentCost + personnelCost + travelCost + supplies;
  const markupAmount  = subtotal * (num(project.markup_percent) / 100);
  const totalCost     = subtotal + markupAmount;

  // Add per-workflow setup-fee adjustment for transparency
  const setupFeeApplied = sumWorkflowField(wfs, "setupFeeApplied");

  return {
    materialCost, machineCost, laborCost, laborHours,
    vinylCost, laminateCost, inkCost, bladeCost,
    usedSqFt, totalRollSqFt, laminateSqFt,
    equipmentCost, personnelCost, travelCost,
    baseSupplies, supplies,
    setupFeeApplied,
    subtotal, markupAmount, totalCost,
  };
};