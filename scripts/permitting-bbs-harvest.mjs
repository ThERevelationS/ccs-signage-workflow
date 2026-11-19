#!/usr/bin/env node
// Ohio BBS certified-department harvest — one authoritative state document
// covers hundreds of jurisdictions that publish nothing on their own sites.
// Parses bbst_ResidentialBuildingDepartmentList.pdf: each block is a certified
// department (county/municipality) with Building Official + Sub Departments
// (contract jurisdictions the dept serves). Writes potentially_applicable
// office_research entries for building / electrical / sign roles — the
// verifier's evidence gates still judge every entry per-jurisdiction.
// Conservative: never overwrites an existing APPL entry for a role.
import { openSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { sleep } from './lib/office-research.mjs';

const EVENTS = '.live-events.jsonl';
const PDF_PATH = '.audit-work/bbs-residential.pdf';
const PDF_URL = 'https://com.ohio.gov/wps/wcm/connect/gov/61a8e259-f536-4d2e-a30e-02e492f4cc91/bbst_ResidentialBuildingDepartmentList.pdf?MOD=AJPERES';
const ONCE = process.argv.includes('--once');
const ROLES = ['building', 'electrical_permit', 'electrical_inspection', 'sign_permit'];
const APPL = /potentially_applicable|applicable|confirmed/i;
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'bbs-harvest', ...e }) + '\n', { flag: 'a' }); } catch {} };

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
async function fetchPdf() {
  if (existsSync(PDF_PATH)) {
    const head = readFileSync(PDF_PATH).slice(0, 5).toString();
    if (head.startsWith('%PDF') && Date.now() - (await import('node:fs')).statSync(PDF_PATH).mtimeMs < 24 * 3600e3) return;
  }
  const res = await fetch(PDF_URL, { headers: UA });
  if (!res.ok) throw new Error(`BBS PDF fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.slice(0, 5).toString().startsWith('%PDF')) throw new Error('BBS download is not a PDF');
  writeFileSync(PDF_PATH, buf);
}

// PDF item stream → grouped tokens: empty-string items are the name/group
// separators. A "(#NNN)" group marks a dept header (preceding group = name).
// "Sub Departments:" starts a sub-name list ending at the next "(#NNN)".
async function parseDepts() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF_PATH)) }).promise;
  const groups = []; // logical tokens: runs of non-empty items
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let cur = [];
    for (const it of tc.items) {
      if (it.str === '') { if (cur.length) { groups.push(cur.join('').replace(/\s+/g, ' ').trim()); cur = []; } continue; }
      cur.push(it.str);
    }
    if (cur.length) groups.push(cur.join('').replace(/\s+/g, ' ').trim());
  }
  const blocks = [];
  let cur = null, inSubs = false;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const head = g.match(/^(.+?)\s*\(#\d+\)/);
    if (head && !/departments?:|certification list|^county$/i.test(head[1])) {
      if (cur) blocks.push(cur);
      cur = { dept: head[1].trim(), official: null, plumbing: null, subs: [] };
      inSubs = false;
      continue;
    }
    if (!cur) continue;
    if (/^Sub\s+Departments?:/i.test(g)) { inSubs = true; continue; }
    const off = g.match(/^Building\s+Official:?\s*(.*)/i);
    if (off) { inSubs = false; cur.official = off[1].trim() || null; continue; }
    const pl = g.match(/^Plmg\s*-?\s*Plumbing:?\s*(.*)/i);
    if (pl) { inSubs = false; cur.plumbing = pl[1].trim() || null; continue; }
    if (/^Board\s+of\s+Building\s+Standards|^\d{1,2}\/\d{1,2}\/\d{4}|^\d+$|^\(\d{3}\)/.test(g)) continue; // footer/phone noise
    if (inSubs) cur.subs.push(g);
  }
  if (cur) blocks.push(cur);
  return blocks.filter((b) => b.dept);
}

const norm = (s) => String(s || '').toLowerCase().replace(/-/g, ' ').replace(/\b(the|village|city|township|county|of)\b/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const normCounty = (s) => norm(s);

async function pass() {
  await fetchPdf();
  const depts = await parseDepts();
  emit({ stage: 'bbs_harvest_pass', detail: `${depts.length} certified departments parsed` });
  const profiles = getMirror('profiles-oh')?.rows || [];
  const byName = new Map(); // normName|normCounty -> [profiles]
  const countyOf = (p) => norm(String(p?.parent_county?.name || ''));
  for (const p of profiles) {
    const k = `${norm(p.name)}|${countyOf(p)}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
    // County profiles are found by state-level name too.
    const k2 = `${norm(p.name)}|`;
    if (!byName.has(k2)) byName.set(k2, []);
    byName.get(k2).push(p);
  }
  let wrote = 0, matched = 0;
  const touch = async (profile, deptName, official, scopeNote, countyKey) => {
    const roles = profile.office_research?.roles || [];
    const has = (r) => roles.some((e) => e.role === r && APPL.test(String(e.applicability)));
    const adds = [];
    for (const role of ROLES) {
      if (has(role)) continue;
      adds.push({
        role, label: { building: 'Building permits', electrical_permit: 'Electrical permit issuer', electrical_inspection: 'Electrical inspection provider', sign_permit: 'Sign permit issuer' }[role],
        verification_status: 'needs_verification',
        office_name: `${deptName} Building Department`,
        official_source_url: PDF_URL,
        applicability: 'potentially_applicable',
        service_area: scopeNote,
        responsibility_quote: `Ohio Board of Building Standards Certified Residential Building Department — Building Official: ${official || 'on file'} — ${scopeNote}`,
        contact_info: official ? { title: 'Building Official', name: official } : null,
        propagated_from: 'ohio-bbs-certified-list',
      });
    }
    if (!adds.length) return false;
    const merged = [...roles, ...adds];
    const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: profile.id, name: profile.name, state: profile.state, type: profile.type } });
    enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: normalized }, mirror: 'profiles-oh', note: `BBS harvest — ${profile.name}` });
    mirrorApply('profiles-oh', { id: profile.id, office_research: normalized });
    wrote += adds.length;
    return true;
  };
  for (const d of depts) {
    const dCounty = normCounty(d.dept);
    // Never-combine guard on name matching: norm() strips type words, so
    // "Huron County" and "Huron Township" collide — require the dept's own
    // suffix to constrain which profile type may claim it.
    const wantType = /county$/i.test(d.dept) ? /county/i : /township$/i.test(d.dept) ? /township/i : null;
    const cands = (byName.get(`${dCounty}|`) || []).concat(profiles.filter((p) => norm(p.name) === dCounty));
    const typed = wantType ? cands.filter((p) => wantType.test(p.type || '') || wantType.test(p.name || '')) : cands;
    const parent = (wantType && typed.find((p) => wantType.test(p.type || ''))) || typed[0];
    if (parent && await touch(parent, d.dept, d.official, `unincorporated areas — certified dept (#${d.dept})`)) matched++;
    // Sub-departments — villages/cities under this dept's contract, county-scoped.
    for (const sub of d.subs) {
      const cands2 = byName.get(`${norm(sub)}|${dCounty}`) || [];
      const hit = cands2.find((p) => /village|city|municipality/i.test(p.type || '')) || cands2[0];
      if (hit && await touch(hit, d.dept, d.official, `sub-department of ${d.dept} certified dept (BBS)`)) matched++;
    }
  }
  emit({ stage: 'bbs_harvest_done', detail: `${matched} profiles updated · ${wrote} role entries written` });
}

emit({ stage: 'bbs_harvest_boot', address: 'bbs harvest', ok: true, start: true, detail: 'Ohio BBS certified-department harvest — ZERO spend, official state list' });
(async () => {
  while (true) {
    await pass().catch((e) => emit({ stage: 'bbs_harvest_error', detail: String(e?.message || e).slice(0, 160) }));
    if (ONCE) break;
    await sleep(24 * 3600 * 1000); // the state list changes slowly — daily re-check
  }
})().catch((e) => { emit({ stage: 'bbs_harvest_error', detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
