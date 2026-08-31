import { base44 } from "@/api/base44Client";
import { makeStableId, snapshotHash } from "@/components/estimator/builder/builderService";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

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

async function nextRevisionNumber(builderProductId) {
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []);
  return Math.max(0, ...(revisions || []).map((row) => num(row.revision_number))) + 1;
}

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
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!builder) throw new Error("The Product could not be loaded.");

  const activeParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const activeGroups = (groups || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const builderSnapshot = builder.builder_snapshot || {};
  const frozenTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const currentTotal = num(builder.current_recalculated_cost, num(line.live_total_snapshot, frozenTotal));
  const quickName = String(name || line.client_product_name || builder.client_product_name || "Quick Product").trim() || "Quick Product";

  return base44.entities.QuickProduct.create({
    product_name: quickName,
    template_version: 2,
    source_product_class: line.module_key === "custom" ? "custom" : "builder",
    source_module_key: line.module_key || builder.module_key || "custom",
    source_entity: builder.source_entity || "",
    source_builder_name: builder.builder_name || line.builder_name || "Custom Product",
    product_category: line.product_category || builder.product_category || "",
    created_from_product_id: builder.id,
    created_from_estimate_id: estimateId,
    product_group: productGroup === "global" ? "global" : "my",
    categories: (categories || []).map((item) => String(item).trim()).filter(Boolean),
    product_quantity: num(line.customer_quantity, num(builder.quantity, 1)),
    is_active: true,
    product_notes: line.product_notes ?? builder.product_notes ?? "",
    client_description: line.customer_description ?? builder.client_description ?? "",
    product_snapshot: {
      line: stripSystemFields(line),
      builder_product: stripSystemFields(builder),
    },
    builder_snapshot: stripSystemFields(builderSnapshot),
    builder_snapshot_hash: builder.builder_snapshot_hash || snapshotHash(builderSnapshot),
    parts_snapshot: activeParts.map(stripSystemFields),
    part_groups_snapshot: activeGroups.map((group) => ({
      ...stripSystemFields(group),
      snapshot_source_group_id: group.id,
    })),
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
    total_price: frozenTotal,
  });
}

async function createSourceProjectFromQuickProduct(quickProduct, estimate, productName) {
  const sourceEntity = quickProduct.source_entity || quickProduct.product_snapshot?.builder_product?.source_entity || "";
  const sourceClass = quickProduct.source_product_class || "legacy";
  if (sourceClass !== "builder" || !sourceEntity) return { sourceEntity: "", sourceProject: null };
  const snapshot = stripSystemFields(quickProduct.builder_snapshot || {});
  if (Object.prototype.hasOwnProperty.call(snapshot, "project_name")) snapshot.project_name = productName;
  if (Object.prototype.hasOwnProperty.call(snapshot, "client_name")) snapshot.client_name = estimate.client_name || snapshot.client_name;
  if (Object.prototype.hasOwnProperty.call(snapshot, "customer_id")) snapshot.customer_id = estimate.customer_id || snapshot.customer_id;
  if (Object.prototype.hasOwnProperty.call(snapshot, "estimate_number")) snapshot.estimate_number = estimate.estimate_number || snapshot.estimate_number;
  const sourceProject = await base44.entities[sourceEntity].create(snapshot);
  return { sourceEntity, sourceProject };
}

async function instantiateV2QuickProduct({ estimate, quickProduct }) {
  const timestamp = nowIso();
  const productName = quickProduct.product_name || "Quick Product";
  const templateLine = stripSystemFields(quickProduct.product_snapshot?.line || {});
  const templateBuilder = stripSystemFields(quickProduct.product_snapshot?.builder_product || {});
  const { sourceEntity, sourceProject } = await createSourceProjectFromQuickProduct(quickProduct, estimate, productName);
  const lineId = makeStableId("line");
  const moduleKey = quickProduct.source_module_key || templateBuilder.module_key || templateLine.module_key || "custom";
  const builderName = quickProduct.source_builder_name || templateBuilder.builder_name || templateLine.builder_name || (moduleKey === "custom" ? "Custom Product" : "Builder Product");
  const priceSnapshot = quickProduct.price_snapshot || {};
  const frozenTotal = num(priceSnapshot.frozen_cost, num(quickProduct.total_price));
  const currentTotal = num(priceSnapshot.current_recalculated_cost, frozenTotal);
  const sourceSnapshot = stripSystemFields(quickProduct.builder_snapshot || templateBuilder.builder_snapshot || {});

  const newBuilder = await base44.entities.BuilderProduct.create({
    ...templateBuilder,
    estimate_id: estimate.id,
    estimate_line_id: lineId,
    module_key: moduleKey,
    source_entity: sourceEntity || templateBuilder.source_entity || "",
    source_project_id: sourceProject?.id || "",
    builder_name: builderName,
    client_product_name: productName,
    client_description: quickProduct.client_description ?? templateBuilder.client_description ?? "",
    product_category: quickProduct.product_category ?? templateBuilder.product_category ?? "",
    product_notes: quickProduct.product_notes ?? templateBuilder.product_notes ?? "",
    quantity: num(quickProduct.product_quantity, num(templateBuilder.quantity, 1)),
    builder_version: 1,
    builder_snapshot: sourceProject ? stripSystemFields(sourceProject) : sourceSnapshot,
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
    builder_snapshot_hash: snapshotHash(sourceProject ? stripSystemFields(sourceProject) : sourceSnapshot),
    frozen_cost: frozenTotal,
    frozen_customer_price: num(priceSnapshot.frozen_customer_price, frozenTotal),
    current_recalculated_cost: currentTotal,
    price_state: priceSnapshot.price_state || "current",
    price_delta: num(priceSnapshot.price_delta, currentTotal - frozenTotal),
    price_delta_percent: num(priceSnapshot.price_delta_percent, frozenTotal ? ((currentTotal - frozenTotal) / frozenTotal) * 100 : 0),
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    part_count: 0,
    group_count: 0,
    detached_part_count: num(quickProduct.detached_part_count),
    needs_reattach_review: !!quickProduct.needs_reattach_review,
    is_active: true,
    notes: `Created from Quick Product “${productName}”.`,
  });

  const groupMap = new Map();
  const groups = (quickProduct.part_groups_snapshot || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  for (const group of groups) {
    const originalId = group.snapshot_source_group_id || group.group_key || makeStableId("source-group");
    const groupData = stripSystemFields(group);
    delete groupData.snapshot_source_group_id;
    const created = await base44.entities.BuilderPartGroup.create({
      ...groupData,
      builder_product_id: newBuilder.id,
      group_key: makeStableId("group"),
      is_active: true,
    });
    groupMap.set(originalId, created.id);
    if (group.group_key) groupMap.set(group.group_key, created.id);
  }

  const parts = (quickProduct.parts_snapshot || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const createdParts = [];
  for (const part of parts) {
    const originalGroupRef = part.part_group_id || "";
    const created = await base44.entities.BuilderPart.create({
      ...stripSystemFields(part),
      builder_product_id: newBuilder.id,
      part_group_id: originalGroupRef ? (groupMap.get(originalGroupRef) || "") : "",
      // Builder reconciliation keys must stay stable within the new Product.
      part_key: part.part_key || makeStableId("part"),
      last_price_check_at: timestamp,
      is_active: true,
    });
    createdParts.push(created);
  }

  const detachedCount = createdParts.filter((part) => part.builder_sync_state === "detached_override" || ["detached", "reattach_available"].includes(part.inventory_link_state)).length;
  await base44.entities.BuilderProduct.update(newBuilder.id, {
    part_count: createdParts.length,
    group_count: groups.length,
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    price_state: detachedCount > 0 ? "detached_parts" : (priceSnapshot.price_state || "current"),
  });

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: newBuilder.id,
    estimate_id: estimate.id,
    revision_number: 1,
    reason: "initial_freeze",
    previous_total_cost: 0,
    new_total_cost: frozenTotal,
    previous_customer_price: 0,
    new_customer_price: num(priceSnapshot.frozen_customer_price, frozenTotal),
    changed_parts: createdParts.map((part) => ({ part_id: part.id, part_key: part.part_key, part_name: part.part_name, action: "created_from_quick_product", frozen_extended_cost: num(part.frozen_extended_cost) })),
    builder_snapshot_before: {},
    builder_snapshot_after: sourceProject ? stripSystemFields(sourceProject) : sourceSnapshot,
    price_snapshot_before: { total: 0 },
    price_snapshot_after: { ...priceSnapshot, total: frozenTotal, source: "quick_product" },
    notes: `Created from Quick Product “${productName}”. Frozen Product/Part pricing was preserved.`,
  });

  const newLine = {
    ...templateLine,
    line_id: lineId,
    builder_product_id: newBuilder.id,
    module_key: moduleKey,
    project_id: sourceProject?.id || "",
    project_name: productName,
    builder_name: builderName,
    client_product_name: productName,
    product_category: quickProduct.product_category ?? templateLine.product_category ?? "",
    product_notes: quickProduct.product_notes ?? templateLine.product_notes ?? "",
    customer_description: quickProduct.client_description ?? templateLine.customer_description ?? "",
    client_name: estimate.client_name || templateLine.client_name || "",
    total_snapshot: frozenTotal,
    live_total_snapshot: currentTotal,
    price_state: detachedCount > 0 ? "detached_parts" : (priceSnapshot.price_state || "current"),
    detached_part_count: detachedCount,
    needs_reattach_review: detachedCount > 0,
    customer_quantity: num(quickProduct.product_quantity, num(templateLine.customer_quantity, 1)),
    include_in_customer: templateLine.include_in_customer !== false,
    owned: true,
    linked_date: timestamp,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    updated_date_snapshot: sourceProject?.updated_date || timestamp,
  };

  const lineItems = [...(estimate.line_items || []), newLine];
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
  return { line: newLine, builderProduct: newBuilder, parts: createdParts, groups };
}

async function instantiateLegacyQuickProduct({ estimate, quickProduct }) {
  const timestamp = nowIso();
  const lineId = makeStableId("line");
  const name = quickProduct.product_name || "Legacy Quick Product";
  const legacyParts = quickProduct.parts || [];
  const calculatedPartsTotal = legacyParts.reduce((sum, part) => sum + legacyPartExtended(part), 0);
  const calculatedProduct = Math.max(0, calculatedPartsTotal + num(quickProduct.setup_fee) - num(quickProduct.discount));
  const frozenTotal = num(quickProduct.price_override, num(quickProduct.total_price, calculatedProduct * num(quickProduct.product_quantity, 1)));

  const builder = await base44.entities.BuilderProduct.create({
    estimate_id: estimate.id,
    estimate_line_id: lineId,
    module_key: "custom",
    source_entity: "",
    source_project_id: "",
    builder_name: "Legacy Quick Product",
    client_product_name: name,
    client_description: "",
    product_category: (quickProduct.categories || [])[0] || "",
    product_notes: quickProduct.product_notes || "",
    quantity: num(quickProduct.product_quantity, 1),
    status: "in_progress",
    builder_version: 1,
    builder_snapshot: {},
    builder_snapshot_at: timestamp,
    builder_snapshot_hash: snapshotHash({}),
    frozen_cost: frozenTotal,
    frozen_customer_price: frozenTotal,
    current_recalculated_cost: frozenTotal,
    price_state: "current",
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    part_count: legacyParts.length,
    group_count: 0,
    detached_part_count: 0,
    needs_reattach_review: false,
    is_active: true,
    notes: "Imported from legacy Quick Product format.",
  });

  const createdParts = [];
  for (let index = 0; index < legacyParts.length; index += 1) {
    const part = legacyParts[index];
    const extended = legacyPartExtended(part);
    const qty = num(part.part_qty, 1);
    const unitCost = qty ? extended / qty : extended;
    createdParts.push(await base44.entities.BuilderPart.create({
      builder_product_id: builder.id,
      part_key: makeStableId("part"),
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
    }));
  }

  const line = {
    line_id: lineId,
    builder_product_id: builder.id,
    module_key: "custom",
    project_id: "",
    project_name: name,
    builder_name: "Custom Product",
    client_product_name: name,
    product_category: (quickProduct.categories || [])[0] || "",
    product_notes: quickProduct.product_notes || "",
    client_name: estimate.client_name || "",
    total_snapshot: frozenTotal,
    live_total_snapshot: frozenTotal,
    price_state: "current",
    adjustment_percent: 0,
    section_status: "in_progress",
    customer_quantity: num(quickProduct.product_quantity, 1),
    include_in_customer: true,
    owned: true,
    linked_date: timestamp,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
  };
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: [...(estimate.line_items || []), line] });
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: estimate.id,
    revision_number: 1,
    reason: "initial_freeze",
    previous_total_cost: 0,
    new_total_cost: frozenTotal,
    previous_customer_price: 0,
    new_customer_price: frozenTotal,
    changed_parts: createdParts.map((part) => ({ part_id: part.id, part_name: part.part_name, action: "legacy_quick_product_import", frozen_extended_cost: num(part.frozen_extended_cost) })),
    builder_snapshot_before: {},
    builder_snapshot_after: {},
    price_snapshot_before: { total: 0 },
    price_snapshot_after: { total: frozenTotal, source: "legacy_quick_product" },
    notes: `Created from legacy Quick Product “${name}”.`,
  });
  return { line, builderProduct: builder, parts: createdParts, groups: [] };
}

export async function instantiateQuickProduct({ estimateId, quickProduct }) {
  if (!estimateId || !quickProduct) throw new Error("Estimate and Quick Product are required.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  if (num(quickProduct.template_version) >= 2 && quickProduct.product_snapshot) {
    return instantiateV2QuickProduct({ estimate, quickProduct });
  }
  return instantiateLegacyQuickProduct({ estimate, quickProduct });
}

export async function listQuickProducts() {
  const rows = await base44.entities.QuickProduct.list().catch(() => []);
  return (rows || []).filter((row) => row.is_active !== false).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}
