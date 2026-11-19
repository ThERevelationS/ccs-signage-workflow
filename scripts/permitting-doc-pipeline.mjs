#!/usr/bin/env node
// Permitting document pipeline — the app's file-gather + text-extract chain,
// run LOCALLY instead of through server functions + UploadFile integration.
//
// Same code, local adapters: this worker imports the REAL shared modules
// (archiveKnownJurisdictionSource / extractKnownSourceText /
// registerJurisdictionArchive) and injects local implementations:
//   entity      → mirror reads + staffEntityWrite CAS writes (cheap entity ops)
//   fetchSource → Node fetch (browser UA) + local:// scheme reads the file store
//   uploadFile  → writes .audit-work/source-files/<name>, returns local:// url
//   readAndExtract → pdfjs per-page text from the LOCAL archived bytes
//
// Flow per pass:
//   A. profile.documents[] eligible → archiveKnownJurisdictionSource → bytes to
//      source-files/, doc.file_url = 'local://source-files/<sha>.<ext>',
//      archive_state 'complete' (verified vs local bytes), catalog skipped
//   B. docs with file_url ^local:// are picked up by permitting-file-uploader
//      (bounded lane) → staffArchiveFile → real storage url → CAS re-stamp
//   C. catalog rows (PermittingSourceDocument) with archived_file_url + sha but
//      no text → extractKnownSourceText against local bytes → segments + state
//      (runs only on real urls — the uploader swaps local:// before catalog)
//
// Usage: node scripts/permitting-doc-pipeline.mjs [--once] [--slice i --slices n]
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { archiveKnownJurisdictionSource } from '../base44/shared/jurisdictionArchiveContinuation.mjs';
import { registerJurisdictionArchive } from '../base44/shared/jurisdictionArchiveCatalog.mjs';
import { extractKnownSourceText } from '../base44/shared/jurisdictionSourceTextContinuation.mjs';
import { PDF_TEXT_METHOD, PDF_TEXT_PAGE_BATCH, PDF_TEXT_MAX_PAGE_CHARS } from '../base44/shared/jurisdictionSourcePdfText.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { officeKey, ensureOfficeDirs, indexFile, resolveOffice, readIndex, officeDir } from './lib/office-files.mjs';

const SLICE = Number(process.argv.includes('--slice') ? process.argv[process.argv.indexOf('--slice') + 1] : 0);
const SLICES = Number(process.argv.includes('--slices') ? process.argv[process.argv.indexOf('--slices') + 1] : 1);
const ONCE = process.argv.includes('--once');
// Singleton: two instances CAS-war each other's archive claims. PID-file
// guard — exit if another live process holds it.
const PIDFILE = '.audit-work/doc-pipeline.pid';
try {
  const old = Number(readFileSync(PIDFILE, 'utf8'));
  if (old && old !== process.pid) { try { process.kill(old, 0); process.exit(0); } catch {} }
} catch {}
try { writeFileSync(PIDFILE, String(process.pid)); } catch {}
const FILES_DIR = '.audit-work/source-files';
try { mkdirSync(FILES_DIR, { recursive: true }); } catch {}

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'doc-pipeline', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sliceOf = (id) => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SLICES; };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// ── remote calls (entity ops only — no integrations) ─────────────────────
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null;
// Token bucket — the 140 req/60s entity budget is SHARED across all workers on
// the same credential. This pipeline is background bulk work: cap at ~14/min so
// the fleet keeps headroom and we never trip the app-level limit ourselves.
let callsAt = [];
async function budget() {
  while (true) {
    const now = Date.now();
    callsAt = callsAt.filter((t) => now - t < 60_000);
    if (callsAt.length < 14) { callsAt.push(now); return; }
    await sleep(60_000 - (now - callsAt[0]) + 50);
  }
}
async function login() {
  if (token) return token;
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  token = t?.session_token || t?.token || null;
  return token;
}
async function call(fn, body, timeout = 60000) {
  await budget();
  const tk = await login(); if (!tk) return null;
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, ...body }), signal: AbortSignal.timeout(timeout) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (/rate limit/i.test(JSON.stringify(j || {}))) { emit({ stage: 'doc_budget_wait', detail: 'shared entity budget hit — backing off 65s' }); await sleep(65_000); }
  return j;
}

// ── entity adapters (the contract archiveKnownJurisdictionSource / the
//    text continuation expect: get / filter / updateMany / create) ─────────
function profileEntity(mirrorRows) {
  const byId = new Map(mirrorRows.map((r) => [r.id, r]));
  return {
    get: async (id) => {
      // CAS writes need a fresh updated_date — point-read remote for the anchor.
      const j = await call('staffDataRead', { entity: 'JurisdictionProfile', query: { id }, limit: 1 });
      const list = j?.items || j?.rows || j?.data?.items || j?.data?.rows || [];
      const row = list[0] || null;
      return row || byId.get(id) || null;
    },
    filter: async (query) => mirrorRows.filter((r) => matchQuery(r, query)),
    updateMany: async (query, update) => {
      // staffEntityWrite allows only create+update on JurisdictionProfile — but
      // its update op IS the same CAS contract via expected_updated_date.
      // Translate the shared code's updateMany({id,updated_date},{$set}) call.
      const patch = update?.$set || update || {};
      const j = await call('staffEntityWrite', {
        entity: 'JurisdictionProfile', op: 'update', id: query.id,
        data: patch, expected_updated_date: query.updated_date,
      });
      const updated = j?.success ? 1 : 0;
      if (!updated) emit({ stage: 'doc_cas_miss', ok: false, detail: `${query.id}: ${JSON.stringify(j).slice(0, 160)}` });
      if (updated === 1 && query.id && byId.has(query.id)) {
        const fresh = j?.record || j?.row || null;
        if (fresh) { mirrorApply(String(fresh.state || '').toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh', fresh); byId.set(query.id, fresh); }
      }
      return { updated };
    },
  };
}
// staffDataRead may not support $or/$and — decompose compound queries into
// simple legs, query remote per leg, union + JS-match the result. Catalog
// lookups are small dedupe checks; over-fetching is the safe direction.
async function remoteFilter(entityName, query, limit = 20) {
  const legs = query?.$or ? query.$or : query?.$and ? [query] : [query];
  const seen = new Map();
  for (const leg of legs) {
    const simple = {};
    const walk = (q) => { for (const [k, v] of Object.entries(q || {})) { if (k.startsWith('$')) { if (Array.isArray(v)) v.forEach(walk); continue; } if (v && typeof v === 'object' && ('$in' in v)) { simple[k] = v.$in.find((x) => x); } else if (typeof v !== 'object' || v === null) simple[k] = v; } };
    walk(leg);
    if (!Object.keys(simple).length) continue;
    const j = await call('staffDataRead', { entity: entityName, query: simple, limit });
    for (const r of j?.items || j?.rows || j?.data?.items || j?.data?.rows || []) seen.set(r.id, r);
  }
  return [...seen.values()].filter((r) => matchQuery(r, query)).slice(0, limit);
}
// Backend-only permitting entities write through staffPermittingDocWrite —
// same CAS contract (expected_updated_date → updated:1 / 409→updated:0).
const docWrite = (entity, op, body) => call('staffPermittingDocWrite', { entity, op, ...body });
const catalogEntity = () => ({
  get: async (id) => { const j = await call('staffDataRead', { entity: 'PermittingSourceDocument', query: { id }, limit: 1 }); return (j?.items || j?.rows || j?.data?.items || [])[0] || null; },
  filter: async (query, sort, limit = 20) => remoteFilter('PermittingSourceDocument', query, limit),
  create: async (data) => { const j = await docWrite('PermittingSourceDocument', 'create', { data }); return j?.row || j?.record || null; },
  updateMany: async (query, update) => {
    const patch = update?.$set || update || {};
    const j = await docWrite('PermittingSourceDocument', 'update', { id: query.id, data: patch, expected_updated_date: query.updated_date });
    return { updated: j?.success ? 1 : 0 };
  },
});
const segmentEntity = () => ({
  filter: async (query, sort, limit = 5) => remoteFilter('PermittingSourceTextSegment', query, limit),
  create: async (data) => { const j = await docWrite('PermittingSourceTextSegment', 'create', { data }); return j?.row || j?.record || null; },
});
function matchQuery(row, q) {
  if (!q) return true;
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return v.some((sub) => matchQuery(row, sub));
    if (k === '$and') return v.every((sub) => matchQuery(row, sub));
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) return v.$in.includes(row[k] ?? null) || (v.$in.includes('') && (row[k] ?? '') === '');
      if ('$ne' in v) return row[k] !== v.$ne;
      if ('$nin' in v) return !v.$nin.includes(row[k]);
      return row[k] === v;
    }
    return row[k] === v;
  });
}

// ── fetchSource: http(s) + local:// file store ────────────────────────────
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' };
const EXT_MIME = { pdf: 'application/pdf', txt: 'text/plain', html: 'text/html' };
async function fetchSource(url, init = {}) {
  if (String(url).startsWith('local://')) {
    const p = String(url).slice(8);
    if (!existsSync(p)) return { ok: false, status: 404, headers: new Map(), url, arrayBuffer: async () => { throw new Error('local archive missing'); } };
    const bytes = readFileSync(p);
    const ext = p.split('.').pop();
    return {
      ok: true, status: 200, url,
      headers: { get: (h) => (/content-type/i.test(h) ? EXT_MIME[ext] || 'application/octet-stream' : /content-length/i.test(h) ? String(bytes.length) : null) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      body: null,
    };
  }
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), ...init, headers: { ...UA, ...(init.headers || {}) } });
  // Per-file download progress for the dashboard: wrap the body stream so
  // every chunk read emits dl_progress (throttled). The archive code consumes
  // response.body.getReader() directly — arrayBuffer is only its fallback —
  // so the instrumentation must live on the stream, not on arrayBuffer.
  if (r.ok && r.body && typeof r.body.getReader === 'function') {
    const total = Number(r.headers.get('content-length')) || 0;
    const name = decodeURIComponent(String(url).split('/').pop().split('?')[0] || 'document');
    const u = String(url);
    emit({ stage: 'dl_start', url: u, detail: name, total });
    const orig = r.body;
    let got = 0, lastBytes = 0, lastTime = 0, closed = false;
    const stream = new ReadableStream({
      start(c) {
        const reader = orig.getReader();
        const parts = [];
        (async () => {
          // Stall watchdog: AbortSignal.timeout only covers headers — a server
          // that stalls mid-body would hang the whole pipeline otherwise.
          const STALL_MS = 5000;
          try {
            for (;;) {
              const { done, value } = await Promise.race([
                reader.read(),
                sleep(STALL_MS).then(() => ({ stalled: true })),
              ]);
              if (done) {
                if (!closed) { closed = true; emit({ stage: 'dl_done', url: u, detail: name, bytes: got, total }); }
                c.close(); return;
              }
              if (value === undefined && !(done === false)) { /* stalled marker */ }
              const chunk = value && value.byteLength !== undefined ? value : null;
              if (!chunk) { // stall timeout fired (or empty read)
                const n = (FAILC[u] = (FAILC[u] || 0) + 1); failcDirty = true;
                if (got > 0) partialStash.set(u, { parts, got });
                if (!closed) { closed = true; emit({ stage: 'dl_err', url: u, detail: `${name} — stalled ${STALL_MS / 1000}s at ${got}b (${n}×)`, bytes: got }); }
                try { await reader.cancel(); } catch {}
                c.error(new Error(`download stalled sc:${n}`)); return;
              }
              c.enqueue(chunk); parts.push(chunk); got += chunk.length;
              const now = Date.now();
              if (got - lastBytes >= 262144 || now - lastTime >= 1000) {
                emit({ stage: 'dl_progress', url: u, detail: name, bytes: got, total });
                lastBytes = got; lastTime = now;
              }
            }
          } catch (e) {
            if (!closed) { closed = true; emit({ stage: 'dl_err', url: u, detail: `${name} — ${String(e?.message || e).slice(0, 80)}`, bytes: got }); }
            c.error(e);
          }
        })();
      },
      cancel() {
        if (!closed) { closed = true; emit({ stage: 'dl_err', url: u, detail: `${name} — read cancelled`, bytes: got }); }
        return orig.cancel();
      },
    });
    try { Object.defineProperty(r, 'body', { get: () => stream }); } catch {}
    // Wrapping the stream disturbs the native body (bodyUsed flips), so the
    // stock arrayBuffer() throws "Body has already been read" on ~half of all
    // fetches. Override it to drain our wrapper stream instead — same result,
    // progress events intact.
    r.arrayBuffer = async () => {
      const reader = stream.getReader();
      const chunks = []; let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); n += value.length;
      }
      const buf = new Uint8Array(n); let off = 0;
      for (const ch of chunks) { buf.set(ch, off); off += ch.length; }
      return buf.buffer;
    };
  }
  return r;
}

// ── office-files wiring (LP-6) ────────────────────────────────────────────
// Per-pass lookup maps (set in pass()): profile_id → locality, profile id → row.
const ctxMaps = { profileById: new Map(), localityByProfile: new Map() };
// Per-archive context: onProgress captures the doc url archive is downloading,
// so uploadFile can resolve the owning office before bytes land.
const ctx = { profile: null, url: null, sha: null, ext: null, bytes: 0, resolved: null };
// Parallel archive workers each get their own ctx — shared ctx would race.
const CTXS = Array.from({ length: 16 }, () => ({ profile: null, url: null, sha: null, ext: null, bytes: 0, resolved: null }));

// Resolve which office owns a doc: issuing_office name match first, then
// official-url host vs offices[].contact_website host. Ambiguous → unassigned.
function keyForDoc(profile, doc, locality) {
  const loc = locality || ctxMaps.localityByProfile.get(profile?.id) || null;
  const office = resolveOffice(loc, doc);
  return {
    key: officeKey({ state: profile?.state, jurisdictionName: profile?.name, jurisdictionId: profile?.id, officeName: office?.name, officeId: office?.id }),
    office, locality: loc,
  };
}
const metaFor = (profile, res) => ({
  jurisdiction_id: profile?.id || null, jurisdiction_name: profile?.name || null, state: profile?.state || null,
  locality_id: res?.locality?.id || null,
  office_id: res?.office?.id || null, office_name: res?.office?.name || 'unassigned',
  roles: res?.office?.authority_roles || [],
});
function officeDirsFor(res, profile) {
  return ensureOfficeDirs(res.key, {
    jurisdiction: profile ? { id: profile.id, name: profile.name, state: profile.state, county_name: profile.parent_county, locality_id: res.locality?.id } : null,
    office: res.office ? { ...res.office, locality_id: res.locality?.id } : { name: 'unassigned', locality_id: res.locality?.id },
  });
}

// ── uploadFile: writes into the owning office's sources/ dir (or the flat
//    spillover pool when the owner cannot be resolved) → returns local:// ────
async function uploadFile({ file }, c = ctx) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = sha256(bytes);
  const ext = String(file.name || 'doc.pdf').split('.').pop().replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf';
  let rel = `${FILES_DIR}/${sha}.${ext}`;
  if (c.profile) {
    const doc = (c.profile.documents || []).find((d) => d.url === c.url) || null;
    const res = keyForDoc(c.profile, doc);
    const dir = officeDirsFor(res, c.profile);
    rel = path.join(dir, 'sources', `${sha}.${ext}`);
    c.sha = sha; c.ext = ext; c.bytes = bytes.length; c.resolved = res;
  }
  if (!existsSync(rel)) writeFileSync(rel, bytes);
  return { file_url: `local://${rel}` };
}

// ── readAndExtract: per-page pdfjs text from local bytes; raw text lands in
//    the owning office's text/<sha>.txt (append — pages arrive in batches) ──
function findLocalBytes(sha) {
  const flat = `${FILES_DIR}/${sha}.pdf`;
  if (existsSync(flat)) return flat;
  try {
    for (const off of Object.values(readIndex().offices || {}))
      for (const f of off.files || [])
        if (f.sha256 === sha && f.local_path && existsSync(f.local_path)) return f.local_path;
  } catch {}
  return null;
}
async function readAndExtract({ source, startPage = 1 }) {
  const localPath = String(source.archived_file_url || '').startsWith('local://')
    ? source.archived_file_url.slice(8) : findLocalBytes(source.file_hash_sha256);
  if (!localPath || !existsSync(localPath)) throw new Error('Local archive bytes missing for extraction.');
  const buf = readFileSync(localPath);
  const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true }).promise;
  try {
    const end = Math.min(doc.numPages, startPage + PDF_TEXT_PAGE_BATCH - 1);
    const pages = [];
    for (let p = startPage; p <= end; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let text = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      const truncated = text.length > PDF_TEXT_MAX_PAGE_CHARS;
      if (truncated) text = text.slice(0, PDF_TEXT_MAX_PAGE_CHARS);
      pages.push({ page: p, text: text || ' ', source_sha256: source.file_hash_sha256, source_document_id: source.id, method: PDF_TEXT_METHOD, extracted_at: new Date().toISOString(), truncated, needs_ocr_review: (text || '').length < 20 });
    }
    // Persist raw text + advance the office-file stage to 'extracted'.
    try {
      const profile = ctxMaps.profileById.get(source.jurisdiction_id);
      if (profile && pages.length) {
        const res = keyForDoc(profile, { issuing_office: source.issuing_office, url: source.official_url });
        const dir = officeDirsFor(res, profile);
        appendFileSync(path.join(dir, 'text', `${source.file_hash_sha256}.txt`),
          pages.map((p) => `--- page ${p.page} ---\n${p.text}`).join('\n') + '\n');
        indexFile(res.key, metaFor(profile, res), {
          sha256: source.file_hash_sha256, stage: 'extracted',
          official_url: source.official_url, source_document_id: source.id, local_path: localPath,
        });
      }
    } catch {}
    return { pages, total_pages: doc.numPages, next_page: end + 1 };
  } finally { await doc.destroy(); }
}

// ── main pass ─────────────────────────────────────────────────────────────
// Profiles whose last transition CAS-conflicted — skip until quiet, in-memory.
const deferred = new Map();
// Persistent per-URL fail counts — transient errors retry next pass, but
// permanent failures (404/403/410 count 5× at once) stamp archive_state
// 'failed' so the link_only lane converts them to official-source links
// instead of retrying forever and clogging the error feed.
const FAILC_FILE = '.audit-work/dl-fail-counts.json';
let FAILC = {};
try { FAILC = JSON.parse(readFileSync(FAILC_FILE, 'utf8')); } catch {}
let failcDirty = false;
// Partial bodies salvaged on stall — a 20MB download that froze at 19MB
// resumes via HTTP Range on retry instead of restarting from byte 0.
const partialStash = new Map();
// URLs handed to the remote archiver stay eligible REMOTELY but must stop
// re-entering the local queue — otherwise every pass retries them forever.
const REMOTE_FILE = '.audit-work/dl-remote-handoff.json';
let remoteSkip = new Set();
try { remoteSkip = new Set(JSON.parse(readFileSync(REMOTE_FILE, 'utf8'))); } catch {}
let remoteDirty = false;
// Cumulative download totals — the dashboard's event tail rolls old dl_done
// events out of view, which made "files/bytes" visibly SHRINK. Emit a running
// counter seeded from the real office index; the dashboard reads the latest.
const DL_STATS = { files: 0, bytes: 0 };
try {
  const idx = readIndex();
  for (const o of Object.values(idx.offices || {}))
    for (const f of o.files || [])
      if (f.stage === 'fetched' || f.stage === 'uploaded') { DL_STATS.files++; DL_STATS.bytes += f.bytes || 0; }
} catch {}
const statTick = () => emit({ stage: 'dl_stats', detail: `${DL_STATS.files} files · ${(DL_STATS.bytes / 1048576).toFixed(0)} MB`, files: DL_STATS.files, bytes: DL_STATS.bytes });

async function pass() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  ctxMaps.profileById = new Map(profiles.map((p) => [p.id, p]));
  ctxMaps.localityByProfile = new Map();
  for (const l of getMirror('localities')?.rows || [])
    if (l.jurisdiction_profile_id) ctxMaps.localityByProfile.set(l.jurisdiction_profile_id, l);
  let archived = 0, registered = 0, extracted = 0, errors = 0, linkOnly = 0, remoteHandoff = 0;

  // A. Archive eligible profile docs locally (replicates archiveBacklogQuery).
  // Bounded pool: DL_CONCURRENCY profiles in parallel (each profile is its own
  // row → no CAS overlap), DL_PACE_MS between fetch starts per worker so we
  // flood without hammering gov servers or the shared entity budget.
  const DL_CONCURRENCY = Math.max(1, Number(process.env.DL_CONCURRENCY || 10));
  const DL_PACE_MS = Math.max(0, Number(process.env.DL_PACE_MS || 400));
  const dlQueue = profiles.filter((profile) => {
    if (sliceOf(profile.id) !== SLICE || profile._manual_documents || profile.auto_refresh === false) return false;
    const STALE_UPLOAD_MS = 30 * 60 * 1000;
    const eligible = (profile.documents || []).filter((d) => {
      const st = d.archive_state?.status;
      // A worker killed mid-flight leaves status 'uploading' forever — treat
      // uploads silent >30min as stale and re-attempt them instead of losing
      // the file (Madison County class).
      const at = Date.parse(d.archive_state?.at || d.archive_state?.started_at || d.archive_state?.updated_at || d.archive_state?.last_attempt_at || '');
      const leaseDead = Date.parse(d.archive_state?.lease_expires_at || '') < Date.now();
      // Dead claims come in three flavors: 'uploading'/'upload_uncertain' from
      // a worker killed mid-flight, and 'downloading' rows whose claim lease
      // expired (e.g. yesterday's lease_expires_at on today's pass). All of
      // them mean the file needs re-fetching, not parking forever.
      const staleUpload = ['uploading', 'upload_uncertain', 'downloading'].includes(st) &&
        (leaseDead || !at || Date.now() - at > STALE_UPLOAD_MS);
      return /\.(pdf|docx?|xlsx?|csv|txt)(\?|#|$)/i.test(String(d.url || '')) &&
        !d.file_url && !d.source_sha256 && !d.external_referral_provenance &&
        d.source !== 'manual' && !d.pinned && !d.archive_pinned &&
        (!['complete', 'uploading', 'upload_uncertain', 'blocked', 'verification_blocked'].includes(st) || staleUpload) &&
        !(Date.parse(d.archive_state?.retry_after || '') > Date.now());
    });
    profile._eligibleDocs = eligible;
    return eligible.length && (deferred.get(profile.id) || 0) <= Date.now();
  });
  emit({ stage: 'doc_pipe_pass', detail: `${dlQueue.length} profiles with eligible docs — pool ${DL_CONCURRENCY}` });
  let dlActive = 0;
  await Promise.all(Array.from({ length: DL_CONCURRENCY }, (_, wi) => (async () => {
    const c = CTXS[wi];
    for (;;) {
      const profile = dlQueue.shift();
      if (!profile) return;
      const eligible = profile._eligibleDocs;
      dlActive++;
    // Fetch-first/stamp-later: bytes + office index cost ZERO entity calls —
    // the flood. archive_state stamping happens once per profile afterward
    // (1 read + 1 CAS write per profile, not ~3 writes per file).
    c.profile = profile; c.url = null; c.sha = null; c.resolved = null;
    try {
      const fetched = [];
      const failedDocs = [];
      for (const d of eligible.slice(0, 20)) {
        if (remoteSkip.has(d.url)) continue; // handed off — remote archiver claims it
        c.url = d.url; c.sha = null; c.resolved = null;
        let ok = false, lastErr;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const stash = partialStash.get(d.url);
            const resp = await fetchSource(d.url, stash ? { headers: { Range: `bytes=${stash.got}-` } } : {});
            let bytes;
            if (resp?.status === 206 && stash) {
              // Server honored Range — prepend the salvaged head bytes.
              const tail = new Uint8Array(await resp.arrayBuffer());
              bytes = new Uint8Array(stash.got + tail.length);
              let off = 0;
              for (const p of stash.parts) { bytes.set(p, off); off += p.length; }
              bytes.set(tail, off);
              emit({ stage: 'dl_resume', url: d.url, detail: `resumed at ${stash.got}b +${tail.length}b` });
            } else {
              if (!resp?.ok) throw new Error(`HTTP ${resp?.status || '?'}`);
              bytes = new Uint8Array(await resp.arrayBuffer());
            }
            partialStash.delete(d.url);
            if (!bytes.length) throw new Error('empty body');
            const file = new File([bytes], decodeURIComponent(String(d.url).split('/').pop().split('?')[0] || 'doc.pdf'));
            await uploadFile({ file }, c);
            ok = true; break;
          } catch (e) {
            lastErr = e;
            const msg = String(e?.message || e);
            if (!/stalled|timeout|ECONN|ETIMEDOUT|reset|terminated|fetch failed|empty|HTTP 5/i.test(msg) || attempt === 3) { lastErr = e; break; }
            emit({ stage: 'dl_retry', url: d.url, detail: `retry ${attempt}/3 — ${msg.slice(0, 70)}` });
            await sleep(attempt * 4000);
          }
        }
        if (!ok) {
          const msg = String(lastErr?.message || lastErr);
          // Connection-level failure (0 bytes — host unreachable/refused, e.g.
          // wayne-township.org blocks this IP): leave the doc UNSTAMPED so the
          // deployed remote archiver claims it from different infra. Don't
          // burn fail attempts on something that can never work from here.
          const zeroBytes = /timeout|ECONN|ETIMEDOUT|refused|unreachable|fetch failed/i.test(msg);
          if (zeroBytes) {
            // Wayback fallback: unreachable hosts (wayne-township.org blocks
            // this IP range) still have snapshots — fetch the archived copy.
            let wbOk = false;
            try {
              const wb = await fetchSource(`https://web.archive.org/web/2024id_/${d.url}`);
              if (wb?.ok) {
                const wbBytes = new Uint8Array(await wb.arrayBuffer());
                if (wbBytes.length > 500) {
                  const file = new File([wbBytes], decodeURIComponent(String(d.url).split('/').pop().split('?')[0] || 'doc.pdf'));
                  await uploadFile({ file }, c);
                  wbOk = true; ok = true;
                  emit({ stage: 'dl_wayback', url: d.url, detail: `${(d.title || d.url || '').slice(0, 50)} — fetched via wayback (${wbBytes.length}b)` });
                }
              }
            } catch {}
            if (wbOk) { /* fall through to indexFile below */ }
            else {
              remoteHandoff += 1;
              remoteSkip.add(d.url); remoteDirty = true;
              try { writeFileSync(REMOTE_FILE, JSON.stringify([...remoteSkip])); remoteDirty = false; } catch {}
              emit({ stage: 'dl_remote', url: d.url, detail: `${(d.title || d.url || '').slice(0, 50)} — host unreachable → remote archiver` });
              continue;
            }
          } else {
          // Stalls already incremented FAILC inside the stream watchdog —
          // read it back instead of counting twice.
          const sc = msg.match(/sc:(\d+)/);
          const is4xx = /HTTP (404|403|410)/i.test(msg);
          // 4xx terminal errors get one Wayback shot — burst rate-limit 403s
          // and moved 404s still have archived copies. Don't burn the file.
          let wbOk = false;
          if (is4xx) {
            try {
              const wb = await fetchSource(`https://web.archive.org/web/2024id_/${d.url}`);
              if (wb?.ok) {
                const wbBytes = new Uint8Array(await wb.arrayBuffer());
                if (wbBytes.length > 500) {
                  const file = new File([wbBytes], decodeURIComponent(String(d.url).split('/').pop().split('?')[0] || 'doc.pdf'));
                  await uploadFile({ file }, c);
                  wbOk = true; ok = true;
                  emit({ stage: 'dl_wayback', url: d.url, detail: `${(d.title || d.url || '').slice(0, 50)} — fetched via wayback (${wbBytes.length}b)` });
                }
              }
            } catch {}
          }
          if (!wbOk) {
          const n = sc ? Number(sc[1]) : (FAILC[d.url] = (FAILC[d.url] || 0) + (is4xx ? 5 : 1));
          failcDirty = true;
          emit({ stage: 'dl_err', url: d.url, detail: `${(d.title || d.url || '').slice(0, 50)} — ${msg.slice(0, 60)}${n >= 5 ? ' · terminal → link-only' : ''}` });
          if (n >= 5) failedDocs.push({ doc: d, err: msg.slice(0, 200) });
          continue;
          }
          }
        }
        DL_STATS.files++; DL_STATS.bytes += c.bytes || 0; statTick();
        if (c.resolved) {
          indexFile(c.resolved.key, metaFor(profile, c.resolved), {
            sha256: c.sha, name: `${c.sha}.${c.ext}`, bytes: c.bytes,
            official_url: d.url, stage: 'fetched',
            local_path: path.join(officeDir(c.resolved.key), 'sources', `${c.sha}.${c.ext}`),
          });
        }
        fetched.push({ doc: d, sha: c.sha, ext: c.ext, bytes: c.bytes, resolved: c.resolved });
      }
      if (!fetched.length && !failedDocs.length) { deferred.set(profile.id, Date.now() + 12 * 60_000); }
      else {
        // One CAS write stamps every fetched doc on this profile — the docs
        // carry file_url local:// + sha so the uploader lane swaps them to
        // real storage URLs downstream, same as the old path. Terminal
        // failures stamp 'failed' so the link-only lane picks them up.
        const fresh = await profileEntity(profiles).get(profile.id);
        if (fresh?.id) {
          let dirty = false;
          for (const f of fetched) {
            const row = (fresh.documents || []).find((x) => x.id === f.doc.id || x.url === f.doc.url);
            if (!row) continue;
            row.file_url = `local://${path.join(officeDir(f.resolved.key), 'sources', `${f.sha}.${f.ext}`)}`;
            row.source_sha256 = f.sha;
            row.archive_state = { status: 'complete', source_sha256: f.sha, source_bytes: f.bytes, validation_method: 'local-fetch-v1', completed_at: new Date().toISOString() };
            dirty = true;
          }
          for (const fd of failedDocs) {
            const row = (fresh.documents || []).find((x) => x.id === fd.doc.id || x.url === fd.doc.url);
            if (!row) continue;
            row.archive_state = { status: 'failed', attempts: FAILC[fd.doc.url] || 5, error: fd.err, last_attempt_at: new Date().toISOString() };
            dirty = true;
          }
          if (dirty) {
            const w = await profileEntity(profiles).updateMany({ id: fresh.id, updated_date: fresh.updated_date }, { $set: { documents: fresh.documents } });
            if (w?.updated) archived += fetched.length;
          }
        }
        emit({ stage: 'doc_archive_ok', address: `${profile.name}, ${profile.state}`, detail: `${fetched.length} doc(s) fetched → ${fetched[0]?.resolved?.office?.name || 'unassigned'}` });
      }
      deferred.delete(profile.id);
      } catch (e) {
        const msg = String(e?.message || e);
        const mins = /rate limit/i.test(msg) ? 30 : 12;
        deferred.set(profile.id, Date.now() + mins * 60_000);
        errors += 1;
        emit({ stage: 'doc_archive_err', address: `${profile.name}, ${profile.state}`, ok: false, detail: `${msg.slice(0, 90)} — deferred ${mins}m` });
        if (/rate limit/i.test(msg)) await sleep(45_000);
      } finally { dlActive--; }
      await sleep(DL_PACE_MS);
    }
  })()));
  ctx.profile = null;
  if (failcDirty) { try { writeFileSync(FAILC_FILE, JSON.stringify(FAILC)); failcDirty = false; } catch {} }
  if (remoteDirty) { try { writeFileSync(REMOTE_FILE, JSON.stringify([...remoteSkip])); remoteDirty = false; } catch {} }

  // A2. Link-only docs — terminal fetch failures keep their official_url and
  //     surface as such on the office cards (app renders "Open official source
  //     link" already; nothing to upload).
  for (const profile of profiles) {
    if (sliceOf(profile.id) !== SLICE) continue;
    for (const d of profile.documents || []) {
      const st = d.archive_state?.status;
      if (!(st === 'blocked' || st === 'verification_blocked' || (st === 'failed' && (d.archive_state?.attempts || 0) >= 5))) continue;
      const res = keyForDoc(profile, d);
      indexFile(res.key, metaFor(profile, res), {
        key: `link:${d.url}`, official_url: d.url, name: d.title || d.url,
        stage: 'link_only', archive_error: String(d.archive_state?.error || '').slice(0, 300),
      });
      linkOnly += 1;
    }
  }

  // B. Register catalog rows for docs the uploader has swapped to real urls —
  //    catalog rows are born with the real archived_file_url (never local://).
  for (const profile of profiles) {
    if (sliceOf(profile.id) !== SLICE) continue;
    const docs = (profile.documents || []).filter((d) =>
      d.file_url && !String(d.file_url).startsWith('local://') && d.stored_sha256 &&
      d.archive_state?.status === 'complete' && !['complete', 'conflict', 'create_uncertain'].includes(d.catalog_state?.status));
    for (const d of docs.slice(0, 3)) {
      try {
        const r = await registerJurisdictionArchive({ entity: profileEntity(profiles), catalogEntity: catalogEntity(), jurisdictionId: profile.id, documentId: d.id, automatic: true });
        if (r?.created) { registered += 1; emit({ stage: 'doc_catalog_ok', address: `${profile.name}, ${profile.state}`, detail: d.title?.slice(0, 60) }); }
        // Stamp office identity onto the new catalog row — the durable
        // office→file link for the app (office_id, issuing_office).
        if (r?.source_document_id) {
          const res = keyForDoc(profile, d);
          if (res.office) {
            const row = await catalogEntity().get(r.source_document_id);
            if (row?.id && !row.office_id)
              await docWrite('PermittingSourceDocument', 'update', {
                id: row.id, expected_updated_date: row.updated_date,
                data: { office_id: res.office.id, issuing_office: res.office.name },
              }).then((j) => { if (!j?.success) emit({ stage: 'doc_office_stamp_miss', ok: false, detail: `${row.id}: CAS miss — next pass retries` }); });
          }
        }
      } catch (e) { errors += 1; }
      await sleep(400);
    }
  }

  // C. Text extraction for catalog rows that have a real archived_file_url.
  let sources = [];
  {
    const j = await call('staffDataRead', { entity: 'PermittingSourceDocument', query: { text_extraction_pinned: { $ne: true } }, limit: 200 });
    sources = (j?.items || j?.rows || j?.data?.items || j?.data?.rows || []).filter((s) =>
      s.archived_file_url && !String(s.archived_file_url).startsWith('local://') &&
      /^[a-f0-9]{64}$/.test(s.file_hash_sha256 || '') && s.file_bytes > 0 &&
      s.text_extraction_state?.status !== 'complete');
  }
  for (const src of sources.slice(0, 10)) {
    if (sliceOf(src.id) !== SLICE) continue;
    try {
      const r = await extractKnownSourceText({
        entity: catalogEntity(), segmentEntity: segmentEntity(),
        sourceDocumentId: src.id, readAndExtract, automatic: true,
        canAutomaticallyExtract: async () => true,
      });
      extracted += 1;
      emit({ stage: 'doc_text_ok', address: src.jurisdiction_name || src.id, detail: `${src.title?.slice(0, 60) || 'doc'} → ${src.file_bytes}b` });
    } catch (e) { errors += 1; emit({ stage: 'doc_text_err', address: src.jurisdiction_name || src.id, ok: false, detail: String(e?.message || e).slice(0, 130) }); }
    await sleep(800);
  }
  emit({ stage: 'doc_pipe_pass', detail: `archived:${archived} cataloged:${registered} extracted:${extracted} link-only:${linkOnly} errors:${errors} src-backlog:${sources.length}` });
}

emit({ stage: 'doc_pipe_boot', address: 'doc pipeline', ok: true, start: true, detail: `local fetch+archive+extract — slice ${SLICE}/${SLICES}` });
(async () => {
  while (true) {
    try { await pass(); } catch (e) { emit({ stage: 'doc_pipe_err', ok: false, detail: String(e?.message || e).slice(0, 150) }); }
    if (ONCE) break;
    await sleep(5 * 60 * 1000);
  }
})();
