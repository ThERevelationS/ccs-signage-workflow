import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';

// Session-authenticated read gateway for Fleet entities. Direct entity reads
// are role-gated and staff sessions are EmailGate sessions — not Base44 app
// users — so staff can never satisfy entity RLS. Every staff-facing Fleet
// read flows through here instead: a valid sss_session_token is required and
// the whitelist preserves the intended per-entity access tier.
const STAFF_READABLE = new Set([
  'BouncieNotification',
  'BouncieVehicleLiveState',
  'FleetEquipment',
  'FleetEquipmentDocument',
  'FleetEquipmentLog',
  'FleetFluid',
  'FleetFuelEntry',
  'FleetInspection',
  'FleetInspectionTemplate',
  'FleetMaintenanceTask',
  'FleetMaintenanceWorkOrder',
  'FleetPart',
  'FleetPartFluidRequest',
  'FleetPartIdentification',
  'FleetReservation',
  'FleetVehicleMetadata',
  'FleetWarranty',
]);

const ADMIN_READABLE = new Set([
  'FleetMigrationAudit',
  'FleetNotificationQueue',
  'FleetOperationReceipt',
  'FleetRepairEstimate',
  'FleetSettings',
  'FleetSystemLog',
  'FleetSystemReport',
]);

const MAX_LIMIT = 500;
const MAX_SKIP = 100000;
const MAX_QUERY_BYTES = 4000;
const SORT_PATTERN = /^(-?[A-Za-z_][\w.]*)(\s*,\s*-?[A-Za-z_][\w.]*){0,3}$/;

function cleanSort(value: unknown) {
  const sort = String(value || '').trim();
  if (!sort) return '';
  if (sort.length > 200 || !SORT_PATTERN.test(sort)) {
    throw Object.assign(new Error('Fleet read sort is invalid.'), { status: 400 });
  }
  return sort;
}

function cleanQuery(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Fleet read filter must be an object.'), { status: 400 });
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$')) {
      throw Object.assign(new Error('Fleet read filter operators are not allowed at the top level.'), { status: 400 });
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw Object.assign(new Error('Fleet read filter must be JSON-serializable.'), { status: 400 });
  }
  if (serialized.length > MAX_QUERY_BYTES) {
    throw Object.assign(new Error('Fleet read filter is too large.'), { status: 400 });
  }
  return value;
}

function cleanLimit(value: unknown, fallback: number) {
  if (value == null || value === '') return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw Object.assign(new Error(`Fleet read limit must be between 1 and ${MAX_LIMIT}.`), { status: 400 });
  }
  return parsed;
}

function cleanSkip(value: unknown) {
  if (value == null || value === '') return 0;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SKIP) {
    throw Object.assign(new Error(`Fleet read offset must be between 0 and ${MAX_SKIP}.`), { status: 400 });
  }
  return parsed;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await resolveFleetStaffUser(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const entityName = String(body?.entity || '').trim();
    if (!STAFF_READABLE.has(entityName) && !ADMIN_READABLE.has(entityName)) {
      return Response.json({ error: 'This Fleet record type cannot be read here.' }, { status: 403 });
    }
    if (ADMIN_READABLE.has(entityName) && user.role !== 'admin') {
      return Response.json({ error: 'This Fleet record type requires a CCS admin.' }, { status: 403 });
    }

    const entity = base44.asServiceRole.entities[entityName];
    const id = String(body?.id || '').trim();
    if (id) {
      const item = await entity.get(id).catch(() => null);
      if (!item) return Response.json({ error: 'Fleet record not found.' }, { status: 404 });
      return Response.json({ success: true, item });
    }

    const query = cleanQuery(body?.query);
    const sort = cleanSort(body?.sort);
    const limit = cleanLimit(body?.limit, 100);
    const skip = cleanSkip(body?.skip);
    const items = query
      ? await entity.filter(query, sort || null, limit, skip)
      : await entity.list(sort || null, limit, skip);
    return Response.json({ success: true, items: Array.isArray(items) ? items : [] });
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if (status === 429 || /rate limit|too many requests/i.test(String(error?.message || ''))) {
      return Response.json({ error: 'Fleet data is busy. Try again shortly.', retry_after_ms: 3000 }, { status: 429, headers: { 'Retry-After': '3' } });
    }
    if ([400, 401, 403].includes(status)) {
      return Response.json({ error: error?.message || 'Fleet read failed.' }, { status });
    }
    console.error('fleetDataRead error:', error);
    return Response.json({ error: 'Fleet data could not be loaded. Try again.', detail: String(error?.message || error) }, { status: 500 });
  }
});