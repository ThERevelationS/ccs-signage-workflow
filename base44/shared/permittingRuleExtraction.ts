// Shared extraction/citation helpers for the PermittingRule engine.
// Used by the extraction function, the review function, and the invalidation helper.
// Integrates with the existing authority gate — calls it, never duplicates it.

import { classifyRewriteSourceAuthority } from "./jurisdictionResearchAuthorityGate.mjs";

// ── Sign type normalization taxonomy ──
// Source terminology is preserved verbatim in sign_type; sign_type_normalized
// maps to one of these canonical values for cross-jurisdiction querying.
export const SIGN_TYPE_TAXONOMY = Object.freeze([
  "wall",
  "channel_letters",
  "cabinet",
  "monument",
  "pole_pylon",
  "ground",
  "projecting",
  "blade",
  "awning_canopy",
  "window",
  "temporary",
  "banner",
  "feather_flag",
  "real_estate",
  "construction",
  "directional",
  "incidental",
  "menu_board",
  "emc",
  "digital",
  "changeable_copy",
  "roof",
  "subdivision",
  "special_district",
]);

const SIGN_TYPE_ALIASES: Record<string, string> = {
  "wall": "wall",
  "wall sign": "wall",
  "building mounted": "wall",
  "building mounted sign": "wall",
  "building-mounted": "wall",
  "channel letter": "channel_letters",
  "channel letters": "channel_letters",
  "channel_letters": "channel_letters",
  "individually illuminated letters": "channel_letters",
  "cabinet": "cabinet",
  "cabinet sign": "cabinet",
  "box sign": "cabinet",
  "monument": "monument",
  "monument sign": "monument",
  "ground sign": "ground",
  "ground": "ground",
  "pole sign": "pole_pylon",
  "pylon sign": "pole_pylon",
  "pole": "pole_pylon",
  "pylon": "pole_pylon",
  "projecting": "projecting",
  "projecting sign": "projecting",
  "blade sign": "blade",
  "blade": "blade",
  "awning": "awning_canopy",
  "canopy": "awning_canopy",
  "awning sign": "awning_canopy",
  "canopy sign": "awning_canopy",
  "window sign": "window",
  "window": "window",
  "temporary sign": "temporary",
  "temporary": "temporary",
  "temporary advertising": "temporary",
  "banner": "banner",
  "banners": "banner",
  "feather flag": "feather_flag",
  "feather flags": "feather_flag",
  "real estate sign": "real_estate",
  "real estate": "real_estate",
  "construction sign": "construction",
  "construction": "construction",
  "directional sign": "directional",
  "directional": "directional",
  "incidental sign": "incidental",
  "incidental": "incidental",
  "menu board": "menu_board",
  "menu_board": "menu_board",
  "electronic message board": "emc",
  "electronic message board/screen": "emc",
  "electronic message": "emc",
  "emc": "emc",
  "electronic sign": "emc",
  "digital sign": "digital",
  "digital": "digital",
  "digital display": "digital",
  "changeable copy": "changeable_copy",
  "changeable copy sign": "changeable_copy",
  "automatic changeable copy": "changeable_copy",
  "roof sign": "roof",
  "roof": "roof",
  "subdivision sign": "subdivision",
  "subdivision": "subdivision",
  "special sign district": "special_district",
  "special district": "special_district",
};

export function normalizeSignType(sourceTerm: string | null | undefined): string | null {
  if (!sourceTerm) return null;
  const key = String(sourceTerm).trim().toLowerCase();
  if (!key) return null;
  if (SIGN_TYPE_ALIASES[key]) return SIGN_TYPE_ALIASES[key];
  // Try partial match
  for (const alias of Object.keys(SIGN_TYPE_ALIASES)) {
    if (key.includes(alias)) return SIGN_TYPE_ALIASES[alias];
  }
  return null;
}

// ── Authority gate integration ──
// Draft/proposed/comprehensive_rewrite sources are flagged and can never be operational.
const DRAFT_CLASSIFICATIONS = new Set(["draft_proposed", "comprehensive_rewrite"]);
const HISTORICAL_CONTENT = new Set(["historical", "superseded"]);

export function isDraftSource(doc: { authority_classification?: string; extracted_text?: string } = {}): boolean {
  const cls = String(doc.authority_classification || "").toLowerCase();
  // If the doc has an explicit classification, trust it — do NOT fall through to text
  // pattern matching. The gate's patterns are designed for unclassified research data;
  // applying them to an already-classified current_adopted doc causes false positives
  // (e.g. "proposed sign" in a permit application section is normal regulatory text).
  if (cls === "current_adopted") return false;
  if (DRAFT_CLASSIFICATIONS.has(cls)) return true;
  // Only use text pattern matching when no explicit classification is present.
  if (!cls || cls === "unknown_review_required") {
    const gate = classifyRewriteSourceAuthority({ documents: [doc] });
    return gate.isComprehensiveRewrite;
  }
  return false;
}

export function isHistoricalSource(doc: { content_status?: string; authority_classification?: string } = {}): boolean {
  const content = String(doc.content_status || "").toLowerCase();
  const cls = String(doc.authority_classification || "").toLowerCase();
  return HISTORICAL_CONTENT.has(content) || cls === "historical";
}

export function isCurrentAdoptedSource(doc: { authority_classification?: string; content_status?: string } = {}): boolean {
  const cls = String(doc.authority_classification || "").toLowerCase();
  return cls === "current_adopted" && !isDraftSource(doc) && !isHistoricalSource(doc);
}

// ── Citation building ──
export interface SourceDoc {
  id: string;
  title?: string;
  jurisdiction_name?: string;
  official_url?: string;
  file_hash_sha256?: string;
  authority_classification?: string;
  content_status?: string;
  effective_or_adopted_date?: string;
}

export function buildCitation(
  sourceDoc: SourceDoc,
  sectionOrPage: string,
  excerpt: string,
  extractionDate: string,
): {
  source_document_id: string;
  jurisdiction: string;
  section_or_page: string;
  official_url: string;
  excerpt: string;
  extraction_date: string;
  verification_status: string;
} {
  const isDraft = isDraftSource(sourceDoc);
  const isHist = isHistoricalSource(sourceDoc);
  let verification_status = "verified";
  if (isDraft) verification_status = "draft_context";
  else if (isHist) verification_status = "historical";
  else if (String(sourceDoc.authority_classification || "").toLowerCase() !== "current_adopted") {
    verification_status = "needs_verification";
  }
  return {
    source_document_id: sourceDoc.id,
    jurisdiction: sourceDoc.jurisdiction_name || "",
    section_or_page: sectionOrPage || "",
    official_url: sourceDoc.official_url || "",
    excerpt: String(excerpt || "").trim(),
    extraction_date: extractionDate,
    verification_status,
  };
}

// ── Operational eligibility ──
// A rule is operational only if staff_approved AND at least one citation is from a current_adopted source.
export function canBeOperational(
  status: string,
  citations: Array<{ verification_status?: string }> = [],
): boolean {
  if (status !== "staff_approved") return false;
  return citations.some((c) => c.verification_status === "verified");
}

// ── Conflict detection ──
// Two rules conflict if they cover the same jurisdiction + sign_type + rule_category
// but state different requirements from different sources.
export function detectConflictState(
  existing: { requirement?: string; citations?: Array<{ verification_status?: string }> } | null,
  newRequirement: string,
): "none" | "conflicting_sources" {
  if (!existing || !existing.requirement) return "none";
  if (String(existing.requirement).trim() === String(newRequirement).trim()) return "none";
  return "conflicting_sources";
}

// ── Extraction status defaults ──
export function defaultExtractionStatus(sourceDoc: SourceDoc): {
  status: string;
  confidence: string;
  draft_context: boolean;
} {
  const isDraft = isDraftSource(sourceDoc);
  const isHist = isHistoricalSource(sourceDoc);
  if (isDraft) return { status: "needs_review", confidence: "low", draft_context: true };
  if (isHist) return { status: "historical", confidence: "low", draft_context: false };
  return { status: "extracted", confidence: "medium", draft_context: false };
}