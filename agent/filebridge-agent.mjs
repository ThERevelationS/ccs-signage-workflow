#!/usr/bin/env node
// filebridge-agent — Unraid-side bridge agent (skeleton).
// Outbound-only: HTTPS to the app's fileBridgeIngest function.
// Wake channel: SSE command_wait (primary) + command_poll (fallback).
// State: <state_dir>/ (sqlite index, entity_ids.db, spool/, manifest.json).
//
// Env:
//   FB_APP_URL         e.g. https://<app>.base44.app   (required)
//   FB_AGENT_ID        stable id e.g. 'tower-primary'  (required)
//   FB_HMAC_KEY        shared secret (prefer FB_HMAC_KEY_FILE)
//   FB_HMAC_KEY_FILE   path to secret file (recommended)
//   FB_ROLE            primary|backup (observer if unset)
//   FB_ROOTS           comma list of root mounts e.g. /roots/customer,/roots/media
//   FB_STATE_DIR       default /state
//   FB_VERSION         reported in handshake
//   CHAOS_DROP_COMMANDS / CHAOS_FAKE_CLOCK_SKEW_MS — dev-harness only

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const ENV = process.env;
const APP_URL = (ENV.FB_APP_URL || '').replace(/\/+$/, '');
const AGENT_ID = ENV.FB_AGENT_ID || '';
const ROLE_ENV = ENV.FB_ROLE || '';
const STATE_DIR = ENV.FB_STATE_DIR || '/state';
const VERSION = ENV.FB_VERSION || '0.1.0';
const ROOTS = (ENV.FB_ROOTS || '').split(',').map((s) => s.trim()).filter(Boolean);
const SECRET = ENV.FB_HMAC_KEY || (ENV.FB_HMAC_KEY_FILE ? fs.readFileSync(ENV.FB_HMAC_KEY_FILE, 'utf8').trim() : '');
const KEY_ID = ENV.FB_KEY_ID || 'fbk1';
const SPOOL_DIR = path.join(STATE_DIR, 'spool');
const LOG_FILE = path.join(STATE_DIR, 'agent.log');
const HOLD_MS = 45_000;
const POLL_MS = 8_000;

if (!APP_URL || !AGENT_ID || !SECRET) {
  console.error('FB_APP_URL, FB_AGENT_ID and FB_HMAC_KEY(_FILE) are required');
  process.exit(2);
}
fs.mkdirSync(SPOOL_DIR, { recursive: true });

const state = {
  role: 'observer', config_version: -1, roots: [], running: false,
  sse_ok: true, inflight: new Map(),
};

const log = (level, msg, extra) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(extra || {}) }) + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  process.stdout.write(line);
};

const sign = (ts, body) =>
  crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');

// ---- HTTP helper (no deps) ----
const post = (action, payload, { stream = false, timeoutMs = 90_000 } = {}) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, agent_id: AGENT_ID, ...payload });
    const ts = Date.now();
    const u = new URL(`${APP_URL}/functions/fileBridgeIngest`);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fb-key-id': KEY_ID, 'x-fb-ts': String(ts),
        'x-fb-agent': AGENT_ID, 'x-fb-sig': sign(ts, body),
      },
      timeout: timeoutMs,
    }, (res) => {
      if (stream) return resolve(res);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 500) }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });

// ---- durable spool: priority-tiered (results > deltas > events) + cap ----
const SPOOL_PRIORITY = { command_complete: 0, deliver_complete: 0, index_batch: 1, recent_batch: 2, event: 3 };
const SPOOL_MAX = 5000;
const spoolPush = (kind, payload) => {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${kind}.json`;
  try { fs.writeFileSync(path.join(SPOOL_DIR, name), JSON.stringify(payload)); } catch { return; }
  // cap: beyond SPOOL_MAX, drop the oldest lowest-priority files
  const files = spoolList();
  if (files.length > SPOOL_MAX) {
    const pri = (f) => SPOOL_PRIORITY[f.split('.').slice(-2, -1)[0]] ?? 2;
    const doomed = files.filter((f) => pri(f) >= 2).slice(0, files.length - SPOOL_MAX);
    for (const f of doomed) { try { fs.unlinkSync(path.join(SPOOL_DIR, f)); } catch {} }
    if (doomed.length) log('warn', 'spool_cap_evict', { evicted: doomed.length });
  }
};
const spoolList = () =>
  fs.readdirSync(SPOOL_DIR).filter((f) => f.endsWith('.json')).sort();
const spoolDepth = () => spoolList().length;
const spoolDrain = async () => {
  const pri = (f) => SPOOL_PRIORITY[f.split('.').slice(-2, -1)[0]] ?? 2;
  const files = spoolList().sort((a, b) => pri(a) - pri(b) || a.localeCompare(b));
  for (const f of files) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(SPOOL_DIR, f), 'utf8'));
      const kind = f.split('.').slice(-2, -1)[0];
      const r = await post(kind, payload);
      if (r.status >= 200 && r.status < 300) fs.unlinkSync(path.join(SPOOL_DIR, f));
      else if (r.status === 401 || r.status === 403) { fs.unlinkSync(path.join(SPOOL_DIR, f)); log('warn', 'spool_drop_auth', { f }); }
      else if (r.status === 503 && r.json?.retry) break; // budget/degraded — retry next cycle
      else break;
    } catch { break; }
  }
};

// ---- local store: node:sqlite (WAL). Holds the full index — the app only
// sees the hot slice via index_batch. entity_id memory makes updates by-id.
let db = null; let fts = false;
try {
  const { DatabaseSync } = await import('node:sqlite');
  db = new DatabaseSync(path.join(STATE_DIR, 'index.db'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS files(
      path_key TEXT PRIMARY KEY, root_key TEXT, path TEXT, name TEXT,
      parent_path TEXT, ext TEXT, kind TEXT, is_dir INTEGER,
      size INTEGER, mtime_ms INTEGER, dir_size_bytes INTEGER,
      entity_id TEXT, last_seen_scan INTEGER, missing INTEGER DEFAULT 0,
      miss_count INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS files_parent ON files(root_key, parent_path);
    CREATE INDEX IF NOT EXISTS files_name ON files(name);
    CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);`);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, path, tokenize='unicode61')`);
    // content FTS is a separate table keyed by files.rowid — name/path hits
    // and content hits merge in deep_search (match:'name'|'content').
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(content, tokenize='unicode61')`);
    fts = true;
  } catch { log('warn', 'fts5_unavailable', {}); }
  try { db.exec(`ALTER TABLE files ADD COLUMN miss_count INTEGER DEFAULT 0`); } catch { /* present */ }
  try { db.exec(`ALTER TABLE files ADD COLUMN extracted_ms INTEGER DEFAULT 0`); } catch { /* present */ }
} catch (e) {
  log('warn', 'sqlite_unavailable', { err: String(e.message || e).slice(0, 120) });
}

const metaGet = (k, d = '') => { try { return db?.prepare('SELECT v FROM meta WHERE k=?').get(k)?.v ?? d; } catch { return d; } };
const metaSet = (k, v) => { try { db?.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v)); } catch {} };

const upsertFile = (r) => {
  if (!db) return;
  db.prepare(`INSERT INTO files(path_key,root_key,path,name,parent_path,ext,kind,is_dir,size,mtime_ms,dir_size_bytes,entity_id,last_seen_scan,missing)
    VALUES(@path_key,@root_key,@path,@name,@parent_path,@ext,@kind,@is_dir,@size,@mtime_ms,@dir_size_bytes,@entity_id,@last_seen_scan,@missing)
    ON CONFLICT(path_key) DO UPDATE SET
      name=excluded.name,parent_path=excluded.parent_path,ext=excluded.ext,kind=excluded.kind,is_dir=excluded.is_dir,
      size=excluded.size,mtime_ms=excluded.mtime_ms,dir_size_bytes=excluded.dir_size_bytes,
      last_seen_scan=excluded.last_seen_scan,missing=0,
      entity_id=COALESCE(excluded.entity_id, files.entity_id)`).run(r);
  if (fts) {
    try {
      const rowid = db.prepare('SELECT rowid FROM files WHERE path_key=?').get(r.path_key)?.rowid;
      if (rowid) {
        db.prepare('DELETE FROM files_fts WHERE rowid=?').run(rowid);
        db.prepare('INSERT INTO files_fts(rowid,name,path) VALUES(?,?,?)').run(rowid, r.name, r.path);
      }
    } catch {}
  }
};

const pathKeyLocal = (rootKey, rel) => `${AGENT_ID}:${rootKey}:${rel}`;

const knownRow = (rootKey, rel) => {
  if (!db) return null;
  try { return db.prepare('SELECT rowid,* FROM files WHERE path_key=?').get(pathKeyLocal(rootKey, rel)) || null; } catch { return null; }
};

// ---- provenance manifest (agent-side delete guard — the fail-safe).
// A file may be DELETED through the bridge only if the manifest says the
// bridge created it. Absence of provenance = external = refuse.
const MANIFEST_FILE = path.join(STATE_DIR, 'manifest.json');
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); } catch { manifest = {}; }
const manifestSave = () => {
  const tmp = MANIFEST_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest));
  fs.renameSync(tmp, MANIFEST_FILE); // atomic
};
const manifestSet = (pk, e) => { manifest[pk] = { ...(manifest[pk] || {}), ...e }; manifestSave(); };
const manifestGet = (pk) => manifest[pk] || null;
const canDeleteLocal = (pk) => manifestGet(pk)?.origin === 'bridge';
const canMoveLocal = (pk) => ['bridge', 'external'].includes(manifestGet(pk)?.managed_by || '') || manifestGet(pk)?.origin === 'bridge';

// ---- path safety (agent-side — never trust caller-supplied paths) ----
const normRel = (p) => {
  const parts = String(p || '').replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
  if (parts.some((s) => s === '..')) return null;
  return parts.join('/').normalize('NFC');
};
const resolveInRoot = (root, rel) => {
  const mount = root._mount || '';
  const realMount = fs.realpathSync(mount);
  const abs = path.posix.join(realMount, rel || '');
  if (abs !== realMount && !abs.startsWith(realMount + '/')) return null; // escape guard
  return abs;
};
const rootFor = (rootKey) => state.roots.find((r) => r.root_key === rootKey && r.enabled !== false);
const EXCLUDE = [/^\./, /~\$/, /^~/, /\.tmp$/i, /\.part$/i, /Thumbs\.db$/i, /desktop\.ini$/i, /\.ccs_trash$/, /\.ccs_/];
const excluded = (name) => EXCLUDE.some((re) => re.test(name));

// ---- scanner: iterative walk → sqlite + diff → index_batch/recent_batch ----
const SCAN_BATCH = 400;
const scanState = { running: false, requested: new Set() };

const flushIndexBatch = async (items, scanId) => {
  if (!items.length) return;
  const payload = { items, scan_id: scanId };
  const r = await post('index_batch', payload).catch(() => null);
  if (r?.status === 200) {
    const idMap = r.json?.id_map || {};
    if (db) {
      const stmt = db.prepare('UPDATE files SET entity_id=? WHERE path_key=?');
      for (const it of items) {
        const pk = pathKeyLocal(it.root_key, it.path);
        const eid = idMap[pk];
        if (eid) stmt.run(eid, pk);
      }
    }
    return;
  }
  spoolPush('index_batch', payload); // durable retry
};

// ---- content extraction (P5): text-ish files → content_fts, capped per
// scan so extraction never starves metadata. Re-extracts on mtime change.
const EXTRACTABLE_EXTS = new Set(
  'txt md log csv tsv json jsonl xml html htm css js mjs cjs ts tsx jsx ini cfg conf yaml yml env sh bat ps1 sql graphql svg srt vtt'.split(' '),
);
const EXTRACT_MAX_FILE = 2 * 1024 * 1024;  // bytes read
const EXTRACT_MAX_TEXT = 64 * 1024;        // chars kept
const EXTRACT_PER_SCAN = 500;
const extractionOn = (root) =>
  state.content_search !== false &&
  (root.extraction_enabled === true || (state.extraction_roots || []).includes(root.root_key));
const looksBinary = (buf) => {
  const n = Math.min(buf.length, 8192);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad += 1;
  }
  return bad / Math.max(1, n) > 0.05;
};
const extractCandidates = async (root, stats) => {
  if (!fts || !stats.extract.length) return;
  let done = 0;
  const del = db.prepare('DELETE FROM content_fts WHERE rowid=?');
  const ins = db.prepare('INSERT INTO content_fts(rowid,content) VALUES(?,?)');
  const mark = db.prepare('UPDATE files SET extracted_ms=? WHERE rowid=?');
  for (const c of stats.extract) {
    if (done >= EXTRACT_PER_SCAN) break;
    done += 1;
    try {
      const fh = await fs.promises.open(c.abs, 'r');
      try {
        const buf = Buffer.alloc(Math.min(c.size, EXTRACT_MAX_FILE));
        await fh.read(buf, 0, buf.length, 0);
        if (looksBinary(buf)) { mark.run(-1, c.rowid); continue; }
        let text = buf.toString('utf8').replaceAll(String.fromCharCode(0),' ');
        if (text.length > EXTRACT_MAX_TEXT) text = text.slice(0, EXTRACT_MAX_TEXT);
        del.run(c.rowid); ins.run(c.rowid, text); mark.run(c.mtime_ms, c.rowid);
        stats.extracted += 1;
      } finally { await fh.close(); }
    } catch { /* unreadable — leave for next scan */ }
  }
};

const scanDir = async (root, rel, scanId, stats) => {
  const abs = resolveInRoot(root, rel);
  if (!abs) { stats.skipped += 1; return 0; }
  let entries; try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { stats.skipped += 1; return 0; }
  let dirSize = 0;
  const subdirs = [];
  for (const e of entries) {
    if (excluded(e.name)) { stats.excluded += 1; continue; }
    const childRel = rel ? `${rel}/${e.name}` : e.name.normalize('NFC');
    const nrel = normRel(childRel);
    if (nrel === null) { stats.skipped += 1; continue; }
    let st; try { st = fs.statSync(path.posix.join(abs, e.name)); } catch { stats.skipped += 1; continue; }
    const isDir = e.isDirectory();
    const prev = knownRow(root.root_key, nrel);
    const changed = !prev || prev.size !== (isDir ? 0 : st.size) || prev.mtime_ms !== Math.floor(st.mtimeMs) || prev.is_dir !== (isDir ? 1 : 0);
    const row = {
      path_key: pathKeyLocal(root.root_key, nrel), root_key: root.root_key, path: nrel,
      name: e.name.normalize('NFC'), parent_path: rel || '', ext: isDir ? '' : (path.posix.extname(e.name).slice(1).toLowerCase()),
      kind: isDir ? 'dir' : 'file', is_dir: isDir ? 1 : 0, size: isDir ? 0 : st.size,
      mtime_ms: Math.floor(st.mtimeMs), dir_size_bytes: null,
      entity_id: prev?.entity_id || null, last_seen_scan: scanId, missing: 0,
    };
    if (changed) {
      upsertFile(row);
    } else {
      // unchanged: touch liveness only — skips the files_fts delete+insert
      // (the dominant per-file write cost on re-scans).
      try { db?.prepare('UPDATE files SET last_seen_scan=?,missing=0 WHERE path_key=?').run(scanId, row.path_key); } catch { upsertFile(row); }
    }
    // inbound roots: everything in the drop zone is bridge-FILED (movable into
    // customer folders) but stays origin:external — never deletable.
    if (root.purpose === 'inbound' && !manifestGet(row.path_key)) {
      manifestSet(row.path_key, { origin: 'external', managed_by: 'bridge', inbound_ts: Date.now() });
    }
    if (changed) {
      stats.batch.push({
        root_key: root.root_key, path: nrel, is_dir: isDir, size: row.size,
        mtime_ms: row.mtime_ms, entity_id: prev?.entity_id || undefined,
      });
      stats.recent.push({
        root_key: root.root_key, path: nrel, is_dir: isDir, size: row.size, mtime_ms: row.mtime_ms,
        change_type: prev ? 'modified' : 'created', event_ts: Math.floor(st.mtimeMs),
      });
    }
    if (isDir) subdirs.push(nrel); else {
      dirSize += st.size; stats.files += 1;
      // extraction candidates: extractable ext, size-capped, and new/changed
      // since last extraction (extracted_ms !== mtime_ms covers both).
      if (stats.extractOn && EXTRACTABLE_EXTS.has(row.ext) && st.size > 0 && st.size <= EXTRACT_MAX_FILE) {
        const cur = prev || knownRow(root.root_key, nrel);
        if (cur && cur.extracted_ms !== Math.floor(st.mtimeMs)) {
          stats.extract.push({ rowid: cur.rowid, abs: path.posix.join(abs, e.name), size: st.size, mtime_ms: Math.floor(st.mtimeMs) });
        }
      }
    }
    if (stats.batch.length >= SCAN_BATCH) { await flushIndexBatch(stats.batch.splice(0), scanId); }
  }
  // dir-size rollup + queue children (returned so caller iterates)
  const selfRow = knownRow(root.root_key, rel || '');
  if (selfRow) {
    try { db?.prepare('UPDATE files SET dir_size_bytes=? WHERE path_key=?').run(dirSize, selfRow.path_key); } catch {}
  }
  return subdirs;
};

const scanRoot = async (root, scanId, prefix = '') => {
  const stats = { files: 0, skipped: 0, excluded: 0, extracted: 0, batch: [], recent: [], extract: [], extractOn: extractionOn(root) };
  const queue = [prefix.replace(/\/+$/, '')];
  let guard = 0;
  while (queue.length && guard < 200_000) {
    guard += 1;
    const rel = queue.shift();
    const subs = await scanDir(root, rel, scanId, stats);
    for (const s of subs) queue.push(s);
  }
  await flushIndexBatch(stats.batch.splice(0), scanId);
  await extractCandidates(root, stats);
  if (stats.recent.length) {
    for (let i = 0; i < stats.recent.length; i += 300) {
      const payload = { items: stats.recent.slice(i, i + 300) };
      const r = await post('recent_batch', payload).catch(() => null);
      if (r?.status !== 200) spoolPush('recent_batch', payload);
    }
  }
  // 2-sweep missing rule: a single missed file might be a locked/transient
  // read — flag missing only after TWO consecutive scans don't see it.
  if (db) {
    try {
      db.prepare(`UPDATE files SET miss_count=miss_count+1 WHERE root_key=? AND last_seen_scan<?`).run(root.root_key, scanId);
      db.prepare(`UPDATE files SET missing=1 WHERE root_key=? AND miss_count>=2 AND missing=0`).run(root.root_key);
      // rows seen this scan keep missing=0 (upsert already resets) — reset counter
      db.prepare(`UPDATE files SET miss_count=0 WHERE root_key=? AND last_seen_scan=?`).run(root.root_key, scanId);
    } catch {}
  }
  return stats;
};

const runScan = async (onlyRootKey = null, prefix = '') => {
  if (scanState.running) { for (const rk of [onlyRootKey].filter(Boolean)) scanState.requested.add(rk); return; }
  scanState.running = true;
  const scanId = Date.now();
  // scan_priority asc (hot roots first); enabled:false roots are skipped.
  const roots = state.roots
    .filter((r) => (!onlyRootKey || r.root_key === onlyRootKey) && r.enabled !== false)
    .sort((a, b) => (a.scan_priority ?? 100) - (b.scan_priority ?? 100));
  const totals = { files: 0, skipped: 0, excluded: 0, roots: roots.map((r) => r.root_key) };
  try {
    for (const root of roots) {
      const s = await scanRoot(root, scanId, prefix);
      totals.files += s.files; totals.skipped += s.skipped; totals.excluded += s.excluded; totals.extracted = (totals.extracted || 0) + s.extracted;
    }
    await post('heartbeat', { index_stats: totals, last_scan_at: new Date(scanId).toISOString() }).catch(() => null);
    log('info', 'scan_done', { scan_id: scanId, ...totals });
    pushInventory(scanId, roots).catch((e) => log('warn', 'inventory_err', { err: String(e.message || e).slice(0, 120) }));
  } finally {
    scanState.running = false;
    metaSet('last_scan_id', scanId); metaSet('last_scan_ms', Date.now());
    if (scanState.requested.size) {
      const next = [...scanState.requested]; scanState.requested.clear();
      for (const rk of next) runScan(rk).catch(() => null);
    }
  }
};

// ---- inventory report (per-ext openability matrix → FileBridgeInventory) ----
// Local-sqlite derived, so it works even with partial app connectivity (the
// POST spools). ext→kind drives the viewer/openability roadmap.
const EXT_KIND = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', tif: 'image', tiff: 'image', heic: 'image',
  pdf: 'pdf',
  txt: 'text', md: 'text', log: 'text', csv: 'text', json: 'text', xml: 'text', js: 'text', ts: 'text', jsx: 'text', tsx: 'text', css: 'text', html: 'text',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
  doc: 'office', docx: 'office', xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office', odt: 'office', ods: 'office', rtf: 'office',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  ai: 'design', psd: 'design', eps: 'design', indd: 'design', cdr: 'design', skp: 'design', dwg: 'design', dxf: 'design', step: 'design', stl: 'design',
};
const OPEN_STATE = { image: 'inline', pdf: 'inline', text: 'inline', video: 'inline', audio: 'inline', office: 'download', archive: 'download', font: 'download', design: 'download', other: 'download' };
const pushInventory = async (scanId, roots) => {
  if (!db) return;
  const extRows = db.prepare(
    `SELECT ext, COUNT(*) c, SUM(size) b FROM files WHERE missing=0 AND is_dir=0 GROUP BY ext ORDER BY c DESC LIMIT 200`,
  ).all();
  const ext_map = {};
  for (const r of extRows) {
    const e = String(r.ext || '').toLowerCase() || '(none)';
    const kind = EXT_KIND[e] || 'other';
    ext_map[e] = { count: r.c, bytes: r.b || 0, kind, open_state: OPEN_STATE[kind] };
  }
  const tot = db.prepare(`SELECT COUNT(*) files, COALESCE(SUM(size),0) bytes FROM files WHERE missing=0 AND is_dir=0`).get();
  const dirs = db.prepare(`SELECT COUNT(*) c FROM files WHERE missing=0 AND is_dir=1`).get()?.c || 0;
  const top_dirs = db.prepare(
    `SELECT root_key, name, dir_size_bytes, file_count FROM files WHERE is_dir=1 AND parent_path='' ORDER BY dir_size_bytes DESC LIMIT 50`,
  ).all().map((r) => ({ root_key: r.root_key, name: r.name, bytes: r.dir_size_bytes || 0, files: r.file_count || 0 }));
  await post('inventory_report', {
    run_id: `inv-${AGENT_ID}-${scanId}`, status: 'completed',
    roots: roots.map((r) => r.root_key),
    totals: { files: tot?.files || 0, dirs, bytes: tot?.bytes || 0 },
    ext_map, top_dirs, started_at: new Date(scanId).toISOString(),
  });
};

// ---- manifest digest (must match server manifest_sync canonical form) ----
const manifestDigest = () => {
  const lines = Object.keys(manifest)
    .filter((k) => manifest[k]?.origin === 'bridge')
    .map((k) => {
      const rest = k.startsWith(`${AGENT_ID}:`) ? k.slice(AGENT_ID.length + 1) : k;
      const i = rest.indexOf(':');
      return `${rest.slice(0, i)}|${rest.slice(i + 1)}|bridge|bridge`;
    }).sort();
  return { digest: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), count: lines.length };
};
const checkManifestDrift = async () => {
  const { digest, count } = manifestDigest();
  const r = await post('manifest_sync', { digest, count }).catch(() => null);
  if (r?.status === 200 && r.json?.in_sync === false) {
    log('warn', 'manifest_drift', { server_count: r.json.server_count, local_count: count });
  } else if (r?.status === 200) {
    log('info', 'manifest_sync_ok', { count });
  }
};

// ---- handshake / config ----
const detectShares = () => {
  // report mounted roots' children as candidate shares (roots wizard)
  const out = {};
  for (const r of ROOTS) {
    try { out[r] = fs.readdirSync(r).filter((d) => { try { return fs.statSync(path.join(r, d)).isDirectory(); } catch { return false; } }); }
    catch { out[r] = null; }
  }
  return out;
};

const handshake = async () => {
  const r = await post('handshake', {
    env_role: ROLE_ENV, agent_version: VERSION, host: ENV.HOSTNAME || '',
    display_name: ENV.FB_DISPLAY_NAME || AGENT_ID,
    detected_shares: detectShares(), spool_depth: spoolDepth(),
  });
  if (r.status !== 200) throw new Error(`handshake ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
  const j = r.json;
  state.role = j.role || 'observer';
  if (j.config_version !== state.config_version) {
    state.config_version = j.config_version;
    // resolve each configured root_key to a local mount:
    //   /roots/<root_key>  (CA template convention)
    //   FB_ROOTS entry whose basename === root_key
    //   FB_ROOTS entry whose basename === basename(rel_root)  (share-name match)
    state.roots = (j.config?.roots || []).map((r) => {
      const candidates = [
        `/roots/${r.root_key}`,
        ...ROOTS.filter((m) => path.posix.basename(m) === r.root_key),
        ...ROOTS.filter((m) => r.rel_root && path.posix.basename(m) === path.posix.basename(r.rel_root)),
      ];
      const _mount = candidates.find((c) => { try { return fs.statSync(c).isDirectory(); } catch { return false; } }) || candidates[0] || '';
      return { ...r, _mount };
    });
    state.exclude_patterns = j.config?.exclude_patterns || state.exclude_patterns;
    state.extraction_roots = j.config?.extraction_roots || state.extraction_roots || [];
    state.content_search = j.config?.content_search ?? state.content_search;
    fs.writeFileSync(path.join(STATE_DIR, 'config.json'), JSON.stringify(j.config, null, 2));
    log('info', 'config_applied', { version: j.config_version, roots: state.roots.length,
      unmounted: state.roots.filter((r) => !r._mount || !fs.existsSync(r._mount)).map((r) => r.root_key) });
    if (state.role !== 'observer') runScan().catch((e) => log('warn', 'scan_err', { err: String(e.message || e).slice(0, 120) }));
  }
  log('info', 'handshake', { role: state.role, config_version: j.config_version });
  return j;
};

// ---- command execution ----
const TRASH_DIR_NAME = '.ccs_trash';
const INLINE_CAP = 44 * 1024 * 1024;

const readFileRange = (abs, off, len) =>
  new Promise((res, rej) => {
    fs.open(abs, 'r', (e, fd) => {
      if (e) return rej(e);
      const buf = Buffer.alloc(len);
      fs.read(fd, buf, 0, len, off, (e2) => { fs.close(fd, () => {}); e2 ? rej(e2) : res(buf); });
    });
  });

const sha256File = (abs) =>
  new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(abs).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });

const atomicWrite = async (abs, buf) => {
  const tmp = `${abs}.fbpart-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, abs);
};

// Shared delivery tail: ≤44MB single-shot via deliver_complete, above that
// 32MB seq chunks via deliver_chunk (seq-deduped → retry-safe; ingest
// reassembles + completes the command on the last seq). 256MB hard ceiling.
const deliverFile = async (cmd, abs, { name, size, sha256 }) => {
  const fname = name || path.posix.basename(abs);
  if (size <= INLINE_CAP) {
    const buf = await fs.promises.readFile(abs);
    const r = await post('deliver_complete', {
      command_id: cmd.command_id, name: fname,
      bytes_b64: buf.toString('base64'), sha256, size,
    }, { timeoutMs: 300_000 });
    if (r?.status === 200) return { ok: true, done_by_ingest: true, result: { file_url: r.json.file_url, bytes: size, sha256 } };
    return { ok: false, error: `deliver_failed ${r?.status}`, retry: true };
  }
  if (size > 256 * 1024 * 1024) {
    return { ok: false, error: `file too large for staged delivery (${size})`, needs_proxy: true };
  }
  const CHUNK = 32 * 1024 * 1024;
  const total = Math.ceil(size / CHUNK);
  for (let seq = 0; seq < total; seq += 1) {
    const off = seq * CHUNK;
    const len = Math.min(CHUNK, size - off);
    const buf = await readFileRange(abs, off, len);
    const csha = crypto.createHash('sha256').update(buf).digest('hex');
    const body = {
      command_id: cmd.command_id, seq, total, bytes_b64: buf.toString('base64'),
      sha256: csha, file_sha256: sha256, name: fname, size,
    };
    let r = await post('deliver_chunk', body, { timeoutMs: 300_000 });
    if (!r || r.status === 429 || (r.status >= 500 && r.status < 600)) {
      await new Promise((s) => setTimeout(s, 3000));
      r = await post('deliver_chunk', body, { timeoutMs: 300_000 });
    }
    if (r?.status !== 200) return { ok: false, error: `chunk ${seq} deliver_failed ${r?.status}`, retry: true };
    if (seq === total - 1) {
      if (!r.json.file_url) return { ok: false, error: 'assembly did not return file_url', retry: true };
      return { ok: true, done_by_ingest: true, result: { file_url: r.json.file_url, bytes: size, sha256 } };
    }
  }
  return { ok: false, error: 'chunk loop ended without final response', retry: true };
};

// ---- minimal zip writer (STORE method — no compression, no deps) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (() => {
  const mk = () => {
    let crc = 0xffffffff;
    return {
      update(buf) { for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8); },
      digest: () => (crc ^ 0xffffffff) >>> 0,
    };
  };
  return mk;
})();
const dosDateTime = (d = new Date()) => ({
  time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
  date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
});

// Streams entries into `out` as a valid zip (STORE method, data descriptors
// so files read once). entries: [{arcname, abs, size}].
const writeStoreZip = async (out, entries) => {
  const fd = fs.createWriteStream(out);
  const write = (buf) => new Promise((res, rej) => { fd.write(buf, (e) => (e ? rej(e) : res())); });
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; };
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  for (const e of entries) {
    const nameBuf = Buffer.from(e.arcname.replace(/\\/g, '/'), 'utf8');
    const localOff = offset;
    // local header — crc/sizes zeroed, bit 3 = data descriptor follows data
    const lh = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800 | 8), u16(0), u16(time), u16(date),
      u32(0), u32(0), u32(0), u16(nameBuf.length), u16(0), nameBuf,
    ]);
    await write(lh); offset += lh.length;
    const c = crc32(); let written = 0;
    await new Promise((res, rej) => {
      const rs = fs.createReadStream(e.abs);
      rs.on('data', (chunk) => { c.update(chunk); written += chunk.length; });
      rs.pipe(fd, { end: false });
      rs.on('end', res); rs.on('error', rej);
    });
    offset += written;
    const crc = c.digest();
    const dd = Buffer.concat([u32(0x08074b50), u32(crc), u32(written), u32(written)]);
    await write(dd); offset += dd.length;
    central.push({ nameBuf, crc, size: written, localOff, time, date });
  }
  const cdStart = offset;
  for (const e of central) {
    const cd = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800 | 8), u16(0), u16(e.time), u16(e.date),
      u32(e.crc), u32(e.size), u32(e.size), u16(e.nameBuf.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(e.localOff), e.nameBuf,
    ]);
    await write(cd); offset += cd.length;
  }
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(offset - cdStart), u32(cdStart), u16(0),
  ]);
  await write(eocd);
  await new Promise((res, rej) => { fd.end((e) => (e ? rej(e) : res())); });
};

// Shared core for upload_apply + archive_output: pull staged bytes outbound,
// sha256-verify, collision-safe atomic write (never overwrite), manifest
// bridge-provenance stamp, local index upsert.
const applyRemoteFile = async (args) => {
  if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
  const root = rootFor(args.root_key);
  const destDir = root ? normRel(args.dest_dir || '') : null;
  const dirAbs = destDir !== null ? resolveInRoot(root, destDir) : null;
  if (!root || !dirAbs) return { ok: false, error: 'bad root/dest_dir' };
  const name = String(args.name || '').replace(/[/\\]/g, '').normalize('NFC');
  if (!name || name.startsWith('.')) return { ok: false, error: 'bad name' };
  const resp = await fetch(String(args.file_url || ''), { signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!resp?.ok) return { ok: false, error: `staging fetch failed ${resp?.status}`, retry: true };
  const buf = Buffer.from(await resp.arrayBuffer());
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (args.sha256 && args.sha256 !== sha) return { ok: false, error: 'sha256 mismatch on staging pull' };
  // never overwrite: revision → name.rev-N.ext; new → name (n).ext
  const ext = path.posix.extname(name); const stem = name.slice(0, name.length - ext.length);
  let finalName = name; let n = 1;
  while (fs.existsSync(path.posix.join(dirAbs, finalName))) {
    finalName = args.mode === 'revision' ? `${stem}.rev-${n}${ext}` : `${stem} (${n})${ext}`;
    n += 1; if (n > 99) return { ok: false, error: 'no free filename' };
  }
  await fs.promises.mkdir(dirAbs, { recursive: true });
  const abs = path.posix.join(dirAbs, finalName);
  await atomicWrite(abs, buf);
  const finalRel = destDir ? `${destDir}/${finalName}` : finalName;
  const pk = pathKeyLocal(root.root_key, finalRel);
  manifestSet(pk, { origin: 'bridge', managed_by: 'bridge', created_ts: Date.now(), upload_id: args.upload_id });
  const st = await fs.promises.stat(abs);
  upsertFile({
    path_key: pk, root_key: root.root_key, path: finalRel, name: finalName,
    parent_path: destDir || '', ext: ext.slice(1).toLowerCase(), kind: 'file', is_dir: 0,
    size: st.size, mtime_ms: Math.floor(st.mtimeMs), dir_size_bytes: null,
    entity_id: null, last_seen_scan: Number(metaGet('last_scan_id', 0)) || 0, missing: 0,
  });
  log('info', 'upload_applied', { path: finalRel, bytes: st.size, upload_id: args.upload_id });
  return { ok: true, result: { path: finalRel, bytes: st.size, sha256: sha, renamed: finalName !== name ? finalName : undefined } };
};

const executors = {
  // served from the local index — O(1), no disk hit, same row shape as scan
  list_dir: async (args) => {
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: `unknown root '${args.root_key}'` };
    const rel = normRel(args.path || '') ?? '';
    if (db) {
      const rows = db.prepare(
        `SELECT path,name,is_dir,size,mtime_ms,dir_size_bytes,missing FROM files
         WHERE root_key=? AND parent_path=? AND missing=0 ORDER BY is_dir DESC, name LIMIT ?`
      ).all(root.root_key, rel, Math.min(Number(args.limit) || 500, 5000));
      return { ok: true, result: { source: 'index', entries: rows.map((r) => ({ ...r, is_dir: !!r.is_dir })) } };
    }
    const abs = resolveInRoot(root, rel);
    if (!abs) return { ok: false, error: 'path outside root' };
    const entries = fs.readdirSync(abs, { withFileTypes: true }).slice(0, args.limit || 500)
      .map((e) => ({ name: e.name.normalize('NFC'), is_dir: e.isDirectory() }));
    return { ok: true, result: { source: 'fs', entries } };
  },

  // full-bytes delivery: single-shot ≤44MB via deliver_complete; larger files
  // stage 32MB chunks via deliver_chunk (seq-deduped → retry-safe) and ingest
  // reassembles on the last one.
  fetch_bytes: async (args, cmd) => {
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: `unknown root '${args.root_key}'` };
    const rel = normRel(args.path || '');
    const abs = rel !== null ? resolveInRoot(root, rel) : null;
    if (!abs) return { ok: false, error: 'path outside root' };
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st || !st.isFile()) return { ok: false, error: 'not a file' };
    const sha = await sha256File(abs);
    if (args.expected_sha256 && args.expected_sha256 !== sha) {
      return { ok: false, error: 'file changed since request (sha256 mismatch)', changed: true };
    }
    return deliverFile(cmd, abs, { size: st.size, sha256: sha });
  },

  // zip a set of files under one root → delivered file_url. STORE method
  // (no compression) keeps it dependency-free and CPU-cheap; the point is
  // one-download-many-files, not shrinkage.
  package_files: async (args, cmd) => {
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: `unknown root '${args.root_key}'` };
    const entries = [];
    for (const p of args.paths || []) {
      const rel = normRel(p);
      const abs = rel !== null ? resolveInRoot(root, rel) : null;
      const st = abs ? await fs.promises.stat(abs).catch(() => null) : null;
      if (!abs || !st || !st.isFile()) return { ok: false, error: `unreadable: ${p}` };
      entries.push({ arcname: path.posix.basename(abs), abs, size: st.size });
    }
    if (!entries.length) return { ok: false, error: 'no paths' };
    // disambiguate duplicate basenames inside the archive
    const seen = new Map();
    for (const e of entries) {
      const n = (seen.get(e.arcname) || 0) + 1; seen.set(e.arcname, n);
      if (n > 1) {
        const dot = e.arcname.lastIndexOf('.');
        e.arcname = dot > 0 ? `${e.arcname.slice(0, dot)}-${n}${e.arcname.slice(dot)}` : `${e.arcname}-${n}`;
      }
    }
    const totalBytes = entries.reduce((n, e) => n + e.size, 0);
    if (totalBytes > 240 * 1024 * 1024) return { ok: false, error: `package too large (${totalBytes})`, needs_proxy: true };
    const tmp = path.join(STATE_DIR, `pkg-${cmd.command_id || Date.now()}.zip`);
    try {
      await writeStoreZip(tmp, entries);
      const st = await fs.promises.stat(tmp);
      const sha = await sha256File(tmp);
      return await deliverFile(cmd, tmp, { name: args.archive_name || 'package.zip', size: st.size, sha256: sha });
    } finally { await fs.promises.unlink(tmp).catch(() => null); }
  },

  // name/path deep search — FTS5 when available, LIKE fallback. Supports
  // qualifiers from the action (filters.ext[], filters.path[]), offset cursor
  // paging, and a wall-clock cap with `partial` honesty. Content extraction
  // is P5; this covers the high-value 80% (find it by name).
  deep_search: async (args) => {
    if (!db) return { ok: false, error: 'index unavailable' };
    const q = String(args.query || '').trim();
    const filters = args.filters && typeof args.filters === 'object' ? args.filters : {};
    const exts = (filters.ext || []).map((e) => String(e).toLowerCase().replace(/^\./, '')).filter(Boolean);
    const paths = (filters.path || []).map((p) => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean);
    const offset = Math.max(0, Number(String(args.cursor || '0').replace(/^o/, '')) || 0);
    if (!q && !exts.length && !paths.length) return { ok: true, result: { hits: [], mode: fts ? 'fts' : 'like' } };
    const limit = Math.min(Number(args.limit) || 200, 1000);
    const t0 = Date.now(); const cap = Math.min(Number(args.time_cap_ms) || 8000, 20000);
    const want = offset + limit + 1; // +1 row = next-cursor probe
    let rows = [];
    const seen = new Set();
    try {
      const matchQ = q && !/[*"']/.test(q)
        ? q.split(/\s+/).map((t) => `${t.replace(/[^\w.-]/g, '')}*`).filter(Boolean).join(' AND ')
        : '';
      if (matchQ && fts) {
        // name/path lane
        for (const r of db.prepare(
          `SELECT f.rowid rid,f.root_key,f.path,f.name,f.ext,f.is_dir,f.size,f.mtime_ms FROM files_fts x
           JOIN files f ON f.rowid=x.rowid WHERE files_fts MATCH ? AND f.missing=0
           ORDER BY rank LIMIT ?`,
        ).all(matchQ, want)) {
          if (!seen.has(r.rid)) { seen.add(r.rid); rows.push({ ...r, match: 'name' }); }
        }
        // content lane — extracted text with snippet context
        if (rows.length < want) {
          for (const r of db.prepare(
            `SELECT f.rowid rid,f.root_key,f.path,f.name,f.ext,f.is_dir,f.size,f.mtime_ms,
                    snippet(content_fts,0,'«','»',' … ',14) snip
             FROM content_fts JOIN files f ON f.rowid=content_fts.rowid
             WHERE content_fts MATCH ? AND f.missing=0 ORDER BY rank LIMIT ?`,
          ).all(matchQ, want - rows.length)) {
            if (!seen.has(r.rid)) { seen.add(r.rid); rows.push({ ...r, match: 'content' }); }
          }
        }
      }
      if (!rows.length) {
        const like = `%${q.toLowerCase()}%`;
        rows = db.prepare(
          `SELECT root_key,path,name,ext,is_dir,size,mtime_ms,'name' match FROM files
           WHERE missing=0 AND (lower(name) LIKE ? OR lower(path) LIKE ?) LIMIT ?`,
        ).all(like, like, q ? want : 5000);
      }
    } catch (e) { return { ok: false, error: `search failed: ${String(e.message || e).slice(0, 160)}` }; }
    // qualifier post-filter (ext set + path prefixes)
    if (exts.length) rows = rows.filter((r) => exts.includes(String(r.ext || '').toLowerCase()));
    if (paths.length) rows = rows.filter((r) => paths.some((p) => r.path === p || String(r.path).startsWith(`${p}/`)));
    const page = rows.slice(offset, offset + limit);
    const hasMore = rows.length > offset + limit;
    const partial = Date.now() - t0 > cap;
    return {
      ok: true,
      result: {
        hits: page.map((r) => ({ ...r, is_dir: !!r.is_dir })),
        mode: fts ? 'fts_or_like' : 'like', partial,
        next_cursor: hasMore ? `o${offset + limit}` : null,
      },
    };
  },

  index_now: async (args) => {
    runScan(args.root_key || null, args.path_prefix || '').catch((e) => log('warn', 'scan_err', { err: String(e.message || e).slice(0, 120) }));
    return { ok: true, result: { scheduled: true } };
  },

  mkdir: async (args) => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const root = rootFor(args.root_key);
    const rel = root ? normRel(args.path || '') : null;
    const abs = rel !== null ? resolveInRoot(root, rel) : null;
    if (!root || !abs) return { ok: false, error: 'bad root/path' };
    await fs.promises.mkdir(abs, { recursive: true });
    manifestSet(pathKeyLocal(root.root_key, rel), { origin: 'bridge', managed_by: 'bridge', created_ts: Date.now() });
    return { ok: true, result: { path: rel } };
  },

  // tombstone delete — never unlink. Refuses unless manifest says bridge-origin.
  delete: async (args) => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: 'unknown root' };
    const realMount = fs.realpathSync(root._mount || '');
    const results = []; const trashDir = path.posix.join(realMount, TRASH_DIR_NAME);
    for (const p of args.paths || []) {
      const rel = normRel(p);
      const abs = rel !== null ? resolveInRoot(root, rel) : null;
      const pk = rel !== null ? pathKeyLocal(root.root_key, rel) : '';
      if (!abs) { results.push({ path: p, ok: false, error: 'path outside root' }); continue; }
      if (!canDeleteLocal(pk)) { results.push({ path: p, ok: false, error: 'no bridge provenance — external file, refusing' }); continue; }
      const st = await fs.promises.stat(abs).catch(() => null);
      if (!st) { results.push({ path: p, ok: false, error: 'not found' }); continue; }
      if (st.isDirectory() && fs.readdirSync(abs).length) { results.push({ path: p, ok: false, error: 'non-empty directory' }); continue; }
      try {
        await fs.promises.mkdir(trashDir, { recursive: true });
        const dest = path.posix.join(trashDir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${path.posix.basename(abs)}`);
        await fs.promises.rename(abs, dest);
        manifestSet(pk, { deleted_ts: Date.now(), trash_path: dest.slice(realMount.length) });
        if (db) db.prepare('UPDATE files SET missing=1 WHERE path_key=?').run(pk);
        results.push({ path: p, ok: true, tombstone: true });
      } catch (e) { results.push({ path: p, ok: false, error: String(e.message || e).slice(0, 160) }); }
    }
    return { ok: true, result: { results } };
  },

  restore_trash: async (args) => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: 'unknown root' };
    const rel = normRel(args.path || '');
    const pk = rel !== null ? pathKeyLocal(root.root_key, rel) : '';
    const rec = manifestGet(pk);
    if (!rec?.trash_path) return { ok: false, error: 'no tombstone recorded' };
    const src = resolveInRoot(root, rec.trash_path.replace(/^\//, ''));
    const dest = resolveInRoot(root, rel);
    if (!src || !dest) return { ok: false, error: 'path outside root' };
    await fs.promises.rename(src, dest);
    manifestSet(pk, { trash_path: null, restored_ts: Date.now() });
    if (db) db.prepare('UPDATE files SET missing=0 WHERE path_key=?').run(pk);
    return { ok: true, result: { path: rel, restored: true } };
  },

  move: async (args) => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const root = rootFor(args.root_key);
    const srcRel = root ? normRel(args.src || '') : null;
    // spec: dest_dir is a directory — the file keeps its basename (collision-safe)
    const destDir = root ? normRel(args.dest_dir ?? args.dst ?? '') : null;
    const dstRel = destDir !== null
      ? (destDir ? `${destDir}/${path.posix.basename(srcRel || '')}` : path.posix.basename(srcRel || ''))
      : null;
    const src = srcRel !== null ? resolveInRoot(root, srcRel) : null;
    let dst = dstRel ? resolveInRoot(root, dstRel) : null;
    if (!root || !srcRel || !src || !dst || !dstRel) return { ok: false, error: 'bad root/path' };
    if (dstRel === srcRel) return { ok: true, result: { src: srcRel, dst: dstRel, noop: true } };
    const srcPk = pathKeyLocal(root.root_key, srcRel);
    if (!canMoveLocal(srcPk)) return { ok: false, error: 'not bridge-managed — refusing' };
    if (!(await fs.promises.stat(src).catch(() => null))) return { ok: false, error: 'src not found' };
    // never overwrite — collision → "name (n).ext" like upload_apply
    if (fs.existsSync(dst)) {
      const ext = path.posix.extname(dstRel); const stem = dstRel.slice(0, dstRel.length - ext.length);
      let n = 1; let alt = '';
      do { alt = `${stem} (${n})${ext}`; n += 1; if (n > 99) return { ok: false, error: 'no free filename' }; }
      while (fs.existsSync(resolveInRoot(root, alt)));
      dst = resolveInRoot(root, alt);
      if (!dst) return { ok: false, error: 'bad dest' };
      const drel = alt;
      await fs.promises.mkdir(path.posix.dirname(dst), { recursive: true });
      await fs.promises.rename(src, dst);
      manifestSet(pathKeyLocal(root.root_key, drel), { ...(manifestGet(srcPk) || { managed_by: 'bridge' }), moved_ts: Date.now() });
      manifest[srcPk] = undefined; manifestSave();
      if (db) db.prepare('UPDATE files SET missing=1 WHERE path_key=?').run(srcPk);
      return { ok: true, result: { src: srcRel, dst: drel, renamed: true } };
    }
    await fs.promises.mkdir(path.posix.dirname(dst), { recursive: true });
    await fs.promises.rename(src, dst);
    manifestSet(pathKeyLocal(root.root_key, dstRel), { ...(manifestGet(srcPk) || { managed_by: 'bridge' }), moved_ts: Date.now() });
    manifest[srcPk] = undefined; manifestSave();
    if (db) db.prepare('UPDATE files SET missing=1 WHERE path_key=?').run(srcPk);
    return { ok: true, result: { src: srcRel, dst: dstRel } };
  },

  // upload_apply / archive_output: pull the staged file_url (outbound HTTPS),
  // verify sha256, collision-safe atomic write, stamp bridge provenance, index.
  upload_apply: async (args) => applyRemoteFile(args),
  archive_output: async (args) => applyRemoteFile(args),

  // pin_file: promote/demote a row in the hot index — server-side flag via an
  // index_batch patch (scan batches omit pinned so it survives re-scans).
  pin_file: async (args) => {
    const root = rootFor(args.root_key);
    if (!root) return { ok: false, error: `unknown root '${args.root_key}'` };
    const rel = normRel(args.path || '');
    if (rel === null) return { ok: false, error: 'bad path' };
    const row = db?.prepare('SELECT entity_id, is_dir FROM files WHERE path_key=?').get(pathKeyLocal(root.root_key, rel));
    await flushIndexBatch([{
      root_key: root.root_key, path: rel, is_dir: row?.is_dir || false,
      pinned: args.pinned !== false, entity_id: row?.entity_id || undefined,
    }], Number(metaGet('last_scan_id', 0)) || 0);
    return { ok: true, result: { path: rel, pinned: args.pinned !== false } };
  },

  // relink_files: stamp customer_ids on every index row under a prefix so
  // customer panels/queries pick them up. Mutating-ish but index-only —
  // no filesystem change, so both roles could serve it; spec says primary.
  relink_files: async (args) => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const root = rootFor(args.root_key);
    const prefix = normRel(args.path_prefix || '');
    if (!root || prefix === null || !db) return { ok: false, error: 'bad root/prefix or index unavailable' };
    const cid = String(args.customer_id || '');
    const rows = db.prepare(
      `SELECT path, entity_id FROM files WHERE root_key=? AND (path=? OR path LIKE ? || '/%')`
    ).all(root.root_key, prefix, prefix);
    const ids = cid ? [cid] : [];
    for (let i = 0; i < rows.length; i += SCAN_BATCH) {
      await flushIndexBatch(rows.slice(i, i + SCAN_BATCH).map((r) => ({
        root_key: root.root_key, path: r.path, customer_ids: ids,
        entity_id: r.entity_id || undefined,
      })), Number(metaGet('last_scan_id', 0)) || 0);
    }
    log('info', 'relinked', { root_key: root.root_key, prefix, customer_id: cid, count: rows.length });
    return { ok: true, result: { relinked: rows.length, customer_id: cid } };
  },

  // rebuild_manifest: pull the FileBridgeUpload ledger (durable provenance —
  // survives reinstalls/promotion) and re-stamp manifest.json entries.
  rebuild_manifest: async () => {
    if (state.role !== 'primary') return { ok: false, error: 'not primary — refuses mutations' };
    const r = await post('manifest_export', {});
    if (r?.status !== 200) return { ok: false, error: `export failed ${r?.status}`, retry: true };
    const entries = r.json?.entries || [];
    let stamped = 0;
    for (const e of entries) {
      if (!rootFor(e.root_key)) continue; // only roots this agent actually mounts
      const pk = pathKeyLocal(e.root_key, e.path);
      manifestSet(pk, {
        origin: e.origin || 'bridge', managed_by: e.managed_by || 'bridge',
        upload_id: e.upload_id, uploaded_by: e.uploaded_by,
        created_ts: e.created_ts || Date.now(), rebuilt_ts: Date.now(),
      });
      stamped += 1;
    }
    log('info', 'manifest_rebuilt', { exported: entries.length, stamped });
    return { ok: true, result: { exported: entries.length, stamped } };
  },

  log_tail: async (args) => {
    const lines = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-(args.lines || 200)) : [];
    return { ok: true, result: { lines } };
  },
};

const runCommand = async (cmd) => {
  const chaosDrop = ENV.CHAOS_DROP_COMMANDS === '1' && Math.random() < 0.3;
  if (chaosDrop) { log('warn', 'chaos_drop', { command_id: cmd.command_id }); return; }
  const exec = executors[cmd.type];
  log('info', 'cmd_start', { command_id: cmd.command_id, type: cmd.type });
  try {
    const r = exec ? await exec(cmd.args || {}, cmd) : { ok: false, error: `no executor for '${cmd.type}'` };
    if (r.done_by_ingest) return; // deliver_complete already closed the command
    await post('command_complete', {
      command_id: cmd.command_id, success: r.ok !== false,
      result: r.result || {}, error: r.error || '',
    });
  } catch (e) {
    await post('command_complete', { command_id: cmd.command_id, success: false, error: String(e.message || e) }).catch(() => null);
  }
};

// ---- wake channels ----
const sseLoop = async () => {
  while (true) {
    try {
      const res = await post('command_wait', { hold_ms: HOLD_MS }, { stream: true, timeoutMs: HOLD_MS + 30_000 });
      if (res.statusCode !== 200) { state.sse_ok = false; return; }
      let buf = '';
      for await (const chunk of res) {
        buf += chunk.toString('utf8');
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const p of parts) {
          const data = p.replace(/^data: /, '').trim();
          if (!data) continue;
          let msg; try { msg = JSON.parse(data); } catch { continue; }
          if (msg.type === 'command') runCommand(msg);
        }
      }
      // stream ended cleanly — reconnect
    } catch (e) {
      state.sse_ok = false;
      log('warn', 'sse_down', { err: String(e.message || e).slice(0, 120) });
      return;
    }
  }
};

const pollLoop = async () => {
  while (true) {
    try {
      const r = await post('command_poll', {});
      if (r.status === 200 && Array.isArray(r.json.commands)) {
        for (const c of r.json.commands) runCommand(c);
      }
      await spoolDrain();
      if (state.sse_ok !== false) { /* prefer SSE when healthy */ }
    } catch (e) {
      log('warn', 'poll_err', { err: String(e.message || e).slice(0, 120) });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
};

const main = async () => {
  log('info', 'agent_start', { agent_id: AGENT_ID, env_role: ROLE_ENV, version: VERSION, roots: ROOTS });
  // FB_SCAN_ONLY=1: scan local mounts, report, exit — mount verification for
  // the Unraid walkthrough; spool captures batches since ingest is offline.
  if (ENV.FB_SCAN_ONLY === '1') {
    const scanId = Date.now();
    for (const mount of ROOTS) {
      const root = { root_key: path.posix.basename(mount), _mount: mount, extraction_enabled: ENV.FB_EXTRACT === '1' };
      const s = await scanRoot(root, scanId);
      log('info', 'scan_only_root', { mount, ...s, batch: undefined, recent: undefined });
    }
    const counts = db ? {
      rows: db.prepare('SELECT COUNT(*) c FROM files').get()?.c,
      fts_rows: fts ? db.prepare('SELECT COUNT(*) c FROM files_fts').get()?.c : 'n/a',
      spool: spoolDepth(),
    } : { db: 'unavailable' };
    log('info', 'scan_only_done', counts);
    process.exit(0);
  }
  for (let attempt = 0; ; attempt += 1) {
    try { await handshake(); break; }
    catch (e) {
      const backoff = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.7 + Math.random() * 0.6);
      log('warn', 'handshake_retry', { err: String(e.message || e).slice(0, 160), backoff_ms: Math.round(backoff) });
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  // optional failover claim: FB_CLAIM_PRIMARY=1 requests promotion when the
  // current primary is stale; =force overrides a live primary (operator tool).
  const claim = String(ENV.FB_CLAIM_PRIMARY || '').toLowerCase();
  if (claim && state.role !== 'primary') {
    const r = await post('become_primary', { force: claim === 'force' }).catch(() => null);
    if (r?.status === 200 && r.json?.role === 'primary') {
      state.role = 'primary';
      log('warn', 'promoted_primary', { previous: r.json.previous_primary });
    } else {
      log('warn', 'claim_primary_refused', { status: r?.status, err: JSON.stringify(r?.json || {}).slice(0, 160) });
    }
  }
  // SSE primary; poll always runs (cheap, drains spool, covers SSE gaps)
  sseLoop();
  pollLoop();
  // periodic re-handshake for config/role changes
  setInterval(() => handshake().catch(() => null), 120_000);
  // provenance drift check: local manifest vs server upload ledger (hourly)
  checkManifestDrift().catch(() => null);
  setInterval(() => checkManifestDrift().catch(() => null), 60 * 60_000);
  // scheduled re-scan: metadata sweep every 15min (config can retune later)
  if (state.role !== 'observer') {
    runScan().catch((e) => log('warn', 'scan_err', { err: String(e.message || e).slice(0, 120) }));
    setInterval(() => runScan().catch((e) => log('warn', 'scan_err', { err: String(e.message || e).slice(0, 120) })), 15 * 60_000);
  }
};

main();
