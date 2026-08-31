// Excel → Inventory mapping engine for the Master Inventory importer.
//
// Routes each external "PartDetailsExport" row to the correct entity:
//   - vinyl                  → VinylInventory
//   - substrate              → DimensionalLetterMaterial (includes sheet metal)
//   - sign_lighting          → SignLightingInventory
//   - sign_hardware          → SignHardwareInventory
//   - labor_service          → LaborServiceInventory
//   - sign_parts_supplies    → SignPartsSuppliesInventory (default fallback)
//
// Anything we can't confidently route lands in Sign Parts | Supplies so the
// user never silently loses data.

import {
  DimensionalLetterMaterial,
  VinylInventory,
  SignLightingInventory,
  SignHardwareInventory,
  LaborServiceInventory,
  SignPartsSuppliesInventory,
} from "@/entities/all";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const cleanStr = (v) => (v === null || v === undefined ? "" : String(v).trim());
const cleanNum = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};
const cleanBool = (v) => {
  const s = cleanStr(v).toLowerCase();
  return s === "yes" || s === "true" || s === "1";
};

const toInches = (val, units) => {
  const n = cleanNum(val);
  const u = cleanStr(units).toLowerCase();
  if (!n) return 0;
  if (u.startsWith("ft") || u === "feet" || u === "foot") return n * 12;
  return n;
};

export const nameKey = (s) => cleanStr(s).toLowerCase().replace(/\s+/g, " ");

export const groupKey = (name) => {
  let s = cleanStr(name).toLowerCase();
  s = s.replace(/\b\d+(\.\d+)?\s*(in|inches|"|'|ft|feet|oz|mil|mm)\b/g, "");
  s = s.replace(/\b\d+\s*x\s*\d+\b/g, "");
  s = s.replace(/[,\-]+\s*$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
};

// ----------------------------------------------------------------------------
// Category detection
// ----------------------------------------------------------------------------
//
// PART_GROUP_MAP keys are the user's literal "Part Group" cell values (lowercased).

const PART_GROUP_MAP = {
  // ---- Vinyl-ish ----
  "vinyl": "vinyl",
  "cut vinyl": "vinyl",
  "print vinyl": "vinyl",
  "printed vinyl": "vinyl",
  "wrap": "vinyl",
  "wrap vinyl": "vinyl",
  "laminate": "vinyl",
  "transfer tape": "vinyl",
  "window film": "vinyl",
  "perforated": "vinyl",
  "reflective": "vinyl",
  "banner": "vinyl",
  "banner material": "vinyl",
  "banner stands vinyl": "vinyl",
  "paper": "vinyl",

  // ---- Substrates (sheet stock, INCLUDING sheet metal) ----
  "acrylic": "substrate",
  "pvc": "substrate",
  "sintra": "substrate",
  "aluminum composite": "substrate",
  "acm": "substrate",
  "dibond": "substrate",
  "alumalite": "substrate",
  "mdf": "substrate",
  "hdu": "substrate",
  "foam": "substrate",
  "wood": "substrate",
  "coroplast": "substrate",
  "corrugated plastic": "substrate",
  "corrugated plastic blanks": "substrate",
  "gatorboard": "substrate",
  "polycarbonate": "substrate",
  "lexan": "substrate",
  "styrene": "substrate",
  "aluminum sheet": "substrate",
  "aluminum sheets": "substrate",
  "aluminum plate": "substrate",
  "steel sheet": "substrate",
  "steel plate": "substrate",
  "sheet metal": "substrate",
  "stainless sheet": "substrate",
  "stainless plate": "substrate",
  "galvanized sheet": "substrate",
  "galvanized plate": "substrate",
  "plastic": "substrate",
  "plastic sheet": "substrate",
  "plastic plate": "substrate",

  // ---- Sign Lighting ----
  "led": "sign_lighting",
  "leds": "sign_lighting",
  "led modules": "sign_lighting",
  "led strips": "sign_lighting",
  "led neon": "sign_lighting",
  "neon": "sign_lighting",
  "power supplies": "sign_lighting",
  "power supply": "sign_lighting",
  "transformer": "sign_lighting",
  "transformers": "sign_lighting",
  "ballast": "sign_lighting",
  "ballasts": "sign_lighting",
  "fluorescent": "sign_lighting",
  "fluorescent tubes": "sign_lighting",
  "photocell": "sign_lighting",
  "photocells": "sign_lighting",
  "timer": "sign_lighting",
  "timers": "sign_lighting",
  "led driver": "sign_lighting",
  "drivers": "sign_lighting",
  "lighting": "sign_lighting",

  // ---- Hardware ----
  "hardware": "sign_hardware",
  "fasteners": "sign_hardware",
  "screws": "sign_hardware",
  "bolts": "sign_hardware",
  "nuts": "sign_hardware",
  "washers": "sign_hardware",
  "anchors": "sign_hardware",
  "standoff": "sign_hardware",
  "standoffs": "sign_hardware",
  "brackets": "sign_hardware",
  "threaded rod": "sign_hardware",
  "rivets": "sign_hardware",
  "clips": "sign_hardware",
  "z-clips": "sign_hardware",
  "z clips": "sign_hardware",
  "wedge anchor": "sign_hardware",
  "lag screw": "sign_hardware",
  "toggle bolt": "sign_hardware",

  // ---- Labor & Services ----
  "permitting": "labor_service",
  "permits": "labor_service",
  "engineering": "labor_service",
  "design": "labor_service",
  "art": "labor_service",
  "design/art": "labor_service",
  "delivery": "labor_service",
  "freight": "labor_service",
  "shipping": "labor_service",
  "subcontractor": "labor_service",
  "subcontractor labor": "labor_service",
  "electrical hookup": "labor_service",
  "crane": "labor_service",
  "crane service": "labor_service",
  "rental service": "labor_service",
  "inspection": "labor_service",
  "consulting": "labor_service",
  "labor": "labor_service",
  "service": "labor_service",
  "services": "labor_service",

  // ---- Sign Parts | Supplies (formerly Metal/Sign Materials) ----
  "trim cap": "sign_parts_supplies",
  "trim caps": "sign_parts_supplies",
  "returns": "sign_parts_supplies",
  "retainer": "sign_parts_supplies",
  "retainers": "sign_parts_supplies",
  "j-bar": "sign_parts_supplies",
  "j bar": "sign_parts_supplies",
  "raceway cover": "sign_parts_supplies",
  "edge trim": "sign_parts_supplies",
  "paint": "sign_parts_supplies",
  "ink": "sign_parts_supplies",
  "inks": "sign_parts_supplies",
  "primer": "sign_parts_supplies",
  "adhesive": "sign_parts_supplies",
  "adhesives": "sign_parts_supplies",
  "sealant": "sign_parts_supplies",
  "tape": "sign_parts_supplies",
  "tapes": "sign_parts_supplies",
  "blade": "sign_parts_supplies",
  "blades": "sign_parts_supplies",
  "abrasive": "sign_parts_supplies",
  "cleaner": "sign_parts_supplies",
  "solvent": "sign_parts_supplies",
  "ppe": "sign_parts_supplies",
  "safety": "sign_parts_supplies",
  "gloves": "sign_parts_supplies",
  "shop supplies": "sign_parts_supplies",
  "consumables": "sign_parts_supplies",
};

// Keyword fallbacks when Part Group is empty or unmapped.
// Order matters — first match wins.
//
// NOTE: ANY sheet/plate row (metal OR plastic) is routed to Substrates. The
// legacy Inventory entity (extruded angle / channel / tube / pipe / etc.) is
// only used for true extrusions and poles — never for sheet/plate or plastic
// sheet stock. This matches the Master Inventory UI:
//   • Extruded Metals & Poles tab → Inventory (extrusions) + FoundationInventory (poles)
//   • Substrates tab → DimensionalLetterMaterial (incl. all sheet stock)
const KEYWORD_RULES = [
  { rx: /\b(vinyl|wrap|laminate|transfer tape|banner|window film|perforated|reflective|3m\s*ij|oracal|avery|polypropylene|photobase|multitex|polyester)\b/i, target: "vinyl" },
  { rx: /\b(led|neon|power supply|transformer|ballast|fluorescent|photocell|timer|driver)\b/i, target: "sign_lighting" },
  { rx: /\b(standoff|anchor|screw|bolt|nut|washer|rivet|threaded rod|bracket|z[-\s]?clip|french cleat|toggle|wedge)\b/i, target: "sign_hardware" },
  { rx: /\b(permit|engineering|design fee|art fee|freight|delivery|subcontractor|crane|inspection|consulting|labor rate|fee)\b/i, target: "labor_service" },
  // Substrates — explicit sheet/plate keywords for every supported material,
  // including bare "plastic sheet" and metal "plate" stock.
  { rx: /\b(acrylic|sintra|pvc|acm|dibond|alumalite|mdf|hdu|coroplast|corrugated plastic|gatorboard|polycarbonate|lexan|styrene|foam|sheet metal|aluminum sheet|steel sheet|stainless sheet|galvanized sheet|aluminum plate|steel plate|stainless plate|plastic sheet|plastic plate)\b/i, target: "substrate" },
  { rx: /\b(trim cap|retainer|j[-\s]?bar|raceway cover|edge trim|paint|primer|sealant|tape|abrasive|cleaner|solvent|ppe|gloves)\b/i, target: "sign_parts_supplies" },
];

export const detectTarget = (row) => {
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  if (PART_GROUP_MAP[pg]) return PART_GROUP_MAP[pg];

  const name = cleanStr(row["Part Name"]);
  for (const r of KEYWORD_RULES) {
    if (r.rx.test(name) || r.rx.test(pg)) return r.target;
  }

  // Last resort: Sign Parts | Supplies (generic catch-all)
  return "sign_parts_supplies";
};

// ----------------------------------------------------------------------------
// Per-target transformers
// ----------------------------------------------------------------------------

const IMPORT_NOTE = `Imported from external system on ${new Date().toLocaleDateString()}`;

const toVinylPayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const widthIn = toInches(row["Parent Width"], row["Parent Width Units"]);
  const heightUnits = cleanStr(row["Parent Height Units"]).toLowerCase();
  const heightVal = cleanNum(row["Parent Height"]);
  let rollLenYards = 0;
  if (heightUnits.startsWith("ft") || heightUnits === "feet") rollLenYards = heightVal / 3;
  else if (heightUnits.startsWith("yd")) rollLenYards = heightVal;
  else if (heightUnits === "inches" || heightUnits === "in") rollLenYards = heightVal / 36;

  return {
    vinyl_name: name,
    product_group_key: groupKey(name),
    color_name: cleanStr(row["Color"]),
    finish: cleanStr(row["Finish"]).toLowerCase() || "gloss",
    roll_width_inches: widthIn || 24,
    roll_length_yards: rollLenYards || 50,
    pricing_mode: "per_sqft",
    cost_per_sqft: cleanNum(row["Part Cost"]),
    supplier: cleanStr(row["Part Group"]),
    supplier_sku: cleanStr(row["Part Number"]),
    is_active: cleanBool(row["Is Active"]),
    show_in_vinyl_estimator: true,
    notes: IMPORT_NOTE,
  };
};

const toSubstratePayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  const blob = pg + " " + name.toLowerCase();

  let materialType = "other";
  if (/stainless/.test(blob))                   materialType = "stainless_sheet";
  else if (/galvanized/.test(blob))             materialType = "galvanized_sheet";
  else if (/steel sheet|sheet metal/.test(blob)) materialType = "steel_sheet";
  else if (/aluminum sheet/.test(blob))         materialType = "aluminum_sheet";
  else if (/(acm|dibond|alumalite|composite)/.test(blob)) materialType = "aluminum_composite";
  else if (/aluminum/.test(blob))               materialType = "aluminum_solid";
  else if (/acrylic/.test(blob))                materialType = "acrylic";
  else if (/(pvc|sintra)/.test(blob))           materialType = "pvc";
  else if (/(polycarbonate|lexan)/.test(blob))  materialType = "polycarbonate";
  else if (/styrene/.test(blob))                materialType = "styrene";
  else if (/(coroplast|corrugated plastic)/.test(blob)) materialType = "coroplast";
  else if (/gatorboard/.test(blob))             materialType = "gatorboard";
  else if (/mdf/.test(blob))                    materialType = "mdf";
  else if (/hdu/.test(blob))                    materialType = "hdu";
  else if (/foam/.test(blob))                   materialType = "foam";
  else if (/wood/.test(blob))                   materialType = "wood";

  let thicknessIn = cleanNum(row["Thickness"]);
  if (!thicknessIn) {
    const m = name.match(/(\d+\/\d+|\d+\.\d+|\d+)\s*"/);
    if (m) {
      const t = m[1];
      thicknessIn = t.includes("/")
        ? (() => { const [a, b] = t.split("/").map(Number); return a / b; })()
        : parseFloat(t);
    }
  }

  return {
    material_name: name,
    material_type: materialType,
    thickness_inches: thicknessIn || 0.5,
    sheet_length_inches: toInches(row["Parent Height"], row["Parent Height Units"]) || 96,
    sheet_width_inches: toInches(row["Parent Width"], row["Parent Width Units"]) || 48,
    cost_per_sheet: cleanNum(row["Part Cost"]),
    color: cleanStr(row["Color"]),
    supplier: cleanStr(row["Part Group"]),
    is_active: cleanBool(row["Is Active"]),
    show_in_dimensional_letters: true,
    show_in_lobby_sign_backer: true,
    notes: IMPORT_NOTE,
  };
};

const toLightingPayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  const blob = pg + " " + name.toLowerCase();

  let lightingType = "other";
  if (/(power supply|driver)/.test(blob))       lightingType = "power_supply";
  else if (/transformer/.test(blob))            lightingType = "transformer";
  else if (/ballast/.test(blob))                lightingType = "ballast";
  else if (/(led strip|led tape)/.test(blob))   lightingType = "led_strip";
  else if (/led neon/.test(blob))               lightingType = "led_neon";
  else if (/led/.test(blob))                    lightingType = "led_module";
  else if (/(fluorescent|t8|t12)/.test(blob))   lightingType = "fluorescent_tube";
  else if (/neon/.test(blob))                   lightingType = "neon_tube";
  else if (/photocell/.test(blob))              lightingType = "photocell";
  else if (/timer/.test(blob))                  lightingType = "timer";
  else if (/wire/.test(blob))                   lightingType = "wire";
  else if (/connector/.test(blob))              lightingType = "connector";

  const pricingUnits = cleanStr(row["Pricing Units"]).toLowerCase();
  let pricingMode = "per_piece";
  if (pricingUnits.includes("foot")) pricingMode = "per_foot";
  else if (pricingUnits.includes("roll")) pricingMode = "per_roll";
  else if (pricingUnits.includes("box")) pricingMode = "per_box";

  return {
    item_name: name,
    lighting_type: lightingType,
    manufacturer: cleanStr(row["Manufacturer"]),
    model_number: cleanStr(row["Part Number"]),
    color_name: cleanStr(row["Color"]),
    pricing_mode: pricingMode,
    cost_per_unit: cleanNum(row["Part Cost"]),
    supplier: cleanStr(row["Part Group"]),
    supplier_sku: cleanStr(row["Part Number"]),
    is_active: cleanBool(row["Is Active"]),
    notes: IMPORT_NOTE,
  };
};

const toHardwarePayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  const blob = pg + " " + name.toLowerCase();

  let hardwareType = "other";
  if (/standoff/.test(blob))             hardwareType = "standoff";
  else if (/wedge anchor/.test(blob))    hardwareType = "wedge_anchor";
  else if (/drop[-\s]?in anchor/.test(blob)) hardwareType = "drop_in_anchor";
  else if (/toggle/.test(blob))          hardwareType = "toggle_bolt";
  else if (/lag/.test(blob))             hardwareType = "lag_screw";
  else if (/anchor/.test(blob))          hardwareType = "anchor";
  else if (/threaded rod/.test(blob))    hardwareType = "threaded_rod";
  else if (/z[-\s]?clip/.test(blob))     hardwareType = "z_clip";
  else if (/french cleat/.test(blob))    hardwareType = "french_cleat";
  else if (/bracket/.test(blob))         hardwareType = "bracket";
  else if (/clip/.test(blob))            hardwareType = "clip";
  else if (/rivet/.test(blob))           hardwareType = "rivet";
  else if (/washer/.test(blob))          hardwareType = "washer";
  else if (/nut/.test(blob))             hardwareType = "nut";
  else if (/bolt/.test(blob))            hardwareType = "bolt";
  else if (/screw/.test(blob))           hardwareType = "screw";

  let material = "other";
  if (/stainless/.test(blob))            material = "stainless_steel";
  else if (/galvanized/.test(blob))      material = "steel_galvanized";
  else if (/aluminum/.test(blob))        material = "aluminum";
  else if (/zinc/.test(blob))            material = "steel_zinc";
  else if (/brass/.test(blob))           material = "brass";
  else if (/nylon/.test(blob))           material = "nylon";

  return {
    item_name: name,
    hardware_type: hardwareType,
    material,
    size: cleanStr(row["Color"]) || cleanStr(row["Thickness"]) || "",
    cost_per_unit: cleanNum(row["Part Cost"]),
    pricing_mode: "per_piece",
    supplier: cleanStr(row["Part Group"]),
    supplier_sku: cleanStr(row["Part Number"]),
    is_active: cleanBool(row["Is Active"]),
    notes: IMPORT_NOTE,
  };
};

const toLaborServicePayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  const blob = pg + " " + name.toLowerCase();

  let category = "other";
  if (/permit/.test(blob))               category = "permitting";
  else if (/engineering/.test(blob))     category = "engineering";
  else if (/design|art/.test(blob))      category = "design_art";
  else if (/(freight|delivery|shipping)/.test(blob)) category = "delivery_freight";
  else if (/electrical/.test(blob))      category = "electrical_hookup";
  else if (/crane|lift/.test(blob))      category = "crane_lift_service";
  else if (/rental/.test(blob))          category = "rental_service";
  else if (/inspection/.test(blob))      category = "inspection";
  else if (/consulting/.test(blob))      category = "consulting";
  else if (/subcontractor/.test(blob))   category = "subcontractor_labor";
  else if (/shop labor/.test(blob))      category = "shop_labor";
  else if (/field labor/.test(blob))     category = "field_labor";

  const pricingUnits = cleanStr(row["Pricing Units"]).toLowerCase();
  let pricingMode = "per_job";
  if (pricingUnits.includes("hour")) pricingMode = "per_hour";
  else if (pricingUnits.includes("day")) pricingMode = "per_day";
  else if (pricingUnits.includes("mile")) pricingMode = "per_mile";
  else if (pricingUnits.includes("sqft") || pricingUnits.includes("square")) pricingMode = "per_sqft";
  else if (pricingUnits.includes("piece") || pricingUnits.includes("unit") || pricingUnits.includes("each")) pricingMode = "per_unit";

  return {
    service_name: name,
    service_category: category,
    pricing_mode: pricingMode,
    default_rate: cleanNum(row["Part Cost"]),
    vendor_name: cleanStr(row["Part Group"]),
    is_active: cleanBool(row["Is Active"]),
    notes: IMPORT_NOTE,
  };
};

const toSignPartsSuppliesPayload = (row) => {
  const name = cleanStr(row["Part Name"]);
  const pg = cleanStr(row["Part Group"]).toLowerCase();
  const blob = pg + " " + name.toLowerCase();

  let category = "shop_consumable";
  if (/trim cap/.test(blob))             category = "trim_cap";
  else if (/return/.test(blob))          category = "returns";
  else if (/retainer/.test(blob))        category = "retainer";
  else if (/j[-\s]?bar/.test(blob))      category = "j_bar";
  else if (/raceway cover/.test(blob))   category = "raceway_cover";
  else if (/edge trim/.test(blob))       category = "edge_trim";
  else if (/(paint|ink)/.test(blob))     category = "paint_ink";
  else if (/primer/.test(blob))          category = "primer";
  else if (/(adhesive|sealant|caulk|glue)/.test(blob)) category = "adhesive_sealant";
  else if (/tape/.test(blob))            category = "tape";
  else if (/(blade|abrasive|sandpaper)/.test(blob)) category = "abrasive_blade";
  else if (/(cleaner|solvent)/.test(blob)) category = "cleaner_solvent";
  else if (/(ppe|safety|gloves|glasses)/.test(blob)) category = "ppe_safety";

  const pricingUnits = cleanStr(row["Pricing Units"]).toLowerCase();
  let pricingMode = "per_piece";
  if (pricingUnits.includes("foot")) pricingMode = "per_foot";
  else if (pricingUnits.includes("roll")) pricingMode = "per_roll";
  else if (pricingUnits.includes("box")) pricingMode = "per_box";
  else if (pricingUnits.includes("gallon")) pricingMode = "per_gallon";
  else if (pricingUnits.includes("quart")) pricingMode = "per_quart";
  else if (pricingUnits.includes("pound") || pricingUnits.includes("lb")) pricingMode = "per_pound";
  else if (pricingUnits.includes("sqft") || pricingUnits.includes("square")) pricingMode = "per_sqft";

  return {
    item_name: name,
    category,
    color: cleanStr(row["Color"]),
    size: cleanStr(row["Thickness"]) || "",
    pricing_mode: pricingMode,
    cost_per_unit: cleanNum(row["Part Cost"]),
    supplier: cleanStr(row["Part Group"]),
    supplier_sku: cleanStr(row["Part Number"]),
    is_active: cleanBool(row["Is Active"]),
    notes: IMPORT_NOTE,
  };
};

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------

export const TARGETS = {
  vinyl: {
    label: "Vinyl",
    entity: VinylInventory,
    nameField: "vinyl_name",
    transform: toVinylPayload,
  },
  substrate: {
    label: "Substrates",
    entity: DimensionalLetterMaterial,
    nameField: "material_name",
    transform: toSubstratePayload,
  },
  sign_lighting: {
    label: "Sign Lighting",
    entity: SignLightingInventory,
    nameField: "item_name",
    transform: toLightingPayload,
  },
  sign_hardware: {
    label: "Hardware",
    entity: SignHardwareInventory,
    nameField: "item_name",
    transform: toHardwarePayload,
  },
  labor_service: {
    label: "Labor & Services",
    entity: LaborServiceInventory,
    nameField: "service_name",
    transform: toLaborServicePayload,
  },
  sign_parts_supplies: {
    label: "Sign Parts | Supplies",
    entity: SignPartsSuppliesInventory,
    nameField: "item_name",
    transform: toSignPartsSuppliesPayload,
  },
};

export const routeRow = (row) => {
  const target = detectTarget(row);
  const conf = TARGETS[target];
  const payload = conf.transform(row);
  return {
    target_key: target,
    target_label: conf.label,
    nameField: conf.nameField,
    name: payload[conf.nameField],
    payload,
  };
};

// ----------------------------------------------------------------------------
// File validation
// ----------------------------------------------------------------------------

export const REQUIRED_COLUMNS = [
  "Part Name",
  "Part Group",
  "Part Cost",
  "Is Active",
];

export const validateColumns = (headers) => {
  const set = new Set(headers.map((h) => cleanStr(h)));
  const missing = REQUIRED_COLUMNS.filter((c) => !set.has(c));
  return { ok: missing.length === 0, missing };
};