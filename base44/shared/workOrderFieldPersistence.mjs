function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== '' && b !== null && b !== undefined && b !== '') {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export class WorkOrderFieldConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkOrderFieldConflictError';
    this.code = 'WORK_ORDER_FIELD_CONFLICT';
  }
}

export function expectedWorkOrderFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}

export async function mergeWorkOrderArrayValues({
  entity,
  workOrderId,
  field,
  values,
  label = 'Work Order array merge',
  maxAttempts = 3,
} = {}) {
  const id = String(workOrderId || '').trim();
  const fieldName = String(field || '').trim();
  const additions = Array.isArray(values) ? values : [];
  if (!id || !fieldName || additions.length === 0 || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe merge.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new WorkOrderFieldConflictError(`${label} could not verify its Work Order before saving.`);
    if (current.deleted === true) throw new WorkOrderFieldConflictError(`${label} was blocked because the Work Order is in Project Trash.`);

    const currentValues = Array.isArray(current[fieldName]) ? current[fieldName] : [];
    const seen = new Set(currentValues.map((value) => JSON.stringify(normalize(value))));
    const desired = [...currentValues];
    for (const value of additions) {
      const key = JSON.stringify(normalize(value));
      if (!seen.has(key)) {
        seen.add(key);
        desired.push(value);
      }
    }
    if (sameValue(currentValues, desired)) return current;

    const currentVersion = String(current.updated_date || '').trim();
    if (!currentVersion) throw new Error(`${label} is missing its current Work Order version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: currentVersion },
        { $set: { [fieldName]: desired } },
      );
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      const afterValues = Array.isArray(afterError?.[fieldName]) ? afterError[fieldName] : [];
      const afterKeys = new Set(afterValues.map((value) => JSON.stringify(normalize(value))));
      if (additions.every((value) => afterKeys.has(JSON.stringify(normalize(value))))) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional merge result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }

  throw new WorkOrderFieldConflictError(`${label} changed repeatedly while saving. No concurrent file links were overwritten.`);
}

export async function replaceWorkOrderFieldsIfUnchanged({
  entity,
  workOrderId,
  expectedFields,
  nextFields,
  label = 'Work Order fields',
  maxAttempts = 3,
} = {}) {
  const id = String(workOrderId || '').trim();
  const expected = expectedFields && typeof expectedFields === 'object' && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === 'object' && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe replacement.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) {
      throw new WorkOrderFieldConflictError(`${label} could not verify its Work Order before saving.`);
    }
    if (current.deleted === true) {
      throw new WorkOrderFieldConflictError(`${label} was moved to Project Trash while CoreBridge was processing it.`);
    }

    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;

    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new WorkOrderFieldConflictError(`${label} changed in another session (${fieldName}). No Work Order fields were overwritten.`);
      }
    }

    const currentVersion = String(current.updated_date || '').trim();
    if (!currentVersion) throw new Error(`${label} is missing its current Work Order version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: currentVersion },
        { $set: desired },
      );
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      if (afterError?.id && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error(`${label} conditional replacement result could not be verified.`);
    }
    if (result.updated > 1) {
      throw new Error(`${label} returned an impossible multi-record update count.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }

  throw new WorkOrderFieldConflictError(`${label} changed repeatedly while saving. No newer Work Order fields were overwritten.`);
}
