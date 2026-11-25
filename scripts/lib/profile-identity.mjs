// Profile identity + research union — shared by the authority verifier and
// the office seed scan.
//
// profileIdentityKey is the SAME grouping the duplicate consolidation used
// (.audit-work/profile-dup-plan.mjs): name + state + jurisdiction type +
// parent county (blank for county-type profiles — a county IS its county).
// Identity-equal profiles are siblings in every sense that matters for
// research: same jurisdiction, different repository rows (historical dupes,
// county-qualified variants).
export const normId = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function profileIdentityKey(r) {
  const t = normId(r?.type || 'county') || 'county';
  const p = t === 'county' ? '' : normId(typeof r?.parent_county === 'string' ? r.parent_county : r?.parent_county?.name);
  return [normId(r?.name), normId(r?.state), t, p].join('|');
}

// key -> [profiles] over the whole mirror set — index ONCE per pass, never
// scan per office. All statuses count: a 'historical' sibling's research is
// still evidence about the same jurisdiction.
export function buildIdentityIndex(profiles) {
  const idx = new Map();
  for (const p of profiles || []) {
    if (!p?.id || !normId(p.name)) continue;
    const k = profileIdentityKey(p);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(p);
  }
  return idx;
}

// Research pool for one jurisdiction: the linked profile's office_research
// roles PLUS the roles of every identity-equal profile, de-duplicated by
// role+url+quote so identical findings harvested twice count once.
// The linked profile's entries come first so same-key keepers are the
// canonical row's own.
export function unionResearchRoles(identityIndex, linkedProfile) {
  const roles = [];
  const seen = new Set();
  const push = (p) => {
    for (const r of p?.office_research?.roles || []) {
      const k = `${r?.role}|${String(r?.official_source_url || '').trim().toLowerCase()}|${String(r?.responsibility_quote || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      roles.push(r);
    }
  };
  if (linkedProfile) push(linkedProfile);
  for (const p of identityIndex.get(profileIdentityKey(linkedProfile)) || []) {
    if (p !== linkedProfile) push(p);
  }
  return roles;
}

// Convenience wrapper — the union as a profile-shaped object so callers that
// read profile.office_research.roles (researchForOffice, jurisdictionToPermit-
// Locality) need no signature change. Other fields stay the linked profile's.
export function withUnionResearch(identityIndex, linkedProfile) {
  if (!linkedProfile) return null;
  return { ...linkedProfile, office_research: { ...(linkedProfile.office_research || {}), roles: unionResearchRoles(identityIndex, linkedProfile) } };
}
