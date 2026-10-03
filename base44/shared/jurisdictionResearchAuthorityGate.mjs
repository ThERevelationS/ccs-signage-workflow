const VERIFIED = "verified";

const norm = (value) => String(value ?? "").trim().toLowerCase();

const REGULATORY_FIELDS = Object.freeze([
  "permit_requirements",
  "sqft_width_height_rules",
  "height_allowances",
  "setback_rules",
  "lighting_allowances",
]);

function sameJurisdiction(jurisdiction, authority) {
  const jurisdictionId = norm(jurisdiction?.id);
  const authorityId = norm(authority?.jurisdiction_id || authority?.jurisdictionId || authority?.id);
  if (authorityId) return !!jurisdictionId && jurisdictionId === authorityId;

  const jurisdictionName = norm(jurisdiction?.name);
  const authorityName = norm(authority?.jurisdiction_name || authority?.jurisdictionName || authority?.jurisdiction);
  return !!jurisdictionName && !!authorityName && jurisdictionName === authorityName;
}

export function isComprehensiveRewriteResearch(data = {}) {
  const candidate = data?.authority_candidate;
  return candidate?.is_comprehensive_rewrite === true ||
    norm(candidate?.kind) === "comprehensive_rewrite" ||
    norm(candidate?.kind) === "zoning_rewrite";
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
