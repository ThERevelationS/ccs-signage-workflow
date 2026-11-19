#!/usr/bin/env node
// Headless-render research — the JS-shell killer. A meaningful share of
// municipal sites are Wix/Squarespace/GoDaddy/CivicPlus JS apps: the HTTP
// crawler gets a link-less shell and extracts nothing ('no_evidence'). This
// worker renders those sites in real Edge/Chromium (playwright-core +
// channel — no browser download), reads innerText + DOM links, and feeds
// the SAME extract() pipeline + mergeRoles + outbox write path.
//
// Work list: claims where HTTP research found a site but extracted nothing
// (researcher 'no_evidence' / gap 'no_improvement' claims), plus profiles
// whose research has entries but zero with a real source URL (JS-era v1).
//
// Usage: node scripts/permitting-headless-research.mjs [--once] [--max-pages N]
import { openSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { normalizeOfficeResearch } from '../base44/shared/permittingOfficeResearch.mjs';
import { discoverSite, extract, pdfEvidence, mergeRoles, PAGE_KEY, DIR_KEY, sameSite, GENERIC_OK, GENERIC_SKIP, sleep } from './lib/office-research.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ONCE = args.includes('--once');
const SLICE = Number(arg('--slice', 0));
const SLICES = Number(arg('--slices', 1));
const sliceOf = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SLICES; };
const MAX_PAGES = Number(arg('--max-pages', 7));
const EVENTS = '.live-events.jsonl';
const CLAIMS_FILE = `.audit-work/headless-claims-${SLICE}.json`;
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `headless-res-${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };
let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS_FILE, JSON.stringify(claims)); } catch {} };


let browser = null;
async function getBrowser() {
  if (browser) return browser;
  const { chromium } = await import('playwright-core');
  // Edge first (always present on Windows), Chrome as fallback — both are
  // real Chromium; `channel` skips the playwright browser download entirely.
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); emit({ stage: 'hl_boot', detail: `browser live — ${channel} headless` }); return browser; } catch {}
  }
  throw new Error('no chromium channel launchable (msedge/chrome)');
}

let sharedCtx = null;
let sharedPage = null;
async function getContext() {
  // MP-2.3 — one context per worker, page-per-site. New-context-per-site
  // cost ~200-400ms each × thousands of crawls; cookies bleeding between
  // anonymous reads is harmless.
  if (sharedCtx) return sharedCtx;
  sharedCtx = await (await getBrowser()).newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ccs-signage-office-research/1.0', viewport: { width: 1280, height: 900 } });
  return sharedCtx;
}

async function renderCrawl(site) {
  const ctx = await getContext();
  try {
    const nav = async (page, url) => {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch { return null; }
      await page.waitForTimeout(1500); // let the JS app paint nav/departments
      const [text, links] = await Promise.all([
        page.evaluate(() => document.body?.innerText || '').catch(() => ''),
        // url + anchor text — "Zoning Department" linking to /page?id=12 is
        // invisible to URL-only matching.
        page.$$eval('a[href]', (as) => as.map((a) => ({ url: a.href, text: String(a.innerText || '').trim() })).filter((l) => l.url)).catch(() => []),
      ]);
      return { url: page.url(), text: String(text || ''), links };
    };
    let page = sharedPage || (sharedPage = await ctx.newPage());
    let home = await nav(page, site);
    if (!home && sharedPage) {
      // A crashed shared page would null every site after it — recreate once.
      try { await sharedPage.close(); } catch {}
      sharedPage = page = await ctx.newPage();
      home = await nav(page, site);
    }
    if (!home) return null;
    const host = new URL(home.url).host;
    const internal = (u) => sameSite(u, host);
    const kwHit = (l) => PAGE_KEY.test(l.url) || (l.text && (PAGE_KEY.test(l.text) || DIR_KEY.test(l.text))) || DIR_KEY.test(l.url);
    const genOk = (l) => {
      if (!internal(l.url) || GENERIC_SKIP.test(l.url)) return false;
      try { return GENERIC_OK.test(new URL(l.url).pathname + ' ' + (l.text || '')); } catch { return false; }
    };
    const pages = [{ url: home.url, text: home.text }];
    const seen = new Set([home.url]);
    const allUrls = new Set(home.links.map((l) => l.url));
    // Breadth-first frontier: keyword links first, generic nav behind them.
    // Links discovered on each visited page re-enter the frontier — the old
    // code computed `cand` once from the homepage so page-2 links were dead.
    const kwQueue = home.links.filter((l) => kwHit(l) && internal(l.url) && !/\.pdf(\?|$)/i.test(l.url)).map((l) => l.url);
    const genQueue = home.links.filter((l) => !kwHit(l) && genOk(l)).map((l) => l.url);
    while (pages.length < MAX_PAGES && (kwQueue.length || genQueue.length)) {
      const u = (kwQueue.length ? kwQueue : genQueue).shift();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const p = await nav(page, u);
      if (p) {
        pages.push({ url: p.url, text: p.text });
        for (const l of p.links) {
          if (allUrls.has(l.url)) continue;
          allUrls.add(l.url);
          home.links.push(l);
          if (/\.pdf(\?|$)/i.test(l.url)) continue;
          if (kwHit(l) && internal(l.url)) kwQueue.push(l.url);
          else if (genOk(l)) genQueue.push(l.url);
        }
      }
      await sleep(400);
    }
    return { pages, links: allUrls, crawled: pages.length };
  } catch { return null; } // context stays open — next site reuses it
}

// Claims from every research worker feed the retry list — a 'no_evidence'/
// 'no_improvement' claim means HTTP extraction failed, exactly what
// headless exists to beat.
function jsShellTargets(profiles) {
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const byName = new Map(profiles.map((p) => [`${String(p.name || '')}|${String(p.state || '')}`.toLowerCase(), p]));
  // Researcher claims are keyed by QUEUE ROW id — resolve row → jurisdiction
  // name → profile. Gap claims are keyed `gap-<profileId>` directly.
  const queueRows = getMirror('queue')?.rows || [];
  const rowById = new Map(queueRows.map((r) => [r.id, r]));
  const targets = new Map();
  let claimFiles = [];
  try { claimFiles = readdirSync('.audit-work').filter((f) => /^(local-research|gap-research)-claims-\d+\.json$/.test(f)); } catch {}
  for (const f of claimFiles) {
    let c = {};
    try { c = JSON.parse(readFileSync(`.audit-work/${f}`, 'utf8')); } catch {}
    for (const [k, v] of Object.entries(c)) {
      if (!/no_evidence|no_improvement/.test(String(v?.result || ''))) continue;
      const row = rowById.get(k);
      const p = profById.get(k.replace(/^gap-/, ''))
        || (row && byName.get(`${row.jurisdiction_name || ''}|${row.state || ''}`.toLowerCase()))
        || byName.get(k.toLowerCase());
      if (p && !targets.has(p.id)) targets.set(p.id, p);
    }
  }
  // Plus: researched profiles where EVERY entry lacks an official URL —
  // classic JS-shell signature from the v1 extraction era.
  for (const p of profiles) {
    const roles = p.office_research?.roles || [];
    if (roles.length && roles.every((e) => !/^https?:\/\//i.test(String(e?.official_source_url || '')))) {
      if (!targets.has(p.id)) targets.set(p.id, p);
    }
  }
  return [...targets.values()];
}

async function workProfile(profile, profiles) {
  const label = `${profile.name}, ${profile.state}`;
  const { site, countyFallback } = await discoverSite({
    name: String(profile.name || '').replace(/\s+(city|village|township|county)$/i, ''),
    state: profile.state, type: profile.type, county: profile.county_name, profile, profiles,
  });
  if (!site) return 'no_site';
  emit({ stage: 'hl_step', address: label, step: true, detail: `rendering ${site}${countyFallback ? ' (county fallback)' : ''}` });
  const crawl = await renderCrawl(site);
  if (!crawl) return 'no_site';
  const roles = extract(crawl.pages, null);
  for (const p of pdfEvidence(crawl.links)) {
    if (roles.find((r) => r.role === p.role)) continue;
    roles.push({ role: p.role, office_name: `${profile.name} offices`, official_source_url: p.url, applicability: 'potentially_applicable', responsibility_quote: `Official site hosts "${p.name}" — the issuing office publishes this form.`, service_area: countyFallback ? 'county-administered' : null, delegation_quote: null, contact_info: {}, research_fields: {} });
  }
  if (countyFallback) for (const r of roles) { r.service_area = r.service_area || `${profile.county_name} — county-administered for ${profile.name}`; }
  const { roles: merged, improved } = mergeRoles(profile.office_research?.roles || [], roles);
  if (!improved) { emit({ stage: 'hl_miss', address: label, ok: false, detail: `rendered ${crawl.crawled}p — still no office evidence` }); return 'no_improvement'; }
  const normalized = normalizeOfficeResearch({ roles: merged }, { jurisdiction: { id: profile.id, name: profile.name, state: profile.state, type: profile.type } });
  enqueue({ entity: 'JurisdictionProfile', op: 'update', id: profile.id, data: { office_research: normalized }, mirror: `profiles-${String(profile.state || '').toLowerCase()}`, note: `headless research — ${label}` });
  mirrorApply(`profiles-${String(profile.state || '').toLowerCase()}`, { id: profile.id, office_research: normalized });
  emit({ stage: 'gap_res_done', address: label, ok: true, detail: `HEADLESS enriched ${improved} role(s) — verifier re-judges` });
  try { writeFileSync('.audit-work/verify-first.jsonl', JSON.stringify({ name: profile.name, state: profile.state, at: Date.now() }) + '\n', { flag: 'a' }); } catch {}
  return 'enriched';
}

emit({ stage: 'hl_boot', address: 'headless researcher', ok: true, start: true, detail: `headless render research — JS-shell sites · Edge/Chrome channel · max ${MAX_PAGES}p/site` });
(async () => {
  while (true) {
    const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
    const CD = { enriched: 30 * 60 * 1000, no_improvement: 48 * 3600 * 1000, no_site: 24 * 3600 * 1000 };
    const WEEK = 7 * 24 * 3600 * 1000;
    const targets = jsShellTargets(profiles).filter((p) => {
      if (sliceOf(p.id) !== SLICE) return false;
      const c = claims[`hl-${p.id}`];
      // N-strike: 3+ consecutive render-empty misses → deprioritized 7 days.
      // Render cycles are the fleet's most expensive resource — sites that
      // publish nothing don't get them on every pass (still retried weekly).
      if (c?.misses >= 3 && Date.now() - new Date(c.at).getTime() < WEEK) return false;
      return !c || Date.now() - new Date(c.at).getTime() >= (CD[c.result] || 48 * 3600 * 1000);
    });
    emit({ stage: 'hl_pass', detail: `${targets.length} JS-shell candidate(s)` });
    for (const p of targets.slice(0, 60)) {
      try {
        const result = await workProfile(p, profiles);
        const prev = claims[`hl-${p.id}`] || {};
        claims[`hl-${p.id}`] = { result, at: new Date().toISOString(), misses: result === 'enriched' ? 0 : (prev.misses || 0) + 1 };
        saveClaims();
      } catch (e) { emit({ stage: 'hl_error', address: `${p.name}, ${p.state}`, ok: false, detail: String(e?.message || e).slice(0, 140) }); }
      await sleep(1500);
    }
    if (ONCE) break;
    await sleep(10 * 60 * 1000);
  }
})().catch((e) => { emit({ stage: 'hl_error', address: 'headless researcher', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
