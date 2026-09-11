import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { normalizeWebhookEvent, applyLiveState, patchConnection, milSemanticState } from '../../shared/bouncie.ts';

const SEMANTIC_TRIP_EVENTS = new Set(['tripStart', 'tripEnd', 'tripMetrics']);

const canonical = (rows = []) => rows.slice().sort((a,b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function findNotificationContenders(Notification, normalized, vin, event) {
  const exact = await Notification.filter({ event_key: normalized.eventKey });
  if (exact?.length) return exact || [];

  if (normalized.eventType === 'mil') {
    const recent = await Notification.filter({ vehicle_vin: vin, event_type: 'mil' }, '-timestamp', 25);
    const latest = (recent || []).slice().sort((a,b) => {
      const at = Date.parse(a?.timestamp || a?.created_date || '') || 0;
      const bt = Date.parse(b?.timestamp || b?.created_date || '') || 0;
      if (at !== bt) return bt - at;
      return String(b?.id || '').localeCompare(String(a?.id || ''));
    })[0] || null;
    if (!latest) return [];
    const incomingState = milSemanticState(normalized?.payload || {});
    const priorState = milSemanticState(latest);
    if (!incomingState.known || !priorState.known || incomingState.on !== priorState.on) return [];
    // While the MIL remains ON, a generic stats snapshot never supersedes richer
    // webhook DTC detail. A genuinely different non-empty DTC set is still a new event.
    if (incomingState.on) {
      if (!incomingState.codes.length) return [latest];
      if (!priorState.codes.length) return [];
      return incomingState.signature === priorState.signature ? [latest] : [];
    }
    // Repeated OFF/cleared events are the same state transition until MIL turns on again.
    return [latest];
  }

  if (!SEMANTIC_TRIP_EVENTS.has(normalized.eventType)) return [];
  // Some Bouncie retry/normalization paths can report the same trip boundary with a
  // corrected measurement. Treat transactionId + VIN + type + timestamp as the stable
  // event identity; payload measurements such as odometer are event data, not identity.
  const candidates = await Notification.filter({
    vehicle_vin: vin,
    event_type: normalized.eventType,
    timestamp: normalized.timestamp,
  });
  const incomingTransactionId = String(event?.transactionId || normalized?.payload?.transactionId || '').trim();
  if (!incomingTransactionId) return candidates || [];
  return (candidates || []).filter((row) => String(row?.raw_data?.transactionId || row?.raw_data?.[row?.event_type]?.transactionId || '').trim() === incomingTransactionId);
}

export default async function(req) {
  try {
    const providedKey =
      req.headers.get('X-Bouncie-Authorization') ||
      req.headers.get('Authorization') ||
      '';
    const expectedKey = secrets.get('BOUNCIE_WEBHOOK_KEY') || '';
    if (!expectedKey) {
      console.error('bouncieWebhook: BOUNCIE_WEBHOOK_KEY is not configured.');
      return Response.json({ error: 'Webhook authentication is not configured.' }, { status: 503 });
    }

    const normalizedProvidedKey = providedKey.replace(/^Bearer\s+/i, '');
    if (!normalizedProvidedKey || normalizedProvidedKey !== expectedKey) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await req.json().catch(() => null);
    if (!event || !event.eventType) {
      // 2xx-adjacent 400: malformed body will never succeed on retry.
      return Response.json({ error: 'Malformed payload' }, { status: 400 });
    }

    // Bouncie sends its webhook key in Authorization, which is not a Base44 bearer
    // token — strip it so the SDK client initializes as an unauthenticated service caller.
    const cleanHeaders = new Headers(req.headers);
    cleanHeaders.delete('Authorization');
    cleanHeaders.delete('X-Bouncie-Authorization');
    const base44 = createClientFromRequest(new Request(req.url, { method: 'POST', headers: cleanHeaders }));

    const normalized = normalizeWebhookEvent(event);
    const vin = event.vin || '';

    let duplicate = false;
    if (normalized.createNotification && vin) {
      const Notification = base44.asServiceRole.entities.BouncieNotification;
      const existing = await findNotificationContenders(Notification, normalized, vin, event);
      duplicate = !!(existing && existing.length);

      if (!duplicate) {
        const created = await Notification.create({
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

        // Collapse only concurrent deliveries of this same event. Historical rows are never scanned or rewritten.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const contenders = await findNotificationContenders(Notification, normalized, vin, event);
        const winner = canonical(contenders) || created;
        duplicate = (contenders || []).length > 1;
        for (const contender of contenders || []) {
          if (contender.id !== winner.id) {
            await Notification.delete(contender.id).catch(() => null);
          }
        }
      }
    }

    // Live map state for trip telemetry (bounded path buffer). A cache failure must
    // never cause Bouncie to retry an otherwise valid webhook, but it must be visible
    // to Fleet admins instead of disappearing silently.
    try {
      await applyLiveState(base44, event, normalized);
    } catch (error) {
      console.error('bouncieWebhook live-state update failed:', error);
      await base44.asServiceRole.entities.FleetSystemLog.create({
        source: 'bouncieWebhook',
        level: 'warning',
        message: 'Bouncie webhook was accepted but Fleet live-state cache update failed.',
        details: {
          event_type: normalized.eventType,
          vin,
          timestamp: normalized.timestamp,
          error: error?.message || String(error),
        },
      }).catch(() => null);
    }

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