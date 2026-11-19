// permitting-locality-seeder.mjs — standing fix for `located_no_locality`.
// The resolver lands here when an address resolves to a real jurisdiction
// that has NO PermitLocality row (office record). The seed scan only
// backfills existing rows — nothing created them. This watcher:
//   reads located_no_locality marks → parses "Name, ST (type)"
//   → creates the PermitLocality (linked to its JurisdictionProfile)
//   → drops a seed trigger so the office-seed scan fills offices on wake
// Every resolved jurisdiction self-seeds once — the same address class can
// never miss again.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, openSync, readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { permitCreds } from './lib/permit-creds.mjs';

const FN = 'https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const TRIG_DIR = '.audit-work/triggers/seed';
const SEEN_FILE = '.audit-work/loc-seeder-seen.json';
mkdirSync(TRIG_DIR, { recursive: true });

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'loc-seeder', ...e }) + '\n', { flag: 'a' }); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seen = {};
try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')); } catch {}

let token = null;
async function login() {
  if (token) return token;
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  token = t?.session_token || t?.token || null;
  return token;
}
async function call(fn, body) {
  const tk = await login(); if (!tk) return null;
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: tk, ...body }), signal: AbortSignal.timeout(30000) }).catch(() => null);
  return r ? await r.json().catch(() => null) : null;
}

const JX_RE = /^(.+?),\s*(OH|KY)\s*\((\w+)\)/;
function existing(name, state, locs) {
  const n = name.toLowerCase();
  return locs.some(l => String(l.name || '').toLowerCase() === n && String(l.state || '').toUpperCase() === state);
}

async function pass() {
  const events = readFileSync('.live-events.jsonl', 'utf8').trim().split('\n').slice(-60000);
  const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows || [];
  const profiles = [
    ...(JSON.parse(readFileSync('.audit-work/mirrors/profiles-oh.json', 'utf8')).rows || []),
    ...(JSON.parse(readFileSync('.audit-work/mirrors/profiles-ky.json', 'utf8')).rows || []),
  ];
  const wanted = new Map();
  for (const l of events) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.stage !== 'located_no_locality') continue;
    const m = String(e.detail || '').match(JX_RE);
    if (!m) continue;
    const key = `${m[1].toLowerCase()}|${m[2]}`;
    if (!wanted.has(key)) wanted.set(key, { name: m[1], state: m[2], type: m[3] });
  }
  let created = 0, queued = 0, skipped = 0;
  for (const [key, jx] of wanted) {
    if (seen[key]) { skipped++; continue; }
    if (existing(jx.name, jx.state, locs)) { seen[key] = 1; skipped++; continue; } // already seeded — mark resolved
    // find the profile row for the join
    const prof = profiles.find(p => String(p.name || '').toLowerCase() === jx.name.toLowerCase() && String(p.state || '').toUpperCase() === jx.state);
    // Minimal create — the schema has required/typed fields that reject
    // wrong-shaped extras (observed_outcomes wants object|null not [], etc).
    const row = {
      name: jx.name, state: jx.state,
      ...(prof?.id ? { jurisdiction_profile_id: prof.id } : {}),
      contact_notes: `Auto-seeded by loc-seeder — ${jx.type} resolved by address scan ${new Date().toISOString()}`,
    };
    const j = await call('staffEntityWrite', { entity: 'PermitLocality', op: 'create', data: row });
    if (j?.success || j?.id || j?.record?.id) {
      created++;
      seen[key] = 1;
      // trigger the seed scan to fill offices next wake
      writeFileSync(path.join(TRIG_DIR, `${crypto.randomUUID()}.json`), JSON.stringify({ name: jx.name, state: jx.state, at: Date.now() }));
      queued++;
      emit({ stage: 'seed_locality_created', address: `${jx.name}, ${jx.state}`, ok: true, detail: `PermitLocality created (${jx.type}) — seed scan will fill offices` });
    } else if (j?.error && /duplicate|unique/i.test(j.error)) { seen[key] = 1; skipped++; }
    else emit({ stage: 'seed_locality_err', address: `${jx.name}, ${jx.state}`, ok: false, detail: JSON.stringify(j).slice(0, 120) });
    await sleep(400);
  }
  writeFileSync(SEEN_FILE, JSON.stringify(seen));
  emit({ stage: 'seed_locality_pass', ok: true, detail: `${wanted.size} jurisdictions wanted · created:${created} queued:${queued} already:${skipped}` });
}

for (;;) {
  try { await pass(); } catch (e) { emit({ stage: 'seed_locality_err', ok: false, detail: String(e?.message || e).slice(0, 140) }); }
  await sleep(5 * 60_000);
}
