import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { method = 'GET', path, query, body: reqBody } = body;
    if (!path) return Response.json({ error: 'path is required' }, { status: 400 });

    const data = await callBouncieApi(base44, method, path, { query, body: reqBody });
    return Response.json({ data });
  } catch (error) {
    const status = error.message && error.message.includes('not connected') ? 400 : 500;
    return Response.json({ error: error.message }, { status });
  }
}