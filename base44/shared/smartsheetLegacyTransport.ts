import { measuredSmartsheetFetch, observeSmartsheetBody } from './smartsheetTraceIO.ts';
import { traceDelay } from './smartsheetTraceContext.ts';

const API_BASE = 'https://api.smartsheet.com/2.0', MAX_RESPONSE_BYTES = 2_000_000;
function safeUpstreamError(status) {
  if (status === 401 || status === 403) return 'Smartsheet rejected the configured API token or its permissions.';
  if (status === 404) return 'The requested Smartsheet resource was not found or is not accessible to this token.';
  if (status === 429) return 'Smartsheet rate-limited the request. Retry later.';
  if (status >= 500) return 'Smartsheet is temporarily unavailable.';
  return `Smartsheet returned HTTP ${status}.`;
}
async function readJson(response) {
  if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) throw Object.assign(new Error('Smartsheet response exceeded the diagnostic size limit.'), { status: 502 });
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw Object.assign(new Error('Smartsheet response exceeded the diagnostic size limit.'), { status: 502 });
  if (!text.trim()) return null;
  let body;
  try { body = JSON.parse(text); }
  catch { throw Object.assign(new Error('Smartsheet returned an unreadable response.'), { status: 502 }); }
  observeSmartsheetBody(body); return body;
}
async function once(method, path, token, jsonBody) {
  const safePath = String(path || '').trim();
  if (!safePath.startsWith('/') || safePath.includes('://')) throw Object.assign(new Error('Invalid Smartsheet API path.'), { status: 400 });
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), method === 'GET' ? 15_000 : 30_000);
  try {
    const response = await measuredSmartsheetFetch(`${API_BASE}${safePath}`, {
      method, headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
        'smartsheet-integration-source': 'APPLICATION,CincinnatiCustomSigns,Base44-Smartsheet-Sync',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(jsonBody) }), signal: controller.signal }, 0);
    if (!response.ok) throw Object.assign(new Error(safeUpstreamError(response.status)), { status: response.status === 429 ? 429 : 502, upstreamStatus: response.status });
    return { status: response.status, body: await readJson(response) };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error(method === 'GET' ? 'Smartsheet request timed out.' : 'Smartsheet write timed out.'), { status: 502 });
    throw error;
  } finally { clearTimeout(timeout); }
}
async function legacyRetry(call) {
  for (let attempt = 0; ; attempt++) {
    try { return await call(); }
    catch (error) {
      if (error?.upstreamStatus !== 429 || attempt >= 3) throw error;
      const started = performance.now(); await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
      traceDelay('smartsheet_retry_wait', performance.now() - started, true);
    }
  }
}
export const smartsheetGet = (path, token) => legacyRetry(() => once('GET', path, token));
export const smartsheetWrite = (method, path, token, jsonBody) => legacyRetry(() => once(method, path, token, jsonBody));