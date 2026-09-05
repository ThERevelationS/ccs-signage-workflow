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
  const [{ builder, estimate }, group, allParts, allGroups, revisionNumber] = await Promise.all([
    loadGroupMutationContext(builderProductId, expectedEstimateUpdatedAt),
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
    nextRevisionNumber(builderProductId),
  ]);
  if (!builder || !group || group.builder_product_id !== builderProductId) throw new Error("Part Group could not be loaded.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");

  const sourceParts = (allParts || [])
    .filter((part) => part.is_active !== false && part.part_group_id === groupId)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!sourceParts.length) throw new Error("This Part Group does not contain any active Parts.");
  assertMemberVersions(sourceParts, expectedPartVersions);

  const timestamp = nowIso();
  const isCustom = builder.module_key === "custom";
  const newGroup = await base44.entities.BuilderPartGroup.create({
    ...stripEntitySystemFields(group),
    builder_product_id: builder.id,
    group_key: makeStableId("group"),
    group_name: `${group.group_name || "Part Group"} Copy`,
    sort_order: (allGroups || []).filter((row) => row.is_active !== false).length,
    is_collapsed: false,
    is_active: true,
  });

  const activePartCount = (allParts || []).filter((part) => part.is_active !== false).length;
  const clonedParts = [];
  for (let index = 0; index < sourceParts.length; index += 1) {
    const sourcePart = sourceParts[index];
    const cloned = await base44.entities.BuilderPart.create({
      ...stripEntitySystemFields(sourcePart),
      builder_product_id: builder.id,
      part_group_id: newGroup.id,
      part_key: makeStableId("part"),
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
    });
    clonedParts.push(cloned);
  }

  const addedFrozen = clonedParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = clonedParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost);
  const previousCurrent = num(builder.current_recalculated_cost, previousFrozen);
  const nextFrozen = previousFrozen + addedFrozen;
  const nextCurrent = previousCurrent + addedCurrent;
  const nextState = Math.abs(nextCurrent - nextFrozen) > 0.005 ? "changed" : "current";
  const previousCustomer = num(builder.frozen_customer_price, previousFrozen);

  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextFrozen,
    frozen_customer_price: previousCustomer + addedFrozen,
    current_recalculated_cost: nextCurrent,
    price_state: nextState,
    price_delta: nextCurrent - nextFrozen,
    price_delta_percent: nextFrozen ? ((nextCurrent - nextFrozen) / nextFrozen) * 100 : 0,
    part_count: activePartCount + clonedParts.length,
    group_count: (allGroups || []).filter((row) => row.is_active !== false).length + 1,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const nextCustomer = previousCustomer + addedFrozen;
  await updateVerifiedEstimateLines(estimate, {
    [builder.id]: (line) => ({
      total_snapshot: nextFrozen,
      live_total_snapshot: nextCurrent,
      customer_price_snapshot: nextCustomer,
      live_customer_price_snapshot: liveCustomerUnitPrice(line) + addedCurrent,
      price_state: nextState,
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
    }),
  });

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    revision_number: revisionNumber,
    reason: "manual_adjustment",
    previous_total_cost: previousFrozen,
    new_total_cost: nextFrozen,
    previous_customer_price: previousCustomer,
    new_customer_price: previousCustomer + addedFrozen,
    changed_parts: clonedParts.map((part) => ({
      part_id: part.id,
      part_name: part.part_name,
      action: "clone_part_group",
      source_group_id: group.id,
      new_group_id: newGroup.id,
      frozen_extended_cost: num(part.frozen_extended_cost),
    })),
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousFrozen },
    price_snapshot_after: { total: nextFrozen },
    notes: `Cloned Part Group “${group.group_name || "Part Group"}” with ${clonedParts.length} Part${clonedParts.length === 1 ? "" : "s"}. Builder-linked source Parts were copied as independent add-ons so future Builder saves cannot overwrite the clone.`,
  });

  return { group: newGroup, parts: clonedParts };
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
