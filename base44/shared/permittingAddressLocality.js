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

/** Match a configured locality only when name, state and government-place kind agree.
 * This allows "Deerfield Township" -> "Deerfield" while preventing a city/postal
 * locality named Deerfield from being treated as the township's permitting authority.
 */
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
  };
  const offices = Array.isArray(locality.offices) ? locality.offices : [];
  const verified = offices.filter(office =>
    office?.authority_verification_status === 'staff_verified' &&
    Array.isArray(office.authority_roles) && office.authority_roles.length > 0 &&
    office.authority_roles.every(role => AUTHORITY_ROLES.has(role))
  );
  return {
    status: verified.length > 0 ? 'staff_verified_roles' : 'no_staff_verified_roles',
    verified_roles: [...new Set(verified.flatMap(office => office.authority_roles))],
    verified_office_count: verified.length,
    other_office_count: offices.length - verified.length,
  };
}

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
