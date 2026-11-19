// permitting-signage-facts-worker.mjs — SignageIntel P1-P3 worker.
// Pass A (deterministic harvest): scans every office dossier's extracted
// text/<sha>.txt, finds sign-relevant snippets, writes per-jurisdiction
// candidate bundles → Pass B enqueues devin-llm extraction units →
// Pass C (later) verifies + CAS-writes SignageFact rows.
//
// Usage: node scripts/permitting-signage-facts-worker.mjs --slice i --slices n
// Emits sf_scan / sf_candidates / sf_llm_queued events on .live-events.jsonl.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, statSync, openSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { harvestPage, factIdentity, SIGN_TYPES, FACT_KEYS } from './lib/signage-facts.mjs';
import { enqueueUnit, outputFor, clearUnit, queueDepth, probeAuth } from './lib/devin-llm.mjs';
import { permitCreds } from './lib/permit-creds.mjs';

// ── remote calls — same staffPermittingDocWrite contract as doc-pipeline ──
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = null, callsAt = [];
async function budget() {
  while (true) {
    const now = Date.now();
    callsAt = callsAt.filter((t) => now - t < 60_000);
    if (callsAt.length < 10) { callsAt.push(now); return; }
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
  return r ? await r.json().catch(() => null) : null;
}
const docWrite = (entity, op, body) => call('staffPermittingDocWrite', { entity, op, ...body });

const DIR = '.audit-work';
const CAND_DIR = `${DIR}/signage-facts/candidates`;
const FACTS_DIR = `${DIR}/signage-facts/extracted`;
const DONE_FILE = `${DIR}/signage-facts/harvested.json`;
for (const d of [CAND_DIR, FACTS_DIR]) mkdirSync(d, { recursive: true });

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SLICE = Number(flag('slice', 0)), SLICES = Number(flag('slices', 1));
const MAX_JX = Number(flag('max', 0)); // 0 = all
const WORKER = `sfacts-${SLICE}`;

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };

const PAGE_RE = /^--- page (\d+) ---$/;

// harvested.json — {sha: when} so re-runs skip files already harvested.
let harvested = {};
try { harvested = JSON.parse(readFileSync(DONE_FILE, 'utf8')); } catch {}

function* textFiles(officeDir) {
  const td = path.join(officeDir, 'text');
  if (!existsSync(td)) return;
  for (const f of readdirSync(td)) if (f.endsWith('.txt')) yield path.join(td, f);
}

function parseTextFile(p) {
  const pages = [];
  let cur = null;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(PAGE_RE);
    if (m) { cur = { page: Number(m[1]), text: '' }; pages.push(cur); }
    else if (cur) cur.text += line + '\n';
  }
  return pages;
}

// ── Pass C: collect finished devin-llm outputs → SignageFact + index ─────
const TERM_STOP = new Set('the a an and or of to in for on at by with is are was were be been'.split(' '));
const indexTerms = (fact) => {
  const terms = new Map();
  const add = (t, w) => { const k = String(t || '').toLowerCase().replace(/[^a-z0-9_]+/g, ''); if (k && k.length > 2 && !TERM_STOP.has(k)) terms.set(k, Math.max(terms.get(k) || 0, w)); };
  add(fact.fact_key, 10); add(fact.sign_type, 9);
  for (const w of String(fact.evidence_quote || '').split(/\s+/).slice(0, 60)) add(w, 2);
  return [...terms.entries()];
};

async function collect(idx) {
  let wrote = 0, flagged = 0;
  for (const office of Object.values(idx.offices || {})) {
    const unitId = `sfact_${office.jurisdiction_id || office.key.replaceAll('/', '_')}`;
    const out = outputFor(unitId);
    if (!out) continue;
    let facts = Array.isArray(out) ? out : out.facts || out.data || [];
    if (!Array.isArray(facts)) facts = [];
    for (const f of facts) {
      if (!f?.fact_key || !f?.evidence_quote) { flagged++; continue; }
      const row = {
        jurisdiction_name: office.jurisdiction_name, jurisdiction_id: office.jurisdiction_id, state: office.state,
        sign_type: SIGN_TYPES.includes(f.sign_type) ? f.sign_type : 'general',
        fact_key: FACT_KEYS.includes(f.fact_key) ? f.fact_key : String(f.fact_key).slice(0, 60),
        value_json: (typeof f.value_json === 'object' && f.value_json) ? f.value_json : { value: f.value_json ?? null },
        fact_identity: factIdentity({ jurisdiction_id: office.jurisdiction_id, sign_type: f.sign_type, fact_key: f.fact_key, source_sha256: f.source_sha256 }),
        evidence_quote: String(f.evidence_quote).slice(0, 600),
        source_document_id: f.source_document_id || null, source_sha256: f.source_sha256 || null,
        page_ref: f.page || null, official_url: f.official_url || null,
        confidence: 'agent', active: true,
      };
      const j = await docWrite('SignageFact', 'create', { data: row }).catch(() => null);
      const factId = j?.row?.id || j?.record?.id;
      if (factId) {
        wrote++;
        for (const [term, weight] of indexTerms(row)) {
          await docWrite('SignageFactIndex', 'create', { data: { jurisdiction_id: office.jurisdiction_id, jurisdiction_name: office.jurisdiction_name, term, fact_id: factId, weight } }).catch(() => null);
        }
      }
    }
    if (wrote || flagged) { writeFileSync(path.join(FACTS_DIR, `${office.key.replaceAll('/', '__')}.json`), JSON.stringify(facts, null, 1)); clearUnit(unitId); }
  }
  emit({ stage: 'sf_collect', ok: true, detail: `facts written:${wrote} malformed:${flagged}` });
  return wrote;
}

async function run() {
  emit({ stage: 'sf_scan', start: true, detail: `signage facts harvest — slice ${SLICE}/${SLICES}` });
  const idx = JSON.parse(readFileSync(`${DIR}/office-files/index.json`, 'utf8'));
  const collected = await collect(idx);
  if (collected) emit({ stage: 'sf_collect', detail: `${collected} facts indexed this pass` });
  const offices = Object.values(idx.offices || {}).filter(o =>
    (Buffer.from(crypto.createHash('sha1').update(o.key).digest()).readUInt32BE(0) % SLICES) === SLICE);

  let scanned = 0, withCandidates = 0, filesScanned = 0, snippets = 0, llmQueued = 0, skippedDone = 0;
  for (const office of offices) {
    const officeDir = path.join(DIR, 'office-files', office.key);
    if (!existsSync(officeDir)) continue;
    const bundle = { jurisdiction_id: office.jurisdiction_id, jurisdiction_name: office.jurisdiction_name, state: office.state, office_id: office.office_id, office_name: office.office_name, snippets: [] };
    for (const tf of textFiles(officeDir)) {
      const sha = path.basename(tf, '.txt');
      const mtime = statSync(tf).mtimeMs;
      if (harvested[`${office.key}|${sha}`] === mtime) { skippedDone++; continue; }
      filesScanned++;
      const meta = (office.files || []).find(f => f.sha256 === sha) || {};
      for (const pg of parseTextFile(tf)) {
        for (const snip of harvestPage({
          page: pg.page, text: pg.text, source_sha256: sha,
          source_document_id: meta.source_document_id || null,
          source_title: meta.name || sha, official_url: meta.official_url || null,
        })) { bundle.snippets.push(snip); snippets++; }
      }
      harvested[`${office.key}|${sha}`] = mtime;
    }
    scanned++;
    if (!bundle.snippets.length) continue;
    withCandidates++;
    // Keep the strongest snippets — cap per-office bundle at 60 for LLM batch size.
    bundle.snippets.sort((a, b) => b.weight - a.weight);
    bundle.snippets = bundle.snippets.slice(0, 60);
    const candFile = path.join(CAND_DIR, `${office.key.replaceAll('/', '__')}.json`);
    writeFileSync(candFile, JSON.stringify(bundle, null, 1));

    // Pass B: enqueue one devin-llm unit per jurisdiction bundle (extraction brief).
    const unitId = `sfact_${office.jurisdiction_id || office.key.replaceAll('/', '_')}`;
    if (!outputFor(unitId)) {
      enqueueUnit({
        id: unitId,
        kind: 'signage_facts',
        meta: { jurisdiction: office.jurisdiction_name, state: office.state, office: office.office_name, snippets: bundle.snippets.length },
        prompt: `You extract SIGNAGE REGULATIONS from official jurisdiction documents. Jurisdiction: ${office.jurisdiction_name}, ${office.state}. Office: ${office.office_name}.\n\nFor each snippet below, extract every signage fact stated: sign_type, fact_key (from taxonomy), value {value,unit,condition}, and the exact evidence quote. Omit facts not stated. Never invent. Return JSON array only: [{sign_type,fact_key,value_json,evidence_quote,page,source_sha256,source_document_id,official_url}]\n\nSNIPPETS:\n${bundle.snippets.map((s, i) => `#${i + 1} [p${s.page} ${s.source_document_id || s.source_sha256}] ${s.snippet}`).join('\n\n')}`,
        schema: [{ sign_type: 'string', fact_key: 'string', value_json: 'object', evidence_quote: 'string', page: 'number' }],
      });
      llmQueued++;
    }
    if (MAX_JX && withCandidates >= MAX_JX) break;
    if (scanned % 50 === 0) writeFileSync(DONE_FILE, JSON.stringify(harvested));
  }
  writeFileSync(DONE_FILE, JSON.stringify(harvested));
  emit({ stage: 'sf_scan', ok: true, detail: `offices:${scanned} w/signage:${withCandidates} files:${filesScanned} snippets:${snippets} llm-queued:${llmQueued} skipped:${skippedDone} queue:${queueDepth()}` });
}

const PASS_GAP = Number(process.env.SF_PASS_GAP_MS || 5 * 60_000);
for (;;) {
  try { await run(); } catch (e) { emit({ stage: 'sf_scan', ok: false, detail: String(e?.message || e).slice(0, 150) }); }
  await new Promise((r) => setTimeout(r, PASS_GAP));
}
