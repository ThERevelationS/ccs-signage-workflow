/**
 * PermitLineItem Integration — maps approved workflow drafts to existing PermitLineItem
 * records with deterministic idempotency and review suggestions.
 *
 * NO schema rebuild, NO behavior change. Uses existing PermitLineItem fields:
 *   - row_name: deterministic display name (also the dedup key)
 *   - office_types: array of office categories
 *   - steps: workflow steps with checkboxes and dates
 *   - notes: structured marker for idempotency + source citations
 *
 * Idempotency: deterministic row_name per (jurisdiction + office_type + permit_type).
 *   Before creating, check for existing lines with the same work_order_id + row_name.
 *   Regenerating updates/flags rather than blindly re-creating.
 *
 * Review suggestions: when a monitor flags a source doc change, find lines whose notes
 *   cite that source and produce review suggestions — never silently rewrite.
 */

import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";

// ── Deterministic hash (djb2 — synchronous, no crypto needed) ──

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Compute a deterministic idempotency key for a generated permit line.
 * Key components: work_order_id + jurisdiction + office_type + permit_type + sign_identity.
 */
export function computeIdempotencyKey({ workOrderId, jurisdictionName, officeType, permitType, signIdentity = "" }) {
  const parts = [
    String(workOrderId || ""),
    String(jurisdictionName || "").toLowerCase().trim(),
    String(officeType || "").toLowerCase().trim(),
    String(permitType || "").toLowerCase().trim(),
    String(signIdentity || "").toLowerCase().trim(),
  ];
  return djb2Hash(parts.join("|"));
}

/**
 * Compute a deterministic row_name for display and dedup.
 * Format: "AI: {Jurisdiction} — {OfficeType} — {PermitType}"
 */
export function computeDeterministicRowName({ jurisdictionName, officeType, permitType }) {
  const parts = [
    String(jurisdictionName || "Unknown Jurisdiction").trim(),
    String(officeType || "Office").trim(),
    String(permitType || "Permit").trim(),
  ];
  return `AI: ${parts.join(" — ")}`;
}

/**
 * Build the structured notes field for a generated line.
 * Includes the idempotency marker and source citations.
 */
export function buildLineNotes(idempotencyKey, citations, additionalNotes = "") {
  const lines = [`[AI-IDEMPOTENCY:${idempotencyKey}]`];
  if (Array.isArray(citations) && citations.length > 0) {
    lines.push("");
    lines.push("Source citations:");
    for (const c of citations) {
      const ref = c.section_or_page ? ` (${c.section_or_page})` : "";
      lines.push(`- ${c.source_document_id || "source"}${ref}`);
    }
  }
  if (additionalNotes) {
    lines.push("");
    lines.push(additionalNotes);
  }
  return lines.join("\n");
}

// ── Dedup ──

/**
 * Find existing PermitLineItems with the same work_order_id + row_name(s).
 * Returns a map of rowName → existing line.
 */
export async function findExistingLines(workOrderId, rowNames) {
  if (!workOrderId || !rowNames.length) return {};
  // NOTE: the staff read facade only forwards sort/limit/skip from an
  // options object — a "fields" projection would be silently dropped, so the
  // rows come back whole. The options form stays for its paged {items}
  // return contract.
  const { items } = await staffEntities.PermitLineItem.filter(
    { work_order_id: workOrderId, row_name: { $in: rowNames } },
    { limit: 100 },
  );
  const map = {};
  for (const item of items) map[item.row_name] = item;
  return map;
}

// ── Draft step → PermitLineItem mapping ──

/**
 * Map a draft step to a PermitLineItem create payload.
 * Uses existing schema fields only — no schema changes.
 */
export function mapDraftStepToPermitLineItem(step, draft, workOrder, idempotencyKey, rowName) {
  const today = new Date();
  const targetDate = step.target_days_from_start != null
    ? new Date(today.getTime() + step.target_days_from_start * 86400000).toISOString().slice(0, 10)
    : "";

  const followupDate = step.followup_interval_days != null && targetDate
    ? new Date(new Date(targetDate).getTime() + step.followup_interval_days * 86400000).toISOString().slice(0, 10)
    : "";

  // Build steps array using existing PermitLineItem.steps structure
  const steps = [];
  steps.push({
    id: `ai_submit`,
    name: `Submit ${step.permit_type || "permit application"}`,
    type: "checkbox",
    checked: false,
  });
  if (step.submission_link) {
    steps.push({
      id: `ai_link`,
      name: `Online submission: ${step.submission_link}`,
      type: "text",
      value: step.submission_link,
    });
  }
  for (const doc of step.required_documents || []) {
    steps.push({
      id: `ai_doc_${djb2Hash(doc).slice(0, 8)}`,
      name: `Required document: ${doc}`,
      type: "checkbox",
      checked: false,
    });
  }
  for (const form of step.required_forms || []) {
    steps.push({
      id: `ai_form_${djb2Hash(form).slice(0, 8)}`,
      name: `Required form: ${form}`,
      type: "checkbox",
      checked: false,
    });
  }
  if (targetDate) {
    steps.push({
      id: `ai_target`,
      name: "Target submission date",
      type: "submitted_date",
      value: targetDate,
    });
  }
  if (followupDate) {
    steps.push({
      id: `ai_followup`,
      name: "Follow-up date",
      type: "followup_date",
      value: followupDate,
      followup_interval_days: step.followup_interval_days || 14,
      next_followup_date: followupDate,
    });
  }
  if (step.inspection_needed) {
    steps.push({
      id: `ai_inspection`,
      name: "Inspection required",
      type: "checkbox",
      checked: false,
    });
  }

  // Build notes with idempotency marker + citations
  const additionalNotes = [
    step.fee_expectation ? `Fee expectation: ${step.fee_expectation}` : "",
    step.exemption_applicable ? `Exemption: ${step.exemption_applicable}` : "",
    step.variance_needed ? "Variance/conditional-use may be required." : "",
    step.basis === "pending_review" ? "Basis: pending staff review (extracted rule, not yet approved)." : "",
    step.basis === "staff_confirmation_needed" && step.gap_reason ? `Staff confirmation needed: ${step.gap_reason}` : "",
    step.dependencies?.length ? `Depends on step(s): ${step.dependencies.map(d => Number(d) + 1).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const notes = buildLineNotes(idempotencyKey, step.citations, additionalNotes);

  return {
    work_order_id: workOrder.id,
    work_order_title: workOrder.title || workOrder.client_name || "",
    work_order_description: workOrder.description || "",
    row_name: rowName,
    locality_id: draft.jurisdiction.locality_id || "",
    locality_name: draft.jurisdiction.locality_name || draft.jurisdiction.jurisdiction_name || "",
    office_types: [step.office_type].filter(Boolean),
    status: "active",
    priority: step.step_index || 0,
    steps,
    next_followup_date: followupDate || undefined,
    notes,
  };
}

// ── Create with dedup ──

/**
 * Create PermitLineItems from an approved draft, with idempotency.
 * For each step: compute row_name → check for existing line → create only if new.
 * Returns { created, skipped }.
 */
export async function createPermitLinesFromDraft(draft, workOrder, signIdentity = "") {
  const rowNames = draft.steps.map(step =>
    computeDeterministicRowName({
      jurisdictionName: draft.jurisdiction.jurisdiction_name,
      officeType: step.office_type,
      permitType: step.permit_type,
    }),
  );
  const existingMap = await findExistingLines(workOrder.id, rowNames);

  const created = [];
  const skipped = [];

  for (let i = 0; i < draft.steps.length; i++) {
    const step = draft.steps[i];
    const rowName = rowNames[i];
    const idempotencyKey = computeIdempotencyKey({
      workOrderId: workOrder.id,
      jurisdictionName: draft.jurisdiction.jurisdiction_name,
      officeType: step.office_type,
      permitType: step.permit_type,
      signIdentity,
    });

    const existing = existingMap[rowName];
    if (existing) {
      // Idempotent: skip creation, flag for review instead
      skipped.push({ rowName, existingId: existing.id, step });
      continue;
    }

    const payload = mapDraftStepToPermitLineItem(step, draft, workOrder, idempotencyKey, rowName);
    const record = await staffEntities.PermitLineItem.create(payload);
    created.push({ id: record.id, rowName, step });
  }

  return { created, skipped };
}

// ── Review suggestions ──

/**
 * Generate review suggestions for PermitLineItems whose cited source documents
 * have been flagged by the source monitor (staff_review_required or may_affect_regulatory_data).
 *
 * NEVER silently rewrites active permit lines. Returns suggestions for staff to accept/dismiss.
 *
 * @param {string} workOrderId - The work order to check
 * @param {Array<string>} affectedSourceDocIds - Source doc IDs flagged by the monitor
 * @returns {Promise<Array>} Review suggestions
 */
export async function generateReviewSuggestions(workOrderId, affectedSourceDocIds) {
  if (!workOrderId || !affectedSourceDocIds?.length) return [];

  // NOTE: the staff read facade only forwards sort/limit/skip from an
  // options object — a "fields" projection would be silently dropped, so the
  // rows come back whole. The options form stays for its paged {items}
  // return contract.
  const { items } = await staffEntities.PermitLineItem.filter(
    { work_order_id: workOrderId },
    { limit: 100 },
  );

  const suggestions = [];
  for (const line of items) {
    if (!line.notes) continue;
    const notesStr = String(line.notes);
    const citedAffected = affectedSourceDocIds.filter(docId => notesStr.includes(docId));
    if (citedAffected.length === 0) continue;

    suggestions.push({
      permit_line_item_id: line.id,
      row_name: line.row_name,
      affected_source_docs: citedAffected,
      current_status: line.status,
      suggestion: "Source document(s) cited by this permit line have changed. Review the updated requirements and confirm whether this permit line needs to be updated.",
      action: "review",
    });
  }

  return suggestions;
}

/**
 * Extract source document IDs cited in a line's notes (from the idempotency/citation block).
 */
export function extractCitedSourceDocIds(notes) {
  if (!notes) return [];
  const ids = [];
  const lines = String(notes).split("\n");
  for (const line of lines) {
    const match = line.match(/^-\s+([a-f0-9]{24})/);
    if (match) ids.push(match[1]);
  }
  return ids;
}