import { base44 } from "@/api/base44Client";
import { stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { applyBuilderPartPriceAcceptancePlan } from "@/components/estimator/builder/partSync";
import { builderMutationHash, ensureBuilderPriceRevision, markBuilderMutationPending, pendingBuilderMutation, recoveryPatchDiffers, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

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

export async function createPartGroupInProduct({ builderProductId, partIds = [], groupName = "Part Group", expectedEstimateUpdatedAt = "", expectedPartVersions = {} }) {
  if (!builderProductId || partIds.length < 2) throw new Error("Select at least two Parts to create a Part Group.");
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const currentLine = estimateLine(estimate, builder.id);
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before creating a Part Group.");

  const normalizedPartIds = [...new Set(partIds.map(String))].sort();
  const normalizedName = String(groupName || "Part Group").trim() || "Part Group";
  const operationKey = `builder_part_group_create:${builderMutationHash({
    estimate_id: estimate.id,
    builder_product_id: builder.id,
    part_ids: normalizedPartIds,
    group_name: normalizedName,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    expected_part_versions: expectedPartVersions || {},
  })}`;
  const targetGroupKey = `create-group-${builderMutationHash({ operation_key: operationKey })}`;

  const [allParts, allGroups] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
  ]);
  if (!Array.isArray(allParts) || !Array.isArray(allGroups)) throw new Error("Part Group prerequisites could not be fully verified.");

  const existingPending = pendingBuilderMutation(currentLine);
  if (existingPending) {
    if (existingPending.kind !== "builder_part_group_create" || existingPending.key !== operationKey) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume it before creating a Part Group.");
    }
    const recovered = await resumeBuilderMutation({ estimateId: estimate.id, estimate, builder, parts: allParts, line: currentLine, pending: existingPending, applyPartPlan: applyBuilderPartPriceAcceptancePlan });
    const [groupsAfter, partsAfter] = await Promise.all([
      base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
      base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    ]);
    const group = (groupsAfter || []).find((row) => row.group_key === existingPending.target_group_key) || null;
    if (!group) throw new Error("The recovered Part Group could not be verified after creation.");
    const selectedSet = new Set(existingPending.target_part_ids || []);
    if ((partsAfter || []).filter((part) => selectedSet.has(part.id) && part.part_group_id === group.id).length !== selectedSet.size) {
      throw new Error("The recovered Part Group membership could not be fully verified.");
    }
    return { ...group, recovered: true, line: recovered?.line || currentLine };
  }

  if (currentLine.last_part_group_mutation_key === operationKey && currentLine.last_part_group_mutation_kind === "create") {
    const completedGroup = allGroups.find((row) => row.group_key === targetGroupKey) || null;
    const selectedSet = new Set(normalizedPartIds);
    const complete = completedGroup && allParts.filter((part) => selectedSet.has(part.id) && part.part_group_id === completedGroup.id).length === selectedSet.size;
    if (complete) return { ...completedGroup, alreadyCompleted: true };
    throw new Error("The Part Group create receipt exists, but its completed membership no longer matches. Reload and review the Product.");
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const selectedIds = new Set(normalizedPartIds);
  const selected = allParts.filter((part) => part.is_active !== false && selectedIds.has(String(part.id)));
  if (selected.length !== selectedIds.size) throw new Error("One or more selected Parts no longer belong to this Product. Reload before grouping them.");
  if (selected.some((part) => part.part_group_id)) throw new Error("One or more selected Parts already belong to a Part Group. Dissolve or remove them from the existing group before creating a new group.");
  assertMemberVersions(selected, expectedPartVersions);

  const activeGroupCount = allGroups.filter((row) => row.is_active !== false).length;
  const timestamp = nowIso();
  const groupData = { builder_product_id: builder.id, group_key: targetGroupKey, group_name: normalizedName, sort_order: activeGroupCount, copy_as_unit: true, is_collapsed: false, is_active: true };
  const partUpdates = selected.map((part) => ({ operation: "update", part_id: part.id, part_key: part.part_key, part_group_key_ref: targetGroupKey, expected_updated_date: part.updated_date || "", patch: { part_group_id: "" } }));
  const pending = {
    key: operationKey,
    kind: "builder_part_group_create",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: currentLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    target_group_key: targetGroupKey,
    target_part_ids: selected.map((part) => part.id),
    group_create_plan: { groups: [{ group_key: targetGroupKey, data: groupData }] },
    part_acceptance_plan: { timestamp, part_updates: partUpdates, changed_parts: [] },
    builder_patch: { group_count: activeGroupCount + 1 },
    line_patch: { last_part_group_mutation_key: operationKey, last_part_group_mutation_kind: "create" },
    skip_revision: true,
  };
  const marked = await markBuilderMutationPending({ estimate, builder, pending });
  const recovered = await resumeBuilderMutation({ estimateId: estimate.id, estimate: marked.markedEstimate, builder: marked.currentBuilder, parts: marked.currentParts, line: marked.markedLine, pending: marked.canonicalPending, applyPartPlan: applyBuilderPartPriceAcceptancePlan });
  const groupsAfter = await base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id });
  const group = (groupsAfter || []).find((row) => row.group_key === targetGroupKey) || null;
  if (!group) throw new Error("The new Part Group could not be verified after recovery completed.");
  return { ...group, recovered: true, line: recovered?.line || currentLine };
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
  const builder = await base44.entities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Product could not be verified against an estimate.");
  const estimate = await base44.entities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const currentLine = estimateLine(estimate, builder.id);
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before dissolving its Part Group.");

  const operationKey = `builder_part_group_dissolve:${builderMutationHash({
    estimate_id: estimate.id,
    builder_product_id: builder.id,
    group_id: groupId,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    expected_group_updated_at: expectedGroupUpdatedAt || "",
    expected_part_versions: expectedPartVersions || {},
  })}`;
  const existingPending = pendingBuilderMutation(currentLine);
  if (existingPending) {
    if (existingPending.kind !== "builder_part_group_dissolve" || existingPending.key !== operationKey) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume it before dissolving a Part Group.");
    }
    const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
    if (!Array.isArray(parts)) throw new Error("Part Group members could not be verified during dissolve recovery.");
    const recovered = await resumeBuilderMutation({ estimateId: estimate.id, estimate, builder, parts, line: currentLine, pending: existingPending, applyPartPlan: applyBuilderPartPriceAcceptancePlan });
    return { dissolved: groupId, partCount: (existingPending.target_part_ids || []).length, recovered: true, line: recovered?.line || currentLine };
  }

  if (currentLine.last_part_group_mutation_key === operationKey && currentLine.last_part_group_mutation_kind === "dissolve") {
    const [groupAfter, partsAfter] = await Promise.all([
      base44.entities.BuilderPartGroup.get(groupId),
      base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    ]);
    const targetIds = new Set(Object.keys(expectedPartVersions || {}));
    const complete = !groupAfter && Array.isArray(partsAfter) && partsAfter.filter((part) => targetIds.has(String(part.id)) && !part.part_group_id).length === targetIds.size;
    if (complete) return { dissolved: groupId, partCount: targetIds.size, alreadyCompleted: true };
    throw new Error("The Part Group dissolve receipt exists, but the completed membership no longer matches. Reload and review the Product.");
  }

  const [group, allParts, allGroups] = await Promise.all([
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }),
  ]);
  if (!Array.isArray(allParts) || !Array.isArray(allGroups)) throw new Error("Part Group dissolve prerequisites could not be fully verified.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  if (!group || group.builder_product_id !== builder.id) throw new Error("Part Group could not be loaded.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");
  const members = allParts.filter((part) => part.is_active !== false && part.part_group_id === group.id);
  assertMemberVersions(members, expectedPartVersions);

  const timestamp = nowIso();
  const activeGroupCount = allGroups.filter((row) => row.is_active !== false).length;
  const pending = {
    key: operationKey,
    kind: "builder_part_group_dissolve",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: currentLine.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    builder_updated_date_before: builder.updated_date || "",
    target_group_id: group.id,
    target_part_ids: members.map((part) => part.id),
    part_acceptance_plan: {
      timestamp,
      part_updates: members.map((part) => ({ operation: "update", part_id: part.id, part_key: part.part_key, expected_updated_date: part.updated_date || "", patch: { part_group_id: "" } })),
      changed_parts: [],
    },
    post_part_delete_plan: { groups: [{ id: group.id, expected_updated_date: group.updated_date || "" }], parts: [] },
    builder_patch: { group_count: Math.max(0, activeGroupCount - 1) },
    line_patch: { last_part_group_mutation_key: operationKey, last_part_group_mutation_kind: "dissolve" },
    skip_revision: true,
  };
  const marked = await markBuilderMutationPending({ estimate, builder, pending });
  const recovered = await resumeBuilderMutation({ estimateId: estimate.id, estimate: marked.markedEstimate, builder: marked.currentBuilder, parts: marked.currentParts, line: marked.markedLine, pending: marked.canonicalPending, applyPartPlan: applyBuilderPartPriceAcceptancePlan });
  return { dissolved: group.id, partCount: members.length, recovered: true, line: recovered?.line || currentLine };
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

function assertMoveBuilderState(builder, targetPatch, expectedUpdatedAt, label) {
  if (!builder?.id) throw new Error(`${label} could not be verified while recovering the Part Group move.`);
  if (!recoveryPatchDiffers(builder, targetPatch)) return false;
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(builder.updated_date || "").trim();
  if (expected && current && expected !== current) {
    throw new Error(`${label} changed while the Part Group move was pending. Recovery stopped before overwriting unrelated Product state.`);
  }
  return true;
}

function assertMoveRecordState(record, step, sourceBuilderProductId, label) {
  if (!record?.id) throw new Error(`${label} disappeared while the Part Group move was pending.`);
  if (!recoveryPatchDiffers(record, step.target_patch || {})) return false;
  if (String(record.builder_product_id || "") !== String(sourceBuilderProductId || "")) {
    throw new Error(`${label} changed ownership while the Part Group move was pending.`);
  }
  const expected = String(step.expected_updated_date || "").trim();
  const current = String(record.updated_date || "").trim();
  if (expected && current && expected !== current) {
    throw new Error(`${label} changed while the Part Group move was pending. No unrelated edit was overwritten.`);
  }
  if (step.expected_patch && recoveryPatchDiffers(record, step.expected_patch)) {
    throw new Error(`${label} no longer matches the stored move source. Recovery was stopped.`);
  }
  return true;
}

export async function resumeIndependentPartGroupMove({ estimateId, lineId = "" }) {
  if (!estimateId) throw new Error("Estimate is required to resume a Part Group move.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const sourceLine = lineId
    ? (estimate.line_items || []).find((line) => line.line_id === lineId)
    : (estimate.line_items || []).find((line) => line?.price_acceptance_pending?.kind === "builder_part_group_move");
  const pending = pendingBuilderMutation(sourceLine);
  if (!sourceLine || !pending || pending.kind !== "builder_part_group_move") {
    throw new Error("The pending Part Group move could not be found.");
  }
  if (pending.estimate_id !== estimateId || pending.builder_product_id !== sourceLine.builder_product_id) {
    throw new Error("The Part Group move recovery marker no longer matches its source Product.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });

  const [sourceBuilder, targetBuilder, group, movingParts] = await Promise.all([
    base44.entities.BuilderProduct.get(pending.builder_product_id),
    base44.entities.BuilderProduct.get(pending.target_builder_product_id),
    base44.entities.BuilderPartGroup.get(pending.group_move_step?.id),
    Promise.all((pending.part_move_steps || []).map((step) => base44.entities.BuilderPart.get(step.id))),
  ]);
  if (!sourceBuilder?.id || !targetBuilder?.id || sourceBuilder.estimate_id !== estimateId || targetBuilder.estimate_id !== estimateId) {
    throw new Error("Both Products could not be verified in this estimate while recovering the Part Group move.");
  }

  let sourceBuilderNeedsWrite = assertMoveBuilderState(sourceBuilder, pending.source_builder_patch || {}, pending.source_builder_updated_date_before, "Source Product");
  let targetBuilderNeedsWrite = assertMoveBuilderState(targetBuilder, pending.target_builder_patch || {}, pending.target_builder_updated_date_before, "Target Product");
  const groupNeedsWrite = assertMoveRecordState(group, pending.group_move_step || {}, sourceBuilder.id, `Part Group “${group?.group_name || "Part Group"}”`);
  const partNeedsWrite = movingParts.map((part, index) => assertMoveRecordState(part, pending.part_move_steps[index], sourceBuilder.id, `Part “${part?.part_name || "Part"}”`));

  if (groupNeedsWrite) await base44.entities.BuilderPartGroup.update(group.id, pending.group_move_step.target_patch);
  for (let index = 0; index < movingParts.length; index += 1) {
    if (partNeedsWrite[index]) await base44.entities.BuilderPart.update(movingParts[index].id, pending.part_move_steps[index].target_patch);
  }

  const [sourceBeforePriceWrite, targetBeforePriceWrite] = await Promise.all([
    base44.entities.BuilderProduct.get(sourceBuilder.id),
    base44.entities.BuilderProduct.get(targetBuilder.id),
  ]);
  sourceBuilderNeedsWrite = assertMoveBuilderState(sourceBeforePriceWrite, pending.source_builder_patch || {}, pending.source_builder_updated_date_before, "Source Product");
  targetBuilderNeedsWrite = assertMoveBuilderState(targetBeforePriceWrite, pending.target_builder_patch || {}, pending.target_builder_updated_date_before, "Target Product");
  if (sourceBuilderNeedsWrite) await base44.entities.BuilderProduct.update(sourceBuilder.id, pending.source_builder_patch);
  if (targetBuilderNeedsWrite) await base44.entities.BuilderProduct.update(targetBuilder.id, pending.target_builder_patch);

  await ensureBuilderPriceRevision(pending.source_revision_key || `${pending.key}:source`, pending.source_revision || {});
  await ensureBuilderPriceRevision(pending.target_revision_key || `${pending.key}:target`, pending.target_revision || {});

  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified while completing the Part Group move.");
  const latestSourceLine = (latestEstimate.line_items || []).find((line) => line.builder_product_id === sourceBuilder.id);
  const latestTargetLine = (latestEstimate.line_items || []).find((line) => line.builder_product_id === targetBuilder.id);
  if (!latestSourceLine || !latestTargetLine) throw new Error("Both Product lines must remain on the estimate while completing the Part Group move.");
  const latestPending = pendingBuilderMutation(latestSourceLine);
  if (!latestPending) {
    if (!recoveryPatchDiffers(latestSourceLine, pending.source_line_patch || {}) && !recoveryPatchDiffers(latestTargetLine, pending.target_line_patch || {})) {
      return { recovered: true, alreadyCompleted: true, groupId: pending.group_move_step?.id, movedParts: (pending.part_move_steps || []).length };
    }
    throw new Error("The Part Group move marker disappeared before both Product line targets could be verified.");
  }
  if (latestPending.key !== pending.key) throw new Error("A different Builder mutation is now active on the source Product.");
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });
  const lineItems = (latestEstimate.line_items || []).map((line) => {
    if (line.builder_product_id === sourceBuilder.id) return { ...line, ...(pending.source_line_patch || {}), price_acceptance_pending: {} };
    if (line.builder_product_id === targetBuilder.id) return { ...line, ...(pending.target_line_patch || {}) };
    return line;
  });
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  return { recovered: true, groupId: pending.group_move_step?.id, movedParts: (pending.part_move_steps || []).length, sourceBuilderProductId: sourceBuilder.id, targetBuilderProductId: targetBuilder.id };
}

export async function moveIndependentPartGroup({ sourceBuilderProductId, targetBuilderProductId, groupId, expectedEstimateUpdatedAt = "", expectedGroupUpdatedAt = "", expectedPartVersions = {} }) {
  if (!sourceBuilderProductId || !targetBuilderProductId || !groupId) throw new Error("Source Product, target Product and Part Group are required.");
  if (sourceBuilderProductId === targetBuilderProductId) throw new Error("Choose a different target Product.");

  const [sourceBuilder, targetBuilder] = await Promise.all([
    base44.entities.BuilderProduct.get(sourceBuilderProductId),
    base44.entities.BuilderProduct.get(targetBuilderProductId),
  ]);
  if (!sourceBuilder?.id || !targetBuilder?.id || !sourceBuilder.estimate_id || sourceBuilder.estimate_id !== targetBuilder.estimate_id) {
    throw new Error("Direct Move is only available between Products in the same estimate. Use Copy/Paste for another estimate.");
  }
  const estimate = await base44.entities.AllInOneEstimate.get(sourceBuilder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const sourceLine = estimateLine(estimate, sourceBuilder.id);
  const targetLine = estimateLine(estimate, targetBuilder.id);
  if (!sourceLine || !targetLine) throw new Error("Both Products must still belong to this estimate. Reload before moving the Part Group.");

  const operationKey = `builder_part_group_move:${builderMutationHash({
    estimate_id: estimate.id,
    source_builder_product_id: sourceBuilder.id,
    target_builder_product_id: targetBuilder.id,
    group_id: groupId,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    expected_group_updated_at: expectedGroupUpdatedAt || "",
    expected_part_versions: expectedPartVersions || {},
  })}`;
  const existingPending = pendingBuilderMutation(sourceLine);
  if (existingPending) {
    if (existingPending.kind !== "builder_part_group_move" || existingPending.key !== operationKey || existingPending.target_builder_product_id !== targetBuilder.id) {
      throw new Error("Another Builder mutation is still being recovered for the source Product. Resume it before moving this Part Group.");
    }
    return resumeIndependentPartGroupMove({ estimateId: estimate.id, lineId: sourceLine.line_id || "" });
  }

  const [group, sourceParts, sourceGroups, targetParts, targetGroups, sourceRevisions, targetRevisions] = await Promise.all([
    base44.entities.BuilderPartGroup.get(groupId),
    base44.entities.BuilderPart.filter({ builder_product_id: sourceBuilder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: sourceBuilder.id }),
    base44.entities.BuilderPart.filter({ builder_product_id: targetBuilder.id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: targetBuilder.id }),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: sourceBuilder.id }),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: targetBuilder.id }),
  ]);
  if (![sourceParts, sourceGroups, targetParts, targetGroups, sourceRevisions, targetRevisions].every(Array.isArray)) {
    throw new Error("Part Group move prerequisites could not be fully verified.");
  }

  const sourceRevisionKey = `${operationKey}:source`;
  const targetRevisionKey = `${operationKey}:target`;
  const completedSource = sourceRevisions.find((row) => row.idempotency_key === sourceRevisionKey);
  const completedTarget = targetRevisions.find((row) => row.idempotency_key === targetRevisionKey);
  if (completedSource || completedTarget) {
    if (!completedSource || !completedTarget) throw new Error("Only one side of the Part Group move audit exists. Recovery cannot be inferred without its durable marker.");
    const targetGroupKey = `move-group-${builderMutationHash({ operation_key: operationKey, group_id: groupId })}`;
    const movedIds = new Set((completedSource.changed_parts || []).map((part) => part.part_id));
    const movedParts = targetParts.filter((part) => movedIds.has(part.id));
    const complete = group?.builder_product_id === targetBuilder.id && group?.group_key === targetGroupKey && movedParts.length === movedIds.size &&
      !recoveryPatchDiffers(sourceBuilder, { frozen_cost: completedSource.new_total_cost, frozen_customer_price: completedSource.new_customer_price }) &&
      !recoveryPatchDiffers(targetBuilder, { frozen_cost: completedTarget.new_total_cost, frozen_customer_price: completedTarget.new_customer_price }) &&
      !recoveryPatchDiffers(sourceLine, { total_snapshot: completedSource.new_total_cost, customer_price_snapshot: completedSource.new_customer_price }) &&
      !recoveryPatchDiffers(targetLine, { total_snapshot: completedTarget.new_total_cost, customer_price_snapshot: completedTarget.new_customer_price });
    if (complete) return { groupId, movedParts: movedParts.length, sourceBuilderProductId, targetBuilderProductId, alreadyCompleted: true };
    throw new Error("The Part Group move audits exist, but the two Products no longer match the completed move target. Reload and review both Products.");
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  if (!group || group.builder_product_id !== sourceBuilder.id) throw new Error("Part Group could not be loaded from the source Product.");
  assertVersion(group, expectedGroupUpdatedAt, "Part Group");
  const movingParts = sourceParts.filter((part) => part.is_active !== false && part.part_group_id === groupId).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  if (!movingParts.length) throw new Error("This Part Group does not contain any active Parts.");
  assertMemberVersions(movingParts, expectedPartVersions);
  if (movingParts.some((part) => !["manual", "manual_addon"].includes(part.builder_sync_state))) {
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
  const sourceNextCustomer = Math.max(0, sourcePreviousCustomer - movedFrozen);
  const targetNextCustomer = targetPreviousCustomer + movedFrozen;
  const targetSyncState = targetBuilder.module_key === "custom" ? "manual" : "manual_addon";
  const targetActivePartCount = targetParts.filter((part) => part.is_active !== false).length;
  const sourceActivePartCount = sourceParts.filter((part) => part.is_active !== false).length;
  const sourceActiveGroupCount = sourceGroups.filter((row) => row.is_active !== false).length;
  const targetActiveGroupCount = targetGroups.filter((row) => row.is_active !== false).length;
  const targetGroupKey = `move-group-${builderMutationHash({ operation_key: operationKey, group_id: group.id })}`;
  const groupTargetPatch = { builder_product_id: targetBuilder.id, group_key: targetGroupKey, sort_order: targetActiveGroupCount, is_collapsed: false };
  const partMoveSteps = movingParts.map((part, index) => ({
    id: part.id,
    expected_updated_date: part.updated_date || "",
    expected_patch: { builder_product_id: sourceBuilder.id, part_group_id: group.id, part_key: part.part_key || "" },
    target_patch: {
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
    },
  }));
  const sourceState = sourceBuilder.needs_reattach_review ? "detached_parts" : Math.abs(sourceNextCurrent - sourceNextFrozen) > 0.005 ? "changed" : "current";
  const targetState = targetBuilder.needs_reattach_review ? "detached_parts" : Math.abs(targetNextCurrent - targetNextFrozen) > 0.005 ? "changed" : "current";
  const sourceBuilderPatch = { frozen_cost: sourceNextFrozen, frozen_customer_price: sourceNextCustomer, current_recalculated_cost: sourceNextCurrent, price_state: sourceState, price_delta: sourceNextCurrent - sourceNextFrozen, price_delta_percent: sourceNextFrozen ? ((sourceNextCurrent - sourceNextFrozen) / sourceNextFrozen) * 100 : 0, part_count: Math.max(0, sourceActivePartCount - movingParts.length), group_count: Math.max(0, sourceActiveGroupCount - 1), last_price_check_at: timestamp, last_price_update_at: timestamp, builder_version: num(sourceBuilder.builder_version, 1) + 1 };
  const targetBuilderPatch = { frozen_cost: targetNextFrozen, frozen_customer_price: targetNextCustomer, current_recalculated_cost: targetNextCurrent, price_state: targetState, price_delta: targetNextCurrent - targetNextFrozen, price_delta_percent: targetNextFrozen ? ((targetNextCurrent - targetNextFrozen) / targetNextFrozen) * 100 : 0, part_count: targetActivePartCount + movingParts.length, group_count: targetActiveGroupCount + 1, last_price_check_at: timestamp, last_price_update_at: timestamp, builder_version: num(targetBuilder.builder_version, 1) + 1 };
  const sourceLinePatch = { total_snapshot: sourceNextFrozen, live_total_snapshot: sourceNextCurrent, customer_price_snapshot: sourceNextCustomer, live_customer_price_snapshot: Math.max(0, liveCustomerUnitPrice(sourceLine) - movedCurrent), price_state: sourceState, last_price_check_at: timestamp, last_price_update_at: timestamp };
  const targetLinePatch = { total_snapshot: targetNextFrozen, live_total_snapshot: targetNextCurrent, customer_price_snapshot: targetNextCustomer, live_customer_price_snapshot: liveCustomerUnitPrice(targetLine) + movedCurrent, price_state: targetState, last_price_check_at: timestamp, last_price_update_at: timestamp };
  const sourceChangedParts = movingParts.map((part) => ({ part_id: part.id, part_name: part.part_name, action: "move_part_group_out", group_id: group.id, target_builder_product_id: targetBuilder.id, frozen_extended_cost: num(part.frozen_extended_cost) }));
  const targetChangedParts = movingParts.map((part) => ({ part_id: part.id, part_name: part.part_name, action: "move_part_group_in", group_id: group.id, source_builder_product_id: sourceBuilder.id, frozen_extended_cost: num(part.frozen_extended_cost) }));
  const pending = {
    key: operationKey,
    kind: "builder_part_group_move",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: sourceLine.line_id || sourceBuilder.estimate_line_id || "",
    builder_product_id: sourceBuilder.id,
    target_builder_product_id: targetBuilder.id,
    source_builder_updated_date_before: sourceBuilder.updated_date || "",
    target_builder_updated_date_before: targetBuilder.updated_date || "",
    group_move_step: { id: group.id, expected_updated_date: group.updated_date || "", expected_patch: { builder_product_id: sourceBuilder.id, group_key: group.group_key || "" }, target_patch: groupTargetPatch },
    part_move_steps: partMoveSteps,
    source_builder_patch: sourceBuilderPatch,
    target_builder_patch: targetBuilderPatch,
    source_line_patch: sourceLinePatch,
    target_line_patch: targetLinePatch,
    source_revision_key: sourceRevisionKey,
    target_revision_key: targetRevisionKey,
    source_revision: { builder_product_id: sourceBuilder.id, estimate_id: estimate.id, reason: "manual_adjustment", previous_total_cost: sourcePreviousFrozen, new_total_cost: sourceNextFrozen, previous_customer_price: sourcePreviousCustomer, new_customer_price: sourceNextCustomer, changed_parts: sourceChangedParts, builder_snapshot_before: sourceBuilder.builder_snapshot || {}, builder_snapshot_after: sourceBuilder.builder_snapshot || {}, price_snapshot_before: { total: sourcePreviousFrozen }, price_snapshot_after: { total: sourceNextFrozen }, notes: `Moved Part Group “${group.group_name || "Part Group"}” to Product “${targetBuilder.client_product_name || targetBuilder.builder_name || "Product"}”.` },
    target_revision: { builder_product_id: targetBuilder.id, estimate_id: estimate.id, reason: "manual_adjustment", previous_total_cost: targetPreviousFrozen, new_total_cost: targetNextFrozen, previous_customer_price: targetPreviousCustomer, new_customer_price: targetNextCustomer, changed_parts: targetChangedParts, builder_snapshot_before: targetBuilder.builder_snapshot || {}, builder_snapshot_after: targetBuilder.builder_snapshot || {}, price_snapshot_before: { total: targetPreviousFrozen }, price_snapshot_after: { total: targetNextFrozen }, notes: `Received Part Group “${group.group_name || "Part Group"}” from Product “${sourceBuilder.client_product_name || sourceBuilder.builder_name || "Product"}”.` },
  };
  await markBuilderMutationPending({ estimate, builder: sourceBuilder, pending });
  return resumeIndependentPartGroupMove({ estimateId: estimate.id, lineId: sourceLine.line_id || "" });
}
