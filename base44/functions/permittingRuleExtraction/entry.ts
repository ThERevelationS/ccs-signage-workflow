import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  normalizeSignType,
  buildCitation,
  defaultExtractionStatus,
  isDraftSource,
  isHistoricalSource,
  isCurrentAdoptedSource,
  canBeOperational,
  type SourceDoc,
} from "../../shared/permittingRuleExtraction.ts";

// ── PermittingRule extraction engine ──
// Reads PermittingSourceDocument.extracted_text for a jurisdiction, uses InvokeLLM
// to extract structured rules with citations, and creates PermittingRule records.
// Admin-only. Scales to any jurisdiction but is invoked per-jurisdiction to control credit use.

const RULE_CATEGORIES = [
  "permit_applicability", "sign_type_rule", "dimensional", "illumination_electronic",
  "submittal_requirement", "fee_timing", "exemption", "procedure", "other",
];
const SIGN_TYPES = [
  "wall", "channel_letters", "cabinet", "monument", "pole_pylon", "ground",
  "projecting", "blade", "awning_canopy", "window", "temporary", "banner",
  "feather_flag", "real_estate", "construction", "directional", "incidental",
  "menu_board", "emc", "digital", "changeable_copy", "roof", "subdivision", "special_district",
];

const EXTRACTION_PROMPT = (title: string, text: string) => `You are a regulatory extraction engine for sign-permitting rules. Extract structured rules from the following source document text.

For each DISTINCT regulatory rule, extract:
- rule_category: one of [${RULE_CATEGORIES.join(", ")}]
- sign_type: the sign type in the source's own terminology (preserve verbatim, e.g. "ground sign", "monument", "building mounted"). Empty string if not sign-type-specific.
- sign_type_normalized: map to one of [${SIGN_TYPES.join(", ")}] or empty string if not applicable
- zoning_district_applicability: which zoning districts this applies to (e.g. "C-1, C-2", "all districts", "A-1 only"). Empty string if not district-specific.
- trigger: what condition or action triggers this rule (e.g. "Erecting a ground sign in a commercial district")
- requirement: the actual regulatory requirement, stated clearly and specifically
- numeric_value: the numeric value if the requirement has one (e.g. 50 for 50%, 10 for 10 working days), or 0 if none
- unit: the unit for numeric_value (e.g. "percent", "working days", "square feet", "feet", "seconds"), or empty string if none
- exceptions: any exceptions or conditions that modify the requirement, or empty string
- section_or_page: the section number or page where this rule appears (e.g. "3404.A.1", "Page 8", "3408.5.A.2.a")
- excerpt: the EXACT text from the source that supports this rule (copy verbatim from the source, max 500 chars)
- confidence: "high" if the rule is clearly and explicitly stated, "medium" if inferred from context, "low" if uncertain

CRITICAL RULES:
1. Every rule MUST have a non-empty section_or_page AND a non-empty excerpt copied verbatim from the source.
2. Do NOT create vague or unsourced summaries. If you cannot cite the exact source text, do not create the rule.
3. If the text does not contain a clear regulatory rule (e.g. it is a meeting agenda, GIS endpoint, or navigation page), return an empty rules array.
4. Preserve source terminology in sign_type; use sign_type_normalized for the canonical mapping.
5. Extract each distinct requirement as a separate rule — do not merge multiple requirements into one.
6. For fee/timing rules, extract the specific fee amount or time period with the section/page reference.

Source document title: ${title}

Source document text:
${text}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rule_category: { type: "string", enum: RULE_CATEGORIES },
          sign_type: { type: "string" },
          sign_type_normalized: { type: "string", enum: SIGN_TYPES },
          zoning_district_applicability: { type: "string" },
          trigger: { type: "string" },
          requirement: { type: "string" },
          numeric_value: { type: "number" },
          unit: { type: "string" },
          exceptions: { type: "string" },
          section_or_page: { type: "string" },
          excerpt: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["rule_category", "requirement", "section_or_page", "excerpt", "confidence"],
      },
    },
  },
};

// Skip these classifications — they are meeting minutes, GIS endpoints, or navigation pages
// that do not contain extractable regulatory rules. This saves extraction credits.
const SKIP_CLASSIFICATIONS = new Set(["legislative_evidence", "gis_resource"]);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const jurisdictionName = String(body.jurisdiction_name || "Boone County").trim();
    const docIds: string[] | null = Array.isArray(body.doc_ids) && body.doc_ids.length > 0
      ? body.doc_ids.map(String)
      : null;
    const dryRun = Boolean(body.dry_run);

    // Fetch the JurisdictionProfile for linking
    const jpPage = await base44.asServiceRole.entities.JurisdictionProfile.filter(
      { name: jurisdictionName },
      { limit: 5, fields: ["id", "name"] },
    );
    const jurisdictionId = jpPage.items[0]?.id || "";

    // Fetch source documents — filter by jurisdiction; doc_ids are applied in-memory
    // because the SDK does not support $in on the built-in id field.
    const query: Record<string, unknown> = { jurisdiction_name: jurisdictionName };

    const docs: SourceDoc[] = [];
    let cursor: string | undefined;
    do {
      const page = await base44.asServiceRole.entities.PermittingSourceDocument.filter(
        query,
        { sort: "title", limit: 200, fields: [
          "id", "title", "jurisdiction_name", "extracted_text", "official_url",
          "file_hash_sha256", "authority_classification", "content_status",
          "effective_or_adopted_date", "issuing_office", "source_type",
        ], ...(cursor ? { cursor } : {}) },
      );
      docs.push(...page.items as SourceDoc[]);
      cursor = page.next_cursor;
    } while (cursor && page.has_more);

    // Apply doc_ids filter in memory
    const filteredDocs = docIds
      ? docs.filter((d) => docIds.includes(d.id))
      : docs;

    // Filter to docs with substantive text and non-skipped classifications
    const extractable = filteredDocs.filter((d) => {
      const text = String((d as any).extracted_text || "");
      if (text.length < 200) return false;
      const cls = String((d as any).authority_classification || "").toLowerCase();
      if (SKIP_CLASSIFICATIONS.has(cls)) return false;
      return true;
    });

    if (dryRun) {
      return Response.json({
        success: true,
        dry_run: true,
        jurisdiction: jurisdictionName,
        jurisdiction_id: jurisdictionId,
        total_docs: filteredDocs.length,
        extractable_docs: extractable.length,
        skipped: filteredDocs.length - extractable.length,
        docs: extractable.map((d) => ({ id: d.id, title: (d as any).title, text_length: String((d as any).extracted_text || "").length })),
      });
    }

    const extractionDate = new Date().toISOString();
    const rulesToCreate: any[] = [];
    const errors: string[] = [];
    let docsProcessed = 0;
    let llmCalls = 0;

    for (const doc of extractable) {
      const text = String((doc as any).extracted_text || "");
      try {
        const llmResponse = await base44.integrations.Core.InvokeLLM({
          prompt: EXTRACTION_PROMPT((doc as any).title || "", text),
          response_json_schema: RESPONSE_SCHEMA,
        });
        llmCalls++;

        const extractedRules: any[] = (llmResponse as any)?.rules || [];
        if (!Array.isArray(extractedRules) || extractedRules.length === 0) {
          docsProcessed++;
          continue;
        }

        const defaults = defaultExtractionStatus(doc);
        const isDraft = isDraftSource(doc);
        const isHist = isHistoricalSource(doc);

        for (const r of extractedRules) {
          // Validate: every rule must have section + excerpt
          if (!r.section_or_page || !r.excerpt || !r.requirement) continue;

          const citation = buildCitation(doc, r.section_or_page, r.excerpt, extractionDate);
          const normalizedSignType = normalizeSignType(r.sign_type) || r.sign_type_normalized || null;

          const rule = {
            jurisdiction_name: jurisdictionName,
            jurisdiction_id: jurisdictionId,
            issuing_office: (doc as any).issuing_office || "",
            rule_category: r.rule_category || "other",
            sign_type: r.sign_type || "",
            sign_type_normalized: normalizedSignType,
            zoning_district_applicability: r.zoning_district_applicability || "",
            trigger: r.trigger || "",
            requirement: r.requirement,
            numeric_value: typeof r.numeric_value === "number" ? r.numeric_value : null,
            unit: r.unit || "",
            exceptions: r.exceptions || "",
            effective_date: (doc as any).effective_or_adopted_date || "",
            status: defaults.status,
            confidence: r.confidence === "high" ? "high" : (isDraft || isHist) ? "low" : (r.confidence || "medium"),
            conflict_state: "none",
            citations: [citation],
            source_snapshot_sha256: doc.file_hash_sha256 || "",
            is_operational: false,
            draft_context: isDraft,
            notes: isDraft ? "Extracted from a draft/proposed source — cannot reach staff_approved while authority gate says current adopted code is authoritative." : (isHist ? "Extracted from a historical source — fees/dates must be reconfirmed." : ""),
            version: 1,
          };
          rulesToCreate.push(rule);
        }
        docsProcessed++;
      } catch (e: any) {
        errors.push(`${(doc as any).title || doc.id}: ${e.message || e}`);
      }
    }

    // Bulk create rules
    let createdCount = 0;
    if (rulesToCreate.length > 0) {
      // bulkCreate in batches of 100
      for (let i = 0; i < rulesToCreate.length; i += 100) {
        const batch = rulesToCreate.slice(i, i + 100);
        const result = await base44.asServiceRole.entities.PermittingRule.bulkCreate(batch);
        createdCount += (result as any).length || batch.length;
      }
    }

    // Summary by status and category
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const r of rulesToCreate) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byCategory[r.rule_category] = (byCategory[r.rule_category] || 0) + 1;
    }

    return Response.json({
      success: true,
      jurisdiction: jurisdictionName,
      jurisdiction_id: jurisdictionId,
      docs_processed: docsProcessed,
      llm_calls: llmCalls,
      rules_created: createdCount,
      by_status: byStatus,
      by_category: byCategory,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}