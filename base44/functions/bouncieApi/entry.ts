import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi, isAllowedRead, isAllowedAdminWrite } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const method = String(body.method || 'GET').toUpperCase();
    const path = body.path;
    const { query, body: reqBody } = body;

    if (!path || typeof path !== 'string' || !path.startsWith('/v1/')) {
      return Response.json({ error: 'A valid Bouncie API path is required.' }, { status: 400 });
    }

    const isAdmin = user.role === 'admin';

    if (method === 'GET') {
      if (!isAllowedRead(path)) {
        return Response.json({ error: 'This Bouncie endpoint is not available.' }, { status: 403 });
      }
      // Webhook configuration is administrative even for reads.
      if (path.startsWith('/v1/webhooks') && !isAdmin) {
        return Response.json({ error: 'Administrator access required.' }, { status: 403 });
      }
    } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!isAdmin) {
        return Response.json({ error: 'Administrator access required for this operation.' }, { status: 403 });
      }
      if (!isAllowedAdminWrite(path)) {
        return Response.json({ error: 'This Bouncie endpoint is not writable from this app.' }, { status: 403 });
      }
    } else {
      return Response.json({ error: 'Unsupported method.' }, { status: 405 });
    }

    const data = await callBouncieApi(base44, method, path, { query, body: reqBody });
    return Response.json({ data });
  } catch (error) {
    if (error.message === 'BOUNCIE_NOT_CONNECTED') {
      return Response.json({ error: 'Bouncie is not connected.', code: 'not_connected' }, { status: 400 });
    }
    if (error.message === 'BOUNCIE_REAUTH_REQUIRED') {
      return Response.json({ error: 'The Bouncie connection needs to be renewed.', code: 'reauth_required' }, { status: 401 });
    }
    return Response.json({ error: error.message, code: 'api_error' }, { status: error.status && error.status < 500 ? error.status : 502 });
  }
}