import { base44 } from "@/api/base44Client";
import { ensureBuilderProductForLine } from "@/components/estimator/builder/builderService";
import { pricingSnapshot } from "@/components/estimator/builder/partSync";
import { inventoryRowName, inventorySubtype, inventoryUnit, inventoryUnitCost, loadMasterPartCatalog } from "./partCatalog";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const stable = (value) => JSON.stringify(value || {});

async function nextRevisionNumber(builderProductId) {
  const rows = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId });
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

async function patchEstimateLine(builder, patch) {
  if (!builder?.estimate_id) return;
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id).catch(() => null);
  if (!estimate) return;
  const lineItems = (estimate.line_items || []).map((line) => {
    if (line.builder_product_id !== builder.id) return line;
    const resolvedPatch = typeof patch === "function" ? patch(line) : patch;
    return { ...line, ...resolvedPatch };
  });
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
}

export async function createCustomProduct({ estimate, name = "Custom Product" }) {
  if (!estimate?.id) throw new Error("Estimate is required.");
  const provisionalLine = {
    module_key: "custom",
    project_id: "",
    project_name: name,
    builder_name: "Custom Product",
    client_product_name: name,
    product_category: "",
    client_name: estimate.client_name,
    total_snapshot: 0,
    live_total_snapshot: 0,
    customer_price_snapshot: 0,
    live_customer_price_snapshot: 0,
    price_state: "current",
    adjustment_percent: 0,
    section_status: "in_progress",
    customer_quantity: 1,
    include_in_customer: true,
    owned: true,
    linked_date: nowIso(),
  };
  const result = await ensureBuilderProductForLine({ estimate, line: provisionalLine, isNew: true });
  await base44.entities.BuilderProduct.update(result.builderProduct.id, {
    module_key: "custom",
    builder_name: "Custom Product",
    client_product_name: name,
    product_category: "",
    price_state: "current",
    frozen_cost: 0,
    frozen_customer_price: 0,
    current_recalculated_cost: 0,
    notes: "Blank / Custom Product. Pricing is driven directly by its Parts rather than a dedicated estimator Builder.",
  });
  return { ...result, line: { ...result.line, price_state: "current" } };
}

export async function addCatalogPartToProduct({ builderProductId, catalogItem, quantity = 1 }) {
  if (!builderProductId || !catalogItem?.inventoryId) throw new Error("Select a Master Inventory Part.");
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  const qty = Math.max(0, num(quantity, 1));
  const unitCost = num(catalogItem.unitCost);
  const extended = qty * unitCost;
  const timestamp = nowIso();
  const existingParts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  const activeParts = (existingParts || []).filter((part) => part.is_active !== false);
  const isCustomProduct = builder.module_key === "custom";
  const syncState = isCustomProduct ? "manual" : "manual_addon";
  const created = await base44.entities.BuilderPart.create({
    builder_product_id: builderProductId,
    part_key: `manual-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    sort_order: activeParts.length,
    part_name: catalogItem.name,
    part_type: catalogItem.categoryKey,
    part_subtype: catalogItem.subtype || catalogItem.categoryKey,
    source_module_key: builder.module_key || "custom",
    source_path: "",
    builder_sync_state: syncState,
    inventory_entity: catalogItem.entity,
    inventory_item_id: catalogItem.inventoryId,
    original_inventory_item_id: catalogItem.inventoryId,
    inventory_item_name: catalogItem.name,
    inventory_link_state: "attached",
    frozen_inventory_snapshot: catalogItem.row,
    current_inventory_snapshot: catalogItem.row,
    detail_overrides: {},
    builder_data: { catalog_category: catalogItem.categoryKey, catalog_category_label: catalogItem.categoryLabel },
    calculation_snapshot: { quantity: qty, unit_cost: unitCost, extended_cost: extended },
    pricing_basis_snapshot: { pricing_mode: catalogItem.pricingMode, inventory_pricing: catalogItem.pricingSnapshot },
    quantity: qty,
    unit: catalogItem.unit,
    frozen_unit_cost: unitCost,
    frozen_extended_cost: extended,
    current_unit_cost: unitCost,
    current_extended_cost: extended,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    inventory_updated_date_snapshot: catalogItem.row?.updated_date || "",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    manual_cost_override: false,
    is_active: true,
  });

  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + extended;
  const nextCustomerPrice = previousCustomerPrice + extended;
  await base44.entities.BuilderProduct.update(builderProductId, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: num(builder.current_recalculated_cost, previousTotal) + extended,
    part_count: activeParts.length + 1,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });
  await patchEstimateLine(builder, (line) => ({
    total_snapshot: nextTotal,
    live_total_snapshot: nextTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + extended,
    price_state: "current",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  }));

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builderProductId,
    estimate_id: builder.estimate_id || "",
    revision_number: await nextRevisionNumber(builderProductId),
    reason: previousTotal === 0 && activeParts.length === 0 ? "initial_freeze" : "manual_adjustment",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: [{ part_id: created.id, part_name: created.part_name, action: "add_part", unit_cost: unitCost, quantity: qty, extended_cost: extended, inventory_entity: catalogItem.entity, inventory_item_id: catalogItem.inventoryId }],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal },
    price_snapshot_after: { total: nextTotal },
    notes: `${isCustomProduct ? "Added" : "Added independent add-on"} ${catalogItem.name} from Master Inventory.`,
  });
  return created;
}

export async function updateManualProductPart(partId, changes = {}) {
  const part = await base44.entities.BuilderPart.get(partId).catch(() => null);
  if (!part) throw new Error("Part not found.");
  if (!["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be edited directly here.");
  const builder = await base44.entities.BuilderProduct.get(part.builder_product_id);
  const previousExtended = num(part.frozen_extended_cost);
  const quantity = changes.quantity !== undefined ? Math.max(0, num(changes.quantity)) : num(part.quantity, 1);
  const unitCost = changes.frozen_unit_cost !== undefined ? num(changes.frozen_unit_cost) : num(part.frozen_unit_cost);
  const extended = quantity * unitCost;
  const delta = extended - previousExtended;
  const timestamp = nowIso();
  const previousDetailOverrides = part.detail_overrides || {};
  const nextDetailOverrides = changes.detail_overrides !== undefined ? { ...(changes.detail_overrides || {}) } : previousDetailOverrides;
  const costWasManuallyChanged = changes.frozen_unit_cost !== undefined && Math.abs(unitCost - num(part.frozen_unit_cost)) > 0.000001;
  await base44.entities.BuilderPart.update(partId, {
    part_name: changes.part_name !== undefined ? String(changes.part_name || "Part") : part.part_name,
    client_label: changes.client_label !== undefined ? String(changes.client_label || "") : part.client_label,
    quantity,
    unit: changes.unit !== undefined ? String(changes.unit || "") : part.unit,
    frozen_unit_cost: unitCost,
    frozen_extended_cost: extended,
    current_unit_cost: costWasManuallyChanged ? unitCost : num(part.current_unit_cost, unitCost),
    current_extended_cost: costWasManuallyChanged ? extended : num(part.current_unit_cost, unitCost) * quantity,
    manual_cost_override: part.manual_cost_override || costWasManuallyChanged,
    manual_cost: (part.manual_cost_override || costWasManuallyChanged) ? extended : undefined,
    detail_overrides: nextDetailOverrides,
    price_state: costWasManuallyChanged ? "manual" : part.price_state,
    notes: changes.notes !== undefined ? String(changes.notes || "") : part.notes,
    last_price_update_at: timestamp,
  });
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + delta;
  const nextCustomerPrice = previousCustomerPrice + delta;
  const currentTotal = num(builder.current_recalculated_cost, previousTotal) + delta;
  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    price_state: Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current",
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });
  await patchEstimateLine(builder, (line) => ({
    total_snapshot: nextTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + delta,
    price_state: Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current",
    last_price_update_at: timestamp,
  }));
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: [{ part_id: part.id, part_name: changes.part_name || part.part_name, action: "edit_manual_part", previous_extended_cost: previousExtended, new_extended_cost: extended, delta, previous_detail_overrides: previousDetailOverrides, new_detail_overrides: nextDetailOverrides }],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal },
    price_snapshot_after: { total: nextTotal },
    notes: "Manual / Custom Product Part edited.",
  });
  return base44.entities.BuilderPart.get(partId);
}

export async function switchManualProductPart(partId, catalogItem) {
  if (!partId || !catalogItem?.inventoryId) throw new Error("Select a replacement Master Inventory Part.");
  const part = await base44.entities.BuilderPart.get(partId).catch(() => null);
  if (!part || !["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be switched directly.");
  const builder = await base44.entities.BuilderProduct.get(part.builder_product_id);
  const quantity = num(part.quantity, 1);
  const previousExtended = num(part.frozen_extended_cost);
  const unitCost = num(catalogItem.unitCost);
  const nextExtended = quantity * unitCost;
  const delta = nextExtended - previousExtended;
  const timestamp = nowIso();
  await base44.entities.BuilderPart.update(part.id, {
    part_name: catalogItem.name,
    part_type: catalogItem.categoryKey,
    part_subtype: catalogItem.subtype || catalogItem.categoryKey,
    inventory_entity: catalogItem.entity,
    inventory_item_id: catalogItem.inventoryId,
    original_inventory_item_id: catalogItem.inventoryId,
    inventory_item_name: catalogItem.name,
    inventory_link_state: "attached",
    reattach_candidate_id: "",
    reattach_candidate_name: "",
    frozen_inventory_snapshot: catalogItem.row,
    current_inventory_snapshot: catalogItem.row,
    detail_overrides: {},
    builder_data: { ...(part.builder_data || {}), catalog_category: catalogItem.categoryKey, catalog_category_label: catalogItem.categoryLabel },
    pricing_basis_snapshot: { pricing_mode: catalogItem.pricingMode, inventory_pricing: catalogItem.pricingSnapshot },
    unit: catalogItem.unit,
    frozen_unit_cost: unitCost,
    frozen_extended_cost: nextExtended,
    current_unit_cost: unitCost,
    current_extended_cost: nextExtended,
    manual_cost_override: false,
    manual_cost: undefined,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    inventory_updated_date_snapshot: catalogItem.row?.updated_date || "",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  });
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + delta;
  const nextCustomerPrice = previousCustomerPrice + delta;
  const currentTotal = num(builder.current_recalculated_cost, previousTotal) + delta;
  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    price_state: Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current",
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });
  await patchEstimateLine(builder, (line) => ({ total_snapshot: nextTotal, live_total_snapshot: currentTotal, customer_price_snapshot: nextCustomerPrice, live_customer_price_snapshot: liveCustomerUnitPrice(line) + delta, price_state: Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current", last_price_update_at: timestamp, last_price_check_at: timestamp }));
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: [{ part_id: part.id, action: "switch_part", previous_inventory_item_id: part.inventory_item_id, new_inventory_item_id: catalogItem.inventoryId, previous_inventory_name: part.inventory_item_name, new_inventory_name: catalogItem.name, previous_extended_cost: previousExtended, new_extended_cost: nextExtended, delta, cleared_detail_overrides: part.detail_overrides || {} }],
    builder_snapshot_before: builder.builder_snapshot || {}, builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal }, price_snapshot_after: { total: nextTotal },
    notes: `Switched independent Product Part to ${catalogItem.name}.`,
  });
  return base44.entities.BuilderPart.get(part.id);
}

export async function removeManualProductPart(partId) {
  const part = await base44.entities.BuilderPart.get(partId).catch(() => null);
  if (!part || !["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be removed directly.");
  const builder = await base44.entities.BuilderProduct.get(part.builder_product_id);
  const previousExtended = num(part.frozen_extended_cost);
  const previousCurrent = num(part.current_extended_cost, previousExtended);
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = Math.max(0, previousTotal - previousExtended);
  const nextCustomerPrice = Math.max(0, previousCustomerPrice - previousExtended);
  const currentTotal = Math.max(0, num(builder.current_recalculated_cost, previousTotal) - previousCurrent);
  const timestamp = nowIso();
  await base44.entities.BuilderPart.delete(part.id);
  let groupCount = num(builder.group_count);
  if (part.part_group_id) {
    const remaining = await base44.entities.BuilderPart.filter({ part_group_id: part.part_group_id }).catch(() => []);
    if (!(remaining || []).some((row) => row.is_active !== false)) {
      await base44.entities.BuilderPartGroup.delete(part.part_group_id).catch(() => null);
      groupCount = Math.max(0, groupCount - 1);
    }
  }
  const remainingParts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
  const priceState = Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current";
  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    part_count: (remainingParts || []).filter((row) => row.is_active !== false).length,
    group_count: groupCount,
    price_state: priceState,
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });
  await patchEstimateLine(builder, (line) => ({ total_snapshot: nextTotal, live_total_snapshot: currentTotal, customer_price_snapshot: nextCustomerPrice, live_customer_price_snapshot: Math.max(0, liveCustomerUnitPrice(line) - previousCurrent), price_state: priceState, last_price_update_at: timestamp }));
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: [{ part_id: part.id, part_name: part.part_name, action: "remove_part", previous_extended_cost: previousExtended }],
    builder_snapshot_before: builder.builder_snapshot || {}, builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal }, price_snapshot_after: { total: nextTotal },
    notes: `Removed independent Product Part ${part.part_name}.`,
  });
}

export async function refreshManualProductPricing(builderProductId) {
  if (!builderProductId) return null;
  const builder = await base44.entities.BuilderProduct.get(builderProductId).catch(() => null);
  if (!builder) return null;
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  const active = (parts || []).filter((part) => part.is_active !== false);
  const catalog = await loadMasterPartCatalog();
  const catalogByKey = new Map(catalog.map((item) => [`${item.entity}:${item.inventoryId}`, item]));
  let currentTotal = 0;
  let detachedCount = 0;
  let changedCount = 0;
  const timestamp = nowIso();
  for (const part of active) {
    let currentUnit = num(part.frozen_unit_cost);
    let currentExtended = num(part.frozen_extended_cost);
    let state = part.price_state || "current";
    let linkState = part.inventory_link_state || "manual";
    let currentSnapshot = part.current_inventory_snapshot || {};
    let candidate = null;
    if (part.inventory_entity && part.inventory_item_id && !part.manual_cost_override) {
      const item = catalogByKey.get(`${part.inventory_entity}:${part.inventory_item_id}`);
      if (item) {
        currentUnit = inventoryUnitCost(item.entity, item.row);
        currentExtended = currentUnit * num(part.quantity, 1);
        currentSnapshot = item.row;
        linkState = "attached";
        const changed = Math.abs(currentExtended - num(part.frozen_extended_cost)) > 0.005 || stable(pricingSnapshot(item.row)) !== stable(pricingSnapshot(part.frozen_inventory_snapshot));
        state = changed ? "changed" : "current";
        if (changed) changedCount += 1;
      } else {
        const name = part.inventory_item_name || inventoryRowName(part.inventory_entity, part.frozen_inventory_snapshot || {});
        candidate = catalog.find((item) => item.entity === part.inventory_entity && item.name.trim().toLowerCase() === String(name || "").trim().toLowerCase()) || null;
        linkState = candidate ? "reattach_available" : "detached";
        state = "detached";
        detachedCount += 1;
      }
    }
    currentTotal += currentExtended;
    await base44.entities.BuilderPart.update(part.id, {
      current_unit_cost: currentUnit,
      current_extended_cost: currentExtended,
      current_inventory_snapshot: currentSnapshot,
      inventory_link_state: linkState,
      reattach_candidate_id: candidate?.inventoryId || part.reattach_candidate_id || "",
      reattach_candidate_name: candidate?.name || part.reattach_candidate_name || "",
      price_state: state,
      price_delta: currentExtended - num(part.frozen_extended_cost),
      price_delta_percent: num(part.frozen_extended_cost) ? ((currentExtended - num(part.frozen_extended_cost)) / num(part.frozen_extended_cost)) * 100 : 0,
      last_price_check_at: timestamp,
    });
  }
  const frozenTotal = active.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const priceState = detachedCount > 0 ? "detached_parts" : Math.abs(currentTotal - frozenTotal) > 0.005 || changedCount > 0 ? "changed" : "current";
  await base44.entities.BuilderProduct.update(builderProductId, {
    frozen_cost: frozenTotal,
    current_recalculated_cost: currentTotal,
    part_count: active.length,
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    price_state: priceState,
    price_delta: currentTotal - frozenTotal,
    price_delta_percent: frozenTotal ? ((currentTotal - frozenTotal) / frozenTotal) * 100 : 0,
    last_price_check_at: timestamp,
  });
  const frozenCustomerPrice = num(builder.frozen_customer_price, frozenTotal);
  await patchEstimateLine(builder, {
    total_snapshot: frozenTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: frozenCustomerPrice + (currentTotal - frozenTotal),
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    price_state: priceState,
    last_price_check_at: timestamp,
  });
  return { frozenTotal, currentTotal, detachedCount, changedCount, priceState };
}
