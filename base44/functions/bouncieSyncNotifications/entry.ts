import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi } from '../../shared/bouncie.ts';

// Evaluates CCS-local fleet alert rules against Bouncie vehicle stats.
// Everything created here is marked source:'ccs' — these are NOT Bouncie's own notifications.

function ruleFor(settings, vin, key) {
  const vehicleRule = settings.find((s) => s.scope === 'vehicle' && s.vehicle_vin === vin && s.rule_key === key);
  if (vehicleRule) return vehicleRule;
  return settings.find((s) => s.scope === 'global' && s.rule_key === key) || null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const vehiclesRaw = await callBouncieApi(base44, 'GET', '/v1/vehicles');
    const vehicles = Array.isArray(vehiclesRaw) ? vehiclesRaw : vehiclesRaw?.data || [];

    let settings = [];
    try { settings = await base44.asServiceRole.entities.FleetAlertSetting.list(); } catch {}
    settings = settings || [];

    const pending = [];

    const push = (v, { key, category, eventType, title, description, severity, stamp, source, raw }) => {
      pending.push({
        vehicle_vin: v.vin,
        vehicle_imei: v.imei || '',
        vehicle_nickname: v.nickName || v.model?.name || 'Vehicle',
        category,
        event_type: eventType,
        source: source || 'ccs',
        event_key: `${source || 'ccs'}|${v.vin}|${key}|${stamp}`,
        title,
        description,
        severity,
        timestamp: stamp,
        is_read: false,
        raw_data: raw || {}
      });
    };

    for (const v of vehicles) {
      if (!v.vin) continue;
      const stats = v.stats || {};
      const nickname = v.nickName || v.model?.name || 'Vehicle';
      const mil = stats.mil || {};
      const battery = mil.battery || {};

      // --- Bouncie-reported vehicle health (mirrors what Bouncie itself reports) ---
      if (mil.milOn) {
        const stamp = mil.lastUpdated || new Date().toISOString();
        const dtcs = mil.qualifiedDtcList || [];
        if (dtcs.length === 0) {
          push(v, {
            key: 'mil', category: 'care', eventType: 'mil', source: 'bouncie',
            title: `${nickname}'s check engine light is on`,
            description: 'Malfunction indicator lamp is on', severity: 'warning', stamp,
            raw: { mil }
          });
        }
        for (const dtc of dtcs) {
          const names = Array.isArray(dtc.name) ? dtc.name.join(', ') : dtc.name || '';
          push(v, {
            key: `mil-${dtc.code}`, category: 'care', eventType: 'mil', source: 'bouncie',
            title: `${nickname}'s check engine light is on`,
            description: `${dtc.code} — ${names}`, severity: 'warning', stamp, raw: dtc
          });
        }
      }

      if (battery.status === 'low' || battery.status === 'critical') {
        const rule = ruleFor(settings, v.vin, 'battery');
        if (!rule || rule.enabled !== false) {
          push(v, {
            key: `battery-${battery.status}`, category: 'vehicle', eventType: 'battery', source: 'bouncie',
            title: `${nickname}'s battery is ${battery.status}`,
            description: `Battery status reported as ${battery.status}`,
            severity: battery.status === 'critical' ? 'critical' : 'warning',
            stamp: battery.lastUpdated || new Date().toISOString(), raw: battery
          });
        }
      }

      // --- CCS-local threshold rules ---
      const fuelRule = ruleFor(settings, v.vin, 'fuel_level');
      const fuelThreshold = fuelRule?.threshold ?? 25;
      if (fuelRule?.enabled && typeof stats.fuelLevel === 'number' && stats.fuelLevel <= fuelThreshold) {
        push(v, {
          key: `fuel-${Math.round(stats.fuelLevel)}`, category: 'drive', eventType: 'fuel_level',
          title: `${nickname} is low on fuel (${Math.round(stats.fuelLevel)}%)`,
          description: `CCS alert rule: fuel at or below ${fuelThreshold}%`,
          severity: 'warning',
          stamp: stats.lastUpdated || new Date().toISOString(),
          raw: { fuelLevel: stats.fuelLevel, threshold: fuelThreshold }
        });
      }

      const speedRule = ruleFor(settings, v.vin, 'speed');
      if (speedRule?.enabled && speedRule.threshold > 0 && typeof stats.speed === 'number' && stats.speed > speedRule.threshold) {
        push(v, {
          key: `speed-${Math.round(stats.speed)}-${stats.lastUpdated || ''}`, category: 'drive', eventType: 'speed',
          title: `${nickname} exceeded ${speedRule.threshold} mph`,
          description: `CCS alert rule: reported speed ${Math.round(stats.speed)} mph`,
          severity: 'warning',
          stamp: stats.lastUpdated || new Date().toISOString(),
          raw: { speed: stats.speed, threshold: speedRule.threshold }
        });
      }
    }

    // De-duplicate against what already exists, by deterministic event_key.
    let created = 0;
    for (const n of pending) {
      const existing = await base44.asServiceRole.entities.BouncieNotification.filter({ event_key: n.event_key });
      if (existing && existing.length) continue;
      await base44.asServiceRole.entities.BouncieNotification.create(n);
      created++;
    }

    return Response.json({ synced: true, vehicles: vehicles.length, created });
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