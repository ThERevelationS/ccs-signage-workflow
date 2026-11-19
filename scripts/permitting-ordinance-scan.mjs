#!/usr/bin/env node
// WS-10.1 — Ordinance channel. Plain HTTP gets 403 from code-library hosts
// (Cloudflare); headless Edge renders them fine (verified: real code text).
// For each OH/KY profile without ordinance data:
//   DDG-search the code libraries → headless-render the code page →
//   extract sign-ordinance excerpts → profile.office_research.ordinance.
//
//   node scripts/permitting-ordinance-scan.mjs --slice i --slices n [--once]
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { getMirror, mirrorApply } from './lib/entity-mirror.mjs';
import { enqueue } from './lib/outbox.mjs';
import { fetchText, sleep } from './lib/office-research.mjs';

const args = process.argv.slice(2);
const SLICE = Number(args[args.indexOf('--slice') + 1] || 0);
const SLICES = Number(args[args.indexOf('--slices') + 1] || 1);
const ONCE = args.includes('--once');
const EVENTS = '.live-events.jsonl';
const CLAIMS_FILE = `.audit-work/ordinance-${SLICE}-claims.json`;
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: `ord-${SLICE}`, ...e }) + '\n', { flag: 'a' }); } catch {} };
let claims = {};
try { claims = JSON.parse(readFileSync(CLAIMS_FILE, 'utf8')); } catch {}
const saveClaims = () => { try { writeFileSync(CLAIMS_FILE, JSON.stringify(claims)); } catch {} };
const claimKey = (p) => `ord-${p.id}`;
const sliceOf = (k) => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % SLICES; };

const LIB_HOSTS = /library\.municode\.com|ecode360\.com|codelibrary\.amlegal\.com|americanlegal|codepublishing\.com|sterlingcodifiers|qcode\.us|generalcode\.com|encodeplus\.com/i;
const LIB_DENY = /facebook|twitter|youtube|instagram|linkedin|wikipedia|reddit|nextdoor|yelp|city-data|justia|law\.cornell|casetext|findlaw|americanbar/i;

// DDG-discover the jurisdiction's code-library page. Variants: exact name +
// ordinance gets precision; bare name+state+code library widens recall.
async function codeLibraryUrl(name, state) {
  const st = state === 'OH' ? 'Ohio' : 'Kentucky';
  const stSlug = String(state).toLowerCase();
  // 1) Slug derivation — library slugs are predictable. HEAD-probe the
  //    candidates before paying for a search query (DDG rate-limits fleets).
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const candidates = [
    `https://library.municode.com/${stSlug}/${slug}`,
    `https://codelibrary.amlegal.com/codes/${slug}`,
    `https://ecode360.com/${slug.toUpperCase().slice(0, 4)}`,
    `https://www.codepublishing.com/${state.toUpperCase()}/${slug.replace(/_/g, '')}/`,
  ];
  for (const u of candidates) {
    const ok = await fetch(u, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), redirect: 'follow' })
      .then((r) => r.status < 404).catch(() => false);
    if (ok) return u;
    await sleep(400);
  }
  // 2) DDG fallback for jurisdictions on non-obvious slugs.
  const queries = [
    `"${name}" ${st} code of ordinances municode`,
    `${name} ${st} municipal code library`,
  ];
  for (const q of queries) {
    // DDG HTML endpoint — direct fetch; fetchText's normalization drops it.
    const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    const html = resp?.ok ? await resp.text().catch(() => '') : '';
    if (!html) { await sleep(2000); continue; }
    for (const m of html.matchAll(/uddg=([^&"']+)/g)) {
      try {
        const u = new URL(decodeURIComponent(m[1]));
        if (!LIB_HOSTS.test(u.hostname) || LIB_DENY.test(u.hostname)) continue;
        return u.href.split('#')[0];
      } catch {}
    }
    await sleep(1200);
  }
  return null;
}

// Headless render → visible text. Shared browser across the worker.
let browser = null;
async function getBrowser() {
  if (browser) return browser;
  const { chromium } = await import('playwright-core');
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); return browser; } catch {}
  }
  throw new Error('no chromium channel');
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
let ctx = null;
// renderPage returns visible text AND the page's anchor map — the anchors
// let us follow the sign chapter off a code landing page (MP-10.1).
async function renderPage(url) {
  if (!ctx) ctx = await (await getBrowser()).newContext({ userAgent: UA });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Cloudflare JS challenge resolves in ~5-8s — poll until real content
    // appears or we give up (challenge text is a few hundred chars).
    let text = '';
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(3000);
      text = String(await page.evaluate(() => document.body?.innerText || '') || '');
      if (text.length > 2000 && !/verifies you are not a bot|security service/i.test(text)) break;
    }
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => ({ href: a.href, text: (a.innerText || '').trim() }))).catch(() => []);
    return { text, links };
  } catch { return { text: '', links: [] }; } finally { await page.close().catch(() => {}); }
}
const renderText = async (url) => (await renderPage(url)).text;

// Pull sign-ordinance excerpts: paragraphs/blocks containing "sign" with
// regulatory vocabulary nearby — keeps the card useful without storing 50KB.
const SIGN_CTX = /sign(age)?\b.{0,200}(permit|required|prohibit|size|height|setback|illuminated|district|ordinance|zoning)/i;
function signExcerpts(text, max = 6) {
  const out = [];
  const blocks = String(text || '').split(/\n{2,}|(?<=\.)\s+(?=[A-Z0-9][a-z]*\s*\d)/);
  for (const b of blocks) {
    const t = b.replace(/\s+/g, ' ').trim();
    if (t.length < 60 || t.length > 3000) continue;
    if (!/\bsign(s|age)?\b/i.test(t)) continue;
    if (!SIGN_CTX.test(t)) continue;
    out.push(t.slice(0, 800));
    if (out.length >= max) break;
  }
  return out;
}

// A stamped URL is only evidence when it can't obviously belong to another
// state's same-named jurisdiction (Corning OH → .../ca/corning was a real
// bad stamp). For state-pathed hosts like municode, verify the segment.
const validStamp = (url, state) => {
  const u = String(url || '');
  if (!LIB_HOSTS.test(u)) return false;
  const m = u.match(/library\.municode\.com\/([a-z]{2})\//i);
  if (m && String(m[1]).toLowerCase() !== String(state || '').toLowerCase()) return false;
  return true;
};
// Profiles can exist as identity-variant dupes ("Corning" x5); the harvest
// stamps whichever row it matched. Fall back to a same-name sibling's URL.
let urlByName = new Map();
const normName = (s) => String(s || '').toLowerCase().replace(/\s+(city|village|township|municipality|county)$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
async function workProfile(p) {
  const label = `${p.name}, ${p.state}`;
  // Direct slug render first — municode slugs are predictable and the
  // headless renderer beats Cloudflare, where a status check can't.
  const slug = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const direct = `https://library.municode.com/${String(p.state).toLowerCase()}/${slug}`;
  // Verified stamped URL (GIS harvest or same-name sibling) renders first —
  // it's county-sourced, not a guess. Slug derivation + DDG stay as fallbacks.
  const stamped = validStamp(p.ordinance_url, p.state) ? p.ordinance_url
    : urlByName.get(`${normName(p.name)}|${String(p.state).toLowerCase()}`) || null;
  const candidates = [stamped, direct].filter(Boolean);
  const goodText = (t) => t.length >= 5000 && /chapter|article|section\s+\d/i.test(t);
  let url = '', text = '', links = [];
  for (const cand of candidates) {
    emit({ stage: 'ord_step', address: label, step: true, detail: `rendering ${cand.slice(0, 90)}` });
    const r = await renderPage(cand); text = r.text; links = r.links; url = cand;
    if (goodText(text)) break;
  }
  if (!goodText(text)) {
    // slug miss — fall back to search discovery
    const found = await codeLibraryUrl(p.name, p.state);
    if (found && !candidates.includes(found)) {
      emit({ stage: 'ord_step', address: label, step: true, detail: `rendering ${found.slice(0, 90)}` });
      const r = await renderPage(found); url = found; text = r.text; links = r.links;
    }
  }
  // A ~600-char render with bot-verification text is a FAILED Cloudflare
  // challenge, not a miss — retryable soon. A ~2.8K shell with no chapter
  // markers is a jurisdiction genuinely not on the host — retry after 30d
  // in case the code gets published later.
  const challenge = /verifies you are not a bot|security verification|just a moment|ray id/i.test(text) && text.length < 3000;
  if (challenge) { emit({ stage: 'ord_miss', address: label, ok: false, detail: `challenge not cleared (${text.length} chars) — retryable` }); return 'blocked'; }
  // A thin render on a VERIFIED url (or amlegal, whose SPA shell defeats
  // headless) means the code exists but render was blocked — retryable soon,
  // not a 30d "probably no code" miss.
  const verifiedThin = stamped && url === stamped;
  const amlegalThin = /amlegal/i.test(new URL(url).hostname);
  if (text.length < 5000 || !/chapter|article|section\s+\d/i.test(text)) {
    if (verifiedThin || amlegalThin) { emit({ stage: 'ord_miss', address: label, ok: false, detail: `verified ${new URL(url).hostname} rendered ${text.length} chars — render blocked, retryable` }); return 'blocked'; }
    emit({ stage: 'ord_miss', address: label, ok: false, detail: `rendered ${text.length} chars — library shell or blocked` }); return 'render_thin';
  }
  // MP-10.1 — the landing page is a TOC; follow the sign chapter link so
  // excerpts/dims come from actual regulation text, not chapter titles.
  let exSource = text;
  const signLink = (links || []).find((l) => /\bsigns?\b/i.test(String(l.text || '')) || /sign/i.test(String(l.href || '')));
  if (signLink?.href && signLink.href !== url) {
    emit({ stage: 'ord_step', address: label, step: true, detail: `sign chapter ${String(signLink.href).slice(0, 80)}` });
    const ch = await renderText(signLink.href);
    if (ch.length >= 800) exSource = `${text}\n\n${ch}`;
  }
  const excerpts = signExcerpts(exSource);
  // MP-10.3 — dimensional quick-facts from the ordinance text itself.
  const dims = [];
  const DIM = [
    [/maximum.{0,60}?(\d+(?:\.\d+)?)\s*(?:square feet|sq\.?\s?ft\.?|sf)/i, 'max_size_sf'],
    [/not exceed.{0,40}?(\d+(?:\.\d+)?)\s*(?:square feet|sq\.?\s?ft\.?|sf)/i, 'max_size_sf'],
    [/height.{0,60}?(\d+(?:\.\d+)?)\s*feet/i, 'max_height_ft'],
    [/not exceed.{0,40}?(\d+(?:\.\d+)?)\s*feet.{0,30}height/i, 'max_height_ft'],
    [/setback.{0,60}?(\d+(?:\.\d+)?)\s*feet/i, 'setback_ft'],
    [/(\d+(?:\.\d+)?)\s*feet.{0,40}setback/i, 'setback_ft'],
  ];
  const seen = new Set();
  for (const ex of excerpts) {
    for (const [re, key] of DIM) {
      const m = re.exec(ex);
      if (m && !seen.has(key)) { seen.add(key); dims.push({ fact: key, value: Number(m[1]), excerpt: ex.slice(0, 200) }); }
    }
  }
  const ord = {
    url, host: new URL(url).hostname,
    fetched_at: new Date().toISOString(),
    page_chars: text.length,
    sign_sections: excerpts,
    dimensional_facts: dims,
    // MP-10.2 — permit-required determination from the code text.
    sign_permit_required_hint: /sign.{0,60}permit.{0,60}required|permit.{0,40}required.{0,40}sign/i.test(exSource),
    sign_permit_exempt_hint: /sign.{0,80}exempt|exempt.{0,40}sign|without.{0,20}permit.{0,40}sign/i.test(exSource),
  };
  const research = { ...(p.office_research || {}), roles: p.office_research?.roles || [], ordinance: ord };
  enqueue({ entity: 'JurisdictionProfile', op: 'update', id: p.id, data: { office_research: research, ordinance_url: url }, mirror: null, note: `ordinance — ${label}` });
  mirrorApply(String(p.state).toUpperCase() === 'KY' ? 'profiles-ky' : 'profiles-oh', { id: p.id, office_research: research, ordinance_url: url });
  emit({ stage: 'ord_done', address: label, ok: true, detail: `${excerpts.length} sign section(s) from ${ord.host} (${text.length} chars)` });
  return 'done';
}

async function main() {
  const profiles = [...(getMirror('profiles-oh')?.rows || []), ...(getMirror('profiles-ky')?.rows || [])];
  urlByName = new Map();
  for (const p of profiles) {
    if (!validStamp(p.ordinance_url, p.state)) continue;
    const k = `${normName(p.name)}|${String(p.state).toLowerCase()}`;
    if (!urlByName.has(k)) urlByName.set(k, p.ordinance_url);
  }
  const pending = profiles.filter((p) => {
    if (p.office_research?.ordinance?.sign_sections?.length) return false;
    if (String(p.verification_status || '').toLowerCase() === 'historical' || p.duplicate_of) return false;
    if (sliceOf(claimKey(p)) !== SLICE) return false;
    // Claim TTLs — 'blocked' retries after 6h (challenge clears are
    // intermittent), 'render_thin' after 30d (codes get published),
    // 'done'/'error' after 30d (re-verify freshness). Only fresh claims skip.
    const cl = claims[claimKey(p)];
    if (cl) {
      const ageH = (Date.now() - new Date(cl.at).getTime()) / 36e5;
      const ttlH = cl.result === 'blocked' ? 6 : cl.result === 'error' ? 24 : 24 * 30;
      if (ageH < ttlH) return false;
    }
    return true;
  });
  // Cities/villages are the municode-likely jurisdictions; townships rarely
  // publish there. Process cities first so hits land while the tail grinds.
  const rank = (p) => /city|village|municipal/i.test(String(p.type || p.jurisdiction_type || '')) ? 0 : /county/i.test(String(p.type || p.jurisdiction_type || '')) ? 1 : 2;
  pending.sort((a, b) => rank(a) - rank(b));
  emit({ stage: 'ord_boot', ok: true, start: true, detail: `ordinance scan — ${pending.length} profiles without sign-code data (cities first)` });
  for (const p of pending) {
    try {
      const result = await workProfile(p);
      claims[claimKey(p)] = { result, at: new Date().toISOString() };
      saveClaims();
    } catch (e) {
      claims[claimKey(p)] = { result: 'error', at: new Date().toISOString() };
      emit({ stage: 'ord_error', address: `${p.name}, ${p.state}`, ok: false, detail: String(e?.message || e).slice(0, 140) });
    }
    await sleep(2500); // headless + DDG politeness
  }
  if (browser) await browser.close().catch(() => {});
}

main().then(() => { if (!ONCE) setTimeout(main, 30 * 60000); }).catch((e) => { emit({ stage: 'ord_error', ok: false, detail: String(e?.message || e).slice(0, 160) }); process.exit(1); });
