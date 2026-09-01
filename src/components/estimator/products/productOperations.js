import { base44 } from "@/api/base44Client";
import { makeStableId, snapshotHash } from "@/components/estimator/builder/builderService";
import { cloneSnapshot, stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { countBuilderReattachParts } from "@/components/estimator/parts/partState";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice } from "@/components/estimator/customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

async function cloneSourceProject(builder, line, copyName) {
  if (!builder?.source_entity || !builder?.source_project_id || line?.module_key === "custom") {
    return { sourceProjectId: "", sourceProject: null };
  }
  const source = await base44.entities[builder.source_entity].get(builder.source_project_id).catch(() => null);
  if (!source) return { sourceProjectId: "", sourceProject: null };
  const data = stripEntitySystemFields(source);
  if (Object.prototype.hasOwnProperty.call(data, "project_name")) data.project_name = copyName;
  if (Object.prototype.hasOwnProperty.call(data, "estimate_number")) data.estimate_number = line?.estimate_number || data.estimate_number;
  const created = await base44.entities[builder.source_entity].create(data);
  return { sourceProjectId: created.id, sourceProject: created };
}

export async function cloneProductInEstimate({ estimateId, line }) {
  if (!estimateId || !line?.builder_product_id) throw new Error("This Product does not have a persistent Product record to clone.");
  const [estimate, builder, parts, groups] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(line.builder_product_id),
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!estimate || !builder) throw new Error("The Product could not be loaded.");

  const originalName = line.client_product_name || builder.client_product_name || line.project_name || "Product";
  const copyName = `${originalName} — Copy`;
  const { sourceProjectId, sourceProject } = await cloneSourceProject(builder, line, copyName);
  const newLineId = makeStableId("line");
  const timestamp = nowIso();

  const builderData = stripEntitySystemFields(builder);
  const newBuilder = await base44.entities.BuilderProduct.create({
    ...builderData,
    estimate_id: estimateId,
    estimate_line_id: newLineId,
    source_project_id: sourceProjectId,
    client_product_name: copyName,
    builder_snapshot: sourceProject || builder.builder_snapshot || {},
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
    builder_snapshot_hash: snapshotHash(sourceProject || builder.builder_snapshot || {}),
    builder_version: 1,
    part_count: 0,
    group_count: 0,
    is_active: true,
    notes: builder.notes || "",
  });

  const groupMap = new Map();
  const activeGroups = (groups || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  for (const group of activeGroups) {
    const created = await base44.entities.BuilderPartGroup.create({
      ...stripEntitySystemFields(group),
      builder_product_id: newBuilder.id,
      group_key: makeStableId("group"),
    });
    groupMap.set(group.id, created.id);
  }

  const activeParts = (parts || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const clonedParts = [];
  for (const part of activeParts) {
    const created = await base44.entities.BuilderPart.create({
      ...stripEntitySystemFields(part),
      builder_product_id: newBuilder.id,
      part_group_id: part.part_group_id ? (groupMap.get(part.part_group_id) || "") : "",
      // part_key is the stable reconciliation identity inside a Product. It is
      // safe (and required) to preserve it across a Product clone because the
      // new Product has its own builder_product_id namespace.
      part_key: part.part_key || makeStableId("part"),
      last_price_check_at: timestamp,
    });
    clonedParts.push(created);
  }

  const reattachCount = countBuilderReattachParts(clonedParts);
  await base44.entities.BuilderProduct.update(newBuilder.id, {
    part_count: clonedParts.length,
    group_count: activeGroups.length,
    detached_part_count: reattachCount,
    needs_reattach_review: reattachCount > 0,
  });

  const frozenTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const frozenCustomer = num(builder.frozen_customer_price, acceptedCustomerUnitPrice(line));
  const liveCustomer = liveCustomerUnitPrice(line);
  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: newBuilder.id,
    estimate_id: estimateId,
    revision_number: 1,
    reason: "initial_freeze",
    previous_total_cost: 0,
    new_total_cost: frozenTotal,
    previous_customer_price: 0,
    new_customer_price: frozenCustomer,
    changed_parts: clonedParts.map((part) => ({
      part_id: part.id,
      part_key: part.part_key,
      part_name: part.part_name,
      action: "cloned_with_product",
      frozen_unit_cost: num(part.frozen_unit_cost),
      frozen_extended_cost: num(part.frozen_extended_cost),
    })),
    builder_snapshot_before: {},
    builder_snapshot_after: sourceProject || builder.builder_snapshot || {},
    price_snapshot_before: { total: 0 },
    price_snapshot_after: { total: frozenTotal, source: "product_clone" },
    notes: `Cloned from Product ${originalName}. Frozen pricing and Part/Group snapshots were preserved.`,
  });

  const newLine = {
    ...cloneSnapshot(line),
    line_id: newLineId,
    builder_product_id: newBuilder.id,
    project_id: sourceProjectId,
    project_name: sourceProjectId ? copyName : copyName,
    client_product_name: copyName,
    total_snapshot: frozenTotal,
    live_total_snapshot: num(builder.current_recalculated_cost, num(line.live_total_snapshot, frozenTotal)),
    customer_price_snapshot: frozenCustomer,
    live_customer_price_snapshot: liveCustomer,
    price_state: builder.price_state || line.price_state || "current",
    detached_part_count: reattachCount,
    needs_reattach_review: reattachCount > 0,
    owned: true,
    linked_date: timestamp,
    updated_date_snapshot: sourceProject?.updated_date || timestamp,
  };
  const lineItems = [...(estimate.line_items || []), newLine];
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  return { line: newLine, builderProduct: newBuilder, parts: clonedParts, groups: activeGroups.length };
}

export async function saveProductSettings({ estimateId, line, patch = {} }) {
  if (!estimateId || !line) return null;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const matches = (item) =>
    (line.line_id && item.line_id === line.line_id) ||
    (line.builder_product_id && item.builder_product_id === line.builder_product_id) ||
    (line.project_id && item.project_id === line.project_id);
  const lineItems = (estimate.line_items || []).map((item) => matches(item) ? { ...item, ...patch } : item);
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });

  if (line.builder_product_id) {
    const builderPatch = {};
    if (patch.client_product_name !== undefined) builderPatch.client_product_name = patch.client_product_name;
    if (patch.product_category !== undefined) builderPatch.product_category = patch.product_category;
    if (patch.customer_description !== undefined) builderPatch.client_description = patch.customer_description;
    if (patch.customer_quantity !== undefined) builderPatch.quantity = num(patch.customer_quantity, 1);
    if (patch.section_status !== undefined) builderPatch.status = patch.section_status === "complete" ? "complete" : "in_progress";
    if (patch.product_notes !== undefined) builderPatch.product_notes = patch.product_notes;
    if (Object.keys(builderPatch).length) {
      await base44.entities.BuilderProduct.update(line.builder_product_id, builderPatch);
    }
  }

  return lineItems.find(matches) || { ...line, ...patch };
}

export async function saveProductNotes({ estimateId, line, notes }) {
  if (!estimateId || !line) return;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const lineItems = (estimate.line_items || []).map((item) =>
    (item.line_id && item.line_id === line.line_id) || (item.builder_product_id && item.builder_product_id === line.builder_product_id)
      ? { ...item, product_notes: notes }
      : item
  );
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  if (line.builder_product_id) {
    await base44.entities.BuilderProduct.update(line.builder_product_id, { product_notes: notes });
  }
  return lineItems.find((item) => item.builder_product_id === line.builder_product_id || item.line_id === line.line_id) || null;
}
