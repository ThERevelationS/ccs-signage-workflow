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
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after') || response.headers.get('Retry-After');
      throw Object.assign(new Error(safeUpstreamError(response.status)), { status: response.status === 429 ? 429 : 502, upstreamStatus: response.status, retryAfter: retryAfter ? Number(retryAfter) || 0 : 0 });
    }
    return { status: response.status, body: await readJson(response) };
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error(method === 'GET' ? 'Smartsheet request timed out.' : 'Smartsheet write timed out.'), { status: 502, timedOut: true });
    throw error;
  } finally { clearTimeout(timeout); }
}
export async function retrySmartsheetCall(call, {
  retryTimeout = true,
  maxRateLimitRetries = 3,
  maxRateLimitWaitSeconds = Number.POSITIVE_INFINITY,
} = {}) {
  let timedOutRetried = false;
  let rateLimitRetries = 0;
  for (;;) {
    try { return await call(); }
    catch (error) {
      // Reads/legacy callers may retry one timeout. Order writes disable this
      // because a timed-out mutation has an ambiguous remote outcome.
      if (error?.timedOut && retryTimeout && !timedOutRetried) {
        timedOutRetried = true;
        continue;
      }
      // On 429, read the Retry-After header and retry with exponential
      // backoff (max 3 retries). Falls back to 2/4/8s when no Retry-After.
      if (error?.upstreamStatus === 429 && rateLimitRetries < maxRateLimitRetries) {
        rateLimitRetries++;
        const retryAfterSeconds = Number(error?.retryAfter) || 0;
        const backoffSeconds = retryAfterSeconds > 0 ? retryAfterSeconds : 2 * Math.pow(2, rateLimitRetries - 1);
        // Never retry before Smartsheet's Retry-After. Order writes set a
        // bounded wait; if the server asks for longer, return control to the
        // caller so the durable Order queue can retry later instead of holding
        // the coordinator long enough to look abandoned.
        if (backoffSeconds > maxRateLimitWaitSeconds) throw error;
        const started = performance.now();
        await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
        traceDelay('smartsheet_retry_wait', performance.now() - started, true);
        continue;
      }
      throw error;
    }
  }
}
export const smartsheetGet = (path, token) => retrySmartsheetCall(() => once('GET', path, token));
export const smartsheetWrite = (method, path, token, jsonBody) => retrySmartsheetCall(() => once(method, path, token, jsonBody));
// Order writes use this variant because a timeout is an ambiguous outcome: the
// remote mutation may have committed even though its response was lost. Never
// resend that write automatically. Callers must recover by read-back or hold the
// operation for review. Definitive HTTP 429 responses remain safe to retry.
export const smartsheetWriteNoTimeoutRetry = (method, path, token, jsonBody) =>
  retrySmartsheetCall(() => once(method, path, token, jsonBody), {
    retryTimeout: false,
    maxRateLimitRetries: 3,
    maxRateLimitWaitSeconds: 30,
  });