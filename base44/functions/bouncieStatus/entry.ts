import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { getActiveConnection, callBouncieApi, WEBHOOK_EVENTS } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const conn = await getActiveConnection(base44);
    if (!conn) return Response.json({ connected: false, isAdmin });

    const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;

    const base = {
      connected: true,
      isAdmin,
      needsReconnect: !!conn.needs_reconnect,
      connectedEmail: conn.user_email || '',
      connectedName: conn.user_name || '',
      connectedAt: conn.connected_at || null
    };

    if (!isAdmin) return Response.json(base);

    // Admin diagnostics — never includes tokens, secrets or the webhook key.
    let apiHealthy = false;
    let apiError = '';
    try {
      await callBouncieApi(base44, 'GET', '/v1/user');
      apiHealthy = true;
    } catch (e) {
      apiError = e.message === 'BOUNCIE_REAUTH_REQUIRED'
        ? 'Bouncie rejected the stored credentials — reconnection required.'
        : 'Bouncie API request failed.';
    }

    return Response.json({
      ...base,
      connectedBy: conn.connected_by || '',
      tokenExpiresAt: conn.expires_at || null,
      tokenValid: expiresAt > Date.now() && !conn.needs_reconnect,
      apiHealthy,
      apiError,
      lastSyncAt: conn.last_sync_at || null,
      lastError: conn.last_error || '',
      lastErrorAt: conn.last_error_at || null,
      lastWebhookAt: conn.last_webhook_at || null,
      lastWebhookEvent: conn.last_webhook_event || '',
      webhookConfigured: !!conn.webhook_id,
      webhookActive: !!conn.webhook_active,
      webhookUrl: conn.webhook_url || '',
      webhookEvents: conn.webhook_events || [],
      webhookCheckedAt: conn.webhook_checked_at || null,
      webhookError: conn.webhook_error || '',
      expectedWebhookEvents: WEBHOOK_EVENTS
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}