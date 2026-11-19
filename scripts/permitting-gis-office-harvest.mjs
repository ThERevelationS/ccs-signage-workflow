// One-shot: seed zoning-authority offices from county GIS jurisdiction
// layers. CAGIS layer 0 ("Zoning Jurisdictions") carries the authoritative
// contact for every Hamilton County municipality's zoning office — name,
// phone, address, homepage — straight from county GIS, not web scraping.
//
// Only ADDS a zoning-role office where the locality has none; never touches
// existing offices. Seeded offices start needs_verification — the verifier
// pipeline promotes them on corroboration like every other source.
// Writes through the outbox; emits gis_office_* events.

import { openSync, writeFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';

const EVENTS = '.live-events.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'gis-office-harvest', ...e }) + '\n', { flag: 'a' }); } catch {} };

const LAYERS = [
  { name: 'cagis-jurisdictions', state: 'OH', county: 'Hamilton',
    url: 'https://cagisonline.hamilton-co.org/arcgis/rest/services/Countywide_Layers/Zoning/MapServer/0/query',
    fields: { name: 'BND_NAME', contact: 'CONTACT', phone: 'PHONE', address: 'ADDRESS', homepage: 'HOMEPAGE', zoningType: 'ZONING_TYP' } },
];

const norm = (s) => String(s || '').toLowerCase().replace(/^(city|village|township) of /, '').replace(/\s+(city|village|township|borough)$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  const n = d.length === 10 ? d : d.length === 11 && d.startsWith('1') ? d.slice(1) : null;
  return n ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : String(p).trim();
};

async function main() {
  const localities = getMirror('localities')?.rows || [];
  const byNorm = new Map(), byNameState = new Map();
  for (const l of localities) {
    const k = `${norm(l.name)}|${String(l.state || '').toUpperCase()}|${norm(l.parent_county?.name || l.county || '')}`;
    if (!byNorm.has(k)) byNorm.set(k, l);
    const ns = `${norm(l.name)}|${String(l.state || '').toUpperCase()}`;
    if (!byNameState.has(ns)) byNameState.set(ns, l);
  }
  let seeded = 0, haveZoning = 0, unmatched = 0, skippedType = 0;
  for (const L of LAYERS) {
    const q = `${L.url}?where=1%3D1&outFields=${Object.values(L.fields).join('%2C')}&returnGeometry=false&resultRecordCount=500&f=json`;
    const j = await fetch(q, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()).catch(() => null);
    for (const f of j?.features || []) {
      const a = f.attributes || {};
      const rawName = a[L.fields.name];
      if (!rawName) continue;
      if (String(a[L.fields.zoningType] || '').toUpperCase() !== 'MUNICIPAL' && !/TWP|CITY|VILL|MUNI/i.test(String(a[L.fields.zoningType] || ''))) { skippedType++; continue; }
      const loc = byNorm.get(`${norm(rawName)}|${L.state}|${norm(L.county)}`)
        || byNorm.get(`${norm(rawName).replace(/ township$/, '')}|${L.state}|${norm(L.county)}`)
        || byNameState.get(`${norm(rawName)}|${L.state}`);
      if (!loc) { unmatched++; emit({ stage: 'gis_office_skip', address: `${rawName}, ${L.state}`, ok: false, detail: 'no locality match' }); continue; }
      const offices = Array.isArray(loc.offices) ? loc.offices : [];
      if (offices.some((o) => (o.authority_roles || []).includes('zoning'))) { haveZoning++; continue; }
      const office = {
        id: `gis-${loc.id}-zoning`,
        catalog_office_id: null, government_office_id: null,
        name: String(a[L.fields.contact] || '').trim() || `${rawName} Zoning`,
        authority_roles: ['zoning'],
        office_type: 'Zoning', office_types: ['Zoning'],
        contact_phone: normPhone(a[L.fields.phone]),
        contact_email: '',
        contact_website: String(a[L.fields.homepage] || '').trim(),
        contact_address: String(a[L.fields.address] || '').trim(),
        hours: null,
        contact_notes: `Zoning authority per Hamilton County CAGIS zoning-jurisdiction layer (${L.name}); zoning type ${a[L.fields.zoningType] || 'unknown'}.`,
        verification_status: 'needs_verification',
        authority_verification_status: 'needs_verification',
        office_source: 'county-gis',
      };
      const next = [...offices, office];
      enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices: next }, mirror: 'localities', note: `gis zoning office — ${loc.name}` });
      mirrorApply('localities', { id: loc.id, offices: next });
      emit({ stage: 'gis_office_seed', address: `${loc.name}, ${L.state}`, ok: true, detail: `${office.name} · ${office.contact_phone || 'no phone'}` });
      seeded++;
    }
  }
  emit({ stage: 'gis_office_done', address: 'harvest', ok: true, detail: `${seeded} seeded, ${haveZoning} already had zoning, ${unmatched} unmatched, ${skippedType} non-muni` });
  console.log(`gis-office-harvest: ${seeded} seeded, ${haveZoning} had zoning, ${unmatched} unmatched`);
}
main().catch((e) => { console.error(e); process.exit(1); });
