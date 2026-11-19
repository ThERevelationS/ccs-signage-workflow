// Local entity mirrors — the fleet reads snapshots from disk, never a running
// stream of staffDataRead pages against the app. One sync daemon owns remote
// reads; workers consume mirrors and write-through after confirmed writes.
//
// Mirror file: .audit-work/mirrors/<name>.json  →  {at: epochMs, rows: [...]}
// Canonical names: profiles-oh, profiles-ky, localities, queue.
import fs from 'node:fs';
import path from 'node:path';

export const MIRROR_DIR = '.audit-work/mirrors';
export const mirrorPath = (n) => `${MIRROR_DIR}/${n}.json`;
const journalPath = (n) => `${mirrorPath(n)}.journal.jsonl`;

// Write journal — mirrorApply appends one line instead of rewriting the whole
// base file (profiles-oh is 80MB; ~40 workers doing full rewrites per write was
// a disk+parse storm). getMirror folds the journal over the base at read time;
// putMirror folds+truncates so the journal stays bounded between snapshots.
function readJournal(name) {
  try {
    const raw = fs.readFileSync(journalPath(name), 'utf8');
    const map = new Map(); // id -> {row} | {del:true}
    let latest = 0;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        if (e?.id) { map.set(e.id, e); if (e.t > latest) latest = e.t; }
      } catch {}
    }
    return { map, latest };
  } catch { return { map: new Map(), latest: 0 }; }
}
function foldJournal(name, rows) {
  const { map: j } = readJournal(name);
  if (!j.size) return rows;
  const byId = new Map(rows.map((r) => [r?.id, r]));
  const out = [];
  for (const r of rows) {
    const e = j.get(r?.id);
    if (!e) { out.push(r); continue; }
    if (e.del) continue;
    out.push({ ...r, ...e.row });
    j.delete(r.id);
  }
  for (const e of j.values()) if (!e.del && e.row?.id) out.push(e.row);
  return out;
}

export function getMirror(name) {
  try {
    const j = JSON.parse(fs.readFileSync(mirrorPath(name), 'utf8'));
    if (!j || !Array.isArray(j.rows)) return null;
    const { latest } = readJournal(name);
    // Journal writes bump freshness — otherwise mirrorRead's maxAge check would
    // fall back to full remote reads between 10min daemon syncs.
    return { ...j, at: Math.max(j.at || 0, latest), rows: foldJournal(name, j.rows) };
  } catch { return null; }
}
export function mirrorAgeMs(name) {
  const m = getMirror(name);
  return m ? Date.now() - m.at : Infinity;
}
export function putMirror(name, rows, { fold = true } = {}) {
  fs.mkdirSync(MIRROR_DIR, { recursive: true });
  if (fold) rows = foldJournal(name, rows); // journal is newer than any base snapshot
  const tmp = `${mirrorPath(name)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), rows }));
  // Windows EPERM: rename fails while another worker holds the file open for
  // read. Retry briefly, then fall back to copy-over (atomicity loss is fine —
  // a torn JSON read just falls back to the previous snapshot or self-sync).
  for (let i = 0; i < 5; i++) {
    try { fs.renameSync(tmp, mirrorPath(name)); return; }
    catch (e) {
      if (e?.code !== 'EPERM' && e?.code !== 'EBUSY') throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 + i * 300);
    }
  }
  try { fs.copyFileSync(tmp, mirrorPath(name)); } catch {}
  try { fs.unlinkSync(tmp); } catch {}
  try { fs.unlinkSync(journalPath(name)); } catch {} // base now carries journal — reset it
}
// Write-through: after a confirmed remote write, fold the change into the
// local mirror so every other worker sees it before the next daemon sync.
// `record` should be the response record when available; a {id,...patch}
// merge works for CAS patches (updated_date will be stale until next sync —
// point-reads anchor CAS anyway, so this is safe).
// Cross-process merge mutex — mirrorApply is get→merge→put across ~20
// worker processes; without a lock two writers can interleave reads and lose
// each other's record. mkdir is the atomic primitive on Windows.
function withMirrorLock(name, fn) {
  const lock = `${mirrorPath(name)}.lock`;
  try { fs.mkdirSync(MIRROR_DIR, { recursive: true }); } catch {}
  for (let t = 0; ; t++) {
    try { fs.mkdirSync(lock); break; } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmdirSync(lock); continue; } } catch {}
      if (t > 1000) return fn(); // ~5s fallback — never hang a worker on a dead lock
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + Math.floor(Math.random() * 10));
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch {} }
}

// Local-pending ledger — mirrorApply/mirrorRemove effects live in the mirror
// before the outbox flushes them remotely. If the sync daemon then pulls a
// remote snapshot taken BEFORE that flush, a wholesale putMirror would roll
// the mirror back (apply-ready oscillated 741→654 this way). The ledger
// records which ids have local deltas; putMirrorSnapshot keeps the local row
// until the remote row's updated_date proves the write landed.
const pendingPath = (n) => `${mirrorPath(n)}.pending.json`;
function readPending(name) {
  try {
    const j = JSON.parse(fs.readFileSync(pendingPath(name), 'utf8'));
    return { upserts: j.upserts || {}, deletes: j.deletes || {} };
  } catch { return { upserts: {}, deletes: {} }; }
}
function writePending(name, p) {
  const cutoff = Date.now() - 24 * 3600 * 1000; // prune dead entries
  for (const bag of [p.upserts, p.deletes]) for (const [id, ts] of Object.entries(bag)) if (ts < cutoff) delete bag[id];
  try { fs.writeFileSync(pendingPath(name), JSON.stringify(p)); } catch {}
}

// Write-boundary office dedupe — the offices[] same-id corruption kept returning
// because any worker holding a pre-dedupe array writes the whole stale array
// back (last-write-wins). Every write path carrying offices[] gets deduped
// here so stale writers can't re-corrupt. Id-keyed only — name-merge is too
// aggressive for a boundary (distinct offices can share generic names).
export function dedupeOfficeRows(offices) {
  if (!Array.isArray(offices) || offices.length < 2) return offices;
  const out = []; const byId = new Map();
  let changed = false;
  for (const o of offices) {
    if (!o) { changed = true; continue; }
    const k = o.id ? `id:${o.id}` : null;
    const prev = k && byId.has(k) ? byId.get(k) : -1;
    if (prev < 0) { if (k) byId.set(k, out.length); out.push(o); continue; }
    const a = out[prev], b = o;
    const score = (x) => (x?.authority_verification_status === 'staff_verified' ? 100 : 0) + (x?.authority_roles || []).length + Object.keys(x || {}).length;
    const [keep, drop] = score(a) >= score(b) ? [a, b] : [b, a];
    const roles = new Set([...(keep.authority_roles || []), ...(drop.authority_roles || [])]);
    const unproven = new Set([...(keep.unproven_roles || []), ...(drop.unproven_roles || [])].filter((r) => !roles.has(r)));
    const merged = { ...drop, ...keep, authority_roles: [...roles] };
    if (unproven.size) merged.unproven_roles = [...unproven]; else delete merged.unproven_roles;
    for (const f of ['contact_phone', 'contact_email', 'contact_website', 'contact_address', 'contact_person', 'contact_notes', 'service_area']) {
      if (!String(merged[f] || '').trim() && String(drop[f] || '').trim()) merged[f] = drop[f];
    }
    out[prev] = merged; changed = true;
  }
  return changed ? out : offices;
}

export function mirrorApply(name, record) {
  if (!record?.id) return false;
  if (Array.isArray(record.offices)) record = { ...record, offices: dedupeOfficeRows(record.offices) };
  return withMirrorLock(name, () => {
    try { fs.appendFileSync(journalPath(name), JSON.stringify({ id: record.id, row: record, t: Date.now() }) + '\n'); } catch { return false; }
    const p = readPending(name);
    p.upserts[record.id] = Date.now(); delete p.deletes[record.id];
    writePending(name, p);
    // Safety valve: a journal that outgrows the base means the sync daemon is
    // dead — fold inline so reads stay cheap and data stays durable.
    try { if (fs.statSync(journalPath(name)).size > 40 * 1024 * 1024) { const m = getMirror(name); if (m) putMirror(name, m.rows); } } catch {}
    return true;
  });
}
export function mirrorRemove(name, id) {
  return withMirrorLock(name, () => {
    try { fs.appendFileSync(journalPath(name), JSON.stringify({ id, del: true, t: Date.now() }) + '\n'); } catch { return false; }
    const p = readPending(name);
    p.deletes[id] = Date.now(); delete p.upserts[id];
    writePending(name, p);
    return true;
  });
}
// Daemon snapshot write — the ONLY path bulk remote reads should land through.
// Preserves rows whose local state is newer than the incoming snapshot so a
// sync taken mid-outbox never rolls back unflushed promotions/deletes.
export function putMirrorSnapshot(name, rows) {
  return withMirrorLock(name, () => {
    const p = readPending(name);
    const cur = getMirror(name);
    const localById = new Map((cur?.rows || []).map((r) => [r.id, r]));
    const remoteAt = (r) => Date.parse(r?.updated_date || 0) || 0;
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const id = r?.id;
      if (!id) { out.push(r); continue; }
      seen.add(id);
      if (p.deletes[id] && remoteAt(r) <= p.deletes[id]) continue; // locally deleted, remote still stale
      if (p.upserts[id] && remoteAt(r) <= p.upserts[id]) { out.push(localById.get(id) || r); continue; }
      delete p.upserts[id]; delete p.deletes[id]; // remote is as-new — the write landed
      out.push(r);
    }
    // Unflushed creates missing from remote — keep the local row.
    for (const [id] of Object.entries(p.upserts)) {
      if (!seen.has(id) && localById.has(id)) out.push(localById.get(id));
    }
    writePending(name, p);
    putMirror(name, out, { fold: false }); // localById already carried journal rows
    return true;
  });
}
// Mirror-first read: fresh mirror → rows immediately. Stale/missing → caller's
// remoteSync() (a full read) then putMirror. `remoteSync` must return rows or
// null on failure (never [] for failure).
export async function mirrorRead(name, maxAgeMs, remoteSync) {
  const m = getMirror(name);
  if (m && Date.now() - m.at < maxAgeMs) return m.rows;
  const rows = await remoteSync();
  if (rows === null) return m ? m.rows : null; // serve stale over nothing
  putMirror(name, rows);
  return rows;
}
