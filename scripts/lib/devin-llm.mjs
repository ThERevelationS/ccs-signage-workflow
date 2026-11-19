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
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, openSync } from 'node:fs';
import { join } from 'node:path';

const DEVIN_EXE = process.env.DEVIN_EXE || 'C:/Users/BrettHeinlein/AppData/Local/Programs/Devin/resources/app/extensions/windsurf/devin/bin/devin.exe';
const CREDS = 'C:/Users/BrettHeinlein/AppData/Roaming/devin/credentials.toml';
const REPO = 'C:/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean';
const DIR = '.audit-work';
const QUEUE = `${DIR}/extract-queue`;
const OUT = `${DIR}/extract-out`;
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
class AcpWorker {
  constructor() { this.child = null; this.buf = ''; this.rpcId = 0; this.pending = new Map(); this.reply = ''; this.busy = false; }

  async ensure() {
    if (this.child && !this.child.killed) return true;
    this.child = spawn(DEVIN_EXE, ['acp'], { cwd: REPO, windowsHide: true });
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
    if (pr.error) { this.child = null; try { this.child?.kill('SIGKILL'); } catch {}; return { ok: false, error: pr.error.message, reply: this.reply }; }
    return { ok: true, reply: this.reply, stopReason: pr?.result?.stopReason };
  }
}

const workers = Array.from({ length: MAX_SESSIONS }, () => new AcpWorker());

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

// ── the batch call — one prompt on a persistent session ───────────────────
export async function runBatch() {
  const auth = await probeAuth();
  if (auth !== 'ok') return { lane: 'auth', spawned: false };
  const queued = readdirSync(QUEUE).filter((f) => f.endsWith('.json')).slice(0, BATCH);
  if (!queued.length) return { lane: 'empty', spawned: false };
  const w = workers.find((x) => !x.busy);
  if (!w) return { lane: 'busy', spawned: false };
  w.busy = true;
  try {
    const units = [];
    for (const f of queued) { try { units.push(JSON.parse(readFileSync(join(QUEUE, f), 'utf8'))); } catch {} }
    if (!units.length) return { lane: 'empty', spawned: false };
    emit({ stage: 'devin_batch_start', detail: `${units.length} units → acp session` });
    const r = await w.prompt(BATCH_PROMPT(units));
    const parsed = extractJson(r.reply);
    let produced = 0;
    const seenIds = new Set();
    if (Array.isArray(parsed?.results)) {
      for (const res of parsed.results) {
        const uid = String(res?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
        if (!uid || res?.output == null) continue;
        try { writeFileSync(join(OUT, `${uid}.json`), JSON.stringify(res.output)); produced += 1; seenIds.add(uid); } catch {}
        archiveUnit(w.sessionId, { unit: uid, kind: 'output', output: res.output });
      }
    }
    // Archive the units that produced nothing — a session that failed or
    // short-circuited still leaves a record of what it attempted and why.
    for (const u of units) if (!seenIds.has(u.id)) archiveUnit(w.sessionId, { unit: u.id, kind: 'missed', error: r.error ? String(r.error).slice(0, 120) : 'no output in batch' });
    archiveUnit(w.sessionId, { kind: 'batch_done', units: units.length, produced, ok: r.ok, error: r.error ? String(r.error).slice(0, 120) : null });
    emit({ stage: 'devin_batch_done', ok: r.ok && produced > 0, detail: `${r.error ? `err:${String(r.error).slice(0, 70)}` : r.stopReason || 'done'} — ${produced}/${units.length} outputs` });
    return { lane: 'devin', spawned: true, ok: r.ok, produced, error: r.error };
  } finally { w.busy = false; }
}

export async function drainQueue({ maxBatches = 8, sleepMs = 5000 } = {}) {
  let batches = 0, produced = 0;
  while (queueDepth() > 0 && batches < maxBatches) {
    const r = await runBatch();
    if (r.lane === 'auth' || r.lane === 'empty') return { lane: r.lane, batches, produced };
    if (r.lane === 'busy') { await new Promise((res) => setTimeout(res, sleepMs)); continue; }
    batches += 1; produced += r.produced || 0;
    await new Promise((res) => setTimeout(res, sleepMs));
  }
  return { lane: 'devin', batches, produced };
}
