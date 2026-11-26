// test-needs-person-cleanup — known-answer table for the office-name
// cleaner, placeholder detection, merge rules and paper-township planning.
// Pure — no mirrors, no network.
import assert from 'node:assert';
import { cleanOfficeName, isGenericOfficeName, isPlaceholderOffice, isNonPermitOfficeName, receiverOkForRole } from './lib/office-name-clean.mjs';
import { buildPlan, planToUpdates, mergeRevertOffices, PAPER_RE } from './permitting-needs-person-cleanup.mjs';

// ── known-answer table: junk in → clean out ──────────────────────────────
const KAT = [
  ['HALL RENTALS Zoning Office', 'Zoning Office', true],
  ['Contact Us Chief Building Inspector', 'Chief Building Inspector', false],
  ['Quick Links Planning Commission', 'Planning Commission', false],
  ['CITY AUDITOR ARCHIVE Inspector', 'Inspector', true],
  ['Owners Building Department', 'Building Department', false],
  ['Commissions Building Department', 'Building Department', false],
  ['An Official', 'An Official', true],                       // nothing strippable, generic
  ['Services Historic District', 'Historic District', false],
  ['Planning Planning Commission', 'Planning Commission', false], // doubled word
  ['Village Administrative Office Street Department', 'Street Department', false],
  // real office names are untouched
  ['Planning Commission', 'Planning Commission', false],
  ['Zoning Inspector', 'Zoning Inspector', false],
  ['Union County Building Department', 'Union County Building Department', false],
  ['Building Department', 'Building Department', false],
  ['Community Development Department', 'Community Development Department', false],
  ['Village Clerk', 'Village Clerk', false],
  ['Fire Prevention Bureau', 'Fire Prevention Bureau', false],
  ['Eden Township Sign permit office', 'Eden Township Sign permit office', false], // cleaner doesn't strip loc names — placeholder check handles it
];
for (const [raw, clean, generic] of KAT) {
  const c = cleanOfficeName(raw);
  assert.equal(c.clean, clean, `clean(${raw})`);
  assert.equal(c.generic, generic, `generic(${raw})`);
}
assert.equal(isGenericOfficeName('Sign permit issuer'), true);
assert.equal(isGenericOfficeName('Historic/design review authority'), true);
assert.equal(isGenericOfficeName('Zoning Inspector'), false);

// ── placeholder detection: locality name + generic role label ────────────
assert.equal(isPlaceholderOffice('Eden Sign permit office', 'Eden Township'), true);
assert.equal(isPlaceholderOffice('Eden Township Sign permit office', 'Eden Township'), true);
assert.equal(isPlaceholderOffice('Sign permit issuer', 'Eden Township'), true);
assert.equal(isPlaceholderOffice('Eden Township Historic review office', 'Eden Township'), true);
assert.equal(isPlaceholderOffice('Historic/design review authority', 'Eden Township'), true);
assert.equal(isPlaceholderOffice('Planning Commission', 'Eden Township'), false);
assert.equal(isPlaceholderOffice('Union County Building Department', 'Eden Township'), false);
assert.equal(isPlaceholderOffice('Zoning Inspector', 'Eden Township'), false);

// ── non-permit retirement: name-driven only, permit tokens protect ────────
// Retired — the name itself says non-permitting body, no permit token.
for (const n of ["Grant County Sheriff's Department", 'County Police Department', 'Services ADAMH Board', 'City Auditor', 'Clerk of Courts', 'Board of Health', 'Municipal Airport Authority', 'Cemetery Sexton']) {
  assert.equal(isNonPermitOfficeName(n), true, `non-permit: ${n}`);
}
// 'service' is a permitting token — even a non-permit-list match is protected
assert.equal(isNonPermitOfficeName('Civil Service Commission'), false);
// Kept — placeholders/role-template names NEVER retire as non-permit.
for (const n of ['Rochester Sign permit office', 'Rochester Zoning office', 'Rochester Electrical permit office', 'Zoning authority', 'Historic/design review authority', 'City of Woodbury']) {
  assert.equal(isNonPermitOfficeName(n), false, `keep placeholder: ${n}`);
}
// Kept — a permitting token anywhere in the name disqualifies the verdict.
for (const n of ['Keene Police Department Public Works Department', 'Sheriff Building Division', 'Fire Code Inspector', 'Parks Planning Department']) {
  assert.equal(isNonPermitOfficeName(n), false, `permit token protects: ${n}`);
}
// Kept — substring collisions: 'Parker' is a person, 'Woodlawn Park' a place.
assert.equal(isNonPermitOfficeName('Bryan Parker Inspector'), false);
assert.equal(isNonPermitOfficeName('City of Woodlawn Park City Council'), false);
// Kept — "City Clerk" is a permitting office in small cities; only clerk OF
// COURTS is non-permit.
assert.equal(isNonPermitOfficeName('City of Hillview City Clerk/Treasurer'), false);
assert.equal(isNonPermitOfficeName('City Clerk'), false);
assert.equal(isNonPermitOfficeName('Village Clerk'), false);

// ── merge receivers: name must match the absorbed role ───────────────────
// Rejected — non-permit, tab-glued person names, junk and role-mismatched.
assert.equal(receiverOkForRole({ name: 'Departments Police Department' }, 'historic_review', 'Grayson'), false);
assert.equal(receiverOkForRole({ name: 'Alexander City Clerk' }, 'historic_review', 'Fairfield'), false);
assert.equal(receiverOkForRole({ name: 'Elaine\tJones\tCity Clerk' }, 'historic_review', 'Salt Lick'), false);
assert.equal(receiverOkForRole({ name: 'Local Government The Department' }, 'zoning', 'Fleming-Neon'), false);
assert.equal(receiverOkForRole({ name: 'ADAMH Board' }, 'right_of_way', 'Blue Creek'), false);
assert.equal(receiverOkForRole({ name: 'City Clerk' }, 'sign_permit', 'Hillview'), false); // clerk name doesn't match the role
// Accepted — clean real names that match the role they absorb.
assert.equal(receiverOkForRole({ name: 'Historic Preservation Commission' }, 'historic_review', 'X'), true);
assert.equal(receiverOkForRole({ name: 'Zoning Inspector' }, 'zoning', 'X'), true);
assert.equal(receiverOkForRole({ name: 'Planning Commission' }, 'zoning', 'X'), true);
assert.equal(receiverOkForRole({ name: 'County Engineer' }, 'right_of_way', 'X'), true);
assert.equal(receiverOkForRole({ name: 'Building Department' }, 'sign_permit', 'X'), true);
assert.equal(receiverOkForRole({ name: 'Code Enforcement Office' }, 'building', 'X'), true);
assert.equal(receiverOkForRole({ name: 'Dog Warden' }, 'other', 'X'), false); // 'other' never merges
assert.ok(PAPER_RE.test('Dover Township (paper — no permitting authority)'));
assert.ok(!PAPER_RE.test('Dover Township'));
{
  const county = { id: 'C1', name: 'Dover County', state: 'OH', jurisdiction_type: 'county' };
  const city = { id: 'M1', name: 'Dover', state: 'OH', jurisdiction_type: 'city' };
  const paper = { id: 'P1', name: 'Dover Township (paper — no permitting authority)', state: 'OH', jurisdiction_type: 'township', county_name: 'Dover County' };
  const locs = [paper, county, city];
  const plan = buildPlan(locs, {});
  assert.equal(plan.paper.length, 1);
  assert.equal(plan.paper[0].target_id, 'C1'); // county absorbs, not the same-named city
}

// ── merge rules ──────────────────────────────────────────────────────────
{
  const loc = {
    id: 'L1', name: 'Eden Township', state: 'OH', jurisdiction_type: 'township',
    offices: [
      { id: 'real1', name: 'Zoning Inspector', authority_roles: ['zoning', 'sign_permit'] },
      { id: 'ph1', name: 'Eden Township Sign permit office', authority_roles: ['sign_permit'] },
      { id: 'ph2', name: 'Historic/design review authority', authority_roles: ['historic_review'] },
      { id: 'ph3', name: 'Sign permit issuer', authority_roles: ['sign_permit'], authority_verification_status: 'staff_verified' },
    ],
  };
  const recs = {
    'L1:ph1': { locality_id: 'L1', status: 'needs_verification', reasons: ['no_quote'], attempts: 5 },
    'L1:ph2': { locality_id: 'L1', status: 'needs_verification', reasons: ['no_research'], attempts: 2 },
    'L1:ph3': { locality_id: 'L1', status: 'needs_verification', reasons: ['no_quote'], attempts: 9 },
  };
  const plan = buildPlan([loc], recs);
  // ph1 covered by real office → merge; ph2's historic_review uncovered → kept;
  // ph3 verified → never merged away.
  assert.equal(plan.merges.length, 1);
  assert.equal(plan.merges[0].office_id, 'ph1');
  assert.deepEqual(plan.merges[0].into, ['Zoning Inspector']);
  assert.equal(plan.kept_placeholder.length, 2);
  // planToUpdates: ph1 leaves offices[] and lands in archived_offices.
  const [u] = planToUpdates(plan, [loc]);
  assert.deepEqual(u.data.offices.map((o) => o.id).sort(), ['ph2', 'ph3', 'real1']);
  assert.equal(u.data.archived_offices.length, 1);
  assert.equal(u.data.archived_offices[0].id, 'ph1');
  assert.match(u.data.archived_offices[0].retired_reason, /duplicate/);
}

// ── non-permit-body retirement + junk rename in one update ───────────────
{
  const loc = {
    id: 'L2', name: 'Sample', state: 'OH', jurisdiction_type: 'city',
    offices: [
      { id: 'o1', name: 'Sheriff Civil Process', authority_roles: ['other'] },
      { id: 'o2', name: 'Quick Links Planning Commission', authority_roles: ['planning'] },
      { id: 'o3', name: 'Zoning Inspector', authority_roles: ['zoning'], authority_verification_status: 'staff_verified' },
    ],
  };
  const recs = {
    'L2:o1': { locality_id: 'L2', status: 'needs_verification', reasons: ['non_permit_body'], attempts: 4 },
    'L2:o2': { locality_id: 'L2', status: 'needs_verification', reasons: ['no_quote'], attempts: 1 },
  };
  const plan = buildPlan([loc], recs);
  assert.equal(plan.non_permit.length, 1);
  assert.equal(plan.renames.length, 1);
  assert.equal(plan.renames[0].to, 'Planning Commission');
  const [u] = planToUpdates(plan, [loc]);
  assert.equal(u.data.offices.length, 2);
  assert.equal(u.data.offices.find((o) => o.id === 'o2').name, 'Planning Commission');
  assert.equal(u.data.archived_offices[0].id, 'o1');
  assert.equal(u.data.archived_offices[0].retired_reason, 'not a permitting office');
  // verified office untouched, change log recorded
  assert.ok(u.data.offices.some((o) => o.id === 'o3'));
  assert.ok(u.data.office_change_log.length >= 1);
}

// ── merges rejected when the receiver's name doesn't match the role ──────
{
  const loc = {
    id: 'L4', name: 'Grayson', state: 'KY', jurisdiction_type: 'city',
    offices: [
      { id: 'junk1', name: 'Departments Police Department', authority_roles: ['historic_review', 'zoning'] },
      { id: 'ph1', name: 'Historic/design review authority', authority_roles: ['historic_review'] },
    ],
  };
  const recs = { 'L4:ph1': { locality_id: 'L4', status: 'needs_verification', reasons: ['no_quote'], attempts: 4 } };
  const plan = buildPlan([loc], recs);
  assert.equal(plan.merges.length, 0); // police dept can never carry historic_review
  assert.equal(plan.kept_placeholder.length, 1);
}
// ── a real role-matching receiver still merges ───────────────────────────
{
  const loc = {
    id: 'L5', name: 'Sample', state: 'KY', jurisdiction_type: 'city',
    offices: [
      { id: 'real', name: 'Historic Preservation Commission', authority_roles: ['historic_review'] },
      { id: 'ph1', name: 'Historic/design review authority', authority_roles: ['historic_review'] },
    ],
  };
  const recs = { 'L5:ph1': { locality_id: 'L5', status: 'needs_verification', reasons: ['no_quote'], attempts: 4 } };
  const plan = buildPlan([loc], recs);
  assert.equal(plan.merges.length, 1);
  assert.deepEqual(plan.merges[0].into, ['Historic Preservation Commission']);
}
// ── non_permit_body reason alone no longer retires real role targets ─────
{
  const loc = { id: 'L6', name: 'Rochester', state: 'OH', jurisdiction_type: 'village', offices: [{ id: 'r1', name: 'Rochester Sign permit office', authority_roles: ['sign_permit'] }] };
  const recs = { 'L6:r1': { locality_id: 'L6', status: 'needs_verification', reasons: ['non_permit_body'], attempts: 4 } };
  const plan = buildPlan([loc], recs);
  assert.equal(plan.non_permit.length, 0); // the reason never retires — the name decides
}

// ── offices without failing records are never touched ────────────────────
{
  const loc = { id: 'L3', name: 'Quiet', state: 'OH', jurisdiction_type: 'city', offices: [{ id: 'q1', name: 'HALL RENTALS Zoning Office', authority_roles: ['zoning'] }] };
  const plan = buildPlan([loc], {});
  assert.equal(plan.renames.length, 0);
  assert.equal(plan.merges.length, 0);
}

// ── revert merges against live offices — never a stale snapshot ──────────
// Live offices changed after cleanup: a researcher added a real office and
// renamed another. The revert must restore the retired office and keep the
// new live state untouched.
{
  const beforeOffices = [
    { id: 'gone1', name: 'Sterling Electrical permit office', authority_roles: ['electrical_permit'] },
    { id: 'stay1', name: 'Zoning Inspector', authority_roles: ['zoning'] },
    { id: 'recv1', name: 'Planning Commission', authority_roles: ['planning'] },
  ];
  const entry = {
    before: { offices: beforeOffices, archived_offices: [] },
    data: {
      offices: [
        { id: 'stay1', name: 'Zoning Inspector', authority_roles: ['zoning'] },
        // cleanup grafted an extra role onto the receiver
        { id: 'recv1', name: 'Planning Commission', authority_roles: ['planning', 'historic_review'] },
      ],
      archived_offices: [{ ...beforeOffices[0], retired_reason: 'not a permitting office' }],
    },
  };
  // live has evolved: recv1 renamed, a NEW office exists, stay1 kept.
  const live = [
    { id: 'stay1', name: 'Zoning Inspector', authority_roles: ['zoning'] },
    { id: 'recv1', name: 'Planning & Zoning Commission', authority_roles: ['planning', 'historic_review'] },
    { id: 'new1', name: 'County Building Safety Department', authority_roles: ['sign_permit'] },
  ];
  const merged = mergeRevertOffices(live, entry);
  assert.equal(merged.length, 4);
  assert.ok(merged.some((o) => o.id === 'gone1' && o.name === 'Sterling Electrical permit office'), 'retired office restored');
  assert.ok(merged.some((o) => o.id === 'new1' && o.name === 'County Building Safety Department'), 'new live office kept');
  const recv = merged.find((o) => o.id === 'recv1');
  assert.equal(recv.name, 'Planning & Zoning Commission', 'live rename kept');
  assert.deepEqual(recv.authority_roles, ['planning'], 'grafted role stripped');
  // already-correct live state → null (nothing to enqueue)
  assert.equal(mergeRevertOffices(merged, entry), null);
}
// receiver with verification keeps grafted roles
{
  const entry = {
    before: { offices: [{ id: 'r', name: 'Planning Commission', authority_roles: ['planning'] }], archived_offices: [] },
    data: { offices: [{ id: 'r', name: 'Planning Commission', authority_roles: ['planning', 'historic_review'] }], archived_offices: [] },
  };
  const live = [{ id: 'r', name: 'Planning Commission', authority_roles: ['planning', 'historic_review'], authority_verification_status: 'staff_verified' }];
  assert.equal(mergeRevertOffices(live, entry), null, 'verified receiver untouched');
}
// paper/rename-only entries are no-ops under merge revert
{
  const entry = { before: { offices: [{ id: 'a', name: 'A' }], archived_offices: [] }, data: { offices: [{ id: 'a', name: 'A' }], archived_offices: [], duplicate_of: 'X' } };
  assert.equal(mergeRevertOffices([{ id: 'a', name: 'A' }], entry), null);
}

console.log('PASS needs-person-cleanup');
