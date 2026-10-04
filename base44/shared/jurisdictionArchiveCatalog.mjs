import { jurisdictionDocumentSourceKey } from './jurisdictionResearchDocumentMerge.mjs';
import { classifySourceDocument } from './permittingSourceClassification.mjs';

const protectedSource = (profile, doc) => profile._manual_documents || doc.source === 'manual' || doc.pinned || doc.archive_pinned;
const hashPattern = /^[a-f0-9]{64}$/;
const equal = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

export function catalogSourceEligible(profile, doc, automatic = true) {
  return Boolean(profile?.id && doc?.id && doc.url && doc.file_url && doc.archive_state?.status === 'complete' &&
    hashPattern.test(doc.source_sha256 || '') && doc.source_sha256 === doc.stored_sha256 &&
    doc.source_bytes > 0 && doc.source_bytes === doc.stored_bytes &&
    !protectedSource(profile, doc) && (!automatic || profile.auto_refresh !== false) &&
    !['complete', 'conflict'].includes(doc.catalog_state?.status));
}

export function catalogBacklogQuery() {
  return { state: { $in: ['OH', 'KY'] }, _manual_documents: { $ne: true }, auto_refresh: { $ne: false },
    documents: { $elemMatch: { 'archive_state.status': 'complete', source: { $ne: 'manual' },
      pinned: { $ne: true }, archive_pinned: { $ne: true }, 'catalog_state.status': { $nin: ['complete', 'conflict'] } } } };
}

// Existing classifier is useful for document kinds, but title/URL signals alone
// cannot establish current adoption. Never import its optimistic adoption result.
export function catalogSourcePayload(profile, doc, registrationKey, now) {
  const sourceType = doc.doc_type === 'application_form' ? 'permit_application' :
    ['sign_ordinance', 'permit_application', 'zoning_code', 'fee_schedule', 'checklist', 'legislative_record', 'gis_resource', 'portal_instruction'].includes(doc.doc_type) ? doc.doc_type : 'other';
  const classified = classifySourceDocument({ ...doc, doc_type: sourceType, authority_classification_override: undefined });
  const signals = [...classified.matched_signals];
  const label = [doc.title, doc.url].join(' ').replace(/[_%\-]+/g, ' ');
  let classification = classified.classification;
  let contentStatus = 'unknown';
  if (/\b(draft|proposed)\b/i.test(label)) {
    classification = 'draft_proposed';
    contentStatus = /\bproposed\b/i.test(label) ? 'proposed' : 'draft';
    signals.push('draft/proposed in retained title or URL');
  } else if (/\b(minutes|agenda|meeting packet)\b/i.test(label)) {
    classification = 'legislative_evidence';
    signals.push('meeting record in retained title or URL');
  } else if (['current_adopted', 'effective_date_evidence', 'narrow_amendment'].includes(classification)) {
    classification = 'unknown_review_required';
    signals.push('adoption/effectiveness requires separate evidence review');
  }
  return {
    title: doc.title || 'Archived permitting resource', jurisdiction_name: profile.name || profile.id,
    jurisdiction_id: profile.id, jurisdiction_profile_doc_id: doc.id,
    source_registration_key: registrationKey,
    source_type: classification === 'legislative_evidence' ? 'legislative_record' : sourceType,
    official_url: doc.url, archived_file_url: doc.file_url,
    file_hash_sha256: doc.stored_sha256, file_bytes: doc.stored_bytes,
    retrieval_timestamp: doc.downloaded_at || doc.archive_state.completed_at,
    content_status: contentStatus, authority_classification: classification,
    authority_confidence: 'unverified', verification_status: 'needs_verification',
    matched_signals: signals, classified_at: new Date(now).toISOString(),
    notes_gaps: 'Automatically linked from a byte-verified retained archive. Successful archival does not establish adoption, current law, effective date, issuing office, or applicability. Authority and scope require review.',
  };
}

async function transition(entity, id, doc, expected, next) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await entity.get(id);
    const matches = (current.documents || []).filter(d => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
    if (matches.length !== 1 || protectedSource(current, matches[0])) throw Error('Catalog source changed or became protected.');
    const source = matches[0];
    if (source.file_url !== doc.file_url || source.stored_sha256 !== doc.stored_sha256) throw Error('Catalog archive identity changed.');
    if (equal(source.catalog_state, next)) return current;
    if (!equal(source.catalog_state, expected) || !current.updated_date) throw Error('Catalog registration changed concurrently.');
    const documents = current.documents.map(d => d === source ? { ...d, catalog_state: next } : d);
    try {
      const result = await entity.updateMany({ id, updated_date: current.updated_date }, { $set: { documents } });
      if (result?.updated === 1) return await entity.get(id);
      if (result?.updated !== 0) throw Error('Unknown catalog conditional write outcome.');
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      const saved = after?.documents?.find(d => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
      if (saved && !protectedSource(after, saved) && saved.file_url === doc.file_url &&
          saved.stored_sha256 === doc.stored_sha256 && equal(saved.catalog_state, next)) return after;
      throw error;
    }
  }
  throw Error('Catalog write conflicted; newer work preserved.');
}

async function findMatches(catalogEntity, profile, doc, key) {
  const rows = await catalogEntity.filter({ $or: [
    { source_registration_key: key },
    { $and: [
      { $or: [{ jurisdiction_id: profile.id }, { jurisdiction_id: { $in: [null, ''] }, jurisdiction_name: profile.name }] },
      { $or: [{ jurisdiction_profile_doc_id: doc.id }, { official_url: { $in: [...new Set([doc.url, jurisdictionDocumentSourceKey(doc)])] } }] },
    ] },
  ] }, 'created_date', 3, 0);
  if (!Array.isArray(rows)) throw Error('Catalog lookup outcome unknown.');
  return rows;
}

// Creating is durable BEFORE the non-idempotent entity create. A missing
// acknowledgement can only reconcile a matching row, never create another.
export async function registerJurisdictionArchive({ entity, catalogEntity, jurisdictionId, documentId = '', automatic = true, token = crypto.randomUUID(), now = () => Date.now() }) {
  const profile = await entity.get(jurisdictionId);
  const documents = profile.documents || [];
  const doc = documents.find(d => (!documentId || d.id === documentId) && catalogSourceEligible(profile, d, automatic) &&
    !documents.some(other => other !== d && jurisdictionDocumentSourceKey(other) === jurisdictionDocumentSourceKey(d)));
  if (!doc) return { success: true, skipped: true, reason: 'no_eligible_catalog_source' };
  let state = doc.catalog_state || {};
  if (Date.parse(state.lease_expires_at || '') > now()) return { success: true, skipped: true, reason: 'registration_in_flight' };
  const key = JSON.stringify([profile.id, jurisdictionDocumentSourceKey(doc), doc.stored_sha256]);
  const rows = await findMatches(catalogEntity, profile, doc, key);
  const conflict = rows.length > 1 || (rows[0] && (
    (rows[0].jurisdiction_id && rows[0].jurisdiction_id !== profile.id) ||
    (rows[0].official_url && jurisdictionDocumentSourceKey({ url: rows[0].official_url }) !== jurisdictionDocumentSourceKey(doc)) ||
    (rows[0].file_hash_sha256 && rows[0].file_hash_sha256 !== doc.stored_sha256)));
  if (conflict) {
    await transition(entity, profile.id, doc, state, { ...state, status: 'conflict', lease_expires_at: '', error: 'Existing catalog identities or archive hashes conflict; review required.' });
    return { success: false, status: 'conflict', created: 0 };
  }
  if (rows.length === 1) {
    await transition(entity, profile.id, doc, state, { ...state, status: 'complete', source_document_id: rows[0].id, lease_expires_at: '', registered_at: new Date(now()).toISOString(), error: '', existing_record_preserved: true });
    return { success: true, registered: 1, created: 0, source_document_id: rows[0].id };
  }
  if (['creating', 'create_uncertain'].includes(state.status)) {
    // Remains blocked for creation. New matching evidence may reconcile later.
    if (state.status !== 'create_uncertain') await transition(entity, profile.id, doc, state, { ...state, status: 'create_uncertain', lease_expires_at: '', error: 'No catalog create receipt found; reconcile before creating again.' });
    return { success: false, status: 'create_uncertain', created: 0 };
  }
  const creating = { status: 'creating', claim_token: token, registration_key: key,
    lease_expires_at: new Date(now() + 90_000).toISOString(), started_at: new Date(now()).toISOString() };
  await transition(entity, profile.id, doc, state, creating);
  state = creating;
  let row;
  try {
    row = await catalogEntity.create(catalogSourcePayload(profile, doc, key, now()));
    if (!row?.id) throw Error('Catalog create returned no receipt.');
  } catch (error) {
    // Do not retry a non-idempotent create, even manually.
    try { await transition(entity, profile.id, doc, state, { ...state, status: 'create_uncertain', lease_expires_at: '', error: String(error.message || error).slice(0, 500) }); } catch {}
    return { success: false, status: 'create_uncertain', created: 0 };
  }
  try {
    const after = await findMatches(catalogEntity, profile, doc, key);
    if (after.length !== 1 || after[0].id !== row.id) throw Error('Concurrent catalog identity requires review.');
    await transition(entity, profile.id, doc, state, { ...state, status: 'complete', source_document_id: row.id, lease_expires_at: '', registered_at: new Date(now()).toISOString(), error: '' });
    return { success: true, registered: 1, created: 1, source_document_id: row.id };
  } catch (error) {
    return { success: false, status: 'receipt_conflict', created: 1, source_document_id: row.id, error: String(error.message || error) };
  }
}

export async function continueJurisdictionCatalogBacklog(options) {
  const profiles = await options.entity.filter(catalogBacklogQuery(), 'updated_date', 20, 0);
  for (const profile of profiles) {
    if (!profile.documents?.some(doc => catalogSourceEligible(profile, doc) &&
      doc.catalog_state?.status !== 'create_uncertain' && !(Date.parse(doc.catalog_state?.lease_expires_at || '') > Date.now()))) continue;
    try {
      const result = await registerJurisdictionArchive({ ...options, jurisdictionId: profile.id });
      if (!result.skipped) return result;
    } catch (error) { return { success: false, status: 'registration_conflict', error: String(error.message || error) }; }
  }
  return { success: true, skipped: true, reason: 'no_eligible_catalog_source', profiles_checked: profiles.length };
}
