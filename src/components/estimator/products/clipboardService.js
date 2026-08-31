import { base44 } from "@/api/base44Client";
import { makeStableId, snapshotHash } from "@/components/estimator/builder/builderService";
import { instantiateQuickProduct } from "@/components/estimator/products/quickProductService";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function stripSystemFields(value) {
  if (Array.isArray(value)) return value.map(stripSystemFields);
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    if (["id", "created_date", "updated_date", "created_by", "created_by_id", "is_sample"].includes(key)) return;
    out[key] = stripSystemFields(item);
  });
  return out;
}

async function getEstimateLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

function sourceMeta(estimate, line) {
  return {
    source_estimate_id: estimate?.id || "",
    source_estimate_number: estimate?.estimate_number || "",
    source_order: estimate?.project_name || estimate?.estimate_number || "",
    source_company: estimate?.client_name || "",
    source_product_id: line?.builder_product_id || "",
    source_product_name: line?.client_product_name || line?.project_name || "",
    source_module_key: line?.module_key || "",
  };
}

async function captureProductPayload({ estimate, line }) {
  const [builder, parts, groups] = await Promise.all([
    base44.entities.BuilderProduct.get(line.builder_product_id),
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!builder) throw new Error("Product could not be loaded for clipboard copy.");
  const activeParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const activeGroups = (groups || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const frozenTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const currentTotal = num(builder.current_recalculated_cost, num(line.live_total_snapshot, frozenTotal));
  return {
    product_name: line.client_product_name || builder.client_product_name || line.project_name || "Product",
    template_version: 2,
    source_product_class: line.module_key === "custom" ? "custom" : "builder",
    source_module_key: line.module_key || builder.module_key || "custom",
    source_entity: builder.source_entity || "",
    source_builder_name: builder.builder_name || line.builder_name || "Custom Product",
    product_category: line.product_category || builder.product_category || "",
    product_group: "my",
    categories: line.product_category ? [line.product_category] : [],
    product_quantity: num(line.customer_quantity, num(builder.quantity, 1)),
    is_active: true,
    product_notes: line.product_notes ?? builder.product_notes ?? "",
    client_description: line.customer_description ?? builder.client_description ?? "",
    product_snapshot: { line: stripSystemFields(line), builder_product: stripSystemFields(builder) },
    builder_snapshot: stripSystemFields(builder.builder_snapshot || {}),
    builder_snapshot_hash: builder.builder_snapshot_hash || snapshotHash(builder.builder_snapshot || {}),
    parts_snapshot: activeParts.map(stripSystemFields),
    part_groups_snapshot: activeGroups.map((group) => ({ ...stripSystemFields(group), snapshot_source_group_id: group.id })),
    price_snapshot: {
      frozen_cost: frozenTotal,
      frozen_customer_price: num(builder.frozen_customer_price, frozenTotal),
      current_recalculated_cost: currentTotal,
      price_state: builder.price_state || line.price_state || "current",
      price_delta: num(builder.price_delta, currentTotal - frozenTotal),
      price_delta_percent: num(builder.price_delta_percent),
      captured_at: nowIso(),
    },
    detached_part_count: num(builder.detached_part_count),
    needs_reattach_review: !!builder.needs_reattach_review,
    total_price: frozenTotal,
  };
}

async function createClipboardRecord(data) {
  return base44.entities.EstimateClipboardItem.create({
    ...data,
    copied_at: nowIso(),
    expires_at: expiryIso(),
    is_active: true,
    search_text: [data.item_name, data.source_estimate_number, data.source_order, data.source_company, data.source_product_name, data.source_module_key]
      .filter(Boolean).join(" ").toLowerCase(),
  });
}

export async function copyProductToClipboard({ estimateId, line }) {
  if (!estimateId || !line?.builder_product_id) throw new Error("Product is not ready to copy.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const payload = await captureProductPayload({ estimate, line });
  return createClipboardRecord({
    item_type: "product",
    item_name: payload.product_name,
    ...sourceMeta(estimate, line),
    payload,
    notes: "Complete Product package: Builder, Parts, Part Groups, snapshots and frozen pricing.",
  });
}

export async function copyPartToClipboard({ estimateId, builderProductId, part }) {
  if (!estimateId || !builderProductId || !part) throw new Error("Part is not ready to copy.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const line = await getEstimateLine(estimate, builderProductId);
  return createClipboardRecord({
    item_type: "part",
    item_name: part.client_label || part.part_name || "Part",
    ...sourceMeta(estimate, line),
    source_part_id: part.id || "",
    payload: { part: stripSystemFields(part) },
    notes: "Complete Part snapshot with Master Inventory links and frozen/current pricing.",
  });
}

export async function copyPartGroupToClipboard({ estimateId, builderProductId, group, parts }) {
  if (!estimateId || !builderProductId || !group) throw new Error("Part Group is not ready to copy.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const line = await getEstimateLine(estimate, builderProductId);
  return createClipboardRecord({
    item_type: "part_group",
    item_name: group.group_name || "Part Group",
    ...sourceMeta(estimate, line),
    source_part_group_id: group.id || "",
    payload: {
      group: { ...stripSystemFields(group), snapshot_source_group_id: group.id },
      parts: (parts || []).filter((part) => part.is_active !== false).map(stripSystemFields),
    },
    notes: `Part Group snapshot with ${(parts || []).length} Parts.`,
  });
}

export async function listClipboardItems() {
  const rows = await base44.entities.EstimateClipboardItem.list().catch(() => []);
  const now = Date.now();
  const expired = (rows || []).filter((row) => row.expires_at && new Date(row.expires_at).getTime() <= now);
  if (expired.length) {
    Promise.all(expired.map((row) => base44.entities.EstimateClipboardItem.delete(row.id).catch(() => null))).catch(() => null);
  }
  return (rows || [])
    .filter((row) => row.is_active !== false && (!row.expires_at || new Date(row.expires_at).getTime() > now))
    .sort((a, b) => new Date(b.copied_at || b.created_date || 0) - new Date(a.copied_at || a.created_date || 0));
}

export async function removeClipboardItem(id) {
  if (!id) return;
  await base44.entities.EstimateClipboardItem.delete(id);
}

async function nextRevisionNumber(builderProductId) {
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []);
  return Math.max(0, ...(revisions || []).map((row) => num(row.revision_number))) + 1;
}

async function pasteIndependentParts({ estimateId, targetBuilderProductId, clipboardItem }) {
  if (!targetBuilderProductId) throw new Error("Choose a target Product for this clipboard item.");
  const [estimate, builder] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(targetBuilderProductId),
  ]);
  if (!estimate || !builder) throw new Error("Target Product could not be loaded.");
  const targetLine = await getEstimateLine(estimate, targetBuilderProductId);
  if (!targetLine) throw new Error("Target Product is not part of this estimate.");
  const isCustom = targetLine.module_key === "custom";
  const payloadParts = clipboardItem.item_type === "part_group"
    ? (clipboardItem.payload?.parts || [])
    : [clipboardItem.payload?.part].filter(Boolean);
  if (!payloadParts.length) throw new Error("Clipboard item does not contain any Parts.");
  const timestamp = nowIso();

  let createdGroup = null;
  if (clipboardItem.item_type === "part_group") {
    const group = clipboardItem.payload?.group || {};
    const groupData = stripSystemFields(group);
    delete groupData.snapshot_source_group_id;
    createdGroup = await base44.entities.BuilderPartGroup.create({
      ...groupData,
      builder_product_id: builder.id,
      group_key: makeStableId("group"),
      group_name: group.group_name || clipboardItem.item_name || "Part Group",
      sort_order: num(builder.group_count),
      is_active: true,
    });
  }

  const createdParts = [];
  for (let index = 0; index < payloadParts.length; index += 1) {
    const sourcePart = payloadParts[index];
    const partData = stripSystemFields(sourcePart);
    createdParts.push(await base44.entities.BuilderPart.create({
      ...partData,
      builder_product_id: builder.id,
      part_group_id: createdGroup?.id || "",
      part_key: makeStableId("part"),
      sort_order: num(builder.part_count) + index,
      source_module_key: isCustom ? "custom" : targetLine.module_key,
      source_path: "",
      builder_sync_state: isCustom ? "manual" : "manual_addon",
      builder_detached_at: "",
      builder_detached_reason: isCustom ? "" : "Independent Part pasted from estimator clipboard.",
      builder_detached_snapshot: {},
      reattach_candidate_id: "",
      reattach_candidate_name: "",
      last_price_check_at: timestamp,
      last_price_update_at: timestamp,
      is_active: true,
    }));
  }

  const addedFrozen = createdParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const addedCurrent = createdParts.reduce((sum, part) => sum + num(part.current_extended_cost, num(part.frozen_extended_cost)), 0);
  const previousFrozen = num(builder.frozen_cost, num(targetLine.total_snapshot));
  const previousCurrent = num(builder.current_recalculated_cost, num(targetLine.live_total_snapshot, previousFrozen));
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
    part_count: num(builder.part_count) + createdParts.length,
    group_count: num(builder.group_count) + (createdGroup ? 1 : 0),
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const lineItems = (estimate.line_items || []).map((line) => line.builder_product_id === builder.id ? {
    ...line,
    total_snapshot: nextFrozen,
    live_total_snapshot: nextCurrent,
    price_state: nextState,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  } : line);
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: estimateId,
    revision_number: await nextRevisionNumber(builder.id),
    reason: "manual_adjustment",
    previous_total_cost: previousFrozen,
    new_total_cost: nextFrozen,
    previous_customer_price: previousCustomer,
    new_customer_price: previousCustomer + addedFrozen,
    changed_parts: createdParts.map((part) => ({
      part_id: part.id,
      part_name: part.part_name,
      action: clipboardItem.item_type === "part_group" ? "paste_part_group" : "paste_part",
      frozen_extended_cost: num(part.frozen_extended_cost),
      source_clipboard_id: clipboardItem.id,
    })),
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousFrozen },
    price_snapshot_after: { total: nextFrozen },
    notes: `Pasted ${clipboardItem.item_type.replace("_", " ")} “${clipboardItem.item_name}” from the 30-day estimator clipboard.`,
  });

  return { parts: createdParts, group: createdGroup, line: lineItems.find((line) => line.builder_product_id === builder.id) };
}

export async function pasteClipboardItem({ estimateId, clipboardItem, targetBuilderProductId = "" }) {
  if (!estimateId || !clipboardItem) throw new Error("Clipboard item is required.");
  if (clipboardItem.item_type === "product") {
    return instantiateQuickProduct({ estimateId, quickProduct: clipboardItem.payload });
  }
  return pasteIndependentParts({ estimateId, targetBuilderProductId, clipboardItem });
}
