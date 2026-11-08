const MAX_ID = 200;
const MAX_TS = 64;

const bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function createFoundationSyncAttempt({ sourceId, estimateId, key, requestedAt }) {
  if (!bounded(sourceId, MAX_ID)) throw new Error("A source project id is required for a sync attempt.");
  if (!bounded(estimateId, MAX_ID)) throw new Error("An estimate id is required for a sync attempt.");
  if (!bounded(key, MAX_ID)) throw new Error("A sync attempt key is required.");
  if (!bounded(requestedAt, MAX_TS) || !ISO_RE.test(requestedAt) || Number.isNaN(Date.parse(requestedAt))) throw new Error("A sync attempt needs a valid ISO timestamp.");
  return { schema_version: 1, key, source_project_id: sourceId, estimate_id: estimateId, requested_at: requestedAt };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

export function validateFoundationSyncAttempt(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.schema_version !== 1) return false;
  return bounded(a.key, MAX_ID)
    && bounded(a.source_project_id, MAX_ID)
    && bounded(a.estimate_id, MAX_ID)
    && bounded(a.requested_at, MAX_TS)
    && ISO_RE.test(a.requested_at)
    && !Number.isNaN(Date.parse(a.requested_at));
}

const attemptShapeOk = validateFoundationSyncAttempt;

const foundationLine = (estimate, sourceId) => {
  const items = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  return items.find((i) => i && i.module_key === "foundation" && i.project_id === sourceId) || null;
};

export function foundationSyncRecoveryState({ project, estimateId, estimate }) {
  const attempt = project?.builder_sync_attempt;
  const sourceId = project?.id || "";
  const line = foundationLine(estimate, sourceId);
  const keyedPending = !!(line && line.price_acceptance_pending && line.price_acceptance_pending.key);
  if (attempt === undefined || attempt === null) {
    return keyedPending
      ? { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt: null, line }
      : { status: "none", message: "", attempt: null, line };
  }
  if (!attemptShapeOk(attempt)) {
    return { status: "unsupported", message: "An unrecognised Builder sync receipt was found and left untouched.", attempt, line };
  }
  if (attempt.source_project_id !== sourceId || !estimateId || attempt.estimate_id !== estimateId || !estimate || estimate.id !== estimateId) {
    return { status: "mismatch", message: "This project's sync receipt belongs to a different estimate context.", attempt, line };
  }
  if (
    typeof project.updated_date === "string" && project.updated_date
    && line && line.updated_date_snapshot === project.updated_date
    && !keyedPending
  ) {
    return { status: "acknowledged", message: "", attempt, line };
  }
  return { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt, line };
}

export function assertFoundationBuilderAcknowledgment({ sourceProject, estimateId, line }) {
  if (!bounded(estimateId, MAX_ID) || !bounded(sourceProject?.id, MAX_ID)) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
  const ok = !!line && typeof line === "object" && !Array.isArray(line)
    && line.module_key === "foundation"
    && line.project_id === sourceProject?.id
    && typeof sourceProject?.updated_date === "string" && sourceProject.updated_date
    && line.updated_date_snapshot === sourceProject.updated_date
    && !(line.price_acceptance_pending && line.price_acceptance_pending.key)
    && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);
  if (!ok) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
}
/**
 * Resolve whether a persisted builder_sync_attempt receipt may proceed past
 * the save-time gate. The receipt names the estimate context that was being
 * synchronized when the source last saved:
 *   - same estimateId -> proceed (the pending op belongs to this save);
 *   - a different estimate that can still be read -> block; the pending
 *     operation must be resumed in its own context first;
 *   - a different estimate that is definitively absent -> the pending op can
 *     never complete, so the orphaned receipt may be retired with this save
 *     (caller writes builder_sync_attempt: null through the same CAS patch);
 *   - anything unverifiable -> stay blocked (fail closed).
 * `getEstimate` is the caller's estimate point-read (staffEntities
 * AllInOneEstimate.get); it resolves to a record, or rejects/absent for a
 * missing id. A rejection with an HTTP-404-style status is treated as
 * definitively absent — the same contract staffDataRead itself uses.
 */
export async function resolveFoundationSyncReceiptForSave({ project, estimateId, getEstimate }) {
  const prior = project?.builder_sync_attempt;
  if (prior === undefined || prior === null) return { ok: true, clearStaleReceipt: false };
  if (!attemptShapeOk(prior) || prior.source_project_id !== project?.id) {
    return { ok: false, error: "An unrecognised Builder sync receipt blocks saving. Reload and retry." };
  }
  if (!!estimateId && prior.estimate_id === estimateId) {
    return { ok: true, clearStaleReceipt: false };
  }
  if (typeof getEstimate !== "function") {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  const named = await Promise.resolve()
    .then(() => getEstimate(prior.estimate_id))
    .then((row) => row || null)
    .catch((error) => (Number(error?.status) === 404 ? null : undefined));
  if (named === undefined) {
    return { ok: false, error: "The estimate named by the saved Builder sync receipt could not be verified. Reload and retry." };
  }
  if (named) {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  return { ok: true, clearStaleReceipt: true };
}

// ---------------------------------------------------------------------------
// Partial Builder-sync retry classification (CMP-A04 tail).
//
// A save's estimate-side leg can stop part-way while the source project write
// already landed. Two durable markers describe what remains un-synced:
//   * project.builder_sync_attempt — the receipt naming the estimate context
//     being synchronized (written inside the CAS source save);
//   * line.price_acceptance_pending — the estimate-line recovery marker whose
//     stored plan (part acceptance / patches / deletes / group creates) is the
//     exact un-applied remainder of the mutation.
// The retry surface replays ONLY the un-synced portion — recordBuilderSave's
// estimate-side chain — never the source write. Modes:
//   resume_pending         — a durable line marker exists; the stored plan is
//                            replayed verbatim (verify-before-write per step)
//   resync_unacknowledged  — receipt pending with no line marker: the attempt
//                            died before the marker write, possibly after
//                            detect-phase part writes; the sync converges on
//                            part_key identity (existing rows reused, stale
//                            keys deactivated/pending-removal — never duped)
//   none_needed            — acknowledged, or no receipt and no marker
//   blocked_mismatch       — receipt names another estimate context
//   blocked_unsupported    — unrecognized receipt shape (left untouched)
//   blocked_no_estimate    — standalone project; nothing to synchronize to
// ---------------------------------------------------------------------------

const pendingLineMarker = (line) => {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && !Array.isArray(pending) && String(pending.key || "").trim()
    ? pending
    : null;
};

export function classifyFoundationSyncRetry({ project, estimateId, estimate } = {}) {
  const state = foundationSyncRecoveryState({ project, estimateId, estimate });
  const line = state.line || null;
  const pending = pendingLineMarker(line);
  const attempt = state.attempt ?? null;
  const base = { attempt, line, pendingKey: pending ? String(pending.key) : null, stateStatus: state.status };

  if (state.status === "unsupported") {
    return { ...base, mode: "blocked_unsupported", retryable: false, reason: state.message || "An unrecognised Builder sync receipt blocks retrying; review it first." };
  }
  if (state.status === "mismatch") {
    return { ...base, mode: "blocked_mismatch", retryable: false, reason: state.message || "This project's sync receipt belongs to a different estimate context." };
  }
  if (!estimateId) {
    return { ...base, mode: "blocked_no_estimate", retryable: false, reason: "This project is not linked to an estimate; there is no Builder sync to retry." };
  }
  if (pending) {
    return { ...base, mode: "resume_pending", retryable: true, reason: "A saved Builder mutation is still in progress; retry resumes its recorded remainder." };
  }
  if (state.status === "pending") {
    return { ...base, mode: "resync_unacknowledged", retryable: true, reason: state.message || "A saved Builder sync attempt is still unacknowledged." };
  }
  return { ...base, mode: "none_needed", retryable: false, reason: "" };
}