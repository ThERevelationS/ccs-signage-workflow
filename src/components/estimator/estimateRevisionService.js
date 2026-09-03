import { base44 } from "@/api/base44Client";
import { estimateAuditSnapshot, summarizeEstimateChanges } from "./estimateLifecycle";
import { quoteIssueKey } from "./quoteLifecycle";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function nextRevisionNumber(estimateId) {
  const rows = await base44.entities.EstimateRevision.filter({ estimate_id: estimateId });
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

export async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  const rows = await base44.entities.EstimateRevision.filter({ estimate_id: estimateId, revision_status: "open" });
  return (rows || []).slice().sort((a, b) => num(b.revision_number) - num(a.revision_number))[0] || null;
}

export async function listEstimateRevisions(estimateId) {
  if (!estimateId) return [];
  const rows = await base44.entities.EstimateRevision.filter({ estimate_id: estimateId }).catch(() => []);
  return (rows || []).slice().sort((a, b) => num(b.revision_number) - num(a.revision_number));
}

export async function startEstimateRevision({ estimate, reason, quoteTotal, internalCost }) {
  if (!estimate?.id) throw new Error("Estimate is required to start a revision.");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A revision reason is required.");

  const existing = await getOpenEstimateRevision(estimate.id);
  if (existing) return existing;

  const before = estimateAuditSnapshot(estimate, { quoteTotal, internalCost });
  const quoteVersion = Math.max(0, Math.floor(num(before.quote_version)));
  return base44.entities.EstimateRevision.create({
    estimate_id: estimate.id,
    revision_number: await nextRevisionNumber(estimate.id),
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimate.id, quoteVersion),
    revision_type: "manual_revision",
    revision_status: "open",
    reason: cleanReason,
    previous_status: before.status || "draft",
    new_status: before.status || "draft",
    previous_quote_total: num(before.quote_total),
    new_quote_total: num(before.quote_total),
    previous_total_cost: num(before.total_cost),
    new_total_cost: num(before.total_cost),
    change_summary: ["Revision opened — changes not yet finalized"],
    estimate_snapshot_before: before,
    estimate_snapshot_after: {},
    started_at: new Date().toISOString(),
  });
}

export async function completeEstimateRevision({ revision, estimate, quoteTotal, internalCost, workOrderId = "" }) {
  if (!revision?.id) return null;
  const current = await base44.entities.EstimateRevision.get(revision.id).catch(() => null);
  if (current?.revision_status === "completed") return current;
  const sourceRevision = current || revision;
  const before = sourceRevision.estimate_snapshot_before || {};
  const after = estimateAuditSnapshot(estimate, { quoteTotal, internalCost });
  const quoteVersion = Math.max(0, Math.floor(num(after.quote_version)));
  const payload = {
    revision_status: "completed",
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimate.id || revision.estimate_id, quoteVersion),
    new_status: after.status || sourceRevision.previous_status || "draft",
    new_quote_total: num(after.quote_total),
    new_total_cost: num(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_after: after,
    completed_at: new Date().toISOString(),
    work_order_id: workOrderId || sourceRevision.work_order_id || "",
  };
  const updated = await base44.entities.EstimateRevision.update(sourceRevision.id, payload);
  return { ...sourceRevision, ...payload, ...(updated || {}) };
}

export async function recordEstimateLifecycleRevision({
  estimateBefore,
  estimateAfter,
  reason,
  revisionType = "status_transition",
  quoteTotalBefore,
  quoteTotalAfter,
  internalCostBefore,
  internalCostAfter,
  workOrderId = "",
  notes = "",
  deliveryEvidence = null,
}) {
  if (!estimateBefore?.id && !estimateAfter?.id) throw new Error("Estimate is required for revision history.");
  const estimateId = estimateAfter?.id || estimateBefore.id;
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  const before = estimateAuditSnapshot(estimateBefore || {}, { quoteTotal: quoteTotalBefore, internalCost: internalCostBefore });
  const after = estimateAuditSnapshot(estimateAfter || {}, { quoteTotal: quoteTotalAfter, internalCost: internalCostAfter });
  const timestamp = new Date().toISOString();
  const quoteVersion = Math.max(0, Math.floor(num(after.quote_version)));
  return base44.entities.EstimateRevision.create({
    estimate_id: estimateId,
    revision_number: await nextRevisionNumber(estimateId),
    quote_version: quoteVersion,
    quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
    revision_type: revisionType,
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    new_status: after.status || "draft",
    previous_quote_total: num(before.quote_total),
    new_quote_total: num(after.quote_total),
    previous_total_cost: num(before.total_cost),
    new_total_cost: num(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_before: before,
    estimate_snapshot_after: after,
    started_at: timestamp,
    completed_at: timestamp,
    work_order_id: workOrderId || "",
    delivery_evidence: deliveryEvidence || {},
    notes: String(notes || "").trim(),
  });
}

/**
 * Idempotent wrapper for lifecycle events that can be retried after a partial
 * multi-record failure. The caller supplies a stable marker (for example an
 * immutable acceptance-record id); if that marker is already present on a
 * completed lifecycle revision, the existing audit row is reused.
 */
export async function ensureEstimateLifecycleRevision({ idempotencyKey = "", ...payload }) {
  const cleanKey = String(idempotencyKey || "").trim();
  const estimateId = payload.estimateAfter?.id || payload.estimateBefore?.id || "";
  if (!estimateId) throw new Error("Estimate is required for revision history.");

  if (cleanKey) {
    const rows = await base44.entities.EstimateRevision.filter({
      estimate_id: estimateId,
      notes: cleanKey,
    });
    const existing = (rows || []).find((row) => row.revision_status === "completed");
    if (existing) return existing;
  }

  return recordEstimateLifecycleRevision({
    ...payload,
    notes: cleanKey,
  });
}

export async function attachQuoteDeliveryEvidenceToIssuanceRevision({ estimateId, quoteVersion, evidence }) {
  const version = Math.max(0, Math.floor(num(quoteVersion)));
  if (!estimateId || version <= 0 || !evidence) return { revision: null, warning: "" };

  const issueKey = quoteIssueKey(estimateId, version);
  const rows = await base44.entities.EstimateRevision.filter({
    estimate_id: estimateId,
    quote_issue_key: issueKey,
  });
  const issuanceRevision = (rows || []).find((row) => {
    const beforeVersion = Math.max(0, Math.floor(num(row.estimate_snapshot_before?.quote_version)));
    const afterVersion = Math.max(0, Math.floor(num(row.estimate_snapshot_after?.quote_version, row.quote_version)));
    return row.revision_status === "completed" && afterVersion === version && beforeVersion !== afterVersion;
  }) || null;

  if (!issuanceRevision) {
    return { revision: null, warning: `Quote Version ${version} was delivered, but its issuance revision could not be located for fallback delivery evidence.` };
  }

  const existingEvidence = issuanceRevision.delivery_evidence || {};
  if (existingEvidence.gmail_message_id || existingEvidence.delivery_id || existingEvidence.attachment_file_url) {
    return { revision: issuanceRevision, warning: "" };
  }

  const deliveryEvidence = {
    delivery_id: evidence.deliveryId || "",
    gmail_message_id: evidence.gmailMessageId || "",
    recipient_email: evidence.recipientEmail || "",
    sent_at: evidence.sentAt || new Date().toISOString(),
    attachment_file_url: evidence.archive?.fileUrl || "",
    attachment_sha256: evidence.archive?.sha256 || "",
    attachment_size_bytes: Number(evidence.archive?.sizeBytes || 0),
  };
  const updated = await base44.entities.EstimateRevision.update(issuanceRevision.id, { delivery_evidence: deliveryEvidence });
  return { revision: { ...issuanceRevision, delivery_evidence: deliveryEvidence, ...(updated || {}) }, warning: "" };
}

