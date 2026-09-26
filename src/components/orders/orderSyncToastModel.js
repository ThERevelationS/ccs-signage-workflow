// Order Form-only presentation policy; never hides a failed, skipped, stale,
// conflicted or review-required sync result automatically.
export const ORDER_SYNC_SUCCESS_VISIBLE_MS = 9000;

export function orderSyncToastState(status, nowMs = Date.now()) {
  const results = Array.isArray(status?.results) ? status.results : [];
  const key = String(status?.completed_at || status?.started_at || '');
  const finishedAt = Date.parse(status?.completed_at || '');
  const healthy = status?.status === 'completed' && status?.needs_review !== true &&
    results.length > 0 && results.every(result =>
      !result?.skipped && !(Number(result?.errors) > 0) &&
      !(Number(result?.conflicts) > 0));
  const expiresAt = healthy && Number.isFinite(finishedAt)
    ? finishedAt + ORDER_SYNC_SUCCESS_VISIBLE_MS : null;
  return {
    key,
    compact: expiresAt !== null,
    expiresAt,
    visible: expiresAt !== null && nowMs < expiresAt,
  };
}
