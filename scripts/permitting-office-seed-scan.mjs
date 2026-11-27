// Seed scan — office data backfill for EVERY PermitLocality in the app.
//
// What it does per locality:
//   1. Finds the linked JurisdictionProfile (jurisdiction_profile_id, else
//      same-normalized name+state).
//   2. Profile carries office_research.roles → rebuild office records via
//      jurisdictionToPermitLocality and MERGE into the locality:
//        - same-name office exists  → fill EMPTY contact fields only, union
//          authority_roles; staff-verified data is never overwritten.
//        - researched office absent → appended whole (needs_verification).
//   3. Profile exists but has no research → ensure a SourceCollectionQueue row
//      (dispatch_rank 1) so the research pipeline fills it.
//   4. No profile at all → queue + gap event.
//
// Re-runnable: complete records are skipped, queued rows are not duplicated.
// Emits to .live-events.jsonl so the dashboard streams it like the address scan.
// Future offices: scan-created jurisdictions flow through the generator's same
// path; this script is the sweep that keeps existing localities converging.

import { openSync, writeFileSync } from 'fs';
import { mirrorRead, mirrorApply } from './lib/entity-mirror.mjs';
import { idleWait } from './lib/event-tail.mjs';
import { enqueue, readPendingWritesFor } from './lib/outbox.mjs';
import { filterArchivedOffices, overlayPendingLocalityWriteData } from './lib/office-archive.mjs';
import { jurisdictionToPermitLocality, normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { normalizeAddressState } from '../src/shared/permittingAddressState.js';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { buildIdentityIndex, withUnionResearch } from './lib/profile-identity.mjs';
import { activeAuthorityRoles } from './lib/needs-review-adjudication.mjs';

const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const EVENTS = '.live-events.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
async function freshToken() {
  const t = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch(() => null);
  token = t?.token || null;
}
await freshToken();
if (!token) { console.error('no token'); process.exit(1); }

async function call(fn, body, retried = false, serverRetry = 0, netRetry = 0) {
  let r;
  try {
    await paceCall(fn);
    r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: token, ...body }) });
  } catch (e) {
    // Socket-level failures ("fetch failed", DNS, resets) are transient — the
    // caller's .catch used to turn every one into a permanent seed_office_error.
    if (netRetry < 5) { await sleep(3000 * (netRetry + 1)); return call(fn, body, retried, serverRetry, netRetry + 1); }
    throw e;
  }
  if ((r.status === 401 || r.status === 403) && !retried) { await freshToken(); return call(fn, body, true); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429 || j?.error === 'traffic volume') { await sleep(4000); return call(fn, body, retried, serverRetry); }
  if ((r.status >= 500 || j?.error === 'user-exception') && serverRetry < 6) {
    await sleep(3000 * (serverRetry + 1));
    return call(fn, body, retried, serverRetry + 1);
  }
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}

const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'sweep-seed', ...e }) + '\n', { flag: 'a' }); } catch {} };

const countyOf = (v) => String(v || '').toLowerCase().replace(/\s*county$/u, '').trim();
const normName = normalizePermitJurisdictionName;
const PROFILE_TO_QUEUE_TYPE = { city: 'city', village: 'city', municipality: 'city', township: 'township', county: 'county' };

// Roles adjudicated not_applicable/covered_elsewhere are tombstoned in
// not_applicable_roles and removed from authority_roles. Treat the map as
// authoritative even for legacy rows where the role itself was not removed:
// seed/rebuild must never resurrect it as applicable work.
// An office "has data" when it carries at least one reachable contact channel
// AND an active authority role — an office with neither is a placeholder.
const officeHasData = (o) =>
  Boolean(String(o?.contact_phone || o?.contact_email || o?.contact_website || o?.contact_address || '').trim())
  && activeAuthorityRoles(o).length > 0;
const localityNeedsWork = (l) => !(l?.offices || []).length || l.offices.some((o) => !officeHasData(o));

const CONTACT_KEYS = ['contact_phone', 'contact_email', 'contact_website', 'contact_address', 'hours',
  // MP-8.1 answer-card fields — harvested research lands on existing offices too.
  'application_form_url', 'application_form_name', 'fee_schedule_text', 'typical_review_time', 'contact_person', 'field_confidence', 'service_area', 'data_as_of'];
const LIST_KEYS = ['submission_methods', 'required_documents', 'overlay_flags'];

// MP-1.6 — stub-name detection: synthesized "<Jurisdiction> <role> office"
// names carry no real provider identity; a researched name replaces them.
const isStubName = (n) => {
  const s = String(n || '');
  return /\b(zoning|building|electrical|sign|planning|right.of.way|permit)\s+(authority|office|permit office|dept|department)$/i.test(s.trim())
    || /^city of .+$/i.test(s.trim()) || /permitting office$/i.test(s.trim());
};

// Merge rebuilt offices into existing offices[]. Only empty fields get filled;
// non-empty values and staff verification are never touched.
function mergeOffices(existing, built) {
  // Self-heal: legacy concat writes left same-ID/same-name duplicates inside
  // existing[]. The name-keyed merge below only dedupes built→existing, so
  // collapse within existing first or the dupes persist forever.
  const out = []; const seen = new Map();
  for (const o of existing) {
    const k = `${o?.id || ''}|${normName(o?.name || '')}`;
    if (!k.trim() || k === '|') { out.push(o); continue; }
    if (seen.has(k)) {
      const prev = out[seen.get(k)];
      const roles = new Set([...activeAuthorityRoles(prev), ...activeAuthorityRoles(o)]);
      prev.authority_roles = [...roles];
      if (o?.authority_verification_status === 'staff_verified' && prev?.authority_verification_status !== 'staff_verified') {
        prev.authority_verification_status = 'staff_verified';
        prev.verified_by = o.verified_by || prev.verified_by;
      }
      for (const f of CONTACT_KEYS) if (!String(prev[f] || '').trim() && String(o?.[f] || '').trim()) prev[f] = o[f];
      continue;
    }
    seen.set(k, out.length); out.push(o);
  }
  let filled = 0, added = 0;
  for (const b of built) {
    const key = normName(b.name || '');
    if (!key) continue;
    // Name match first; then role-overlap match — a stub office ("<Jurisdiction>
    // Building office") and its realized provider ("Hamilton County Building
    // Department") share roles but not names. Matching on roles lets the real
    // name REPLACE the stub instead of duplicating it.
    const bRoles = new Set(b.authority_roles || []);
    let hit = out.find((o) => normName(o?.name || '') === key);
    if (!hit && bRoles.size) {
      hit = out.find((o) => {
        if (!isStubName(o?.name)) return false;
        const oRoles = new Set(activeAuthorityRoles(o));
        return [...bRoles].some((r) => oRoles.has(r));
      });
      if (hit) hit.name = b.name; // stub realized to the real provider
    }
    if (hit) {
      let touched = false;
      for (const k of CONTACT_KEYS) {
        if (!String(hit[k] || '').trim() && String(b[k] || '').trim()) { hit[k] = b[k]; touched = true; }
      }
      for (const k of LIST_KEYS) {
        const cur = Array.isArray(hit[k]) ? hit[k] : [];
        const add = (Array.isArray(b[k]) ? b[k] : []).filter((v) => v && !cur.includes(v));
        if (add.length) { hit[k] = [...cur, ...add].slice(0, 8); touched = true; }
      }
      const have = new Set(activeAuthorityRoles(hit));
      for (const r of b.authority_roles || []) if (!hit.not_applicable_roles?.[r] && !have.has(r)) { have.add(r); touched = true; }
      hit.authority_roles = [...have];
      if (!hit.authority_verification_status) { hit.authority_verification_status = 'needs_verification'; touched = true; }
      if (!String(hit.contact_notes || '').trim() && b.contact_notes) { hit.contact_notes = b.contact_notes; touched = true; }
      if (touched) filled += 1;
    } else {
      out.push(b);
      added += 1;
    }
  }
  return { offices: out, filled, added };
}

// staffDataRead caps `limit` at 5000 — page with `skip` beyond that
// locality/queue sets silently truncate and the scan duplicates queue rows.
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

async function sweep(onlyNames = null) {
  // Mirror reads — the sync daemon owns ALL remote traffic. A stale mirror
  // beats a worker self-sync: every worker that triggered its own full-table
  // read turned into a bulk reader and that's what 429s the site.
  const noSync = async () => null;
  const [localities, queueRows, profOH, profKY] = await Promise.all([
    mirrorRead('localities', 45 * 60 * 1000, noSync),
    mirrorRead('queue', 20 * 60 * 1000, noSync),
    mirrorRead('profiles-oh.slim', 45 * 60 * 1000, noSync),
    mirrorRead('profiles-ky.slim', 45 * 60 * 1000, noSync),
  ]);
  const locRows = localities || [], qRows = queueRows || [], profs = [...(profOH || []), ...(profKY || [])];
  // 'queued' must mean research actually pending — a terminal row
  // (sources_found/blocked/duplicate) is NOT coverage: it left 400+
  // localities waiting on dead rows forever. Key includes county so
  // "Monroe|Greene" never suppresses "Monroe|Butler".
  const Q_ACTIVE = new Set(['not_started', 'source_discovery', 'research_in_flight', 'partial_gaps']);
  const qCounty = (s) => String(s || '').toLowerCase().replace(/\s+county$/, '').trim();
  const queued = new Set(
    qRows.filter((q) => Q_ACTIVE.has(q.status))
      .map((q) => `${normName(q.jurisdiction_name)}|${qCounty(q.parent_county_name)}|${normalizeAddressState(q.state)}`)
  );
  // County-less queued rows still count as pending for same-name same-state
  // localities (they'd otherwise double-queue); tracked separately so a
  // qualified row for a DIFFERENT county doesn't fake coverage.
  const queuedCountyLess = new Set(
    qRows.filter((q) => Q_ACTIVE.has(q.status) && !q.parent_county_name)
      .map((q) => `${normName(q.jurisdiction_name)}|${normalizeAddressState(q.state)}`)
  );
  const profById = new Map(profs.map((p) => [p.id, p]));
  // Research union index — ALL profiles incl. historical/duplicate_of: an
  // identity-equal sibling's office_research is evidence about the same
  // jurisdiction and pools into verification/seeding.
  const profIdentity = buildIdentityIndex(profs);
  const profByNameState = new Map();
  for (const p of profs) {
    if (String(p.verification_status || '').toLowerCase() === 'historical' || String(p.duplicate_of || '').trim()) continue;
    const k = `${normName(p.name)}|${normalizeAddressState(p.state)}`;
    // Name+state is NOT unique in OH/KY (20+ Monroe townships) — keep a list;
    // a same-name fallback may only seed when exactly one candidate exists.
    if (!profByNameState.has(k)) profByNameState.set(k, []);
    profByNameState.get(k).push(p);
  }
  console.log(`office seed scan: ${locRows.length} localities, ${queued.size} jurisdictions already queued, ${profs.length} profiles indexed`);

  const APPL = /potentially_applicable|applicable|confirmed/i;
  // Trigger hints address localities as "Name, ST" — a targeted pass filters
  // to just those so new research merges in seconds, not the next full sweep.
  const only = onlyNames ? new Set(onlyNames.map((h) => `${String(h.name || '').toLowerCase().trim()}|${String(h.state || '').toUpperCase().trim()}`)) : null;
  const targets = only ? locRows.filter((l) => only.has(`${String(l.name || '').toLowerCase().trim()}|${String(l.state || '').toUpperCase().trim()}`)) : locRows;
  let done = 0;
  for (const loc of targets) {
    if (loc?.duplicate_of) continue; // tombstoned — the real row carries the work
    const label = `${loc.name}, ${loc.state}`;
    await waitWhilePaused('seed-scan', { item: label });
    try {
      // Find the profile in the local index first: explicit link, else a
      // UNIQUE normalized name+state match — seeding offices from an
      // arbitrarily-picked same-name profile is sibling contamination.
      let profile = profById.get(loc.jurisdiction_profile_id) || null;
      let ambiguous = 0;
      if (!profile) {
        const cands = profByNameState.get(`${normName(loc.name)}|${normalizeAddressState(loc.state)}`) || [];
        if (cands.length === 1) profile = cands[0];
        else if (cands.length > 1) ambiguous = cands.length;
      }
      // A locality isn't done just because its offices look complete — any
      // applicable research role not yet carried by ANY office is work too
      // (county-administered providers land as their own office rows).
      const researchRoles = new Set(
        (withUnionResearch(profIdentity, profile)?.office_research?.roles || [])
          .filter((r) => r?.role && APPL.test(String(r?.applicability)))
          .map((r) => r.role)
      );
      // Archive tombstones participate in the completeness check. Otherwise a
      // row whose active offices otherwise look "complete" is skipped before the
      // archived duplicate is ever stripped (Venice/Election Inspector stayed
      // active this way). Coverage is measured on the archive-filtered active
      // set: a role carried only by a retired non-permit body is still uncovered.
      const baseArchiveFilter = filterArchivedOffices(loc.offices || [], loc.archived_offices || []);
      const activeForCoverage = { ...loc, offices: baseArchiveFilter.offices };
      // NA/covered tombstones count as resolved coverage too — otherwise a
      // role correctly removed from authority_roles looks "uncovered" forever
      // and the scanner rebuilds the placeholder it just helped retire.
      const officeRoles = new Set((activeForCoverage.offices || []).flatMap((o) => [...activeAuthorityRoles(o), ...Object.keys(o?.not_applicable_roles || {})]));
      const uncoveredRoles = [...researchRoles].filter((r) => !officeRoles.has(r)).length;
      if (!localityNeedsWork(activeForCoverage) && !uncoveredRoles && !baseArchiveFilter.removed.length) {
        done++; continue; // complete records don't spam the event feed every pass
      }
      emit({ start: true, address: label });
      if (ambiguous) {
        emit({ stage: 'seed_office_ambiguous', address: label, ok: false, detail: `${ambiguous} same-name profiles, no profile link — needs a human to link, not a guess` });
        done++;
        continue;
      }
      const researchProfile = withUnionResearch(profIdentity, profile);
      const roles = researchProfile?.office_research?.roles || [];
      if (researchProfile && roles.length) {
        const rebuilt = jurisdictionToPermitLocality(researchProfile);
        // Archive is authoritative in both dimensions that matter here:
        //   1. matching is id OR normalized-name+role-overlap (scan ids are
        //      positional and scrape duplication is common), and
        //   2. the write base includes same-row writes still pending in the
        //      outbox. A full pass takes minutes; without that overlay a
        //      retirement enqueued after the pass started is clobbered by this
        //      stale backfill before the flusher ever drains either write.
        const effectiveLoc = overlayPendingLocalityWriteData(loc, readPendingWritesFor('PermitLocality', loc.id));
        const archivedOffices = effectiveLoc.archived_offices || [];
        const activeFilter = filterArchivedOffices(effectiveLoc.offices || [], archivedOffices);
        const activeBefore = activeFilter.offices;
        const removedArchived = activeFilter.removed.length;
        const rebuiltActive = filterArchivedOffices(rebuilt.offices || [], archivedOffices).offices;
        const { offices, filled, added } = mergeOffices(activeBefore, rebuiltActive);
        if (filled + added + removedArchived > 0) {
          // Local-first: enqueue the update, mirrorApply now so later passes
          // see the offices immediately — the flusher streams it remotely.
          const data = { offices, archived_offices: archivedOffices };
          enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data, mirror: 'localities', note: `office backfill — ${label}` });
          mirrorApply('localities', { id: loc.id, ...data });
          emit({ stage: 'seed_office_backfilled', address: label, ok: true, detail: `${added} office(s) added, ${filled} filled from ${profile.name} research${removedArchived ? `, ${removedArchived} archived office(s) kept out of active` : ''} — needs staff verification` });
        } else {
          emit({ stage: 'seed_office_ok', address: label, ok: true, detail: 'research present but no new fields to fill' });
        }
      } else {
        // No research yet — an archive cleanup is still owed when the active
        // array carries a tombstoned office. Overlay pending writes first: if a
        // retirement is already waiting, it has already removed the office and
        // no redundant cleanup write is needed.
        if (baseArchiveFilter.removed.length) {
          const effectiveLoc = overlayPendingLocalityWriteData(loc, readPendingWritesFor('PermitLocality', loc.id));
          const archivedOffices = effectiveLoc.archived_offices || [];
          const activeFilter = filterArchivedOffices(effectiveLoc.offices || [], archivedOffices);
          if (activeFilter.removed.length) {
            const data = { offices: activeFilter.offices, archived_offices: archivedOffices };
            enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data, mirror: 'localities', note: `archive cleanup — ${label}` });
            mirrorApply('localities', { id: loc.id, ...data });
            emit({ stage: 'seed_office_archive_cleaned', address: label, ok: true, detail: `${activeFilter.removed.length} archived office(s) removed from active while research is still pending` });
          }
        }
        // Ensure an ACTIVE county-keyed queue row so the pipeline fills it.
        // Terminal rows (dup/blocked/sources_found) are not coverage — the
        // locality re-queues instead of waiting on the dead.
        const locCounty = qCounty(profile?.parent_county?.name || loc.parent_county_name || '');
        const qkey = `${normName(loc.name)}|${locCounty}|${normalizeAddressState(loc.state)}`;
        const looseKey = `${normName(loc.name)}|${normalizeAddressState(loc.state)}`;
        if (queued.has(qkey) || queuedCountyLess.has(looseKey)) {
          emit({ stage: 'seed_office_waiting', address: label, ok: true, detail: profile ? 'profile exists, research already queued — offices fill when it lands' : 'no profile — research already queued' });
        } else {
          const qtype = PROFILE_TO_QUEUE_TYPE[String(profile?.type || loc.jurisdiction_type || 'city').toLowerCase()] || 'city';
          // Enqueue the create locally — the queue mirror fills on next sync,
          // and `queued` dedupes within this run either way.
          enqueue({
            entity: 'SourceCollectionQueue', op: 'create',
            data: {
              jurisdiction_name: loc.name, state: loc.state, jurisdiction_type: qtype,
              parent_county_name: profile?.parent_county?.name || loc.parent_county_name || null,
              status: 'not_started', dispatch_rank: 1,
              missing_next: 'Office research — auto-queued by the office seed scan (priority).',
            },
            note: `research queue — ${label}`,
          });
          // Dedupe + mirror a placeholder row so a restart before the next
          // sync doesn't re-enqueue a duplicate — the sync replaces it with
          // the real row once the flusher lands the create.
          queued.add(`${normName(loc.name)}|${qCounty(profile?.parent_county?.name || loc.parent_county_name || '')}|${normalizeAddressState(loc.state)}`);
          mirrorApply('queue', { id: `outbox-pending:${loc.id}`, jurisdiction_name: loc.name, state: loc.state, jurisdiction_type: qtype, parent_county_name: profile?.parent_county?.name || loc.parent_county_name || null, status: 'not_started' });
          emit({ stage: 'seed_office_queued', address: label, ok: true, detail: `queued for office research (priority) — ${(loc.offices || []).length} office slot(s) waiting for data` });
        }
      }
    } catch (e) {
      emit({ stage: 'seed_office_error', address: label, ok: false, detail: String(e?.message || e).slice(0, 160) });
    }
    done++;
    if (done % 10 === 0) console.log(`seed scan: ${done}/${locRows.length}`);
    await sleep(400); // outbox absorbs writes — the 1.5s budget-era pace just throttled local merges
  }
  emit({ stage: 'seed_office_scan_done', address: 'office seed scan', ok: true, detail: `${locRows.length} localities processed` });
  console.log('office seed scan pass complete:', locRows.length);
}

// Continuous mode — full re-sweep every 10 minutes, PLUS trigger-aware idle:
// the pipeline trigger daemon wakes us the moment research lands so merges
// happen in seconds, not at the next poll.
async function main() {
  for (;;) {
    await waitWhilePaused('seed-scan', { item: 'seed sweep' });
    await sweep().catch((e) => { emit({ stage: 'seed_office_error', address: 'office seed scan', ok: false, detail: `sweep failed: ${String(e?.message || e).slice(0, 140)}` }); });
    heartbeat('seed-scan', 'idle', 'between sweeps');
    await idleWait(10 * 60 * 1000, 'seed', async (hints) => {
      emit({ stage: 'seed_office_trigger', detail: `${hints.length} hint(s) — targeted merge now` });
      await sweep(hints);
    }, { emit });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
