function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

export function sameFoundationValue(a, b) {
  if (a !== null && a !== undefined && a !== '' && b !== null && b !== undefined && b !== '') {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export class OpportunityFoundationCreateAmbiguityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpportunityFoundationCreateAmbiguityError';
    this.code = 'OPPORTUNITY_FOUNDATION_CREATE_AMBIGUOUS';
  }
}

export class OpportunityFoundationFieldConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpportunityFoundationFieldConflictError';
    this.code = 'OPPORTUNITY_FOUNDATION_FIELD_CONFLICT';
  }
}

export function requireFoundationCreationKey(data = {}, label = 'Opportunity foundation record') {
  const key = String(data?.creation_request_key || '').trim();
  if (!key) throw new Error(`${label} requires a stable creation_request_key.`);
  return key;
}

export function foundationCreationKeyQuery(creationRequestKey) {
  const key = String(creationRequestKey || '').trim();
  if (!key) throw new Error('A stable creation_request_key is required.');
  return { creation_request_key: key };
}

export function expectedFoundationFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}

export async function createFoundationRecordWithRecovery({
  entity,
  data,
  readMatches,
  label = 'Opportunity foundation create',
  settleMs = 50,
} = {}) {
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  if (!payload || typeof entity?.create !== 'function' || typeof entity?.get !== 'function' || typeof readMatches !== 'function') {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  requireFoundationCreationKey(payload, label);

  const readVerifiedMatches = async (phase) => {
    const rows = await readMatches();
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} lookup did not return a record list.`);
    const unique = [];
    const seen = new Set();
    for (const row of rows) {
      const id = String(row?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(row);
    }
    return unique;
  };

  const before = await readVerifiedMatches('preflight');
  if (before.length > 1) {
    throw new OpportunityFoundationCreateAmbiguityError(
      `${label} found multiple records with the same creation identity. Nothing was deleted; review the duplicates before retrying.`
    );
  }
  if (before.length === 1) return { record: before[0], status: 'reused' };

  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  let after = [];
  let verificationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      after = await readVerifiedMatches('recovery');
      verificationError = null;
      if (after.length) break;
    } catch (error) {
      verificationError = error;
    }
  }

  if (after.length > 1) {
    throw new OpportunityFoundationCreateAmbiguityError(
      `${label} may have been created more than once during concurrent processing or an uncertain response. Nothing was deleted; review the matching records.`
    );
  }

  if (after.length === 1) {
    const record = after[0];
    if (created?.id && String(record.id) !== String(created.id)) {
      const direct = await entity.get(created.id).catch(() => null);
      if (direct?.id) {
        throw new OpportunityFoundationCreateAmbiguityError(
          `${label} returned one create receipt while a different matching record became visible. Nothing was deleted; reload and review.`
        );
      }
    }
    return {
      record,
      status: created?.id && String(record.id) === String(created.id) ? 'created' : 'recovered',
    };
  }

  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) return { record: direct, status: 'created' };
  }

  if (verificationError) {
    throw new Error(`${label} create outcome could not be verified because recovery lookup failed. Do not retry blindly; reload first. ${verificationError?.message || ''}`.trim());
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No matching record was visible after recovery checks. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Do not retry blindly; reload first.`);
}

export async function replaceFoundationFieldsIfUnchanged({
  entity,
  recordId,
  expectedFields,
  nextFields,
  label = 'Opportunity foundation fields',
  maxAttempts = 3,
  validateChange = null,
} = {}) {
  const id = String(recordId || '').trim();
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
      throw new OpportunityFoundationFieldConflictError(`${label} could not verify its record before saving.`);
    }

    const alreadyDesired = fieldNames.every((fieldName) => sameFoundationValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;

    if (typeof validateChange === 'function') validateChange({ current, expected, desired });

    for (const fieldName of fieldNames) {
      if (!sameFoundationValue(current[fieldName], expected[fieldName]) &&
          !sameFoundationValue(current[fieldName], desired[fieldName])) {
        throw new OpportunityFoundationFieldConflictError(
          `${label} changed in another session (${fieldName}). No newer values were overwritten.`
        );
      }
    }

    const currentVersion = String(current.updated_date || '').trim();
    if (!currentVersion) throw new Error(`${label} is missing its current record version.`);

    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: currentVersion },
        { $set: desired },
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError?.id && fieldNames.every((fieldName) => sameFoundationValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') {
      throw new Error(`${label} conditional replacement result could not be verified.`);
    }
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }

  throw new OpportunityFoundationFieldConflictError(
    `${label} changed repeatedly while saving. No newer values were overwritten.`
  );
}

export async function replaceEstimatingRequestFieldsIfUnchanged(args = {}) {
  return replaceFoundationFieldsIfUnchanged({
    ...args,
    label: args.label || 'Estimating Request fields',
    validateChange: ({ current, expected, desired }) => {
      if (typeof args.validateChange === 'function') args.validateChange({ current, expected, desired });
      const frozen = String(current?.status || 'draft') !== 'draft';
      if (!frozen) return;
      if (Object.prototype.hasOwnProperty.call(desired, 'handoff_snapshot') &&
          !sameFoundationValue(current?.handoff_snapshot, desired.handoff_snapshot)) {
        throw new OpportunityFoundationFieldConflictError(
          'Estimating Request handoff_snapshot is frozen after submission. Create a new request/revision instead of rewriting historical handoff facts.'
        );
      }
      if (Object.prototype.hasOwnProperty.call(desired, 'handoff_snapshot_version') &&
          !sameFoundationValue(current?.handoff_snapshot_version, desired.handoff_snapshot_version)) {
        throw new OpportunityFoundationFieldConflictError(
          'Estimating Request handoff_snapshot_version is frozen after submission.'
        );
      }
    },
  });
}

export function foundationRelationshipErrors({
  opportunity = null,
  intake = null,
  estimatingRequest = null,
  workOrder = null,
  estimate = null,
} = {}) {
  const errors = [];
  const opportunityId = String(opportunity?.id || '').trim();
  const requestId = String(estimatingRequest?.id || '').trim();

  const requireMatch = (actual, expected, label) => {
    const a = String(actual || '').trim();
    const e = String(expected || '').trim();
    if (a && e && a !== e) errors.push(`${label} points to ${a}, expected ${e}.`);
  };

  if (opportunityId) {
    requireMatch(intake?.opportunity_id, opportunityId, 'OpportunityIntake.opportunity_id');
    requireMatch(estimatingRequest?.opportunity_id, opportunityId, 'EstimatingRequest.opportunity_id');
    requireMatch(workOrder?.opportunity_id, opportunityId, 'WorkOrder.opportunity_id');
    requireMatch(estimate?.opportunity_id, opportunityId, 'AllInOneEstimate.opportunity_id');
  }
  if (requestId) {
    requireMatch(workOrder?.estimating_request_id, requestId, 'WorkOrder.estimating_request_id');
    requireMatch(estimate?.estimating_request_id, requestId, 'AllInOneEstimate.estimating_request_id');
  }

  return errors;
}
