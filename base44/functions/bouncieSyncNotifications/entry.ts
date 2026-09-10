import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi } from '../../shared/bouncie.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

// Durable CCS-local alert evaluation against Bouncie vehicle stats.
// Bouncie remains the owner of tracking/webhooks/native alert configuration.
// Notifications created here are snapshots/CCS-local threshold alerts only.

const nowIso = () => new Date().toISOString();
const SUCCESS_HEARTBEAT_MS = 6 * 60 * 60 * 1000;
const ERROR_HEARTBEAT_MS = 30 * 60 * 1000;

async function maybeLogSync(base44, level, message, details = {}) {
  const rows = await base44.asServiceRole.entities.FleetSystemLog.filter({ source: 'bouncieSyncNotifications' }, '-created_date', 1).catch(() => []);
  const last = rows?.[0] || null;
  const lastAt = Date.parse(last?.created_date || '') || 0;
  const minInterval = level === 'error' ? ERROR_HEARTBEAT_MS : SUCCESS_HEARTBEAT_MS;
  const changedLevel = last?.level !== level;
  if (!lastAt || changedLevel || Date.now() - lastAt >= minInterval) {
    await base44.asServiceRole.entities.FleetSystemLog.create({
      source: 'bouncieSyncNotifications',
      level,
      message,
      details,
    }).catch(() => null);
  }
}

const canonical = (rows = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

function ruleFor(settings, vin, key) {
  const vehicleRule = settings.find((s) => s.scope === 'vehicle' && s.vehicle_vin === vin && s.rule_key === key);
  if (vehicleRule) return vehicleRule;
  return settings.find((s) => s.scope === 'global' && s.rule_key === key) || null;
}

function observationStamp(stats) {
  const explicit = String(stats?.lastUpdated || '').trim();
  if (explicit && Number.isFinite(Date.parse(explicit))) return explicit;
  const bucket = Math.floor(Date.now() / 60000) * 60000;
  return new Date(bucket).toISOString();
}

function notificationFor(v, { key, category, eventType, title, description, severity, stamp, source, raw }) {
  return {
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
    raw_data: raw || {},
  };
}

async function ensureNotification(Notification, record) {
  const existing = canonical(await Notification.filter({ event_key: record.event_key }));
  if (existing) return { row: existing, created: false };

  const created = await Notification.create(record);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const contenders = await Notification.filter({ event_key: record.event_key });
  const winner = canonical(contenders) || created;
  for (const duplicate of contenders || []) {
    if (duplicate.id !== winner.id) await Notification.delete(duplicate.id).catch(() => null);
  }
  return { row: winner, created: winner.id === created.id };
}

async function loadRuntime(Runtime, stateKey) {
  const rows = await Runtime.filter({ state_key: stateKey });
  const winner = canonical(rows);
  if (winner && rows.length > 1) {
    for (const duplicate of rows) {
      if (duplicate.id !== winner.id) await Runtime.delete(duplicate.id).catch(() => null);
    }
  }
  return winner;
}

async function upsertRuntime(Runtime, stateKey, base, patch) {
  let row = await loadRuntime(Runtime, stateKey);
  if (row) return Runtime.update(row.id, patch);

  const created = await Runtime.create({ ...base, ...patch });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const contenders = await Runtime.filter({ state_key: stateKey });
  const winner = canonical(contenders) || created;
  for (const duplicate of contenders || []) {
    if (duplicate.id !== winner.id) await Runtime.delete(duplicate.id).catch(() => null);
  }
  if (winner.id !== created.id) row = await Runtime.update(winner.id, patch);
  else row = winner;
  return row;
}

async function evaluateThreshold({ Runtime, Notification, vehicle, stats, ruleKey, rule, value, breached, makeAlert }) {
  const vin = String(vehicle?.vin || '').trim().toUpperCase();
  if (!vin) return 0;
  const stateKey = `${vin}:${ruleKey}`;
  const state = await loadRuntime(Runtime, stateKey);
  const numericValue = Number(value);
  const observed = Number.isFinite(numericValue);
  const threshold = Number(rule?.threshold);
  const enabled = rule?.enabled === true && Number.isFinite(threshold) && threshold > 0;
  const stamp = observationStamp(stats);

  if (!enabled) {
    if (state?.breached) {
      await Runtime.update(state.id, {
        breached: false,
        threshold: Number.isFinite(threshold) ? threshold : state.threshold,
        cleared_at: nowIso(),
        last_observed_at: stamp,
        ...(observed ? { last_observed_value: numericValue } : {}),
      });
    }
    return 0;
  }

  // Missing telemetry is not evidence of recovery; preserve the prior breach state.
  if (!observed) return 0;

  const isBreached = breached(numericValue, threshold);
  if (isBreached && !state?.breached) {
    const alert = makeAlert({ value: numericValue, threshold, stamp });
    const ensured = await ensureNotification(Notification, notificationFor(vehicle, alert));
    await upsertRuntime(Runtime, stateKey, {
      state_key: stateKey,
      vehicle_vin: vin,
      rule_key: ruleKey,
      breached: false,
    }, {
      breached: true,
      threshold,
      last_observed_value: numericValue,
      last_observed_at: stamp,
      breached_at: stamp,
      last_notification_key: ensured.row.event_key,
    });
    return ensured.created ? 1 : 0;
  }

  if (!isBreached && state?.breached) {
    await Runtime.update(state.id, {
      breached: false,
      threshold,
      last_observed_value: numericValue,
      last_observed_at: stamp,
      cleared_at: stamp,
    });
    return 0;
  }

  if (state && (Number(state.last_observed_value) !== numericValue || Number(state.threshold) !== threshold)) {
    await Runtime.update(state.id, {
      threshold,
      last_observed_value: numericValue,
      last_observed_at: stamp,
    });
  }
  return 0;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vehiclesRaw = await callBouncieApi(base44, 'GET', '/v1/vehicles');
    const vehicles = Array.isArray(vehiclesRaw) ? vehiclesRaw : vehiclesRaw?.data || [];

    let settings = [];
    try { settings = await loadAllEntityRows({ entity: base44.asServiceRole.entities.FleetAlertSetting, sort: '-created_date', label: 'Fleet Bouncie alert rules' }); } catch {}
    settings = settings || [];

    const Notification = base44.asServiceRole.entities.BouncieNotification;
    const Runtime = base44.asServiceRole.entities.FleetAlertRuntimeState;
    const pending = [];
    let created = 0;

    for (const v of vehicles) {
      if (!v.vin) continue;
      v.vin = String(v.vin).trim().toUpperCase();
      const stats = v.stats || {};
      const nickname = v.nickName || v.model?.name || 'Vehicle';
      const mil = stats.mil || {};
      const battery = mil.battery || {};

      // Bouncie-reported health snapshots. These do not modify Bouncie settings.
      if (mil.milOn) {
        const stamp = mil.lastUpdated || observationStamp(stats);
        const dtcs = mil.qualifiedDtcList || [];
        if (dtcs.length === 0) {
          pending.push(notificationFor(v, {
            key: 'mil', category: 'care', eventType: 'mil', source: 'bouncie',
            title: `${nickname}'s check engine light is on`,
            description: 'Malfunction indicator lamp is on', severity: 'warning', stamp,
            raw: { mil },
          }));
        }
        for (const dtc of dtcs) {
          const names = Array.isArray(dtc.name) ? dtc.name.join(', ') : dtc.name || '';
          pending.push(notificationFor(v, {
            key: `mil-${dtc.code}`, category: 'care', eventType: 'mil', source: 'bouncie',
            title: `${nickname}'s check engine light is on`,
            description: `${dtc.code} — ${names}`, severity: 'warning', stamp, raw: dtc,
          }));
        }
      }

      if (battery.status === 'low' || battery.status === 'critical') {
        const rule = ruleFor(settings, v.vin, 'battery');
        if (!rule || rule.enabled !== false) {
          pending.push(notificationFor(v, {
            key: `battery-${battery.status}`, category: 'vehicle', eventType: 'battery', source: 'bouncie',
            title: `${nickname}'s battery is ${battery.status}`,
            description: `Battery status reported as ${battery.status}`,
            severity: battery.status === 'critical' ? 'critical' : 'warning',
            stamp: battery.lastUpdated || observationStamp(stats), raw: battery,
          }));
        }
      }

      const fuelRule = ruleFor(settings, v.vin, 'fuel_level');
      created += await evaluateThreshold({
        Runtime, Notification, vehicle: v, stats, ruleKey: 'fuel_level', rule: fuelRule,
        value: stats.fuelLevel,
        breached: (value, threshold) => value <= threshold,
        makeAlert: ({ value, threshold, stamp }) => ({
          key: `fuel-threshold-${threshold}`, category: 'drive', eventType: 'fuel_level', source: 'ccs',
          title: `${nickname} is low on fuel (${Math.round(value)}%)`,
          description: `CCS alert rule: fuel at or below ${threshold}%`, severity: 'warning', stamp,
          raw: { fuelLevel: value, threshold },
        }),
      });

      const speedRule = ruleFor(settings, v.vin, 'speed');
      created += await evaluateThreshold({
        Runtime, Notification, vehicle: v, stats, ruleKey: 'speed', rule: speedRule,
        value: stats.speed,
        breached: (value, threshold) => value > threshold,
        makeAlert: ({ value, threshold, stamp }) => ({
          key: `speed-threshold-${threshold}`, category: 'drive', eventType: 'speed', source: 'ccs',
          title: `${nickname} exceeded ${threshold} mph`,
          description: `CCS alert rule: reported speed ${Math.round(value)} mph`, severity: 'warning', stamp,
          raw: { speed: value, threshold },
        }),
      });
    }

    for (const record of pending) {
      const result = await ensureNotification(Notification, record);
      if (result.created) created++;
    }

    await maybeLogSync(base44, 'info', 'Fleet Bouncie alert sync heartbeat.', {
      vehicles: vehicles.length,
      created,
      configured_rules: settings.filter((row) => row?.enabled === true).length,
    });
    return Response.json({ synced: true, vehicles: vehicles.length, created });
  } catch (error) {
    const base44 = createClientFromRequest(req);
    await maybeLogSync(base44, 'error', 'Fleet Bouncie alert sync failed.', {
      error: error?.message || String(error),
    }).catch(() => null);
    if (error.message === 'BOUNCIE_NOT_CONNECTED') {
      return Response.json({ error: 'Bouncie is not connected.' }, { status: 400 });
    }
    if (error.message === 'BOUNCIE_REAUTH_REQUIRED') {
      return Response.json({ error: 'The Bouncie connection needs to be renewed.' }, { status: 401 });
    }
    console.error('bouncieSyncNotifications error:', error);
    return Response.json({ error: error.message || 'Bouncie notification sync failed.' }, { status: 502 });
  }
}
