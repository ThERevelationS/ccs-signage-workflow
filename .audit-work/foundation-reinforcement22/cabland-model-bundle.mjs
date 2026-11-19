// frozen:/app/src/components/estimator/foundation/legacyFoundationCalc.js
var supplierPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var getConcreteMixes = (invItem) => [
  { id: "3500_ae", name: "3500 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_3500_price), field: "mix_3500_price", desc: "Often used for driveways, slabs, and moderate-load footings." },
  { id: "4000_ae", name: "4000 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_4000_price), field: "mix_4000_price", desc: "STANDARD. Used for sign foundations, commercial flatwork, and structural footings requiring good durability." },
  { id: "4500_ae", name: "4500 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_4500_price), field: "mix_4500_price", desc: "Used for heavy-duty commercial slabs and heavy traffic areas." },
  { id: "5000_ae", name: "5000 AIR ENTRAINED (AE)", price: supplierPriceNumber(invItem?.mix_5000_price), field: "mix_5000_price", desc: "High-strength mix for heavy structural columns, pillars, and extreme load conditions." },
  { id: "fast_set", name: "FAST SET", price: supplierPriceNumber(invItem?.mix_fast_set_price), field: "mix_fast_set_price", desc: "Quick-curing concrete used when rapid strength gain is needed to minimize downtime." }
];
var getConcreteAdmixtures = (invItem) => [
  { id: "calcium_chloride", name: "Calcium Chloride", price: supplierPriceNumber(invItem?.admix_calcium_chloride_price), field: "admix_calcium_chloride_price", desc: "Speeds up how fast the concrete dries. SELECT THIS when pouring in cold weather so it doesn't freeze before it sets. WARNING: Do NOT select this if using Rebar, as it causes rust!" },
  { id: "set_retarding", name: "Set-Retarding Admix (Type D)", price: supplierPriceNumber(invItem?.admix_set_retarding_price), field: "admix_set_retarding_price", desc: "Slows down how fast the concrete dries. SELECT THIS when pouring in very hot weather, or if the concrete truck has a very long drive to the site." },
  { id: "water_reducing", name: "Water-Reducing Admix (Type A)", price: supplierPriceNumber(invItem?.admix_water_reducing_price), field: "admix_water_reducing_price", desc: "Makes the concrete easier to pour without weakening it. SELECT THIS if you need the concrete to flow better into tight forms or around lots of rebar." },
  { id: "fibers", name: "Fibers", price: supplierPriceNumber(invItem?.admix_fibers_price), field: "admix_fibers_price", desc: "Tiny fibers mixed into the concrete to prevent small cracks. SELECT THIS for large flat slabs (like monument sign pads) or if the foundation will take physical abuse." },
  { id: "winter_service", name: "Winter Service", price: supplierPriceNumber(invItem?.admix_winter_service_price), field: "admix_winter_service_price", desc: "A fee the plant charges to use hot water so the mix doesn't freeze. SELECT THIS always during winter months when temperatures are freezing." }
];
var getSmallLoadFee = (yards, invItem) => {
  if (yards >= 5) return 0;
  if (yards >= 4.5) return supplierPriceNumber(invItem?.small_load_fee_4_5_4_75);
  if (yards >= 4) return supplierPriceNumber(invItem?.small_load_fee_4_4_25);
  if (yards >= 3) return supplierPriceNumber(invItem?.small_load_fee_3_3_75);
  if (yards >= 2) return supplierPriceNumber(invItem?.small_load_fee_2_2_75);
  if (yards >= 1) return supplierPriceNumber(invItem?.small_load_fee_1_1_75);
  return supplierPriceNumber(invItem?.small_load_fee_1_1_75);
};
var getFuelSurcharge = (invItem) => {
  return supplierPriceNumber(invItem?.fuel_surcharge);
};
var calcItemCost = (item, inventory = [], settings = {}) => {
  const getSetting = (key, def) => parseFloat(settings[key] === 0 ? 0 : settings[key] || def);
  const selectedConcrete = inventory.find((c) => c.id === item.selected_concrete_id);
  const conc_cost = item.custom_concrete_cost_per_cy !== null && item.custom_concrete_cost_per_cy !== void 0 ? item.custom_concrete_cost_per_cy : selectedConcrete?.cost_per_unit || 0;
  const selectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === item.rebar_size);
  const pillarSelectedRebar = inventory.find((r) => r.material_type === "rebar" && r.rebar_size === (item.pillar_rebar_size || "#4"));
  const activeRebar = item.foundation_type === "spread_foot" ? selectedRebar : pillarSelectedRebar;
  const rebar_cost = item.custom_rebar_cost_per_ft !== null && item.custom_rebar_cost_per_ft !== void 0 ? item.custom_rebar_cost_per_ft : activeRebar?.cost_per_unit || 0;
  const main_labor_rate = getSetting("foundation_main_labor_rate", 60);
  const rebar_time_cross_section = getSetting("foundation_rebar_time_cross_section", 0.05);
  const rebar_time_linear_ft = getSetting("foundation_rebar_time_linear_ft", 0.02);
  const forming_cost_per_sqft = getSetting("foundation_forming_cost_per_sqft", 2.5);
  const pouring_cost_per_cy = getSetting("foundation_pouring_cost_per_cy", 15);
  const finishing_cost_per_sqft = getSetting("foundation_finishing_cost_per_sqft", 1.25);
  const forming_mult = item.foundation_type === "spread_foot" ? getSetting("foundation_forming_materials_spread_foot", 0.5) : getSetting("foundation_forming_materials_pillar", 0.75);
  let baseVolumeCY = 0;
  const lenIn = parseFloat(item.length_inches) || 0;
  const widIn = parseFloat(item.width_inches) || 0;
  const depIn = parseFloat(item.depth_inches) || 0;
  const diaIn = parseFloat(item.diameter) || 0;
  if (item.foundation_type === "spread_foot") {
    baseVolumeCY = lenIn / 12 * (widIn / 12) * (depIn / 12) / 27;
  } else {
    const r = diaIn / 2 / 12;
    baseVolumeCY = Math.PI * r * r * (depIn / 12) / 27;
  }
  baseVolumeCY = baseVolumeCY * (item.quantity || 1);
  const volumeCY = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseVolumeCY;
  let concreteCost = 0;
  let baseBags = null;
  let concreteBags = null;
  if (selectedConcrete?.material_type === "bagged_concrete") {
    baseBags = Math.ceil(baseVolumeCY * 45);
    concreteBags = item.custom_concrete_qty !== null && item.custom_concrete_qty !== void 0 ? item.custom_concrete_qty : baseBags;
    concreteCost = concreteBags * conc_cost;
  }
  let rebarCost = 0;
  let baseRebarFt = 0;
  let totalIntersections = 0;
  if (item.include_rebar && item.foundation_type === "spread_foot") {
    const nBarsL = Math.floor(widIn / (parseFloat(item.rebar_spacing_width) || 12)) + 1;
    const nBarsW = Math.floor(lenIn / (parseFloat(item.rebar_spacing_length) || 12)) + 1;
    const layers = parseInt(item.rebar_layers) || 1;
    const horizontalFt = (nBarsL * (lenIn / 12) + nBarsW * (widIn / 12)) * layers;
    const numIntersections = nBarsL * nBarsW * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const verticalFt = numIntersections * verticalLengthFt;
    baseRebarFt = (horizontalFt + verticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = numIntersections * (parseInt(item.quantity) || 1);
  } else if (item.include_rebar && item.foundation_type === "pillar") {
    const hoopDia = parseFloat(item.pillar_rebar_hoop_diameter) || Math.max(0, diaIn - 4);
    const safeHoopDia = Math.min(hoopDia, Math.max(0, diaIn - 4));
    const layers = parseInt(item.pillar_rebar_layers) || 1;
    const verticalCount = parseInt(item.pillar_vertical_rebar_count) || 4;
    const hoopLengthFt = Math.PI * safeHoopDia / 12;
    const totalHoopFt = hoopLengthFt * layers;
    const verticalLengthFt = Math.max(0, depIn - 6) / 12;
    const totalVerticalFt = verticalCount * verticalLengthFt;
    baseRebarFt = (totalHoopFt + totalVerticalFt) * (parseInt(item.quantity) || 1);
    totalIntersections = layers * verticalCount * (parseInt(item.quantity) || 1);
  }
  const rebarFt = item.custom_rebar_qty !== null && item.custom_rebar_qty !== void 0 ? item.custom_rebar_qty : baseRebarFt;
  if (item.include_rebar) {
    const materialCost = rebarFt * rebar_cost;
    const totalTimeHours = totalIntersections * rebar_time_cross_section + rebarFt * rebar_time_linear_ft;
    const laborCost = totalTimeHours * main_labor_rate;
    rebarCost = materialCost + laborCost;
  }
  let formingCost = 0;
  let baseFormingQty = 0;
  const selectedForming = inventory.find((i) => i.id === item.selected_forming_id);
  const forming_rate = item.custom_forming_rate !== null && item.custom_forming_rate !== void 0 ? item.custom_forming_rate : selectedForming?.cost_per_unit || 0;
  if (item.include_forming) {
    const perim = item.foundation_type === "spread_foot" ? 2 * (lenIn + widIn) / 12 : Math.PI * diaIn / 12;
    const formingAreaSqFt = perim * (depIn / 12);
    baseFormingQty = Math.ceil(perim / 16) * (parseInt(item.quantity) || 1);
    const formingQty = item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty;
    const formingMaterialCost = formingQty * forming_rate;
    const laborCost = formingAreaSqFt * (parseInt(item.quantity) || 1) * forming_cost_per_sqft;
    formingCost = laborCost + formingMaterialCost + concreteCost * forming_mult;
  }
  let finishingCost = 0;
  let baseFinishingHours = 0;
  const finishing_rate = item.custom_finishing_rate !== null && item.custom_finishing_rate !== void 0 ? item.custom_finishing_rate : main_labor_rate;
  if (item.include_finishing) {
    const topArea = item.foundation_type === "spread_foot" ? lenIn * widIn / 144 : Math.PI * (diaIn / 2 / 12) ** 2;
    const defaultFinishingCost = topArea * (parseInt(item.quantity) || 1) * finishing_cost_per_sqft;
    baseFinishingHours = defaultFinishingCost / main_labor_rate;
    const finishingHours = item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours;
    finishingCost = finishingHours * finishing_rate;
  }
  const pouringCost = volumeCY * pouring_cost_per_cy;
  let excavationCost = 0;
  let baseExcavationHours = 0;
  const excVol = volumeCY * 1.25;
  if (item.excavation_method === "hand_dig" || !item.excavation_method) {
    const timePerCy = getSetting("foundation_hand_dig_time_per_cy", 2);
    baseExcavationHours = excVol * timePerCy;
  } else {
    const timePerCy = getSetting("foundation_equipment_excavation_time_per_cy", 0.5);
    baseExcavationHours = excVol * timePerCy;
  }
  const excavationHours = item.custom_excavation_hours !== null && item.custom_excavation_hours !== void 0 ? item.custom_excavation_hours : baseExcavationHours;
  const excavation_rate = item.custom_excavation_rate !== null && item.custom_excavation_rate !== void 0 ? item.custom_excavation_rate : main_labor_rate;
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
    formingQty: item.custom_forming_qty !== null && item.custom_forming_qty !== void 0 ? item.custom_forming_qty : baseFormingQty,
    baseFormingQty,
    finishingCost,
    finishingHours: item.custom_finishing_hours !== null && item.custom_finishing_hours !== void 0 ? item.custom_finishing_hours : baseFinishingHours,
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
    selectedConcreteName: selectedConcrete?.material_name || "",
    selectedRebarName: activeRebar?.material_name || "",
    selectedFormingName: selectedForming?.material_name || "",
    total: concreteCost + rebarCost + formingCost + finishingCost + pouringCost + excavationCost
  };
};
var calcConcreteDelivery = (project, items = [], inventory = []) => {
  const concreteServiceItems = items.filter((item) => {
    const inv = inventory.find((i) => i.id === item.selected_concrete_id);
    return !inv || inv.material_type === "concrete_service";
  });
  const totalConcreteYards = concreteServiceItems.reduce((sum, item) => sum + calcItemCost(item, inventory, project.settings || {}).volumeCY, 0);
  const roundedYards = Math.ceil(totalConcreteYards * 4) / 4;
  const firstConcreteItem = concreteServiceItems.find((i) => inventory.find((inv) => inv.id === i.selected_concrete_id)?.material_type === "concrete_service");
  const firstConcreteInv = firstConcreteItem ? inventory.find((inv) => inv.id === firstConcreteItem.selected_concrete_id) : null;
  const availableMixes = getConcreteMixes(firstConcreteInv);
  const availableAdmixes = getConcreteAdmixtures(firstConcreteInv);
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "concrete_delivery",
    index: null,
    componentId: null,
    field,
    inventoryId: firstConcreteInv?.id ?? null,
    code,
    message: `Concrete delivery: ${message}.`
  });
  const mix = availableMixes.find((m) => m.id === project.project_concrete_type) || availableMixes.find((m) => m.id === "4000_ae");
  if (roundedYards > 0) {
    if (firstConcreteInv === null) {
      add(
        "selected_concrete_id",
        "supplier_unavailable",
        "no ready-mix concrete supplier is assigned \u2014 select a supplier with catalog prices before repricing"
      );
    } else {
      if (project.project_concrete_type && !availableMixes.some((m) => m.id === project.project_concrete_type)) {
        add(
          "project_concrete_type",
          "supplier_price_unavailable",
          "the saved mix selection is not in the supplier catalog \u2014 pick a listed mix before repricing"
        );
      }
      if (!mix || supplierPriceNumber(mix.price) === null) {
        add(
          mix?.field || "mix_price",
          "supplier_price_unavailable",
          `record a finite, nonnegative ${mix?.name || "selected mix"} price on the concrete supplier before repricing`
        );
      }
      for (const admixId of project.project_concrete_admixtures || []) {
        const admix = availableAdmixes.find((x) => x.id === admixId);
        if (!admix) {
          add(
            "project_concrete_admixtures",
            "supplier_price_unavailable",
            "the saved admixture selection is not in the supplier catalog \u2014 pick a listed admixture before repricing"
          );
        } else if (supplierPriceNumber(admix.price) === null) {
          add(
            admix.field || "admix_price",
            "supplier_price_unavailable",
            `record a finite, nonnegative ${admix.name} price on the concrete supplier before repricing`
          );
        }
      }
      if (supplierPriceNumber(firstConcreteInv.fuel_surcharge) === null) {
        add(
          "fuel_surcharge",
          "supplier_price_unavailable",
          "record a finite, nonnegative fuel surcharge on the concrete supplier before repricing"
        );
      }
      let scanYards = roundedYards;
      while (scanYards > 0) {
        const truckYards = Math.min(scanYards, 9);
        scanYards -= truckYards;
        const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
        if (getSmallLoadFee(roundedTruckYards, firstConcreteInv) === null) {
          add(
            "small_load_fee",
            "supplier_price_unavailable",
            `record a finite, nonnegative small-load fee for the ${roundedTruckYards} CY truck bracket on the concrete supplier before repricing`
          );
          break;
        }
      }
    }
  }
  if (issues.length) {
    return {
      pricingUnavailable: true,
      issues,
      concreteTotal: null,
      roundedYards,
      ratePerYard: null,
      trucksList: [],
      additionalStopsCost: null,
      availableMixes,
      availableAdmixes
    };
  }
  const mixPrice = mix ? mix.price : 201;
  const admixPrice = (project.project_concrete_admixtures || []).reduce((sum, admixId) => {
    const a = availableAdmixes.find((x) => x.id === admixId);
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
    const roundedTruckYards = Math.ceil(truckYards * 4) / 4;
    const smallOrderFee = getSmallLoadFee(roundedTruckYards, firstConcreteInv);
    const fuelFee = fuelSurcharge;
    const truckCost = roundedTruckYards * ratePerYard + smallOrderFee + fuelFee;
    trucksList.push({ yards: truckYards, roundedYards: roundedTruckYards, cost: truckCost, smallOrderFee, fuelFee });
    concreteTotal += truckCost;
  }
  const newSignLocationsCount = items.filter((i) => i.is_new_sign_location).length;
  const additionalStopsCost = newSignLocationsCount * 100;
  concreteTotal += additionalStopsCost;
  return { issues, concreteTotal, roundedYards, ratePerYard, trucksList, additionalStopsCost, availableMixes, availableAdmixes };
};

// frozen:/app/src/components/estimator/foundation/wallCalculator.js
var wallSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
function calcWallCosts({ wall, wallShape, wallMaterial, internalMaterial, includeInternalWall, wallHeightInches, internalWallHeightInches, mortarGapInches, internalMortarGapInches, settings }) {
  if (!wallShape || !wallMaterial || !wallShape.segments) return null;
  const isConcrete = wallMaterial.wall_material_subtype === "concrete";
  const unitL = wallMaterial.wall_unit_length_inches || 8;
  const unitW = wallMaterial.wall_unit_width_inches || 4;
  const unitH = wallMaterial.wall_unit_height_inches || 2.25;
  const mortar = isConcrete ? 0 : mortarGapInches;
  const courseH = unitH + mortar;
  const numCourses = wallHeightInches / courseH;
  const brickPitch = unitL + (isConcrete ? 0 : mortar);
  const totalLinearInches = wallShape.segments.reduce((s, seg) => s + seg.length, 0);
  const numCoursesRounded = Math.ceil(numCourses);
  let totalBricks = 0;
  wallShape.segments.forEach((seg) => {
    const bricksThisCourse = Math.ceil(seg.length / brickPitch);
    totalBricks += bricksThisCourse * numCoursesRounded;
  });
  const finalBricks = wallMaterial.custom_outer_material_qty !== void 0 && wallMaterial.custom_outer_material_qty !== null ? wallMaterial.custom_outer_material_qty : totalBricks;
  const materialCost = finalBricks * (wallMaterial.custom_cost_per_unit !== void 0 && wallMaterial.custom_cost_per_unit !== null ? wallMaterial.custom_cost_per_unit : wallMaterial.cost_per_unit || 0);
  const surfaceAreaSqFtSingleSide = totalLinearInches * wallHeightInches / 144;
  let mortarCost = 0;
  let mortarBags = 0;
  if (!isConcrete) {
    const surfaceAreaSqFtMortar = surfaceAreaSqFtSingleSide * 2;
    mortarBags = Math.ceil(surfaceAreaSqFtMortar / 30);
    const finalMortarBags = wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags;
    const mortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
    const finalMortarRate = wallMaterial.custom_outer_mortar_rate !== void 0 && wallMaterial.custom_outer_mortar_rate !== null ? wallMaterial.custom_outer_mortar_rate : mortarCostPerBag;
    mortarCost = finalMortarBags * finalMortarRate;
  }
  const laborRatePerSqFt = wallMaterial.custom_outer_labor_rate !== void 0 && wallMaterial.custom_outer_labor_rate !== null ? wallMaterial.custom_outer_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
  const minCharge = parseFloat(wallSettingValue(settings?.wall_minimum_charge, 150));
  let laborCost = surfaceAreaSqFtSingleSide * laborRatePerSqFt;
  if (laborCost < minCharge) {
    laborCost = minCharge;
  }
  const laborHours = finalBricks / parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50));
  let internalTotalBricks = 0;
  let internalMaterialCost = 0;
  let internalMortarCost = 0;
  let internalLaborCost = 0;
  let internalLaborHours = 0;
  let internalTotalLinearInches = 0;
  if (includeInternalWall && internalMaterial) {
    const intIsConcrete = internalMaterial.wall_material_subtype === "concrete";
    const intUnitL = internalMaterial.wall_unit_length_inches || 8;
    const intUnitW = internalMaterial.wall_unit_width_inches || 4;
    const intUnitH = internalMaterial.wall_unit_height_inches || 2.25;
    const intMortar = intIsConcrete ? 0 : internalMortarGapInches ?? 0.375;
    const intCourseH = intUnitH + intMortar;
    const intNumCourses = Math.ceil(internalWallHeightInches / intCourseH);
    const intBrickPitch = intUnitL + intMortar;
    const isClosed = wallShape.closed !== false;
    const lengthReduction = isClosed ? unitW + intUnitW : 0;
    wallShape.segments.forEach((seg) => {
      const innerSegLength = Math.max(0, seg.length - lengthReduction);
      internalTotalLinearInches += innerSegLength;
      const bricksThisCourse = Math.ceil(innerSegLength / intBrickPitch);
      internalTotalBricks += bricksThisCourse * intNumCourses;
    });
    const finalInternalBricks = wall.custom_internal_material_qty !== void 0 && wall.custom_internal_material_qty !== null ? wall.custom_internal_material_qty : internalTotalBricks;
    internalMaterialCost = finalInternalBricks * (wall.custom_internal_material_cost_per_unit !== void 0 && wall.custom_internal_material_cost_per_unit !== null ? wall.custom_internal_material_cost_per_unit : internalMaterial.cost_per_unit || 0);
    const intSurfaceAreaSqFtSingleSide = internalTotalLinearInches * internalWallHeightInches / 144;
    let internalMortarBags = 0;
    if (!intIsConcrete) {
      const intSurfaceAreaSqFtMortar = intSurfaceAreaSqFtSingleSide * 2;
      internalMortarBags = Math.ceil(intSurfaceAreaSqFtMortar / 30);
      const finalInternalMortarBags = wall.custom_internal_mortar_qty !== void 0 && wall.custom_internal_mortar_qty !== null ? wall.custom_internal_mortar_qty : internalMortarBags;
      const internalMortarCostPerBag = parseFloat(wallSettingValue(settings?.wall_mortar_cost_per_bag, 10));
      const finalInternalMortarRate = wall.custom_internal_mortar_rate !== void 0 && wall.custom_internal_mortar_rate !== null ? wall.custom_internal_mortar_rate : internalMortarCostPerBag;
      internalMortarCost = finalInternalMortarBags * finalInternalMortarRate;
    }
    const internalLaborRatePerSqFt = wall.custom_internal_labor_rate !== void 0 && wall.custom_internal_labor_rate !== null ? wall.custom_internal_labor_rate : parseFloat(wallSettingValue(settings?.wall_labor_rate, 45));
    internalLaborCost = intSurfaceAreaSqFtSingleSide * internalLaborRatePerSqFt;
    internalLaborHours = finalInternalBricks / parseFloat(wallSettingValue(settings?.wall_labor_bricks_per_hour, 50));
  }
  return {
    totalBricks,
    finalBricks,
    materialCost,
    mortarBags,
    finalMortarBags: !isConcrete ? wallMaterial.custom_outer_mortar_qty !== void 0 && wallMaterial.custom_outer_mortar_qty !== null ? wallMaterial.custom_outer_mortar_qty : mortarBags : 0,
    mortarCost,
    laborHours,
    laborRatePerSqFt,
    laborCost,
    totalCost: materialCost + mortarCost + laborCost + internalMaterialCost + internalMortarCost + internalLaborCost,
    totalLinearInches,
    numCourses,
    internalTotalBricks,
    internalMaterialCost,
    internalMortarBags: includeInternalWall && internalMaterial && internalMaterial.wall_material_subtype !== "concrete" ? Math.ceil(internalTotalLinearInches * internalWallHeightInches / 144 * 2 / 30) : 0,
    internalMortarCost,
    internalLaborCost,
    internalLaborHours
  };
}
var assignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
function wallPriceNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function wallDimensionNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
var wallSettingNumber = (value, fallback) => wallPriceNumber(wallSettingValue(value, fallback));
var wallPositiveSettingNumber = (value, fallback) => wallDimensionNumber(wallSettingValue(value, fallback));
var WALL_MORTAR_GAP_DEFAULT = 0.375;
var wallMortarGapNumber = (value) => value === void 0 || value === null || value === "" ? WALL_MORTAR_GAP_DEFAULT : wallPriceNumber(value);
var wallRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var wallPoint = (point) => wallRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.z === "number" && Number.isFinite(point.z);
function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every((segment) => Number.isFinite(segment.length)) ? segments : null;
}
function foundationWallOutlineBasis(shape) {
  const result = {
    shape: null,
    points: [],
    closed: shape?.closed === true,
    hasRecordedPoints: false,
    perimeterInches: null,
    issues: []
  };
  const add = (code, message) => result.issues.push({ code, message });
  const unavailable = () => add("wall_outline_unavailable", "draw an outline with positive segment lengths before repricing");
  if (!wallRecord(shape)) {
    unavailable();
    return result;
  }
  result.hasRecordedPoints = shape.points != null && (!Array.isArray(shape.points) || shape.points.length > 0);
  const validPoints = Array.isArray(shape.points) && shape.points.every(wallPoint);
  if (validPoints) result.points = shape.points.map((point) => ({ ...point }));
  if (result.hasRecordedPoints && !validPoints) {
    add("wall_outline_points_unavailable", "repair the recorded footprint coordinates before repricing");
  }
  if ((shape.closed != null || result.hasRecordedPoints) && typeof shape.closed !== "boolean") {
    add("wall_outline_closure_unavailable", "record whether the outline is open or closed before repricing");
  }
  let segments = null;
  if (!Array.isArray(shape.segments) || !shape.segments.length) {
    unavailable();
  } else {
    const lengths = shape.segments.map((segment) => wallRecord(segment) ? wallDimensionNumber(segment.length) : null);
    if (lengths.some((length) => length === null)) {
      add("wall_outline_segment_unavailable", "record positive, finite segment lengths in inches before repricing");
    } else {
      segments = shape.segments.map((segment, index) => ({ ...segment, length: lengths[index] }));
      if (!Number.isFinite(lengths.reduce((sum, length) => sum + length, 0))) {
        add("wall_outline_length_unavailable", "record a finite outline perimeter before repricing");
      }
    }
  }
  if (segments && result.hasRecordedPoints && validPoints && typeof shape.closed === "boolean") {
    const expected = foundationWallSegments(result.points, shape.closed);
    const same = result.points.length >= (shape.closed ? 3 : 2) && expected && expected.length === segments.length && expected.every((segment, index) => {
      const stored = segments[index].length;
      const tolerance = Number.EPSILON * 8 * Math.max(1, segment.length, stored);
      return segment.length > 0 && Math.abs(segment.length - stored) <= tolerance;
    });
    if (!same) add("wall_outline_geometry_mismatch", "repair footprint points and segment lengths so they describe the same outline before repricing");
  }
  if (!result.issues.length) {
    result.shape = { ...shape, segments };
    if (validPoints) result.shape.points = result.points;
    result.perimeterInches = segments.reduce((sum, segment) => sum + segment.length, 0);
  }
  return result;
}
var WALL_SETTING_DEFAULTS = {
  wall_mortar_cost_per_bag: 10,
  wall_labor_rate: 45,
  wall_minimum_charge: 150,
  wall_labor_bricks_per_hour: 50
};
var WALL_OUTER_OVERRIDE_FIELDS = [
  ["custom_outer_material_qty", "material quantity"],
  ["custom_outer_labor_rate", "labor rate"]
];
var WALL_OUTER_MORTAR_OVERRIDE_FIELDS = [
  ["custom_outer_mortar_qty", "mortar quantity"],
  ["custom_outer_mortar_rate", "mortar rate"]
];
var WALL_INTERNAL_OVERRIDE_FIELDS = [
  ["custom_internal_material_qty", "material quantity"],
  ["custom_internal_labor_rate", "labor rate"]
];
var WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS = [
  ["custom_internal_mortar_qty", "mortar quantity"],
  ["custom_internal_mortar_rate", "mortar rate"]
];
function wallPricing(wall, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const heightInches = wallDimensionNumber(wall?.heightInches);
  const internalWallHeightInches = wall?.includeInternalWall ? wallDimensionNumber(wall.internalWallHeightInches ?? wall.heightInches) : null;
  const heightIssue = (field, kind, label, code) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: wall?.[kind === "wall" ? "materialId" : "internalMaterialId"] ?? null,
    code,
    message: `${label} ${index + 1}: record a positive, finite wall height in inches before repricing.`
  });
  if (heightInches === null) heightIssue("heightInches", "wall", "Wall", "wall_height_unavailable");
  if (wall?.includeInternalWall && internalWallHeightInches === null) {
    heightIssue("internalWallHeightInches", "internal_wall", "Internal wall", "internal_wall_height_unavailable");
  }
  const outline = foundationWallOutlineBasis(wall?.shape);
  issues.push(...outline.issues.map((issue) => ({
    ...issue,
    kind: "wall",
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field: "shape",
    inventoryId: wall?.materialId ?? null,
    message: `Wall ${index + 1}: ${issue.message}.`
  })));
  const check = (field, kind, label) => {
    const id = wall?.[field];
    const add2 = (code, message) => issues.push({
      kind,
      index,
      componentId: wall?.component_id ?? wall?.id ?? null,
      field,
      inventoryId: assignedId(id) ? id : null,
      code,
      message: `${label} ${index + 1}: ${message}.`
    });
    if (!assignedId(id)) {
      add2("catalog_item_unassigned", "select a catalog material");
      return null;
    }
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add2("catalog_item_unavailable", "selected catalog material is unavailable");
      return null;
    }
    if (matches.length !== 1) {
      add2("catalog_item_ambiguous", "selected catalog material is ambiguous");
      return null;
    }
    const material = matches[0];
    if (!["brick_stone", "wall_material"].includes(material.material_type)) {
      add2("catalog_item_type_mismatch", "selected catalog material is not a wall material");
      return null;
    }
    const override = kind === "wall" ? material.custom_cost_per_unit : wall.custom_internal_material_cost_per_unit;
    const price = override !== void 0 && override !== null ? override : material.cost_per_unit;
    if (wallPriceNumber(price) === null) {
      add2("wall_material_price_unavailable", "record a finite, nonnegative material unit price before repricing");
    }
    const normalizedMaterial = { ...material };
    for (const [key, label2] of [
      ["wall_unit_length_inches", "unit length"],
      ["wall_unit_width_inches", "unit width"],
      ["wall_unit_height_inches", "unit height"]
    ]) {
      const dimension = wallDimensionNumber(material[key]);
      if (dimension === null) {
        add2(key + "_unavailable", `record a positive, finite ${label2} in inches before repricing`);
      } else {
        normalizedMaterial[key] = dimension;
      }
    }
    return normalizedMaterial;
  };
  const wallMaterial = check("materialId", "wall", "Wall");
  const internalMaterial = wall?.includeInternalWall ? check("internalMaterialId", "internal_wall", "Internal wall") : null;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: wall?.component_id ?? wall?.id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `${kind === "internal_wall" ? "Internal wall" : "Wall"} ${index + 1}: ${message}.`
  });
  const overrideCheck = (source, fields, kind, inventoryId) => {
    for (const [field, label] of fields) {
      const raw = source?.[field];
      if (raw === void 0 || raw === null) continue;
      const value = wallPriceNumber(raw);
      if (value === null) {
        add(
          kind,
          field,
          inventoryId,
          field + "_unavailable",
          `record a finite, nonnegative ${label} override or clear it before repricing`
        );
      } else {
        source[field] = value;
      }
    }
  };
  const settingCheck = (key, label, positive) => {
    const value = positive ? wallPositiveSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]) : wallSettingNumber(settings?.[key], WALL_SETTING_DEFAULTS[key]);
    if (value === null) {
      add(
        "wall",
        key,
        wall?.materialId,
        "wall_setting_unavailable",
        `record a finite, ${positive ? "positive" : "nonnegative"} ${label} in Estimator Settings before repricing`
      );
    }
    return value;
  };
  const outerConcrete = wallMaterial?.wall_material_subtype === "concrete";
  const intConcrete = internalMaterial?.wall_material_subtype === "concrete";
  const calcWall = wall?.includeInternalWall && internalMaterial ? { ...wall } : wall;
  let mortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  let internalMortarGapInches = WALL_MORTAR_GAP_DEFAULT;
  if (wallMaterial) {
    overrideCheck(wallMaterial, WALL_OUTER_OVERRIDE_FIELDS, "wall", wall?.materialId);
    settingCheck("wall_labor_rate", "wall labor rate");
    settingCheck("wall_minimum_charge", "wall minimum labor charge");
    settingCheck("wall_labor_bricks_per_hour", "wall production rate", true);
    if (!outerConcrete) {
      mortarGapInches = wallMortarGapNumber(wall?.mortarGapInches);
      if (mortarGapInches === null) {
        add(
          "wall",
          "mortarGapInches",
          wall?.materialId,
          "wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(wallMaterial, WALL_OUTER_MORTAR_OVERRIDE_FIELDS, "wall", wall?.materialId);
    }
  }
  if (wall?.includeInternalWall && internalMaterial) {
    overrideCheck(calcWall, WALL_INTERNAL_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    if (!intConcrete) {
      internalMortarGapInches = wallMortarGapNumber(wall?.internalMortarGapInches);
      if (internalMortarGapInches === null) {
        add(
          "internal_wall",
          "internalMortarGapInches",
          wall?.internalMaterialId,
          "internal_wall_mortar_gap_unavailable",
          "record a finite, nonnegative mortar gap in inches before repricing"
        );
      }
      overrideCheck(calcWall, WALL_INTERNAL_MORTAR_OVERRIDE_FIELDS, "internal_wall", wall?.internalMaterialId);
    }
  }
  if (wallMaterial && !outerConcrete || internalMaterial && !intConcrete) {
    settingCheck("wall_mortar_cost_per_bag", "mortar cost per bag");
  }
  return {
    issues,
    wallMaterial,
    internalMaterial,
    heightInches,
    internalWallHeightInches,
    wallShape: outline.shape,
    calcWall,
    mortarGapInches,
    internalMortarGapInches
  };
}
function foundationWallPricingIssues(wall, inventory = [], index = 0, settings = {}) {
  return wallPricing(wall, inventory, index, settings).issues;
}
function foundationWallCatalogIssues(walls = [], inventory = [], settings = {}) {
  return walls.flatMap((wall, index) => foundationWallPricingIssues(wall, inventory, index, settings));
}
function calcWalls(project, inventory, settings = {}, options = {}) {
  const walls = project.walls || [];
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedWalls");
  const savedWalls = Array.isArray(options?.savedWalls) ? options.savedWalls : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(walls), savedCounts = counts(savedWalls);
  const savedById = new Map(savedWalls.filter((row) => assignedId(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (wall) => {
    const id = wall?.component_id;
    const acknowledged = explicitSnapshot ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : wall;
    const costs = acknowledged?.calculatedCosts;
    return {
      ...wall,
      calculatedCosts: costs && typeof costs === "object" && !Array.isArray(costs) ? { ...costs } : {}
    };
  };
  const results = walls.map((wall, index) => wallPricing(wall, inventory, index, settings));
  return {
    walls: results.map((check, index) => {
      const wall = walls[index];
      if (check.issues.length) return held(wall);
      const {
        wallMaterial,
        internalMaterial,
        heightInches,
        internalWallHeightInches,
        wallShape,
        calcWall,
        mortarGapInches,
        internalMortarGapInches
      } = check;
      const costs = calcWallCosts({
        wall: calcWall ?? wall,
        wallShape,
        wallMaterial,
        internalMaterial,
        includeInternalWall: wall.includeInternalWall,
        wallHeightInches: heightInches,
        internalWallHeightInches,
        mortarGapInches,
        internalMortarGapInches,
        settings
      }) || {};
      return {
        ...wall,
        calculatedCosts: {
          // ?? keeps an accidental NaN visible instead of laundering it to $0.
          totalBricks: costs.finalBricks ?? 0,
          materialCost: costs.materialCost ?? 0,
          mortarCost: costs.mortarCost ?? 0,
          laborHours: costs.laborHours ?? 0,
          laborCost: costs.laborCost ?? 0,
          totalCost: costs.totalCost ?? 0,
          totalLinearInches: costs.totalLinearInches ?? 0,
          numCourses: costs.numCourses ?? 0,
          internalTotalBricks: costs.internalTotalBricks ?? 0,
          internalMaterialCost: costs.internalMaterialCost ?? 0,
          internalMortarCost: costs.internalMortarCost ?? 0,
          internalLaborCost: costs.internalLaborCost ?? 0,
          internalLaborHours: costs.internalLaborHours ?? 0
        }
      };
    }),
    wallPricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// frozen:/app/src/components/estimator/foundation/poleCalculator.js
var assignedId2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var poleSettingValue = (value, fallback) => value === 0 ? 0 : value || fallback;
var setting = (settings, key, def) => parseFloat(poleSettingValue(settings?.[key], def));
var polePriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var poleDimensionNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
var poleOffsetNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var poleSettingNumber = (value, fallback) => polePriceNumber(poleSettingValue(value, fallback));
var polePositiveSettingNumber = (value, fallback) => poleDimensionNumber(poleSettingValue(value, fallback));
var POLE_PAINT_SETTING_DEFAULTS = {
  pole_paint_cost_per_lf: 3.5,
  pole_paint_labor_per_lf: 2.5,
  pole_paint_size_multiplier_12in: 2,
  pole_paint_size_multiplier_10in: 1.75,
  pole_paint_size_multiplier_8in: 1.5,
  pole_paint_size_multiplier_6in: 1.25,
  pole_paint_size_multiplier_4in: 1
};
var polePaintMultiplierKey = (widthInches) => {
  const w = widthInches === null ? 6 : widthInches;
  if (w >= 12) return "pole_paint_size_multiplier_12in";
  if (w >= 10) return "pole_paint_size_multiplier_10in";
  if (w >= 8) return "pole_paint_size_multiplier_8in";
  if (w >= 6) return "pole_paint_size_multiplier_6in";
  return "pole_paint_size_multiplier_4in";
};
var getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1);
};
var calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const add = (field, code, message) => issues.push({
    kind: "pole",
    index,
    componentId: pole?.component_id ?? pole?.id ?? null,
    field,
    inventoryId: assignedId2(id) ? id : null,
    code,
    message: `Pole ${index + 1}: ${message}.`
  });
  let inv = null;
  if (!assignedId2(id)) {
    add("pole_id", "catalog_item_unassigned", "select a catalog material");
  } else {
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add("pole_id", "catalog_item_unavailable", "selected catalog material is unavailable");
    } else if (matches.length !== 1) {
      add("pole_id", "catalog_item_ambiguous", "selected catalog material is ambiguous");
    } else if (matches[0].material_type !== "pole") {
      add("pole_id", "catalog_item_type_mismatch", "selected catalog material is not a pole");
    } else {
      inv = matches[0];
    }
  }
  const heightInches = poleDimensionNumber(pole?.height_inches);
  if (heightInches === null) {
    add(
      "height_inches",
      "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing"
    );
  }
  const depthInches = poleOffsetNumber(pole?.y_offset_inches);
  if (depthInches === null) {
    add(
      "y_offset_inches",
      "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing"
    );
  }
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== void 0 && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = polePriceNumber(hasOverride ? override : stockMode ? inv.pole_stock_price : inv.cost_per_unit);
    if (rate === null) {
      add(
        hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable",
        "record a finite, nonnegative pole price before repricing"
      );
    }
    if (stockMode) {
      const stockLengthFt = polePositiveSettingNumber(inv.pole_stock_length_ft, 20);
      if (stockLengthFt === null) {
        add(
          "pole_stock_length_ft",
          "pole_stock_length_unavailable",
          "the selected catalog stock length must be a recorded finite positive number"
        );
      } else {
        stockLengthInches = stockLengthFt * 12;
      }
    }
    if (pole?.include_pole_painting) {
      widthInches = polePositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add(
          "pole_width_inches",
          "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number"
        );
      }
      const paintSetting = (key, label) => {
        const value = poleSettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
        if (value === null) {
          add(
            key,
            "pole_paint_setting_unavailable",
            `record a finite, nonnegative ${label} before repricing`
          );
        }
        return value;
      };
      paint.costPerLf = paintSetting("pole_paint_cost_per_lf", "pole paint cost per LF");
      paint.laborPerLf = paintSetting("pole_paint_labor_per_lf", "pole paint labor per LF");
      paint.sizeMultiplier = paintSetting(polePaintMultiplierKey(widthInches), "pole paint size multiplier");
    }
  }
  return { issues, inv, heightInches, depthInches, rate, stockLengthInches, widthInches, paint };
}
function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId2(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId2(row?.component_id)).map((row) => [row.component_id, row]));
  const held = (pole) => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot ? assignedId2(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null : pole;
    const result = { ...pole };
    if (explicitSnapshot) {
      for (const field of ["pole_name", "pole_cost", "pole_painting_cost", "total_cost"]) {
        if (acknowledged && Object.prototype.hasOwnProperty.call(acknowledged, field)) result[field] = acknowledged[field];
        else delete result[field];
      }
    }
    return result;
  };
  const results = (poles || []).map((pole, index) => polePricing(pole, inventory, index, settings));
  return {
    poles: results.map((check, index) => {
      const pole = poles[index];
      if (check.issues.length) return held(pole);
      const { inv, heightInches, depthInches, rate, stockLengthInches, widthInches, paint } = check;
      const totalPoleInches = heightInches + depthInches;
      let poleCost;
      if (inv.pole_pricing_mode === "stock_price") {
        const pieces = Math.ceil(totalPoleInches / stockLengthInches);
        poleCost = pieces * rate;
      } else {
        poleCost = totalPoleInches / 12 * rate;
      }
      const paintingCost = pole?.include_pole_painting ? calcPolePaintingCost(
        { include_pole_painting: true, height_inches: heightInches, y_offset_inches: depthInches },
        { ...inv, pole_width_inches: widthInches },
        {
          pole_paint_cost_per_lf: paint.costPerLf,
          pole_paint_labor_per_lf: paint.laborPerLf,
          [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier
        }
      ) : 0;
      return {
        ...pole,
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_cost: poleCost + paintingCost
      };
    }),
    polePricing: results.map((check) => ({ available: check.issues.length === 0, issues: check.issues }))
  };
}

// frozen:/app/src/components/estimator/foundation/wallCapCalculator.js
var wallCapInputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function wallCapCutLengthValue(cap) {
  if (!cap || typeof cap !== "object" || Array.isArray(cap)) return void 0;
  return Object.prototype.hasOwnProperty.call(cap, "length_inches") ? cap.length_inches : cap.cut_length_inches;
}
var known = (value) => typeof value === "number" && Number.isFinite(value);
var assigned = (id) => typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
var sumKnown = (rows) => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};
function calcWallCaps(wallCaps = [], inventory = [], options = {}) {
  const issues = [];
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedCaps");
  const currentIds = /* @__PURE__ */ new Map();
  const savedCaps = /* @__PURE__ */ new Map();
  const componentId = (cap) => typeof cap?.component_id === "string" && cap.component_id.trim() !== "" ? cap.component_id : null;
  if (explicitSnapshot) {
    for (const cap of wallCaps || []) {
      const id = componentId(cap);
      if (id !== null) currentIds.set(id, (currentIds.get(id) || 0) + 1);
    }
    for (const cap of Array.isArray(options.savedCaps) ? options.savedCaps : []) {
      const id = componentId(cap);
      if (id !== null) savedCaps.set(id, savedCaps.has(id) ? null : cap);
    }
  }
  const held = (cap) => {
    const result = { ...cap };
    if (!explicitSnapshot) return result;
    const id = componentId(cap);
    const saved = id !== null && currentIds.get(id) === 1 ? savedCaps.get(id) : null;
    for (const field of ["cost", "cap_name", "stock_length_inches"]) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, field)) result[field] = saved[field];
      else delete result[field];
    }
    return result;
  };
  const caps = (wallCaps || []).map((cap, index) => {
    const id = cap.cap_inventory_id;
    const issue = (field, code, message) => issues.push({
      kind: "wall_cap",
      index,
      componentId: cap.component_id ?? cap.id ?? null,
      field,
      inventoryId: assigned(id) ? id : null,
      code,
      message: `Wall cap ${index + 1}: ${message}`
    });
    const matches = assigned(id) ? inventory.filter((row) => row?.id === id) : [];
    if (matches.length !== 1) {
      issue(
        "cap_inventory_id",
        !assigned(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
        !assigned(id) ? "select a catalog material." : matches.length > 1 ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable."
      );
      return held(cap);
    }
    const inv = matches[0];
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return held(cap);
    }
    const firstIssue = issues.length;
    const rate = wallCapInputNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue(
        "cap_stock_price",
        "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained."
      );
    }
    const stockLength = wallCapInputNumber(inv.cap_stock_length_inches);
    const cutLength = wallCapInputNumber(wallCapCutLengthValue(cap));
    if (stockLength === null || stockLength <= 0) {
      issue(
        "cap_stock_length_inches",
        "wall_cap_stock_length_unavailable",
        "the selected catalog stock length must be a recorded finite positive number. Saved dimensions are not a current stock specification."
      );
    }
    if (cutLength === null || cutLength <= 0) {
      issue(
        "length_inches",
        "wall_cap_cut_length_invalid",
        "enter a finite positive cut length in inches. An empty or invalid cut is not changed to a default size."
      );
    } else if (stockLength !== null && stockLength > 0 && cutLength > stockLength) {
      issue(
        "length_inches",
        "wall_cap_cut_exceeds_stock",
        `cut length (${cutLength} in) exceeds the selected stock length (${stockLength} in). Choose longer stock or separate pieces; no extra quantity is assumed.`
      );
    }
    if (issues.length !== firstIssue) return held(cap);
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: stockLength,
      cost: rate
    };
  });
  const groups = /* @__PURE__ */ new Map();
  for (const cap of caps) {
    if (!assigned(cap.cap_inventory_id)) continue;
    if (!groups.has(cap.cap_inventory_id)) groups.set(cap.cap_inventory_id, []);
    groups.get(cap.cap_inventory_id).push(cap);
  }
  const byInventory = [...groups].map(([id, rows]) => ({
    id,
    name: rows[0].cap_name,
    qty: rows.length,
    cost: sumKnown(rows)
  }));
  const total = sumKnown(caps);
  if (total === null && caps.every((cap) => known(cap.cost))) {
    issues.push({
      kind: "wall_cap",
      index: 0,
      componentId: caps[0]?.component_id ?? caps[0]?.id ?? null,
      field: "cost",
      inventoryId: null,
      code: "wall_cap_cost_total_invalid",
      message: "Wall cap total is outside the supported numeric range; current pricing is unavailable."
    });
  }
  return { caps, byInventory, total, issues };
}
function foundationWallCapCatalogIssues(wallCaps = [], inventory = []) {
  return calcWallCaps(wallCaps, inventory).issues;
}

// frozen:/app/src/components/estimator/foundation/foundationEquipmentBindings.js
var num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var assigned2 = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
function resolveFoundationEquipment(entry = {}, inventory = [], index = 0) {
  const source = entry || {};
  const equipment = inventory.find((row) => row.id === source.equipment_id);
  let attachmentMode = "none";
  let attachmentRows = [];
  if (source.attachments?.length) {
    attachmentMode = "normalized";
    attachmentRows = source.attachments.map((row, rowIndex) => {
      const id = row.id || row.inventory_id;
      return {
        id,
        quantity: row.qty || 1,
        sourceRecord: row,
        rowIndex,
        field: "attachments",
        inventory: inventory.find((item) => item.id === id)
      };
    });
  } else if (source.attachment_counts) {
    attachmentMode = "counts";
    attachmentRows = Object.entries(source.attachment_counts).map(([id, quantity], rowIndex) => ({
      id,
      quantity: num(quantity),
      rowIndex,
      field: "attachment_counts",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  } else if (source.attachment_ids?.length) {
    attachmentMode = "legacy_ids";
    attachmentRows = source.attachment_ids.map((id, rowIndex) => ({
      id,
      quantity: 1,
      rowIndex,
      field: "attachment_ids",
      inventory: inventory.find((item) => item.id === id && item.material_type === "attachment")
    }));
  }
  const subAttachmentRows = Object.entries(source.sub_attachment_counts || {}).map(([id, quantity], rowIndex) => ({
    id,
    quantity: num(quantity),
    rowIndex,
    field: "sub_attachment_counts",
    inventory: inventory.find((item) => item.id === id && item.material_type === "sub_attachment")
  }));
  const issues = [];
  const check = (id, record, kind, field) => {
    if (assigned2(id) && record) return;
    const hasSelection = assigned2(id);
    issues.push({
      kind,
      index,
      componentId: source.component_id ?? source._id ?? null,
      field,
      inventoryId: hasSelection ? id : null,
      code: hasSelection ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `Equipment ${index + 1}: ${hasSelection ? `${kind.replaceAll("_", " ")} ${String(id)} is unavailable` : `select a catalog ${kind.replaceAll("_", " ")}`}.`
    });
  };
  check(source.equipment_id, equipment, "equipment", "equipment_id");
  for (const row of attachmentRows) {
    if (attachmentMode === "normalized" || row.quantity !== 0) {
      check(row.id, row.inventory, "attachment", row.field);
    }
  }
  for (const row of subAttachmentRows) {
    if (row.quantity !== 0) check(row.id, row.inventory, "sub_attachment", row.field);
  }
  return { equipment, attachmentMode, attachmentRows, subAttachmentRows, issues };
}
function foundationEquipmentCatalogIssues(entries = [], inventory = []) {
  return entries.flatMap((entry, index) => resolveFoundationEquipment(entry, inventory, index).issues);
}

// frozen:/app/src/components/estimator/foundation/foundationCatalogIntegrity.js
function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, label, code = "catalog_item_unavailable") => issues.push({
    kind: "foundation",
    index,
    componentId: item.component_id ?? null,
    field,
    inventoryId: id ?? null,
    code,
    message: `Foundation ${index + 1}: ${label} is unavailable.`
  });
  const selected = (id) => id !== void 0 && id !== null && id !== "";
  const check = (field, types, label) => {
    const id = item[field];
    if (!selected(id)) return;
    const row = inventory.find((record) => record.id === id);
    if (!row || !types.includes(row.material_type)) {
      add(field, id, label, row ? "catalog_item_type_mismatch" : "catalog_item_unavailable");
    }
  };
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "selected concrete catalog material");
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "selected forming catalog material");
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const size = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size || "#4";
    if (!inventory.some((row) => row.material_type === "rebar" && row.rebar_size === size)) {
      add(field, null, `rebar catalog size ${size || "(not selected)"}`, size ? "catalog_item_unavailable" : "catalog_item_unassigned");
    }
  }
  return issues;
}
function foundationAssemblyCatalogIssues(project, inventory = []) {
  const available = new Set(inventory.map((row) => row.id));
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned3 = typeof id === "string" && id.trim() !== "" || typeof id === "number" && Number.isFinite(id);
    if (assigned3 && available.has(id)) return;
    issues.push({
      kind,
      index,
      componentId: row.component_id ?? row.id ?? null,
      field,
      inventoryId: assigned3 ? id : null,
      code: assigned3 ? "catalog_item_unavailable" : "catalog_item_unassigned",
      message: `${label} ${index + 1}: ${assigned3 ? "selected catalog material is unavailable" : "select a catalog material"}.`
    });
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  return [
    ...issues,
    ...foundationWallCatalogIssues(project?.walls || [], inventory),
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory)
  ];
}
function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// frozen:/app/src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 }
];
var materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var landscapePriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var landscapeCellSizeNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
function landscapeInputIssues(landscape) {
  const issues = [];
  if (landscape === void 0 || landscape === null) return issues;
  const add = (field, code, message) => issues.push({
    kind: "landscape",
    index: null,
    componentId: null,
    field,
    code,
    message: `Landscape: ${message}`
  });
  const rawCells = landscape.cells;
  const cells = isRecord(rawCells) ? rawCells : null;
  if (rawCells !== void 0 && rawCells !== null && cells === null) {
    add(
      "cells",
      "landscape_cells_unavailable",
      "the recorded site grid is malformed \u2014 repair or clear it before repricing"
    );
    return issues;
  }
  const painted = Object.entries(cells || {}).filter(([, key]) => key && key !== "dirt");
  if (!painted.length) return issues;
  if (landscapeCellSizeNumber(landscape.cell_size_inches) === null) {
    add(
      "cell_size_inches",
      "landscape_cell_size_unavailable",
      "record a finite, positive cell size in inches before repricing site materials"
    );
  }
  const reported = /* @__PURE__ */ new Set();
  for (const [, key] of painted) {
    if (reported.has(key)) continue;
    reported.add(key);
    const mat = materialByKey(key);
    if (!mat) {
      add(
        "cells",
        "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog \u2014 pick a catalog material or erase it before repricing`
      );
    } else if (landscapePriceNumber(mat.cost_per_sqft) === null) {
      add(
        "cost_per_sqft",
        "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`
      );
    }
  }
  return issues;
}
var landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = landscapeCellSizeNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key];
    const rate = mat ? landscapePriceNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      cost: sqft === null || rate === null ? null : sqft * rate
    };
  });
  const total = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  return { lines, total, issues: landscapeInputIssues(landscape) };
};

// frozen:/app/src/components/estimator/foundation/foundationInputValidation.js
var inputNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var positiveWholeNumber = (value) => {
  const number = inputNumber(value);
  const whole = typeof value !== "string" || /^[+-]?\d+(?:\.0*)?$/.test(value.trim());
  return whole && Number.isSafeInteger(number) && number > 0;
};
var ITEM_CUSTOM_OVERRIDE_FIELDS = [
  ["custom_concrete_cost_per_cy", "concrete cost-per-unit override"],
  ["custom_concrete_qty", "concrete quantity override"],
  ["custom_rebar_cost_per_ft", "rebar cost-per-foot override"],
  ["custom_rebar_qty", "rebar quantity override"],
  ["custom_forming_rate", "forming rate override"],
  ["custom_forming_qty", "forming quantity override"],
  ["custom_finishing_rate", "finishing rate override"],
  ["custom_finishing_hours", "finishing hours override"],
  ["custom_excavation_hours", "excavation hours override"],
  ["custom_excavation_rate", "excavation rate override"]
];
function foundationItemInputIssues(item, index = 0) {
  const record = item ?? {};
  const issues = [];
  const add = (field, code, message) => issues.push({
    kind: "foundation",
    index,
    componentId: record.component_id ?? null,
    field,
    code,
    message: `Foundation ${index + 1}: ${message}`
  });
  const type = record.foundation_type;
  if (type !== "spread_foot" && type !== "pillar") {
    add("foundation_type", "foundation_type_invalid", "select Spread Footing or Pillar / Caisson.");
  }
  const count = record.quantity ?? 1;
  const quantity = inputNumber(count);
  if (!positiveWholeNumber(count)) {
    add("quantity", "foundation_quantity_invalid", "quantity must be a positive whole number within the supported range.");
  }
  const fields = type === "spread_foot" ? [["length_inches", "length"], ["width_inches", "width"], ["depth_inches", "depth"]] : type === "pillar" ? [["diameter", "diameter"], ["depth_inches", "depth"]] : [];
  const dimensions = {};
  for (const [field, label] of fields) {
    const value = inputNumber(record[field]);
    dimensions[field] = value;
    if (value === null || value <= 0) {
      add(field, "foundation_dimension_invalid", `${label} (inches) must be a finite positive number.`);
    }
  }
  if (!issues.length) {
    const depth = dimensions.depth_inches / 12;
    const radius = dimensions.diameter / 24;
    const volume = type === "spread_foot" ? dimensions.length_inches / 12 * (dimensions.width_inches / 12) * depth / 27 * quantity : Math.PI * radius * radius * depth / 27 * quantity;
    if (!Number.isFinite(volume) || volume <= 0) {
      add("dimensions", "foundation_volume_out_of_range", "dimensions and quantity cannot produce a finite positive volume in the supported calculation range.");
    }
  }
  if (record.include_rebar) {
    const optional = (field, code, label, valid) => {
      const value = record[field];
      if (value !== void 0 && value !== null && !valid(value)) add(field, code, label);
    };
    const positive = (value) => {
      const number = inputNumber(value);
      return number !== null && number > 0;
    };
    const whole = (field, label) => optional(
      field,
      "foundation_rebar_count_invalid",
      `${label} must be a positive whole number within the supported range.`,
      positiveWholeNumber
    );
    if (type === "spread_foot") {
      for (const [field, label] of [["rebar_spacing_length", "length"], ["rebar_spacing_width", "width"]]) {
        optional(
          field,
          "foundation_rebar_spacing_invalid",
          `rebar spacing ${label} (inches) must be a finite positive number.`,
          positive
        );
      }
      whole("rebar_layers", "Rebar mat count");
    } else if (type === "pillar") {
      whole("pillar_rebar_layers", "Hoop count");
      whole("pillar_vertical_rebar_count", "Longitudinal bar count");
      optional(
        "pillar_rebar_hoop_diameter",
        "foundation_rebar_diameter_invalid",
        "hoop diameter (inches) must be finite, positive and no greater than the foundation diameter.",
        (value) => positive(value) && (dimensions.diameter === null || dimensions.diameter <= 0 || inputNumber(value) <= dimensions.diameter)
      );
    }
  }
  for (const [field, label] of ITEM_CUSTOM_OVERRIDE_FIELDS) {
    const raw = record[field];
    if (raw === void 0 || raw === null) continue;
    const number = inputNumber(raw);
    if (number === null || number < 0) {
      add(
        field,
        "foundation_override_invalid",
        `${label} must be a finite, nonnegative number \u2014 clear it or record a valid value.`
      );
    }
  }
  return issues;
}
var cabinetQuantityNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
var cabinetPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
function signageCabinetInputIssues(cabinet, index = 0) {
  const issues = [];
  const record = cabinet ?? {};
  const add = (field, code, message) => issues.push({
    kind: "signage_cabinet",
    index,
    componentId: record.component_id ?? record.id ?? null,
    field,
    code,
    message: `Signage cabinet ${index + 1}: ${message}`
  });
  const qty = record.quantity;
  if (qty !== void 0 && qty !== null && qty !== "" && cabinetQuantityNumber(qty) === null) {
    add(
      "quantity",
      "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity \u2014 a zero or malformed quantity cannot be repriced"
    );
  }
  if (cabinetPriceNumber(record.unit_cost) === null) {
    add(
      "unit_cost",
      "signage_cabinet_price_unavailable",
      "record a finite, nonnegative unit cost \u2014 a missing price is not a free cabinet"
    );
  }
  return issues;
}
function signageCabinetsInputIssues(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).flatMap((cabinet, index) => signageCabinetInputIssues(cabinet, index));
}
function foundationProjectInputIssues(project) {
  const items = project?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Foundation items must be an array.");
  return [
    ...items.flatMap((item, index) => foundationItemInputIssues(item, index)),
    ...signageCabinetsInputIssues(project?.signage_cabinets || []),
    ...landscapeInputIssues(project?.landscape)
  ];
}

// frozen:/app/src/components/estimator/foundation/foundationCalc.js
var num2 = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
var REBAR_LB_PER_FT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.67 };
var ITEM_SNAPSHOT_FIELDS = [
  "concrete_volume_cy",
  "excavation_volume_cy",
  "concrete_bags",
  "rebar_feet",
  "rebar_weight_lbs",
  "concrete_cost",
  "concrete_rate",
  "rebar_cost",
  "rebar_rate",
  "excavation_cost",
  "excavation_hours",
  "forming_cost",
  "forming_qty",
  "pouring_cost",
  "finishing_cost",
  "finishing_hours",
  "item_total_cost"
];
function calcItem(item, project, inventory, settings = {}, savedItem = item) {
  const inputIssues = foundationItemInputIssues(item);
  if (inputIssues.length || foundationItemCatalogIssues(item, inventory).length) {
    return {
      quantity: inputIssues.length ? item.quantity : Math.max(1, num2(item.quantity, 1)),
      ...Object.fromEntries(ITEM_SNAPSHOT_FIELDS.map((key) => [
        key,
        hasFoundationCostSnapshot(savedItem?.[key]) ? savedItem[key] : void 0
      ]))
    };
  }
  const legacy = calcItemCost(
    { ...item, excavation_method: item.excavation_method || project?.excavation_method },
    inventory,
    settings
  );
  const isPillar = item.foundation_type === "pillar";
  const rebarSize = (isPillar ? item.pillar_rebar_size : item.rebar_size) || "#4";
  return {
    quantity: Math.max(1, num2(item.quantity, 1)),
    concrete_volume_cy: legacy.volumeCY,
    excavation_volume_cy: legacy.volumeCY * 1.25,
    concrete_bags: legacy.concreteBags,
    rebar_feet: legacy.rebarFt,
    rebar_weight_lbs: legacy.rebarFt * (REBAR_LB_PER_FT[rebarSize] || 0.668),
    concrete_cost: legacy.concreteCost,
    concrete_rate: legacy.concreteRate,
    rebar_cost: legacy.rebarCost,
    rebar_rate: legacy.rebarRate,
    excavation_cost: legacy.excavationCost,
    excavation_hours: legacy.excavationHours,
    forming_cost: legacy.formingCost,
    forming_qty: legacy.formingQty,
    pouring_cost: legacy.pouringCost,
    finishing_cost: legacy.finishingCost,
    finishing_hours: legacy.finishingHours,
    item_total_cost: legacy.total
  };
}
var RENTAL_PERIODS = ["day", "week", "month"];
var equipmentAssignedId = (value) => typeof value === "string" && value.trim() !== "" || typeof value === "number" && Number.isFinite(value);
var equipmentComponentId = (entry) => {
  const id = entry?.component_id ?? entry?._id;
  return equipmentAssignedId(id) ? id : null;
};
var equipmentPriceNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
var equipmentPositiveNumber = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
function equipmentPricing(entry, bindings, index) {
  const issues = [...bindings.issues];
  const eq = bindings.equipment;
  const add = (kind, field, inventoryId, code, message) => issues.push({
    kind,
    index,
    componentId: entry?.component_id ?? entry?._id ?? null,
    field,
    inventoryId: inventoryId ?? null,
    code,
    message: `Equipment ${index + 1}: ${message}.`
  });
  const customQtyOn = entry?.custom_qty !== void 0 && entry?.custom_qty !== null;
  const customRateOn = entry?.custom_rate !== void 0 && entry?.custom_rate !== null;
  const rentedRows = (rows) => (rows || []).filter((row) => row.inventory && row.quantity !== 0);
  const periodDriven = !customRateOn || rentedRows(bindings.attachmentRows).length > 0 || rentedRows(bindings.subAttachmentRows).length > 0;
  const rentalPeriod = entry?.rental_period || "day";
  const periodField = RENTAL_PERIODS.includes(rentalPeriod) ? `cost_per_${rentalPeriod}` : null;
  if (periodDriven && periodField === null) {
    add(
      "equipment",
      "rental_period",
      eq?.id ?? null,
      "equipment_period_unavailable",
      "select a daily, weekly, or monthly rental period before repricing"
    );
  }
  let duration = null;
  if (customQtyOn) {
    duration = equipmentPositiveNumber(entry.custom_qty);
    if (duration === null) {
      add(
        "equipment",
        "custom_qty",
        eq?.id ?? null,
        "custom_qty_unavailable",
        "record a finite, positive custom quantity or clear the override before repricing"
      );
    }
  } else {
    duration = entry?.rental_duration === void 0 || entry?.rental_duration === null || entry?.rental_duration === "" ? 1 : equipmentPositiveNumber(entry.rental_duration);
    if (duration === null) {
      add(
        "equipment",
        "rental_duration",
        eq?.id ?? null,
        "equipment_duration_unavailable",
        "record a finite, positive rental duration or clear it before repricing"
      );
    }
  }
  let rate = null;
  if (customRateOn) {
    rate = equipmentPriceNumber(entry.custom_rate);
    if (rate === null) {
      add(
        "equipment",
        "custom_rate",
        eq?.id ?? null,
        "custom_rate_unavailable",
        "record a finite, nonnegative custom rate or clear the override before repricing"
      );
    }
  } else if (eq && periodField !== null) {
    rate = equipmentPriceNumber(eq[periodField]);
    if (rate === null) {
      add(
        "equipment",
        periodField,
        eq.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} rental price before repricing`
      );
    }
  }
  let deliveryCharge = null;
  if (entry?.include_delivery) {
    const customDeliveryOn = entry?.custom_delivery_charge !== void 0 && entry?.custom_delivery_charge !== null;
    if (customDeliveryOn) {
      deliveryCharge = equipmentPriceNumber(entry.custom_delivery_charge);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "custom_delivery_charge",
          eq?.id ?? null,
          "custom_delivery_charge_unavailable",
          "record a finite, nonnegative custom delivery charge or clear the override before repricing"
        );
      }
    } else if (eq) {
      deliveryCharge = equipmentPriceNumber(eq.pickup_delivery_cost);
      if (deliveryCharge === null) {
        add(
          "equipment",
          "pickup_delivery_cost",
          eq.id ?? null,
          "equipment_delivery_price_unavailable",
          "record a finite, nonnegative catalog delivery charge before repricing"
        );
      }
    }
  }
  const rawQuantity = (row) => row.field === "attachment_counts" || row.field === "sub_attachment_counts" ? entry?.[row.field]?.[row.id] : row.quantity;
  const priceRows = (rows, kind) => (rows || []).map((row) => {
    const quantity = !row.inventory ? 0 : rawQuantity(row);
    if (!row.inventory || Number(quantity) === 0) return { row, skipped: true };
    const parsedQuantity = equipmentPositiveNumber(quantity);
    if (parsedQuantity === null) {
      add(
        kind,
        row.field,
        row.id ?? null,
        "equipment_attachment_qty_unavailable",
        `record a finite, positive ${kind.replaceAll("_", " ")} quantity or clear it before repricing`
      );
      return { row, quantity: null, rate: null };
    }
    const rowRate = periodField === null ? null : equipmentPriceNumber(row.inventory[periodField]);
    if (periodField !== null && rowRate === null) {
      add(
        kind,
        periodField,
        row.id ?? null,
        "equipment_price_unavailable",
        `record a finite, nonnegative catalog ${rentalPeriod} price for the selected ${kind.replaceAll("_", " ")} before repricing`
      );
    }
    return { row, quantity: parsedQuantity, rate: rowRate };
  });
  return {
    issues,
    equipment: eq,
    rentalPeriod,
    duration,
    rate,
    deliveryCharge,
    attachmentLines: priceRows(bindings.attachmentRows, "attachment"),
    subAttachmentLines: priceRows(bindings.subAttachmentRows, "sub_attachment")
  };
}
function calcEquipmentPricing(selected, inventory = [], options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options ?? {}, "savedEquipment");
  const savedEquipment = Array.isArray(options?.savedEquipment) ? options.savedEquipment : [];
  const counts = (rows) => {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows || []) {
      const id = equipmentComponentId(row);
      if (id !== null) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(selected), savedCounts = counts(savedEquipment);
  const savedById = new Map(savedEquipment.filter((row) => equipmentComponentId(row) !== null).map((row) => [equipmentComponentId(row), row]));
  const held = (entry) => {
    const result = { ...entry };
    if (!explicitSnapshot) return result;
    const id = equipmentComponentId(entry);
    const saved = id !== null && currentCounts.get(id) === 1 && savedCounts.get(id) === 1 ? savedById.get(id) : null;
    if (saved && Object.prototype.hasOwnProperty.call(saved, "equipment_cost")) result.equipment_cost = saved.equipment_cost;
    else delete result.equipment_cost;
    return result;
  };
  return (selected || []).map((storedEntry, index) => {
    const entry = storedEntry || {};
    const bindings = resolveFoundationEquipment(entry, inventory, index);
    const check = equipmentPricing(entry, bindings, index);
    const context = { ...bindings, issues: check.issues, rentalPeriod: check.rentalPeriod, duration: check.duration };
    if (check.issues.length) {
      const pricedEntry = held(entry);
      return {
        ...context,
        pricedEntry,
        baseCost: null,
        deliveryCost: null,
        totalCost: hasFoundationCostSnapshot(pricedEntry.equipment_cost) ? pricedEntry.equipment_cost : null,
        attachmentRows: bindings.attachmentRows.map((row) => ({ ...row, cost: null })),
        subAttachmentRows: bindings.subAttachmentRows.map((row) => ({ ...row, cost: null }))
      };
    }
    const baseCost = check.rate * check.duration;
    let entryTotal = baseCost;
    if (entry.include_delivery) entryTotal += check.deliveryCharge;
    const pricedLines = (lines) => lines.map((line) => {
      if (line.skipped) return { ...line.row, cost: 0 };
      const cost = line.rate * check.duration * line.quantity;
      entryTotal += cost;
      return { ...line.row, cost };
    });
    const attachmentRows = pricedLines(check.attachmentLines);
    const subAttachmentRows = pricedLines(check.subAttachmentLines);
    return {
      ...context,
      pricedEntry: { ...entry, equipment_cost: entryTotal },
      baseCost,
      deliveryCost: entry.include_delivery ? check.deliveryCharge : 0,
      attachmentRows,
      subAttachmentRows,
      totalCost: entryTotal
    };
  });
}
function equipmentCostTotal(pricedEntries = []) {
  let total = 0;
  for (const entry of pricedEntries || []) {
    if (!hasFoundationCostSnapshot(entry?.equipment_cost)) return null;
    total += entry.equipment_cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function calcSignageCabinetPricing(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).map((cabinet, index) => {
    const issues = signageCabinetInputIssues(cabinet, index);
    const entry = { ...cabinet ?? {} };
    if (issues.length) return { available: false, issues, cost: null, pricedEntry: entry };
    const quantity = entry.quantity === void 0 || entry.quantity === null || entry.quantity === "" ? 1 : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity;
    return { available: true, issues, cost, pricedEntry: entry };
  });
}
function signageCabinetCostTotal(pricedRows = []) {
  let total = 0;
  for (const row of pricedRows || []) {
    if (!hasFoundationCostSnapshot(row?.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}
function savedConcreteDelivery(project) {
  const snapshot = project?.concrete_delivery_snapshot?.version === 1 ? project.concrete_delivery_snapshot : null;
  const value = (record, key) => hasFoundationCostSnapshot(record?.[key]) ? record[key] : void 0;
  return {
    pricingUnavailable: true,
    concreteTotal: value(snapshot, "concrete_total"),
    roundedYards: value(snapshot, "rounded_yards"),
    ratePerYard: value(snapshot, "rate_per_yard"),
    additionalStopsCost: value(snapshot, "additional_stops_cost"),
    trucksList: (Array.isArray(snapshot?.trucks) ? snapshot.trucks : []).map((truck) => ({
      yards: value(truck, "yards"),
      roundedYards: value(truck, "rounded_yards"),
      cost: value(truck, "cost"),
      smallOrderFee: value(truck, "small_order_fee"),
      fuelFee: value(truck, "fuel_fee")
    })),
    availableMixes: [],
    availableAdmixes: []
  };
}
function calcProject(project, inventory, settings = {}, options = {}) {
  const explicitSnapshot = Object.prototype.hasOwnProperty.call(options, "savedProject");
  const savedProject = !explicitSnapshot ? project : project.id !== void 0 && project.id !== null && project.id !== "" && options.savedProject?.id === project.id ? options.savedProject : null;
  const sourceItems = project.items || [];
  const savedItems = /* @__PURE__ */ new Map();
  const currentIds = /* @__PURE__ */ new Map();
  for (const item of savedProject?.items || []) {
    if (item.component_id) savedItems.set(item.component_id, savedItems.has(item.component_id) ? null : item);
  }
  for (const item of sourceItems) currentIds.set(item.component_id, (currentIds.get(item.component_id) || 0) + 1);
  const poleCalc = calcPoles(
    project.poles,
    inventory,
    settings,
    explicitSnapshot ? { savedPoles: savedProject?.poles ?? [] } : {}
  );
  const wallCalc = calcWalls(
    project,
    inventory,
    settings,
    explicitSnapshot ? { savedWalls: savedProject?.walls ?? [] } : {}
  );
  const equipmentCalc = calcEquipmentPricing(
    project.selected_equipment,
    inventory,
    explicitSnapshot ? { savedEquipment: savedProject?.selected_equipment ?? [] } : {}
  );
  const equipmentPricing2 = equipmentCalc.map((row) => ({ available: row.issues.length === 0, issues: row.issues }));
  const catalogIssues = [
    ...poleCalc.polePricing.flatMap((entry) => entry.issues),
    ...wallCalc.wallPricing.flatMap((entry) => entry.issues),
    ...equipmentPricing2.flatMap((entry) => entry.issues),
    ...foundationAssemblyCatalogIssues(project, inventory).filter((issue) => !["pole", "wall", "internal_wall", "equipment", "attachment", "sub_attachment"].includes(issue.kind))
  ];
  const inputIssues = foundationProjectInputIssues(project);
  const cabinetCalc = calcSignageCabinetPricing(project.signage_cabinets);
  const signageCabinetPricing = cabinetCalc.map((row) => ({ available: row.available, issues: row.issues }));
  const landscapeCalc = landscapeSummary(project.landscape);
  const landscapeIssues = inputIssues.filter((issue) => issue.kind === "landscape");
  const landscapePricing = { available: landscapeIssues.length === 0, issues: landscapeIssues };
  const itemPricing = sourceItems.map((item, index) => {
    const issues = [
      ...catalogIssues.filter((issue) => issue.kind === "foundation" && issue.index === index),
      ...inputIssues.filter((issue) => issue.kind === "foundation" && issue.index === index)
    ];
    return { available: issues.length === 0, issues };
  });
  const items = sourceItems.map((item) => {
    const savedItem = !explicitSnapshot ? item : item.component_id && currentIds.get(item.component_id) === 1 ? savedItems.get(item.component_id) || null : null;
    return { ...item, ...calcItem(item, project, inventory, settings, savedItem) };
  });
  const equipment = equipmentCalc.map((row) => row.pricedEntry);
  const deliveryCheck = itemPricing.some((item) => !item.available) ? null : calcConcreteDelivery(
    { ...project, settings },
    (project.items || []).map((i) => ({
      ...i,
      excavation_method: i.excavation_method || project.excavation_method
    })),
    inventory
  );
  const delivery = deliveryCheck === null || deliveryCheck.pricingUnavailable === true ? savedConcreteDelivery(savedProject) : deliveryCheck;
  if (deliveryCheck?.issues?.length) catalogIssues.push(...deliveryCheck.issues);
  const walls = wallCalc.walls;
  const poles = poleCalc.poles;
  const wallCaps = calcWallCaps(
    project.wall_caps,
    inventory,
    explicitSnapshot ? { savedCaps: savedProject?.wall_caps ?? [] } : {}
  );
  const sum = (key) => items.some((item, index) => !itemPricing[index].available && !hasFoundationCostSnapshot(item[key])) ? null : items.reduce((s, i) => s + num2(i[key]), 0);
  const addKnown = (a, b) => hasFoundationCostSnapshot(a) && hasFoundationCostSnapshot(b) ? a + b : null;
  const category = (key, value) => value !== null ? value : hasFoundationCostSnapshot(savedProject?.[key]) ? savedProject[key] : null;
  const itemsTotal = addKnown(sum("item_total_cost"), delivery.concreteTotal);
  const sumWall = (key) => {
    let total = 0;
    for (const wall of walls) {
      const value = wall.calculatedCosts?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const wallTotal = sumWall("totalCost");
  const sumPole = (key) => {
    let total = 0;
    for (const pole of poles) {
      const value = pole?.[key];
      if (!hasFoundationCostSnapshot(value)) return null;
      total += value;
      if (!Number.isFinite(total)) return null;
    }
    return total;
  };
  const polesTotal = sumPole("total_cost");
  const equipmentTotal = equipmentCostTotal(equipment);
  const totals = {
    // Bagged concrete is priced per item; ready-mix is priced per delivered truck.
    total_concrete_cost: category("total_concrete_cost", addKnown(sum("concrete_cost"), delivery.concreteTotal)),
    concrete_delivery_cost: delivery.concreteTotal,
    concrete_delivered_yards: delivery.roundedYards,
    concrete_rate_per_yard: delivery.ratePerYard,
    concrete_trucks: delivery.trucksList,
    additional_stops_cost: delivery.additionalStopsCost,
    total_rebar_cost: category("total_rebar_cost", sum("rebar_cost")),
    total_excavation_cost: category("total_excavation_cost", sum("excavation_cost")),
    total_forming_materials_cost: category("total_forming_materials_cost", sum("forming_cost")),
    total_labor_cost: category("total_labor_cost", addKnown(sum("pouring_cost"), sum("finishing_cost"))),
    total_pole_cost: category("total_pole_cost", sumPole("pole_cost")),
    total_pole_painting_cost: category("total_pole_painting_cost", sumPole("pole_painting_cost")),
    total_brick_cost: sumWall("materialCost"),
    total_fill_cost: sumWall("internalMaterialCost"),
    total_equipment_cost: category("total_equipment_cost", equipmentTotal),
    total_wall_cost: wallTotal,
    total_wall_cap_cost: wallCaps.total,
    wall_caps_by_material: wallCaps.byInventory,
    total_concrete_volume_cy: sum("concrete_volume_cy"),
    total_excavation_volume_cy: sum("excavation_volume_cy"),
    total_labor_hours: addKnown(sum("finishing_hours"), sum("excavation_hours")),
    // Page-level extras: held at the acknowledged project totals when the
    // recorded rows cannot be repriced — a null here is "unavailable", never $0.
    total_signage_cabinet_cost: category("total_signage_cabinet_cost", signageCabinetCostTotal(cabinetCalc)),
    total_landscape_cost: category("total_landscape_cost", landscapeIssues.length ? null : landscapeCalc.total)
  };
  totals.grand_total = itemsTotal === null || wallTotal === null || polesTotal === null || equipmentTotal === null || wallCaps.total === null ? null : itemsTotal + wallTotal + polesTotal + equipmentTotal + wallCaps.total;
  return {
    items,
    equipment,
    walls,
    poles,
    wallCaps: wallCaps.caps,
    totals,
    delivery,
    itemPricing,
    polePricing: poleCalc.polePricing,
    wallPricing: wallCalc.wallPricing,
    equipmentPricing: equipmentPricing2,
    signageCabinetPricing,
    landscapePricing,
    catalogIssues,
    inputIssues
  };
}
var money = (n) => `$${num2(n).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// frozen:/app/src/components/estimator/foundation/foundationAssemblyModel.js
var ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
var ID_MAX = 200;
var MAX_COLLISIONS = 8;
var UNRESOLVED_PREFIX = "unresolved:";
var UNRESOLVED = {
  foundation: `${UNRESOLVED_PREFIX}legacy-foundation`,
  pole: `${UNRESOLVED_PREFIX}legacy-pole`,
  wall: `${UNRESOLVED_PREFIX}legacy-wall`,
  segment: `${UNRESOLVED_PREFIX}legacy-segment`
};
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isId = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= ID_MAX;
var isReserved = (v) => typeof v === "string" && v.startsWith(UNRESOLVED_PREFIX);
var isUnresolvedToken = (v) => Object.values(UNRESOLVED).includes(v);
var deepClone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var cloneRawValue = (v) => {
  try {
    return deepClone(v);
  } catch {
    return v;
  }
};
var cloneNode = (n) => isRecord2(n) ? { ...n } : n;
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var segEndpoints = (shape, i) => {
  const pts = shape?.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const closed = shape?.closed === true && pts.length >= 3;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (i >= pts.length || !closed && i >= pts.length - 1) return null;
  if (!fin(a?.x) || !fin(a?.z) || !fin(b?.x) || !fin(b?.z)) return null;
  return `${a.x},${a.z}->${b.x},${b.z}`;
};
var legacyIndexOf = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === void 0) continue;
    if (v === -1) return { explicit: true };
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return { index: v };
    if (typeof v === "string" && /^\d+$/.test(v)) return { index: parseInt(v, 10) };
    return { invalid: v };
  }
  return { absent: true };
};
var collectIds = (project) => {
  const ids = /* @__PURE__ */ new Set();
  const walk = (rows) => (rows || []).forEach((r) => {
    if (isId(r?.component_id)) ids.add(r.component_id);
  });
  ARRAYS.forEach((k) => walk(project?.[k]));
  (project?.walls || []).forEach((w) => walk(w?.shape?.segments));
  (project?.poles || []).forEach((p) => walk(p?.signs));
  return ids;
};
var collectRefs = (project) => {
  const refs = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (isId(v)) refs.add(v);
  };
  (project?.poles || []).forEach((p) => add(p?.foundation_component_id));
  (project?.wall_caps || []).forEach((c) => {
    add(c?.wall_component_id);
    add(c?.segment_component_id);
  });
  (project?.signage_cabinets || []).forEach((c) => {
    add(c?.foundation_component_id);
    add(c?.pole_component_id);
  });
  return refs;
};
var freshId = (createId, kind, used) => {
  for (let i = 0; i < MAX_COLLISIONS; i += 1) {
    const id = createId(kind);
    if (isId(id) && !isReserved(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`foundation assembly: could not mint a unique component id for ${kind}`);
};
var validateRef = (v, kind) => {
  if (v === void 0 || v === null) return;
  if (typeof v !== "string" || v !== "" && !isId(v) && !isUnresolvedToken(v)) {
    throw new Error(`foundation assembly: invalid ${kind} reference value`);
  }
};
var ensureNodeId = (row, createId, kind, used, seen) => {
  if (!isRecord2(row)) throw new Error(`foundation assembly: ${kind} row must be a record`);
  const n = cloneNode(row);
  const existing = n.component_id;
  if (existing !== void 0 && existing !== null) {
    if (!isId(existing) || isReserved(existing)) throw new Error(`foundation assembly: invalid component_id on ${kind} row`);
    if (seen.has(existing)) throw new Error(`foundation assembly: duplicate component_id "${existing}"`);
    seen.add(existing);
    used.add(existing);
  } else {
    const id = freshId(createId, kind, used);
    n.component_id = id;
    seen.add(id);
  }
  return n;
};
var reserve = (project, previous, used) => {
  const check = (v) => {
    if (typeof v === "string" && v.length > 0) used.add(v);
  };
  for (const src of [previous || {}, project || {}]) {
    collectIds(src).forEach((id) => used.add(id));
    collectRefs(src).forEach((id) => used.add(id));
    const kinds = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
    for (const k of kinds) for (const r of src?.[k] || []) {
      if (!isRecord2(r)) throw new Error(`foundation assembly: ${k} row must be a record`);
      for (const [f, kind] of [["foundation_component_id", "foundation"], ["pole_component_id", "pole"], ["wall_component_id", "wall"], ["segment_component_id", "segment"]]) validateRef(r[f], kind);
    }
    for (const w of src?.walls || []) for (const s of w?.shape?.segments || []) check(s?.component_id);
    for (const p of src?.poles || []) for (const s of p?.signs || []) check(s?.component_id);
  }
};
var rebuildIndex = (canon, parents) => {
  if (canon === "" || canon === void 0 || isUnresolvedToken(canon)) return void 0;
  const i = (parents || []).findIndex((p) => p?.component_id === canon);
  return i >= 0 ? i : void 0;
};
var resolveParent = (canonValue, hasCanon, legacy, incoming, prev, unresolvedToken) => {
  if (hasCanon) {
    if (canonValue === void 0 || canonValue === null) return { canon: "", index: void 0 };
    if (canonValue === "") return { canon: "", index: void 0 };
    if (isUnresolvedToken(canonValue)) return { canon: canonValue, index: void 0, dangling: true, token: true };
    const found = (incoming || []).some((p) => p?.component_id === canonValue);
    return { canon: canonValue, index: found ? rebuildIndex(canonValue, incoming) : void 0, dangling: !found };
  }
  if (legacy.index !== void 0) {
    let canon;
    if (prev) canon = prev[legacy.index]?.component_id;
    else canon = incoming?.[legacy.index]?.component_id;
    if (isId(canon) && (incoming || []).some((p) => p?.component_id === canon)) {
      return { canon, index: rebuildIndex(canon, incoming) };
    }
    if (isId(canon)) return { canon: unresolvedToken, index: void 0, dangling: true, token: true };
    return { canon: unresolvedToken, index: void 0, dangling: true, token: true, outOfRange: true };
  }
  if (legacy.invalid !== void 0) return { canon: unresolvedToken, index: void 0, dangling: true, token: true, invalid: legacy.invalid };
  if (legacy.explicit) return { canon: "", index: void 0 };
  return { canon: void 0, index: void 0 };
};
var normalizeWalls = (walls, prevWalls, createId, used, seen) => {
  const prevSegIds = /* @__PURE__ */ new Map();
  (prevWalls || []).forEach((w) => {
    const segs = w?.shape?.segments || [];
    segs.forEach((s, i) => {
      const key = segEndpoints(w?.shape, i);
      if (!isId(s?.component_id) || !key) return;
      const k = `${w.component_id}|${key}`;
      if (prevSegIds.has(k)) prevSegIds.set(k, null);
      else prevSegIds.set(k, s.component_id);
    });
  });
  const out = [];
  for (const w of walls || []) {
    const n = ensureNodeId(w, createId, "wall", used, seen);
    const shape = isRecord2(n.shape) ? { ...n.shape } : n.shape;
    const segs = shape?.segments;
    if (segs !== void 0 && !Array.isArray(segs)) throw new Error("foundation assembly: wall shape segments must be an array");
    if (Array.isArray(segs)) {
      for (const s of segs) if (!isRecord2(s)) throw new Error("foundation assembly: wall shape segments must be records");
      const incomingCount = /* @__PURE__ */ new Map();
      segs.forEach((s, i) => {
        const key = segEndpoints(shape, i);
        if (key) incomingCount.set(key, (incomingCount.get(key) || 0) + 1);
      });
      const priorCount = /* @__PURE__ */ new Map();
      (prevWalls || []).forEach((w2) => {
        (w2?.shape?.segments || []).forEach((s2, i) => {
          const key = segEndpoints(w2?.shape, i);
          if (w2?.component_id === n.component_id && key) priorCount.set(key, (priorCount.get(key) || 0) + 1);
        });
      });
      shape.segments = segs.map((s, i) => {
        const prior = s.component_id;
        if (prior !== void 0 && prior !== null) return ensureNodeId(s, createId, "wall_segment", used, seen);
        const key = segEndpoints(shape, i);
        const kept = key && incomingCount.get(key) === 1 && priorCount.get(key) === 1 ? prevSegIds.get(`${n.component_id}|${key}`) : void 0;
        if (kept && !seen.has(kept)) {
          const sn = cloneNode(s);
          sn.component_id = kept;
          seen.add(kept);
          used.add(kept);
          return sn;
        }
        return ensureNodeId(s, createId, "wall_segment", used, seen);
      });
    }
    n.shape = shape;
    out.push(n);
  }
  return out;
};
var normalizePoles = (poles, items, prevItems, createId, used, seen) => (poles || []).map((p) => {
  const n = ensureNodeId(p, createId, "pole", used, seen);
  const legacy = legacyIndexOf(p, ["foundation_idx"]);
  const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(p, "foundation_component_id"), legacy, items, prevItems, UNRESOLVED.foundation);
  n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
  n.foundation_idx = res.index;
  const signs = p?.signs;
  if (signs !== void 0 && !Array.isArray(signs)) throw new Error("foundation assembly: pole signs must be an array");
  if (Array.isArray(signs)) n.signs = signs.map((s) => ensureNodeId(s, createId, "pole_sign", used, seen));
  return n;
});
var normalizeCaps = (caps, walls, prevWalls, createId, used, seen) => (caps || []).map((c) => {
  const n = ensureNodeId(c, createId, "wall_cap", used, seen);
  const wRes = resolveParent(n.wall_component_id, Object.prototype.hasOwnProperty.call(c, "wall_component_id"), legacyIndexOf(c, ["wall_index"]), walls, prevWalls, UNRESOLVED.wall);
  n.wall_component_id = wRes.canon === void 0 ? "" : wRes.canon;
  n.wall_index = wRes.index;
  const wall = (walls || []).find((w) => w?.component_id === n.wall_component_id);
  const segs = wall?.shape?.segments || [];
  const prevSegs = prevWalls ? prevWalls.find((w) => w?.component_id === n.wall_component_id)?.shape?.segments || [] : null;
  const sRes = resolveParent(n.segment_component_id, Object.prototype.hasOwnProperty.call(c, "segment_component_id"), legacyIndexOf(c, ["segment_index"]), segs, prevSegs, UNRESOLVED.segment);
  n.segment_component_id = sRes.canon === void 0 ? "" : sRes.canon;
  n.segment_index = sRes.index;
  return n;
});
var normalizeCabinets = (cabinets, items, poles, prevItems, prevPoles, createId, used, seen) => (cabinets || []).map((c) => {
  const n = ensureNodeId(c, createId, "signage_cabinet", used, seen);
  const mount = c?.mount;
  if (mount === "pole") {
    const res = resolveParent(n.pole_component_id, Object.prototype.hasOwnProperty.call(c, "pole_component_id"), legacyIndexOf(c, ["pole_index"]), poles, prevPoles, UNRESOLVED.pole);
    n.pole_component_id = res.canon === void 0 ? "" : res.canon;
    n.pole_index = res.index;
    n.foundation_component_id = n.foundation_component_id ?? "";
    n.foundation_index = void 0;
  } else if (mount === "foundation") {
    const res = resolveParent(n.foundation_component_id, Object.prototype.hasOwnProperty.call(c, "foundation_component_id"), legacyIndexOf(c, ["foundation_index"]), items, prevItems, UNRESOLVED.foundation);
    n.foundation_component_id = res.canon === void 0 ? "" : res.canon;
    n.foundation_index = res.index;
    n.pole_component_id = n.pole_component_id ?? "";
    n.pole_index = void 0;
  } else {
    n.mount = mount;
    if (n.foundation_component_id === void 0) n.foundation_component_id = "";
    if (n.pole_component_id === void 0) n.pole_component_id = "";
    n.foundation_index = void 0;
    n.pole_index = void 0;
  }
  return n;
});
function normalizeFoundationAssembly(project, { previous = null, createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord2(project)) throw new Error("foundation assembly: project must be a record");
  const ver = project.assembly_schema_version;
  if (ver !== void 0 && ver !== 1) throw new Error(`foundation assembly: unsupported assembly_schema_version ${String(ver)}`);
  const used = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const k of ARRAYS) {
    if (project[k] !== void 0 && !Array.isArray(project[k])) throw new Error(`foundation assembly: ${k} must be an array`);
  }
  reserve(project, previous, used);
  const next = { ...project, assembly_schema_version: 1 };
  next.items = (project.items || []).map((it) => ensureNodeId(it, createId, "item", used, seen));
  next.walls = normalizeWalls(project.walls, previous?.walls, createId, used, seen);
  next.poles = normalizePoles(project.poles, next.items, previous?.items, createId, used, seen);
  next.wall_caps = normalizeCaps(project.wall_caps, next.walls, previous?.walls, createId, used, seen);
  next.signage_cabinets = normalizeCabinets(project.signage_cabinets, next.items, next.poles, previous?.items, previous?.poles, createId, used, seen);
  return { project: next, issues: foundationAssemblyIssues(next) };
}
function foundationAssemblyIssues(project) {
  const issues = [];
  if (!isRecord2(project)) return issues;
  const items = project.items || [];
  const walls = project.walls || [];
  const poles = project.poles || [];
  const byId = (arr, id) => isId(id) && (arr || []).some((p) => p?.component_id === id);
  for (const p of poles) {
    const canon = p?.foundation_component_id;
    if (canon === "" || canon === void 0 || canon === null) continue;
    if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole legacy foundation index could not be resolved; left unresolved until reassigned." });
    else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "pole", componentId: p?.component_id, parentId: canon, message: "Pole references a foundation that is not present; it stays priced until reassigned." });
  }
  for (const c of project.wall_caps || []) {
    const wId = c?.wall_component_id;
    if (wId === "" || wId === void 0 || wId === null) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall assigned; it stays priced until assigned." });
    else if (isReserved(wId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap wall could not be resolved; left unresolved until reassigned." });
    else if (!byId(walls, wId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: wId, message: "Wall cap references a wall that is not present; it stays priced until reassigned." });
    const wall = walls.find((w) => w?.component_id === wId);
    const segs = wall?.shape?.segments || [];
    const sId = c?.segment_component_id;
    if (sId === "" || sId === void 0 || sId === null) {
      if (wall) issues.push({ code: "missing-mount", kind: "wall_cap", componentId: c?.component_id, parentId: void 0, message: "Wall cap has no wall segment assigned; it stays priced until assigned." });
    } else if (isReserved(sId)) issues.push({ code: "unresolved-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap segment could not be resolved; left unresolved until reassigned." });
    else if (!byId(segs, sId)) issues.push({ code: "dangling-parent", kind: "wall_cap", componentId: c?.component_id, parentId: sId, message: "Wall cap references a wall segment that is not present; it stays priced until reassigned." });
  }
  for (const c of project.signage_cabinets || []) {
    if (c?.mount === "pole") {
      const canon = c?.pole_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet pole could not be resolved; left unresolved until reassigned." });
      else if (!byId(poles, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a pole that is not present; it stays priced until reassigned." });
    } else if (c?.mount === "foundation") {
      const canon = c?.foundation_component_id;
      if (canon === "" || canon === void 0 || canon === null) issues.push({ code: "missing-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet has no pole or foundation assigned; it stays priced until assigned." });
      else if (isReserved(canon)) issues.push({ code: "unresolved-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet foundation could not be resolved; left unresolved until reassigned." });
      else if (!byId(items, canon)) issues.push({ code: "dangling-parent", kind: "signage_cabinet", componentId: c?.component_id, parentId: canon, message: "Cabinet references a foundation that is not present; it stays priced until reassigned." });
    } else {
      issues.push({ code: "unsupported-mount", kind: "signage_cabinet", componentId: c?.component_id, parentId: void 0, message: "Cabinet mount is not supported; it stays priced and visible until reassigned." });
    }
  }
  return issues;
}
function cloneFoundationComponents(project, { createId } = {}) {
  if (typeof createId !== "function") throw new Error("foundation assembly: createId(kind) factory is required");
  if (!isRecord2(project)) throw new Error("foundation assembly: project must be a record");
  const rawWallSegments = /* @__PURE__ */ new Map();
  const wallsForNormalize = (Array.isArray(project.walls) ? project.walls : []).map((w, i) => {
    if (!isRecord2(w) || !isRecord2(w.shape)) return w;
    const segs = w.shape.segments;
    if (segs === void 0 || Array.isArray(segs)) return w;
    rawWallSegments.set(i, segs);
    const shape = { ...w.shape };
    delete shape.segments;
    return { ...w, shape };
  });
  const { project: normalized } = normalizeFoundationAssembly(
    rawWallSegments.size ? { ...project, walls: wallsForNormalize } : project,
    { createId }
  );
  const used = /* @__PURE__ */ new Set([...collectIds(normalized), ...collectRefs(normalized)]);
  const idMap = /* @__PURE__ */ new Map();
  const remap = (oldId, kind) => {
    if (!isId(oldId) || isReserved(oldId)) return oldId;
    if (idMap.has(oldId)) return idMap.get(oldId);
    const id = freshId(createId, kind, used);
    idMap.set(oldId, id);
    return id;
  };
  const components = { assembly_schema_version: 1 };
  const copyRows = (rows, kind) => (rows || []).map((r) => {
    const n = deepClone(r);
    n.component_id = remap(n.component_id, kind);
    return n;
  });
  if (project.items !== void 0) components.items = copyRows(normalized.items, "item");
  if (project.walls !== void 0) {
    components.walls = copyRows(normalized.walls, "wall").map((w, i) => ({
      ...w,
      shape: isRecord2(w.shape) ? {
        ...w.shape,
        segments: rawWallSegments.has(i) ? cloneRawValue(rawWallSegments.get(i)) : Array.isArray(w.shape.segments) ? w.shape.segments.map((s) => ({ ...s, component_id: remap(s.component_id, "wall_segment") })) : w.shape.segments || []
      } : w.shape
    }));
  }
  if (project.poles !== void 0) {
    components.poles = copyRows(normalized.poles, "pole").map((p) => ({
      ...p,
      foundation_component_id: isId(p.foundation_component_id) && idMap.has(p.foundation_component_id) ? idMap.get(p.foundation_component_id) : p.foundation_component_id,
      signs: (p.signs || []).map((s) => ({ ...s, component_id: remap(s.component_id, "pole_sign") }))
    }));
  }
  if (project.wall_caps !== void 0) {
    components.wall_caps = copyRows(normalized.wall_caps, "wall_cap").map((c) => ({
      ...c,
      wall_component_id: isId(c.wall_component_id) && idMap.has(c.wall_component_id) ? idMap.get(c.wall_component_id) : c.wall_component_id,
      segment_component_id: isId(c.segment_component_id) && idMap.has(c.segment_component_id) ? idMap.get(c.segment_component_id) : c.segment_component_id
    }));
  }
  if (project.signage_cabinets !== void 0) {
    components.signage_cabinets = copyRows(normalized.signage_cabinets, "signage_cabinet").map((c) => ({
      ...c,
      foundation_component_id: isId(c.foundation_component_id) && idMap.has(c.foundation_component_id) ? idMap.get(c.foundation_component_id) : c.foundation_component_id,
      pole_component_id: isId(c.pole_component_id) && idMap.has(c.pole_component_id) ? idMap.get(c.pole_component_id) : c.pole_component_id
    }));
  }
  const parents = components.items || [];
  const wallRows = components.walls || [];
  const poleRows = components.poles || [];
  (components.poles || []).forEach((p) => {
    p.foundation_idx = rebuildIndex(p.foundation_component_id, parents);
  });
  (components.wall_caps || []).forEach((c) => {
    c.wall_index = rebuildIndex(c.wall_component_id, wallRows);
    const rawSegs = wallRows.find((w) => w?.component_id === c.wall_component_id)?.shape?.segments;
    const segs = Array.isArray(rawSegs) ? rawSegs : [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  });
  (components.signage_cabinets || []).forEach((c) => {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex(c.pole_component_id, poleRows);
      c.foundation_index = void 0;
    } else {
      c.foundation_index = rebuildIndex(c.foundation_component_id, parents);
      c.pole_index = void 0;
    }
  });
  return { components, idMap };
}

// frozen:/app/cabland-model-entry.js
var calcProject2 = calcProject;
var calcItem2 = calcItem;
var calcSignageCabinetPricing2 = calcSignageCabinetPricing;
var signageCabinetCostTotal2 = signageCabinetCostTotal;
var money2 = money;
var foundationItemInputIssues2 = foundationItemInputIssues;
var foundationProjectInputIssues2 = foundationProjectInputIssues;
var signageCabinetInputIssues2 = signageCabinetInputIssues;
var signageCabinetsInputIssues2 = signageCabinetsInputIssues;
var landscapeSummary2 = landscapeSummary;
var landscapeInputIssues2 = landscapeInputIssues;
var materialByKey2 = materialByKey;
var foundationAssemblyCatalogIssues2 = foundationAssemblyCatalogIssues;
var hasFoundationCostSnapshot2 = hasFoundationCostSnapshot;
var normalizeFoundationAssembly2 = normalizeFoundationAssembly;
var cloneFoundationComponents2 = cloneFoundationComponents;
var foundationAssemblyIssues2 = foundationAssemblyIssues;
export {
  calcItem2 as calcItem,
  calcProject2 as calcProject,
  calcSignageCabinetPricing2 as calcSignageCabinetPricing,
  cloneFoundationComponents2 as cloneFoundationComponents,
  foundationAssemblyCatalogIssues2 as foundationAssemblyCatalogIssues,
  foundationAssemblyIssues2 as foundationAssemblyIssues,
  foundationItemInputIssues2 as foundationItemInputIssues,
  foundationProjectInputIssues2 as foundationProjectInputIssues,
  hasFoundationCostSnapshot2 as hasFoundationCostSnapshot,
  landscapeInputIssues2 as landscapeInputIssues,
  landscapeSummary2 as landscapeSummary,
  materialByKey2 as materialByKey,
  money2 as money,
  normalizeFoundationAssembly2 as normalizeFoundationAssembly,
  signageCabinetCostTotal2 as signageCabinetCostTotal,
  signageCabinetInputIssues2 as signageCabinetInputIssues,
  signageCabinetsInputIssues2 as signageCabinetsInputIssues
};
