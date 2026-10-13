import { LOCALITY_AUTHORITY_ROLES } from './localityAuthorityVerification.js';

const supportedRoles = new Set(LOCALITY_AUTHORITY_ROLES.map(([role]) => role));
const specificElectrical = new Set(['electrical_permit','electrical_inspection']);
const clean = value => typeof value === 'string' ? value.trim() : '';
const validDateTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(clean(value))
  && !Number.isNaN(Date.parse(value));

/** Recorded office relationship/provenance audit, not a legal authority decision.
 * Shares the exact-ID-only profile-link assessment; no namesake fallback or source approval.
 */
export function reconcileSavedOfficeEvidence(localities, savedLinks) {
  if (!Array.isArray(localities) || !savedLinks?.states || !Array.isArray(savedLinks.reviews))
    throw Error('Invalid saved office evidence input');
  const flaggedLinks = new Map(savedLinks.reviews.map(item => [item.id, item.flags]));
  const counters = () => ({
    locality_count:0, office_count:0, recorded_staff_verified_offices:0,
    office_identity_review:0, profile_link_review:0, canonical_office_identity_missing:0,
    verification_provenance_review:0, authority_roles_review:0, canonical_electrical_role_copy_review:0,
    electrical_issuer_assignments:0, electrical_inspection_assignments:0
  });
  const states = { OH:counters(), KY:counters() }, reviews = [];
  const localityIds = new Set();
  for (const locality of localities) {
    if (typeof locality?.id !== 'string' || !locality.id.trim() || locality.id.trim() !== locality.id || localityIds.has(locality.id))
      throw Error('Saved office evidence has invalid or duplicate locality ID');
    localityIds.add(locality.id);
    const state = clean(locality.state).toUpperCase();
    if (!states[state]) continue;
    const tally = states[state]; tally.locality_count++;
    // An undefined office collection is legacy/unconfigured, not evidence that no office is required.
    if (locality.offices !== undefined && !Array.isArray(locality.offices))
      throw Error('Saved office collection is malformed');
    const offices = locality.offices || [];
    const countsById = new Map();
    for (const office of offices) {
      const id = clean(office?.id);
      if (id) countsById.set(id, (countsById.get(id) || 0) + 1);
    }
    // Compare exact canonical IDs only within one locality and one distinct electrical role.
    // A shared provider across different roles or localities is not a duplicate-copy finding.
    const canonicalRoleCopies = new Map();
    for (const [index,office] of offices.entries()) {
      const canonical = office?.government_office_id;
      if (typeof canonical !== 'string' || !canonical.trim() || canonical !== canonical.trim()) continue;
      for (const role of specificElectrical) if (Array.isArray(office?.authority_roles) && office.authority_roles.includes(role)) {
        const key = JSON.stringify([canonical,role]);
        if (!canonicalRoleCopies.has(key)) canonicalRoleCopies.set(key, []);
        canonicalRoleCopies.get(key).push(index);
      }
    }
    for (const [index,office] of offices.entries()) {
      tally.office_count++;
      const id = clean(office?.id), name = clean(office?.name);
      const roles = Array.isArray(office?.authority_roles) ? office.authority_roles : [];
      const verified = office?.authority_verification_status === 'staff_verified';
      if (verified) tally.recorded_staff_verified_offices++;
      for (const role of specificElectrical) if (roles.includes(role))
        tally[role === 'electrical_permit' ? 'electrical_issuer_assignments' : 'electrical_inspection_assignments']++;
      const duplicateElectricalRoles = [...specificElectrical].filter(role =>
        roles.includes(role) && (canonicalRoleCopies.get(JSON.stringify([office?.government_office_id,role]))?.length || 0) > 1);
      const conflictingOfficeIndexes = [...new Set(duplicateElectricalRoles.flatMap(role =>
        canonicalRoleCopies.get(JSON.stringify([office.government_office_id,role]))))].filter(other => other !== index);
      const flags = [];
      if (duplicateElectricalRoles.length) flags.push('canonical_electrical_role_copy_review');
      if (!id || id !== office?.id || countsById.get(id) > 1 || !name)
        flags.push('office_identity_review');
      if (verified && flaggedLinks.has(locality.id))
        flags.push('profile_link_review');
      // An optional canonical government-office ID improves normalization, but does not prove authority.
      if (verified && !clean(office?.government_office_id))
        flags.push('canonical_office_identity_missing');
      if (verified && (!clean(office?.authority_verified_by) || !validDateTime(office?.authority_verified_at) ||
          !clean(office?.authority_verification_notes)))
        flags.push('verification_provenance_review');
      if (verified && (!Array.isArray(office?.authority_roles) || !roles.length ||
        roles.some(role => typeof role !== 'string' || !supportedRoles.has(role))))
        flags.push('authority_roles_review');
      for (const flag of flags) tally[flag]++;
      if (flags.length) reviews.push({
        locality_id:locality.id, locality_name:clean(locality.name) || 'Unnamed locality',state,
        office_index:index,office_id:id,office_name:name || 'Unnamed office',
        government_office_id:clean(office?.government_office_id),duplicate_electrical_roles:duplicateElectricalRoles,
        conflicting_office_indexes:conflictingOfficeIndexes,
        recorded_staff_verified:verified,
        authority_roles:roles.filter(role => typeof role === 'string'),
        link_flags:flags.includes('profile_link_review') ? flaggedLinks.get(locality.id) : [],
        flags,
        missing_reviewer:verified && !clean(office?.authority_verified_by),
        missing_or_invalid_date:verified && !validDateTime(office?.authority_verified_at),
        missing_notes:verified && !clean(office?.authority_verification_notes),
        duplicate_local_office_id:!!id && countsById.get(id)>1,
        missing_or_malformed_local_office_id:!id || id!==office?.id,
        missing_office_name:!name
      });
    }
  }
  reviews.sort((a,b)=>(a.state==='OH'?0:1)-(b.state==='OH'?0:1)
    || a.locality_name.localeCompare(b.locality_name) || a.locality_id.localeCompare(b.locality_id)
    || a.office_index-b.office_index);
  return {states,reviews,authority_verified:false,completeness_verified:false,
    notice:'Read-only saved office relationship audit. Staff-verified is a recorded flag, not independently corroborated evidence. Missing notes, canonical IDs, repeated canonical copies for the same electrical role and profile links require review; existing office review status is never changed. Contact websites and shared office IDs do not establish permitting authority, legal applicability or exact address boundaries.'};
}
