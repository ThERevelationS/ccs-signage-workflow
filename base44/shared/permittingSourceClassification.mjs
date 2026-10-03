// Deterministic authority classification for PermittingSourceDocument records.
// The scanner never needs AI to rediscover a classification: it inspects
// title/url/doc_type/extracted_text/ai_summary and emits a stable
// authority_classification plus the matched_signals that produced it.
//
// Classifications that indicate draft/proposed rewrite content
// (draft_proposed, comprehensive_rewrite) are surfaced to the authority gate
// via classifyRewriteSourceAuthority in jurisdictionResearchAuthorityGate.mjs,
// so rewrite protection is triggered the same way the gate already does.

const CLASSIFICATION_SIGNALS = Object.freeze([
  // Comprehensive rewrite / draft-proposed zoning/sign material
  {
    classification: "comprehensive_rewrite",
    pattern: /\b20\d{2}\b.{0,40}\b(zoning|sign|code|ordinance)\b.{0,40}\b(rewrite|replacement|update|revision)\b/i,
    signal: "year + zoning/sign + rewrite/replacement",
  },
  {
    classification: "comprehensive_rewrite",
    pattern: /\b(zoning|sign|code|ordinance)\b.{0,30}\brewrite\b.{0,30}\b(introduction|schedule|meeting|workshop|update|status)\b/i,
    signal: "zoning rewrite project material",
  },
  {
    classification: "draft_proposed",
    pattern: /\b(draft|proposed)\b.{0,40}\b(zoning|sign|code|ordinance|regulation)\b/i,
    signal: "draft/proposed + zoning/sign/code",
  },
  {
    classification: "draft_proposed",
    pattern: /\b(zoning|sign|code|ordinance|regulation)\b.{0,40}\b(draft|proposed)\b/i,
    signal: "zoning/sign/code + draft/proposed",
  },
  // Legislative evidence (agendas, minutes, enacted ordinances, fiscal court, commission)
  {
    classification: "legislative_evidence",
    pattern: /\b(fiscal\s+court|city\s+council|commission|board\s+of\s+adjustment)\b.{0,50}\b(agenda|minutes|meeting|ordinance|enacted|records?\s+index)\b/i,
    signal: "legislative body + agenda/minutes/enacted",
  },
  {
    classification: "legislative_evidence",
    pattern: /\b(enacted\s+ordinances?|ordinances?\s+index|government\s+records?\s+index)\b/i,
    signal: "enacted ordinances / records index",
  },
  // Application forms
  {
    classification: "application_form",
    pattern: /\b(sign\s+permit\s+)?application\b/i,
    signal: "application form",
    requireDocType: ["permit_application"],
  },
  {
    classification: "application_form",
    pattern: /\b(electrical\s+permit|encroachment\s+permit|building\s+permit)\b.{0,30}\bapplication\b/i,
    signal: "permit application form",
  },
  // Fee schedules
  {
    classification: "fee_schedule",
    pattern: /\bfee\s+schedule\b/i,
    signal: "fee schedule",
    requireDocType: ["fee_schedule"],
  },
  // Checklists
  {
    classification: "checklist",
    pattern: /\bchecklist\b/i,
    signal: "checklist",
    requireDocType: ["checklist"],
  },
  // Administrative guidance (GIS, portal instructions, online submission)
  {
    classification: "administrative_guidance",
    pattern: /\b(gis|map\s+server|online\s+(building\s+)?permit|portal\s+instruction|submission\s+instruction)\b/i,
    signal: "administrative guidance / portal instruction",
    requireDocType: ["gis_resource", "portal_instruction", "other"],
  },
  // Historical (older editions marked reconfirm/historical/revised)
  {
    classification: "historical",
    pattern: /\b(20\d{2})\s+edition\b.{0,30}\b(reconfirm|historical|revised)\b/i,
    signal: "older edition marked reconfirm/historical",
  },
  {
    classification: "historical",
    pattern: /\breconfirm\s+fees\b/i,
    signal: "fee schedule marked reconfirm (historical)",
  },
  // Effective-date evidence
  {
    classification: "effective_date_evidence",
    pattern: /\beffective\s+(on|date)\b\s*:\s*\d/i,
    signal: "explicit effective-date statement",
  },
]);

// Adopted code sections: sign_ordinance / zoning_code with no rewrite/draft signal.
function looksAdoptedCurrent(doc, lower) {
  const docType = doc.doc_type || doc.source_type || "";
  if (!["sign_ordinance", "zoning_code"].includes(docType)) return false;
  // Must NOT match any rewrite/draft signal
  if (/\b(draft|proposed|rewrite|replacement)\b/i.test(lower)) return false;
  // Adopted Article 34 sections and similar adopted code
  if (/\b(adopted|article\s+\d+|section\s+\d+|§\s*\d+|regulations)\b/i.test(lower)) return true;
  return false;
}

/**
 * Classify a source document deterministically.
 * @param {object} doc - source document with title, url, doc_type/source_type,
 *   extracted_text, ai_summary, and optionally an explicit override.
 * @returns {{ classification: string, matched_signals: string[] }}
 */
export function classifySourceDocument(doc = {}) {
  const lower = [
    doc.title || "",
    doc.url || doc.official_url || "",
    doc.extracted_text || "",
    doc.ai_summary || "",
    doc.notes_gaps || "",
  ].join(" \n ").toLowerCase();

  // Explicit override wins (used during migration for known documents).
  if (doc.authority_classification_override) {
    return {
      classification: doc.authority_classification_override,
      matched_signals: ["explicit_migration_override"],
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
    // First matched signal's classification wins (signals are ordered by priority).
    const first = CLASSIFICATION_SIGNALS.find((s) => {
      if (s.requireDocType) {
        const dt = doc.doc_type || doc.source_type || "";
        if (!s.requireDocType.includes(dt)) return false;
      }
      return s.pattern.test(lower);
    });
    return { classification: first.classification, matched_signals: matched };
  }

  // Adopted code with no rewrite signal → current_adopted
  if (looksAdoptedCurrent(doc, lower)) {
    return { classification: "current_adopted", matched_signals: ["adopted code section, no rewrite signal"] };
  }

  return { classification: "unknown_review_required", matched_signals: [] };
}

/**
 * Returns true when a classification indicates draft/proposed rewrite content
 * that must trigger rewrite protection via the authority gate.
 */
export function isRewriteClassification(classification) {
  return classification === "draft_proposed" || classification === "comprehensive_rewrite";
}