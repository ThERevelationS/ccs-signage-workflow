/**
 * Foundation cost math — ported VERBATIM from SignEstimate Pro
 * (src/pages/NewFoundationEstimate.jsx: getConcreteMixes / getConcreteAdmixtures /
 *  getSmallLoadFee / getFuelSurcharge / calcItemCost / concrete truck totals).
 *
 * Do not "improve" these formulas — they must stay identical to SignEstimate Pro.
 * `settings` is the Settings entity key/value map; `inventory` is FoundationInventory
 * rows plus concrete suppliers normalized out of LaborServiceInventory.
 */

export const getConcreteMixes = (invItem) => [
  { id: '3500_ae', name: '3500 AIR ENTRAINED (AE)', price: invItem?.mix_3500_price ?? 195.40, desc: 'Often used for driveways, slabs, and moderate-load footings.' },
  { id: '4000_ae', name: '4000 AIR ENTRAINED (AE)', price: invItem?.mix_4000_price ?? 201.00, desc: 'STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability.' },
  { id: '4500_ae', name: '4500 AIR ENTRAINED (AE)', price: invItem?.mix_4500_price ?? 208.70, desc: 'Used for heavy-duty commercial slabs and heavy traffic areas.' },
  { id: '5000_ae', name: '5000 AIR ENTRAINED (AE)', price: invItem?.mix_5000_price ?? 214.60, desc: 'High-strength mix for heavy structural columns, pillars, and extreme load conditions.' },
  { id: 'fast_set', name: 'FAST SET', price: invItem?.mix_fast_set_price ?? 248.00, desc: 'Quick-curing concrete used when rapid strength gain is needed to minimize downtime.' },
];

export const getConcreteAdmixtures = (invItem) => [
  { id: 'calcium_chloride', name: 'Calcium Chloride', price: invItem?.admix_calcium_chloride_price ?? 8.50, desc: 'Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn\'t freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!' },
  { id: 'set_retarding', name: 'Set-Retarding Admix (Type D)', price: invItem?.admix_set_retarding_price ?? 4.50, desc: 'Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site.' },
  { id: 'water_reducing', name: 'Water-Reducing Admix (Type A)', price: invItem?.admix_water_reducing_price ?? 4.25, desc: 'Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar.' },
  { id: 'fibers', name: 'Fibers', price: invItem?.admix_fibers_price ?? 12.50, desc: 'Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse.' },
  { id: 'winter_service', name: 'Winter Service', price: invItem?.admix_winter_service_price ?? 5.50, desc: 'A fee the plant charges to use hot water so the mix doesn\'t freeze. SELECT THIS always during winter months when temperatures are freezing.' },
];

// Get the small load fee for a given number of yards based on supplier bracket pricing
export const getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return invItem?.small_load_fee_4_5_4_75 ?? 40;
  if (yards >= 4) return invItem?.small_load_fee_4_4_25 ?? 80;
  if (yards >= 3) return invItem?.small_load_fee_3_3_75 ?? 105;
  if (yards >= 2) return invItem?.small_load_fee_2_2_75 ?? 120;
  if (yards >= 1) return invItem?.small_load_fee_1_1_75 ?? 150;
  return invItem?.small_load_fee_1_1_75 ?? 150; // under 1 yd still gets the smallest bracket fee
};

export const getFuelSurcharge = (invItem) => {
  return invItem?.fuel_surcharge ?? 30;
};

/** Normalize a LaborServiceInventory concrete supplier into the shape this math expects. */
export const normalizeConcreteSupplier = (row) => ({
  id: row.id,
  material_name: row.service_name,
  material_description: row.description || "",
  material_type: "concrete_service",
  supplier: row.vendor_name || row.service_name,
  cost_per_unit: row.default_rate || 0,
  unit: "cy",
  minimum_order_yards: row.minimum_order_yards || 0,
  below_minimum_cost_per_cy: row.below_minimum_cost_per_cy || 0,
  minimum_cost: row.minimum_charge || 0,
  mix_3500_price: row.mix_3500_price || 0,
  mix_4000_price: row.mix_4000_price || 0,
  mix_4500_price: row.mix_4500_price || 0,
  mix_5000_price: row.mix_5000_price || 0,
  mix_fast_set_price: row.mix_fast_set_price || 0,
  admix_calcium_chloride_price: row.admix_calcium_chloride_price || 0,
  admix_set_retarding_price: row.admix_set_retarding_price || 0,
  admix_water_reducing_price: row.admix_water_reducing_price || 0,
  admix_fibers_price: row.admix_fibers_price || 0,
  admix_winter_service_price: row.admix_winter_service_price || 0,
  small_load_fee_1_1_75: row.small_load_fee_1_1_75 || 0,
  small_load_fee_2_2_75: row.small_load_fee_2_2_75 || 0,
  small_load_fee_3_3_75: row.small_load_fee_3_3_75 || 0,
  small_load_fee_4_4_25: row.small_load_fee_4_4_25 || 0,
  small_load_fee_4_5_4_75: row.small_load_fee_4_5_4_75 || 0,
  fuel_surcharge: row.fuel_surcharge || 0,
  show_in_foundation: row.show_in_foundation !== false,
  _source: "labor_services",
});

export const calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(settings[key] || def);

  const selectedConcrete = inventory.find(c => c.id === item.selected_concrete_id);
  const conc_cost = item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== undefined
    ? item.custom_concrete_cost_per_cy
    : (selectedConcrete?.cost_per_unit || 0);

  // Find the selected rebar from inventory (matching the #size)
  const selectedRebar = inventory.find(r => r.material_type === 'rebar' && r.rebar_size === item.rebar_size);
  const pillarSelectedRebar = inventory.find(r => r.material_type === 'rebar' && r.rebar_size === (item.pillar_rebar_size || '#4'));
  const activeRebar = item.foundation_type === 'spread_foot' ? selectedRebar : pillarSelectedRebar;

  const rebar_cost = item.custom_rebar_cost_per_ft !== null && item.custom_rebar_cost_per_ft !== undefined
    ? item.custom_rebar_cost_per_ft
    : (activeRebar?.cost_per_unit || 0);

  const main_labor_rate = getSetting('foundation_main_labor_rate', 60);
  const rebar_time_cross_section = getSetting('foundation_rebar_time_cross_section', 0.05);
  const rebar_time_linear_ft = getSetting('foundation_rebar_time_linear_ft', 0.02);

  const forming_cost_per_sqft = getSetting('foundation_forming_cost_per_sqft', 2.50);
  const pouring_cost_per_cy = getSetting('foundation_pouring_cost_per_cy', 15);
  const finishing_cost_per_sqft = getSetting('foundation_finishing_cost_per_sqft', 1.25);

  const forming_mult = item.foundation_type === 'spread_foot'
    ? getSetting('foundation_forming_materials_spread_foot', 0.5)
    : getSetting('foundation_forming_materials_pillar', 0.75);

  let baseVolumeCY = 0;
  const lenIn = parseFloat(item.length_inches) || 0;
  const widIn = parseFloat(item.width_inches) || 0;
  const depIn = parseFloat(item.depth_inches) || 0;
  const diaIn = parseFloat(item.diameter) || 0;

  if (item.foundation_type === 'spread_foot') {
    baseVolumeCY = ((lenIn / 12) * (widIn / 12) * (depIn / 12)) / 27;
  } else {
    const r = (diaIn / 2) / 12;
    baseVolumeCY = (Math.PI * r * r * (depIn / 12)) / 27;
  }
  baseVolumeCY = baseVolumeCY * (item.quantity || 1);

  const volumeCY = item.custom_concrete_qty !== null && item.custom_concrete_qty !== undefined ? item.custom_concrete_qty : baseVolumeCY;

  let concreteCost = 0;
  let baseBags = null;
  let concreteBags = null;

  if (selectedConcrete?.material_type === 'bagged_concrete') {
    baseBags = Math.ceil(baseVolumeCY * 45); // ~45 80lb bags per CY
    concreteBags = item.custom_concrete_qty !== null && item.custom_concrete_qty !== undefined ? item.custom_concrete_qty : baseBags;
    concreteCost = concreteBags * conc_cost;
  }

  let rebarCost = 0;
  let baseRebarFt = 0;
  let totalIntersections = 0;

  if (item.include_rebar && item.foundation_type === 'spread_foot') {
    const nBarsL = Math.floor(widIn / (parseFloat(item.rebar_spacing_width) || 12)) + 1;
    const nBarsW = Math.floor(lenIn / (parseFloat(item.rebar_spacing_length) || 12)) + 1;
    const layers = parseInt(item.rebar_layers) || 1;
    const horizontalFt = (nBarsL * (lenIn / 12) + nBarsW * (widIn / 12)) * layers;

    const numIntersections = nBarsL * nBarsW * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const verticalFt = numIntersections * verticalLengthFt;

    baseRebarFt = (horizontalFt + verticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = numIntersections * (parseInt(item.quantity) || 1);
  } else if (item.include_rebar && item.foundation_type === 'pillar') {
    const hoopDia = parseFloat(item.pillar_rebar_hoop_diameter) || Math.max(0, diaIn - 4);
    const safeHoopDia = Math.min(hoopDia, Math.max(0, diaIn - 4));
    const layers = parseInt(item.pillar_rebar_layers) || 1;
    const verticalCount = parseInt(item.pillar_vertical_rebar_count) || 4;

    const hoopLengthFt = (Math.PI * safeHoopDia) / 12;
    const totalHoopFt = hoopLengthFt * layers;

    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const totalVerticalFt = verticalCount * verticalLengthFt;

    baseRebarFt = (totalHoopFt + totalVerticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = (layers * verticalCount) * (parseInt(item.quantity) || 1);
  }

  const rebarFt = item.custom_rebar_qty !== null && item.custom_rebar_qty !== undefined ? item.custom_rebar_qty : baseRebarFt;
  if (item.include_rebar) {
    const materialCost = rebarFt * rebar_cost;
    const totalTimeHours = (totalIntersections * rebar_time_cross_section) + (rebarFt * rebar_time_linear_ft);
    const laborCost = totalTimeHours * main_labor_rate;
    rebarCost = materialCost + laborCost;
  }

  let formingCost = 0;
  let baseFormingQty = 0;
  const selectedForming = inventory.find(i => i.id === item.selected_forming_id);
  const forming_rate = item.custom_forming_rate !== null && item.custom_forming_rate !== undefined ? item.custom_forming_rate : (selectedForming?.cost_per_unit || 0);

  if (item.include_forming) {
    const perim = item.foundation_type === 'spread_foot'
      ? 2 * (lenIn + widIn) / 12
      : Math.PI * diaIn / 12;
    const formingAreaSqFt = perim * (depIn / 12);

    // Calculate pcs based on perimeter — standard 16ft lengths
    baseFormingQty = Math.ceil(perim / 16) * (parseInt(item.quantity) || 1);
    const formingQty = item.custom_forming_qty !== null && item.custom_forming_qty !== undefined ? item.custom_forming_qty : baseFormingQty;

    const formingMaterialCost = formingQty * forming_rate;

    // Keep old labor calculation logic
    const laborCost = formingAreaSqFt * (parseInt(item.quantity) || 1) * forming_cost_per_sqft;
    formingCost = laborCost + formingMaterialCost + (concreteCost * forming_mult);
  }

  let finishingCost = 0;
  let baseFinishingHours = 0;
  const finishing_rate = item.custom_finishing_rate !== null && item.custom_finishing_rate !== undefined ? item.custom_finishing_rate : main_labor_rate;

  if (item.include_finishing) {
    const topArea = item.foundation_type === 'spread_foot'
      ? (lenIn * widIn) / 144
      : Math.PI * ((diaIn / 2 / 12) ** 2);

    // back out hours from sqft cost formula
    const defaultFinishingCost = topArea * (parseInt(item.quantity) || 1) * finishing_cost_per_sqft;
    baseFinishingHours = defaultFinishingCost / main_labor_rate;
    const finishingHours = item.custom_finishing_hours !== null && item.custom_finishing_hours !== undefined ? item.custom_finishing_hours : baseFinishingHours;

    finishingCost = finishingHours * finishing_rate;
  }

  const pouringCost = volumeCY * pouring_cost_per_cy;

  let excavationCost = 0;
  let baseExcavationHours = 0;
  const excVol = volumeCY * 1.25;
  if (item.excavation_method === 'hand_dig' || !item.excavation_method) {
    const timePerCy = getSetting('foundation_hand_dig_time_per_cy', 2.0);
    baseExcavationHours = excVol * timePerCy;
  } else {
    const timePerCy = getSetting('foundation_equipment_excavation_time_per_cy', 0.5);
    baseExcavationHours = excVol * timePerCy;
  }

  const excavationHours = item.custom_excavation_hours !== null && item.custom_excavation_hours !== undefined ? item.custom_excavation_hours : baseExcavationHours;
  const excavation_rate = item.custom_excavation_rate !== null && item.custom_excavation_rate !== undefined ? item.custom_excavation_rate : main_labor_rate;

  excavationCost = excavationHours * excavation_rate;

  return {
    concreteCost,
    concreteBags,
    volumeCY,
    baseVolumeCY,
    baseBags,
    rebarCost,
    rebarFt,
    baseRebarFt,
    formingCost,
    formingQty: item.custom_forming_qty !== null && item.custom_forming_qty !== undefined ? item.custom_forming_qty : baseFormingQty,
    baseFormingQty,
    finishingCost,
    finishingHours: item.custom_finishing_hours !== null && item.custom_finishing_hours !== undefined ? item.custom_finishing_hours : baseFinishingHours,
    baseFinishingHours,
    pouringCost,
    excavationCost,
    excavationHours,
    baseExcavationHours,
    concreteRate: conc_cost,
    rebarRate: rebar_cost,
    formingRate: forming_rate,
    finishingRate: finishing_rate,
    excavationRate: excavation_rate,
    selectedConcreteName: selectedConcrete?.material_name || '',
    selectedRebarName: activeRebar?.material_name || '',
    selectedFormingName: selectedForming?.material_name || '',
    total: concreteCost + rebarCost + formingCost + finishingCost + pouringCost + excavationCost,
  };
};

/**
 * Project-level concrete delivery math: 9-yard trucks, quarter-yard rounding,
 * small-load fee bracket + fuel surcharge per truck, plus $100 per new sign location stop.
 */
export const calcConcreteDelivery = (project, items = [], inventory = []) => {
  const concreteServiceItems = items.filter((item) => {
    const inv = inventory.find(i => i.id === item.selected_concrete_id);
    return !inv || inv.material_type === 'concrete_service';
  });
  const totalConcreteYards = concreteServiceItems.reduce((sum, item) => sum + calcItemCost(item, inventory, project.settings || {}).volumeCY, 0);
  const roundedYards = Math.ceil(totalConcreteYards * 4) / 4;

  const firstConcreteItem = concreteServiceItems.find(i => inventory.find(inv => inv.id === i.selected_concrete_id)?.material_type === 'concrete_service');
  const firstConcreteInv = firstConcreteItem ? inventory.find(inv => inv.id === firstConcreteItem.selected_concrete_id) : null;

  const availableMixes = getConcreteMixes(firstConcreteInv);
  const availableAdmixes = getConcreteAdmixtures(firstConcreteInv);

  const mix = availableMixes.find(m => m.id === project.project_concrete_type) || availableMixes.find(m => m.id === '4000_ae');
  const mixPrice = mix ? mix.price : 201;

  const admixPrice = (project.project_concrete_admixtures || []).reduce((sum, admixId) => {
    const a = availableAdmixes.find(x => x.id === admixId);
    return sum + (a ? a.price : 0);
  }, 0);

  const ratePerYard = mixPrice + admixPrice;

  let concreteTotal = 0;
  let remainingYards = roundedYards;
  const trucksList = [];
  const fuelSurcharge = getFuelSurcharge(firstConcreteInv);

  while (remainingYards > 0) {
    const truckYards = Math.min(remainingYards, 9);
    remainingYards -= truckYards;

    // Round up to next quarter yard for cost calculation
    const roundedTruckYards = Math.ceil(truckYards * 4) / 4;

    const smallOrderFee = getSmallLoadFee(roundedTruckYards, firstConcreteInv);
    const fuelFee = fuelSurcharge;

    const truckCost = (roundedTruckYards * ratePerYard) + smallOrderFee + fuelFee;
    trucksList.push({ yards: truckYards, roundedYards: roundedTruckYards, cost: truckCost, smallOrderFee, fuelFee });
    concreteTotal += truckCost;
  }

  const newSignLocationsCount = items.filter(i => i.is_new_sign_location).length;
  const additionalStopsCost = newSignLocationsCount * 100;
  concreteTotal += additionalStopsCost;

  return { concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes, availableAdmixes };
};