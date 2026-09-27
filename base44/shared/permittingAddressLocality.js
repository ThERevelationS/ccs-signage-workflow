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
