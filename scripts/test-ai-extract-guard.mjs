#!/usr/bin/env node
// Known-answer tests for the SWE extraction guard + the auditor's routing
// decisions + the devin-llm file queue (mocked ACP output).
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { validateExtractAnswer, keywordWindows } from './lib/ai-extract-guard.mjs';
import { scoreAnswers } from './permitting-ai-extractor.mjs';
import { decideAction } from './permitting-ai-auditor.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

const PAGE_A = 'Welcome to our site. The Zoning Inspector issues all sign permits within the city limits. The Building Department reviews electrical permit requests separately each week.';
const PAGE_B = 'Police records may be requested at the front desk during normal business hours for incident reports.';
const unit = { pages: [
  { url: 'https://cityofexample.gov/zoning', text: '…sign permits…', full_text: PAGE_A },
  { url: 'https://cityofexample.gov/police', text: '…police records…', full_text: PAGE_B },
] };
const good = { role: 'sign_permit', office_name: 'Zoning Inspector', quote: 'The Zoning Inspector issues all sign permits within the city limits.', source_url: 'https://cityofexample.gov/zoning' };

console.log('extract guard:');
ok(validateExtractAnswer(unit, good).ok, 'verbatim quote on an in-unit page passes');
ok(validateExtractAnswer(unit, { ...good, quote: 'issues sign permits' }).reason === 'quote_too_short', 'a <20 char quote fails as too short');
const para = { ...good, quote: 'The zoning inspector handles sign permit applications for the city of Example.' };
const vr = validateExtractAnswer(unit, para);
ok(!vr.ok && vr.reason === 'quote_not_verbatim', 'a paraphrase fails (not a substring of the page)');
const otherPage = { ...good, source_url: 'https://cityofexample.gov/police' };
ok(validateExtractAnswer(unit, otherPage).reason === 'quote_not_verbatim', 'a quote checked against the wrong page fails');
ok(validateExtractAnswer(unit, { ...good, source_url: 'https://other-site.gov/x' }).reason === 'url_not_in_unit', 'a url outside the unit fails');
ok(validateExtractAnswer(unit, { ...good, office_name: 'Police Department' }).reason === 'non_permit_office', 'a police office fails the non-permit check');
ok(validateExtractAnswer(unit, { ...good, office_name: 'Mayor\'s Court' }).reason === 'non_permit_office', 'a court office fails the non-permit check');
ok(validateExtractAnswer(unit, { ...good, quote: 'x'.repeat(401) }).reason === 'quote_too_long', 'a >400 char quote fails');
ok(validateExtractAnswer(unit, { ...good, quote: 'Contact us for hours and directions to the office today.' }).reason === 'quote_no_role_keyword', 'a quote with no role keyword fails even if verbatim-length');
// verbatim BUT deeper in full_text than the trimmed window — passes because
// the guard checks the full fetched text, not just what the model saw.
ok(validateExtractAnswer(unit, { ...good, quote: 'The Building Department reviews electrical permit requests separately each week.' }).ok, 'a verbatim sentence deeper in full_text passes');

const win = keywordWindows('x'.repeat(300) + ' zoning permits ' + 'y'.repeat(300) + ' building inspections ' + 'z'.repeat(20000), 1500);
ok(win.length <= 1600 && win.includes('zoning permits') && win.includes('building inspections'), 'keywordWindows trims to the cap and keeps the keywords');

const meta = { pages: unit.pages };
const scored = scoreAnswers(meta, [good, para, { ...good, office_name: 'Sheriff Office' }, null]);
ok(scored.accepted.length === 1 && scored.rejected.length === 2, 'scoreAnswers splits accepted from rejected');

console.log('auditor routing:');
const set = { demote_cap_hr: 50, breaker_pct: 5 };
const meta2 = { offices: [
  { office_id: 'o1', name: 'Zoning Inspector', status: 'staff_verified', evidence: [{ quote: 'The Zoning Inspector issues all sign permits.', url: 'https://cityofexample.gov/zoning' }] },
  { office_id: 'o2', name: 'HALL RENTALS Zoning Office', status: 'needs_verification', evidence: [] },
  { office_id: 'o3', name: 'Police Department', status: 'needs_verification', evidence: [] },
] };
// model says demote but deterministic check passes → no demotion
ok(decideAction(meta2, { office_id: 'o1', type: 'role_not_supported_by_quote', field: 'sign_permit' }, { set, demoteAgreed: false, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'discarded_check_passed', 'demote rejected when the deterministic check passes');
// check agrees → demote
ok(decideAction(meta2, { office_id: 'o1', type: 'role_not_supported_by_quote', field: 'sign_permit' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'demote', 'demote when the check agrees');
// over the hourly cap → cap_limited
ok(decideAction(meta2, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 50, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'cap_limited', 'demote blocked at the hourly cap');
// 5% breaker → breaker_tripped
ok(decideAction(meta2, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 6, cleanerOutput: null }) === 'breaker_tripped', 'demote blocked when >5% of verified get flagged');
// junk_name on unverified office: cleaner output decides, model's suggestion ignored
ok(decideAction(meta2, { office_id: 'o2', type: 'junk_name', suggested: 'Whatever The Model Said' }, { set, cleanerOutput: 'Zoning Office' }) === 'name_cleaned', 'junk_name routes through the cleaner (name_cleaned)');
ok(decideAction(meta2, { office_id: 'o3', type: 'junk_name' }, { set, cleanerOutput: 'Police Department' }) === 'discarded_cleaner_noop', 'junk_name discarded when the cleaner returns the same name');
// non_permit_body: rule agreement decides
ok(decideAction(meta2, { office_id: 'o3', type: 'non_permit_body' }, { set }) === 'logged_rule_agrees', 'non_permit_body on a police office logs (rule agrees)');
ok(decideAction(meta2, { office_id: 'o1', type: 'non_permit_body' }, { set }) === 'review_rule_disagrees', 'non_permit_body on a zoning office → review (rule disagrees)');
// boost types never auto-write
ok(decideAction(meta2, { office_id: 'o1', type: 'contact_mismatch' }, { set }) === 'sent_to_researchers', 'contact_mismatch → researcher boost');
ok(decideAction(meta2, { office_id: 'o1', type: 'wrong_county_or_type' }, { set }) === 'sent_to_researchers', 'wrong_county_or_type → researcher boost');
ok(decideAction(meta2, { office_id: 'o1', type: 'duplicate_office' }, { set }) === 'sent_to_researchers', 'duplicate_office → researcher boost');
ok(decideAction(meta2, { office_id: 'o1', type: 'other' }, { set }) === 'logged', 'unhandled types → findings list');

console.log('queue round-trip (mocked ACP, subprocess):');
// devin-llm binds its queue dir at module load, and the extractor import
// above already loaded it as 'extract' — so the round-trip runs in a clean
// subprocess with DEVIN_LLM_QUEUE set first.
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
  const { enqueueUnit, outputFor, clearUnit, queueDepth } = await import('file:///D:/DevinProjects/ccs-server/scripts/lib/devin-llm.mjs');
  mkdirSync('.audit-work/test-loop-queue', { recursive: true });
  enqueueUnit({ id: 't1', prompt: 'p', schema: {}, kind: 'test', meta: { x: 1 } });
  const q1 = queueDepth() === 1 && existsSync('.audit-work/test-loop-queue/t1.json');
  mkdirSync('.audit-work/test-loop-out', { recursive: true });
  writeFileSync('.audit-work/test-loop-out/t1.json', JSON.stringify({ answers: [{ role: 'zoning' }] }));
  const q2 = outputFor('t1')?.output?.answers?.length === 1;
  clearUnit('t1');
  const q3 = queueDepth() === 0 && !existsSync('.audit-work/test-loop-out/t1.json');
  rmSync('.audit-work/test-loop-queue', { recursive: true, force: true });
  rmSync('.audit-work/test-loop-out', { recursive: true, force: true });
  console.log(JSON.stringify({ q1, q2, q3 }));
`], { env: { ...process.env, DEVIN_LLM_QUEUE: 'test-loop' }, encoding: 'utf8', cwd: process.cwd() });
const qr = JSON.parse(r.stdout.trim().split('\n').pop() || '{}');
ok(qr.q1, 'enqueueUnit writes a queue file');
ok(qr.q2, 'outputFor parses a written out-file');
ok(qr.q3, 'clearUnit removes queue + out files');

console.log('audit boost lane ordering:');
const { boostTargets, boostClassFor } = await import('./lib/research-boost.mjs');
ok(boostClassFor('demote') === 'demote' && boostClassFor('wrong_jurisdiction') === 'jurisdiction' && boostClassFor('wrong_county_or_type') === 'jurisdiction' && boostClassFor('contact_mismatch') === 'contact' && boostClassFor('duplicate_office') === 'contact', 'boost classes map to demote → jurisdiction → contact');
const locMap = new Map([
  ['L1', { id: 'L1', offices: [{ id: 'oA' }] }], ['L2', { id: 'L2', offices: [{ id: 'oB' }] }], ['L3', { id: 'L3', offices: [{ id: 'oC' }] }], ['L4', { id: 'L4', duplicate_of: 'x', offices: [] }],
]);
const boosts = [
  { bid: 'b1', cls: 'contact', locality_id: 'L1', finding: { type: 'contact_mismatch' } },
  { bid: 'b2', cls: 'demote', locality_id: 'L2', finding: { type: 'wrong_jurisdiction' } },
  { bid: 'b3', cls: 'jurisdiction', locality_id: 'L3', finding: { type: 'wrong_county_or_type' } },
  { bid: 'b4', cls: 'contact', locality_id: 'L4', finding: { type: 'duplicate_office' } }, // tombstoned — dropped
  { bid: 'b5', cls: 'contact', locality_id: 'L2', finding: { type: 'contact_mismatch' } }, // same loc, lower class than b2
];
const bt = boostTargets(boosts, locMap, () => 2);
ok(bt.length === 3, 'one boost target per live locality (tombstone dropped, dup merged)');
ok(bt[0].locality_id === 'L2' && bt[0].boostCls === 'demote', 'demoted verified office leads the lane');
ok(bt[1].locality_id === 'L3' && bt[1].boostCls === 'jurisdiction', 'wrong-jurisdiction comes before contact');
ok(bt[2].locality_id === 'L1' && bt[2].boostCls === 'contact', 'contact findings come last in the lane');
ok(bt[0].tier === 2 && bt[0].finding?.type === 'wrong_jurisdiction', 'boost target carries its tier + finding');

console.log('AI session scaling (cull/grow/target):');
const { cullPlan, growSession, resolveTarget } = await import('./lib/ai-sessions.mjs');
const GB2 = 1024 ** 3;
// researchers cut first: deficit small → only researcher cuts
let cp = cullPlan({ deficitBytes: 0.6 * GB2, researchers: 5, extractSessions: 2, auditSessions: 3, avgResRssBytes: 0.5 * GB2, avgDevinRssBytes: 0.4 * GB2 });
ok(cp.resCuts === 2 && cp.extCuts === 0 && cp.audCuts === 0, 'researchers are culled before any AI session');
// deficit that exhausts researchers → extractor sessions next, auditor last
cp = cullPlan({ deficitBytes: 4.0 * GB2, researchers: 4, extractSessions: 2, auditSessions: 3, avgResRssBytes: 0.5 * GB2, avgDevinRssBytes: 0.4 * GB2 });
ok(cp.resCuts === 4 && cp.extCuts === 2 && cp.audCuts >= 1, 'extractor sessions cut before auditor sessions');
ok(cp.audCuts <= 3, 'auditor sessions are the last resort');
// grow: +1 at a time, gated
ok(growSession({ current: 3, max: 8, freeBytes: 10 * GB2, reserveBytes: 4 * GB2, fleetRssBytes: 2 * GB2, budgetBytes: 12 * GB2, avgDevinRssBytes: 0.4 * GB2 }) === 4, 'auto grow adds one session when gates pass');
ok(growSession({ current: 8, max: 8, freeBytes: 10 * GB2, reserveBytes: 4 * GB2, fleetRssBytes: 2 * GB2, budgetBytes: 12 * GB2 }) === 8, 'grow stops at the 8-session cap');
ok(growSession({ current: 3, max: 8, freeBytes: 4.5 * GB2, reserveBytes: 4 * GB2, fleetRssBytes: 2 * GB2, budgetBytes: 12 * GB2, avgDevinRssBytes: 0.4 * GB2 }) === 3, 'grow blocked when free memory is tight');
ok(growSession({ current: 3, max: 8, freeBytes: 10 * GB2, reserveBytes: 4 * GB2, fleetRssBytes: 11.8 * GB2, budgetBytes: 12 * GB2, avgDevinRssBytes: 0.4 * GB2 }) === 3, 'grow blocked at the fleet budget');
ok(growSession({ current: 3, max: 8, freeBytes: 10 * GB2, reserveBytes: 4 * GB2, fleetRssBytes: 2 * GB2, budgetBytes: 12 * GB2, avgDevinRssBytes: 0.4 * GB2, cpuPct: 90, cpuMaxPct: 80 }) === 3, 'grow blocked on high CPU');
ok(resolveTarget({ mode: 'manual', manual: 5 }) === 5 && resolveTarget({ mode: 'manual', manual: 99 }) === 8 && resolveTarget({ mode: 'auto', auto: 0 }) === 0 && resolveTarget({ mode: 'auto', auto: 4 }) === 4, 'resolveTarget: manual pins 1–8, auto can park at 0');

console.log(`\n${fail ? 'FAIL' : 'PASS'} ai-extract-guard — ${pass} checks, ${fail} failures`);
process.exit(fail ? 1 : 0);
