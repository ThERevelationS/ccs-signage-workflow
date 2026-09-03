import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { normalizeWebhookEvent, applyLiveState, patchConnection } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const providedKey =
      req.headers.get('X-Bouncie-Authorization') ||
      req.headers.get('Authorization') ||
      '';
    const expectedKey = secrets.get('BOUNCIE_WEBHOOK_KEY') || '';

    if (expectedKey && providedKey.replace(/^Bearer\s+/i, '') !== expectedKey) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await req.json().catch(() => null);
    if (!event || !event.eventType) {
      // 2xx-adjacent 400: malformed body will never succeed on retry.
      return Response.json({ error: 'Malformed payload' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const normalized = normalizeWebhookEvent(event);
    const vin = event.vin || '';

    let duplicate = false;
    if (normalized.createNotification && vin) {
      const existing = await base44.asServiceRole.entities.BouncieNotification.filter({
        event_key: normalized.eventKey
      });
      duplicate = !!(existing && existing.length);

      if (!duplicate) {
        await base44.asServiceRole.entities.BouncieNotification.create({
          vehicle_vin: vin,
          vehicle_imei: event.imei || '',
          category: normalized.category,
          event_type: normalized.eventType,
          source: 'bouncie',
          event_key: normalized.eventKey,
          title: normalized.title,
          description: normalized.description,
          severity: normalized.severity,
          timestamp: normalized.timestamp,
          is_read: false,
          raw_data: event
        });
      }
    }

    // Live map state for trip telemetry (bounded path buffer).
    try { await applyLiveState(base44, event, normalized); } catch {}

    try {
      await patchConnection(base44, {
        last_webhook_at: new Date().toISOString(),
        last_webhook_event: normalized.eventType
      });
    } catch {}

    // Always 2xx on a valid, authenticated event so Bouncie does not retry.
    return Response.json({ received: true, duplicate, eventType: normalized.eventType });
  } catch (error) {
    return Response.json({ error: 'Processing error' }, { status: 500 });
  }
}