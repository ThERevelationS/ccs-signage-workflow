import { base44 } from "@/api/base44Client";
import { snapshotHash } from "@/components/estimator/builder/builderService";
import { cloneSnapshot, stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { countBuilderReattachParts } from "@/components/estimator/parts/partState";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { applyBuilderPartPriceAcceptancePlan } from "@/components/estimator/builder/partSync";
import { builderMutationHash, pendingBuilderMutation, recoveryPatchDiffers, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "@/components/estimator/estimatePersistence";
import { expectedBuilderEntityFields, expectedEntityFields, replaceBuilderEntityFieldsIfUnchanged, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

function legacyPartExtended(part) {
  if (part?.price_override !== undefined && part?.price_override !== null && part?.price_override !== "") return num(part.price_override);
  return (num(part?.part_price) + num(part?.modifier_price)) * num(part?.part_qty, 1);
}

export async function saveProductAsQuickProduct({
  estimateId,
  line,
  name,
  productGroup = "my",
  categories = [],
}) {
  if (!estimateId || !line?.builder_product_id) throw new Error("This Product does not have a persistent Product record yet.");
  const [builder, parts, groups] = await Promise.all([
    base44.entities.BuilderProduct.get(line.builder_product_id),
    loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Quick Product Builder Parts" }),
    loadAllEntityRows({ entity: base44.entities.BuilderPartGroup, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Quick Product Part Groups" }),
  ]);
  if (!builder) throw new Error("The Product could not be loaded.");
  if (!Array.isArray(parts) || !Array.isArray(groups)) throw new Error("The Product Parts / Part Groups could not be fully verified before saving this Quick Product.");

  const activeParts = parts.filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const activeGroups = groups.filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const builderSnapshot = builder.builder_snapshot || {};
  const frozenTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const currentTotal = num(builder.current_recalculated_cost, num(line.live_total_snapshot, frozenTotal));
  const frozenCustomerPrice = num(builder.frozen_customer_price, acceptedCustomerUnitPrice(line));
  const currentCustomerPrice = liveCustomerUnitPrice(line);
  const quickName = String(name || line.client_product_name || builder.client_product_name || "Quick Product").trim() || "Quick Product";
  const normalizedGroup = productGroup === "global" ? "global" : "my";
  const normalizedCategories = (categories || []).map((item) => String(item).trim()).filter(Boolean);
  const idempotencyKey = `quick_product_save:${builderMutationHash({
    estimate_id: estimateId,
    builder_product_id: builder.id,
    builder_updated_date: builder.updated_date || "",
    line_id: line.line_id || builder.estimate_line_id || "",
    line_state: {
      client_product_name: line.client_product_name || "",
      product_category: line.product_category || "",
      production_product_type: line.production_product_type || "",
      customer_quantity: num(line.customer_quantity, 1),
      product_notes: line.product_notes || "",
      customer_description: line.customer_description || "",
    },
    parts: activeParts.map((part) => [part.id, part.updated_date || ""]),
    groups: activeGroups.map((group) => [group.id, group.updated_date || ""]),
    quick_name: quickName,
    product_group: normalizedGroup,
    categories: normalizedCategories,
  })}`;

  return ensureReusableRecord({
    entity: base44.entities.QuickProduct,
    idempotencyKey,
    label: "Quick Product",
    data: {
    product_name: quickName,
    template_version: 2,
    source_product_class: line.module_key === "custom" ? "custom" : "builder",
    source_module_key: line.module_key || builder.module_key || "custom",
    source_entity: builder.source_entity || "",
    source_builder_name: builder.builder_name || line.builder_name || "Custom Product",
    product_category: line.product_category || builder.product_category || "",
    production_product_type: line.production_product_type ?? builder.production_product_type ?? "",
    created_from_product_id: builder.id,
    created_from_estimate_id: estimateId,
    product_group: normalizedGroup,
    categories: normalizedCategories,
    product_quantity: num(line.customer_quantity, num(builder.quantity, 1)),
    is_active: true,
    product_notes: line.product_notes ?? builder.product_notes ?? "",
    client_description: line.customer_description ?? builder.client_description ?? "",
    product_snapshot: {
      line: cloneSnapshot(line),
      builder_product: cloneSnapshot(builder),
    },
    builder_snapshot: cloneSnapshot(builderSnapshot),
    builder_snapshot_hash: builder.builder_snapshot_hash || snapshotHash(builderSnapshot),
    parts_snapshot: activeParts.map(cloneSnapshot),
    part_groups_snapshot: activeGroups.map((group) => ({
      ...cloneSnapshot(group),
      snapshot_source_group_id: group.id,
    })),
    price_snapshot: {
      frozen_cost: frozenTotal,
      frozen_customer_price: frozenCustomerPrice,
      current_recalculated_cost: currentTotal,
      current_recalculated_customer_price: currentCustomerPrice,
      price_state: builder.price_state || line.price_state || "current",
      price_delta: num(builder.price_delta, currentTotal - frozenTotal),
      price_delta_percent: num(builder.price_delta_percent),
      price_recalc_required: !!(builder.price_recalc_required || line.price_recalc_required),
      price_recalc_reason: builder.price_recalc_reason || line.price_recalc_reason || "",
      captured_at: nowIso(),
    },
    detached_part_count: num(builder.detached_part_count),
    needs_reattach_review: !!builder.needs_reattach_review,
    // Keep the old fields populated as a readable compatibility summary.
    parts: activeParts.map((part) => ({
      part_label: part.client_label || part.part_name,
      part_name: part.part_name,
      part_type: "other",
      part_qty: num(part.quantity, 1),
      vendor_info: part.inventory_item_name || "",
      modifiers: [],
      part_price: num(part.frozen_unit_cost),
      modifier_price: 0,
      price_override: num(part.frozen_extended_cost),
      notes: part.notes || "",
    })),
    total_price: frozenCustomerPrice * num(line.customer_quantity, num(builder.quantity, 1)),
    },
  });
}

const QUICK_INSERT_KIND = "builder_quick_product_insert";

function isV2QuickProduct(productPayload) {
  return num(productPayload?.template_version) >= 2 && !!productPayload?.product_snapshot;
}

function quickEstimateContext(estimate) {
  return {
    id: estimate.id,
    client_name: estimate.client_name || "",
    customer_id: estimate.customer_id || "",
    estimate_number: estimate.estimate_number || "",
  };
}

function quickPayloadFingerprint(productPayload) {
  const copy = stripEntitySystemFields(productPayload || {});
  return builderMutationHash(copy);
}

function quickInsertOperationKey({ estimateId, expectedEstimateUpdatedAt, sourceType, sourceId, sourceUpdatedAt, productPayload }) {
  return `builder_quick_product_insert:${builderMutationHash({
    estimate_id: estimateId,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    source_type: sourceType || "snapshot",
    source_id: sourceId || "",
    source_updated_at: sourceUpdatedAt || "",
    payload_hash: quickPayloadFingerprint(productPayload),
  })}`;
}

function findPendingQuickInsertLine(estimate) {
  return (estimate?.line_items || []).find((line) => line?.price_acceptance_pending?.kind === QUICK_INSERT_KIND && line.price_acceptance_pending?.key) || null;
}

function findCompletedQuickInsertLine(estimate, operationKey) {
  return (estimate?.line_items || []).find((line) => line?.quick_product_insert_key === operationKey) || null;
}

async function completedQuickInsertResult(estimate, line, flags = {}) {
  if (!line?.builder_product_id) throw new Error("The completed Quick Product line is missing its Builder Product link.");
  const [builder, parts, groups] = await Promise.all([
    base44.entities.BuilderProduct.get(line.builder_product_id),
    loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Quick Product Builder Parts" }),
    loadAllEntityRows({ entity: base44.entities.BuilderPartGroup, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Quick Product Part Groups" }),
  ]);
  if (!builder?.id || !Array.isArray(parts) || !Array.isArray(groups)) {
    throw new Error("The completed Quick Product could not be fully verified. Reload before continuing.");
  }
  return { line, builderProduct: builder, parts, groups, ...flags };
}

function buildV2QuickBlueprint({ estimate, productPayload, lineId, timestamp, operationKey, sourceType = "quick_product" }) {
  const productName = productPayload.product_name || "Quick Product";
  const templateLine = cloneSnapshot(productPayload.product_snapshot?.line || {});
  const templateBuilder = stripEntitySystemFields(productPayload.product_snapshot?.builder_product || {});
  const sourceClass = productPayload.source_product_class || "legacy";
  const sourceEntity = sourceClass === "builder"
    ? (productPayload.source_entity || productPayload.product_snapshot?.builder_product?.source_entity || "")
    : "";
  const moduleKey = productPayload.source_module_key || templateBuilder.module_key || templateLine.module_key || "custom";
  const builderName = productPayload.source_builder_name || templateBuilder.builder_name || templateLine.builder_name || (moduleKey === "custom" ? "Custom Product" : "Builder Product");
  const priceSnapshot = productPayload.price_snapshot || {};
  const frozenTotal = num(priceSnapshot.frozen_cost, num(productPayload.total_price));
  const currentTotal = num(priceSnapshot.current_recalculated_cost, frozenTotal);
  const frozenCustomerPrice = num(priceSnapshot.frozen_customer_price, frozenTotal);
  const currentCustomerPrice = num(priceSnapshot.current_recalculated_customer_price, frozenCustomerPrice);
  const recalcRequired = !!(priceSnapshot.price_recalc_required ?? templateBuilder.price_recalc_required ?? templateLine.price_recalc_required);
  const recalcReason = priceSnapshot.price_recalc_reason || templateBuilder.price_recalc_reason || templateLine.price_recalc_reason || "";
  const sourceSnapshot = cloneSnapshot(productPayload.builder_snapshot || templateBuilder.builder_snapshot || {});

  let sourceExpectedData = null;
  let sourceTaggedData = null;
  let sourceRecoveryToken = "";
  if (sourceEntity) {
    sourceExpectedData = stripEntitySystemFields(productPayload.builder_snapshot || {});
    if (Object.prototype.hasOwnProperty.call(sourceExpectedData, "project_name")) sourceExpectedData.project_name = productName;
    if (Object.prototype.hasOwnProperty.call(sourceExpectedData, "client_name")) sourceExpectedData.client_name = estimate.client_name || sourceExpectedData.client_name;
    if (Object.prototype.hasOwnProperty.call(sourceExpectedData, "customer_id")) sourceExpectedData.customer_id = estimate.customer_id || sourceExpectedData.customer_id;
    if (Object.prototype.hasOwnProperty.call(sourceExpectedData, "estimate_number")) sourceExpectedData.estimate_number = estimate.estimate_number || sourceExpectedData.estimate_number;
    sourceExpectedData.notes = String(sourceExpectedData.notes || "");
    sourceRecoveryToken = `[SEP-QUICK-RECOVERY:${operationKey}]`;
    sourceTaggedData = {
      ...sourceExpectedData,
      notes: sourceExpectedData.notes ? `${sourceExpectedData.notes}\n${sourceRecoveryToken}` : sourceRecoveryToken,
    };
  }

  const groups = (productPayload.part_groups_snapshot || [])
    .filter((group) => group.is_active !== false)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const originalGroupToRecoveryKey = new Map();
  const groupBlueprints = groups.map((group, index) => {
    const groupKey = `quick-group-${builderMutationHash({ operation_key: operationKey, index })}`;
    const originalId = group.snapshot_source_group_id || group.id || group.group_key || `group-${index}`;
    originalGroupToRecoveryKey.set(originalId, groupKey);
    if (group.group_key) originalGroupToRecoveryKey.set(group.group_key, groupKey);
    const data = stripEntitySystemFields(group);
    delete data.snapshot_source_group_id;
    return {
      groupKey,
      data: {
        ...data,
        builder_product_id: "",
        group_key: groupKey,
        is_active: true,
      },
    };
  });

  const parts = (productPayload.parts_snapshot || [])
    .filter((part) => part.is_active !== false)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const seenPartKeys = new Set();
  const partBlueprints = parts.map((part, index) => {
    const partKey = part.part_key || `quick-part-${builderMutationHash({ operation_key: operationKey, index })}`;
    if (seenPartKeys.has(partKey)) throw new Error(`Quick Product “${productName}” contains duplicate Part keys and cannot be inserted safely.`);
    seenPartKeys.add(partKey);
    const originalGroupRef = part.part_group_id || "";
    return {
      partKey,
      partGroupKeyRef: originalGroupRef ? (originalGroupToRecoveryKey.get(originalGroupRef) || "") : "",
      data: {
        ...stripEntitySystemFields(part),
        builder_product_id: "",
        part_group_id: "",
        part_key: partKey,
        last_price_check_at: timestamp,
        is_active: true,
      },
    };
  });
  const detachedCount = countBuilderReattachParts(partBlueprints.map((part) => part.data));
  const finalPriceState = detachedCount > 0 ? "detached_parts" : (priceSnapshot.price_state || "current");

  const builderCreateData = {
    ...templateBuilder,
    estimate_id: estimate.id,
    estimate_line_id: lineId,
    module_key: moduleKey,
    source_entity: sourceEntity || templateBuilder.source_entity || "",
    source_project_id: "",
    builder_name: builderName,
    client_product_name: productName,
    client_description: productPayload.client_description ?? templateBuilder.client_description ?? "",
    product_category: productPayload.product_category ?? templateBuilder.product_category ?? "",
    production_product_type: productPayload.production_product_type ?? templateBuilder.production_product_type ?? templateLine.production_product_type ?? "",
    product_notes: productPayload.product_notes ?? templateBuilder.product_notes ?? "",
    quantity: num(productPayload.product_quantity, num(templateBuilder.quantity, 1)),
    builder_version: 1,
    builder_snapshot: sourceSnapshot,
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: timestamp,
    builder_snapshot_hash: snapshotHash(sourceSnapshot),
    frozen_cost: frozenTotal,
    frozen_customer_price: frozenCustomerPrice,
    current_recalculated_cost: currentTotal,
    price_state: finalPriceState,
    price_delta: num(priceSnapshot.price_delta, currentTotal - frozenTotal),
    price_delta_percent: num(priceSnapshot.price_delta_percent, frozenTotal ? ((currentTotal - frozenTotal) / frozenTotal) * 100 : 0),
    price_recalc_required: recalcRequired,
    price_recalc_reason: recalcReason,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    part_count: 0,
    group_count: 0,
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    is_active: true,
    notes: `Created from Quick Product “${productName}”.`,
  };

  const finalLineBase = {
    ...templateLine,
    line_id: lineId,
    builder_product_id: "",
    module_key: moduleKey,
    project_id: "",
    project_name: productName,
    builder_name: builderName,
    client_product_name: productName,
    product_category: productPayload.product_category ?? templateLine.product_category ?? "",
    production_product_type: productPayload.production_product_type ?? templateLine.production_product_type ?? templateBuilder.production_product_type ?? "",
    product_notes: productPayload.product_notes ?? templateLine.product_notes ?? "",
    customer_description: productPayload.client_description ?? templateLine.customer_description ?? "",
    client_name: estimate.client_name || templateLine.client_name || "",
    total_snapshot: frozenTotal,
    live_total_snapshot: currentTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: currentCustomerPrice,
    price_state: finalPriceState,
    price_recalc_required: recalcRequired,
    price_recalc_reason: recalcReason,
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    customer_quantity: num(productPayload.product_quantity, num(templateLine.customer_quantity, 1)),
    include_in_customer: templateLine.include_in_customer !== false,
    owned: true,
    linked_date: timestamp,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    updated_date_snapshot: timestamp,
  };

  return {
    version: 2,
    productName,
    moduleKey,
    builderName,
    priceSnapshot,
    frozenTotal,
    currentTotal,
    frozenCustomerPrice,
    currentCustomerPrice,
    recalcRequired,
    recalcReason,
    sourceEntity,
    sourceExpectedData,
    sourceTaggedData,
    sourceRecoveryToken,
    sourceSnapshot,
    groupBlueprints,
    partBlueprints,
    detachedCount,
    finalPriceState,
    builderCreateData,
    finalLineBase,
    revisionAction: sourceType === "product_clone" ? "cloned_with_product" : "created_from_quick_product",
    revisionNotes: sourceType === "product_clone"
      ? `Cloned Product “${productName}”. Frozen pricing and Part/Group snapshots were preserved.`
      : `Created from Quick Product “${productName}”. Frozen Product/Part pricing was preserved.`,
    revisionPriceSnapshotAfter: { ...priceSnapshot, total: frozenTotal, source: sourceType === "product_clone" ? "product_clone" : "quick_product" },
  };
}

function buildLegacyQuickBlueprint({ estimate, productPayload, lineId, timestamp, operationKey, sourceType = "quick_product" }) {
  const name = productPayload.product_name || "Legacy Quick Product";
  const legacyParts = productPayload.parts || [];
  const calculatedPartsTotal = legacyParts.reduce((sum, part) => sum + legacyPartExtended(part), 0);
  const calculatedProduct = Math.max(0, calculatedPartsTotal + num(productPayload.setup_fee) - num(productPayload.discount));
  const legacyQuantity = Math.max(0, num(productPayload.product_quantity, 1)) || 1;
  const frozenTotal = productPayload.price_override !== undefined && productPayload.price_override !== null && productPayload.price_override !== ""
    ? num(productPayload.price_override)
    : productPayload.total_price !== undefined && productPayload.total_price !== null && productPayload.total_price !== ""
      ? num(productPayload.total_price) / legacyQuantity
      : calculatedProduct;

  const partBlueprints = legacyParts.map((part, index) => {
    const extended = legacyPartExtended(part);
    const qty = num(part.part_qty, 1);
    const unitCost = qty ? extended / qty : extended;
    const partKey = `quick-part-${builderMutationHash({ operation_key: operationKey, index })}`;
    return {
      partKey,
      partGroupKeyRef: "",
      data: {
        builder_product_id: "",
        part_key: partKey,
        sort_order: index,
        part_name: part.part_name || part.part_label || `Part ${index + 1}`,
        client_label: part.part_label || part.part_name || "",
        part_type: part.part_type || "other",
        source_module_key: "custom",
        source_path: "",
        inventory_entity: "",
        inventory_item_id: "",
        original_inventory_item_id: "",
        inventory_item_name: "",
        inventory_link_state: "manual",
        builder_sync_state: "manual",
        frozen_inventory_snapshot: {},
        current_inventory_snapshot: {},
        builder_data: { legacy_quick_product: true, modifiers: part.modifiers || [] },
        calculation_snapshot: {},
        pricing_basis_snapshot: { legacy_part_price: part.part_price, legacy_modifier_price: part.modifier_price, legacy_override: part.price_override },
        quantity: qty,
        unit: "unit",
        frozen_unit_cost: unitCost,
        frozen_extended_cost: extended,
        current_unit_cost: unitCost,
        current_extended_cost: extended,
        price_state: "current",
        manual_cost_override: true,
        manual_cost: unitCost,
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        is_active: true,
        notes: part.notes || "",
      },
    };
  });

  const builderCreateData = {
    estimate_id: estimate.id,
    estimate_line_id: lineId,
    module_key: "custom",
    source_entity: "",
    source_project_id: "",
    builder_name: "Legacy Quick Product",
    client_product_name: name,
    client_description: "",
    product_category: (productPayload.categories || [])[0] || "",
    production_product_type: productPayload.production_product_type || "",
    product_notes: productPayload.product_notes || "",
    quantity: num(productPayload.product_quantity, 1),
    status: "in_progress",
    builder_version: 1,
    builder_snapshot: {},
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: timestamp,
    builder_snapshot_hash: snapshotHash({}),
    frozen_cost: frozenTotal,
    frozen_customer_price: frozenTotal,
    current_recalculated_cost: frozenTotal,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    price_recalc_required: false,
    price_recalc_reason: "",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    part_count: 0,
    group_count: 0,
    detached_part_count: 0,
    needs_reattach_review: false,
    is_active: true,
    notes: "Imported from legacy Quick Product format.",
  };

  const finalLineBase = {
    line_id: lineId,
    builder_product_id: "",
    module_key: "custom",
    project_id: "",
    project_name: name,
    builder_name: "Custom Product",
    client_product_name: name,
    product_category: (productPayload.categories || [])[0] || "",
    production_product_type: productPayload.production_product_type || "",
    product_notes: productPayload.product_notes || "",
    client_name: estimate.client_name || "",
    total_snapshot: frozenTotal,
    live_total_snapshot: frozenTotal,
    customer_price_snapshot: frozenTotal,
    live_customer_price_snapshot: frozenTotal,
    price_state: "current",
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    adjustment_percent: 0,
    section_status: "in_progress",
    customer_quantity: num(productPayload.product_quantity, 1),
    include_in_customer: true,
    owned: true,
    linked_date: timestamp,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    updated_date_snapshot: timestamp,
  };

  return {
    version: 1,
    productName: name,
    moduleKey: "custom",
    builderName: "Legacy Quick Product",
    priceSnapshot: {},
    frozenTotal,
    currentTotal: frozenTotal,
    frozenCustomerPrice: frozenTotal,
    currentCustomerPrice: frozenTotal,
    recalcRequired: false,
    recalcReason: "",
    sourceEntity: "",
    sourceExpectedData: null,
    sourceTaggedData: null,
    sourceRecoveryToken: "",
    sourceSnapshot: {},
    groupBlueprints: [],
    partBlueprints,
    detachedCount: 0,
    finalPriceState: "current",
    builderCreateData,
    finalLineBase,
    revisionAction: "legacy_quick_product_import",
    revisionNotes: `Created from legacy Quick Product “${name}”.`,
    revisionPriceSnapshotAfter: { total: frozenTotal, source: sourceType === "product_clone" ? "product_clone" : "legacy_quick_product" },
  };
}

function buildQuickBlueprint(args) {
  return isV2QuickProduct(args.productPayload)
    ? buildV2QuickBlueprint(args)
    : buildLegacyQuickBlueprint(args);
}

function provisionalQuickLine(blueprint, pending) {
  return {
    ...blueprint.finalLineBase,
    builder_product_id: "",
    project_id: "",
    section_status: "in_progress",
    price_acceptance_pending: pending,
  };
}

function quickBuilderOwnershipPatch(blueprint, estimateId, lineId) {
  const expected = {
    ...blueprint.builderCreateData,
    estimate_id: estimateId,
    estimate_line_id: lineId,
  };
  // Recovery itself may have linked the source project before the caller received
  // a response. Every other create-time Builder field must still match exactly.
  delete expected.source_project_id;
  return expected;
}

async function ensureQuickInsertBuilder({ estimateId, lineId, blueprint }) {
  const matches = await base44.entities.BuilderProduct.filter({ estimate_id: estimateId, estimate_line_id: lineId });
  if (!Array.isArray(matches)) throw new Error("Builder Products could not be verified while recovering Quick Product insertion.");
  if (matches.length > 1) throw new Error("More than one Builder Product is linked to the pending Quick Product line. Recovery stopped before creating anything else.");
  if (matches.length === 1) {
    const existing = matches[0];
    if (recoveryPatchDiffers(existing, quickBuilderOwnershipPatch(blueprint, estimateId, lineId))) {
      throw new Error("The pending Quick Product line is now linked to a different Builder Product state. No unrelated Product was overwritten.");
    }
    return existing;
  }
  return base44.entities.BuilderProduct.create(blueprint.builderCreateData);
}

function sourceCoreDiffers(source, expected) {
  if (!expected) return false;
  const patch = { ...expected };
  delete patch.notes;
  return recoveryPatchDiffers(source, patch);
}

function removeRecoveryToken(notes, token, expectedOriginal) {
  const current = String(notes || "");
  if (!token || !current.includes(token)) return current;
  const tagged = expectedOriginal ? `${expectedOriginal}\n${token}` : token;
  if (current === tagged) return expectedOriginal;
  return current.replace(`\n${token}`, "").replace(token, "");
}

async function ensureQuickInsertSource({ builder, blueprint }) {
  if (!blueprint.sourceEntity || !blueprint.sourceExpectedData) return { builder, sourceProject: null };
  const entity = base44.entities[blueprint.sourceEntity];
  if (!entity?.get || !entity?.create || !entity?.update || !entity?.filter) {
    throw new Error("The Quick Product Builder source entity is unavailable for recovery.");
  }

  let sourceProject = null;
  if (builder.source_project_id) {
    sourceProject = await entity.get(builder.source_project_id);
    if (!sourceProject) throw new Error("The Quick Product source project link exists, but the source record could not be verified.");
    if (sourceCoreDiffers(sourceProject, blueprint.sourceExpectedData)) {
      throw new Error("The pending Quick Product source project changed before insertion completed. No source fields were overwritten.");
    }
  } else {
    const filter = {};
    if (blueprint.sourceTaggedData?.estimate_number) filter.estimate_number = blueprint.sourceTaggedData.estimate_number;
    if (blueprint.sourceTaggedData?.project_name) filter.project_name = blueprint.sourceTaggedData.project_name;
    const candidates = await entity.filter(filter);
    if (!Array.isArray(candidates)) throw new Error("Quick Product source projects could not be verified during recovery.");
    const tagged = candidates.filter((row) => String(row?.notes || "").includes(blueprint.sourceRecoveryToken));
    if (tagged.length > 1) throw new Error("Multiple Quick Product source records carry the same recovery token. Recovery stopped without linking either record.");
    if (tagged.length === 1) {
      sourceProject = tagged[0];
      if (sourceCoreDiffers(sourceProject, blueprint.sourceExpectedData)) {
        throw new Error("The recovered Quick Product source record no longer matches the saved Quick Product snapshot.");
      }
    }
    // Do not infer recovery from an untagged lookalike. A completed prior Quick
    // Product can legitimately have an identical source snapshot. The temporary
    // token is the only safe create-response-loss anchor before source_project_id
    // is linked onto the new BuilderProduct.
    if (!sourceProject) sourceProject = await entity.create(blueprint.sourceTaggedData);
    if (!sourceProject?.id) throw new Error("Quick Product source project could not be verified after creation.");

    const latestBuilder = await base44.entities.BuilderProduct.get(builder.id);
    if (!latestBuilder?.id) throw new Error("Quick Product Builder could not be reloaded before linking its source project.");
    if (latestBuilder.source_project_id && latestBuilder.source_project_id !== sourceProject.id) {
      throw new Error("The pending Quick Product Builder is already linked to a different source project.");
    }
    if (!latestBuilder.source_project_id) {
      const sourceLinkPatch = {
        source_entity: blueprint.sourceEntity,
        source_project_id: sourceProject.id,
      };
      await replaceBuilderEntityFieldsIfUnchanged({
        entity: base44.entities.BuilderProduct,
        id: builder.id,
        expectedUpdatedAt: latestBuilder.updated_date || "",
        expectedFields: expectedBuilderEntityFields(latestBuilder, sourceLinkPatch),
        nextFields: sourceLinkPatch,
        guardFields: { estimate_id: latestBuilder.estimate_id },
        label: "Quick Product Builder source link",
      });
    }
    builder = await base44.entities.BuilderProduct.get(builder.id);
  }

  const currentNotes = String(sourceProject.notes || "");
  if (blueprint.sourceRecoveryToken && currentNotes.includes(blueprint.sourceRecoveryToken)) {
    const restoredNotes = removeRecoveryToken(currentNotes, blueprint.sourceRecoveryToken, String(blueprint.sourceExpectedData.notes || ""));
    sourceProject = await replaceEntityFieldsIfUnchanged({
      entity,
      id: sourceProject.id,
      expectedUpdatedAt: sourceProject.updated_date || "",
      expectedFields: expectedEntityFields(sourceProject, { notes: restoredNotes }),
      nextFields: { notes: restoredNotes },
      label: "Quick Product source recovery token cleanup",
    });
  }
  if (!sourceProject || sourceCoreDiffers(sourceProject, blueprint.sourceExpectedData)) {
    throw new Error("Quick Product source project could not be verified after removing its recovery token.");
  }
  return { builder: await base44.entities.BuilderProduct.get(builder.id), sourceProject };
}

function buildPromotedQuickPending({ pending, blueprint, builder, sourceProject }) {
  const groupCreatePlan = {
    groups: blueprint.groupBlueprints.map((group) => ({
      group_key: group.groupKey,
      data: { ...group.data, builder_product_id: builder.id },
    })),
  };
  const partUpdates = blueprint.partBlueprints.map((part) => ({
    operation: "create",
    part_key: part.partKey,
    part_group_key_ref: part.partGroupKeyRef,
    data: { ...part.data, builder_product_id: builder.id },
  }));
  const sourceSnapshot = sourceProject ? cloneSnapshot(sourceProject) : blueprint.sourceSnapshot;
  const sourceUpdatedAt = sourceProject?.updated_date || pending.started_at;
  const builderPatch = {
    source_entity: blueprint.sourceEntity || blueprint.builderCreateData.source_entity || "",
    source_project_id: sourceProject?.id || "",
    builder_snapshot: sourceSnapshot,
    builder_snapshot_at: pending.started_at,
    builder_snapshot_source_updated_date: sourceUpdatedAt,
    builder_snapshot_hash: snapshotHash(sourceSnapshot),
    part_count: blueprint.partBlueprints.length,
    group_count: blueprint.groupBlueprints.length,
    detached_part_count: blueprint.detachedCount,
    needs_reattach_review: blueprint.detachedCount > 0,
    price_state: blueprint.finalPriceState,
    price_recalc_required: blueprint.recalcRequired,
    price_recalc_reason: blueprint.recalcReason,
  };
  const linePatch = {
    ...blueprint.finalLineBase,
    builder_product_id: builder.id,
    project_id: sourceProject?.id || "",
    updated_date_snapshot: sourceUpdatedAt,
    quick_product_insert_key: pending.key,
    quick_product_source_id: pending.source_id || "",
    quick_product_source_type: pending.source_type || "",
  };
  const changedParts = blueprint.partBlueprints.map((part) => ({
    part_key: part.partKey,
    part_name: part.data.part_name,
    action: blueprint.revisionAction,
    frozen_extended_cost: num(part.data.frozen_extended_cost),
  }));
  return {
    ...pending,
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    source_project_id: sourceProject?.id || "",
    group_create_plan: groupCreatePlan,
    part_acceptance_plan: {
      timestamp: pending.started_at,
      part_updates: partUpdates,
      changed_parts: changedParts,
      active_part_count: blueprint.partBlueprints.length,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: pending.estimate_id,
      reason: "initial_freeze",
      previous_total_cost: 0,
      new_total_cost: blueprint.frozenTotal,
      previous_customer_price: 0,
      new_customer_price: blueprint.frozenCustomerPrice,
      changed_parts: changedParts,
      builder_snapshot_before: {},
      builder_snapshot_after: sourceSnapshot,
      price_snapshot_before: { total: 0 },
      price_snapshot_after: blueprint.revisionPriceSnapshotAfter,
      notes: blueprint.revisionNotes,
    },
  };
}

async function promoteQuickInsertMarker({ estimate, line, pending, builder, sourceProject, blueprint }) {
  const promoted = buildPromotedQuickPending({ pending, blueprint, builder, sourceProject });
  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimate.id);
  if (!latestEstimate) throw new Error("Estimate could not be verified before promoting Quick Product recovery.");
  const latestLine = (latestEstimate.line_items || []).find((item) => item.line_id === line.line_id);
  const latestPending = pendingBuilderMutation(latestLine);
  if (!latestLine || !latestPending || latestPending.key !== pending.key) {
    throw new Error("The pending Quick Product line changed before its recovery plan could be promoted.");
  }
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });
  const lineItems = (latestEstimate.line_items || []).map((item) => item.line_id === line.line_id
    ? {
        ...item,
        builder_product_id: builder.id,
        project_id: sourceProject?.id || "",
        price_acceptance_pending: promoted,
      }
    : item);
  await replaceEstimateFieldsIfUnchanged({
    entity: base44.entities.AllInOneEstimate,
    estimateId: estimate.id,
    expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Quick Product recovery promotion",
  });

  const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimate.id),
    base44.entities.BuilderProduct.get(builder.id),
    loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Quick Product recovery Parts" }),
  ]);
  const markedLine = (markedEstimate?.line_items || []).find((item) => item.line_id === line.line_id);
  const canonicalPending = pendingBuilderMutation(markedLine);
  if (!canonicalPending || canonicalPending.key !== pending.key || canonicalPending.builder_product_id !== builder.id) {
    throw new Error("Quick Product recovery plan could not be verified after promotion.");
  }
  return { markedEstimate, currentBuilder, currentParts, markedLine, canonicalPending };
}

export async function resumeQuickProductInsertion({ estimateId, lineId = "" }) {
  if (!estimateId) throw new Error("Estimate is required to resume Quick Product insertion.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const line = lineId
    ? (estimate.line_items || []).find((item) => item.line_id === lineId)
    : findPendingQuickInsertLine(estimate);
  if (!line) throw new Error("The pending Quick Product line could not be found.");
  const pending = pendingBuilderMutation(line);
  if (!pending || pending.kind !== QUICK_INSERT_KIND) {
    if (line.quick_product_insert_key) return completedQuickInsertResult(estimate, line, { alreadyCompleted: true });
    throw new Error("This Product line does not contain a recoverable Quick Product insertion.");
  }
  if (pending.estimate_id !== estimateId || pending.estimate_line_id !== line.line_id) {
    throw new Error("The Quick Product recovery marker no longer matches this estimate line.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });

  const blueprint = buildQuickBlueprint({
    estimate: pending.estimate_context || quickEstimateContext(estimate),
    productPayload: pending.product_payload,
    lineId: line.line_id,
    timestamp: pending.started_at,
    operationKey: pending.key,
    sourceType: pending.source_type || "quick_product",
  });

  if (pending.builder_product_id && pending.part_acceptance_plan) {
    const [builder, parts] = await Promise.all([
      base44.entities.BuilderProduct.get(pending.builder_product_id),
      loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: pending.builder_product_id }, sort: "sort_order", label: "Quick Product recovery Parts" }),
    ]);
    if (!builder?.id || !Array.isArray(parts)) throw new Error("Quick Product recovery could not verify its promoted Builder Product or Parts.");
    const result = await resumeBuilderMutation({
      estimateId,
      estimate,
      builder,
      parts,
      line,
      pending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan,
    });
    const completedEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
    const completedLine = (completedEstimate?.line_items || []).find((item) => item.line_id === line.line_id) || result.line;
    return completedQuickInsertResult(completedEstimate, completedLine, { recovered: true });
  }

  let builder = await ensureQuickInsertBuilder({ estimateId, lineId: line.line_id, blueprint });
  const sourceResult = await ensureQuickInsertSource({ builder, blueprint });
  builder = sourceResult.builder;
  const sourceProject = sourceResult.sourceProject;
  if (!builder?.id) throw new Error("Quick Product Builder could not be verified after source recovery.");

  const promoted = await promoteQuickInsertMarker({ estimate, line, pending, builder, sourceProject, blueprint });
  const result = await resumeBuilderMutation({
    estimateId,
    estimate: promoted.markedEstimate,
    builder: promoted.currentBuilder,
    parts: promoted.currentParts,
    line: promoted.markedLine,
    pending: promoted.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
  const completedEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const completedLine = (completedEstimate?.line_items || []).find((item) => item.line_id === line.line_id) || result.line;
  return completedQuickInsertResult(completedEstimate, completedLine, { recovered: true });
}

async function startQuickProductInsertion({ estimate, productPayload, sourceType, sourceId, sourceUpdatedAt, expectedEstimateUpdatedAt }) {
  const operationKey = quickInsertOperationKey({
    estimateId: estimate.id,
    expectedEstimateUpdatedAt: expectedEstimateUpdatedAt || estimate.updated_date || "",
    sourceType,
    sourceId,
    sourceUpdatedAt,
    productPayload,
  });
  const completedLine = findCompletedQuickInsertLine(estimate, operationKey);
  if (completedLine) return completedQuickInsertResult(estimate, completedLine, { alreadyCompleted: true });

  const lineId = `quick-line-${builderMutationHash({ operation_key: operationKey })}`;
  const timestamp = nowIso();
  const blueprint = buildQuickBlueprint({
    estimate: quickEstimateContext(estimate),
    productPayload,
    lineId,
    timestamp,
    operationKey,
    sourceType,
  });
  const pending = {
    key: operationKey,
    kind: QUICK_INSERT_KIND,
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: lineId,
    builder_product_id: "",
    source_type: sourceType || "snapshot",
    source_id: sourceId || "",
    source_updated_at: sourceUpdatedAt || "",
    payload_hash: quickPayloadFingerprint(productPayload),
    estimate_context: quickEstimateContext(estimate),
    product_payload: cloneSnapshot(productPayload),
  };

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimate.id);
  if (!latestEstimate) throw new Error("Estimate could not be verified before adding the Quick Product recovery marker.");
  if (estimate.updated_date && latestEstimate.updated_date && estimate.updated_date !== latestEstimate.updated_date) {
    throw new Error("This estimate changed in another session before Quick Product insertion started. No Product records were created.");
  }
  const existingLine = (latestEstimate.line_items || []).find((item) => item.line_id === lineId);
  if (existingLine) {
    const existingPending = pendingBuilderMutation(existingLine);
    if (existingPending?.key !== operationKey) throw new Error("A Product line ID collision occurred while starting Quick Product insertion.");
  } else {
    const lineItems = [...(latestEstimate.line_items || []), provisionalQuickLine(blueprint, pending)];
    await replaceEstimateFieldsIfUnchanged({
      entity: base44.entities.AllInOneEstimate,
      estimateId: estimate.id,
      expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
      nextFields: { line_items: lineItems },
      label: "Quick Product insertion recovery marker",
    });
  }

  return resumeQuickProductInsertion({ estimateId: estimate.id, lineId });
}

export async function instantiateQuickProduct({ estimateId, quickProduct, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !quickProduct?.id) throw new Error("Estimate and Quick Product are required.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");

  const pendingLine = findPendingQuickInsertLine(estimate);
  if (pendingLine) {
    const pending = pendingBuilderMutation(pendingLine);
    if (pending?.source_type === "quick_product" && pending?.source_id === quickProduct.id) {
      return resumeQuickProductInsertion({ estimateId, lineId: pendingLine.line_id });
    }
    throw new Error("Another Quick Product or Builder mutation is still being recovered. Resume it before adding another Product.");
  }

  const candidateKey = quickInsertOperationKey({
    estimateId,
    expectedEstimateUpdatedAt: expectedEstimateUpdatedAt || estimate.updated_date || "",
    sourceType: "quick_product",
    sourceId: quickProduct.id,
    sourceUpdatedAt: quickProduct.updated_date || "",
    productPayload: quickProduct,
  });
  const alreadyCompleted = findCompletedQuickInsertLine(estimate, candidateKey);
  if (alreadyCompleted) return completedQuickInsertResult(estimate, alreadyCompleted, { alreadyCompleted: true });

  const [liveQuickProduct, me] = await Promise.all([
    base44.entities.QuickProduct.get(quickProduct.id),
    base44.auth.me().catch(() => null),
  ]);
  if (!liveQuickProduct) throw new Error("This Quick Product no longer exists. Reopen Add Product to refresh the library.");
  if (liveQuickProduct.is_active === false) throw new Error("This Quick Product is now inactive and cannot be added. Reopen Add Product to refresh the library.");
  const accessible = liveQuickProduct.product_group === "global" || !liveQuickProduct.created_by_id || (!!me?.id && liveQuickProduct.created_by_id === me.id);
  if (!accessible) throw new Error("This Quick Product is no longer available to your account.");
  if (quickProduct.updated_date && liveQuickProduct.updated_date && quickProduct.updated_date !== liveQuickProduct.updated_date) {
    throw new Error("This Quick Product changed after the Add Product window loaded. Reopen Add Product and review the latest reusable Product before adding it.");
  }
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  return startQuickProductInsertion({
    estimate,
    productPayload: liveQuickProduct,
    sourceType: "quick_product",
    sourceId: liveQuickProduct.id,
    sourceUpdatedAt: liveQuickProduct.updated_date || "",
    expectedEstimateUpdatedAt,
  });
}

export async function instantiateProductSnapshot({ estimateId, productSnapshot, expectedEstimateUpdatedAt = "", sourceId = "", sourceType = "clipboard_product" }) {
  if (!estimateId || !productSnapshot) throw new Error("Estimate and Product snapshot are required.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const payloadHash = quickPayloadFingerprint(productSnapshot);
  const pendingLine = findPendingQuickInsertLine(estimate);
  if (pendingLine) {
    const pending = pendingBuilderMutation(pendingLine);
    if (pending?.source_type === sourceType && pending?.payload_hash === payloadHash && (!sourceId || !pending.source_id || pending.source_id === sourceId)) {
      return resumeQuickProductInsertion({ estimateId, lineId: pendingLine.line_id });
    }
    throw new Error("Another Quick Product or Builder mutation is still being recovered. Resume it before pasting another Product.");
  }
  const operationKey = quickInsertOperationKey({
    estimateId,
    expectedEstimateUpdatedAt: expectedEstimateUpdatedAt || estimate.updated_date || "",
    sourceType,
    sourceId,
    sourceUpdatedAt: "",
    productPayload: productSnapshot,
  });
  const alreadyCompleted = findCompletedQuickInsertLine(estimate, operationKey);
  if (alreadyCompleted) return completedQuickInsertResult(estimate, alreadyCompleted, { alreadyCompleted: true });
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  return startQuickProductInsertion({
    estimate,
    productPayload: productSnapshot,
    sourceType,
    sourceId,
    sourceUpdatedAt: "",
    expectedEstimateUpdatedAt,
  });
}


export async function listQuickProducts() {
  const [rows, me] = await Promise.all([
    loadAllEntityRows({ entity: base44.entities.QuickProduct, sort: "product_name", label: "Quick Product library" }),
    base44.auth.me().catch(() => null),
  ]);
  return (rows || [])
    .filter((row) => {
      if (row.is_active === false) return false;
      if (row.product_group === "global") return true;
      // Built-in created_by_id is the ownership boundary for "My Quick Products".
      // Keep unowned rows visible for compatibility with any future imported legacy data.
      return !row.created_by_id || (!!me?.id && row.created_by_id === me.id);
    })
    .sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}