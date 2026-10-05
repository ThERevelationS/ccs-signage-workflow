import { discoverOfficialPermittingResources, isDownloadableResearchDocument } from './jurisdictionPermittingLinkDiscovery.mjs';

const key = value => { const u = new URL(value); u.hash = ''; u.hostname = u.hostname.replace(/^www\./, ''); return u.href; };
function scopedUrl(value, seed) {
  const u = new URL(value), root = new URL(seed);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      u.hostname.replace(/^www\./, '') !== root.hostname.replace(/^www\./, '') || u.port !== root.port)
    throw Error('Discovery URL is outside the selected official host.');
  u.hash = ''; return u.href;
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
      }
    } catch (error) {
      const reason = String(error?.message || error).slice(0, 300);
      pages.push({ ...next, status: 'failed', error: reason });
      gaps.push({ url: next.url, reason: 'page_fetch_failed', detail: reason, requires_review: true });
    }
  }
  return { success: pages.some(p => p.status === 'scanned'), documents: [...documents.values()], pages,
    pending_pages: pending.filter(p => !visited.has(key(p.url))), gaps, attempted_pages: attempted,
    traversal_complete: pending.every(p => visited.has(key(p.url))) && gaps.length === 0,
    jurisdiction_coverage_complete: false, authority_established: false, llm_calls: 0 };
}

// A partial AI answer cannot suppress deterministic official-page discovery.
// Preserve AI metadata on duplicate URLs; append the missing harvested sources.
export function combineResearchAndDiscoveredDocuments(researched, discovered) {
  const rows = [], seen = new Set();
  for (const doc of [...(Array.isArray(researched) ? researched : []), ...(Array.isArray(discovered) ? discovered : [])]) {
    if (!doc?.url) continue;
    let sourceKey; try { sourceKey = key(doc.url); } catch { continue; }
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey); rows.push(doc);
  }
  return rows;
}
