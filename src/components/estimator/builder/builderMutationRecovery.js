import { base44 } from "@/api/base44Client";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => !["created_by", "created_by_id"].includes(key))
      .map((key) => [key, stableValue(value[key])])
  );
}

function sameSubstantiveValue(a, b) {
  const bothPresent = a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "";
  if (bothPresent && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(num(a) - num(b)) <= 0.005;
  }
  return JSON.stringify(stableValue(a ?? null)) === JSON.stringify(stableValue(b ?? null));
}

export function recoveryPatchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !sameSubstantiveValue(record?.[key], value));
}

export function builderMutationHash(value) {
  const text = JSON.stringify(stableValue(value ?? null));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}

export async function markBuilderMutationPending({ estimate, builder, pending }) {
  if (!estimate?.id || !builder?.id || !pending?.key) {
    throw new Error("Builder mutation recovery could not be initialized.");
  }
  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimate.id);
  if (!latestEstimate) throw new Error("Estimate could not be verified before starting this Builder mutation.");
  if (
    estimate.updated_date &&
    latestEstimate.updated_date &&
    estimate.updated_date !== latestEstimate.updated_date
  ) {
    throw new Error("This estimate changed in another session before the Builder mutation could start. No Product or Part pricing was changed.");
  }
  const latestLine = (latestEstimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!latestLine) throw new Error("This Product is no longer part of the estimate. No Product or Part pricing was changed.");
  const lineItems = (latestEstimate.line_items || []).map((item) =>
    item.builder_product_id === builder.id
      ? { ...item, price_acceptance_pending: pending }
      : item
  );
  await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });

  const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimate.id),
    base44.entities.BuilderProduct.get(builder.id),
    base44.entities.BuilderPart.filter({ builder_product_id: builder.id }),
  ]);
  const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);
  const canonicalPending = pendingBuilderMutation(markedLine);
  if (!canonicalPending || canonicalPending.key !== pending.key) {
    throw new Error("Another Builder mutation won the recovery marker race. Reload before continuing.");
  }
  return { markedEstimate, currentBuilder, currentParts, markedLine, canonicalPending };
}

function validatePendingBuilderMutation(pending, { estimateId, builder, line }) {
  if (!pending || !String(pending.kind || "").startsWith("builder_")) {
    throw new Error("The pending Builder recovery marker is invalid. No pricing or Part change was continued.");
  }
  if (
    String(pending.estimate_id || "") !== String(estimateId || "") ||
    String(pending.builder_product_id || "") !== String(builder?.id || "") ||
    (pending.estimate_line_id && line?.line_id && pending.estimate_line_id !== line.line_id)
  ) {
    throw new Error("The pending Builder recovery marker no longer matches this Estimate Product.");
  }
}

export async function ensureBuilderPriceRevision(idempotencyKey, revision) {
  const response = await base44.functions.invoke("ensureBuilderPriceRevision", {
    idempotency_key: idempotencyKey,
    revision,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Builder price revision could not be verified after recording.");
  return result.revision;
}

async function applyPendingSourcePatch(pending) {
  const sourceEntity = String(pending?.source_entity || "").trim();
  const sourceProjectId = String(pending?.source_project_id || "").trim();
  const sourcePatch = pending?.source_patch && typeof pending.source_patch === "object" ? pending.source_patch : null;
  if (!sourceEntity || !sourceProjectId || !sourcePatch || Object.keys(sourcePatch).length === 0) return null;
  const entity = base44.entities[sourceEntity];
  if (!entity?.get || !entity?.update) throw new Error("The Builder source entity needed for recovery is unavailable.");
  const current = await entity.get(sourceProjectId);
  if (!current) throw new Error("The Builder source project could not be verified while recovering the pending mutation.");
  if (!recoveryPatchDiffers(current, sourcePatch)) return current;

  const expected = String(pending?.source_updated_date_before || "").trim();
  const actual = String(current?.updated_date || "").trim();
  if (expected && actual && expected !== actual) {
    throw new Error("The Builder source project changed while reattachment was pending. The recovery marker was retained and no unrelated source edit was overwritten.");
  }
  return entity.update(sourceProjectId, sourcePatch);
}

async function applyPendingDeletePlan(pending, builderProductId) {
  const plan = pending?.delete_plan;
  if (!plan || typeof plan !== "object") return { partDeletes: 0, groupDeletes: 0 };

  // Verify every surviving delete target before deleting any of them. This keeps
  // a concurrent Part Group edit from being discovered only after the Part has
  // already been removed. Missing targets are treated as already-applied steps.
  const verifiedParts = [];
  const verifiedGroups = [];
  for (const step of plan.parts || []) {
    const part = await base44.entities.BuilderPart.get(step.id);
    if (!part) continue;
    if (String(part.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(part.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part “${part.part_name || "Part"}” changed while removal was pending. No unrelated Part edit was deleted.`);
    }
    verifiedParts.push(part);
  }
  for (const step of plan.groups || []) {
    const group = await base44.entities.BuilderPartGroup.get(step.id);
    if (!group) continue;
    if (String(group.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part Group scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(group.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part Group “${group.group_name || "Part Group"}” changed while removal was pending. No unrelated group edit was deleted.`);
    }
    verifiedGroups.push(group);
  }

  let partDeletes = 0;
  let groupDeletes = 0;
  for (const part of verifiedParts) {
    await base44.entities.BuilderPart.delete(part.id);
    partDeletes += 1;
  }
  for (const group of verifiedGroups) {
    await base44.entities.BuilderPartGroup.delete(group.id);
    groupDeletes += 1;
  }
  return { partDeletes, groupDeletes };
}

export async function resumeBuilderMutation({
  estimateId,
  estimate,
  builder,
  parts,
  line,
  pending,
  applyPartPlan,
}) {
  validatePendingBuilderMutation(pending, { estimateId, builder, line });
  if (typeof applyPartPlan !== "function") throw new Error("Builder recovery could not apply its stored Part plan.");
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });

  if (!Array.isArray(parts) || parts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified while recovering the pending Builder mutation.");
  }
  const plan = pending.part_acceptance_plan || {};
  await applyPendingSourcePatch(pending);
  await applyPendingDeletePlan(pending, builder.id);
  // Re-read Parts inside the applier instead of trusting the post-marker snapshot.
  // This closes the race where another session edits a Part after marker verification
  // but before the exact stored Part patch is written.
  await applyPartPlan(builder.id, plan);
  await ensureBuilderPriceRevision(pending.key, pending.revision || {});

  const builderPatch = pending.builder_patch || {};
  const currentBuilder = await base44.entities.BuilderProduct.get(builder.id);
  if (!currentBuilder?.id) throw new Error("Builder Product could not be verified while completing the pending mutation.");
  if (recoveryPatchDiffers(currentBuilder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(currentBuilder.updated_date || "").trim();
    if (expectedBuilderUpdatedAt && currentBuilderUpdatedAt && expectedBuilderUpdatedAt !== currentBuilderUpdatedAt) {
      throw new Error("This Builder Product changed while a Builder mutation was pending. The recovery marker was retained and no unrelated Builder edit was overwritten.");
    }
    await base44.entities.BuilderProduct.update(builder.id, builderPatch);
  }

  const latestEstimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified while completing the pending Builder mutation.");
  const latestLine = (latestEstimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!latestLine) throw new Error("This Product is no longer part of the estimate. The pending Builder recovery marker could not be completed.");
  const latestPending = pendingBuilderMutation(latestLine);
  const linePatch = pending.line_patch || {};

  if (!latestPending) {
    if (!recoveryPatchDiffers(latestLine, linePatch)) {
      return {
        blocked: false,
        recovered: true,
        alreadyCompleted: true,
        changedParts: plan.changed_parts || [],
        line: latestLine,
      };
    }
    throw new Error("The Builder recovery marker disappeared before the accepted Estimate line was verified. Reload before continuing.");
  }
  if (latestPending.key !== pending.key) {
    throw new Error("A different Builder recovery operation is now active for this Product. Reload before continuing.");
  }
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });

  const lineItems = (latestEstimate.line_items || []).map((item) =>
    item.builder_product_id === builder.id
      ? { ...item, ...linePatch, price_acceptance_pending: {} }
      : item
  );
  const updateResult = await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  const completedLine = (updateResult?.line_items || lineItems).find((item) => item.builder_product_id === builder.id) || null;
  return {
    blocked: false,
    recovered: true,
    changedParts: plan.changed_parts || [],
    line: completedLine,
  };
}
