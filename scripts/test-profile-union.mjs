// Pure tests for scripts/lib/profile-identity.mjs — the identity key the
// duplicate consolidation used, and the research union built on it.
import assert from 'node:assert';
import { normId, profileIdentityKey, buildIdentityIndex, unionResearchRoles, withUnionResearch } from './lib/profile-identity.mjs';

const prof = (o) => ({ id: o.id || Math.random().toString(36).slice(2), ...o });
const role = (role, url, quote, extra = {}) => ({ role, official_source_url: url, responsibility_quote: quote, office_name: 'Zoning', ...extra });

// ── identity key ─────────────────────────────────────────────────────────
{
  assert.equal(normId('  Mason   City '), 'mason city');
  // name+state+type+parent_county; county blank on county-type profiles
  assert.equal(
    profileIdentityKey(prof({ name: 'Mason', state: 'OH', type: 'city', parent_county: { name: 'Warren County' } })),
    'mason|oh|city|warren county'
  );
  assert.equal(
    profileIdentityKey(prof({ name: 'Warren County', state: 'OH', type: 'county', parent_county: { name: 'Warren County' } })),
    'warren county|oh|county|'
  );
  // parent_county as a bare string also works
  assert.equal(
    profileIdentityKey(prof({ name: 'Mason', state: 'oh', type: 'city', parent_county: 'Warren  County' })),
    'mason|oh|city|warren county'
  );
  // missing type defaults to 'county' (dup-plan's convention)
  assert.equal(profileIdentityKey(prof({ name: 'X', state: 'KY' })), 'x|ky|county|');
  // case/whitespace-insensitive identity
  assert.equal(
    profileIdentityKey(prof({ name: 'MASON', state: 'OH', type: 'city', parent_county: { name: '  warren   county' } })),
    profileIdentityKey(prof({ name: 'Mason', state: 'oh', type: 'city', parent_county: { name: 'Warren County' } }))
  );
  // same name, different type or county → different identity
  assert.notEqual(
    profileIdentityKey(prof({ name: 'Monroe', state: 'OH', type: 'township', parent_county: { name: 'Butler' } })),
    profileIdentityKey(prof({ name: 'Monroe', state: 'OH', type: 'township', parent_county: { name: 'Greene' } }))
  );
}

// ── union: linked profile + identity-equal siblings, deduped ─────────────
{
  const r1 = role('zoning', 'https://mason.gov/z', 'The zoning office issues zoning permits for all signs.');
  const r1dup = { ...r1, office_name: 'Zoning Division' }; // same role+url+quote → dedupe
  const r2 = role('sign_permit', 'https://mason.gov/signs', 'All signs require a permit from the city.');
  const r3 = role('building', 'https://county.gov/b', 'The building division reviews building permits.');
  const linked = prof({ name: 'Mason', state: 'OH', type: 'city', parent_county: { name: 'Warren County' }, office_research: { roles: [r1, r2] } });
  const sibling = prof({ name: 'MASON ', state: 'OH', type: 'city', parent_county: { name: 'Warren County' }, verification_status: 'historical', office_research: { roles: [r1dup, r3] } });
  const otherCounty = prof({ name: 'Mason', state: 'OH', type: 'city', parent_county: { name: 'Hamilton County' }, office_research: { roles: [role('zoning', 'https://other.gov', 'Other county zoning handles permits.')] } });
  const otherType = prof({ name: 'Mason', state: 'OH', type: 'township', parent_county: { name: 'Warren County' }, office_research: { roles: [role('zoning', 'https://twp.gov', 'Township zoning administers permits.')] } });
  const idx = buildIdentityIndex([linked, sibling, otherCounty, otherType]);

  const u = unionResearchRoles(idx, linked);
  assert.equal(u.length, 3); // r1 + r2 + r3 (r1dup deduped)
  assert.ok(u.includes(r1) && u.includes(r2) && u.includes(r3));
  // historical sibling contributes; different county/type does not
  assert.ok(!u.some((r) => r.official_source_url === 'https://other.gov'));
  assert.ok(!u.some((r) => r.official_source_url === 'https://twp.gov'));
  // wrapper keeps linked profile fields, swaps in unioned roles
  const wrapped = withUnionResearch(idx, linked);
  assert.equal(wrapped.name, 'Mason');
  assert.equal(wrapped.id, linked.id);
  assert.equal(wrapped.office_research.roles.length, 3);
  assert.equal(withUnionResearch(idx, null), null);
  // linked-less profile still unions against its own identity group
  const orphan = prof({ name: 'Mason', state: 'OH', type: 'city', parent_county: { name: 'Warren County' }, office_research: { roles: [] } });
  const u2 = unionResearchRoles(idx, orphan);
  assert.equal(u2.length, 3); // orphan pulls the whole family's pool
}

console.log('PASS profile-union');
