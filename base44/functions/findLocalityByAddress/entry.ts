// base44/shared/permittingExternalReferrals.mjs
var EXTERNAL_REFERRAL_METHOD = "official-page-external-link-v1";
var host = (value) => value.toLowerCase().replace(/^www\./, "");
function referralWebUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 2e3) return null;
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.port) return null;
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!h || h === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h) || h.includes(":") || /^\d+(?:\.\d+){3}$/.test(h)) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}
function externalReferralKind({ url, title = "" }) {
  const u = new URL(url), words = (title + " " + u.pathname).replace(/[_-]/g, " ");
  if (/\.(pdf|docx?|xlsx?|csv|txt)$/i.test(u.pathname)) return "downloadable_document";
  if (/(^|\.)amlegal\.com$|(^|\.)municode\.com$|(^|\.)ecode360\.com$/.test(u.hostname) || /\b(codes?|ordinances?|regulations?|resolutions?)\b/i.test(words)) return "code_publisher";
  if (/\b(apply|applications?|forms?|portal|eztrak|citizenaccess|epermits)\b/i.test(words + " " + u.hostname)) return "online_form";
  if (/\b(departments?|building|zoning|electrical|electric|inspections?|inspectors?)\b/i.test(words)) return "department_reference";
  return "other_permitting_resource";
}
function createExternalPermittingReferral({ url, title, sourcePageUrl, linkedHref, resolutionBaseUrl, element = "anchor" }) {
  const target = referralWebUrl(url), page = referralWebUrl(sourcePageUrl), base = referralWebUrl(resolutionBaseUrl);
  if (!target || !page || !base || host(target.hostname) === host(page.hostname) || host(base.hostname) !== host(page.hostname) || typeof linkedHref !== "string" || linkedHref.length > 2e3 || typeof title !== "string" || title.length > 1e3) return null;
  let resolved;
  try {
    resolved = referralWebUrl(new URL(linkedHref, base).href);
  } catch {
    return null;
  }
  if (!resolved || resolved.href !== target.href) return null;
  return {
    url: target.href,
    title,
    source_page_url: page.href,
    linked_href: linkedHref,
    resolution_base_url: base.href,
    discovery_element: element,
    referral_kind: externalReferralKind({ url: target.href, title }),
    provenance_method: EXTERNAL_REFERRAL_METHOD,
    verification_status: "needs_verification",
    fetch_scope_approved: false,
    authority_established: false
  };
}
function validateExternalPermittingReferral(row, seedUrl) {
  if (!row || row.provenance_method !== EXTERNAL_REFERRAL_METHOD || row.verification_status !== "needs_verification" || row.fetch_scope_approved !== false || row.authority_established !== false || !/^[a-f0-9]{64}$/.test(row.source_page_sha256 || "") || !["anchor", "iframe", "embed", "object"].includes(row.discovery_element)) throw Error("External referral provenance requires review.");
  const page = referralWebUrl(row.source_page_url), seed = referralWebUrl(seedUrl);
  if (!page || !seed || host(page.hostname) !== host(seed.hostname)) throw Error("External referral belongs to another official source.");
  const rebuilt = createExternalPermittingReferral({
    url: row.url,
    title: row.title,
    sourcePageUrl: row.source_page_url,
    linkedHref: row.linked_href,
    resolutionBaseUrl: row.resolution_base_url,
    element: row.discovery_element
  });
  if (!rebuilt || rebuilt.referral_kind !== row.referral_kind) throw Error("External referral link identity requires review.");
  return row;
}

// base44/shared/permittingResourceResponse.mjs
var PDF_RESOURCE_METHOD = "http-mime-signature-v1";
function hasClassifiedPdfResource(doc) {
  const r = doc?.resource_classification;
  return r?.kind === "pdf" && r.method === PDF_RESOURCE_METHOD && r.source_url === doc.url;
}
async function readPermittingResourceResponse(response, { htmlMaxBytes = 2 * 1024 * 1024 } = {}) {
  if (!response.ok) throw Error("Official resource returned HTTP " + response.status);
  const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const pdf = type === "application/pdf";
  if (!pdf && !["text/html", "application/xhtml+xml"].includes(type)) throw Error("Unsupported official resource content type.");
  if (!pdf && Number(response.headers.get("content-length") || 0) > htmlMaxBytes) throw Error("Official HTML exceeds its byte limit.");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Official resource has no readable response body.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      if (pdf) {
        const part = value.slice(0, Math.max(0, 5 - size));
        chunks.push(part);
        size += part.length;
        if (size >= 5) break;
      } else {
        size += value.length;
        if (size > htmlMaxBytes) throw Error("Official HTML exceeds its byte limit.");
        chunks.push(value);
      }
    }
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (pdf) {
    if (new TextDecoder().decode(bytes) !== "%PDF-") throw Error("PDF MIME type has no PDF signature.");
    return { resource_kind: "pdf", classification_method: PDF_RESOURCE_METHOD, finalUrl: response.url };
  }
  return { html: new TextDecoder().decode(bytes), finalUrl: response.url };
}

// base44/shared/jurisdictionPermittingLinkDiscovery.mjs
var RELEVANT_LINK_RE = /\b(signs?|zoning|permits?|applications?|apply|forms?|fees?|checklists?|submittals?|building|electrical|electric|inspections?|inspectors?|development|ordinances?|codes?|regulations?|resolutions?|variances?|conditional use)\b/i;
var DOWNLOADABLE_RE = /\.(pdf|doc|docx|xls|xlsx|csv|txt)(?:$|[?#])/i;
function decodeHtmlText(value = "") {
  return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}
function normalizedHost(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}
function linkWords(value) {
  try {
    value = decodeURIComponent(value);
  } catch {
  }
  return String(value).replace(/[_-]+/g, " ");
}
function isDownloadableResearchDocument(document = {}) {
  return DOWNLOADABLE_RE.test(String(document?.url || "")) || hasClassifiedPdfResource(document);
}
function permittingResourcePriority(doc = {}) {
  let leaf = "";
  try {
    const u = new URL(doc.url);
    leaf = u.pathname.split("/").filter(Boolean).pop() || "";
  } catch {
  }
  const words = linkWords(String(doc.title || "") + " " + leaf);
  if (/\b(signs?|outdoor advertising)\b/i.test(words)) return 100;
  if (/\b(forms?|applications?|checklists?|submittals?)\b/i.test(words)) return 60;
  if (/\b(fees?|costs?)\b/i.test(words)) return 40;
  return 10;
}
function permittingDocumentType({ title = "", url = "" } = {}) {
  const haystack = linkWords(String(title) + " " + String(url)).toLowerCase();
  if (/\b(fees?|costs?|prices?)\b/.test(haystack)) return "fee_schedule";
  if (/\b(checklists?|submittals?|requirements?)\b/.test(haystack)) return "checklist";
  if (/\bsigns?\b/.test(haystack) && /\b(ordinances?|codes?|regulations?|resolutions?)\b/.test(haystack)) return "sign_ordinance";
  if (/\bzoning\b/.test(haystack) && /\b(codes?|ordinances?|resolutions?|regulations?)\b/.test(haystack)) return "zoning_code";
  if (/\b(permits?|applications?|apply|forms?)\b/.test(haystack)) return "permit_application";
  if (/\b(codes?|ordinances?|resolutions?|regulations?)\b/.test(haystack)) return "zoning_code";
  return "other";
}
function collectOfficialPermittingResources(html, pageUrl, { maxLinks = 25, offset = 0, externalOnly = false } = {}) {
  let page;
  try {
    page = new URL(String(pageUrl || "").trim());
  } catch {
    return [];
  }
  if (!["http:", "https:"].includes(page.protocol) || page.username || page.password) return [];
  const limit = Math.max(0, Math.min(5001, Math.floor(Number(maxLinks) || 0)));
  if (!limit) return [];
  const markup = String(html || "").replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  let base = page;
  const baseHref = /<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(markup)?.[1];
  if (baseHref) {
    try {
      const candidate = new URL(decodeHtmlText(baseHref), page);
      if (["http:", "https:"].includes(candidate.protocol) && normalizedHost(candidate.hostname) === normalizedHost(page.hostname) && !candidate.username && !candidate.password && candidate.port === page.port) base = candidate;
    } catch {
    }
  }
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  page.hash = "";
  if (!externalOnly && /\b(forms?|permits?|apply|applications?)\b/i.test(linkWords(page.pathname + page.search))) {
    seen.add(page.href);
    results.push({
      title: "Official permitting/forms page",
      url: page.href,
      doc_type: "permit_application",
      source: "official_page_harvest",
      verification_notes: "Retained official permitting/forms source; regulatory authority requires separate review."
    });
  }
  const candidates = [];
  const anchorRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const links = [];
  while ((match = anchorRe.exec(markup)) !== null) links.push({ href: match[1], label: match[2] });
  const embedRe = /<(iframe|embed|object)\b([^>]*)>/gi;
  while ((match = embedRe.exec(markup)) !== null) {
    const attrs = match[2];
    const attr = (name) => new RegExp("(?:^|\\s)" + name + `\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1] || "";
    const href = attr(match[1].toLowerCase() === "object" ? "data" : "src");
    const embeddedForm = externalOnly && /\b(forms?|applications?|apply|permits?|portal|eztrak|citizenaccess)\b/i.test(linkWords(href + " " + attr("title") + " " + attr("aria-label")));
    if (!DOWNLOADABLE_RE.test(decodeHtmlText(href)) && !/application\/pdf/i.test(attr("type")) && !embeddedForm) continue;
    links.push({ href, label: attr("title") || attr("aria-label"), embedded: match[1].toLowerCase() });
  }
  for (const link of links) {
    const rawHref = decodeHtmlText(link.href);
    if (!rawHref || rawHref.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(rawHref)) continue;
    let target;
    try {
      target = new URL(rawHref, base);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || (externalOnly ? Boolean(target.port) : target.port !== page.port)) continue;
    if (normalizedHost(target.hostname) !== normalizedHost(page.hostname) !== externalOnly) continue;
    target.hash = "";
    const title = decodeHtmlText(link.label);
    const relevance = linkWords(title + " " + rawHref.split("#")[0]);
    if (!(RELEVANT_LINK_RE.test(relevance) || externalOnly && /\b(portals?|eztrak|citizenaccess)\b/i.test(relevance)) || /^(home|skip to|login|read more)\b/i.test(title)) continue;
    if (/\b(house number|house numbering|address assignment|nondiscrimination|fraud|waste and abuse|employment|careers?|jobs?|newsletters?|e alerts?|subscribe|sign up)\b/i.test(relevance)) continue;
    if (seen.has(target.href)) continue;
    seen.add(target.href);
    if (externalOnly) {
      const referral = createExternalPermittingReferral({
        url: target.href,
        title: title || target.pathname.split("/").pop() || "Permitting reference",
        sourcePageUrl: page.href,
        linkedHref: rawHref,
        resolutionBaseUrl: base.href,
        element: link.embedded || "anchor"
      });
      if (referral) candidates.push(referral);
      continue;
    }
    candidates.push({
      title: title || target.pathname.split("/").pop() || "Official permitting resource",
      url: target.href,
      doc_type: permittingDocumentType({ title, url: target.href }),
      source: "official_page_harvest",
      ...link.embedded ? { discovery_element: link.embedded } : {},
      verification_notes: "Discovered from the retained official permitting/forms page; authority not inferred."
    });
  }
  candidates.sort((a, b) => Number(permittingResourcePriority(b) === 100) - Number(permittingResourcePriority(a) === 100) || Number(isDownloadableResearchDocument(b)) - Number(isDownloadableResearchDocument(a)));
  if (!Number.isInteger(offset) || offset < 0 || offset > 5e3) throw Error("Invalid discovery link offset.");
  return [...results, ...candidates].slice(offset, offset + limit);
}
function discoverOfficialPermittingResources(html, pageUrl, { maxLinks = 25, offset = 0 } = {}) {
  return collectOfficialPermittingResources(html, pageUrl, { maxLinks: Math.min(100, maxLinks), offset });
}
function permittingResourceSnapshot(html, pageUrl) {
  const rows = collectOfficialPermittingResources(html, pageUrl, { maxLinks: 5001 });
  if (rows.length > 5e3) throw Error("Page resource storage bounds require review.");
  return rows;
}
function discoverOfficialPermittingReferrals(html, pageUrl) {
  const rows = collectOfficialPermittingResources(html, pageUrl, { maxLinks: 5001, externalOnly: true });
  if (rows.length > 5e3) throw Error("External referral storage bounds require review.");
  return rows;
}

// base44/shared/permittingDiscoveryScan.mjs
var key = (value) => {
  const u = new URL(value);
  u.hash = "";
  u.hostname = u.hostname.replace(/^www\./, "");
  return u.href;
};
function scopedUrl(value, seed) {
  if (typeof value !== "string" || value.length > 2e3) throw Error("Discovery URL exceeds its storage bounds.");
  const u = new URL(value), root = new URL(seed);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.hostname.replace(/^www\./, "") !== root.hostname.replace(/^www\./, "") || u.port !== root.port)
    throw Error("Discovery URL is outside the selected official host.");
  u.hash = "";
  return u.href;
}
var DISCOVERY_CURSOR_METHOD = "official-page-frontier-v1";
var CURSOR_MAX_ITEMS = 5e3;
var CURSOR_MAX_CHARS = 1024 * 1024;
var frontierError = (message) => Object.assign(Error(message), { frontier_review_required: true });
function validateCursor(cursor, seedUrl, maxDepth) {
  try {
    if (!cursor || cursor.blocked || cursor.method !== DISCOVERY_CURSOR_METHOD || key(cursor.seed_url) !== key(seedUrl) || cursor.max_depth !== maxDepth || !Number.isInteger(cursor.attempted_pages_total) || cursor.attempted_pages_total < 0 || !Array.isArray(cursor.pending_pages) || !Array.isArray(cursor.visited_urls) || !Array.isArray(cursor.gaps) || (cursor.external_referrals?.length || 0) + cursor.pending_pages.length + cursor.visited_urls.length + cursor.gaps.length > CURSOR_MAX_ITEMS || JSON.stringify(cursor).length > CURSOR_MAX_CHARS)
      throw frontierError("Saved discovery frontier requires review; source, format or bounds changed.");
    for (const url of cursor.visited_urls) scopedUrl(url, seedUrl);
    if (cursor.external_referrals !== void 0 && !Array.isArray(cursor.external_referrals)) throw Error("Saved external referral inventory requires review.");
    for (const row of cursor.external_referrals || []) {
      validateExternalPermittingReferral(row, seedUrl);
      if (!cursor.visited_urls.some((url) => key(url) === key(row.source_page_url))) throw Error("External referral source page was not visited.");
    }
    for (const page of cursor.pending_pages) {
      scopedUrl(page.url, seedUrl);
      if (!Number.isInteger(page.depth) || page.depth < 0 || page.depth > maxDepth) throw Error("Saved discovery page depth requires review.");
    }
    for (const gap of cursor.gaps) {
      scopedUrl(gap.url, seedUrl);
      if (typeof gap.reason !== "string") throw Error("Saved discovery gap requires review.");
    }
  } catch (error) {
    throw frontierError(error.message || "Saved discovery frontier requires review.");
  }
}
async function scanOfficialPermittingPages({ seedUrl, fetchPage, maxPages = 3, maxDepth = 2, resume = null, existingDocuments = [], recoverLinkLimits = false, recoverFetchFailures = false, recoverDepthUrl = null, onProgress = async () => {
}, rescanUrl = null }) {
  seedUrl = scopedUrl(seedUrl, seedUrl);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30 || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) throw Error("Invalid discovery request size.");
  if (resume) validateCursor(resume, seedUrl, maxDepth);
  const pending = resume ? resume.pending_pages.map((p) => ({ url: p.url, depth: p.depth })) : [{ url: seedUrl, depth: 0 }];
  const visited = new Set((resume?.visited_urls || []).map(key));
  const gaps = (resume?.gaps || []).map((g) => ({ ...g }));
  const queued = /* @__PURE__ */ new Set([...visited, ...pending.map((p) => key(p.url)), ...gaps.map((g) => key(g.url))]);
  const documents = /* @__PURE__ */ new Map(), pages = [];
  let referrals = (resume?.external_referrals || []).map((row) => ({ ...row }));
  const priorDocuments = /* @__PURE__ */ new Map();
  for (const doc of existingDocuments || []) {
    try {
      priorDocuments.set(key(doc.url), doc);
    } catch {
    }
  }
  pending.sort((a, b) => permittingResourcePriority(priorDocuments.get(key(b.url)) || { url: b.url }) - permittingResourcePriority(priorDocuments.get(key(a.url)) || { url: a.url }));
  if (rescanUrl !== null) {
    const selected = scopedUrl(rescanUrl, seedUrl), selectedKey = key(selected);
    if (selectedKey !== key(seedUrl) && !resume?.visited_urls?.some((url) => key(url) === selectedKey) && !resume?.pending_pages?.some((page) => key(page.url) === selectedKey)) throw frontierError("Rescan source is not a saved official discovery page.");
    if (recoverLinkLimits || recoverFetchFailures || recoverDepthUrl !== null) throw frontierError("Select one rescan or recovery mode.");
    visited.delete(selectedKey);
    for (let i = pending.length - 1; i >= 0; i--) if (key(pending[i].url) === selectedKey) pending.splice(i, 1);
    pending.unshift({ url: selected, depth: 0 });
  }
  if (Number(recoverLinkLimits) + Number(recoverFetchFailures) + Number(recoverDepthUrl !== null) > 1) throw frontierError("Select one discovery recovery mode.");
  const selectedDepthKey = recoverDepthUrl !== null ? key(scopedUrl(recoverDepthUrl, seedUrl)) : null;
  if (selectedDepthKey && !gaps.some((g) => g.reason === "depth_frontier" && key(g.url) === selectedDepthKey))
    throw frontierError("Selected depth URL is not a saved review gap.");
  const recoveryReason = selectedDepthKey ? "depth_frontier" : recoverLinkLimits ? "page_link_limit" : recoverFetchFailures ? "page_fetch_failed" : null;
  if (recoveryReason && !resume) throw frontierError("Link recovery requires saved discovery progress.");
  let attempted = 0;
  while ((recoveryReason ? gaps.some((g) => g.reason === recoveryReason) : pending.length) && attempted < (selectedDepthKey ? 1 : maxPages)) {
    const recoveryGap = recoveryReason ? gaps.find((g) => g.reason === recoveryReason && (!selectedDepthKey || key(g.url) === selectedDepthKey)) : null;
    const inferredDepth = recoveryGap && [...priorDocuments.values()].find((d) => d.discovery_page_url && key(d.discovery_page_url) === key(recoveryGap.url))?.discovery_depth;
    const next = recoveryGap ? { url: recoveryGap.url, depth: selectedDepthKey ? maxDepth : recoveryGap.depth ?? inferredDepth ?? maxDepth } : pending.shift();
    const offset = recoveryGap?.link_hash_method === "ordered-resource-list-v1" ? recoveryGap.link_offset ?? 0 : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 5e3 || !Number.isInteger(next.depth) || next.depth < 0 || next.depth > maxDepth)
      throw frontierError("Saved link recovery bounds require review.");
    const nextKey = key(next.url);
    if (!recoveryGap && visited.has(nextKey)) continue;
    visited.add(nextKey);
    attempted++;
    try {
      await onProgress({ kind: "page_start", url: next.url, detail: `Scanning page at depth ${next.depth}.`, progress: { stage: "Scanning official pages", current_url: next.url, processed: attempted - 1, total: maxPages, indeterminate: false } });
      const response = await fetchPage(next.url);
      const finalUrl = scopedUrl(response.finalUrl || next.url, seedUrl), finalKey = key(finalUrl);
      if (!recoveryGap && finalKey !== nextKey && visited.has(finalKey)) {
        pages.push({ ...next, final_url: finalUrl, status: "redirect_duplicate" });
        await onProgress({ kind: "redirect_duplicate", url: finalUrl, detail: "Redirect reached a page already scanned; skipped duplicate parsing.", progress: { processed: attempted, total: maxPages } });
        continue;
      }
      visited.add(finalKey);
      if (response.resource_kind === "pdf" && response.classification_method === PDF_RESOURCE_METHOD) {
        const existing = documents.get(nextKey) || priorDocuments.get(nextKey) || { title: "Official PDF resource", url: next.url, doc_type: "other", source: "official_page_harvest" };
        documents.set(nextKey, { ...existing, resource_classification: {
          kind: "pdf",
          method: PDF_RESOURCE_METHOD,
          source_url: existing.url,
          final_url: finalUrl
        }, verification_notes: (existing.verification_notes || "") + " PDF MIME type and signature checked; full-byte archival and authority review remain required." });
        if (recoveryGap) gaps.splice(gaps.indexOf(recoveryGap), 1);
        pages.push({ ...next, final_url: finalUrl, status: "classified_pdf" });
        await onProgress({ kind: "classified_pdf", url: finalUrl, detail: "PDF MIME and signature verified; full-byte archival and authority review still required.", resources: [documents.get(nextKey)], progress: { processed: attempted, total: maxPages } });
        continue;
      }
      if (typeof response.html !== "string" || !response.html.trim()) throw Error("Official page returned no usable static HTML.");
      const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(permittingResourceSnapshot(response.html, finalUrl).map((d) => ({ url: d.url, title: d.title }))))))].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (recoveryGap?.link_hash_method === "ordered-resource-list-v1" && recoveryGap.link_content_sha256 && recoveryGap.link_content_sha256 !== contentHash)
        throw Error("Capped page changed during recovery; saved offset requires review.");
      let pageReferrals;
      try {
        pageReferrals = discoverOfficialPermittingReferrals(response.html, finalUrl);
      } catch (error) {
        throw frontierError(error.message);
      }
      const pageSha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(response.html)))].map((b) => b.toString(16).padStart(2, "0")).join("");
      referrals = [
        ...referrals.filter((row) => key(row.source_page_url) !== finalKey),
        ...pageReferrals.map((row) => ({ ...row, source_page_sha256: pageSha }))
      ];
      const batch = discoverOfficialPermittingResources(response.html, finalUrl, { maxLinks: 100, offset });
      const found = batch;
      if (rescanUrl !== null && nextKey === key(rescanUrl)) {
        for (let i = gaps.length - 1; i >= 0; i--) if (key(gaps[i].url) === nextKey && ["page_fetch_failed", "page_link_limit"].includes(gaps[i].reason)) gaps.splice(i, 1);
      }
      await onProgress({ kind: "found", url: finalUrl, detail: `Found ${found.length} same-host resources and ${pageReferrals.length} external referrals.`, resources: [...found, ...pageReferrals], progress: { processed: attempted, total: maxPages, indeterminate: false } });
      if (recoveryGap) gaps.splice(gaps.indexOf(recoveryGap), 1);
      pages.push({ ...next, final_url: finalUrl, status: "scanned", discovered_resources: found.length, ...recoveryGap ? { recovered_link_offset: offset } : {} });
      if (found.length === 100) gaps.push({ url: finalUrl, reason: "page_link_limit", depth: next.depth, link_offset: offset + found.length, link_content_sha256: contentHash, link_hash_method: "ordered-resource-list-v1", requires_review: true });
      for (const doc of found) {
        if (doc.url.length > 2e3) {
          gaps.push({ url: finalUrl, reason: "oversized_resource_url", requires_review: true });
          continue;
        }
        const sourceKey = key(doc.url);
        if (!documents.has(sourceKey)) documents.set(sourceKey, {
          ...doc,
          discovery_page_url: finalUrl,
          discovery_depth: next.depth,
          verification_notes: doc.verification_notes + " Discovery page: " + finalUrl
        });
        if (isDownloadableResearchDocument(doc) || visited.has(sourceKey) || queued.has(sourceKey)) continue;
        queued.add(sourceKey);
        if (next.depth >= maxDepth) {
          gaps.push({ url: doc.url, reason: "depth_frontier", requires_review: true });
          continue;
        }
        pending.push({ url: doc.url, depth: next.depth + 1 });
        pending.sort((a, b) => permittingResourcePriority(documents.get(key(b.url)) || priorDocuments.get(key(b.url))) - permittingResourcePriority(documents.get(key(a.url)) || priorDocuments.get(key(a.url))));
      }
    } catch (error) {
      if (error.frontier_review_required) throw error;
      const reason = String(error?.message || error).slice(0, 300);
      await onProgress({ kind: "page_failed", url: next.url, detail: reason, progress: { processed: attempted, total: maxPages } });
      pages.push({ ...next, status: "failed", error: reason });
      if (!recoveryGap) gaps.push({ url: next.url, reason: "page_fetch_failed", depth: next.depth, detail: reason, requires_review: true });
      if (recoveryGap) break;
    }
  }
  await onProgress({ kind: "discovery_summary", detail: `${attempted} pages attempted; ${documents.size} resources found; ${gaps.length} review gaps.`, resources: [...documents.values()], progress: { processed: attempted, total: attempted, indeterminate: false } });
  const pendingPages = pending.filter((p) => !visited.has(key(p.url)));
  const continuationState = {
    external_initial_collection_drained: false,
    method: DISCOVERY_CURSOR_METHOD,
    seed_url: seedUrl,
    max_depth: maxDepth,
    visited_urls: [...visited],
    pending_pages: pendingPages,
    gaps,
    external_referrals: referrals,
    attempted_pages_total: (Number(resume?.attempted_pages_total) || 0) + attempted
  };
  if (referrals.length + continuationState.visited_urls.length + pendingPages.length + gaps.length > CURSOR_MAX_ITEMS || JSON.stringify(continuationState).length > CURSOR_MAX_CHARS)
    throw frontierError("Discovery frontier storage bounds reached; prior saved progress must be preserved for review.");
  return {
    success: pages.some((p) => ["scanned", "classified_pdf"].includes(p.status)) || Boolean(resume && attempted === 0 && !pendingPages.length),
    documents: [...documents.values()],
    pages,
    external_referrals: referrals,
    external_referrals_require_review: referrals.length > 0,
    pending_pages: pendingPages,
    gaps,
    attempted_pages: attempted,
    continuation_state: continuationState,
    resumed: Boolean(resume),
    recovering_link_limits: recoverLinkLimits,
    recovering_fetch_failures: recoverFetchFailures,
    recovering_depth_url: recoverDepthUrl,
    traversal_complete: pending.every((p) => visited.has(key(p.url))) && gaps.length === 0,
    jurisdiction_coverage_complete: false,
    authority_established: false,
    llm_calls: 0,
    external_requests_scheduled: 0,
    limitations: [
      "Static same-host HTML discovery only; external department/code/portal referrals require separately established scope.",
      "PDF classification is a routing hint; full original-byte verification occurs during archival.",
      "Saved failed pages and depth/link gaps require separate review; traversal completion does not establish locality coverage."
    ]
  };
}

// base44/shared/jurisdictionResearchDocumentMerge.mjs
function jurisdictionDocumentSourceKey(document) {
  const source = String(document?.url || "").trim();
  if (!source) return "";
  try {
    const parsed = new URL(source);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return source;
  }
}

// base44/shared/jurisdictionPersistence.mjs
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key2) => {
    out[key2] = normalize(value[key2]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
var JurisdictionPersistenceConflictError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "JurisdictionPersistenceConflictError";
    this.code = "JURISDICTION_PERSISTENCE_CONFLICT";
  }
};
function expectedJurisdictionFields(record = {}, nextFields = {}) {
  return Object.fromEntries(Object.keys(nextFields || {}).map((field) => [field, record?.[field]]));
}
async function replaceJurisdictionFieldsIfUnchanged({
  entity,
  jurisdiction,
  nextFields,
  guardFields = {},
  label = "Jurisdiction update",
  maxAttempts = 3
} = {}) {
  const id = String(jurisdiction?.id || "").trim();
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fields = desired ? Object.keys(desired) : [];
  if (!id || !desired || fields.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = expectedJurisdictionFields(jurisdiction, desired);
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  const assertGuards = (record) => {
    for (const [field, value] of Object.entries(guards)) {
      if (!sameValue(record?.[field], value)) {
        throw new JurisdictionPersistenceConflictError(`${label} was blocked because ${field} changed while research/editing was in progress. No protected jurisdiction data was overwritten.`);
      }
    }
  };
  const targetsConverged = (record) => fields.every((field) => sameValue(record?.[field], desired[field]));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new JurisdictionPersistenceConflictError(`${label} could not re-read its Jurisdiction before saving.`);
    assertGuards(current);
    if (targetsConverged(current)) return current;
    for (const field of fields) {
      if (!sameValue(current[field], expected[field]) && !sameValue(current[field], desired[field])) {
        throw new JurisdictionPersistenceConflictError(`${label} changed in another session (${field}). The newer value was not overwritten.`);
      }
    }
    const version = String(current.updated_date || "").trim();
    if (!version) throw new Error(`${label} is missing its current Jurisdiction version.`);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: desired });
    } catch (error) {
      let afterError;
      try {
        afterError = await entity.get(id);
      } catch (verificationError) {
        throw new Error(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ""}`.trim());
      }
      if (afterError?.id) {
        assertGuards(afterError);
        if (targetsConverged(afterError)) return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") throw new Error(`${label} conditional-update result could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} returned an impossible multi-record update count.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id) throw new Error(`${label} was saved but could not be re-read.`);
      if (!targetsConverged(saved)) {
        throw new JurisdictionPersistenceConflictError(`${label} changed again immediately after saving. Reload before retrying.`);
      }
      return saved;
    }
  }
  throw new JurisdictionPersistenceConflictError(`${label} changed repeatedly while saving. No newer jurisdiction data was overwritten.`);
}

// base44/shared/permittingAddressDiscoveryContinuation.mjs
function isAddressDirectOriginalReferral(ref) {
  try {
    const url = new URL(ref.url), source = new URL(ref.source_page_url);
    return ref.referral_kind === "downloadable_document" && url.protocol === "https:" && source.protocol === "https:" && !url.username && !url.password && !source.username && !source.password;
  } catch {
    return false;
  }
}
function addressDiscoveryCursor(cursor, documents) {
  return { ...cursor, external_initial_collection_drained: !(cursor.external_referrals || []).some((ref) => isAddressDirectOriginalReferral(ref) && !(documents || []).some((doc) => doc.url === ref.url)) };
}
function addressResearchCollection(row) {
  const cursor = row.discovery_scan_state;
  return {
    id: row.id,
    target: row.location_target,
    name: row.name,
    documents: row.documents || [],
    external_referrals: (cursor?.external_referrals || []).filter(isAddressDirectOriginalReferral),
    auto_refresh: row.auto_refresh,
    reference_only: true,
    authority_established: false,
    ...cursor ? { discovery: { pending_pages: cursor.pending_pages || [], gaps: cursor.gaps || [], blocked: cursor.blocked === true, block_reason: cursor.block_reason, visited_count: cursor.visited_urls?.length || 0, last_pages: row.discovery_last_scan?.pages || [], last_resources: row.discovery_last_scan?.resources || [], outside_links: (cursor.external_referrals || []).filter((ref) => !isAddressDirectOriginalReferral(ref)) } } : {}
  };
}

// base44/shared/permittingDocumentValidation.mjs
var PERMIT_DOCUMENT_VALIDATION_METHOD = "document-container-signature-v1";
var fail = (message) => {
  throw Object.assign(Error(message), { status: 415 });
};
var types = {
  pdf: "application/pdf",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain"
};
var starts = (bytes, signature) => signature.every((v, i) => bytes[i] === v);
function officePackageNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!starts(bytes, [80, 75, 3, 4])) fail("Source is not an Office ZIP package.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 101010256 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
      end = i;
      break;
    }
  }
  if (end < 0) fail("Office ZIP directory is missing or truncated.");
  const entries = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== entries || entries === 65535 || offset === 4294967295 || size === 4294967295 || offset + size !== end)
    fail("Unsupported or inconsistent Office ZIP directory; review required.");
  const names = /* @__PURE__ */ new Set();
  let pos = offset;
  for (let n = 0; n < entries; n++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 33639248) fail("Office ZIP directory entry is invalid.");
    const length = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true);
    const next = pos + 46 + length + extra + comment, local = view.getUint32(pos + 42, true);
    if (next > end || local + 30 > offset || view.getUint32(local, true) !== 67324752 || view.getUint16(pos + 8, true) & 1 || ![0, 8].includes(view.getUint16(pos + 10, true)))
      fail("Unsupported or invalid Office ZIP entry; review required.");
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + length));
    const localLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    const localName = new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + localLength));
    if (name !== localName || local + 30 + localLength + localExtra + view.getUint32(pos + 20, true) > offset || names.has(name))
      fail("Office ZIP entry bounds or identity are inconsistent.");
    names.add(name);
    pos = next;
  }
  if (pos !== end) fail("Office ZIP directory size is inconsistent.");
  return names;
}
function validatePermitDocumentBytes(bytes, { format, contentType = "" } = {}) {
  format = String(format || "").toLowerCase();
  if (!(bytes instanceof Uint8Array) || !bytes.length) fail("Downloaded document is empty.");
  if (!types[format]) fail("Unsupported permit document format; review required.");
  const mime = String(contentType).split(";")[0].trim().toLowerCase();
  const prefix = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<!--[\s\S]*?<html\b)/i.test(prefix) || ["text/html", "application/xhtml+xml"].includes(mime))
    fail("Source returned HTML instead of a downloadable file.");
  if (format === "pdf" && !starts(bytes, [37, 80, 68, 70, 45])) fail("Source is not a valid PDF.");
  if (["doc", "xls"].includes(format) && (bytes.length < 512 || !starts(bytes, [208, 207, 17, 224, 161, 177, 26, 225])))
    fail("Source has no valid legacy Office container signature; review required.");
  if (["docx", "xlsx"].includes(format)) {
    const names = officePackageNames(bytes);
    const main = format === "docx" ? "word/document.xml" : "xl/workbook.xml";
    if (!names.has("[Content_Types].xml") || !names.has("_rels/.rels") || !names.has(main))
      fail("Office package does not match the requested document format.");
  }
  if (["csv", "txt"].includes(format)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("Text document encoding requires review.");
    }
    if (text.includes("\0")) fail("Text document contains binary data; review required.");
  }
  return { format, mime_type: types[format], validation_method: PERMIT_DOCUMENT_VALIDATION_METHOD };
}

// base44/shared/permittingSourceClassification.mjs
var CLASSIFICATION_SIGNALS = Object.freeze([
  // Comprehensive rewrite / draft-proposed zoning/sign material
  {
    classification: "comprehensive_rewrite",
    pattern: /\b20\d{2}\b.{0,40}\b(zoning|sign|code|ordinance)\b.{0,40}\b(rewrite|replacement|update|revision)\b/i,
    signal: "year + zoning/sign + rewrite/replacement"
  },
  {
    classification: "comprehensive_rewrite",
    pattern: /\b(zoning|sign|code|ordinance)\b.{0,30}\brewrite\b.{0,30}\b(introduction|schedule|meeting|workshop|update|status)\b/i,
    signal: "zoning rewrite project material"
  },
  {
    classification: "draft_proposed",
    pattern: /\b(draft|proposed)\b.{0,40}\b(zoning|sign|code|ordinance|regulation)\b/i,
    signal: "draft/proposed + zoning/sign/code"
  },
  {
    classification: "draft_proposed",
    pattern: /\b(zoning|sign|code|ordinance|regulation)\b.{0,40}\b(draft|proposed)\b/i,
    signal: "zoning/sign/code + draft/proposed"
  },
  // Legislative evidence (agendas, minutes, enacted ordinances, fiscal court, commission)
  {
    classification: "legislative_evidence",
    pattern: /\b(fiscal\s+court|city\s+council|commission|board\s+of\s+adjustment)\b.{0,50}\b(agenda|minutes|meeting|ordinance|enacted|records?\s+index)\b/i,
    signal: "legislative body + agenda/minutes/enacted"
  },
  {
    classification: "legislative_evidence",
    pattern: /\b(enacted\s+ordinances?|ordinances?\s+index|government\s+records?\s+index)\b/i,
    signal: "enacted ordinances / records index"
  },
  // Application forms
  {
    classification: "application_form",
    pattern: /\b(sign\s+permit\s+)?application\b/i,
    signal: "application form",
    requireDocType: ["permit_application"]
  },
  {
    classification: "application_form",
    pattern: /\b(electrical\s+permit|encroachment\s+permit|building\s+permit)\b.{0,30}\bapplication\b/i,
    signal: "permit application form"
  },
  // Fee schedules
  {
    classification: "fee_schedule",
    pattern: /\bfee\s+schedule\b/i,
    signal: "fee schedule",
    requireDocType: ["fee_schedule"]
  },
  // Checklists
  {
    classification: "checklist",
    pattern: /\bchecklist\b/i,
    signal: "checklist",
    requireDocType: ["checklist"]
  },
  // Administrative guidance (GIS, portal instructions, online submission)
  {
    classification: "administrative_guidance",
    pattern: /\b(gis|map\s+server|online\s+(building\s+)?permit|portal\s+instruction|submission\s+instruction)\b/i,
    signal: "administrative guidance / portal instruction",
    requireDocType: ["gis_resource", "portal_instruction", "other"]
  },
  // Historical (older editions marked reconfirm/historical/revised)
  {
    classification: "historical",
    pattern: /\b(20\d{2})\s+edition\b.{0,30}\b(reconfirm|historical|revised)\b/i,
    signal: "older edition marked reconfirm/historical"
  },
  {
    classification: "historical",
    pattern: /\breconfirm\s+fees\b/i,
    signal: "fee schedule marked reconfirm (historical)"
  },
  // Effective-date evidence
  {
    classification: "effective_date_evidence",
    pattern: /\beffective\s+(on|date)\b\s*:\s*\d/i,
    signal: "explicit effective-date statement"
  }
]);
function looksAdoptedCurrent(doc, lower) {
  const docType = doc.doc_type || doc.source_type || "";
  if (!["sign_ordinance", "zoning_code"].includes(docType)) return false;
  if (/\b(draft|proposed|rewrite|replacement)\b/i.test(lower)) return false;
  if (/\b(adopted|article\s+\d+|section\s+\d+|§\s*\d+|regulations)\b/i.test(lower)) return true;
  return false;
}
function classifySourceDocument(doc = {}) {
  const lower = [
    doc.title || "",
    doc.url || doc.official_url || "",
    doc.extracted_text || "",
    doc.ai_summary || "",
    doc.notes_gaps || ""
  ].join(" \n ").toLowerCase();
  if (doc.authority_classification_override) {
    return {
      classification: doc.authority_classification_override,
      matched_signals: ["explicit_migration_override"]
    };
  }
  const matched = [];
  for (const signal of CLASSIFICATION_SIGNALS) {
    if (signal.requireDocType) {
      const dt = doc.doc_type || doc.source_type || "";
      if (!signal.requireDocType.includes(dt)) continue;
    }
    if (signal.pattern.test(lower)) {
      matched.push(signal.signal);
    }
  }
  if (matched.length > 0) {
    const first = CLASSIFICATION_SIGNALS.find((s) => {
      if (s.requireDocType) {
        const dt = doc.doc_type || doc.source_type || "";
        if (!s.requireDocType.includes(dt)) return false;
      }
      return s.pattern.test(lower);
    });
    return { classification: first.classification, matched_signals: matched };
  }
  if (looksAdoptedCurrent(doc, lower)) {
    return { classification: "current_adopted", matched_signals: ["adopted code section, no rewrite signal"] };
  }
  return { classification: "unknown_review_required", matched_signals: [] };
}

// base44/shared/jurisdictionArchiveCatalog.mjs
var protectedSource = (profile, doc) => profile._manual_documents || doc.source === "manual" || doc.pinned || doc.archive_pinned;
var hashPattern = /^[a-f0-9]{64}$/;
var equal = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
function catalogSourceEligible(profile, doc, automatic = true) {
  return Boolean(profile?.id && doc?.id && doc.url && doc.file_url && doc.archive_state?.status === "complete" && hashPattern.test(doc.source_sha256 || "") && doc.source_sha256 === doc.stored_sha256 && doc.source_bytes > 0 && doc.source_bytes === doc.stored_bytes && !protectedSource(profile, doc) && (!automatic || profile.auto_refresh !== false) && !["complete", "conflict"].includes(doc.catalog_state?.status));
}
function catalogSourcePayload(profile, doc, registrationKey, now) {
  const sourceType = doc.doc_type === "application_form" ? "permit_application" : ["sign_ordinance", "permit_application", "zoning_code", "fee_schedule", "checklist", "legislative_record", "gis_resource", "portal_instruction"].includes(doc.doc_type) ? doc.doc_type : "other";
  const classified = classifySourceDocument({ ...doc, doc_type: sourceType, authority_classification_override: void 0 });
  const signals = [...classified.matched_signals];
  const label = [doc.title, doc.url].join(" ").replace(/[_%\-]+/g, " ");
  let classification = classified.classification;
  let contentStatus = "unknown";
  if (/\b(draft|proposed)\b/i.test(label)) {
    classification = "draft_proposed";
    contentStatus = /\bproposed\b/i.test(label) ? "proposed" : "draft";
    signals.push("draft/proposed in retained title or URL");
  } else if (/\b(minutes|agenda|meeting packet)\b/i.test(label)) {
    classification = "legislative_evidence";
    signals.push("meeting record in retained title or URL");
  } else if (["current_adopted", "effective_date_evidence", "narrow_amendment"].includes(classification)) {
    classification = "unknown_review_required";
    signals.push("adoption/effectiveness requires separate evidence review");
  }
  return {
    title: doc.title || "Archived permitting resource",
    jurisdiction_name: profile.name || profile.id,
    jurisdiction_id: profile.id,
    jurisdiction_profile_doc_id: doc.id,
    source_registration_key: registrationKey,
    source_type: classification === "legislative_evidence" ? "legislative_record" : sourceType,
    official_url: doc.url,
    archived_file_url: doc.file_url,
    file_hash_sha256: doc.stored_sha256,
    file_bytes: doc.stored_bytes,
    retrieval_timestamp: doc.downloaded_at || doc.archive_state.completed_at,
    content_status: contentStatus,
    authority_classification: classification,
    authority_confidence: "unverified",
    verification_status: "needs_verification",
    matched_signals: signals,
    classified_at: new Date(now).toISOString(),
    notes_gaps: "Automatically linked from a byte-verified retained archive. Successful archival does not establish adoption, current law, effective date, issuing office, or applicability. Authority and scope require review."
  };
}
async function transition(entity, id, doc, expected, next) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await entity.get(id);
    const matches = (current.documents || []).filter((d) => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
    if (matches.length !== 1 || protectedSource(current, matches[0])) throw Error("Catalog source changed or became protected.");
    const source = matches[0];
    if (source.file_url !== doc.file_url || source.stored_sha256 !== doc.stored_sha256) throw Error("Catalog archive identity changed.");
    if (equal(source.catalog_state, next)) return current;
    if (!equal(source.catalog_state, expected) || !current.updated_date) throw Error("Catalog registration changed concurrently.");
    const documents = current.documents.map((d) => d === source ? { ...d, catalog_state: next } : d);
    try {
      const result = await entity.updateMany({ id, updated_date: current.updated_date }, { $set: { documents } });
      if (result?.updated === 1) return await entity.get(id);
      if (result?.updated !== 0) throw Error("Unknown catalog conditional write outcome.");
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      const saved = after?.documents?.find((d) => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
      if (saved && !protectedSource(after, saved) && saved.file_url === doc.file_url && saved.stored_sha256 === doc.stored_sha256 && equal(saved.catalog_state, next)) return after;
      throw error;
    }
  }
  throw Error("Catalog write conflicted; newer work preserved.");
}
async function findMatches(catalogEntity, profile, doc, key2) {
  const rows = await catalogEntity.filter({ $or: [
    { source_registration_key: key2 },
    { $and: [
      { $or: [{ jurisdiction_id: profile.id }, { jurisdiction_id: { $in: [null, ""] }, jurisdiction_name: profile.name }] },
      { $or: [{ jurisdiction_profile_doc_id: doc.id }, { official_url: { $in: [.../* @__PURE__ */ new Set([doc.url, jurisdictionDocumentSourceKey(doc)])] } }] }
    ] }
  ] }, "created_date", 3, 0);
  if (!Array.isArray(rows)) throw Error("Catalog lookup outcome unknown.");
  return rows;
}
async function registerJurisdictionArchive({ entity, catalogEntity, jurisdictionId, documentId = "", automatic = true, token = crypto.randomUUID(), now = () => Date.now() }) {
  const profile = await entity.get(jurisdictionId);
  const documents = profile.documents || [];
  const doc = documents.find((d) => (!documentId || d.id === documentId) && catalogSourceEligible(profile, d, automatic) && !documents.some((other) => other !== d && jurisdictionDocumentSourceKey(other) === jurisdictionDocumentSourceKey(d)));
  if (!doc) return { success: true, skipped: true, reason: "no_eligible_catalog_source" };
  let state = doc.catalog_state || {};
  if (Date.parse(state.lease_expires_at || "") > now()) return { success: true, skipped: true, reason: "registration_in_flight" };
  const key2 = JSON.stringify([profile.id, jurisdictionDocumentSourceKey(doc), doc.stored_sha256]);
  const rows = await findMatches(catalogEntity, profile, doc, key2);
  const conflict = rows.length > 1 || rows[0] && (rows[0].jurisdiction_id && rows[0].jurisdiction_id !== profile.id || rows[0].official_url && jurisdictionDocumentSourceKey({ url: rows[0].official_url }) !== jurisdictionDocumentSourceKey(doc) || rows[0].file_hash_sha256 && rows[0].file_hash_sha256 !== doc.stored_sha256);
  if (conflict) {
    await transition(entity, profile.id, doc, state, { ...state, status: "conflict", lease_expires_at: "", error: "Existing catalog identities or archive hashes conflict; review required." });
    return { success: false, status: "conflict", created: 0 };
  }
  if (rows.length === 1) {
    await transition(entity, profile.id, doc, state, { ...state, status: "complete", source_document_id: rows[0].id, lease_expires_at: "", registered_at: new Date(now()).toISOString(), error: "", existing_record_preserved: true });
    return { success: true, registered: 1, created: 0, source_document_id: rows[0].id };
  }
  if (["creating", "create_uncertain"].includes(state.status)) {
    if (state.status !== "create_uncertain") await transition(entity, profile.id, doc, state, { ...state, status: "create_uncertain", lease_expires_at: "", error: "No catalog create receipt found; reconcile before creating again." });
    return { success: false, status: "create_uncertain", created: 0 };
  }
  const creating = {
    status: "creating",
    claim_token: token,
    registration_key: key2,
    lease_expires_at: new Date(now() + 9e4).toISOString(),
    started_at: new Date(now()).toISOString()
  };
  await transition(entity, profile.id, doc, state, creating);
  state = creating;
  let row;
  try {
    row = await catalogEntity.create(catalogSourcePayload(profile, doc, key2, now()));
    if (!row?.id) throw Error("Catalog create returned no receipt.");
  } catch (error) {
    try {
      await transition(entity, profile.id, doc, state, { ...state, status: "create_uncertain", lease_expires_at: "", error: String(error.message || error).slice(0, 500) });
    } catch {
    }
    return { success: false, status: "create_uncertain", created: 0 };
  }
  try {
    const after = await findMatches(catalogEntity, profile, doc, key2);
    if (after.length !== 1 || after[0].id !== row.id) throw Error("Concurrent catalog identity requires review.");
    await transition(entity, profile.id, doc, state, { ...state, status: "complete", source_document_id: row.id, lease_expires_at: "", registered_at: new Date(now()).toISOString(), error: "" });
    return { success: true, registered: 1, created: 1, source_document_id: row.id };
  } catch (error) {
    return { success: false, status: "receipt_conflict", created: 1, source_document_id: row.id, error: String(error.message || error) };
  }
}

// base44/shared/jurisdictionSourcePdfText.mjs
var PDF_TEXT_MAX_BYTES = 10 * 1024 * 1024;

// base44/shared/permittingRuleEvidence.mjs
var evidenceError = (message, status = 409) => Object.assign(Error(message), { status });

// base44/shared/permittingHtmlEvidence.mjs
var clean = (v, max) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw evidenceError("A bounded evidence field is required.", 400);
  return v.trim();
};
function publicUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443" || /[\u0000-\u001f\u007f]/.test(value) || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(u.hostname) || !u.hostname.includes(".") || /^\d+(?:\.\d+)*$/.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname)) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}
function authorizedHtmlUrl(profile, value) {
  const url = publicUrl(clean(value, 2e3)), hosts = [profile.website_url, profile.permitting_url].map(publicUrl).filter(Boolean).map((u) => u.hostname.replace(/^www\./, ""));
  if (!url || !hosts.includes(url.hostname.replace(/^www\./, ""))) throw evidenceError("Use an HTTPS page on the canonical profile's official website or permitting host. Redirects to another host require separate review.", 400);
  return url.href;
}

// base44/shared/jurisdictionResearchArchiveBudget.mjs
var RESEARCH_FETCH_TIMEOUT_MS = 12e3;
var RESEARCH_UPLOAD_TIMEOUT_MS = 15e3;
async function withResearchArchiveTimeout(promise, timeoutMs, label = "Research archive step") {
  const timeout = Math.max(1, Number(timeoutMs) || 1);
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms.`)), timeout);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// base44/shared/jurisdictionArchiveContinuation.mjs
var ARCHIVE_LEASE_MS = 9e4;
var AUTOMATIC_ARCHIVE_RETRY_LIMIT = 3;
var MAX_BYTES = 50 * 1024 * 1024;
var protectedDoc = (doc) => doc?.source === "manual" || doc?.pinned === true || doc?.archive_pinned === true || Boolean(doc?.file_url || doc?.source_sha256);
function archiveDocumentEligible(doc, { manual = false, selectedPdf = false, scopedExternal = false, now = Date.now() } = {}) {
  if (!doc?.id || !(isDownloadableResearchDocument(doc) || manual && selectedPdf) || protectedDoc(doc)) return false;
  if (!manual && doc.external_referral_provenance && !scopedExternal) return false;
  const state = doc.archive_state || {};
  if (["complete", "uploading", "upload_uncertain"].includes(state.status)) return false;
  if (Date.parse(state.lease_expires_at || "") > now) return false;
  if (state.file_url) return (state.status === "uploaded" || manual && state.status === "verification_blocked") && (manual || !(Date.parse(state.retry_after || "") > now));
  if (state.status === "blocked" && !manual) return false;
  if (!manual && (Number(state.attempts || 0) >= AUTOMATIC_ARCHIVE_RETRY_LIMIT || Date.parse(state.retry_after || "") > now)) return false;
  return true;
}
async function readBytes(response) {
  if (!response.ok) throw new Error("Official file returned HTTP " + response.status);
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (/text\/html|application\/xhtml\+xml/.test(type)) throw new Error("Source returned HTML instead of a downloadable file.");
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("Official file exceeds 50 MB.");
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes2 = new Uint8Array(await response.arrayBuffer());
    if (!bytes2.length || bytes2.length > MAX_BYTES) throw new Error("Official file has an unsafe byte count.");
    return bytes2;
  }
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      count += value.length;
      if (count > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Official file exceeds 50 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!count) throw new Error("Official file is empty.");
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sameState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function transition2(entity, id, doc, expected, nextState, flatPatch = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await entity.get(id);
    if (!current?.id || current._manual_documents) throw new Error("Archive collection changed or is manually protected.");
    const matching = (current.documents || []).filter((d) => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
    if (matching.length !== 1) throw new Error("Archive source changed or has duplicate identities.");
    const source = matching[0];
    if (source.source === "manual" || source.pinned === true || source.archive_pinned === true) throw new Error("Archive source became protected.");
    if (!sameState(source.resource_classification, doc.resource_classification)) throw new Error("Resource classification changed concurrently.");
    if (doc.external_referral_provenance) {
      const proof = doc.external_referral_provenance;
      if (!sameState(source.external_referral_provenance, proof) || proof.jurisdiction_id !== current.id || proof.jurisdiction_name !== current.name || proof.jurisdiction_state !== current.state || proof.jurisdiction_type !== current.type || proof.seed_url !== current.permitting_url || current.discovery_scan_state?.blocked || nextState.automatic_external_collection && current.auto_refresh !== true || !current.discovery_scan_state?.external_referrals?.some((row) => row.url === doc.url && row.source_page_url === proof.source_page_url && row.source_page_sha256 === proof.discovered_page_sha256))
        throw new Error("External source provenance or jurisdiction identity changed concurrently.");
    }
    const converged = sameState(source.archive_state, nextState) && Object.entries(flatPatch).every(([key2, value]) => source[key2] === value);
    if (converged) return current;
    if (!sameState(source.archive_state || {}, expected || {}) || source.file_url || source.source_sha256) throw new Error("Archive source or receipt changed concurrently.");
    if (!current.updated_date) throw new Error("Archive profile has no version.");
    const documents = current.documents.map((d) => d === source ? { ...d, ...flatPatch, archive_state: nextState } : d);
    let result;
    try {
      result = await entity.updateMany({ id, updated_date: current.updated_date }, { $set: { documents } });
    } catch (error) {
      const after = await entity.get(id).catch(() => null);
      const saved = after?.documents?.find((d) => d.id === doc.id && jurisdictionDocumentSourceKey(d) === jurisdictionDocumentSourceKey(doc));
      if (saved && !after._manual_documents && saved.source !== "manual" && !saved.pinned && !saved.archive_pinned && sameState(saved.archive_state, nextState) && Object.entries(flatPatch).every(([key2, value]) => saved[key2] === value)) return after;
      throw error;
    }
    if (!result || typeof result.updated !== "number" || result.updated > 1) throw new Error("Archive conditional write outcome could not be verified.");
    if (result.updated === 1) return await entity.get(id);
  }
  throw new Error("Archive write repeatedly conflicted; newer work was preserved.");
}
async function archiveKnownJurisdictionSource({ entity, catalogEntity, jurisdictionId, documentId = "", fetchSource, uploadFile, manual = false, knownPdf = null, externalReferralAuthorized = false, onProgress = async () => {
}, token = crypto.randomUUID(), now = () => Date.now() }) {
  if (knownPdf && (!manual || !documentId || !/^[a-f0-9]{64}$/.test(knownPdf.sha256 || "") || !Number.isInteger(knownPdf.bytes) || knownPdf.bytes < 5 || knownPdf.bytes > MAX_BYTES)) {
    throw new Error("A selected manual PDF requires its retained SHA-256 and bounded byte count.");
  }
  const initial = await entity.get(jurisdictionId);
  if (!initial?.id) throw new Error("Jurisdiction not found.");
  if (!manual && initial.auto_refresh === false) return { success: true, skipped: true, reason: "auto_refresh_disabled", jurisdiction: initial };
  if (initial._manual_documents) return { success: true, skipped: true, reason: "manual_collection", jurisdiction: initial };
  const docs = initial.documents || [];
  const doc = docs.find((d) => (!d.external_referral_provenance || externalReferralAuthorized) && (!documentId || d.id === documentId) && archiveDocumentEligible(d, { manual, selectedPdf: Boolean(knownPdf && documentId === d.id), scopedExternal: externalReferralAuthorized, now: now() }) && !docs.some((other) => other !== d && jurisdictionDocumentSourceKey(other) === jurisdictionDocumentSourceKey(d)));
  if (!doc) return { success: true, skipped: true, reason: "no_eligible_file", jurisdiction: initial };
  const classifiedPdf = hasClassifiedPdfResource(doc);
  if (knownPdf || classifiedPdf) authorizedHtmlUrl(initial, doc.url);
  let state = doc.archive_state || {};
  if (state.known_pdf && (!knownPdf || state.known_pdf.sha256 !== knownPdf.sha256 || state.known_pdf.bytes !== knownPdf.bytes))
    throw new Error("Retained PDF expectation changed; reconcile the existing receipt.");
  const resumeUpload = ["uploaded", "verification_blocked"].includes(state.status) && Boolean(state.file_url);
  const attempts = resumeUpload ? Math.max(1, Number(state.attempts) || 1) : (Number(state.attempts) || 0) + 1;
  const stamp = () => new Date(now()).toISOString();
  const claimed = {
    ...state,
    ...doc.external_referral_provenance ? { automatic_external_collection: !manual } : {},
    ...knownPdf ? { known_pdf: { sha256: knownPdf.sha256, bytes: knownPdf.bytes } } : {},
    status: resumeUpload ? "uploaded" : "downloading",
    claim_token: token,
    attempts,
    lease_expires_at: new Date(now() + ARCHIVE_LEASE_MS).toISOString(),
    last_attempt_at: stamp(),
    error: ""
  };
  await transition2(entity, jurisdictionId, doc, state, claimed);
  state = claimed;
  let uploads = 0;
  let stage = resumeUpload ? "verify" : "download";
  const fetchBytes = async (url, requirePdf = false) => withResearchArchiveTimeout((async () => {
    const response = await fetchSource(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS) });
    if (requirePdf && response.url) authorizedHtmlUrl(initial, response.url);
    if (requirePdf && !/^application\/pdf(?:\s*;|$)/i.test(response.headers.get("content-type") || ""))
      throw new Error("Selected official resource did not return PDF content.");
    const bytes = await readBytes(response);
    return { bytes, contentType: response.headers.get("content-type") || "", finalUrl: response.url || url, referralRecheck: response.permittingReferralRecheck };
  })(), RESEARCH_FETCH_TIMEOUT_MS, "Archive fetch/read");
  try {
    if (!resumeUpload) {
      await onProgress({ kind: "download", url: doc.url, detail: `Downloading ${doc.title || "document"}.`, progress: { stage: "Downloading original", current_url: doc.url, processed: 0, total: 3, indeterminate: false } });
      const sourceResponse = await fetchBytes(doc.url, Boolean(knownPdf || classifiedPdf));
      if (doc.external_referral_provenance && (sourceResponse.referralRecheck?.source_page_url !== doc.external_referral_provenance.source_page_url || !/^[a-f0-9]{64}$/.test(sourceResponse.referralRecheck?.source_page_sha256 || ""))) throw new Error("External source link recheck receipt is missing.");
      const bytes = sourceResponse.bytes;
      const ext = knownPdf || classifiedPdf ? "pdf" : new URL(doc.url).pathname.split(".").pop().toLowerCase();
      const validation = validatePermitDocumentBytes(bytes, { format: ext, contentType: sourceResponse.contentType });
      const sha = await digest(bytes);
      if (knownPdf && (bytes.length !== knownPdf.bytes || sha !== knownPdf.sha256))
        throw new Error("Official PDF changed from the retained expectation; review before upload.");
      const uploading = {
        ...state,
        status: "uploading",
        source_sha256: sha,
        source_bytes: bytes.length,
        detected_format: ext,
        validation_method: validation.validation_method,
        source_content_type: sourceResponse.contentType,
        source_final_url: sourceResponse.finalUrl,
        ...doc.external_referral_provenance ? { source_link_recheck: sourceResponse.referralRecheck } : {}
      };
      await transition2(entity, jurisdictionId, doc, state, uploading);
      state = uploading;
      stage = "upload";
      await onProgress({ kind: "upload", url: doc.url, detail: `Validated ${bytes.length} source bytes; uploading archive.`, progress: { stage: "Uploading archive", processed: 1, total: 3 } });
      const types2 = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv",
        txt: "text/plain"
      };
      let name = new URL(doc.url).pathname.split("/").filter(Boolean).pop() || "official-resource." + ext;
      try {
        name = decodeURIComponent(name);
      } catch {
      }
      if ((knownPdf || classifiedPdf) && !/\.pdf$/i.test(name)) name += ".pdf";
      uploads++;
      const result = await withResearchArchiveTimeout(uploadFile({ file: new File([bytes], name, { type: types2[ext] || "application/octet-stream" }) }), RESEARCH_UPLOAD_TIMEOUT_MS, "Archive upload");
      if (!result?.file_url) throw new Error("Upload returned no usable file URL; outcome is uncertain.");
      const uploaded = { ...state, status: "uploaded", file_url: result.file_url, uploaded_at: stamp(), verification_attempts: 0 };
      await transition2(entity, jurisdictionId, doc, state, uploaded);
      state = uploaded;
    }
    stage = "verify";
    await onProgress({ kind: "readback", url: state.file_url, detail: "Reading stored file to verify matching bytes and SHA-256.", progress: { stage: "Verifying stored archive", current_url: state.file_url, processed: 2, total: 3 } });
    const verifying = { ...state, verification_attempts: (Number(state.verification_attempts) || 0) + 1 };
    await transition2(entity, jurisdictionId, doc, state, verifying);
    state = verifying;
    const storedResponse = await fetchBytes(state.file_url);
    const stored = storedResponse.bytes;
    const storedFormat = state.detected_format || (knownPdf || classifiedPdf ? "pdf" : new URL(doc.url).pathname.split(".").pop().toLowerCase());
    validatePermitDocumentBytes(stored, { format: storedFormat, contentType: storedResponse.contentType });
    const storedSha = await digest(stored);
    if (stored.length !== state.source_bytes || storedSha !== state.source_sha256) throw new Error("Stored archive bytes do not match the official source.");
    const complete = { ...state, status: "complete", lease_expires_at: "", retry_after: "", error: "", completed_at: stamp() };
    const jurisdiction = await transition2(entity, jurisdictionId, doc, state, complete, {
      file_url: state.file_url,
      source_sha256: state.source_sha256,
      source_bytes: state.source_bytes,
      stored_sha256: storedSha,
      stored_bytes: stored.length,
      downloaded_at: state.uploaded_at
    });
    await onProgress({ kind: "archive_complete", url: doc.url, detail: `Verified ${stored.length} stored bytes; SHA-256 ${storedSha}.`, progress: { stage: "Registering verified archive", processed: 3, total: 3 } });
    const catalog = catalogEntity ? await registerJurisdictionArchive({ entity, catalogEntity, jurisdictionId, documentId: doc.id, automatic: !manual }).catch((error) => ({ success: false, status: "registration_conflict", error: String(error.message || error) })) : null;
    return {
      success: true,
      archived: 1,
      uploads,
      status: "complete",
      document_url: doc.url,
      catalog,
      jurisdiction: catalogEntity ? await entity.get(jurisdictionId).catch(() => jurisdiction) : jurisdiction
    };
  } catch (error) {
    const status = stage === "upload" ? "upload_uncertain" : stage === "verify" ? state.verification_attempts >= AUTOMATIC_ARCHIVE_RETRY_LIMIT ? "verification_blocked" : "uploaded" : attempts >= AUTOMATIC_ARCHIVE_RETRY_LIMIT ? "blocked" : "failed";
    const failed = {
      ...state,
      status,
      lease_expires_at: "",
      error: String(error?.message || error).slice(0, 500),
      retry_after: new Date(now() + Math.min(24 * 60 * 6e4, attempts * 60 * 6e4)).toISOString()
    };
    try {
      await transition2(entity, jurisdictionId, doc, state, failed);
    } catch (persistError) {
      return { success: false, status: "receipt_conflict", uploads, document_url: doc.url, error: persistError.message };
    }
    return { success: false, status, uploads, document_url: doc.url, error: failed.error };
  }
}

// base44/shared/jurisdictionExternalReferralArchive.mjs
var host2 = (url) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
var fail2 = (message) => {
  throw Object.assign(Error(message), { status: 409 });
};
var linkFields = ["url", "title", "source_page_url", "linked_href", "resolution_base_url", "referral_kind", "discovery_element"];
async function archiveExternalJurisdictionReferral(options) {
  const { entity, jurisdictionId, selection, fetchScopedSource, invalidateProfile } = options;
  if (!options.manual && options.automaticScopedResume !== true || typeof fetchScopedSource !== "function" || typeof invalidateProfile !== "function")
    fail2("External referral archival requires selected collection and guarded source fetching.");
  const profile = await entity.get(jurisdictionId);
  if (!profile?.id || !["OH", "KY"].includes(profile.state) || profile._manual_documents)
    fail2("Jurisdiction is missing, outside collection scope or manually protected.");
  if (!options.manual && profile.auto_refresh !== true) fail2("Automatic external collection is not enabled for this jurisdiction.");
  const cursor = profile.discovery_scan_state;
  if (!cursor || cursor.blocked || cursor.seed_url !== profile.permitting_url) fail2("Official discovery source changed or requires review.");
  const rows = (cursor.external_referrals || []).filter((row) => row.url === selection?.url && row.source_page_url === selection?.source_page_url);
  if (rows.length !== 1) fail2("Selected external referral is missing or ambiguous.");
  const referral = rows[0];
  validateExternalPermittingReferral(referral, cursor.seed_url);
  if (referral.referral_kind !== "downloadable_document") fail2("Only directly linked document files can enter this archive path.");
  if (!cursor.visited_urls?.includes(referral.source_page_url)) fail2("Referral source page has no saved discovery visit.");
  const matches = (profile.documents || []).filter((doc) => doc.url === referral.url);
  if (matches.length > 1) fail2("Document URL has duplicate identities.");
  const existing = matches[0];
  if (existing && (existing.source === "manual" || existing.pinned || existing.archive_pinned || !existing.external_referral_provenance || !linkFields.every((key2) => existing.external_referral_provenance[key2] === referral[key2])))
    fail2("Existing document has different or protected provenance; reconcile it separately.");
  if (!options.manual && !existing && options.automaticInitialCollection !== true) fail2("Automatic external recovery requires an already selected document.");
  let document = existing;
  let linkChecked = false, recheckReceipt = null;
  async function recheckLink() {
    await options.onProgress?.({ kind: "official_link_recheck", url: referral.source_page_url, detail: `Checking the exact official-page link to ${referral.url}.`, progress: { stage: "Rechecking official link", current_url: referral.source_page_url, indeterminate: true } });
    const response = await withResearchArchiveTimeout(fetchScopedSource(
      referral.source_page_url,
      {
        signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0" }
      },
      host2(referral.source_page_url)
    ), RESEARCH_FETCH_TIMEOUT_MS, "External referral source recheck");
    const final = referralWebUrl(response.url || referral.source_page_url);
    if (!final || final.href !== referral.source_page_url) fail2("Official source page redirected; refresh discovery before collection.");
    const resource = await withResearchArchiveTimeout(readPermittingResourceResponse(response), RESEARCH_FETCH_TIMEOUT_MS, "External referral source read");
    if (typeof resource.html !== "string") fail2("Official referral source is no longer a readable HTML page.");
    const fresh = discoverOfficialPermittingReferrals(resource.html, final.href).find((row) => linkFields.every((key2) => row[key2] === referral[key2]));
    if (!fresh) fail2("Official source no longer contains the exact selected document link.");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(resource.html)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    linkChecked = true;
    recheckReceipt = { source_page_url: referral.source_page_url, source_page_sha256: hash, checked_at: (/* @__PURE__ */ new Date()).toISOString() };
    return { ...fresh, source_page_sha256: hash };
  }
  if (!document) {
    const fresh = options.manual ? await recheckLink() : referral;
    document = {
      id: crypto.randomUUID(),
      url: referral.url,
      title: referral.title,
      source: "official_page_harvest",
      doc_type: permittingDocumentType(referral),
      verification_notes: options.manual ? "Direct external document link rechecked on the official source; authority and applicability remain unapproved." : "Saved official-page referral staged for source recheck; authority and applicability remain unapproved.",
      external_referral_provenance: {
        ...fresh,
        discovered_page_sha256: referral.source_page_sha256,
        collection_method: "official-direct-document-link-v1",
        rechecked_at: options.manual ? (/* @__PURE__ */ new Date()).toISOString() : null,
        jurisdiction_id: profile.id,
        jurisdiction_name: profile.name,
        jurisdiction_state: profile.state,
        jurisdiction_type: profile.type,
        seed_url: profile.permitting_url
      }
    };
    const documents = [...profile.documents || [], document];
    const next = invalidateProfile(profile, { documents, discovery_scan_state: { ...cursor, external_initial_collection_drained: !cursor.external_referrals.some((row) => row.referral_kind === "downloadable_document" && !documents.some((doc) => doc.url === row.url)) } });
    await replaceJurisdictionFieldsIfUnchanged({
      entity,
      jurisdiction: profile,
      nextFields: next,
      guardFields: {
        _manual_documents: profile._manual_documents,
        auto_refresh: profile.auto_refresh,
        discovery_scan_state: cursor,
        name: profile.name,
        state: profile.state,
        type: profile.type,
        permitting_url: profile.permitting_url
      },
      label: "External document source staging"
    });
  }
  const result = await archiveKnownJurisdictionSource({
    ...options,
    documentId: document.id,
    knownPdf: null,
    externalReferralAuthorized: true,
    fetchSource: async (url, init) => {
      if (url !== document.url) return options.fetchSource(url, init);
      if (!linkChecked) await recheckLink();
      const response = await fetchScopedSource(url, init, host2(document.url));
      Object.defineProperty(response, "permittingReferralRecheck", { value: recheckReceipt });
      return response;
    }
  });
  return { ...result, external_referral: true, document_id: document.id };
}

// base44/shared/permittingScanReporter.mjs
var scanToken = (value) => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
var silentScanReporter = { emit: async () => {
}, finish: async () => null, id: null };
async function createScanReporter({ entity, token, user, targetId, targetName, kind, label }) {
  if (!token) return silentScanReporter;
  if (!scanToken(token) || !user?.id || !user?.email) throw Object.assign(Error("Invalid scan activity identity."), { status: 400 });
  const existing = await entity.filter({ action_token: token }, "created_date", 2);
  if (existing.length) throw Object.assign(Error("This scan action already exists. Check its saved activity instead of starting it again."), { status: 409 });
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  const row = await entity.create({ action_token: token, owner_id: user.id, owner_email: String(user.email || "").toLowerCase(), target_id: targetId, target_name: targetName, action_kind: kind, label, status: "running", stage: "Starting", processed: 0, total: 0, indeterminate: true, started_at: stamp, last_event_at: stamp, events: [], omitted_events: 0 });
  return attachScanReporter(entity, row.id);
}
function attachScanReporter(entity, id) {
  let snapshot = null, trackingError = "";
  async function emit(event, patch = {}) {
    try {
      const current = await entity.get(id);
      if (current.status !== "running") return;
      const item = { at: (/* @__PURE__ */ new Date()).toISOString(), ...event };
      if (item.resources) {
        item.omitted_resources = Math.max(0, item.resources.length - 100);
        item.resources = item.resources.slice(0, 100).map((r) => ({ url: r.url, title: r.title, kind: r.referral_kind || r.doc_type }));
      }
      if (item.detail) item.detail = String(item.detail).slice(0, 24e3);
      const events = [...current.events || [], item], overflow = Math.max(0, events.length - 200);
      snapshot = { ...current, ...patch, events: events.slice(-200), omitted_events: (current.omitted_events || 0) + overflow, last_event_at: item.at };
      await entity.update(id, { ...patch, events: snapshot.events, omitted_events: snapshot.omitted_events, last_event_at: item.at });
    } catch (error) {
      trackingError = String(error.message || error);
    }
  }
  async function finish(status = "complete", error = "") {
    const current = await entity.get(id).catch(() => null);
    const completion = status === "complete" && current?.total > 0 ? { processed: current.total } : {};
    await emit({ kind: "finished", detail: error || status }, { ...completion, status, stage: status, indeterminate: false, finished_at: (/* @__PURE__ */ new Date()).toISOString(), error: String(error).slice(0, 1e3) });
    return snapshot ? { ...snapshot, tracking_error: trackingError || null } : null;
  }
  return { id, emit, finish };
}

// base44/shared/permittingAddressArchive.mjs
function scopedArchiveFetch(entity, id, seed, fetchSource) {
  return async (url, init) => {
    const row = await entity.get(id);
    const isStored = (row.documents || []).some((doc) => doc.archive_state?.file_url === url && /^[a-f0-9]{64}$/.test(doc.archive_state?.source_sha256 || ""));
    const root = new URL(seed), target = new URL(url);
    if (!isStored && (target.protocol !== "https:" || target.username || target.password || target.hostname.replace(/^www\./, "") !== root.hostname.replace(/^www\./, "") || target.port !== root.port)) throw Error("Research original redirected outside the saved source host.");
    return fetchSource(url, init, isStored ? null : root.hostname.replace(/^www\./, ""));
  };
}
async function retainAddressResearchFiles({ entity, scanRunId, actor, resolution, automatic, fetchSource, uploadFile, onProgress = async () => {
}, archiveLimit = 1 }) {
  if (!automatic?.started) return null;
  if (!scanRunId || !entity?.filter || !entity?.create) return { status: "unavailable", error: "Original-file retention is unavailable; source links remain available.", collections: [] };
  let started = 0;
  const collections = [];
  for (let index = 0; index < automatic.scans.length; index++) {
    const scan = automatic.scans[index], seed = scan.continuation_state?.seed_url;
    const docs = (scan.documents || []).filter(isDownloadableResearchDocument).sort((a, b) => permittingResourcePriority(b) - permittingResourcePriority(a));
    if (!seed) continue;
    try {
      const root = new URL(seed);
      if (root.protocol !== "https:" || root.username || root.password) throw Error("Original-file retention requires an HTTPS source.");
      const allowed = docs.filter((doc) => {
        try {
          const u = new URL(doc.url);
          return u.protocol === "https:" && !u.username && !u.password && u.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "") && u.port === root.port;
        } catch {
          return false;
        }
      });
      const referrals = (scan.external_referrals || []).filter((ref) => {
        try {
          validateExternalPermittingReferral(ref, seed);
          return ref.referral_kind === "downloadable_document" && new URL(ref.url).protocol === "https:" && new URL(ref.source_page_url).protocol === "https:" && scan.continuation_state?.visited_urls?.includes(ref.source_page_url);
        } catch {
          return false;
        }
      });
      if (!allowed.length && !referrals.length && !scan.continuation_state?.pending_pages?.length && !scan.continuation_state?.gaps?.length) continue;
      const collectionKey = scanRunId + ":" + index;
      const own = (row) => row?.owner_id === actor.id && row.owner_email === String(actor.email).toLowerCase() && row.scan_run_id === scanRunId && row.reference_only === true && row.authority_established === false && row.permitting_url === seed;
      let rows = await entity.filter({ collection_key: collectionKey }, "created_date", 2);
      if (rows.length > 1) throw Error("Duplicate research collection; review required.");
      if (!rows.length) {
        try {
          await entity.create({ collection_key: collectionKey, owner_id: actor.id, owner_email: String(actor.email).toLowerCase(), scan_run_id: scanRunId, name: scan.target.name, state: scan.target.state || resolution.state || "", type: scan.target.type || "reference", permitting_url: seed, website_url: seed, auto_refresh: true, reference_only: true, authority_established: false, location_verified: resolution.status === "location_verified", location_target: scan.target, documents: allowed.map((doc) => ({ ...doc, id: crypto.randomUUID() })), discovery_scan_state: { ...scan.continuation_state, external_referrals: referrals } });
        } catch (error) {
          rows = await entity.filter({ collection_key: collectionKey }, "created_date", 2);
          if (rows.length !== 1 || !own(rows[0])) throw error;
        }
        rows = await entity.filter({ collection_key: collectionKey }, "created_date", 2);
      }
      if (rows.length !== 1 || !own(rows[0])) throw Error("Research collection identity could not be verified.");
      const collection = rows[0];
      const workerEntity = { get: async (id) => {
        const row = await entity.get(id);
        if (!own(row)) throw Error("Research collection owner or scope changed.");
        return row;
      }, updateMany: (query, patch) => entity.updateMany({ ...query, owner_id: actor.id, owner_email: String(actor.email).toLowerCase(), scan_run_id: scanRunId, reference_only: true, authority_established: false, permitting_url: seed }, patch) };
      let archive = null;
      if ((allowed.length || referrals.length) && started < archiveLimit) {
        started++;
        archive = allowed.length ? await archiveKnownJurisdictionSource({ entity: workerEntity, jurisdictionId: collection.id, fetchSource: scopedArchiveFetch(workerEntity, collection.id, seed, fetchSource), uploadFile, onProgress, manual: false }) : await archiveOwnedAddressResearchReferral({ entity, collectionId: collection.id, actor, selection: { url: referrals[0].url, source_page_url: referrals[0].source_page_url }, automatic: true, fetchSource, uploadFile, onProgress });
      }
      const current = await workerEntity.get(collection.id);
      collections.push({ ...addressResearchCollection(current), archive });
      await onProgress({ kind: "address_file_collection", collection_id: current.id, resources: current.documents.filter((d) => d.archive_state?.status === "complete").map((d) => ({ url: d.file_url, title: "Saved original: " + (d.title || d.url), doc_type: "saved_original" })), detail: `Retained ${current.documents.filter((d) => d.archive_state?.status === "complete").length} originals for ${scan.target.name}; ${current.documents.filter((d) => d.archive_state?.status !== "complete").length + (current.discovery_scan_state?.external_referrals || []).filter((ref) => !current.documents.some((doc) => doc.url === ref.url)).length} files still need download or verification. Research only; no authority approved.` });
    } catch (error) {
      collections.push({ target: scan.target, error: String(error.message || error), reference_only: true, authority_established: false });
      await onProgress({ kind: "address_archive_failed", detail: String(error.message || error) });
    }
  }
  return { status: collections.some((c) => c.error || c.archive?.success === false) ? "needs_review" : "retained", collections, reference_only: true, authority_established: false, automatic_archive_limit: archiveLimit };
}
async function archiveOwnedAddressResearchReferral({ entity, collectionId, actor, selection, automatic = false, automaticState, now, fetchSource, uploadFile, onProgress }) {
  automatic = automatic === true;
  const current = await entity.get(collectionId);
  const own = (row) => row?.owner_id === actor.id && row.owner_email === String(actor.email).toLowerCase() && row.reference_only === true && row.authority_established === false && row.scan_run_id === current.scan_run_id && row.permitting_url === current.permitting_url;
  if (!own(current)) throw Object.assign(Error("This research collection is not available to your account."), { status: 403 });
  if (automatic && (current.auto_refresh !== true || automaticState && current.state !== automaticState)) return { success: true, skipped: true, reason: "automatic_scope_changed" };
  const duplicates = await entity.filter({ collection_key: current.collection_key }, "created_date", 2);
  if (duplicates.length !== 1 || duplicates[0].id !== current.id) throw Object.assign(Error("Duplicate research collection requires review."), { status: 409 });
  const refs = (current.discovery_scan_state?.external_referrals || []).filter((ref) => ref.url === selection?.url && ref.source_page_url === selection?.source_page_url);
  if (refs.length !== 1 || refs[0].referral_kind !== "downloadable_document" || new URL(refs[0].url).protocol !== "https:" || new URL(refs[0].source_page_url).protocol !== "https:") throw Object.assign(Error("Select one retained HTTPS document referral."), { status: 400 });
  const adapter = { get: async (id) => {
    const row = await entity.get(id);
    if (!own(row) || automatic && (row.auto_refresh !== true || row.state !== current.state)) throw Error("Research collection owner or scope changed.");
    return row;
  }, updateMany: (query, patch) => entity.updateMany({ ...query, owner_id: actor.id, owner_email: String(actor.email).toLowerCase(), scan_run_id: current.scan_run_id, reference_only: true, authority_established: false, permitting_url: current.permitting_url, ...automatic ? { auto_refresh: true, state: current.state } : {} }, patch) };
  const result = await archiveExternalJurisdictionReferral({ entity: adapter, jurisdictionId: collectionId, selection, manual: !automatic, automaticScopedResume: automatic, automaticInitialCollection: automatic, now, fetchScopedSource: async (url, init, host3) => {
    await adapter.get(collectionId);
    return fetchSource(url, init, host3);
  }, fetchSource: scopedArchiveFetch(adapter, collectionId, current.permitting_url, fetchSource), uploadFile, onProgress, invalidateProfile: (_row, fields) => fields.discovery_scan_state ? { ...fields, discovery_scan_state: addressDiscoveryCursor(fields.discovery_scan_state, fields.documents || _row.documents) } : fields });
  return { ...result, collection: await adapter.get(collectionId) };
}

// base44/functions/findLocalityByAddress/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// base44/shared/pagedEntityRows.ts
var DEFAULT_PAGE_SIZE = 500;
var DEFAULT_MAX_ROWS = 5e4;
function rowIdentity(row, index) {
  const id = String(row?.id || "").trim();
  return id || `__row_${index}`;
}
async function loadAllEntityRows({
  entity,
  query = null,
  sort = "created_date",
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
  label = "Entity rows"
}) {
  const hasFilter = !!query && typeof query === "object";
  const reader = hasFilter ? entity?.filter : entity?.list;
  if (typeof reader !== "function") {
    throw new Error(`${label} could not initialize its paged read.`);
  }
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const safeMaxRows = Math.max(safePageSize, Number(maxRows) || DEFAULT_MAX_ROWS);
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  let skip = 0;
  while (skip < safeMaxRows) {
    const page = hasFilter ? await entity.filter(query, sort || void 0, safePageSize, skip) : await entity.list(sort || void 0, safePageSize, skip);
    if (!Array.isArray(page)) {
      throw new Error(`${label} could not be verified completely.`);
    }
    for (let index = 0; index < page.length; index += 1) {
      const row = page[index];
      const key2 = rowIdentity(row, skip + index);
      if (seen.has(key2)) continue;
      seen.add(key2);
      rows.push(row);
    }
    if (page.length < safePageSize) return rows;
    skip += safePageSize;
  }
  throw new Error(`${label} exceeds the ${safeMaxRows.toLocaleString()}-record verification safety limit.`);
}

// base44/shared/constantTime.ts
function constantTimeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

// base44/shared/signShopSession.ts
function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  let value = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  return atob(value);
}
async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key2 = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key2, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}
async function authenticateSignShopSession(base44, token) {
  const rawToken = String(token || "").trim();
  if (!rawToken) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const parts = rawToken.split(".");
  if (parts.length !== 2) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const secret = Deno.env.get("SESSION_SIGNING_SECRET");
  if (!secret) throw Object.assign(new Error("Session authentication is unavailable"), { status: 503 });
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) throw Object.assign(new Error("Authentication required"), { status: 401 });
  let sessionPayload;
  try {
    sessionPayload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  const email = String(sessionPayload?.email || "").trim().toLowerCase();
  const issuedAt = Number(sessionPayload?.iat);
  const expiresAt = Number(sessionPayload?.exp);
  if (!email || !Number.isFinite(issuedAt) || issuedAt <= 0 || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(users)) {
    throw Object.assign(new Error("Authenticated user identity could not be verified"), { status: 503 });
  }
  if (users.length === 0) throw Object.assign(new Error("Authentication required"), { status: 401 });
  if (users.length !== 1) {
    throw Object.assign(new Error("Authenticated user identity is ambiguous"), { status: 409 });
  }
  const user = users[0];
  const notBefore = Date.parse(String(user?.session_not_before || ""));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  return user;
}

// base44/shared/permittingAddressState.js
function normalizeAddressState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "ohio" || state === "oh") return "oh";
  if (state === "kentucky" || state === "ky") return "ky";
  return state;
}

// base44/shared/permittingAddressLocality.js
var AUTHORITY_ROLES = /* @__PURE__ */ new Set([
  "sign_permit",
  "zoning",
  "building",
  "electrical",
  "electrical_permit",
  "electrical_inspection",
  "right_of_way",
  "historic_review",
  "planning",
  "transportation",
  "other"
]);
function summarizeElectricalRoleCoverage(verifiedRoles = [], reviewRoles = []) {
  const verified = new Set(verifiedRoles), pending = new Set(reviewRoles);
  const roles = ["electrical_permit", "electrical_inspection"];
  const missing = roles.filter((role) => !verified.has(role));
  return {
    status: missing.length === 0 ? "specific_roles_reviewed" : "specific_role_gaps",
    roles: Object.fromEntries(roles.map((role) => [
      role,
      verified.has(role) ? "staff_verified" : pending.has(role) ? "needs_review" : "missing"
    ])),
    missing_roles: missing,
    legacy_broad_role_present: verified.has("electrical") || pending.has("electrical"),
    applicability_verified: false,
    complete_legal_coverage: false
  };
}
function summarizeMatchedLocalityAuthority(locality) {
  if (!locality?.id) return {
    status: "unresolved",
    verified_roles: [],
    verified_office_count: 0,
    other_office_count: 0,
    coverage_status: "unresolved",
    roles_needing_review: [],
    electrical_coverage: summarizeElectricalRoleCoverage()
  };
  const offices = Array.isArray(locality.offices) ? locality.offices : [];
  const verified = offices.filter(
    (office) => office?.authority_verification_status === "staff_verified" && Array.isArray(office.authority_roles) && office.authority_roles.length > 0 && office.authority_roles.every((role) => AUTHORITY_ROLES.has(role))
  );
  const needsReview = offices.filter((office) => !verified.includes(office));
  const rolesNeedingReview = needsReview.flatMap(
    (office) => Array.isArray(office?.authority_roles) ? office.authority_roles.filter((role) => AUTHORITY_ROLES.has(role)) : []
  );
  return {
    status: verified.length > 0 ? "staff_verified_roles" : "no_staff_verified_roles",
    verified_roles: [...new Set(verified.flatMap((office) => office.authority_roles))],
    verified_office_count: verified.length,
    other_office_count: needsReview.length,
    // This describes only configured office review, never complete legal coverage.
    coverage_status: offices.length === 0 ? "not_configured" : verified.length === 0 ? "not_verified" : needsReview.length > 0 ? "partial" : "configured_offices_reviewed",
    roles_needing_review: [...new Set(rolesNeedingReview)],
    electrical_coverage: summarizeElectricalRoleCoverage(verified.flatMap((office) => office.authority_roles), rolesNeedingReview)
  };
}

// base44/shared/permittingSpatialResolution.mjs
var CENSUS = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";
var LOCATION_SOURCES = { county: `${CENSUS}/State_County/MapServer/1`, place: `${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/4`, township: `${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/1`, oh_city: "https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0", oh_township: "https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3", ky_city: "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0" };
var norm = (value) => String(value || "").trim().toLowerCase().replace(/^(city|village|town) of\s+/, "").replace(/\s+(city|village|town|county|township)$/, "").replace(/\s+/g, " ");
function boundaryPosition(rings, point) {
  if (!Array.isArray(rings) || !rings.length || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) throw Error("Invalid boundary geometry.");
  let inside = false, distance = Infinity, count = 0;
  const x = point.lng, y = point.lat, sx = 111320 * Math.cos(y * Math.PI / 180), sy = 111320;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4 || ring[0]?.[0] !== ring[ring.length - 1]?.[0] || ring[0]?.[1] !== ring[ring.length - 1]?.[1]) throw Error("Incomplete boundary geometry.");
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if (!Array.isArray(a) || a.length < 2 || !Array.isArray(b) || b.length < 2 || !a.slice(0, 2).every(Number.isFinite) || !b.slice(0, 2).every(Number.isFinite) || Math.abs(a[0]) > 180 || Math.abs(a[1]) > 90) throw Error("Invalid boundary coordinates.");
      if (++count > 1e5) throw Error("Boundary geometry too large.");
      if (a[1] > y !== b[1] > y && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      const ax = (a[0] - x) * sx, ay = (a[1] - y) * sy, bx = (b[0] - x) * sx, by = (b[1] - y) * sy, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      distance = Math.min(distance, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return { inside, distance_m: distance };
}
function strictGeocode(results, address = "") {
  if (!Array.isArray(results) || results.length !== 1) return false;
  const g = results[0], parts = g.address_components || [];
  const part = (type) => parts.find((c) => c.types?.includes(type))?.long_name || "";
  const street = (value) => String(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => ({ street: "st", road: "rd", drive: "dr", avenue: "ave", boulevard: "blvd", lane: "ln", court: "ct", parkway: "pkwy", highway: "hwy", north: "n", south: "s", east: "e", west: "w" })[w] || w).join(" ");
  const requested = street(address.split(",")[0].replace(/\s+(apt|suite|unit|#)\s*.*$/i, "")), found = street(part("street_number") + " " + part("route"));
  const stateMatch = address.match(/(?:,\s*|\s)(Ohio|Kentucky|OH|KY)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?(?:,?\s+(?:USA|United States))?\s*$/i), zipMatch = address.match(/\b([0-9]{5})(?:-[0-9]{4})?\s*$/);
  const stateMatches = stateMatch ? normalizeAddressState(stateMatch[1]) === normalizeAddressState(part("administrative_area_level_1")) : false;
  const zipMatches = !zipMatch || zipMatch[1] === part("postal_code");
  const city = street(part("locality") || part("postal_town"));
  const streetMatches = requested === found || !address.includes(",") && city && requested.startsWith(found + " " + city + " ");
  const enteredCity = address.includes(",") ? address.split(",")[1].replace(/\s+(OH|Ohio|KY|Kentucky)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?\s*$/i, "").trim() : "";
  const formattedCity = String(g.formatted_address || "").split(",")[1]?.replace(/\s+(OH|Ohio|KY|Kentucky)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?\s*$/i, "").trim();
  const cityMatches = !enteredCity || [part("locality"), part("postal_town"), formattedCity].some((value) => value && norm(value) === norm(enteredCity));
  return Boolean(address) && stateMatches && zipMatches && streetMatches && cityMatches && g.partial_match !== true && g.geometry?.location_type === "ROOFTOP" && g.types?.some((t) => ["street_address", "premise", "subpremise"].includes(t)) && ["street_number", "route", "administrative_area_level_1"].every((type) => parts.some((c) => c.types?.includes(type)));
}
async function resolveSpatialLocation({ geocode, fetchJSON, onProgress = async () => {
} }) {
  const state = normalizeAddressState(geocode?.address_parts?.administrative_area_level_1).toUpperCase(), point = { lat: geocode?.lat, lng: geocode?.lon };
  const base = { status: "unresolved", state, point, checked_at: (/* @__PURE__ */ new Date()).toISOString(), targets: [], boundaries: [], sources: [], reason: "We could not confirm the property location. An administrator needs to check it." };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !["OH", "KY"].includes(state)) return { ...base, reason: "Enter a complete street address in Ohio or Kentucky." };
  const fips = state === "OH" ? "39" : "21";
  async function query(kind, url) {
    const params = new URLSearchParams({ f: "json", where: "1=1", geometry: JSON.stringify({ x: point.lng, y: point.lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", distance: "25", units: "esriSRUnit_Meter", outFields: "*", returnGeometry: "true", outSR: "4326", resultRecordCount: "10" }), source = url + "/query?" + params;
    await onProgress({ kind: "boundary_query", url: source, detail: `Checking ${kind} boundaries at ${point.lat}, ${point.lng}.` });
    const data = await fetchJSON(source);
    if (data.error || data.exceededTransferLimit || !Array.isArray(data.features) || data.features.length > 10 || data.features.length && data.spatialReference?.wkid !== 4326) throw Error(`${kind} boundary service returned incomplete or invalid data.`);
    base.sources.push({ kind, url: source, checked_at: base.checked_at });
    return data.features.map((f) => ({ ...f, ...boundaryPosition(f.geometry?.rings, point), source_url: source, kind }));
  }
  try {
    const keys = [["county", LOCATION_SOURCES.county], ["municipality", LOCATION_SOURCES.place], ["state municipality", state === "OH" ? LOCATION_SOURCES.oh_city : LOCATION_SOURCES.ky_city]];
    const rows = [];
    for (const [kind, url] of keys) rows.push(await query(kind, url));
    const [counties, places, statePlaces] = rows;
    let townships = [], stateTownships = [];
    const county = counties.filter((f) => f.inside);
    if (county.length !== 1 || String(county[0].attributes.STATE) !== fips || !new RegExp("^" + fips + "[0-9]{3}$").test(String(county[0].attributes.GEOID))) throw Error("County/state location is missing or conflicting.");
    const countyRow = county[0], countyName = countyRow.attributes.NAME, countyId = countyRow.attributes.GEOID;
    const cities = places.filter((f) => f.inside), stateCities = statePlaces.filter((f) => f.inside);
    let target;
    if (cities.length > 1 || stateCities.length > 1 || cities.length !== stateCities.length) throw Error("Official boundary sources disagree about the municipality.");
    if (cities.length === 1) {
      const c = cities[0], s = stateCities[0], sName = s.attributes.municipality || s.attributes.NAME;
      if (String(c.attributes.STATE) !== fips || !new RegExp("^" + fips + "[0-9]{5}$").test(String(c.attributes.GEOID)) || norm(c.attributes.NAME) !== norm(sName)) throw Error("Official municipal identities disagree.");
      target = { name: c.attributes.NAME.replace(/\s+(city|village|town)$/i, ""), state, type: "municipality", geoid: c.attributes.GEOID, county: countyName, county_geoid: countyId, geometry: c.geometry, source_url: s.source_url };
    } else if (state === "OH") {
      townships = await query("township", LOCATION_SOURCES.township);
      stateTownships = await query("state township", LOCATION_SOURCES.oh_township);
      const t = townships.filter((f) => f.inside && /\btownship$/i.test(f.attributes.NAME)), s = stateTownships.filter((f) => f.inside);
      if (t.length !== 1 || s.length !== 1 || String(t[0].attributes.STATE) !== fips || !new RegExp("^" + countyId + "[0-9]{5}$").test(String(t[0].attributes.GEOID)) || norm(t[0].attributes.NAME) !== norm(s[0].attributes.TOWNSHIP) || norm(countyName) !== norm(s[0].attributes.COUNTY)) throw Error("Township location is missing or conflicting.");
      target = { name: t[0].attributes.NAME, state, type: "township", geoid: t[0].attributes.GEOID, county: countyName, county_geoid: countyId, geometry: t[0].geometry, source_url: s[0].source_url };
    } else target = { name: countyName, state, type: "county", geoid: countyId, county: countyName, county_geoid: countyId, geometry: countyRow.geometry, source_url: countyRow.source_url };
    base.targets = [{ ...target, geometry: void 0 }, { name: countyName, state, type: "county", geoid: countyId, county: countyName }].filter((t, i, all) => all.findIndex((other) => other.geoid === t.geoid) === i);
    base.boundaries = [{ type: "Feature", properties: { name: target.name, source_url: target.source_url }, geometry: { type: "MultiLineString", coordinates: target.geometry.rings } }];
    const relevant = [...counties, ...places, ...statePlaces, ...cities.length === 0 ? [...townships, ...stateTownships] : []];
    if (!geocode.location_exact) return { ...base, status: "needs_review", reason: "The map found an approximate address. We cannot confirm its jurisdiction yet." };
    if (relevant.some((f) => f.distance_m <= 25)) return { ...base, status: "needs_review", reason: "This address is close to a boundary. An administrator must confirm the property before it is used." };
    return { ...base, status: "location_verified", reason: `Building location is inside the checked ${target.name} government boundary. Office responsibility is checked separately.`, target: base.targets[0] };
  } catch (error) {
    await onProgress({ kind: "boundary_failed", detail: String(error.message || error) });
    return { ...base, reason: "Government location data could not confirm this address. No jurisdiction was selected.", error: String(error.message || error) };
  }
}
function exactConfiguredLocality(localities, resolution, profiles = []) {
  if (resolution?.status !== "location_verified" || !resolution.target) return null;
  const target = resolution.target;
  const matches = localities.filter((row) => {
    if (normalizeAddressState(row.state).toUpperCase() !== target.state || norm(row.name) !== norm(target.name)) return false;
    const township = /township/i.test(row.name), county = /county$/i.test(String(row.name).trim());
    if (target.type === "county" && !county || target.type !== "county" && county) return false;
    if (target.type === "township" && !township || target.type !== "township" && township) return false;
    if (row.geographic_identity?.geoid) return row.geographic_identity.geoid === target.geoid;
    if (target.type !== "county") {
      const profile = profiles.find((p) => p.id === row.jurisdiction_profile_id), county2 = row.county || row.parent_county?.name || profile?.parent_county?.name;
      return norm(county2) === norm(target.county);
    }
    return true;
  });
  return matches.length === 1 ? matches[0] : null;
}

// base44/shared/permittingAddressDiscovery.mjs
async function discoverUnmatchedAddress({ address, resolution, profiles = [], research, fetchPage, onProgress = async () => {
} }) {
  const targets = resolution.targets?.length ? resolution.targets : [{ name: address, state: resolution.state, type: "unconfirmed address" }];
  const scans = [];
  for (const target of targets) {
    const prompt = `Find the official government website and permitting department for ${target.name}, ${target.state || ""}, ${target.type}. County: ${target.county || "unconfirmed"}. Government geographic ID: ${target.geoid || "unconfirmed"}. Address context: ${address}. Return website_url and permitting_url only when sourced; otherwise empty. Do not decide the jurisdiction from the postal city. This is reference research, not a verified authority assignment.`;
    await onProgress({ kind: "automatic_search", detail: prompt + " Internal search queries and visited pages are not exposed by the research service.", progress: { stage: `Finding official sources for ${target.name}`, indeterminate: true } });
    try {
      const countyName = (value) => String(value || "").trim().toLowerCase().replace(/\s+county$/, "");
      const candidates = profiles.filter((p) => p.name?.trim().toLowerCase() === target.name?.trim().toLowerCase() && normalizeAddressState(p.state) === normalizeAddressState(target.state) && (target.type === "county" || Boolean(target.county) && countyName(p.parent_county?.name) === countyName(target.county)));
      let candidate = candidates.length === 1 ? candidates[0] : null;
      if (!candidate?.website_url && !candidate?.permitting_url) candidate = await research(prompt);
      const seed = candidate?.permitting_url || candidate?.website_url;
      if (!seed) {
        scans.push({ target, status: "needs_review", error: "No official website could be located." });
        await onProgress({ kind: "automatic_no_source", detail: `No official website found for ${target.name}.` });
        continue;
      }
      const url = new URL(seed);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Website candidate is invalid.");
      await onProgress({ kind: "automatic_source", url: url.href, detail: `Checking the candidate website for ${target.name}; authority remains unverified.` });
      const scan = await scanOfficialPermittingPages({ seedUrl: url.href, fetchPage, maxPages: 3, maxDepth: 2, onProgress });
      scans.push({ target, status: scan.success ? "reference_found" : "needs_review", ...scan });
    } catch (error) {
      scans.push({ target, status: "needs_review", error: String(error.message || error) });
      await onProgress({ kind: "automatic_scan_failed", detail: `${target.name}: ${String(error.message || error)}` });
    }
  }
  return { started: true, reference_only: true, scans, authority_established: false, requires_review: true };
}

// base44/shared/safeExternalFetch.ts
var BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function isBlockedIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}
function isBlockedIpv6(ip) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::" || value === "::1" || value.startsWith("::")) return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe")) return true;
  if (value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8:") || value === "2001:db8::") return true;
  if (value.startsWith("2002:")) return true;
  if (value.startsWith("2001:0:") || value === "2001::") return true;
  if (value.startsWith("64:ff9b:")) return true;
  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}
function looksLikeIpv4(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}
function isBlockedAddress(address) {
  return address.includes(":") ? isBlockedIpv6(address) : isBlockedIpv4(address);
}
async function assertSafeExternalUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw Object.assign(new Error("A valid external URL is required."), { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(new Error("Only http and https URLs are allowed."), { status: 400 });
  }
  if (url.port && !(url.protocol === "http:" && url.port === "80" || url.protocol === "https:" && url.port === "443")) {
    throw Object.assign(new Error("Only standard web ports are allowed for external URLs."), { status: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("URLs containing embedded credentials are not allowed."), { status: 400 });
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw Object.assign(new Error("Private or local network destinations are not allowed."), { status: 400 });
  }
  if (looksLikeIpv4(hostname) && isBlockedIpv4(hostname)) {
    throw Object.assign(new Error("Private or reserved network destinations are not allowed."), { status: 400 });
  }
  if (hostname.includes(":") && isBlockedIpv6(hostname)) {
    throw Object.assign(new Error("Private or reserved network destinations are not allowed."), { status: 400 });
  }
  if (!looksLikeIpv4(hostname) && !hostname.includes(":")) {
    let resolved = 0;
    for (const recordType of ["A", "AAAA"]) {
      try {
        const answers = await Deno.resolveDns(hostname, recordType);
        for (const address of answers) {
          resolved += 1;
          if (isBlockedAddress(String(address))) {
            throw Object.assign(new Error("Private or reserved network destinations are not allowed."), { status: 400 });
          }
        }
      } catch (error) {
        if (Number(error?.status) === 400) throw error;
      }
    }
    if (resolved === 0) {
      throw Object.assign(new Error("The external hostname could not be resolved safely."), { status: 400 });
    }
  }
  return url;
}
async function safeExternalFetch(input, init = {}, maxRedirects = 5, allowedUrl) {
  let url = await assertSafeExternalUrl(input);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (allowedUrl && !allowedUrl(new URL(url.href))) {
      throw Object.assign(new Error("External redirect is outside the selected document/source host; review required."), { status: 400 });
    }
    const response = await fetch(url, { ...init, redirect: "manual" });
    await assertSafeExternalUrl(url.toString());
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount === maxRedirects) {
      throw Object.assign(new Error("Too many redirects while fetching the external document."), { status: 400 });
    }
    const location = response.headers.get("location");
    if (!location) {
      throw Object.assign(new Error("External redirect did not provide a destination."), { status: 400 });
    }
    url = await assertSafeExternalUrl(new URL(location, url).toString());
  }
  throw Object.assign(new Error("External document could not be fetched safely."), { status: 400 });
}

// base44/functions/findLocalityByAddress/entry.ts
async function fixedJSON(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw Error("Location service returned HTTP " + response.status);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw Error("Location response exceeds its limit.");
  return JSON.parse(text);
}
var ADDRESS_LOOKUP_REVISION = "address-geocode-v4";
function addressResponse(data, init = {}) {
  const response = Response.json({ ...data, lookup_revision: ADDRESS_LOOKUP_REVISION }, init);
  response.headers.set("X-CCS-Address-Revision", ADDRESS_LOOKUP_REVISION);
  return response;
}
Deno.serve(async (req) => {
  let reporter = silentScanReporter;
  try {
    const base44 = createClientFromRequest(req), body = await req.json(), actor = await authenticateSignShopSession(base44, body?.session_token);
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) return addressResponse({ success: false, error: "Enter a full street address of 500 characters or fewer." }, { status: 400 });
    if (body.action_token) reporter = await createScanReporter({ entity: base44.asServiceRole.entities.PermittingScanRun, token: body.action_token, user: actor, targetId: "address-lookup", targetName: address, kind: "address", label: `Find jurisdiction for ${address}` });
    const progress = async (event) => {
      const { progress: progress2, ...item } = event;
      await reporter.emit(item, progress2 || {});
    };
    await reporter.emit({ kind: "address_lookup", detail: `Looking up ${address}. Service revision: ${ADDRESS_LOOKUP_REVISION}.` }, { stage: "Finding the building on the map", indeterminate: true });
    let geocode = null, geocodingService = null;
    const serviceFailure = (status, message) => geocodingService = { status, issue: true, message };
    try {
      const key2 = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (!key2) {
        serviceFailure("NOT_CONFIGURED", "The map location service is not configured. An administrator needs to check its server key. You do not need to re-enter this address.");
        throw Error("Map geocoding is not configured.");
      }
      await reporter.emit({ kind: "geocode_lookup", url: "https://maps.googleapis.com/maps/api/geocode/json", detail: `Searching for ${address}.` });
      const data = await fixedJSON(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key2)}`);
      const serviceStatus = ["OK", "ZERO_RESULTS", "REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "INVALID_REQUEST", "UNKNOWN_ERROR"].includes(data.status) ? data.status : "UNKNOWN_STATUS";
      const serviceResultCount = Array.isArray(data.results) ? data.results.length : 0;
      console.info("CCS address geocoder v4", { status: serviceStatus, result_count: serviceResultCount });
      await reporter.emit({ kind: "geocode_service_result", detail: `Google Geocoding responded: ${serviceStatus}; ${serviceResultCount} address results.` });
      if (serviceStatus === "OK" && !serviceResultCount) serviceFailure("EMPTY_RESULT", "The map service returned an empty response. Try again later; no jurisdiction has been selected.");
      else if (serviceStatus === "ZERO_RESULTS") geocodingService = { status: serviceStatus, issue: false, message: "No address match was returned. Check the street address." };
      else if (serviceStatus !== "OK") serviceFailure(serviceStatus, serviceStatus === "REQUEST_DENIED" ? "Google rejected the map location request. An administrator needs to check the server key, Geocoding API access and billing. You do not need to re-enter this address." : serviceStatus === "OVER_QUERY_LIMIT" || serviceStatus === "OVER_DAILY_LIMIT" ? "Google Geocoding reached its service limit. Try again later or ask an administrator to check quota and billing." : serviceStatus === "INVALID_REQUEST" ? "The map service rejected the lookup request. An administrator needs to check the request setup." : "The map location service is temporarily unavailable. Try again later.");
      if (geocodingService) await reporter.emit({ kind: "geocode_failed", detail: `Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}` });
      if (data.status === "OK" && data.results?.length) {
        const g = data.results[0];
        geocode = { lat: g.geometry?.location?.lat, lon: g.geometry?.location?.lng, display_name: g.formatted_address, location_exact: strictGeocode(data.results, address), address_parts: (g.address_components || []).reduce((a, c) => {
          for (const t of c.types || []) a[t] = c.long_name;
          return a;
        }, {}) };
      }
    } catch {
      if (!geocodingService) serviceFailure("UNAVAILABLE", "The map location service could not be reached. Try again later; no jurisdiction has been selected.");
      await reporter.emit({ kind: "geocode_failed", detail: `Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}` });
    }
    await reporter.emit({ kind: "geocode_result", detail: geocode ? `Map result: ${geocode.display_name}; latitude ${geocode.lat}, longitude ${geocode.lon}. ${geocode.location_exact ? "Street and building coordinates matched." : "Approximate or corrected address; review required."}` : "No map location found." }, { stage: "Checking government boundaries", indeterminate: true });
    const resolution = await resolveSpatialLocation({ geocode, fetchJSON: fixedJSON, onProgress: progress });
    const hasServiceIssue = Boolean(geocodingService?.issue && resolution.status !== "location_verified");
    if (hasServiceIssue) resolution.reason = geocodingService.message;
    await reporter.emit({ kind: "location_result", detail: resolution.reason }, { stage: "Checking saved jurisdictions", indeterminate: true });
    const localities = await loadAllEntityRows({ entity: base44.asServiceRole.entities.PermitLocality, sort: "created_date", label: "Location matching catalog" });
    const profiles = await loadAllEntityRows({ entity: base44.asServiceRole.entities.JurisdictionProfile, sort: "created_date", label: "Location county identities" });
    const matched = exactConfiguredLocality(localities, resolution, profiles);
    await reporter.emit({ kind: "catalog_check", detail: `Checked ${localities.length} saved jurisdictions. ${matched ? `Unique location match: ${matched.name}. ${matched.offices?.some((office) => office.authority_verification_status === "staff_verified") ? "Checking reviewed office roles." : "Office setup needs review; starting research."}` : "No unique confirmed match. Starting automatic website research."}` });
    const authority = summarizeMatchedLocalityAuthority(matched);
    const applyAllowed = Boolean(matched && authority.verified_roles.includes("sign_permit") && authority.verified_roles.includes("zoning"));
    const automatic = applyAllowed ? null : await discoverUnmatchedAddress({
      address,
      resolution,
      profiles,
      onProgress: progress,
      research: async (prompt) => base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: true, model: "gemini_3_flash", response_json_schema: { type: "object", properties: { website_url: { type: "string" }, permitting_url: { type: "string" } } } }),
      fetchPage: async (url) => {
        const response = await safeExternalFetch(url, { method: "GET", signal: AbortSignal.timeout(15e3), headers: { "User-Agent": "CCS-Permitting-Address/1.0" } }, 3);
        return readPermittingResourceResponse(response);
      }
    });
    const addressArchives = await retainAddressResearchFiles({
      entity: base44.asServiceRole.entities.PermittingAddressArchive,
      scanRunId: reporter.id,
      actor,
      resolution,
      automatic,
      onProgress: progress,
      fetchSource: (url, init, host3) => safeExternalFetch(url, init, 3, host3 ? (candidate) => candidate.protocol === "https:" && candidate.hostname.toLowerCase().replace(/^www\./, "") === host3 : void 0),
      uploadFile: (data) => base44.asServiceRole.integrations.Core.UploadFile(data)
    });
    const reason = matched ? resolution.reason : resolution.status === "location_verified" ? `Location is ${resolution.target.name}, but its saved office setup is missing or ambiguous. Automatic research is ready for administrator review.` : resolution.reason;
    await reporter.emit({ kind: "address_findings", detail: reason }, { stage: applyAllowed ? "Ready to use" : "Administrator review needed", processed: 1, total: 1, indeterminate: false });
    return addressResponse({ success: true, scan_run: await reporter.finish(hasServiceIssue || addressArchives?.status === "needs_review" ? "completed_with_errors" : "complete", hasServiceIssue ? geocodingService.message : void 0), geocode, geocoding_service: geocodingService, location_resolution: resolution, automatic_scan: automatic, address_archives: addressArchives, suggested_locality: matched ? { id: matched.id, name: matched.name, state: matched.state, zip: matched.zip, jurisdiction_profile_id: matched.jurisdiction_profile_id } : null, authority_review: authority, apply_allowed: applyAllowed, not_matched: !matched, ai_locality_name: resolution.target?.name || "", ai_state: resolution.state || "", ai_county: resolution.target?.county || "", match_confidence: matched ? "high" : "unresolved", match_method: matched ? "government_boundary_intersection" : "none", match_reason: reason, notes: !applyAllowed ? "An administrator must confirm the location and sign/zoning office setup before this address is used." : "" });
  } catch (error) {
    const status = [400, 401, 409, 503].includes(Number(error?.status)) ? Number(error.status) : 500;
    return addressResponse({ success: false, scan_run: await reporter.finish("failed", "Address lookup could not finish safely."), error: status === 500 ? "Address lookup could not finish safely. Please try again." : error.message }, { status });
  }
});
