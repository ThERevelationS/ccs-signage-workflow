import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import * as M from './estimator-run-model.mjs';

const MAX_JSON = 2 * 1024 * 1024;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ARTIFACTS = new Set(['approval.json', 'run-state.json', 'hook-state.json', 'credit-ledger.jsonl', 'resume.json', 'STOP', 'binding-request.json', 'binding-receipt.json', 'bootstrap-tests.json']);
const RESUMABLE = new Set(['running', 'waiting_transient']);
const PROMPT_ID_OK = v => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\x00-\x1f\x7f]/.test(v);

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const idOf = p => { const st = fs.statSync(p); return st.dev + ':' + st.ino; };
const secure = (rootAbs, ...parts) => {
  const rr = fs.realpathSync(rootAbs);
  const rootId = idOf(rr);
  const logical = path.resolve(rootAbs, ...parts);
  const missing = [];
  let cur = logical;
  while (!fs.existsSync(cur)) { missing.unshift(path.basename(cur)); cur = path.dirname(cur); }
  const real = fs.realpathSync(cur);
  let inside = false;
  for (let d = real; ; d = path.dirname(d)) {
    if (idOf(d) === rootId) { inside = true; break; }
    if (path.dirname(d) === d) break;
  }
  if (!inside) throw new Error('path_escape');
  for (let seg = cur; ; seg = path.dirname(seg)) {
    const l = fs.lstatSync(seg);
    if (l.isSymbolicLink() || fs.realpathSync(seg) !== seg) throw new Error('reparse_ancestor');
    if (idOf(seg) === rootId) break;
    if (path.dirname(seg) === seg) throw new Error('path_escape');
  }
  return path.join(real, ...missing);
};
const projectRoot = (() => {
  const fx = opt('--fixture-root');
  if (!fx) return fs.realpathSync(path.resolve(scriptDir, '..'));
  const t = fs.realpathSync(os.tmpdir());
  const r = secure(t, fx);
  if (r === t || idOf(r) === idOf(t)) throw new Error('fixture_root_not_distinct');
  if (!fs.existsSync(r)) throw new Error('fixture_root_missing');
  return fs.realpathSync(r);
})();
const runBase = () => secure(projectRoot, '.devin', 'estimator-run');
const runDirOf = runId => {
  if (!RUN_ID.test(runId)) throw new Error('invalid_run_id');
  return secure(runBase(), runId);
};
const readJson = p => {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_JSON) throw new Error('invalid_artifact');
  const raw = fs.readFileSync(p, 'utf8');
  if (raw.length > MAX_JSON) throw new Error('artifact_too_large');
  return JSON.parse(raw);
};
const readArtifact = (runId, name) => {
  if (!ARTIFACTS.has(name)) throw new Error('unknown_artifact');
  const p = secure(runDirOf(runId), name);
  if (!fs.existsSync(p)) throw new Error('missing_artifact');
  return readJson(p);
};
const writeAtomic = p => obj => {
  const tmp = p + '.tmp-' + randomUUID();
  let owned = false;
  try {
    const fd = fs.openSync(tmp, 'wx');
    owned = true;
    try { fs.writeFileSync(fd, JSON.stringify(obj, null, 2) + '\n'); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, p);
    owned = false;
  } finally { if (owned) try { fs.rmSync(tmp, { force: true }); } catch { } }
};
const withLock = (dir, fn) => {
  const lock = secure(dir, '.lock');
  const fd = fs.openSync(lock, 'wx');
  try { return fn(); } finally { fs.closeSync(fd); try { fs.unlinkSync(lock); } catch { } }
};
const shaFile = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const selectorPath = () => secure(projectRoot, '.devin', 'MASTERPLAN_SESSION_ACTIVE');
const validSelector = s => s && s.schema_version === 1 && RUN_ID.test(s.run_id ?? '') && SESSION_ID.test(s.owner_session_id ?? '');
const readStdin = () => new Promise((res, rej) => {
  let size = 0, over = false; const chunks = [];
  process.stdin.on('data', c => { size += c.length; if (size > MAX_JSON) over = true; else chunks.push(c); });
  process.stdin.on('end', () => over ? rej(new Error('event_too_large')) : res(Buffer.concat(chunks).toString('utf8')));
  process.stdin.on('error', rej);
});
const runDocs = runId => ({
  state: readArtifact(runId, 'run-state.json'),
  approval: readArtifact(runId, 'approval.json'),
  hookState: readArtifact(runId, 'hook-state.json'),
});

function hookStop(event) {
  const selP = selectorPath();
  if (!fs.existsSync(selP)) return null;
  const sel = readJson(selP);
  if (!validSelector(sel) || sel.owner_session_id !== event.session_id) return null;
  const runId = sel.run_id;
  const dir = runDirOf(runId);
  return withLock(dir, () => {
    const cur = readJson(selP);
    if (!validSelector(cur) || cur.run_id !== runId || cur.owner_session_id !== event.session_id) return null;
    if (fs.existsSync(path.join(dir, 'STOP'))) return null;
    const { state, approval, hookState } = runDocs(runId);
    const res = M.canContinue({ state, hookState, event, approval, projectRoot });
    const p = path.join(dir, 'hook-state.json');
    if (!res.continue) {
      if (res.reason === 'no_substantive_progress') {
        const hs = readJson(p);
        hs.last_no_progress_reason = 'no_substantive_progress';
        writeAtomic(p)(hs);
      }
      return null;
    }
    const hs = readJson(p);
    if (!(hs.last_progress_seq === null || res.progress_seq > hs.last_progress_seq)) return null;
    hs.last_progress_seq = res.progress_seq;
    writeAtomic(p)(hs);
    return { decision: 'block', reason: M.CONTINUATION_PROMPT };
  });
}

function hookHydrate(event) {
  if (event.hook_event_name !== 'SessionStart' && event.hook_event_name !== 'PostCompaction') return null;
  const selP = selectorPath();
  if (!fs.existsSync(selP)) return null;
  const sel = readJson(selP);
  if (!validSelector(sel) || sel.owner_session_id !== event.session_id) return null;
  const runId = sel.run_id;
  const dir = runDirOf(runId);
  if (fs.existsSync(path.join(dir, 'STOP'))) return null;
  const { state, approval } = runDocs(runId);
  if (state.stop_requested === true || !RESUMABLE.has(state.status)) return null;
  if (!M.validateRunState({ state, approval, sessionId: event.session_id, projectRoot }).ok) return null;
  return { hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext: M.REHYDRATION_PROMPT + ' Artifacts: .devin/estimator-run/' + runId + '/' } };
}

function hookCapture(event) {
  if (event.hook_event_name !== 'PreToolUse') return null;
  const tn = event.tool_name ?? event.tool;
  if (tn !== 'exec' && tn !== 'functions.exec') return null;
  const cmd = typeof event.tool_input?.command === 'string' ? event.tool_input.command : '';
  const m = /ESTIMATOR_RUN_BIND:([A-Za-z0-9][A-Za-z0-9_-]{0,79}):([A-Za-z0-9_-]{1,128})/.exec(cmd);
  if (!m || !SESSION_ID.test(event.session_id ?? '')) return null;
  const runId = m[1], nonce = m[2], sessionId = event.session_id;
  const promptId = PROMPT_ID_OK(event.prompt_id) ? event.prompt_id : null;
  const dir = runDirOf(runId);
  return withLock(dir, () => {
    const req = readArtifact(runId, 'binding-request.json');
    const approval = readArtifact(runId, 'approval.json');
    const state = readArtifact(runId, 'run-state.json');
    if (!req || req.run_id !== runId || req.nonce !== nonce || req.requested !== true) return null;
    if (![approval.owner_session_id, state.owner_session_id].every(o => o === null || o === sessionId)) return null;
    const ok = M.validateRunState({ state: { ...state, owner_session_id: sessionId }, approval: { ...approval, owner_session_id: sessionId }, sessionId, projectRoot }).ok;
    if (!ok) return null;
    const recP = path.join(dir, 'binding-receipt.json');
    if (fs.existsSync(recP)) {
      const ex = readJson(recP);
      if (ex.schema_version !== 1 || ex.run_id !== runId || ex.owner_session_id !== sessionId || ex.nonce !== nonce) return null;
    } else {
      writeAtomic(recP)({ schema_version: 1, run_id: runId, owner_session_id: sessionId, prompt_id: promptId, nonce, bound_at: new Date().toISOString() });
    }
    const chk = readJson(recP);
    if (chk.schema_version !== 1 || chk.run_id !== runId || chk.owner_session_id !== sessionId || chk.nonce !== nonce) return null;
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'ESTIMATOR_RUN_BOUND: ' + JSON.stringify({ run_id: runId, owner_session_id: sessionId, nonce, prompt_id: chk.prompt_id ?? null }) } };
  });
}

function cmdStatus(runId) {
  const { state } = runDocs(runId);
  const budget = M.inspectBudget(state.budget);
  return { run_id: runId, status: state.status, active_module: state.active_module, progress_seq: state.progress_seq, worker_count: state.worker_count, budget: { consumed_milli: budget.consumed_milli, remaining_milli: budget.remaining_milli, attempts: budget.attempts } };
}

function cmdStart(runId) {
  const base = runBase();
  fs.mkdirSync(base, { recursive: true });
  const selLock = secure(base, '.selector.lock');
  const selFd = fs.openSync(selLock, 'wx');
  try {
    const dir = runDirOf(runId);
    return withLock(dir, () => {
      const st = readJson(path.join(dir, 'run-state.json'));
      const approval = readJson(path.join(dir, 'approval.json'));
      const hookState = readJson(path.join(dir, 'hook-state.json'));
      const receipt = readJson(path.join(dir, 'binding-receipt.json'));
      const boot = readJson(path.join(dir, 'bootstrap-tests.json'));
      const selP = selectorPath();
      if (fs.existsSync(path.join(dir, 'STOP')) || st.stop_requested === true) throw new Error('run_stopped');
      const owner = receipt.owner_session_id;
      if (receipt.schema_version !== 1 || receipt.run_id !== runId || !SESSION_ID.test(owner ?? '')) throw new Error('unbound_or_invalid_receipt');
      if (st.owner_session_id !== owner || approval.owner_session_id !== owner || hookState.owner_session_id !== owner) throw new Error('bound_owner_mismatch');
      const v = M.validateRunState({ state: st, approval, sessionId: owner, projectRoot });
      if (!v.ok) throw new Error(v.reason);
      const mh = shaFile(path.join(projectRoot, '.devin', 'estimator-run-model.mjs'));
      const ch = shaFile(path.join(projectRoot, '.devin', 'estimator-run-control.mjs'));
      if (boot.schema_version !== 1 || boot.passed !== true || boot.model_sha256 !== mh || boot.controller_sha256 !== ch) throw new Error('stale_bootstrap_receipt');
      if (fs.existsSync(selP)) {
        const s = readJson(selP);
        if (!validSelector(s) || s.run_id !== runId || s.owner_session_id !== owner) throw new Error('foreign_selector');
      } else {
        writeAtomic(selP)({ schema_version: 1, run_id: runId, owner_session_id: owner });
      }
      st.status = 'running';
      writeAtomic(path.join(dir, 'run-state.json'))(st);
      return { started: runId };
    });
  } finally {
    fs.closeSync(selFd);
    try { fs.unlinkSync(selLock); } catch { }
  }
}

function cmdPause(runId) {
  const dir = runDirOf(runId);
  return withLock(dir, () => {
    const selP = selectorPath();
    if (!fs.existsSync(selP)) throw new Error('no_selector');
    const sel = readJson(selP);
    if (!validSelector(sel) || sel.run_id !== runId) throw new Error('foreign_run');
    const st = readJson(path.join(dir, 'run-state.json'));
    const approval = readJson(path.join(dir, 'approval.json'));
    if (st.owner_session_id !== sel.owner_session_id || approval.owner_session_id !== sel.owner_session_id) throw new Error('owner_mismatch');
    if (!M.validateRunState({ state: st, approval, sessionId: sel.owner_session_id, projectRoot }).ok) throw new Error('invalid_state');
    if (st.status !== 'running' && st.status !== 'waiting_transient') throw new Error('not_active');
    try {
      fs.writeFileSync(path.join(dir, 'STOP'), 'user stop ' + new Date().toISOString() + '\n', { flag: 'wx' });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    st.status = 'paused_user';
    st.stop_requested = true;
    writeAtomic(path.join(dir, 'run-state.json'))(st);
    return { paused: runId };
  });
}

const SAFE_CODES = new Set(['invalid_run_id', 'path_escape', 'reparse_ancestor', 'invalid_artifact', 'artifact_too_large', 'unknown_artifact', 'missing_artifact', 'fixture_root_not_distinct', 'fixture_root_missing', 'run_stopped', 'unbound_or_invalid_receipt', 'bound_owner_mismatch', 'owner_mismatch', 'invalid_state', 'not_active', 'no_selector', 'foreign_run', 'foreign_selector', 'stale_bootstrap_receipt', 'usage_error', 'event_too_large', 'approval_required', 'scope_mismatch', 'scope_fingerprint_mismatch', 'invalid_state_version', 'project_root_mismatch', 'app_or_branch_mismatch', 'invalid_progress_state', 'invalid_credit_ledger', 'invalid_credit_receipt', 'invalid_credit_charge', 'invalid_pending_credit_charge', 'credit_cap_exceeded', 'invalid_credit_bound', 'unknown_or_zero_billable_bound', 'reservation_bound_mismatch', 'integration_budget_exhausted', 'missing_credit_reservation', 'charge_exceeds_reserved_bound', 'settled_credit_receipt_is_immutable', 'invalid_reservation_id']);
const safeCode = error => {
  const msg = String(error && error.message || '');
  if (SAFE_CODES.has(msg)) return msg;
  if (error && error.code === 'EEXIST') return 'lock_busy';
  return 'controller_error';
};

const runCli = async () => {
  if (argv[0] === 'hook') {
    try {
      const mode = argv[1];
      const raw = await readStdin();
      let event = null;
      try { event = raw.trim() ? JSON.parse(raw) : null; } catch { event = null; }
      if (!event || typeof event !== 'object') process.exit(0);
      let out = null;
      if (mode === 'Stop') out = hookStop(event);
      else if (mode === 'Hydrate') out = hookHydrate(event);
      else if (mode === 'Capture') out = hookCapture(event);
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (error) {
      try { process.stderr.write('hook_silent ' + safeCode(error) + '\n'); } catch { }
    }
    process.exit(0);
  }
  try {
    if (argv[0] === 'status') {
      const id = opt('--run-id'); if (!RUN_ID.test(id ?? '')) throw new Error('invalid_run_id');
      process.stdout.write(JSON.stringify(cmdStatus(id), null, 2));
      process.exit(0);
    }
    if (argv[0] === 'start' || argv[0] === 'pause') {
      const id = opt('--run-id'); if (!RUN_ID.test(id ?? '')) throw new Error('invalid_run_id');
      process.stdout.write(JSON.stringify(argv[0] === 'start' ? cmdStart(id) : cmdPause(id)));
      process.exit(0);
    }
    throw new Error('usage_error');
  } catch (error) {
    const code = safeCode(error);
    try { process.stderr.write(code + '\n'); } catch { }
    process.exit(1);
  }
};
runCli();
