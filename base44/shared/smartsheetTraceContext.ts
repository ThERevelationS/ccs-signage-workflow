import { AsyncLocalStorage } from 'node:async_hooks';

export const syncTraceContext = new AsyncLocalStorage();
const round = n => Math.round(n * 100) / 100;
export function newSyncTrace(source, action) {
  return { source, action, sync_run_id: crypto.randomUUID(), requested_at: new Date().toISOString(), start: performance.now(), sequence: 0,
    timeline: [], stages: [], readKeys: new Set(), active: { smartsheet: 0, base44: 0, drive: 0 }, lastCheckpoint: 0,
    metrics: { smartsheet_get: 0, smartsheet_put: 0, smartsheet_post: 0, smartsheet_other: 0, smartsheet_weighted_requests: 0,
      smartsheet_rows_returned: 0, smartsheet_rows_submitted: 0, smartsheet_cells_submitted: 0, repeated_smartsheet_gets: 0,
      base44_reads: 0, base44_writes: 0, base44_records_returned: 0, repeated_base44_reads: 0, base44_429: 0, smartsheet_429: 0,
      smartsheet_5xx: 0, timeouts: 0, retries: 0, retry_delay_ms: 0, pacing_delay_ms: 0, smartsheet_ms: 0, base44_ms: 0, drive_ms: 0,
      peak_smartsheet_concurrency: 0, peak_base44_concurrency: 0, peak_drive_concurrency: 0, trace_storage_writes: 0, trace_storage_ms: 0,
      queue_wait_ms: null, jobs_submitted: null, jobs_coalesced: null, ui_propagation_ms: null, timeline_omitted: 0 } };
}
export function traceEvent(kind, detail = {}) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  const event = { sequence: ++t.sequence, at: new Date().toISOString(), elapsed_ms: round(performance.now() - t.start), kind, ...detail };
  if (t.timeline.length < 300) t.timeline.push(event);
  else { t.timeline.splice(150, 1); t.timeline.push(event); t.metrics.timeline_omitted++; }
}
export function traceDelay(kind, ms, retry = false) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  t.metrics[retry ? 'retry_delay_ms' : 'pacing_delay_ms'] += round(ms);
  if (retry) t.metrics.retries++;
  traceEvent(kind, { duration_ms: round(ms) });
}
export function traceStage(result) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  const stage = Object.fromEntries(['dataset','direction','rows_examined','records_examined','created','updated','unchanged_skipped','conflicts','errors','skipped','partial','processed_records','remaining_records','time_budget_reached'].filter(k => result?.[k] !== undefined).map(k => [k, result[k]]));
  t.stages.push(stage); traceEvent('stage_finished', stage);
}
export function traceSnapshot() {
  const t = syncTraceContext.getStore();
  const m = { ...t.metrics, duration_ms: round(performance.now() - t.start) };
  m.smartsheet_requests = m.smartsheet_get + m.smartsheet_put + m.smartsheet_post + m.smartsheet_other;
  m.base44_requests = m.base44_reads + m.base44_writes;
  m.total_sync_api_calls = m.smartsheet_requests + m.base44_requests;
  return { sync_run_id: t.sync_run_id, source: t.source, action: t.action, requested_at: t.requested_at,
    status: t.status || 'processing', last_checkpoint_at: new Date().toISOString(), ...(t.completed_at ? { completed_at: t.completed_at } : {}),
    metrics: m, timeline: t.timeline, stages: t.stages, limitations: [
      'Counts cover this backend invocation, not browser polling or other apps using the same token.',
      'Repeated reads are measured, not automatically classified as unnecessary.',
      'Submitted rows/cells are attempted payload counts, not proof of committed changes.',
      'Queue and UI timings are unavailable in the legacy system, not zero.',
      'API durations are sums of operation spans; concurrent spans overlap.',
      'Trace storage overhead is separate. A terminated worker leaves an incomplete last checkpoint.',
      ...(m.timeline_omitted ? ['Timeline is sampled; totals include all observed operations.'] : []) ] };
}