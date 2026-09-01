import { base44 } from "@/api/base44Client";
import { requiresBuilderReattach } from "@/components/estimator/parts/partState";
import { calculateVinylProject } from "@/components/vinylEstimator/vinylNestingCalculator";

const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const CATALOG_NAME_FIELDS = {
  FoundationInventory: ["material_name"],
  LaborServiceInventory: ["service_name", "vendor_name"],
  ChannelLetterInstallInventory: ["item_name"],
  ChannelLetterInstallEquipment: ["equipment_name"],
  DimensionalLetterMaterial: ["material_name"],
  VinylInventory: ["vinyl_name"],
  VinylMachine: ["machine_name"],
  Inventory: ["material_type", "product_type", "size"],
  BrickStoneInventory: ["material_name"],
  MaintenanceInventory: ["item_name"],
  MaintenanceEquipment: ["equipment_name"],
};

function rowName(entity, row) {
  if (!row) return "";
  const fields = CATALOG_NAME_FIELDS[entity] || ["name"];
  if (entity === "Inventory") {
    return fields.map((field) => row[field]).filter(Boolean).join(" ");
  }
  return fields.map((field) => row[field]).find(Boolean) || "";
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => !["created_by", "created_by_id"].includes(key))
      .map((key) => [key, stableObject(value[key])])
  );
}

function same(a, b) {
  return JSON.stringify(stableObject(a ?? null)) === JSON.stringify(stableObject(b ?? null));
}

export function pricingSnapshot(row) {
  if (!row || typeof row !== "object") return {};
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    if (["id", "created_date", "updated_date", "created_by", "created_by_id", "price_history"].includes(key)) return;
    if (
      /(cost|price|rate|fee|charge|markup|surcharge)/i.test(key) ||
      [
        "pricing_mode",
        "pole_pricing_mode",
        "unit",
        "unit_type",
        "quantity_tiers",
        "minimum_order_yards",
        "minimum_order_quantity",
        "waste_factor_percent",
        "yield_factor",
      ].includes(key)
    ) {
      out[key] = stableObject(value);
    }
  });
  return out;
}

function genericUnitCost(row) {
  if (!row) return 0;
  const preferred = [
    "cost_per_unit",
    "default_rate",
    "cost_per_letter",
    "cost_per_cabinet",
    "cost_per_foot",
    "cost_per_sqft",
    "cost_per_linear_foot",
    "cost_per_roll",
    "cost_per_sheet",
    "cost_per_hour",
    "cost_per_day",
    "cost_flat",
    "pole_stock_price",
    "cap_stock_price",
  ];
  for (const key of preferred) {
    if (Number.isFinite(Number(row[key])) && Number(row[key]) !== 0) return Number(row[key]);
  }
  return 0;
}

function independentPartUnitCost(part, row) {
  if (!row) return num(part?.current_unit_cost, num(part?.frozen_unit_cost));
  const entity = part?.inventory_entity || "";
  const mode = part?.pricing_basis_snapshot?.pricing_mode || row.pricing_mode || row.pole_pricing_mode || row.unit_type || "";
  if (entity === "DimensionalLetterMaterial") return num(row.cost_per_sheet);
  if (entity === "VinylInventory") {
    if (mode === "per_sqft") return num(row.cost_per_sqft);
    if (mode === "per_linear_foot") return num(row.cost_per_linear_foot);
    return num(row.cost_per_roll);
  }
  if (entity === "LaborServiceInventory") return num(row.default_rate);
  if (entity === "ChannelLetterInstallInventory") {
    if (mode === "per_raceway_foot") return num(row.cost_per_foot);
    if (mode === "per_project_flat") return num(row.cost_flat);
    if (mode === "per_letter_by_size") return num(row.cost_medium || row.cost_per_letter);
    return num(row.cost_per_letter);
  }
  if (entity === "ChannelLetterInstallEquipment") {
    if (mode === "per_hour") return num(row.cost_per_hour);
    if (mode === "per_week") return num(row.cost_per_week);
    if (mode === "per_month") return num(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num(row.cost_flat);
    return num(row.cost_per_day);
  }
  if (entity === "MaintenanceInventory") {
    const size = part?.pricing_basis_snapshot?.size || "medium";
    if (mode === "per_letter_flat") return num(row.cost_per_letter);
    if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return num(row[`cost_${size}`]);
    if (mode === "per_cabinet_flat") return num(row.cost_per_cabinet);
    if (mode === "per_linear_foot") return num(row.cost_per_foot);
    if (mode === "per_sqft") return num(row.cost_per_sqft);
    return num(row.cost_flat);
  }
  if (entity === "MaintenanceEquipment") {
    if (mode === "delivery_pickup") return num(row.delivery_pickup_cost);
    if (mode === "idle_running") return num(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num(row.cost_per_hour);
    if (mode === "per_week") return num(row.cost_per_week);
    if (mode === "per_month") return num(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num(row.cost_flat);
    return num(row.cost_per_day);
  }
  if (entity === "FoundationInventory") {
    if (row.material_type === "pole" && mode === "stock_price") return num(row.pole_stock_price);
    if (row.material_type === "wall_cap") return num(row.cap_stock_price || row.cost_per_unit);
    if (["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) {
      if (mode === "pickup_delivery") return num(row.pickup_delivery_cost);
      if (mode === "per_week") return num(row.cost_per_week);
      if (mode === "per_month") return num(row.cost_per_month);
      if (mode === "per_hour") return num(row.cost_per_hour);
      return num(row.cost_per_day || row.cost_per_unit);
    }
    return num(row.cost_per_unit);
  }
  return num(row.cost_per_unit ?? row.default_rate ?? row.cost_flat ?? row.cost_per_sheet, genericUnitCost(row));
}

async function loadCatalog(entity, sort = null) {
  try {
    const rows = sort
      ? await base44.entities[entity].list(sort, 500)
      : await base44.entities[entity].list();
    return rows || [];
  } catch {
    return [];
  }
}

export async function loadBuilderCatalogs(moduleKey) {
  const specs = {
    foundation: [
      ["FoundationInventory", "material_name"],
      ["LaborServiceInventory", "service_name"],
    ],
    channel_letters: [
      ["ChannelLetterInstallInventory", "sort_order"],
      ["ChannelLetterInstallEquipment", "sort_order"],
      ["DimensionalLetterMaterial", "sort_order"],
    ],
    vinyl: [
      ["VinylInventory", "vinyl_name"],
      ["VinylMachine", "sort_order"],
      ["LaborServiceInventory", "service_name"],
      ["ChannelLetterInstallEquipment", "sort_order"],
    ],
    metal: [["Inventory", "material_type"]],
    brick_stone: [["BrickStoneInventory", "material_name"]],
    maintenance: [
      ["MaintenanceInventory", "sort_order"],
      ["MaintenanceEquipment", "sort_order"],
    ],
  };

  const requested = specs[moduleKey] || [];
  const loaded = await Promise.all(
    requested.map(async ([entity, sort]) => [entity, await loadCatalog(entity, sort)])
  );
  const catalogs = {};
  loaded.forEach(([entity, rows]) => {
    const filtered = entity === "LaborServiceInventory" && moduleKey === "foundation"
      ? rows.filter((row) => row.service_category === "concrete_service")
      : rows;
    catalogs[entity] = {
      rows: filtered,
      byId: new Map(filtered.map((row) => [row.id, row])),
    };
  });
  return catalogs;
}

function findRow(catalogs, entity, id) {
  if (!id) return null;
  if (entity && catalogs[entity]?.byId.has(id)) return catalogs[entity].byId.get(id);
  for (const catalog of Object.values(catalogs)) {
    if (catalog.byId.has(id)) return catalog.byId.get(id);
  }
  return null;
}

function findEntity(catalogs, id, preferred = "") {
  if (!id) return preferred;
  if (preferred && catalogs[preferred]?.byId.has(id)) return preferred;
  return Object.entries(catalogs).find(([, catalog]) => catalog.byId.has(id))?.[0] || preferred;
}

function findNameCandidate(catalogs, entity, name) {
  const target = norm(name);
  if (!target || !catalogs[entity]) return null;
  return catalogs[entity].rows.find((row) => norm(rowName(entity, row)) === target) || null;
}

function makePart({
  key,
  name,
  type = "material",
  subtype = "",
  sourcePath = "",
  entity = "",
  inventoryId = "",
  quantity = 1,
  unit = "",
  unitCost = 0,
  extendedCost = 0,
  builderData = {},
  calculation = {},
  pricingBasis = {},
}) {
  return {
    part_key: key,
    part_name: name || type || "Part",
    part_type: type,
    part_subtype: subtype,
    source_path: sourcePath,
    inventory_entity: entity,
    inventory_item_id: inventoryId || "",
    quantity: num(quantity, 1),
    unit,
    unit_cost: num(unitCost),
    extended_cost: num(extendedCost),
    builder_data: builderData || {},
    calculation_snapshot: calculation || {},
    pricing_basis_snapshot: pricingBasis || {},
  };
}

function extractChannel(project) {
  const parts = [];
  (project.items || []).forEach((item, itemIndex) => {
    (item.materials || []).forEach((mat, matIndex) => {
      const id = mat.inventory_item_id || mat.inventory_id || "";
      parts.push(makePart({
        key: `channel:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || "Install material",
        type: "material",
        subtype: mat.pricing_mode || "install_material",
        sourcePath: mat.inventory_item_id
          ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id`
          : `items[${itemIndex}].materials[${matIndex}].inventory_id`,
        entity: "ChannelLetterInstallInventory",
        inventoryId: id,
        quantity: mat.quantity,
        unit: mat.pricing_mode || "",
        unitCost: mat.unit_cost,
        extendedCost: mat.total_cost,
        builderData: { parent_item: item.description, letter_size: item.letter_size, qty_letters: item.qty_letters },
        calculation: mat,
        pricingBasis: { pricing_mode: mat.pricing_mode, letter_size: item.letter_size },
      }));
    });
  });

  (project.selected_equipment || []).forEach((eq, index) => {
    parts.push(makePart({
      key: `channel:equipment:${index}`,
      name: eq.equipment_name || "Install equipment",
      type: "equipment",
      subtype: eq.equipment_type || eq.pricing_mode || "",
      sourcePath: `selected_equipment[${index}].equipment_id`,
      entity: "ChannelLetterInstallEquipment",
      inventoryId: eq.equipment_id,
      quantity: eq.duration || 1,
      unit: eq.pricing_mode || "",
      unitCost: eq.unit_cost,
      extendedCost: eq.total_cost,
      builderData: eq,
      calculation: { idle_cost: eq.idle_cost, total_cost: eq.total_cost },
      pricingBasis: { pricing_mode: eq.pricing_mode, duration: eq.duration, include_delivery: eq.include_delivery },
    }));
  });

  (project.letter_purchases || []).forEach((purchase, index) => {
    const materialId = purchase.fab_config?.material_id || purchase.backer_material_id || "";
    parts.push(makePart({
      key: `channel:letters:${purchase.id || index}`,
      name: purchase.description || purchase.letter_type || "Letter purchase / fabrication",
      type: purchase.letter_type === "dimensional_letters" ? "fabrication" : "material",
      subtype: purchase.letter_type || "letters",
      sourcePath: purchase.fab_config?.material_id
        ? `letter_purchases[${index}].fab_config.material_id`
        : purchase.backer_material_id
          ? `letter_purchases[${index}].backer_material_id`
          : `letter_purchases[${index}]`,
      entity: materialId ? "DimensionalLetterMaterial" : "",
      inventoryId: materialId,
      quantity: purchase.qty || 1,
      unit: "letter",
      unitCost: purchase.unit_cost,
      extendedCost: purchase.line_total ?? purchase.total_cost ?? purchase.letters_total,
      builderData: purchase,
      calculation: {
        letters_total: purchase.letters_total,
        raceway_total: purchase.raceway_total,
        backer_total: purchase.backer_total,
        total_cost: purchase.total_cost,
      },
      pricingBasis: {
        unit_cost_override: purchase.unit_cost_override,
        letters_total_override: purchase.letters_total_override,
        fab_config: purchase.fab_config,
      },
    }));
  });

  (project.items || []).forEach((item, index) => {
    if (num(item.labor_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `channel:item:${index}:labor`,
        name: item.description ? `${item.description} — Installation Labor` : "Installation Labor",
        type: "labor",
        subtype: "installation_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost },
      }));
    }
  });

  const letterFees = [
    ["delivery", "Letter Delivery / Freight", project.letters_delivery_fee],
    ["design", "Letter Design", project.letters_design_fee],
    ["install-supplies", "Letter Install Supplies", project.letters_install_supplies_fee],
    ["permitting", "Letter Permitting", project.letters_permitting_fee],
    ["other", "Other Letter Cost", project.letters_other_fee],
  ];
  letterFees.forEach(([key, name, cost]) => {
    if (num(cost) <= 0.005) return;
    parts.push(manualCostPart({
      key: `channel:letter-fee:${key}`,
      name,
      type: key === "permitting" ? "permit" : "service",
      subtype: `letter_${key}`,
      sourcePath: `letters_${key.replaceAll("-", "_")}_fee`,
      cost,
    }));
  });

  const letterMarkup = Math.max(0, num(project.total_letters_cost) - num(project.letters_subtotal));
  if (letterMarkup > 0.005) {
    parts.push(manualCostPart({
      key: "channel:letters-markup",
      name: "Letter Purchase Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "letters_markup_percent",
      cost: letterMarkup,
      calculation: { markup_percent: project.letters_markup_percent, markup_amount: letterMarkup },
    }));
  }

  if (num(project.total_supplies_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "channel:install-supplies",
      name: "Installation Consumables / Supplies",
      type: "consumable",
      subtype: "installation_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost },
    }));
  }

  (project.personnel || []).forEach((person, index) => {
    const cost = num(person.total_cost, num(person.hourly_rate) * num(person.hours));
    if (cost <= 0.005) return;
    parts.push(manualCostPart({
      key: `channel:personnel:${index}`,
      name: person.role || person.name || `Installer ${index + 1}`,
      type: "labor",
      subtype: "personnel",
      sourcePath: `personnel[${index}]`,
      cost,
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      builderData: person,
      calculation: person,
    }));
  });

  if (num(project.total_travel_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "channel:travel",
      name: "Travel / Mileage",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: project.total_travel_cost,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, rate: project.travel_cost_per_mile },
    }));
  }

  if (num(project.markup_amount) > 0.005) {
    parts.push(manualCostPart({
      key: "channel:project-markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount },
    }));
  }
  return parts;
}

function extractVinylLegacy(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (item.vinyl_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:vinyl`,
        name: item.description ? `${item.description} — Vinyl` : "Vinyl",
        type: "material",
        subtype: "vinyl",
        sourcePath: `items[${index}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: item.vinyl_id,
        quantity: item.vinyl_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.vinyl_sqft ? num(item.vinyl_cost) / num(item.vinyl_sqft, 1) : 0,
        extendedCost: item.vinyl_cost,
        builderData: item,
        calculation: { sqft: item.vinyl_sqft, cost: item.vinyl_cost },
      }));
    }
    if (item.laminate_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:laminate`,
        name: item.description ? `${item.description} — Laminate` : "Laminate",
        type: "material",
        subtype: "laminate",
        sourcePath: `items[${index}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: item.laminate_id,
        quantity: item.laminate_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.laminate_sqft ? num(item.laminate_cost) / num(item.laminate_sqft, 1) : 0,
        extendedCost: item.laminate_cost,
        builderData: item,
        calculation: { sqft: item.laminate_sqft, cost: item.laminate_cost },
      }));
    }
  });

  [
    ["printer_id", "Printer"],
    ["cutter_id", "Cutter"],
    ["laminator_id", "Laminator"],
  ].forEach(([field, label]) => {
    if (!project[field]) return;
    parts.push(makePart({
      key: `vinyl:machine:${field}`,
      name: label,
      type: "equipment",
      subtype: field.replace("_id", ""),
      sourcePath: field,
      entity: "VinylMachine",
      inventoryId: project[field],
      quantity: 1,
      builderData: { machine_id: project[field] },
    }));
  });

  (project.items || []).forEach((item, index) => {
    if (num(item.print_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:print`,
        name: item.description ? `${item.description} — Printing / Ink` : "Printing / Ink",
        type: "consumable",
        subtype: "printing",
        sourcePath: `items[${index}].print_cost`,
        cost: item.print_cost,
        quantity: item.print_sqft || 1,
        unit: item.print_sqft ? "sqft" : "job",
        builderData: item,
        calculation: { print_sqft: item.print_sqft, print_cost: item.print_cost, rate: project.print_cost_per_sqft },
      }));
    }
    if (num(item.labor_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:labor`,
        name: item.description ? `${item.description} — Production Labor` : "Vinyl Production Labor",
        type: "labor",
        subtype: "production_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost, rate: project.labor_rate_per_hour },
      }));
    }
  });

  if (num(project.total_supplies_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials },
    }));
  }
  // Legacy simplified projects save total_supplies_cost inclusive of extra_supplies_cost,
  // so do not materialize extra supplies a second time here.
  if (num(project.markup_amount) > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount },
    }));
  }
  return parts;
}

function extractVinyl(project, catalogs = {}) {
  const workflows = Array.isArray(project.workflows) ? project.workflows : [];
  if (!workflows.length) return extractVinylLegacy(project);

  const parts = [];
  let workflowMaterialTotal = 0;
  let workflowMachineTotal = 0;
  let workflowLaborTotal = 0;
  let workflowSetupTotal = 0;

  const addLinkedCost = ({
    key, name, type = "material", subtype = "", sourcePath = "", entity = "", inventoryId = "",
    quantity = 1, unit = "job", cost = 0, builderData = {}, calculation = {}, pricingBasis = {}, includeZero = false,
  }) => {
    const extended = num(cost);
    if (!includeZero && Math.abs(extended) <= 0.005) return;
    const qty = Math.max(num(quantity, 1), 0.000001);
    parts.push(makePart({
      key,
      name,
      type,
      subtype,
      sourcePath,
      entity,
      inventoryId,
      quantity: qty,
      unit,
      unitCost: extended / qty,
      extendedCost: extended,
      builderData,
      calculation,
      pricingBasis,
    }));
  };

  const laborInventoryFor = (row = {}) => {
    const savedId = row.inventory_id || row.labor_service_id || "";
    if (savedId) {
      const saved = findRow(catalogs, "LaborServiceInventory", savedId);
      if (saved) return saved;
    }
    return findNameCandidate(catalogs, "LaborServiceInventory", row.role || row.name || "");
  };

  workflows.forEach((workflow, workflowIndex) => {
    const prefix = `vinyl:workflow:${workflowIndex}`;
    const workflowName = workflow.name || `Workflow ${workflowIndex + 1}`;
    const printer = findRow(catalogs, "VinylMachine", workflow.printer_id);
    const cutter = findRow(catalogs, "VinylMachine", workflow.cutter_id);
    const laminator = findRow(catalogs, "VinylMachine", workflow.laminator_id);
    const vinyl = findRow(catalogs, "VinylInventory", workflow.vinyl_id);
    const laminate = findRow(catalogs, "VinylInventory", workflow.laminate_id);
    const transferTape = findRow(catalogs, "VinylInventory", workflow.transfer_tape_id);
    const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;

    const calc = calculateVinylProject({
      items: workflow.items || [],
      printer,
      cutter,
      laminator,
      vinyl,
      laminate,
      transferTape,
      operatorHourlyRate: operatorRate,
      applyPrint: !!workflow.apply_print,
      applyCut: !!workflow.apply_cut,
      applyLaminate: !!workflow.apply_laminate,
      applyTransferTape: !!workflow.apply_transfer_tape,
      overrideGutterH: workflow.gutter_h_override === "" || workflow.gutter_h_override == null ? undefined : num(workflow.gutter_h_override),
      overrideGutterV: workflow.gutter_v_override === "" || workflow.gutter_v_override == null ? undefined : num(workflow.gutter_v_override),
      printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: num(workflow.spoilage_buffer_percent),
      setupFeeFloor: num(workflow.setup_fee_floor),
    });

    workflowMaterialTotal += num(calc.materialCost);
    workflowMachineTotal += num(calc.machineCost);
    workflowLaborTotal += num(calc.laborCost);
    workflowSetupTotal += num(calc.setupFeeApplied);

    if (workflow.vinyl_id) {
      addLinkedCost({
        key: `${prefix}:vinyl`,
        name: `${workflowName} — Vinyl`,
        type: "material",
        subtype: "vinyl",
        sourcePath: `workflows[${workflowIndex}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: workflow.vinyl_id,
        quantity: calc.totalRollSqFtPulled || 1,
        unit: "sqft",
        cost: calc.vinylCost,
        includeZero: true,
        builderData: workflow,
        calculation: { total_roll_sqft_pulled: calc.totalRollSqFtPulled, used_sqft: calc.usedSqFt, wasted_sqft: calc.wastedSqFt, vinyl_cost: calc.vinylCost },
      });
    }

    if (workflow.apply_laminate && workflow.laminate_id) {
      addLinkedCost({
        key: `${prefix}:laminate`,
        name: `${workflowName} — Laminate`,
        type: "material",
        subtype: "laminate",
        sourcePath: `workflows[${workflowIndex}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: workflow.laminate_id,
        quantity: calc.laminateSqFt || 1,
        unit: "sqft",
        cost: calc.laminateCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_sqft: calc.laminateSqFt, laminate_cost: calc.laminateCost },
      });
    }

    if (workflow.apply_transfer_tape && workflow.transfer_tape_id) {
      addLinkedCost({
        key: `${prefix}:transfer-tape`,
        name: `${workflowName} — Transfer Tape`,
        type: "material",
        subtype: "transfer_tape",
        sourcePath: `workflows[${workflowIndex}].transfer_tape_id`,
        entity: "VinylInventory",
        inventoryId: workflow.transfer_tape_id,
        quantity: calc.transferTapeSqFt || 1,
        unit: "sqft",
        cost: calc.transferTapeCost,
        includeZero: true,
        builderData: workflow,
        calculation: { transfer_tape_sqft: calc.transferTapeSqFt, transfer_tape_cost: calc.transferTapeCost },
      });
    }

    if (workflow.apply_print && workflow.printer_id) {
      addLinkedCost({
        key: `${prefix}:ink`,
        name: `${workflowName} — Ink`,
        type: "consumable",
        subtype: "ink",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: calc.usedSqFt || 1,
        unit: "sqft",
        cost: calc.inkCost,
        builderData: workflow,
        calculation: { used_sqft: calc.usedSqFt, ink_rate_per_sqin: calc.inkRatePerSqIn, print_quality: calc.printQuality, ink_cost: calc.inkCost },
      });
      addLinkedCost({
        key: `${prefix}:printer-machine`,
        name: `${workflowName} — Printer Time`,
        type: "equipment",
        subtype: "printer",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: num(calc.printMinutes) / 60 || 1,
        unit: num(calc.printMinutes) > 0 ? "hour" : "job",
        cost: calc.printMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { print_minutes: calc.printMinutes, print_machine_cost: calc.printMachineCost },
      });
    }

    if (workflow.apply_cut && workflow.cutter_id) {
      addLinkedCost({
        key: `${prefix}:blade`,
        name: `${workflowName} — Blade Wear`,
        type: "consumable",
        subtype: "blade_wear",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num(calc.cutMinutes) || 1,
        unit: num(calc.cutMinutes) > 0 ? "minute" : "job",
        cost: calc.bladeCost,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_distance_inches: calc.cutDistanceIn, blade_cost: calc.bladeCost },
      });
      addLinkedCost({
        key: `${prefix}:cutter-machine`,
        name: `${workflowName} — Cutter Time`,
        type: "equipment",
        subtype: "cutter",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num(calc.cutMinutes) / 60 || 1,
        unit: num(calc.cutMinutes) > 0 ? "hour" : "job",
        cost: calc.cutMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_machine_cost: calc.cutMachineCost },
      });
    }

    if (workflow.apply_laminate && workflow.laminator_id) {
      addLinkedCost({
        key: `${prefix}:laminator-machine`,
        name: `${workflowName} — Laminator Time`,
        type: "equipment",
        subtype: "laminator",
        sourcePath: `workflows[${workflowIndex}].laminator_id`,
        entity: "VinylMachine",
        inventoryId: workflow.laminator_id,
        quantity: num(calc.laminateMinutes) / 60 || 1,
        unit: num(calc.laminateMinutes) > 0 ? "hour" : "job",
        cost: calc.laminateMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_minutes: calc.laminateMinutes, laminate_machine_cost: calc.laminateMachineCost },
      });
    }

    let workflowPersonnelTotal = 0;
    (workflow.personnel || []).forEach((person, personIndex) => {
      const personCost = num(person.total_cost, num(person.hourly_rate) * num(person.hours));
      if (Math.abs(personCost) <= 0.005) return;
      workflowPersonnelTotal += personCost;
      const inventoryRow = laborInventoryFor(person);
      addLinkedCost({
        key: `${prefix}:personnel:${personIndex}`,
        name: `${workflowName} — ${person.role || person.name || "Production Labor"}`,
        type: "labor",
        subtype: "workflow_personnel",
        sourcePath: `workflows[${workflowIndex}].personnel[${personIndex}].inventory_id`,
        entity: inventoryRow ? "LaborServiceInventory" : "",
        inventoryId: person.inventory_id || inventoryRow?.id || "",
        quantity: person.hours || 1,
        unit: person.hours ? "hour" : "job",
        cost: personCost,
        builderData: person,
        calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: personCost },
      });
    });

    const laborResidual = num(calc.laborCost) - workflowPersonnelTotal;
    if (laborResidual > 0.005) {
      parts.push(manualCostPart({
        key: `${prefix}:labor`,
        name: `${workflowName} — Production Labor`,
        type: "labor",
        subtype: "production_labor",
        sourcePath: `workflows[${workflowIndex}]`,
        cost: laborResidual,
        quantity: calc.laborHours || 1,
        unit: calc.laborHours ? "hour" : "job",
        builderData: workflow,
        calculation: { labor_hours: calc.laborHours, labor_cost: calc.laborCost, residual_cost: laborResidual },
      }));
    }

    if (num(calc.setupFeeApplied) > 0.005) {
      parts.push(manualCostPart({
        key: `${prefix}:setup-floor`,
        name: `${workflowName} — Setup Fee Floor`,
        type: "service",
        subtype: "setup_fee_floor",
        sourcePath: `workflows[${workflowIndex}].setup_fee_floor`,
        cost: calc.setupFeeApplied,
        builderData: workflow,
        calculation: { setup_fee_floor: workflow.setup_fee_floor, pre_floor_total: calc.preFloorTotal, setup_fee_applied: calc.setupFeeApplied },
      }));
    }
  });

  const baseSupplies = workflowMaterialTotal * (num(project.supplies_percent_of_materials) / 100);
  if (baseSupplies > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:base-supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "supplies_percent_of_materials",
      cost: baseSupplies,
      calculation: { supplies_percent: project.supplies_percent_of_materials, workflow_material_total: workflowMaterialTotal, base_supplies_cost: baseSupplies },
    }));
  }

  if (num(project.extra_supplies_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:extra-supplies",
      name: "Additional Vinyl Supplies",
      type: "consumable",
      subtype: "extra_supplies",
      sourcePath: "extra_supplies_cost",
      cost: project.extra_supplies_cost,
    }));
  }

  let equipmentTotal = 0;
  (project.selected_equipment || []).forEach((entry, index) => {
    const cost = num(entry.total_cost);
    equipmentTotal += cost;
    const inventoryId = entry.equipment_id || "";
    addLinkedCost({
      key: `vinyl:equipment:${index}`,
      name: entry.equipment_name || rowName("ChannelLetterInstallEquipment", findRow(catalogs, "ChannelLetterInstallEquipment", inventoryId)) || `Installation Equipment ${index + 1}`,
      type: "equipment",
      subtype: entry.equipment_type || "installation_equipment",
      sourcePath: `selected_equipment[${index}].equipment_id`,
      entity: "ChannelLetterInstallEquipment",
      inventoryId,
      quantity: entry.duration || 1,
      unit: entry.pricing_mode === "per_hour" ? "hour" : entry.pricing_mode === "per_week" ? "week" : entry.pricing_mode === "per_month" ? "month" : entry.pricing_mode === "per_day" ? "day" : "job",
      cost,
      includeZero: !!inventoryId,
      builderData: entry,
      calculation: entry,
    });
  });

  let projectPersonnelTotal = 0;
  (project.personnel || []).forEach((person, index) => {
    const cost = num(person.total_cost, num(person.hourly_rate) * num(person.hours));
    if (Math.abs(cost) <= 0.005) return;
    projectPersonnelTotal += cost;
    const inventoryRow = laborInventoryFor(person);
    addLinkedCost({
      key: `vinyl:installation-personnel:${index}`,
      name: person.name ? `${person.name} — ${person.role || "Installation Labor"}` : (person.role || "Installation Labor"),
      type: "labor",
      subtype: "installation_personnel",
      sourcePath: `personnel[${index}].inventory_id`,
      entity: inventoryRow ? "LaborServiceInventory" : "",
      inventoryId: person.inventory_id || inventoryRow?.id || "",
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      cost,
      builderData: person,
      calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost },
    });
  });

  const travelTotal = num(project.total_travel_cost);
  if (travelTotal > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:travel",
      name: "Travel / Fuel",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: travelTotal,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: travelTotal },
    }));
  }

  const suppliesTotal = baseSupplies + num(project.extra_supplies_cost);
  const subtotal = workflowMaterialTotal + workflowMachineTotal + workflowLaborTotal + workflowSetupTotal + equipmentTotal + projectPersonnelTotal + travelTotal + suppliesTotal;
  const markup = subtotal * (num(project.markup_percent) / 100);
  if (markup > 0.005) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_percent",
      cost: markup,
      calculation: { markup_percent: project.markup_percent, subtotal, markup_amount: markup },
    }));
  }

  return parts;
}

function extractMetal(project) {
  const parts = [];
  const represented = {
    material: 0,
    supplies: 0,
    fabrication: 0,
    welding: 0,
    finishing: 0,
  };

  (project.items || []).forEach((item, index) => {
    const itemQty = Math.max(num(item.quantity, 1), 0.000001);
    const lengthPerUnit = num(item.material_length_ft);
    const materialExtended = num(item.material_cost) * itemQty;
    represented.material += materialExtended;

    if (Math.abs(materialExtended) > 0.005 || item.inventory_item_id) {
      const linkedUsageQty = lengthPerUnit > 0 ? lengthPerUnit * itemQty : itemQty;
      const frozenMaterialUnitCost = lengthPerUnit > 0
        ? num(item.material_cost) / Math.max(lengthPerUnit, 0.000001)
        : num(item.material_cost);
      parts.push(makePart({
        key: `metal:item:${index}:material`,
        name: item.description ? `${item.description} — Metal Material` : (item.item_type || "Metal Material"),
        type: "material",
        subtype: item.item_type || "metal",
        sourcePath: `items[${index}].inventory_item_id`,
        entity: item.inventory_item_id ? "Inventory" : "",
        inventoryId: item.inventory_item_id || "",
        quantity: linkedUsageQty,
        unit: lengthPerUnit > 0 ? "source_unit" : "item",
        unitCost: frozenMaterialUnitCost,
        extendedCost: materialExtended,
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          material_length_per_unit: lengthPerUnit,
          material_cost_per_item: item.material_cost,
          total_material_cost: materialExtended,
        },
        pricingBasis: {
          pricing_mode: "legacy_cost_per_unit",
          material_length_ft_per_item: lengthPerUnit,
          item_quantity: itemQty,
        },
      }));
    }

    const suppliesExtended = num(item.supplies_cost) * itemQty;
    represented.supplies += suppliesExtended;
    if (Math.abs(suppliesExtended) > 0.005) {
      parts.push(manualCostPart({
        key: `metal:item:${index}:supplies`,
        name: item.description ? `${item.description} — Fabrication Consumables` : "Fabrication Consumables",
        type: "consumable",
        subtype: "supplies",
        sourcePath: `items[${index}].supplies_cost`,
        cost: suppliesExtended,
        quantity: itemQty,
        unit: "item",
        builderData: item,
        calculation: { item_quantity: itemQty, supplies_cost_per_item: item.supplies_cost, total_supplies_cost: suppliesExtended },
      }));
    }

    [
      ["fabrication", "Fabrication Labor", item.fabrication_cost, item.fabrication_hours],
      ["welding", "Welding Labor", item.welding_cost, item.welding_hours],
      ["finishing", "Finishing Labor", item.finishing_cost, item.finishing_hours],
    ].forEach(([key, label, perItemCost, hoursPerItem]) => {
      const extended = num(perItemCost) * itemQty;
      represented[key] += extended;
      if (Math.abs(extended) <= 0.005) return;
      const totalHours = num(hoursPerItem) * itemQty;
      parts.push(manualCostPart({
        key: `metal:item:${index}:${key}`,
        name: item.description ? `${item.description} — ${label}` : label,
        type: "labor",
        subtype: key,
        sourcePath: `items[${index}].${key}_cost`,
        cost: extended,
        quantity: totalHours || itemQty,
        unit: totalHours ? "hour" : "item",
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          hours_per_item: hoursPerItem,
          cost_per_item: perItemCost,
          total_cost: extended,
        },
      }));
    });
  });

  // Saved Git-era category totals are authoritative. Materialize only a balance
  // when a historical/imported record cannot be fully reconstructed from its
  // item-level snapshots. CCS-only supplies percentages/markup are intentionally
  // excluded from source-faithful Metal pricing.
  const authoritative = {
    material: project.total_material_cost == null ? represented.material : num(project.total_material_cost),
    supplies: project.total_supplies_cost == null ? represented.supplies : num(project.total_supplies_cost),
    fabrication: project.total_fabrication_cost == null ? represented.fabrication : num(project.total_fabrication_cost),
    welding: project.total_welding_cost == null ? represented.welding : num(project.total_welding_cost),
    finishing: project.total_finishing_cost == null ? represented.finishing : num(project.total_finishing_cost),
  };
  const labels = {
    material: ["Metal Material Adjustment", "material"],
    supplies: ["Metal Supplies Adjustment", "consumable"],
    fabrication: ["Fabrication Labor Adjustment", "labor"],
    welding: ["Welding Labor Adjustment", "labor"],
    finishing: ["Finishing Labor Adjustment", "labor"],
  };
  Object.keys(authoritative).forEach((key) => {
    const adjustment = authoritative[key] - represented[key];
    if (Math.abs(adjustment) <= 0.005) return;
    parts.push(manualCostPart({
      key: `metal:${key}-adjustment`,
      name: labels[key][0],
      type: labels[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: `total_${key}_cost`,
      cost: adjustment,
      calculation: {
        authoritative_total: authoritative[key],
        represented_total: represented[key],
        adjustment,
      },
    }));
  });

  return parts;
}

function extractBrick(project) {
  const parts = [];
  if (project.selected_material_id) {
    const qty = num(project.calculated_bricks, 1);
    parts.push(makePart({
      key: "brick:primary-material",
      name: project.material_name || "Brick / Stone Material",
      type: "material",
      subtype: "brick_stone",
      sourcePath: "selected_material_id",
      entity: "BrickStoneInventory",
      inventoryId: project.selected_material_id,
      quantity: qty,
      unit: "unit",
      unitCost: qty ? num(project.material_cost) / qty : 0,
      extendedCost: project.material_cost,
      builderData: {
        material_dimensions: project.material_dimensions,
        bricks_along_length: project.bricks_along_length,
        bricks_along_width: project.bricks_along_width,
        courses_high: project.courses_high,
        layers: project.layers,
      },
      calculation: {
        calculated_bricks: project.calculated_bricks,
        material_cost: project.material_cost,
      },
    }));
  }
  if (num(project.mortar_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "brick:mortar",
      name: "Mortar",
      type: "consumable",
      subtype: "mortar",
      sourcePath: "mortar_cost",
      cost: project.mortar_cost,
      quantity: project.mortar_bags_needed || 1,
      unit: project.mortar_bags_needed ? "bag" : "job",
      calculation: { mortar_bags_needed: project.mortar_bags_needed, mortar_bag_cost: project.mortar_bag_cost },
    }));
  }
  if (num(project.labor_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "brick:labor",
      name: "Masonry Labor",
      type: "labor",
      subtype: "masonry_labor",
      sourcePath: "labor_cost",
      cost: project.labor_cost,
      quantity: project.labor_hours || 1,
      unit: project.labor_hours ? "hour" : "job",
      calculation: { labor_hours: project.labor_hours, labor_rate_per_hour: project.labor_rate_per_hour },
    }));
  }
  if (num(project.markup_amount) > 0.005) {
    parts.push(manualCostPart({
      key: "brick:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount },
    }));
  }
  return parts;
}

function extractMaintenance(project, catalogs = {}) {
  const parts = [];
  const represented = { labor: 0, materials: 0, equipment: 0, personnel: 0, supplies: 0, travel: 0, markup: 0 };

  (project.items || []).forEach((item, itemIndex) => {
    let itemMaterialParts = 0;
    (item.materials || []).forEach((mat, matIndex) => {
      const id = mat.inventory_item_id || mat.inventory_id || "";
      const row = catalogs.MaintenanceInventory?.byId.get(id);
      const quantity = num(mat.quantity, 0);
      const unitCost = num(mat.unit_cost);
      const extendedCost = mat.total_cost == null ? quantity * unitCost : num(mat.total_cost);
      itemMaterialParts += extendedCost;
      represented.materials += extendedCost;
      if (Math.abs(extendedCost) <= 0.005 && !id) return;
      parts.push(makePart({
        key: `maintenance:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || row?.item_name || "Maintenance Material",
        type: "material",
        subtype: mat.pricing_mode || row?.pricing_mode || "maintenance_material",
        sourcePath: mat.inventory_item_id
          ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id`
          : mat.inventory_id
            ? `items[${itemIndex}].materials[${matIndex}].inventory_id`
            : `items[${itemIndex}].materials[${matIndex}]`,
        entity: id ? "MaintenanceInventory" : "",
        inventoryId: id,
        quantity: quantity || 1,
        unit: row?.unit || mat.unit || mat.pricing_mode || row?.pricing_mode || "unit",
        unitCost,
        extendedCost,
        builderData: { sign: item.description, sign_type: item.sign_type, size: item.size, actions: item.actions || [], material: mat },
        calculation: { ...mat, saved_total_cost: extendedCost },
        pricingBasis: { pricing_mode: mat.pricing_mode || row?.pricing_mode || "", size: item.size, sign_type: item.sign_type, actions: item.actions || [] },
      }));
    });

    const authoritativeItemMaterials = item.materials_cost == null ? itemMaterialParts : num(item.materials_cost);
    const itemMaterialAdjustment = authoritativeItemMaterials - itemMaterialParts;
    if (Math.abs(itemMaterialAdjustment) > 0.005) {
      const isRepaint = !!item.repaint_calc;
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:material-adjustment`,
        name: isRepaint ? `${item.description || "Monument"} — Repaint Paint Material` : `${item.description || `Service Item ${itemIndex + 1}`} — Material Adjustment`,
        type: "material",
        subtype: isRepaint ? "monument_repaint_paint" : "material_adjustment",
        sourcePath: `items[${itemIndex}].materials_cost`,
        cost: itemMaterialAdjustment,
        builderData: item,
        calculation: { authoritative_item_materials: authoritativeItemMaterials, inventory_materials: itemMaterialParts, repaint_calc: item.repaint_calc, adjustment: itemMaterialAdjustment },
      }));
      represented.materials += itemMaterialAdjustment;
    }

    const laborCost = num(item.labor_cost);
    represented.labor += laborCost;
    if (Math.abs(laborCost) > 0.005) {
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:labor`,
        name: `${item.description || `Service Item ${itemIndex + 1}`} — Maintenance Labor`,
        type: "labor",
        subtype: "maintenance_labor",
        sourcePath: `items[${itemIndex}].labor_cost`,
        cost: laborCost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: { sign_type: item.sign_type, size: item.size, qty: item.qty, actions: item.actions || [], repaint_calc: item.repaint_calc },
        calculation: { labor_hours: item.labor_hours, labor_cost: laborCost, actions: item.actions || [] },
      }));
    }
  });

  (project.selected_equipment || []).forEach((eq, index) => {
    const id = eq.equipment_id || eq.inventory_item_id || "";
    const duration = num(eq.duration, 1);
    const baseCost = num(eq.unit_cost) * duration;
    const deliveryCost = eq.include_delivery ? num(eq.delivery_pickup_cost) : 0;
    const idleCost = eq.idle_cost == null ? num(eq.idle_running_cost_per_hour) * num(eq.idle_hours) : num(eq.idle_cost);
    const reconstructed = baseCost + deliveryCost + idleCost;
    const authoritativeEquipment = eq.total_cost == null ? reconstructed : num(eq.total_cost);

    if (Math.abs(baseCost) > 0.005 || id) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:base`,
        name: eq.equipment_name || "Maintenance Equipment",
        type: "equipment",
        subtype: eq.equipment_type || "maintenance_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: id ? "MaintenanceEquipment" : "",
        inventoryId: id,
        quantity: duration || 1,
        unit: eq.pricing_mode || "unit",
        unitCost: eq.unit_cost,
        extendedCost: baseCost,
        builderData: eq,
        calculation: { duration, unit_cost: eq.unit_cost, base_cost: baseCost },
        pricingBasis: { pricing_mode: eq.pricing_mode || "" },
      }));
    }
    if (Math.abs(deliveryCost) > 0.005) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:delivery`,
        name: `${eq.equipment_name || "Equipment"} — Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].delivery_pickup_cost`,
        entity: id ? "MaintenanceEquipment" : "",
        inventoryId: id,
        quantity: 1,
        unit: "delivery",
        unitCost: deliveryCost,
        extendedCost: deliveryCost,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_pickup_cost: deliveryCost },
        pricingBasis: { pricing_mode: "delivery_pickup" },
      }));
    }
    if (Math.abs(idleCost) > 0.005) {
      const idleHours = num(eq.idle_hours, 1);
      parts.push(makePart({
        key: `maintenance:equipment:${index}:idle`,
        name: `${eq.equipment_name || "Equipment"} — Idle Running`,
        type: "equipment",
        subtype: "idle_running",
        sourcePath: `selected_equipment[${index}].idle_running_cost_per_hour`,
        entity: id ? "MaintenanceEquipment" : "",
        inventoryId: id,
        quantity: idleHours || 1,
        unit: "hour",
        unitCost: idleHours ? idleCost / idleHours : idleCost,
        extendedCost: idleCost,
        builderData: eq,
        calculation: { idle_hours: eq.idle_hours, idle_running_cost_per_hour: eq.idle_running_cost_per_hour, idle_cost: idleCost },
        pricingBasis: { pricing_mode: "idle_running" },
      }));
    }
    const equipmentAdjustment = authoritativeEquipment - reconstructed;
    if (Math.abs(equipmentAdjustment) > 0.005) {
      parts.push(manualCostPart({
        key: `maintenance:equipment:${index}:adjustment`,
        name: `${eq.equipment_name || "Equipment"} — Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].total_cost`,
        cost: equipmentAdjustment,
        builderData: eq,
        calculation: { authoritative_total: authoritativeEquipment, reconstructed_total: reconstructed, adjustment: equipmentAdjustment },
      }));
    }
    represented.equipment += authoritativeEquipment;
  });

  (project.personnel || []).forEach((person, index) => {
    const cost = person.total_cost == null ? num(person.hourly_rate) * num(person.hours) : num(person.total_cost);
    represented.personnel += cost;
    if (Math.abs(cost) <= 0.005) return;
    parts.push(manualCostPart({
      key: `maintenance:personnel:${index}`,
      name: `${person.name || person.role || `Crew Member ${index + 1}`} — Personnel`,
      type: "labor",
      subtype: (person.role || "personnel").toLowerCase().replace(/\s+/g, "_"),
      sourcePath: `personnel[${index}].total_cost`,
      cost,
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      builderData: person,
      calculation: { hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost },
    }));
  });

  const totalSupplies = num(project.total_supplies_cost);
  represented.supplies = totalSupplies;
  if (Math.abs(totalSupplies) > 0.005) {
    parts.push(manualCostPart({
      key: "maintenance:supplies",
      name: "Maintenance Consumables / Supplies",
      type: "consumable",
      subtype: "maintenance_supplies",
      sourcePath: "total_supplies_cost",
      cost: totalSupplies,
      calculation: { supplies_percent_of_materials: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost, total_materials_cost: project.total_materials_cost, total_supplies_cost: totalSupplies },
    }));
  }

  const totalTravel = num(project.total_travel_cost);
  represented.travel = totalTravel;
  if (Math.abs(totalTravel) > 0.005) {
    parts.push(manualCostPart({
      key: "maintenance:travel",
      name: "Travel / Mileage",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: totalTravel,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: totalTravel, site_address: project.site_address },
    }));
  }

  const totalMarkup = num(project.markup_amount);
  represented.markup = totalMarkup;
  if (Math.abs(totalMarkup) > 0.005) {
    parts.push(manualCostPart({
      key: "maintenance:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: totalMarkup,
      calculation: { markup_percent: project.markup_percent, subtotal: project.subtotal, markup_amount: totalMarkup },
    }));
  }

  const authoritativeCategories = {
    labor: project.labor_cost == null ? represented.labor : num(project.labor_cost),
    materials: project.total_materials_cost == null ? represented.materials : num(project.total_materials_cost),
    equipment: project.total_equipment_cost == null ? represented.equipment : num(project.total_equipment_cost),
    personnel: project.total_personnel_cost == null ? represented.personnel : num(project.total_personnel_cost),
  };
  const categoryMeta = { labor: ["Labor", "labor"], materials: ["Materials", "material"], equipment: ["Equipment", "equipment"], personnel: ["Personnel", "labor"] };
  Object.keys(authoritativeCategories).forEach((key) => {
    const adjustment = authoritativeCategories[key] - represented[key];
    if (Math.abs(adjustment) <= 0.005) return;
    parts.push(manualCostPart({
      key: `maintenance:${key}-adjustment`,
      name: `Maintenance ${categoryMeta[key][0]} Adjustment`,
      type: categoryMeta[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: key === "labor" ? "labor_cost" : `total_${key}_cost`,
      cost: adjustment,
      calculation: { authoritative_total: authoritativeCategories[key], represented_total: represented[key], adjustment },
    }));
    represented[key] = authoritativeCategories[key];
  });

  const reconstructedTotal = Object.values(represented).reduce((sum, value) => sum + num(value), 0);
  if (project.total_cost != null) {
    const finalAdjustment = num(project.total_cost) - reconstructedTotal;
    if (Math.abs(finalAdjustment) > 0.005) {
      parts.push(manualCostPart({
        key: "maintenance:project-total-adjustment",
        name: "Maintenance Saved Total Adjustment",
        type: "pricing",
        subtype: "project_total_adjustment",
        sourcePath: "total_cost",
        cost: finalAdjustment,
        calculation: { authoritative_total: project.total_cost, reconstructed_total: reconstructedTotal, adjustment: finalAdjustment },
      }));
    }
  }
  return parts;
}

function manualCostPart({ key, name, type = "labor", subtype = "", sourcePath = "", cost = 0, quantity = 1, unit = "job", builderData = {}, calculation = {} }) {
  const extended = num(cost);
  const qty = Math.max(num(quantity, 1), 0.000001);
  return makePart({
    key,
    name,
    type,
    subtype,
    sourcePath,
    quantity: qty,
    unit,
    unitCost: extended / qty,
    extendedCost: extended,
    builderData,
    calculation,
  });
}

function foundationEquipmentBreakdown(entry, catalogs) {
  const equipmentRow = catalogs.FoundationInventory?.byId.get(entry.equipment_id);
  if (!equipmentRow) return { baseRental: num(entry.equipment_cost), delivery: 0, attachmentCosts: [], subAttachmentCosts: [], total: num(entry.equipment_cost) };
  const rentalPeriod = entry.rental_period || "day";
  const duration = entry.custom_qty !== undefined && entry.custom_qty !== null
    ? num(entry.custom_qty, 1)
    : num(entry.rental_duration, 1);
  const rateFor = (row, override = undefined) => {
    if (override !== undefined && override !== null) return num(override) * duration;
    if (rentalPeriod === "day") return num(row?.cost_per_day) * duration;
    if (rentalPeriod === "week") return num(row?.cost_per_week) * duration;
    if (rentalPeriod === "month") return num(row?.cost_per_month) * duration;
    return 0;
  };

  const attachmentQty = new Map();
  if (entry.attachments?.length) {
    entry.attachments.forEach((attachment) => {
      const id = attachment.id || attachment.inventory_id || "";
      if (id) attachmentQty.set(id, num(attachment.qty, 1));
    });
  } else if (entry.attachment_counts) {
    Object.entries(entry.attachment_counts).forEach(([id, qty]) => attachmentQty.set(id, num(qty, 0)));
  } else if (entry.attachment_ids?.length) {
    entry.attachment_ids.forEach((id) => attachmentQty.set(id, 1));
  }

  const attachmentCosts = [...attachmentQty.entries()].map(([id, quantity]) => {
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry) => entry.quantity > 0);

  const subAttachmentCosts = Object.entries(entry.sub_attachment_counts || {}).map(([id, qty]) => {
    const quantity = num(qty, 0);
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry) => entry.quantity > 0);

  const baseRental = rateFor(equipmentRow, entry.custom_rate);
  const delivery = entry.include_delivery
    ? (entry.custom_delivery_charge !== undefined && entry.custom_delivery_charge !== null
        ? num(entry.custom_delivery_charge)
        : num(equipmentRow.pickup_delivery_cost))
    : 0;
  const total = baseRental + delivery +
    attachmentCosts.reduce((sum, item) => sum + item.cost, 0) +
    subAttachmentCosts.reduce((sum, item) => sum + item.cost, 0);
  return { baseRental, delivery, attachmentCosts, subAttachmentCosts, total };
}

function extractFoundation(project, catalogs) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    const concreteId = item.selected_concrete_id || project.selected_concrete_id || "";
    if (concreteId) {
      const entity = findEntity(catalogs, concreteId, "FoundationInventory");
      const concreteRow = findRow(catalogs, entity, concreteId);
      // Ready-mix concrete is charged at the project delivery/truck level below.
      // Bagged concrete is charged directly on the foundation item.
      if (concreteRow?.material_type === "bagged_concrete" || num(item.concrete_cost) > 0) {
        const qty = item.concrete_bags || item.concrete_volume_cy || item.quantity || 1;
        parts.push(makePart({
          key: `foundation:item:${index}:concrete`,
          name: item.description ? `${item.description} — Concrete` : "Concrete",
          type: "material",
          subtype: concreteRow?.material_type || "concrete",
          sourcePath: `items[${index}].selected_concrete_id`,
          entity,
          inventoryId: concreteId,
          quantity: qty,
          unit: concreteRow?.material_type === "bagged_concrete" ? "bag" : "cy",
          unitCost: item.concrete_rate ?? item.custom_concrete_cost_per_cy,
          extendedCost: item.concrete_cost,
          builderData: item,
          calculation: { concrete_bags: item.concrete_bags, concrete_volume_cy: item.concrete_volume_cy, concrete_cost: item.concrete_cost },
          pricingBasis: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures },
        }));
      }
    }

    if (item.include_rebar) {
      const size = item.foundation_type === "pillar" ? (item.pillar_rebar_size || "#4") : (item.rebar_size || "#4");
      const rebarRow = catalogs.FoundationInventory?.rows.find(
        (row) => row.material_type === "rebar" && row.rebar_size === size
      );
      const rebarRate = num(item.rebar_rate, num(item.custom_rebar_cost_per_ft, genericUnitCost(rebarRow)));
      const rebarFeet = num(item.rebar_feet);
      const totalRebarCost = num(item.rebar_cost);
      const rebarMaterialCost = rebarFeet > 0 && rebarRate > 0
        ? Math.min(totalRebarCost, rebarFeet * rebarRate)
        : totalRebarCost;
      const rebarLaborCost = Math.max(0, totalRebarCost - rebarMaterialCost);
      parts.push(makePart({
        key: `foundation:item:${index}:rebar`,
        name: `${size} Rebar`,
        type: "material",
        subtype: "rebar",
        sourcePath: `items[${index}].${item.foundation_type === "pillar" ? "pillar_rebar_size" : "rebar_size"}`,
        entity: "FoundationInventory",
        inventoryId: rebarRow?.id || "",
        quantity: rebarFeet || 1,
        unit: "ft",
        unitCost: rebarRate,
        extendedCost: rebarMaterialCost,
        builderData: item,
        calculation: { rebar_cost: totalRebarCost, rebar_material_cost: rebarMaterialCost, rebar_labor_cost: rebarLaborCost, rebar_feet: rebarFeet },
      }));
      if (rebarLaborCost > 0.005) {
        parts.push(manualCostPart({
          key: `foundation:item:${index}:rebar-labor`,
          name: item.description ? `${item.description} — Rebar Labor` : "Rebar Labor",
          type: "labor",
          subtype: "rebar_labor",
          sourcePath: `items[${index}].rebar_cost`,
          cost: rebarLaborCost,
          builderData: item,
          calculation: { total_rebar_cost: totalRebarCost, material_cost: rebarMaterialCost, labor_cost: rebarLaborCost },
        }));
      }
    }

    if (item.include_forming) {
      const formingRow = item.selected_forming_id
        ? catalogs.FoundationInventory?.byId.get(item.selected_forming_id)
        : null;
      const formingQty = num(item.forming_qty, 1);
      const formingRate = num(item.forming_rate, num(item.custom_forming_rate, genericUnitCost(formingRow)));
      const totalFormingCost = num(item.forming_cost);
      const formingMaterialCost = item.selected_forming_id
        ? Math.min(totalFormingCost, formingQty * formingRate)
        : 0;
      const formingLaborCost = Math.max(0, totalFormingCost - formingMaterialCost);
      if (item.selected_forming_id) {
        parts.push(makePart({
          key: `foundation:item:${index}:forming`,
          name: item.description ? `${item.description} — Forming Material` : "Forming Material",
          type: "material",
          subtype: "forming",
          sourcePath: `items[${index}].selected_forming_id`,
          entity: "FoundationInventory",
          inventoryId: item.selected_forming_id,
          quantity: formingQty,
          unit: "piece",
          unitCost: formingRate,
          extendedCost: formingMaterialCost,
          builderData: item,
          calculation: { forming_cost: totalFormingCost, material_cost: formingMaterialCost, forming_qty: formingQty },
        }));
      }
      if (formingLaborCost > 0.005) {
        parts.push(manualCostPart({
          key: `foundation:item:${index}:forming-labor`,
          name: item.description ? `${item.description} — Forming Labor / Allowance` : "Forming Labor / Allowance",
          type: "labor",
          subtype: "forming_labor",
          sourcePath: `items[${index}].forming_cost`,
          cost: formingLaborCost,
          builderData: item,
          calculation: { total_forming_cost: totalFormingCost, material_cost: formingMaterialCost, labor_allowance_cost: formingLaborCost },
        }));
      }
    }

    if (num(item.excavation_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:excavation`,
        name: item.description ? `${item.description} — Excavation` : "Excavation Labor",
        type: "labor",
        subtype: item.excavation_method || "excavation",
        sourcePath: `items[${index}].excavation_cost`,
        cost: item.excavation_cost,
        quantity: item.excavation_hours || 1,
        unit: item.excavation_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.excavation_hours, rate: item.excavation_rate, cost: item.excavation_cost },
      }));
    }
    if (num(item.pouring_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:pouring`,
        name: item.description ? `${item.description} — Concrete Pour Labor` : "Concrete Pour Labor",
        type: "labor",
        subtype: "concrete_pouring",
        sourcePath: `items[${index}].pouring_cost`,
        cost: item.pouring_cost,
        quantity: item.concrete_volume_cy || 1,
        unit: "cy",
        builderData: item,
        calculation: { concrete_volume_cy: item.concrete_volume_cy, cost: item.pouring_cost },
      }));
    }
    if (num(item.finishing_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:finishing`,
        name: item.description ? `${item.description} — Concrete Finishing` : "Concrete Finishing Labor",
        type: "labor",
        subtype: "concrete_finishing",
        sourcePath: `items[${index}].finishing_cost`,
        cost: item.finishing_cost,
        quantity: item.finishing_hours || 1,
        unit: item.finishing_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.finishing_hours, rate: item.finishing_rate, cost: item.finishing_cost },
      }));
    }
  });

  const delivery = project.builder_calculation?.delivery || {};
  const itemConcreteCost = (project.items || []).reduce((sum, item) => sum + num(item.concrete_cost), 0);
  const fallbackDeliveryCost = Math.max(0, num(project.total_concrete_cost) - itemConcreteCost);
  const deliveryCost = num(delivery.concreteTotal, fallbackDeliveryCost);
  if (deliveryCost > 0.005) {
    const concreteId = (project.items || []).map((item) => item.selected_concrete_id).find(Boolean) || project.selected_concrete_id || "";
    const entity = findEntity(catalogs, concreteId, "LaborServiceInventory");
    parts.push(makePart({
      key: "foundation:concrete-delivery",
      name: "Ready-Mix Concrete Delivery",
      type: "material",
      subtype: "ready_mix_concrete",
      sourcePath: "builder_calculation.delivery",
      entity,
      inventoryId: concreteId,
      quantity: delivery.roundedYards || 1,
      unit: "cy",
      unitCost: delivery.ratePerYard,
      extendedCost: deliveryCost,
      builderData: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
      calculation: delivery,
      pricingBasis: { mix: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
    }));
  }

  (project.walls || []).forEach((wall, index) => {
    if (wall.materialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:outer`,
        name: wall.name ? `${wall.name} — Outer wall` : "Wall material",
        type: "material",
        subtype: "wall_material",
        sourcePath: `walls[${index}].materialId`,
        entity: "FoundationInventory",
        inventoryId: wall.materialId,
        quantity: wall.calculatedCosts?.totalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.materialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {},
      }));
    }
    if (wall.internalMaterialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:internal`,
        name: wall.name ? `${wall.name} — Internal wall` : "Internal wall material",
        type: "material",
        subtype: "wall_fill",
        sourcePath: `walls[${index}].internalMaterialId`,
        entity: "FoundationInventory",
        inventoryId: wall.internalMaterialId,
        quantity: wall.calculatedCosts?.internalTotalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.internalMaterialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {},
      }));
    }
    if (num(wall.calculatedCosts?.mortarCost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:mortar`,
        name: wall.name ? `${wall.name} — Mortar` : "Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.mortarCost`,
        cost: wall.calculatedCosts.mortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts,
      }));
    }
    if (num(wall.calculatedCosts?.laborCost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:labor`,
        name: wall.name ? `${wall.name} — Masonry Labor` : "Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.laborCost`,
        cost: wall.calculatedCosts.laborCost,
        quantity: wall.calculatedCosts.laborHours || 1,
        unit: wall.calculatedCosts.laborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts,
      }));
    }
    if (num(wall.calculatedCosts?.internalMortarCost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-mortar`,
        name: wall.name ? `${wall.name} — Internal Mortar` : "Internal Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.internalMortarCost`,
        cost: wall.calculatedCosts.internalMortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts,
      }));
    }
    if (num(wall.calculatedCosts?.internalLaborCost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-labor`,
        name: wall.name ? `${wall.name} — Internal Masonry Labor` : "Internal Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.internalLaborCost`,
        cost: wall.calculatedCosts.internalLaborCost,
        quantity: wall.calculatedCosts.internalLaborHours || 1,
        unit: wall.calculatedCosts.internalLaborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts,
      }));
    }
  });

  (project.poles || []).forEach((pole, index) => {
    if (!pole.pole_id) return;
    const poleQtyFt = (num(pole.height_inches) + num(pole.y_offset_inches)) / 12 || 1;
    parts.push(makePart({
      key: `foundation:pole:${index}`,
      name: pole.pole_name || "Sign Pole",
      type: "material",
      subtype: "pole",
      sourcePath: `poles[${index}].pole_id`,
      entity: "FoundationInventory",
      inventoryId: pole.pole_id,
      quantity: poleQtyFt,
      unit: "ft",
      unitCost: num(pole.pole_cost) / poleQtyFt,
      extendedCost: pole.pole_cost,
      builderData: pole,
      calculation: pole,
    }));
    if (num(pole.pole_painting_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `foundation:pole:${index}:painting`,
        name: `${pole.pole_name || "Sign Pole"} — Painting`,
        type: "labor",
        subtype: "pole_painting",
        sourcePath: `poles[${index}].pole_painting_cost`,
        cost: pole.pole_painting_cost,
        quantity: poleQtyFt,
        unit: "ft",
        builderData: pole,
        calculation: pole,
      }));
    }
  });

  (project.wall_caps || []).forEach((cap, index) => {
    if (!cap.cap_inventory_id) return;
    parts.push(makePart({
      key: `foundation:cap:${cap.id || index}`,
      name: "Wall cap",
      type: "material",
      subtype: "wall_cap",
      sourcePath: `wall_caps[${index}].cap_inventory_id`,
      entity: "FoundationInventory",
      inventoryId: cap.cap_inventory_id,
      quantity: 1,
      unit: "stock_piece",
      unitCost: cap.cost,
      extendedCost: cap.cost,
      builderData: cap,
      calculation: cap,
    }));
  });

  (project.selected_equipment || []).forEach((eq, index) => {
    const breakdown = foundationEquipmentBreakdown(eq, catalogs);
    if (eq.equipment_id) {
      const equipmentRow = catalogs.FoundationInventory?.byId.get(eq.equipment_id);
      const qty = eq.custom_qty ?? eq.rental_duration ?? 1;
      parts.push(makePart({
        key: `foundation:equipment:${index}`,
        name: equipmentRow?.material_name || "Foundation Equipment",
        type: "equipment",
        subtype: "excavation_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: qty,
        unit: eq.rental_period || "day",
        unitCost: num(breakdown.baseCost) / Math.max(num(qty, 1), 1),
        extendedCost: breakdown.baseCost,
        builderData: eq,
        calculation: { ...eq, equipment_total_with_attachments: eq.equipment_cost, base_equipment_cost: breakdown.baseCost },
      }));
    }
    breakdown.attachmentCosts.forEach((entry, attachmentIndex) => {
      if (!entry.id) return;
      parts.push(makePart({
        key: `foundation:equipment:${index}:attachment:${attachmentIndex}`,
        name: entry.row?.material_name || entry.attachment.name || "Equipment Attachment",
        type: "equipment",
        subtype: entry.row?.material_type || "attachment",
        sourcePath: `selected_equipment[${index}].attachments[${attachmentIndex}].id`,
        entity: "FoundationInventory",
        inventoryId: entry.id,
        quantity: entry.quantity,
        unit: eq.rental_period || "day",
        unitCost: entry.quantity ? entry.cost / entry.quantity : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, total_cost: entry.cost },
      }));
    });
  });

  (project.signage_cabinets || []).forEach((cabinet, index) => {
    parts.push(makePart({
      key: `foundation:cabinet:${cabinet.id || index}`,
      name: cabinet.description || "Signage Cabinet",
      type: "fabrication",
      subtype: "signage_cabinet",
      sourcePath: `signage_cabinets[${index}]`,
      quantity: cabinet.quantity || 1,
      unit: "each",
      unitCost: cabinet.unit_cost,
      extendedCost: num(cabinet.unit_cost) * num(cabinet.quantity, 1),
      builderData: cabinet,
      calculation: cabinet,
    }));
  });
  if (num(project.builder_calculation?.landscape_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "foundation:landscape",
      name: "Landscape Materials",
      type: "material",
      subtype: "landscape",
      sourcePath: "builder_calculation.landscape_cost",
      cost: project.builder_calculation.landscape_cost,
      builderData: project.landscape || {},
      calculation: { total_cost: project.builder_calculation.landscape_cost },
    }));
  }
  return parts;
}

function extractCNC(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (num(item.machine_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:machine`,
        name: item.description ? `${item.description} — CNC Machine Time` : "CNC Machine Time",
        type: "equipment",
        subtype: "cnc_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost, rate: project.machine_rate_per_hour },
      }));
    }
    if (num(item.labor_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:labor`,
        name: item.description ? `${item.description} — CNC Setup / Handling Labor` : "CNC Setup / Handling Labor",
        type: "labor",
        subtype: "cnc_setup_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.setup_time_hours || 1,
        unit: item.setup_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { setup_time_hours: item.setup_time_hours, labor_cost: item.labor_cost, rate: project.labor_rate, hold_down: item.hold_down },
      }));
    }
  });
  const dynamicItemLabor = (project.items || []).reduce((sum, item) => sum + num(item.labor_cost), 0);
  const fixedSetupCost = num(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num(project.fixed_setup_hours) * num(project.labor_rate)
  );
  if (fixedSetupCost > 0.005) {
    parts.push(manualCostPart({
      key: "cnc:fixed-setup",
      name: "CNC Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost },
    }));
  }

  // SignEstimate Pro applies min_cnc_labor_hours to the dynamic item setup labor.
  // The saved total_labor_cost is authoritative, so materialize only the balance
  // not already represented by item labor + fixed setup. This survives normal
  // reopen/sync without needing transient builder_calculation data.
  const authoritativeLaborTotal = num(
    project.total_labor_cost,
    num(project.builder_calculation?.totals?.total_labor_cost, dynamicItemLabor + fixedSetupCost)
  );
  const minimumLaborAdjustment = authoritativeLaborTotal - dynamicItemLabor - fixedSetupCost;
  if (Math.abs(minimumLaborAdjustment) > 0.005) {
    parts.push(manualCostPart({
      key: "cnc:minimum-dynamic-labor-adjustment",
      name: minimumLaborAdjustment > 0 ? "CNC Minimum Dynamic Labor" : "CNC Labor Adjustment",
      type: "labor",
      subtype: "minimum_dynamic_labor",
      sourcePath: "total_labor_cost",
      cost: minimumLaborAdjustment,
      quantity: 1,
      unit: "job",
      calculation: {
        total_labor_cost: authoritativeLaborTotal,
        item_labor_cost: dynamicItemLabor,
        fixed_setup_cost: fixedSetupCost,
        minimum_dynamic_labor_adjustment: minimumLaborAdjustment,
      },
    }));
  }
  return parts;
}

function extractLaser(project) {
  const parts = [];
  let itemMachineTotal = 0;
  let itemLaborTotal = 0;
  (project.items || []).forEach((item, index) => {
    itemMachineTotal += num(item.machine_cost);
    itemLaborTotal += num(item.labor_cost);
    if (num(item.machine_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:machine`,
        name: item.description ? `${item.description} — Laser Machine Time` : "Laser Machine Time",
        type: "equipment",
        subtype: "laser_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { engrave_hours: item.engrave_hours, cut_hours: item.cut_hours, machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost },
      }));
    }
    if (num(item.labor_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:labor`,
        name: item.description ? `${item.description} — Laser Handling Labor` : "Laser Handling Labor",
        type: "labor",
        subtype: "laser_handling_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.handling_time_hours || 1,
        unit: item.handling_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { handling_time_hours: item.handling_time_hours, labor_cost: item.labor_cost },
      }));
    }
  });
  const fixedSetupCost = num(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num(project.fixed_setup_hours) * num(project.labor_rate)
  );
  if (fixedSetupCost > 0.005) {
    parts.push(manualCostPart({
      key: "laser:fixed-setup",
      name: "Laser Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost },
    }));
  }

  const authoritativeMachineTotal = num(
    project.total_machine_cost,
    num(project.builder_calculation?.totals?.total_machine_cost, itemMachineTotal)
  );
  const machineAdjustment = authoritativeMachineTotal - itemMachineTotal;
  if (Math.abs(machineAdjustment) > 0.005) {
    parts.push(manualCostPart({
      key: "laser:machine-adjustment",
      name: "Laser Machine Cost Adjustment",
      type: "equipment",
      subtype: "machine_adjustment",
      sourcePath: "total_machine_cost",
      cost: machineAdjustment,
      calculation: { total_machine_cost: authoritativeMachineTotal, item_machine_cost: itemMachineTotal, adjustment: machineAdjustment },
    }));
  }

  const authoritativeLaborTotal = num(
    project.total_labor_cost,
    num(project.builder_calculation?.totals?.total_labor_cost, itemLaborTotal + fixedSetupCost)
  );
  const laborAdjustment = authoritativeLaborTotal - itemLaborTotal - fixedSetupCost;
  if (Math.abs(laborAdjustment) > 0.005) {
    parts.push(manualCostPart({
      key: "laser:labor-adjustment",
      name: "Laser Labor Adjustment",
      type: "labor",
      subtype: "labor_adjustment",
      sourcePath: "total_labor_cost",
      cost: laborAdjustment,
      calculation: { total_labor_cost: authoritativeLaborTotal, item_labor_cost: itemLaborTotal, fixed_setup_cost: fixedSetupCost, adjustment: laborAdjustment },
    }));
  }

  const authoritativeSupplies = num(
    project.total_supplies_cost,
    num(project.fixed_material_setup_cost, project.builder_calculation?.totals?.total_supplies_cost)
  );
  if (Math.abs(authoritativeSupplies) > 0.005) {
    parts.push(manualCostPart({
      key: "laser:fixed-material-setup",
      name: "Laser Material Setup / Consumables",
      type: "consumable",
      subtype: "material_setup",
      sourcePath: "total_supplies_cost",
      cost: authoritativeSupplies,
      calculation: { fixed_material_setup_cost: project.fixed_material_setup_cost, total_supplies_cost: authoritativeSupplies },
    }));
  }
  return parts;
}

function extractManualItems(project, moduleKey) {
  return (project.items || []).map((item, index) => makePart({
    key: `${moduleKey}:item:${index}`,
    name: item.description || `${moduleKey.toUpperCase()} item ${index + 1}`,
    type: "fabrication",
    subtype: item.item_type || moduleKey,
    sourcePath: `items[${index}]`,
    quantity: item.quantity || 1,
    unit: "item",
    unitCost: item.quantity ? num(item.item_total_cost) / num(item.quantity, 1) : 0,
    extendedCost: item.item_total_cost,
    builderData: item,
    calculation: item,
  }));
}

export function extractBuilderParts(moduleKey, project, catalogs = {}) {
  if (!project) return [];
  switch (moduleKey) {
    case "foundation": return extractFoundation(project, catalogs);
    case "channel_letters": return extractChannel(project);
    case "vinyl": return extractVinyl(project, catalogs);
    case "metal": return extractMetal(project);
    case "brick_stone": return extractBrick(project);
    case "maintenance": return extractMaintenance(project, catalogs);
    case "cnc": return extractCNC(project);
    case "laser": return extractLaser(project);
    default: return extractManualItems(project, moduleKey || "legacy");
  }
}

function effectiveCurrentUnitCost(descriptor, row) {
  if (Number.isFinite(Number(descriptor.unit_cost)) && Number(descriptor.unit_cost) !== 0) {
    return Number(descriptor.unit_cost);
  }
  return genericUnitCost(row);
}

export async function syncBuilderParts({ builderProduct, sourceProject, acceptPrices = false, legacyMode = false }) {
  if (!builderProduct?.id || !sourceProject) {
    return { partCount: 0, detachedCount: 0, changedCount: 0, manualAddonFrozenTotal: 0, manualAddonCurrentTotal: 0, parts: [] };
  }

  const catalogs = await loadBuilderCatalogs(builderProduct.module_key);
  const descriptors = extractBuilderParts(builderProduct.module_key, sourceProject, catalogs);
  const existing = await base44.entities.BuilderPart.filter({ builder_product_id: builderProduct.id });
  const byKey = new Map((existing || []).map((part) => [part.part_key, part]));
  const seen = new Set();
  const synced = [];
  let detachedCount = 0;
  let changedCount = 0;

  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    seen.add(descriptor.part_key);
    const old = byKey.get(descriptor.part_key);
    const resolvedEntity = findEntity(catalogs, descriptor.inventory_item_id, descriptor.inventory_entity);

    // Intentional Builder overrides are independent frozen Parts. Preserve the
    // override instead of allowing a Builder save to regenerate its values.
    if (old?.builder_sync_state === "detached_override") {
      const currentRow = findRow(catalogs, old.inventory_entity || resolvedEntity, old.inventory_item_id || descriptor.inventory_item_id);
      const candidateId = descriptor.inventory_item_id || old.inventory_item_id || old.original_inventory_item_id || "";
      const candidateEntity = findEntity(catalogs, candidateId, old.inventory_entity || resolvedEntity);
      const candidateRow = findRow(catalogs, candidateEntity, candidateId);
      const patch = {
        inventory_link_state: currentRow ? "attached" : old.inventory_link_state,
        current_inventory_snapshot: currentRow || old.current_inventory_snapshot || {},
        reattach_candidate_id: candidateId,
        reattach_candidate_name: rowName(candidateEntity, candidateRow) || old.inventory_item_name || descriptor.part_name,
        price_state: "detached",
        last_price_check_at: nowIso(),
        is_active: true,
      };
      await base44.entities.BuilderPart.update(old.id, patch);
      detachedCount += 1;
      synced.push({ ...old, ...patch });
      continue;
    }
    const currentRow = findRow(catalogs, resolvedEntity, descriptor.inventory_item_id);
    const currentName = rowName(resolvedEntity, currentRow) || descriptor.part_name;
    const oldFrozenName = old?.inventory_item_name || rowName(old?.inventory_entity, old?.frozen_inventory_snapshot) || descriptor.part_name;
    const candidate = !currentRow && oldFrozenName
      ? findNameCandidate(catalogs, old?.inventory_entity || resolvedEntity, oldFrozenName)
      : null;
    const hasInventoryLink = !!descriptor.inventory_item_id || !!old?.inventory_item_id || !!old?.original_inventory_item_id;
    const detached = hasInventoryLink && !currentRow;
    const currentPricing = pricingSnapshot(currentRow);
    const frozenPricing = pricingSnapshot(old?.frozen_inventory_snapshot);
    const linkChanged = !!old && !!descriptor.inventory_item_id && descriptor.inventory_item_id !== (old.inventory_item_id || old.original_inventory_item_id);
    const pricingChanged = !!old && !!currentRow && !same(currentPricing, frozenPricing);
    const changed = linkChanged || pricingChanged;
    const currentUnitCost = effectiveCurrentUnitCost(descriptor, currentRow);
    const currentExtended = num(descriptor.extended_cost);
    const timestamp = nowIso();

    let linkState = "manual";
    if (hasInventoryLink) {
      if (currentRow) linkState = "attached";
      else if (candidate) linkState = "reattach_available";
      else linkState = "detached";
    }

    if (detached) detachedCount += 1;
    if (changed) changedCount += 1;

    if (!old) {
      const created = await base44.entities.BuilderPart.create({
        builder_product_id: builderProduct.id,
        part_key: descriptor.part_key,
        sort_order: index,
        part_name: descriptor.part_name,
        part_type: descriptor.part_type,
        part_subtype: descriptor.part_subtype,
        source_module_key: builderProduct.module_key,
        source_path: descriptor.source_path,
        builder_sync_state: "linked",
        inventory_entity: resolvedEntity,
        inventory_item_id: descriptor.inventory_item_id,
        original_inventory_item_id: descriptor.inventory_item_id,
        inventory_item_name: currentName,
        inventory_link_state: linkState,
        reattach_candidate_id: candidate?.id || "",
        reattach_candidate_name: candidate ? rowName(old?.inventory_entity || resolvedEntity, candidate) : "",
        frozen_inventory_snapshot: currentRow || {},
        current_inventory_snapshot: currentRow || {},
        builder_data: descriptor.builder_data,
        calculation_snapshot: descriptor.calculation_snapshot,
        pricing_basis_snapshot: {
          ...descriptor.pricing_basis_snapshot,
          inventory_pricing: currentPricing,
        },
        quantity: descriptor.quantity,
        unit: descriptor.unit,
        frozen_unit_cost: descriptor.unit_cost || currentUnitCost,
        frozen_extended_cost: descriptor.extended_cost,
        current_unit_cost: currentUnitCost,
        current_extended_cost: currentExtended,
        price_state: legacyMode ? "legacy_frozen" : detached ? "detached" : "current",
        price_delta: 0,
        price_delta_percent: 0,
        inventory_updated_date_snapshot: currentRow?.updated_date || "",
        last_price_check_at: timestamp,
        last_price_update_at: acceptPrices ? timestamp : "",
        manual_cost_override: !hasInventoryLink,
        manual_cost: !hasInventoryLink ? descriptor.extended_cost : undefined,
        is_active: true,
        notes: legacyMode
          ? "Backfilled from an existing Builder Product. Saved estimator costs remain authoritative; catalog snapshot is compatibility context."
          : "",
      });
      synced.push(created);
      continue;
    }

    const shouldAccept = acceptPrices && !detached;
    const frozenUnit = shouldAccept ? currentUnitCost : num(old.frozen_unit_cost, descriptor.unit_cost || currentUnitCost);
    const frozenExtended = shouldAccept ? currentExtended : num(old.frozen_extended_cost, descriptor.extended_cost);
    const state = detached
      ? "detached"
      : legacyMode || old.price_state === "legacy_frozen"
        ? "legacy_frozen"
        : changed || Math.abs(currentExtended - frozenExtended) > 0.005
          ? "changed"
          : "current";

    const patch = {
      sort_order: index,
      part_name: descriptor.part_name,
      part_type: descriptor.part_type,
      part_subtype: descriptor.part_subtype,
      source_module_key: builderProduct.module_key,
      source_path: descriptor.source_path,
      inventory_entity: resolvedEntity || old.inventory_entity,
      inventory_item_id: descriptor.inventory_item_id,
      inventory_item_name: currentName || old.inventory_item_name,
      inventory_link_state: linkState,
      reattach_candidate_id: candidate?.id || "",
      reattach_candidate_name: candidate ? rowName(old.inventory_entity || resolvedEntity, candidate) : "",
      current_inventory_snapshot: currentRow || {},
      builder_data: descriptor.builder_data,
      calculation_snapshot: descriptor.calculation_snapshot,
      pricing_basis_snapshot: {
        ...descriptor.pricing_basis_snapshot,
        inventory_pricing: currentPricing,
      },
      quantity: descriptor.quantity,
      unit: descriptor.unit,
      current_unit_cost: currentUnitCost,
      current_extended_cost: currentExtended,
      price_state: shouldAccept ? "current" : state,
      price_delta: currentExtended - frozenExtended,
      price_delta_percent: frozenExtended ? ((currentExtended - frozenExtended) / frozenExtended) * 100 : 0,
      last_price_check_at: timestamp,
      is_active: true,
    };

    if (shouldAccept) {
      patch.frozen_inventory_snapshot = currentRow || old.frozen_inventory_snapshot || {};
      patch.frozen_unit_cost = frozenUnit;
      patch.frozen_extended_cost = frozenExtended;
      patch.inventory_updated_date_snapshot = currentRow?.updated_date || old.inventory_updated_date_snapshot || "";
      patch.last_price_update_at = timestamp;
    }

    await base44.entities.BuilderPart.update(old.id, patch);
    synced.push({ ...old, ...patch });
  }

  for (const old of existing || []) {
    if (seen.has(old.part_key) || old.is_active === false) continue;
    if (old.builder_sync_state === "detached_override") {
      detachedCount += 1;
      synced.push(old);
      continue;
    }
    if (old.builder_sync_state === "manual_addon") {
      // Intentional independent add-ons are not produced by the Builder, but
      // they still track their own Master Inventory record for current-price
      // comparison and remain part of the Product economics on every Builder save.
      let refreshed = old;
      if (old.inventory_entity && old.inventory_item_id && !old.manual_cost_override) {
        const currentRow = await base44.entities[old.inventory_entity].get(old.inventory_item_id).catch(() => null);
        if (currentRow) {
          const currentUnit = independentPartUnitCost(old, currentRow);
          const currentExtended = currentUnit * num(old.quantity, 1);
          const changed = Math.abs(currentExtended - num(old.frozen_extended_cost)) > 0.005 ||
            !same(pricingSnapshot(currentRow), pricingSnapshot(old.frozen_inventory_snapshot));
          const patch = {
            current_inventory_snapshot: currentRow,
            current_unit_cost: currentUnit,
            current_extended_cost: currentExtended,
            inventory_link_state: "attached",
            price_state: changed ? "changed" : "current",
            price_delta: currentExtended - num(old.frozen_extended_cost),
            price_delta_percent: num(old.frozen_extended_cost) ? ((currentExtended - num(old.frozen_extended_cost)) / num(old.frozen_extended_cost)) * 100 : 0,
            last_price_check_at: nowIso(),
            is_active: true,
          };
          if (changed) changedCount += 1;
          await base44.entities.BuilderPart.update(old.id, patch);
          refreshed = { ...old, ...patch };
        } else {
          const patch = {
            inventory_link_state: "detached",
            price_state: "detached",
            last_price_check_at: nowIso(),
            is_active: true,
          };
          // This is an independent add-on, not a broken Builder-produced Part.
          // Keep the Part visibly detached and let Update Price block until the
          // user uses Switch Part, but do not trigger the Builder reattach modal.
          await base44.entities.BuilderPart.update(old.id, patch);
          refreshed = { ...old, ...patch };
        }
      }
      synced.push(refreshed);
      continue;
    }
    await base44.entities.BuilderPart.update(old.id, {
      is_active: false,
      last_price_check_at: nowIso(),
      notes: `${old.notes ? `${old.notes}\n` : ""}Part no longer exists in the current builder snapshot; frozen history retained.`,
    });
  }

  const manualAddons = synced.filter((part) => part.builder_sync_state === "manual_addon" && part.is_active !== false);
  const manualAddonFrozenTotal = manualAddons.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const manualAddonCurrentTotal = manualAddons.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);

  return {
    partCount: synced.length,
    detachedCount,
    changedCount,
    manualAddonFrozenTotal,
    manualAddonCurrentTotal,
    parts: synced,
  };
}

export async function acceptBuilderPartPrices(builderProductId) {
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  const activeParts = (parts || []).filter((row) => row.is_active !== false);
  const detachedParts = activeParts.filter((part) =>
    part.builder_sync_state === "detached_override" ||
    ["detached", "reattach_available"].includes(part.inventory_link_state)
  );

  // All-or-nothing guard: do not mutate even one Part while any linked Part is
  // detached. The user must resolve/reattach those Parts first.
  if (detachedParts.length > 0) {
    return {
      changedParts: [],
      detachedCount: detachedParts.length,
      detachedParts: detachedParts.map((part) => ({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        inventory_item_name: part.inventory_item_name,
        reattach_candidate_id: part.reattach_candidate_id || "",
        reattach_candidate_name: part.reattach_candidate_name || "",
      })),
    };
  }

  const timestamp = nowIso();
  const changedParts = [];

  for (const part of activeParts) {
    const wasChanged = part.price_state === "changed" ||
      Math.abs(num(part.current_extended_cost) - num(part.frozen_extended_cost)) > 0.005 ||
      !same(pricingSnapshot(part.current_inventory_snapshot), pricingSnapshot(part.frozen_inventory_snapshot));
    if (wasChanged) {
      changedParts.push({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        previous_inventory_item_id: part.original_inventory_item_id || part.inventory_item_id,
        current_inventory_item_id: part.inventory_item_id,
        previous_unit_cost: num(part.frozen_unit_cost),
        new_unit_cost: num(part.current_unit_cost),
        previous_extended_cost: num(part.frozen_extended_cost),
        new_extended_cost: num(part.current_extended_cost),
        previous_inventory_snapshot: part.frozen_inventory_snapshot || {},
        new_inventory_snapshot: part.current_inventory_snapshot || {},
      });
    }
    await base44.entities.BuilderPart.update(part.id, {
      frozen_inventory_snapshot: part.current_inventory_snapshot || part.frozen_inventory_snapshot || {},
      frozen_unit_cost: num(part.current_unit_cost, num(part.frozen_unit_cost)),
      frozen_extended_cost: num(part.current_extended_cost, num(part.frozen_extended_cost)),
      inventory_updated_date_snapshot: part.current_inventory_snapshot?.updated_date || part.inventory_updated_date_snapshot || "",
      price_state: "current",
      price_delta: 0,
      price_delta_percent: 0,
      last_price_update_at: timestamp,
    });
  }

  return { changedParts, detachedCount: 0, detachedParts: [] };
}

export async function getDetachedBuilderParts(builderProductId) {
  if (!builderProductId) return [];
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  return (parts || [])
    .filter(requiresBuilderReattach)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((part) => ({
      ...part,
      can_reattach: part.builder_sync_state === "detached_override" || !!part.reattach_candidate_id,
    }));
}

export async function detachBuilderPartOverride(partId, reason = "Detached for independent Part override.") {
  if (!partId) return null;
  const part = await base44.entities.BuilderPart.get(partId).catch(() => null);
  if (!part) throw new Error("The Part could not be loaded.");
  if (part.builder_sync_state === "detached_override") return part;

  const builder = await base44.entities.BuilderProduct.get(part.builder_product_id).catch(() => null);
  if (!builder) throw new Error("The Builder Product could not be loaded.");

  const timestamp = nowIso();
  const detachedSnapshot = {
    part_name: part.part_name,
    client_label: part.client_label,
    quantity: part.quantity,
    unit: part.unit,
    inventory_entity: part.inventory_entity,
    inventory_item_id: part.inventory_item_id,
    inventory_item_name: part.inventory_item_name,
    frozen_unit_cost: num(part.frozen_unit_cost),
    frozen_extended_cost: num(part.frozen_extended_cost),
    builder_data: part.builder_data || {},
    calculation_snapshot: part.calculation_snapshot || {},
    pricing_basis_snapshot: part.pricing_basis_snapshot || {},
    detail_overrides: part.detail_overrides || {},
    source_path: part.source_path,
  };

  await base44.entities.BuilderPart.update(part.id, {
    builder_sync_state: "detached_override",
    builder_detached_at: timestamp,
    builder_detached_reason: reason,
    builder_detached_snapshot: detachedSnapshot,
    reattach_candidate_id: part.inventory_item_id || part.original_inventory_item_id || "",
    reattach_candidate_name: part.inventory_item_name || part.part_name || "",
    price_state: "detached",
    last_price_check_at: timestamp,
    notes: `${part.notes ? `${part.notes}\n` : ""}Detached from Builder for independent override. Frozen pricing retained.`,
  });

  const detachedParts = await getDetachedBuilderParts(builder.id);
  await base44.entities.BuilderProduct.update(builder.id, {
    detached_part_count: detachedParts.length,
    needs_reattach_review: true,
    price_state: "detached_parts",
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
  const revisionNumber = Math.max(0, ...(revisions || []).map((revision) => num(revision.revision_number))) + 1;
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: revisionNumber,
    reason: "manual_adjustment",
    previous_total_cost: num(builder.frozen_cost),
    new_total_cost: num(builder.frozen_cost),
    previous_customer_price: num(builder.frozen_customer_price, num(builder.frozen_cost)),
    new_customer_price: num(builder.frozen_customer_price, num(builder.frozen_cost)),
    changed_parts: [{
      part_id: part.id,
      part_key: part.part_key,
      part_name: part.part_name,
      action: "detach_override",
      frozen_unit_cost: num(part.frozen_unit_cost),
      frozen_extended_cost: num(part.frozen_extended_cost),
      inventory_item_id: part.inventory_item_id || "",
      source_path: part.source_path || "",
    }],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: num(builder.frozen_cost), pricing_accepted: false },
    price_snapshot_after: { total: num(builder.frozen_cost), pricing_accepted: false },
    notes: reason,
  });

  if (builder.estimate_id) {
    const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id).catch(() => null);
    if (estimate) {
      const lineItems = (estimate.line_items || []).map((line) =>
        line.builder_product_id === builder.id
          ? {
              ...line,
              detached_part_count: detachedParts.length,
              needs_reattach_review: true,
              price_state: "detached_parts",
              last_price_check_at: timestamp,
            }
          : line
      );
      await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
    }
  }

  return base44.entities.BuilderPart.get(part.id).catch(() => ({ ...part, builder_sync_state: "detached_override" }));
}

export async function updateDetachedPartOverride(partId, changes = {}) {
  const part = await base44.entities.BuilderPart.get(partId).catch(() => null);
  if (!part) throw new Error("The Part could not be loaded.");
  if (part.builder_sync_state !== "detached_override") {
    throw new Error("This Part must be detached from its Builder before it can be overridden independently.");
  }
  const builder = await base44.entities.BuilderProduct.get(part.builder_product_id).catch(() => null);
  if (!builder) throw new Error("The Builder Product could not be loaded.");

  const previousExtended = num(part.frozen_extended_cost);
  const quantity = changes.quantity !== undefined ? Math.max(0, num(changes.quantity)) : num(part.quantity, 1);
  const frozenUnitCost = changes.frozen_unit_cost !== undefined ? num(changes.frozen_unit_cost) : num(part.frozen_unit_cost);
  const nextExtended = quantity * frozenUnitCost;
  const delta = nextExtended - previousExtended;
  const timestamp = nowIso();
  const previousDetailOverrides = part.detail_overrides || {};
  const nextDetailOverrides = changes.detail_overrides !== undefined ? { ...(changes.detail_overrides || {}) } : previousDetailOverrides;

  const patch = {
    part_name: changes.part_name !== undefined ? String(changes.part_name || "Part") : part.part_name,
    client_label: changes.client_label !== undefined ? String(changes.client_label || "") : part.client_label,
    quantity,
    unit: changes.unit !== undefined ? String(changes.unit || "") : part.unit,
    frozen_unit_cost: frozenUnitCost,
    frozen_extended_cost: nextExtended,
    current_unit_cost: frozenUnitCost,
    current_extended_cost: nextExtended,
    manual_cost_override: true,
    manual_cost: nextExtended,
    detail_overrides: nextDetailOverrides,
    price_state: "detached",
    price_delta: 0,
    price_delta_percent: 0,
    notes: changes.notes !== undefined ? String(changes.notes || "") : part.notes,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp,
  };
  await base44.entities.BuilderPart.update(part.id, patch);

  const previousProductCost = num(builder.frozen_cost);
  const nextProductCost = previousProductCost + delta;
  const previousCustomerPrice = num(builder.frozen_customer_price, previousProductCost);
  const nextCustomerPrice = previousCustomerPrice + delta;
  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextProductCost,
    frozen_customer_price: nextCustomerPrice,
    price_state: "detached_parts",
    needs_reattach_review: true,
    last_price_update_at: timestamp,
    last_price_update_note: `Independent override updated for ${patch.part_name}.`,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
  const revisionNumber = Math.max(0, ...(revisions || []).map((revision) => num(revision.revision_number))) + 1;
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: revisionNumber,
    reason: "manual_adjustment",
    previous_total_cost: previousProductCost,
    new_total_cost: nextProductCost,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: [{
      part_id: part.id,
      part_key: part.part_key,
      part_name: patch.part_name,
      action: "override_update",
      previous_quantity: num(part.quantity, 1),
      new_quantity: quantity,
      previous_unit: part.unit || "",
      new_unit: patch.unit || "",
      previous_unit_cost: num(part.frozen_unit_cost),
      new_unit_cost: frozenUnitCost,
      previous_extended_cost: previousExtended,
      new_extended_cost: nextExtended,
      delta,
      previous_detail_overrides: previousDetailOverrides,
      new_detail_overrides: nextDetailOverrides,
    }],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousProductCost, detached_override: true },
    price_snapshot_after: { total: nextProductCost, detached_override: true },
    notes: `Independent detached Part override updated. Builder synchronization remains disabled for this Part.`,
  });

  if (builder.estimate_id) {
    const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id).catch(() => null);
    if (estimate) {
      const lineItems = (estimate.line_items || []).map((line) =>
        line.builder_product_id === builder.id
          ? {
              ...line,
              total_snapshot: num(line.total_snapshot, previousProductCost) + delta,
              price_state: "detached_parts",
              needs_reattach_review: true,
              last_price_update_at: timestamp,
              last_price_check_at: timestamp,
            }
          : line
      );
      await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
    }
  }

  return base44.entities.BuilderPart.get(part.id).catch(() => ({ ...part, ...patch }));
}

function pathTokens(path) {
  return String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((token) => token.trim())
    .filter(Boolean);
}

function setAtPath(target, path, value) {
  const tokens = pathTokens(path);
  if (!tokens.length) return false;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (cursor?.[token] === undefined || cursor?.[token] === null) return false;
    cursor = cursor[token];
  }
  const last = tokens[tokens.length - 1];
  if (!cursor || typeof cursor !== "object") return false;
  cursor[last] = value;

  // Channel Letter / Maintenance history contains both inventory_id and
  // inventory_item_id generations. Keep an existing alias synchronized so the
  // old and new calculator/editor paths continue to agree after reattachment.
  if (last === "inventory_item_id" && Object.prototype.hasOwnProperty.call(cursor, "inventory_id")) {
    cursor.inventory_id = value;
  } else if (last === "inventory_id" && Object.prototype.hasOwnProperty.call(cursor, "inventory_item_id")) {
    cursor.inventory_item_id = value;
  }
  return true;
}

function topLevelField(path) {
  return pathTokens(path)[0] || "";
}

export async function reattachBuilderParts({ builderProductId, partIds = [] }) {
  if (!builderProductId || !partIds.length) {
    return { reattached: [], remainingDetached: await getDetachedBuilderParts(builderProductId) };
  }

  const builder = await base44.entities.BuilderProduct.get(builderProductId).catch(() => null);
  if (!builder?.source_entity || !builder?.source_project_id) {
    throw new Error("This Builder no longer has an editable source project to reattach Parts to.");
  }

  const source = await base44.entities[builder.source_entity].get(builder.source_project_id).catch(() => null);
  if (!source) throw new Error("The Builder source project could not be loaded.");

  const detached = await getDetachedBuilderParts(builderProductId);
  const selectedIds = new Set(partIds);
  const selected = detached.filter((part) =>
    selectedIds.has(part.id) &&
    (part.builder_sync_state === "detached_override" || part.reattach_candidate_id)
  );
  if (!selected.length) {
    return { reattached: [], remainingDetached: detached };
  }

  const beforeSnapshot = builder.builder_snapshot || source;
  const patchedSource = JSON.parse(JSON.stringify(source));
  const changedRoots = new Set();
  const reattached = [];

  for (const part of selected) {
    const builderOverride = part.builder_sync_state === "detached_override";
    if (builderOverride) {
      await base44.entities.BuilderPart.update(part.id, {
        builder_sync_state: "linked",
        builder_detached_at: "",
        builder_detached_reason: "",
        detail_overrides: {},
        price_state: "changed",
      });
    } else {
      const changed = setAtPath(patchedSource, part.source_path, part.reattach_candidate_id);
      if (!changed) continue;
      const root = topLevelField(part.source_path);
      if (root) changedRoots.add(root);
      await base44.entities.BuilderPart.update(part.id, { detail_overrides: {} });
    }
    reattached.push({
      part_id: part.id,
      part_key: part.part_key,
      part_name: part.part_name,
      reattach_type: builderOverride ? "builder_override" : "inventory_replacement",
      previous_inventory_item_id: part.inventory_item_id || part.original_inventory_item_id || "",
      current_inventory_item_id: part.reattach_candidate_id || part.inventory_item_id || "",
      previous_inventory_name: part.inventory_item_name || "",
      current_inventory_name: part.reattach_candidate_name || part.inventory_item_name || "",
      frozen_unit_cost: num(part.frozen_unit_cost),
      frozen_extended_cost: num(part.frozen_extended_cost),
      cleared_detail_overrides: part.detail_overrides || {},
      source_path: part.source_path,
    });
  }

  if (!reattached.length) {
    throw new Error("The selected Parts could not be mapped back into the Builder record.");
  }

  const sourcePatch = {};
  changedRoots.forEach((root) => {
    sourcePatch[root] = patchedSource[root];
  });
  if (Object.keys(sourcePatch).length > 0) {
    await base44.entities[builder.source_entity].update(builder.source_project_id, sourcePatch);
  }

  // Refresh Part linkage/current snapshots only. This intentionally does NOT
  // accept the new pricing; frozen costs remain exactly as quoted.
  const summary = await syncBuilderParts({
    builderProduct: builder,
    sourceProject: patchedSource,
    acceptPrices: false,
    legacyMode: false,
  });

  const remainingDetached = await getDetachedBuilderParts(builderProductId);
  const timestamp = nowIso();
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId });
  const revisionNumber = Math.max(0, ...(revisions || []).map((revision) => num(revision.revision_number))) + 1;

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builderProductId,
    estimate_id: builder.estimate_id || "",
    revision_number: revisionNumber,
    reason: "reattach",
    previous_total_cost: num(builder.frozen_cost),
    new_total_cost: num(builder.frozen_cost),
    previous_customer_price: num(builder.frozen_customer_price, num(builder.frozen_cost)),
    new_customer_price: num(builder.frozen_customer_price, num(builder.frozen_cost)),
    changed_parts: reattached,
    builder_snapshot_before: beforeSnapshot,
    builder_snapshot_after: patchedSource,
    price_snapshot_before: { total: num(builder.frozen_cost), pricing_accepted: false },
    price_snapshot_after: { total: num(builder.frozen_cost), pricing_accepted: false },
    notes: `Reattached ${reattached.length} Part${reattached.length === 1 ? "" : "s"}. Frozen pricing was preserved; a separate Update Price action is required to accept recalculated pricing.`,
  });

  await base44.entities.BuilderProduct.update(builderProductId, {
    builder_snapshot: patchedSource,
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: timestamp,
    part_count: summary.partCount,
    detached_part_count: remainingDetached.length,
    needs_reattach_review: remainingDetached.length > 0,
    price_state: remainingDetached.length > 0 ? "detached_parts" : "changed",
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  if (builder.estimate_id) {
    const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id).catch(() => null);
    if (estimate) {
      const lineItems = (estimate.line_items || []).map((line) =>
        line.builder_product_id === builderProductId
          ? {
              ...line,
              detached_part_count: remainingDetached.length,
              needs_reattach_review: remainingDetached.length > 0,
              price_state: remainingDetached.length > 0 ? "detached_parts" : "changed",
              last_price_check_at: timestamp,
            }
          : line
      );
      await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
    }
  }

  return {
    reattached,
    remainingDetached,
    builderProject: patchedSource,
  };
}
