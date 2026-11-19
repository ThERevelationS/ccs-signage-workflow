#!/usr/bin/env node
// Address-queue feeder: keeps the forever-runner's validation pool stocked.
// Every CHECK_MS it recomputes the live queue (fixture addrs with no event yet
// or a retryable latest stage — the same math buildPool() uses). Below
// LOW_WATER it runs Google Places searches via fixtureBusinessSearch across
// sweep-discovered OH/KY jurisdictions and appends fresh, deduped addresses to
// .fixture-business-all.json — the runner picks them up next cycle. Between
// LOW_WATER and TARGET it trickle-searches one city per pass so the list keeps
// growing while the feeder is otherwise idle.
// Usage: node scripts/permitting-address-feeder.mjs [--once] [--low 100] [--target 250]
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, openSync, readSync } from 'node:fs';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const flag = (n, d) => args.includes(n) ? args[args.indexOf(n) + 1] : d;
const FIXTURE = '.fixture-business-all.json';
const EVENTS = args.includes('--events') ? flag('--events') : '.live-events.jsonl';
const SEEN_FILE = '.address-feeder-seen.json';      // city|template combos already queried
const CITYPOOL_FILE = '.address-feeder-citypool.json'; // cached jurisdiction list
const LOW = Number(flag('--low', 100));              // refill trigger
const TARGET = Number(flag('--target', 250));        // refill to this depth
const CHECK_MS = Number(flag('--check-ms', 45000));
const ONCE = args.includes('--once');
const WORKER = 'addr-feed';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(e) {
  const line = JSON.stringify({ t: new Date().toISOString(), worker: WORKER, ...e });
  try { appendFileSync(EVENTS, line + '\n'); } catch {}
  console.log(line);
}

// Same retry set the forever-runner uses — these stages stay in the queue.
const RETRY = new Set(['needs_review', 'invoke', 'unresolved', 'city_conflict', 'geocode', 'boundary', 'draft_error', 'office_error', 'research_queue_error', 'seed_office_error', 'stuck', 'no_profile', 'located_no_locality']);
// Event timestamps are mixed epoch-ms numbers (validator) and ISO strings
// (sweep/research) — comparing raw values is NaN across types, which kept a
// first-seen stale stage pinned as "latest" forever and made the queue look
// full (~1,230 phantom retries) while it was actually drained to 1.
const tms = (e) => { const t = typeof e.t === 'number' ? e.t : Date.parse(e.t); return Number.isNaN(t) ? 0 : t; };

// MP-7.7 — incremental cursor: the events file is ~25MB; re-parsing it every
// pass is the feeder's main cost. Persist {offset, latest-stage map} and only
// parse bytes appended since the last pass.
const CURSOR = '.audit-work/feeder-cursor.json';
function readLatest() {
  let cur = { offset: 0, latest: {} };
  try { cur = JSON.parse(readFileSync(CURSOR, 'utf8')); } catch {}
  try {
    const size = statSync(EVENTS).size;
    if (size < cur.offset) cur = { offset: 0, latest: {} }; // file rotated
    const fd = openSync(EVENTS, 'r');
    const buf = Buffer.alloc(Math.max(0, size - cur.offset));
    readSync(fd, buf, 0, buf.length, cur.offset);
    for (const l of buf.toString('utf8').split('\n')) {
      if (!l.trim()) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      if (e.start || e.step || !e.address) continue;
      if (cur.latest[e.address] === undefined || tms(e) > tms(cur.latest[e.address])) cur.latest[e.address] = e;
    }
    cur.offset = size;
    writeFileSync(CURSOR, JSON.stringify(cur));
  } catch {}
  return cur.latest;
}
function queueStats() {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) || [];
  const latest = readLatest();
  let queued = 0, done = 0, parked = 0;
  for (const a of fixture) {
    const s = latest[a]?.stage;
    // located_no_locality = resolved address parked waiting on its office
    // record — that's the office pipeline's backlog, not address-validation
    // supply. Counting it as "queued" starved new-address discovery forever.
    if (s === 'located_no_locality') { parked++; continue; }
    (!s || RETRY.has(s)) ? queued++ : done++;
  }
  return { fixture, seen: new Set(fixture.map((a) => a.toLowerCase())), queued, done, parked };
}

let token = '';
async function login() {
  for (let i = 0; i < 8; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return true; }
    await sleep(4000 + i * 3000);
  }
  return false;
}
async function call(fn, body) {
  for (let i = 0; i < 6; i++) {
    await paceCall(fn);
    const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) }).catch(() => null);
    if (r?.status === 401) { await login(); continue; }
    if (r && (r.status === 429 || r.status >= 500)) { await sleep(5000 + i * 5000); continue; }
    return r ? r.json().catch(() => ({})) : {};
  }
  return null; // exhausted — callers treat null as failure, never as empty data
}
async function readAll(entity, query) {
  const out = [];
  for (let skip = 0; ; skip += 5000) {
    const j = await call('staffDataRead', { entity, query, limit: 5000, skip });
    if (!j) return null;
    const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j?.data?.items) ? j.data.items : []);
    out.push(...items);
    if (items.length < 5000) return out;
  }
}
import { mirrorRead } from './lib/entity-mirror.mjs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';

// City pool: every OH/KY jurisdiction the sweep has profiled so far —
// municipalities first (densest business coverage), counties/townships after.
// Cached 30 min since the sweep keeps minting profiles.
async function cityPool() {
  try {
    const c = JSON.parse(readFileSync(CITYPOOL_FILE, 'utf8'));
    if (Date.now() - (c.ts || 0) < 30 * 60 * 1000 && c.cities?.length) return c.cities;
  } catch {}
  const [oh, ky] = await Promise.all([
    mirrorRead('profiles-oh', 45 * 60 * 1000, () => readAll('JurisdictionProfile', { state: 'OH' })),
    mirrorRead('profiles-ky', 45 * 60 * 1000, () => readAll('JurisdictionProfile', { state: 'KY' })),
  ]);
  if (!oh || !ky) return null; // gateway stalled — don't cache a hollow pool
  const rank = { city: 0, village: 1, municipality: 1, township: 2, county: 3 };
  const cities = [...oh, ...ky]
    .filter((p) => p.name && !['historical', 'duplicate'].includes(String(p.verification_status || '').toLowerCase()))
    .map((p) => ({ name: p.name, st: p.state, r: rank[String(p.type || '').toLowerCase()] ?? 4 }))
    .sort((a, b) => a.r - b.r || a.name.localeCompare(b.name));
  try { writeFileSync(CITYPOOL_FILE, JSON.stringify({ ts: Date.now(), cities })); } catch {}
  return cities;
}

const TEMPLATES = ['businesses in', 'stores in', 'shops in', 'restaurants in', 'companies in', 'services in'];
const seenCombos = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : []);
const saveSeen = () => { try { writeFileSync(SEEN_FILE, JSON.stringify([...seenCombos])); } catch {} };

// One Places search (up to 3 pages = 60 candidates). Returns OH/KY street
// addresses not already in the fixture.
async function searchCity(city, template, have) {
  const out = [];
  let pagetoken = '';
  for (let page = 0; page < 3; page++) {
    const body = pagetoken ? { pagetoken } : { query: `${template} ${city.name}, ${city.st === 'OH' ? 'Ohio' : 'Kentucky'}` };
    if (pagetoken) await sleep(2500); // Google needs a beat before a pageToken goes live
    const j = await call('fixtureBusinessSearch', body);
    if (!j || j.status !== 'OK') break;
    for (const p of j.results || []) {
      const addr = String(p.address || '').replace(/, USA$/, '').trim();
      if (!/^[^,]+, [^,]+, (OH|KY)( \d{5})?$/.test(addr)) continue; // must look like the fixture format
      if (!/^\d+\s/.test(addr)) continue;                          // needs a house number to be a real lookup
      const k = addr.toLowerCase();
      if (!have.has(k)) { have.add(k); out.push(addr); }
    }
    pagetoken = j.next_page_token || '';
    if (!pagetoken) break;
    await sleep(1200);
  }
  return out;
}

let pass = 0, idleSince = 0;
emit({ stage: 'addr_feed_start', address: 'address feeder', ok: true, start: true, detail: `queue feeder live — keeps ≥${LOW} addresses queued, tops to ${TARGET}` });
while (true) {
  pass++;
  const { fixture, seen: have, queued, parked } = queueStats();
  if (!token && !(await login())) { emit({ stage: 'addr_feed_error', address: 'address feeder', ok: false, detail: 'login failed — retrying next pass' }); await sleep(CHECK_MS); continue; }

  if (queued >= LOW && queued < TARGET) {
    // Idle-ish: trickle one city per pass so the list keeps growing.
  } else if (queued >= TARGET) {
    idleSince = idleSince || Date.now();
    if (Date.now() - idleSince > 15 * 60 * 1000) { emit({ stage: 'addr_feed_idle', address: 'address feeder', ok: true, detail: `queue healthy at ${queued}${parked ? ` (+${parked} parked on office records)` : ''} — standing by` }); idleSince = Date.now(); }
    if (ONCE) break;
    await sleep(CHECK_MS); continue;
  }
  idleSince = 0;

  const cities = await cityPool();
  if (!cities?.length) { emit({ stage: 'addr_feed_error', address: 'address feeder', ok: false, detail: 'jurisdiction list unavailable — retrying next pass' }); await sleep(CHECK_MS); continue; }
  const want = TARGET - queued;
  let added = 0, searched = 0;
  emit({ stage: 'addr_feed_refill', address: 'address feeder', ok: true, start: true, detail: `queue at ${queued} (<${LOW} or topping up) — searching jurisdictions for new addresses` });
  for (const city of cities) {
    if (added >= want) break;
    if (searched >= 10) break; // bound Places calls per pass
    const template = TEMPLATES.find((t) => !seenCombos.has(`${city.name}|${city.st}|${t}`));
    if (!template) continue;
    seenCombos.add(`${city.name}|${city.st}|${template}`);
    searched++;
    emit({ stage: 'addr_feed_search', address: `${city.name}, ${city.st}`, ok: true, start: true, step: true, detail: `places search: "${template} ${city.name}"` });
    const fresh = await searchCity(city, template, have);
    emit({ stage: 'addr_feed_batch', address: `${city.name}, ${city.st}`, ok: true, detail: `${fresh.length} new addresses` });
    if (fresh.length) {
      fixture.push(...fresh);
      added += fresh.length;
      try { writeFileSync(FIXTURE, JSON.stringify(fixture)); } catch {}
    }
    await sleep(1500);
  }
  saveSeen();
  emit({ stage: 'addr_feed_done', address: 'address feeder', ok: true, detail: `refill pass ${pass}: +${added} addresses from ${searched} jurisdictions (queue was ${queued})` });
  if (ONCE) break;
  await sleep(CHECK_MS);
}
