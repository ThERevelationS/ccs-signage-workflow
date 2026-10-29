// src/components/estimator/estimatePersistence.js
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
function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}
async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  const guardNames = Object.keys(guards);
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Estimate before saving.`);
    for (const fieldName of guardNames) {
      if (!sameValue(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Estimate version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} Estimate changed repeatedly while saving. Reload and try again.`);
}
async function softDeleteEstimateFromLoadedSnapshot({
  entity,
  estimate,
  deletedBy = "unknown",
  label = "Estimate delete"
} = {}) {
  const id = String(estimate?.id || "").trim();
  const actor = String(deletedBy || "unknown").trim() || "unknown";
  if (!id) throw new Error(`${label} is missing its loaded Estimate. Reload before deleting.`);
  const nextFields = {
    deleted: true,
    deleted_at: (/* @__PURE__ */ new Date()).toISOString(),
    deleted_by: actor
  };
  return replaceEstimateFieldsIfUnchanged({
    entity,
    estimateId: id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate?.updated_date },
    nextFields,
    label
  });
}
async function restoreEstimateFromLoadedTrashSnapshot({
  entity,
  estimate,
  label = "Estimate recovery"
} = {}) {
  const id = String(estimate?.id || "").trim();
  if (!id) throw new Error(`${label} is missing its loaded Estimate. Reload trash before recovering.`);
  const nextFields = { deleted: false, deleted_at: null, deleted_by: null };
  return replaceEstimateFieldsIfUnchanged({
    entity,
    estimateId: id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate?.updated_date },
    nextFields,
    label
  });
}
async function permanentlyDeleteTrashedEstimate({
  entity,
  estimate,
  label = "Estimate permanent delete"
} = {}) {
  const id = String(estimate?.id || "").trim();
  if (!id || typeof entity?.get !== "function" || typeof entity?.delete !== "function") {
    throw new Error(`${label} could not initialize its verified permanent delete.`);
  }
  const current = await entity.get(id).catch(() => null);
  if (!current?.id) return { deleted: true, alreadyDeleted: true };
  if (current.deleted !== true) {
    throw new Error(`${label} was blocked because this Estimate is no longer in Trash. Reload before deleting.`);
  }
  try {
    await entity.delete(id);
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    if (!afterError?.id) return { deleted: true, convergedAfterResponseLoss: true };
    throw error;
  }
  const after = await entity.get(id).catch(() => null);
  if (after?.id) {
    throw new Error(`${label} could not be verified \u2014 the Estimate still exists. Reload Trash before retrying.`);
  }
  return { deleted: true };
}
export {
  expectedEstimateFields,
  permanentlyDeleteTrashedEstimate,
  replaceEstimateFieldsIfUnchanged,
  restoreEstimateFromLoadedTrashSnapshot,
  softDeleteEstimateFromLoadedSnapshot
};
