// src/components/estimator/foundation/foundationSyncRecovery.js
var MAX_ID = 200;
var MAX_TS = 64;
var bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
function createFoundationSyncAttempt({ sourceId, estimateId, key, requestedAt }) {
  if (!bounded(sourceId, MAX_ID)) throw new Error("A source project id is required for a sync attempt.");
  if (!bounded(estimateId, MAX_ID)) throw new Error("An estimate id is required for a sync attempt.");
  if (!bounded(key, MAX_ID)) throw new Error("A sync attempt key is required.");
  if (!bounded(requestedAt, MAX_TS) || !ISO_RE.test(requestedAt) || Number.isNaN(Date.parse(requestedAt))) throw new Error("A sync attempt needs a valid ISO timestamp.");
  return { schema_version: 1, key, source_project_id: sourceId, estimate_id: estimateId, requested_at: requestedAt };
}
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
function validateFoundationSyncAttempt(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.schema_version !== 1) return false;
  return bounded(a.key, MAX_ID) && bounded(a.source_project_id, MAX_ID) && bounded(a.estimate_id, MAX_ID) && bounded(a.requested_at, MAX_TS) && ISO_RE.test(a.requested_at) && !Number.isNaN(Date.parse(a.requested_at));
}
var attemptShapeOk = validateFoundationSyncAttempt;
var foundationLine = (estimate, sourceId) => {
  const items = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  return items.find((i) => i && i.module_key === "foundation" && i.project_id === sourceId) || null;
};
function foundationSyncRecoveryState({ project, estimateId, estimate }) {
  const attempt = project?.builder_sync_attempt;
  const sourceId = project?.id || "";
  const line = foundationLine(estimate, sourceId);
  const keyedPending = !!(line && line.price_acceptance_pending && line.price_acceptance_pending.key);
  if (attempt === void 0 || attempt === null) {
    return keyedPending ? { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt: null, line } : { status: "none", message: "", attempt: null, line };
  }
  if (!attemptShapeOk(attempt)) {
    return { status: "unsupported", message: "An unrecognised Builder sync receipt was found and left untouched.", attempt, line };
  }
  if (attempt.source_project_id !== sourceId || !estimateId || attempt.estimate_id !== estimateId || !estimate || estimate.id !== estimateId) {
    return { status: "mismatch", message: "This project's sync receipt belongs to a different estimate context.", attempt, line };
  }
  if (typeof project.updated_date === "string" && project.updated_date && line && line.updated_date_snapshot === project.updated_date && !keyedPending) {
    return { status: "acknowledged", message: "", attempt, line };
  }
  return { status: "pending", message: "A saved Builder sync attempt is still unacknowledged.", attempt, line };
}
function assertFoundationBuilderAcknowledgment({ sourceProject, estimateId, line }) {
  if (!bounded(estimateId, MAX_ID) || !bounded(sourceProject?.id, MAX_ID)) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
  const ok = !!line && typeof line === "object" && !Array.isArray(line) && line.module_key === "foundation" && line.project_id === sourceProject?.id && typeof sourceProject?.updated_date === "string" && sourceProject.updated_date && line.updated_date_snapshot === sourceProject.updated_date && !(line.price_acceptance_pending && line.price_acceptance_pending.key) && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);
  if (!ok) {
    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");
  }
}
async function resolveFoundationSyncReceiptForSave({ project, estimateId, getEstimate }) {
  const prior = project?.builder_sync_attempt;
  if (prior === void 0 || prior === null) return { ok: true, clearStaleReceipt: false };
  if (!attemptShapeOk(prior) || prior.source_project_id !== project?.id) {
    return { ok: false, error: "An unrecognised Builder sync receipt blocks saving. Reload and retry." };
  }
  if (!!estimateId && prior.estimate_id === estimateId) {
    return { ok: true, clearStaleReceipt: false };
  }
  if (typeof getEstimate !== "function") {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  const named = await Promise.resolve().then(() => getEstimate(prior.estimate_id)).then((row) => row || null).catch((error) => Number(error?.status) === 404 ? null : void 0);
  if (named === void 0) {
    return { ok: false, error: "The estimate named by the saved Builder sync receipt could not be verified. Reload and retry." };
  }
  if (named) {
    return { ok: false, error: "This project's Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };
  }
  return { ok: true, clearStaleReceipt: true };
}
var pendingLineMarker = (line) => {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && !Array.isArray(pending) && String(pending.key || "").trim() ? pending : null;
};
function classifyFoundationSyncRetry({ project, estimateId, estimate } = {}) {
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
export {
  assertFoundationBuilderAcknowledgment,
  classifyFoundationSyncRetry,
  createFoundationSyncAttempt,
  foundationSyncRecoveryState,
  resolveFoundationSyncReceiptForSave,
  validateFoundationSyncAttempt
};
