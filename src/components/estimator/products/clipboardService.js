import { base44 } from "@/api/base44Client";
import { snapshotHash } from "@/components/estimator/builder/builderService";
import { instantiateQuickProduct } from "@/components/estimator/products/quickProductService";
import { cloneSnapshot } from "@/components/estimator/products/snapshotUtils";
import { addPartPackageToProduct } from "@/components/estimator/parts/partPackageService";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice } from "@/components/estimator/customerPricing";

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
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
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

export async function pasteClipboardItem({ estimateId, clipboardItem, targetBuilderProductId = "" }) {
  if (!estimateId || !clipboardItem) throw new Error("Clipboard item is required.");
  if (clipboardItem.item_type === "product") {
    return instantiateQuickProduct({ estimateId, quickProduct: clipboardItem.payload });
  }
  return addPartPackageToProduct({
    estimateId,
    targetBuilderProductId,
    itemType: clipboardItem.item_type,
    itemName: clipboardItem.item_name,
    payload: clipboardItem.payload,
    sourceType: "clipboard",
    sourceId: clipboardItem.id,
  });
}
