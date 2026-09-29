export const ORDER_SYNC_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

export function orderSyncLiveProgress(status, { enabled = true, now = Date.now() } = {}) {
  const show = Boolean(enabled && status?.progress_dataset === 'orders');
  const current = show ? Math.max(0, Number(status?.progress_current) || 0) : 0;
  const total = show ? Math.max(0, Number(status?.progress_total) || 0) : 0;
  const itemLabel = show ? String(status?.progress_item_label || '').trim() : '';
  const detail = show ? String(status?.progress_detail || '').trim() : '';

  const totalSteps = Math.max(0, Number(status?.total_steps) || 0);
  const completedSteps = Math.max(0, Number(status?.completed_steps) || 0);
  const running = status?.status === 'running';
  const stepFraction = running && total > 0 ? Math.min(0.999, current / total) : 0;
  const rawPercent = totalSteps > 0
    ? Math.round(((completedSteps + stepFraction) / totalSteps) * 1000) / 10
    : 0;
  const percent = running ? Math.min(99.9, rawPercent) : rawPercent;

  const stamp = Date.parse(status?.progress_updated_at || status?.updated_at || status?.started_at || '');
  const heartbeatAgeMs = Number.isFinite(stamp) ? Math.max(0, now - stamp) : null;
  // The short heartbeat timeout belongs only to active Order row progress.
  // Other sync stages (for example Sales in a combined run) do not emit this
  // heartbeat and must keep the shared widget's normal stale-run policy.
  const stalled = Boolean(show && running &&
    (heartbeatAgeMs === null || heartbeatAgeMs > ORDER_SYNC_HEARTBEAT_STALE_MS));

  return { show, current, total, itemLabel, detail, percent, stalled, heartbeatAgeMs };
}
