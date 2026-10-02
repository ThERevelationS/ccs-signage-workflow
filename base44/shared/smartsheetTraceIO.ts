import { safeExternalFetch } from './safeExternalFetch.ts';
import { syncTraceContext, traceEvent } from './smartsheetTraceContext.ts';

const reads = new Set(['filter','list','get','count','aggregate']);
const writes = new Set(['create','update','bulkCreate','bulkUpdate','updateMany','delete','deleteMany','upsert']);
const duration = start => Math.round((performance.now() - start) * 100) / 100;
function enter(t, service) { t.active[service]++; t.metrics[`peak_${service}_concurrency`] = Math.max(t.metrics[`peak_${service}_concurrency`], t.active[service]); }
function repeated(t, key, counter) { if (t.readKeys.has(key)) t.metrics[counter]++; else t.readKeys.add(key); }
export function measureSyncEntities(client) {
  const entities = new Proxy(client.asServiceRole.entities, { get(target, name) {
    const entity = target[name];
    if (!entity || name === 'SmartsheetSyncTrace') return entity;
    return new Proxy(entity, { get(target, method) {
      const fn = target[method];
      if (typeof fn !== 'function' || !reads.has(method) && !writes.has(method)) return fn;
      return async (...args) => {
        const t = syncTraceContext.getStore();
        if (!t) return await fn.apply(target, args);
        const read = reads.has(method), start = performance.now();
        t.metrics[read ? 'base44_reads' : 'base44_writes']++; enter(t, 'base44');
        if (read) repeated(t, `b44:${String(name)}:${String(method)}:${JSON.stringify(args)}`, 'repeated_base44_reads');
        traceEvent('base44_started', { entity: String(name), operation: String(method) });
        try {
          const result = await fn.apply(target, args);
          const count = Array.isArray(result) ? result.length : Array.isArray(result?.items) ? result.items.length : method === 'get' && result?.id ? 1 : 0;
          if (read) t.metrics.base44_records_returned += count;
          traceEvent('base44_finished', { entity: String(name), operation: String(method), duration_ms: duration(start), records_returned: read ? count : undefined });
          return result;
        } catch (error) {
          const status = Number(error?.status || error?.response?.status || 0);
          if (status === 429 || /rate limit/i.test(String(error?.message || ''))) t.metrics.base44_429++;
          traceEvent('base44_error', { entity: String(name), operation: String(method), status, duration_ms: duration(start) });
          throw error;
        } finally { t.metrics.base44_ms += duration(start); t.active.base44--; }
      };
    } });
  } });
  const service = new Proxy(client.asServiceRole, { get: (t, k) => k === 'entities' ? entities : t[k] });
  return new Proxy(client, { get: (t, k) => k === 'asServiceRole' ? service : t[k] });
}
export async function measuredSmartsheetFetch(url, init = {}, redirects = 0) {
  const t = syncTraceContext.getStore();
  if (!t) return await safeExternalFetch(url, init, redirects);
  const parsed = new URL(url), method = String(init.method || 'GET').toUpperCase(), start = performance.now();
  const operation = `${method} ${parsed.pathname}`, key = `${operation}?${parsed.searchParams.toString()}`;
  t.metrics[`smartsheet_${['GET','PUT','POST'].includes(method) ? method.toLowerCase() : 'other'}`]++;
  const weight = /\/history(?:\/|$)/.test(parsed.pathname) ? 10 : 1;
  t.metrics.smartsheet_weighted_requests += weight;
  if (method === 'GET') repeated(t, key, 'repeated_smartsheet_gets');
  if (typeof init.body === 'string' && ['PUT','POST'].includes(method) && /\/rows$/.test(parsed.pathname)) {
    const payload = JSON.parse(init.body), rows = Array.isArray(payload) ? payload : [payload];
    t.metrics.smartsheet_rows_submitted += rows.length;
    t.metrics.smartsheet_cells_submitted += rows.reduce((n, r) => n + (r.cells?.length || 0), 0);
  }
  enter(t, 'smartsheet');
  traceEvent('smartsheet_started', { operation, weight, row_ids_requested: (parsed.searchParams.get('rowIds') || '').split(',').filter(Boolean).length, page: parsed.searchParams.get('page') });
  try {
    const response = await safeExternalFetch(url, init, redirects);
    if (response.status === 429) t.metrics.smartsheet_429++;
    if (response.status >= 500) t.metrics.smartsheet_5xx++;
    traceEvent('smartsheet_response', { operation, status: response.status, duration_ms: duration(start), retry_after: response.headers.get('retry-after') });
    return response;
  } catch (error) {
    const timeout = error?.name === 'AbortError' || error?.name === 'TimeoutError';
    if (timeout) t.metrics.timeouts++;
    traceEvent('smartsheet_transport_error', { operation, timeout, duration_ms: duration(start), uncertain_write: method !== 'GET' });
    throw error;
  } finally { t.metrics.smartsheet_ms += duration(start); t.active.smartsheet--; }
}
export function observeSmartsheetBody(body) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  const rows = Array.isArray(body?.rows) ? body.rows : Array.isArray(body?.result) ? body.result : body?.id && body?.cells ? [body] : [];
  t.metrics.smartsheet_rows_returned += rows.length;
  traceEvent('smartsheet_body', { rows_returned: rows.length, sheet_version: body?.version ?? null, external_modified_at: body?.modifiedAt ?? null });
}
export async function measuredDriveFetch(url, init) {
  const t = syncTraceContext.getStore();
  if (!t) return await fetch(url, init);
  const start = performance.now(); enter(t, 'drive');
  traceEvent('backup_drive_started', { method: init?.method || 'GET' });
  try { const r = await fetch(url, init); traceEvent('backup_drive_response', { status: r.status, duration_ms: duration(start) }); return r; }
  finally { t.metrics.drive_ms += duration(start); t.active.drive--; }
}