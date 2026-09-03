import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { upsertWebhook } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Administrator access required.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const origin = body.origin || new URL(req.url).origin;

    const result = await upsertWebhook(base44, origin);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error.message === 'BOUNCIE_NOT_CONNECTED') {
      return Response.json({ error: 'Bouncie is not connected.' }, { status: 400 });
    }
    if (error.message === 'BOUNCIE_REAUTH_REQUIRED') {
      return Response.json({ error: 'The Bouncie connection needs to be renewed.' }, { status: 401 });
    }
    return Response.json({ error: error.message }, { status: 502 });
  }
}