import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const clientId = secrets.get('BOUNCIE_CLIENT_ID');
    if (!clientId) return Response.json({ error: 'BOUNCIE_CLIENT_ID not set' }, { status: 500 });

    const url = new URL(req.url);
    const redirectUri = `${url.origin}/functions/bouncieAuthCallback`;
    const state = crypto.randomUUID();

    const authUrl = new URL('https://auth.bouncie.com/dialog/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return Response.json({ authUrl: authUrl.toString(), state, redirectUri });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}