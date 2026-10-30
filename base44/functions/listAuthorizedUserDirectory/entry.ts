import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

function cleanText(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value: unknown) {
  return cleanText(value, 320).toLowerCase();
}

function directoryUser(row: any) {
  return {
    id: cleanText(row?.id, 200),
    email: cleanEmail(row?.email),
    full_name: cleanText(row?.full_name, 500),
    sales_roles: Array.isArray(row?.sales_roles)
      ? row.sales_roles.map((role: unknown) => cleanText(role, 100)).filter(Boolean)
      : [],
  };
}

Deno.serve(async (req) => {
  try {
    // One quick server-side retry at most: longer backoff belongs to the
    // browser, which honors Retry-After and coordinates every open request.
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);

    const rows = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.AuthorizedEmail,
      sort: 'full_name',
      label: 'Authorized user directory',
    });

    const users = rows
      .map(directoryUser)
      .filter((row: any) => row.id && row.email);

    return Response.json({
      success: true,
      viewer: {
        id: cleanText(actor?.id, 200),
        email: cleanEmail(actor?.email),
        role: actor?.role === 'admin' ? 'admin' : 'user',
        can_view_resources: actor?.role === 'admin' || actor?.can_view_resources === true,
      },
      users,
    });
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    // A platform rate limit is transient: hand it back as 429 so the browser
    // backs off instead of retrying a deterministic 500 in a tight loop.
    if (status === 429 || /rate limit|too many requests/i.test(String(error?.message || ''))) {
      return Response.json(
        { error: 'The authorized user directory is busy. Try again shortly.', retry_after_ms: 3000 },
        { status: 429, headers: { 'Retry-After': '3' } },
      );
    }
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('listAuthorizedUserDirectory error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500
        ? 'The authorized user directory could not be loaded safely.'
        : error?.message,
    }, { status: safeStatus });
  }
});