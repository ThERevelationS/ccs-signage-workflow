import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi } from '../../shared/bouncie.ts';

async function findExisting(base44, vin, title, description) {
  const query = { vehicle_vin: vin, title };
  if (description) query.description = description;
  const existing = await base44.asServiceRole.entities.BouncieNotification.filter(query);
  return existing && existing.length > 0;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const vehicles = await callBouncieApi(base44, 'GET', '/v1/vehicles');
    let created = 0;

    for (const v of vehicles) {
      const vin = v.vin;
      const nickname = v.nickName || (v.model ? v.model.name : 'Vehicle');
      const imei = v.imei;
      const stats = v.stats || {};

      // MIL / check engine codes
      if (stats.mil && stats.mil.milOn) {
        const codes = stats.mil.qualifiedDtcList || [];
        if (codes.length === 0) {
          const title = `${nickname}'s check engine light is on`;
          if (!(await findExisting(base44, vin, title, ''))) {
            await base44.asServiceRole.entities.BouncieNotification.create({
              vehicle_vin: vin, vehicle_imei: imei, vehicle_nickname: nickname,
              category: 'care', event_type: 'mil',
              title, description: 'Check engine light is on', severity: 'warning',
              timestamp: stats.mil.lastUpdated || new Date().toISOString(),
              is_read: false, raw_data: { mil: stats.mil }
            });
            created++;
          }
        }
        for (const dtc of codes) {
          const title = `${nickname}'s check engine light is on`;
          const desc = `${dtc.code} - ${(dtc.name || []).join(', ')}`;
          if (!(await findExisting(base44, vin, title, desc))) {
            await base44.asServiceRole.entities.BouncieNotification.create({
              vehicle_vin: vin, vehicle_imei: imei, vehicle_nickname: nickname,
              category: 'care', event_type: 'mil',
              title, description: desc, severity: 'warning',
              timestamp: stats.mil.lastUpdated || new Date().toISOString(),
              is_read: false, raw_data: dtc
            });
            created++;
          }
        }
      }

      // Battery
      const battery = stats.mil && stats.mil.battery;
      if (battery && (battery.status === 'low' || battery.status === 'critical')) {
        const title = `The battery level for ${nickname} is low`;
        const desc = `Battery status: ${battery.status}`;
        if (!(await findExisting(base44, vin, title, desc))) {
          await base44.asServiceRole.entities.BouncieNotification.create({
            vehicle_vin: vin, vehicle_imei: imei, vehicle_nickname: nickname,
            category: 'vehicle', event_type: 'battery',
            title, description: desc, severity: battery.status === 'critical' ? 'critical' : 'warning',
            timestamp: battery.lastUpdated || new Date().toISOString(),
            is_read: false, raw_data: battery
          });
          created++;
        }
      }

      // Fuel
      if (typeof stats.fuelLevel === 'number' && stats.fuelLevel <= 25) {
        const title = `Fuel Warning ${nickname} has ${Math.round(stats.fuelLevel)}% fuel left`;
        const desc = `Fuel level is at ${Math.round(stats.fuelLevel)}%`;
        if (!(await findExisting(base44, vin, title, desc))) {
          await base44.asServiceRole.entities.BouncieNotification.create({
            vehicle_vin: vin, vehicle_imei: imei, vehicle_nickname: nickname,
            category: 'drive', event_type: 'fuel',
            title, description: desc, severity: 'warning',
            timestamp: stats.lastUpdated || new Date().toISOString(),
            is_read: false, raw_data: { fuelLevel: stats.fuelLevel }
          });
          created++;
        }
      }
    }

    return Response.json({ synced: true, vehicles: vehicles.length, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}