import { base44 } from "@/api/base44Client";
import { getModule } from "@/components/estimator/moduleRegistry";
import { builderMutationHash, pendingBuilderMutation } from "@/components/estimator/builder/builderMutationRecovery";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const nowIso = () => new Date().toISOString();

function findMatchingLine(estimate, line) {
  return (estimate?.line_items || []).find((item) =>
    (line?.line_id && item.line_id === line.line_id) ||
    (line?.builder_product_id && item.builder_product_id === line.builder_product_id) ||
    (line?.project_id && item.project_id === line.project_id)
  ) || null;
}

function removalLineId(estimateId, line) {
  if (line?.line_id) return String(line.line_id);
  return `line-remove-${builderMutationHash({
    estimate_id: estimateId,
    builder_product_id: line?.builder_product_id || "",
    project_id: line?.project_id || "",
    module_key: line?.module_key || "",
    project_name: line?.project_name || "",
    client_product_name: line?.client_product_name || "",
  })}`;
}

function operationKeyFor({ estimateId, line, expectedEstimateUpdatedAt }) {
  return `builder_product_remove:${builderMutationHash({
    estimate_id: estimateId,
    line_id: removalLineId(estimateId, line),
    builder_product_id: line?.builder_product_id || "",
    project_id: line?.project_id || "",
    expected_estimate_updated_at: expectedEstimateUpdatedAt || "",
  })}`;
}

function rowVersion(row) {
  return String(row?.updated_date || row?.created_date || "");
}

function plannedStep(row, extra = {}) {
  return row?.id ? { id: row.id, expected_updated_date: rowVersion(row), ...extra } : null;
}

async function loadRemovalPlan(line) {
  const builderProductId = String(line?.builder_product_id || "").trim();
  const mod = getModule(line?.module_key);
  let source = null;
  if (line?.owned && mod?.entity && line?.project_id) {
    source = await base44.entities[mod.entity].get(line.project_id);
  }

  let builder = null;
  let parts = [];
  let groups = [];
  let revisions = [];
  if (builderProductId) {
    [builder, parts, groups, revisions] = await Promise.all([
      base44.entities.BuilderProduct.get(builderProductId),
      loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Product removal Builder Parts" }),
      loadAllEntityRows({ entity: base44.entities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Product removal Part Groups" }),
      loadAllEntityRows({ entity: base44.entities.BuilderPriceRevision, query: { builder_product_id: builderProductId }, sort: "revision_number", label: "Product removal price revisions" }),
    ]);
    if (![parts, groups, revisions].every(Array.isArray)) {
      throw new Error("Product removal could not verify all Builder child records before starting.");
    }
    if (parts.some((row) => row?.builder_product_id !== builderProductId) || groups.some((row) => row?.builder_product_id !== builderProductId) || revisions.some((row) => row?.builder_product_id !== builderProductId)) {
      throw new Error("Product removal found a Builder child record with unexpected ownership. Reload before removing the Product.");
    }
  }

  return {
    source: line?.owned && mod?.entity && line?.project_id
      ? { entity: mod.entity, id: line.project_id, expected_updated_date: source ? rowVersion(source) : "", expected_missing: !source }
      : null,
    builder: builderProductId
      ? { id: builderProductId, expected_updated_date: builder ? rowVersion(builder) : "", expected_missing: !builder }
      : null,
    parts: parts.map((row) => plannedStep(row, { builder_product_id: builderProductId })),
    groups: groups.map((row) => plannedStep(row, { builder_product_id: builderProductId })),
    revisions: revisions.map((row) => plannedStep(row, { builder_product_id: builderProductId })),
  };
}

function assertExpectedRecord(record, step, label, builderProductId = "") {
  if (!record) {
    if (step?.expected_missing) return;
    return;
  }
  if (step?.expected_missing) throw new Error(`${label} appeared while Product removal was pending. Recovery stopped before deleting it.`);
  if (builderProductId && String(record.builder_product_id || "") !== String(builderProductId)) {
    throw new Error(`${label} changed ownership while Product removal was pending.`);
  }
  const expected = String(step?.expected_updated_date || "").trim();
  const current = rowVersion(record);
  if (expected && current && expected !== current) {
    throw new Error(`${label} changed while Product removal was pending. Recovery stopped before deleting unrelated edits.`);
  }
}

async function preflightChildren(plan, builderProductId) {
  if (!builderProductId) return;
  const [parts, groups, revisions] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }),
  ]);
  if (![parts, groups, revisions].every(Array.isArray)) throw new Error("Builder child records could not be verified while Product removal was pending.");

  const check = (currentRows, steps, label) => {
    const planned = new Map((steps || []).map((step) => [step.id, step]));
    for (const row of currentRows) {
      const step = planned.get(row.id);
      if (!step) throw new Error(`A new ${label} appeared while Product removal was pending. Recovery stopped before deleting it.`);
      assertExpectedRecord(row, step, label, builderProductId);
    }
  };
  check(parts, plan.parts, "Builder Part");
  check(groups, plan.groups, "Part Group");
  check(revisions, plan.revisions, "pricing revision");
}

async function verifyRemovalPlan(plan) {
  if (plan.source) {
    const entity = base44.entities[plan.source.entity];
    if (!entity?.get || !entity?.delete) throw new Error("The owned Builder source entity needed for Product removal is unavailable.");
    const source = await entity.get(plan.source.id);
    assertExpectedRecord(source, plan.source, "Owned Builder source");
  }

  const builderProductId = plan.builder?.id || "";
  if (builderProductId) {
    const builder = await base44.entities.BuilderProduct.get(builderProductId);
    assertExpectedRecord(builder, plan.builder, "Builder Product");
    await preflightChildren(plan, builderProductId);
  }
}

async function deleteVerified(entity, step, label, builderProductId = "") {
  if (!step?.id) return;
  const record = await entity.get(step.id);
  if (!record) return;
  assertExpectedRecord(record, step, label, builderProductId);
  await entity.delete(step.id);
}

async function applyRemovalPlan(plan) {
  await verifyRemovalPlan(plan);

  if (plan.source) {
    const entity = base44.entities[plan.source.entity];
    await deleteVerified(entity, plan.source, "Owned Builder source");
  }

  const builderProductId = plan.builder?.id || "";
  for (const step of plan.parts || []) await deleteVerified(base44.entities.BuilderPart, step, "Builder Part", builderProductId);
  for (const step of plan.groups || []) await deleteVerified(base44.entities.BuilderPartGroup, step, "Part Group", builderProductId);
  for (const step of plan.revisions || []) await deleteVerified(base44.entities.BuilderPriceRevision, step, "pricing revision", builderProductId);

  if (builderProductId) {
    // Catch a child record created after the initial full preflight before the
    // parent Builder Product is removed.
    await preflightChildren(plan, builderProductId);
    await deleteVerified(base44.entities.BuilderProduct, plan.builder, "Builder Product");
  }
}

export async function resumeProductRemoval({ estimateId, lineId = "" }) {
  if (!estimateId) throw new Error("Estimate is required to resume Product removal.");
  let estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  let line = lineId
    ? (estimate.line_items || []).find((item) => item.line_id === lineId) || null
    : (estimate.line_items || []).find((item) => item?.price_acceptance_pending?.kind === "builder_product_remove") || null;
  if (!line) {
    if (estimate.last_product_removal_line_id === lineId && estimate.last_product_removal_key) {
      return { removed: true, alreadyCompleted: true, lineId };
    }
    throw new Error("The pending Product removal could not be found.");
  }
  const pending = pendingBuilderMutation(line);
  if (!pending || pending.kind !== "builder_product_remove" || pending.estimate_id !== estimateId || pending.estimate_line_id !== line.line_id) {
    throw new Error("The Product removal recovery marker no longer matches this Estimate line.");
  }
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  await applyRemovalPlan(pending.delete_plan || {});

  estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be verified while completing Product removal.");
  line = (estimate.line_items || []).find((item) => item.line_id === pending.estimate_line_id) || null;
  if (!line) {
    if (estimate.last_product_removal_key === pending.key && estimate.last_product_removal_line_id === pending.estimate_line_id) {
      return { removed: true, alreadyCompleted: true, lineId: pending.estimate_line_id };
    }
    throw new Error("The Product line disappeared before its removal receipt could be verified.");
  }
  const latestPending = pendingBuilderMutation(line);
  if (!latestPending || latestPending.key !== pending.key) throw new Error("The Product removal marker changed before the final Estimate update.");
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });

  const lineItems = (estimate.line_items || []).filter((item) => item.line_id !== pending.estimate_line_id);
  await base44.entities.AllInOneEstimate.update(estimateId, {
    line_items: lineItems,
    last_product_removal_key: pending.key,
    last_product_removal_line_id: pending.estimate_line_id,
    last_product_removal_at: nowIso(),
  });
  return { removed: true, lineId: pending.estimate_line_id };
}

export async function removeProductFromEstimate({ estimateId, line, expectedEstimateUpdatedAt = "" }) {
  if (!estimateId || !line) throw new Error("Estimate and Product are required for removal.");
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const currentLine = findMatchingLine(estimate, line);
  const identityLine = currentLine || line;
  const effectiveLineId = removalLineId(estimateId, identityLine);
  const normalizedLine = { ...identityLine, line_id: effectiveLineId };
  const key = operationKeyFor({ estimateId, line: normalizedLine, expectedEstimateUpdatedAt: expectedEstimateUpdatedAt || estimate.updated_date || "" });
  if (!currentLine) {
    if (estimate.last_product_removal_key === key && estimate.last_product_removal_line_id === effectiveLineId) {
      return { removed: true, alreadyCompleted: true, lineId: effectiveLineId };
    }
    throw new Error("This Product is no longer part of the estimate. Reload before removing it.");
  }

  const existingPending = pendingBuilderMutation(currentLine);
  if (existingPending) {
    if (existingPending.kind !== "builder_product_remove" || existingPending.key !== key) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume it before removing the Product.");
    }
    return resumeProductRemoval({ estimateId, lineId: currentLine.line_id });
  }

  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  const deletePlan = await loadRemovalPlan(currentLine);
  const pending = {
    key,
    kind: "builder_product_remove",
    started_at: nowIso(),
    estimate_id: estimateId,
    estimate_line_id: effectiveLineId,
    builder_product_id: currentLine.builder_product_id || "",
    project_id: currentLine.project_id || "",
    product_name: currentLine.client_product_name || currentLine.project_name || "Product",
    delete_plan: deletePlan,
  };

  // Re-read immediately before the marker so preflight reads cannot hide a
  // concurrent Estimate edit behind the deletion plan.
  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified before starting Product removal.");
  if (estimate.updated_date && latestEstimate.updated_date && estimate.updated_date !== latestEstimate.updated_date) {
    throw new Error("This estimate changed while Product removal was being prepared. No source, Builder, Part, or Product line was deleted.");
  }
  const latestLine = findMatchingLine(latestEstimate, currentLine);
  if (!latestLine) throw new Error("This Product disappeared before removal could start.");
  const targetIndex = (latestEstimate.line_items || []).indexOf(latestLine);
  if (targetIndex < 0) throw new Error("The Product line could not be identified exactly before removal started.");
  const lineItems = (latestEstimate.line_items || []).map((item, index) => index === targetIndex
    ? { ...item, line_id: effectiveLineId, price_acceptance_pending: pending }
    : item);
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  return resumeProductRemoval({ estimateId, lineId: effectiveLineId });
}
