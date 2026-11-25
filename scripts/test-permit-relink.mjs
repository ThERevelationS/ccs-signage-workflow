// test-permit-relink — planner selection, carry-over, union dedupe, revert.
// Pure fixtures only; never touches mirrors, outbox, or the network.
import assert from 'node:assert';
import { buildPlan, revertEntries, keeperCopy } from './permitting-profile-relink.mjs';
import { buildIdentityIndex, unionResearchRoles } from './lib/profile-identity.mjs';

const mkP = (id, name, state, type, county, opts = {}) => ({
  id, name, state, type,
  verification_status: opts.historical ? 'historical' : 'active',
  duplicate_of: opts.dup ? 'x' : undefined,
  parent_county: county ? { name: county } : undefined,
  office_research: opts.roles ? { roles: opts.roles } : undefined,
  documents: opts.docs || [],
});
const mkLoc = (id, name, state, type, profileId, county_name, nv = 1) => ({
  id, name, state, jurisdiction_type: type,
  jurisdiction_profile_id: profileId,
  county_name,
  offices: [{ id: 'o1', name: 'Office', authority_verification_status: 'needs_verification', authority_roles: ['sign_permit'] }].slice(0, nv),
});
const role = (r, url, q) => ({ role: r, office_name: 'Zoning', official_source_url: url, responsibility_quote: q });

// ── unique candidate → relink ────────────────────────────────────────────
{
  const hist = mkP('P-old', 'Springfield', 'OH', 'city', 'Clark County', { historical: true });
  const act = mkP('P-act', 'Springfield', 'OH', 'city', 'Clark County');
  const plan = buildPlan([hist, act], [mkLoc('L1', 'Springfield', 'OH', 'city', 'P-old', 'Clark County')]);
  assert.equal(plan.relink.length, 1);
  assert.equal(plan.relink[0].to, 'P-act');
  assert.equal(plan.ambiguous_resolved.length, 0);
}

// ── already on an active profile → ok ────────────────────────────────────
{
  const act = mkP('P-act', 'Springfield', 'OH', 'city', 'Clark County');
  const plan = buildPlan([act], [mkLoc('L1', 'Springfield', 'OH', 'city', 'P-act', 'Clark County')]);
  assert.equal(plan.ok, 1);
  assert.equal(plan.relink.length, 0);
}

// ── ambiguous, no county on the locality → held ──────────────────────────
{
  const hist = mkP('P-old', 'Salem', 'OH', 'city', null, { historical: true });
  const a = mkP('P-a', 'Salem', 'OH', 'city', 'Columbiana County');
  const b = mkP('P-b', 'Salem', 'OH', 'city', 'Washington County');
  const plan = buildPlan([hist, a, b], [mkLoc('L1', 'Salem', 'OH', 'city', 'P-old', null)]);
  assert.equal(plan.ambiguous_resolved.length, 1);
  assert.equal(plan.relink.length, 0);
  assert.equal(plan.ambiguous_resolved[0].candidates, 2);
}

// ── county_name on the locality narrows to one → relink ──────────────────
{
  const hist = mkP('P-old', 'Salem', 'OH', 'city', null, { historical: true });
  const a = mkP('P-a', 'Salem', 'OH', 'city', 'Columbiana County');
  const b = mkP('P-b', 'Salem', 'OH', 'city', 'Washington County');
  const plan = buildPlan([hist, a, b], [mkLoc('L1', 'Salem', 'OH', 'city', 'P-old', 'Columbiana County')]);
  assert.equal(plan.relink.length, 1);
  assert.equal(plan.relink[0].to, 'P-a');
  assert.equal(plan.ambiguous_resolved.length, 0);
}

// ── slash-joined county_name ("Bracken / Mason") still narrows ───────────
{
  const hist = mkP('P-old', 'Salem', 'OH', 'city', null, { historical: true });
  const a = mkP('P-a', 'Salem', 'OH', 'city', 'Mason County');
  const b = mkP('P-b', 'Salem', 'OH', 'city', 'Washington County');
  const plan = buildPlan([hist, a, b], [mkLoc('L1', 'Salem', 'OH', 'city', 'P-old', 'Bracken County / Mason County')]);
  assert.equal(plan.relink.length, 1);
  assert.equal(plan.relink[0].to, 'P-a');
}

// ── type mismatch → none (township never relinks to a city) ──────────────
{
  const hist = mkP('P-old', 'Perry', 'OH', 'township', 'Brown County', { historical: true });
  const city = mkP('P-act', 'Perry', 'OH', 'city', 'Brown County');
  const plan = buildPlan([hist, city], [mkLoc('L1', 'Perry Township', 'OH', 'township', 'P-old', 'Brown County')]);
  assert.equal(plan.none.length, 1);
  assert.equal(plan.relink.length, 0);
}

// ── historical-only candidate → none; duplicate_of → not a candidate ─────
{
  const hist = mkP('P-old', 'Nowhere', 'OH', 'city', null, { historical: true });
  const hist2 = mkP('P-h2', 'Nowhere', 'OH', 'city', null, { historical: true });
  const dup = mkP('P-d', 'Nowhere', 'OH', 'city', null, { dup: true });
  const plan = buildPlan([hist, hist2, dup], [mkLoc('L1', 'Nowhere', 'OH', 'city', 'P-old', null)]);
  // historical siblings are still candidates in the planner index only if
  // active — both historicals + a duplicate leave zero acceptable targets.
  assert.equal(plan.relink.length + plan.ambiguous_resolved.length + plan.none.length, 1);
}

// ── research carry-over: only when target has NO roles and source does ───
{
  const roles = [role('sign_permit', 'https://a.gov', 'issue permits')];
  assert.ok(keeperCopy(mkP('t', 'X', 'OH', 'city'), mkP('s', 'X', 'OH', 'city', null, { historical: true, roles })));
  assert.ok(!keeperCopy(mkP('t', 'X', 'OH', 'city', null, { roles }), mkP('s', 'X', 'OH', 'city', null, { historical: true, roles })));
  assert.ok(!keeperCopy(mkP('t', 'X', 'OH', 'city'), mkP('s', 'X', 'OH', 'city', null, { historical: true })));
  assert.ok(!keeperCopy(mkP('t', 'X', 'OH', 'city'), null));
}

// ── union dedupe: role+url+quote identity across siblings ────────────────
{
  const r1 = role('sign_permit', 'https://a.gov', 'issues sign permits');
  const r1dup = { ...role('sign_permit', ' https://a.gov ', ' issues  sign permits '), office_name: 'Other' };
  const r2 = role('zoning', 'https://a.gov', 'issues sign permits');
  const linked = mkP('L', 'Springfield', 'OH', 'city', 'Clark County', { roles: [r1, r2] });
  const sib = mkP('S', 'Springfield', 'OH', 'city', 'Clark County', { historical: true, roles: [r1dup, role('building', 'https://b.gov', 'permits buildings')] });
  const idx = buildIdentityIndex([linked, sib]);
  const u = unionResearchRoles(idx, linked);
  assert.equal(u.length, 3); // r1dup merged — same role+url+quote modulo ws/case
}

// ── revert: only entries whose forward link is live produce writes ───────
{
  const lines = [
    { locality_id: 'L1', old_profile_id: 'P-old', new_profile_id: 'P-act' },
    { locality_id: 'L2', old_profile_id: 'P-x', new_profile_id: 'P-y' },
    { profile_copy: true, target_profile_id: 'P-act' },
    { revert: true, locality_id: 'L1', old_profile_id: 'P-act', new_profile_id: 'P-old' },
    null,
  ];
  const locs = [
    mkLoc('L1', 'A', 'OH', 'city', 'P-act', null),   // forward link live → revert
    mkLoc('L2', 'B', 'OH', 'city', 'P-other', null), // link moved on → skip
  ];
  const todo = revertEntries(lines, locs);
  assert.equal(todo.length, 1);
  assert.equal(todo[0].loc.id, 'L1');
  assert.equal(todo[0].back, 'P-old');
  // null old link → revert writes null (clears the link)
  const todo2 = revertEntries([{ locality_id: 'L3', old_profile_id: null, new_profile_id: 'P-act' }], [mkLoc('L3', 'C', 'OH', 'city', 'P-act', null)]);
  assert.equal(todo2.length, 1);
  assert.equal(todo2[0].back, null);
}

console.log('PASS permit-relink');
