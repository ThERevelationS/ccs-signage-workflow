function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

/**
 * CAS field compare — intended null / undefined / "" semantics:
 * - The three empty-ish values are DISTINCT: a stored null never equals a
 *   missing key (undefined) or an empty string. Clearing a field to null
 *   therefore counts as a change vs both absent and "" — deliberate, so a
 *   concurrent clear is never silently treated as "already unchanged".
 * - Inside objects, a key explicitly set to undefined serializes identically
 *   to a missing key (JSON.stringify drops both) — only top-level undefined
 *   is distinguishable.
 * - Numeric tolerance: when BOTH sides are non-empty and coerce to finite
 *   numbers, compare with a 1e-6 epsilon, so "12.5" equals 12.5 but the
 *   empty-ish values never take the numeric branch.
 * - Everything else compares JSON.stringify of the normalize tree, whose
 *   object keys are sorted recursively — object key order never affects
 *   equality; array order still does (arrays are positional).
 */
function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  // Carry the loaded trash flag into the baseline so Trash-lifecycle writes
  // (soft-delete/restore declare `deleted` in nextFields) compare against the
  // real stored value rather than an absent key. Writes that do NOT declare
  // `deleted` are instead blocked outright by the refuse-on-trashed check
  // inside replaceEstimateFieldsIfUnchanged. Skipping absent `deleted` keys
  // keeps undefined-vs-false/null storage shapes from breaking the compare on
  // rows that never persisted the flag.
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}

export async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3,
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

/**
 * Soft-delete an Estimate through the same field-level CAS used for ordinary
 * saves. The loaded record supplies both the expected field baselines and the
 * whole-version guard, so a concurrent edit cannot be trashed unnoticed.
 */
export async function softDeleteEstimateFromLoadedSnapshot({
  entity,
  estimate,
  deletedBy = "unknown",
  label = "Estimate delete",
} = {}) {
  const id = String(estimate?.id || "").trim();
  const actor = String(deletedBy || "unknown").trim() || "unknown";
  if (!id) throw new Error(`${label} is missing its loaded Estimate. Reload before deleting.`);
  const nextFields = {
    deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: actor,
  };
  return replaceEstimateFieldsIfUnchanged({
    entity,
    estimateId: id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate?.updated_date },
    nextFields,
    label,
  });
}

/**
 * Restore a trashed Estimate. The prior status is preserved automatically
 * because soft-delete never touched it — only the trash markers are cleared.
 */
export async function restoreEstimateFromLoadedTrashSnapshot({
  entity,
  estimate,
  label = "Estimate recovery",
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
    label,
  });
}

/**
 * Permanently delete an Estimate that is already in Trash. The record is
 * re-verified as trashed before deleting, and the delete is confirmed absent
 * afterward — a response loss or concurrent restore fails closed.
 */
export async function permanentlyDeleteTrashedEstimate({
  entity,
  estimate,
  label = "Estimate permanent delete",
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
    throw new Error(`${label} could not be verified — the Estimate still exists. Reload Trash before retrying.`);
  }
  return { deleted: true };
}