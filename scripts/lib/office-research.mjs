// Shared deterministic office-research engine — extracted from
// permitting-local-researcher.mjs so the gap researcher and headless worker
// run the SAME discovery/crawl/extraction pipeline instead of forks.
//
//   official site (profile fields → past source URLs → domain guesses →
//   Wikidata → county fallback) → sitemap + keyword links + directory pages +
//   PDF evidence → role extraction → normalizeOfficeResearch (caller's job)
import { paceHost } from './host-pace.mjs';

export const UA = { 'User-Agent': 'ccs-signage-office-research/1.0 (municipal permitting contact research)' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, timeout = 15000) {
  try {
    // Fleet-wide politeness: ≥1s between requests to the same host across
    // every worker process (a county site sees the whole fleet as one visitor).
    await paceHost(url, 1000);
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: UA, redirect: 'follow' });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || '';
    if (!/html|text|xml/.test(type)) return null;
    return { url: r.url || url, html: await r.text() };
  } catch { return null; }
}

export const stripHtml = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<\/(li|tr|p|div|h[1-6]|td|th|section|article)>/gi, '\n')   // block boundaries → lines
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
  .replace(/[ \t]+/g, ' ').split('\n').map((s) => s.trim()).filter(Boolean).join('\n');

export const pageLinks = (html, base) => pageLinkPairs(html, base).map((l) => l.url);
// Anchor TEXT is evidence too — "Zoning Department" linking to /page?id=12
// is invisible to URL-only keyword matching. Keep url+text pairs.
export const pageLinkPairs = (html, base) => {
  const out = new Map();
  for (const m of String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], base);
      if (!u.protocol.startsWith('http')) continue;
      const key = u.href.split('#')[0];
      const text = String(m[2] || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!out.has(key) || (text && !out.get(key).text)) out.set(key, { url: key, text });
    } catch {}
  }
  return [...out.values()];
};
// Internal = same site, tolerating www/bare-domain drift and dept subdomains
// (portal.cityofx.gov ↔ cityofx.gov). Deliberately NOT last-two-labels —
// `ci.name.oh.us` would make every *.oh.us "internal".
export const sameSite = (u, homeHost) => {
  try {
    const a = new URL(u).host.toLowerCase().replace(/^www\./, '');
    const b = String(homeHost || '').toLowerCase().replace(/^www\./, '');
    return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
  } catch { return false; }
};
// Generic nav links worth trying when keyword matching finds nothing —
// shallow paths first, skipping obvious noise.
export const GENERIC_OK = /^\/[^?#]{0,60}$|government|department|about|community|residents|business|services|menu|navigation/i;
export const GENERIC_SKIP = /\.(jpg|jpeg|png|gif|svg|css|js|zip|docx?|xlsx?|pptx?|mp4|webm)(\?|$)|login|logout|sign.?in|cart|checkout|facebook|twitter|youtube|mailto:|tel:|calendar|events|news|article|photo|video|search|sitemap\.xml|wp-login|wp-admin|feed|rss|#|javascript:/i;
// mailto: hrefs are links, not text — stripHtml destroys them before any
// regex can see the address. Capture from raw HTML separately.
export const mailtoLinks = (html) =>
  [...String(html || '').matchAll(/href\s*=\s*["']mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1]).trim()).filter((e) => /@/.test(e));
// MP-3.6 — tel: links die the same way mailto: did.
export const telLinks = (html) =>
  [...String(html || '').matchAll(/href\s*=\s*["']tel:([^"'?>\s]+)/gi)].map((m) => m[1].replace(/[^\d+]/g, '')).filter((t) => t.replace(/\D/g, '').length >= 10);

// WS-3 crawl-time harvest — fees, submission, review time, staff names all
// live on pages we already fetch.
export const FEE_RE = /(?:fee|cost|charge)[^.\n]{0,60}\$\s?\d[\d,]*(?:\.\d{2})?|\$\s?\d[\d,]*(?:\.\d{2})?[^.\n]{0,40}(?:fee|permit|application)/i;
export const REVIEW_TIME_RE = /within\s+\d+\s+(?:business\s+)?(?:days?|weeks?)|(?:review|process|approval)[^.\n]{0,40}\d+\s+(?:business\s+)?(?:days?|weeks?)|\d+\s+(?:business\s+)?(?:days?|weeks?)\s+(?:for|to)\s+(?:review|process|approv)/i;
export const SUBMIT_RE = /\b(?:submit|application|apply)\b[^.\n]{0,60}\b(?:mail|in\s*person|drop\s*off|online|portal|e-?mail|fax)\b/i;
export const STAFF_RE = /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z'-]+),?\s+(?:the\s+)?[\w&\s]{0,30}?(?:Inspector|Administrator|Official|Engineer|Clerk|Coordinator|Director|Zoning Officer)\b/;
// Application-form page links (HTML forms — PDFs already land via pdfEvidence).
export const FORM_LINK_RE = /permit|application|form|apply/i;
// MP-3.10 — "submit the following: site plan, drawings, proof of insurance…"
export const REQDOCS_RE = /(?:required|submit|include|attach|provide)[^.\n]{0,40}(?:documents?|following|items|materials|copies|with)/i;
// MP-10.7 — BZA/PC meeting + deadline text.
export const MEETING_RE = /(?:meets?|meetings?)\s+(?:the|on|at)\s+[^.\n]{5,100}|(?:first|second|third|fourth|1st|2nd|3rd|4th)\s+(?:monday|tuesday|wednesday|thursday|friday)[^.\n]{0,60}/i;
// MP-10.6 — installer/contractor registration or licensing.
export const INSTALLER_RE = /(?:contractor|installer|sign\s+company|erector)[^.\n]{0,60}(?:register|registration|licensed?|certified|bonded)/i;
// MP-11.3 — inspection scheduling contact + permit validity/expiry language.
export const INSPECTION_RE = /(?:schedule|request|call for)\s+(?:an?\s+)?inspection[^.\n]{0,100}|inspection[^.\n]{0,40}(?:scheduling|request|contact)[^.\n]{0,60}/i;
export const EXPIRY_RE = /permit[^.\n]{0,60}(?:valid for|expires?|expiration|void if)[^.\n]{0,60}/i;
// MP-3.9 — hours live on department pages as day-range or "Hours: 8-4".
export const HOURS_RE = /(?:hours?[^.\n]{0,25}(?:mon|tue|wed|thu|fri|am|pm|\d{1,2}:\d{2}|\d{1,2}\s*[–\-]\s*\d{1,2}))|(?:mon(?:day)?\s*[–\-]?\s*(?:fri(?:day)?)?[^.\n]{0,40}\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|am)[^.\n]{0,20}\d{1,2}(?::\d{2})?\s*(?:p\.?m\.?|pm))/i;

// ── Official-site discovery ──────────────────────────────────────────────
export async function wikidataSite(name, state) {
  try {
    const q = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name + ' ' + state)}&language=en&format=json&limit=3`, { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.json());
    for (const hit of q?.search || []) {
      if (!/^Q\d+$/.test(hit.id)) continue;
      const ent = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`, { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => r.json()).catch(() => null);
      const url = ent?.entities?.[hit.id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
      if (url && /^https?:\/\//.test(url)) return url;
    }
  } catch {}
  return null;
}
export function domainGuesses(name, state, type, county) {
  const slug = String(name).toLowerCase().replace(/^(city of|village of|town of|township of)\s+/, '').replace(/[^a-z0-9]+/g, '');
  const cslug = String(county || '').toLowerCase().replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, '');
  const st = String(state).toLowerCase();
  const out = [];
  if (type === 'county' && cslug) out.push(`https://${cslug}county${st}.gov`, `https://co.${cslug}.${st}.us`, `https://www.${cslug}county.com`);
  out.push(`https://${slug}${st}.gov`, `https://cityof${slug}.com`, `https://www.${slug}${st}.us`, `https://${slug}.gov`, `https://villageof${slug}.com`, `https://www.${slug}${st === 'oh' ? 'ohio' : 'ky'}.com`);
  return out;
}

// ── Crawl discovery: sitemap → keyword links → directory pages ───────────
export const PAGE_KEY = /permit|zoning|building|planning|code|inspect|public.?works|engineering|community.?develop|department|forms|applications|right.of.way|historic|sign/i;
export const DIR_KEY = /department|directory|staff|government|officials|contact|administration/i;
// Tier-1 deep-crawl expansion — small jurisdictions publish permitting facts in
// meeting minutes ("the zoning inspector reported"), trustee pages, ordinances,
// and fee schedules, none of which hit PAGE_KEY. Only joined to the frontier on
// deep passes; calendar/news stay GENERIC_SKIP'd.
export const DEEP_KEY = /minutes|agenda|trustee|ordinance|resolution|fee.?schedule|schedule.?of.?fees|legislation|clerk/i;
export async function sitemapUrls(host) {
  const out = [];
  for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
    const sm = await fetchText(host + path, 10000);
    if (!sm) continue;
    for (const m of sm.html.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
      const u = m[1].trim();
      if (PAGE_KEY.test(u)) out.push(u);
    }
    if (out.length) break;
  }
  return out;
}
export function pdfEvidence(links) {
  // A "Sign-Permit-Application.pdf" link is itself strong issuing-office
  // evidence — the PDF URL is an official source.
  const out = [];
  const PDF_ROLE = [
    { role: 'sign_permit', re: /sign/i },
    { role: 'zoning', re: /zon/i },
    { role: 'building', re: /build|struct/i },
    { role: 'electrical_permit', re: /electric.*permit|permit.*electric/i },
    { role: 'electrical_inspection', re: /electric.*inspect|inspect.*electric/i },
    { role: 'right_of_way', re: /right.?of.?way|row|street.?open|excavat/i },
    { role: 'historic_review', re: /historic|landmark|appropriateness/i },
  ];
  for (const u of links) {
    if (!/\.pdf(\?|$)/i.test(u)) continue;
    const fname = decodeURIComponent(u.split('/').pop() || '').replace(/[-_+.]/g, ' ');
    if (!/permit|application|form|inspection/i.test(fname)) continue;
    for (const r of PDF_ROLE) {
      if (r.re.test(fname)) { out.push({ role: r.role, url: u, name: fname }); break; }
    }
  }
  return out;
}

// ── Extraction ───────────────────────────────────────────────────────────
export const ROLE_RULES = [
  { role: 'sign_permit', office: /sign|permit|building|zoning/i, match: /sign(age)?\s+permit|sign\s+approval|sign\s+application|permit.{0,25}sign/i, urlKey: /sign|permit|building|zoning/i },
  { role: 'zoning', office: /zoning|planning/i, match: /zoning\s+(permit|certificate|approval|department|inspector|administrator|office|compliance|resolution)|zoning\s+board|planning\s+(commission|department|and zoning|& zoning)/i, urlKey: /zon|plan/i },
  { role: 'building', office: /building/i, match: /building\s+(department|official|inspector|permit|code|division|regulation)|building\s+permits?|issues?\s+building\s+permits?|residential\s+building/i, urlKey: /build|code/i },
  { role: 'electrical_permit', office: /electrical/i, match: /electrical\s+permit|electrical\s+work\s+permit|electrical\s+license/i, urlKey: /electric/i },
  { role: 'electrical_inspection', office: /electrical|inspect/i, match: /electrical\s+inspect|inspect(?:s|ion of)?\s+electrical|electrical\s+safety/i, urlKey: /electric|inspect/i },
  { role: 'right_of_way', office: /public works|engineering|street|road|right/i, match: /right[\s-]?of[\s-]?way|R\.?O\.?W\.?\s+permit|street\s+opening|excavat|public\s+works|road\s+department|street\s+department/i, urlKey: /works|street|road|engineering/i },
  { role: 'historic_review', office: /historic|landmark/i, match: /historic\s+(preservation|district|review|landmark)|landmarks?\s+(commission|board)|certificate\s+of\s+appropriateness/i, urlKey: /historic|landmark/i },
];
export const OFFICE_NAME_RE = /(?:^|\b)((?:City|County|Village|Township|Borough|Municipal|Department of|Division of|Office of|Board of|Office)\s+)?([A-Z][A-Za-z&'()\-]*(?:\s+[A-Z][A-Za-z&'()\-]*){0,4})\s+(Department|Division|Office|Bureau|Commission|Board|District|Inspector|Official|Administrator|Engineer|Clerk)\b/g;
export const DEPT_LISTING_RE = /\b(Building|Zoning|Planning|Electrical|Public Works|Engineering|Code Enforcement|Community Development|Development Services|Street|Road|Historic Preservation)\s+(Department|Division|Office|Inspector|Official|Administrator|Commission|Board)\b/gi;
export const PHONE_RE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g;
export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Extract role evidence from pages [{url,text}]. `wanted` limits scoring to
// those roles (gap research); null = all roles.
export function extract(pages, wanted = null) {
  const found = {};
  const contacts = {};
  const harvest = {}; // per-url: fee/review/submission/staff from WS-3 regexes
  const rules = wanted ? ROLE_RULES.filter((r) => wanted.has(r.role)) : ROLE_RULES;
  for (const p of pages) {
    const h = harvest[p.url] = {};
    const lines = p.text.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      // MP-3.8 — 3-line sliding window: dept blocks put name/line then
      // phone/email then hours — a 2-line window clips the third.
      const w = [l, lines[li + 1] || '', lines[li + 2] || ''].join(' ');
      if (!h.fee_text) { const m = w.match(FEE_RE); if (m) h.fee_text = m[0].slice(0, 160); }
      if (!h.review_time) { const m = w.match(REVIEW_TIME_RE); if (m) h.review_time = m[0].slice(0, 120); }
      if (!h.submission) { const m = w.match(SUBMIT_RE); if (m) h.submission = m[0].slice(0, 160); }
      if (!h.person) { const m = w.match(STAFF_RE); if (m) h.person = m[0].slice(0, 80); }
      if (!h.hours) { const m = w.match(HOURS_RE); if (m) h.hours = m[0].slice(0, 100); }
      if (!h.required_docs) { const m = w.match(REQDOCS_RE); if (m) h.required_docs = m[0].slice(0, 220); }
      if (!h.meeting) { const m = w.match(MEETING_RE); if (m) h.meeting = m[0].slice(0, 140); }
      if (!h.installer) { const m = w.match(INSTALLER_RE); if (m) h.installer = m[0].slice(0, 140); }
      if (!h.inspection) { const m = w.match(INSPECTION_RE); if (m) h.inspection = m[0].slice(0, 140); }
      if (!h.expiry) { const m = w.match(EXPIRY_RE); if (m) h.expiry = m[0].slice(0, 140); }
    }
    if (!h.phone && (p.tel || [])[0]) h.phone = p.tel[0];
    if (!h.email && (p.mailto || [])[0]) h.email = p.mailto[0];
    for (let i = 0; i < lines.length; i++) {
      const block = [lines[i], lines[i + 1] || ''].join(' ');
      for (const rule of rules) {
        if (found[rule.role] && found[rule.role].score >= 3) continue;
        const hit = rule.match.test(block) ? 2 : 0;
        OFFICE_NAME_RE.lastIndex = 0; DEPT_LISTING_RE.lastIndex = 0;
        const offices = [...block.matchAll(OFFICE_NAME_RE)].map((m) => m[0].trim())
          .concat([...block.matchAll(DEPT_LISTING_RE)].map((m) => m[0].trim()))
          .filter((o) => o.length > 8 && o.length < 120);
        const office = offices.find((o) => rule.office.test(o)) || offices[0] || null;
        const score = hit + (office ? (rule.office.test(office) ? 2 : 1) : 0);
        if (!score) continue;
        if (!found[rule.role] || score > found[rule.role].score) {
          const ph = block.match(PHONE_RE)?.[0]; const em = block.match(EMAIL_RE)?.[0];
          // MP-5.3 field confidence: PDF/dept-path pages = high; the page's
          // bottom 15% is footer/nav territory = low.
          const isPdf = /\.pdf(\?|$)/i.test(p.url);
          const deptPath = /department|zoning|building|permit|planning|division|inspection/i.test(new URL(p.url, 'http://x').pathname);
          const footerZone = i > lines.length * 0.85;
          const field_confidence = isPdf || deptPath ? 'high' : footerZone ? 'low' : 'medium';
          found[rule.role] = {
            role: rule.role, score,
            office_name: office, official_source_url: p.url,
            applicability: 'potentially_applicable',
            responsibility_quote: block.slice(0, 300), service_area: null, delegation_quote: null,
            contact_info: { phone: ph || null, email: em || null }, research_fields: { field_confidence },
          };
        }
      }
      const ph = lines[i].match(PHONE_RE)?.[0]; const em = lines[i].match(EMAIL_RE)?.[0];
      if ((ph || em) && /department|office|inspector|permit|zoning|building|works|clerk|administrator/i.test(lines[i])) {
        contacts.phone = contacts.phone || ph || null;
        contacts.email = contacts.email || em || null;
      }
    }
  }
  const roles = Object.values(found).map(({ score, ...r }) => {
    const h = harvest[r.official_source_url] || {};
    return {
      ...r,
      contact_info: { phone: r.contact_info.phone || contacts.phone || h.phone || null, email: r.contact_info.email || contacts.email || h.email || null },
      research_fields: {
        ...r.research_fields,
        ...(h.fee_text ? { fee_text: h.fee_text } : {}),
        ...(h.review_time ? { review_time: h.review_time } : {}),
        ...(h.submission ? { submission: h.submission } : {}),
        ...(h.person ? { contact_person: h.person } : {}),
        ...(h.hours ? { hours: h.hours } : {}),
        ...(h.required_docs ? { required_documents: h.required_docs } : {}),
        ...(h.meeting ? { meeting_schedule: h.meeting } : {}),
        ...(h.installer ? { installer_registration: h.installer } : {}),
        ...(h.inspection ? { inspection_contact: h.inspection } : {}),
        ...(h.expiry ? { permit_expiry: h.expiry } : {}),
      },
    };
  });
  return roles;
}

// ── Research one site ────────────────────────────────────────────────────
// `opts.roleKey` biases page selection toward a single role's keywords (gap
// research re-crawls just the failing role's pages instead of everything).
// `deep` = metro/high-demand mode: wider generic fallback + breadth-first
// second-level harvest — department links on metros hide behind /government
// index pages, one link-layer deeper than village sites.
export async function crawlSite(site, { maxPages = 9, pageSleep = 300, roleKey = null, deep = false } = {}) {
  const home = await fetchText(site);
  if (!home) return null;
  const host = new URL(home.url).host;
  const linkPairs = pageLinkPairs(home.html, home.url);
  const allLinks = linkPairs.map((l) => l.url);
  const internal = (u) => sameSite(u, host);
  const pdf = pdfEvidence(allLinks);
  const sm = await sitemapUrls(`https://${host}`).catch(() => []);
  // Keyword match against URL *and* anchor text — "Zoning" → /page?id=12.
  const kwHit = (l) => PAGE_KEY.test(l.url) || (l.text && PAGE_KEY.test(l.text)) || (l.text && DIR_KEY.test(l.text));
  const deepHit = (l) => DEEP_KEY.test(l.url) || (l.text && DEEP_KEY.test(l.text));
  const kw = linkPairs.filter((l) => kwHit(l) && internal(l.url)).map((l) => l.url);
  const dirs = linkPairs.filter((l) => (DIR_KEY.test(l.url) || (l.text && DIR_KEY.test(l.text))) && internal(l.url)).map((l) => l.url);
  const deepLinks = deep ? linkPairs.filter((l) => !kwHit(l) && deepHit(l) && internal(l.url) && !GENERIC_SKIP.test(l.url)).map((l) => l.url) : [];
  let urls = [...new Set([...sm, ...kw, ...dirs, ...deepLinks])].filter((u) => !/\.pdf(\?|$)/i.test(u));
  if (!urls.length) {
    // Zero keyword hits — crawl shallow generic nav instead of giving up at
    // 1 page. Small-village sites name pages like /government or /community.
    urls = linkPairs
      .filter((l) => internal(l.url) && !GENERIC_SKIP.test(l.url) && GENERIC_OK.test(new URL(l.url).pathname + (l.text || '')))
      .sort((a, b) => a.url.split('/').length - b.url.split('/').length)
      .map((l) => l.url)
      .slice(0, Math.min(maxPages, deep ? 10 : 6));
  }
  if (roleKey) urls.sort((a, b) => Number(roleKey.test(b)) - Number(roleKey.test(a))); // role-matching pages first
  urls = urls.slice(0, maxPages);
  const pages = [{ url: home.url, text: stripHtml(home.html), mailto: mailtoLinks(home.html), tel: telLinks(home.html) }];
  const seen = new Set(urls.map((u) => u.toLowerCase()));
  // Bounded parallel fetch (3-way) — the 300ms politeness sleep applies per
  // batch, not per page, so throughput ~3×'s while host pressure stays sane.
  for (let cursor = 0; cursor < urls.length && pages.length <= maxPages; cursor += 3) {
    const batch = urls.slice(cursor, cursor + 3);
    const got = await Promise.all(batch.map((u) => fetchText(u, 12000).catch(() => null)));
    for (const p of got) {
      if (p) pages.push({ url: p.url, text: stripHtml(p.html), mailto: mailtoLinks(p.html), tel: telLinks(p.html) });
    }
    if (deep && urls.length < maxPages + 4) {
      // Second-level harvest: department listings found on index pages join
      // the frontier — metro depts are never linked from the homepage.
      for (const p of got) {
        if (!p) continue;
        for (const l of pageLinkPairs(p.html, p.url)) {
          if (!internal(l.url) || seen.has(l.url.toLowerCase())) continue;
          if (!(kwHit(l) || DIR_KEY.test(l.url))) continue;
          seen.add(l.url.toLowerCase());
          urls.push(l.url);
        }
      }
    }
    await sleep(pageSleep);
  }
  // MP-3.2 — HTML application-form links (PDFs land separately via `pdf`).
  const forms = linkPairs
    .filter((l) => internal(l.url) && !/\.pdf(\?|$)/i.test(l.url) && (FORM_LINK_RE.test(l.url) || (l.text && FORM_LINK_RE.test(l.text))))
    .slice(0, 8);
  return { pages, pdf, forms, site: home.url, crawled: pages.length, links: allLinks };
}

// Best-of merge for research entries — per role keep entries already
// carrying an official URL + real quote; replace provably weak entries
// (verifier-gapped ones) with better new evidence. Different-provider
// entries for the same role are never deleted.
export const evidenceGood = (e) => /^https?:\/\//i.test(String(e?.official_source_url || '')) && String(e?.responsibility_quote || '').length >= 20;
export function mergeRoles(existing, incoming) {
  const byRole = new Map();
  for (const e of existing || []) {
    const k = e?.role; if (!k) continue;
    if (!byRole.has(k)) byRole.set(k, []);
    byRole.get(k).push(e);
  }
  let improved = 0;
  for (const e of incoming) {
    const cur = byRole.get(e.role) || [];
    if (cur.some((c) => evidenceGood(c))) continue;
    if (!evidenceGood(e)) continue;
    byRole.set(e.role, [...cur.filter((c) => evidenceGood(c)), e]);
    improved += 1;
  }
  return { roles: [...byRole.values()].flat(), improved };
}

// Full site discovery for a queue row + its profile — the researcher's exact
// chain so every worker resolves sites identically.
// Last-resort discovery: DDG's HTML endpoint returns organic results with no
// key. Only accept hosts that contain the jurisdiction slug — a directory
// link (yelp/mapquest) never qualifies as an official site.
const SEARCH_DENY = /facebook|twitter|youtube|instagram|linkedin|wikipedia|yelp|mapquest|whitepages|yellowpages|bing\.|google\.|duckduckgo|nextdoor|reddit|pinterest|tiktok|apple\.com|amazon\.|reddit|patch\.com|apartments\.|realtor|zillow|trulia|homefacts|city-data|datacommons|ballotpedia|usnews|niche|bestplaces|areavibes|weather|tripadvisor|eventbrite/i;
export async function searchEngineSite(name, state, type) {
  try {
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (slug.length < 3) return null;
    const q = `${name} ${type === 'county' ? 'County ' : ''}${state === 'OH' ? 'Ohio' : 'Kentucky'} official website government`;
    const r = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, 12000);
    if (!r) return null;
    for (const m of r.html.matchAll(/href="([^"]+)"[^>]*class="[^"]*result__a|class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/gi)) {
      let raw = m[1] || m[2];
      if (!raw) continue;
      try {
        const uddg = raw.match(/uddg=([^&]+)/);
        if (uddg) raw = decodeURIComponent(uddg[1]);
        const u = new URL(raw);
        if (!/^https?:$/.test(u.protocol)) continue;
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (SEARCH_DENY.test(host)) continue;
        const hslug = host.replace(/[^a-z0-9]+/g, '');
        if (!hslug.includes(slug.slice(0, Math.min(slug.length, 10)))) continue;
        return `${u.protocol}//${u.host}`;
      } catch {}
    }
  } catch {}
  return null;
}

export async function discoverSite({ name, state, type, county, profile, profiles }) {
  let site = profile?.website_url || profile?._manual_website_url || profile?.permitting_url || profile?._manual_permitting_url || profile?.research?.website_url || null;
  if (!site) {
    const src = (profile?.office_research?.roles || []).map((r) => r?.official_source_url).find((u) => /^https?:\/\//.test(u || ''));
    if (src) { try { const u = new URL(src); site = `${u.protocol}//${u.host}`; } catch {} }
  }
  if (!site) {
    for (const guess of domainGuesses(name, state, type, county)) {
      const probe = await fetchText(guess, 8000);
      if (probe) { site = probe.url; break; }
      await sleep(150);
    }
  }
  if (!site) {
    await sleep(800);
    site = await wikidataSite(`${name} ${type === 'county' ? 'County' : ''}`.trim(), state === 'OH' ? 'Ohio' : 'Kentucky');
  }
  if (!site) site = await searchEngineSite(name, state, type);
  let countyFallback = null;
  // MP-4.6/4.7 — a jurisdiction with no official site still HAS contacts in
  // the state association rosters (OTA/OML/KLC/KACO). Roster pages are
  // directories, not official sites — flagged separately so evidence carries
  // its provenance.
  let roster = null;
  if (!site) {
    const ROSTERS = {
      OH: { township: 'https://www.ohiotownships.org', city: 'https://www.omlohio.org', village: 'https://www.omlohio.org', county: 'https://www.ccao.org' },
      KY: { township: 'https://www.kaco.org', city: 'https://www.klc.org', village: 'https://www.klc.org', county: 'https://www.kaco.org' },
    };
    const r = ROSTERS[String(state || '').toUpperCase()] || {};
    roster = r[String(type || 'city').toLowerCase()] || r.city || null;
  }
  if (!site && type !== 'county' && county) {
    const cname = String(county).replace(/\s+county$/i, '');
    const cprof = (profiles || []).find((p) => /county/i.test(String(p.type || '')) && String(p.name || '').toLowerCase().includes(cname.toLowerCase()) && String(p.state || '').toUpperCase() === String(state).toUpperCase());
    const csite = cprof?.website_url || cprof?._manual_website_url || cprof?.permitting_url;
    if (csite) { site = csite; countyFallback = `${county} (${state})`; }
  }
  return { site, countyFallback, roster };
}

// Pull the jurisdiction's contact block out of a roster/directory page — the
// name line followed by clerk phone/address/email in the next few lines.
export function rosterContact(pages, name) {
  const base = String(name || '').toLowerCase().replace(/\s+(township|city|village|county)$/i, '').trim();
  if (base.length < 3) return null;
  for (const p of pages || []) {
    const lines = String(p.text || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(base)) continue;
      const block = lines.slice(i, i + 6).join(' ');
      const phone = block.match(PHONE_RE)?.[0];
      const email = block.match(EMAIL_RE)?.[0] || (p.mailto || [])[0];
      const addr = block.match(/\d{1,6}\s+[A-Z][\w\s.]{3,40}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Highway|Hwy|Pike|Court|Ct|Boulevard|Blvd|Way)\b/i)?.[0];
      if (phone || email || addr) return { phone: phone || null, email: email || null, address: addr || null, source_url: p.url };
    }
  }
  return null;
}
