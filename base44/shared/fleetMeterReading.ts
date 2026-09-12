const finiteNonNegative = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const normalizeVin = (value: unknown) => String(value ?? '').trim().toUpperCase();
const normalizeImei = (value: unknown) => String(value ?? '').trim();

export type FleetMeterReading = {
  available: boolean;
  value: number | null;
  unit: 'miles' | 'hours' | 'units';
  source: 'bouncie' | 'manual';
  recorded_at: string;
  reason: string;
};

export async function resolveFleetMeterReading(base44: any, equipment: any, rule: any): Promise<FleetMeterReading> {
  const source = String(rule?.source || 'manual');
  const meterType = String(rule?.meter_type || 'manual');
  const unit: FleetMeterReading['unit'] = meterType === 'engine_hours' ? 'hours' : meterType === 'odometer_miles' ? 'miles' : 'units';

  if (!equipment?.id) return { available: false, value: null, unit, source: source === 'bouncie' ? 'bouncie' : 'manual', recorded_at: '', reason: 'equipment_missing' };

  if (source === 'bouncie') {
    if (meterType !== 'odometer_miles') return { available: false, value: null, unit, source: 'bouncie', recorded_at: '', reason: 'bouncie_only_supports_odometer_miles' };
    if (!['matched','manual'].includes(String(equipment.bouncie_link_status || ''))) {
      return { available: false, value: null, unit, source: 'bouncie', recorded_at: '', reason: 'bouncie_link_not_definitive' };
    }
    const vin = normalizeVin(equipment.vin);
    const imei = normalizeImei(equipment.bouncie_imei);
    if (!vin || !imei) return { available: false, value: null, unit, source: 'bouncie', recorded_at: '', reason: 'bouncie_identity_incomplete' };
    const rows = await base44.asServiceRole.entities.BouncieVehicleLiveState.filter({ vehicle_vin: vin, vehicle_imei: imei });
    if (!rows?.length) return { available: false, value: null, unit, source: 'bouncie', recorded_at: '', reason: 'bouncie_live_state_missing' };
    if (rows.length !== 1) return { available: false, value: null, unit, source: 'bouncie', recorded_at: '', reason: 'bouncie_identity_ambiguous' };
    const value = finiteNonNegative(rows[0].odometer);
    if (value == null) return { available: false, value: null, unit, source: 'bouncie', recorded_at: rows[0].last_seen_at || rows[0].last_event_at || '', reason: 'bouncie_odometer_unavailable' };
    return { available: true, value, unit: 'miles', source: 'bouncie', recorded_at: rows[0].last_seen_at || rows[0].last_event_at || '', reason: '' };
  }

  const value = finiteNonNegative(equipment.mileage_hours);
  if (value == null) return { available: false, value: null, unit, source: 'manual', recorded_at: equipment.updated_date || '', reason: 'manual_meter_unavailable' };
  return { available: true, value, unit, source: 'manual', recorded_at: equipment.updated_date || '', reason: '' };
}

export function fleetMeterState(rule: any, reading: FleetMeterReading) {
  const nextDue = finiteNonNegative(rule?.next_due_value);
  const lead = finiteNonNegative(rule?.lead_value) ?? 0;
  if (!rule?.enabled) return { state: 'disabled', remaining: null, next_due_value: nextDue };
  if (!reading.available || reading.value == null || nextDue == null) return { state: 'unavailable', remaining: null, next_due_value: nextDue };
  const remaining = nextDue - reading.value;
  if (remaining <= 0) return { state: 'due', remaining, next_due_value: nextDue };
  if (remaining <= lead) return { state: 'due_soon', remaining, next_due_value: nextDue };
  return { state: 'ok', remaining, next_due_value: nextDue };
}
