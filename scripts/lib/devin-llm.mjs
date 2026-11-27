// devin-llm.mjs — Devin headless extraction bridge via `devin.exe acp`.
//
// The bundled CLI's REPL path (-p/models/auth status) rejects its own stored
// windsurf credential — a build bug. The ACP path is what the IDE itself uses:
// credentials arrive from the ACP host via `authenticate` (methodId
// 'windsurf-api-key', meta {api_key, api_server_url}). This module is a
// minimal ACP host: one persistent `devin.exe acp` process per slot (local
// agent — never --cloud), session/new once, session/prompt per batch.
//
// File-queue protocol (unchanged for callers):
//   caller  → .audit-work/extract-queue/<unitId>.json  {id, prompt, schema}
//   wrapper → ACP prompt with ≤BATCH units inline (ask mode — text only)
//   wrapper → .audit-work/extract-out/<unitId>.json    (bare JSON object)
//
// Concurrency: ≤MAX_SESSIONS persistent ACP processes per process-pool.
// Per-batch watchdog kills the session (process stays) — units never lost.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, openSync } from 'node:fs';
import { join } from 'node:path';

const DEVIN_EXE = process.env.DEVIN_EXE || 'C:/Users/BrettHeinlein/AppData/Local/Programs/Devin/resources/app/extensions/windsurf/devin/bin/devin.exe';
const CREDS = 'C:/Users/BrettHeinlein/AppData/Roaming/devin/credentials.toml';
const REPO = 'C:/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean';
const DIR = '.audit-work';
// Per-consumer queues — each worker owns its own <name>-queue/<name>-out so
// two drainers can never steal each other's units.
const QUEUE_NAME = process.env.DEVIN_LLM_QUEUE || 'extract';
const QUEUE = `${DIR}/${QUEUE_NAME}-queue`;
const OUT = `${DIR}/${QUEUE_NAME}-out`;
const MODEL = process.env.DEVIN_LLM_MODEL || 'swe-2.1';
const MODEL_FALLBACK = 'swe';
const MAX_SESSIONS = Number(process.env.DEVIN_LLM_SESSIONS || 2);
const BATCH = Number(process.env.DEVIN_LLM_BATCH || 10);
const SESSION_MS = 15 * 60 * 1000;
const ARCHIVE = `${DIR}/devin-llm-archive`;
for (const d of [QUEUE, OUT, ARCHIVE]) { try { mkdirSync(d, { recursive: true }); } catch {} }

// Session archive — every completed unit appends to a per-session jsonl so a
// finished/crashed session leaves a durable record of what it did, prompts
// and outputs intact. Files live at .audit-work/devin-llm-archive/<id>.jsonl.
function archiveUnit(sessionId, rec) {
  if (!sessionId) return;
  try { appendFileSync(join(ARCHIVE, `${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`), JSON.stringify({ t: Date.now(), ...rec }) + '\n'); } catch {}
}

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'devin-llm', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let authState = 'unknown';

function readCreds() {
  try {
    const t = readFileSync(CREDS, 'utf8');
    const key = (t.match(/windsurf_api_key\s*=\s*"([^"]+)"/) || [])[1];
    const url = (t.match(/api_server_url\s*=\s*"([^"]+)"/) || [])[1] || 'https://server.codeium.com';
    return key ? { api_key: key, api_server_url: url } : null;
  } catch { return null; }
}

// ── queue primitives ──────────────────────────────────────────────────────
export function enqueueUnit(unit) {
  const id = String(unit.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
  if (!id) throw new Error('devin-llm unit needs an id');
  const path = join(QUEUE, `${id}.json`);
  if (existsSync(join(OUT, `${id}.json`))) return { id, already: true };
  writeFileSync(path, JSON.stringify({ id, prompt: unit.prompt, schema: unit.schema, kind: unit.kind || 'generic', meta: unit.meta || null }));
  return { id, queued: true };
}

export function outputFor(id) {
  const p = join(OUT, `${id}.json`);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8').trim();
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*|```\s*$/g, '').trim());
    // Wrapped files carry the consumed unit's meta alongside the output.
    if (json && typeof json === 'object' && 'output' in json && '__meta' in json) return { id, output: json.output, meta: json.__meta };
    return { id, output: json };
  } catch { return { id, output: null, malformed: true }; }
}

export function clearUnit(id) {
  for (const p of [join(QUEUE, `${id}.json`), join(OUT, `${id}.json`)]) { try { unlinkSync(p); } catch {} }
}

export function queueDepth() {
  try { return readdirSync(QUEUE).filter((f) => f.endsWith('.json')).length; } catch { return 0; }
}

// ── persistent ACP session ────────────────────────────────────────────────
// One devin.exe acp process; MCP-server boot cost paid once. Each batch is a
// session/prompt call. On any transport failure the process is respawned.
// Session spawn pacing — the ACP host throttles bursts (eight simultaneous
// `devin.exe acp` launches get "agent is shutting down" on session/new).
// One fresh session every few seconds; the loser's units just re-queue.
let lastSpawnAt = 0;
const SPAWN_GAP_MS = 8000;

class AcpWorker {
  constructor() { this.child = null; this.buf = ''; this.rpcId = 0; this.pending = new Map(); this.reply = ''; this.busy = false; this.model = MODEL; this.resolvedModel = null; }

  async ensure() {
    if (this.child && !this.child.killed) return true;
    if (Date.now() - lastSpawnAt < SPAWN_GAP_MS) { this.spawnPacedUntil = lastSpawnAt + SPAWN_GAP_MS; return false; }
    lastSpawnAt = Date.now();
    // The acp server treats WINDSURF_EXT_HOST_PID as the parent process it
    // must outlive — an inherited stale pid (an ext host that since exited)
    // makes it cancel every prompt and shut down ~2s in. Point it at the
    // worker's own pid: worker death still reaps the session, and a live
    // worker keeps it alive.
    const env = { ...process.env, WINDSURF_EXT_HOST_PID: String(process.pid) };
    this.child = spawn(DEVIN_EXE, ['acp', '--model', this.model], { cwd: REPO, windowsHide: true, env });
    // A write to a dead child's stdin fails ASYNC (EPIPE/EOF 'error' event),
    // not as a throw — without a handler it crashes the whole worker.
    this.child.stdin.on('error', () => {});
    this.buf = ''; this.pending = new Map(); this.reply = '';
    const child = this.child;
    child.stdout.on('data', (d) => {
      this.buf += d.toString();
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim(); this.buf = this.buf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id != null && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); continue; }
        if (msg.method === 'session/update') {
          const u = msg.params?.update;
          const content = u?.content;
          const texts = (Array.isArray(content) ? content : [content]).map((c) => c?.text || c?.content?.text || '').filter(Boolean);
          this.reply += texts.join('');
          continue;
        }
        // host-side requests: auto-allow permission, empty-serve the rest
        if (msg.id != null && msg.method === 'session/request_permission') {
          this.sendRaw({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'selected', optionId: 'allow_once' } } });
        } else if (msg.id != null && typeof msg.method === 'string' && !msg.method.startsWith('_')) {
          this.sendRaw({ jsonrpc: '2.0', id: msg.id, result: {} });
        }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => { this.flushAll({ error: { message: 'spawn error' } }); this.child = null; });
    child.on('close', () => { this.flushAll({ error: { message: 'acp closed' } }); this.child = null; });
    try {
      const init = await this.send('initialize', { protocolVersion: 1, clientInfo: { name: 'ccs-extractor', version: '1.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
      if (init.error) throw new Error(init.error.message);
      const creds = readCreds();
      if (!creds) throw new Error('no_credentials');
      const meta = { api_key: creds.api_key, api_server_url: creds.api_server_url };
      const auth = await this.send('authenticate', { methodId: 'windsurf-api-key', meta, _meta: meta });
      if (auth.error) throw new Error(auth.error.message);
      const sn = await this.send('session/new', { cwd: REPO, mcpServers: [] });
      this.sessionId = sn?.result?.sessionId || sn?.result?.id;
      if (!this.sessionId) throw new Error(JSON.stringify(sn?.error || 'no sessionId').slice(0, 150));
      // Report the model the session actually resolved — swe-2.1 is preferred;
      // an unresolvable model id falls back to 'swe' once per process.
      this.resolvedModel = sn?.result?.model || sn?.result?.modelId || sn?.result?.currentModel
        || sn?.result?.configOptions?.model || sn?.result?.configOptions?.modelId
        || (Array.isArray(sn?.result?.models) ? sn.result.models.find((m) => m.current || m.selected)?.modelId : null)
        || this.model;
      emit({ stage: 'devin_session', ok: true, detail: `acp session ${this.sessionId} — model ${this.resolvedModel}${this.resolvedModel !== this.model ? ` (requested ${this.model})` : ''}` });
      if (this.model !== MODEL_FALLBACK && this.resolvedModel && this.resolvedModel !== this.model) {
        this.model = MODEL_FALLBACK;
        emit({ stage: 'devin_session', ok: true, detail: `model '${this.resolvedModel}' ≠ '${MODEL}' — next session requests '${MODEL_FALLBACK}'` });
      }
      // ask mode: text-only replies — no tool detours during extraction
      await this.send('session/set_mode', { sessionId: this.sessionId, modeId: 'ask' }).catch(() => {});
      return true;
    } catch (e) { try { child.kill('SIGKILL'); } catch {} this.child = null; throw e; }
  }

  flushAll(errMsg) { for (const [, res] of this.pending) res(errMsg); this.pending.clear(); }
  sendRaw(obj) { try { this.child.stdin.write(JSON.stringify(obj) + '\n'); } catch {} }
  send(method, params) {
    return new Promise((res) => {
      const id = ++this.rpcId;
      this.pending.set(id, res);
      this.sendRaw({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); res({ error: { message: 'rpc timeout' } }); } }, SESSION_MS);
    });
  }

  async prompt(text) {
    if (!(await this.ensure())) return { ok: false, error: 'no session' };
    this.reply = '';
    const pr = await this.send('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text }] });
    if (pr.error) { const c = this.child; this.child = null; try { c?.kill('SIGKILL'); } catch {}; return { ok: false, error: pr.error.message, retryable: Boolean(pr.error?.data?.['cognition.ai/retryable']), reply: this.reply }; }
    return { ok: true, reply: this.reply, stopReason: pr?.result?.stopReason };
  }
}

// Session pool grows on demand — the controller's guard scales the target
// (1–8) with memory/commit/CPU gates, exactly like researcher scaling.
// Culling is newest-first; a busy session finishes its batch, then drops.
const workers = [];
const unitOwner = new Map(); // unit id → session index that produced its out file
export const sessionFor = (uid) => unitOwner.get(String(uid));
let sessionTarget = MAX_SESSIONS;
export function setSessionTarget(n) { sessionTarget = Math.max(0, Math.floor(Number(n) || 0)); ensureWorkerPool(); }
export function sessionTargetNow() { return sessionTarget; }
function ensureWorkerPool() {
  while (workers.length < sessionTarget) workers.push(new AcpWorker());
  for (let i = workers.length - 1; i >= sessionTarget; i--) {
    if (workers[i].busy) continue; // let it finish; culled on the next pass
    try { workers[i].child?.kill('SIGKILL'); } catch {}
    workers.splice(i, 1);
  }
}
// Recover units orphaned by a crash: *.json.claim-* files are renamed back.
function recoverClaims() {
  try {
    for (const f of readdirSync(QUEUE)) {
      const m = f.match(/^(.*\.json)\.claim-\d+$/);
      if (m) {
        try {
          // A crash/restart can happen after the out file is written but
          // before the claim is deleted. The answer already exists then —
          // discard the orphaned claim instead of re-running the same unit.
          if (existsSync(join(OUT, m[1]))) unlinkSync(join(QUEUE, f));
          else renameSync(join(QUEUE, f), join(QUEUE, m[1]));
        } catch {}
      }
    }
  } catch {}
}
recoverClaims();

export async function probeAuth() {
  if (authState !== 'unknown') return authState;
  authState = readCreds() ? 'ok' : 'needed';
  if (authState === 'needed') emit({ stage: 'devin_auth_needed', ok: false, detail: 'credentials.toml missing windsurf key — run devin.exe auth login (browser)' });
  return authState;
}

const BATCH_PROMPT = (units) => [
  'You are a batch extraction worker. UNITS is a JSON array; each unit has {id, prompt, schema}.',
  'For EACH unit, in order: perform the task described by its "prompt", producing an "output" object that matches its "schema".',
  'Respond with ONLY this JSON — no markdown fences, no commentary:',
  '{"results":[{"id":"<unit id>","output":{...}}]}',
  'If a unit is impossible, set its output to {"error":"<reason>"}.',
  'UNITS:',
  JSON.stringify(units),
].join('\n');

function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, str = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && str) { esc = true; continue; }
    if (c === '"') str = !str;
    if (str) continue;
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

// Lane priority ordering, exported for ordering tests.
export const queueLaneRank = (f) => f.startsWith('judge-') ? 0 : f.startsWith('audit-') ? 1 : f.startsWith('adjudicate-') ? 2 : 3;

// ── the batch call — one prompt on a persistent session ───────────────────
// Units are claimed by renaming queue files first, so two parallel sessions
// can never read the same unit (per-session claim files).
export async function runBatch(w) {
  const auth = await probeAuth();
  if (auth !== 'ok') return { lane: 'auth', spawned: false };
  if (!w) { w = workers.find((x) => !x.busy); if (!w) return { lane: 'busy', spawned: false }; }
  const widx = workers.indexOf(w);
  const claimed = [];
  let qfiles = [];
  try { qfiles = readdirSync(QUEUE).filter((f) => f.endsWith('.json')); } catch { return { lane: 'empty', spawned: false }; }
  // Lane priority: promotion judges first (they unblock authority writes),
  // record audits second, needs-review adjudication last. Within a lane the
  // lexical order is stable FIFO enough for these hash-keyed unit names.
  qfiles.sort((a, z) => queueLaneRank(a) - queueLaneRank(z) || a.localeCompare(z));
  for (const f of qfiles) {
    if (claimed.length >= BATCH) break;
    try { renameSync(join(QUEUE, f), join(QUEUE, `${f}.claim-${widx}`)); claimed.push(f); } catch {}
  }
  if (!claimed.length) return { lane: 'empty', spawned: false };
  const unclaim = () => { for (const f of claimed) { try { renameSync(join(QUEUE, `${f}.claim-${widx}`), join(QUEUE, f)); } catch {} } };
  w.busy = true;
  try {
    const units = [];
    for (const f of claimed) { try { const u = JSON.parse(readFileSync(join(QUEUE, `${f}.claim-${widx}`), 'utf8')); units.push(u); unitOwner.set(String(u.id), widx); } catch {} }
    if (!units.length) { unclaim(); return { lane: 'empty', spawned: false }; }
    w.currentUnits = units.map((u) => u.meta?.jurisdiction || u.id);
    w.since = Date.now(); w.reply = '';
    emit({ stage: 'devin_batch_start', detail: `${units.length} units → acp session ${widx}` });
    // A session-level failure (auth handshake, retryable server_stopping,
    // transport death) must not kill the worker — the claimed units go back
    // to the queue and a respawned session retries them next batch.
    let r;
    try { r = await w.prompt(BATCH_PROMPT(units)); }
    catch (e) { r = { ok: false, error: String(e?.message || e).slice(0, 150), reply: '' }; }
    const parsed = extractJson(r.reply);
    let produced = 0;
    const seenIds = new Set();
    if (Array.isArray(parsed?.results)) {
      for (const res of parsed.results) {
        const uid = String(res?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
        if (!uid || res?.output == null) continue;
        // The queue file is consumed at claim time, so the unit's meta rides
        // inside the out file — consumers read it back via outputFor().meta.
        const unit = units.find((u) => String(u.id) === uid);
        const file = unit?.meta ? { __meta: unit.meta, output: res.output } : res.output;
        try { writeFileSync(join(OUT, `${uid}.json`), JSON.stringify(file)); produced += 1; seenIds.add(uid); } catch {}
        archiveUnit(w.sessionId, { unit: uid, kind: 'output', output: res.output });
      }
    }
    // Archive the units that produced nothing — a session that failed or
    // short-circuited still leaves a record of what it attempted and why.
    for (const u of units) if (!seenIds.has(u.id)) archiveUnit(w.sessionId, { unit: u.id, kind: 'missed', error: r.error ? String(r.error).slice(0, 120) : 'no output in batch' });
    archiveUnit(w.sessionId, { kind: 'batch_done', units: units.length, produced, ok: r.ok, error: r.error ? String(r.error).slice(0, 120) : null });
    // Produced units leave the queue (their out file is the answer); misses
    // are unclaimed back so a later batch retries them.
    for (const u of units) {
      const f = `${String(u.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90)}.json`;
      if (seenIds.has(f.slice(0, -5))) { try { unlinkSync(join(QUEUE, `${f}.claim-${widx}`)); } catch {} }
      else { try { renameSync(join(QUEUE, `${f}.claim-${widx}`), join(QUEUE, f)); } catch {} }
    }
    emit({ stage: 'devin_batch_done', ok: r.ok && produced > 0, detail: `s${widx} ${r.error ? `err:${String(r.error).slice(0, 70)}` : r.stopReason || 'done'} — ${produced}/${units.length} outputs` });
    return { lane: 'devin', spawned: true, ok: r.ok, produced, error: r.error, session: widx };
  } finally { w.busy = false; w.currentUnits = null; }
}

export function acpInfo() {
  const w = workers.find((x) => x.resolvedModel) || workers[0];
  return {
    queue: QUEUE_NAME, sessions: workers.length, target: sessionTarget, model: w?.resolvedModel || MODEL,
    busy: workers.filter((x) => x.busy).length, alive: workers.filter((x) => x.child && !x.child.killed).length,
    // Per-session rows for the dashboard's live panel.
    detail: workers.map((x, i) => ({
      i, busy: x.busy, alive: Boolean(x.child && !x.child.killed),
      units: x.currentUnits || [], since: x.since || null,
      partial: x.busy ? String(x.reply || '').slice(-300) : null,
      model: x.resolvedModel || null,
    })),
  };
}

// Parallel drain — every free session works its own claimed batch at once.
export async function drainQueue({ maxBatches = 8, sleepMs = 3000 } = {}) {
  ensureWorkerPool();
  let batches = 0, produced = 0;
  const running = new Set();
  const launch = async () => {
    const now = Date.now();
    // Never claim a batch for a worker whose process is not even allowed to
    // spawn yet. The old selector only looked at the worker's own paced stamp;
    // on a cold pool every worker was selected at once, seven workers claimed
    // batches, six immediately failed "no session", and the transient empty
    // queue then stalled the drain behind the first long batch.
    const ready = (x) => !x.busy && ((x.child && !x.child.killed) || (!(x.spawnPacedUntil > now) && now - lastSpawnAt >= SPAWN_GAP_MS));
    const w = workers.find(ready);
    if (!w) { // all free workers are spawn-paced — wait out the gap
      const waits = workers.filter((x) => !x.busy && !x.child)
        .map((x) => Math.max(x.spawnPacedUntil || 0, lastSpawnAt + SPAWN_GAP_MS) - now)
        .filter((ms) => ms > 0);
      const wait = waits.length ? Math.min(...waits) : NaN;
      if (Number.isFinite(wait)) { await sleep(Math.min(wait + 200, SPAWN_GAP_MS + 200)); return launch(); }
      return false;
    }
    const p = runBatch(w).then((r) => {
      running.delete(p);
      if (r.lane === 'devin') { batches += 1; produced += r.produced || 0; }
      return r;
    }).catch((e) => { running.delete(p); return { lane: 'devin', ok: false, error: String(e?.message || e) }; });
    running.add(p);
    return true;
  };
  while (batches < maxBatches) {
    if (queueDepth() === 0) {
      // A parallel wave can transiently claim every visible unit. Failed
      // spawn-paced workers unclaim theirs almost immediately, so treating
      // that moment as an empty queue ends the drain after the first long
      // batch and serialises the whole pool. Wait for any in-flight claim to
      // resolve, then re-check; only a truly empty idle queue ends the loop.
      if (running.size) { await Promise.race(running); continue; }
      break;
    }
    const auth = await probeAuth();
    if (auth !== 'ok') return { lane: 'auth', batches, produced };
    if (await launch()) continue;
    if (running.size) { await Promise.race(running); continue; }
    break;
  }
  if (running.size) await Promise.all([...running]);
  return { lane: 'devin', batches, produced };
}
