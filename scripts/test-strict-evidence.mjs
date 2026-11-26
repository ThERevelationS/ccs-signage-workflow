#!/usr/bin/env node
// KAT for the tightened strictRoleEvidence + the fixed researchForOffice
// lookup. Run: node scripts/test-strict-evidence.mjs
// The fail cases are the real patterns from .audit-work/verifier-role-audit
// (title quotes, dept-word-in-name coherence, junk names, wrong-provider).
import { strictRoleEvidence, roleEvidence, researchForOffice, isOfficialSource } from './permitting-authority-verifier.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };
const PROF = { name: 'Testville', state: 'OH', type: 'village', website_url: 'https://testvilleoh.gov' };
const ent = (office_name, quote, url = 'https://testvilleoh.gov/dept') => ({ office_name, responsibility_quote: quote, official_source_url: url, applicability: 'potentially_applicable' });

// ── strictRoleEvidence: the 15 flagged patterns must all fail ────────────
const cases = [
  // Dayton — title-only quote (nav duplication), dept word only in the name
  ['Board of Zoning Appeals Board', 'sign_permit', 'Board of Zoning Appeals Board of Zoning Appeals'],
  // Massillon — animal control page, "building" in the name carried coherence
  ['Animal Control Building Department', 'sign_permit', 'Animal Control Building Department'],
  // Hudson — cemetery board name + appeals title
  ['Building Appeals Cemetery Board', 'building', 'Board of Zoning & Building Appeals Cemetery Board'],
  // Fairlawn — tax dept carrying electrical roles
  ['Ordinances Tax Department', 'electrical_permit', 'Municipal Codes Fairlawn Code of Ordinances Tax Department Municipal income tax filing and collection information'],
  // Fairlawn — newsletter snippet for right_of_way
  ['Street Maintenance Division', 'right_of_way', 'Spring Newsletter 2026 Street Maintenance Division updates'],
  // Shelbyville — staff page, no sign-permit statement
  ['Building Inspector', 'sign_permit', 'Find information about the Administration department and its staff. Building Inspector & Code Enforcement contacts'],
  // Springboro — hearing notice, no electrical statement
  ['Planning Commission', 'electrical_permit', 'Public Hearing - December 9 Springboro Planning Commission will hold a Public Hearing on Wednesday'],
  // Evendale — leaf bags, historic_review
  ['Service Department', 'historic_review', '2026 Leaf Bags Leaf bags will be distributed at the new Service Department building'],
  // Loudonville — council legislation list
  ['Village Administrator', 'electrical_permit', 'Council Legislation 2017 Village Administrator ordinance list'],
  // Loudonville — generic zoning-law prose for electrical_inspection
  ['Zoning Inspector', 'electrical_inspection', 'Zoning is a device of land use regulation used by local governments across the state'],
  // Reed Township — county auditor page, "NOT ZONED"
  ['Forms Permits Building Department', 'sign_permit', 'Reed Township--NOT ZONED contact county auditor'],
  // Allen KY — staff bio, not a sign-permit statement
  ['building inspector', 'sign_permit', 'Winnie Blythe (Assistant Director) BCE Licensing building inspector certification elevator licensing fire suppression contractor'],
  // Dover — junk nav name, evidence names a different office entirely
  // (4th field = the entry's own office_name, when it isn't the record name)
  ['Tributes Dover Human Relations Commission', 'sign_permit', 'Dover Township Zoning Inspector handles sign permits', 'Dover Township Zoning Inspector'],
  // Whitesburg — state-level provider stored as a city office; the union
  // lookup finds the generic slot entry, which names neither this office
  // Whitesburg — state-level provider stored as a city office; the union
  // lookup finds the generic slot entry whose quote names neither this
  // office nor the city (its real problem is scope — wrong_jurisdiction —
  // but role-evidence alone still must fail it)
  ['Kentucky Department of Housing, Buildings and Construction', 'building', 'Building permits are required for new construction and must be filed before work begins', 'Building permit and inspection authority'],
  // Raccoon Township — county homepage text naming a different provider
  ['Ohio Official', 'sign_permit', 'Gallia County government sign permit applications are filed with the county', 'Gallia County Government'],
];
for (const [name, role, quote, entryName] of cases) {
  const gaps = strictRoleEvidence(role, ent(entryName || name, quote), name, 'Testville', PROF);
  ok(gaps.length > 0, `should fail: ${name} [${role}]`);
}
// Loose roleEvidence still passes the coherence-OR cases (regression guard —
// strict adds the keyword + name gates on top).
ok(roleEvidence('sign_permit', ent('Building Department', 'The Building Department office is open weekdays for walk-ins and general questions'), PROF).length === 0, 'loose check still passes name-dept coherence');

// ── strictRoleEvidence: genuine evidence must still pass ─────────────────
const real = [
  ['Building Department', 'building', 'The Building Department issues building permits for all new construction, additions, and alterations within the village'],
  ['Zoning Inspector', 'zoning', 'Contact the Zoning Inspector for zoning permits, variance applications, and land use questions'],
  ['Building Department', 'sign_permit', 'Sign permits are issued by the Building Department; applications require two sets of drawings'],
  ['Planning Commission', 'historic_review', 'The Planning Commission reviews all exterior changes in the historic district before work begins'],
  ['City Engineer', 'right_of_way', 'The City Engineer must approve any work in the public right-of-way including driveway cuts and street openings'],
  // alias path — entry names the provider, office record name differs in
  // order/words but its tokens all appear in the entry name
  ['Union Building Department', 'sign_permit', 'Sign permit applications are reviewed within ten business days of submission'],
];
for (const [name, role, quote] of real) {
  const e = { ...ent(name === 'Union Building Department' ? 'City of Union Building & Zoning Department' : name, quote), };
  const gaps = strictRoleEvidence(role, e, name, 'Union', { ...PROF, name: 'Union' });
  ok(gaps.length === 0, `should pass: ${name} [${role}] (${gaps.join(',')})`);
}
// official-source guard still applies inside strict
ok(strictRoleEvidence('building', ent('Building Department', 'The Building Department issues building permits for construction', 'https://facebook.com/testville'), 'Building Department', 'Testville', PROF).some((g) => g.includes('no_official_source')), 'unofficial source still fails');

// ── path/title rescue of role_keyword_missing (approved loosening) ───────
// Bainbridge — real entry: responsibility quote, official /departments/zoning/
// path → zoning passes even though the quote lacks the word "zoning".
{
  const e = { office_name: 'Bainbridge Township Zoning Department', official_source_url: 'https://bainbridgetwp.com/departments/zoning/', responsibility_quote: 'It is in the permitting process that it is determined that the proposed use is permitted at a given location.', applicability: 'potentially_applicable' };
  const gaps = strictRoleEvidence('zoning', e, 'Bainbridge Township Zoning Department', 'Bainbridge Township', { name: 'Bainbridge Township', state: 'OH', website_url: 'https://bainbridgetwp.com' });
  ok(gaps.length === 0, `Bainbridge zoning rescued by /zoning path (${gaps.join(',')})`);
  // Findlay zoning — /zoning path but the quote has no responsibility verb → NOT rescued
  const f = { office_name: 'City of Findlay Zoning Department', official_source_url: 'https://www.findlayohio.gov/government/city-departments/zoning', responsibility_quote: 'Construction or alteration of any building or structure, including accessory buildings or structures and temporary or permanent signs.', applicability: 'potentially_applicable' };
  ok(strictRoleEvidence('zoning', f, 'City of Findlay Zoning Department', 'Findlay', { name: 'Findlay', state: 'OH', website_url: 'https://www.findlayohio.gov' }).some((g) => g.includes('role_keyword_missing')), 'Findlay zoning not rescued — quote has no verb');
}
// Must-NOT-rescue cases (real entries from the sample)
const noRescue = [
  // Wickliffe — /Building-Department path cannot rescue sign_permit
  ['Wickliffe Building Department', 'sign_permit', 'https://www.cityofwickliffe.com/158/Building-Department', 'The Building Department is responsible for the enforcement of residential building and zoning codes and the department issues most of the required permits within the City of Wickliffe.'],
  // West Liberty — code-enforcement path cannot rescue sign_permit
  ['Village of West Liberty Code Enforcement', 'sign_permit', 'https://www.mywestliberty.com/code-enforcement-officer.html', 'The Code Enforcement Officer handles zoning certificates and building permits.'],
  // Winchester — generic building-inspections page cannot rescue electrical
  ['Building Inspection Department', 'electrical_inspection', 'https://www.winchesterky.com/Departments/3/building-inspections', 'Inspection requests should be made at least 24 hours in advance and can be scheduled by calling 859-744-7019.'],
  // Orwell — community-directory page cannot rescue sign_permit
  ['Orwell Township Zoning Inspector', 'sign_permit', 'https://www.ashtabulacounty.gov/DocumentCenter/View/2229/Orwell-Twp---2023-Community-Directory', 'The zoning inspector is responsible for the general administration of zoning functions in the Township.'],
];
for (const [name, role, url, quote] of noRescue) {
  const gaps = strictRoleEvidence(role, { office_name: name, official_source_url: url, responsibility_quote: quote, applicability: 'potentially_applicable' }, name, 'X', { name: 'X', state: 'OH', website_url: 'https://' + new URL(url).host });
  ok(gaps.length > 0, `must not rescue: ${name} [${role}]`);
}
// And the positive control: same Wickliffe quote DOES satisfy zoning (quote
// itself carries the zoning keyword — no rescue needed).
ok(strictRoleEvidence('zoning', { office_name: 'Wickliffe Building Department', official_source_url: 'https://www.cityofwickliffe.com/158/Building-Department', responsibility_quote: 'The Building Department is responsible for the enforcement of residential building and zoning codes and issues most required permits.', applicability: 'potentially_applicable' }, 'Wickliffe Building Department', 'Wickliffe', { name: 'Wickliffe', state: 'OH', website_url: 'https://www.cityofwickliffe.com' }).length === 0, 'Wickliffe zoning passes on quote keyword');

// ── researchForOffice: the fixed lookup levels ────────────────────────────
const prof = { office_research: { roles: [
  { office_id: 'o-77', role: 'sign_permit', office_name: 'Wholly Different Name' },
  { role: 'zoning', office_name: 'Dover Township Zoning Inspector' },
  { role: 'sign_permit', label: 'Sign permit issuer' },
  { role: 'building', office_name: 'Police Department' },
] } };
// L1 — office_id wins over any name
ok(researchForOffice(prof, 'Anything', { name: 'X' }, ['sign_permit'], 'o-77')[0]?.office_id === 'o-77', 'L1 office_id match');
// L2 — entry label matched when office_name empty/different
ok(researchForOffice(prof, 'Sign Permit Issuer', { name: 'X' }, ['sign_permit']).length > 0, 'L2 label match');
// L3 — union: no name hit, but a same-role non-wrong-dept entry exists
{
  const hits = researchForOffice(prof, 'Tributes Dover Human Relations Commission', { name: 'Dover Township' }, ['zoning']);
  ok(hits.some((r) => /zoning inspector/i.test(r.office_name || '')), 'L3 union finds same-role entry');
  // wrong-dept providers are excluded from the union
  const b = researchForOffice(prof, 'Some Odd Office', { name: 'X' }, ['building']);
  ok(!b.some((r) => /police/i.test(r.office_name || '')), 'L3 union excludes police');
}
// office with no same-role research at all → empty
ok(researchForOffice(prof, 'Nope', { name: 'X' }, ['right_of_way']).length === 0, 'no same-role entries → empty');
// L2-county — a county-dept office's evidence lives on the parent county
// profile (Waite Hill / Lake County Building Department pattern)
{
  const countyProf = { type: 'county', office_research: { roles: [
    { role: 'building', office_name: 'Lake County Building Department', official_source_url: 'https://lakecountyohio.gov/building', responsibility_quote: 'x' },
  ] } };
  const hits = researchForOffice(prof, 'Lake County Building Department', { name: 'Waite Hill' }, ['building'], null, countyProf);
  ok(hits.length === 1 && hits[0].office_name === 'Lake County Building Department', 'L2 county-profile name match');
  // and the county union feeds L3 for role-typed lookups
  const union = researchForOffice(prof, 'Odd Stub Name', { name: 'Waite Hill' }, ['building'], null, countyProf);
  ok(union.some((r) => /lake county/i.test(r.office_name || '')), 'L3 union includes county entries');
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} strict-evidence — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
