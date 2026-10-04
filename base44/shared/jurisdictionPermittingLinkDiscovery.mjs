const RELEVANT_LINK_RE = /\b(sign|zoning|permit|application|apply|form|fee|checklist|submittal|building|development|ordinance|code)\b/i;
const DOWNLOADABLE_RE = /\.(pdf|doc|docx|xls|xlsx|csv|txt)(?:$|[?#])/i;

function decodeHtmlText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

export function isDownloadableResearchDocument(document = {}) {
  return DOWNLOADABLE_RE.test(String(document?.url || ''));
}

export function permittingDocumentType({ title = '', url = '' } = {}) {
  const haystack = (String(title) + ' ' + String(url)).toLowerCase();
  if (/\b(fee|cost|price)\b/.test(haystack)) return 'fee_schedule';
  if (/\b(checklist|submittal|requirements?)\b/.test(haystack)) return 'checklist';
  if (/\bsign\b/.test(haystack) && /\bordinance|code|regulation|resolution\b/.test(haystack)) return 'sign_ordinance';
  if (/\bzoning\b/.test(haystack) && /\bcode|ordinance|resolution|regulation\b/.test(haystack)) return 'zoning_code';
  if (/\bpermit|application|apply|form\b/.test(haystack)) return 'permit_application';
  if (/\bcode|ordinance|resolution|regulation\b/.test(haystack)) return 'zoning_code';
  return 'other';
}

export function discoverOfficialPermittingResources(html, pageUrl, { maxLinks = 25 } = {}) {
  let base;
  try {
    base = new URL(String(pageUrl || '').trim());
  } catch {
    return [];
  }

  const results = [];
  const seen = new Set();
  const pageTitle = /\b(forms?|permit|apply|application)\b/i.test(base.pathname + base.search)
    ? 'Official permitting/forms page'
    : null;

  if (pageTitle) {
    seen.add(base.href);
    results.push({
      title: pageTitle,
      url: base.href,
      doc_type: 'permit_application',
      source: 'official_page_harvest',
      verification_notes: 'Official permitting/forms page verified by jurisdiction research.',
    });
  }

  const anchorRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html || ''))) !== null && results.length < maxLinks) {
    const rawHref = String(match[1] || '').trim();
    if (!rawHref || rawHref.startsWith('#') || /^javascript:|^mailto:|^tel:/i.test(rawHref)) continue;

    let target;
    try {
      target = new URL(rawHref, base);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(target.protocol)) continue;
    if (normalizedHost(target.hostname) !== normalizedHost(base.hostname)) continue;

    target.hash = '';
    const title = decodeHtmlText(match[2]) || target.pathname.split('/').pop() || 'Official permitting resource';
    const relevance = title + ' ' + target.pathname + ' ' + target.search;
    if (!RELEVANT_LINK_RE.test(relevance)) continue;
    if (seen.has(target.href)) continue;

    seen.add(target.href);
    results.push({
      title,
      url: target.href,
      doc_type: permittingDocumentType({ title, url: target.href }),
      source: 'official_page_harvest',
      verification_notes: 'Discovered from the verified official permitting/forms page.',
    });
  }

  return results;
}
