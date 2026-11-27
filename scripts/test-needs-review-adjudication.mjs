// Pure KATs for the needs-review adjudication lane — no network, no mirrors.
import assert from 'node:assert';
import {
  activeAuthorityRoles,
  adjudicationTargets,
  buildAdjudicationUnit,
  buildResolutionPatch,
  structuralFactsFor,
  validateAdjudicationVerdict,
  validateResolutionPatch,
} from './lib/needs-review-adjudication.mjs';

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

const loc = {
  id: 'L1', name: 'Brimfield township', state: 'OH', county_name: 'Portage County', jurisdiction_type: 'township',
  offices: [
    { id: 'target', name: 'Electrical inspection office', authority_roles: ['electrical_inspection'], authority_verification_status: 'needs_verification', authority_evidence: [] },
    { id: 'county', name: 'Portage County Building Department', authority_roles: ['building', 'electrical_inspection'], authority_verification_status: 'staff_verified', authority_evidence: [{ quote: 'The county building department performs electrical inspections in unincorporated townships.', source_url: 'https://county.example/electrical' }] },
  ],
};
const row = { locality_id: 'L1', jurisdiction: 'Brimfield township, OH', office: 'Electrical inspection office', missing_roles: ['electrical_inspection'], reasons: ['no_quote'], attempts: 26, tiers_tried: [1, 2, 3, 4] };
const officeState = { offices: { 'L1:target': { locality_id: 'L1', office_id: 'target', office_name: 'Electrical inspection office', status: 'needs_verification' } } };
const unit = buildAdjudicationUnit(row, loc, loc.offices[0], officeState);

ok(unit.id.startsWith('adjudicate-'), 'unit uses the low-priority adjudicate lane prefix');
ok(unit.prompt.includes('absence of evidence is not evidence of absence'), 'prompt bans proving negatives from silence');
ok(unit.prompt.includes('Do not infer') || unit.prompt.includes('do not infer'), 'prompt bans inference');
ok(unit.meta.missing_roles.includes('electrical_inspection'), 'unit meta carries missing roles');
ok(Array.isArray(unit.meta.facts) && unit.meta.facts.some((f) => f.key === 'ohio_bbs_certification'), 'Ohio BBS structural fact is supplied');

const validCover = {
  verdict: 'covered_elsewhere', confidence: 0.92, roles_resolved: ['electrical_inspection'],
  reason: 'The verified county building department evidence states that it performs electrical inspections in unincorporated townships.',
  evidence_quotes: ['The county building department performs electrical inspections in unincorporated townships.'],
  structural_fact_keys: [], covering_office_id: 'county', covering_office_name: 'Portage County Building Department', covering_source_url: 'https://county.example/electrical', proof_expectation: null,
};
ok(validateAdjudicationVerdict(validCover, unit.meta, loc).ok, 'valid sibling-covered verdict passes all guards');

for (const [name, mutate, expect] of [
  ['low confidence', (v) => { v.confidence = 0.5; }, 'confidence'],
  ['role outside missing set', (v) => { v.roles_resolved = ['building']; }, 'outside missing_roles'],
  ['invented covering office', (v) => { v.covering_office_id = 'missing'; v.covering_office_name = 'Missing County Office'; }, 'not found'],
  ['unverified covering sibling', (v) => { v.covering_office_id = 'target'; v.covering_office_name = 'Electrical inspection office'; }, 'staff_verified'],
  ['generic weak evidence', (v) => { v.evidence_quotes = ['No evidence found']; }, 'weak'],
]) {
  const v = JSON.parse(JSON.stringify(validCover)); mutate(v);
  const r = validateAdjudicationVerdict(v, unit.meta, loc);
  ok(!r.ok && r.errors.join(' ').includes(expect), `covered verdict rejected: ${name}`);
}

// Ohio certified jurisdictions cannot wave away local building/electrical.
const certifiedLoc = { ...loc, name: 'Cleveland', offices: JSON.parse(JSON.stringify(loc.offices)) };
const certifiedFacts = structuralFactsFor(certifiedLoc, null, null);
ok(certifiedFacts.find((f) => f.key === 'ohio_bbs_certification')?.certified === true, 'test fixture: Cleveland is Ohio BBS certified');
const certifiedMeta = { ...unit.meta, facts: certifiedFacts, missing_roles: ['building'] };
const ohioNA = {
  verdict: 'not_applicable', confidence: 0.95, roles_resolved: ['building'], reason: 'The city supposedly has no building office because none was found after research.',
  evidence_quotes: ['Cleveland is on the Ohio Board of Building Standards certified-jurisdiction roster, so building/electrical permitting is locally administered.'],
  structural_fact_keys: ['ohio_bbs_certification'], covering_office_id: null, covering_office_name: null, covering_source_url: null, proof_expectation: null,
};
const ohioCheck = validateAdjudicationVerdict(ohioNA, certifiedMeta, certifiedLoc);
ok(!ohioCheck.ok && ohioCheck.errors.join(' ').includes('certified jurisdiction'), 'Ohio certified building/electrical not_applicable is hard-rejected');

// Historic review needs explicit negative evidence — silence is not enough.
const histMeta = { ...unit.meta, missing_roles: ['historic_review'] };
const histNA = { ...ohioNA, roles_resolved: ['historic_review'], evidence_quotes: ['No evidence was found after repeated searches.'], structural_fact_keys: [] };
const histCheck = validateAdjudicationVerdict(histNA, histMeta, loc);
ok(!histCheck.ok && histCheck.errors.join(' ').includes('historic_review'), 'historic not_applicable rejected without explicit no-district/no-authority evidence');
const histGood = { ...histNA, reason: 'The township zoning resolution states there is no local historic district, landmark commission, or design review authority.', evidence_quotes: ['The township zoning resolution states there is no local historic district, landmark commission, or design review authority.'] };
ok(validateAdjudicationVerdict(histGood, histMeta, loc).ok, 'historic not_applicable accepted only with explicit negative evidence');

// Kentucky electrical is structurally covered by DHBC-certified inspectors.
const kyLoc = { ...loc, name: 'Smallville city', state: 'KY', county_name: 'Grant County' };
const kyFacts = structuralFactsFor(kyLoc, null, null);
const kyMeta = { ...unit.meta, facts: kyFacts, missing_roles: ['electrical_inspection'] };
const kyNA = { ...ohioNA, roles_resolved: ['electrical_inspection'], reason: 'Kentucky electrical inspections are performed by state-certified electrical inspectors licensed by DHBC rather than a separate city office.', evidence_quotes: [kyFacts.find((f) => f.key === 'ky_dhbc_electrical').fact], structural_fact_keys: ['ky_dhbc_electrical'] };
ok(validateAdjudicationVerdict(kyNA, kyMeta, kyLoc).ok, 'KY DHBC structural fact can resolve local electrical office coverage/applicability');

// exists_unproven must name exactly what proof researchers need.
const unproven = { verdict: 'exists_unproven', confidence: 0.9, roles_resolved: ['electrical_inspection'], reason: 'Evidence is ambiguous: the township has electrical permit references but no sentence naming the inspecting office.', evidence_quotes: [], structural_fact_keys: [], covering_office_id: null, covering_office_name: null, covering_source_url: null, proof_expectation: 'Find an official township or county page/PDF sentence naming the office or certified inspector responsible for electrical inspections in Brimfield township.' };
ok(validateAdjudicationVerdict(unproven, unit.meta, loc).ok, 'exists_unproven accepted with a specific proof expectation');
const badUnproven = { ...unproven, proof_expectation: 'Find more information' };
ok(!validateAdjudicationVerdict(badUnproven, unit.meta, loc).ok, 'generic proof expectation is rejected');

// Patch construction: role is removed, tombstone metadata written, office is
// archived rather than hard-deleted when no applicable roles remain.
const patch = buildResolutionPatch(loc, 'target', validCover);
ok(!patch.error, 'resolution patch builds');
ok(patch.archived === true, 'single-role placeholder is archived, not deleted');
ok(patch.data.offices.length === 1 && patch.data.offices[0].id === 'county', 'active offices retain only the covering sibling');
ok(patch.data.archived_offices.some((o) => o.id === 'target' && o.not_applicable_roles?.electrical_inspection?.verdict === 'covered_elsewhere'), 'archived snapshot carries reversal metadata');
ok(patch.data.office_change_log.at(-1).summary.includes('covered_elsewhere'), 'declared office_change_log records the resolution');
ok(validateResolutionPatch(loc, 'target', validCover, patch).ok, 'resolution patch passes write-time structural validation');

// A mutated patch is rejected before enqueue.
const badPatch = JSON.parse(JSON.stringify(patch));
badPatch.data.offices[0].contact_phone = '555-0100';
ok(!validateResolutionPatch(loc, 'target', validCover, badPatch).ok, 'patch guard rejects non-target office mutation');
const roleAdd = JSON.parse(JSON.stringify(patch));
roleAdd.data.archived_offices[0].authority_roles = ['sign_permit'];
ok(!validateResolutionPatch(loc, 'target', validCover, roleAdd).ok, 'patch guard rejects adding back unrelated roles');

ok(activeAuthorityRoles({ authority_roles: ['building', 'zoning'], not_applicable_roles: { building: { verdict: 'not_applicable' } } }).join(',') === 'zoning', 'activeAuthorityRoles excludes NA tombstones');

// Target selection resolves ledger names through office-state and skips prior
// verdicts for the same evidence hash.
const targets = adjudicationTargets({ ledgerRows: [row], localities: [loc], officeState, adjudicated: {}, limit: 20 });
ok(targets.length === 1 && targets[0].office.id === 'target', 'ledger row resolves to the live target office');
const verifiedLoc = JSON.parse(JSON.stringify(loc)); verifiedLoc.offices[0].authority_verification_status = 'staff_verified';
ok(adjudicationTargets({ ledgerRows: [row], localities: [verifiedLoc], officeState, adjudicated: {}, limit: 20 }).length === 0, 'verified offices are not adjudicated as needs_review');

console.log(`PASS needs-review-adjudication — ${checks} checks, 0 failures`);
