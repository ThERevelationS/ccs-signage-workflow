// Presentation-only status interpretation. Never mutates sync records or
// implies a timed-out backend invocation was conclusively aborted.
// The scheduled interval is 15 minutes; two full intervals without any
// recorded progress merits an explicit stale-status warning.
export const SMARTSHEET_SYNC_STALE_AFTER_MS = 30 * 60 * 1000;

export function interpretSmartsheetSyncStatus(status, nowMs = Date.now()) {
  const running = status?.status === "running";
  if (!running) return { isRunning: false, isStale: false, ageMinutes: null };
  const lastUpdate = Date.parse(status?.updated_at || status?.started_at || "");
  const hasValidTime = Number.isFinite(lastUpdate);
  const ageMs = hasValidTime ? Math.max(0, nowMs - lastUpdate) : null;
  return {
    isRunning: running && ageMs !== null && ageMs <= SMARTSHEET_SYNC_STALE_AFTER_MS,
    isStale: ageMs === null || ageMs > SMARTSHEET_SYNC_STALE_AFTER_MS,
    ageMinutes: ageMs === null ? null : Math.floor(ageMs / 60000),
  };
}
