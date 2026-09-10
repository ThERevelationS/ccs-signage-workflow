import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

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
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;
const normalizedText = (value: unknown) => String(value ?? '').trim();
const equipmentCreateMatches = (row: any, desired: any) => {
  const fields = ['name','type','make','model','serial_number','vin','engine_details','status','location','purchase_date','photo_url','notes'];
  for (const field of fields) {
    const left = field === 'vin' ? normalizeVin(row?.[field]) : normalizedText(row?.[field]);
    const right = field === 'vin' ? normalizeVin(desired?.[field]) : normalizedText(desired?.[field]);
    if (left !== right) return false;
  }
  for (const field of ['year','mileage_hours']) {
    const left = row?.[field] == null || row?.[field] === '' ? null : Number(row[field]);
    const right = desired?.[field] == null || desired?.[field] === '' ? null : Number(desired[field]);
    if (left !== right) return false;
  }
  return true;
};

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
      const creationKey = String(body?.creation_key || '').trim();
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: 'Fleet equipment create identity is missing or invalid. Reopen New Equipment and try again.' }, { status: 409 });
      }
      const patch = equipmentPatch(body?.equipment || body);
      if (!String(patch.name || '').trim() || !EQUIPMENT_TYPES.has(String(patch.type || ''))) {
        return Response.json({ error: 'Equipment name and type are required.' }, { status: 400 });
      }
      if (patch.status && !EQUIPMENT_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid equipment status.' }, { status: 400 });
      const trackingApplicable = body?.tracking_applicable !== false;
      const desired = { ...patch, status: patch.status || 'operational' };
      const existingRows = await Equipment.filter({ creation_key: creationKey });
      if (existingRows.length > 1) return Response.json({ error: 'Multiple Fleet equipment records share this create identity. Review the duplicates before retrying.' }, { status: 409 });
      if (existingRows[0]) {
        const reused = existingRows[0];
        const sameTrackingIntent = trackingApplicable ? reused.bouncie_link_status !== 'not_applicable' : reused.bouncie_link_status === 'not_applicable';
        if (!equipmentCreateMatches(reused, desired) || !sameTrackingIntent) {
          return Response.json({ error: 'This create identity already belongs to different Fleet equipment details. Reopen New Equipment before creating another asset.' }, { status: 409 });
        }
        return Response.json({ success: true, reused: true, equipment: reused, bouncie_link: { bouncie_link_status: reused.bouncie_link_status, bouncie_imei: reused.bouncie_imei || null } });
      }
      const link = await evaluateBouncieLink(base44, patch.vin || '', trackingApplicable);
      const created = await Equipment.create({ ...desired, ...link, creation_key: creationKey });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Equipment.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Equipment.delete(created.id).catch(() => null);
          const sameTrackingIntent = trackingApplicable ? winner.bouncie_link_status !== 'not_applicable' : winner.bouncie_link_status === 'not_applicable';
          if (!equipmentCreateMatches(winner, desired) || !sameTrackingIntent) {
            return Response.json({ error: 'Another Fleet equipment create won this identity with different details. The losing duplicate was discarded; reopen New Equipment.' }, { status: 409 });
          }
          return Response.json({ success: true, reused: true, equipment: winner, bouncie_link: { bouncie_link_status: winner.bouncie_link_status, bouncie_imei: winner.bouncie_imei || null } });
        }
        for (const duplicate of contenders) if (duplicate.id !== winner.id) await Equipment.delete(duplicate.id).catch(() => null);
      }
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
      const expectedMetadataId = String(body?.metadata_id || '').trim();
      const expectedMetadataUpdatedAt = String(body?.expected_metadata_updated_date || '').trim();
      if (rows[0]) {
        if (expectedMetadataId && expectedMetadataId !== rows[0].id) return Response.json({ error: 'Vehicle metadata changed after it was opened. Reload before saving.' }, { status: 409 });
        if (!expectedMetadataUpdatedAt) return Response.json({ error: 'Vehicle metadata version is missing. Reload before saving.' }, { status: 409 });
        const saved = await updateFleetRecordIfCurrent({
          entity: Metadata,
          id: rows[0].id,
          expectedUpdatedAt: expectedMetadataUpdatedAt,
          patch,
          label: 'Fleet vehicle metadata',
        });
        return Response.json({ success: true, metadata: saved });
      }
      if (expectedMetadataId || expectedMetadataUpdatedAt) return Response.json({ error: 'Vehicle metadata no longer matches the record that was opened. Reload before saving.' }, { status: 409 });
      const created = await Metadata.create({ vehicle_vin: vin, ...patch });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Metadata.filter({ vehicle_vin: vin });
      if (contenders.length > 1) {
        const winner = contenders.slice().sort((a: any, b: any) => {
          const at = Date.parse(a?.created_date || '') || 0;
          const bt = Date.parse(b?.created_date || '') || 0;
          if (at !== bt) return at - bt;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        })[0];
        if (winner?.id !== created.id) {
          await Metadata.delete(created.id).catch(() => null);
          return Response.json({ error: 'Vehicle metadata was created concurrently by another admin. The duplicate created by this save was discarded; reload before editing.' }, { status: 409 });
        }
      }
      return Response.json({ success: true, metadata: created });
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
      const updated = await updateFleetRecordIfCurrent({
        entity: Equipment,
        id,
        expectedUpdatedAt: String(body?.expected_updated_date || existing.updated_date || ''),
        patch: { ...patch, ...link },
        label: 'Fleet equipment',
      });
      return Response.json({ success: true, equipment: updated, bouncie_link: link });
    }

    if (action === 'delete') {
      const [orders, tasks, logs] = await Promise.all([
        loadAllEntityRows({ entity: WorkOrder, query: { equipment_id: id }, sort: '-created_date', label: `Fleet work orders for equipment ${id}` }),
        loadAllEntityRows({ entity: Task, query: { equipment_id: id }, sort: '-created_date', label: `Fleet maintenance schedules for equipment ${id}` }),
        loadAllEntityRows({ entity: Log, query: { equipment_id: id }, sort: '-created_date', label: `Fleet usage logs for equipment ${id}` }),
      ]);
      if (orders.length || tasks.length || logs.length) {
        return Response.json({ error: 'This equipment has Fleet history/schedules and cannot be deleted. Mark it retired instead.' }, { status: 409 });
      }
      await Equipment.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Unsupported Fleet equipment action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetEquipmentAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet equipment operation failed.' }, { status: 500 });
  }
});
