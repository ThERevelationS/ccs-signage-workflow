#!/usr/bin/env node
// WS-2.3 — Statutory roster harvest. Kentucky electrical inspection is
// structurally fixed by KRS 227.480+: ONLY DHBC-certified inspectors may
// perform it — no per-jurisdiction discovery needed.
//
// BLOCKED 2026-11-05 — not rostered. The claim is true, but dhbc.ky.gov is a
// JS-rendered SPA: the verifier's MP-5.1 plain-fetch re-fetch can't find ANY
// quote on the fetched HTML, so every entry would die as `stale_source` —
// the same failure that killed the regional-harvest entries. Integrity rule:
// never write evidence the verifier can't confirm. Needs: a verbatim-verifiable
// source (a fetchable KRS 227.480 page — legislature doc-ids are opaque — or
// a published DHBC certified-inspector roster document). The roster lib's
// `kyElectricalRoster()` still contributes corroboration hosts for KY
// electrical evidence found by other means (permitting-authority-verifier.mjs).
//
// If a verbatim source is found, this writes KY profiles lacking applicable
// electrical_inspection entries citing that source.
import { openSync, writeFileSync } from 'node:fs';
import { enqueue } from './lib/outbox.mjs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { kyElectricalRoster } from './lib/rosters/certified-depts.mjs';

const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'roster-harvest', ...e }) + '\n', { flag: 'a' }); } catch {} };
const VERIFY_FEED = '.audit-work/verify-first.jsonl';
const feedVerify = (name, state) => { try { writeFileSync(VERIFY_FEED, JSON.stringify({ name, state, at: Date.now() }) + '\n', { flag: 'a' }); } catch {} };
const APPL = /potentially_applicable|applicable|confirmed/i;
const SLEEP_MS = 1500;

const roster = kyElectricalRoster();
const KY_ENTRY = {
  role: 'electrical_inspection',
  office_name: 'DHBC-certified electrical inspector',
  official_source_url: roster.roster_url,
  applicability: 'potentially_applicable',
  responsibility_quote: roster.fact,
  delegation_quote: `Statutory basis: ${roster.source} — Kentucky requires all electrical inspections be performed by DHBC-certified inspectors.`,
  service_area: 'statewide — statutory coverage',
  contact_info: { website: roster.roster_url },
  research_fields: { source_class: 'statutory_roster' },
};

async function pass() {
  const ky = getMirror('profiles-ky')?.rows || [];
  const locs = getMirror('localities')?.rows || [];
  const locByProf = new Map(locs.map((l) => [l.jurisdiction_profile_id, l]));
  let wrote = 0, skipped = 0;
  for (const p of ky) {
    if (p?.duplicate_of || /historical/i.test(String(p?.verification_status || ''))) continue;
    const roles = p.office_research?.roles || [];
    const has = roles.some((e) => e.role === 'electrical_inspection' && APPL.test(String(e.applicability)));
    if (has) { skipped++; continue; }
    const merged = [...roles, { ...KY_ENTRY }];
    const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: p.id, name: p.name, state: p.state, type: p.type } });
    enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { office_research: normalized }, mirror: 'profiles-ky', note: `roster harvest — ${p.name}, KY (DHBC electrical inspection)` });
    mirrorApply('profiles-ky', { id: p.id, office_research: normalized });
    const loc = locByProf.get(p.id);
    if (loc) feedVerify(loc.name, loc.state);
    wrote++;
    await new Promise((r) => setTimeout(r, 50)); // gentle outbox pacing
  }
  emit({ stage: 'roster_harvest_done', ok: true, detail: `KY DHBC electrical-inspection statutory entries: ${wrote} profiles enriched · ${skipped} already covered` });
}

emit({ stage: 'roster_harvest_boot', ok: true, start: true, detail: 'statutory roster harvest — KY DHBC electrical inspection (KRS 227.480+)' });
(async () => {
  while (true) {
    await pass().catch((e) => emit({ stage: 'roster_harvest_error', ok: false, detail: String(e?.message || e).slice(0, 160) }));
    await new Promise((r) => setTimeout(r, 24 * 3600 * 1000)); // daily — roster is static
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }
})();
