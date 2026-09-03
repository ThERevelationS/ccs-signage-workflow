import { base44 } from "@/api/base44Client";
import { makeStableId, snapshotHash } from "@/components/estimator/builder/builderService";
import { cloneSnapshot, stripEntitySystemFields } from "@/components/estimator/products/snapshotUtils";
import { countBuilderReattachParts } from "@/components/estimator/parts/partState";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice, manualCustomerPriceState } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

async function cloneSourceProject(builder, line, copyName) {
  if (!builder?.source_entity || !builder?.source_project_id || line?.module_key === "custom") {
    return { sourceProjectId: "", sourceProject: null };
  }
  const source = await base44.entities[builder.source_entity].get(builder.source_project_id);
  if (!source) throw new Error("The source Builder record could not be verified for this Product clone.");
  const data = stripEntitySystemFields(source);
  if (Object.prototype.hasOwnProperty.call(data, "project_name")) data.project_name = copyName;
  if (Object.prototype.hasOwnProperty.call(data, "estimate_number")) data.estimate_number = line?.estimate_number || data.estimate_number;
  const created = await base44.entities[builder.source_entity].create(data);
  return { sourceProjectId: created.id, sourceProject: created };
}

export async function cloneProductInEstimate({ estimateId, line, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line?.builder_product_id) throw new Error("This Product does not have a persistent Product record to clone.");
  const [estimate, builder, parts, groups] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(line.builder_product_id),
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!estimate || !builder) throw new Error("The Product could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const currentLine = (estimate.line_items || []).find((item) =>
    item.builder_product_id === builder.id || (line.line_id && item.line_id === line.line_id)
  );
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before cloning it.");

  const originalName = currentLine.client_product_name || builder.client_product_name || currentLine.project_name || "Product";
  const copyName = `${originalName} — Copy`;
  const { sourceProjectId, sourceProject } = await cloneSourceProject(builder, currentLine, copyName);
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

  const frozenTotal = num(builder.frozen_cost, num(currentLine.total_snapshot));
  const frozenCustomer = num(builder.frozen_customer_price, acceptedCustomerUnitPrice(currentLine));
  const liveCustomer = liveCustomerUnitPrice(currentLine);
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
    ...cloneSnapshot(currentLine),
    line_id: newLineId,
    builder_product_id: newBuilder.id,
    project_id: sourceProjectId,
    project_name: sourceProjectId ? copyName : copyName,
    client_product_name: copyName,
    total_snapshot: frozenTotal,
    live_total_snapshot: num(builder.current_recalculated_cost, num(currentLine.live_total_snapshot, frozenTotal)),
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

export async function saveProductSettings({ estimateId, line, patch = {}, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line) return null;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const matches = (item) =>
    (line.line_id && item.line_id === line.line_id) ||
    (line.builder_product_id && item.builder_product_id === line.builder_product_id) ||
    (line.project_id && item.project_id === line.project_id);
  const currentLine = (estimate.line_items || []).find(matches);
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before changing its settings.");
  const nextPatch = { ...patch };
  const timestamp = nowIso();
  let builderPatch = {};

  if (line.builder_product_id) {
    const builder = await base44.entities.BuilderProduct.get(line.builder_product_id).catch(() => null);
    if (builder) {
      if (patch.client_product_name !== undefined) builderPatch.client_product_name = patch.client_product_name;
      if (patch.product_category !== undefined) builderPatch.product_category = patch.product_category;
      if (patch.production_product_type !== undefined) builderPatch.production_product_type = patch.production_product_type;
      if (patch.customer_description !== undefined) builderPatch.client_description = patch.customer_description;
      if (patch.customer_quantity !== undefined) builderPatch.quantity = num(patch.customer_quantity, 1);
      if (patch.section_status !== undefined) builderPatch.status = patch.section_status === "complete" ? "complete" : "in_progress";
      if (patch.product_notes !== undefined) builderPatch.product_notes = patch.product_notes;

      if (patch.customer_price_snapshot !== undefined) {
        const previousCustomerPrice = acceptedCustomerUnitPrice(currentLine);
        const nextCustomerPrice = Math.max(0, num(patch.customer_price_snapshot, previousCustomerPrice));
        nextPatch.customer_price_snapshot = nextCustomerPrice;

        if (Math.abs(nextCustomerPrice - previousCustomerPrice) > 0.005) {
          const frozenCost = num(builder.frozen_cost, num(currentLine.total_snapshot));
          const currentCost = num(builder.current_recalculated_cost, num(currentLine.live_total_snapshot, frozenCost));
          const liveCustomerPrice = liveCustomerUnitPrice(currentLine);
          const nextState = manualCustomerPriceState({
            frozenCost,
            currentCost,
            acceptedCustomerPrice: nextCustomerPrice,
            liveCustomerPrice,
            detached: !!builder.needs_reattach_review || currentLine.price_state === "detached_parts",
            recalcRequired: !!builder.price_recalc_required || !!currentLine.price_recalc_required,
          });
          const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
          const revisionNumber = Math.max(0, ...(revisions || []).map((row) => num(row.revision_number))) + 1;

          await base44.entities.BuilderPriceRevision.create({
            builder_product_id: builder.id,
            estimate_id: estimateId,
            revision_number: revisionNumber,
            reason: "manual_adjustment",
            previous_total_cost: frozenCost,
            new_total_cost: frozenCost,
            previous_customer_price: previousCustomerPrice,
            new_customer_price: nextCustomerPrice,
            changed_parts: [],
            builder_snapshot_before: builder.builder_snapshot || {},
            builder_snapshot_after: builder.builder_snapshot || {},
            price_snapshot_before: { total: frozenCost, customer_price: previousCustomerPrice },
            price_snapshot_after: { total: frozenCost, customer_price: nextCustomerPrice },
            notes: "Customer base price manually adjusted from the estimate Product. Internal frozen cost was not changed.",
          });

          builderPatch = {
            ...builderPatch,
            frozen_customer_price: nextCustomerPrice,
            price_state: nextState,
            price_delta: currentCost - frozenCost,
            price_delta_percent: frozenCost ? ((currentCost - frozenCost) / frozenCost) * 100 : 0,
            last_price_update_at: timestamp,
            last_price_update_note: "Customer base price manually adjusted. Internal frozen cost unchanged.",
            last_price_check_at: timestamp,
            builder_version: num(builder.builder_version, 1) + 1,
          };
          nextPatch.price_state = nextState;
          nextPatch.last_price_update_at = timestamp;
          nextPatch.last_price_check_at = timestamp;
        }
      }

      if (Object.keys(builderPatch).length) {
        await base44.entities.BuilderProduct.update(builder.id, builderPatch);
      }
    }
  }

  const lineItems = (estimate.line_items || []).map((item) => matches(item) ? { ...item, ...nextPatch } : item);
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  return lineItems.find(matches) || { ...line, ...nextPatch };
}

export async function saveProductNotes({ estimateId, line, notes, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line) return;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const exists = (estimate.line_items || []).some((item) =>
    (item.line_id && item.line_id === line.line_id) || (item.builder_product_id && item.builder_product_id === line.builder_product_id)
  );
  if (!exists) throw new Error("This Product is no longer part of the estimate. Reload before changing its notes.");
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
