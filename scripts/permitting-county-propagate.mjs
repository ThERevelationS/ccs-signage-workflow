#!/usr/bin/env node
// County-provider propagation — the multiplier. When a county office is
// evidenced as a provider for one jurisdiction, the same agency usually
// serves siblings: Ohio townships default to county zoning unless they
// adopted their own (ORC 519), and Kentucky joint planning commissions
// serve multiple cities. Every verified county finding is therefore worth
// N jurisdictions, not 1.
//
// Rules (conservative — propagation fills ABSENT evidence, never overrides):
//   township  → accepts county-domain / county-administered pool entries
//   village/city → only when the pool entry signals shared service
//                  (county-administered tag or joint/regional/district name)
//   any type  → never overwrite an existing potentially_applicable entry
//               for that role — local research always wins
//   any type  → skip profiles with NO research (queue/researcher owns those)
//
// Entries land as normal potentially_applicable research — the verifier's
// evidence gates (official URL, quote, county-unincorporated) still judge
// every propagated role per-jurisdiction. Emits prop_done → seed trigger.
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { sleep } from './lib/office-research.mjs';

const EVENTS = '.live-events.jsonl';
const CLAIMS_FILE = '.audit-work/county-prop-claims.json';
const ONCE = process.argv.includes('--once');
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'county-prop', ...e }) + '\n', { flag: 'a' }); } catch {} };
let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS_FILE, JSON.stringify(claims)); } catch {} };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+county$/i, '').trim();
const APPL = /potentially_applicable|applicable|confirmed/i;
const COUNTY_TAG = /county.administered|county.wide|unincorporated/i;
const SHARED = /joint|regional|district|area|combined|metro|multi|community/i;

async function pass() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const localities = getMirror('localities')?.rows || [];
  // Canonical rows only: JurisdictionProfile has duplicate rows (same name,
  // different ids) — propagating to every copy triples writes and feeds the
  // wrong profile. Preferred row = the one a locality actually references,
  // else the first non-historical non-duplicate row for that name+state. Key
  // includes county+type: same-name townships in DIFFERENT counties are real
  // distinct jurisdictions, not dups.
  const countyKeyOf = (p) => norm(p.county_name || p.parent_county?.name || p.name);
  const referenced = new Set(localities.map((l) => l.jurisdiction_profile_id).filter(Boolean));
  const canonical = new Map();
  for (const p of profiles) {
    if (String(p.verification_status || '').toLowerCase() === 'historical' || String(p.duplicate_of || '').trim()) continue;
    const k = `${String(p.name || '').toLowerCase()}|${String(p.state || '').toUpperCase()}|${countyKeyOf(p)}|${String(p.type || '').toLowerCase()}`;
    const cur = canonical.get(k);
    if (!cur || (referenced.has(p.id) && !referenced.has(cur.id))) canonical.set(k, p);
  }
  // Group by state+county — never cross county lines. Field reality:
  // township/city profiles carry parent_county.name (county_name is empty on
  // all 3,143 townships); county profiles fall back to their own name.
  const byCounty = new Map();
  for (const p of canonical.values()) {
    const ck = `${String(p.state || '').toUpperCase()}|${countyKeyOf(p)}`;
    if (!byCounty.has(ck)) byCounty.set(ck, []);
    byCounty.get(ck).push(p);
  }
  let propagated = 0, scanned = 0;
  for (const [ck, group] of byCounty) {
    const countyProf = group.find((p) => /county/i.test(String(p.type || '')));
    // Evidence pool: the county profile's applicable entries + any sibling's
    // county-administered entries (v2 researcher tags county-fallback finds).
    const pool = new Map(); // role -> best entry
    const addPool = (e, tagged) => {
      if (!e?.role || !APPL.test(String(e?.applicability)) || !/^https?:\/\//i.test(String(e?.official_source_url || ''))) return;
      const cur = pool.get(e.role);
      if (cur && (cur.tagged || !tagged)) return; // tagged county-administered beats plain
      pool.set(e.role, { ...e, tagged });
    };
    for (const e of countyProf?.office_research?.roles || []) addPool(e, true);
    for (const p of group) {
      if (p === countyProf) continue;
      for (const e of p.office_research?.roles || []) {
        if (COUNTY_TAG.test(String(e?.service_area || ''))) addPool(e, true);
      }
    }
    if (!pool.size) continue;
    for (const p of group) {
      if (p === countyProf || /county/i.test(String(p.type || ''))) continue;
      const roles = p.office_research?.roles || [];
      if (!roles.length) continue; // unresearched — the queue owns it
      scanned++;
      const isTwp = /township/i.test(String(p.type || ''));
      const has = (r) => roles.some((e) => e.role === r && APPL.test(String(e.applicability)));
      const adds = [];
      for (const e of pool.values()) {
        if (has(e.role)) continue;                                   // local research wins
        const shared = e.tagged || SHARED.test(String(e.office_name || ''));
        if (!isTwp && !shared) continue;                             // villages/cities need a shared-service signal
        const ck2 = `${p.id}|${e.role}`;
        if (claims[ck2] && Date.now() - new Date(claims[ck2].at).getTime() < 7 * 24 * 3600 * 1000) continue;
        adds.push({
          ...e,
          service_area: `${p.county_name || p.parent_county?.name || ''} — county-administered for ${p.name}`,
          propagated_from: e.office_name || 'county pool',
        });
        claims[ck2] = { at: new Date().toISOString() };
      }
      if (!adds.length) continue;
      const merged = [...roles, ...adds];
      const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: p.id, name: p.name, state: p.state, type: p.type } });
      enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { office_research: normalized }, mirror: `profiles-${String(p.state || '').toLowerCase()}`, note: `county propagation — ${p.name}, ${p.state}` });
      mirrorApply(`profiles-${String(p.state || '').toLowerCase()}`, { id: p.id, office_research: normalized });
      propagated += adds.length;
      if (propagated % 25 < adds.length) saveClaims(); // crash-safety mid-pass
      emit({ stage: 'prop_done', address: `${p.name}, ${p.state}`, ok: true, detail: `+${adds.length} county-provider role(s): ${adds.map((a) => a.role).join('+')} from ${countyProf?.name || ck}` });
    }
  }
  saveClaims();
  emit({ stage: 'prop_pass', detail: `${byCounty.size} counties · ${scanned} sibling profiles scanned · ${propagated} roles propagated` });
}

emit({ stage: 'prop_boot', address: 'county propagation', ok: true, start: true, detail: 'county-provider propagation live — townships: county default · villages/cities: shared-service only' });
(async () => {
  while (true) {
    await pass().catch((e) => emit({ stage: 'prop_error', detail: String(e?.message || e).slice(0, 160) }));
    if (ONCE) break;
    await sleep(15 * 60 * 1000);
  }
})().catch((e) => { emit({ stage: 'prop_error', detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
