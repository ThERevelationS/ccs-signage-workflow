import { validatePermitDocumentBytes } from './permittingDocumentValidation.mjs';
import { hasClassifiedPdfResource } from './permittingResourceResponse.mjs';
import { registerJurisdictionArchive, continueJurisdictionCatalogBacklog } from './jurisdictionArchiveCatalog.mjs';
import { authorizedHtmlUrl } from './permittingHtmlEvidence.mjs';
import { isDownloadableResearchDocument } from './jurisdictionPermittingLinkDiscovery.mjs';
import { jurisdictionDocumentSourceKey } from './jurisdictionResearchDocumentMerge.mjs';
import { RESEARCH_FETCH_TIMEOUT_MS, RESEARCH_UPLOAD_TIMEOUT_MS, withResearchArchiveTimeout } from './jurisdictionResearchArchiveBudget.mjs';

export const ARCHIVE_LEASE_MS = 90_000;
export const AUTOMATIC_ARCHIVE_RETRY_LIMIT = 3;
const MAX_BYTES = 50 * 1024 * 1024;
const protectedDoc = doc => doc?.source === 'manual' || doc?.pinned === true || doc?.archive_pinned === true || Boolean(doc?.file_url || doc?.source_sha256);

export function archiveDocumentEligible(doc, { manual = false, selectedPdf = false, scopedExternal = false, now = Date.now() } = {}) {
  if (!doc?.id || !(isDownloadableResearchDocument(doc) || (manual && selectedPdf)) || protectedDoc(doc)) return false;
  if (!manual && doc.external_referral_provenance && !scopedExternal) return false;
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
      $or: [{ url: { $regex: '\\.(pdf|docx?|xlsx?|csv|txt)(\\?|#|$)', $options: 'i' } },
        { 'resource_classification.kind': 'pdf', 'resource_classification.method': 'http-mime-signature-v1' }],
      file_url: { $in: [null, ''] }, source_sha256: { $in: [null, ''] },
      external_referral_provenance: { $in: [null] },
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
    if (!sameState(source.resource_classification, doc.resource_classification)) throw new Error('Resource classification changed concurrently.');
    if (doc.external_referral_provenance) {
      const proof=doc.external_referral_provenance;
      if (!sameState(source.external_referral_provenance,proof) ||
          proof.jurisdiction_id!==current.id || proof.jurisdiction_name!==current.name ||
          proof.jurisdiction_state!==current.state || proof.jurisdiction_type!==current.type ||
          proof.seed_url!==current.permitting_url || current.discovery_scan_state?.blocked ||
          (nextState.automatic_external_collection && current.auto_refresh!==true) ||
          !current.discovery_scan_state?.external_referrals?.some(row=>row.url===doc.url && row.source_page_url===proof.source_page_url &&
            row.source_page_sha256===proof.discovered_page_sha256))
        throw new Error('External source provenance or jurisdiction identity changed concurrently.');
    }
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

export async function archiveKnownJurisdictionSource({ entity, catalogEntity, jurisdictionId, documentId = '', fetchSource, uploadFile, manual = false, knownPdf = null, externalReferralAuthorized = false, token = crypto.randomUUID(), now = () => Date.now() }) {
  if (knownPdf && (!manual || !documentId || !/^[a-f0-9]{64}$/.test(knownPdf.sha256 || '') ||
      !Number.isInteger(knownPdf.bytes) || knownPdf.bytes < 5 || knownPdf.bytes > MAX_BYTES)) {
    throw new Error('A selected manual PDF requires its retained SHA-256 and bounded byte count.');
  }
  const initial = await entity.get(jurisdictionId);
  if (!initial?.id) throw new Error('Jurisdiction not found.');
  if (!manual && initial.auto_refresh === false) return { success: true, skipped: true, reason: 'auto_refresh_disabled', jurisdiction: initial };
  if (initial._manual_documents) return { success: true, skipped: true, reason: 'manual_collection', jurisdiction: initial };
  const docs = initial.documents || [];
  const doc = docs.find(d => (!d.external_referral_provenance || externalReferralAuthorized) && (!documentId || d.id === documentId) && archiveDocumentEligible(d, { manual, selectedPdf: Boolean(knownPdf && documentId === d.id), scopedExternal:externalReferralAuthorized, now: now() }) &&
    !docs.some(other => other !== d && jurisdictionDocumentSourceKey(other) === jurisdictionDocumentSourceKey(d)));
  if (!doc) return { success: true, skipped: true, reason: 'no_eligible_file', jurisdiction: initial };
  const classifiedPdf = hasClassifiedPdfResource(doc);
  if (knownPdf || classifiedPdf) authorizedHtmlUrl(initial, doc.url);
  let state = doc.archive_state || {};
  if (state.known_pdf && (!knownPdf || state.known_pdf.sha256 !== knownPdf.sha256 || state.known_pdf.bytes !== knownPdf.bytes))
    throw new Error('Retained PDF expectation changed; reconcile the existing receipt.');
  const resumeUpload = ['uploaded', 'verification_blocked'].includes(state.status) && Boolean(state.file_url);
  const attempts = resumeUpload ? Math.max(1, Number(state.attempts) || 1) : (Number(state.attempts) || 0) + 1;
  const stamp = () => new Date(now()).toISOString();
  const claimed = { ...state, ...(doc.external_referral_provenance && !manual ? {automatic_external_collection:true} : {}), ...(knownPdf ? { known_pdf: { sha256: knownPdf.sha256, bytes: knownPdf.bytes } } : {}), status: resumeUpload ? 'uploaded' : 'downloading', claim_token: token, attempts,
    lease_expires_at: new Date(now() + ARCHIVE_LEASE_MS).toISOString(), last_attempt_at: stamp(), error: '' };
  await transition(entity, jurisdictionId, doc, state, claimed);
  state = claimed;
  let uploads = 0;
  let stage = resumeUpload ? 'verify' : 'download';
  const fetchBytes = async (url, requirePdf = false) => withResearchArchiveTimeout((async () => {
    const response = await fetchSource(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS) });
    if (requirePdf && response.url) authorizedHtmlUrl(initial, response.url);
    if (requirePdf && !/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type') || ''))
      throw new Error('Selected official resource did not return PDF content.');
    const bytes = await readBytes(response);
    return {bytes, contentType: response.headers.get('content-type') || '', finalUrl: response.url || url};
  })(), RESEARCH_FETCH_TIMEOUT_MS, 'Archive fetch/read');
  try {
    if (!resumeUpload) {
      const sourceResponse = await fetchBytes(doc.url, Boolean(knownPdf || classifiedPdf));
      const bytes = sourceResponse.bytes;
      const ext = knownPdf || classifiedPdf ? 'pdf' : new URL(doc.url).pathname.split('.').pop().toLowerCase();
      const validation = validatePermitDocumentBytes(bytes, {format: ext, contentType: sourceResponse.contentType});
      const sha = await digest(bytes);
      if (knownPdf && (bytes.length !== knownPdf.bytes || sha !== knownPdf.sha256))
        throw new Error('Official PDF changed from the retained expectation; review before upload.');
      const uploading = { ...state, status: 'uploading', source_sha256: sha, source_bytes: bytes.length, detected_format: ext, validation_method: validation.validation_method,
        source_content_type: sourceResponse.contentType, source_final_url: sourceResponse.finalUrl };
      await transition(entity, jurisdictionId, doc, state, uploading);
      state = uploading;
      stage = 'upload';
      const types = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' };
      let name = new URL(doc.url).pathname.split('/').filter(Boolean).pop() || 'official-resource.' + ext;
      try { name = decodeURIComponent(name); } catch {}
      if ((knownPdf || classifiedPdf) && !/\.pdf$/i.test(name)) name += '.pdf';
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
    const storedResponse = await fetchBytes(state.file_url);
    const stored = storedResponse.bytes;
    const storedFormat = state.detected_format || (knownPdf || classifiedPdf ? 'pdf' : new URL(doc.url).pathname.split('.').pop().toLowerCase());
    validatePermitDocumentBytes(stored, {format: storedFormat, contentType: storedResponse.contentType});
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
      // Register the oldest verified archive separately, so new downloads cannot
      // starve archives collected before catalog integration was enabled.
      const result = await archiveKnownJurisdictionSource({ ...options, catalogEntity: undefined, jurisdictionId: profile.id, manual: false });
      if (!result.skipped) {
        if (options.catalogEntity) result.catalog = await continueJurisdictionCatalogBacklog(options);
        return result;
      }
    } catch (error) {
      return { success: false, status: 'claim_conflict', error: String(error?.message || error) };
    }
  }
  return { success: true, skipped: true, reason: 'no_eligible_file', profiles_checked: candidates.length,
    catalog: options.catalogEntity ? await continueJurisdictionCatalogBacklog(options) : null };
}
