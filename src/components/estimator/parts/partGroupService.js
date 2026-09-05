import { base44 } from "@/api/base44Client";
import { makeStableId } from "@/components/estimator/builder/builderService";
import { stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { applyBuilderPartPriceAcceptancePlan } from "@/components/estimator/builder/partSync";
import { builderMutationHash, markBuilderMutationPending, pendingBuilderMutation, recoveryPatchDiffers, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

async function nextRevisionNumber(builderProductId) {
  const rows = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId });
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

function estimateLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

async function loadGroupMutationContext(builderProductId, expectedEstimateUpdatedAt = "") {
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  if (!estimateLine(estimate, builder.id)) throw new Error("This Product is no longer part of the estimate. Reload before changing its Part Groups.");
  return { builder, estimate };
}

function assertVersion(row, expectedUpdatedAt, label) {
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(row?.updated_date || "").trim();
  if (expected && current !== expected) throw new Error(`${label} changed in another session. Reload the Product before continuing.`);
}

function assertMemberVersions(parts, expectedPartVersions = {}) {
  for (const part of parts || []) {
    const expected = expectedPartVersions?.[part.id] || "";
    assertVersion(part, expected, `Part “${part.part_name || "Part"}”`);
  }
}

async function updateVerifiedEstimateLines(estimate, patchesByBuilderId) {
  const lineItems = (estimate.line_items || []).map((line) => {
    const patch = patchesByBuilderId[line.builder_product_id];
    if (!patch) return line;
    return { ...line, ...(typeof patch === "function" ? patch(line) : patch) };
  });
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
  return lineItems;
}

export async function createPartGroupInProduct({ builderProductId, partIds = [], groupName = "Part Group", expectedEstimateUpdatedAt = "", expectedPartVersions = {} }) {
  if (!builderProductId || partIds.length < 2) throw new Error("Select at least two Parts to create a Part Group.");
  const [, allParts, allGroups] = await Promise.all([
    loadGroupMutationContext(builderProductId, expectedEstimateUpdatedAt),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
  ]);
  const selectedIds = new Set(partIds);
  const selected = (allParts || []).filter((part) => part.is_active !== false && selectedIds.has(part.id));
  if (selected.length !== selectedIds.size) throw new Error("One or more selected Parts no longer belong to this Product. Reload before grouping them.");
  if (selected.some((part) => part.part_group_id)) {
    throw new Error("One or more selected Parts already belong to a Part Group. Dissolve or remove them from the existing group before creating a new group.");
  }
  assertMemberVersions(selected, expectedPartVersions);
  const group = await base44.entities.BuilderPartGroup.create({
    builder_product_id: builderProductId,
    group_key: makeStableId("group"),
    group_name: String(groupName || "Part Group").trim() || "Part Group",
    sort_order: (allGroups || []).filter((row) => row.is_active !== false).length,
    copy_as_unit: true,
    is_collapsed: false,
    is_active: true,
  });
  for (const part of selected) await base44.entities.BuilderPart.update(part.id, { part_group_id: group.id });
  await base44.entities.BuilderProduct.update(builderProductId, {
    group_count: (allGroups || []).filter((row) => row.is_active !== false).length + 1,
  });
  return group;
}

export async function renamePartGroup({ builderProductId, groupId, groupName, expectedEstimateUpdatedAt = "", expectedGroupUpdatedAt = "" }) {
  if (!builderProductId || !groupId) throw new Error("Part Group is required.");
  const [{ builder }, group] = await Promise.all([
    loadGroupMutationContext(builderProductId, expectedEstimateUpdatedAt),
    base44.entities.BuilderPartGroup.get(groupId),
  ]);
  if (!group || group.builder_product_id !== builder.id) throw new Error("Part Group could not be loaded.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");
  return base44.entities.BuilderPartGroup.update(group.id, { group_name: String(groupName || "Part Group").trim() || "Part Group" });
}

export async function dissolvePartGroup({ builderProductId, groupId, expectedEstimateUpdatedAt = "", expectedGroupUpdatedAt = "", expectedPartVersions = {} }) {
  if (!builderProductId || !groupId) throw new Error("Part Group is required.");
  const [{ builder }, group, allParts, allGroups] = await Promise.all([
    loadGroupMutationContext(builderProductId, expectedEstimateUpdatedAt),
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
  ]);
  if (!group || group.builder_product_id !== builder.id) throw new Error("Part Group could not be loaded.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");
  const members = (allParts || []).filter((part) => part.is_active !== false && part.part_group_id === group.id);
  assertMemberVersions(members, expectedPartVersions);
  for (const part of members) await base44.entities.BuilderPart.update(part.id, { part_group_id: "" });
  await base44.entities.BuilderPartGroup.delete(group.id);
  await base44.entities.BuilderProduct.update(builder.id, {
    group_count: Math.max(0, (allGroups || []).filter((row) => row.is_active !== false).length - 1),
  });
  return { dissolved: group.id, partCount: members.length };
}

export async function clonePartGroupInProduct({ builderProductId, groupId, expectedEstimateUpdatedAt = "", expectedGroupUpdatedAt = "", expectedPartVersions = {} }) {
  if (!builderProductId || !groupId) throw new Error("Part Group is required.");

  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const currentLine = estimateLine(estimate, builder.id);
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before cloning its Part Group.");

  const operationKey = `builder_part_group_clone:${builderMutationHash({
    estimate_id: estimate.id,
    builder_product_id: builder.id,
    source_group_id: groupId,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    expected_group_updated_at: expectedGroupUpdatedAt || "",
    expected_part_versions: expectedPartVersions || {},
  })}`;

  const [group, allParts, allGroups, revisions] = await Promise.all([
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }),
  ]);
  if (!Array.isArray(allParts) || !Array.isArray(allGroups) || !Array.isArray(revisions)) {
    throw new Error("Part Group clone prerequisites could not be fully verified.");
  }

  const existingPending = pendingBuilderMutation(currentLine);
  if (existingPending) {
    if (existingPending.kind !== "builder_part_group_clone" || existingPending.key !== operationKey) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume it before cloning a Part Group.");
    }
    const recovered = await resumeBuilderMutation({
      estimateId: estimate.id,
      estimate,
      builder,
      parts: allParts,
      line: currentLine,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan,
    });
    const [groupsAfter, partsAfter] = await Promise.all([
      base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
      base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    ]);
    const recoveredGroup = (groupsAfter || []).find((row) => row.group_key === existingPending.target_group_key) || null;
    const targetPartKeys = new Set(existingPending.target_part_keys || []);
    return { group: recoveredGroup, parts: (partsAfter || []).filter((part) => targetPartKeys.has(part.part_key)), recovered: true, line: recovered?.line || currentLine };
  }

  const completedRevision = revisions.find((row) => String(row.idempotency_key || "") === operationKey);
  if (completedRevision) {
    const targetGroupKey = `clone-group-${builderMutationHash({ operation_key: operationKey, source_group_id: groupId })}`;
    const completedGroup = allGroups.find((row) => row.group_key === targetGroupKey) || null;
    const completedPartKeys = new Set((completedRevision.changed_parts || []).map((part) => part.part_key).filter(Boolean));
    const completedParts = allParts.filter((part) => completedPartKeys.has(part.part_key));
    const targetMatches = completedGroup &&
      completedParts.length === completedPartKeys.size &&
      !recoveryPatchDiffers(builder, {
        frozen_cost: completedRevision.new_total_cost,
        frozen_customer_price: completedRevision.new_customer_price,
      }) &&
      !recoveryPatchDiffers(currentLine, {
        total_snapshot: completedRevision.new_total_cost,
        customer_price_snapshot: completedRevision.new_customer_price,
      });
    if (targetMatches) return { group: completedGroup, parts: completedParts, alreadyCompleted: true };
    throw new Error("The Part Group clone audit exists, but the Product no longer matches that completed clone. Reload and review the Product before continuing.");
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  if (!group || group.builder_product_id !== builderProductId) throw new Error("Part Group could not be loaded.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");

  const sourceParts = allParts
    .filter((part) => part.is_active !== false && part.part_group_id === groupId)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!sourceParts.length) throw new Error("This Part Group does not contain any active Parts.");
  assertMemberVersions(sourceParts, expectedPartVersions);

  const timestamp = nowIso();
  const isCustom = builder.module_key === "custom";
  const activeGroupCount = allGroups.filter((row) => row.is_active !== false).length;
  const activePartCount = allParts.filter((part) => part.is_active !== false).length;
  const targetGroupKey = `clone-group-${builderMutationHash({ operation_key: operationKey, source_group_id: group.id })}`;
  const groupData = {
    ...stripEntitySystemFields(group),
    builder_product_id: builder.id,
    group_key: targetGroupKey,
    group_name: `${group.group_name || "Part Group"} Copy`,
    sort_order: activeGroupCount,
    is_collapsed: false,
    is_active: true,
  };

  const partSteps = sourceParts.map((sourcePart, index) => {
    const partKey = `clone-part-${builderMutationHash({ operation_key: operationKey, source_part_id: sourcePart.id, index })}`;
    return {
      operation: "create",
      part_key: partKey,
      part_group_key_ref: targetGroupKey,
      data: {
        ...stripEntitySystemFields(sourcePart),
        builder_product_id: builder.id,
        part_group_id: "",
        part_key: partKey,
        sort_order: activePartCount + index,
        builder_sync_state: isCustom ? "manual" : "manual_addon",
        source_path: "",
        builder_detached_at: "",
        builder_detached_reason: isCustom ? "" : "Independent Part created by cloning a Part Group.",
        builder_detached_snapshot: {},
        reattach_candidate_id: "",
        reattach_candidate_name: "",
        last_price_check_at: timestamp,
        last_price_update_at: timestamp,
        is_active: true,
        notes: `${sourcePart.notes ? `${sourcePart.notes}\n` : ""}Cloned with Part Group “${group.group_name || "Part Group"}”.`,
      },
    };
  });

  const addedFrozen = sourceParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = sourceParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost);
  const previousCurrent = num(builder.current_recalculated_cost, previousFrozen);
  const nextFrozen = previousFrozen + addedFrozen;
  const nextCurrent = previousCurrent + addedCurrent;
  const nextState = Math.abs(nextCurrent - nextFrozen) > 0.005 ? "changed" : "current";
  const previousCustomer = num(builder.frozen_customer_price, previousFrozen);
  const nextCustomer = previousCustomer + addedFrozen;
  const builderPatch = {
    frozen_cost: nextFrozen,
    frozen_customer_price: nextCustomer,
    current_recalculated_cost: nextCurrent,
    price_state: nextState,
    price_delta: nextCurrent - nextFrozen,
    price_delta_percent: nextFrozen ? ((nextCurrent - nextFrozen) / nextFrozen) * 100 : 0,
    part_count: activePartCount + sourceParts.length,
    group_count: activeGroupCount + 1,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  };
  const linePatch = {
    total_snapshot: nextFrozen,
    live_total_snapshot: nextCurrent,
    customer_price_snapshot: nextCustomer,
    live_customer_price_snapshot: liveCustomerUnitPrice(currentLine) + addedCurrent,
    price_state: nextState,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  };
  const changedParts = sourceParts.map((part, index) => ({
    source_part_id: part.id,
    part_key_ref: partSteps[index].part_key,
    part_name: part.part_name,
    action: "clone_part_group",
    source_group_id: group.id,
    new_group_key_ref: targetGroupKey,
    frozen_extended_cost: num(part.frozen_extended_cost),
  }));
  const pending = {
    key: operationKey,
    kind: "builder_part_group_clone",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: currentLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num(builder.builder_version, 1),
    source_group_id: group.id,
    target_group_key: targetGroupKey,
    target_part_keys: partSteps.map((step) => step.part_key),
    precondition_plan: {
      groups: [{
        id: group.id,
        expected_updated_date: group.updated_date || "",
        expected_patch: { builder_product_id: builder.id, group_key: group.group_key || "" },
      }],
      parts: sourceParts.map((part) => ({
        id: part.id,
        expected_updated_date: part.updated_date || "",
        expected_patch: { builder_product_id: builder.id, part_group_id: group.id, part_key: part.part_key || "" },
      })),
    },
    group_create_plan: { groups: [{ group_key: targetGroupKey, data: groupData }] },
    part_acceptance_plan: {
      timestamp,
      part_updates: partSteps,
      changed_parts: changedParts,
      active_part_count: activePartCount + sourceParts.length,
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision: {
      builder_product_id: builder.id,
      estimate_id: builder.estimate_id || "",
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
      notes: `Cloned Part Group “${group.group_name || "Part Group"}” with ${sourceParts.length} Part${sourceParts.length === 1 ? "" : "s"}. Builder-linked source Parts were copied as independent add-ons so future Builder saves cannot overwrite the clone.`,
    },
  };

  const marked = await markBuilderMutationPending({ estimate, builder, pending });
  const recovered = await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan,
  });
  const [groupsAfter, partsAfter] = await Promise.all([
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
  ]);
  const clonedGroup = (groupsAfter || []).find((row) => row.group_key === targetGroupKey) || null;
  const targetPartKeys = new Set(partSteps.map((step) => step.part_key));
  return { group: clonedGroup, parts: (partsAfter || []).filter((part) => targetPartKeys.has(part.part_key)), recovered: true, line: recovered?.line || currentLine };
}

export async function moveIndependentPartGroup({ sourceBuilderProductId, targetBuilderProductId, groupId, expectedEstimateUpdatedAt = "", expectedGroupUpdatedAt = "", expectedPartVersions = {} }) {
  if (!sourceBuilderProductId || !targetBuilderProductId || !groupId) throw new Error("Source Product, target Product and Part Group are required.");
  if (sourceBuilderProductId === targetBuilderProductId) throw new Error("Choose a different target Product.");

  const [sourceBuilder, targetBuilder, group, sourceParts, sourceGroups, targetParts, targetGroups, sourceRevision, targetRevision] = await Promise.all([
    base44.entities.BuilderProduct.get(sourceBuilderProductId),
    base44.entities.BuilderProduct.get(targetBuilderProductId),
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: sourceBuilderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: sourceBuilderProductId }),
    base44.entities.BuilderPart.filter({ builder_product_id: targetBuilderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: targetBuilderProductId }),
    nextRevisionNumber(sourceBuilderProductId),
    nextRevisionNumber(targetBuilderProductId),
  ]);

  if (!sourceBuilder || !targetBuilder || !group || group.builder_product_id !== sourceBuilderProductId) throw new Error("Part Group could not be loaded.");
  if (sourceBuilder.estimate_id && targetBuilder.estimate_id && sourceBuilder.estimate_id !== targetBuilder.estimate_id) {
    throw new Error("Direct Move is only available between Products in the same estimate. Use Copy/Paste for another estimate.");
  }

  if (!sourceBuilder.estimate_id || sourceBuilder.estimate_id !== targetBuilder.estimate_id) throw new Error("Both Products must belong to the same estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(sourceBuilder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  if (!estimateLine(estimate, sourceBuilder.id) || !estimateLine(estimate, targetBuilder.id)) throw new Error("Both Products must still belong to this estimate. Reload before moving the Part Group.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");

  const movingParts = (sourceParts || [])
    .filter((part) => part.is_active !== false && part.part_group_id === groupId)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!movingParts.length) throw new Error("This Part Group does not contain any active Parts.");
  assertMemberVersions(movingParts, expectedPartVersions);

  const blocked = movingParts.filter((part) => !["manual", "manual_addon"].includes(part.builder_sync_state));
  if (blocked.length) {
    throw new Error("This Part Group contains Builder-owned Parts and cannot be moved directly. Use Clone or Copy instead so the source Builder remains internally consistent.");
  }

  const timestamp = nowIso();
  const movedFrozen = movingParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const movedCurrent = movingParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const sourcePreviousFrozen = num(sourceBuilder.frozen_cost);
  const sourcePreviousCurrent = num(sourceBuilder.current_recalculated_cost, sourcePreviousFrozen);
  const targetPreviousFrozen = num(targetBuilder.frozen_cost);
  const targetPreviousCurrent = num(targetBuilder.current_recalculated_cost, targetPreviousFrozen);
  const sourceNextFrozen = Math.max(0, sourcePreviousFrozen - movedFrozen);
  const sourceNextCurrent = Math.max(0, sourcePreviousCurrent - movedCurrent);
  const targetNextFrozen = targetPreviousFrozen + movedFrozen;
  const targetNextCurrent = targetPreviousCurrent + movedCurrent;
  const sourcePreviousCustomer = num(sourceBuilder.frozen_customer_price, sourcePreviousFrozen);
  const targetPreviousCustomer = num(targetBuilder.frozen_customer_price, targetPreviousFrozen);
  const targetSyncState = targetBuilder.module_key === "custom" ? "manual" : "manual_addon";
  const targetActivePartCount = (targetParts || []).filter((part) => part.is_active !== false).length;
  const sourceActivePartCount = (sourceParts || []).filter((part) => part.is_active !== false).length;
  const sourceActiveGroupCount = (sourceGroups || []).filter((row) => row.is_active !== false).length;
  const targetActiveGroupCount = (targetGroups || []).filter((row) => row.is_active !== false).length;

  await base44.entities.BuilderPartGroup.update(group.id, {
    builder_product_id: targetBuilder.id,
    group_key: makeStableId("group"),
    sort_order: targetActiveGroupCount,
    is_collapsed: false,
  });

  for (let index = 0; index < movingParts.length; index += 1) {
    const part = movingParts[index];
    await base44.entities.BuilderPart.update(part.id, {
      builder_product_id: targetBuilder.id,
      source_module_key: targetBuilder.module_key || "custom",
      source_path: "",
      builder_sync_state: targetSyncState,
      builder_detached_at: "",
      builder_detached_reason: targetSyncState === "manual_addon" ? "Independent Part moved from another Product." : "",
      builder_detached_snapshot: {},
      reattach_candidate_id: "",
      reattach_candidate_name: "",
      sort_order: targetActivePartCount + index,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      is_active: true,
    });
  }

  const sourceState = sourceBuilder.needs_reattach_review
    ? "detached_parts"
    : Math.abs(sourceNextCurrent - sourceNextFrozen) > 0.005 ? "changed" : "current";
  const targetState = targetBuilder.needs_reattach_review
    ? "detached_parts"
    : Math.abs(targetNextCurrent - targetNextFrozen) > 0.005 ? "changed" : "current";

  await Promise.all([
    base44.entities.BuilderProduct.update(sourceBuilder.id, {
      frozen_cost: sourceNextFrozen,
      frozen_customer_price: Math.max(0, sourcePreviousCustomer - movedFrozen),
      current_recalculated_cost: sourceNextCurrent,
      price_state: sourceState,
      price_delta: sourceNextCurrent - sourceNextFrozen,
      price_delta_percent: sourceNextFrozen ? ((sourceNextCurrent - sourceNextFrozen) / sourceNextFrozen) * 100 : 0,
      part_count: Math.max(0, sourceActivePartCount - movingParts.length),
      group_count: Math.max(0, sourceActiveGroupCount - 1),
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      builder_version: num(sourceBuilder.builder_version, 1) + 1,
    }),
    base44.entities.BuilderProduct.update(targetBuilder.id, {
      frozen_cost: targetNextFrozen,
      frozen_customer_price: targetPreviousCustomer + movedFrozen,
      current_recalculated_cost: targetNextCurrent,
      price_state: targetState,
      price_delta: targetNextCurrent - targetNextFrozen,
      price_delta_percent: targetNextFrozen ? ((targetNextCurrent - targetNextFrozen) / targetNextFrozen) * 100 : 0,
      part_count: targetActivePartCount + movingParts.length,
      group_count: targetActiveGroupCount + 1,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      builder_version: num(targetBuilder.builder_version, 1) + 1,
    }),
  ]);

  await updateVerifiedEstimateLines(estimate, {
    [sourceBuilder.id]: (line) => ({
      total_snapshot: sourceNextFrozen,
      live_total_snapshot: sourceNextCurrent,
      customer_price_snapshot: Math.max(0, sourcePreviousCustomer - movedFrozen),
      live_customer_price_snapshot: Math.max(0, liveCustomerUnitPrice(line) - movedCurrent),
      price_state: sourceState,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
    }),
    [targetBuilder.id]: (line) => ({
      total_snapshot: targetNextFrozen,
      live_total_snapshot: targetNextCurrent,
      customer_price_snapshot: targetPreviousCustomer + movedFrozen,
      live_customer_price_snapshot: liveCustomerUnitPrice(line) + movedCurrent,
      price_state: targetState,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
    }),
  });
  await Promise.all([
    base44.entities.BuilderPriceRevision.create({
      builder_product_id: sourceBuilder.id,
      estimate_id: sourceBuilder.estimate_id || "",
      revision_number: sourceRevision,
      reason: "manual_adjustment",
      previous_total_cost: sourcePreviousFrozen,
      new_total_cost: sourceNextFrozen,
      previous_customer_price: sourcePreviousCustomer,
      new_customer_price: Math.max(0, sourcePreviousCustomer - movedFrozen),
      changed_parts: movingParts.map((part) => ({ part_id: part.id, part_name: part.part_name, action: "move_part_group_out", group_id: group.id, target_builder_product_id: targetBuilder.id, frozen_extended_cost: num(part.frozen_extended_cost) })),
      builder_snapshot_before: sourceBuilder.builder_snapshot || {},
      builder_snapshot_after: sourceBuilder.builder_snapshot || {},
      price_snapshot_before: { total: sourcePreviousFrozen },
      price_snapshot_after: { total: sourceNextFrozen },
      notes: `Moved Part Group “${group.group_name || "Part Group"}” to Product “${targetBuilder.client_product_name || targetBuilder.builder_name || "Product"}”.`,
    }),
    base44.entities.BuilderPriceRevision.create({
      builder_product_id: targetBuilder.id,
      estimate_id: targetBuilder.estimate_id || "",
      revision_number: targetRevision,
      reason: "manual_adjustment",
      previous_total_cost: targetPreviousFrozen,
      new_total_cost: targetNextFrozen,
      previous_customer_price: targetPreviousCustomer,
      new_customer_price: targetPreviousCustomer + movedFrozen,
      changed_parts: movingParts.map((part) => ({ part_id: part.id, part_name: part.part_name, action: "move_part_group_in", group_id: group.id, source_builder_product_id: sourceBuilder.id, frozen_extended_cost: num(part.frozen_extended_cost) })),
      builder_snapshot_before: targetBuilder.builder_snapshot || {},
      builder_snapshot_after: targetBuilder.builder_snapshot || {},
      price_snapshot_before: { total: targetPreviousFrozen },
      price_snapshot_after: { total: targetNextFrozen },
      notes: `Received Part Group “${group.group_name || "Part Group"}” from Product “${sourceBuilder.client_product_name || sourceBuilder.builder_name || "Product"}”.`,
    }),
  ]);

  return { groupId: group.id, movedParts: movingParts.length, sourceBuilderProductId, targetBuilderProductId };
}
