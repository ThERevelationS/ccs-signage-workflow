const PLACEHOLDER_VALUES = new Set([
  'information not found', 'not found', 'unknown', 'unavailable',
  'n/a', 'na', 'none', 'null', 'not available', 'not provided'
]);

export function isJurisdictionPlaceholder(value) {
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

function collectPlaceholderPaths(value, path = '', out = []) {
  if (typeof value === 'string') {
    if (isJurisdictionPlaceholder(value)) out.push(path || 'value');
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPlaceholderPaths(item, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectPlaceholderPaths(item, path ? `${path}.${key}` : key, out));
  }
  return out;
}

export function isUsableJurisdictionDocument(doc) {
  const title = String(doc?.title || '').trim();
  const url = String(doc?.url || doc?.file_url || '').trim();
  return !!title && title.toLowerCase() !== 'untitled' && !isJurisdictionPlaceholder(title) && !!url && !isJurisdictionPlaceholder(url);
}

export function assessJurisdictionTrust(jurisdiction, duplicateCount = 1) {
  const documents = jurisdiction?.documents || [];
  const usableDocuments = documents.filter(isUsableJurisdictionDocument);
  const badDocuments = documents.filter((doc) => !isUsableJurisdictionDocument(doc));
  const placeholderPaths = collectPlaceholderPaths({
    website_url: jurisdiction?.website_url,
    permitting_url: jurisdiction?.permitting_url,
    contact_info: jurisdiction?.contact_info,
    permit_requirements: jurisdiction?.permit_requirements,
    parent_county: jurisdiction?.parent_county,
  });
  const manualProtectionCount = [
    jurisdiction?._manual_website_url,
    jurisdiction?._manual_permitting_url,
    jurisdiction?._manual_requirements,
    jurisdiction?._manual_documents,
  ].filter(Boolean).length;

  const issues = [];
  if (duplicateCount > 1) issues.push(`${duplicateCount} profiles share this jurisdiction identity`);
  if (placeholderPaths.length) issues.push(`${placeholderPaths.length} placeholder value${placeholderPaths.length === 1 ? '' : 's'} need review`);
  if (badDocuments.length) issues.push(`${badDocuments.length} unusable AI document${badDocuments.length === 1 ? '' : 's'} (blank URL/title)`);
  if (!jurisdiction?.permitting_url || isJurisdictionPlaceholder(jurisdiction?.permitting_url)) issues.push('No usable permitting page is stored');
  if (!usableDocuments.length) issues.push('No usable source document is stored');

  let key = 'ai_researched';
  if (duplicateCount > 1) key = 'blocked';
  else if (placeholderPaths.length || badDocuments.length || !jurisdiction?.permitting_url) key = 'needs_review';
  else if (manualProtectionCount > 0) key = 'manual_protected';

  const meta = {
    blocked: {
      label: 'Duplicate — blocked',
      className: 'border-red-300 bg-red-50 text-red-700',
      description: 'Resolve duplicate profiles before relying on or applying this record.',
    },
    needs_review: {
      label: 'Needs verification',
      className: 'border-amber-300 bg-amber-50 text-amber-800',
      description: 'Some repository data is incomplete or low quality. Verify against official sources before use.',
    },
    manual_protected: {
      label: 'Manual data protected',
      className: 'border-blue-300 bg-blue-50 text-blue-700',
      description: 'At least one field is protected from AI overwrite. Protection does not by itself mean the data is verified.',
    },
    ai_researched: {
      label: 'AI researched — verify',
      className: 'border-purple-300 bg-purple-50 text-purple-700',
      description: 'Research appears structurally complete, but staff should verify important requirements against official sources.',
    },
  }[key];

  return {
    key,
    ...meta,
    issues,
    placeholderPaths,
    usableDocuments,
    badDocuments,
    manualProtectionCount,
  };
}
