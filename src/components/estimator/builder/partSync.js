import { base44 } from "@/api/base44Client";

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
    const filtered = entity === "LaborServiceInventory"
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
        sourcePath: `items[${itemIndex}].materials[${matIndex}]`,
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
      sourcePath: `selected_equipment[${index}]`,
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
      sourcePath: `letter_purchases[${index}]`,
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

function extractVinyl(project) {
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
    if (num(item.extra_cost) > 0.005) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:extra`,
        name: item.description ? `${item.description} — Additional Cost` : "Additional Vinyl Cost",
        type: "service",
        subtype: "extra_cost",
        sourcePath: `items[${index}].extra_cost`,
        cost: item.extra_cost,
        builderData: item,
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

function extractMetal(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    parts.push(makePart({
      key: `metal:item:${index}:material`,
      name: item.description || item.item_type || "Metal Material",
      type: "material",
      subtype: item.item_type || "metal",
      sourcePath: `items[${index}].inventory_item_id`,
      entity: "Inventory",
      inventoryId: item.inventory_item_id,
      quantity: item.material_length_ft || item.quantity || 1,
      unit: item.material_length_ft ? "ft" : "item",
      unitCost: item.material_length_ft
        ? num(item.material_cost) / Math.max(num(item.material_length_ft) * num(item.quantity, 1), 0.000001)
        : num(item.material_cost) / Math.max(num(item.quantity, 1), 1),
      extendedCost: item.material_cost,
      builderData: item,
      calculation: { material_cost: item.material_cost },
    }));
    [
      ["supplies", "Fabrication Consumables", "consumable", item.supplies_cost, 1, "job"],
      ["fabrication", "Fabrication Labor", "labor", item.fabrication_cost, num(item.fabrication_hours) * num(item.quantity, 1), "hour"],
      ["welding", "Welding Labor", "labor", item.welding_cost, num(item.welding_hours) * num(item.quantity, 1), "hour"],
      ["finishing", "Finishing Labor", "labor", item.finishing_cost, num(item.finishing_hours) * num(item.quantity, 1), "hour"],
    ].forEach(([key, label, type, cost, qty, unit]) => {
      if (num(cost) <= 0.005) return;
      parts.push(manualCostPart({
        key: `metal:item:${index}:${key}`,
        name: item.description ? `${item.description} — ${label}` : label,
        type,
        subtype: key,
        sourcePath: `items[${index}].${key === "supplies" ? "supplies_cost" : `${key}_cost`}`,
        cost,
        quantity: qty || 1,
        unit: qty ? unit : "job",
        builderData: item,
        calculation: item,
      }));
    });
  });
  if (num(project.extra_supplies_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "metal:extra-supplies",
      name: "Additional Fabrication Supplies",
      type: "consumable",
      subtype: "extra_supplies",
      sourcePath: "extra_supplies_cost",
      cost: project.extra_supplies_cost,
    }));
  }
  if (num(project.markup_amount) > 0.005) {
    parts.push(manualCostPart({
      key: "metal:markup",
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

function maintenanceMaterialLine(mat, item, row) {
  const signQty = num(item.quantity, 1);
  const rawQty = num(mat.quantity, 1);
  const sizeKey = {
    extra_small: "cost_extra_small",
    small: "cost_small",
    medium: "cost_medium",
    large: "cost_large",
    extra_large: "cost_extra_large",
    extra_extra_large: "cost_extra_extra_large",
    cab_small: "cost_cab_small",
    cab_medium: "cost_cab_medium",
    cab_large: "cost_cab_large",
    cab_extra_large: "cost_cab_extra_large",
  }[item.size] || "cost_medium";

  let quantity = rawQty * signQty;
  let unit = row?.unit || row?.pricing_mode || "unit";
  let unitCost = 0;
  switch (row?.pricing_mode) {
    case "per_letter_flat":
      quantity = num(item.qty_letters, 1) * signQty;
      unitCost = num(row.cost_per_letter);
      unit = "letter";
      break;
    case "per_letter_by_size":
      quantity = num(item.qty_letters, 1) * signQty;
      unitCost = num(row[sizeKey]);
      unit = "letter";
      break;
    case "per_cabinet_flat":
      quantity = signQty;
      unitCost = num(row.cost_per_cabinet);
      unit = "cabinet";
      break;
    case "per_cabinet_by_size":
      quantity = signQty;
      unitCost = num(row[sizeKey]);
      unit = "cabinet";
      break;
    case "per_linear_foot":
      quantity = rawQty * signQty;
      unitCost = num(row.cost_per_foot);
      unit = "ft";
      break;
    case "per_sqft":
      quantity = num(item.face_sqft) * signQty;
      unitCost = num(row.cost_per_sqft);
      unit = "sqft";
      break;
    case "per_project_flat":
    default:
      quantity = rawQty * signQty;
      unitCost = num(row?.cost_flat);
      unit = "job";
      break;
  }
  return { quantity, unit, unitCost, extendedCost: quantity * unitCost };
}

function extractMaintenance(project, catalogs = {}) {
  const parts = [];
  (project.items || []).forEach((item, itemIndex) => {
    (item.actions || []).forEach((action, actionIndex) => {
      (action.materials || []).forEach((mat, matIndex) => {
        const id = mat.inventory_item_id || mat.inventory_id || "";
        const row = catalogs.MaintenanceInventory?.byId.get(id);
        const priced = maintenanceMaterialLine(mat, item, row);
        parts.push(makePart({
          key: `maintenance:item:${itemIndex}:action:${actionIndex}:material:${matIndex}`,
          name: row?.item_name || mat.item_name || action.action || "Maintenance Material",
          type: "material",
          subtype: action.action || row?.pricing_mode || mat.pricing_mode || "maintenance",
          sourcePath: `items[${itemIndex}].actions[${actionIndex}].materials[${matIndex}]`,
          entity: "MaintenanceInventory",
          inventoryId: id,
          quantity: priced.quantity,
          unit: priced.unit,
          unitCost: priced.unitCost,
          extendedCost: priced.extendedCost,
          builderData: { sign: item.description, action: action.action, material: mat },
          calculation: { ...mat, calculated_extended_cost: priced.extendedCost },
        }));
      });
      if (num(action.labor_cost) > 0.005) {
        parts.push(manualCostPart({
          key: `maintenance:item:${itemIndex}:action:${actionIndex}:labor`,
          name: `${action.action || "Maintenance"} Labor${item.description ? ` — ${item.description}` : ""}`,
          type: "labor",
          subtype: action.action || "maintenance_labor",
          sourcePath: `items[${itemIndex}].actions[${actionIndex}].labor_cost`,
          cost: action.labor_cost,
          quantity: action.labor_hours || 1,
          unit: action.labor_hours ? "hour" : "job",
          builderData: { sign: item.description, action },
          calculation: { labor_hours: action.labor_hours, labor_cost: action.labor_cost, rate_basis: action.rate_basis },
        }));
      }
    });
  });

  (project.selected_equipment || []).forEach((eq, index) => {
    const id = eq.equipment_id || eq.inventory_item_id || "";
    parts.push(makePart({
      key: `maintenance:equipment:${index}`,
      name: eq.equipment_name || "Maintenance Equipment",
      type: "equipment",
      subtype: eq.equipment_type || "maintenance_equipment",
      sourcePath: `selected_equipment[${index}]`,
      entity: "MaintenanceEquipment",
      inventoryId: id,
      quantity: eq.duration || 1,
      unit: eq.pricing_mode || "",
      unitCost: eq.unit_cost || eq.equipment_cost,
      extendedCost: eq.total_cost || eq.equipment_cost,
      builderData: eq,
      calculation: eq,
    }));
  });
  if (num(project.total_supplies_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "maintenance:supplies",
      name: "Maintenance Consumables / Supplies",
      type: "consumable",
      subtype: "maintenance_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost },
    }));
  }
  if (num(project.total_travel_cost) > 0.005) {
    parts.push(manualCostPart({
      key: "maintenance:travel",
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
      key: "maintenance:markup",
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
  if (!equipmentRow) return { baseCost: num(entry.equipment_cost), attachmentCosts: [] };
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
  const attachmentCosts = (entry.attachments || []).map((attachment) => {
    const id = attachment.id || attachment.inventory_id || "";
    const row = catalogs.FoundationInventory?.byId.get(id);
    return {
      id,
      row,
      quantity: num(attachment.qty, 1),
      cost: rateFor(row) * num(attachment.qty, 1),
      attachment,
    };
  });
  const baseRental = rateFor(equipmentRow, entry.custom_rate);
  const delivery = entry.include_delivery
    ? (entry.custom_delivery_charge !== undefined && entry.custom_delivery_charge !== null
        ? num(entry.custom_delivery_charge)
        : num(equipmentRow.pickup_delivery_cost))
    : 0;
  return {
    baseCost: baseRental + delivery,
    attachmentCosts,
  };
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
        sourcePath: `selected_equipment[${index}].attachments[${attachmentIndex}]`,
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
  const fixedSetupCost = num(project.builder_calculation?.totals?.fixed_setup_cost);
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
  return parts;
}

function extractLaser(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
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
  const fixedSetupCost = num(project.builder_calculation?.totals?.fixed_setup_cost);
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
  const fixedMaterialSetup = num(project.fixed_material_setup_cost, project.builder_calculation?.totals?.total_supplies_cost);
  if (fixedMaterialSetup > 0.005) {
    parts.push(manualCostPart({
      key: "laser:fixed-material-setup",
      name: "Laser Material Setup / Consumables",
      type: "consumable",
      subtype: "material_setup",
      sourcePath: "fixed_material_setup_cost",
      cost: fixedMaterialSetup,
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
    case "vinyl": return extractVinyl(project);
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
    return { partCount: 0, detachedCount: 0, changedCount: 0, parts: [] };
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
    await base44.entities.BuilderPart.update(old.id, {
      is_active: false,
      last_price_check_at: nowIso(),
      notes: `${old.notes ? `${old.notes}\n` : ""}Part no longer exists in the current builder snapshot; frozen history retained.`,
    });
  }

  return {
    partCount: synced.length,
    detachedCount,
    changedCount,
    parts: synced,
  };
}

export async function acceptBuilderPartPrices(builderProductId) {
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  const activeParts = (parts || []).filter((row) => row.is_active !== false);
  const detachedParts = activeParts.filter((part) =>
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
