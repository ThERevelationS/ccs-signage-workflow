// Preserve source documents and their archived files across nondeterministic AI research.
// A missing result from a research run is never authority to delete a downloaded form.
export function jurisdictionDocumentSourceKey(document) {
  const source = String(document?.url || '').trim();
  if (!source) return '';
  try {
    const parsed = new URL(source);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return source;
  }
}

export function findExistingJurisdictionDocument(documents, document) {
  const key = jurisdictionDocumentSourceKey(document);
  if (!key) return null;
  return (documents || []).find(item => jurisdictionDocumentSourceKey(item) === key) || null;
}

export function mergeJurisdictionResearchDocuments(existingDocuments, researchedDocuments) {
  const retained = Array.isArray(existingDocuments) ? existingDocuments.filter(Boolean).map(doc => ({ ...doc })) : [];
  const sourceIndexes = new Map();
  retained.forEach((doc, index) => {
    const key = jurisdictionDocumentSourceKey(doc);
    if (key && !sourceIndexes.has(key)) sourceIndexes.set(key, index);
  });

  for (const researched of Array.isArray(researchedDocuments) ? researchedDocuments : []) {
    if (!researched || typeof researched !== 'object') continue;
    const key = jurisdictionDocumentSourceKey(researched);
    // An unlinked research suggestion is not a retrievable source document.
    // Keep existing unlinked records, but never accumulate new unverified ones.
    if (!key) continue;
    const index = sourceIndexes.get(key);
    if (index === undefined) {
      if (key) sourceIndexes.set(key, retained.length);
      retained.push({ ...researched });
      continue;
    }

    const existing = retained[index];
    // A separately maintained manual record must never be replaced by AI output.
    if (existing.source === 'manual' || existing.pinned === true || existing.archive_pinned === true) continue;

    const archived = Boolean(existing.file_url || existing.source_sha256);
    retained[index] = {
      ...existing,
      title: researched.title || existing.title,
      doc_type: researched.doc_type || existing.doc_type,
      ai_summary: researched.ai_summary || existing.ai_summary,
      id: existing.id || researched.id,
      url: existing.url || researched.url,
      source: existing.source || researched.source,
      ...((existing.resource_classification || researched.resource_classification) ?
        { resource_classification: existing.resource_classification || researched.resource_classification } : {}),
      // A newly discovered version cannot silently replace an archived PDF.
      file_url: existing.file_url || researched.file_url,
      extracted_text: archived
        ? (existing.extracted_text || researched.extracted_text)
        : (researched.extracted_text || existing.extracted_text),
      last_fetched: archived
        ? (existing.last_fetched || researched.last_fetched)
        : (researched.last_fetched || existing.last_fetched),
      source_sha256: existing.source_sha256 || researched.source_sha256,
      source_bytes: existing.source_bytes || researched.source_bytes,
      stored_sha256: existing.stored_sha256 || researched.stored_sha256,
      stored_bytes: existing.stored_bytes || researched.stored_bytes,
      downloaded_at: existing.downloaded_at || researched.downloaded_at,
    };
  }

  return retained;
}
