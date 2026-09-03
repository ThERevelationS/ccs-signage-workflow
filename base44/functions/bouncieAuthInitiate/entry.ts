import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { appFunctionUrl } from '../../shared/bouncie.ts';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const clientId = (secrets.get('BOUNCIE_CLIENT_ID') || '').trim();
    if (!clientId) {
      return Response.json({ error: 'Bouncie client credentials are not configured. Set BOUNCIE_CLIENT_ID in app secrets.' }, { status: 500 });
    }

    // Always use the published app domain — the runtime's own origin and the
    // browser's window.location.origin (inside the builder preview) do not
    // match the redirect URI registered in the Bouncie Developer Portal.
    const redirectUri = appFunctionUrl('bouncieAuthCallback');

    // Cryptographically random, short-lived, one-time-use state.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    await base44.asServiceRole.entities.BouncieOAuthState.create({
      state,
      redirect_uri: redirectUri,
      initiated_by: user.email || '',
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      used: false
    });

    // Best-effort cleanup of expired state rows so the table stays small.
    try {
      const stale = await base44.asServiceRole.entities.BouncieOAuthState.filter({ used: true });
      const old = (stale || []).filter((s) => new Date(s.expires_at).getTime() < Date.now() - 86400000);
      for (const s of old.slice(0, 25)) {
        await base44.asServiceRole.entities.BouncieOAuthState.delete(s.id);
      }
    } catch {}

    const authUrl = new URL('https://auth.bouncie.com/dialog/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return Response.json({ authUrl: authUrl.toString(), redirectUri });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}