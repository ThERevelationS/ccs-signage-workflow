import { base44 } from "@/api/base44Client";
import { ensureBuilderProductForLine } from "@/components/estimator/builder/builderService";
import { applyBuilderPartPriceAcceptancePlan, pricingSnapshot } from "@/components/estimator/builder/partSync";
import { inventoryRowName, inventoryUnitCost, loadMasterPartCatalog } from "./partCatalog";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { builderMutationHash, markBuilderMutationPending, pendingBuilderMutation, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const stable = (value) => JSON.stringify(value || {});

async function nextRevisionNumber(builderProductId) {
  const rows = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId });
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

function estimateLineForBuilder(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

async function loadManualMutationContext(builderProductId, expectedEstimateUpdatedAt = "") {
  if (!builderProductId) throw new Error("Product is required.");
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const line = estimateLineForBuilder(estimate, builder.id);
  if (!line) throw new Error("This Product is no longer part of the estimate. Reload before changing its Parts.");
  return { builder, estimate, line };
}

async function loadRawManualMutationContext(builderProductId) {
  if (!builderProductId) throw new Error("Product is required.");
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const line = estimateLineForBuilder(estimate, builder.id);
  if (!line) throw new Error("This Product is no longer part of the estimate. Reload before changing its Parts.");
  return { builder, estimate, line, pending: pendingBuilderMutation(line) };
}

async function resumeStoredManualPartMutation({ builder, estimate, line, pending }) {
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
  if (!Array.isArray(parts)) throw new Error("Builder Parts could not be verified while resuming the manual Part mutation.");
  return resumeBuilderMutation({
    estimateId: estimate.id,
    estimate,
    builder,
    parts,
    line,
    pending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
}

function manualPartChangesAlreadyApplied(part, changes = {}) {
  if (!part || !["manual", "manual_addon"].includes(part.builder_sync_state)) return false;
  if (changes.part_name !== undefined && String(part.part_name || "") !== String(changes.part_name || "Part")) return false;
  if (changes.client_label !== undefined && String(part.client_label || "") !== String(changes.client_label || "")) return false;
  if (changes.quantity !== undefined && Math.abs(num(part.quantity) - Math.max(0, num(changes.quantity))) > 0.000001) return false;
  if (changes.unit !== undefined && String(part.unit || "") !== String(changes.unit || "")) return false;
  if (changes.frozen_unit_cost !== undefined && Math.abs(num(part.frozen_unit_cost) - num(changes.frozen_unit_cost)) > 0.000001) return false;
  if (changes.detail_overrides !== undefined && stable(part.detail_overrides || {}) !== stable(changes.detail_overrides || {})) return false;
  if (changes.notes !== undefined && String(part.notes || "") !== String(changes.notes || "")) return false;
  return true;
}

function patchedEstimateLines(estimate, builderProductId, patch) {
  return (estimate.line_items || []).map((line) => {
    if (line.builder_product_id !== builderProductId) return line;
    const resolvedPatch = typeof patch === "function" ? patch(line) : patch;
    return { ...line, ...resolvedPatch };
  });
}

async function patchVerifiedEstimateLine(estimate, builder, patch) {
  const lineItems = patchedEstimateLines(estimate, builder.id, patch);
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
  return lineItems.find((line) => line.builder_product_id === builder.id) || null;
}

function assertLoadedPartVersion(part, expectedPartUpdatedAt = "") {
  const expected = String(expectedPartUpdatedAt || "").trim();
  const current = String(part?.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error("This Part changed in another session. Reload the Product before changing it.");
  }
}

async function verifyCatalogItem(catalogItem) {
  if (!catalogItem?.entity || !catalogItem?.inventoryId) throw new Error("Select a Master Inventory Part.");
  const row = await base44.entities[catalogItem.entity].get(catalogItem.inventoryId);
  if (!row) throw new Error("This Master Inventory Part no longer exists. Reopen the picker to refresh the catalog.");
  const expected = String(catalogItem.row?.updated_date || "").trim();
  const current = String(row.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error("This Master Inventory Part changed after the picker opened. Reopen the picker and review the latest cost/details before using it.");
  }
  return {
    ...catalogItem,
    name: inventoryRowName(catalogItem.entity, row),
    unitCost: inventoryUnitCost(catalogItem.entity, row),
    row,
    pricingSnapshot: pricingSnapshot(row),
  };
}

export async function createCustomProduct({ estimate, name = "Custom Product", expectedEstimateUpdatedAt = "" }) {
  if (!estimate?.id) throw new Error("Estimate is required.");
  const currentEstimate = await base44.entities.AllInOneEstimate.get(estimate.id);
  if (!currentEstimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(currentEstimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const provisionalLine = {
    module_key: "custom",
    project_id: "",
    project_name: name,
    builder_name: "Custom Product",
    client_product_name: name,
    product_category: "",
    client_name: currentEstimate.client_name,
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
  const result = await ensureBuilderProductForLine({ estimate: currentEstimate, line: provisionalLine, isNew: true });
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

export async function addCatalogPartToProduct({ builderProductId, catalogItem, quantity = 1, expectedEstimateUpdatedAt = "" }) {
  if (!builderProductId || !catalogItem?.inventoryId) throw new Error("Select a Master Inventory Part.");
  const context = await loadRawManualMutationContext(builderProductId);
  const { builder, estimate, line, pending } = context;
  if (pending) {
    if (pending.kind !== "builder_manual_part_add") {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before adding a Part.");
    }
    await resumeStoredManualPartMutation(context);
    const completedParts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
    const completed = (completedParts || []).find((part) => part.part_key === pending.target_part_key);
    if (!completed) throw new Error("The recovered manual Part could not be verified after completion.");
    return completed;
  }

  const qty = Math.max(0, num(quantity, 1));
  const requestVersion = String(expectedEstimateUpdatedAt || estimate.updated_date || "");
  const requestHash = builderMutationHash({
    builder_product_id: builder.id,
    expected_estimate_updated_at: requestVersion,
    inventory_entity: catalogItem.entity,
    inventory_item_id: catalogItem.inventoryId,
    quantity: qty,
  });
  const partKey = `manual-${requestHash}`;
  const existingParts = await base44.entities.BuilderPart.filter({ builder_product_id: builderProductId });
  if (!Array.isArray(existingParts) || existingParts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified before adding this Part.");
  }
  const alreadyCreated = existingParts.find((part) => part.part_key === partKey);
  if (alreadyCreated) return alreadyCreated;

  const liveCatalogItem = await verifyCatalogItem(catalogItem);
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const unitCost = num(liveCatalogItem.unitCost);
  const extended = qty * unitCost;
  const timestamp = nowIso();
  const activeParts = existingParts.filter((part) => part.is_active !== false);
  const isCustomProduct = builder.module_key === "custom";
  const syncState = isCustomProduct ? "manual" : "manual_addon";
  const partData = {
    builder_product_id: builder.id,
    part_key: partKey,
    sort_order: activeParts.length,
    part_name: liveCatalogItem.name,
    part_type: liveCatalogItem.categoryKey,
    part_subtype: liveCatalogItem.subtype || liveCatalogItem.categoryKey,
    source_module_key: builder.module_key || "custom",
    source_path: "",
    builder_sync_state: syncState,
    inventory_entity: liveCatalogItem.entity,
    inventory_item_id: liveCatalogItem.inventoryId,
    original_inventory_item_id: liveCatalogItem.inventoryId,
    inventory_item_name: liveCatalogItem.name,
    inventory_link_state: "attached",
    frozen_inventory_snapshot: liveCatalogItem.row,
    current_inventory_snapshot: liveCatalogItem.row,
    detail_overrides: {},
    builder_data: { catalog_category: liveCatalogItem.categoryKey, catalog_category_label: liveCatalogItem.categoryLabel },
    calculation_snapshot: { quantity: qty, unit_cost: unitCost, extended_cost: extended },
    pricing_basis_snapshot: { pricing_mode: liveCatalogItem.pricingMode, inventory_pricing: liveCatalogItem.pricingSnapshot },
    quantity: qty,
    unit: liveCatalogItem.unit,
    frozen_unit_cost: unitCost,
    frozen_extended_cost: extended,
    current_unit_cost: unitCost,
    current_extended_cost: extended,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    inventory_updated_date_snapshot: liveCatalogItem.row?.updated_date || "",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    manual_cost_override: false,
    is_active: true,
  };
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + extended;
  const nextCustomerPrice = previousCustomerPrice + extended;
  const builderPatch = {
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
  };
  const linePatch = {
    total_snapshot: nextTotal,
    live_total_snapshot: nextTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + extended,
    price_state: "current",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  };
  const changedParts = [{ part_key: partKey, part_name: liveCatalogItem.name, action: "add_part", unit_cost: unitCost, quantity: qty, extended_cost: extended, inventory_entity: liveCatalogItem.entity, inventory_item_id: liveCatalogItem.inventoryId }];
  const recoveryMarker = {
    key: `builder_manual_part_add:${builder.id}:${requestHash}`,
    kind: "builder_manual_part_add",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_key: partKey,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    part_acceptance_plan: {
      timestamp,
      part_updates: [{ operation: "create", part_key: partKey, data: partData }],
      changed_parts: changedParts,
      active_part_count: activeParts.length + 1,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: builder.estimate_id || "",
      reason: previousTotal === 0 && activeParts.length === 0 ? "initial_freeze" : "manual_adjustment",
      previous_total_cost: previousTotal,
      new_total_cost: nextTotal,
      previous_customer_price: previousCustomerPrice,
      new_customer_price: nextCustomerPrice,
      changed_parts: changedParts,
      builder_snapshot_before: builder.builder_snapshot || {},
      builder_snapshot_after: builder.builder_snapshot || {},
      price_snapshot_before: { total: previousTotal },
      price_snapshot_after: { total: nextTotal },
      notes: `${isCustomProduct ? "Added" : "Added independent add-on"} ${liveCatalogItem.name} from Master Inventory.`,
    },
  };

  const marked = await markBuilderMutationPending({ estimate, builder, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
  const completedParts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
  const completed = (completedParts || []).find((part) => part.part_key === partKey);
  if (!completed) throw new Error("The added manual Part could not be verified after completion.");
  return completed;
}

export async function updateManualProductPart(partId, changes = {}, { expectedEstimateUpdatedAt = "", expectedPartUpdatedAt = "" } = {}) {
  const part = await base44.entities.BuilderPart.get(partId);
  if (!part) throw new Error("Part not found.");
  if (!["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be edited directly here.");
  const context = await loadRawManualMutationContext(part.builder_product_id);
  const { builder, estimate, line, pending } = context;
  if (pending) {
    if (pending.kind !== "builder_manual_part_edit" || String(pending.target_part_id || "") !== String(part.id)) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before editing this Part.");
    }
    await resumeStoredManualPartMutation(context);
    return base44.entities.BuilderPart.get(part.id);
  }
  if (manualPartChangesAlreadyApplied(part, changes)) return part;
  assertLoadedPartVersion(part, expectedPartUpdatedAt);
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });

  const previousExtended = num(part.frozen_extended_cost);
  const quantity = changes.quantity !== undefined ? Math.max(0, num(changes.quantity)) : num(part.quantity, 1);
  const unitCost = changes.frozen_unit_cost !== undefined ? num(changes.frozen_unit_cost) : num(part.frozen_unit_cost);
  const extended = quantity * unitCost;
  const delta = extended - previousExtended;
  const timestamp = nowIso();
  const previousDetailOverrides = part.detail_overrides || {};
  const nextDetailOverrides = changes.detail_overrides !== undefined ? { ...(changes.detail_overrides || {}) } : previousDetailOverrides;
  const costWasManuallyChanged = changes.frozen_unit_cost !== undefined && Math.abs(unitCost - num(part.frozen_unit_cost)) > 0.000001;
  const partPatch = {
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
  };
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + delta;
  const nextCustomerPrice = previousCustomerPrice + delta;
  const currentTotal = num(builder.current_recalculated_cost, previousTotal) + delta;
  const priceState = Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current";
  const builderPatch = {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    price_state: priceState,
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  };
  const linePatch = {
    total_snapshot: nextTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + delta,
    price_state: priceState,
    last_price_update_at: timestamp,
  };
  const changedParts = [{ part_id: part.id, part_name: partPatch.part_name, action: "edit_manual_part", previous_extended_cost: previousExtended, new_extended_cost: extended, delta, previous_detail_overrides: previousDetailOverrides, new_detail_overrides: nextDetailOverrides }];
  const requestHash = builderMutationHash({
    estimate_updated_date: expectedEstimateUpdatedAt || estimate.updated_date || "",
    part_id: part.id,
    part_updated_date: expectedPartUpdatedAt || part.updated_date || "",
    changes,
    part_patch: partPatch,
  });
  const recoveryMarker = {
    key: `builder_manual_part_edit:${builder.id}:${part.id}:${requestHash}`,
    kind: "builder_manual_part_edit",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_id: part.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    part_acceptance_plan: {
      timestamp,
      part_updates: [{ operation: "update", part_id: part.id, part_key: part.part_key, expected_updated_date: part.updated_date || "", patch: partPatch }],
      changed_parts: changedParts,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: builder.estimate_id || "",
      reason: "manual_adjustment",
      previous_total_cost: previousTotal,
      new_total_cost: nextTotal,
      previous_customer_price: previousCustomerPrice,
      new_customer_price: nextCustomerPrice,
      changed_parts: changedParts,
      builder_snapshot_before: builder.builder_snapshot || {},
      builder_snapshot_after: builder.builder_snapshot || {},
      price_snapshot_before: { total: previousTotal },
      price_snapshot_after: { total: nextTotal },
      notes: "Manual / Custom Product Part edited.",
    },
  };
  const marked = await markBuilderMutationPending({ estimate, builder, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
  return base44.entities.BuilderPart.get(part.id);
}

export async function switchManualProductPart(partId, catalogItem, { expectedEstimateUpdatedAt = "", expectedPartUpdatedAt = "" } = {}) {
  if (!partId || !catalogItem?.inventoryId) throw new Error("Select a replacement Master Inventory Part.");
  const part = await base44.entities.BuilderPart.get(partId);
  if (!part || !["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be switched directly.");
  const context = await loadRawManualMutationContext(part.builder_product_id);
  const { builder, estimate, line, pending } = context;
  if (pending) {
    if (pending.kind !== "builder_manual_part_switch" || String(pending.target_part_id || "") !== String(part.id)) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before switching this Part.");
    }
    await resumeStoredManualPartMutation(context);
    return base44.entities.BuilderPart.get(part.id);
  }
  const targetInventoryMatches =
    String(part.inventory_entity || "") === String(catalogItem.entity || "") &&
    String(part.inventory_item_id || "") === String(catalogItem.inventoryId || "") &&
    part.manual_cost_override !== true;
  if (expectedPartUpdatedAt && String(part.updated_date || "") !== String(expectedPartUpdatedAt) && targetInventoryMatches) {
    return part;
  }
  const liveCatalogItem = await verifyCatalogItem(catalogItem);
  const unitCost = num(liveCatalogItem.unitCost);
  const alreadySwitched = targetInventoryMatches && Math.abs(num(part.frozen_unit_cost) - unitCost) <= 0.000001;
  if (alreadySwitched) return part;
  assertLoadedPartVersion(part, expectedPartUpdatedAt);
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });

  const quantity = num(part.quantity, 1);
  const previousExtended = num(part.frozen_extended_cost);
  const nextExtended = quantity * unitCost;
  const delta = nextExtended - previousExtended;
  const timestamp = nowIso();
  const partPatch = {
    part_name: liveCatalogItem.name,
    part_type: liveCatalogItem.categoryKey,
    part_subtype: liveCatalogItem.subtype || liveCatalogItem.categoryKey,
    inventory_entity: liveCatalogItem.entity,
    inventory_item_id: liveCatalogItem.inventoryId,
    original_inventory_item_id: liveCatalogItem.inventoryId,
    inventory_item_name: liveCatalogItem.name,
    inventory_link_state: "attached",
    reattach_candidate_id: "",
    reattach_candidate_name: "",
    frozen_inventory_snapshot: liveCatalogItem.row,
    current_inventory_snapshot: liveCatalogItem.row,
    detail_overrides: {},
    builder_data: { ...(part.builder_data || {}), catalog_category: liveCatalogItem.categoryKey, catalog_category_label: catalogItem.categoryLabel },
    pricing_basis_snapshot: { pricing_mode: liveCatalogItem.pricingMode, inventory_pricing: liveCatalogItem.pricingSnapshot },
    unit: liveCatalogItem.unit,
    frozen_unit_cost: unitCost,
    frozen_extended_cost: nextExtended,
    current_unit_cost: unitCost,
    current_extended_cost: nextExtended,
    manual_cost_override: false,
    manual_cost: undefined,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    inventory_updated_date_snapshot: liveCatalogItem.row?.updated_date || "",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  };
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = previousTotal + delta;
  const nextCustomerPrice = previousCustomerPrice + delta;
  const currentTotal = num(builder.current_recalculated_cost, previousTotal) + delta;
  const priceState = Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current";
  const builderPatch = {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    price_state: priceState,
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  };
  const linePatch = {
    total_snapshot: nextTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: nextCustomerPrice,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + delta,
    price_state: priceState,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp,
  };
  const changedParts = [{ part_id: part.id, action: "switch_part", previous_inventory_item_id: part.inventory_item_id, new_inventory_item_id: liveCatalogItem.inventoryId, previous_inventory_name: part.inventory_item_name, new_inventory_name: liveCatalogItem.name, previous_extended_cost: previousExtended, new_extended_cost: nextExtended, delta, cleared_detail_overrides: part.detail_overrides || {} }];
  const requestHash = builderMutationHash({
    estimate_updated_date: expectedEstimateUpdatedAt || estimate.updated_date || "",
    part_id: part.id,
    part_updated_date: expectedPartUpdatedAt || part.updated_date || "",
    new_inventory_entity: liveCatalogItem.entity,
    new_inventory_item_id: liveCatalogItem.inventoryId,
    part_patch: partPatch,
  });
  const recoveryMarker = {
    key: `builder_manual_part_switch:${builder.id}:${part.id}:${requestHash}`,
    kind: "builder_manual_part_switch",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_id: part.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    part_acceptance_plan: {
      timestamp,
      part_updates: [{ operation: "update", part_id: part.id, part_key: part.part_key, expected_updated_date: part.updated_date || "", patch: partPatch }],
      changed_parts: changedParts,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: builder.estimate_id || "",
      reason: "manual_adjustment",
      previous_total_cost: previousTotal,
      new_total_cost: nextTotal,
      previous_customer_price: previousCustomerPrice,
      new_customer_price: nextCustomerPrice,
      changed_parts: changedParts,
      builder_snapshot_before: builder.builder_snapshot || {},
      builder_snapshot_after: builder.builder_snapshot || {},
      price_snapshot_before: { total: previousTotal },
      price_snapshot_after: { total: nextTotal },
      notes: `Switched independent Product Part to ${liveCatalogItem.name}.`,
    },
  };
  const marked = await markBuilderMutationPending({ estimate, builder, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
  return base44.entities.BuilderPart.get(part.id);
}

export async function removeManualProductPart(partId, { expectedEstimateUpdatedAt = "", expectedPartUpdatedAt = "" } = {}) {
  const part = await base44.entities.BuilderPart.get(partId);
  if (!part || !["manual", "manual_addon"].includes(part.builder_sync_state)) throw new Error("Only independent manual Parts can be removed directly.");
  assertLoadedPartVersion(part, expectedPartUpdatedAt);
  const [{ builder, estimate }, allParts, allGroups, revisionNumber] = await Promise.all([
    loadManualMutationContext(part.builder_product_id, expectedEstimateUpdatedAt),
    base44.entities.BuilderPart.filter({ builder_product_id: part.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: part.builder_product_id }),
    nextRevisionNumber(part.builder_product_id),
  ]);
  const previousExtended = num(part.frozen_extended_cost);
  const previousCurrent = num(part.current_extended_cost, previousExtended);
  const previousTotal = num(builder.frozen_cost);
  const previousCustomerPrice = num(builder.frozen_customer_price, previousTotal);
  const nextTotal = Math.max(0, previousTotal - previousExtended);
  const nextCustomerPrice = Math.max(0, previousCustomerPrice - previousExtended);
  const currentTotal = Math.max(0, num(builder.current_recalculated_cost, previousTotal) - previousCurrent);
  const timestamp = nowIso();
  const otherActiveParts = (allParts || []).filter((row) => row.id !== part.id && row.is_active !== false);
  const activeGroups = (allGroups || []).filter((row) => row.is_active !== false);
  const emptiedGroup = part.part_group_id
    ? activeGroups.find((group) => group.id === part.part_group_id) && !otherActiveParts.some((row) => row.part_group_id === part.part_group_id)
    : false;
  const groupCount = Math.max(0, activeGroups.length - (emptiedGroup ? 1 : 0));
  const priceState = Math.abs(currentTotal - nextTotal) > 0.005 ? "changed" : "current";

  await base44.entities.BuilderPart.delete(part.id);
  if (emptiedGroup) await base44.entities.BuilderPartGroup.delete(part.part_group_id);
  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    current_recalculated_cost: currentTotal,
    part_count: otherActiveParts.length,
    group_count: groupCount,
    price_state: priceState,
    price_delta: currentTotal - nextTotal,
    price_delta_percent: nextTotal ? ((currentTotal - nextTotal) / nextTotal) * 100 : 0,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });
  await patchVerifiedEstimateLine(estimate, builder, (line) => ({ total_snapshot: nextTotal, live_total_snapshot: currentTotal, customer_price_snapshot: nextCustomerPrice, live_customer_price_snapshot: Math.max(0, liveCustomerUnitPrice(line) - previousCurrent), price_state: priceState, last_price_update_at: timestamp }));
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: revisionNumber,
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
  const [{ builder, estimate }, parts, catalog] = await Promise.all([
    loadManualMutationContext(builderProductId),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    loadMasterPartCatalog(),
  ]);
  const active = (parts || []).filter((part) => part.is_active !== false);
  const catalogByKey = new Map(catalog.map((item) => [`${item.entity}:${item.inventoryId}`, item]));
  let currentTotal = 0;
  let detachedCount = 0;
  let changedCount = 0;
  let partWrites = 0;
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
    const nextCandidateId = candidate?.inventoryId || part.reattach_candidate_id || "";
    const nextCandidateName = candidate?.name || part.reattach_candidate_name || "";
    const nextDelta = currentExtended - num(part.frozen_extended_cost);
    const nextDeltaPercent = num(part.frozen_extended_cost) ? (nextDelta / num(part.frozen_extended_cost)) * 100 : 0;
    const changed =
      Math.abs(num(part.current_unit_cost, num(part.frozen_unit_cost)) - currentUnit) > 0.000001 ||
      Math.abs(num(part.current_extended_cost, num(part.frozen_extended_cost)) - currentExtended) > 0.005 ||
      stable(part.current_inventory_snapshot || {}) !== stable(currentSnapshot) ||
      String(part.inventory_link_state || "manual") !== String(linkState) ||
      String(part.reattach_candidate_id || "") !== String(nextCandidateId) ||
      String(part.reattach_candidate_name || "") !== String(nextCandidateName) ||
      String(part.price_state || "current") !== String(state) ||
      Math.abs(num(part.price_delta) - nextDelta) > 0.005 ||
      Math.abs(num(part.price_delta_percent) - nextDeltaPercent) > 0.0001;
    if (changed) {
      await base44.entities.BuilderPart.update(part.id, {
        current_unit_cost: currentUnit,
        current_extended_cost: currentExtended,
        current_inventory_snapshot: currentSnapshot,
        inventory_link_state: linkState,
        reattach_candidate_id: nextCandidateId,
        reattach_candidate_name: nextCandidateName,
        price_state: state,
        price_delta: nextDelta,
        price_delta_percent: nextDeltaPercent,
        last_price_check_at: timestamp,
      });
      partWrites += 1;
    }
  }

  const frozenTotal = active.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const priceState = detachedCount > 0 ? "detached_parts" : Math.abs(currentTotal - frozenTotal) > 0.005 || changedCount > 0 ? "changed" : "current";
  const builderChanged =
    Math.abs(num(builder.frozen_cost) - frozenTotal) > 0.005 ||
    Math.abs(num(builder.current_recalculated_cost, frozenTotal) - currentTotal) > 0.005 ||
    num(builder.part_count) !== active.length ||
    num(builder.detached_part_count) !== detachedCount ||
    !!builder.needs_reattach_review !== (detachedCount > 0) ||
    String(builder.price_state || "current") !== priceState ||
    Math.abs(num(builder.price_delta) - (currentTotal - frozenTotal)) > 0.005 ||
    Math.abs(num(builder.price_delta_percent) - (frozenTotal ? ((currentTotal - frozenTotal) / frozenTotal) * 100 : 0)) > 0.0001;
  if (builderChanged) {
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
  }

  const frozenCustomerPrice = num(builder.frozen_customer_price, frozenTotal);
  const currentLine = estimateLineForBuilder(estimate, builder.id);
  const linePatch = {
    total_snapshot: frozenTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: frozenCustomerPrice + (currentTotal - frozenTotal),
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    price_state: priceState,
    last_price_check_at: timestamp,
  };
  const lineChanged = !!currentLine && (
    Math.abs(num(currentLine.total_snapshot) - linePatch.total_snapshot) > 0.005 ||
    Math.abs(num(currentLine.live_total_snapshot, linePatch.total_snapshot) - linePatch.live_total_snapshot) > 0.005 ||
    Math.abs(num(currentLine.customer_price_snapshot, linePatch.customer_price_snapshot) - linePatch.customer_price_snapshot) > 0.005 ||
    Math.abs(num(currentLine.live_customer_price_snapshot, linePatch.customer_price_snapshot) - linePatch.live_customer_price_snapshot) > 0.005 ||
    num(currentLine.detached_part_count) !== detachedCount ||
    !!currentLine.needs_reattach_review !== (detachedCount > 0) ||
    String(currentLine.price_state || "current") !== priceState
  );
  if (lineChanged) await patchVerifiedEstimateLine(estimate, builder, linePatch);

  return { frozenTotal, currentTotal, detachedCount, changedCount, priceState, partWrites, builderChanged, lineChanged };
}
