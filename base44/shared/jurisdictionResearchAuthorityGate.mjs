const VERIFIED = "verified";

const norm = (value) => String(value ?? "").trim().toLowerCase();

const REGULATORY_FIELDS = Object.freeze([
  "permit_requirements",
  "sqft_width_height_rules",
  "height_allowances",
  "setback_rules",
  "lighting_allowances",
]);

const REWRITE_SOURCE_PATTERNS = Object.freeze([
  /\b(?:draft|proposed)\b.{0,80}\b(?:zoning|sign|code|ordinance|regulation)/i,
  /\b(?:zoning|sign|code|ordinance|regulation)\b.{0,80}\b(?:draft|proposed)\b/i,
  /\bcomprehensive\b.{0,60}\b(?:rewrite|replacement|update|revision)\b/i,
  /\b(?:rewrite|replacement)\b.{0,60}\b(?:zoning|sign|code|ordinance|regulation)/i,
  /\b(?:zoning|sign|code|ordinance|regulation)\b.{0,60}\b(?:rewrite|replacement)\b/i,
]);

function sameJurisdiction(jurisdiction, authority) {
  const jurisdictionId = norm(jurisdiction?.id);
  const authorityId = norm(authority?.jurisdiction_id || authority?.jurisdictionId || authority?.id);
  if (authorityId) return !!jurisdictionId && jurisdictionId === authorityId;

  const jurisdictionName = norm(jurisdiction?.name);
  const authorityName = norm(authority?.jurisdiction_name || authority?.jurisdictionName || authority?.jurisdiction);
  return !!jurisdictionName && !!authorityName && jurisdictionName === authorityName;
}

function sourceStrings(data = {}) {
  const values = [];
  const add = (value) => {
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  };
  const addSource = (source) => {
    if (!source || typeof source !== "object") return;
    for (const key of ["title", "name", "label", "url", "source_url", "description", "notes"]) add(source[key]);
  };

  for (const key of ["source_url", "sourceUrl", "official_source_url", "notes", "summary"]) add(data?.[key]);
  for (const collection of [data?.documents, data?.sources, data?.source_documents, data?.official_sources]) {
    if (Array.isArray(collection)) collection.forEach(addSource);
  }
  return values;
}

export function classifyRewriteSourceAuthority(data = {}) {
  const matchedSignals = [];
  for (const value of sourceStrings(data)) {
    if (REWRITE_SOURCE_PATTERNS.some((pattern) => pattern.test(value))) matchedSignals.push(value);
  }
  return {
    isComprehensiveRewrite: matchedSignals.length > 0,
    matchedSignals: [...new Set(matchedSignals)],
  };
}

export function isComprehensiveRewriteResearch(data = {}) {
  const candidate = data?.authority_candidate;
  const modelFlagged = candidate?.is_comprehensive_rewrite === true ||
    norm(candidate?.kind) === "comprehensive_rewrite" ||
    norm(candidate?.kind) === "zoning_rewrite";
  return modelFlagged || classifyRewriteSourceAuthority(data).isComprehensiveRewrite;
}

export function assessStoredRewriteAuthority(jurisdiction = {}) {
  const authority = jurisdiction?.rewrite_authority;
  const reasons = [];
  if (!authority) reasons.push("missing_authority_evidence");
  else {
    if (!sameJurisdiction(jurisdiction, authority)) reasons.push("jurisdiction_mismatch");
    if (norm(authority.adoptionStatus) !== VERIFIED) reasons.push("adoption_not_verified");
    if (norm(authority.effectiveDateStatus) !== VERIFIED) reasons.push("effective_date_not_verified");
  }
  return { promotable: reasons.length === 0, reasons };
}

export function gateResearchRegulatoryPromotion({ jurisdiction, researchData, updateData } = {}) {
  const next = { ...(updateData || {}) };
  if (!isComprehensiveRewriteResearch(researchData)) {
    return { updateData: next, blocked: false, reasons: [] };
  }

  const assessment = assessStoredRewriteAuthority(jurisdiction);
  if (assessment.promotable) {
    return { updateData: next, blocked: false, reasons: [] };
  }

  for (const field of REGULATORY_FIELDS) delete next[field];
  return {
    updateData: next,
    blocked: true,
    reasons: assessment.reasons,
  };
}
