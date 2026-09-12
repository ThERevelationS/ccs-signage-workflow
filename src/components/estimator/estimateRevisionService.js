import { base44 } from "@/api/base44Client";
import { estimateAuditSnapshot } from "./estimateLifecycle";
import { loadAllEntityRows, withRateLimitRetry } from "./loadAllEntityRows";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  // Open revisions are rare (0-1 per estimate). A direct filtered read with a
  // small limit avoids the full-catalog paging overhead of loadAllEntityRows,
  // which compounds API calls during estimate page load and can trip the
  // platform rate limit after the preceding builder/part reconciliation.
  const rows = await withRateLimitRetry(() =>
    base44.entities.EstimateRevision.filter(
      { estimate_id: estimateId, revision_status: "open" },
      "-revision_number",
      50,
      0
    )
  ).catch(() => null);
  return (rows || [])[0] || null;
}

export async function listEstimateRevisions(estimateId, { strict = false } = {}) {
  if (!estimateId) return [];
  try {
    const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId }, sort: "revision_number", label: "Estimate revisions" });
    return (rows || []).slice().sort((a, b) => num(b.revision_number) - num(a.revision_number));
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export async function startEstimateRevision({ estimate, reason, quoteTotal, internalCost }) {
  if (!estimate?.id) throw new Error("Estimate is required to start a revision.");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A revision reason is required.");

  const existing = await getOpenEstimateRevision(estimate.id);
  if (existing) return existing;

  const response = await base44.functions.invoke("ensureOpenEstimateRevision", {
    estimate_id: estimate.id,
    expected_estimate_updated_date: estimate.updated_date || "",
    reason: cleanReason,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after starting.");
  return result.revision;
}

export async function completeEstimateRevision({ revision, estimate }) {
  if (!revision?.id) return null;
  const estimateId = estimate?.id || revision.estimate_id || "";
  if (!estimateId) throw new Error("Estimate is required to complete a revision.");
  const response = await base44.functions.invoke("updateEstimateRevisionAudit", {
    action: "complete_manual_revision",
    estimate_id: estimateId,
    revision_id: revision.id,
    expected_revision_updated_date: revision.updated_date || "",
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after completion.");
  return result.revision;
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
  if (!cleanKey) throw new Error("A stable lifecycle idempotency key is required.");

  const cleanReason = String(payload.reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  const before = estimateAuditSnapshot(payload.estimateBefore || {}, {
    quoteTotal: payload.quoteTotalBefore,
    internalCost: payload.internalCostBefore,
  });
  const revisionPayload = {
    estimate_id: estimateId,
    revision_type: payload.revisionType || "status_transition",
    revision_status: "completed",
    reason: cleanReason,
    previous_status: before.status || "draft",
    previous_quote_total: num(before.quote_total),
    previous_total_cost: num(before.total_cost),
    estimate_snapshot_before: before,
    work_order_id: payload.workOrderId || "",
    delivery_evidence: payload.deliveryEvidence || {},
    notes: cleanKey,
    idempotency_key: cleanKey,
  };

  const response = await base44.functions.invoke("ensureEstimateLifecycleRevision", {
    idempotency_key: cleanKey,
    revision: revisionPayload,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate lifecycle revision could not be verified after recording.");
  return result.revision;
}

export async function attachQuoteDeliveryEvidenceToIssuanceRevision({ estimateId, quoteVersion, evidence }) {
  const version = Math.max(0, Math.floor(num(quoteVersion)));
  if (!estimateId || version <= 0 || !evidence) return { revision: null, warning: "" };

  const issueKey = quoteIssueKey(estimateId, version);
  const rows = await loadAllEntityRows({
    entity: base44.entities.EstimateRevision,
    query: { estimate_id: estimateId, quote_issue_key: issueKey },
    sort: "revision_number",
    label: "Quote issuance revisions",
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
  const evidencePatch = { delivery_evidence: deliveryEvidence };
  const updated = await replaceEntityFieldsIfUnchanged({
    entity: base44.entities.EstimateRevision,
    id: issuanceRevision.id,
    expectedUpdatedAt: issuanceRevision.updated_date || "",
    expectedFields: expectedEntityFields(issuanceRevision, evidencePatch),
    nextFields: evidencePatch,
    guardFields: { estimate_id: estimateId, quote_issue_key: issueKey },
    label: `Quote Version ${version} delivery evidence`,
  });
  return { revision: { ...issuanceRevision, delivery_evidence: deliveryEvidence, ...(updated || {}) }, warning: "" };
}