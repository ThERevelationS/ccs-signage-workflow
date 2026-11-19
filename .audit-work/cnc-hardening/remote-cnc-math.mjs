// Verbatim port of the REMOTE CNC pricing math, extracted from
// remote-src/src/pages/CNCEstimator.jsx @ HEAD 4b50077. This is a TEST
// FIXTURE ONLY — used by verify-cnc-model.mjs (valid-path parity) and
// verify-cnc-red.mjs (defect proofs). Not a candidate file.
//
// Remote structure: updateItem() bakes derived fields onto the stored item at
// edit time; calculateTotals() sums those stored snapshots. Settings are read
// through `parseFloat(x) || default` laundered parsers throughout.

// Remote sourceDefaults (loadPrerequisites, remote lines 93–99).
export const remoteSourceDefaults = (settingsObj) => ({
  machine_rate_per_hour: parseFloat(settingsObj.cnc_machine_rate) || 75,
  labor_rate: parseFloat(settingsObj.cnc_labor_rate) || 45,
  setup_time_percentage: parseFloat(settingsObj.cnc_setup_time_percentage) || 20,
  fixed_setup_hours: parseFloat(settingsObj.min_cnc_setup_hours) || 0,
  notes: settingsObj.default_notes_template || "",
});

// Remote updateItem derived math (remote lines 191–224) — pure version of the
// setProject updater: given the post-patch item + project(prev) + settings,
// returns the item with baked machine_time_hours / setup_time_hours /
// machine_cost / labor_cost. Includes the lettering quantity=1 rule and the
// thickness→cut_speed pick for completeness of the staleness simulation.
export function remoteUpdateItemCalc(item, prev, globalSettings, { field = null, value = null } = {}) {
  const out = { ...item };
  if (field === 'item_type' && value === 'lettering') out.quantity = 1;
  if (out.item_type === 'lettering') out.quantity = 1;

  if (field === 'material_thickness') {
    const speedSettingKey = `cnc_cut_speed_${value.replace('/', '_').replace('-', '_')}`;
    out.cut_speed_ipm = parseFloat(globalSettings[speedSettingKey]) || 50;
  }

  const letterPerimFactor = parseFloat(globalSettings.cnc_letter_perimeter_factor) || 3.5;

  let cutLength = 0;
  if (out.item_type === 'panel') {
    cutLength = (out.length + out.width) * 2;
  } else if (out.item_type === 'lettering') {
    cutLength = out.letter_height * letterPerimFactor * out.num_letters;
  }

  const materialCutMultiplierKey = `${out.material_type.toLowerCase()}_cnc_cut_multiplier`;
  const cutMultiplier = parseFloat(globalSettings[materialCutMultiplierKey]) || 1.0;
  const cutTimeMinutes = cutLength > 0 && out.cut_speed_ipm > 0
    ? (cutLength / out.cut_speed_ipm) * cutMultiplier : 0;
  const carveTimeMinutes = out.carve_area_sqin > 0 && out.carve_speed_sqipm > 0
    ? out.carve_area_sqin / out.carve_speed_sqipm : 0;

  const machineTimeHours = ((cutTimeMinutes + carveTimeMinutes) * out.quantity) / 60;
  out.machine_time_hours = machineTimeHours;

  const setupTimeHours = machineTimeHours * (prev.setup_time_percentage / 100);
  out.setup_time_hours = setupTimeHours;

  out.machine_cost = machineTimeHours * prev.machine_rate_per_hour;
  out.labor_cost = setupTimeHours * prev.labor_rate;
  return out;
}

// Remote calculateTotals (remote lines 227–251) — verbatim. Sums the STORED
// item snapshots (this is the reprice-staleness surface).
export function remoteCalculateTotals(project, globalSettings) {
  const totalMachineCost = project.items.reduce((sum, item) => sum + (item.machine_cost || 0), 0);
  const dynamicLaborFromItems = project.items.reduce((sum, item) => sum + (item.labor_cost || 0), 0);
  const totalSetupHours = project.items.reduce((sum, item) => sum + (item.setup_time_hours || 0), 0);
  const fixedSetupCost = (project.fixed_setup_hours || 0) * project.labor_rate;
  const minLaborHours = parseFloat(globalSettings.min_cnc_labor_hours) || 0;

  // Source behavior: minimum applies only to the dynamic item setup portion,
  // while fixed setup remains additive.
  const effectiveDynamicLabor = totalSetupHours > 0 && totalSetupHours < minLaborHours
    ? minLaborHours * project.labor_rate
    : dynamicLaborFromItems;
  const minimumDynamicLaborAdjustment = effectiveDynamicLabor - dynamicLaborFromItems;
  const totalLaborCost = fixedSetupCost + effectiveDynamicLabor;

  return {
    totalMachine: totalMachineCost,
    totalLabor: totalLaborCost,
    totalSetupHours,
    dynamicLaborFromItems,
    fixedSetupCost,
    minLaborHours,
    minimumDynamicLaborAdjustment,
  };
}

// Convenience: remote "session" — price every item once via the remote
// updateItem math (what remote bakes at edit time), then total it.
export function remoteSessionTotals(project, globalSettings) {
  const priced = project.items.map((item) => remoteUpdateItemCalc(item, project, globalSettings));
  return { items: priced, totals: remoteCalculateTotals({ ...project, items: priced }, globalSettings) };
}
