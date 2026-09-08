import { base44 } from "@/api/base44Client";
import { ensureBuilderProductForLine } from "@/components/estimator/builder/builderService";
import { builderMutationHash, pendingBuilderMutation, recoveryPatchDiffers } from "@/components/estimator/builder/builderMutationRecovery";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "@/components/estimator/estimatePersistence";

const nowIso = () => new Date().toISOString();

function findLine(estimate, lineId) {
  return (estimate?.line_items || []).find((line) => line.line_id === lineId) || null;
}

function insertionIdentity({ estimateId, moduleKey, sourceEntity, productName, builderName, isCustom, expectedEstimateUpdatedAt }) {
  const key = `builder_blank_product_insert:${builderMutationHash({
    estimate_id: estimateId,
    module_key: moduleKey,
    source_entity: sourceEntity || "",
    product_name: productName,
    builder_name: builderName,
    is_custom: !!isCustom,
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
  })}`;
  return {
    key,
    lineId: `line-add-${builderMutationHash({ operation_key: key })}`,
    sourceTag: `sep-insert-${builderMutationHash({ operation_key: key, source: sourceEntity || "custom" })}`,
  };
}

function completedInsertion(line, key) {
  return !!line && line.blank_product_insert_key === key && ["builder", "custom"].includes(line.blank_product_insert_kind);
}

async function persistSourceAnchor({ estimateId, lineId, pending, sourceId }) {
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be verified while anchoring the new Product source.");
  const line = findLine(estimate, lineId);
  const currentPending = pendingBuilderMutation(line);
  if (!line || !currentPending || currentPending.key !== pending.key) {
    throw new Error("The new Product recovery marker changed before its source could be anchored.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  if (currentPending.source_project_id === sourceId && line.project_id === sourceId) return { estimate, line, pending: currentPending };

  const promotedPending = { ...currentPending, source_project_id: sourceId };
  const lineItems = (estimate.line_items || []).map((item) =>
    item.line_id === lineId
      ? { ...item, project_id: sourceId, price_acceptance_pending: promotedPending }
      : item
  );
  await replaceEstimateFieldsIfUnchanged({
    entity: base44.entities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(estimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Blank Product source anchor",
  });
  const anchored = await base44.entities.AllInOneEstimate.get(estimateId);
  const anchoredLine = findLine(anchored, lineId);
  const anchoredPending = pendingBuilderMutation(anchoredLine);
  if (!anchoredLine || !anchoredPending || anchoredPending.key !== pending.key || anchoredPending.source_project_id !== sourceId) {
    throw new Error("The new Product source anchor could not be verified after it was written.");
  }
  return { estimate: anchored, line: anchoredLine, pending: anchoredPending };
}

async function resolveSourceProject({ estimateId, lineId, pending }) {
  if (pending.is_custom) return { source: null, estimate: await base44.entities.AllInOneEstimate.get(estimateId), line: null, pending };
  const entityName = String(pending.source_entity || "").trim();
  if (!entityName) throw new Error("The Builder source entity is missing from the new Product recovery marker.");
  const entity = base44.entities[entityName];
  if (!entity?.get || !entity?.filter || !entity?.create || !entity?.update) {
    throw new Error("The Builder source entity needed to recover this Product is unavailable.");
  }

  let source = null;
  if (pending.source_project_id) {
    source = await entity.get(pending.source_project_id);
    if (!source) throw new Error("The anchored Builder source record disappeared while Product creation was pending.");
  } else {
    const matches = await entity.filter({ notes: pending.source_recovery_tag });
    if (!Array.isArray(matches)) throw new Error("The Builder source recovery token could not be verified.");
    if (matches.length > 1) throw new Error("Multiple Builder source records share this Product recovery token. Recovery stopped before linking either record.");
    source = matches[0] || null;
    if (!source) {
      source = await entity.create({ ...(pending.source_create_data || {}), notes: pending.source_recovery_tag });
      if (!source?.id) throw new Error("The Builder source record could not be verified after creation.");
    }
  }

  const anchored = await persistSourceAnchor({ estimateId, lineId, pending, sourceId: source.id });
  const currentSource = await entity.get(source.id);
  if (!currentSource) throw new Error("The Builder source record disappeared while Product creation was pending.");
  if (String(currentSource.notes || "") === pending.source_recovery_tag) {
    source = await entity.update(source.id, { notes: pending.source_original_notes || "" });
  } else if (String(currentSource.notes || "") === String(pending.source_original_notes || "")) {
    source = currentSource;
  } else {
    throw new Error("The new Builder source record changed while Product creation was pending. Recovery retained the Estimate marker and did not overwrite the source edit.");
  }
  return { source, ...anchored };
}

export async function resumeBlankProductInsertion({ estimateId, lineId = "" }) {
  if (!estimateId) throw new Error("Estimate is required to resume Product creation.");
  let estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  let line = lineId
    ? findLine(estimate, lineId)
    : (estimate.line_items || []).find((item) => item?.price_acceptance_pending?.kind === "builder_blank_product_insert") || null;
  let pending = pendingBuilderMutation(line);
  if (!line || !pending || pending.kind !== "builder_blank_product_insert") {
    throw new Error("The pending Product creation could not be found.");
  }
  if (pending.estimate_id !== estimateId || pending.estimate_line_id !== line.line_id) {
    throw new Error("The Product creation recovery marker no longer matches this Estimate line.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });

  let source = null;
  if (!pending.is_custom) {
    const resolved = await resolveSourceProject({ estimateId, lineId: line.line_id, pending });
    source = resolved.source;
    estimate = resolved.estimate;
    line = resolved.line || findLine(estimate, line.line_id);
    pending = resolved.pending;
  }

  const builderInputLine = {
    ...line,
    project_id: source?.id || "",
    project_name: pending.product_name,
    builder_name: pending.builder_name,
    client_product_name: pending.product_name,
    price_acceptance_pending: {},
  };
  const builderResult = await ensureBuilderProductForLine({
    estimate,
    line: builderInputLine,
    isNew: true,
    sourceProjectOverride: source,
  });
  if (!builderResult?.builderProduct?.id) throw new Error("The new Product's Builder record could not be verified.");

  let builderProduct = builderResult.builderProduct;
  let completedLine = builderResult.line;
  if (pending.is_custom) {
    const customPatch = {
      module_key: "custom",
      builder_name: "Custom Product",
      client_product_name: pending.product_name,
      product_category: "",
      price_state: "current",
      frozen_cost: 0,
      frozen_customer_price: 0,
      current_recalculated_cost: 0,
      notes: "Blank / Custom Product. Pricing is driven directly by its Parts rather than a dedicated estimator Builder.",
    };
    const currentBuilder = await base44.entities.BuilderProduct.get(builderProduct.id);
    if (!currentBuilder?.id || (currentBuilder.estimate_id && currentBuilder.estimate_id !== estimateId)) {
      throw new Error("The Custom Product Builder record changed ownership while creation was pending.");
    }
    if (recoveryPatchDiffers(currentBuilder, customPatch)) {
      builderProduct = await base44.entities.BuilderProduct.update(builderProduct.id, customPatch);
    } else {
      builderProduct = currentBuilder;
    }
    completedLine = { ...completedLine, price_state: "current" };
  }

  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified while completing Product creation.");
  const latestLine = findLine(latestEstimate, line.line_id);
  if (!latestLine) throw new Error("The provisional Product line disappeared before creation could complete.");
  const latestPending = pendingBuilderMutation(latestLine);
  if (!latestPending) {
    if (completedInsertion(latestLine, pending.key) && latestLine.builder_product_id === builderProduct.id) {
      return { line: latestLine, builderProduct, sourceProject: source, alreadyCompleted: true };
    }
    throw new Error("The Product creation marker disappeared before the completed Product line could be verified.");
  }
  if (latestPending.key !== pending.key) throw new Error("A different Product creation recovery marker is now active on this line.");
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });

  const finalLine = {
    ...latestLine,
    ...completedLine,
    line_id: latestLine.line_id,
    project_id: source?.id || "",
    project_name: pending.product_name,
    builder_name: pending.builder_name,
    client_product_name: pending.product_name,
    linked_date: pending.started_at || latestLine.linked_date,
    blank_product_insert_key: pending.key,
    blank_product_insert_kind: pending.is_custom ? "custom" : "builder",
    price_acceptance_pending: {},
  };
  const lineItems = (latestEstimate.line_items || []).map((item) => item.line_id === latestLine.line_id ? finalLine : item);
  const updateResult = await replaceEstimateFieldsIfUnchanged({
    entity: base44.entities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Blank Product insertion completion",
  });
  const persistedLine = (updateResult?.line_items || lineItems).find((item) => item.line_id === latestLine.line_id) || finalLine;
  return { line: persistedLine, builderProduct, sourceProject: source };
}

export async function addBlankProduct({
  estimateId,
  moduleKey,
  sourceEntity = "",
  productName,
  builderName,
  isCustom = false,
  expectedEstimateUpdatedAt = "",
}) {
  if (!estimateId || !moduleKey || !productName || !builderName) throw new Error("Estimate, Product type, and Product name are required.");
  const current = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!current) throw new Error("Estimate could not be loaded.");
  const requestVersion = expectedEstimateUpdatedAt || current.updated_date || "";
  const identity = insertionIdentity({
    estimateId,
    moduleKey,
    sourceEntity,
    productName,
    builderName,
    isCustom,
    expectedEstimateUpdatedAt: requestVersion,
  });
  const existingLine = findLine(current, identity.lineId);
  if (existingLine) {
    const existingPending = pendingBuilderMutation(existingLine);
    if (existingPending?.kind === "builder_blank_product_insert" && existingPending.key === identity.key) {
      return resumeBlankProductInsertion({ estimateId, lineId: identity.lineId });
    }
    if (completedInsertion(existingLine, identity.key)) {
      const builderProduct = existingLine.builder_product_id
        ? await base44.entities.BuilderProduct.get(existingLine.builder_product_id)
        : null;
      if (!builderProduct?.id) throw new Error("The completed Product insertion receipt exists, but its Builder Product is missing.");
      return { line: existingLine, builderProduct, alreadyCompleted: true };
    }
    throw new Error("A Product already occupies the deterministic insertion line for this request. Reload before trying again.");
  }

  await assertEstimateProductMutationAllowed(current, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const startedAt = nowIso();
  const pending = {
    key: identity.key,
    kind: "builder_blank_product_insert",
    started_at: startedAt,
    estimate_id: estimateId,
    estimate_line_id: identity.lineId,
    module_key: moduleKey,
    source_entity: isCustom ? "" : sourceEntity,
    source_project_id: "",
    source_recovery_tag: identity.sourceTag,
    source_original_notes: "",
    source_create_data: isCustom ? {} : {
      project_name: productName,
      client_name: current.client_name,
      customer_id: current.customer_id,
      estimate_number: current.estimate_number,
    },
    product_name: productName,
    builder_name: builderName,
    is_custom: !!isCustom,
  };
  const provisionalLine = {
    line_id: identity.lineId,
    module_key: moduleKey,
    project_id: "",
    project_name: productName,
    builder_name: builderName,
    client_product_name: productName,
    client_name: current.client_name,
    total_snapshot: 0,
    live_total_snapshot: 0,
    customer_price_snapshot: 0,
    live_customer_price_snapshot: 0,
    price_state: isCustom ? "current" : "unchecked",
    adjustment_percent: 0,
    section_status: "in_progress",
    customer_quantity: 1,
    include_in_customer: true,
    owned: true,
    linked_date: startedAt,
    price_acceptance_pending: pending,
  };
  const lineItems = [...(current.line_items || []), provisionalLine];
  await replaceEstimateFieldsIfUnchanged({
    entity: base44.entities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(current, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Blank Product insertion recovery marker",
  });
  return resumeBlankProductInsertion({ estimateId, lineId: identity.lineId });
}
