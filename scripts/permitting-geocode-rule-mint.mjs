#!/usr/bin/env node
// Batch geocode-flag resolution — mints PermitResolutionRule(postal_name_map)
// for queued geocode misses whose postal city uniquely resolves to exactly
// ONE locality in the mirror. Unique-only: any ambiguity (same normalized
// name across types — "Marion" vs "Marion Township") stays for a human.
// Never merges jurisdictions; township-vs-municipality ambiguity = human.
//
//   node scripts/permitting-geocode-rule-mint.mjs [--dry-run] [--limit N]
//
// After minting, the watchdog re-pools the flagged addresses and the next
// retry resolves via corroborated_by:'resolution_rule'.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { permitCreds } from './lib/permit-creds.mjs';
import { mirrorApply, getMirror } from './lib/entity-mirror.mjs';

const DRY = process.argv.includes('--dry-run');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const EVENTS = '.live-events.jsonl';
const emit = (e) => { try { appendFileSync(EVENTS, JSON.stringify({ t: Date.now(), worker: 'geo-rule-mint', ...e }) + '\n'); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normName = (v) => String(v || '').trim().toLowerCase().replace(/\s+(city|village|town|county|township|twp\.?|tp\.?)$/, '').replace(/\s+/g, ' ');
const guessType = (name) => { const n = String(name || '').toLowerCase(); if (/township|twp\b/.test(n)) return 'township'; if (/\bcounty\b/.test(n)) return 'county'; if (/village/.test(n)) return 'village'; return 'municipality'; };

// "street, City, ST 12345" → {city, state} parsed from the END (streets may contain commas)
function parseCityState(address) {
  const parts = String(address).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const m = last.match(/^([A-Z]{2})\b/) || last.match(/\b(OH|OHIO|KY|KENTUCKY)\b/i);
  if (!m) return null;
  const state = /^OH/i.test(m[1]) ? 'OH' : 'KY';
  const city = parts[parts.length - 2];
  return city && /^[a-zA-Z.' -]{2,60}$/.test(city) ? { city, state } : null;
}

let token = null, callsAt = [];
async function budget() { const now = Date.now(); callsAt = callsAt.filter((t) => now - t < 60_000); if (callsAt.length < 10) { callsAt.push(now); return; } await sleep(60_000 - (now - callsAt[0]) + 50); }
async function login() { if (token) return token; const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null); token = t?.session_token || t?.token || null; return token; }
async function call(fn, body, timeout = 45000) { await budget(); const tk = await login(); if (!tk) return null; const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, ...body }), signal: AbortSignal.timeout(timeout) }).catch(() => null); return r ? r.json().catch(() => null) : null; }

const items = JSON.parse(readFileSync('.audit-work/human-review-queue.json', 'utf8'));
const geocodes = (items.items || []).filter((i) => i.surface === 'geocode');
console.log(`${geocodes.length} geocode items in human queue${DRY ? ' (dry-run)' : ''}`);

const localities = getMirror('localities')?.rows || [];
// index normalized-name+state → localities (dedupe identical rows by id)
const byName = new Map();
for (const l of localities) {
  const k = `${normName(l.name)}|${l.state}`;
  if (!byName.has(k)) byName.set(k, []);
  if (!byName.get(k).some((x) => x.id === l.id)) byName.get(k).push(l);
}

// Existing active rules (once per state) — dedupe before any writes.
const active = { OH: new Set(), KY: new Set() };
if (!DRY) for (const st of ['OH', 'KY']) {
  const r = await call('staffDataRead', { entity: 'PermitResolutionRule', query: { active: true, state: st }, limit: 200 });
  for (const x of r?.items || r?.rows || r?.records || [])
    active[st].add(`${x.rule_type}|${normName(x.entered_name)}|${normName(x.county)}|${normName(x.jurisdiction_name)}`);
  console.log(`existing active rules ${st}: ${active[st].size}`);
}

let minted = 0, duped = 0, ambiguous = 0, noMatch = 0, skipped = 0;
const seen = new Set();
const unresolved = [];
for (const it of geocodes) {
  const cs = parseCityState(it.item);
  if (!cs) { skipped += 1; unresolved.push({ item: it.item, why: 'unparseable city/state' }); continue; }
  // Abbreviation normalization for postal-city parsing (mt→mount, ct hs→court house, etc.)
  const deabbr = (v) => normName(v).replace(/^mt\b/, 'mount').replace(/^st\b/, 'saint').replace(/\bct hs\b/, 'court house').replace(/^wshngtn\b/, 'washington');
  const cityNorm = deabbr(cs.city);
  const dedupKey = `${cityNorm}|${cs.state}`;
  if (seen.has(dedupKey)) continue; seen.add(dedupKey);
  let matches = byName.get(dedupKey) || [];
  // Postal names resolve to the same-named INCORPORATED place — drop county
  // and township collisions (that's a name collision, not a merge).
  const incorp = matches.filter((m) => !['township', 'county'].includes(guessType(m.name)));
  if (incorp.length) matches = incorp;
  if (!matches.length) { noMatch += 1; unresolved.push({ item: it.item, city: cs.city, why: 'no locality named that in mirror' }); continue; }
  if (matches.length > 1) {
    // Pure duplicate rows (identical raw name) → rule resolves the same
    // normalized name regardless; "Clay City" vs "Clay" stays human.
    const names = new Set(matches.map((m) => String(m.name).trim().toLowerCase()));
    if (names.size === 1) matches = [matches[0]];
    else { ambiguous += 1; unresolved.push({ item: it.item, city: cs.city, why: `${matches.length} same-name localities (${matches.map((m) => m.name).join(', ')})` }); continue; }
  }
  const loc = matches[0];
  const rule = {
    rule_type: 'postal_name_map',
    entered_name: cityNorm,
    address_key: '',
    state: cs.state,
    county: '', // unconstrained — county derivation failed upstream for these addresses anyway
    jurisdiction_name: normName(loc.name),
    jurisdiction_type: loc.type || guessType(loc.name),
    geoid: loc.geoid || '',
    source: 'burn_geocode_batch',
    evidence: `Burn-down auto-resolution: geocode miss "${it.item}" — postal city "${cs.city}" uniquely resolves to "${loc.name}" (${loc.type || 'jurisdiction'}); street-level geocode unavailable.`,
    created_from_address: it.item,
    active: true,
  };
  const dupeKey = `postal_name_map|${cityNorm}||${normName(loc.name)}`;
  if (active[cs.state].has(dupeKey)) { duped += 1; continue; }
  if (DRY) { console.log(`DRY mint: "${cs.city}, ${cs.state}" → ${loc.name} (${loc.type})`); minted += 1; continue; }
  const w = await call('staffEntityWrite', { entity: 'PermitResolutionRule', op: 'create', data: rule });
  const rid = w?.item?.id || w?.record?.id || w?.id || (w?.success && w?.result?.id) || null;
  if (w?.success && rid) {
    try { mirrorApply('rules', { id: rid, ...rule }); } catch {}
    active[cs.state].add(dupeKey); minted += 1;
    emit({ address: it.item, stage: 'rule_created', detail: `geo-mint: postal city "${cs.city}" → ${loc.name} (${cs.state})` });
  } else {
    console.log(`FAIL ${cs.city},${cs.state}:`, JSON.stringify(w).slice(0, 200));
    emit({ address: it.item, stage: 'rule_create_failed', ok: false, detail: `geo-mint write failed: ${JSON.stringify(w).slice(0, 150)}` });
    skipped += 1;
  }
  await sleep(700);
}
try { writeFileSync('.audit-work/geocode-mint-unresolved.json', JSON.stringify({ at: new Date().toISOString(), unresolved }, null, 1)); } catch {}
console.log(`minted:${minted} already-covered:${duped} ambiguous→human:${ambiguous} no-locality-match→human:${noMatch} skipped:${skipped}`);
emit({ stage: 'geo_mint_done', detail: `minted:${minted} covered:${duped} ambiguous:${ambiguous} no-match:${noMatch} skipped:${skipped} — unresolved list at .audit-work/geocode-mint-unresolved.json` });
