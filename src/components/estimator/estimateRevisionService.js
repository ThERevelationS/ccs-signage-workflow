import { base44 } from "@/api/base44Client";
import { estimateAuditSnapshot, summarizeEstimateChanges } from "./estimateLifecycle";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function nextRevisionNumber(estimateId) {
  const rows = await base44.entities.EstimateRevision.filter({ estimate_id: estimateId }).catch(() => []);
  return Math.max(0, ...(rows || []).map((row) => num(row.revision_number))) + 1;
}

export async function getOpenEstimateRevision(estimateId) {
  if (!estimateId) return null;
  const rows = await base44.entities.EstimateRevision.filter({ estimate_id: estimateId, revision_status: "open" }).catch(() => []);
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
  return base44.entities.EstimateRevision.create({
    estimate_id: estimate.id,
    revision_number: await nextRevisionNumber(estimate.id),
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
  const before = revision.estimate_snapshot_before || {};
  const after = estimateAuditSnapshot(estimate, { quoteTotal, internalCost });
  const payload = {
    revision_status: "completed",
    new_status: after.status || revision.previous_status || "draft",
    new_quote_total: num(after.quote_total),
    new_total_cost: num(after.total_cost),
    change_summary: summarizeEstimateChanges(before, after),
    estimate_snapshot_after: after,
    completed_at: new Date().toISOString(),
    work_order_id: workOrderId || revision.work_order_id || "",
  };
  const updated = await base44.entities.EstimateRevision.update(revision.id, payload);
  return { ...revision, ...payload, ...(updated || {}) };
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
}) {
  if (!estimateBefore?.id && !estimateAfter?.id) throw new Error("Estimate is required for revision history.");
  const estimateId = estimateAfter?.id || estimateBefore.id;
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A lifecycle reason is required.");
  const before = estimateAuditSnapshot(estimateBefore || {}, { quoteTotal: quoteTotalBefore, internalCost: internalCostBefore });
  const after = estimateAuditSnapshot(estimateAfter || {}, { quoteTotal: quoteTotalAfter, internalCost: internalCostAfter });
  const timestamp = new Date().toISOString();
  return base44.entities.EstimateRevision.create({
    estimate_id: estimateId,
    revision_number: await nextRevisionNumber(estimateId),
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
    }).catch(() => []);
    const existing = (rows || []).find((row) => row.revision_status === "completed");
    if (existing) return existing;
  }

  return recordEstimateLifecycleRevision({
    ...payload,
    notes: cleanKey,
  });
}
