import { base44 } from "@/api/base44Client";
import { estimateAuditSnapshot } from "./estimateLifecycle";
import { loadAllEntityRows, withRateLimitRetry } from "./loadAllEntityRows";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "./estimatePersistence";

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
    const rows = await loadAllEntityRows({ entity: base44.entities.EstimateRevision, query: { estimate_id: estimateId }, sort: "-revision_number", label: "Estimate revisions" });
    return (rows || []).slice().sort((a, b) => num(b.revision_number) - num(a.revision_number));
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

export async function startEstimateRevision({ estimate, reason, quoteTotal, internalCost, sessionToken = "" }) {
  if (!estimate?.id) throw new Error("Estimate is required to start a revision.");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A revision reason is required.");

  const existing = await getOpenEstimateRevision(estimate.id);
  if (existing) return existing;

  const response = await base44.functions.invoke("ensureOpenEstimateRevision", {
    estimate_id: estimate.id,
    expected_estimate_updated_date: estimate.updated_date || "",
    reason: cleanReason,
    session_token: sessionToken,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate revision could not be verified after starting.");
  return result.revision;
}

export async function completeEstimateRevision({ revision, estimate, sessionToken = "" }) {
  if (!revision?.id) return null;
  const estimateId = estimate?.id || revision.estimate_id || "";
  if (!estimateId) throw new Error("Estimate is required to complete a revision.");
  if (!sessionToken) {
    // The backend audit write needs a session; without one, skip gracefully —
    // the open revision remains for reconciliation rather than failing the
    // whole status transition.
    console.warn("Revision completion skipped — no session token; audit write deferred for reconciliation.");
    return null;
  }
  const response = await base44.functions.invoke("updateEstimateRevisionAudit", {
    action: "complete_manual_revision",
    estimate_id: estimateId,
    revision_id: revision.id,
    expected_revision_updated_date: revision.updated_date || "",
    session_token: sessionToken,
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
export async function ensureEstimateLifecycleRevision({ idempotencyKey = "", sessionToken = "", ...payload }) {
  const cleanKey = String(idempotencyKey || "").trim();
  const estimateId = payload.estimateAfter?.id || payload.estimateBefore?.id || "";
  if (!estimateId) throw new Error("Estimate is required for revision history.");
  if (!cleanKey) throw new Error("A stable lifecycle idempotency key is required.");

  const cleanReason = String(payload.reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  if (!sessionToken) {
    // Same session fallback as completeEstimateRevision — never fail a save or
    // transition because an audit row couldn't be written without a session.
    console.warn("Lifecycle revision skipped — no session token; audit write deferred for reconciliation.");
    return { id: "", skipped: true };
  }
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
    session_token: sessionToken,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Estimate lifecycle revision could not be verified after recording.");
  return result.revision;
}

/**
 * (#205) Guarded revert: restore the estimate to a target revision's
 * `estimate_snapshot_before`, CAS-anchored on the estimate's CURRENT
 * `updated_date` (plus per-field baselines) so a concurrent save can never
 * be silently overwritten — a conflict aborts with "changed in another
 * session" before anything is written. The revert itself is recorded as a
 * new completed lifecycle revision (manual_revision type; the schema enum
 * is closed so the reason/notes carry the revert identity), preserving the
 * forward-only audit trail. The fresh estimate row is re-read inside the
 * helper — the caller's loaded row is never trusted.
 */
export async function revertEstimateToRevision({
  estimateId,
  revisionId,
  sessionToken = "",
  entity = base44.entities.AllInOneEstimate,
} = {}) {
  const id = String(estimateId || "").trim();
  if (!id) throw new Error("Estimate is required to revert.");
  const revId = String(revisionId || "").trim();
  if (!revId) throw new Error("A target revision is required to revert.");

  const [revision, estimate] = await Promise.all([
    base44.entities.EstimateRevision.get(revId),
    entity.get(id),
  ]);
  if (!revision?.id) throw new Error("The target revision could not be loaded — reload the revision history.");
  if (!estimate?.id) throw new Error("The estimate could not be loaded — reload before reverting.");
  if (String(revision.estimate_id || "") !== id) {
    throw new Error("That revision belongs to a different estimate.");
  }
  const snapshot = revision.estimate_snapshot_before;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Object.keys(snapshot).length) {
    throw new Error("This revision does not carry a restorable estimate snapshot.");
  }

  // Restore only fields the snapshot carries — fields introduced after the
  // snapshot was taken keep their current values. edit_reason is cleared so
  // the restored row doesn't look like a pending manual revision.
  const nextFields = { ...snapshot, edit_reason: "" };
  const saved = await replaceEstimateFieldsIfUnchanged({
    entity,
    estimateId: id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate.updated_date },
    nextFields,
    label: `Estimate revert to revision ${revision.revision_number || revId}`,
  });

  const revisionRow = await ensureEstimateLifecycleRevision({
    // Anchored on the pre-write version: a retry after a partial commit
    // re-reads the estimate (new updated_date → new key → a new audit row
    // is recorded rather than silently skipped).
    idempotencyKey: `revert:${revId}:${estimate.updated_date}`,
    sessionToken,
    estimateBefore: estimate,
    estimateAfter: saved,
    reason: `Reverted estimate to revision #${revision.revision_number || "?"} (${revision.reason || "no reason recorded"})`,
    revisionType: "manual_revision",
    quoteTotalBefore: estimate.quote_total,
    quoteTotalAfter: snapshot.quote_total,
    internalCostBefore: estimate.total_cost,
    internalCostAfter: snapshot.total_cost,
    workOrderId: saved.work_order_id || estimate.work_order_id || "",
  });
  return { estimate: saved, revertRevision: revisionRow, targetRevision: revision };
}

export async function attachQuoteDeliveryEvidenceToIssuanceRevision({ estimateId, quoteVersion, evidence, sessionToken = "" }) {
  const version = Math.max(0, Math.floor(num(quoteVersion)));
  if (!estimateId || version <= 0 || !evidence) return { revision: null, warning: "" };
  if (!sessionToken) return { revision: null, warning: "Delivery evidence attach skipped — no session token." };

  const response = await base44.functions.invoke("updateEstimateRevisionAudit", {
    action: "attach_delivery_evidence",
    estimate_id: estimateId,
    quote_version: version,
    session_token: sessionToken,
    delivery_evidence: {
      delivery_id: evidence.deliveryId || "",
      gmail_message_id: evidence.gmailMessageId || "",
      recipient_email: evidence.recipientEmail || "",
      sent_at: evidence.sentAt || new Date().toISOString(),
      attachment_file_url: evidence.archive?.fileUrl || "",
      attachment_sha256: evidence.archive?.sha256 || "",
      attachment_size_bytes: Number(evidence.archive?.sizeBytes || 0),
    },
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  return { revision: result?.revision || null, warning: result?.warning || "" };
}