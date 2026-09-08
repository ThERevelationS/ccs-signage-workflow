import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROAD_TRACKING_STATUSES = new Set(['unlinked', 'matched', 'ambiguous', 'manual']);
const EQUIPMENT_TYPES = new Set(['car','truck','boom_lift','forklift','generator','excavator','bulldozer','crane','compressor','other']);
const EQUIPMENT_STATUSES = new Set(['operational','maintenance','down','retired']);

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Fleet equipment administration requires a CCS admin.' }, { status: 403 }) };
  return { user };
}

const normalizeVin = (value: unknown) => String(value || '').trim().toUpperCase();

const equipmentPatch = (source: any) => {
  const allowed = [
    'name','type','make','model','year','serial_number','vin','engine_details','status',
    'location','purchase_date','mileage_hours','last_service_date','next_service_due','photo_url','notes'
  ];
  const out: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
  if (Object.prototype.hasOwnProperty.call(out, 'vin')) out.vin = normalizeVin(out.vin) || null;
  if (Object.prototype.hasOwnProperty.call(out, 'serial_number')) out.serial_number = String(out.serial_number || '').trim();
  if (Object.prototype.hasOwnProperty.call(out, 'year')) out.year = out.year === '' || out.year == null ? undefined : Number(out.year);
  if (Object.prototype.hasOwnProperty.call(out, 'mileage_hours')) out.mileage_hours = out.mileage_hours === '' || out.mileage_hours == null ? undefined : Number(out.mileage_hours);
  return out;
};

async function evaluateBouncieLink(base44: any, vin: string, trackingApplicable: boolean) {
  if (!trackingApplicable) return { bouncie_link_status: 'not_applicable', bouncie_imei: null };
  if (!vin) return { bouncie_link_status: 'unlinked', bouncie_imei: null };
  const rows = await base44.asServiceRole.entities.BouncieVehicleLiveState.filter({ vehicle_vin: vin });
  const imeis = [...new Set((rows || []).map((row: any) => String(row.vehicle_imei || '').trim()).filter(Boolean))];
  if (imeis.length === 1) return { bouncie_link_status: 'matched', bouncie_imei: imeis[0] };
  if (imeis.length > 1) return { bouncie_link_status: 'ambiguous', bouncie_imei: null };
  return { bouncie_link_status: 'unlinked', bouncie_imei: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Metadata = base44.asServiceRole.entities.FleetVehicleMetadata;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Log = base44.asServiceRole.entities.FleetEquipmentLog;

    if (action === 'create') {
      const patch = equipmentPatch(body?.equipment || body);
      if (!String(patch.name || '').trim() || !EQUIPMENT_TYPES.has(String(patch.type || ''))) {
        return Response.json({ error: 'Equipment name and type are required.' }, { status: 400 });
      }
      if (patch.status && !EQUIPMENT_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid equipment status.' }, { status: 400 });
      const trackingApplicable = body?.tracking_applicable !== false;
      const link = await evaluateBouncieLink(base44, patch.vin || '', trackingApplicable);
      const created = await Equipment.create({ ...patch, status: patch.status || 'operational', ...link });
      return Response.json({ success: true, equipment: created, bouncie_link: link });
    }

    if (action === 'save_metadata') {
      const equipmentId = String(body?.equipment_id || '').trim();
      if (!equipmentId) return Response.json({ error: 'Fleet equipment id is required.' }, { status: 400 });
      const equipment = await Equipment.get(equipmentId);
      if (!equipment) return Response.json({ error: 'Fleet equipment not found.' }, { status: 404 });
      const vin = normalizeVin(equipment.vin || equipment.serial_number);
      if (!vin) return Response.json({ error: 'Vehicle metadata requires a VIN-linked Fleet equipment record.' }, { status: 409 });
      const allowed = ['license_plate','assigned_driver','department','unit_number','insurance_provider','insurance_policy_number','insurance_agent','insurance_agent_contact','insurance_effective_date','insurance_expiration_date','registration_expiration_date','maintenance_notes','notes'];
      const patch: any = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body?.metadata || {}, key)) patch[key] = body.metadata[key];
      const rows = await Metadata.filter({ vehicle_vin: vin });
      if (rows.length > 1) return Response.json({ error: 'Multiple FleetVehicleMetadata rows exist for this VIN. Resolve before editing.' }, { status: 409 });
      const saved = rows[0] ? await Metadata.update(rows[0].id, patch) : await Metadata.create({ vehicle_vin: vin, ...patch });
      return Response.json({ success: true, metadata: saved });
    }

    const id = String(body?.id || body?.equipment_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet equipment id is required.' }, { status: 400 });
    const existing = await Equipment.get(id);
    if (!existing) return Response.json({ error: 'Fleet equipment not found.' }, { status: 404 });

    if (action === 'update') {
      const patch = equipmentPatch(body?.equipment || body);
      if (patch.type && !EQUIPMENT_TYPES.has(patch.type)) return Response.json({ error: 'Invalid equipment type.' }, { status: 400 });
      if (patch.status && !EQUIPMENT_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid equipment status.' }, { status: 400 });
      const oldVin = normalizeVin(existing.vin || '');
      const nextVin = Object.prototype.hasOwnProperty.call(patch, 'vin') ? normalizeVin(patch.vin || '') : oldVin;
      const trackingApplicable = Object.prototype.hasOwnProperty.call(body, 'tracking_applicable')
        ? body.tracking_applicable !== false
        : existing.bouncie_link_status !== 'not_applicable';
      const link = (nextVin !== oldVin || Object.prototype.hasOwnProperty.call(body, 'tracking_applicable'))
        ? await evaluateBouncieLink(base44, nextVin, trackingApplicable)
        : {};
      const updated = await Equipment.update(id, { ...patch, ...link });
      return Response.json({ success: true, equipment: updated, bouncie_link: link });
    }

    if (action === 'delete') {
      const [orders, tasks, logs] = await Promise.all([
        WorkOrder.filter({ equipment_id: id }),
        Task.filter({ equipment_id: id }),
        Log.filter({ equipment_id: id }),
      ]);
      if (orders.length || tasks.length || logs.length) {
        return Response.json({ error: 'This equipment has Fleet history/schedules and cannot be deleted. Mark it retired instead.' }, { status: 409 });
      }
      await Equipment.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Unsupported Fleet equipment action.' }, { status: 400 });
  } catch (error) {
    console.error('fleetEquipmentAction error:', error);
    return Response.json({ error: error?.message || 'Fleet equipment operation failed.' }, { status: 500 });
  }
});
