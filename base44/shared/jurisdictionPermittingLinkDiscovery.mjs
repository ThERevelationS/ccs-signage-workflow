import { hasClassifiedPdfResource } from './permittingResourceResponse.mjs';
const RELEVANT_LINK_RE = /\b(signs?|zoning|permits?|applications?|apply|forms?|fees?|checklists?|submittals?|building|development|ordinances?|codes?|regulations?|resolutions?|variances?|conditional use)\b/i;
const DOWNLOADABLE_RE = /\.(pdf|doc|docx|xls|xlsx|csv|txt)(?:$|[?#])/i;

function decodeHtmlText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

function linkWords(value) {
  try { value = decodeURIComponent(value); } catch {}
  return String(value).replace(/[_-]+/g, ' ');
}

export function isDownloadableResearchDocument(document = {}) {
  return DOWNLOADABLE_RE.test(String(document?.url || '')) || hasClassifiedPdfResource(document);
}

// Labels and the destination leaf describe the resource; ancestor forms/sign
// directories must not promote every unrelated child to the same priority.
export function permittingResourcePriority(doc = {}) {
  let leaf = '';
  try { const u = new URL(doc.url); leaf = u.pathname.split('/').filter(Boolean).pop() || ''; } catch {}
  const words = linkWords(String(doc.title || '') + ' ' + leaf);
  if (/\b(signs?|outdoor advertising)\b/i.test(words)) return 100;
  if (/\b(forms?|applications?|checklists?|submittals?)\b/i.test(words)) return 60;
  if (/\b(fees?|costs?)\b/i.test(words)) return 40;
  return 10;
}

export function permittingDocumentType({ title = '', url = '' } = {}) {
  const haystack = linkWords(String(title) + ' ' + String(url)).toLowerCase();
  if (/\b(fees?|costs?|prices?)\b/.test(haystack)) return 'fee_schedule';
  if (/\b(checklists?|submittals?|requirements?)\b/.test(haystack)) return 'checklist';
  if (/\bsigns?\b/.test(haystack) && /\b(ordinances?|codes?|regulations?|resolutions?)\b/.test(haystack)) return 'sign_ordinance';
  if (/\bzoning\b/.test(haystack) && /\b(codes?|ordinances?|resolutions?|regulations?)\b/.test(haystack)) return 'zoning_code';
  if (/\b(permits?|applications?|apply|forms?)\b/.test(haystack)) return 'permit_application';
  if (/\b(codes?|ordinances?|resolutions?|regulations?)\b/.test(haystack)) return 'zoning_code';
  return 'other';
}

export function discoverOfficialPermittingResources(html, pageUrl, { maxLinks = 25, offset = 0 } = {}) {
  let page;
  try { page = new URL(String(pageUrl || '').trim()); } catch { return []; }
  if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password) return [];
  const limit = Math.max(0, Math.min(100, Math.floor(Number(maxLinks) || 0)));
  if (!limit) return [];
  const markup = String(html || '').replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  let base = page;
  const baseHref = /<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(markup)?.[1];
  if (baseHref) {
    try {
      const candidate = new URL(decodeHtmlText(baseHref), page);
      if (['http:', 'https:'].includes(candidate.protocol) &&
          normalizedHost(candidate.hostname) === normalizedHost(page.hostname) &&
          !candidate.username && !candidate.password && candidate.port === page.port) base = candidate;
    } catch {}
  }
  const results = [];
  const seen = new Set();
  page.hash = '';
  if (/\b(forms?|permits?|apply|applications?)\b/i.test(linkWords(page.pathname + page.search))) {
    seen.add(page.href);
    results.push({
      title: 'Official permitting/forms page',
      url: page.href,
      doc_type: 'permit_application',
      source: 'official_page_harvest',
      verification_notes: 'Retained official permitting/forms source; regulatory authority requires separate review.',
    });
  }

  const candidates = [];
  const anchorRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(markup)) !== null) {
    const rawHref = decodeHtmlText(match[1]);
    if (!rawHref || rawHref.startsWith('#') || /^(javascript:|mailto:|tel:)/i.test(rawHref)) continue;
    let target;
    try { target = new URL(rawHref, base); } catch { continue; }
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.port !== page.port) continue;
    if (normalizedHost(target.hostname) !== normalizedHost(page.hostname)) continue;
    target.hash = '';
    const title = decodeHtmlText(match[2]);
    // Use the raw href: an inherited /zoning/ directory must not make Home,
    // schools, calendar, language selectors, or other navigation relevant.
    const relevance = linkWords(title + ' ' + rawHref.split('#')[0]);
    if (!RELEVANT_LINK_RE.test(relevance) || /^(home|skip to|login|read more)\b/i.test(title)) continue;
    if (/\b(house number|house numbering|address assignment|nondiscrimination|fraud|waste and abuse|employment|careers?|jobs?|newsletters?|e alerts?|subscribe|sign up)\b/i.test(relevance)) continue;
    if (seen.has(target.href)) continue;
    seen.add(target.href);
    candidates.push({
      title: title || target.pathname.split('/').pop() || 'Official permitting resource',
      url: target.href,
      doc_type: permittingDocumentType({ title, url: target.href }),
      source: 'official_page_harvest',
      verification_notes: 'Discovered from the retained official permitting/forms page; authority not inferred.',
    });
  }
  // Rank sign resources before slicing: extensionless government downloads
  // otherwise disappear behind alphabetically earlier forms and navigation.
  candidates.sort((a, b) =>
    Number(permittingResourcePriority(b) === 100) - Number(permittingResourcePriority(a) === 100) ||
    Number(isDownloadableResearchDocument(b)) - Number(isDownloadableResearchDocument(a)));
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) throw Error('Invalid discovery link offset.');
  return [...results, ...candidates].slice(offset, offset + limit);
}
