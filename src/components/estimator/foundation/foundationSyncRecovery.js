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
