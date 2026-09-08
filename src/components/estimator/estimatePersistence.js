function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
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

export function expectedEstimateFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}

export async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3,
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
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
        { $set: desired },
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
