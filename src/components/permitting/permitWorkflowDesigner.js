/**
 * Permit Workflow Designer — deterministic resolution pipeline + AI composition.
 *
 * Uses the platform's native AI (InvokeLLM) from app code. No external LLM backend functions.
 *
 * Rules hierarchy (enforced by the authority gate):
 *   1. staff_approved + is_operational  → approved rules (operational, cited as verified)
 *   2. extracted / needs_review          → pending staff review (cited as needs_verification)
 *   3. draft_context / historical       → never operational (cited as draft_context / historical)
 *
 * Gaps are surfaced honestly — the pipeline never invents requirements.
 */

import { base44 } from "@/api/base44Client";
import { captureElectricalOfficeResponses } from "./electricalOfficeResponseHandoff.mjs";
import { captureWorkflowSources, WORKFLOW_SOURCE_FIELDS } from "./workflowSourceEvidence.mjs";
import { staffEntities } from "@/components/staff/staffEntities";
import { withRateLimitRetry } from "@/components/estimator/loadAllEntityRows";

const ELECTRICAL_RESEARCH_ROLES = [
  { role: "electrical_permit", label: "Permit issuance" },
  { role: "electrical_inspection", label: "Inspection scheduling and stages" },
];

// Carry saved findings as immutable, non-operational context; never promote them to rules.
export function createElectricalPlanningHandoff(research, jurisdiction = {}) {
  const sourceRows = research?.method === "office-research-requirements-v1" && Array.isArray(research.roles)
    ? research.roles : [];
  return {
    classification: "saved_research_draft_non_operational",
    office_responses: captureElectricalOfficeResponses(research, jurisdiction),
    research_method: research?.method || "",
    researched_at: research?.researched_at || "",
    jurisdiction: {
      jurisdiction_id: jurisdiction?.id || jurisdiction?.jurisdiction_id || "",
      jurisdiction_name: jurisdiction?.name || jurisdiction?.jurisdiction_name || "",
      state: jurisdiction?.state || "",
    },
    roles: ELECTRICAL_RESEARCH_ROLES.map(({ role, label }) => ({
      role, label,
      findings: sourceRows.filter(row => row?.role === role).map(row => ({
        office_name: row.office_name || "",
        applicability: row.applicability || "unknown",
        service_area: row.service_area || "",
        responsibility_quote: row.responsibility_quote || "",
        delegation_quote: row.delegation_quote || "",
        official_source_url: row.official_source_url || "",
        contact_info: row.contact_info && typeof row.contact_info === "object" ? { ...row.contact_info } : {},
        notes: row.notes || "",
        research_fields: row.research_fields && typeof row.research_fields === "object" ? { ...row.research_fields } : {},
      })),
    })),
  };
}

// ── Rules hierarchy ──

const APPROVED_RULE_STATUS = "staff_approved";

export function splitRulesByHierarchy(rules = []) {
  const approved = [];
  const pending = [];
  const draftOrHistorical = [];
  for (const rule of rules) {
    if (rule.draft_context || rule.status === "historical" || rule.status === "superseded") {
      draftOrHistorical.push(rule);
    } else if (rule.status === APPROVED_RULE_STATUS && rule.is_operational) {
      approved.push(rule);
    } else {
      pending.push(rule);
    }
  }
  return { approved, pending, draftOrHistorical };
}

export function ruleToCitationBrief(rule) {
  const citations = Array.isArray(rule.citations) ? rule.citations : [];
  const primary = citations[0] || {};
  return {
    rule_id: rule.id,
    rule_category: rule.rule_category,
    sign_type: rule.sign_type_normalized || rule.sign_type || "",
    requirement: rule.requirement || "",
    numeric_value: rule.numeric_value,
    unit: rule.unit,
    section_or_page: primary.section_or_page || "",
    official_url: primary.official_url || "",
    source_document_id: primary.source_document_id || "",
    verification_status: primary.verification_status || "needs_verification",
    is_operational: Boolean(rule.is_operational),
  };
}

// ── Source document helpers ──

const FORM_SOURCE_TYPES = new Set(["permit_application", "checklist"]);
const FEE_SOURCE_TYPES = new Set(["fee_schedule"]);

export function categorizeSourceDocs(docs = []) {
  const forms = [];
  const feeSchedules = [];
  const codeDocs = [];
  const other = [];
  for (const doc of docs) {
    if (["draft", "proposed", "historical", "superseded"].includes(doc.content_status) || ["draft_proposed", "comprehensive_rewrite", "historical", "superseded"].includes(doc.authority_classification)) continue;
    if (FORM_SOURCE_TYPES.has(doc.source_type)) forms.push(doc);
    else if (FEE_SOURCE_TYPES.has(doc.source_type)) feeSchedules.push(doc);
    else if (doc.source_type === "sign_ordinance" || doc.source_type === "zoning_code") codeDocs.push(doc);
    else other.push(doc);
  }
  return { forms, feeSchedules, codeDocs, other };
}

function sourceDocBrief(doc) {
  return {
    id: doc.id,
    title: doc.title,
    source_type: doc.source_type,
    official_url: doc.official_url || doc.online_form_url || "",
    online_form_url: doc.online_form_url || "",
    authority_classification: doc.authority_classification,
    content_status: doc.content_status,
    effective_or_adopted_date: doc.effective_or_adopted_date,
  };
}

// ── Jurisdiction resolution ──

/**
 * Resolve a jurisdiction from an address string. Uses the existing findLocalityByAddress
 * backend function when available; falls back to null (staff must select manually).
 * Strict identity — no cross-jurisdiction promotion.
 */
export async function resolveJurisdictionFromAddress(address, sessionToken = "") {
  if (!address || !address.trim()) return null;
  try {
    const res = await base44.functions.invoke("findLocalityByAddress", { address, session_token: sessionToken });
    const data = res?.data || res;
    // suggested_locality is an exact configured-catalog match. When offices are
    // unverified (apply_allowed false) we still use its linked profile — the
    // draft is a plan, not an approval — but we flag it so the UI can say so.
    const suggested = data?.suggested_locality;
    if (suggested?.jurisdiction_profile_id) {
      return {
        jurisdiction_id: suggested.jurisdiction_profile_id,
        jurisdiction_name: suggested.name || "",
        state: suggested.state || "",
        locality_id: suggested.id || "",
        locality_name: suggested.name || "",
        matched_address: address,
        offices_need_check: data.apply_allowed !== true,
      };
    }
    // No configured match: return the resolver's best-guess town name so the
    // manual picker can prefill its search. Never treated as resolved.
    const guessName = data?.ai_locality_name || data?.location_resolution?.target?.name || "";
    if (guessName) return { unresolved_hint: { name: guessName, state: data?.ai_state || data?.location_resolution?.target?.state || "" } };
  } catch {
    // findLocalityByAddress may not resolve; staff selects manually.
  }
  return null;
}

/**
 * Load rules for a jurisdiction from PermittingRule, split by hierarchy.
 */
export async function loadJurisdictionRules(jurisdictionName, jurisdictionId) {
  if (!jurisdictionName) return { approved: [], pending: [], draftOrHistorical: [] };
  const { items } = await withRateLimitRetry(() => staffEntities.PermittingRule.filter(
    jurisdictionId ? { jurisdiction_id: jurisdictionId } : { jurisdiction_name: jurisdictionName },
    { sort: "-is_operational", limit: 200, fields: [
      "id", "rule_category", "sign_type", "sign_type_normalized", "requirement",
      "numeric_value", "unit", "zoning_district_applicability", "trigger",
      "exceptions", "status", "is_operational", "draft_context", "confidence",
      "citations", "jurisdiction_name", "issuing_office",
    ] },
  ));
  return splitRulesByHierarchy(items);
}

/**
 * Load source documents for a jurisdiction from PermittingSourceDocument.
 */
export async function loadJurisdictionSourceDocs(jurisdictionName, jurisdictionId) {
  if (!jurisdictionName) return { forms: [], feeSchedules: [], codeDocs: [], other: [], all: [] };
  const { items } = await withRateLimitRetry(() => staffEntities.PermittingSourceDocument.filter(
    jurisdictionId ? { jurisdiction_id: jurisdictionId } : { jurisdiction_name: jurisdictionName },
    { sort: "-classified_at", limit: 100, fields: WORKFLOW_SOURCE_FIELDS },
  ));
  return { ...categorizeSourceDocs(items), all: items };
}

// ── AI composition ──

const WORKFLOW_JSON_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          office: { type: "string", description: "Responsible office (e.g. 'Boone County Planning Commission')" },
          office_type: { type: "string", description: "Office category: Zoning, Building, Electrical, Right-of-Way, Design Review, etc." },
          permit_type: { type: "string", description: "Permit type (e.g. 'Sign Permit', 'Electrical Permit', 'Variance')" },
          action: { type: "string", description: "The action to take (e.g. 'Submit sign permit application with site plan')" },
          required_documents: { type: "array", items: { type: "string" }, description: "Required drawings/documents" },
          required_forms: { type: "array", items: { type: "string" }, description: "Required forms from source docs" },
          submission_link: { type: "string", description: "Online submission URL if known, empty if not" },
          target_days_from_start: { type: "number", description: "Target days from project start" },
          dependencies: { type: "array", items: { type: "string" }, description: "Step indices (0-based) this depends on" },
          followup_interval_days: { type: "number", description: "Follow-up interval in days" },
          inspection_needed: { type: "boolean", description: "Whether an inspection is required" },
          fee_expectation: { type: "string", description: "Fee expectation (label current vs historical)" },
          exemption_applicable: { type: "string", description: "Applicable exemption if any, empty if none" },
          variance_needed: { type: "boolean", description: "Whether a variance or conditional-use permit is needed" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_document_id: { type: "string" },
                section_or_page: { type: "string" },
                excerpt: { type: "string" },
                rule_id: { type: "string" },
              },
            },
            description: "Citations backing this step. Every material fact must have at least one citation.",
          },
          basis: { type: "string", enum: ["approved_rule", "pending_review", "staff_confirmation_needed"], description: "Whether this step is from an approved rule, pending-review rule, or requires staff confirmation" },
          gap_reason: { type: "string", description: "If basis is staff_confirmation_needed, explain what is uncertain" },
        },
        required: ["office", "office_type", "permit_type", "action", "basis"],
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          reason: { type: "string" },
        },
      },
      description: "Items that could not be determined from the available sources and require staff confirmation",
    },
    summary: { type: "string", description: "Brief summary of the generated workflow" },
  },
  required: ["steps", "gaps", "summary"],
};

function buildCompositionPrompt(input, rules, sourceDocs, jurisdiction) {
  const approvedBriefs = rules.approved.map(ruleToCitationBrief);
  const pendingBriefs = rules.pending.map(ruleToCitationBrief);
  const formBriefs = sourceDocs.forms.map(sourceDocBrief);
  const feeBriefs = sourceDocs.feeSchedules.map(sourceDocBrief);
  const codeBriefs = sourceDocs.codeDocs.map(sourceDocBrief);

  return `You are a sign-permitting workflow designer for a sign company. Generate a step-by-step permit workflow for the following project.

STRICT RULES:
1. Base every step on the provided approved rules and source documents. Cite the source for every material fact.
2. Use approved rules as the primary basis. Label steps from approved rules as "approved_rule".
3. Use pending-review (extracted) rules only as guidance, labeled "pending_review". Never treat them as operational.
4. Draft/proposed/historical sources are NEVER operational. Do not use them as the basis for any step.
5. If you cannot determine a requirement from the provided sources, surface it as a gap with basis "staff_confirmation_needed". Never invent requirements, fees, deadlines, or dimensions.
6. Each step must cite at least one source document or rule (source_document_id + section_or_page + excerpt).
7. Multiple permit/office lines are expected (zoning/sign, building, electrical, right-of-way, variance, design review, separate municipality/county lines).

PROJECT INPUTS:
- Project address: ${input.address || "(not provided)"}
- Customer: ${input.customer || "(not provided)"}
- Sign type(s): ${input.signTypes || "(not specified)"}
- Dimensions: ${input.dimensions || "(not specified)"}
- Illuminated: ${input.illuminated ? "Yes" : "No"}
- Electrical work: ${input.electricalWork ? "Yes" : "No"}
- Freestanding: ${input.freestanding ? "Yes" : "No"}
- EMC/Digital: ${input.emcDigital ? "Yes" : "No"}
- Temporary vs Permanent: ${input.temporaryVsPermanent || "(not specified)"}
- New sign vs Face replacement vs Repair: ${input.newVsReplacement || "(not specified)"}
- Zoning/Site context: ${input.zoningContext || "(not provided)"}
- Customer exemption status: ${input.exemptionStatus || "(none claimed)"}

JURISDICTION: ${jurisdiction?.jurisdiction_name || "(unresolved — staff must confirm)"}${jurisdiction?.state ? ", " + jurisdiction.state : ""}

APPROVED RULES (operational, cite as verified):
${JSON.stringify(approvedBriefs, null, 2) || "(none — all steps will need staff confirmation)"}

PENDING-REVIEW RULES (extracted, not yet staff-approved — label as pending_review):
${JSON.stringify(pendingBriefs, null, 2) || "(none)"}

SOURCE DOCUMENTS — Forms/Checklists:
${JSON.stringify(formBriefs, null, 2) || "(none found)"}

SOURCE DOCUMENTS — Fee Schedules:
${JSON.stringify(feeBriefs, null, 2) || "(none found — do not invent fees)"}

SOURCE DOCUMENTS — Code/Ordinance:
${JSON.stringify(codeBriefs, null, 2) || "(none found)"}

Generate the workflow now. Remember: every step needs a citation; gaps must be surfaced honestly.`;
}

/**
 * Compose a workflow draft using the platform's native AI (InvokeLLM).
 * Returns a structured draft with steps and gaps.
 */
export async function composeWorkflowDraft(input, rules, sourceDocs, jurisdiction) {
  const prompt = buildCompositionPrompt(input, rules, sourceDocs, jurisdiction);
  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: false,
    response_json_schema: WORKFLOW_JSON_SCHEMA,
  });
  const draft = typeof res === "object" ? res : null;
  if (!draft || !Array.isArray(draft.steps)) {
    throw new Error("AI did not return a valid workflow draft");
  }
  return {
    jurisdiction: {
      jurisdiction_name: jurisdiction?.jurisdiction_name || "",
      state: jurisdiction?.state || "",
      jurisdiction_id: jurisdiction?.jurisdiction_id || "",
      locality_id: jurisdiction?.locality_id || "",
      locality_name: jurisdiction?.locality_name || "",
    },
    steps: reviewWorkflowSteps(draft.steps, rules),
    source_evidence: captureWorkflowSources(draft.steps, sourceDocs.all, jurisdiction?.jurisdiction_id),
    gaps: Array.isArray(draft.gaps) ? draft.gaps : [],
    summary: draft.summary || "",
    generated_at: new Date().toISOString(),
    input_summary: {
      address: input.address || "",
      sign_types: input.signTypes || "",
      illuminated: Boolean(input.illuminated),
      electrical_work: Boolean(input.electricalWork),
      freestanding: Boolean(input.freestanding),
      emc_digital: Boolean(input.emcDigital),
    },
    rule_counts: {
      approved: rules.approved.length,
      pending: rules.pending.length,
      draft_or_historical: rules.draftOrHistorical.length,
    },
  };
}

// ── Full pipeline ──

/**
 * Run the full designer pipeline: resolve jurisdiction → load rules → load source docs → compose.
 * @param {object} input - Form inputs (address, signTypes, illuminated, etc.)
 * @param {object} [preselectedJurisdiction] - If opened from a jurisdiction panel, skip resolution.
 * @returns {Promise<object>} The workflow draft.
 */
export async function runDesignerPipeline(input, preselectedJurisdiction = null, sessionToken = "") {
  // 1. Resolve jurisdiction (strict identity — no cross-jurisdiction promotion)
  let jurisdiction = preselectedJurisdiction;
  let unresolvedHint = null;
  if (!jurisdiction && input.address) {
    const found = await resolveJurisdictionFromAddress(input.address, sessionToken);
    if (found?.jurisdiction_id) jurisdiction = found;
    else unresolvedHint = found?.unresolved_hint || null;
  }
  if (!jurisdiction) {
    return {
      jurisdiction: { jurisdiction_name: "", state: "", jurisdiction_id: "", locality_id: "", locality_name: "" },
      steps: [],
      gaps: [{ description: "Jurisdiction could not be resolved from the address.", reason: "Staff must select the jurisdiction manually before generating the workflow." }],
      summary: "Jurisdiction unresolved — staff confirmation required.",
      generated_at: new Date().toISOString(),
      input_summary: {},
      rule_counts: { approved: 0, pending: 0, draft_or_historical: 0 },
      jurisdiction_unresolved: true,
      unresolved_hint: unresolvedHint,
    };
  }

  // 2. Load rules and source docs in parallel
  const [rules, sourceDocs] = await Promise.all([
    loadJurisdictionRules(jurisdiction.jurisdiction_name, jurisdiction.jurisdiction_id),
    loadJurisdictionSourceDocs(jurisdiction.jurisdiction_name, jurisdiction.jurisdiction_id),
  ]);

  // 3. Compose workflow via native AI
  const draft = await composeWorkflowDraft(input, rules, sourceDocs, jurisdiction);
  return draft;
}
// AI labels are proposals, not source approval. Preserve the existing evidence hierarchy.
export function reviewWorkflowSteps(steps, rules) {
  const approved = new Set(rules.approved.map(r => r.id));
  const pending = new Set(rules.pending.map(r => r.id));
  return steps.map((step, step_index) => {
    const citations = Array.isArray(step.citations) ? step.citations : [];
    const known = citations.length > 0 && citations.every(c => approved.has(c.rule_id) || pending.has(c.rule_id));
    const allApproved = known && citations.every(c => approved.has(c.rule_id));
    const basis = step.basis === 'approved_rule' && allApproved ? 'approved_rule'
      : known && step.basis !== 'staff_confirmation_needed' ? 'pending_review' : 'staff_confirmation_needed';
    return {...step, step_index, citations, basis, gap_reason: basis === 'staff_confirmation_needed'
      ? step.gap_reason || 'The proposed requirement is not backed by a recognized approved or pending rule. Confirm its source and applicability.' : step.gap_reason};
  });
}

export async function saveWorkflowDraft(draft, inputs, title, notes) {
  if (!draft || !title.trim()) throw new Error('Name this draft before saving.');
  // Deliberately no work_order_id, customer relationship, job or permit-line writes.
  return withRateLimitRetry(() => staffEntities.PermittingWorkflowDraft.create({
    title: title.trim(), status: 'draft', jurisdiction_id: draft.jurisdiction.jurisdiction_id || '',
    jurisdiction_name: draft.jurisdiction.jurisdiction_name || '', state: draft.jurisdiction.state || '',
    snapshot: draft, project_inputs: inputs, review_notes: notes.trim(), reviewed_at: new Date().toISOString(),
  }));
}

export async function loadWorkflowDrafts(jurisdictionId) {
  if (!jurisdictionId) return [];
  const result = await withRateLimitRetry(() => staffEntities.PermittingWorkflowDraft.filter({jurisdiction_id: jurisdictionId}, {sort: '-created_date', limit: 20}));
  return Array.isArray(result) ? result : result.items || [];
}
