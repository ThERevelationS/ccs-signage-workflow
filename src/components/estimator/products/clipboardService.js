import { base44 } from "@/api/base44Client";
import { snapshotHash } from "@/components/estimator/builder/builderService";
import { instantiateProductSnapshot } from "@/components/estimator/products/quickProductService";
import { cloneSnapshot } from "@/components/estimator/products/snapshotUtils";
import { addPartPackageToProduct } from "@/components/estimator/parts/partPackageService";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice } from "@/components/estimator/customerPricing";
import { builderMutationHash } from "@/components/estimator/builder/builderMutationRecovery";
import { ensureReusableRecord } from "@/components/estimator/products/reusableSaveIdempotency";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

async function getEstimateLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}

function sourceMeta(estimate, line) {
  return {
    source_estimate_id: estimate?.id || "",
    source_estimate_number: estimate?.estimate_number || "",
    source_order: estimate?.po_number || estimate?.work_order_id || "",
    source_company: estimate?.client_name || "",
    source_product_id: line?.builder_product_id || "",
    source_product_name: line?.client_product_name || line?.project_name || "",
    source_module_key: line?.module_key || "",
  };
}

async function captureProductPayload({ line }) {
  const [builder, parts, groups] = await Promise.all([
    base44.entities.BuilderProduct.get(line.builder_product_id),
    loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Clipboard Product Parts" }),
    loadAllEntityRows({ entity: base44.entities.BuilderPartGroup, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Clipboard Product Part Groups" }),
  ]);
  if (!builder) throw new Error("Product could not be loaded for clipboard copy.");
  const activeParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const activeGroups = (groups || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const frozenTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const currentTotal = num(builder.current_recalculated_cost, num(line.live_total_snapshot, frozenTotal));
  const frozenCustomerPrice = num(builder.frozen_customer_price, acceptedCustomerUnitPrice(line));
  const currentCustomerPrice = liveCustomerUnitPrice(line);
  return {
    product_name: line.client_product_name || builder.client_product_name || line.project_name || "Product",
    template_version: 2,
    source_product_class: line.module_key === "custom" ? "custom" : "builder",
    source_module_key: line.module_key || builder.module_key || "custom",
    source_entity: builder.source_entity || "",
    source_builder_name: builder.builder_name || line.builder_name || "Custom Product",
    product_category: line.product_category || builder.product_category || "",
    production_product_type: line.production_product_type ?? builder.production_product_type ?? "",
    product_group: "my",
    categories: line.product_category ? [line.product_category] : [],
    product_quantity: num(line.customer_quantity, num(builder.quantity, 1)),
    is_active: true,
    product_notes: line.product_notes ?? builder.product_notes ?? "",
    client_description: line.customer_description ?? builder.client_description ?? "",
    product_snapshot: { line: cloneSnapshot(line), builder_product: cloneSnapshot(builder) },
    builder_snapshot: cloneSnapshot(builder.builder_snapshot || {}),
    builder_snapshot_hash: builder.builder_snapshot_hash || snapshotHash(builder.builder_snapshot || {}),
    parts_snapshot: activeParts.map(cloneSnapshot),
    part_groups_snapshot: activeGroups.map((group) => ({ ...cloneSnapshot(group), snapshot_source_group_id: group.id })),
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
    total_price: frozenCustomerPrice,
  };
}

async function createClipboardRecord(data) {
  const keyPayload = cloneSnapshot(data.payload || {});
  if (keyPayload?.price_snapshot && typeof keyPayload.price_snapshot === "object") {
    delete keyPayload.price_snapshot.captured_at;
  }
  const idempotencyKey = `estimate_clipboard_copy:${builderMutationHash({
    item_type: data.item_type || "",
    item_name: data.item_name || "",
    source_estimate_id: data.source_estimate_id || "",
    source_product_id: data.source_product_id || "",
    source_part_group_id: data.source_part_group_id || "",
    source_part_id: data.source_part_id || "",
    payload: keyPayload,
    notes: data.notes || "",
  })}`;
  const copiedAt = nowIso();
  const expiresAt = expiryIso();
  const searchText = [data.item_name, data.source_estimate_number, data.source_order, data.source_company, data.source_product_name, data.source_module_key]
    .filter(Boolean).join(" ").toLowerCase();
  const record = await ensureReusableRecord({
    entity: base44.entities.EstimateClipboardItem,
    idempotencyKey,
    label: "Estimator clipboard item",
    data: {
      ...data,
      copied_at: copiedAt,
      expires_at: expiresAt,
      is_active: true,
      search_text: searchText,
    },
  });
  if (!record?.id) return record;
  const refreshPatch = {
    copied_at: copiedAt,
    expires_at: expiresAt,
    is_active: true,
    search_text: searchText,
  };
  return replaceEntityFieldsIfUnchanged({
    entity: base44.entities.EstimateClipboardItem,
    id: record.id,
    expectedUpdatedAt: record.updated_date || "",
    expectedFields: expectedEntityFields(record, refreshPatch),
    nextFields: refreshPatch,
    label: "Estimator clipboard refresh",
  });
}

export async function copyProductToClipboard({ estimateId, line }) {
  if (!estimateId || !line?.builder_product_id) throw new Error("Product is not ready to copy.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const payload = await captureProductPayload({ line });
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
    payload: { part: cloneSnapshot(part) },
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
      group: { ...cloneSnapshot(group), snapshot_source_group_id: group.id },
      parts: (parts || []).filter((part) => part.is_active !== false).map(cloneSnapshot),
    },
    notes: `Part Group snapshot with ${(parts || []).length} Parts.`,
  });
}

export async function listClipboardItems() {
  const rows = await loadAllEntityRows({ entity: base44.entities.EstimateClipboardItem, sort: "-copied_at", label: "Estimator Clipboard" });
  const now = Date.now();
  const currentRows = [];
  for (const row of rows || []) {
    const expired = row.expires_at && new Date(row.expires_at).getTime() <= now;
    if (!expired) {
      currentRows.push(row);
      continue;
    }
    try {
      await deleteEntityIfUnchanged({
        entity: base44.entities.EstimateClipboardItem,
        record: row,
        label: "Expired estimator clipboard item",
      });
    } catch {
      // A refreshed clipboard item must never be deleted using a stale expiry
      // snapshot. Re-read it and keep the newer live row when it is still usable.
      const current = await base44.entities.EstimateClipboardItem.get(row.id).catch(() => null);
      if (current) currentRows.push(current);
    }
  }
  return currentRows
    .filter((row) => row.is_active !== false && (!row.expires_at || new Date(row.expires_at).getTime() > now))
    .sort((a, b) => new Date(b.copied_at || b.created_date || 0) - new Date(a.copied_at || a.created_date || 0));
}

export async function removeClipboardItem(id) {
  const itemId = String(id || "").trim();
  if (!itemId) return;
  const current = await base44.entities.EstimateClipboardItem.get(itemId).catch(() => null);
  if (!current) return;
  await deleteEntityIfUnchanged({
    entity: base44.entities.EstimateClipboardItem,
    record: current,
    label: "Estimator clipboard item",
  });
}

export async function pasteClipboardItem({ estimateId, clipboardItem, targetBuilderProductId = "", expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !clipboardItem?.id) throw new Error("Clipboard item is required.");
  const liveItem = await base44.entities.EstimateClipboardItem.get(clipboardItem.id);
  if (!liveItem) throw new Error("This clipboard item no longer exists. Reopen the Estimator Clipboard to refresh it.");
  if (liveItem.is_active === false) throw new Error("This clipboard item is inactive and cannot be pasted.");
  if (liveItem.expires_at && new Date(liveItem.expires_at).getTime() <= Date.now()) {
    throw new Error("This clipboard item has expired. Reopen the Estimator Clipboard to refresh it.");
  }
  if (clipboardItem.updated_date && liveItem.updated_date && clipboardItem.updated_date !== liveItem.updated_date) {
    throw new Error("This clipboard item changed after the clipboard opened. Reopen it before pasting.");
  }
  if (liveItem.item_type === "product") {
    return instantiateProductSnapshot({ estimateId, productSnapshot: liveItem.payload, expectedEstimateUpdatedAt, sourceId: liveItem.id });
  }
  return addPartPackageToProduct({
    estimateId,
    targetBuilderProductId,
    itemType: liveItem.item_type,
    itemName: liveItem.item_name,
    payload: liveItem.payload,
    sourceType: "clipboard",
    sourceId: liveItem.id,
    expectedEstimateUpdatedAt,
  });
}
