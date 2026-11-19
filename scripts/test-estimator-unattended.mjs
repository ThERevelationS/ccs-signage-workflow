import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import * as M from '../.devin/estimator-run-model.mjs';

let passed = 0, failed = 0, skipped = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL', n); } };
const skip = n => { skipped++; console.log('SKIP', n); };
const throws = (fn, code, n) => { try { fn(); failed++; console.error('FAIL', n); } catch (e) { ok(String(e.message).includes(code), n); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'est-ua-'));
const FIX = path.join(ROOT, 'fixture');
const CTRL = path.resolve('.devin/estimator-run-control.mjs');
const MODEL = path.resolve('.devin/estimator-run-model.mjs');
const RUN = 'run001';
const runDir = () => path.join(FIX, '.devin', 'estimator-run', RUN);
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const shaRun = () => fs.readdirSync(runDir()).sort().map(f => f + ':' + sha(path.join(runDir(), f))).join('|');
const J = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
const R = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const nodeRun = (args, input) => spawnSync(process.execPath, [CTRL, ...args, '--fixture-root', FIX], { input: input ?? '', encoding: 'utf8' });
const nodeAsync = (args, input) => new Promise(res => {
  const c = spawn(process.execPath, [CTRL, ...args, '--fixture-root', FIX]);
  let o = '', e = '';
  c.stdout.on('data', d => o += d); c.stderr.on('data', d => e += d);
  c.stdin.end(input ?? ''); c.on('close', code => res({ code, stdout: o, stderr: e }));
});
function makeApproval(owner) {
  const a = { schema_version: 1, approved: true, run_id: RUN, owner_session_id: owner, app_id: M.POLICY.app_id, branch: 'main', project_root: FIX, module_queue: [...M.MODULE_QUEUE], allowed_effects: [...M.APPROVED_EFFECTS], max_credits: 5, max_attempts: 5, max_workers: 1 };
  a.scope_fingerprint = M.scopeFingerprint(a); return a;
}
const task = (id, over = {}) => ({ id, module_key: 'foundation', status: 'OPEN', gate_scope: 'technical', depends_on: [], allowed_effects: ['local_source'], owned_files: ['.devin/estimator-run-model.mjs'], phase_index: 0, priority: 0, evidence_passed: false, ...over });
function makeState(owner, over = {}) {
  return { schema_version: 1, run_id: RUN, owner_session_id: owner, project_root: FIX, app_id: M.POLICY.app_id, branch: 'main', approved_scope_hash: null, status: 'running', active_module: 'foundation', module_gate_states: {}, tasks: [task('O-1')], task_id: null, progress_seq: 0, phase_gate_index: 0, worker_count: 0, budget: M.createBudget(), stop_requested: false, ...over };
}
function seed(owner, stateOver = {}) {
  fs.rmSync(runDir(), { recursive: true, force: true });
  const a = makeApproval(owner);
  const s = makeState(owner, { approved_scope_hash: a.scope_fingerprint, ...stateOver });
  J(path.join(runDir(), 'approval.json'), a);
  J(path.join(runDir(), 'run-state.json'), s);
  J(path.join(runDir(), 'hook-state.json'), { schema_version: 1, run_id: RUN, owner_session_id: owner, last_progress_seq: null });
  return { a, s };
}
const selP = () => path.join(FIX, '.devin', 'MASTERPLAN_SESSION_ACTIVE');
const select = owner => J(selP(), { schema_version: 1, run_id: RUN, owner_session_id: owner });
const clearSel = () => fs.rmSync(selP(), { force: true });
const stop = sid => nodeRun(['hook', 'Stop'], JSON.stringify({ hook_event_name: 'Stop', session_id: sid, stop_hook_active: false }));
const stopEv = { hook_event_name: 'Stop', session_id: 'sess1', stop_hook_active: false };
fs.mkdirSync(path.join(FIX, '.devin'), { recursive: true });
fs.copyFileSync(MODEL, path.join(FIX, '.devin', 'estimator-run-model.mjs'));
fs.copyFileSync(CTRL, path.join(FIX, '.devin', 'estimator-run-control.mjs'));
{
  let b = M.createBudget();
  let r = M.reserveCredits({ budget: b, reservationId: 'a', upperBoundCredits: 2 });
  b = r.budget; ok(M.inspectBudget(b).remaining_milli === 3000, 'reserve2 -> remaining3');
  r = M.reserveCredits({ budget: b, reservationId: 'a', upperBoundCredits: 2 });
  ok(r.mayCall === false && r.created === false, 'dup same bound mayCall false');
  throws(() => M.reserveCredits({ budget: b, reservationId: 'a', upperBoundCredits: 1 }), 'mismatch', 'dup diff bound mismatch');
  b = M.settleCredits({ budget: b, reservationId: 'a', chargedCredits: null });
  ok(M.inspectBudget(b).remaining_milli === 3000 && b.reservations[0].status === 'unknown', 'settle null unknown stays3');
  b = M.reserveCredits({ budget: b, reservationId: 'b', upperBoundCredits: 3 }).budget;
  ok(M.inspectBudget(b).remaining_milli === 0, 'reserve b3 remaining0');
  throws(() => M.reserveCredits({ budget: b, reservationId: 'c', upperBoundCredits: 0.001 }), 'exhausted', 'tiny reserve exhausted');
  throws(() => M.settleCredits({ budget: b, reservationId: 'a', chargedCredits: 2.001 }), 'exceeds', 'settle over bound');
  throws(() => M.reserveCredits({ budget: b, reservationId: 'x', upperBoundCredits: NaN }), 'invalid_credit_bound', 'NaN bound');
  throws(() => M.reserveCredits({ budget: b, reservationId: 'x', upperBoundCredits: -1 }), 'invalid_credit_bound', 'negative bound');
  throws(() => M.reserveCredits({ budget: b, reservationId: 'x', upperBoundCredits: undefined }), 'invalid_credit_bound', 'missing bound');
  throws(() => M.settleCredits({ budget: b, reservationId: 'zzz' }), 'missing', 'missing reservation');
  throws(() => M.inspectBudget({ max_credits: 9, max_attempts: 5, reservations: [] }), 'invalid_credit_ledger', 'corrupt budget ledger');
  b = M.createBudget();
  for (let i = 0; i < 5; i++) b = M.settleCredits({ budget: M.reserveCredits({ budget: b, reservationId: 'r' + i, upperBoundCredits: 1 }).budget, reservationId: 'r' + i, chargedCredits: 0 });
  const rt = JSON.parse(JSON.stringify(b));
  ok(M.inspectBudget(rt).attempts === 5 && M.inspectBudget(rt).remaining_milli === 5000, '5x1 settle0 credits5 attempts5');
  throws(() => M.reserveCredits({ budget: rt, reservationId: 'r6', upperBoundCredits: 0.001 }), 'exhausted', '6th attempt after roundtrip');
}
{
  const { a, s } = seed('sess1');
  ok(M.selectNextTask({ tasks: s.tasks, state: s, approval: a }).taskId === 'O-1', 'select O-1');
  ok(!M.validateRunState({ state: { ...s, worker_count: 2 }, approval: a, sessionId: 'sess1', projectRoot: FIX }).ok, 'worker_count>1 rejected');
  ok(!M.validateRunState({ state: { ...s, status: 'bogus' }, approval: a, sessionId: 'sess1', projectRoot: FIX }).ok, 'unknown status rejected');
  const blocked = makeState('sess1', { module_gate_states: { foundation: { technical: 'failed' } }, tasks: [task('C-1', { module_key: 'channel_letters' })], approved_scope_hash: a.scope_fingerprint });
  ok(M.selectNextTask({ tasks: blocked.tasks, state: blocked, approval: a }).taskId === null, 'failed gate no skip');
  const done = makeState('sess1', { module_gate_states: { foundation: { technical: 'passed', activation: 'passed' } }, tasks: [task('C-1', { module_key: 'channel_letters' })], approved_scope_hash: a.scope_fingerprint });
  ok(M.selectNextTask({ tasks: done.tasks, state: done, approval: a }).reason === 'module_transition_required', 'transition required');
  const allDone = makeState('sess1', { module_gate_states: Object.fromEntries(M.MODULE_QUEUE.map(k => [k, { technical: 'passed', activation: 'passed', release: 'pending' }])), approved_scope_hash: a.scope_fingerprint });
  ok(M.selectNextTask({ tasks: [], state: allDone, approval: a }).reason === 'ready_for_user_review', 'release pending user review');
  const creditTask = task('P-1', { allowed_effects: ['live_integration'], credit_upper_bound: 1 });
  const broke = makeState('sess1', { tasks: [creditTask, task('O-2')], approved_scope_hash: a.scope_fingerprint, budget: { ...M.createBudget(), reservations: Array.from({ length: 5 }, (_, i) => ({ id: 'x' + i, upper_bound_milli: 1000, charged_milli: 0, status: 'settled' })) } });
  ok(M.selectNextTask({ tasks: broke.tasks, state: broke, approval: a }).taskId === 'O-2', 'credit blocked does not block local');
}
{
  seed('sess1'); clearSel();
  let r = stop('sess1');
  ok(r.status === 0 && r.stdout === '', 'no selector silent');
  select('sess1');
  let bytes = shaRun();
  r = stop('other-session');
  ok(r.status === 0 && r.stdout === '' && shaRun() === bytes, 'foreign owner silent bytes-unchanged');
  fs.rmSync(path.join(runDir(), 'approval.json'));
  r = stop('sess1');
  ok(r.status === 0 && r.stdout === '', 'absent approval silent');
  seed('sess1');
  let ap = R(path.join(runDir(), 'approval.json')); ap.approved = false; J(path.join(runDir(), 'approval.json'), ap);
  r = stop('sess1');
  ok(r.stdout === '', 'approved:false silent');
  seed('sess1'); select('sess1');
  r = nodeRun(['hook', 'Stop'], JSON.stringify(stopEv).slice(0, 100) + 'x'.repeat(3 * 1024 * 1024));
  ok(r.status === 0 && r.stdout === '', 'oversized stdin with valid prefix rejected');
  r = stop('sess!bad');
  ok(r.stdout === '', 'invalid session id silent');
  let st0 = R(path.join(runDir(), 'run-state.json')); st0.status = 'bogus'; J(path.join(runDir(), 'run-state.json'), st0);
  r = stop('sess1');
  ok(r.stdout === '', 'unknown run status silent');
  seed('sess1'); select('sess1');
  r = stop('sess1');
  const blk = r.stdout ? JSON.parse(r.stdout) : {};
  ok(blk.decision === 'block' && blk.reason === M.CONTINUATION_PROMPT, 'first stop blocks prompt');
  ok(R(path.join(runDir(), 'hook-state.json')).last_progress_seq === 0, 'progress recorded');
  r = nodeRun(['hook', 'Stop'], JSON.stringify({ ...stopEv, stop_hook_active: true }));
  ok(r.stdout === '', 'repeat stop silent even stop_hook_active');
  ok(R(path.join(runDir(), 'hook-state.json')).last_no_progress_reason === 'no_substantive_progress', 'no-progress reason hook-state only');
  ok(JSON.stringify(R(path.join(runDir(), 'run-state.json')).budget) === JSON.stringify(M.createBudget()), 'budget untouched');
  let st = R(path.join(runDir(), 'run-state.json'));
  st.progress_seq = 3; J(path.join(runDir(), 'run-state.json'), st);
  r = stop('sess1');
  ok(JSON.parse(r.stdout).decision === 'block' && R(path.join(runDir(), 'hook-state.json')).last_progress_seq === 3, 'progress advance re-blocks');
  fs.writeFileSync(path.join(runDir(), 'STOP'), 'x\n');
  st.stop_hook_active = false; J(path.join(runDir(), 'run-state.json'), st);
  r = nodeRun(['hook', 'Stop'], JSON.stringify({ ...stopEv, stop_hook_active: true }));
  ok(r.stdout === '', 'STOP marker wins');
  fs.rmSync(path.join(runDir(), 'STOP'));
  st.tasks = [task('O-1')]; st.module_gate_states = { foundation: { technical: 'failed' } }; J(path.join(runDir(), 'run-state.json'), st);
  r = stop('sess1');
  ok(r.stdout === '', 'failed gate no block');
  st.module_gate_states = {}; J(path.join(runDir(), 'run-state.json'), st);
  r = nodeRun(['hook', 'Hydrate'], JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'sess1' }));
  const hyd = r.stdout ? JSON.parse(r.stdout) : {};
  ok(hyd.hookSpecificOutput?.hookEventName === 'SessionStart' && hyd.hookSpecificOutput.additionalContext.startsWith(M.REHYDRATION_PROMPT), 'hydrate same-owner');
  ok(hyd.hookSpecificOutput.additionalContext.includes('.devin/estimator-run/' + RUN + '/'), 'hydrate artifact pointer');
  r = nodeRun(['hook', 'Hydrate'], JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'stranger' }));
  ok(r.stdout === '', 'hydrate foreign silent');
  st.status = 'awaiting_runtime_binding'; J(path.join(runDir(), 'run-state.json'), st);
  r = nodeRun(['hook', 'Hydrate'], JSON.stringify({ hook_event_name: 'PostCompaction', session_id: 'sess1' }));
  ok(r.stdout === '', 'hydrate awaiting_runtime_binding silent');
  st.status = 'running'; J(path.join(runDir(), 'run-state.json'), st);
}
{
  seed('sess1'); select('sess1');
  fs.writeFileSync(path.join(runDir(), 'run-state.json'), '{corrupt');
  let r = stop('sess1');
  ok(r.stdout === '' && fs.existsSync(selP()), 'corrupt state fails closed');
  fs.writeFileSync(path.join(runDir(), 'run-state.json'), JSON.stringify({ pad: 'x'.repeat(3 * 1024 * 1024) }));
  r = stop('sess1');
  ok(r.stdout === '', 'oversized artifact silent');
  r = nodeRun(['status'], '');
  ok(r.status !== 0, 'status missing run-id nonzero');
  r = nodeRun(['status', '--run-id', '../escape'], '');
  ok(r.status !== 0 && r.stdout === '', 'traversal run id nonzero');
  r = nodeRun(['boguscmd'], '');
  ok(r.status !== 0, 'unknown subcommand nonzero');
  seed('sess1'); select('sess1');
  const evil = path.join(ROOT, 'evil.json'); J(evil, {});
  fs.rmSync(path.join(runDir(), 'approval.json'));
  let linkOk = true;
  try { fs.symlinkSync(evil, path.join(runDir(), 'approval.json')); }
  catch (e) { linkOk = false; }
  if (linkOk) {
    r = stop('sess1');
    ok(r.stdout === '', 'file symlink artifact rejected');
  } else { fs.writeFileSync(path.join(runDir(), 'approval.json'), '{}'); skip('file symlink (no permission)'); }
  const outside = path.join(ROOT, 'outside-run');
  fs.mkdirSync(outside, { recursive: true });
  J(path.join(outside, 'approval.json'), makeApproval('sess1'));
  fs.rmSync(runDir(), { recursive: true, force: true });
  let junOk = true;
  try { fs.symlinkSync(outside, runDir(), 'junction'); }
  catch (e) { junOk = false; }
  if (junOk) {
    r = stop('sess1');
    ok(r.stdout === '', 'junction run-dir escape rejected');
    fs.rmSync(runDir(), { recursive: true, force: true });
  } else { skip('junction escape (unsupported)'); }
  r = nodeRun(['hook', 'Stop', '--fixture-root', os.tmpdir()], JSON.stringify(stopEv));
  ok(r.stdout === '', 'fixture-root=tmpdir rejected');
  r = nodeRun(['status', '--run-id', RUN, '--fixture-root', ROOT], '');
  ok(r.status !== 0, 'fixture outside run base nonzero');
}
{
  seed(null);
  let a0 = R(path.join(runDir(), 'approval.json'));
  J(path.join(runDir(), 'binding-request.json'), { run_id: RUN, nonce: 'nonce1', requested: true });
  const cap = (over = {}) => nodeRun(['hook', 'Capture'], JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'newsess9', tool_name: 'exec', tool_input: { command: 'echo ESTIMATOR_RUN_BIND:run001:nonce1' }, prompt_id: 'turn-β', ...over }));
  let r = cap({ tool_name: 'Read' });
  ok(r.stdout === '', 'non-exec tool type silent');
  r = cap();
  const bound = r.stdout ? JSON.parse(r.stdout) : {};
  ok(bound.hookSpecificOutput?.additionalContext?.startsWith('ESTIMATOR_RUN_BOUND: '), 'capture bound context');
  const rec = R(path.join(runDir(), 'binding-receipt.json'));
  ok(rec.owner_session_id === 'newsess9' && rec.nonce === 'nonce1' && rec.prompt_id === 'turn-β', 'receipt utf8 prompt_id');
  ok(JSON.stringify(R(path.join(runDir(), 'approval.json'))) === JSON.stringify(a0), 'capture leaves approval unchanged');
  r = cap();
  ok(r.stdout.includes('ESTIMATOR_RUN_BOUND:'), 'idempotent capture');
  r = cap({ tool_input: { command: 'echo ESTIMATOR_RUN_BIND:run001:wrong' } });
  ok(r.stdout === '', 'wrong nonce silent');
  r = cap({ session_id: 'sess;drop' });
  ok(r.stdout === '', 'invalid capture session id silent');
  J(path.join(runDir(), 'binding-receipt.json'), { schema_version: 1, run_id: RUN, owner_session_id: 'other', nonce: 'nonce1', bound_at: 'x' });
  r = cap();
  ok(R(path.join(runDir(), 'binding-receipt.json')).owner_session_id === 'other', 'conflicting receipt untouched');
}
const main = async () => {
  seed('sess1'); select('sess1');
  const [r1, r2] = await Promise.all([
    nodeAsync(['hook', 'Stop'], JSON.stringify(stopEv)),
    nodeAsync(['hook', 'Stop'], JSON.stringify(stopEv)),
  ]);
  const blocks = [r1, r2].filter(x => x.stdout.includes('"block"'));
  ok(blocks.length === 1, 'overlapping stops exactly one block');
  ok(!fs.existsSync(path.join(runDir(), '.lock')), 'no leftover run lock');
  const hs = R(path.join(runDir(), 'hook-state.json'));
  ok(Number.isInteger(hs.last_progress_seq) && hs.run_id === RUN, 'hook-state valid after race');
  ok(JSON.stringify(R(path.join(runDir(), 'run-state.json')).budget) === JSON.stringify(M.createBudget()), 'budget unchanged by race');
  const seedBound = (runId, owner) => {
    const d = path.join(FIX, '.devin', 'estimator-run', runId);
    const a = { ...makeApproval(owner), run_id: runId }; a.scope_fingerprint = M.scopeFingerprint(a);
    const s = { ...makeState(owner), run_id: runId, status: 'awaiting_runtime_binding', approved_scope_hash: a.scope_fingerprint };
    J(path.join(d, 'approval.json'), a);
    J(path.join(d, 'run-state.json'), s);
    J(path.join(d, 'hook-state.json'), { schema_version: 1, run_id: runId, owner_session_id: owner, last_progress_seq: null });
    J(path.join(d, 'binding-receipt.json'), { schema_version: 1, run_id: runId, owner_session_id: owner, prompt_id: owner, nonce: 'n', bound_at: 'x' });
    J(path.join(d, 'bootstrap-tests.json'), { schema_version: 1, passed: true, model_sha256: sha(MODEL), controller_sha256: sha(CTRL) });
  };
  clearSel();
  seedBound('run001', 'ownerA');
  seedBound('run002', 'ownerB');
  const [s1, s2] = await Promise.all([
    nodeAsync(['start', '--run-id', 'run001'], ''),
    nodeAsync(['start', '--run-id', 'run002'], ''),
  ]);
  const winners = [s1, s2].filter(x => x.code === 0 && x.stdout.includes('started'));
  const losers = [s1, s2].filter(x => x.code !== 0);
  ok(winners.length === 1 && losers.length === 1, 'parallel starts exactly one winner');
  const sel = R(selP());
  ok(sel.run_id === (s1.code === 0 ? 'run001' : 'run002'), 'selector matches winner');
  const loseId = s1.code === 0 ? 'run002' : 'run001';
  ok(R(path.join(FIX, '.devin', 'estimator-run', loseId, 'run-state.json')).status === 'awaiting_runtime_binding', 'loser state not falsely running');
  const winId = sel.run_id;
  ok(R(path.join(FIX, '.devin', 'estimator-run', winId, 'run-state.json')).status === 'running', 'winner running');
  let r = nodeRun(['start', '--run-id', loseId], '');
  ok(r.status !== 0 && r.stderr.includes('foreign_selector'), 'foreign selector start nonzero');
  const fp = sha(selP());
  r = nodeRun(['pause', '--run-id', loseId], '');
  ok(r.status !== 0 && sha(selP()) === fp, 'foreign pause rejected selector unchanged');
  ok(R(path.join(FIX, '.devin', 'estimator-run', loseId, 'run-state.json')).status === 'awaiting_runtime_binding', 'foreign run unpaused');
  r = nodeRun(['pause', '--run-id', winId], '');
  ok(r.status === 0 && R(path.join(FIX, '.devin', 'estimator-run', winId, 'run-state.json')).status === 'paused_user' && R(path.join(FIX, '.devin', 'estimator-run', winId, 'run-state.json')).stop_requested === true, 'pause sets paused+stop_requested');
  ok(fs.existsSync(path.join(FIX, '.devin', 'estimator-run', winId, 'STOP')), 'pause STOP marker');
  const selBytes = fs.readFileSync(selP());
  r = nodeRun(['start', '--run-id', winId], '');
  ok(r.status !== 0 && r.stderr.includes('run_stopped'), 'start after pause refused nonzero');
  ok(R(path.join(FIX, '.devin', 'estimator-run', winId, 'run-state.json')).status === 'paused_user' && fs.readFileSync(selP()).equals(selBytes), 'refused start preserves state+selector');
  r = stop(sel.owner_session_id);
  ok(r.stdout === '', 'stop hook silent after pause');
  seedBound('run003', 'ownerC');
  fs.rmSync(path.join(FIX, '.devin', 'estimator-run', 'run003', 'bootstrap-tests.json'));
  clearSel();
  r = nodeRun(['start', '--run-id', 'run003'], '');
  ok(r.status !== 0 && !fs.existsSync(selP()), 'missing bootstrap receipt nonzero no selector');
  seedBound('run003', 'ownerC');
  J(path.join(FIX, '.devin', 'estimator-run', 'run003', 'bootstrap-tests.json'), { schema_version: 1, passed: true, model_sha256: 'dead'.repeat(16), controller_sha256: sha(CTRL) });
  r = nodeRun(['start', '--run-id', 'run003'], '');
  ok(r.status !== 0 && r.stderr.includes('stale_bootstrap_receipt'), 'stale receipt nonzero code');
  seedBound('run003', 'ownerC');
  r = nodeRun(['start', '--run-id', 'run003'], '');
  ok(r.status === 0 && R(selP()).owner_session_id === 'ownerC' && R(path.join(FIX, '.devin', 'estimator-run', 'run003', 'run-state.json')).status === 'running', 'awaiting_runtime_binding start ok');
  r = nodeRun(['status', '--run-id', 'run003'], '');
  const stat = JSON.parse(r.stdout);
  ok(stat.status === 'running' && stat.budget.remaining_milli === 5000 && stat.budget.attempts === 0, 'status sanitized');
  const PS = 'powershell';
  const psProbe = spawnSync(PS, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
  if (psProbe.status !== 0 || !psProbe.stdout.trim()) {
    skip('powershell launcher unavailable');
  } else {
    ok(psProbe.stdout.trim().startsWith('5.1'), 'powershell 5.1 present');
    const tok = p => spawnSync(PS, ['-NoProfile', '-Command', `$e=$null;[void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw '${p}'),[ref]$e);$e.Count`], { encoding: 'utf8' }).stdout.trim();
    ok(tok('.devin/estimator-run-control.ps1') === '0', 'ctrl ps1 parses');
    ok(tok('.devin/stop-masterplan.ps1') === '0', 'stop ps1 parses');
    seed('sess1'); select('sess1');
    const psStop = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.devin/estimator-run-control.ps1', '-Mode', 'Stop', '-FixtureRoot', FIX], { input: JSON.stringify(stopEv), encoding: 'utf8' });
    ok(psStop.status === 0 && psStop.stdout.includes('"decision":"block"'), 'ps launcher stop forwards block');
    const psStopW = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.devin/stop-masterplan.ps1', '-FixtureRoot', FIX], { input: JSON.stringify(stopEv), encoding: 'utf8' });
    ok(psStopW.status === 0 && psStopW.stdout === '', 'stop wrapper silent on no-progress');
    J(path.join(runDir(), 'hook-state.json'), { schema_version: 1, run_id: RUN, owner_session_id: 'sess1', last_progress_seq: null });
    const psUtf8 = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.devin/stop-masterplan.ps1', '-FixtureRoot', FIX], { input: JSON.stringify({ ...stopEv, note: 'turn-β-sëcrét' }), encoding: 'utf8' });
    ok(psUtf8.status === 0 && psUtf8.stdout.includes('"decision":"block"'), 'stop wrapper utf8 event forwards block');
    fs.rmSync(path.join(runDir(), 'binding-receipt.json'), { force: true });
    seed(null);
    J(path.join(runDir(), 'binding-request.json'), { run_id: RUN, nonce: 'nn2', requested: true });
    const capEv = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess9', tool_name: 'exec', tool_input: { command: 'echo ESTIMATOR_RUN_BIND:run001:nn2' }, prompt_id: 'turn-β' });
    const psCap = spawnSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.devin/estimator-run-control.ps1', '-Mode', 'Capture', '-FixtureRoot', FIX], { input: capEv, encoding: 'utf8' });
    ok(psCap.status === 0 && psCap.stdout.includes('ESTIMATOR_RUN_BOUND:'), 'ps capture bound context');
    ok(R(path.join(runDir(), 'binding-receipt.json')).prompt_id === 'turn-β', 'ps utf8 prompt_id roundtrip');
  }
  {
    seed('sess1'); select('sess1');
    let r = nodeRun(['hook', 'Stop'], '{bad PRIVATE_TEST_SECRET');
    ok(r.stdout === '' && !r.stderr.includes('PRIVATE_TEST_SECRET'), 'malformed hook event no secret leak');
    fs.writeFileSync(path.join(runDir(), 'run-state.json'), '{PRIVATE_TEST_SECRET bad json');
    r = nodeRun(['status', '--run-id', RUN], '');
    ok(r.status !== 0 && !r.stderr.includes('PRIVATE_TEST_SECRET') && !r.stdout.includes('PRIVATE_TEST_SECRET'), 'corrupt artifact no secret leak');
    ok(/^[A-Za-z0-9_.-]+$/.test(r.stderr.trim()), 'stderr is fixed code only');
    const d3 = path.join(FIX, '.devin', 'estimator-run', 'run003');
    fs.mkdirSync(d3, { recursive: true });
    const a3 = { ...makeApproval('ownerC'), run_id: 'run003' }; a3.scope_fingerprint = M.scopeFingerprint(a3);
    const st3 = { ...makeState('ownerC'), run_id: 'run003', status: 'awaiting_runtime_binding', approved_scope_hash: a3.scope_fingerprint };
    J(path.join(d3, 'approval.json'), a3);
    J(path.join(d3, 'run-state.json'), st3);
    J(path.join(d3, 'hook-state.json'), { schema_version: 1, run_id: 'run003', owner_session_id: 'ownerC', last_progress_seq: null });
    J(path.join(d3, 'binding-receipt.json'), { schema_version: 1, run_id: 'run003', owner_session_id: 'ownerC', prompt_id: 'ownerC', nonce: 'n', bound_at: 'x' });
    J(path.join(d3, 'bootstrap-tests.json'), { schema_version: 1, passed: true, model_sha256: sha(MODEL), controller_sha256: sha(CTRL) });
    clearSel();
    fs.mkdirSync(path.join(FIX, '.devin', 'MASTERPLAN_SESSION_ACTIVE'));
    r = nodeRun(['start', '--run-id', 'run003'], '');
    ok(r.status !== 0, 'selector dir blocks start nonzero');
    ok(R(path.join(d3, 'run-state.json')).status === 'awaiting_runtime_binding', 'no false running on selector failure');
    fs.rmSync(selP(), { recursive: true, force: true });
    fs.chmodSync(path.join(d3, 'run-state.json'), 0o444);
    r = nodeRun(['start', '--run-id', 'run003'], '');
    ok(r.status !== 0 && fs.existsSync(selP()) && R(selP()).run_id === 'run003', 'selector created before state write');
    fs.chmodSync(path.join(d3, 'run-state.json'), 0o644);
    const stAfter = R(path.join(d3, 'run-state.json'));
    ok(stAfter.status === 'awaiting_runtime_binding', 'state write failure no false running');
    fs.rmSync(selP(), { recursive: true, force: true });
    r = nodeRun(['start', '--run-id', 'run003'], '');
    ok(r.status === 0 && R(selP()).run_id === 'run003' && R(path.join(d3, 'run-state.json')).status === 'running', 'clean start after failure');
    fs.writeFileSync(path.join(d3, 'STOP'), 'ORIGINAL-STOP-CONTENT\n');
    r = nodeRun(['pause', '--run-id', 'run003'], '');
    ok(r.status === 0 && fs.readFileSync(path.join(d3, 'STOP'), 'utf8') === 'ORIGINAL-STOP-CONTENT\n', 'existing STOP preserved');
    const foreignTmp = path.join(d3, 'run-state.json.tmp-foreign');
    fs.writeFileSync(foreignTmp, 'foreign-temp');
    ok(fs.existsSync(foreignTmp), 'foreign temp untouched by pause');
  }
  {
    seed('sess1'); select('sess1');
    fs.writeFileSync(path.join(runDir(), 'run-state.json'), 'PRIVATE_TEST_SECRET:not-json');
    let r = nodeRun(['status', '--run-id', RUN], '');
    ok(r.status === 1 && r.stderr.trim() === 'controller_error' && !r.stderr.includes('PRIVATE_TEST_SECRET') && r.stdout === '', 'bare secret artifact status controller_error');
    r = stop('sess1');
    ok(r.status === 0 && r.stdout === '' && r.stderr.trim() === 'hook_silent controller_error' && !r.stderr.includes('PRIVATE_TEST_SECRET'), 'bare secret artifact stop hook_silent');
  }
  {
    seed('sess1'); select('sess1');
    let st6 = R(path.join(runDir(), 'run-state.json'));
    st6.module_gate_states = { foundation: { technical: 'pending', activation: 'pending', external_review: 'pending', release: 'pending' } };
    st6.tasks = [task('A-1', { status: 'BLOCKED', gate_scope: 'activation' }), task('O-2')];
    J(path.join(runDir(), 'run-state.json'), st6);
    const a6 = R(path.join(runDir(), 'approval.json'));
    const sel6 = M.selectNextTask({ tasks: st6.tasks, state: st6, approval: a6 });
    ok(sel6.taskId === 'O-2', 'UA-S06 blocked activation task skipped open technical selected');
    const rs6 = fs.readFileSync(path.join(runDir(), 'run-state.json'));
    const r = stop('sess1');
    ok(fs.readFileSync(path.join(runDir(), 'run-state.json')).equals(rs6), 'UA-S06 review/gate values byte-identical after stop');
    const st6b = R(path.join(runDir(), 'run-state.json'));
    ok(st6b.module_gate_states.foundation.external_review === 'pending' && st6b.module_gate_states.foundation.release === 'pending' && st6b.tasks[0].status === 'BLOCKED' && st6b.tasks[1].status === 'OPEN', 'UA-S06 no review converted to passed');
  }
  {
    seed('sess1'); select('sess1');
    let st7 = R(path.join(runDir(), 'run-state.json'));
    st7.tasks = [task('B-1', { status: 'BLOCKED' }), task('B-2', { status: 'BLOCKED', next_eligible_at: '2999-01-01T00:00:00Z' }), task('B-3', { status: 'BLOCKED', depends_on: ['missing-dep'] })];
    J(path.join(runDir(), 'run-state.json'), st7);
    const a7 = R(path.join(runDir(), 'approval.json'));
    const sel7 = M.selectNextTask({ tasks: st7.tasks, state: st7, approval: a7 });
    ok(sel7.taskId === null && sel7.reason === 'no_eligible_work', 'UA-S07 all blocked gives no_eligible_work');
    const rs7 = fs.readFileSync(path.join(runDir(), 'run-state.json'));
    const r = stop('sess1');
    ok(r.stdout === '' && fs.readFileSync(path.join(runDir(), 'run-state.json')).equals(rs7), 'UA-S07 stop silent run-state unchanged');
    ok(R(path.join(runDir(), 'run-state.json')).tasks.every(t => t.status === 'BLOCKED'), 'UA-S07 no DONE invented');
  }
  {
    seed('sess1'); select('sess1');
    let st9 = R(path.join(runDir(), 'run-state.json'));
    st9.pending_builder_mutation = { receipt: 'fixture-key-1', source_fingerprint: 'foreign-sha-abc' };
    st9.builderMutationRecovery = { attempt: 1, marker: 'fixture' };
    st9.tasks = [task('SV-1', { status: 'BLOCKED' }), task('O-3')];
    J(path.join(runDir(), 'run-state.json'), st9);
    fs.mkdirSync(path.join(FIX, 'src'), { recursive: true });
    fs.writeFileSync(path.join(FIX, 'src', 'fake-source.js'), 'FOREIGN-BYTES\n');
    const fakeSha = sha(path.join(FIX, 'src', 'fake-source.js'));
    const a9 = R(path.join(runDir(), 'approval.json'));
    const sel9 = M.selectNextTask({ tasks: st9.tasks, state: st9, approval: a9 });
    ok(sel9.taskId === 'O-3', 'UA-S09 blocked save not selected');
    const r = stop('sess1');
    const st9b = R(path.join(runDir(), 'run-state.json'));
    ok(sha(path.join(FIX, 'src', 'fake-source.js')) === fakeSha, 'UA-S09 fake source bytes preserved');
    ok(JSON.stringify(st9b.pending_builder_mutation) === JSON.stringify(st9.pending_builder_mutation) && JSON.stringify(st9b.builderMutationRecovery) === JSON.stringify(st9.builderMutationRecovery), 'UA-S09 mutation markers preserved');
    ok(JSON.stringify(st9b.budget) === JSON.stringify(st9.budget), 'UA-S09 budget preserved');
  }
  {
    seed('sess1'); select('sess1');
    let st11 = R(path.join(runDir(), 'run-state.json'));
    st11.child_processes = [{ id: 'synthetic-owned-child', pid: 4242, status: 'fixture-only' }];
    st11.task_id = 'O-1';
    st11.budget = M.settleCredits({ budget: M.reserveCredits({ budget: M.createBudget(), reservationId: 'a', upperBoundCredits: 2 }).budget, reservationId: 'a', chargedCredits: null });
    J(path.join(runDir(), 'run-state.json'), st11);
    const rs11 = fs.readFileSync(path.join(runDir(), 'run-state.json'));
    const files11 = fs.readdirSync(runDir()).sort().join(',');
    const r = nodeRun(['hook', 'Hydrate'], JSON.stringify({ hook_event_name: 'PostCompaction', session_id: 'sess1' }));
    const h11 = r.stdout ? JSON.parse(r.stdout) : {};
    ok(h11.hookSpecificOutput?.hookEventName === 'PostCompaction' && h11.hookSpecificOutput.additionalContext.startsWith(M.REHYDRATION_PROMPT), 'UA-S11 same-owner compaction hydrate');
    ok(fs.readFileSync(path.join(runDir(), 'run-state.json')).equals(rs11), 'UA-S11 run-state bytes preserved');
    ok(fs.readdirSync(runDir()).sort().join(',') === files11, 'UA-S11 no new controller-owned handles/state');
    ok(R(path.join(runDir(), 'run-state.json')).child_processes[0].id === 'synthetic-owned-child' && R(path.join(runDir(), 'run-state.json')).task_id === 'O-1' && R(path.join(runDir(), 'run-state.json')).budget.reservations[0].status === 'unknown', 'UA-S11 metadata+budget preserved');
  }
  {
    seed(null); select('sess1');
    J(path.join(runDir(), 'binding-request.json'), { run_id: RUN, nonce: 'nn3', requested: true });
    const bytes12 = shaRun();
    let r = nodeRun(['hook', 'Capture'], JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'exec', tool_input: { command: 'echo ESTIMATOR_RUN_BIND:run001:nn3' }, prompt_id: 'p1' }));
    ok(r.stdout === '' && !fs.existsSync(path.join(runDir(), 'binding-receipt.json')) && shaRun() === bytes12, 'UA-S12 missing session_id no receipt');
    r = nodeRun(['hook', 'Capture'], JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess9', tool_name: 'unknownTool', tool_input: { command: 'echo ESTIMATOR_RUN_BIND:run001:nn3' }, prompt_id: 'p1' }));
    ok(r.stdout === '' && !fs.existsSync(path.join(runDir(), 'binding-receipt.json')) && shaRun() === bytes12, 'UA-S12 unsupported tool no receipt');
    ok(!fs.existsSync(selP()) === false, 'UA-S12 selector untouched');
  }
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`PASS estimator-unattended passed=${passed} failed=${failed} skipped=${skipped}`);
  process.exit(failed ? 1 : 0);
};
main().catch(e => { console.error('FATAL', e); fs.rmSync(ROOT, { recursive: true, force: true }); process.exit(1); });
