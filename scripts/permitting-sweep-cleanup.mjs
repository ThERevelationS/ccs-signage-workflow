#!/usr/bin/env node
// Sweep cleanup — repairs rows the first sweep run wrote with all-caps state
// layer names and OGRIP paper/remnant townships:
//   1. REAL township with caps name ("CONNEAUT Township") → rename to proper
//      case on JurisdictionProfile + PermitLocality + SourceCollectionQueue.
//   2. PAPER/remnant township (not in TIGER FUNCSTAT='A') → profile marked
//      'historical', locality renamed with a "(paper township)" tombstone,
//      queue row blocked so research never wastes a cycle on it.
//   3. KY city rows with caps name/county → proper case everywhere.
// Idempotent: already-proper rows are skipped. Usage:
//   node scripts/permitting-sweep-cleanup.mjs [--dry-run]
import { openSync, writeFileSync } from 'node:fs';
import { normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { normalizeAddressState } from '../src/shared/permittingAddressState.js';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const DRY = process.argv.includes('--dry-run');
const EVENTS = '.live-events.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proper = (s) => String(s || '').toLowerCase().replace(/(^|\s|[-'])([a-z])/g, (m, p, ch) => p + ch.toUpperCase());
const isCaps = (s) => /[A-Z]{3}/.test(String(s || '')) && String(s).toUpperCase() === String(s) && /[A-Z]/.test(String(s));

let token = '';
async function freshToken() {
  for (let i = 0; i < 5; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return; }
    await sleep(3000 + i * 3000);
  }
  throw new Error('login failed');
}
async function call(fn, body, retried = false, serverRetry = 0) {
  if (DRY && fn !== 'staffDataRead') return { dry: true };
  await paceCall(fn);
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) });
  if ((r.status === 401 || r.status === 403) && !retried) { await freshToken(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(4000); return call(fn, body, retried, serverRetry); }
  if ((r.status >= 500 || j?.error === 'user-exception') && serverRetry < 6) { await sleep(3000 * (serverRetry + 1)); return call(fn, body, retried, serverRetry + 1); }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'cleanup', ...e }) + '\n', { flag: 'a' }); } catch {} };

async function readAllRows(entity, query = {}) {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 5000) {
    const j = await call('staffDataRead', { entity, query, limit: 5000, skip });
    const items = j.items || [];
    out.push(...items);
    if (items.length < 5000) break;
  }
  return out;
}

// Real civil townships per county — TIGER FUNCSTAT='A' (the authoritative set).
const twpRes = await fetch('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/1/query?where=STATE%3D%2739%27%20AND%20FUNCSTAT%3D%27A%27&outFields=BASENAME,COUNTY&returnGeometry=false&resultRecordCount=2000&f=json').then((r) => r.json());
const countyRes = await fetch('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATE%3D%2739%27&outFields=BASENAME,GEOID&returnGeometry=false&resultRecordCount=200&f=json').then((r) => r.json());
const countyName = {};
for (const f of countyRes.features || []) countyName[String(f.attributes.GEOID).slice(2)] = f.attributes.BASENAME;
const realTwp = new Set((twpRes.features || []).map((f) => `${String(f.attributes.BASENAME).toLowerCase()}|${String(countyName[String(f.attributes.COUNTY)] || '').toLowerCase()}`));
const twpCountyOf = (n) => realTwp.has(`${n.toLowerCase()}|${n.toLowerCase()}`) ? null : [...realTwp].filter((k) => k.startsWith(n.toLowerCase() + '|')).map((k) => k.split('|')[1]);

await freshToken();
const [profiles, localities, queue] = await Promise.all([
  readAllRows('JurisdictionProfile'),
  readAllRows('PermitLocality'),
  readAllRows('SourceCollectionQueue'),
]);
console.log(`loaded ${profiles.length} profiles, ${localities.length} localities, ${queue.length} queue rows`);

let renamed = 0, tombstoned = 0, blocked = 0;
const report = (stage, name, detail) => { console.log(' ', stage, '|', name, '|', detail); emit({ stage, address: name, ok: true, detail }); };

// Match on the normalized township basename so "CONNEAUT Township" and
// "Conneaut Township" are the same entity. TIGER basename has no "township".
const twpBase = (n) => String(n || '').replace(/\s+township$/i, '').trim();
const isPaperPattern = (n) => /^(city of |village of )/i.test(n) || /\b(village|annex)\s+township$/i.test(n);

// ── 1. JurisdictionProfile: OH townships created by the sweep ──
for (const p of profiles) {
  const name = String(p.name || '');
  if (!/township/i.test(name) || normalizeAddressState(p.state) === 'KY') continue;
  const sweepMade = /statewide office sweep/i.test(String(p.notes || '')) || isCaps(twpBase(name));
  if (!sweepMade) continue;
  const base = twpBase(name);
  const counties = twpCountyOf(base);
  const parentCo = String(p.parent_county?.name || '').toLowerCase();
  const realHere = parentCo ? realTwp.has(`${base.toLowerCase()}|${parentCo}`) : counties.length > 0;
  if (isPaperPattern(name) || !realHere) {
    if (p.verification_status === 'historical') continue;
    await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { verification_status: 'historical', notes: `${p.notes || ''} [cleanup: paper/remnant township — no functioning government per TIGER FUNCSTAT]`.trim() } });
    tombstoned++; report('cleanup_tombstoned', name, 'paper/remnant township → historical');
  } else if (isCaps(base)) {
    await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { name: `${proper(base)} Township` } });
    renamed++; report('cleanup_renamed', name, `→ ${proper(base)} Township`);
  }
  await sleep(300);
}

// ── 2. PermitLocality: caps townships + caps KY cities ──
// County for a township locality comes from its linked JurisdictionProfile —
// same-name-different-county must not make a paper township look real.
const profById = new Map(profiles.map((p) => [p.id, p]));
for (const l of localities) {
  const name = String(l.name || '');
  const state = normalizeAddressState(l.state);
  if (/township$/i.test(name) && state !== 'KY' && isCaps(twpBase(name))) {
    const base = twpBase(name);
    const linked = l.jurisdiction_profile_id ? profById.get(l.jurisdiction_profile_id) : null;
    const parentCo = String(linked?.parent_county?.name || '').toLowerCase();
    const realHere = parentCo ? realTwp.has(`${base.toLowerCase()}|${parentCo}`) : twpCountyOf(base).length > 0;
    const real = isPaperPattern(name) ? false : realHere;
    if (!real) {
      const dead = `${proper(base)} Township (paper — no permitting authority)`;
      await call('staffEntityWrite', { entity: 'PermitLocality', op: 'update', id: l.id, data: { name: dead, contact_notes: 'Paper/remnant township — no functioning government; retained for audit trail only.' } });
      tombstoned++; report('cleanup_tombstoned', name, `→ "${dead}"`);
    } else {
      await call('staffEntityWrite', { entity: 'PermitLocality', op: 'update', id: l.id, data: { name: `${proper(base)} Township` } });
      renamed++; report('cleanup_renamed', name, `→ ${proper(base)} Township`);
    }
    await sleep(300);
  } else if (state === 'KY' && isCaps(name)) {
    await call('staffEntityWrite', { entity: 'PermitLocality', op: 'update', id: l.id, data: { name: proper(name) } });
    renamed++; report('cleanup_renamed', name, `→ ${proper(name)}`);
    await sleep(300);
  }
}

// ── 3. SourceCollectionQueue: caps jurisdiction_name / parent_county_name ──
for (const q of queue) {
  const jn = String(q.jurisdiction_name || '');
  const pc = String(q.parent_county_name || '');
  const state = normalizeAddressState(q.state);
  const isTwp = /township/i.test(jn) && state !== 'KY';
  const qBase = twpBase(jn).toLowerCase();
  const realHere = pc ? realTwp.has(`${qBase}|${pc.toLowerCase()}`) : twpCountyOf(twpBase(jn)).length > 0;
  const paper = isTwp && (isPaperPattern(jn) || !realHere);
  const needsName = isCaps(twpBase(jn)) || isCaps(jn);
  const needsCounty = isCaps(pc);
  if (!paper && !needsName && !needsCounty) continue;
  if (!q.updated_date) { console.log('  ! no updated_date for queue row', q.id, jn); continue; }
  const patch = {};
  if (paper) { patch.status = 'blocked'; patch.missing_next = 'Paper/remnant township — no functioning government; removed from research by cleanup.'; }
  if (!paper && needsName) patch.jurisdiction_name = /township$/i.test(jn) ? `${proper(twpBase(jn))} Township` : proper(jn);
  if (needsCounty) patch.parent_county_name = proper(pc);
  await call('staffEntityWrite', { entity: 'SourceCollectionQueue', op: 'updateMany', id: q.id, query: { id: q.id, updated_date: q.updated_date }, update: { $set: patch } });
  if (paper) { blocked++; report('cleanup_blocked', jn, 'paper township queue row → blocked'); }
  else { renamed++; report('cleanup_renamed', jn, `→ ${patch.jurisdiction_name || jn}${needsCounty ? ' (county cased)' : ''}`); }
  await sleep(300);
}

emit({ stage: 'cleanup_done', address: '', ok: true, detail: `renamed ${renamed}, tombstoned ${tombstoned}, queue-blocked ${blocked}` });
console.log(`done${DRY ? ' (DRY)' : ''}: renamed ${renamed}, tombstoned ${tombstoned}, queue-blocked ${blocked}`);
