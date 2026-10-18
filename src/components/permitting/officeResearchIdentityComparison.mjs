const identity = value => ['id','name','state','type'].map(key => value?.[key] ?? null);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const electrical = role => ['electrical_permit','electrical_inspection'].includes(role);

/** Recorded references only. No catalog lookup, alias matching, or authority assignment. */
export function savedOfficeIdentityComparisons(research) {
  const review = research?.identity_reconciliation;
  if (research?.method !== 'office-research-requirements-v1' || review?.method !== 'office-identity-comparison-v1' ||
      !Array.isArray(research.roles) || !Array.isArray(review.entries) ||
      !equal(identity(research.profile_snapshot),identity(review.profile_snapshot)) ||
      !review.profile_snapshot?.id) return [];
  return review.entries.filter(entry => electrical(entry?.role) && Number.isSafeInteger(entry.position) && entry.position >= 0)
    .map(entry => {
      const row = research.roles[entry.position];
      const unique = review.entries.filter(other => other?.position === entry.position).length === 1;
      const current = unique && row?.role === entry.role && equal(row,entry.recorded_basis);
      const finding_index = row?.role === entry.role
        ? research.roles.slice(0,entry.position).filter(item => item && typeof item === 'object').length : null;
      return {entry,current,finding_index,review};
    });
}
