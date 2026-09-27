export const LOCALITY_AUTHORITY_ROLES = [
  ["sign_permit", "Sign permit"],
  ["zoning", "Zoning"],
  ["building", "Building"],
  ["electrical", "Electrical"],
  ["right_of_way", "ROW / Public Works"],
  ["historic_review", "Historic review"],
  ["planning", "Planning"],
  ["transportation", "Transportation"],
  ["other", "Other"],
];

export function setLocalityOfficeAuthorityRole(office, role, enabled) {
  const current = Array.isArray(office?.authority_roles) ? office.authority_roles : [];
  const nextRoles = enabled
    ? [...new Set([...current, role])]
    : current.filter((item) => item !== role);
  return {
    ...office,
    authority_roles: nextRoles,
    authority_verification_status: "needs_verification",
    authority_verified_at: undefined,
    authority_verified_by: undefined,
  };
}

export function verifyLocalityOfficeAuthority(office, actor, verifiedAt = new Date().toISOString()) {
  const roles = Array.isArray(office?.authority_roles) ? office.authority_roles.filter(Boolean) : [];
  if (roles.length === 0) throw new Error("Choose at least one authority role before verifying this office.");
  return {
    ...office,
    authority_roles: roles,
    authority_verification_status: "staff_verified",
    authority_verified_at: verifiedAt,
    authority_verified_by: String(actor || "").trim() || "CCS Staff",
  };
}

export function revokeLocalityOfficeAuthorityVerification(office) {
  return {
    ...office,
    authority_verification_status: "needs_verification",
    authority_verified_at: undefined,
    authority_verified_by: undefined,
  };
}
