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

  const plan = pending.part_acceptance_plan || {};
  await applyPendingSourcePatch(pending);
  await applyPartPlan(builder.id, plan, { partsOverride: parts });
  await ensureBuilderPriceRevision(pending.key, pending.revision || {});

  const builderPatch = pending.builder_patch || {};
  if (recoveryPatchDiffers(builder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(builder.updated_date || "").trim();
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
