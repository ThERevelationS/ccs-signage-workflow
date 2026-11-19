#!/usr/bin/env node
// Gap-driven re-research worker — the loop-closer. The authority verifier
// writes auto_verification_gaps ("zoning:no_official_source",
// "sign_permit:no_responsibility_quote", "research_denied") on offices it
// can't promote. Previously those gaps were a dead end — the office sat
// needs_verification forever. This worker turns the gap list back into a
// work queue: re-crawl the jurisdiction's site biased toward the FAILING
// role's pages, extract targeted evidence, merge best-of entries into the
// profile's office_research, and let the verifier re-judge on its next pass.
//
// Second work source (research refresh): profiles whose office_research has
// no potentially_applicable sign_permit or zoning entry get a full re-crawl
// with the v2 engine — many were researched under the weak v1 extractor.
//
// Usage: node scripts/permitting-gap-researcher.mjs [--slice i --slices n] [--once]
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { fetchText, extract, crawlSite, discoverSite, pdfEvidence, mergeRoles, evidenceGood as good, ROLE_RULES, stripHtml, sleep } from './lib/office-research.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SLICE = Number(arg('--slice', 0));
const SLICES = Number(arg('--slices', 1));
const sliceOf = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SLICES; };
const EVENTS = '.live-events.jsonl';
const SLEEP = Number(arg('--sleep', 1200));
const MAX_PAGES = Number(arg('--max-pages', 8));
const ONCE = args.includes('--once');
const CLAIMS_FILE = `.audit-work/gap-research-claims-${SLICE}.json`;
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `gap-res-${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };

let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS_FILE, JSON.stringify(claims)); } catch {} };
// Tier-escalating claims — "keep going until information is found". Each miss
// bumps `misses`; the tier (min(misses,4)) picks deeper source classes AND a
// longer cooldown. `enriched` resets to tier 0. Nothing ever parks — tier-4
// "dark" profiles keep retrying on the longest cooldown.
const TIER_CD = [12, 24, 36, 48, 72].map((h) => h * 3600 * 1000);
const claimCd = (c) => (c?.result === 'enriched' ? 30 * 60 * 1000 : TIER_CD[Math.min(c?.misses || 0, 4)] || TIER_CD[1]);
const claimed = (k) => { const c = claims[k]; return c && Date.now() - new Date(c.at).getTime() < claimCd(c); };
// Global claim view: every slice's claim file is public — lets an idle slice
// steal genuinely-unclaimed work instead of sitting on an exhausted partition.
const claimedAny = (k) => {
  if (claimed(k)) return true;
  for (let s = 0; s < SLICES; s++) {
    if (s === SLICE) continue;
    try {
      const c = JSON.parse(readFileSync(`.audit-work/gap-research-claims-${s}.json`, 'utf8'))[k];
      if (c && Date.now() - new Date(c.at).getTime() < claimCd(c)) return true;
    } catch {}
  }
  return false;
};
const VERIFY_FEED = '.audit-work/verify-first.jsonl';
const feedVerify = (loc, profile) => {
  try {
    const name = loc?.name || profile?.name, state = loc?.state || profile?.state;
    if (!name) return;
    writeFileSync(VERIFY_FEED, JSON.stringify({ name, state, at: Date.now() }) + '\n', { flag: 'a' });
  } catch {}
};

const ROLE_URLKEY = Object.fromEntries(ROLE_RULES.map((r) => [r.role, r.urlKey]));
const APPL = /potentially_applicable|applicable|confirmed/i;

async function workProfile(profile, wanted, ctx) {
  const label = `${profile.name}, ${profile.state}`;
  const { site, countyFallback } = await discoverSite({
    name: String(profile.name || '').replace(/\s+(city|village|township|county)$/i, ''),
    state: profile.state, type: profile.type, county: profile.county_name || ctx?.parent_county_name,
    profile, profiles: ctx?.profiles || [],
  });
  // Sources, in order: the jurisdiction's own site, then the parent county's.
  // Electrical inspection, ROW on county roads, and zoning in unincorporated
  // areas live on the COUNTY site — the "no better evidence" misses were
  // looking in the wrong place, not at missing data.
  const countyName = String(profile.county_name || profile.parent_county?.name || ctx?.loc?.parent_county_name || '').replace(/\s+county$/i, '');
  const cprof = countyName && (ctx?.profiles || []).find((p) => /county/i.test(String(p.type || '')) && String(p.name || '').toLowerCase().includes(countyName.toLowerCase()) && String(p.state || '').toUpperCase() === String(profile.state || '').toUpperCase());
  const csite = cprof?.website_url || cprof?._manual_website_url || cprof?.permitting_url;
  const sources = [];
  if (site) sources.push({ url: site, county: !!countyFallback });
  if (csite && csite !== site && !countyFallback) sources.push({ url: csite, county: true });
  // Ladder tier from this profile's miss history — t0 shallow, t1+ deep crawl
  // (24p + minutes/agendas/fees/ordinance links), t3+ also scans crawled county
  // pages for the jurisdiction BY NAME (county-doc evidence).
  const tier = Math.min(claims[`gap-${profile.id}`]?.misses || 0, 4);
  const deep = tier >= 1;
  const maxPages = tier >= 1 ? 24 : MAX_PAGES;
  // Site-less townships/villages are NOT parked: their county's site almost
  // always hosts the permitting evidence (township zoning is frequently
  // county-administered). Park only when neither source exists.
  if (!sources.length) { emit({ stage: 'gap_res_review', address: label, ok: false, detail: 'no official site on gap re-research' }); return 'no_site'; }
  // Bias the crawl to the failing role's page keywords when we know them.
  const roleKey = wanted && wanted.size === 1 ? ROLE_URLKEY[[...wanted][0]] : null;
  const roles = [];
  let crawled = 0, usedCounty = false;
  for (const src of sources) {
    const crawl = await crawlSite(src.url, { maxPages, roleKey, deep });
    if (!crawl) continue;
    crawled += crawl.crawled;
    const got = extract(crawl.pages, wanted);
    for (const p of pdfEvidence(crawl.links || [])) {
      if (wanted && !wanted.has(p.role)) continue;
      if (got.find((r) => r.role === p.role)) continue;
      got.push({ role: p.role, office_name: src.county ? `${profile.county_name || countyName} offices` : `${profile.name} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: src.county ? 'county-administered' : null, delegation_quote: null, contact_info: {}, research_fields: {} });
    }
    if (src.county) { for (const r of got) r.service_area = r.service_area || `${profile.county_name || countyName} — county-administered for ${profile.name}`; usedCounty = usedCounty || got.length > 0; }
    // Tier-3 county-doc scan — a county page naming THIS jurisdiction with
    // permitting language is real evidence ("X Township zoning administered by
    // County Planning"). The matched sentence becomes the responsibility quote;
    // verifier's county-scope guard still applies on township profiles.
    if (src.county && tier >= 3) {
      const bare = String(profile.name || '').replace(/\s+(township|city|village|county)$/i, '');
      if (bare.length >= 4) {
        const nameRe = new RegExp(`[^.\\n]{0,160}\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(township|city|village)?[^.\\n]{0,200}`, 'i');
        for (const p of crawl.pages || []) {
          const hit = String(p.text || '').match(nameRe);
          if (!hit || !/zoning|permit|building|inspection|code enforcement|planning/i.test(hit[0])) continue;
          const quote = hit[0].trim().replace(/\s+/g, ' ').slice(0, 400);
          const role = /zoning/i.test(quote) ? 'zoning' : /sign/i.test(quote) ? 'sign_permit' : /electric/i.test(quote) ? 'electrical' : 'building';
          if (got.find((r) => r.role === role)) continue;
          got.push({ role, office_name: `${countyName} County offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: quote, service_area: `${countyName} County — county-administered for ${profile.name}`, delegation_quote: null, contact_info: {}, research_fields: {} });
          break; // one named hit per role-family per pass is enough signal
        }
      }
    }
    roles.push(...got);
    if (wanted && wanted.size && roles.some((r) => wanted.has(r.role))) break; // got what we came for
  }
  const existing = profile.office_research?.roles || [];
  const { roles: merged, improved } = mergeRoles(existing, roles);
  if (!improved) { emit({ stage: 'gap_res_miss', address: label, ok: false, detail: `t${tier} · re-crawled ${crawled}p${sources.length > 1 ? ' (local+county)' : ''} — no better evidence for ${wanted ? [...wanted].join('+') : 'any role'}` }); return 'no_improvement'; }
  const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: profile.id, name: profile.name, state: profile.state, type: profile.type } });
  enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: normalized }, mirror: `profiles-${String(profile.state || '').toLowerCase()}`, note: `gap re-research — ${label}` });
  mirrorApply(`profiles-${String(profile.state || '').toLowerCase()}`, { id: profile.id, office_research: normalized });
  emit({ stage: 'gap_res_done', address: label, ok: true, detail: `enriched ${improved} role(s)${usedCounty ? ' via COUNTY site' : ''}: ${wanted ? [...wanted].join('+') : 'full'} → verifier re-judges next pass` });
  feedVerify(ctx?.loc, profile);
  return 'enriched';
}

async function pass() {
  const locs = getMirror('localities')?.rows || [];
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const work = new Map(); // profileId -> {profile, wanted:Set, label}
  // Source 1 — verifier gaps on needs_verification offices.
  for (const l of locs) {
    const prof = profById.get(l.jurisdiction_profile_id); if (!prof) continue;
    for (const o of l.offices || []) {
      if (o?.authority_verification_status !== 'needs_verification') continue;
      for (const g of o.auto_verification_gaps || []) {
        const role = String(typeof g === 'string' ? g : g?.role || '').split(':')[0];
        if (!role || g === 'research_denied') continue;
        const k = prof.id;
        if (!work.has(k)) work.set(k, { profile: prof, wanted: new Set(), loc: l });
        work.get(k).wanted.add(role);
      }
    }
  }
  // Source 2 — thin profiles: research exists but no applicable sign/zoning
  // entry at all (v1 extraction era). Full re-crawl — every role welcome.
  for (const p of profiles) {
    const roles = p.office_research?.roles || [];
    if (!roles.length) continue; // no research — queue/researcher owns it
    const has = (r) => roles.some((e) => e.role === r && APPL.test(String(e.applicability)));
    if (has('sign_permit') && has('zoning')) continue;
    if (!work.has(p.id)) work.set(p.id, { profile: p, wanted: null, loc: null });
  }
  let queue = [...work.values()].filter((w) => sliceOf(w.profile.id) === SLICE && !claimed(`gap-${w.profile.id}`));
  let stealing = false;
  if (!queue.length) {
    // Own partition exhausted (claims or cooldowns) — steal genuinely-unclaimed
    // work from the shared pool so the slice never idles while the pool is deep.
    queue = [...work.values()].filter((w) => !claimedAny(`gap-${w.profile.id}`));
    stealing = true;
  }
  // Closest-first: a jurisdiction ONE verified role from apply-ready yields a
  // full unlock per enrichment; one missing both needs two passes. Sort
  // 1-away localities ahead so each worker-hour buys the most apply-ready.
  const sv = (l, r) => (l?.offices || []).some((o) => o?.authority_verification_status === 'staff_verified' && (o?.authority_roles || []).includes(r));
  const locByProf = new Map(locs.map((l) => [l.jurisdiction_profile_id, l]));
  const away = (w) => {
    const l = w.loc || locByProf.get(w.profile.id);
    if (!l) return 3;
    return 2 - Number(sv(l, 'sign_permit')) - Number(sv(l, 'zoning'));
  };
  // Rank for apply-ready YIELD: away=1 is one enrichment from a full unlock
  // (+1 ready); county profiles are multipliers — one entry propagates to N
  // sibling townships via county-prop; away=2 needs two unlocks; away=0 is
  // already ready (gaps are completeness polish, +0 to the count).
  const isCounty = (w) => /county/i.test(String(w.profile.type || '')) || /county$/i.test(String(w.profile.jurisdiction_name || w.profile.name || ''));
  const rank = (w) => {
    const a = away(w);
    if (a === 1) return 0;
    if (isCounty(w)) return 1;
    return a === 2 ? 2 : 3;
  };
  queue.sort((a, b) => rank(a) - rank(b));
  emit({ stage: 'gap_res_pass', detail: `${work.size} profiles need evidence work · ${queue.length} mine${stealing ? ' · STEALING (own partition exhausted)' : ''}` });
  // 3-way per-slice concurrency — items are network-bound crawls across
  // distinct sites, so politeness-per-domain is preserved while each slice
  // pipelines fetches instead of serializing them.
  const items = queue.slice(0, 120);
  for (let i = 0; i < items.length; i += 3) {
    await Promise.all(items.slice(i, i + 3).map(async (w) => {
      const k = `gap-${w.profile.id}`;
      try {
        const result = await workProfile(w.profile, w.wanted, { profiles, parent_county_name: w.loc?.parent_county_name, loc: w.loc });
        const prev = claims[k] || {};
        const misses = result === 'enriched' ? 0 : (prev.misses || 0) + 1;
        claims[k] = { result, at: new Date().toISOString(), misses };
        // Dark list — 8+ misses across every tier means the ladder exhausted
        // (still retried at 72h). The flag surfaces it for review WITH reasons;
        // a later enrich auto-clears it.
        if (misses >= 8 && !/dark/i.test(String(w.profile.research_status || ''))) {
          enqueue({ entity: 'JurisdictionProfile', op: 'update', id: w.profile.id, data: { research_status: 'dark', dark_reasons: [`${misses} ladder misses — no site/county-doc/roster evidence`], dark_marked_at: new Date().toISOString() }, mirror: `profiles-${String(w.profile.state || '').toLowerCase()}`, note: `dark list — ${w.profile.name}, ${w.profile.state} (${misses} misses)` });
          emit({ stage: 'gap_res_dark', address: `${w.profile.name}, ${w.profile.state}`, ok: false, detail: `${misses} misses across all tiers — dark-listed, keeps retrying at 72h` });
        } else if (result === 'enriched' && /dark/i.test(String(w.profile.research_status || ''))) {
          enqueue({ entity: 'JurisdictionProfile', op: 'update', id: w.profile.id, data: { research_status: null, dark_reasons: [], dark_marked_at: null }, mirror: `profiles-${String(w.profile.state || '').toLowerCase()}`, note: `dark cleared — ${w.profile.name} enriched` });
        }
      } catch (e) { emit({ stage: 'gap_res_error', address: `${w.profile.name}, ${w.profile.state}`, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    }));
    saveClaims();
    await sleep(SLEEP);
  }
}

emit({ stage: 'gap_res_boot', address: 'gap researcher', ok: true, start: true, detail: `gap-driven re-research — verifier gaps + thin profiles · slice ${SLICE}/${SLICES} · ZERO spend` });
(async () => {
  while (true) {
    await pass();
    if (ONCE) break;
    await sleep(3 * 60 * 1000);
  }
})().catch((e) => { emit({ stage: 'gap_res_error', address: 'gap researcher', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
