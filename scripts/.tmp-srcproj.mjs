// scripts/.tmp-b44-stub.mjs
var base44 = { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }), functions: { invoke: async () => ({}) }, auth: { me: async () => null }, asServiceRole: { entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }) } };
var staffEntities = base44.entities;
var assertEstimateProductMutationAllowed = async () => null;

// src/components/estimator/builder/sourceProjectPersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function sourcePatchMatches(record, patch) {
  if (!record || !patch) return false;
  return Object.entries(patch).every(([key, value]) => sameValue(record?.[key], value));
}
async function preflightBuilderSourceMutation({ estimateId = "" } = {}) {
  if (!estimateId) return null;
  const estimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!estimate?.id) throw new Error("Estimate could not be verified before saving this Builder source.");
  await assertEstimateProductMutationAllowed(estimate);
  return estimate;
}
async function updateBuilderSourceProject({
  entity,
  sourceId,
  expectedUpdatedAt,
  data,
  estimateId = "",
  label = "Builder source project"
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
      { $set: data }
    );
  } catch (error) {
    const current2 = await entity.get(sourceId).catch(() => null);
    if (current2 && sourcePatchMatches(current2, data)) return current2;
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
    return current;
  }
  throw new Error(`${label} changed in another session. Reload it before saving.`);
}
export {
  preflightBuilderSourceMutation,
  sourcePatchMatches,
  updateBuilderSourceProject
};
