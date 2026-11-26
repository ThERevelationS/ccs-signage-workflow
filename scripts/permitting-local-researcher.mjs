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
import { fetchText, extract, crawlSite, discoverSite, PHONE_RE, EMAIL_RE, PAGE_KEY, DIR_KEY, wikidataSite, domainGuesses } from './lib/office-research.mjs';
import { pdfPages } from './lib/pdf-extract.mjs';
import { rosterContact } from './lib/office-research.mjs';
import { regionalProvidersFor } from '../base44/shared/regionalProviders.mjs';
import { waitWhilePaused, heartbeat } from './lib/server-control.mjs';
import { claim, releaseClaim, claimedIds, readCooldowns, readCooldown, writeCooldown, migrateSliceClaims, publishTargets, tiersDone, nextTierFor, tierExhausted, TIER_CD, GAP_TIERS } from './lib/research-claims.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
// Dynamic work-claim model: workers are interchangeable `local-res-<id>`
// instances; claims+cooldowns are shared files, no fixed slicing.
const ID = Number(arg('--id', arg('--slice', 0)));
const WORKER = `local-res-${ID}`;
const EVENTS = '.live-events.jsonl';
const SLEEP = Number(arg('--sleep', 1200));
const PAGE_SLEEP = Number(arg('--page-sleep', 300));
const MAX_PAGES = Number(arg('--max-pages', 9));
const ONCE = args.includes('--once');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: WORKER, ...e }) + '\n', { flag: 'a' }); } catch {} };

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
  const deep = opts.deep ?? (Number(row.demand_weight || 0) >= 10 || /city/i.test(String(row.jurisdiction_type || '')));
  const crawl = await crawlSite(site, { maxPages: opts.maxPages || (deep ? 15 : 9), deep });
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

// Fulfill candidates for the whole fleet — claimable means not in cooldown
// and not currently claimed by another researcher.
export function fulfillCandidates(locs, cooldowns, now = Date.now()) {
  const CD = { filled: 24 * 3600 * 1000, none: 12 * 3600 * 1000, no_site: 24 * 3600 * 1000 };
  const targets = [];
  for (const l of locs || []) {
    if (l?.duplicate_of) continue;
    for (const o of l.offices || []) {
      if (String(o.contact_phone || o.contact_email || o.contact_website || o.contact_address || '').trim()) continue;
      const c = cooldowns[`ff-${o.id}`];
      if (c && now - new Date(c.at).getTime() < (CD[c.result] || CD.none)) continue;
      targets.push({ loc: l, office: o });
    }
  }
  return targets;
}

async function fulfillPass(profiles, cooldowns, claimed) {
  const locs = getMirror('localities')?.rows || [];
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const targets = fulfillCandidates(locs, cooldowns);
  if (!targets.length) return false;
  emit({ stage: 'office_fill_pass', detail: `${targets.length} office(s) missing all contact channels — fulfilling` });
  let worked = 0;
  for (const t of targets.slice(0, 40)) {
    const { loc, office } = t;
    const label = `${office.name || 'office'} — ${loc.name}, ${loc.state}`;
    const key = `ff-${office.id}`;
    if (claimed.has(key) || !claim(key, WORKER)) continue;
    worked++;
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
      writeCooldown(`ff-${office.id}`, { result });
    } catch (e) { emit({ stage: 'office_fill_error', address: label, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    finally { releaseClaim(`ff-${office.id}`); }
    await sleep(SLEEP);
  }
  return worked > 0;
}

// ── Verification gap targeting (§1E) — the verifier's office-state file
// records WHY each office stayed needs_verification; researchers chase
// those gaps directly instead of only draining the discovery queue.
//
// Escalating tiers per locality, recorded in the shared cooldown store:
//   T1 standard crawl → T2 deep crawl (full sitemap, ~40 pages, linked PDFs,
//   directories, /?s= search pages, municipal code host) → T3 county official
//   site + state/regional providers aimed at the missing roles → T4 alternate
//   official domains (past source URLs, Wikidata, domain guesses).
// TIER_CD (2h) sits between tiers; all four tried with no better evidence =
// exhausted → the verifier's needs_review ("a person needs to look").
const OFFICE_STATE = '.audit-work/verify-office-state.json';
const VERIFY_FIRST = '.audit-work/verify-first.jsonl';
export const REVIEW_ATTEMPTS = 20; // strikes before an office needs a person (AND all tiers tried)
// Every non-terminal gap reason is chaseable; non_permit_body is a correct
// rejection, never a research target.
export const RESEARCHABLE_REASONS = new Set(['no_research', 'no_quote', 'no_role_match', 'unofficial_source', 'county_scope', 'other']);
const TIER_LABEL = { 1: 'Crawling', 2: 'Deep crawl of', 3: 'County & regional search for', 4: 'Trying alternate official sites for' };
export const GAP_CD = { new: TIER_CD, none: TIER_CD }; // legacy name — uniform 2h between tiers

// Scan the office-state file into per-locality research targets. Returns
// { targets, cooling, nextRelease, exhausted }: `targets` are claimable now,
// `cooling` have unclaimed tiers but are inside TIER_CD (sorted least-recently-
// tried first — the no-idle fallback draws from them), `exhausted` have run
// all tiers (needs_review territory). Held offices re-enter at their next
// untried tier — existing attempts count as T1 done.
export function gapTargetScan(state, locs, cooldowns, now = Date.now()) {
  // Live office keys — records for renamed/soft-retired offices are dead
  // weight and must not spawn research targets.
  const live = new Set();
  for (const l of locs || []) {
    if (l?.duplicate_of) continue;
    for (const o of l.offices || []) live.add(`${l.id}:${o.id || o.name}`);
  }
  const byLoc = new Map();
  for (const [key, rec] of Object.entries(state?.offices || {})) {
    if (!rec || rec.status !== 'needs_verification' || !live.has(key)) continue;
    const reasons = rec.reasons || [];
    if (reasons.includes('non_permit_body')) continue;
    if (!reasons.some((r) => RESEARCHABLE_REASONS.has(r))) continue;
    const t = byLoc.get(rec.locality_id) || { count: 0, roles: new Set(), reasons: new Set(), attempts: 0 };
    t.count++;
    for (const r of rec.missing_roles || []) t.roles.add(r);
    for (const r of reasons) if (RESEARCHABLE_REASONS.has(r)) t.reasons.add(r);
    t.attempts = Math.max(t.attempts, rec.attempts || 0);
    byLoc.set(rec.locality_id, t);
  }
  const locById = new Map((locs || []).map((l) => [l.id, l]));
  const targets = [], cooling = [], exhausted = [];
  let nextRelease = null;
  for (const [locId, t] of byLoc) {
    const loc = locById.get(locId);
    if (!loc || loc.duplicate_of) continue;
    const cd = cooldowns[`gap-${locId}`];
    const tier = nextTierFor(cd, t.attempts > 0);
    if (tier == null) { exhausted.push(locId); continue; }
    const release = cd?.at ? new Date(cd.at).getTime() + TIER_CD : 0;
    const target = { locality_id: locId, loc, gap_offices: t.count, missing_roles: [...t.roles], reasons: [...t.reasons], tier, attempts: t.attempts, last_try: cd?.at || null };
    if (release > now) {
      target.release = release;
      cooling.push(target);
      if (nextRelease == null || release < nextRelease) nextRelease = release;
    } else targets.push(target);
  }
  targets.sort((a, b) => b.gap_offices - a.gap_offices || a.tier - b.tier);
  cooling.sort((a, b) => String(a.last_try || '').localeCompare(String(b.last_try || '')) || a.tier - b.tier);
  return { targets, cooling, nextRelease, exhausted };
}
export function gapTargets(state, locs, cooldowns, now = Date.now()) {
  return gapTargetScan(state, locs, cooldowns, now).targets;
}
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const readControl = () => readJSON('.audit-work/server-control.json', {});

// Shared write tail for T3/T4 — normalize the extracted roles, union them
// into the profile's existing office_research (never drop evidence), enqueue.
function finishRoles(row, profile, roles, label, tag) {
  if (!roles.length) { emit({ stage: 'office_res_review', address: label, ok: false, detail: `${tag} — no office evidence` }); return { result: 'no_evidence', added: 0 }; }
  const normalized = normalizeOfficeResearch({ roles }, { jurisdiction: { id: profile?.id, name: row.jurisdiction_name, state: row.state, type: row.jurisdiction_type } });
  const prev = profile.office_research?.roles || [];
  const seen = new Set(prev.map(roleKey));
  const fresh = normalized.roles.filter((r) => !seen.has(roleKey(r)));
  const out = { ...(profile.office_research || {}), ...normalized, roles: [...prev, ...fresh] };
  enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: out }, mirror: `profiles-${String(profile.state || row.state).toLowerCase()}`, note: `local research — ${label}` });
  mirrorApply(`profiles-${String(profile.state || row.state).toLowerCase()}`, { id: profile.id, office_research: out });
  emit({ stage: 'office_res_done', address: label, ok: true, detail: `${tag} — +${fresh.length} new role evidence (${normalized.roles.length} extracted)` });
  return { result: 'researched', added: fresh.length };
}

// County-scope coverage statement — the verifier's county_scope guard reads
// service_area / delegation_quote for these words; find the real sentence.
const SCOPE_OK = /unincorporated|township|outside.{0,30}(city|village|incorporat|municipal)|rural|county.?wide|all areas|entire county/i;
function scopeSentence(text) {
  for (const m of String(text || '').matchAll(/[^\n.]{10,240}(unincorporated|township|outside[^\n.]{0,30}(city|village|incorporat|municipal)|rural|county.?wide|entire county|all areas)[^\n.]{0,160}\.?/gi)) {
    const s = m[0].trim();
    if (s.length >= 40) return s.slice(0, 300);
  }
  return null;
}

// T3 — county official site + state/regional providers (regionalProvidersFor),
// extraction aimed at the missing roles; county_scope targets also hunt the
// coverage sentence on the county's own pages.
async function countyRegionalResearch(row, profile, profiles, wanted, t) {
  const label = `${row.jurisdiction_name}, ${row.state}`;
  if (!profile?.id) return { result: 'no_site', added: 0 };
  const county = String(row.parent_county_name || '').replace(/\s+county$/i, '');
  const cprof = county && (profiles || []).find((p) => /county/i.test(String(p.type || '')) && String(p.name || '').toLowerCase().includes(county.toLowerCase()) && String(p.state || '').toUpperCase() === String(row.state || '').toUpperCase());
  const sites = [];
  const csite = cprof?.website_url || cprof?._manual_website_url || cprof?.permitting_url || cprof?._manual_permitting_url;
  if (csite) sites.push({ url: csite, kind: 'county' });
  for (const rp of regionalProvidersFor(row.parent_county_name, row.state)) {
    if (rp?.evidence_url) sites.push({ url: rp.evidence_url, kind: `regional ${rp.name}` });
  }
  if (!sites.length) { emit({ stage: 'office_res_review', address: label, ok: false, detail: 'T3 — no county site or regional provider to try' }); return { result: 'no_site', added: 0 }; }
  const scopeNeed = (t.reasons || []).includes('county_scope');
  const roles = [];
  for (const s of sites.slice(0, 4)) {
    const crawl = await crawlSite(s.url, { maxPages: s.kind === 'county' ? 15 : 8, deep: s.kind === 'county' }).catch(() => null);
    if (!crawl) continue;
    const got = extract([...crawl.pages, ...await pdfPages(crawl.pdf)], wanted);
    for (const p of crawl.pdf) {
      if (got.find((r) => r.role === p.role)) continue;
      got.push({ role: p.role, office_name: `${row.parent_county_name || 'county'} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: 'county-administered', delegation_quote: null, contact_info: {}, research_fields: {} });
    }
    const scope = scopeNeed && scopeSentence(crawl.pages.map((p) => p.text).join('\n'));
    for (const r of got) {
      r.service_area = r.service_area || `${row.parent_county_name} — county-administered for ${row.jurisdiction_name}`;
      if (scope) { r.delegation_quote = r.delegation_quote || scope; r.service_area = scope; }
    }
    roles.push(...got);
    emit({ stage: 'office_res_step', address: label, step: true, detail: `T3 ${s.kind} ${s.url} → ${got.length} role(s)${scope ? ' + coverage statement' : ''}` });
  }
  return finishRoles(row, profile, roles, label, 'T3');
}

// T4 — alternate official domains: source URLs already on identity-equal
// profiles, the Wikidata official website, .gov/.us domain variants not yet
// crawled. The known site's host is skipped — T1/T2 covered it.
async function altSiteResearch(row, profile, profiles, wanted) {
  const label = `${row.jurisdiction_name}, ${row.state}`;
  if (!profile?.id) return { result: 'no_site', added: 0 };
  const host = (u) => { try { return new URL(u).host.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
  const base = (n) => String(n || '').toLowerCase().replace(/\s+(city|village|township|county|of)$/i, '').replace(/^(city|village|township)\s+(of\s+)?/i, '').trim();
  const eq = (profiles || []).filter((p) => p.id !== profile.id && base(p.name) === base(row.jurisdiction_name) && String(p.state || '').toUpperCase() === String(row.state || '').toUpperCase());
  const tried = new Set();
  for (const p of [profile, ...eq]) {
    for (const u of [p?.website_url, p?._manual_website_url, p?.permitting_url, p?._manual_permitting_url]) { const h = host(u); if (h) tried.add(h); }
  }
  const candidates = new Map();
  const add = (u) => { const h = host(u); if (h && !tried.has(h) && !candidates.has(h)) { try { const o = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); candidates.set(h, `${o.protocol}//${o.host}`); } catch {} } };
  for (const p of [profile, ...eq]) for (const r of p?.office_research?.roles || []) add(r?.official_source_url);
  add(await wikidataSite(`${row.jurisdiction_name} ${row.jurisdiction_type === 'county' ? 'County' : ''}`.trim(), row.state === 'OH' ? 'Ohio' : 'Kentucky').catch(() => null));
  for (const g of domainGuesses(row.jurisdiction_name, row.state, row.jurisdiction_type, row.parent_county_name)) add(g);
  const roles = [];
  for (const [h, u] of [...candidates].slice(0, 3)) {
    const crawl = await crawlSite(u, { maxPages: 8 }).catch(() => null);
    if (!crawl) continue;
    const got = extract([...crawl.pages, ...await pdfPages(crawl.pdf)], wanted);
    for (const p of crawl.pdf) {
      if (got.find((r) => r.role === p.role)) continue;
      got.push({ role: p.role, office_name: `${row.jurisdiction_name} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: null, delegation_quote: null, contact_info: {}, research_fields: {} });
    }
    roles.push(...got);
    emit({ stage: 'office_res_step', address: label, step: true, detail: `T4 ${h} → ${got.length} role(s)` });
  }
  if (!candidates.size) { emit({ stage: 'office_res_review', address: label, ok: false, detail: 'T4 — no alternate official domains left to try' }); return { result: 'no_site', added: 0 }; }
  return finishRoles(row, profile, roles, label, 'T4');
}

// Dispatch a claimed gap target to its next untried tier.
async function tierResearch(t, profile, profiles) {
  const { loc, tier } = t;
  const wanted = new Set(t.missing_roles || []);
  const row = {
    id: `gap-${loc.id}`, jurisdiction_name: loc.name, state: loc.state,
    jurisdiction_type: loc.jurisdiction_type,
    parent_county_name: loc.parent_county_name || profile?.parent_county?.name || profile?.county_name,
    demand_weight: 10,
  };
  if (tier <= 2) return research(row, profile, profiles, { wanted, queueClose: false, merge: true, maxPages: tier === 2 ? 40 : 9, deep: tier === 2 });
  if (tier === 3) return countyRegionalResearch(row, profile, profiles, wanted, t);
  return altSiteResearch(row, profile, profiles, wanted);
}

async function gapPass(profiles, profById, cooldowns, claimed, budget = 8) {
  if (readControl().verification === false) return 0;
  const locs = getMirror('localities')?.rows || [];
  const state = readJSON(OFFICE_STATE, { offices: {} });
  const scan = gapTargetScan(state, locs, cooldowns);
  let open = scan.targets.filter((t) => !claimed.has(`gap-${t.locality_id}`));
  let relaxed = false;
  if (!open.length && scan.cooling.length) {
    // Never idle while unverified, non-exhausted offices remain: ignore the
    // inter-tier cooldown and take the least-recently-tried locality.
    open = scan.cooling.filter((t) => !claimed.has(`gap-${t.locality_id}`));
    relaxed = open.length > 0;
  }
  if (!open.length) return 0;
  emit({ stage: 'gap_target_pass', detail: `${scan.targets.length + scan.cooling.length} localities with verification gaps (${open.length} unclaimed${relaxed ? ', cooldown relaxed' : ''}) · ${scan.exhausted.length} exhausted` });
  let worked = 0;
  for (const t of open) {
    if (worked >= budget) break;
    const { loc } = t;
    const label = `${loc.name}, ${loc.state}`;
    const key = `gap-${loc.id}`;
    if (!claim(key, WORKER)) continue;
    await waitWhilePaused(WORKER, { item: `${TIER_LABEL[t.tier] || 'Researching'} ${label} — ${t.missing_roles.slice(0, 3).join(', ') || 'evidence'}` });
    try {
      // The pass's cooldown snapshot is seconds-to-minutes stale — a
      // fleet-mate may have finished this exact tier meanwhile. Re-read the
      // store under the claim: skip if the planned tier is no longer the
      // next untried one, or if a fresh cooldown landed (relaxed passes
      // skip the cooldown check by design).
      const freshCd = readCooldown(key);
      if (nextTierFor(freshCd, t.attempts > 0) !== t.tier) continue;
      if (!relaxed && freshCd?.at && Date.now() - new Date(freshCd.at).getTime() < TIER_CD) continue;
      const profile = profById.get(loc.jurisdiction_profile_id);
      if (!profile || profile.verification_status === 'historical') {
        // Profile gap belongs to relink/sweep — mark the tier done so the
        // locality can still exhaust instead of re-claiming forever.
        const prev = tiersDone(readCooldown(key), t.attempts > 0);
        writeCooldown(key, { result: 'none', tier: t.tier, tiers: [...prev, t.tier], result_detail: 'no_profile' });
        continue;
      }
      emit({ stage: 'gap_target', address: label, detail: `T${t.tier} — ${t.gap_offices} office(s) failing (${[...new Set(t.reasons)].join(', ')}) — missing ${t.missing_roles.join(', ') || 'research'}` });
      const { result, added } = await tierResearch(t, profile, profiles);
      const prev = tiersDone(readCooldown(key), t.attempts > 0);
      const tiers = [...new Set([...prev, t.tier])];
      writeCooldown(key, { result: added > 0 ? 'new' : 'none', tier: t.tier, tiers, result_detail: result, exhausted: tiers.length >= GAP_TIERS });
      // The checker re-judges after every tier — new evidence promotes fast,
      // and the attempt stays spaced by the verifier's own clock either way.
      try { appendFileSync(VERIFY_FIRST, JSON.stringify({ name: loc.name, state: loc.state, at: Date.now(), tier: t.tier, result }) + '\n'); } catch {}
      emit({ stage: 'gap_target_done', address: label, ok: added > 0, detail: `T${t.tier} ${result}${added > 0 ? ` +${added} role evidence` : ''}${tiers.length >= GAP_TIERS ? ' — all tiers tried' : ''} → verify-first` });
      worked++;
    } catch (e) { emit({ stage: 'gap_target_error', address: label, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    finally { releaseClaim(key); }
    await sleep(SLEEP);
  }
  return worked;
}

async function main() {
  const migrated = migrateSliceClaims();
  emit({ stage: 'office_res_boot', address: 'local researcher', ok: true, start: true, detail: `deterministic local research v2 — sitemap + PDF evidence + directory parse + county fallback · ZERO spend · shared claims${migrated ? ` (migrated ${migrated} slice cooldowns)` : ''}` });
  do {
    await waitWhilePaused(WORKER, { item: 'research pass' });
    const queue = getMirror('queue')?.rows || [];
    const profiles = [...(getMirror('profiles-oh.slim')?.rows || []), ...(getMirror('profiles-ky.slim')?.rows || [])];
    const profById = new Map(profiles.map((p) => [p.id, p]));
    const cooldowns = readCooldowns();
    const claimed = claimedIds();
    const locs = getMirror('localities')?.rows || [];
    const NO_SITE_COOLDOWN = 12 * 60 * 60 * 1000;
    // Queue candidates the same order the fleet drains them — gap targets
    // first, then queue rows by demand, then office fulfillment.
    const state = readJSON(OFFICE_STATE, { offices: {} });
    const gapScan = gapTargetScan(state, locs, cooldowns);
    // Cooling targets are still work — the no-idle fallback claims them —
    // so the controller's work gate counts targets + cooling, not just
    // ready-now targets.
    const gapOpen = [...gapScan.targets, ...gapScan.cooling].filter((t) => !claimed.has(`gap-${t.locality_id}`)).length;
    const queueOpen = queue.filter((r) => {
      if (!['not_started', 'partial_gaps'].includes(String(r.status || ''))) return false;
      const c = cooldowns[claimKey(r)];
      if (c && !(c.result === 'no_site' && Date.now() - new Date(c.at).getTime() > NO_SITE_COOLDOWN)) return false;
      return true;
    }).filter((r) => !claimed.has(claimKey(r))).length;
    const fulfillOpen = fulfillCandidates(locs, cooldowns).filter((t) => !claimed.has(`ff-${t.office.id}`)).length;
    const byTier = {};
    for (const t of [...gapScan.targets, ...gapScan.cooling]) byTier[t.tier] = (byTier[t.tier] || 0) + 1;
    publishTargets({ gap: gapOpen, queue: queueOpen, fulfill: fulfillOpen, cooling: gapScan.cooling.length, exhausted: gapScan.exhausted.length, next_release: gapScan.nextRelease ? new Date(gapScan.nextRelease).toISOString() : null, tiers: byTier });
    // Verification gap targeting comes FIRST — unblocking needs_verification
    // offices outranks widening the discovery queue.
    await gapPass(profiles, profById, cooldowns, claimed).catch((e) => emit({ stage: 'gap_target_error', detail: String(e?.message || e).slice(0, 140) }));
    const base = (n) => String(n || '').toLowerCase().replace(/\s+(city|village|township|county)$/i, '').trim();
    const profileOf = (row) => profiles.find((p) => base(p.name) === base(row.jurisdiction_name) && String(p.state || '').toUpperCase() === String(row.state || '').toUpperCase());
    const pending = queue.filter((r) => {
      if (!['not_started', 'partial_gaps'].includes(String(r.status || ''))) return false;
      const c = cooldowns[claimKey(r)];
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
      const didWork = await fulfillPass(profiles, cooldowns, claimed).catch(() => false);
      if (!didWork) {
        emit({ stage: 'office_res_idle', address: 'local researcher', ok: true, detail: 'queue empty · offices fulfilled — standing by' });
        if (ONCE) break;
        heartbeat(WORKER, 'idle', 'no work');
        await sleep(5 * 60 * 1000);
      }
      if (ONCE) break;
      continue;
    }
    let worked = 0;
    for (const row of pending) {
      if (worked >= 200) break;
      const key = claimKey(row);
      if (!claim(key, WORKER)) continue;
      await waitWhilePaused(WORKER, { item: row.jurisdiction_name });
      try {
        const { result } = await research(row, profileOf(row), profiles);
        writeCooldown(key, { result });
        worked++;
      } catch (e) { emit({ stage: 'office_res_error', address: `${row.jurisdiction_name}, ${row.state}`, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
      finally { releaseClaim(key); }
      await sleep(SLEEP);
    }
    // Everything pending is claimed by fleet-mates — wait out their work
    // instead of spinning on the claims directory.
    if (!worked && !ONCE) { heartbeat(WORKER, 'idle', 'work claimed'); await sleep(30000); }
    if (ONCE) break;
  } while (true);
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch((e) => { emit({ stage: 'office_res_error', address: 'local researcher', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
