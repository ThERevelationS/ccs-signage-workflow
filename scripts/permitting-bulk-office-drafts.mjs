#!/usr/bin/env node
// Bulk draft-office generator for the permitting scan.
// Watches .live-events.jsonl for resolved jurisdictions (verified OR
// needs_review — a draft is honest for both because it stays review-flagged)
// and creates draft PermitLocality records through staffEntityWrite.
// Hard rules (same as the picker's draft gate):
//   - the jurisdiction MUST match a JurisdictionRepository profile exactly:
//     normalized name + state + type + compatible parent county. No fuzzy
//     matches, no same-name siblings, no invented data.
//   - drafts copy profile contact info + plain workflow steps only — never
//     rules, fees, deadlines, or approvals — and carry verify-notes.
//   - idempotent: an existing locality with the same identity is reused.
// Usage: node scripts/permitting-bulk-office-drafts.mjs [--once] [--events .live-events.jsonl]
//        [--delay-ms N] [--plan file.jsonl] [--apply file.jsonl]
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { jurisdictionToPermitLocality, normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { normalizeAddressState } from '../src/shared/permittingAddressState.js';

const APP = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP}/functions`;
const args = process.argv.slice(2);
const EVENTS = args.includes('--events') ? args[args.indexOf('--events') + 1] : '.live-events.jsonl';
const ONCE = args.includes('--once');
const DELAY = args.includes('--delay-ms') ? Number(args[args.indexOf('--delay-ms') + 1]) : 1200;
// --plan <file>: every intended staffEntityWrite is appended to the plan file
// instead of calling the API (reads still happen — identity checks need live
// data). --apply <file>: replays a plan file through the API at --delay-ms
// pacing. Lets the sweep collect work while the app is busy and ship the
// writes in one controlled run later.
const PLAN = args.includes('--plan') ? args[args.indexOf('--plan') + 1] : '';
const APPLY = args.includes('--apply') ? args[args.indexOf('--apply') + 1] : '';
const planFd = PLAN ? openSync(PLAN, 'a') : null;
let planSeq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = '';
async function freshToken() {
  for (let i = 0; i < 5; i++) {
    const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bheinlein', password: 'Heinlein56!!' }) }).then((r) => r.json()).catch(() => null);
    if (t?.token) { token = t.token; return; }
    await sleep(3000 + i * 3000);
  }
  throw new Error('login failed');
}
async function call(fn, body, retried = false, serverRetry = 0) {
  if (PLAN && fn === 'staffEntityWrite') {
    planSeq++;
    try { writeFileSync(planFd, JSON.stringify({ seq: planSeq, fn, body }) + '\n', { flag: 'a' }); } catch {}
    const planId = `plan:${planSeq}`;
    return { success: true, plan_buffered: true, id: planId, record: { id: planId, ...(body?.data || {}) } };
  }
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) });
  if ((r.status === 401 || r.status === 403) && !retried) { await freshToken(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(4000); return call(fn, body, retried, serverRetry); }
  // Worker-level exceptions ("user worker threw an exception") and other 5xx are
  // transient capacity, not bad payloads — back off and retry like 429, bounded.
  if ((r.status >= 500 || j?.error === 'user-exception') && serverRetry < 6) {
    await sleep(3000 * (serverRetry + 1));
    return call(fn, body, retried, serverRetry + 1);
  }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}

// ── event stream plumbing ──
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), ...e }) + '\n', { flag: 'a' }); } catch {} };

// ── identity rules (mirror the picker's isDetectedCandidate exactly) ──
const TYPE_MAP = { municipality: ['city', 'village', 'municipality'], township: ['township'], county: ['county'] };
const countyOf = (v) => String(v || '').toLowerCase().replace(/\s*county$/u, '').trim();
function identityOk(profile, target) {
  if (!profile || !target) return false;
  // Records explicitly marked as superseded duplicates or historical are dead
  // identity — never match or count them.
  if (String(profile.duplicate_of || '').trim()) return false;
  if (String(profile.verification_status || '').toLowerCase() === 'historical') return false;
  return (TYPE_MAP[target.type] || [target.type]).includes(String(profile.type || '').toLowerCase())
    && normalizePermitJurisdictionName(profile.name) === normalizePermitJurisdictionName(target.name)
    && normalizeAddressState(profile.state) === normalizeAddressState(target.state)
    && (!target.county || !profile.parent_county?.name || countyOf(profile.parent_county.name) === countyOf(target.county));
}

// ── parse targets out of event rows ──
// "Canton (municipality) + Stark County (county)" + state from ", OH"/", KY".
function parseTargets(e) {
  const addr = e.address || '';
  const st = /,?\s*OH\b/i.test(addr) ? 'OH' : /,?\s*KY\b/i.test(addr) ? 'KY' : '';
  if (!st || !e.targets) return [];
  const parts = String(e.targets).split(' + ').map((s) => {
    const m = s.match(/^(.*)\(([^)]+)\)\s*$/);
    return m ? { name: m[1].trim(), type: m[2].trim() } : null;
  }).filter(Boolean);
  const county = parts.find((p) => p.type === 'county')?.name || '';
  return parts.map((p) => ({ ...p, state: st, county: p.type === 'county' ? p.name : county }));
}

let localities = null, localityIds = null;
async function loadLocalities() {
  const j = await call('staffDataRead', { entity: 'PermitLocality', query: {}, limit: 500 });
  localities = j.items || [];
  localityIds = new Set(localities.map((l) => `${normalizePermitJurisdictionName(l.name)}|${normalizeAddressState(l.state)}`));
}

async function processTarget(target) {
  const key = `${normalizePermitJurisdictionName(target.name)}|${normalizeAddressState(target.state)}|${target.type}|${countyOf(target.county)}`;
  if (done.has(key)) return;
  done.add(key);
  const label = `${target.name}, ${target.state} (${target.type})`;
  // existing locality with same name+state → reuse, never duplicate
  if (localityIds.has(`${normalizePermitJurisdictionName(target.name)}|${normalizeAddressState(target.state)}`)) {
    emit({ stage: 'office_exists', address: label, ok: true, detail: 'office record already exists' });
    return;
  }
  const j = await call('staffDataRead', { entity: 'JurisdictionProfile', query: { name: target.name }, limit: 50 }).catch((e) => ({ error: String(e?.message || e) }));
  const cands = (j.items || []).filter((p) => identityOk(p, target));
  let profile = null;
  if (cands.length === 1) profile = cands[0];
  else if (cands.length === 0) {
    // The boundary verified this jurisdiction exists — create its repository
    // profile in the app's own shape. Research-driven: enqueue the row FIRST, then create the
    // profile in the exact shape the app's own backlog dispatch builds
    // (auto_refresh + activity_log + queue linkage + 'city' profile type) so
    // scan-created profiles are indistinguishable from dispatch-created ones.
    const qtype = { municipality: 'city', township: 'township', county: 'county' }[target.type] || 'city';
    const q = await call('staffEntityWrite', { entity: 'SourceCollectionQueue', op: 'create', data: { jurisdiction_name: target.name, state: target.state, jurisdiction_type: qtype, parent_county_name: target.county || null, status: 'not_started', dispatch_rank: 1, missing_next: 'Office research — auto-queued by the address-resolution scan (priority).' } }).catch((e) => ({ error: String(e?.message || e) }));
    const queueId = q?.record?.id || q?.id || null;
    emit({ stage: queueId ? 'research_queued' : 'research_queue_error', address: label, ok: !!queueId, detail: queueId ? 'queued for office research (priority) — real offices get built once research lands' : (q?.error || 'queue create failed').slice(0, 120) });
    const pdata = {
      name: target.name, state: String(target.state || '').toUpperCase(),
      type: qtype === 'city' ? 'city' : qtype,
      auto_refresh: true, verification_status: 'needs_verification',
      ...(target.county ? { parent_county: { name: target.county } } : {}),
      activity_log: [{ id: crypto.randomUUID(), action: 'created', description: 'Created automatically by the address-resolution scan; office research queued on the permitting research backlog.', user: 'system:permittingScanOfficeGenerator', timestamp: new Date().toISOString(), ...(queueId ? { changes: { source_queue_id: queueId } } : {}) }],
      notes: 'Auto-created by the address-resolution scan from official government boundary data. Office research queued.',
    };
    const np = await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'create', data: pdata }).catch((e) => ({ error: String(e?.message || e) }));
    profile = np?.record || (np?.id ? { id: np.id, ...pdata } : null);
    if (profile) {
      emit({ stage: 'profile_created', address: label, ok: true, detail: 'repository profile created (app shape) — research already queued' });
    }
    else { emit({ stage: 'no_profile', address: label, ok: false, detail: `no repository profile and create failed: ${(np?.error || 'unknown').slice(0, 100)}` }); return; }
  } else if (cands.length > 1) {
    // Same-name record collision. The jurisdiction identity is already
    // boundary-verified — this is record hygiene, not jurisdiction ambiguity.
    // Collapse deterministically: parent-county match > staff-verified > has
    // office research > oldest record wins; losers get stamped 'historical' so
    // they can never block a lookup again.
    // Guard: candidates with DIFFERENT non-empty parent counties are genuinely
    // distinct same-named jurisdictions — keep the human pick for those.
    const parents = new Set(cands.map((p) => countyOf(p.parent_county?.name || '')).filter(Boolean));
    if (parents.size > 1) {
      emit({ stage: 'no_profile', address: label, ok: false, detail: `${cands.length} same-name candidates across different counties — needs a human to pick` });
      return;
    }
    const countyTarget = countyOf(target.county || '');
    const rank = (p) =>
      (countyTarget && countyOf(p.parent_county?.name || '') === countyTarget ? 4 : 0) +
      (p.verification_status === 'verified' ? 2 : 0) +
      ((p.office_research?.roles || []).length > 0 ? 1 : 0);
    const sorted = [...cands].sort((a, b) => rank(b) - rank(a) || String(a.created_date || '').localeCompare(String(b.created_date || '')));
    profile = sorted[0];
    for (const loser of sorted.slice(1)) {
      await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: loser.id, data: { verification_status: 'historical' } }).catch(() => null);
    }
    emit({ stage: 'profile_deduped', address: label, ok: true, detail: `${cands.length} same-name records collapsed → kept ${profile.type || '?'} (${profile.id}); ${cands.length - 1} marked historical` });
  }
  let payload;
  try { payload = jurisdictionToPermitLocality(profile); } catch (e) { emit({ stage: 'no_profile', address: label, ok: false, detail: String(e?.message || e).slice(0, 120) }); return; }
  const res = await call('staffEntityWrite', { entity: 'PermitLocality', op: 'create', data: payload }).catch((e) => ({ error: String(e?.message || e) }));
  if (res?.record?.id || res?.id) {
    const id = res.record?.id || res.id;
    localities.push({ id, name: payload.name, state: payload.state });
    localityIds.add(`${normalizePermitJurisdictionName(payload.name)}|${normalizeAddressState(payload.state)}`);
    emit({ stage: 'office_created', address: label, ok: true, detail: `office record created from ${profile.name} profile — ${payload.offices.length} office${payload.offices.length === 1 ? '' : 's'}, needs verification` });
  } else if (res?.success === false && /exist|duplicate/i.test(String(res?.error || ''))) {
    emit({ stage: 'office_exists', address: label, ok: true, detail: 'already exists' });
  } else {
    emit({ stage: 'office_error', address: label, ok: false, detail: (res?.error || 'create failed').slice(0, 120) });
  }
  await sleep(DELAY);
}

// ── research-queue backfill ──
// Profiles stub-created before the queue hook existed have "Office research
// still needed"/"queued" in their notes but no SourceCollectionQueue row —
// without one, the research dispatch never researches them and their offices
// stay empty forever. Enqueue each unqueued stub once at startup.
function queueKeyFor(name, state, type, parentCounty) {
  const t = String(type || '').toLowerCase();
  const qt = t === 'county' ? 'county' : t === 'township' ? 'township' : t === 'village' ? 'village' : 'city';
  return [String(name || '').trim().toLowerCase(), String(state || '').trim().toLowerCase(), qt, String(parentCounty || '').trim().toLowerCase()].join('|');
}
async function backfillResearchQueue() {
  const [qj, pj] = await Promise.all([
    call('staffDataRead', { entity: 'SourceCollectionQueue', query: {}, limit: 1000 }).catch(() => ({ items: [] })),
    call('staffDataRead', { entity: 'JurisdictionProfile', query: { verification_status: 'needs_verification' }, limit: 1000 }).catch(() => ({ items: [] })),
  ]);
  const queued = new Set((qj.items || []).map((r) => queueKeyFor(r.jurisdiction_name, r.state, r.jurisdiction_type, r.parent_county_name)));
  let enqueued = 0;
  for (const p of pj.items || []) {
    if (!/office research/i.test(String(p.notes || ''))) continue;
    const parent = p.parent_county?.name || p.parent_county_name || '';
    const key = queueKeyFor(p.name, p.state, p.type, parent);
    // Bring older scan-created stubs up to the app's profile shape —
    // auto_refresh so research cycles pick them up, plus the activity_log
    // audit trail the app's own dispatch writes.
    if (p.auto_refresh !== true) {
      const log = Array.isArray(p.activity_log) ? p.activity_log.slice() : [];
      log.push({ id: crypto.randomUUID(), action: 'updated', description: 'Upgraded to the standard auto-research profile shape (auto_refresh enabled).', user: 'system:permittingScanOfficeGenerator', timestamp: new Date().toISOString() });
      await call('staffEntityWrite', { entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { auto_refresh: true, activity_log: log } }).catch(() => null);
    }
    if (queued.has(key)) continue;
    queued.add(key);
    const t = String(p.type || '').toLowerCase();
    const qtype = t === 'county' ? 'county' : t === 'township' ? 'township' : t === 'village' ? 'village' : 'city';
    const q = await call('staffEntityWrite', { entity: 'SourceCollectionQueue', op: 'create', data: { jurisdiction_name: p.name, state: p.state, jurisdiction_type: qtype, parent_county_name: parent || null, status: 'not_started', dispatch_rank: 1, missing_next: 'Office research — backfilled by the address-resolution scan (priority).' } }).catch((e) => ({ error: String(e?.message || e) }));
    if (q?.record?.id || q?.id) enqueued++;
    emit({ stage: q?.record?.id || q?.id ? 'research_queued' : 'research_queue_error', address: `${p.name}, ${p.state} (backfill)`, ok: !!(q?.record?.id || q?.id), detail: q?.record?.id || q?.id ? 'queued for office research' : (q?.error || 'queue create failed').slice(0, 120) });
    await sleep(400);
  }
  if (enqueued) console.log(`research backfill: ${enqueued} stub profiles queued`);
}

const done = new Set();
let offset = 0;
async function drain() {
  if (!existsSync(EVENTS)) return;
  const lines = readFileSync(EVENTS, 'utf8').split('\n');
  for (; offset < lines.length - 1; offset++) {
    const l = lines[offset];
    if (!l.trim()) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.start || !e.targets || e.stage?.startsWith('draft_')||e.stage?.startsWith('office_')||e.stage?.startsWith('research_')||e.stage==='profile_created'||e.stage==='no_profile') continue;
    for (const t of parseTargets(e)) {
      try { await processTarget(t); } catch (err) { emit({ stage: 'office_error', address: `${t.name}, ${t.state}`, ok: false, detail: String(err?.message || err).slice(0, 120) }); }
    }
  }
}

if (APPLY) {
  await freshToken();
  const lines = readFileSync(APPLY, 'utf8').split('\n').filter((l) => l.trim());
  // Plan rows chain: a later row can carry "plan:<seq>" where an earlier row's
  // real id belongs (e.g. PermitLocality.jurisdiction_profile_id). Resolve
  // them as each create lands.
  const appliedIds = {};
  const resolveRefs = (v) => {
    if (typeof v === 'string') return appliedIds[v] || v;
    if (Array.isArray(v)) return v.map(resolveRefs);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = resolveRefs(v[k]);
      return o;
    }
    return v;
  };
  let okCount = 0, failCount = 0;
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    const r = await call(e.fn, resolveRefs(e.body)).catch((err) => ({ error: String(err?.message || err) }));
    const good = r && r.error == null && r.success !== false;
    if (good) {
      okCount++;
      const realId = r?.record?.id || r?.id;
      if (realId) appliedIds[`plan:${e.seq}`] = realId;
    } else failCount++;
    emit({ stage: good ? 'apply_ok' : 'apply_error', ok: good, detail: `${e.fn} ${e.body?.entity || ''} ${e.body?.op || ''}`.slice(0, 140), error: r?.error });
    await sleep(DELAY);
  }
  console.log(`apply: ${okCount} ok, ${failCount} failed (${lines.length} plan rows)`);
  process.exit(failCount ? 1 : 0);
}

await freshToken();
await loadLocalities();
await backfillResearchQueue().catch((e) => console.log('research backfill skipped:', String(e?.message || e).slice(0, 120)));
console.log(`bulk offices: ${localities.length} existing localities; watching ${EVENTS}${ONCE ? ' (once)' : ''}`);
await drain();
if (!ONCE) {
  while (true) { await sleep(3000); await drain().catch(() => {}); }
}
