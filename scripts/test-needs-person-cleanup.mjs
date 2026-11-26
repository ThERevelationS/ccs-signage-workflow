// test-needs-person-cleanup — known-answer table for the office-name
// cleaner, placeholder detection, merge rules and paper-township planning.
// Pure — no mirrors, no network.
import assert from 'node:assert';
import { cleanOfficeName, isGenericOfficeName, isPlaceholderOffice } from './lib/office-name-clean.mjs';
import { buildPlan, planToUpdates, PAPER_RE } from './permitting-needs-person-cleanup.mjs';

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

// ── paper-township detection + absorbing-target pick ─────────────────────
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

// ── offices without failing records are never touched ────────────────────
{
  const loc = { id: 'L3', name: 'Quiet', state: 'OH', jurisdiction_type: 'city', offices: [{ id: 'q1', name: 'HALL RENTALS Zoning Office', authority_roles: ['zoning'] }] };
  const plan = buildPlan([loc], {});
  assert.equal(plan.renames.length, 0);
  assert.equal(plan.merges.length, 0);
}

console.log('PASS needs-person-cleanup');
