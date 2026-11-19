#!/usr/bin/env node
// Local source monitor — replaces the scheduled app-side sourceMonitorScan.
// Same cheap-first contract: fetch + hash/etag/last-modified diff is free and
// local; only REAL changes get an AI impact assessment — via devin-llm instead
// of InvokeLLM. Monitor state + alerts write through staffPermittingDocWrite.
// Usage: node scripts/permitting-source-monitor.mjs [--once]
import { createHash } from 'node:crypto';
import { openSync, readFileSync, writeFileSync } from 'node:fs';
import { permitCreds } from './lib/permit-creds.mjs';
import { enqueueUnit, outputFor, clearUnit, runBatch, probeAuth } from './lib/devin-llm.mjs';

const ONCE = process.argv.includes('--once');
const PIDFILE = '.audit-work/source-monitor.pid';
try {
  const old = Number(readFileSync(PIDFILE, 'utf8'));
  if (old && old !== process.pid) { try { process.kill(old, 0); process.exit(0); } catch {} }
} catch {}
try { writeFileSync(PIDFILE, String(process.pid)); } catch {}
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'source-monitor', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'CCS-Permitting-Monitor/1.0 (local)' };
const CADENCE = { volatile: 7 * 86400, moderate: 30 * 86400, stable: 90 * 86400, immutable: 365 * 86400 };
const nextDue = (cad, from = Date.now()) => new Date(from + (CADENCE[cad] || CADENCE.moderate) * 1000).toISOString();

const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token = null, callsAt = [];
async function budget() {
  while (true) {
    const now = Date.now();
    callsAt = callsAt.filter((t) => now - t < 60_000);
    if (callsAt.length < 12) { callsAt.push(now); return; }
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
const readRows = async (entity, query, limit = 50) => (await call('staffDataRead', { entity, query, limit }))?.items || [];

// ── cheap check (ported from sourceMonitorScanner.ts) ─────────────────────
async function cheapFetch(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const bodyText = await r.text();
  return {
    status: r.status, etag: r.headers.get('etag') || '', lastModified: r.headers.get('last-modified') || '',
    contentLength: Number(r.headers.get('content-length') || bodyText.length), bodyText,
    hash: createHash('sha256').update(bodyText).digest('hex'), contentType: r.headers.get('content-type') || '',
  };
}
const detectChange = (prev, next) => {
  if (prev.last_known_etag && next.etag) return { changed: prev.last_known_etag !== next.etag, method: 'etag' };
  if (prev.last_known_last_modified && next.lastModified) return { changed: prev.last_known_last_modified !== next.lastModified, method: 'last_modified' };
  if (prev.last_known_content_length && next.contentLength && prev.last_known_content_length !== next.contentLength) return { changed: true, method: 'content_length' };
  return { changed: prev.last_known_hash !== next.hash, method: 'hash' };
};
const extractLinks = (html) => new Set([...String(html || '').matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]));

const AI_SCHEMA = { type: 'object', properties: { may_affect_regulatory_data: { type: 'boolean' }, reasoning: { type: 'string' } } };
const aiPrompt = (m, diffSummary, linkDiff) => `You are a permitting regulatory analyst. A monitored source document has changed. Determine whether the change MAY affect regulatory requirements (sign rules, permit procedures, fees, dimensional standards, illumination rules, submittal requirements).\n\nJurisdiction: ${m.jurisdiction_name}\nSource: ${m.source_title || 'Source document'}\n\nChange summary:\n${diffSummary.slice(0, 1500)}\n\nChanged links:\n  Added: ${linkDiff.added.length} links\n  Removed: ${linkDiff.removed.length} links\n\nRespond with JSON: { "may_affect_regulatory_data": boolean, "reasoning": "one sentence" }`;

// ── monitor pass ──────────────────────────────────────────────────────────
async function pass() {
  const nowIso = new Date().toISOString();
  const monitors = (await readRows('SourceMonitorState', { monitor_enabled: true }, 200))
    .filter((m) => !m.next_check_due || m.next_check_due <= nowIso).slice(0, 40);
  let checked = 0, changed = 0, failed = 0, aiQueued = 0;
  for (const m of monitors) {
    checked += 1;
    try {
      const fetched = await cheapFetch(m.official_url);
      const { changed: chg, method } = detectChange(m, fetched);
      if (!chg) {
        await call('staffPermittingDocWrite', { entity: 'SourceMonitorState', op: 'update', id: m.id, data: {
          last_successful_check: nowIso, last_http_status: String(fetched.status), failure_count: 0, last_error: '',
          next_check_due: nextDue(m.schedule_cadence || 'moderate'), last_known_etag: fetched.etag || m.last_known_etag,
          last_known_last_modified: fetched.lastModified || m.last_known_last_modified, last_known_content_length: fetched.contentLength || m.last_known_content_length } });
        continue;
      }
      changed += 1;
      const linkDiff = { added: [...extractLinks(fetched.bodyText)], removed: [] };
      const diffSummary = `Content hash changed (method: ${method}). Old length: ${m.last_known_content_length || 'unknown'}, new length: ${fetched.contentLength}. ${linkDiff.added.length} links found.`;
      // AI assessment goes through the devin queue — monitor waits for its output.
      const uid = `mon-${m.id}-${Date.now()}`;
      enqueueUnit({ id: uid, kind: 'monitor', prompt: aiPrompt(m, diffSummary, linkDiff), schema: AI_SCHEMA });
      aiQueued += 1;
      // Drive a batch right away if sessions are free — monitors are few.
      await runBatch();
      const out = outputFor(uid);
      let ai = { mayAffect: true, summary: 'assessment pending — conservatively flagged' };
      if (out?.output) { ai = { mayAffect: Boolean(out.output.may_affect_regulatory_data), summary: String(out.output.reasoning || '') }; clearUnit(uid); }
      // Persist change: source hash + monitor state.
      if (m.source_document_id) await call('staffPermittingDocWrite', { entity: 'PermittingSourceDocument', op: 'update', id: m.source_document_id, data: { file_hash_sha256: fetched.hash, file_bytes: fetched.contentLength, last_checked: nowIso, last_changed: nowIso } });
      await call('staffPermittingDocWrite', { entity: 'SourceMonitorState', op: 'update', id: m.id, data: {
        last_successful_check: nowIso, last_changed: nowIso, last_known_hash: fetched.hash,
        last_known_etag: fetched.etag || '', last_known_last_modified: fetched.lastModified || '',
        last_known_content_length: fetched.contentLength, last_http_status: String(fetched.status),
        failure_count: 0, last_error: '', may_affect_regulatory_data: ai.mayAffect, staff_review_required: ai.mayAffect,
        last_change_summary: { method, old_hash: m.last_known_hash || null, new_hash: fetched.hash, old_content_length: m.last_known_content_length || null, new_content_length: fetched.contentLength, links_added: linkDiff.added.length, ai_summary: ai.summary, assessed_at: nowIso },
        next_check_due: nextDue(m.schedule_cadence || 'moderate') } });
      if (ai.mayAffect) {
        await call('permittingRuleInvalidate', { source_document_id: m.source_document_id, new_hash: fetched.hash }).catch(() => null);
        await call('staffPermittingDocWrite', { entity: 'RegulationAlert', op: 'create', data: {
          jurisdiction_id: m.jurisdiction_id, jurisdiction_name: m.jurisdiction_name, source_document_id: m.source_document_id,
          source_title: m.source_title, alert_type: 'document_update', title: `Source changed: ${m.source_title || m.official_url}`,
          description: diffSummary, new_value: ai.summary, severity: 'high', field_changed: 'source_hash' } });
      }
      emit({ stage: 'srcmon_changed', address: m.jurisdiction_name, detail: `${m.source_title || m.official_url} — ${method}, may_affect:${ai.mayAffect}` });
    } catch (e) {
      failed += 1;
      await call('staffPermittingDocWrite', { entity: 'SourceMonitorState', op: 'update', id: m.id, data: { failure_count: (m.failure_count || 0) + 1, last_error: String(e?.message || e).slice(0, 400), next_check_due: nextDue(m.schedule_cadence || 'moderate') } }).catch(() => null);
    }
    await sleep(1500);
  }
  emit({ stage: 'srcmon_pass', detail: `checked:${checked} changed:${changed} failed:${failed} ai:${aiQueued}` });
}

emit({ stage: 'srcmon_boot', address: 'source monitor', ok: true, start: true, detail: 'local cheap-first monitor — devin assessment on change' });
(async () => {
  while (true) {
    try { await pass(); } catch (e) { emit({ stage: 'srcmon_err', ok: false, detail: String(e?.message || e).slice(0, 150) }); }
    if (ONCE) break;
    await sleep(15 * 60 * 1000);
  }
})();
