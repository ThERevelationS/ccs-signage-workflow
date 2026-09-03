import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';

const EVENT_CATEGORY = {
  tripStart: 'drive', tripEnd: 'drive', tripData: 'drive', tripMetrics: 'drive',
  mil: 'care', battery: 'vehicle',
  connect: 'vehicle', disconnect: 'vehicle', vinChange: 'vehicle',
  userGeozone: 'drive', applicationGeozone: 'drive'
};

function buildNotification(event) {
  const eventType = event.eventType;
  const vin = event.vin;
  const imei = event.imei;
  const payload = event[eventType] || {};
  const ts = payload.timestamp || new Date().toISOString();
  const category = EVENT_CATEGORY[eventType] || 'vehicle';
  let title = '';
  let description = '';
  let severity = 'info';

  if (eventType === 'mil') {
    title = 'Check engine light is on';
    description = payload.codes || 'MIL on';
    severity = 'warning';
  } else if (eventType === 'battery') {
    title = `Battery ${payload.value}`;
    description = `Battery level is ${payload.value}`;
    severity = payload.value === 'critical' ? 'critical' : 'warning';
  } else if (eventType === 'connect') {
    title = 'Bouncie device reconnected';
    description = 'Device reconnected';
    severity = 'info';
  } else if (eventType === 'disconnect') {
    title = 'Bouncie device disconnected';
    description = 'Device lost power / was unplugged';
    severity = 'warning';
  } else if (eventType === 'tripStart') {
    title = 'Trip started';
    description = `Odometer: ${payload.odometer || ''}`;
    severity = 'info';
  } else if (eventType === 'tripEnd') {
    title = 'Trip ended';
    description = `Odometer: ${payload.odometer || ''}, Fuel consumed: ${payload.fuelConsumed || ''}`;
    severity = 'info';
  } else if (eventType === 'vinChange') {
    title = 'VIN changed';
    description = `${payload.oldVin || 'unknown'} → ${payload.newVin || ''}`;
    severity = 'info';
  } else if (eventType === 'userGeozone' || eventType === 'applicationGeozone') {
    title = `Geo-Zone ${payload.event || ''}: ${payload.name || ''}`;
    description = `Geo-Zone ${payload.name || ''} ${payload.event || ''}`;
    severity = 'info';
  } else {
    title = eventType;
    description = JSON.stringify(payload).slice(0, 200);
  }

  return {
    vehicle_vin: vin,
    vehicle_imei: imei,
    category,
    event_type: eventType,
    title,
    description,
    severity,
    timestamp: ts,
    is_read: false,
    raw_data: event
  };
}

export default async function(req) {
  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('X-Bouncie-Authorization') || '';
    const expectedKey = secrets.get('BOUNCIE_WEBHOOK_KEY') || '';
    if (expectedKey && authHeader !== expectedKey) {
      return Response.json({ error: 'Invalid webhook key' }, { status: 401 });
    }

    const event = await req.json();
    const base44 = createClientFromRequest(req);
    const notif = buildNotification(event);

    // Look up vehicle nickname from a cached vehicle record if available
    try {
      const vehicles = await base44.asServiceRole.entities.BouncieNotification.filter({ vehicle_vin: notif.vehicle_vin });
      // nickname backfill not stored separately; leave as-is
    } catch {}

    await base44.asServiceRole.entities.BouncieNotification.create(notif);

    // Allow key rotation via response header
    const headers = { 'Content-Type': 'application/json' };
    return Response.json({ received: true }, { headers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}