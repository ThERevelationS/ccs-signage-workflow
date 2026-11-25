#!/usr/bin/env node
// Local office researcher — ZERO spend replacement for refreshJurisdiction's
// LLM chain (InvokeLLM + UploadFile = the credit burn). Deterministic but deep:
//
//   queue row → official site (profile fields → past source URLs → domain
//   guesses → Wikidata) → SITEMAP crawl + keyword links + directory pages +
//   PDF-evidence detection → pattern extraction → county-site fallback for
//   townships → normalizeOfficeResearch → outbox enqueue
//
// Output is a needs_verification research draft in the SAME shape the LLM
// produced — the evidence-gated verifier still decides what gets promoted,
// so weak extractions stay needs_verification, never wrong-verified.
import { openSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { fetchText, extract, crawlSite, discoverSite, PHONE_RE, EMAIL_RE, PAGE_KEY, DIR_KEY } from './lib/office-research.mjs';
import { pdfPages } from './lib/pdf-extract.mjs';
import { rosterContact } from './lib/office-research.mjs';
import { regionalProvidersFor } from '../base44/shared/regionalProviders.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SLICE = Number(arg('--slice', 0));
const SLICES = Number(arg('--slices', 1));
const sliceOf = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SLICES; };
const EVENTS = '.live-events.jsonl';
const SLEEP = Number(arg('--sleep', 1200));
const PAGE_SLEEP = Number(arg('--page-sleep', 300));
const MAX_PAGES = Number(arg('--max-pages', 9));
const ONCE = args.includes('--once');
// Per-slice claims file — 16 slices each own their own ledger; a shared file
// would lose cooldown entries to read-modify-write races across processes.
const CLAIMS_FILE = `.audit-work/local-research-claims-${SLICE}.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `local-res-${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };

let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS_FILE, JSON.stringify(claims)); } catch {} };
const claimKey = (r) => r.id || `${r.jurisdiction_name}|${r.state}`;

// Research an office_research pool for one jurisdiction.
// opts.wanted — Set of role names the extraction should aim at (gap-target
// research passes the office's missing roles; queue research passes null).
// opts.queueClose === false skips the SourceCollectionQueue close-write —
// synthetic gap targets aren't queue rows.
// opts.merge === true unions new roles into the profile's existing
// office_research (gap research never drops evidence already there).
const roleKey = (r) => `${r?.role}|${String(r?.official_source_url || '').trim().toLowerCase()}|${String(r?.responsibility_quote || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120)}`;
async function research(row, profile, profiles, opts = {}) {
  const label = `${row.jurisdiction_name}, ${row.state}`;
  emit({ stage: 'office_res_step', address: label, start: true, detail: `local research — discovering official site${opts.wanted ? ` (aiming at ${[...opts.wanted].join(', ')})` : ''}` });
  const name = String(row.jurisdiction_name || '').replace(/\s+(city|village|township|county)$/i, '');
  const { site, countyFallback, roster } = await discoverSite({ name, state: row.state, type: row.jurisdiction_type, county: row.parent_county_name, profile, profiles });
  if (!site) {
    // MP-4.6/4.7 — the state roster still has this jurisdiction's clerk
    // phone/address. Crawl it before declaring no_site; whatever lands goes
    // on the profile even without an official site.
    if (roster && profile) {
      const rcrawl = await crawlSite(roster, { maxPages: 4 }).catch(() => null);
      const contact = rcrawl ? rosterContact(rcrawl.pages, row.jurisdiction_name) : null;
      if (contact) {
        const research = { ...(profile.office_research || {}), roster_contact: contact, roles: profile.office_research?.roles || [] };
        enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: research }, note: `roster contact — ${label}` });
        mirrorApply(profile.state === 'KY' ? 'profiles-ky' : 'profiles-oh', { id: profile.id, office_research: research });
        emit({ stage: 'office_res_step', address: label, step: true, detail: `no site — roster contact found via ${roster} (${[contact.phone, contact.email].filter(Boolean).join(', ') || 'address only'})` });
      }
    }
    // MP-4.2/4.5 — no site doesn't mean no provider: ADDs/RPCs administer
    // zoning for member jurisdictions. Record the covering body + taxonomy.
    if (profile) {
      const rps = regionalProvidersFor(row.parent_county_name, row.state);
      if (rps.length) {
        const research = { ...(profile.office_research || {}), regional_providers: rps, roles: profile.office_research?.roles || [] };
        enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: research, provider_type: 'regional' }, note: `regional provider — ${label}` });
        mirrorApply(profile.state === 'KY' ? 'profiles-ky' : 'profiles-oh', { id: profile.id, office_research: research, provider_type: 'regional' });
        emit({ stage: 'office_res_step', address: label, step: true, detail: `no site — regional provider ${rps[0].name} covers ${row.parent_county_name || 'county'}` });
      }
    }
    emit({ stage: 'office_res_review', address: label, ok: false, detail: 'no official site found (profile + guesses + wikidata + search + county + roster)' }); return { result: 'no_site', added: 0 };
  }

  emit({ stage: 'office_res_step', address: label, step: true, detail: `site: ${site}${countyFallback ? ' (county fallback)' : ''}` });
  // MP-1.4: high-demand or metro rows get deep crawls — department pages on
  // city sites hide behind /government indexes a link-layer deeper than the
  // 9-page default reaches.
  const deep = Number(row.demand_weight || 0) >= 10 || /city/i.test(String(row.jurisdiction_type || ''));
  const crawl = await crawlSite(site, { maxPages: deep ? 15 : 9, deep });
  if (!crawl) { emit({ stage: 'office_res_review', address: label, ok: false, detail: `site unreachable: ${site}` }); return { result: 'no_site', added: 0 }; }
  emit({ stage: 'office_res_step', address: label, step: true, detail: `crawled ${crawl.crawled} page(s) · ${crawl.pdf.length} permit PDF(s)` });

  // MP-3.1 — PDF text joins extraction: permit PDFs carry office names, fees,
  // and form titles that filename matching alone can't see.
  const pdfPgs = await pdfPages(crawl.pdf);
  const roles = extract([...crawl.pages, ...pdfPgs], opts.wanted || null);
  // PDF evidence: a sign-permit PDF on the official site ⇒ that role applies,
  // office = site owner when no name extracted.
  for (const p of crawl.pdf) {
    if (roles.find((r) => r.role === p.role)) continue;
    roles.push({ role: p.role, office_name: countyFallback ? `${row.parent_county_name} offices` : `${row.jurisdiction_name} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: countyFallback ? 'county-administered' : null, delegation_quote: null, contact_info: {}, research_fields: {} });
  }
  if (countyFallback) for (const r of roles) { r.service_area = r.service_area || `${row.parent_county_name} — county-administered for ${row.jurisdiction_name}`; }

  emit({ stage: 'office_res_step', address: label, step: true, detail: `${roles.length} role(s) extracted (${crawl.pdf.length} from PDFs)` });
  // Zero roles on the local site → try the parent county before declaring
  // no_evidence. Small villages put zoning/electrical/ROW on the county site;
  // the wrong-place miss was the top error stream.
  if (!roles.length && !countyFallback && row.parent_county_name) {
    const cname = String(row.parent_county_name).replace(/\s+county$/i, '');
    const cprof = (profiles || []).find((p) => /county/i.test(String(p.type || '')) && String(p.name || '').toLowerCase().includes(cname.toLowerCase()) && String(p.state || '').toUpperCase() === String(row.state || '').toUpperCase());
    const csite = cprof?.website_url || cprof?._manual_website_url || cprof?.permitting_url;
    if (csite && csite !== site) {
      const ccrawl = await crawlSite(csite);
      if (ccrawl) {
        roles.push(...extract(ccrawl.pages, opts.wanted || null));
        for (const p of ccrawl.pdf) {
          if (roles.find((r) => r.role === p.role)) continue;
          roles.push({ role: p.role, office_name: `${row.parent_county_name} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: 'county-administered', delegation_quote: null, contact_info: {}, research_fields: {} });
        }
        for (const r of roles) r.service_area = r.service_area || `${row.parent_county_name} — county-administered for ${row.jurisdiction_name}`;
        if (roles.length) emit({ stage: 'office_res_step', address: label, step: true, detail: `local site empty → county site yielded ${roles.length} role(s)` });
      }
    }
  }
  if (!roles.length) { emit({ stage: 'office_res_review', address: label, ok: false, detail: `site found but no office evidence on ${crawl.crawled} page(s)` }); return { result: 'no_evidence', added: 0 }; }
  // MP-3.2 — application-form links attach to sign_permit (the filing the
  // user actually submits); first match wins, name from anchor text.
  const form = (crawl.forms || [])[0];
  if (form) {
    const sp = roles.find((r) => r.role === 'sign_permit') || roles[0];
    sp.research_fields = { ...(sp.research_fields || {}), application_form_url: form.url, application_form_name: (form.text || '').slice(0, 120) || 'application' };
  }

  // County-administered findings still belong on THIS profile — service_area
  // tags preserve provider identity and the verifier's county fallback reads
  // them. Writing them to `null` discarded the whole extraction (the old
  // countyFallback path produced zero research despite succeeding).
  const targetProfile = profile;
  const normalized = normalizeOfficeResearch({ roles }, { jurisdiction: { id: targetProfile?.id, name: row.jurisdiction_name, state: row.state, type: row.jurisdiction_type } });
  let out = normalized, added = normalized.roles.length;
  if (opts.merge && targetProfile) {
    const prev = targetProfile.office_research?.roles || [];
    const seen = new Set(prev.map(roleKey));
    const fresh = normalized.roles.filter((r) => !seen.has(roleKey(r)));
    added = fresh.length;
    out = { ...(targetProfile.office_research || {}), ...normalized, roles: [...prev, ...fresh] };
  }
  if (targetProfile?.id) {
    enqueue({ entity: 'JurisdictionProfile', op: 'update', id: targetProfile.id, data: { office_research: out }, mirror: `profiles-${String(targetProfile.state || row.state).toLowerCase()}`, note: `local research — ${label}` });
    mirrorApply(`profiles-${String(targetProfile.state || row.state).toLowerCase()}`, { id: targetProfile.id, office_research: out });
  }
  const covered = roles.length;
  if (opts.queueClose !== false) {
    enqueue({ entity: 'SourceCollectionQueue', op: 'update', id: row.id, data: { status: covered >= 3 ? 'sources_found' : 'partial_gaps', missing_next: covered >= 3 ? null : `local research — ${covered}/7 roles found; thin evidence${countyFallback ? ' (county-level)' : ''}` }, note: `research close — ${label}` });
    mirrorApply('queue', { id: row.id, status: covered >= 3 ? 'sources_found' : 'partial_gaps' });
  }
  emit({ stage: 'office_res_done', address: label, ok: true, detail: `LOCAL research — ${covered}/7 roles${opts.merge ? ` (+${added} new)` : ''}${countyFallback ? ' (county-administered)' : ''} from ${site} → ${covered >= 3 ? 'sources_found' : 'partial_gaps'}` });
  return { result: 'researched', added };
}

// ── Office fulfillment — when the research queue is dry, fill offices that
// have no reachable contact channel (1,463 of them measured). Crawls the
// jurisdiction's site for contact/directory blocks matching the office's
// name/type and fills EMPTY fields only — existing data is never touched.
const DEPT_KEY = [
  { re: /zoning/i, key: /zon/i },
  { re: /sign/i, key: /sign|permit|building|zoning/i },
  { re: /building/i, key: /build|code/i },
  { re: /electric/i, key: /electric/i },
  { re: /right|row|street|road|works|engineering/i, key: /works|street|road|engineering|utility/i },
  { re: /historic/i, key: /historic/i },
  { re: /planning/i, key: /plan/i },
];
const ADDR_RE = /\d{1,6}\s+[A-Z0-9][A-Za-z0-9. ]{3,60}(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Highway|Hwy|Court|Ct|Place|Pl|Way|Pike|Route|Rte)\b/i;
const HOURS_RE = /((mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*[-–—&to\s]+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?|daily|weekdays?)[^\n]{0,30}\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?|am|pm)\s*[-–—]+\s*\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?|am|pm)|hours?[^\n]{0,40}\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?|am|pm)/i;

function extractContacts(pages, office) {
  const typeStr = `${office?.office_type || ''} ${(office?.office_types || []).join(' ')} ${office?.name || ''}`;
  const want = DEPT_KEY.filter((d) => d.re.test(typeStr)).map((d) => d.key);
  let best = null;
  for (const p of pages) {
    for (const line of p.text.split('\n')) {
      const ph = line.match(PHONE_RE)?.[0], em = line.match(EMAIL_RE)?.[0], ad = line.match(ADDR_RE)?.[0], hr = line.match(HOURS_RE)?.[0];
      if (!ph && !em && !ad && !hr) continue;
      const score = (want.length && want.some((w) => w.test(line)) ? 3 : /department|office|permit|zoning|building|works|clerk|contact|administrator|hours/i.test(line) ? 1 : 0)
        + (ph ? 1 : 0) + (em ? 1 : 0) + (ad ? 1 : 0) + (hr ? 0.5 : 0);
      if (!best || score > best.score) best = { score, phone: ph, email: em, address: ad, hours: hr, url: p.url };
    }
    // mailto: links — a department page's mailto IS the office's email even
    // when the visible text says "Email us". Attach to dept-matching pages.
    const pageKey = (want.length && (want.some((w) => w.test(p.url)) || want.some((w) => w.test(p.text)))) || /contact|directory|department/i.test(p.url);
    if (pageKey && p.mailto?.length && (!best || !best.email)) {
      best = best || { score: 1 };
      best.email = best.email || p.mailto[0];
    }
  }
  return best;
}

async function fulfillPass(profiles) {
  const locs = getMirror('localities')?.rows || [];
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const CD = { filled: 24 * 3600 * 1000, none: 12 * 3600 * 1000, no_site: 24 * 3600 * 1000 };
  const targets = [];
  for (const l of locs) {
    for (const o of l.offices || []) {
      if (String(o.contact_phone || o.contact_email || o.contact_website || o.contact_address || '').trim()) continue;
      const c = claims[`ff-${o.id}`];
      if (c && Date.now() - new Date(c.at).getTime() < (CD[c.result] || CD.none)) continue;
      if (sliceOf(o.id || l.id) !== SLICE) continue;
      targets.push({ loc: l, office: o });
    }
  }
  if (!targets.length) return false;
  emit({ stage: 'office_fill_pass', detail: `${targets.length} office(s) missing all contact channels — fulfilling` });
  for (const t of targets.slice(0, 40)) {
    const { loc, office } = t;
    const label = `${office.name || 'office'} — ${loc.name}, ${loc.state}`;
    try {
      const profile = profById.get(loc.jurisdiction_profile_id);
      const { site } = await discoverSite({ name: String(loc.name || '').replace(/\s+(city|village|township|county)$/i, ''), state: loc.state, type: 'city', county: loc.parent_county_name, profile, profiles });
      let result = 'none';
      // Source order: the jurisdiction's own site first, then the parent
      // county — a county-administered provider's contacts live THERE, and
      // "looking in the wrong place" was the actual miss mode.
      const sites = [];
      if (site) sites.push(site);
      const cname = String(loc.parent_county_name || profile?.county_name || '').replace(/\s+county$/i, '');
      if (cname) {
        const cprof = profiles.find((p) => /county/i.test(String(p.type || '')) && String(p.name || '').toLowerCase().includes(cname.toLowerCase()) && String(p.state || '').toUpperCase() === String(loc.state || '').toUpperCase());
        const csite = cprof?.website_url || cprof?.permitting_url;
        if (csite && !sites.includes(csite)) sites.push(csite);
      }
      if (!sites.length) result = 'no_site';
      else {
        let best = null, bestSite = null;
        for (const s of sites) {
          const crawl = await crawlSite(s, { maxPages: 6 });
          if (!crawl) continue;
          const b = extractContacts(crawl.pages, office);
          if (b && (!best || b.score > best.score)) { best = b; bestSite = s; }
          if (best && (best.phone || best.email) && (best.address || best.hours)) break; // full hit — no need for county
        }
        if (best && (best.phone || best.email || best.address)) {
          const fill = {};
          if (!office.contact_phone && best.phone) fill.contact_phone = best.phone;
          if (!office.contact_email && best.email) fill.contact_email = best.email;
          if (!office.contact_address && best.address) fill.contact_address = best.address;
          if (!office.contact_website && best.url) fill.contact_website = best.url;
          if (!office.hours && best.hours) fill.hours = best.hours.slice(0, 120);
          if (Object.keys(fill).length) {
            const merged = loc.offices.map((o) => (o.id === office.id ? { ...o, ...fill } : o));
            enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices: merged }, mirror: 'localities', note: `office fulfill — ${label}` });
            mirrorApply('localities', { id: loc.id, offices: merged });
            emit({ stage: 'office_fill_done', address: label, ok: true, detail: `filled ${Object.keys(fill).join('+')}${bestSite && bestSite !== sites[0] ? ' (county site)' : ''}` });
            result = 'filled';
          }
        }
      }
      claims[`ff-${office.id}`] = { result, at: new Date().toISOString() };
      saveClaims();
    } catch (e) { emit({ stage: 'office_fill_error', address: label, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    await sleep(SLEEP);
  }
  return true;
}

// ── Verification gap targeting (§1E) — the verifier's office-state file
// records WHY each office stayed needs_verification; researchers chase
// those gaps directly instead of only draining the discovery queue.
const OFFICE_STATE = '.audit-work/verify-office-state.json';
const VERIFY_FIRST = '.audit-work/verify-first.jsonl';
const GAP_REASONS = new Set(['no_research', 'no_quote', 'no_role_match']);
const REVIEW_ATTEMPTS = 3; // held offices belong to a person, not this pass
// Cooldowns: a 'new' claim re-queues soon so the verifier re-judges fresh
// evidence; a 'none' claim cools 24h — re-crawling the same site the same
// week produces the same evidence.
export const GAP_CD = { new: 45 * 60e3, none: 24 * 3600e3 };
export function gapTargets(state, locs, slice, slices, claims, now = Date.now()) {
  const byLoc = new Map();
  for (const rec of Object.values(state?.offices || {})) {
    if (!rec || rec.status !== 'needs_verification') continue;
    if ((rec.attempts || 0) >= REVIEW_ATTEMPTS) continue;
    if (!(rec.reasons || []).some((r) => GAP_REASONS.has(r))) continue;
    const t = byLoc.get(rec.locality_id) || { count: 0, roles: new Set() };
    t.count++;
    for (const r of rec.missing_roles || []) t.roles.add(r);
    byLoc.set(rec.locality_id, t);
  }
  const locById = new Map((locs || []).map((l) => [l.id, l]));
  const out = [];
  for (const [locId, t] of byLoc) {
    if (sliceOf(locId) !== slice) continue;
    const c = claims[`gap-${locId}`];
    if (c && now - new Date(c.at).getTime() < (GAP_CD[c.result] ?? GAP_CD.none)) continue;
    const loc = locById.get(locId);
    if (!loc || loc.duplicate_of) continue;
    out.push({ locality_id: locId, loc, gap_offices: t.count, missing_roles: [...t.roles] });
  }
  out.sort((a, b) => b.gap_offices - a.gap_offices);
  return out;
}
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const readControl = () => readJSON('.audit-work/server-control.json', {});

async function gapPass(profiles, profById, budget = 8) {
  if (readControl().verification === false) return 0;
  const locs = getMirror('localities')?.rows || [];
  const state = readJSON(OFFICE_STATE, { offices: {} });
  const targets = gapTargets(state, locs, SLICE, SLICES, claims);
  if (!targets.length) return 0;
  emit({ stage: 'gap_target_pass', detail: `${targets.length} localities with verification gaps this slice` });
  let worked = 0;
  for (const t of targets.slice(0, budget)) {
    const { loc } = t;
    const label = `${loc.name}, ${loc.state}`;
    await waitWhilePaused(`local-res-${SLICE}`, { item: label });
    try {
      const profile = profById.get(loc.jurisdiction_profile_id);
      if (!profile || profile.verification_status === 'historical') {
        claims[`gap-${loc.id}`] = { result: 'none', at: new Date().toISOString() }; // profile gap belongs to relink/sweep
        saveClaims();
        continue;
      }
      const row = {
        id: `gap-${loc.id}`, jurisdiction_name: loc.name, state: loc.state,
        jurisdiction_type: loc.jurisdiction_type, parent_county_name: loc.parent_county_name || profile.parent_county?.name || profile.county_name,
        demand_weight: 10, // deep crawl — these localities block verification
      };
      emit({ stage: 'gap_target', address: label, detail: `${t.gap_offices} office(s) failing — missing ${t.missing_roles.join(', ') || 'research'}` });
      const { result, added } = await research(row, profile, profiles, { wanted: new Set(t.missing_roles), queueClose: false, merge: true });
      claims[`gap-${loc.id}`] = { result: added > 0 ? 'new' : 'none', result_detail: result, at: new Date().toISOString() };
      saveClaims();
      if (added > 0) {
        try { appendFileSync(VERIFY_FIRST, JSON.stringify({ name: loc.name, state: loc.state, at: Date.now() }) + '\n'); } catch {}
        emit({ stage: 'gap_target_done', address: label, ok: true, detail: `+${added} role evidence → verify-first` });
      }
      worked++;
    } catch (e) { emit({ stage: 'gap_target_error', address: label, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    await sleep(SLEEP);
  }
  return worked;
}

async function main() {
  emit({ stage: 'office_res_boot', address: 'local researcher', ok: true, start: true, detail: 'deterministic local research v2 — sitemap + PDF evidence + directory parse + county fallback · ZERO spend' });
  do {
    await waitWhilePaused(`local-res-${SLICE}`, { item: 'research pass' });
    const queue = getMirror('queue')?.rows || [];
    const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
    const profById = new Map(profiles.map((p) => [p.id, p]));
    // Verification gap targeting comes FIRST — unblocking needs_verification
    // offices outranks widening the discovery queue.
    await gapPass(profiles, profById).catch((e) => emit({ stage: 'gap_target_error', detail: String(e?.message || e).slice(0, 140) }));
    const base = (n) => String(n || '').toLowerCase().replace(/\s+(city|village|township|county)$/i, '').trim();
    const profileOf = (row) => profiles.find((p) => base(p.name) === base(row.jurisdiction_name) && String(p.state || '').toUpperCase() === String(row.state || '').toUpperCase());
    const NO_SITE_COOLDOWN = 12 * 60 * 60 * 1000;
    const pending = queue.filter((r) => {
      if (!['not_started', 'partial_gaps'].includes(String(r.status || ''))) return false;
      if (sliceOf(claimKey(r)) !== SLICE) return false;
      const c = claims[claimKey(r)];
      if (!c) return true;
      if (c.result === 'no_site' && Date.now() - new Date(c.at).getTime() > NO_SITE_COOLDOWN) return true;
      return false;
    });
    // MP-1.1 demand-first: jurisdictions with parked real addresses outrank
    // zero-demand rows (Cincinnati's 87 parked shouldn't wait behind villages
    // nobody asked about). Unstamped rows sort 0.
    pending.sort((a, b) => Number(b.demand_weight || 0) - Number(a.demand_weight || 0));
    if (!pending.length) {
      // Self-balancing: the research queue only holds ~500 rows total — when
      // it's dry, fulfill office contact records instead of idling.
      const didWork = await fulfillPass(profiles).catch(() => false);
      if (!didWork) {
        emit({ stage: 'office_res_idle', address: 'local researcher', ok: true, detail: 'queue empty · offices fulfilled — standing by' });
        if (ONCE) break;
        heartbeat(`local-res-${SLICE}`, 'idle', 'queue empty');
        await sleep(5 * 60 * 1000);
      }
      if (ONCE) break;
      continue;
    }
    for (const row of pending.slice(0, 200)) {
      await waitWhilePaused(`local-res-${SLICE}`, { item: row.jurisdiction_name });
      try {
        const { result } = await research(row, profileOf(row), profiles);
        claims[claimKey(row)] = { result, at: new Date().toISOString() };
        saveClaims();
      } catch (e) { emit({ stage: 'office_res_error', address: `${row.jurisdiction_name}, ${row.state}`, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
      await sleep(SLEEP);
    }
    if (ONCE) break;
  } while (true);
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch((e) => { emit({ stage: 'office_res_error', address: 'local researcher', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
