// Helpers for building a blank Vinyl project + blank workflow + rolling up
// totals across all workflows.

import { hasVinylCostSnapshot, vinylNonNegativeNumber, vinylNumber } from "./vinylPricingAvailability";

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
  // Leave blank so the selected printer's VinylMachine.default_print_quality
  // controls new workflows. The calculator still falls back to high_quality
  // when a machine has no explicit default.
  print_quality: "",
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

// Sum a numeric calc field across all workflows. Strict: any non-finite
// contribution (a held workflow's null) makes the aggregate null so an
// unavailable price can never launder into $0. Workflows whose _calc has not
// been published yet are skipped; when a real finite current value exists it
// always wins, otherwise the saved acknowledged snapshot is used (and only
// when that snapshot is a real finite number — never a default).
export const sumWorkflowField = (workflows, field) => {
  let total = 0;
  for (const wf of workflows || []) {
    const calc = wf?._calc;
    if (calc == null) continue;
    const v = calc[field];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) return null;
    total += v;
  }
  return Number.isFinite(total) ? total : null;
};

const addOrNull = (...xs) => xs.every(v => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
const mulOrNull = (a, b) => (Number.isFinite(a) && Number.isFinite(b)) ? a * b : null;
const sumRowField = (rows, field) => {
  let total = 0;
  for (const r of rows || []) {
    const v = vinylNumber(r?.[field]);
    if (v === null) return null;
    total += v;
  }
  return total;
};

// rollup key → saved project field used as the acknowledged fallback when
// current pricing is unavailable. Keys mapped to null have no saved source —
// they surface "not saved" instead of inventing a value.
const SAVED_KEYS = {
  vinylCost: "total_vinyl_cost",
  laminateCost: "total_laminate_cost",
  inkCost: "total_ink_cost",
  bladeCost: "total_blade_cost",
  machineCost: "total_machine_cost",
  laborCost: "labor_cost",
  laborHours: "labor_hours",
  usedSqFt: "total_print_sqft",
  totalRollSqFt: "total_vinyl_sqft",
  laminateSqFt: "total_laminate_sqft",
  equipmentCost: "total_equipment_cost",
  personnelCost: "total_personnel_cost",
  travelCost: "total_travel_cost",
  baseSupplies: "base_supplies_cost",
  supplies: "total_supplies_cost",
  subtotal: "subtotal",
  markupAmount: "markup_amount",
  totalCost: "total_cost",
  materialCost: null,
  setupFeeApplied: null,
};

// Build the project rollup used by the summary panel + save payload.
// Current-live values win; when a workflow or project input is held the
// aggregate falls back to the saved acknowledged snapshot for that key, and
// only surfaces null when no real finite snapshot exists. Never returns $0
// in place of an unavailable price.
export const rollupVinylProject = (project, { savedProject = project } = {}) => {
  const wfs = project.workflows || [];
  // A recorded-but-malformed optional input is a flagged problem; absent means
  // "not configured" and keeps the ported 0 contribution (dormant).
  const optionalNonNeg = (v) =>
    (v === undefined || v === null || v === "") ? 0 : vinylNonNegativeNumber(v);
  const cat = (key, current) => Number.isFinite(current)
    ? current
    : (SAVED_KEYS[key] && hasVinylCostSnapshot(savedProject?.[SAVED_KEYS[key]])
        ? savedProject[SAVED_KEYS[key]] : null);

  const materialCost = cat("materialCost", sumWorkflowField(wfs, "materialCost"));
  const machineCost  = cat("machineCost",  sumWorkflowField(wfs, "machineCost"));
  const laborCost    = cat("laborCost",    sumWorkflowField(wfs, "laborCost"));
  const laborHours   = cat("laborHours",   sumWorkflowField(wfs, "laborHours"));

  const vinylCost    = cat("vinylCost",    sumWorkflowField(wfs, "vinylCost"));
  const laminateCost = cat("laminateCost", sumWorkflowField(wfs, "laminateCost"));
  const inkCost      = cat("inkCost",      sumWorkflowField(wfs, "inkCost"));
  const bladeCost    = cat("bladeCost",    sumWorkflowField(wfs, "bladeCost"));

  const usedSqFt      = cat("usedSqFt",      sumWorkflowField(wfs, "usedSqFt"));
  const totalRollSqFt = cat("totalRollSqFt", sumWorkflowField(wfs, "totalRollSqFtPulled"));
  const laminateSqFt  = cat("laminateSqFt",  sumWorkflowField(wfs, "laminateSqFt"));

  const equipmentCost = cat("equipmentCost", sumRowField(project.selected_equipment, "total_cost"));
  const personnelCost = cat("personnelCost", sumRowField(project.personnel, "total_cost"));
  const travelCost    = cat("travelCost",    optionalNonNeg(project.total_travel_cost));

  const suppliesPct   = optionalNonNeg(project.supplies_percent_of_materials);
  const baseSupplies  = cat("baseSupplies", suppliesPct === null ? null : mulOrNull(materialCost, suppliesPct / 100));
  const supplies      = cat("supplies", addOrNull(baseSupplies, optionalNonNeg(project.extra_supplies_cost)));

  const subtotal     = cat("subtotal", addOrNull(materialCost, machineCost, laborCost, equipmentCost, personnelCost, travelCost, supplies));
  const markupPct    = optionalNonNeg(project.markup_percent);
  const markupAmount = cat("markupAmount", markupPct === null ? null : mulOrNull(subtotal, markupPct / 100));
  const totalCost    = cat("totalCost", addOrNull(subtotal, markupAmount));

  // Add per-workflow setup-fee adjustment for transparency
  const setupFeeApplied = cat("setupFeeApplied", sumWorkflowField(wfs, "setupFeeApplied"));

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
