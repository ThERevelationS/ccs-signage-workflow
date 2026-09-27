import { normalizeAddressState } from './permittingAddressState.js';

function cleanPlace(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function placeIdentity(value) {
  const text = cleanPlace(value);
  const township = /\btownship\b/.test(text);
  const kind = township ? 'township' : 'municipality';
  const name = text
    .replace(/^(city|village|town|borough|municipality) of\s+/, '')
    .replace(/\s+township$/, '')
    .trim();
  return { name, kind };
}

// Mirrors the explicit locality-office authority roles, never descriptive office types.
const AUTHORITY_ROLES = new Set([
  'sign_permit', 'zoning', 'building', 'electrical', 'right_of_way',
  'historic_review', 'planning', 'transportation', 'other',
]);

/** Geography and staff-reviewed permitting authority are independent facts.
 * Only complete, recognized, staff-verified role relationships are reported.
 */
export function summarizeMatchedLocalityAuthority(locality) {
  if (!locality?.id) return {
    status: 'unresolved', verified_roles: [], verified_office_count: 0, other_office_count: 0,
    coverage_status: 'unresolved', roles_needing_review: [],
  };
  const offices = Array.isArray(locality.offices) ? locality.offices : [];
  const verified = offices.filter(office =>
    office?.authority_verification_status === 'staff_verified' &&
    Array.isArray(office.authority_roles) && office.authority_roles.length > 0 &&
    office.authority_roles.every(role => AUTHORITY_ROLES.has(role))
  );
  const needsReview = offices.filter(office => !verified.includes(office));
  const rolesNeedingReview = needsReview.flatMap(office =>
    Array.isArray(office?.authority_roles)
      ? office.authority_roles.filter(role => AUTHORITY_ROLES.has(role))
      : []
  );
  return {
    status: verified.length > 0 ? 'staff_verified_roles' : 'no_staff_verified_roles',
    verified_roles: [...new Set(verified.flatMap(office => office.authority_roles))],
    verified_office_count: verified.length,
    other_office_count: needsReview.length,
    // This describes only configured office review, never complete legal coverage.
    coverage_status: offices.length === 0 ? 'not_configured'
      : verified.length === 0 ? 'not_verified'
        : needsReview.length > 0 ? 'partial' : 'configured_offices_reviewed',
    roles_needing_review: [...new Set(rolesNeedingReview)],
  };
}

/** Recompute configured-office authority directly from the locality links already saved
 * on permit lines. Missing or duplicate references fail closed; no stale review
 * snapshot is written to Work Orders or permit line notes.
 */
export function summarizePermitGroupAuthorityCoverage(lines, localities) {
  const byLocality = new Map();
  const configured = Array.isArray(localities) ? localities : [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const id = String(line?.locality_id || '').trim();
    if (byLocality.has(id)) continue;
    const matches = id ? configured.filter(row => String(row?.id || '').trim() === id) : [];
    const locality = matches.length === 1 ? matches[0] : null;
    byLocality.set(id, {
      locality_id: id,
      locality_name: locality?.name || line?.locality_name || (id ? 'Unknown locality' : 'Unlinked permit line'),
      authority: summarizeMatchedLocalityAuthority(locality),
    });
  }
  return [...byLocality.values()];
}

/** Match a configured locality only when name, state and government-place kind agree.
 * This allows "Deerfield Township" -> "Deerfield" while preventing a city/postal
 * locality named Deerfield from being treated as the township's permitting authority.
 */
export function addressLocalityIdentityMatches(locality, candidate) {
  if (!locality?.id || !candidate?.name) return false;
  const stored = placeIdentity(locality.name);
  const incoming = placeIdentity(candidate.name);
  if (!stored.name || stored.name !== incoming.name) return false;

  const targetState = normalizeAddressState(candidate.state);
  if (targetState && locality.state && normalizeAddressState(locality.state) !== targetState) return false;

  const sourceKind = cleanPlace(candidate.source_kind);
  if (sourceKind === 'township') return incoming.kind === 'township' && stored.kind === 'township';
  if (sourceKind === 'municipality') return stored.kind !== 'township' && incoming.kind !== 'township';
  return stored.kind === incoming.kind;
}
