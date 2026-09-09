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

export class JurisdictionPersistenceConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JurisdictionPersistenceConflictError';
    this.code = 'JURISDICTION_PERSISTENCE_CONFLICT';
  }
}

export function expectedJurisdictionFields(record = {}, nextFields = {}) {
  return Object.fromEntries(Object.keys(nextFields || {}).map((field) => [field, record?.[field]]));
}

export function jurisdictionProtectionGuards(record = {}, nextFields = {}, { respectManualProtection = true } = {}) {
  if (!respectManualProtection) return {};
  const fields = new Set(Object.keys(nextFields || {}));
  const guards = {};
  if (fields.has('website_url')) guards._manual_website_url = record?._manual_website_url;
  if (fields.has('permitting_url')) guards._manual_permitting_url = record?._manual_permitting_url;
  if (fields.has('documents')) guards._manual_documents = record?._manual_documents;
  const requirementFields = [
    'permit_requirements', 'ai_summary', 'contact_info', 'sqft_width_height_rules',
    'height_allowances', 'setback_rules', 'lighting_allowances'
  ];
  if (requirementFields.some((field) => fields.has(field))) {
    guards._manual_requirements = record?._manual_requirements;
  }
  return guards;
}

export async function replaceJurisdictionFieldsIfUnchanged({
  entity,
  jurisdiction,
  nextFields,
  guardFields = {},
  label = 'Jurisdiction update',
  maxAttempts = 3,
} = {}) {
  const id = String(jurisdiction?.id || '').trim();
  const desired = nextFields && typeof nextFields === 'object' && !Array.isArray(nextFields) ? nextFields : null;
  const fields = desired ? Object.keys(desired) : [];
  if (!id || !desired || fields.length === 0 || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = expectedJurisdictionFields(jurisdiction, desired);
  const guards = guardFields && typeof guardFields === 'object' && !Array.isArray(guardFields) ? guardFields : {};
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));

  const assertGuards = (record) => {
    for (const [field, value] of Object.entries(guards)) {
      if (!sameValue(record?.[field], value)) {
        throw new JurisdictionPersistenceConflictError(`${label} was blocked because ${field} changed while research/editing was in progress. No protected jurisdiction data was overwritten.`);
      }
    }
  };

  const targetsConverged = (record) => fields.every((field) => sameValue(record?.[field], desired[field]));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new JurisdictionPersistenceConflictError(`${label} could not re-read its Jurisdiction before saving.`);
    assertGuards(current);
    if (targetsConverged(current)) return current;

    for (const field of fields) {
      if (!sameValue(current[field], expected[field]) && !sameValue(current[field], desired[field])) {
        throw new JurisdictionPersistenceConflictError(`${label} changed in another session (${field}). The newer value was not overwritten.`);
      }
    }

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current Jurisdiction version.`);

    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: desired });
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      if (afterError?.id) {
        assertGuards(afterError);
        if (targetsConverged(afterError)) return afterError;
      }
      throw error;
    }

    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional-update result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      if (!targetsConverged(saved)) {
        throw new JurisdictionPersistenceConflictError(`${label} changed again immediately after saving. Reload before retrying.`);
      }
      return saved;
    }
  }

  throw new JurisdictionPersistenceConflictError(`${label} changed repeatedly while saving. No newer jurisdiction data was overwritten.`);
}

export async function appendJurisdictionActivity({
  entity,
  jurisdictionId,
  entry,
  label = 'Jurisdiction activity log',
  maxAttempts = 3,
} = {}) {
  const id = String(jurisdictionId || '').trim();
  const entryId = String(entry?.id || '').trim();
  if (!id || !entryId || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe append.`);
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new JurisdictionPersistenceConflictError(`${label} could not re-read its Jurisdiction.`);
    const log = Array.isArray(current.activity_log) ? current.activity_log : [];
    if (log.some((item) => String(item?.id || '') === entryId)) return current;
    const desired = [...log, entry];
    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current Jurisdiction version.`);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: { activity_log: desired } });
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      if (after?.id && Array.isArray(after.activity_log) && after.activity_log.some((item) => String(item?.id || '') === entryId)) return after;
      throw error;
    }
    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional append result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new JurisdictionPersistenceConflictError(`${label} changed repeatedly while appending. No activity entries were overwritten.`);
}

export async function patchJurisdictionDocuments({
  entity,
  jurisdictionId,
  documentUrl,
  patch,
  label = 'Jurisdiction document update',
  maxAttempts = 3,
} = {}) {
  const id = String(jurisdictionId || '').trim();
  const url = String(documentUrl || '').trim();
  const desiredPatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : null;
  const patchFields = desiredPatch ? Object.keys(desiredPatch) : [];
  if (!id || !url || !desiredPatch || patchFields.length === 0 || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe document update.`);
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new JurisdictionPersistenceConflictError(`${label} could not re-read its Jurisdiction.`);
    const docs = Array.isArray(current.documents) ? current.documents : [];
    const matching = docs.filter((doc) => String(doc?.url || '') === url);
    if (matching.length === 0) {
      throw new JurisdictionPersistenceConflictError(`${label} was blocked because the source document is no longer present.`);
    }
    const alreadyDesired = matching.every((doc) => patchFields.every((field) => sameValue(doc?.[field], desiredPatch[field])));
    if (alreadyDesired) return current;
    const desiredDocs = docs.map((doc) => String(doc?.url || '') === url ? { ...doc, ...desiredPatch } : doc);
    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current Jurisdiction version.`);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: { documents: desiredDocs } });
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      const afterMatches = Array.isArray(after?.documents) ? after.documents.filter((doc) => String(doc?.url || '') === url) : [];
      if (after?.id && afterMatches.length > 0 && afterMatches.every((doc) => patchFields.every((field) => sameValue(doc?.[field], desiredPatch[field])))) return after;
      throw error;
    }
    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional document update result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new JurisdictionPersistenceConflictError(`${label} changed repeatedly while saving. Concurrent document changes were preserved.`);
}
