import { validateExternalPermittingReferral } from './permittingExternalReferrals.mjs';
import { PDF_RESOURCE_METHOD } from './permittingResourceResponse.mjs';
import { discoverOfficialPermittingResources, isDownloadableResearchDocument, permittingResourcePriority, permittingResourceSnapshot, discoverOfficialPermittingReferrals } from './jurisdictionPermittingLinkDiscovery.mjs';

const key = value => { const u = new URL(value); u.hash = ''; u.hostname = u.hostname.replace(/^www\./, ''); return u.href; };
function scopedUrl(value, seed) {
  if (typeof value !== 'string' || value.length > 2000) throw Error('Discovery URL exceeds its storage bounds.');
  const u = new URL(value), root = new URL(seed);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      u.hostname.replace(/^www\./, '') !== root.hostname.replace(/^www\./, '') || u.port !== root.port)
    throw Error('Discovery URL is outside the selected official host.');
  u.hash = ''; return u.href;
}

// No LLM, uploads, entity writes, or rule promotion. The caller supplies the
// SSRF-safe, size/time-limited HTML fetcher. Pending pages are explicit rather
// than silently claiming that a bounded traversal covered the jurisdiction.
export const DISCOVERY_CURSOR_METHOD = 'official-page-frontier-v1';
const CURSOR_MAX_ITEMS = 5000;
const CURSOR_MAX_CHARS = 1024 * 1024;
const frontierError = message => Object.assign(Error(message), { frontier_review_required: true });
function validateCursor(cursor, seedUrl, maxDepth) {
  try {
  if (!cursor || cursor.blocked || cursor.method !== DISCOVERY_CURSOR_METHOD || key(cursor.seed_url) !== key(seedUrl) || cursor.max_depth !== maxDepth ||
      !Number.isInteger(cursor.attempted_pages_total) || cursor.attempted_pages_total < 0 ||
      !Array.isArray(cursor.pending_pages) || !Array.isArray(cursor.visited_urls) || !Array.isArray(cursor.gaps) ||
      (cursor.external_referrals?.length || 0) + cursor.pending_pages.length + cursor.visited_urls.length + cursor.gaps.length > CURSOR_MAX_ITEMS ||
      JSON.stringify(cursor).length > CURSOR_MAX_CHARS)
    throw frontierError('Saved discovery frontier requires review; source, format or bounds changed.');
  for (const url of cursor.visited_urls) scopedUrl(url, seedUrl);
  if(cursor.external_referrals!==undefined && !Array.isArray(cursor.external_referrals))throw Error('Saved external referral inventory requires review.');
  for(const row of cursor.external_referrals || []){
    validateExternalPermittingReferral(row,seedUrl);
    if(!cursor.visited_urls.some(url=>key(url)===key(row.source_page_url)))throw Error('External referral source page was not visited.');
  }
  for (const page of cursor.pending_pages) {
    scopedUrl(page.url, seedUrl);
    if (!Number.isInteger(page.depth) || page.depth < 0 || page.depth > maxDepth) throw Error('Saved discovery page depth requires review.');
  }
  for (const gap of cursor.gaps) { scopedUrl(gap.url, seedUrl); if (typeof gap.reason !== 'string') throw Error('Saved discovery gap requires review.'); }
  } catch (error) { throw frontierError(error.message || 'Saved discovery frontier requires review.'); }
}

export async function scanOfficialPermittingPages({ seedUrl, fetchPage, maxPages = 3, maxDepth = 2, resume = null, existingDocuments = [], recoverLinkLimits = false, recoverFetchFailures = false, recoverDepthUrl = null, onProgress = async()=>{}, rescanUrl=null }) {
  seedUrl = scopedUrl(seedUrl, seedUrl);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30 ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) throw Error('Invalid discovery request size.');
  if (resume) validateCursor(resume, seedUrl, maxDepth);
  const pending = resume ? resume.pending_pages.map(p => ({ url: p.url, depth: p.depth })) : [{ url: seedUrl, depth: 0 }];
  const visited = new Set((resume?.visited_urls || []).map(key));
  const gaps = (resume?.gaps || []).map(g => ({ ...g }));
  const queued = new Set([...visited, ...pending.map(p => key(p.url)), ...gaps.map(g => key(g.url))]);
  const documents = new Map(), pages = [];
  let referrals = (resume?.external_referrals || []).map(row=>({...row}));
  // Existing retained document metadata supplies labels/classification for a
  // pending URL; it is not copied into the new scan's write set.
  const priorDocuments = new Map();
  for (const doc of existingDocuments || []) { try { priorDocuments.set(key(doc.url), doc); } catch {} }
  // Apply current resource ranking to a saved frontier as well as new links.
  // The saved URLs/depths remain intact; no pages or review gaps are reset.
  pending.sort((a, b) => permittingResourcePriority(priorDocuments.get(key(b.url)) || {url:b.url}) - permittingResourcePriority(priorDocuments.get(key(a.url)) || {url:a.url}));
  if(rescanUrl!==null){
    const selected=scopedUrl(rescanUrl,seedUrl),selectedKey=key(selected);
    if(selectedKey!==key(seedUrl) && !resume?.visited_urls?.some(url=>key(url)===selectedKey) && !resume?.pending_pages?.some(page=>key(page.url)===selectedKey))throw frontierError('Rescan source is not a saved official discovery page.');
    if(recoverLinkLimits || recoverFetchFailures || recoverDepthUrl!==null)throw frontierError('Select one rescan or recovery mode.');
    visited.delete(selectedKey);
    for(let i=pending.length-1;i>=0;i--)if(key(pending[i].url)===selectedKey)pending.splice(i,1);
    pending.unshift({url:selected,depth:0});
  }
  if (Number(recoverLinkLimits) + Number(recoverFetchFailures) + Number(recoverDepthUrl !== null) > 1) throw frontierError('Select one discovery recovery mode.');
  const selectedDepthKey = recoverDepthUrl !== null ? key(scopedUrl(recoverDepthUrl, seedUrl)) : null;
  if (selectedDepthKey && !gaps.some(g => g.reason === 'depth_frontier' && key(g.url) === selectedDepthKey))
    throw frontierError('Selected depth URL is not a saved review gap.');
  const recoveryReason = selectedDepthKey ? 'depth_frontier' : recoverLinkLimits ? 'page_link_limit' : recoverFetchFailures ? 'page_fetch_failed' : null;
  if (recoveryReason && !resume) throw frontierError('Link recovery requires saved discovery progress.');
  let attempted = 0;
  while ((recoveryReason ? gaps.some(g => g.reason === recoveryReason) : pending.length) && attempted < (selectedDepthKey ? 1 : maxPages)) {
    const recoveryGap = recoveryReason ? gaps.find(g => g.reason === recoveryReason && (!selectedDepthKey || key(g.url) === selectedDepthKey)) : null;
    const inferredDepth = recoveryGap && [...priorDocuments.values()].find(d => d.discovery_page_url && key(d.discovery_page_url) === key(recoveryGap.url))?.discovery_depth;
    const next = recoveryGap ? {url:recoveryGap.url, depth:selectedDepthKey ? maxDepth : recoveryGap.depth ?? inferredDepth ?? maxDepth} : pending.shift();
    const offset = recoveryGap?.link_hash_method === 'ordered-resource-list-v1' ? (recoveryGap.link_offset ?? 0) : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 5000 || !Number.isInteger(next.depth) || next.depth < 0 || next.depth > maxDepth)
      throw frontierError('Saved link recovery bounds require review.');
    const nextKey = key(next.url);
    if (!recoveryGap && visited.has(nextKey)) continue;
    visited.add(nextKey); attempted++;
    try {
      await onProgress({kind:'page_start',url:next.url,detail:`Scanning page at depth ${next.depth}.`,progress:{stage:'Scanning official pages',current_url:next.url,processed:attempted-1,total:maxPages,indeterminate:false}});
      const response = await fetchPage(next.url);
      const finalUrl = scopedUrl(response.finalUrl || next.url, seedUrl), finalKey = key(finalUrl);
      if (!recoveryGap && finalKey !== nextKey && visited.has(finalKey)) { pages.push({ ...next, final_url: finalUrl, status: 'redirect_duplicate' }); continue; }
      visited.add(finalKey);
      if (response.resource_kind === 'pdf' && response.classification_method === PDF_RESOURCE_METHOD) {
        const existing = documents.get(nextKey) || priorDocuments.get(nextKey) || { title: 'Official PDF resource', url: next.url, doc_type: 'other', source: 'official_page_harvest' };
        documents.set(nextKey, { ...existing, resource_classification: { kind: 'pdf', method: PDF_RESOURCE_METHOD,
          source_url: existing.url, final_url: finalUrl }, verification_notes: (existing.verification_notes || '') +
          ' PDF MIME type and signature checked; full-byte archival and authority review remain required.' });
        if (recoveryGap) gaps.splice(gaps.indexOf(recoveryGap), 1);
        pages.push({ ...next, final_url: finalUrl, status: 'classified_pdf' });
        continue;
      }
      if (typeof response.html !== 'string' || !response.html.trim()) throw Error('Official page returned no usable static HTML.');
      const contentHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(permittingResourceSnapshot(response.html,finalUrl).map(d=>({url:d.url,title:d.title}))))))].map(b => b.toString(16).padStart(2,'0')).join('');
      if (recoveryGap?.link_hash_method === 'ordered-resource-list-v1' && recoveryGap.link_content_sha256 && recoveryGap.link_content_sha256 !== contentHash)
        throw Error('Capped page changed during recovery; saved offset requires review.');
      let pageReferrals;
      try { pageReferrals=discoverOfficialPermittingReferrals(response.html,finalUrl); }
      catch(error){throw frontierError(error.message);}
      const pageSha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(response.html)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      // Replace observations from this successfully read page; retain other page
      // provenance, including a second official page pointing to the same URL.
      referrals=[...referrals.filter(row=>key(row.source_page_url)!==finalKey),
        ...pageReferrals.map(row=>({...row,source_page_sha256:pageSha}))];
      const batch = discoverOfficialPermittingResources(response.html, finalUrl, { maxLinks: 100, offset });
      const found = batch;
      await onProgress({kind:'found',url:finalUrl,detail:`Found ${found.length} same-host resources and ${pageReferrals.length} external referrals.`,resources:[...found,...pageReferrals],progress:{processed:attempted,total:maxPages,indeterminate:false}});
      if (recoveryGap) gaps.splice(gaps.indexOf(recoveryGap), 1);
      pages.push({ ...next, final_url: finalUrl, status: 'scanned', discovered_resources: found.length, ...(recoveryGap ? {recovered_link_offset:offset} : {}) });
      if (found.length === 100) gaps.push({ url: finalUrl, reason: 'page_link_limit', depth:next.depth, link_offset:offset + found.length, link_content_sha256:contentHash, link_hash_method:'ordered-resource-list-v1', requires_review: true });
      for (const doc of found) {
        if (doc.url.length > 2000) { gaps.push({url:finalUrl,reason:'oversized_resource_url',requires_review:true}); continue; }
        const sourceKey = key(doc.url);
        if (!documents.has(sourceKey)) documents.set(sourceKey, { ...doc,
          discovery_page_url: finalUrl, discovery_depth: next.depth,
          verification_notes: doc.verification_notes + ' Discovery page: ' + finalUrl });
        if (isDownloadableResearchDocument(doc) || visited.has(sourceKey) || queued.has(sourceKey)) continue;
        queued.add(sourceKey);
        if (next.depth >= maxDepth) { gaps.push({ url: doc.url, reason: 'depth_frontier', requires_review: true }); continue; }
        pending.push({ url: doc.url, depth: next.depth + 1 });
        pending.sort((a, b) => permittingResourcePriority(documents.get(key(b.url)) || priorDocuments.get(key(b.url))) - permittingResourcePriority(documents.get(key(a.url)) || priorDocuments.get(key(a.url))));
      }
    } catch (error) {
      if(error.frontier_review_required)throw error;
      const reason = String(error?.message || error).slice(0, 300);
      await onProgress({kind:'page_failed',url:next.url,detail:reason,progress:{processed:attempted,total:maxPages}});
      pages.push({ ...next, status: 'failed', error: reason });
      if (!recoveryGap) gaps.push({ url: next.url, reason: 'page_fetch_failed', depth: next.depth, detail: reason, requires_review: true });
      // Retain the recovery gap and offset after failures; no false completion.
      if (recoveryGap) break;
    }
  }
  await onProgress({kind:'discovery_summary',detail:`${attempted} pages attempted; ${documents.size} resources found; ${gaps.length} review gaps.`,resources:[...documents.values()],progress:{processed:attempted,total:attempted,indeterminate:false}});
  const pendingPages = pending.filter(p => !visited.has(key(p.url)));
  const continuationState = { external_initial_collection_drained:false, method: DISCOVERY_CURSOR_METHOD, seed_url: seedUrl, max_depth: maxDepth,
    visited_urls: [...visited], pending_pages: pendingPages, gaps, external_referrals:referrals,
    attempted_pages_total: (Number(resume?.attempted_pages_total) || 0) + attempted };
  if (referrals.length + continuationState.visited_urls.length + pendingPages.length + gaps.length > CURSOR_MAX_ITEMS ||
      JSON.stringify(continuationState).length > CURSOR_MAX_CHARS)
    throw frontierError('Discovery frontier storage bounds reached; prior saved progress must be preserved for review.');
  return { success: pages.some(p => ['scanned', 'classified_pdf'].includes(p.status)) || Boolean(resume && attempted === 0 && !pendingPages.length), documents: [...documents.values()], pages, external_referrals:referrals, external_referrals_require_review:referrals.length>0,
    pending_pages: pendingPages, gaps, attempted_pages: attempted, continuation_state: continuationState, resumed: Boolean(resume), recovering_link_limits: recoverLinkLimits, recovering_fetch_failures: recoverFetchFailures, recovering_depth_url: recoverDepthUrl,
    traversal_complete: pending.every(p => visited.has(key(p.url))) && gaps.length === 0,
    jurisdiction_coverage_complete: false, authority_established: false, llm_calls: 0, external_requests_scheduled:0,
    limitations: ['Static same-host HTML discovery only; external department/code/portal referrals require separately established scope.',
      'PDF classification is a routing hint; full original-byte verification occurs during archival.',
      'Saved failed pages and depth/link gaps require separate review; traversal completion does not establish locality coverage.'] };
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
