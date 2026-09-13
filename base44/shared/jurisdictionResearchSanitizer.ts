const PLACEHOLDER_VALUES = new Set([
  'information not found', 'not found', 'unknown', 'unavailable',
  'n/a', 'na', 'none', 'null', 'not available', 'not provided'
]);

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function cleanObject(value: any): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, any> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || raw == null) out[key] = cleanString(raw);
    else if (Array.isArray(raw)) out[key] = raw.map((item) => typeof item === 'object' ? cleanObject(item) : item);
    else if (typeof raw === 'object') out[key] = cleanObject(raw);
    else out[key] = raw;
  }
  return out;
}

function cleanDocument(doc: any) {
  const cleaned = cleanObject(doc || {});
  const title = cleanString(cleaned?.title);
  const url = cleanString(cleaned?.url);
  if (!title || title.toLowerCase() === 'untitled' || !url) return null;
  return { ...cleaned, title, url };
}

export function sanitizeJurisdictionResearch(input: any = {}) {
  const data = cleanObject(input || {});
  const documents = (Array.isArray(data.documents) ? data.documents : []).map(cleanDocument).filter(Boolean);
  let parentCounty = data.parent_county && typeof data.parent_county === 'object' ? cleanObject(data.parent_county) : null;
  if (parentCounty) {
    parentCounty.documents = (Array.isArray(parentCounty.documents) ? parentCounty.documents : []).map(cleanDocument).filter(Boolean);
    if (!cleanString(parentCounty.name)) parentCounty = null;
  }
  return {
    ...data,
    website_url: cleanString(data.website_url),
    permitting_url: cleanString(data.permitting_url),
    cagis_database_url: cleanString(data.cagis_database_url),
    ai_summary: cleanString(data.ai_summary),
    sqft_width_height_rules: cleanString(data.sqft_width_height_rules),
    height_allowances: cleanString(data.height_allowances),
    setback_rules: cleanString(data.setback_rules),
    lighting_allowances: cleanString(data.lighting_allowances),
    contact_info: cleanObject(data.contact_info || {}),
    permit_requirements: cleanObject(data.permit_requirements || {}),
    documents,
    parent_county: parentCounty,
  };
}
