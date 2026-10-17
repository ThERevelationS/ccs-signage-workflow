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
  const citationHash = typeof citation.source_sha256 === 'string' ? citation.source_sha256.trim() : '';
  const expectedHash = citationHash || snapshot?.file_hash_sha256 || '';
  const expectedArchive = typeof citation.archived_file_url === 'string' && citation.archived_file_url.trim()
    ? citation.archived_file_url : snapshot?.archived_file_url || '';
  const basis = citationHash ? 'saved citation' : snapshot ? 'source metadata captured with this draft' : 'saved citation';
  const changes = [];
  if (expectedHash && (!hash(expectedHash) || !hash(loaded.file_hash_sha256))) changes.push('Archive fingerprint is missing or invalid.');
  else if (expectedHash && hash(expectedHash) !== hash(loaded.file_hash_sha256)) changes.push('Archive fingerprint differs.');
  if (expectedArchive && expectedArchive !== loaded.archived_file_url) changes.push('Recorded archive URL differs.');
  const state = changes.length ? 'different' : hash(expectedHash) && hash(expectedHash) === hash(loaded.file_hash_sha256) ? 'matching' : 'unknown';
  return { state, basis, changes, captured: snapshot };
}

