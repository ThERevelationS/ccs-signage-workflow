// Vinyl pricing-availability layer.
//
// Wraps calculateVinylProject with strict finite-number input validation so a
// missing, malformed, or unusable pricing input can no longer silently become
// $0, a hidden default, or a dropped part. Mirrors the Foundation hardening
// convention:
//   - strict parsers (vinylNumber / vinylNonNegativeNumber / vinylPositiveNumber)
//   - structured issue records { kind, index, itemIndex, inventoryId, field,
//     code, message, hold }
//   - "layout" availability poisons the whole workflow calc; narrower holds
//     only poison the cost groups they feed, and derived aggregates
//     (materialCost / machineCost / preFloorTotal / setupFeeApplied / totalCost)
//     are re-derived null-propagating afterwards.
//   - explicit 0 stays valid where the calculator already treats it as a real
//     free/zero price; quantities and dimensions of 0 are invalid.
//   - raw rows are never mutated — the calculator reads the original records
//     exactly as VinylWorkflowCard has always passed them.
//
// Valid inputs take the exact same code path as before: the calc object the
// card receives for a clean workflow is bit-identical to today's result
// (plus __held / pricingUnavailable / issues metadata flags).

import { calculateVinylProject } from "./vinylNestingCalculator";
import {
  WEEDING_LABOR_MINUTES_PER_PART,
} from "@/components/vinylInventory/vinylConstants";

// ---------- strict parsers ----------
// Finite number or null. Accepts real numbers and trimmed numeric strings;
// rejects "", "abc", Infinity, NaN, null, undefined, objects.
export const vinylNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
export const vinylNonNegativeNumber = (v) => {
  const n = vinylNumber(v);
  return n !== null && n >= 0 ? n : null;
};
export const vinylPositiveNumber = (v) => {
  const n = vinylNumber(v);
  return n !== null && n > 0 ? n : null;
};
// Positive whole number (quantities). "2.7" is invalid — floor() would have
// silently repriced it.
export const vinylPositiveInteger = (v) => {
  const n = vinylNumber(v);
  return n !== null && n > 0 && Math.floor(n) === n ? n : null;
};

// A value that was actually recorded on the record (not absent/blank).
const recorded = (v) => v !== undefined && v !== null && v !== "";

// Saved acknowledged pricing snapshot — only a real finite number counts.
// This is the gate for "Saved amounts (not current pricing)" display.
export const hasVinylCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// Blank-preserving input helper for number fields (Foundation heightInput
// pattern): "" stays "" so the input does not fight the user mid-typing;
// parseable text becomes a number; anything else stays raw so validation can
// flag it instead of laundering it into 0.
export const vinylDraftValue = (raw) => {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

// ---------- issue records ----------
const issue = (kind, { index = null, itemIndex = null, inventoryId = null, field, code, message, hold = "layout" }) => ({
  kind, index, itemIndex, inventoryId, field, code, message, hold,
});

// Which calc output fields each hold poisons. Aggregates are always re-derived.
const HOLD_FIELDS = {
  // Layout problems make every derived number untrustworthy (geometry is wrong).
  layout: [
    "vinylCost", "laminateCost", "transferTapeCost", "inkCost", "bladeCost",
    "printMachineCost", "cutMachineCost", "laminateMachineCost",
    "perPersonnelCost", "laborCost", "laborHours", "laborMinutes",
    "perPersonnelMinutes",
    "inkRatePerSqIn",
    "usedSqFt", "totalRollSqFtPulled", "wastedSqFt", "laminateSqFt",
    "transferTapeSqFt", "lengthConsumedIn", "lengthConsumedFt", "totalLengthIn",
    "cutDistanceIn",
    "printMinutes", "cutMinutes", "laminateMinutes", "machineRunMinutes",
    "weedingMinutes", "installMinutes", "weedMinPerPart", "installMinPerPart",
  ],
  vinylPrice:      ["vinylCost"],
  laminatePrice:   ["laminateCost", "laminateSqFt"],
  ttPrice:         ["transferTapeCost", "transferTapeSqFt"],
  inkPrice:        ["inkCost", "inkRatePerSqIn"],
  printerMachine:  ["printMachineCost"],
  cutterMachine:   ["cutMachineCost", "bladeCost"],
  laminatorMachine:["laminateMachineCost"],
  labor:           [
    "perPersonnelCost", "perPersonnelMinutes",
    "laborCost", "laborMinutes", "laborHours",
    "weedingMinutes", "installMinutes", "weedMinPerPart", "installMinPerPart",
  ],
  floor:           ["setupFeeApplied"],
};

// ---------- catalog (VinylInventory) validation ----------
const MATERIAL_LABEL = { vinyl: "Vinyl", laminate: "Laminate", transfer_tape: "Transfer tape" };
const MATERIAL_PRICE_HOLD = { vinyl: "vinylPrice", laminate: "laminatePrice", transfer_tape: "ttPrice" };

// Validate the catalog fields a selected material record contributes to the
// calc. role: "vinyl" | "laminate" | "transfer_tape". Geometry fields are the
// "layout" hold; price fields use the role's price hold.
export const vinylMaterialIssues = (row, role, wfIdx, wfId) => {
  const issues = [];
  const label = MATERIAL_LABEL[role] || "Material";
  const priceHold = MATERIAL_PRICE_HOLD[role] || "layout";
  const invId = row?.id ?? null;
  const add = (field, code, message, hold) =>
    issues.push(issue("vinyl_catalog", { index: wfIdx, componentId: wfId, inventoryId: invId, field, code, message, hold }));

  // roll_width_inches — vinyl: usable roll width + per_roll/per_linear_foot
  // denominators; laminate/tt: material sqft width. Positive required.
  if (vinylPositiveNumber(row?.roll_width_inches) === null) {
    add("roll_width_inches", `vinyl_${role}_roll_width_unavailable`,
      `record a positive, finite ${label} roll width (inches) in Vinyl Inventory before repricing`,
      role === "vinyl" ? "layout" : priceHold);
  }

  // pricing_mode — drives which cost field is consumed.
  const mode = recorded(row?.pricing_mode) ? row.pricing_mode : "per_roll";
  if (!["per_roll", "per_sqft", "per_linear_foot"].includes(mode)) {
    add("pricing_mode", `vinyl_${role}_pricing_mode_unavailable`,
      `set a supported ${label} pricing mode (per_roll / per_sqft / per_linear_foot) in Vinyl Inventory before repricing`, priceHold);
  } else if (mode === "per_sqft") {
    if (vinylNonNegativeNumber(row?.cost_per_sqft) === null) {
      add("cost_per_sqft", `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per sq ft — a missing price is not free`, priceHold);
    }
  } else if (mode === "per_linear_foot") {
    if (vinylNonNegativeNumber(row?.cost_per_linear_foot) === null) {
      add("cost_per_linear_foot", `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per linear foot — a missing price is not free`, priceHold);
    }
  } else { // per_roll
    if (vinylNonNegativeNumber(row?.cost_per_roll) === null) {
      add("cost_per_roll", `vinyl_${role}_price_unavailable`,
        `record a finite, nonnegative ${label} cost per roll — a missing price is not free`, priceHold);
    }
    if (vinylPositiveNumber(row?.roll_length_yards) === null) {
      add("roll_length_yards", `vinyl_${role}_roll_length_unavailable`,
        `record a positive, finite ${label} roll length (yards) in Vinyl Inventory before repricing`,
        role === "vinyl" ? "layout" : priceHold);
    }
  }

  // waste_factor_percent — dormant when absent; recorded must parse >= 0.
  if (recorded(row?.waste_factor_percent) && vinylNonNegativeNumber(row.waste_factor_percent) === null) {
    add("waste_factor_percent", `vinyl_${role}_waste_factor_unavailable`,
      `record a finite, nonnegative ${label} waste factor % or clear it in Vinyl Inventory`, priceHold);
  }
  return issues;
};

// ---------- machine (VinylMachine) validation ----------
const machineAdd = (issues, wfIdx, machine, field, code, message, hold) =>
  issues.push(issue("vinyl_catalog", { index: wfIdx, inventoryId: machine?.id ?? null, field, code, message, hold }));

// Fields every applied machine contributes to roll layout when it leads.
const leadingMachineIssues = (issues, wfIdx, machine, label, overrides) => {
  const { gutterHOverridden, gutterVOverridden } = overrides;
  for (const [field, human] of [
    ["left_margin_inches", "left margin (inches)"],
    ["right_margin_inches", "right margin (inches)"],
    ["leading_edge_inches", "leading edge (inches)"],
    ["trailing_edge_inches", "trailing edge (inches)"],
  ]) {
    if (recorded(machine?.[field]) && vinylNonNegativeNumber(machine[field]) === null) {
      machineAdd(issues, wfIdx, machine, field, "vinyl_machine_margin_unavailable",
        `record a finite, nonnegative ${label} ${human} in Vinyl Settings before repricing`, "layout");
    }
  }
  if (!gutterHOverridden && recorded(machine?.default_gutter_horizontal_inches)
      && vinylNonNegativeNumber(machine.default_gutter_horizontal_inches) === null) {
    machineAdd(issues, wfIdx, machine, "default_gutter_horizontal_inches", "vinyl_machine_gutter_unavailable",
      `record a finite, nonnegative ${label} default horizontal gutter in Vinyl Settings or set a workflow override`, "layout");
  }
  if (!gutterVOverridden && recorded(machine?.default_gutter_vertical_inches)
      && vinylNonNegativeNumber(machine.default_gutter_vertical_inches) === null) {
    machineAdd(issues, wfIdx, machine, "default_gutter_vertical_inches", "vinyl_machine_gutter_unavailable",
      `record a finite, nonnegative ${label} default vertical gutter in Vinyl Settings or set a workflow override`, "layout");
  }
  // default_bleed_inches is consumed whenever an item leaves bleed blank.
  if (recorded(machine?.default_bleed_inches) && vinylNonNegativeNumber(machine.default_bleed_inches) === null) {
    machineAdd(issues, wfIdx, machine, "default_bleed_inches", "vinyl_machine_bleed_unavailable",
      `record a finite, nonnegative ${label} default bleed (inches) in Vinyl Settings`, "layout");
  }
  if (recorded(machine?.max_media_width_inches) && vinylPositiveNumber(machine.max_media_width_inches) === null) {
    machineAdd(issues, wfIdx, machine, "max_media_width_inches", "vinyl_machine_max_width_unavailable",
      `record a positive, finite ${label} max media width in Vinyl Settings before repricing`, "layout");
  }
};

const printerIssues = (issues, wfIdx, printer) => {
  if (vinylNonNegativeNumber(printer?.machine_hourly_rate) === null) {
    machineAdd(issues, wfIdx, printer, "machine_hourly_rate", "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative printer machine hourly rate in Vinyl Settings — a missing rate is not free", "printerMachine");
  }
  if (recorded(printer?.print_speed_sqft_per_hour) && vinylPositiveNumber(printer.print_speed_sqft_per_hour) === null) {
    machineAdd(issues, wfIdx, printer, "print_speed_sqft_per_hour", "vinyl_machine_speed_unavailable",
      "record a positive, finite printer speed (sq ft/hour) in Vinyl Settings before repricing", "printerMachine");
  }
  for (const field of ["warmup_minutes", "media_load_minutes", "calibration_minutes_per_job"]) {
    if (recorded(printer?.[field]) && vinylNonNegativeNumber(printer[field]) === null) {
      machineAdd(issues, wfIdx, printer, field, "vinyl_machine_minutes_unavailable",
        `record a finite, nonnegative printer ${field.replace(/_/g, " ")} in Vinyl Settings before repricing`, "printerMachine");
    }
  }
};

const cutterIssues = (issues, wfIdx, cutter) => {
  if (vinylNonNegativeNumber(cutter?.machine_hourly_rate) === null) {
    machineAdd(issues, wfIdx, cutter, "machine_hourly_rate", "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative cutter machine hourly rate in Vinyl Settings — a missing rate is not free", "cutterMachine");
  }
  if (vinylNonNegativeNumber(cutter?.cut_blade_cost) === null) {
    machineAdd(issues, wfIdx, cutter, "cut_blade_cost", "vinyl_machine_blade_unavailable",
      "record a finite, nonnegative cutter blade cost in Vinyl Settings — a missing blade cost is not free", "cutterMachine");
  }
  if (recorded(cutter?.cut_speed_inches_per_second) && vinylPositiveNumber(cutter.cut_speed_inches_per_second) === null) {
    machineAdd(issues, wfIdx, cutter, "cut_speed_inches_per_second", "vinyl_machine_speed_unavailable",
      "record a positive, finite cut speed (inches/second) in Vinyl Settings before repricing", "cutterMachine");
  }
  if (recorded(cutter?.cut_setup_minutes_per_job) && vinylNonNegativeNumber(cutter.cut_setup_minutes_per_job) === null) {
    machineAdd(issues, wfIdx, cutter, "cut_setup_minutes_per_job", "vinyl_machine_minutes_unavailable",
      "record a finite, nonnegative cut setup minutes in Vinyl Settings before repricing", "cutterMachine");
  }
  if (recorded(cutter?.cut_blade_life_minutes) && vinylPositiveNumber(cutter.cut_blade_life_minutes) === null) {
    machineAdd(issues, wfIdx, cutter, "cut_blade_life_minutes", "vinyl_machine_blade_unavailable",
      "record a positive, finite blade life (minutes) in Vinyl Settings before repricing", "cutterMachine");
  }
  // Pull-off feeds roll length consumed → layout hold.
  if (recorded(cutter?.cut_pull_off_inches_per_job) && vinylNonNegativeNumber(cutter.cut_pull_off_inches_per_job) === null) {
    machineAdd(issues, wfIdx, cutter, "cut_pull_off_inches_per_job", "vinyl_machine_pull_off_unavailable",
      "record a finite, nonnegative cut pull-off (inches/job) in Vinyl Settings before repricing", "layout");
  }
};

const laminatorIssues = (issues, wfIdx, laminator, isLeading) => {
  if (vinylNonNegativeNumber(laminator?.laminator_hourly_rate) === null) {
    machineAdd(issues, wfIdx, laminator, "laminator_hourly_rate", "vinyl_machine_rate_unavailable",
      "record a finite, nonnegative laminator hourly rate in Vinyl Settings — a missing rate is not free", "laminatorMachine");
  }
  if (recorded(laminator?.laminator_speed_inches_per_minute) && vinylPositiveNumber(laminator.laminator_speed_inches_per_minute) === null) {
    machineAdd(issues, wfIdx, laminator, "laminator_speed_inches_per_minute", "vinyl_machine_speed_unavailable",
      "record a positive, finite laminator speed (inches/minute) in Vinyl Settings before repricing", "laminatorMachine");
  }
  if (recorded(laminator?.laminator_setup_minutes_per_job) && vinylNonNegativeNumber(laminator.laminator_setup_minutes_per_job) === null) {
    machineAdd(issues, wfIdx, laminator, "laminator_setup_minutes_per_job", "vinyl_machine_minutes_unavailable",
      "record a finite, nonnegative laminator setup minutes in Vinyl Settings before repricing", "laminatorMachine");
  }
  // Laminator edges extend laminate length even when it isn't the leading
  // layout machine (laminator-specific consumption) → laminatePrice hold.
  if (!isLeading) {
    for (const field of ["leading_edge_inches", "trailing_edge_inches"]) {
      if (recorded(laminator?.[field]) && vinylNonNegativeNumber(laminator[field]) === null) {
        machineAdd(issues, wfIdx, laminator, field, "vinyl_machine_edge_unavailable",
          `record a finite, nonnegative laminator ${field.replace(/_/g, " ")} in Vinyl Settings before repricing`, "laminatePrice");
      }
    }
  }
};

// ---------- workflow-level issue scan ----------
// workflow: raw workflow record. resolved: { vinyl, laminate, transferTape,
//   printer, cutter, laminator } catalog rows found by id (null when missing).
// Returns issues in stable order: selection → parts → catalog → authored.
export const vinylWorkflowIssues = (workflow, resolved, index = 0) => {
  const issues = [];
  const wfId = workflow?.id ?? null;
  const items = workflow?.items || [];
  const hasItems = items.length > 0;
  const applyPrint = !!workflow?.apply_print;
  const applyCut = !!workflow?.apply_cut;
  const applyLaminate = !!workflow?.apply_laminate;
  const applyTT = !!workflow?.apply_transfer_tape;
  const { vinyl, laminate, transferTape, printer, cutter, laminator } = resolved;
  const add = (field, code, message, hold, itemIndex = null) =>
    issues.push(issue("vinyl", { index, itemIndex, field, code, message, hold }));

  // --- selection availability (only when the workflow actually has work) ---
  if (hasItems) {
    if (!recorded(workflow?.vinyl_id)) {
      add("vinyl_id", "vinyl_material_unassigned",
        `Workflow ${index + 1}: select a base vinyl before repricing — an unselected material prices as $0`, "layout");
    } else if (!vinyl) {
      issues.push(issue("vinyl", { index, inventoryId: workflow.vinyl_id, field: "vinyl_id",
        code: "vinyl_material_unavailable", hold: "layout",
        message: `Workflow ${index + 1}: the selected vinyl record is no longer available — reselect it` }));
    }
    if (applyLaminate) {
      if (!recorded(workflow?.laminate_id)) {
        add("laminate_id", "vinyl_laminate_unassigned",
          `Workflow ${index + 1}: laminate is applied but no laminate roll is selected`, "laminatePrice");
      } else if (!laminate) {
        issues.push(issue("vinyl", { index, inventoryId: workflow.laminate_id, field: "laminate_id",
          code: "vinyl_laminate_unavailable", hold: "laminatePrice",
          message: `Workflow ${index + 1}: the selected laminate record is no longer available — reselect it` }));
      }
    }
    if (applyTT) {
      if (!recorded(workflow?.transfer_tape_id)) {
        add("transfer_tape_id", "vinyl_transfer_tape_unassigned",
          `Workflow ${index + 1}: transfer tape is applied but no tape roll is selected`, "ttPrice");
      } else if (!transferTape) {
        issues.push(issue("vinyl", { index, inventoryId: workflow.transfer_tape_id, field: "transfer_tape_id",
          code: "vinyl_transfer_tape_unavailable", hold: "ttPrice",
          message: `Workflow ${index + 1}: the selected transfer tape record is no longer available — reselect it` }));
      }
    }
    for (const [flag, id, row, label] of [
      [applyPrint, workflow?.printer_id, printer, "printer"],
      [applyCut, workflow?.cutter_id, cutter, "cutter"],
      [applyLaminate, workflow?.laminator_id, laminator, "laminator"],
    ]) {
      if (!flag) continue;
      const field = `${label}_id`;
      if (!recorded(id)) {
        add(field, "vinyl_machine_unassigned",
          `Workflow ${index + 1}: ${label} is applied but no ${label} is selected — machine time would price as $0`, "layout");
      } else if (!row) {
        issues.push(issue("vinyl", { index, inventoryId: id, field,
          code: "vinyl_machine_unavailable", hold: "layout",
          message: `Workflow ${index + 1}: the selected ${label} record is no longer available — reselect it` }));
      }
    }
  }

  // --- part rows: dimensions must be positive, quantities whole+positive ---
  items.forEach((it, itemIndex) => {
    const where = `Part ${itemIndex + 1}${it?.description ? ` "${it.description}"` : ""} (workflow ${index + 1})`;
    for (const [field, human] of [["width_inches", "width"], ["height_inches", "height"]]) {
      if (vinylPositiveNumber(it?.[field]) === null) {
        add(field, "vinyl_part_dimension_unavailable",
          `${where}: record a positive, finite ${human} (inches) — a blank or zero dimension drops the part silently`, "layout", itemIndex);
      }
    }
    // Blank quantity defaults to 1 (ported behavior). Recorded must be a
    // positive whole number — floor() would silently reprice 2.7 → 2.
    if (recorded(it?.quantity) && vinylPositiveInteger(it.quantity) === null) {
      add("quantity", "vinyl_part_quantity_unavailable",
        `${where}: record a positive whole-number quantity`, "layout", itemIndex);
    }
    if (recorded(it?.bleed_inches) && vinylNonNegativeNumber(it.bleed_inches) === null) {
      add("bleed_inches", "vinyl_part_bleed_unavailable",
        `${where}: record a finite, nonnegative bleed (inches) or clear it`, "layout", itemIndex);
    }
  });

  // --- catalog field validation on selected records ---
  if (vinyl && hasItems) {
    vinylMaterialIssues(vinyl, "vinyl", index, wfId).forEach(i => issues.push(i));
  }
  if (laminate && applyLaminate && hasItems) {
    vinylMaterialIssues(laminate, "laminate", index, wfId).forEach(i => issues.push(i));
  }
  if (transferTape && applyTT && hasItems) {
    vinylMaterialIssues(transferTape, "transfer_tape", index, wfId).forEach(i => issues.push(i));
  }

  const leadingMachine = (applyPrint && printer) || (applyCut && cutter)
    || (applyLaminate && laminator) || printer || cutter || laminator;
  if (leadingMachine && hasItems) {
    const label = leadingMachine.machine_name || "machine";
    leadingMachineIssues(issues, index, leadingMachine, label, {
      gutterHOverridden: recorded(workflow?.gutter_h_override),
      gutterVOverridden: recorded(workflow?.gutter_v_override),
    });
  }
  if (applyPrint && printer) printerIssues(issues, index, printer);
  if (applyCut && cutter) cutterIssues(issues, index, cutter);
  if (applyLaminate && laminator) {
    laminatorIssues(issues, index, laminator, leadingMachine === laminator);
  }

  // --- ink rate (resolved exactly like the calculator does) ---
  if (applyPrint && printer && hasItems) {
    const quality = workflow?.print_quality || printer?.default_print_quality || "high_quality";
    if (!["draft", "production", "high_quality"].includes(quality)) {
      const srcField = recorded(workflow?.print_quality) ? "print_quality" : "default_print_quality";
      if (srcField === "print_quality") {
        add("print_quality", "vinyl_print_quality_unavailable",
          `Workflow ${index + 1}: set a supported print quality (draft / production / high_quality)`, "inkPrice");
      } else {
        machineAdd(issues, index, printer, "default_print_quality", "vinyl_print_quality_unavailable",
          "set a supported default print quality on the printer in Vinyl Settings", "inkPrice");
      }
    }
    const tierField = { draft: "print_cost_per_sqin_draft", production: "print_cost_per_sqin_production", high_quality: "print_cost_per_sqin_high_quality" }[quality];
    const tiered = vinylNonNegativeNumber(printer?.[tierField]);
    if (!(tiered !== null && tiered > 0)) {
      // Same fallback the calculator uses — legacy flat rate.
      if (vinylNonNegativeNumber(printer?.print_cost_per_sqin) === null) {
        machineAdd(issues, index, printer, recorded(printer?.[tierField]) ? tierField : "print_cost_per_sqin",
          "vinyl_ink_rate_unavailable",
          `record a finite, nonnegative printer ink cost per sq in (${quality.replace(/_/g, " ")} tier or the flat rate) in Vinyl Settings — a missing ink rate is not free`, "inkPrice");
      }
    }
  }

  // --- authored workflow inputs ---
  for (const [field, human] of [["gutter_h_override", "horizontal gutter"], ["gutter_v_override", "vertical gutter"]]) {
    if (hasItems && recorded(workflow?.[field]) && vinylNonNegativeNumber(workflow[field]) === null) {
      add(field, "vinyl_gutter_override_unavailable",
        `Workflow ${index + 1}: record a finite, nonnegative ${human} override (inches) or clear it`, "layout");
    }
  }
  if (hasItems && recorded(workflow?.spoilage_buffer_percent) && vinylNonNegativeNumber(workflow.spoilage_buffer_percent) === null) {
    add("spoilage_buffer_percent", "vinyl_spoilage_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative spoilage buffer % or clear it`, "layout");
  }
  // setup_fee_floor is consumed even for an empty workflow (floor applies to total).
  if (recorded(workflow?.setup_fee_floor) && vinylNonNegativeNumber(workflow.setup_fee_floor) === null) {
    add("setup_fee_floor", "vinyl_setup_fee_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative setup-fee floor ($) or clear it`, "floor");
  }
  if (applyCut && hasItems) {
    const wd = workflow?.weeding_difficulty;
    if (recorded(wd) && !(wd in WEEDING_LABOR_MINUTES_PER_PART)) {
      add("weeding_difficulty", "vinyl_weeding_difficulty_unavailable",
        `Workflow ${index + 1}: choose a supported weeding difficulty`, "labor");
    }
    if (recorded(workflow?.weeding_minutes_per_part_override)
        && vinylNonNegativeNumber(workflow.weeding_minutes_per_part_override) === null) {
      add("weeding_minutes_per_part_override", "vinyl_weeding_override_unavailable",
        `Workflow ${index + 1}: record a finite, nonnegative weeding minutes/part override or clear it`, "labor");
    }
  }
  if (hasItems && recorded(workflow?.install_minutes_per_part)
      && vinylNonNegativeNumber(workflow.install_minutes_per_part) === null) {
    add("install_minutes_per_part", "vinyl_install_minutes_unavailable",
      `Workflow ${index + 1}: record a finite, nonnegative application minutes/part or clear it`, "labor");
  }

  // --- workflow personnel rows ---
  (workflow?.personnel || []).forEach((p, itemIndex) => {
    const hrs = recorded(p?.hours) ? vinylNumber(p.hours) : null;
    const rate = recorded(p?.hourly_rate) ? vinylNumber(p.hourly_rate) : null;
    const role = p?.role || `role ${itemIndex + 1}`;
    const hasHours = hrs !== null && hrs > 0;
    if (recorded(p?.hours) && (hrs === null || hrs < 0)) {
      add("hours", "vinyl_personnel_hours_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a finite, nonnegative hours value or clear it`, "labor", itemIndex);
    }
    if (recorded(p?.hourly_rate) && (rate === null || rate < 0)) {
      add("hourly_rate", "vinyl_personnel_rate_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a finite, nonnegative hourly rate`, "labor", itemIndex);
    }
    // A row with hours but no usable rate is skipped by the calculator —
    // the hours silently bill $0. Flag it.
    if (hasHours && (rate === null || rate <= 0)) {
      add("hourly_rate", "vinyl_personnel_rate_unavailable",
        `Role "${role}" (workflow ${index + 1}): record a positive hourly rate or clear the hours — ${hrs} hr would bill $0`, "labor", itemIndex);
    }
  });

  // --- fallback operator rate (consumed only when no usable personnel rows) ---
  const usablePersonnel = (workflow?.personnel || []).some(
    (p) => vinylPositiveNumber(p?.hours) !== null && vinylPositiveNumber(p?.hourly_rate) !== null
  );
  if (hasItems && !usablePersonnel) {
    const resolved = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate;
    const resolvedFrom = printer?.operator_hourly_rate != null ? printer
      : cutter?.operator_hourly_rate != null ? cutter
      : laminator?.operator_hourly_rate != null ? laminator : null;
    if (resolved != null && vinylNonNegativeNumber(resolved) === null && resolvedFrom) {
      machineAdd(issues, index, resolvedFrom, "operator_hourly_rate", "vinyl_operator_rate_unavailable",
        `record a finite, nonnegative operator hourly rate on ${resolvedFrom.machine_name || "the leading machine"} in Vinyl Settings, or add workflow personnel`, "labor");
    }
  }

  return issues;
};

// ---------- calc wrapper ----------
// Replicates VinylWorkflowCard's exact argument construction so a clean
// workflow produces a bit-identical calc. Returns:
//   { calc, issues, held, resolved }
// `calc` is the real result when held=false; when held=true every field a
// flagged input could have tainted is null and aggregates are re-derived
// null-propagating. shelves/partsPlaced/partsUnplaced and the geometry the
// visualizer needs stay real so layout rows never disappear.
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const calcVinylWorkflow = ({ workflow, vinyls = [], machines = [], index = 0 }) => {
  const printer   = machines.find(m => m.id === workflow?.printer_id)   || null;
  const cutter    = machines.find(m => m.id === workflow?.cutter_id)    || null;
  const laminator = machines.find(m => m.id === workflow?.laminator_id) || null;
  const vinyl        = vinyls.find(v => v.id === workflow?.vinyl_id)         || null;
  const laminate     = vinyls.find(v => v.id === workflow?.laminate_id)      || null;
  const transferTape = vinyls.find(v => v.id === workflow?.transfer_tape_id) || null;
  const resolved = { vinyl, laminate, transferTape, printer, cutter, laminator };

  const issues = vinylWorkflowIssues(workflow, resolved, index);

  // Byte-identical argument construction to VinylWorkflowCard's useMemo.
  const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;
  const calc = calculateVinylProject({
    items: workflow?.items || [],
    printer, cutter, laminator,
    vinyl, laminate, transferTape,
    operatorHourlyRate: operatorRate,
    applyPrint: !!workflow?.apply_print,
    applyCut: !!workflow?.apply_cut,
    applyLaminate: !!workflow?.apply_laminate,
    applyTransferTape: !!workflow?.apply_transfer_tape,
    overrideGutterH: workflow?.gutter_h_override === "" || workflow?.gutter_h_override == null ? undefined : num(workflow.gutter_h_override),
    overrideGutterV: workflow?.gutter_v_override === "" || workflow?.gutter_v_override == null ? undefined : num(workflow.gutter_v_override),
    printQuality: workflow?.print_quality || printer?.default_print_quality || "high_quality",
    weedingDifficulty: workflow?.weeding_difficulty || "moderate",
    weedingMinutesPerPartOverride: workflow?.weeding_minutes_per_part_override,
    installMinutesPerPart: workflow?.install_minutes_per_part,
    personnel: workflow?.personnel || [],
    spoilageBufferPercent: num(workflow?.spoilage_buffer_percent),
    setupFeeFloor: num(workflow?.setup_fee_floor),
  });

  if (calc.partsUnplaced > 0) {
    issues.push(issue("vinyl", {
      index, field: "items", code: "vinyl_parts_unplaced", hold: "layout",
      message: `Workflow ${index + 1}: ${calc.partsUnplaced} part(s) do not fit on the usable roll width — rotate, split, or choose a wider roll`,
    }));
  }

  const held = issues.length > 0;
  if (!held) {
    calc.__held = false;
    calc.pricingUnavailable = false;
    calc.issues = [];
    return { calc, issues, held, resolved };
  }

  const out = { ...calc };
  const poisoned = new Set();
  issues.forEach(i => (HOLD_FIELDS[i.hold] || HOLD_FIELDS.layout).forEach(f => poisoned.add(f)));
  for (const f of poisoned) out[f] = null;

  // Re-derive aggregates null-propagating from possibly-nulled bases.
  const sumOrNull = (...xs) => xs.every(v => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
  out.materialCost = sumOrNull(out.vinylCost, out.laminateCost, out.transferTapeCost, out.inkCost, out.bladeCost);
  out.machineCost = sumOrNull(out.printMachineCost, out.cutMachineCost, out.laminateMachineCost);
  out.preFloorTotal = sumOrNull(out.materialCost, out.machineCost, out.laborCost);
  out.setupFeeApplied = (poisoned.has("setupFeeApplied") || !Number.isFinite(out.preFloorTotal))
    ? null : calc.setupFeeApplied;
  out.totalCost = (Number.isFinite(out.preFloorTotal) && Number.isFinite(out.setupFeeApplied))
    ? out.preFloorTotal + out.setupFeeApplied : null;

  out.__held = true;
  out.pricingUnavailable = true;
  out.issues = issues;
  return { calc: out, issues, held, resolved };
};

// ---------- project-level issue scan ----------
// Covers everything rollupVinylProject consumes outside the workflow calcs:
// equipment/personnel totals, travel, supplies %, markup %, and the shared
// install settings the rows were priced from.
export const vinylProjectInputIssues = (project, { settings = {}, equipmentInventory = [] } = {}) => {
  const issues = [];
  const add = (field, code, message) =>
    issues.push(issue("vinyl", { field, code, message, hold: "project" }));
  const addCat = (field, code, message, inventoryId = null) =>
    issues.push(issue("vinyl_catalog", { field, code, message, hold: "project", inventoryId }));

  // --- selected equipment rows: total_cost is the consumed value ---
  (project?.selected_equipment || []).forEach((e, itemIndex) => {
    const name = e?.equipment_name || `row ${itemIndex + 1}`;
    if (recorded(e?.equipment_id) && !equipmentInventory.some(inv => inv.id === e.equipment_id)) {
      addCat("selected_equipment", "vinyl_equipment_unavailable",
        `Equipment "${name}": the selected equipment record is no longer available — reselect it`, e.equipment_id);
    }
    if (vinylNonNegativeNumber(e?.total_cost) === null) {
      add("total_cost", "vinyl_equipment_cost_unavailable",
        `Equipment "${name}": record a finite, nonnegative total cost — a missing cost is not free`);
    }
  });

  // --- install personnel rows: total_cost is the consumed value ---
  (project?.personnel || []).forEach((p, itemIndex) => {
    const role = p?.role || p?.name || `row ${itemIndex + 1}`;
    if (vinylNonNegativeNumber(p?.total_cost) === null) {
      add("total_cost", "vinyl_personnel_cost_unavailable",
        `Crew "${role}": record a finite, nonnegative total cost — a missing cost is not free`);
    }
  });
  // The role-rate settings are consumed whenever install crew rows exist;
  // a malformed one silently reprices future rows at $0 or the wrong default.
  if ((project?.personnel || []).length > 0) {
    const roleMap = {
      "Crew Lead": "install_crew_lead_rate",
      "Installer": "install_installer_rate",
      "Helper": "install_helper_rate",
    };
    const rolesPresent = new Set((project.personnel || []).map(p => p?.role).filter(r => r in roleMap));
    rolesPresent.forEach((role) => {
      const field = roleMap[role];
      if (vinylPositiveNumber(settings?.[field]) === null) {
        addCat(field, "vinyl_install_rate_unavailable",
          `Setting ${field}: record a positive, finite ${role} rate in Installation Settings — crew pricing is unavailable`);
      }
    });
  }

  // --- travel ---
  const miles = project?.travel_miles_round_trip;
  const milesNum = recorded(miles) && miles !== 0 ? vinylNonNegativeNumber(miles) : 0;
  if (recorded(miles) && miles !== "" && vinylNonNegativeNumber(miles) === null) {
    add("travel_miles_round_trip", "vinyl_travel_miles_unavailable",
      "record a finite, nonnegative round-trip mileage — travel pricing is unavailable");
  }
  if (recorded(project?.total_travel_cost) && project.total_travel_cost !== ""
      && vinylNonNegativeNumber(project.total_travel_cost) === null) {
    add("total_travel_cost", "vinyl_travel_cost_unavailable",
      "recorded travel cost is not a finite, nonnegative number — recalculate travel before repricing");
  }
  if (milesNum !== null && milesNum > 0) {
    // TravelCostCard consumes these settings when mileage is set.
    for (const [field, human] of [
      ["install_gasoline_price_per_gallon", "gasoline price per gallon"],
      ["install_diesel_price_per_gallon", "diesel price per gallon"],
      ["install_travel_labor_rate", "travel labor rate"],
      ["install_travel_avg_speed_mph", "travel average speed (mph)"],
    ]) {
      if (vinylPositiveNumber(settings?.[field]) === null) {
        addCat(field, "vinyl_travel_setting_unavailable",
          `Setting ${field}: record a positive, finite ${human} in Installation Settings — travel pricing is unavailable`);
      }
    }
    for (const [field, human] of [
      ["install_travel_overhead_per_mile", "travel overhead per mile"],
      ["install_min_travel_charge", "minimum travel charge"],
    ]) {
      if (recorded(settings?.[field]) && vinylNonNegativeNumber(settings[field]) === null) {
        addCat(field, "vinyl_travel_setting_unavailable",
          `Setting ${field}: record a finite, nonnegative ${human} in Installation Settings — travel pricing is unavailable`);
      }
    }
    // Owned vehicle fuel economy is consumed for fuel cost.
    (project?.selected_equipment || []).forEach((e) => {
      if (!recorded(e?.equipment_id)) return;
      const inv = equipmentInventory.find(r => r.id === e.equipment_id);
      if (!inv) return; // dangling id already flagged
      const owned = inv.ownership === "owned" || inv.pricing_mode === "owned_flat";
      const isVehicle = ["van", "truck", "vehicle", "suv", "car"].includes(String(inv.equipment_type || "").toLowerCase());
      if (owned && isVehicle && vinylPositiveNumber(inv.mpg) === null) {
        addCat("mpg", "vinyl_vehicle_mpg_unavailable",
          `Equipment "${inv.equipment_name || e.equipment_name}": record a positive, finite MPG in inventory — travel fuel pricing is unavailable`, inv.id);
      }
    });
  }

  // --- project cost knobs ---
  if (recorded(project?.supplies_percent_of_materials) && vinylNonNegativeNumber(project.supplies_percent_of_materials) === null) {
    add("supplies_percent_of_materials", "vinyl_supplies_percent_unavailable",
      "record a finite, nonnegative supplies % of materials or clear it");
  }
  if (recorded(project?.extra_supplies_cost) && vinylNonNegativeNumber(project.extra_supplies_cost) === null) {
    add("extra_supplies_cost", "vinyl_extra_supplies_unavailable",
      "record a finite, nonnegative extra supplies cost ($) or clear it");
  }
  if (recorded(project?.markup_percent) && vinylNonNegativeNumber(project.markup_percent) === null) {
    add("markup_percent", "vinyl_markup_unavailable",
      "record a finite, nonnegative markup % or clear it");
  }

  return issues;
};

// ---------- UI helpers ----------
// All issues attached to a single field (optionally a single row).
export const issuesForField = (issues = [], field, itemIndex = null) =>
  issues.filter(i => i.field === field && (itemIndex === null || i.itemIndex === itemIndex));
export const hasIssueFor = (issues = [], field, itemIndex = null) =>
  issuesForField(issues, field, itemIndex).length > 0;
