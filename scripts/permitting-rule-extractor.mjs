#!/usr/bin/env node
// Rule extraction via LOCAL Devin headless sessions — replaces the app-side
// InvokeLLM inside permittingRuleExtraction for the OH/KY bulk build.
//
// Same evidence contract: builds extractionPrompt from the REAL shared module,
// runs output through the same validateRuleCandidates (verbatim page-citation
// checks — a bad model can't sneak hallucinated quotes through), and writes
// PermittingRuleExtractionRun rows with method 'literal-page-v1' so the admin
// review/import path (importEvidenceCandidate) treats them identically.
//
// Flow: source docs with extracted text → page-window units → devin-llm
// file-queue → batch sessions → validate → write runs via staffPermittingDocWrite.
// Usage: node scripts/permitting-rule-extractor.mjs [--once] [--slice i --slices n]
import { openSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadRuleEvidence, extractionPrompt, EXTRACTION_RESPONSE_SCHEMA, validateRuleCandidates, RULE_EVIDENCE_METHOD, evidenceDigest } from '../base44/shared/permittingRuleEvidence.mjs';
import { PDF_TEXT_PAGE_BATCH } from '../base44/shared/jurisdictionSourcePdfText.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { getMirror } from './lib/entity-mirror.mjs';
import { enqueueUnit, outputFor, clearUnit, queueDepth, runBatch, probeAuth } from './lib/devin-llm.mjs';
import { indexFile, officeKey, ensureOfficeDirs, resolveOffice, readIndex } from './lib/office-files.mjs';

const SLICE = Number(process.argv.includes('--slice') ? process.argv[process.argv.indexOf('--slice') + 1] : 0);
const SLICES = Number(process.argv.includes('--slices') ? process.argv[process.argv.indexOf('--slices') + 1] : 1);
const ONCE = process.argv.includes('--once');
const CLAIMS = `.audit-work/rule-extract-claims-${SLICE}.json`;
let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS, JSON.stringify(claims)); } catch {} };

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'rule-extractor', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sliceOf = (id) => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SLICES; };

const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null;
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
  if (/rate limit/i.test(JSON.stringify(j || {}))) await sleep(65_000);
  return j;
}

// Entity adapters — the same read/write surface loadRuleEvidence needs.
const srcEntity = {
  get: async (id) => { const j = await call('staffDataRead', { entity: 'PermittingSourceDocument', query: { id }, limit: 1 }); return (j?.items || j?.rows || [])[0] || null; },
  filter: async (q, s, limit = 20) => { const j = await call('staffDataRead', { entity: 'PermittingSourceDocument', query: q, limit }); return j?.items || j?.rows || []; },
  updateMany: async (query, update) => {
    const j = await call('staffPermittingDocWrite', { entity: 'PermittingSourceDocument', op: 'update', id: query.id, data: update?.$set || update, expected_updated_date: query.updated_date });
    return { updated: j?.success ? 1 : 0 };
  },
};
const segEntity = {
  get: async (id) => { const j = await call('staffDataRead', { entity: 'PermittingSourceTextSegment', query: { id }, limit: 1 }); return (j?.items || j?.rows || [])[0] || null; },
  filter: async (q, s, limit = 20) => { const j = await call('staffDataRead', { entity: 'PermittingSourceTextSegment', query: q, limit }); return j?.items || j?.rows || []; },
};

// Unit id: deterministic → idempotent across restarts
const unitId = (srcId, start, count) => `rx-${srcId}-p${start}-${count}`;

// ── office-files wiring (LP-6): extraction units/outputs/evidence live in
//    the owning office's extraction/ dir; the index tracks per-file stages ──
const maps = { profileById: new Map(), localityByProfile: new Map(), officeById: new Map() };
function refreshMaps() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  maps.profileById = new Map(profiles.map((p) => [p.id, p]));
  maps.localityByProfile = new Map();
  maps.officeById = new Map();
  for (const l of getMirror('localities')?.rows || []) {
    if (l.jurisdiction_profile_id) maps.localityByProfile.set(l.jurisdiction_profile_id, l);
    for (const o of l.offices || []) maps.officeById.set(o.id, o);
  }
}
function officeCtxFor(src) {
  const profile = maps.profileById.get(src.jurisdiction_id);
  const locality = maps.localityByProfile.get(src.jurisdiction_id);
  const office = (src.office_id && maps.officeById.get(src.office_id))
    || resolveOffice(locality, { issuing_office: src.issuing_office, url: src.official_url });
  return {
    key: officeKey({ state: profile?.state, jurisdictionName: profile?.name, jurisdictionId: src.jurisdiction_id, officeName: office?.name, officeId: office?.id }),
    meta: {
      jurisdiction_id: src.jurisdiction_id, jurisdiction_name: profile?.name || src.jurisdiction_name, state: profile?.state || null,
      locality_id: locality?.id || null, office_id: office?.id || null,
      office_name: office?.name || 'unassigned', roles: office?.authority_roles || [],
    },
    office, locality, profile,
  };
}
function officeDirs(r) {
  return ensureOfficeDirs(r.key, {
    jurisdiction: r.profile ? { id: r.profile.id, name: r.profile.name, state: r.profile.state, county_name: r.profile.parent_county, locality_id: r.locality?.id } : null,
    office: r.office ? { ...r.office, locality_id: r.locality?.id } : { name: 'unassigned', locality_id: r.locality?.id },
  });
}
const idxStage = (r, src, stage, extra = {}) => indexFile(r.key, r.meta, {
  sha256: src.file_hash_sha256, source_document_id: src.id, official_url: src.official_url, stage, ...extra,
});

async function enqueueSourceUnits(src, maxUnits = 6) {
  const total = src.text_extraction_state?.total_pages || src.text_extraction_state?.pages_extracted || 0;
  if (!total) return 0;
  let n = 0;
  for (let start = 1; start <= total && n < maxUnits; start += PDF_TEXT_PAGE_BATCH) {
    const count = Math.min(PDF_TEXT_PAGE_BATCH, total - start + 1);
    const id = unitId(src.id, start, count);
    if (claims[id]?.done) continue;
    try {
      const unit = await loadRuleEvidence({ sourceEntity: srcEntity, segmentEntity: segEntity, sourceDocumentId: src.id, startPage: start, pageCount: count });
      const enq = { id, prompt: extractionPrompt(unit) + '\nReturn ONLY a JSON object matching this schema (no markdown): ' + JSON.stringify(EXTRACTION_RESPONSE_SCHEMA), schema: EXTRACTION_RESPONSE_SCHEMA, kind: 'rule-extract', meta: { src: src.id, start, count, snapshot: unit.snapshot, snapshot_sha256: unit.snapshot_sha256 } };
      enqueueUnit(enq);
      try {
        const r = officeCtxFor(src);
        const dir = officeDirs(r);
        writeFileSync(path.join(dir, 'extraction', `unit-${id}.json`), JSON.stringify(enq.meta, null, 1));
        const prev = readIndex().offices?.[r.key]?.files?.find((f) => f.sha256 === src.file_hash_sha256);
        idxStage(r, src, 'queued', { unit_ids: [...new Set([...(prev?.unit_ids || []), id])] });
      } catch {}
      n += 1;
    } catch (e) { emit({ stage: 'rx_unit_err', address: src.jurisdiction_name, ok: false, detail: `${id}: ${String(e?.message || e).slice(0, 100)}` }); }
  }
  return n;
}

async function collectOutputs() {
  let wrote = 0;
  const outDir = '.audit-work/extract-out';
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(outDir).filter((x) => x.endsWith('.json'))) {
    const id = f.replace(/\.json$/, '');
    // Only claim rule-extraction units — other lanes (signage-facts, source
    // monitor) share the devin-llm queue and own their own outputs.
    if (id.startsWith('sfact_')) continue;
    if (claims[id]?.done) { clearUnit(id); continue; }
    const out = outputFor(id);
    if (!out) continue;
    const qf = `.audit-work/extract-queue/${id}.json`;
    const unit = existsSync(qf) ? JSON.parse(readFileSync(qf, 'utf8')) : null;
    const meta = unit?.meta;
    if (!meta || out.malformed || !out.output) {
      claims[id] = { done: true, result: out?.malformed ? 'malformed' : 'no_output', at: new Date().toISOString() };
      emit({ stage: 'rx_out_bad', ok: false, detail: `${id}: ${out?.malformed ? 'malformed json' : 'no output'}` });
      clearUnit(id); continue;
    }
    try {
      const evidenceUnit = await loadRuleEvidence({ sourceEntity: srcEntity, segmentEntity: segEntity, sourceDocumentId: meta.src, startPage: meta.start, pageCount: meta.count });
      const src = evidenceUnit.source;
      const r = officeCtxFor(src);
      try { writeFileSync(path.join(officeDirs(r), 'extraction', `out-${id}.json`), JSON.stringify(out.output, null, 1)); } catch {}
      const validated = await validateRuleCandidates(evidenceUnit, out.output, { extractionDate: new Date().toISOString() });
      try {
        idxStage(r, src, 'analyzed');
        writeFileSync(path.join(officeDirs(r), 'extraction', `evidence-${id}.json`), JSON.stringify({ unit: id, source_document_id: meta.src, candidates: validated.candidates, rejected: validated.rejected, validated_at: new Date().toISOString() }, null, 1));
        idxStage(r, src, 'validated', { candidates: validated.candidates?.length || 0 });
      } catch {}
      const run = {
        request_key: `local-rule-evidence:${id}`, request_id: id, claim_token: randomUUID(),
        source_document_id: meta.src, jurisdiction_id: src.jurisdiction_id,
        start_page: meta.start, page_count: meta.count, method: RULE_EVIDENCE_METHOD,
        snapshot: evidenceUnit.snapshot, snapshot_sha256: evidenceUnit.snapshot_sha256,
        status: 'complete', candidates: validated.candidates, rejected: validated.rejected,
        candidates_sha256: await evidenceDigest(validated.candidates || []),
        llm_attempts: 1, requested_by: 'devin-local-extractor',
        completed_at: new Date().toISOString(), lease_expires_at: '',
      };
      const w = await call('staffPermittingDocWrite', { entity: 'PermittingRuleExtractionRun', op: 'create', data: run });
      if (!w?.success) {
        // Transient write failures (budget/login hiccups) must not lose the
        // validated run — keep the output and retry next pass, capped at 5.
        const attempts = (claims[id]?.attempts || 0) + 1;
        claims[id] = { done: attempts >= 5, result: 'write_failed', attempts, candidates: validated.candidates?.length || 0, error: JSON.stringify(w).slice(0, 150), at: new Date().toISOString() };
        if (attempts >= 5) clearUnit(id);
        emit({ stage: 'rx_run_err', address: src.jurisdiction_name, ok: false, detail: `${id}: ${validated.candidates?.length || 0} candidates — write failed (${attempts}/5): ${JSON.stringify(w).slice(0, 80)}` });
        saveClaims(); continue;
      }
      claims[id] = { done: true, result: 'written', run_id: w.record?.id || w.row?.id || null, jurisdiction_id: src.jurisdiction_id, candidates: validated.candidates?.length || 0, at: new Date().toISOString() };
      try { idxStage(r, src, 'rules', { run_request_key: run.request_key }); } catch {}
      emit({ stage: 'rx_run_ok', address: src.jurisdiction_name, ok: true, detail: `${id}: ${validated.candidates?.length || 0} candidates, ${validated.rejected?.length || 0} rejected` });
      clearUnit(id); wrote += 1;
    } catch (e) {
      claims[id] = { done: true, result: 'error', error: String(e?.message || e).slice(0, 150), at: new Date().toISOString() };
      emit({ stage: 'rx_run_err', ok: false, detail: `${id}: ${String(e?.message || e).slice(0, 120)}` });
      clearUnit(id);
    }
    saveClaims();
  }
  return wrote;
}

emit({ stage: 'rx_boot', address: 'rule extractor', ok: true, start: true, detail: `local devin extraction — slice ${SLICE}/${SLICES}` });
(async () => {
  const auth = await probeAuth();
  if (auth !== 'ok') { emit({ stage: 'rx_auth_needed', ok: false, detail: 'devin.exe needs one manual browser login — extraction lane closed until then' }); if (ONCE) return; await sleep(10 * 60 * 1000); }
  while (true) {
    refreshMaps();
    // 1. Enqueue units from sources that have extracted text
    const j = await call('staffDataRead', { entity: 'PermittingSourceDocument', query: { 'text_extraction_state.status': 'complete' }, limit: 100 });
    const sources = (j?.items || j?.rows || []).filter((s) => s.id && s.jurisdiction_id);
    let enqueued = 0;
    for (const src of sources) {
      if (sliceOf(src.id) !== SLICE) continue;
      enqueued += await enqueueSourceUnits(src);
      if (queueDepth() >= 50) break; // keep ≤2 sessions of work buffered
    }
    // 2. Drive devin sessions until queue drains or cap
    let batches = 0;
    while (queueDepth() > 0 && batches < 6) {
      const r = await runBatch();
      if (r.lane === 'auth') { emit({ stage: 'rx_auth_needed', ok: false, detail: 'devin session lost auth' }); break; }
      if (r.lane === 'busy') { await sleep(8000); continue; }
      batches += 1;
      await collectOutputs();
    }
    await collectOutputs();
    emit({ stage: 'rx_pass', detail: `enqueued:${enqueued} depth:${queueDepth()} batches:${batches} done-claims:${Object.values(claims).filter((c) => c.done).length}` });
    if (ONCE) break;
    await sleep(3 * 60 * 1000);
  }
})().catch((e) => { emit({ stage: 'rx_fatal', ok: false, detail: String(e?.message || e).slice(0, 150) }); process.exit(1); });
