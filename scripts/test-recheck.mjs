#!/usr/bin/env node
// KAT for the needs_recheck pipeline pieces that run when the flag flips on:
// boost-lane ordering (recheck after contact, ahead of tiers), the relabel
// scan() picking exactly the strict-fail offices, and ledger/bucket logic.
import { BOOST_CLASS, boostClassFor } from './lib/research-boost.mjs';
import { scan } from './permitting-recheck-relabel.mjs';
import { buildCountyIndex } from './permitting-authority-verifier.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };

// Lane order: audit demote < jurisdiction < contact < recheck (recheck still
// ahead of every tier/gap target — spliceBoosts puts boosts first).
ok(BOOST_CLASS.demote < BOOST_CLASS.jurisdiction && BOOST_CLASS.jurisdiction < BOOST_CLASS.contact && BOOST_CLASS.contact < BOOST_CLASS.recheck, 'boost class order demote<jurisdiction<contact<recheck');
ok(boostClassFor('needs_recheck') === 'recheck' && boostClassFor('recheck') === 'recheck', 'boostClassFor needs_recheck→recheck');
ok(boostClassFor('contact_mismatch') === 'contact', 'contact_mismatch still contact');

// scan() — fixture: one passing office, one failing (no role kw in quote),
// one needs_verification (never a relabel target).
const PROF = {
  id: 'p1', name: 'Testville', state: 'OH', type: 'village', website_url: 'https://testvilleoh.gov',
  office_research: { roles: [
    { role: 'building', office_name: 'Building Department', official_source_url: 'https://testvilleoh.gov/building', responsibility_quote: 'The Building Department issues building permits for all new construction in the village', applicability: 'potentially_applicable' },
    { role: 'sign_permit', office_name: 'Planning Office', official_source_url: 'https://testvilleoh.gov/planning', responsibility_quote: 'Office hours are weekdays 8am to 4pm and the lobby is open for walk-ins', applicability: 'potentially_applicable' },
  ] },
};
const LOC = {
  id: 'l1', name: 'Testville', state: 'OH', jurisdiction_profile_id: 'p1', county_name: 'Test County',
  offices: [
    { id: 'o-good', name: 'Building Department', authority_verification_status: 'staff_verified', authority_roles: ['building'] },
    { id: 'o-bad', name: 'Planning Office', authority_verification_status: 'staff_verified', authority_roles: ['sign_permit'] },
    { id: 'o-open', name: 'Zoning Inspector', authority_verification_status: 'needs_verification', authority_roles: ['zoning'] },
    { id: 'o-nome', name: 'Mystery Office', authority_verification_status: 'staff_verified', authority_roles: ['right_of_way'] },
    { id: 'o-cty', name: 'Test County Building Department', authority_verification_status: 'staff_verified', authority_roles: ['building'] },
  ],
};
// County profile carries the county-department office's evidence — the
// village's own profile never did (the no_matching_entry fix).
const COUNTY_PROF = {
  id: 'p-cty', name: 'Test County', state: 'OH', type: 'county',
  office_research: { roles: [
    { role: 'building', office_name: 'Test County Building Department', official_source_url: 'https://testcountyoh.gov/building', responsibility_quote: 'The Test County Building Department issues building permits and enforces the building code', applicability: 'potentially_applicable' },
  ] },
};
const countyIndex = buildCountyIndex([PROF, COUNTY_PROF]);
const { targets, excluded } = scan([LOC], new Map([['p1', PROF]]), countyIndex);
ok(targets.length === 1, 'scan targets the locality once');
const bad = targets[0]?.badOffices || [];
ok(bad.length === 1 && bad[0].id === 'o-bad', 'only the strict-fail office is a relabel target');
ok(bad[0]?.subs.includes('role_keyword_missing'), 'fail sub-check is role_keyword_missing');
ok(bad[0]?.failed?.includes('sign_permit'), 'failed roles tracked for the boost');
ok(!bad.some((b) => b.id === 'o-good'), 'passing office not targeted');
ok(!bad.some((b) => b.id === 'o-open'), 'needs_verification office never targeted');
ok(!bad.some((b) => b.id === 'o-cty'), 'county-dept office passes via county-profile lookup');
ok(excluded.length === 1 && excluded[0].id === 'o-nome', 'no_matching_entry-only office excluded, not relabelled');

console.log(`\n${fail ? 'FAIL' : 'PASS'} recheck — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
