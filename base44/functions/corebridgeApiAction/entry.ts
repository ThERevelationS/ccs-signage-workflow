import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

const SECRET_NAME = 'COREBRIDGE_SUBSCRIPTION_KEY';
const API_VERSION = 'v3.0';

const CAPABILITIES = [
  { family: 'core', title: 'Core API', base_url: 'https://corebridgev3.azure-api.net/core', operations: 574, get: 516, post: 42, put: 7, patch: 1, delete: 8, source: 'v3.json' },
  { family: 'documents', title: 'Documents API', base_url: 'https://corebridgev3.azure-api.net/documents', operations: 16, get: 16, post: 0, put: 0, patch: 0, delete: 0, source: 'documents-v3.json' },
  { family: 'files', title: 'Files API', base_url: 'https://corebridgev3.azure-api.net/files', operations: 36, get: 6, post: 21, put: 3, patch: 0, delete: 6, source: 'files-api-v3.json' },
  { family: 'reports', title: 'Reports API', base_url: 'https://corebridgev3.azure-api.net/reports', operations: 11, get: 11, post: 0, put: 0, patch: 0, delete: 0, source: 'reports-v3.json' },
  { family: 'search', title: 'Search API', base_url: 'https://corebridgev3.azure-api.net/search', operations: 112, get: 112, post: 0, put: 0, patch: 0, delete: 0, source: 'search-v3.json' },
  { family: 'status', title: 'Status API', base_url: 'https://corebridgev3.azure-api.net/status', operations: 14, get: 14, post: 0, put: 0, patch: 0, delete: 0, source: 'status-v3.json' },
  { family: 'configuration', title: 'Configuration API', base_url: null, operations: null, get: null, post: null, put: null, patch: null, delete: null, source: 'not yet supplied' },
];

const ROUTES = {
  account_validate: { family: 'core', path: '/api/account/validate', versioned: true },
  account: { family: 'core', path: '/api/account', versioned: true },
  status_api: { family: 'status', path: '/server/api', versioned: false },
  status_search: { family: 'status', path: '/server/search', versioned: false },
  status_document: { family: 'status', path: '/server/document', versioned: false },
  status_reports: { family: 'status', path: '/server/reports', versioned: false },
  status_integration: { family: 'status', path: '/server/integration', versioned: false },
} as const;

function cleanText(value: unknown, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function capabilitySummary() {
  return CAPABILITIES.map((item) => ({ ...item }));
}

function buildUrl(route: (typeof ROUTES)[keyof typeof ROUTES]) {
  const family = CAPABILITIES.find((item) => item.family === route.family);
  if (!family?.base_url) throw new Error(`CoreBridge ${route.family} API base URL is unavailable.`);
  const url = new URL(route.path, family.base_url);
  if (route.versioned) url.searchParams.set('apiversion', API_VERSION);
  return url.toString();
}

async function writeAudit(base44: any, data: Record<string, unknown>) {
  try {
    await base44.asServiceRole.entities.CorebridgeApiAudit.create({
      requested_at: new Date().toISOString(),
      ...data,
    });
  } catch (error) {
    console.error('CoreBridge API audit log failed:', (error as any)?.message || error);
  }
}

async function readBody(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > 1_000_000) {
    throw Object.assign(new Error('CoreBridge response exceeded the diagnostic size limit.'), { status: 502 });
  }
  const text = await response.text();
  if (text.length > 1_000_000) {
    throw Object.assign(new Error('CoreBridge response exceeded the diagnostic size limit.'), { status: 502 });
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 10_000);
  }
}

function safeUpstreamError(status: number) {
  if (status === 401 || status === 403) return 'CoreBridge rejected the configured subscription key or its permissions.';
  if (status === 429) return 'CoreBridge rate-limited the request. Retry later.';
  if (status >= 500) return 'CoreBridge is temporarily unavailable.';
  return `CoreBridge returned HTTP ${status}.`;
}

async function corebridgeGet(base44: any, actor: any, action: keyof typeof ROUTES, subscriptionKey: string) {
  const route = ROUTES[action];
  const url = buildUrl(route);
  const started = Date.now();
  let response: Response | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      response = await safeExternalFetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
        signal: controller.signal,
      }, 0);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const message = safeUpstreamError(response.status);
      await writeAudit(base44, {
        actor_email: cleanText(actor?.email, 320).toLowerCase(),
        action,
        api_family: route.family,
        endpoint: route.path,
        http_status: response.status,
        success: false,
        duration_ms: Date.now() - started,
        error_message: message,
      });
      throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 });
    }

    const body = await readBody(response);
    await writeAudit(base44, {
      actor_email: cleanText(actor?.email, 320).toLowerCase(),
      action,
      api_family: route.family,
      endpoint: route.path,
      http_status: response.status,
      success: true,
      duration_ms: Date.now() - started,
      error_message: '',
    });
    return { status: response.status, body };
  } catch (error) {
    if (!response) {
      const message = (error as any)?.name === 'AbortError'
        ? 'CoreBridge request timed out.'
        : cleanText((error as any)?.message || 'CoreBridge request failed.', 500);
      await writeAudit(base44, {
        actor_email: cleanText(actor?.email, 320).toLowerCase(),
        action,
        api_family: route.family,
        endpoint: route.path,
        http_status: 0,
        success: false,
        duration_ms: Date.now() - started,
        error_message: message,
      });
    }
    throw error;
  }
}

function accountSummary(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return {
    auth_user_id: body.AuthUserID ?? body.authUserID ?? null,
    user_link_id: body.UserLinkID ?? body.userLinkID ?? null,
    user_name: body.UserName ?? body.userName ?? null,
    business_id: body.BID ?? body.bid ?? null,
    first: body.First ?? body.first ?? null,
    last: body.Last ?? body.last ?? null,
    nickname: body.NickName ?? body.nickName ?? null,
    short_name: body.ShortName ?? body.shortName ?? null,
    long_name: body.LongName ?? body.longName ?? null,
    utc_offset: body.UtcOffset ?? body.utcOffset ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Admin access is required.' }, { status: 403 });
    }

    const action = cleanText(body?.action, 80).toLowerCase() || 'status';
    const subscriptionKey = String(secrets.get(SECRET_NAME) || '').trim();

    if (action === 'status') {
      return Response.json({
        success: true,
        configured: !!subscriptionKey,
        read_only: true,
        secret_name: SECRET_NAME,
        api_version: API_VERSION,
        allowed_routes: Object.keys(ROUTES),
        capabilities: capabilitySummary(),
        missing_reference_specs: ['configuration'],
      });
    }

    if (!subscriptionKey) {
      return Response.json({
        error: `CoreBridge API is not configured. Add the ${SECRET_NAME} app secret before testing the connection.`,
        configured: false,
      }, { status: 503 });
    }

    if (action === 'test_connection') {
      const [validate, apiStatus] = await Promise.all([
        corebridgeGet(base44, actor, 'account_validate', subscriptionKey),
        corebridgeGet(base44, actor, 'status_api', subscriptionKey),
      ]);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        account_validate_http_status: validate.status,
        api_server_http_status: apiStatus.status,
        api_server_version: typeof apiStatus.body === 'string' || typeof apiStatus.body === 'number' ? apiStatus.body : apiStatus.body ?? null,
      });
    }

    if (action === 'account_summary') {
      const result = await corebridgeGet(base44, actor, 'account', subscriptionKey);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        account: accountSummary(result.body),
      });
    }

    if (action === 'service_status') {
      const requested = cleanText(body?.service, 80) as keyof typeof ROUTES;
      if (!requested || !requested.startsWith('status_') || !(requested in ROUTES)) {
        return Response.json({ error: 'Invalid CoreBridge status service.' }, { status: 400 });
      }
      const result = await corebridgeGet(base44, actor, requested, subscriptionKey);
      return Response.json({
        success: true,
        configured: true,
        read_only: true,
        service: requested,
        http_status: result.status,
        version: result.body,
      });
    }

    return Response.json({ error: 'Invalid CoreBridge API action.' }, { status: 400 });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    const safeStatus = [400, 401, 403, 429, 502, 503].includes(status) ? status : 500;
    console.error('corebridgeApiAction error:', (error as any)?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'CoreBridge API request could not be completed safely.' : (error as any)?.message,
    }, { status: safeStatus });
  }
});
