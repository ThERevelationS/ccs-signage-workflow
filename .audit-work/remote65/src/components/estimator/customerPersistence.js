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

export function expectedCustomerFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  // `company_name` is the Customer identity/dedupe key: carry its baseline so
  // a concurrent rename fails the CAS closed even when this write does not
  // itself touch the name. Enforced by an explicit check inside
  // replaceCustomerFieldsIfUnchanged (expected-only keys are not otherwise
  // compared). Rows loaded before a name was stored simply skip the guard.
  if (!Object.prototype.hasOwnProperty.call(expected, "company_name") && Object.prototype.hasOwnProperty.call(record || {}, "company_name")) {
    expected.company_name = record?.company_name;
  }
  return expected;
}

export async function replaceCustomerFieldsIfUnchanged({
  entity,
  customerId,
  expectedFields,
  nextFields,
  label = "Customer fields",
  maxAttempts = 3,
} = {}) {
  const id = String(customerId || "").trim();
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
    if (!current?.id) throw new Error(`${label} could not verify its Customer before saving.`);

    // `company_name` is the Customer identity/dedupe key. expectedCustomerFields
    // always carries its baseline when the loaded row stored a name, so a
    // concurrent rename — even on a write that does not itself touch the name —
    // fails closed instead of silently syncing fields onto a renamed record.
    // Rename writes declare `company_name` in nextFields and compare normally.
    if (
      Object.prototype.hasOwnProperty.call(expected, "company_name") &&
      !sameValue(current.company_name, expected.company_name) &&
      !sameValue(current.company_name, desired.company_name)
    ) {
      throw new Error(`${label} changed in another session (company_name). Reload before saving. No Customer fields were overwritten.`);
    }

    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;

    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Customer fields were overwritten.`);
      }
    }

    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Customer version. Reload before saving.`);

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

  throw new Error(`${label} Customer changed repeatedly while saving. Reload and try again.`);
}
