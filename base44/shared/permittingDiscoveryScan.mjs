import { PDF_RESOURCE_METHOD } from './permittingResourceResponse.mjs';
import { discoverOfficialPermittingResources, isDownloadableResearchDocument } from './jurisdictionPermittingLinkDiscovery.mjs';

const key = value => { const u = new URL(value); u.hash = ''; u.hostname = u.hostname.replace(/^www\./, ''); return u.href; };
function scopedUrl(value, seed) {
  const u = new URL(value), root = new URL(seed);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      u.hostname.replace(/^www\./, '') !== root.hostname.replace(/^www\./, '') || u.port !== root.port)
    throw Error('Discovery URL is outside the selected official host.');
  u.hash = ''; return u.href;
}

function pagePriority(doc = {}) {
  let words = String(doc.title || '') + ' ' + String(doc.url || '');
  try { words = decodeURIComponent(words); } catch {}
  words = words.replace(/[_-]+/g, ' ');
  if (/\b(signs?|outdoor advertising)\b/i.test(words)) return 100;
  if (/\b(forms?|applications?|checklists?|submittals?)\b/i.test(words)) return 60;
  if (/\b(fees?)\b/i.test(words)) return 40;
  return 10;
}

// No LLM, uploads, entity writes, or rule promotion. The caller supplies the
// SSRF-safe, size/time-limited HTML fetcher. Pending pages are explicit rather
// than silently claiming that a bounded traversal covered the jurisdiction.
export async function scanOfficialPermittingPages({ seedUrl, fetchPage, maxPages = 3, maxDepth = 2 }) {
  seedUrl = scopedUrl(seedUrl, seedUrl);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30 ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) throw Error('Invalid discovery request size.');
  const pending = [{ url: seedUrl, depth: 0 }], queued = new Set([key(seedUrl)]), visited = new Set();
  const documents = new Map(), pages = [], gaps = [];
  let attempted = 0;
  while (pending.length && attempted < maxPages) {
    const next = pending.shift(), nextKey = key(next.url);
    if (visited.has(nextKey)) continue;
    visited.add(nextKey); attempted++;
    try {
      const response = await fetchPage(next.url);
      const finalUrl = scopedUrl(response.finalUrl || next.url, seedUrl), finalKey = key(finalUrl);
      if (finalKey !== nextKey && visited.has(finalKey)) { pages.push({ ...next, final_url: finalUrl, status: 'redirect_duplicate' }); continue; }
      visited.add(finalKey);
      if (response.resource_kind === 'pdf' && response.classification_method === PDF_RESOURCE_METHOD) {
        const existing = documents.get(nextKey) || { title: 'Official PDF resource', url: next.url, doc_type: 'other', source: 'official_page_harvest' };
        documents.set(nextKey, { ...existing, resource_classification: { kind: 'pdf', method: PDF_RESOURCE_METHOD,
          source_url: existing.url, final_url: finalUrl }, verification_notes: (existing.verification_notes || '') +
          ' PDF MIME type and signature checked; full-byte archival and authority review remain required.' });
        pages.push({ ...next, final_url: finalUrl, status: 'classified_pdf' });
        continue;
      }
      if (typeof response.html !== 'string' || !response.html.trim()) throw Error('Official page returned no usable static HTML.');
      const found = discoverOfficialPermittingResources(response.html, finalUrl, { maxLinks: 100 });
      pages.push({ ...next, final_url: finalUrl, status: 'scanned', discovered_resources: found.length });
      if (found.length === 100) gaps.push({ url: finalUrl, reason: 'page_link_limit', requires_review: true });
      for (const doc of found) {
        const sourceKey = key(doc.url);
        if (!documents.has(sourceKey)) documents.set(sourceKey, { ...doc,
          discovery_page_url: finalUrl, discovery_depth: next.depth,
          verification_notes: doc.verification_notes + ' Discovery page: ' + finalUrl });
        if (isDownloadableResearchDocument(doc) || visited.has(sourceKey) || queued.has(sourceKey)) continue;
        queued.add(sourceKey);
        if (next.depth >= maxDepth) { gaps.push({ url: doc.url, reason: 'depth_frontier', requires_review: true }); continue; }
        pending.push({ url: doc.url, depth: next.depth + 1 });
        pending.sort((a, b) => pagePriority(documents.get(key(b.url))) - pagePriority(documents.get(key(a.url))));
      }
    } catch (error) {
      const reason = String(error?.message || error).slice(0, 300);
      pages.push({ ...next, status: 'failed', error: reason });
      gaps.push({ url: next.url, reason: 'page_fetch_failed', detail: reason, requires_review: true });
    }
  }
  return { success: pages.some(p => ['scanned', 'classified_pdf'].includes(p.status)), documents: [...documents.values()], pages,
    pending_pages: pending.filter(p => !visited.has(key(p.url))), gaps, attempted_pages: attempted,
    traversal_complete: pending.every(p => visited.has(key(p.url))) && gaps.length === 0,
    jurisdiction_coverage_complete: false, authority_established: false, llm_calls: 0,
    limitations: ['Static same-host HTML discovery only; external department/code/portal referrals require separately established scope.',
      'PDF classification is a routing hint; full original-byte verification occurs during archival.',
      'Pending pages and failures are returned; a durable cross-run frontier is not yet implemented.'] };
}

// A partial AI answer cannot suppress deterministic official-page discovery.
// Preserve AI metadata on duplicate URLs; append the missing harvested sources.
export function combineResearchAndDiscoveredDocuments(researched, discovered) {
  const rows = [], seen = new Set();
  for (const doc of [...(Array.isArray(researched) ? researched : []), ...(Array.isArray(discovered) ? discovered : [])]) {
    if (!doc?.url) continue;
    let sourceKey; try { sourceKey = key(doc.url); } catch { continue; }
    if (seen.has(sourceKey)) {
      if (doc.resource_classification?.method === PDF_RESOURCE_METHOD) {
        const index = rows.findIndex(row => key(row.url) === sourceKey);
        rows[index] = { ...rows[index], resource_classification: { ...doc.resource_classification, source_url: rows[index].url } };
      }
      continue;
    }
    seen.add(sourceKey); rows.push(doc);
  }
  return rows;
}
