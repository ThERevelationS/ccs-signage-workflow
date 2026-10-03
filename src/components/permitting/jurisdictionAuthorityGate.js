const VERIFIED = "verified";

const norm = (value) => String(value ?? "").trim().toLowerCase();

export const REWRITE_AUTHORITY_BLOCK_REASONS = Object.freeze({
  MISSING_JURISDICTION: "missing_jurisdiction",
  ADOPTION_NOT_VERIFIED: "adoption_not_verified",
  EFFECTIVE_DATE_NOT_VERIFIED: "effective_date_not_verified",
  JURISDICTION_MISMATCH: "jurisdiction_mismatch",
});

function sameJurisdiction(candidate, authority) {
  const candidateId = norm(candidate?.jurisdiction_id || candidate?.jurisdictionId);
  const authorityId = norm(authority?.jurisdiction_id || authority?.jurisdictionId || authority?.id);
  if (candidateId || authorityId) return !!candidateId && !!authorityId && candidateId === authorityId;

  const candidateName = norm(candidate?.jurisdiction_name || candidate?.jurisdictionName || candidate?.jurisdiction);
  const authorityName = norm(authority?.jurisdiction_name || authority?.jurisdictionName || authority?.jurisdiction);
  return !!candidateName && !!authorityName && candidateName === authorityName;
}

export function assessRewriteAuthorityPromotion({ candidate, authority } = {}) {
  const reasons = [];
  if (!candidate || !authority) {
    reasons.push(REWRITE_AUTHORITY_BLOCK_REASONS.MISSING_JURISDICTION);
  } else {
    if (!sameJurisdiction(candidate, authority)) reasons.push(REWRITE_AUTHORITY_BLOCK_REASONS.JURISDICTION_MISMATCH);
    if (norm(authority.adoptionStatus) !== VERIFIED) reasons.push(REWRITE_AUTHORITY_BLOCK_REASONS.ADOPTION_NOT_VERIFIED);
    if (norm(authority.effectiveDateStatus) !== VERIFIED) reasons.push(REWRITE_AUTHORITY_BLOCK_REASONS.EFFECTIVE_DATE_NOT_VERIFIED);
  }
  return {
    promotable: reasons.length === 0,
    reasons,
    authorityMode: reasons.length === 0 ? "verified_rewrite" : "retain_current_adopted_authority",
  };
}

export function assertRewriteAuthorityPromotable(input) {
  const assessment = assessRewriteAuthorityPromotion(input);
  if (!assessment.promotable) {
    throw new Error(
      "Rewrite authority promotion blocked: " + assessment.reasons.join(", ") + ". " +
      "Retain the currently adopted jurisdiction-specific authority until adoption and effective-date evidence are verified for this jurisdiction."
    );
  }
  return assessment;
}
