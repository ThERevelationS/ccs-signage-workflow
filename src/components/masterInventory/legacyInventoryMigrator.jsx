// Legacy-row migrator for the `Inventory` entity.
//
// Older imports wrote everything (permits, labor, trim cap, sheet/plate stock,
// aluminum panels) to the `Inventory` entity using free-form `material_type`
// values that aren't in the current enum. This module identifies those rows
// and moves them to the correct entity, then deletes the original.
//
// Classification is based on:
//   • `material_type` — free-form bucket from the legacy importer
//     (e.g. "Permitting Fees", "Labor - Other", "Linear").
//   • `product_type`  — usually carries the actual item name.
//
// A row is considered LEGACY JUNK if its `material_type` is not in the current
// Inventory enum (Aluminum/Steel/Stainless_Steel/Galvanized_Steel/Brass/Copper/
// Plastic/Other) OR its `product_type` is not in the current enum (Angle/
// Channel/Tube_Square/Tube_Round/Flat_Bar/Round_Bar/Sheet/Plate/I_Beam/H_Beam/
// Pipe/Other).

import {
  LaborServiceInventory,
  SignPartsSuppliesInventory,
  DimensionalLetterMaterial,
  Inventory,
} from "@/entities/all";

const VALID_MATERIAL_TYPES = new Set([
  "Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel",
  "Brass", "Copper", "Plastic", "Other",
]);

// The extrusion product types we actually want to KEEP in Inventory. Sheet and
// Plate are excluded here because they should live in Substrates (DimensionalLetterMaterial).
const VALID_EXTRUSION_PRODUCT_TYPES = new Set([
  "Angle", "Channel", "Tube_Square", "Tube_Round",
  "Flat_Bar", "Round_Bar", "I_Beam", "H_Beam", "Pipe",
]);

// Classify a single legacy row → which entity does it belong in?
export function classifyLegacyRow(row) {
  const mt = String(row.material_type || "").toLowerCase();
  const pt = String(row.product_type || "").toLowerCase();
  const supplier = String(row.supplier || "").toLowerCase();
  const haystack = `${mt} ${pt} ${supplier}`;

  if (/permit|zoning|inspection/.test(haystack)) return "labor_service";
  if (/labor|fabrication labor|install labor/.test(haystack)) return "labor_service";
  if (/engineering|design fee|consulting/.test(haystack)) return "labor_service";
  if (/freight|delivery|crane/.test(haystack)) return "labor_service";

  if (/trim cap|j[-\s]?bar|retainer|raceway cover|edge trim/.test(haystack)) return "sign_parts_supplies";
  if (/paint|primer|sealant|adhesive|cleaner|solvent|abrasive/.test(haystack)) return "sign_parts_supplies";

  if (/sheet|plate|panel|sintra|acrylic|pvc|acm|dibond|polycarbonate|lexan|styrene/.test(haystack)) return "substrate";
  // Plastic stock with no specific product type → Substrate
  if (mt === "plastic" && !VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type)) return "substrate";

  // Anything that's clearly a valid extrusion stays put
  if (VALID_MATERIAL_TYPES.has(row.material_type) &&
      VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type)) {
    return "keep";
  }

  // Default: leave it where it is — admin can review manually
  return "keep";
}

// Build the target-entity payload for a row given its classification.
function buildPayload(row, target) {
  const name = row.product_type || row.material_type || "Imported Item";
  const cost = parseFloat(row.cost_per_unit) || 0;

  if (target === "labor_service") {
    const mt = String(row.material_type || "").toLowerCase();
    const isPermit = /permit|zoning|inspection/.test(mt + " " + row.product_type);
    return {
      service_name: name,
      service_category: isPermit ? "permitting" : "subcontractor_labor",
      pricing_mode: isPermit ? "flat" : "per_hour",
      default_rate: cost,
      vendor_name: row.supplier || "",
      notes: row.notes || "",
      is_active: true,
    };
  }

  if (target === "sign_parts_supplies") {
    const pt = String(row.product_type || "").toLowerCase();
    let category = "shop_consumable";
    if (/trim cap/.test(pt)) category = "trim_cap";
    else if (/j[-\s]?bar/.test(pt)) category = "j_bar";
    else if (/retainer/.test(pt)) category = "retainer";
    else if (/raceway cover/.test(pt)) category = "raceway_cover";
    else if (/edge trim/.test(pt)) category = "edge_trim";
    else if (/paint/.test(pt)) category = "paint_ink";

    let pricing_mode = "per_piece";
    if (row.unit_type === "per_foot") pricing_mode = "per_foot";
    else if (row.unit_type === "per_sqft") pricing_mode = "per_sqft";

    return {
      item_name: name,
      category,
      size: row.size || "",
      pricing_mode,
      cost_per_unit: cost,
      supplier: row.supplier || "",
      notes: row.notes || "",
      is_active: true,
    };
  }

  if (target === "substrate") {
    // Try to read a thickness from "1/2", ".040", "0.125", etc.
    const thickMatch = String(row.product_type + " " + row.size + " " + (row.thickness_gauge || "")).match(/(\d*\.?\d+)/);
    const thickness = thickMatch ? parseFloat(thickMatch[1]) : 0.125;

    // Crude material_type mapping
    const mt = String(row.material_type || "").toLowerCase();
    const pt = String(row.product_type || "").toLowerCase();
    let material_type = "aluminum_sheet";
    if (mt === "aluminum" || /aluminum/.test(pt)) material_type = "aluminum_sheet";
    else if (/steel/.test(mt) || /steel/.test(pt)) material_type = "steel_sheet";
    else if (/stainless/.test(mt + " " + pt)) material_type = "stainless_sheet";
    else if (/galvanized/.test(mt + " " + pt)) material_type = "galvanized_sheet";
    else if (mt === "plastic" || /acrylic|pvc|sintra|acm|dibond|polycarbonate|lexan|styrene/.test(pt)) {
      if (/acrylic/.test(pt)) material_type = "acrylic";
      else if (/pvc|sintra/.test(pt)) material_type = "pvc";
      else if (/acm|dibond|alumalite/.test(pt)) material_type = "aluminum_composite";
      else if (/polycarbonate|lexan/.test(pt)) material_type = "polycarbonate";
      else if (/styrene/.test(pt)) material_type = "styrene";
      else material_type = "pvc";
    }

    return {
      material_name: name,
      material_type,
      thickness_inches: thickness,
      sheet_length_inches: 96,
      sheet_width_inches: 48,
      cost_per_sheet: cost > 0 && row.unit_type === "per_piece" ? cost : cost * 32, // 4x8 = 32 sqft
      supplier: row.supplier || "",
      notes: row.notes || "",
      is_active: true,
    };
  }

  return null;
}

const TARGET_ENTITY = {
  labor_service: LaborServiceInventory,
  sign_parts_supplies: SignPartsSuppliesInventory,
  substrate: DimensionalLetterMaterial,
};

// Run the migration. Returns counts by target.
export async function migrateLegacyInventoryRows(allInventoryRows, { onProgress } = {}) {
  const summary = { labor_service: 0, sign_parts_supplies: 0, substrate: 0, kept: 0, errors: 0 };
  const rowsToMigrate = allInventoryRows
    .map((r) => ({ row: r, target: classifyLegacyRow(r) }))
    .filter((x) => x.target !== "keep");

  for (let i = 0; i < rowsToMigrate.length; i++) {
    const { row, target } = rowsToMigrate[i];
    try {
      const payload = buildPayload(row, target);
      if (payload) {
        await TARGET_ENTITY[target].create(payload);
        await Inventory.delete(row.id);
        summary[target] += 1;
      }
    } catch (err) {
      console.error("Migration failed for row", row.id, err);
      summary.errors += 1;
    }
    onProgress?.({ done: i + 1, total: rowsToMigrate.length });
  }

  summary.kept = allInventoryRows.length - rowsToMigrate.length;
  return summary;
}

// Quick scan — returns counts without writing.
export function previewLegacyMigration(allInventoryRows) {
  const counts = { labor_service: 0, sign_parts_supplies: 0, substrate: 0, keep: 0 };
  allInventoryRows.forEach((r) => {
    counts[classifyLegacyRow(r)] += 1;
  });
  return counts;
}

export { VALID_MATERIAL_TYPES, VALID_EXTRUSION_PRODUCT_TYPES };