// Local write outbox — workers enqueue entity writes here instead of calling
// staffEntityWrite directly. One flusher daemon drains FIFO at a capped rate
// so the fleet's aggregate write volume can't starve the live site's entity
// budget (the "app-level read volume" + per-caller 140/60s the site shares).
import fs from 'node:fs';
import { mirrorApply, dedupeOfficeRows } from './entity-mirror.mjs';

export const OUTBOX = '.audit-work/outbox.jsonl';
export const OUTBOX_DONE = '.audit-work/outbox-done.jsonl';
export const OUTBOX_ERR = '.audit-work/outbox-errors.jsonl';
export const OUTBOX_CORRUPT = '.audit-work/outbox-corrupt.jsonl';

// Cross-process append mutex — 20+ workers appendFileSync the same file; a
// torn line would otherwise poison the FIFO head forever. mkdir is the only
// atomic cross-process lock primitive that works on Windows.
const LOCK = '.audit-work/outbox-mutex';
function withLock(fn) {
  try { fs.mkdirSync('.audit-work', { recursive: true }); } catch {}
  for (let t = 0; ; t++) {
    try { fs.mkdirSync(LOCK); break; } catch {
      // Stale-lock break: a crashed writer leaves the dir behind.
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 30000) { fs.rmdirSync(LOCK); continue; } } catch {}
      if (t > 2000) return fn(); // ~10s fallback — never block a worker forever
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + Math.floor(Math.random() * 10));
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(LOCK); } catch {} }
}

export const sanitizeOffice = (o) => {
  // field_confidence is a schema-typed dict; "" and other non-dict values make
  // remote validation reject the whole update.
  if (o && typeof o === 'object' && 'field_confidence' in o
    && !(o.field_confidence === null || (typeof o.field_confidence === 'object' && !Array.isArray(o.field_confidence)))) {
    return { ...o, field_confidence: null };
  }
  return o;
};

export function enqueue(rec) {
  // rec: {entity, op, id, query, data, mirror, note}
  // Write-boundary office dedupe: a stale writer's full offices[] can't
  // re-introduce same-id rows — deduped before it reaches the queue or mirror.
  if (rec?.entity === 'PermitLocality' && Array.isArray(rec?.data?.offices)) {
    rec = { ...rec, data: { ...rec.data, offices: dedupeOfficeRows(rec.data.offices).map(sanitizeOffice) } };
  }
  const line = JSON.stringify({ at: Date.now(), attempts: 0, ...rec });
  withLock(() => fs.appendFileSync(OUTBOX, line + '\n'));
  // Workers see their own write immediately via the mirror — the flush to
  // remote is the only part that waits.
  if (rec.mirror && (rec.data?.id || rec.id)) {
    mirrorApply(rec.mirror, { id: rec.data?.id || rec.id, ...(rec.data || {}) });
  }
  return true;
}

export function outboxDepth() {
  try { return fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; }
}

// Pop `limit` pending writes FIFO; remaining entries are written back first so
// a crash mid-drain can't lose queued work (done/error lines append to their
// own journals — nothing is silently dropped).
export function takeBatch(limit) {
  // Locked read+rewrite: an enqueue landing between the read and the
  // writeFileSync would be silently lost otherwise (the clobber race).
  return withLock(() => {
    let lines = [];
    try { lines = fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; }
    if (!lines.length) return [];
    // Priority lane: recs marked priority:1 (authority promotions, line-item
    // upgrades) drain ahead of the FIFO bulk. When the backlog is tens of
    // thousands deep, strict FIFO would delay a verified apply-ready flip by
    // an hour — the priority head takes the next batch instead.
    const pri = [], fifo = [], corrupt = [];
    for (const l of lines) {
      let rec; try { rec = JSON.parse(l); } catch { corrupt.push(l); continue; }
      (rec.priority ? pri : fifo).push(l);
    }
    const take = Math.min(limit, pri.length);
    const batch = pri.slice(0, take).concat(fifo.slice(0, limit - take));
    const rest = pri.slice(take).concat(fifo.slice(limit - take));
    const batchRecs = [];
    for (const l of batch) { try { batchRecs.push(JSON.parse(l)); } catch { corrupt.push(l); } }
    try { fs.writeFileSync(OUTBOX, rest.length ? rest.join('\n') + '\n' : ''); } catch {}
    // Corrupt lines (torn concurrent writes) go to a side journal — preserved
    // for recovery instead of silently dropped or re-blocking the head forever.
    if (corrupt.length) try { fs.appendFileSync(OUTBOX_CORRUPT, corrupt.join('\n') + '\n'); } catch {}
    return batchRecs;
  });
}

// Locked tail-append for flusher requeues — same guarantee as enqueue without
// resetting the attempts counter.
export function requeueTail(rec) {
  withLock(() => fs.appendFileSync(OUTBOX, JSON.stringify(rec) + '\n'));
}

export function journal(file, rec) {
  try { fs.appendFileSync(file, JSON.stringify({ flushed_at: Date.now(), ...rec }) + '\n'); } catch {}
}

// Compact the FIFO: N workers re-write the same rows constantly (queue status
// closes, repeated index creates), so most pending lines are superseded by a
// later write to the same target. Updates to the same id merge their $set
// fields (later wins — no field is lost); duplicate creates collapse to the
// latest content per content-key. Locked read+rewrite, same as takeBatch.
const mergeSet = (a, b) => {
  if (!a && !b) return undefined;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) out[k] = k === '$set' ? { ...(a?.$set || {}), ...(v || {}) } : v;
  return out;
};
const createKey = (rec) => {
  const d = rec.data || {};
  return d.address_key || `${d.jurisdiction_name || ''}|${d.state || ''}` || `${d.name || ''}|${d.state || ''}` || JSON.stringify(d).slice(0, 200);
};
export function compactOutbox() {
  return withLock(() => {
    let lines = [];
    try { lines = fs.readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean); } catch { return { before: 0, after: 0, dropped: 0 }; }
    const before = lines.length;
    const slots = new Map(); // key -> rec (merged/latest)
    const order = [];        // first-seen key order preserves FIFO semantics
    for (const l of lines) {
      let rec; try { rec = JSON.parse(l); } catch { continue; } // corrupt lines are journaled by takeBatch, not here
      let k = null;
      if (rec.op === 'update' && (rec.id || rec.query)) k = `${rec.entity}|u|${rec.id || JSON.stringify(rec.query)}`;
      else if (rec.op === 'create') k = `${rec.entity}|c|${createKey(rec)}`;
      if (!k) { const pk = `p|${order.length}`; slots.set(pk, rec); order.push(pk); continue; }
      const prev = slots.get(k);
      if (!prev) { slots.set(k, rec); order.push(k); continue; }
      if (rec.op === 'update') {
        prev.data = { ...(prev.data || {}), ...(rec.data || {}) };
        prev.update = mergeSet(prev.update, rec.update);
        prev.at = rec.at ?? prev.at;
        prev.note = rec.note || prev.note;
        prev.priority = prev.priority || rec.priority; // a priority write merging into plain FIFO keeps its lane
      } else slots.set(k, rec); // latest create wins
    }
    const out = order.map((k) => slots.get(k)).filter(Boolean);
    try { fs.writeFileSync(OUTBOX, out.length ? out.map((r) => JSON.stringify(r)).join('\n') + '\n' : ''); } catch {}
    return { before, after: out.length, dropped: before - out.length };
  });
}
