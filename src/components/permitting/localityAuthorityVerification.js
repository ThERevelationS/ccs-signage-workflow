export const LOCALITY_AUTHORITY_ROLES = [
  ["sign_permit", "Sign permit"],
  ["zoning", "Zoning"],
  ["building", "Building"],
  ["electrical", "Electrical (legacy broad role)"],
  ["electrical_permit", "Electrical permit issuer"],
  ["electrical_inspection", "Electrical inspection provider"],
  ["right_of_way", "ROW / Public Works"],
  ["historic_review", "Historic review"],
  ["planning", "Planning"],
  ["transportation", "Transportation"],
  ["other", "Other"],
];

/** Show locality-specific authority separately from a reusable office reference. */
export function summarizeLocalityOfficeAuthority(office) {
  const roleNames = new Map(LOCALITY_AUTHORITY_ROLES);
  const roles = Array.isArray(office?.authority_roles)
    ? [...new Set(office.authority_roles.filter(Boolean))]
    : [];
  const supported = roles.length > 0 && roles.every(role => roleNames.has(role));
  const verified = supported && office?.authority_verification_status === "staff_verified";
  const relationship = office?.government_office_id
    ? "Canonical office ID recorded"
    : office?.catalog_office_id
      ? "Office catalog reference recorded"
      : "Standalone office";
  const roleLabels = roles.map(role => roleNames.get(role) || role);
  const authority = verified
    ? "Locality authority staff verified"
    : !supported && roles.length > 0
      ? "Authority roles need review"
      : roles.length > 0
        ? "Locality roles not verified"
        : "Locality authority not established";
  return { relationship, authority, roleLabels, verified };
}

export function setLocalityOfficeAuthorityRole(office, role, enabled) {
  const current = Array.isArray(office?.authority_roles) ? office.authority_roles : [];
  const supportedRoles = new Set(LOCALITY_AUTHORITY_ROLES.map(([value]) => value));
  if (!supportedRoles.has(role)) {
    if (enabled || !current.includes(role)) {
      throw new Error(`Unsupported authority role: ${role}. Existing legacy roles were preserved for staff review.`);
    }
    return {
      ...office,
      authority_roles: current.filter(item => item !== role),
      authority_verification_status: "needs_verification",
      authority_verified_at: undefined,
      authority_verified_by: undefined,
    };
  }
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

/** A material locality office identity/contact edit needs renewed authority review.
 * Preserve the canonical office link, selected roles and source/review notes.
 */
export function updateLocalityOfficeIdentity(office, patch) {
  const next = { ...office, ...patch };
  const reviewedFields = ["catalog_office_id", "government_office_id", "name", "contact_phone", "contact_email", "contact_website", "contact_address"];
  const changed = reviewedFields.some(field =>
    Object.hasOwn(patch || {}, field) &&
    String(office?.[field] || "").trim() !== String(next[field] || "").trim()
  );
  return changed && office?.authority_verification_status === "staff_verified"
    ? revokeLocalityOfficeAuthorityVerification(next)
    : next;
}

export function verifyLocalityOfficeAuthority(office, actor, verifiedAt = new Date().toISOString()) {
  const roles = Array.isArray(office?.authority_roles) ? [...new Set(office.authority_roles.filter(Boolean))] : [];
  if (roles.length === 0) throw new Error("Choose at least one authority role before verifying this office.");
  const supportedRoles = new Set(LOCALITY_AUTHORITY_ROLES.map(([value]) => value));
  const unsupported = roles.filter(role => !supportedRoles.has(role));
  if (unsupported.length > 0) throw new Error(`Unsupported authority role${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}. Review the office before verification.`);
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
