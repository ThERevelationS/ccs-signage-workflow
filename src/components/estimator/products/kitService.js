import { staffEntities } from "@/components/staff/staffEntities";
import { addBlankProduct } from "@/components/estimator/products/blankProductService";
import { createBuilderPartWithRecovery } from "@/components/estimator/builder/builderPartPersistence";

const clean = (v) => String(v ?? "").trim();
const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const componentName = (row) =>
  [clean(row?.material_type), clean(row?.product_type), clean(row?.size)].filter(Boolean).join(" · ") || "Item";

export function kitLabel(kit) {
  return [clean(kit?.size), clean(kit?.material_type), clean(kit?.product_type)]
    .filter(Boolean).join(" · ") || clean(kit?.notes) || "Inventory Kit";
}

export async function listInventoryKits() {
  const rows = await staffEntities.Inventory.filter({ is_kit: true }, undefined, 100);
  if (!Array.isArray(rows)) throw new Error("Kit lookup did not return a record list.");
  return rows
    .filter((r) => r?.deleted !== true && r?.legacy_compatibility !== true)
    .map((r) => ({ ...r, kit_items: (Array.isArray(r?.kit_items) ? r.kit_items : []).filter((k) => clean(k?.inventory_item_id)) }))
    .filter((r) => r.kit_items.length > 0);
}

async function kitComponents(kit) {
  const items = (kit?.kit_items || [])
    .map((k) => ({ id: clean(k?.inventory_item_id), qty: num(k?.quantity, 1) }))
    .filter((k) => k.id && k.qty > 0);
  const resolved = [];
  for (const item of items.slice(0, 50)) {
    const row = await staffEntities.Inventory.get(item.id);
    resolved.push({ ...item, row });
  }
  return resolved;
}

export function kitComponentSum(components = []) {
  return components.reduce((sum, c) => sum + num(c?.row?.cost_per_unit) * c.qty, 0);
}

export function kitEffectivePrice(kit, components = []) {
  const explicit = num(kit?.kit_price, NaN);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : kitComponentSum(components);
}

// #118 — expand a kit row into one custom Product whose Parts mirror the kit's
// component inventory lines. Summed component pricing is the default; an
// explicit kit_price lands as an additional manual adjustment Part so the
// Product total equals the kit price without corrupting component costs.
export async function addKitToEstimate({ estimateId, kit, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !kit?.id) throw new Error("Estimate and kit are required.");
  const components = await kitComponents(kit);
  if (!components.length) throw new Error("This kit has no usable components.");
  const missing = components.find((c) => !c.row?.id || c.row?.deleted === true);
  if (missing) throw new Error(`Kit component ${missing.id} is no longer in the Master Inventory. Reload before adding this kit.`);

  const label = kitLabel(kit);
  const result = await addBlankProduct({
    estimateId,
    moduleKey: "custom",
    sourceEntity: "",
    productName: `Kit: ${label}`,
    builderName: "Inventory Kit",
    isCustom: true,
    expectedEstimateUpdatedAt,
  });
  const product = result?.builderProduct;
  if (!product?.id) return result;

  const explicit = num(kit?.kit_price, NaN);
  const componentSum = kitComponentSum(components);
  const lines = components.map((c, index) => ({
    builder_product_id: product.id,
    part_key: `kit_${clean(kit.id)}_component_${index}_${clean(c.id)}`,
    part_name: componentName(c.row),
    quantity: c.qty,
    unit: clean(c.row?.unit_type) || "each",
    frozen_unit_cost: num(c.row?.cost_per_unit),
    inventory_entity: "Inventory",
    inventory_item_id: clean(c.id),
    inventory_item_name: componentName(c.row),
    inventory_link_state: "attached",
    frozen_inventory_snapshot: c.row,
    builder_data: { kit_id: clean(kit.id), kit_component: true },
    sort_order: index,
  }));
  if (Number.isFinite(explicit) && explicit > 0 && Math.abs(explicit - componentSum) > 0.005) {
    lines.push({
      builder_product_id: product.id,
      part_key: `kit_${clean(kit.id)}_price_adjustment`,
      part_name: `${label} — kit price adjustment`,
      quantity: 1,
      unit: "each",
      frozen_unit_cost: explicit - componentSum,
      inventory_entity: "",
      inventory_item_id: "",
      inventory_link_state: "manual",
      builder_data: { kit_id: clean(kit.id), kit_price_adjustment: true, kit_price: explicit },
      sort_order: components.length,
    });
  }
  for (const data of lines) {
    await createBuilderPartWithRecovery({
      entity: staffEntities.BuilderPart,
      data,
      label: `Kit Part ${data.part_name}`,
    });
  }
  return result;
}