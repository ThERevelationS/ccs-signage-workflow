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

  const explicitStatus = String(jurisdiction?.verification_status || '').trim();
  const verificationBlocked = duplicateCount > 1 || placeholderPaths.length > 0 || badDocuments.length > 0 || (!jurisdiction?.permitting_url && !usableDocuments.length);

  let key = 'ai_researched';
  if (duplicateCount > 1) key = 'blocked';
  else if (explicitStatus === 'historical') key = 'historical';
  else if (explicitStatus === 'verified' && !verificationBlocked) key = 'verified';
  else if (explicitStatus === 'needs_verification') key = 'needs_review';
  else if (placeholderPaths.length || badDocuments.length || !jurisdiction?.permitting_url) key = 'needs_review';
  else if (manualProtectionCount > 0) key = 'manual_protected';

  const meta = {
    blocked: {
      label: 'Duplicate — blocked',
      className: 'border-red-300 bg-red-50 text-red-700',
      description: 'Two records share this name — someone needs to fix them before this one is used.',
    },
    needs_review: {
      label: 'Needs verification',
      className: 'border-amber-300 bg-amber-50 text-amber-800',
      description: 'Some info here is missing or unchecked — confirm it on the office\'s real website before using it.',
    },
    verified: {
      label: 'Verified by staff',
      className: 'border-green-300 bg-green-50 text-green-800',
      description: 'A teammate checked this against the office\'s real website. Check again if the office changed things.',
    },
    historical: {
      label: 'Historical reference',
      className: 'border-slate-300 bg-slate-100 text-slate-700',
      description: 'Old info — fine for looking back at past jobs, but check what\'s current before filing a new permit.',
    },
    manual_protected: {
      label: 'Manual data protected',
      className: 'border-blue-300 bg-blue-50 text-blue-700',
      description: 'Someone locked some fields so the AI can\'t change them — locked doesn\'t mean checked.',
    },
    ai_researched: {
      label: 'AI researched — verify',
      className: 'border-purple-300 bg-purple-50 text-purple-700',
      description: 'The AI filled this in — someone should still check it against the office\'s real website.',
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
    explicitStatus,
    verificationBlocked,
  };
}
