function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function canonicalRecord(rows = []) {
  return [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || '');
    const bStamp = String(b?.created_date || '');
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

export class RegulationAlertConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegulationAlertConflictError';
    this.code = 'REGULATION_ALERT_CONFLICT';
  }
}

function requireAlertIdentity(row, data, identityFields, label) {
  for (const field of identityFields) {
    if (!sameValue(row?.[field], data?.[field])) {
      throw new RegulationAlertConflictError(`${label} found a different alert identity (${field}) during convergence. It was left intact.`);
    }
  }
}

async function deleteExactRaceDuplicate({ entity, row, data, identityFields, label }) {
  const id = String(row?.id || '').trim();
  const version = String(row?.updated_date || '').trim();
  if (!id || !version || typeof entity?.deleteMany !== 'function' || typeof entity?.get !== 'function') {
    throw new Error(`${label} could not identify a losing duplicate safely.`);
  }
  requireAlertIdentity(row, data, identityFields, label);
  if (row?.notification_sent === true) {
    throw new RegulationAlertConflictError(`${label} found a duplicate that already owns notification delivery. It was left intact for review.`);
  }

  let result;
  try {
    result = await entity.deleteMany({ id, updated_date: version });
  } catch (error) {
    const current = await entity.get(id).catch(() => null);
    if (!current) return { status: 'already_absent' };
    throw error;
  }

  if (!result || typeof result.deleted !== 'number') {
    throw new Error(`${label} duplicate cleanup result could not be verified.`);
  }
  if (result.deleted === 1) return { status: 'deleted_now' };
  if (result.deleted > 1) throw new Error(`${label} duplicate cleanup matched more than one row unexpectedly.`);

  const current = await entity.get(id).catch(() => null);
  if (!current) return { status: 'already_absent' };
  throw new RegulationAlertConflictError(`${label} duplicate changed before cleanup, so it was left intact for review.`);
}

export async function ensureConvergentRegulationAlertCreate({
  entity,
  data,
  readMatches,
  identityFields = ['jurisdiction_id', 'field_changed', 'alert_type'],
  label = 'Regulation Alert create',
  settleMs = 40,
} = {}) {
  if (typeof entity?.create !== 'function' || typeof entity?.get !== 'function' || typeof entity?.deleteMany !== 'function' || typeof readMatches !== 'function') {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const existing = await readMatches();
  if (!Array.isArray(existing)) throw new Error(`${label} preflight did not return a record list.`);
  if (existing.length) {
    return { record: canonicalRecord(existing), status: 'reused', duplicates_removed: 0 };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  let afterCreate = [];
  let verifyError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      afterCreate = await readMatches();
      verifyError = null;
      if (Array.isArray(afterCreate) && afterCreate.length) break;
    } catch (error) {
      verifyError = error;
    }
  }

  if (Array.isArray(afterCreate) && afterCreate.length) {
    const keep = canonicalRecord(afterCreate);
    if (!keep?.id) throw new Error(`${label} could not identify a canonical alert.`);
    requireAlertIdentity(keep, data, identityFields, label);

    let removed = 0;
    for (const row of afterCreate) {
      if (!row?.id || row.id === keep.id) continue;
      await deleteExactRaceDuplicate({ entity, row, data, identityFields, label });
      removed += 1;
    }

    const finalRows = await readMatches();
    if (!Array.isArray(finalRows) || finalRows.length !== 1 || finalRows[0]?.id !== keep.id) {
      throw new RegulationAlertConflictError(`${label} could not converge simultaneous creates to one verified canonical alert.`);
    }

    return {
      record: finalRows[0],
      status: created?.id && created.id === keep.id ? 'created' : 'reused',
      duplicates_removed: removed,
    };
  }

  if (createError) throw createError;
  if (verifyError) throw verifyError;

  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) {
      throw new Error(`${label} created an alert but the suppression query could not see it yet. Do not retry blindly.`);
    }
  }
  throw new Error(`${label} could not verify whether an alert was created.`);
}

export async function replaceRegulationAlertFieldsIfUnchanged({
  entity,
  alert,
  nextFields,
  label = 'Regulation Alert update',
  maxAttempts = 3,
} = {}) {
  const id = String(alert?.id || '').trim();
  const desired = nextFields && typeof nextFields === 'object' && !Array.isArray(nextFields) ? nextFields : null;
  const fields = desired ? Object.keys(desired) : [];
  if (!id || !desired || !fields.length || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new RegulationAlertConflictError(`${label} no longer exists.`);

    if (fields.every((field) => sameValue(current[field], desired[field]))) return current;

    for (const field of fields) {
      if (!sameValue(current[field], alert?.[field]) && !sameValue(current[field], desired[field])) {
        throw new RegulationAlertConflictError(`${label} changed in another session (${field}).`);
      }
    }

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current version.`);

    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: desired });
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError?.id && fields.every((field) => sameValue(afterError[field], desired[field]))) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional update result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }

  throw new RegulationAlertConflictError(`${label} changed repeatedly while saving.`);
}

export async function claimRegulationAlertNotification({
  entity,
  alert,
  method = 'email',
  label = 'Regulation Alert notification',
} = {}) {
  const id = String(alert?.id || '').trim();
  if (!id || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its delivery claim.`);
  }

  const current = await entity.get(id);
  if (!current?.id) throw new RegulationAlertConflictError(`${label} no longer exists.`);
  if (current.notification_sent === true) return { claimed: false, record: current, reason: 'already_sent' };

  const claimedAt = new Date().toISOString();
  const version = String(current.updated_date || '').trim();
  if (!version) throw new Error(`${label} is missing its current version.`);

  let result;
  try {
    result = await entity.updateMany(
      { id, updated_date: version, notification_sent: { $ne: true } },
      { $set: { notification_sent: true, notification_sent_at: claimedAt, notification_method: method } },
    );
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    if (afterError?.notification_sent === true) return { claimed: false, record: afterError, reason: 'claimed_elsewhere_or_response_loss' };
    throw error;
  }

  if (!result || typeof result.updated !== 'number') throw new Error(`${label} claim result could not be verified.`);
  if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record claim count.`);
  const saved = await entity.get(id);
  if (!saved?.id) throw new Error(`${label} claim could not be re-read.`);
  if (result.updated === 1) return { claimed: true, record: saved, reason: 'claimed_now' };
  if (saved.notification_sent === true) return { claimed: false, record: saved, reason: 'claimed_elsewhere' };
  throw new RegulationAlertConflictError(`${label} could not acquire the delivery claim.`);
}
