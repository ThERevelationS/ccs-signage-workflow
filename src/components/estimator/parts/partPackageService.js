import { base44 } from "@/api/base44Client";
import { stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { applyBuilderPartPriceAcceptancePlan } from "@/components/estimator/builder/partSync";
import { builderMutationHash, markBuilderMutationPending, pendingBuilderMutation, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

function getEstimateLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

function packageResult({ parts, groups, partKeys, groupKey, line, recovered = false, alreadyCompleted = false }) {
  return {
    parts: (parts || []).filter((part) => partKeys.includes(part.part_key)),
    group: groupKey ? (groups || []).find((group) => group.group_key === groupKey) || null : null,
    line,
    recovered,
    alreadyCompleted,
  };
}

export async function addPartPackageToProduct({
  estimateId,
  targetBuilderProductId,
  itemType,
  itemName,
  payload,
  sourceType = "library",
  sourceId = "",
  expectedEstimateUpdatedAt = "",
}) {
  if (!estimateId || !targetBuilderProductId) throw new Error("Estimate and target Product are required.");
  if (!["part", "part_group"].includes(itemType)) throw new Error("A Part or Part Group package is required.");

  const [estimate, builder] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(targetBuilderProductId),
  ]);
  if (!estimate || !builder) throw new Error("Target Product could not be loaded.");
  if (builder.estimate_id && builder.estimate_id !== estimateId) {
    throw new Error("This Product no longer belongs to the target estimate. Reload before adding saved Parts.");
  }
  const targetLine = getEstimateLine(estimate, targetBuilderProductId);
  if (!targetLine) throw new Error("Target Product is not part of this estimate.");

  const existingPending = pendingBuilderMutation(targetLine);
  if (existingPending) {
    if (
      existingPending.kind !== "builder_part_package_add" ||
      String(existingPending.builder_product_id || "") !== String(builder.id) ||
      (existingPending.source_type && existingPending.source_type !== sourceType) ||
      (existingPending.source_id && sourceId && existingPending.source_id !== sourceId)
    ) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before adding saved Parts.");
    }
    const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
    if (!Array.isArray(parts)) throw new Error("Builder Parts could not be verified while resuming the saved Part insertion.");
    const result = await resumeBuilderMutation({
      estimateId,
      estimate,
      builder,
      parts,
      line: targetLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan,
    });
    const [completedParts, completedGroups] = await Promise.all([
      base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
      base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
    ]);
    return packageResult({
      parts: completedParts,
      groups: completedGroups,
      partKeys: existingPending.target_part_keys || [],
      groupKey: existingPending.target_group_key || "",
      line: result.line,
      recovered: true,
    });
  }

  const isCustom = targetLine.module_key === "custom";
  const payloadParts = itemType === "part_group" ? (payload?.parts || []) : [payload?.part].filter(Boolean);
  if (!payloadParts.length) throw new Error("This saved package does not contain any Parts.");

  const fingerprintPayload = {
    group: itemType === "part_group" ? stripEntitySystemFields(payload?.group || {}) : null,
    parts: payloadParts.map((part) => stripEntitySystemFields(part || {})),
  };
  const requestHash = builderMutationHash({
    builder_product_id: builder.id,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || estimate.updated_date || "",
    item_type: itemType,
    source_type: sourceType,
    source_id: sourceId,
    payload: fingerprintPayload,
  });
  const operationKey = `builder_part_package_add:${builder.id}:${requestHash}`;
  const partKeys = payloadParts.map((_, index) => `package-part-${requestHash}-${index}`);
  const groupKey = itemType === "part_group" ? `package-group-${requestHash}` : "";

  // If the final Estimate write succeeded but its response was lost, the durable
  // marker is already gone. Reuse the idempotent revision + deterministic keys
  // so the same browser action resolves as completed instead of inserting again.
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
  const completedRevision = (revisions || []).find((revision) => String(revision.idempotency_key || "") === operationKey);
  if (completedRevision) {
    const [completedParts, completedGroups] = await Promise.all([
      base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
      base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
    ]);
    const completePartCount = (completedParts || []).filter((part) => partKeys.includes(part.part_key)).length;
    const completeGroup = !groupKey || (completedGroups || []).some((group) => group.group_key === groupKey);
    if (completePartCount !== partKeys.length || !completeGroup) {
      throw new Error("The saved Part insertion audit exists, but its inserted records could not be fully verified. Reload before continuing.");
    }
    return packageResult({
      parts: completedParts,
      groups: completedGroups,
      partKeys,
      groupKey,
      line: targetLine,
      alreadyCompleted: true,
    });
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });

  const timestamp = nowIso();
  const [activeParts, activeGroups] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
  ]);
  if (!Array.isArray(activeParts) || activeParts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified before adding the saved package.");
  }
  if (!Array.isArray(activeGroups) || activeGroups.some((group) => group?.builder_product_id !== builder.id)) {
    throw new Error("Part Groups could not be verified before adding the saved package.");
  }
  const targetPartCount = activeParts.filter((part) => part.is_active !== false).length;
  const targetGroupCount = activeGroups.filter((group) => group.is_active !== false).length;

  let groupData = null;
  if (itemType === "part_group") {
    const group = payload?.group || {};
    groupData = stripEntitySystemFields(group);
    delete groupData.snapshot_source_group_id;
    groupData = {
      ...groupData,
      builder_product_id: builder.id,
      group_key: groupKey,
      group_name: group.group_name || itemName || "Part Group",
      parent_group_id: "",
      sort_order: targetGroupCount,
      is_collapsed: false,
      is_active: true,
    };
  }

  const sourceLabel = sourceType === "clipboard" ? "estimator clipboard" : "Part Library";
  const targetSyncState = isCustom ? "manual" : "manual_addon";
  const plannedParts = payloadParts.map((sourcePart, index) => {
    const partData = stripEntitySystemFields(sourcePart);
    const missingInventory = ["detached", "reattach_available"].includes(sourcePart.inventory_link_state);
    const frozenExtended = num(sourcePart.frozen_extended_cost);
    const currentExtended = num(sourcePart.current_extended_cost, frozenExtended);
    const normalizedPriceState = missingInventory
      ? "detached"
      : sourcePart.manual_cost_override || sourcePart.price_state === "manual"
        ? "manual"
        : Math.abs(currentExtended - frozenExtended) > 0.005 ? "changed" : "current";
    return {
      ...partData,
      builder_product_id: builder.id,
      part_group_id: "",
      part_key: partKeys[index],
      sort_order: targetPartCount + index,
      source_module_key: isCustom ? "custom" : targetLine.module_key,
      source_path: "",
      builder_sync_state: targetSyncState,
      builder_detached_at: "",
      builder_detached_reason: targetSyncState === "manual_addon" ? `Independent Part added from ${sourceLabel}.` : "",
      builder_detached_snapshot: {},
      inventory_link_state: sourcePart.inventory_link_state === "reattach_available" ? "detached" : (sourcePart.inventory_link_state || "manual"),
      reattach_candidate_id: "",
      reattach_candidate_name: "",
      price_state: normalizedPriceState,
      price_delta: currentExtended - frozenExtended,
      price_delta_percent: frozenExtended ? ((currentExtended - frozenExtended) / frozenExtended) * 100 : 0,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      is_active: true,
    };
  });

  const addedFrozen = plannedParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = plannedParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost, num(targetLine.total_snapshot));
  const previousCurrent = num(builder.current_recalculated_cost, num(targetLine.live_total_snapshot, previousFrozen));
  const previousCustomer = num(builder.frozen_customer_price, previousFrozen);
  const nextFrozen = previousFrozen + addedFrozen;
  const nextCurrent = previousCurrent + addedCurrent;
  const nextCustomer = previousCustomer + addedFrozen;
  const insertedDetachedCount = plannedParts.filter((part) => ["detached", "reattach_available"].includes(part.inventory_link_state) || part.price_state === "detached").length;
  const nextDetachedCount = num(builder.detached_part_count) + insertedDetachedCount;
  const nextNeedsReattachReview = !!builder.needs_reattach_review || insertedDetachedCount > 0;
  const nextState = nextNeedsReattachReview
    ? "detached_parts"
    : Math.abs(nextCurrent - nextFrozen) > 0.005 ? "changed" : "current";

  const builderPatch = {
    frozen_cost: nextFrozen,
    frozen_customer_price: nextCustomer,
    current_recalculated_cost: nextCurrent,
    price_state: nextState,
    price_delta: nextCurrent - nextFrozen,
    price_delta_percent: nextFrozen ? ((nextCurrent - nextFrozen) / nextFrozen) * 100 : 0,
    part_count: targetPartCount + plannedParts.length,
    group_count: targetGroupCount + (groupData ? 1 : 0),
    detached_part_count: nextDetachedCount,
    needs_reattach_review: nextNeedsReattachReview,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  };
  const linePatch = {
    total_snapshot: nextFrozen,
    live_total_snapshot: nextCurrent,
    customer_price_snapshot: nextCustomer,
    live_customer_price_snapshot: liveCustomerUnitPrice(targetLine) + addedCurrent,
    price_state: nextState,
    detached_part_count: nextDetachedCount,
    needs_reattach_review: nextNeedsReattachReview,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  };

  const auditSourceLabel = sourceType === "clipboard" ? "30-day estimator clipboard" : "Part Library";
  const sourceField = sourceType === "clipboard" ? "source_clipboard_id" : "source_part_template_id";
  const actionPrefix = sourceType === "clipboard" ? "paste" : "add_saved";
  const changedParts = plannedParts.map((part) => ({
    part_key: part.part_key,
    part_name: part.part_name,
    action: `${actionPrefix}_${itemType}`,
    frozen_extended_cost: num(part.frozen_extended_cost),
    [sourceField]: sourceId,
  }));

  const recoveryMarker = {
    key: operationKey,
    kind: "builder_part_package_add",
    started_at: timestamp,
    estimate_id: estimateId,
    estimate_line_id: targetLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    source_type: sourceType,
    source_id: sourceId,
    item_type: itemType,
    target_part_keys: partKeys,
    target_group_key: groupKey,
    group_create_plan: groupData ? { groups: [{ group_key: groupKey, data: groupData }] } : { groups: [] },
    part_acceptance_plan: {
      timestamp,
      part_updates: plannedParts.map((part) => ({
        operation: "create",
        part_key: part.part_key,
        part_group_key_ref: groupKey,
        data: part,
      })),
      changed_parts: changedParts,
      active_part_count: targetPartCount + plannedParts.length,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: estimateId,
      reason: "manual_adjustment",
      previous_total_cost: previousFrozen,
      new_total_cost: nextFrozen,
      previous_customer_price: previousCustomer,
      new_customer_price: nextCustomer,
      changed_parts: changedParts,
      builder_snapshot_before: builder.builder_snapshot || {},
      builder_snapshot_after: builder.builder_snapshot || {},
      price_snapshot_before: { total: previousFrozen },
      price_snapshot_after: { total: nextFrozen },
      notes: `${sourceType === "clipboard" ? "Pasted" : "Added"} ${itemType.replace("_", " ")} “${itemName || "Saved Part"}” from the ${auditSourceLabel}.`,
    },
  };

  const marked = await markBuilderMutationPending({ estimate, builder, pending: recoveryMarker });
  const result = await resumeBuilderMutation({
    estimateId,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });

  const [completedParts, completedGroups] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
  ]);
  return packageResult({
    parts: completedParts,
    groups: completedGroups,
    partKeys,
    groupKey,
    line: result.line,
  });
}
