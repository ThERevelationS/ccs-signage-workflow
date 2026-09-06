import { base44 } from "@/api/base44Client";
import { assertEstimateProductMutationAllowed } from "@/components/estimator/estimateMutationGuard";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    // Values compared here are individual patch fields, not whole entity rows.
    // Preserve nested ids and metadata because they can be substantive Builder
    // item identity inside arrays/objects.
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function sourcePatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}

export async function preflightBuilderSourceMutation({ estimateId = "" } = {}) {
  if (!estimateId) return null;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  if (!estimate?.id) throw new Error("Estimate could not be verified before saving this Builder source.");
  await assertEstimateProductMutationAllowed(estimate);
  return estimate;
}

export async function updateBuilderSourceProject({
  entity,
  sourceId,
  expectedUpdatedAt,
  data,
  estimateId = "",
  label = "Builder source project",
}) {
  if (!entity?.updateMany || !entity?.get || !sourceId) {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = String(expectedUpdatedAt || "").trim();
  if (!expected) {
    throw new Error(`${label} is missing its loaded version. Reload it before saving.`);
  }

  await preflightBuilderSourceMutation({ estimateId });

  let result;
  try {
    result = await entity.updateMany(
      { id: sourceId, updated_date: expected },
      { $set: data },
    );
  } catch (error) {
    const current = await entity.get(sourceId).catch(() => null);
    if (current && sourcePatchMatches(current, data)) return current;
    throw error;
  }

  if (!result || typeof result.updated !== "number") {
    throw new Error(`${label} conditional-update result could not be verified.`);
  }

  if (result.updated === 1) {
    const saved = await entity.get(sourceId).catch(() => null);
    if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
    return saved;
  }

  const current = await entity.get(sourceId).catch(() => null);
  if (current && sourcePatchMatches(current, data)) {
    // Exact retry after a lost successful response. Do not rewrite the row merely
    // to refresh its timestamp; reuse the already-persisted intended state.
    return current;
  }

  throw new Error(`${label} changed in another session. Reload it before saving.`);
}
