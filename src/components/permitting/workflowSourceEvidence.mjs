// Metadata only: no source refresh, title matching, authority decisions or writes.
export const WORKFLOW_SOURCE_FIELDS = [
  'id', 'jurisdiction_id', 'title', 'source_type', 'official_url', 'online_form_url',
  'archived_file_url', 'file_hash_sha256', 'file_bytes', 'retrieval_timestamp',
  'document_revision_date', 'effective_or_adopted_date', 'authority_classification',
  'content_status', 'verification_status', 'reviewer', 'issuing_office', 'jurisdiction_scope',
  'notes_gaps', 'supersedes', 'superseded_by', 'last_checked', 'last_changed', 'text_extraction_state',
];
export const citationSourceId = citation => typeof citation?.source_document_id === 'string' ? citation.source_document_id.trim() : '';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : '';
export function captureWorkflowSources(steps, sources, jurisdictionId) {
  const ids = new Set((steps || []).flatMap(step => Array.isArray(step.citations) ? step.citations.map(citationSourceId) : []));
  const captured = {};
  if (!jurisdictionId) return captured;
  for (const source of sources || []) {
    if (!source.id || !ids.has(source.id) || source.jurisdiction_id !== jurisdictionId) continue;
    // Ambiguous IDs are not converted into a version claim.
    if (Object.hasOwn(captured, source.id)) { captured[source.id] = null; continue; }
    captured[source.id] = Object.fromEntries(WORKFLOW_SOURCE_FIELDS.filter(key => key !== 'text_extraction_state' && Object.hasOwn(source, key)).map(key => [key, structuredClone(source[key])]));
  }
  return Object.fromEntries(Object.entries(captured).filter(([, value]) => value !== null));
}
export function matchWorkflowSource(citation, captured, loaded, jurisdictionId) {
  const id = citationSourceId(citation);
  if (!id || !jurisdictionId || loaded?.id !== id || loaded.jurisdiction_id !== jurisdictionId) throw new Error('Exact source or jurisdiction did not match.');
  const snapshot = captured?.id === id && captured.jurisdiction_id === jurisdictionId ? captured : null;
  const comparisons = [];
  const citationHash = typeof citation.source_sha256 === 'string' ? citation.source_sha256.trim() : '';
  const citationArchive = typeof citation.archived_file_url === 'string' ? citation.archived_file_url.trim() : '';
  if (citationHash || citationArchive) comparisons.push({ basis: 'saved citation', fingerprint: citationHash, archive: citationArchive });
  if (snapshot) comparisons.push({ basis: 'source metadata captured with this draft', fingerprint: snapshot.file_hash_sha256 || '', archive: snapshot.archived_file_url || '' });
  const changes = [];
  let matchingFingerprint = false;
  for (const expected of comparisons) {
    if (expected.fingerprint && (!hash(expected.fingerprint) || !hash(loaded.file_hash_sha256))) changes.push(expected.basis + ': archive fingerprint is missing or invalid.');
    else if (expected.fingerprint && hash(expected.fingerprint) !== hash(loaded.file_hash_sha256)) changes.push(expected.basis + ': archive fingerprint differs.');
    else if (hash(expected.fingerprint)) matchingFingerprint = true;
    if (expected.archive && expected.archive !== loaded.archived_file_url) changes.push(expected.basis + ': recorded archive URL differs.');
  }
  const metadataFields = ['content_status', 'authority_classification', 'verification_status', 'reviewer', 'document_revision_date', 'effective_or_adopted_date', 'issuing_office', 'jurisdiction_scope', 'supersedes', 'superseded_by'];
  const metadataChanges = snapshot ? metadataFields.filter(key => Object.hasOwn(snapshot, key) && snapshot[key] !== loaded[key]).map(key => ({ field: key, before: snapshot[key], after: loaded[key] })) : [];
  const state = changes.length ? 'different' : matchingFingerprint ? 'matching' : 'unknown';
  const basis = comparisons.length ? comparisons.map(item => item.basis).join(' and ') : 'saved citation';
  return { state, basis, changes, metadataChanges, captured: snapshot };
}
