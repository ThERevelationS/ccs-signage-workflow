const RESEARCH_FIELDS = [
  'website_url',
  'permitting_url',
  'cagis_database_url',
  'ai_summary',
  'contact_info',
  'permit_requirements',
  'documents',
  'parent_county',
  'sqft_width_height_rules',
  'height_allowances',
  'setback_rules',
  'lighting_allowances',
];

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.keys(value).sort().reduce((out: Record<string, any>, key) => {
    out[key] = canonical(value[key]);
    return out;
  }, {});
}

function sameValue(a: any, b: any) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function jurisdictionResearchMateriallyChanged(jurisdiction: any, nextFields: Record<string, any> = {}) {
  return RESEARCH_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(nextFields, field) &&
    !sameValue(jurisdiction?.[field], nextFields[field])
  );
}

export function invalidateVerifiedJurisdictionAfterResearch(jurisdiction: any, nextFields: Record<string, any> = {}) {
  if (
    jurisdiction?.verification_status === 'verified' &&
    jurisdictionResearchMateriallyChanged(jurisdiction, nextFields)
  ) {
    return {
      ...nextFields,
      verification_status: 'needs_verification',
    };
  }
  return nextFields;
}
