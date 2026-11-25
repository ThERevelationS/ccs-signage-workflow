// Shared control plane for the permit-server fleet. The controller
// (scripts/permit-server.mjs) is the ONLY writer of server-control.json;
// every worker polls it between items via waitWhilePaused() — pause means
// finish the current item then idle (process stays alive, resume is
// instant), stopped means exit cleanly before the controller's taskkill,
// and guard_paused names idle while the memory guard is holding them.
import { readFileSync, writeFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AUDIT = process.env.PERMIT_AUDIT_DIR || path.join(ROOT, '.audit-work');
export const CONTROL_FILE = path.join(AUDIT, 'server-control.json');
export const HEARTBEAT_DIR = path.join(AUDIT, 'heartbeats');
export const DEFAULT_CONTROL = { state: 'running', verification: true, expansion: false, expansion_locked: true, guard_paused: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cache = { file: '', mtimeMs: -1, data: null };

// Cheap poll: stat first, only re-parse when the file changed. Missing or
// unparseable file → defaults (fleet runs; the controller rewrites state
// on its next tick anyway).
export function readControl(file = CONTROL_FILE) {
  let m;
  try { m = statSync(file).mtimeMs; } catch { cache = { file, mtimeMs: -1, data: { ...DEFAULT_CONTROL } }; return cache.data; }
  if (cache.file === file && cache.mtimeMs === m && cache.data) return cache.data;
  let parsed;
  try { parsed = { ...DEFAULT_CONTROL, ...JSON.parse(readFileSync(file, 'utf8')) }; }
  catch { parsed = { ...DEFAULT_CONTROL }; }
  cache = { file, mtimeMs: m, data: parsed };
  return parsed;
}

export function controlPath() { return CONTROL_FILE; }

// One JSON row per worker — the controller's /status reads these for
// idle/busy, current item and last-seen time. Writes are atomic-ish
// (tmp + rename) so a reader never sees a torn file.
export function heartbeat(workerName, state, item = '') {
  try {
    mkdirSync(HEARTBEAT_DIR, { recursive: true });
    const f = path.join(HEARTBEAT_DIR, `${workerName}.json`);
    const tmp = `${f}.tmp`;
    writeFileSync(tmp, JSON.stringify({ pid: process.pid, state, item: String(item || '').slice(0, 200), at: new Date().toISOString() }));
    try { renameSync(tmp, f); } catch { try { writeFileSync(f, readFileSync(tmp)); } catch {} }
  } catch {}
}

export function heartbeatFile(workerName) { return path.join(HEARTBEAT_DIR, `${workerName}.json`); }

// Call between items/passes in every worker loop. Returns the live control
// object when the worker may proceed; while paused (or guard-paused) it
// idles and polls every pollMs. On state 'stopped' the worker exits
// cleanly — inject opts.onStopped in tests to observe instead.
export async function waitWhilePaused(workerName, opts = {}) {
  const { item = '', pollMs = 2000, onStopped = null, controlFile = CONTROL_FILE } = opts;
  heartbeat(workerName, 'busy', item);
  for (;;) {
    const c = readControl(controlFile);
    const guardPaused = Array.isArray(c.guard_paused) && c.guard_paused.includes(workerName);
    if (c.state === 'stopped') {
      heartbeat(workerName, 'idle', 'stopped');
      if (onStopped) return onStopped(c);
      process.exit(0);
    }
    if (c.state !== 'paused' && !guardPaused) return c;
    heartbeat(workerName, 'idle', guardPaused ? 'memory guard' : 'paused');
    await sleep(pollMs);
  }
}

export function _resetCacheForTests() { cache = { file: '', mtimeMs: -1, data: null }; }
