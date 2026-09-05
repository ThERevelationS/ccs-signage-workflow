import { base44 } from "@/api/base44Client";
import { cloneSnapshot } from "@/components/estimator/products/snapshotUtils";
import { instantiateProductSnapshot } from "@/components/estimator/products/quickProductService";
import { acceptedCustomerUnitPrice, liveCustomerUnitPrice, manualCustomerPriceState } from "@/components/estimator/customerPricing";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { applyBuilderPartPriceAcceptancePlan } from "@/components/estimator/builder/partSync";
import { builderMutationHash, markBuilderMutationPending, pendingBuilderMutation, recoveryPatchDiffers, resumeBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();

function productSettingsBuilderPatch(patch = {}) {
  const builderPatch = {};
  if (patch.client_product_name !== undefined) builderPatch.client_product_name = patch.client_product_name;
  if (patch.product_category !== undefined) builderPatch.product_category = patch.product_category;
  if (patch.production_product_type !== undefined) builderPatch.production_product_type = patch.production_product_type;
  if (patch.customer_description !== undefined) builderPatch.client_description = patch.customer_description;
  if (patch.customer_quantity !== undefined) builderPatch.quantity = num(patch.customer_quantity, 1);
  if (patch.section_status !== undefined) builderPatch.status = patch.section_status === "complete" ? "complete" : "in_progress";
  if (patch.product_notes !== undefined) builderPatch.product_notes = patch.product_notes;
  return builderPatch;
}

function manualProductPriceOperationKey({ estimateId, builderProductId, lineId, expectedEstimateUpdatedAt, patch }) {
  return `builder_manual_product_price:${builderMutationHash({
    estimate_id: estimateId,
    builder_product_id: builderProductId,
    line_id: lineId || "",
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
    patch: patch || {},
  })}`;
}

export async function cloneProductInEstimate({ estimateId, line, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line?.builder_product_id) throw new Error("This Product does not have a persistent Product record to clone.");
  const [estimate, builder, parts, groups] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(line.builder_product_id),
    base44.entities.BuilderPart.filter({ builder_product_id: line.builder_product_id }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: line.builder_product_id }),
  ]);
  if (!estimate || !builder || !Array.isArray(parts) || !Array.isArray(groups)) throw new Error("The Product could not be fully loaded for cloning.");
  const currentLine = (estimate.line_items || []).find((item) =>
    item.builder_product_id === builder.id || (line.line_id && item.line_id === line.line_id)
  );
  if (!currentLine) throw new Error("This Product is no longer part of the estimate. Reload before cloning it.");
  if (parts.some((part) => part?.builder_product_id !== builder.id) || groups.some((group) => group?.builder_product_id !== builder.id)) {
    throw new Error("This Product's Parts or Part Groups changed ownership. Reload before cloning it.");
  }

  let sourceProject = null;
  if (builder.source_entity && builder.source_project_id && currentLine.module_key !== "custom") {
    sourceProject = await base44.entities[builder.source_entity].get(builder.source_project_id);
    if (!sourceProject) throw new Error("The source Builder record could not be verified for this Product clone.");
  }

  const originalName = currentLine.client_product_name || builder.client_product_name || currentLine.project_name || "Product";
  const copyName = `${originalName} — Copy`;
  const activeParts = parts.filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const activeGroups = groups.filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const frozenTotal = num(builder.frozen_cost, num(currentLine.total_snapshot));
  const currentTotal = num(builder.current_recalculated_cost, num(currentLine.live_total_snapshot, frozenTotal));
  const frozenCustomer = num(builder.frozen_customer_price, acceptedCustomerUnitPrice(currentLine));
  const liveCustomer = liveCustomerUnitPrice(currentLine);
  const sourceSnapshot = cloneSnapshot(sourceProject || builder.builder_snapshot || {});

  const clonePayload = {
    product_name: copyName,
    template_version: 2,
    source_product_class: currentLine.module_key === "custom" ? "custom" : "builder",
    source_module_key: currentLine.module_key || builder.module_key || "custom",
    source_entity: currentLine.module_key === "custom" ? "" : (builder.source_entity || ""),
    source_builder_name: builder.builder_name || currentLine.builder_name || "Custom Product",
    product_category: currentLine.product_category || builder.product_category || "",
    production_product_type: currentLine.production_product_type ?? builder.production_product_type ?? "",
    product_quantity: num(currentLine.customer_quantity, num(builder.quantity, 1)),
    product_notes: currentLine.product_notes ?? builder.product_notes ?? "",
    client_description: currentLine.customer_description ?? builder.client_description ?? "",
    product_snapshot: {
      line: cloneSnapshot(currentLine),
      builder_product: cloneSnapshot(builder),
    },
    builder_snapshot: sourceSnapshot,
    parts_snapshot: activeParts.map(cloneSnapshot),
    part_groups_snapshot: activeGroups.map((group) => ({
      ...cloneSnapshot(group),
      snapshot_source_group_id: group.id,
    })),
    price_snapshot: {
      frozen_cost: frozenTotal,
      frozen_customer_price: frozenCustomer,
      current_recalculated_cost: currentTotal,
      current_recalculated_customer_price: liveCustomer,
      price_state: builder.price_state || currentLine.price_state || "current",
      price_delta: num(builder.price_delta, currentTotal - frozenTotal),
      price_delta_percent: num(builder.price_delta_percent, frozenTotal ? ((currentTotal - frozenTotal) / frozenTotal) * 100 : 0),
      price_recalc_required: !!(builder.price_recalc_required || currentLine.price_recalc_required),
      price_recalc_reason: builder.price_recalc_reason || currentLine.price_recalc_reason || "",
    },
    detached_part_count: num(builder.detached_part_count),
    needs_reattach_review: !!builder.needs_reattach_review,
  };

  return instantiateProductSnapshot({
    estimateId,
    productSnapshot: clonePayload,
    expectedEstimateUpdatedAt,
    sourceId: builder.id,
    sourceType: "product_clone",
  });
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
