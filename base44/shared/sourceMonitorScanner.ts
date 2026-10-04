// Shared source-monitor scanner logic — used by the scheduled scan function.
// CHEAP FIRST: HTTP fetch + hash/headers comparison. AI only on meaningful changes.
// Never erases archives, never auto-promotes drafts, never rewrites approved rules.

import { safeExternalFetch } from "./safeExternalFetch.ts";

// ── Cadence → interval (seconds) ──
const CADENCE_SECONDS: Record<string, number> = {
  volatile: 7 * 86400,     // weekly — active rewrite pages, meeting feeds
  moderate: 30 * 86400,    // monthly — fee schedules, forms
  stable: 90 * 86400,      // quarterly — adopted zoning codes
  immutable: 365 * 86400,  // yearly — historical archived files
};

export function cadenceSeconds(cadence: string): number {
  return CADENCE_SECONDS[String(cadence || "moderate").toLowerCase()] || CADENCE_SECONDS.moderate;
}

export function computeNextCheckDue(cadence: string, fromIso?: string): string {
  const base = fromIso ? new Date(fromIso) : new Date();
  return new Date(base.getTime() + cadenceSeconds(cadence) * 1000).toISOString();
}

// ── SHA-256 via Web Crypto ──
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Cheap check result ──
export interface CheapCheckResult {
  status: number;
  etag: string;
  lastModified: string;
  contentLength: number;
  bodyText: string;
  hash: string;
  contentType: string;
}

export async function cheapFetch(url: string, timeoutMs = 20000): Promise<CheapCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await safeExternalFetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "CCS-Permitting-Monitor/1.0" },
    }, 3);
    const bodyText = await response.text();
    const hash = await sha256Hex(bodyText);
    return {
      status: response.status,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      contentLength: Number(response.headers.get("content-length") || bodyText.length),
      bodyText,
      hash,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Determine if a change occurred ──
export function detectChange(
  prev: { last_known_hash?: string; last_known_etag?: string; last_known_last_modified?: string; last_known_content_length?: number },
  next: CheapCheckResult,
): { changed: boolean; method: string } {
  // Prefer ETag if both sides have it
  if (prev.last_known_etag && next.etag) {
    return { changed: prev.last_known_etag !== next.etag, method: "etag" };
  }
  // Then Last-Modified
  if (prev.last_known_last_modified && next.lastModified) {
    return { changed: prev.last_known_last_modified !== next.lastModified, method: "last_modified" };
  }
  // Then Content-Length (only as a signal — still verify with hash)
  if (prev.last_known_content_length && next.contentLength && prev.last_known_content_length !== next.contentLength) {
    return { changed: true, method: "content_length" };
  }
  // Fallback: hash comparison (always reliable)
  const hashChanged = prev.last_known_hash !== next.hash;
  return { changed: hashChanged, method: "hash" };
}

// ── Extract changed links from HTML (simple <a href> diff) ──
export function extractLinks(html: string): Set<string> {
  const links = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.add(m[1]);
  }
  return links;
}

export function diffLinkSet(oldLinks: Set<string>, newLinks: Set<string>): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const l of newLinks) if (!oldLinks.has(l)) added.push(l);
  for (const l of oldLinks) if (!newLinks.has(l)) removed.push(l);
  return { added, removed };
}

// ── Simple text diff summary (first N changed lines) ──
export function textDiffSummary(oldText: string, newText: string, maxLines = 10): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const changes: string[] = [];
  const max = Math.min(Math.max(oldLines.length, newLines.length), maxLines);
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) {
      if (oldLines[i]) changes.push(`- ${oldLines[i].trim().slice(0, 200)}`);
      if (newLines[i]) changes.push(`+ ${newLines[i].trim().slice(0, 200)}`);
    }
  }
  return changes.join("\n").slice(0, 2000) || "No line-level diff detected (content length or hash differs).";
}

// ── AI regulatory impact assessment (only called on change) ──
export async function assessRegulatoryImpact(
  base44: any,
  sourceTitle: string,
  jurisdictionName: string,
  diffSummary: string,
  changedLinks: { added: string[]; removed: string[] },
): Promise<{ mayAffect: boolean; summary: string }> {
  try {
    const prompt = `You are a permitting regulatory analyst. A monitored source document has changed. Determine whether the change MAY affect regulatory requirements (sign rules, permit procedures, fees, dimensional standards, illumination rules, submittal requirements).

Jurisdiction: ${jurisdictionName}
Source: ${sourceTitle}

Change summary:
${diffSummary.slice(0, 1500)}

Changed links:
  Added: ${changedLinks.added.length} links
  Removed: ${changedLinks.removed.length} links

Respond with JSON: { "may_affect_regulatory_data": boolean, "reasoning": "one sentence" }`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          may_affect_regulatory_data: { type: "boolean" },
          reasoning: { type: "string" },
        },
      },
    });
    return {
      mayAffect: Boolean(result?.may_affect_regulatory_data),
      summary: String(result?.reasoning || "AI assessment completed"),
    };
  } catch (e) {
    // On AI failure, conservatively assume impact and flag for staff review
    return { mayAffect: true, summary: `AI assessment failed (${e.message}); conservatively flagging for review` };
  }
}

// ── Default cadence from source type ──
export function defaultCadence(sourceType: string, authorityClassification: string): string {
  const st = String(sourceType || "").toLowerCase();
  const cls = String(authorityClassification || "").toLowerCase();
  // Historical/immutable files
  if (cls === "historical" || cls === "superseded") return "immutable";
  // Draft/rewrite project pages change often
  if (cls === "draft_proposed" || cls === "comprehensive_rewrite") return "volatile";
  // Fee schedules
  if (st === "fee_schedule") return "moderate";
  // Application forms
  if (st === "permit_application" || st === "checklist") return "moderate";
  // Meeting/ordinance feeds during active rewrite
  if (st === "legislative_record") return "volatile";
  // Adopted zoning codes
  if (st === "sign_ordinance" || st === "zoning_code") return "stable";
  return "moderate";
}