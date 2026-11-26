#!/usr/bin/env node
// ai-auditor tests — routing KAT (the model proposes, code decides), the
// audit-lane queue ordering, the memory cull order, and a mocked-ACP loop
// over the real claim→prompt→out-file→consume cycle (fake session object,
// no devin.exe spawned).
import { spawnSync } from 'node:child_process';
import { decideAction } from './permitting-ai-auditor.mjs';
import { boostTargets, boostClassFor, spliceBoosts, BOOST_CLASS } from './lib/research-boost.mjs';
import { cullPlan } from './lib/ai-sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

const set = { demote_cap_hr: 50, breaker_pct: 5 };
const meta = { offices: [
  { office_id: 'o1', name: 'Zoning Inspector', status: 'staff_verified', evidence: [{ quote: 'The Zoning Inspector issues all sign permits.', url: 'https://cityofexample.gov/zoning' }] },
  { office_id: 'o2', name: 'HALL RENTALS Zoning Office', status: 'needs_verification', evidence: [] },
  { office_id: 'o3', name: 'Police Department', status: 'staff_verified', evidence: [] },
  { office_id: 'o4', name: 'Building Department', status: 'needs_verification', evidence: [] },
] };

console.log('routing — demote gate:');
// The model says demote but the deterministic check still passes → no demotion.
ok(decideAction(meta, { office_id: 'o1', type: 'role_not_supported_by_quote', field: 'sign_permit' }, { set, demoteAgreed: false, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'discarded_check_passed', 'model says demote, deterministic check passes → discarded, NOT demoted');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: false, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'discarded_check_passed', 'wrong_jurisdiction on verified office → discarded when check passes');
ok(decideAction(meta, { office_id: 'o1', type: 'role_not_supported_by_quote', field: 'sign_permit' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'demote', 'check agrees → demote');
// The demote gate only applies to VERIFIED offices — unverified offices fall through to normal types.
ok(decideAction(meta, { office_id: 'o4', type: 'role_not_supported_by_quote', field: 'x' }, { set, demoteAgreed: false }) === 'logged', 'role finding on unverified office → logged, never demoted');

console.log('routing — cap + breaker:');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 50, verifiedAudited: 100, verifiedFlagged: 1, cleanerOutput: null }) === 'cap_limited', '50/hr demote cap blocks the 51st');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 6, cleanerOutput: null }) === 'breaker_tripped', 'breaker trips over 5% of verified flagged');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 5, cleanerOutput: null }) === 'demote', 'exactly 5% flagged does not trip (strictly greater)');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 10, verifiedFlagged: 10, cleanerOutput: null }) === 'demote', 'breaker needs >20 verified audited before it can trip');
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 0, verifiedAudited: 100, verifiedFlagged: 1, breakerTripped: true, cleanerOutput: null }) === 'breaker_tripped', 'an already-tripped breaker stays tripped');
// breaker beats the cap: tripped → breaker_tripped even when the cap is also full
ok(decideAction(meta, { office_id: 'o1', type: 'wrong_jurisdiction', field: 'x' }, { set, demoteAgreed: true, demoteTokens: 50, verifiedAudited: 100, verifiedFlagged: 6, cleanerOutput: null }) === 'breaker_tripped', 'breaker outranks the hourly cap');

console.log('routing — cleaner-only renames:');
ok(decideAction(meta, { office_id: 'o2', type: 'junk_name', suggested: 'Whatever The Model Said' }, { set, cleanerOutput: 'Zoning Office' }) === 'name_cleaned', 'junk_name applies the CLEANER output, not the model suggestion');
ok(decideAction(meta, { office_id: 'o3', type: 'junk_name' }, { set, cleanerOutput: 'Police Department' }) === 'discarded_cleaner_noop', 'cleaner returning the same name discards the finding');
ok(decideAction(meta, { office_id: 'o2', type: 'junk_name' }, { set, cleanerOutput: null }) === 'discarded_cleaner_noop', 'no cleaner output → discard (model text never applied)');

console.log('routing — non-permit + boosts + fallthrough:');
ok(decideAction(meta, { office_id: 'o3', type: 'non_permit_body' }, { set }) === 'logged_rule_agrees', 'non_permit_body applied only when the tightened rule agrees (police)');
ok(decideAction(meta, { office_id: 'o1', type: 'non_permit_body' }, { set }) === 'review_rule_disagrees', 'non_permit_body the rule rejects → human review, never applied');
for (const t of ['contact_mismatch', 'wrong_county_or_type', 'duplicate_office', 'wrong_jurisdiction']) {
  ok(decideAction(meta, { office_id: 'o2', type: t }, { set }) === 'sent_to_researchers', `${t} → researcher boost lane (never auto-written)`);
}
ok(decideAction(meta, { office_id: 'o2', type: 'stale_or_placeholder' }, { set }) === 'logged', 'stale_or_placeholder → findings list');
ok(decideAction(meta, { office_id: 'o2', type: 'other' }, { set }) === 'logged', 'other → findings list');

console.log('queue order — audit lane:');
ok(boostClassFor('demote') === 'demote' && boostClassFor('wrong_jurisdiction') === 'jurisdiction' && boostClassFor('wrong_county_or_type') === 'jurisdiction' && boostClassFor('contact_mismatch') === 'contact' && boostClassFor('duplicate_office') === 'contact', 'finding types map to demote → jurisdiction → contact classes');
ok(BOOST_CLASS.demote < BOOST_CLASS.jurisdiction && BOOST_CLASS.jurisdiction < BOOST_CLASS.contact, 'class order is strictly demote < jurisdiction < contact');
const locMap = new Map([
  ['L1', { id: 'L1', offices: [{ id: 'oA' }] }],
  ['L2', { id: 'L2', offices: [{ id: 'oB' }] }],
  ['L3', { id: 'L3', offices: [{ id: 'oC' }] }],
  ['L4', { id: 'L4', duplicate_of: 'x', offices: [] }],
]);
const boosts = [
  { bid: 'b1', cls: 'contact', locality_id: 'L1', finding: { type: 'contact_mismatch' } },
  { bid: 'b2', cls: 'demote', locality_id: 'L2', finding: { type: 'wrong_jurisdiction' } },
  { bid: 'b3', cls: 'jurisdiction', locality_id: 'L3', finding: { type: 'wrong_county_or_type' } },
  { bid: 'b4', cls: 'contact', locality_id: 'L4', finding: { type: 'duplicate_office' } },
  { bid: 'b5', cls: 'contact', locality_id: 'L2', finding: { type: 'contact_mismatch' } },
];
const bt = boostTargets(boosts, locMap, () => 3);
ok(bt.length === 3, 'one boost target per live locality (tombstone dropped, same-loc merged)');
ok(bt[0].locality_id === 'L2' && bt[0].boostCls === 'demote', 'demoted verified offices lead the lane');
ok(bt[1].locality_id === 'L3' && bt[1].boostCls === 'jurisdiction', 'jurisdiction/county findings second');
ok(bt[2].locality_id === 'L1' && bt[2].boostCls === 'contact', 'contact/duplicate findings last');
ok(bt[0].tier === 3 && bt[0].boost === 'b2', 'boost target keeps its untried tier + bid (one-boost-per-finding via markBoostDone)');
// The lane itself: boosts splice ahead of EVERY tier/gap target.
const open = [{ locality_id: 'T1', tier: 1 }, { locality_id: 'T2', tier: 2 }];
const merged = spliceBoosts(bt, open);
ok(merged.slice(0, 3).every((t) => t.boost) && merged[3].locality_id === 'T1', 'audit lane beats every tier/gap target');
ok(spliceBoosts([], open) === open, 'empty boost list leaves the open list untouched');

console.log('cull order — memory pressure:');
const GB = 1024 ** 3;
let cp = cullPlan({ deficitBytes: 0.6 * GB, researchers: 5, extractSessions: 2, auditSessions: 3, avgResRssBytes: 0.5 * GB, avgDevinRssBytes: 0.4 * GB });
ok(cp.resCuts === 2 && cp.extCuts === 0 && cp.audCuts === 0, 'researchers are culled before any AI session');
cp = cullPlan({ deficitBytes: 2.2 * GB, researchers: 3, extractSessions: 2, auditSessions: 3, avgResRssBytes: 0.5 * GB, avgDevinRssBytes: 0.4 * GB });
ok(cp.resCuts === 3 && cp.extCuts === 2 && cp.audCuts === 0, 'extractor sessions are cut once researchers run out');
cp = cullPlan({ deficitBytes: 4.0 * GB, researchers: 4, extractSessions: 2, auditSessions: 3, avgResRssBytes: 0.5 * GB, avgDevinRssBytes: 0.4 * GB });
ok(cp.resCuts === 4 && cp.extCuts === 2 && cp.audCuts >= 1 && cp.audCuts <= 3, 'auditor sessions are the LAST to be culled');

console.log('mocked ACP batch loop (subprocess, real claim/out files):');
// devin-llm binds its queue dir at module load — run in a clean subprocess
// with DEVIN_LLM_QUEUE set, driving runBatch() with a fake session object.
const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
  const llm = await import('file:///D:/DevinProjects/ccs-server/scripts/lib/devin-llm.mjs');
  const out = {};
  // Happy path: fake worker answers all 3 units.
  llm.enqueueUnit({ id: 'm1', prompt: 'p1', schema: {}, meta: { jurisdiction: 'A' } });
  llm.enqueueUnit({ id: 'm2', prompt: 'p2', schema: {}, meta: { jurisdiction: 'B' } });
  llm.enqueueUnit({ id: 'm3', prompt: 'p3', schema: {}, meta: { jurisdiction: 'C' } });
  const fake = { busy: false, sessionId: 'mock-sess', reply: '',
    async prompt() { return { ok: true, reply: JSON.stringify({ results: [
      { id: 'm1', output: { findings: [] } },
      { id: 'm2', output: { findings: [{ type: 'other' }] } },
      { id: 'm3', output: { error: 'none' } },
    ] }), stopReason: 'end_turn' }; } };
  const res1 = await llm.runBatch(fake);
  out.produced = res1.produced;
  out.queueEmpty = llm.queueDepth() === 0;
  out.outFiles = ['m1','m2','m3'].every((id) => existsSync('.audit-work/test-mockacp-out/' + id + '.json'));
  out.metaRides = llm.outputFor('m1')?.meta?.jurisdiction === 'A';
  out.sessionTracked = llm.sessionFor('m2') === -1; // fake worker isn't in the pool — claims use idx -1
  // Failure path: a cancelled prompt must UNCLAIM the units back to the queue.
  llm.enqueueUnit({ id: 'm4', prompt: 'p4', schema: {} });
  const res2 = await llm.runBatch({ busy: false, sessionId: 'mock2', reply: '', async prompt() { return { ok: false, error: 'cancelled' }; } });
  out.failProduced = res2.produced;
  out.unclaimed = llm.queueDepth() === 1 && existsSync('.audit-work/test-mockacp-queue/m4.json');
  for (const id of ['m1','m2','m3','m4']) llm.clearUnit(id);
  rmSync('.audit-work/test-mockacp-queue', { recursive: true, force: true });
  rmSync('.audit-work/test-mockacp-out', { recursive: true, force: true });
  console.log('MOCKRES:' + JSON.stringify(out));
`], { env: { ...process.env, DEVIN_LLM_QUEUE: 'test-mockacp' }, encoding: 'utf8', cwd: process.cwd(), timeout: 60000 });
const line = (r.stdout || '').trim().split('\n').find((l) => l.startsWith('MOCKRES:'));
const mr = line ? JSON.parse(line.slice(8)) : {};
ok(mr.produced === 3 && mr.outFiles && mr.queueEmpty, 'all 3 mocked answers land as out-files and leave the queue');
ok(mr.metaRides === true, 'unit meta rides inside the out-file for the consumer');
ok(mr.failProduced === 0 && mr.unclaimed === true, 'a cancelled prompt unclaims the unit back to the queue (never lost)');
if (!line) console.log('   (mock subprocess output:', (r.stdout || '').slice(-300), (r.stderr || '').slice(-300), ')');

console.log(`\n${fail ? 'FAIL' : 'PASS'} ai-auditor — ${pass} checks, ${fail} failures`);
process.exit(fail ? 1 : 0);
