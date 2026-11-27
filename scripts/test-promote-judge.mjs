// test-promote-judge — AI promotion judge gating, mocked-ACP verdicts,
// candidate-hash dedup, and placeholder office-name detection.
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candHash, vkey, promotable, resolveJudged, verdictMap, pendingCandidates, judgeUnit, appendVerdict, applyJudgeGuards, JUDGE_PROMPT_VERSION } from './lib/promote-judge.mjs';
import { isPlaceholderOffice } from './lib/office-name-clean.mjs';

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL', name); } };

const OFF = 'off-1';
const hashFor = (role, quote) => candHash({ office_id: OFF, role, quote });

// ── mocked ACP verdicts → a temp verdicts file → verdictMap → resolveJudged
const tmp = mkdtempSync(join(tmpdir(), 'judge-'));
const VFILE = join(tmp, 'verdicts.jsonl');
const Q1 = 'The Road Department reviews all work in the township right of way';
const Q2 = 'The County Engineer issues driveway permits on county roads';
const Q3 = 'Fee schedule for electrical permits';
writeFileSync(VFILE, [
  { office_id: OFF, role: 'right_of_way', cand_hash: hashFor('right_of_way', Q1), verdict: 'yes', provider: 'Road Department', same_jurisdiction: true, prompt_version: JUDGE_PROMPT_VERSION },
  { office_id: OFF, role: 'electrical_permit', cand_hash: hashFor('electrical_permit', Q2), verdict: 'no', provider: 'County Engineer', reason: 'duty belongs to the county, not this office', prompt_version: JUDGE_PROMPT_VERSION },
  { office_id: OFF, role: 'building', cand_hash: hashFor('building', 'different quote'), verdict: 'yes', provider: 'Building Dept', same_jurisdiction: true, prompt_version: JUDGE_PROMPT_VERSION },
].map((r) => JSON.stringify(r)).join('\n') + '\n');
const vm = verdictMap(false, VFILE);

// yes + same_jurisdiction → judged
{
  const d = resolveJudged(OFF, ['right_of_way'], () => hashFor('right_of_way', Q1), vm);
  T('yes+sj promotes', d.judged.length === 1 && d.judged[0] === 'right_of_way' && d.gaps.length === 0);
}
// no → gap + boost entry
{
  const d = resolveJudged(OFF, ['electrical_permit'], () => hashFor('electrical_permit', Q2), vm);
  T('no → ai_judge_no gap', d.judged.length === 0 && d.gaps[0] === 'electrical_permit:ai_judge_no');
  T('no → boost', d.noBoosts.length === 1 && d.noBoosts[0].role === 'electrical_permit');
}
// verdict for a DIFFERENT quote hash must not carry over (new evidence re-judges)
{
  const d = resolveJudged(OFF, ['building'], () => hashFor('building', Q3), vm);
  T('stale-hash verdict ignored → awaiting_judge', d.judged.length === 0 && d.gaps[0] === 'building:awaiting_judge' && d.noBoosts.length === 0);
}
// no verdict at all → awaiting_judge, never promotes
{
  const d = resolveJudged(OFF, ['zoning'], () => hashFor('zoning', 'x'), vm);
  T('missing verdict → awaiting_judge', d.gaps[0] === 'zoning:awaiting_judge' && d.judged.length === 0);
}
// unclear → never promotes, but produces a re-research boost target
{
  const f = join(tmp, 'v2.jsonl');
  writeFileSync(f, JSON.stringify({ office_id: OFF, role: 'zoning', cand_hash: 'h1', verdict: 'unclear', prompt_version: JUDGE_PROMPT_VERSION }) + '\n');
  const d = resolveJudged(OFF, ['zoning'], () => 'h1', verdictMap(false, f));
  T('unclear → ai_judge_unclear + boost', d.gaps[0] === 'zoning:ai_judge_unclear' && d.judged.length === 0 && d.noBoosts.length === 0 && d.unclearBoosts.length === 1);
}
// yes but different jurisdiction and provider is not county-level → not promotable
{
  const f = join(tmp, 'v3.jsonl');
  writeFileSync(f, JSON.stringify({ office_id: OFF, role: 'building', cand_hash: 'h2', verdict: 'yes', provider: 'Marion City Engineering', same_jurisdiction: false, prompt_version: JUDGE_PROMPT_VERSION }) + '\n');
  const d = resolveJudged(OFF, ['building'], () => 'h2', verdictMap(false, f));
  T('yes+wrong-jurisdiction → not promotable', d.judged.length === 0 && d.gaps[0] === 'building:awaiting_judge');
}
// a row with no prompt_version is v1 history — same evidence re-judges
{
  const f = join(tmp, 'v1.jsonl');
  writeFileSync(f, JSON.stringify({ office_id: OFF, role: 'building', cand_hash: 'h-v1', verdict: 'yes', provider: 'Building Dept', same_jurisdiction: true }) + '\n');
  const d = resolveJudged(OFF, ['building'], () => 'h-v1', verdictMap(false, f));
  T('v1 verdict invalidated by prompt-versioned key', d.judged.length === 0 && d.gaps[0] === 'building:awaiting_judge');
  T('v1 promotable refuses directly', !promotable({ verdict: 'yes', provider: 'Building Dept', same_jurisdiction: true }));
}
// yes + county provider covering → promotable via coverage
T('county provider covers', promotable({ verdict: 'yes', provider: 'Henry County Engineer', same_jurisdiction: false, prompt_version: JUDGE_PROMPT_VERSION }));
T('non-county provider no cover', !promotable({ verdict: 'yes', provider: 'City of Marion Engineering', same_jurisdiction: false, prompt_version: JUDGE_PROMPT_VERSION }));
T('yes+sj promotable', promotable({ verdict: 'yes', provider: 'Road Dept', same_jurisdiction: true, prompt_version: JUDGE_PROMPT_VERSION }));
T('no not promotable', !promotable({ verdict: 'no', same_jurisdiction: true, prompt_version: JUDGE_PROMPT_VERSION }));
T('unclear not promotable', !promotable({ verdict: 'unclear', same_jurisdiction: true, prompt_version: JUDGE_PROMPT_VERSION }));

// ── candidate file round-trip: hash-keyed pending set
{
  const cf = join(tmp, 'cands.jsonl');
  const loc = { id: 'L1', name: 'Testville', jurisdiction_type: 'village', county_name: 'Test County', state: 'OH' };
  const office = { id: 'o9', name: 'Right-of-way authority', authority_verification_status: 'needs_verification' };
  // redirect: appendCandidates writes a fixed path — exercise pendingCandidates on a hand-written file instead
  const row = { office_id: 'o9', role: 'right_of_way', quote: 'abc quote', cand_hash: candHash({ office_id: 'o9', role: 'right_of_way', quote: 'abc quote' }) };
  writeFileSync(cf, JSON.stringify(row) + '\n');
  const pc = pendingCandidates(cf);
  T('pending keyed by vkey', pc.has(vkey('o9', 'right_of_way', row.cand_hash)));
  T('same office+role other hash not pending', !pc.has(vkey('o9', 'right_of_way', 'otherhash')));
}

// ── judgeUnit shape
{
  const u = judgeUnit('off x', { locality_id: 'L1', jurisdiction: { name: 'Testville' }, office_name: 'ROW auth' }, [{ role: 'right_of_way', entry_office_name: 'Road Dept', quote: 'q', url: 'u' }]);
  T('unit id prefix', u.id.startsWith('judge-'));
  T('unit id sanitized', u.id === 'judge-v2-off_x');
  T('meta roles carry hash', Boolean(u.meta.roles[0].cand_hash));
  T('prompt carries jurisdiction+office+quote', u.prompt.includes('Testville') && u.prompt.includes('ROW auth') && u.prompt.includes('"q"'));
  T('schema results', Array.isArray(u.schema.results));
}

// ── deterministic post-judge guards (Brett's holdout failure classes)
{
  const yes = (provider) => ({ verdict: 'yes', provider, same_jurisdiction: true, reason: 'model accepted' });
  const guardCase = (name, entry, jurisdiction, wantVerdict, wantGuard) => {
    const g = applyJudgeGuards(yes(entry.entry_office_name || entry.provider || 'Provider'), entry, jurisdiction);
    T(`guard ${name}`, g.verdict === wantVerdict && g.guard === wantGuard);
  };
  guardCase('foreign-county caveat is not inclusion',
    { role: 'building', entry_office_name: 'Miami County Building Regulations Department', quote: 'Should your property be located outside of the city limits of Celina please check here. In addition to a zoning permit, all commercial building must have state approval through Miami County Building Regulations Department' },
    { name: 'Celina city', type: 'city', county: 'Mercer County' }, 'unclear', 'provider_county_mismatch');
  guardCase('appeals board is not permit authority',
    { role: 'building', entry_office_name: 'The Board', provider: 'The Board of Zoning Appeals', quote: 'The Board of Zoning Appeals hears and decide appeals made for exceptions and variances in the application of ordinances governing zoning and building in the Village of Newburgh Heights.' },
    { name: 'Newburgh Heights', type: 'village', county: 'Cuyahoga County' }, 'no', 'appeals_body');
  guardCase('appeal subject is not authority',
    { role: 'historic_review', entry_office_name: 'City Landmarks Commission', provider: 'City Landmarks Commission', quote: 'The Board of Zoning Appeals (BZA) is the administrative appeal body for decisions of the City’s Zoning Administrator and the City Landmarks Commission. The BZA also issues Conditional Use permits and grants Variances.' },
    { name: 'Dayton city', type: 'city', county: 'Montgomery County' }, 'no', 'appeal_subject_not_authority');
  guardCase('conditional may-still-be-required',
    { role: 'building', entry_office_name: 'Salem Building Department', quote: 'A separate building permit may still be required by the Salem Building Department, or their agent, as set out in the Codified Ordinances of the City of Salem.' },
    { name: 'Salem', type: 'city', county: 'Columbiana County' }, 'unclear', 'conditional_or_aspirational');
  guardCase('permit administration is not inspection',
    { role: 'electrical_inspection', entry_office_name: 'Lake County Building Department', quote: 'Building Permits and Electrical are administered by the Lake County Building Department' },
    { name: 'Willoughby Hills', type: 'city', county: 'Lake County' }, 'unclear', 'inspection_not_stated');
  guardCase('planning commission advisory only',
    { role: 'zoning', entry_office_name: 'Zoning Commission', provider: 'Planning & Zoning Commission', quote: 'The Planning & Zoning Commission reviews proposed amendments to zoning ordinances, site plans and plat applications, and also makes recommendations to the Council regarding the future development of the Village of Warsaw.' },
    { name: 'Warsaw', type: 'village', county: 'Coshocton County' }, 'unclear', 'planning_commission_advisory');
  const warsawNo = applyJudgeGuards({ verdict: 'no', provider: 'Planning & Zoning Commission', reason: 'advisory only' }, { role: 'zoning', entry_office_name: 'Zoning Commission', quote: 'The Planning & Zoning Commission reviews proposed amendments to zoning ordinances, site plans and plat applications, and also makes recommendations to the Council regarding the future development of the Village of Warsaw.' }, { name: 'Warsaw', type: 'village', county: 'Coshocton County' });
  T('advisory evidence becomes unclear even when model says no', warsawNo.verdict === 'unclear' && warsawNo.guard === 'planning_commission_advisory');
  guardCase('county border scope unresolved',
    { role: 'building', entry_office_name: 'Lawrence County Building Department', quote: 'The Building Department serves as the building permit authority for all commercial applications within the borders of the County.' },
    { name: 'Chesapeake', type: 'village', county: 'Lawrence County' }, 'unclear', 'county_scope_boundary_only');
  const okInspect = applyJudgeGuards(yes('Inspection Bureau'), { role: 'electrical_inspection', entry_office_name: 'Inspection Bureau', quote: 'The City of Loveland contracts with the Inspection Bureau, Inc. (IBI) for all electrical permits and inspections' }, { name: 'Loveland', type: 'city', county: 'Hamilton County' });
  T('real inspection responsibility survives guards', okInspect.verdict === 'yes' && !okInspect.guard);
}

// ── placeholder office detection
for (const [name, loc, want] of [
  ['Right-of-way authority', 'Liberty Center', true],
  ['Electrical inspection office', 'Loveland', true],
  ['Holmes Building office', 'Holmes Township', true],
  ['Zoning issuer', 'Salem Township', true],
  ['Hanover Township Zoning Commission', 'Hanover township', false],
  ['Warren County Building Department', 'Salem township', false],
  ['Butler County Department of Development', 'Fairfield Township', false],
  ['Henry County Engineer', 'Liberty Center', false],
  ['Village of Liberty Center Zoning Inspector', 'Liberty Center', false],
]) T(`placeholder(${name})`, isPlaceholderOffice(name, loc) === want);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
