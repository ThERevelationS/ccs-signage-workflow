import { base44 } from "@/api/base44Client";
import { makeStableId } from "@/components/estimator/builder/builderService";
import { stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { liveCustomerUnitPrice } from "@/components/estimator/customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

async function nextRevisionNumber(builderProductId) {
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []);
  return Math.max(0, ...(revisions || []).map((row) => num(row.revision_number))) + 1;
}

function getEstimateLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

export async function addPartPackageToProduct({
  estimateId,
  targetBuilderProductId,
  itemType,
  itemName,
  payload,
  sourceType = "library",
  sourceId = "",
}) {
  if (!estimateId || !targetBuilderProductId) throw new Error("Estimate and target Product are required.");
  if (!["part", "part_group"].includes(itemType)) throw new Error("A Part or Part Group package is required.");

  const [estimate, builder] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(targetBuilderProductId),
  ]);
  if (!estimate || !builder) throw new Error("Target Product could not be loaded.");
  const targetLine = getEstimateLine(estimate, targetBuilderProductId);
  if (!targetLine) throw new Error("Target Product is not part of this estimate.");

  const isCustom = targetLine.module_key === "custom";
  const payloadParts = itemType === "part_group" ? (payload?.parts || []) : [payload?.part].filter(Boolean);
  if (!payloadParts.length) throw new Error("This saved package does not contain any Parts.");

  const timestamp = nowIso();
  const activeParts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id }).catch(() => []);
  const activeGroups = await base44.entities.BuilderPartGroup.filter({ builder_product_id: builder.id }).catch(() => []);
  const targetPartCount = (activeParts || []).filter((part) => part.is_active !== false).length;
  const targetGroupCount = (activeGroups || []).filter((group) => group.is_active !== false).length;

  let createdGroup = null;
  if (itemType === "part_group") {
    const group = payload?.group || {};
    const groupData = stripEntitySystemFields(group);
    delete groupData.snapshot_source_group_id;
    createdGroup = await base44.entities.BuilderPartGroup.create({
      ...groupData,
      builder_product_id: builder.id,
      group_key: makeStableId("group"),
      group_name: group.group_name || itemName || "Part Group",
      parent_group_id: "",
      sort_order: targetGroupCount,
      is_collapsed: false,
      is_active: true,
    });
  }

  const createdParts = [];
  for (let index = 0; index < payloadParts.length; index += 1) {
    const sourcePart = payloadParts[index];
    const partData = stripEntitySystemFields(sourcePart);
    const targetSyncState = isCustom ? "manual" : "manual_addon";
    const sourceLabel = sourceType === "clipboard" ? "estimator clipboard" : "Part Library";
    const missingInventory = ["detached", "reattach_available"].includes(sourcePart.inventory_link_state);
    const frozenExtended = num(sourcePart.frozen_extended_cost);
    const currentExtended = num(sourcePart.current_extended_cost, frozenExtended);
    const normalizedPriceState = missingInventory
      ? "detached"
      : sourcePart.manual_cost_override || sourcePart.price_state === "manual"
        ? "manual"
        : Math.abs(currentExtended - frozenExtended) > 0.005 ? "changed" : "current";
    createdParts.push(await base44.entities.BuilderPart.create({
      ...partData,
      builder_product_id: builder.id,
      part_group_id: createdGroup?.id || "",
      part_key: makeStableId("part"),
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
    }));
  }

  const addedFrozen = createdParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = createdParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost, num(targetLine.total_snapshot));
  const previousCurrent = num(builder.current_recalculated_cost, num(targetLine.live_total_snapshot, previousFrozen));
  const previousCustomer = num(builder.frozen_customer_price, previousFrozen);
  const nextFrozen = previousFrozen + addedFrozen;
  const nextCurrent = previousCurrent + addedCurrent;
  const nextCustomer = previousCustomer + addedFrozen;
  const insertedDetachedCount = createdParts.filter((part) => ["detached", "reattach_available"].includes(part.inventory_link_state) || part.price_state === "detached").length;
  const nextDetachedCount = num(builder.detached_part_count) + insertedDetachedCount;
  const nextNeedsReattachReview = !!builder.needs_reattach_review || insertedDetachedCount > 0;
  const nextState = nextNeedsReattachReview
    ? "detached_parts"
    : Math.abs(nextCurrent - nextFrozen) > 0.005 ? "changed" : "current";

  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextFrozen,
    frozen_customer_price: nextCustomer,
    current_recalculated_cost: nextCurrent,
    price_state: nextState,
    price_delta: nextCurrent - nextFrozen,
    price_delta_percent: nextFrozen ? ((nextCurrent - nextFrozen) / nextFrozen) * 100 : 0,
    part_count: targetPartCount + createdParts.length,
    group_count: targetGroupCount + (createdGroup ? 1 : 0),
    detached_part_count: nextDetachedCount,
    needs_reattach_review: nextNeedsReattachReview,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const lineItems = (estimate.line_items || []).map((line) => line.builder_product_id === builder.id ? {
    ...line,
    total_snapshot: nextFrozen,
    live_total_snapshot: nextCurrent,
    customer_price_snapshot: nextCustomer,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + addedCurrent,
    price_state: nextState,
    detached_part_count: nextDetachedCount,
    needs_reattach_review: nextNeedsReattachReview,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  } : line);
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });

  const sourceLabel = sourceType === "clipboard" ? "30-day estimator clipboard" : "Part Library";
  const sourceField = sourceType === "clipboard" ? "source_clipboard_id" : "source_part_template_id";
  const actionPrefix = sourceType === "clipboard" ? "paste" : "add_saved";
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: estimateId,
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousFrozen,
    new_total_cost: nextFrozen,
    previous_customer_price: previousCustomer,
    new_customer_price: nextCustomer,
    changed_parts: createdParts.map((part) => ({
      part_id: part.id,
      part_name: part.part_name,
      action: `${actionPrefix}_${itemType}`,
      frozen_extended_cost: num(part.frozen_extended_cost),
      [sourceField]: sourceId,
    })),
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousFrozen },
    price_snapshot_after: { total: nextFrozen },
    notes: `${sourceType === "clipboard" ? "Pasted" : "Added"} ${itemType.replace("_", " ")} “${itemName || "Saved Part"}” from the ${sourceLabel}.`,
  });

  return {
    parts: createdParts,
    group: createdGroup,
    line: lineItems.find((line) => line.builder_product_id === builder.id),
  };
}
