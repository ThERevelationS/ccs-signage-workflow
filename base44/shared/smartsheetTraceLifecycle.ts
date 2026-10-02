import { syncTraceContext, newSyncTrace, traceEvent, traceSnapshot, traceStage } from './smartsheetTraceContext.ts';

export function traceSyncStatus(status) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  traceEvent('sync_status', { status: status.status, stage: status.current_step_label || '', phase: status.progress_phase || '', current: status.progress_current ?? null, total: status.progress_total ?? null });
  for (const result of status.results || []) {
    if (!t.stages.some(s => s.dataset === result.dataset && s.direction === result.direction)) traceStage(result);
  }
}

const actions = new Set(['run_sync','push_dataset','pull_dataset','push_saved_sales','push_saved_orders','resolve_conflict','append_options','preview_append_options','save']);
export async function beginSyncTraceStorage(client) {
  const t = syncTraceContext.getStore();
  if (!t || t.recordId) return;
  t.entity = client.asServiceRole.entities.SmartsheetSyncTrace;
  const start = performance.now(); t.metrics.trace_storage_writes++;
  try { const row = await t.entity.create(traceSnapshot()); t.recordId = row.id; t.lastCheckpoint = performance.now(); }
  catch (error) { t.storageFailed = true; console.error('Sync trace persistence failed', t.sync_run_id, error?.status || 500); }
  finally { t.metrics.trace_storage_ms += performance.now() - start; }
}
export async function checkpointSyncTrace(force = false) {
  const t = syncTraceContext.getStore();
  if (!t?.recordId || t.flushing || !force && performance.now() - t.lastCheckpoint < 15000) return;
  t.flushing = true; t.lastCheckpoint = performance.now(); const start = performance.now(); t.metrics.trace_storage_writes++;
  try { await t.entity.update(t.recordId, traceSnapshot()); }
  catch (error) { t.storageFailed = true; console.error('Sync trace checkpoint failed', t.sync_run_id, error?.status || 500); }
  finally { t.metrics.trace_storage_ms += performance.now() - start; t.flushing = false; }
}
export async function tracedSyncRequest(req, source, handler) {
  const body = await req.clone().json().catch(() => ({}));
  const action = String(body.action || '').toLowerCase();
  const enabled = source === 'fieldHistoryAction' ? action === 'save' || body.include_remote !== false : actions.has(action);
  if (!enabled) return await handler(req);
  const trace = newSyncTrace(source, action || 'history');
  return await syncTraceContext.run(trace, async () => {
    traceEvent('request_received');
    let response;
    try { response = await handler(req); }
    catch (error) { trace.status = 'failed'; trace.completed_at = new Date().toISOString(); traceEvent('handler_failed'); await checkpointSyncTrace(true); throw error; }
    const data = await response.clone().json().catch(() => ({}));
    trace.status = response.status === 409 ? 'rejected' : !response.ok || data.success === false ? 'failed' : data.needs_review ? 'needs_review' : 'completed';
    trace.completed_at = new Date().toISOString();
    traceEvent('request_finished', { status: response.status, sync_complete: data.sync_complete === true });
    await checkpointSyncTrace(true);
    console.info('SMARTSHEET_SYNC_TRACE', JSON.stringify(traceSnapshot()));
    // Preserve the existing response contract; a returned request is not assumed to be a complete sync.
    return response;
  });
}