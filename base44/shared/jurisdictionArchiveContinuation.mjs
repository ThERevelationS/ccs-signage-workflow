import { registerJurisdictionArchive, continueJurisdictionCatalogBacklog } from './jurisdictionArchiveCatalog.mjs';
import { isDownloadableResearchDocument } from './jurisdictionPermittingLinkDiscovery.mjs';
import { jurisdictionDocumentSourceKey } from './jurisdictionResearchDocumentMerge.mjs';
import { RESEARCH_FETCH_TIMEOUT_MS, RESEARCH_UPLOAD_TIMEOUT_MS, withResearchArchiveTimeout } from './jurisdictionResearchArchiveBudget.mjs';

export const ARCHIVE_LEASE_MS = 90_000;
export const AUTOMATIC_ARCHIVE_RETRY_LIMIT = 3;
const MAX_BYTES = 50 * 1024 * 1024;
const protectedDoc = doc => doc?.source === 'manual' || doc?.pinned === true || doc?.archive_pinned === true || Boolean(doc?.file_url || doc?.source_sha256);

export function archiveDocumentEligible(doc, { manual = false, now = Date.now() } = {}) {
  if (!doc?.id || !isDownloadableResearchDocument(doc) || protectedDoc(doc)) return false;
  const state = doc.archive_state || {};
  if (['complete', 'uploading', 'upload_uncertain'].includes(state.status)) return false;
  if (Date.parse(state.lease_expires_at || '') > now) return false;
  if (state.file_url) return (state.status === 'uploaded' || (manual && state.status === 'verification_blocked')) && (manual || !(Date.parse(state.retry_after || '') > now));
  if (state.status === 'blocked' && !manual) return false;
  if (!manual && (Number(state.attempts || 0) >= AUTOMATIC_ARCHIVE_RETRY_LIMIT || Date.parse(state.retry_after || '') > now)) return false;
  return true;
}

export function archiveBacklogQuery(now = Date.now()) {
  return {
    state: { $in: ['OH', 'KY'] },
    _manual_documents: { $ne: true }, auto_refresh: { $ne: false },
    documents: { $elemMatch: {
      url: { $regex: '\\.(pdf|docx?|xlsx?|csv|txt)(\\?|#|$)', $options: 'i' },
      file_url: { $in: [null, ''] }, source_sha256: { $in: [null, ''] },
      source: { $ne: 'manual' }, pinned: { $ne: true }, archive_pinned: { $ne: true },
      'archive_state.status': { $nin: ['complete', 'uploading', 'upload_uncertain', 'blocked', 'verification_blocked'] },
      $and: [
        { $or: [{ 'archive_state.retry_after': { $in: [null, ''] } }, { 'archive_state.retry_after': { $lte: new Date(now).toISOString() } }] },
        { $or: [{ 'archive_state.lease_expires_at': { $in: [null, ''] } }, { 'archive_state.lease_expires_at': { $lte: new Date(now).toISOString() } }] },
      ],
    } },
  };
}

async function readBytes(response) {
  if (!response.ok) throw new Error('Official file returned HTTP ' + response.status);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (/text\/html|application\/xhtml\+xml/.test(type)) throw new Error('Source returned HTML instead of a downloadable file.');
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Official file exceeds 50 MB.');
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Official file has an unsafe byte count.');
    return bytes;
  }
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      count += value.length;
      if (count > MAX_BYTES) { await reader.cancel(); throw new Error('Official file exceeds 50 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!count) throw new Error('Official file is empty.');
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameState(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Every write re-reads and patches only this source against the latest profile.
// A source removal/manual protection/token change prevents any later overwrite.
async function transition(entity, id, doc, expected, nextState, flatPatch = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await entity.get(id);
    if (!current?.id || current._manual_documents) throw new Error('Archive collection changed or is manually protected.');
    const matching = (current.documents || []).filter(d => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
    if (matching.length !== 1) throw new Error('Archive source changed or has duplicate identities.');
    const source = matching[0];
    if (source.source === 'manual' || source.pinned === true || source.archive_pinned === true) throw new Error('Archive source became protected.');
    const converged = sameState(source.archive_state, nextState) && Object.entries(flatPatch).every(([key, value]) => source[key] === value);
    if (converged) return current;
    if (!sameState(source.archive_state || {}, expected || {}) || source.file_url || source.source_sha256) throw new Error('Archive source or receipt changed concurrently.');
    if (!current.updated_date) throw new Error('Archive profile has no version.');
    const documents = current.documents.map(d => d === source ? { ...d, ...flatPatch, archive_state: nextState } : d);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: current.updated_date }, { $set: { documents } });
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      const saved = after?.documents?.find(d => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
      if (saved && !after._manual_documents && saved.source !== 'manual' && !saved.pinned && !saved.archive_pinned &&
          sameState(saved.archive_state, nextState) && Object.entries(flatPatch).every(([key, value]) => saved[key] === value)) return after;
      throw error;
    }
    if (!result || typeof result.updated !== 'number' || result.updated > 1) throw new Error('Archive conditional write outcome could not be verified.');
    if (result.updated === 1) return await entity.get(id);
  }
  throw new Error('Archive write repeatedly conflicted; newer work was preserved.');
}

export async function archiveKnownJurisdictionSource({ entity, catalogEntity, jurisdictionId, documentId = '', fetchSource, uploadFile, manual = false, token = crypto.randomUUID(), now = () => Date.now() }) {
  const initial = await entity.get(jurisdictionId);
  if (!initial?.id) throw new Error('Jurisdiction not found.');
  if (!manual && initial.auto_refresh === false) return { success: true, skipped: true, reason: 'auto_refresh_disabled', jurisdiction: initial };
  if (initial._manual_documents) return { success: true, skipped: true, reason: 'manual_collection', jurisdiction: initial };
  const docs = initial.documents || [];
  const doc = docs.find(d => (!documentId || d.id === documentId) && archiveDocumentEligible(d, { manual, now: now() }) &&
    !docs.some(other => other !== d && jurisdictionDocumentSourceKey(other) === jurisdictionDocumentSourceKey(d)));
  if (!doc) return { success: true, skipped: true, reason: 'no_eligible_file', jurisdiction: initial };
  let state = doc.archive_state || {};
  const resumeUpload = ['uploaded', 'verification_blocked'].includes(state.status) && Boolean(state.file_url);
  const attempts = resumeUpload ? Math.max(1, Number(state.attempts) || 1) : (Number(state.attempts) || 0) + 1;
  const stamp = () => new Date(now()).toISOString();
  const claimed = { ...state, status: resumeUpload ? 'uploaded' : 'downloading', claim_token: token, attempts,
    lease_expires_at: new Date(now() + ARCHIVE_LEASE_MS).toISOString(), last_attempt_at: stamp(), error: '' };
  await transition(entity, jurisdictionId, doc, state, claimed);
  state = claimed;
  let uploads = 0;
  let stage = resumeUpload ? 'verify' : 'download';
  const fetchBytes = async url => withResearchArchiveTimeout((async () => {
    const response = await fetchSource(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS) });
    return readBytes(response);
  })(), RESEARCH_FETCH_TIMEOUT_MS, 'Archive fetch/read');
  try {
    if (!resumeUpload) {
      const bytes = await fetchBytes(doc.url);
      const ext = new URL(doc.url).pathname.split('.').pop().toLowerCase();
      if (ext === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Source is not a valid PDF.');
      const sha = await digest(bytes);
      const uploading = { ...state, status: 'uploading', source_sha256: sha, source_bytes: bytes.length };
      await transition(entity, jurisdictionId, doc, state, uploading);
      state = uploading;
      stage = 'upload';
      const types = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' };
      let name = new URL(doc.url).pathname.split('/').pop() || 'official-resource.' + ext;
      try { name = decodeURIComponent(name); } catch {}
      uploads++;
      const result = await withResearchArchiveTimeout(uploadFile({ file: new File([bytes], name, { type: types[ext] || 'application/octet-stream' }) }), RESEARCH_UPLOAD_TIMEOUT_MS, 'Archive upload');
      if (!result?.file_url) throw new Error('Upload returned no usable file URL; outcome is uncertain.');
      const uploaded = { ...state, status: 'uploaded', file_url: result.file_url, uploaded_at: stamp(), verification_attempts: 0 };
      // Durable receipt before readback. A later retry verifies this same file.
      await transition(entity, jurisdictionId, doc, state, uploaded);
      state = uploaded;
    }
    stage = 'verify';
    const verifying = { ...state, verification_attempts: (Number(state.verification_attempts) || 0) + 1 };
    await transition(entity, jurisdictionId, doc, state, verifying);
    state = verifying;
    const stored = await fetchBytes(state.file_url);
    const storedSha = await digest(stored);
    if (stored.length !== state.source_bytes || storedSha !== state.source_sha256) throw new Error('Stored archive bytes do not match the official source.');
    const complete = { ...state, status: 'complete', lease_expires_at: '', retry_after: '', error: '', completed_at: stamp() };
    const jurisdiction = await transition(entity, jurisdictionId, doc, state, complete, {
      file_url: state.file_url, source_sha256: state.source_sha256, source_bytes: state.source_bytes,
      stored_sha256: storedSha, stored_bytes: stored.length, downloaded_at: state.uploaded_at,
    });
    const catalog = catalogEntity ? await registerJurisdictionArchive({ entity, catalogEntity, jurisdictionId, documentId: doc.id, automatic: !manual })
      .catch(error => ({ success: false, status: 'registration_conflict', error: String(error.message || error) })) : null;
    // Catalog failure cannot reverse a verified archive or trigger re-upload.
    return { success: true, archived: 1, uploads, status: 'complete', document_url: doc.url, catalog,
      jurisdiction: catalogEntity ? await entity.get(jurisdictionId).catch(() => jurisdiction) : jurisdiction };
  } catch (error) {
    const status = stage === 'upload' ? 'upload_uncertain' : stage === 'verify' ? (state.verification_attempts >= AUTOMATIC_ARCHIVE_RETRY_LIMIT ? 'verification_blocked' : 'uploaded') : attempts >= AUTOMATIC_ARCHIVE_RETRY_LIMIT ? 'blocked' : 'failed';
    const failed = { ...state, status, lease_expires_at: '', error: String(error?.message || error).slice(0, 500),
      retry_after: new Date(now() + Math.min(24 * 60 * 60_000, attempts * 60 * 60_000)).toISOString() };
    try { await transition(entity, jurisdictionId, doc, state, failed); }
    catch (persistError) { return { success: false, status: 'receipt_conflict', uploads, document_url: doc.url, error: persistError.message }; }
    return { success: false, status, uploads, document_url: doc.url, error: failed.error };
  }
}

// Selection is bounded; oldest updated profiles move behind untouched ones as
// each attempt writes its receipt. Backoff/active leases are excluded in-query.
export async function continueJurisdictionArchiveBacklog(options) {
  const candidates = await options.entity.filter(archiveBacklogQuery(), 'updated_date', 20, 0);
  for (const profile of candidates) {
    try {
      const result = await archiveKnownJurisdictionSource({ ...options, jurisdictionId: profile.id, manual: false });
      if (!result.skipped) {
        if (options.catalogEntity && !result.catalog) result.catalog = await continueJurisdictionCatalogBacklog(options);
        return result;
      }
    } catch (error) {
      return { success: false, status: 'claim_conflict', error: String(error?.message || error) };
    }
  }
  return { success: true, skipped: true, reason: 'no_eligible_file', profiles_checked: candidates.length,
    catalog: options.catalogEntity ? await continueJurisdictionCatalogBacklog(options) : null };
}
