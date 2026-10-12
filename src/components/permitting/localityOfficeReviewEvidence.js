import { summarizeLocalityOfficeAuthority } from "./localityAuthorityVerification.js";

const clean = value => typeof value === "string" ? value.trim() : "";
export function safeOfficeEvidenceUrl(value) {
  try {
    const url = new URL(clean(value));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

/** Read-only evidence: shared identity never establishes locality responsibility. */
export function localityOfficeReviewEvidence(office, provenance) {
  const summary = summarizeLocalityOfficeAuthority(office);
  const roles = Array.isArray(office?.authority_roles) ? office.authority_roles : [];
  return {
    electrical: [
      ["electrical_permit", "Electrical permit issuer"],
      ["electrical_inspection", "Electrical inspection provider"],
    ].map(([role, label]) => ({
      role, label,
      status: !roles.includes(role) ? "Not assigned" : summary.verified ? "Staff verified" : "Needs review",
    })),
    notes: clean(office?.authority_verification_notes),
    reviewer: summary.verified ? clean(office?.authority_verified_by) : "",
    reviewedAt: summary.verified ? clean(office?.authority_verified_at) : "",
    sharedSource: safeOfficeEvidenceUrl(provenance?.metadata?.source_url),
    sharedNotes: clean(provenance?.metadata?.verification_notes),
    website: safeOfficeEvidenceUrl(office?.contact_website),
  };
}
