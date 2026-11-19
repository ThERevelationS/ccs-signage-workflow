#!/usr/bin/env node
// Regional-provider harvest — KY ADDs / OH RPCs administer planning & zoning
// for member jurisdictions (MP-4.2 registry contract: "a jurisdiction with no
// site may still be covered by its ADD/RPC"). One registry covers every served
// county — the bulk-fill counterpart to the BBS harvest for the ZONING role,
// which the building-cert list cannot supply.
// Conservative: only fills profiles with NO potentially_applicable zoning
// entry; verifier's evidence gates still judge every entry per-jurisdiction.
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { REGIONAL_PROVIDERS } from '../base44/shared/regionalProviders.mjs';
import { sleep } from './lib/office-research.mjs';

const EVENTS = '.live-events.jsonl';
const ONCE = process.argv.includes('--once');
const APPL = /potentially_applicable|applicable|confirmed/i;
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'regional-harvest', ...e }) + '\n', { flag: 'a' }); } catch {} };

const norm = (s) => String(s || '').toLowerCase().replace(/\s*county$/i, '').trim();
const COVERED = new Map(); // state|county -> provider
for (const r of REGIONAL_PROVIDERS) for (const c of r.serves_counties || []) {
  const k = `${r.state}|${norm(c)}`;
  if (!COVERED.has(k)) COVERED.set(k, r);
}

async function pass() {
  let wrote = 0, touched = 0;
  for (const st of ['oh', 'ky']) {
    const profiles = getMirror(`profiles-${st}`)?.rows || [];
    for (const p of profiles) {
      const county = norm(p?.parent_county?.name || p?.county_name || '');
      const prov = COVERED.get(`${st.toUpperCase()}|${county}`);
      if (!prov) continue;
      const roles = p.office_research?.roles || [];
      if (roles.some((e) => e.role === 'zoning' && APPL.test(String(e.applicability)))) continue;
      const add = {
        role: 'zoning',
        label: 'Zoning/planning authority',
        verification_status: 'needs_verification',
        office_name: prov.name,
        official_source_url: prov.evidence_url,
        applicability: 'potentially_applicable',
        service_area: `regional coverage — ${prov.name} serves ${county} county member jurisdictions`,
        responsibility_quote: `${prov.name} is the regional planning body providing planning and zoning services to member jurisdictions in ${county} County, ${st.toUpperCase()}.`,
        propagated_from: 'regional-provider-registry',
      };
      const merged = [...roles, add];
      const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: p.id, name: p.name, state: p.state, type: p.type } });
      enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { office_research: normalized }, mirror: `profiles-${st}`, note: `regional provider harvest — ${p.name}, ${p.state}` });
      mirrorApply(`profiles-${st}`, { id: p.id, office_research: normalized });
      wrote++; touched++;
      if (touched % 40 === 0) emit({ stage: 'regional_harvest_progress', detail: `${touched} profiles enriched` });
    }
  }
  emit({ stage: 'regional_harvest_done', detail: `${touched} profiles enriched · ${wrote} zoning entries written` });
}

emit({ stage: 'regional_harvest_boot', address: 'regional harvest', ok: true, start: true, detail: 'ADD/RPC zoning-coverage harvest — registry-driven, ZERO spend' });
(async () => {
  while (true) {
    await pass().catch((e) => emit({ stage: 'regional_harvest_error', detail: String(e?.message || e).slice(0, 160) }));
    if (ONCE) break;
    await sleep(6 * 3600 * 1000); // registry coverage shifts slowly — 4×/day re-check
  }
})().catch((e) => { emit({ stage: 'regional_harvest_error', detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
