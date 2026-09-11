import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LIMIT = 8;
const MAX_QUERY_LENGTH = 100;

const text = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function score(query: string, values: unknown[]) {
  const needle = query.toLowerCase();
  let best = 99;
  for (const value of values) {
    const haystack = text(value).toLowerCase();
    if (!haystack) continue;
    if (haystack === needle) best = Math.min(best, 0);
    else if (haystack.startsWith(needle)) best = Math.min(best, 1);
    else if (haystack.includes(needle)) best = Math.min(best, 2);
  }
  return best;
}

function sortByRelevance<T>(query: string, rows: T[], values: (row: T) => unknown[]) {
  return rows.slice().sort((a, b) => {
    const aScore = score(query, values(a));
    const bScore = score(query, values(b));
    if (aScore !== bScore) return aScore - bScore;
    return 0;
  }).slice(0, LIMIT);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'user'].includes(String(user.role || ''))) {
      return Response.json({ error: 'Fleet search requires CCS Fleet access.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const query = text(body?.query).slice(0, MAX_QUERY_LENGTH);
    if (query.length < 2) return Response.json({ query, total: 0, groups: {} });

    const regex = { $regex: escapeRegex(query), $options: 'i' };
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Metadata = base44.asServiceRole.entities.FleetVehicleMetadata;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Part = base44.asServiceRole.entities.FleetPart;
    const Fluid = base44.asServiceRole.entities.FleetFluid;
    const Request = base44.asServiceRole.entities.FleetPartFluidRequest;

    const [equipmentRows, metadataRows, workOrderRows, taskRows, partRows, fluidRows, requestRows] = await Promise.all([
      Equipment.filter({ $or: [
        { name: regex }, { make: regex }, { model: regex }, { vin: regex },
        { serial_number: regex }, { license_plate: regex }, { location: regex },
      ] }, '-updated_date', LIMIT),
      Metadata.filter({ $or: [
        { vehicle_vin: regex }, { license_plate: regex }, { unit_number: regex },
        { assigned_driver: regex }, { department: regex },
      ] }, '-updated_date', LIMIT),
      WorkOrder.filter({ $or: [
        { work_order_number: regex }, { title: regex }, { description: regex },
        { assigned_to: regex }, { corrective_action: regex },
      ] }, '-created_date', LIMIT),
      Task.filter({ $or: [
        { title: regex }, { description: regex }, { assigned_to: regex },
      ] }, '-updated_date', LIMIT),
      Part.filter({ $or: [
        { part_name: regex }, { part_number: regex }, { category: regex },
        { manufacturer: regex }, { location: regex },
      ] }, '-updated_date', LIMIT),
      Fluid.filter({ $or: [
        { fluid_name: regex }, { fluid_type: regex }, { brand: regex },
        { viscosity: regex }, { location: regex },
      ] }, '-updated_date', LIMIT),
      Request.filter({ $or: [
        { item_name: regex }, { part_number: regex }, { manufacturer_brand: regex },
        { requested_by_person: regex }, { justification: regex },
      ] }, '-created_date', LIMIT),
    ]);

    const equipmentById = new Map<string, any>();
    for (const row of equipmentRows || []) equipmentById.set(String(row.id), row);

    const metadataVins = [...new Set((metadataRows || []).map((row: any) => text(row.vehicle_vin)).filter(Boolean))];
    const metadataEquipmentBatches = await Promise.all(metadataVins.map((vin) => Equipment.filter({ vin }, '-updated_date', 2)));
    for (const batch of metadataEquipmentBatches) for (const row of batch || []) equipmentById.set(String(row.id), row);

    const relatedEquipmentIds = new Set<string>();
    for (const row of workOrderRows || []) if (row.equipment_id) relatedEquipmentIds.add(String(row.equipment_id));
    for (const row of taskRows || []) if (row.equipment_id) relatedEquipmentIds.add(String(row.equipment_id));
    for (const row of requestRows || []) if (row.equipment_id) relatedEquipmentIds.add(String(row.equipment_id));
    for (const id of relatedEquipmentIds) {
      if (equipmentById.has(id)) continue;
      const row = await Equipment.get(id).catch(() => null);
      if (row) equipmentById.set(id, row);
    }

    const metadataByVin = new Map<string, any>();
    for (const row of metadataRows || []) {
      const vin = text(row.vehicle_vin).toUpperCase();
      if (vin && !metadataByVin.has(vin)) metadataByVin.set(vin, row);
    }

    const equipmentMatches = sortByRelevance(query, [...equipmentById.values()].filter((row: any) => {
      const meta = metadataByVin.get(text(row.vin).toUpperCase());
      return score(query, [row.name, row.make, row.model, row.vin, row.serial_number, row.license_plate, row.location, meta?.license_plate, meta?.unit_number, meta?.assigned_driver, meta?.department]) < 99;
    }), (row: any) => {
      const meta = metadataByVin.get(text(row.vin).toUpperCase());
      return [row.name, row.make, row.model, row.vin, row.serial_number, row.license_plate, row.location, meta?.license_plate, meta?.unit_number, meta?.assigned_driver, meta?.department];
    }).map((row: any) => {
      const meta = metadataByVin.get(text(row.vin).toUpperCase());
      return {
        kind: 'equipment',
        id: row.id,
        title: row.name || 'Fleet equipment',
        subtitle: [row.year, row.make, row.model].filter(Boolean).join(' ') || row.type || '',
        meta: [meta?.license_plate || row.license_plate ? `Plate ${meta?.license_plate || row.license_plate}` : '', row.vin ? `VIN ${row.vin}` : row.serial_number ? `Serial ${row.serial_number}` : '', row.status || ''].filter(Boolean).join(' · '),
      };
    });

    const equipmentName = (id: unknown) => equipmentById.get(text(id))?.name || '';

    const groups = {
      equipment: equipmentMatches,
      work_orders: sortByRelevance(query, workOrderRows || [], (row: any) => [row.work_order_number, row.title, row.description, row.assigned_to, row.corrective_action]).map((row: any) => ({
        kind: 'work_order', id: row.id, equipment_id: row.equipment_id || '', title: `${row.work_order_number || 'Fleet WO'} · ${row.title || 'Untitled'}`,
        subtitle: equipmentName(row.equipment_id) || 'Unresolved equipment', meta: [row.status, row.priority ? `${row.priority} priority` : '', row.assigned_to || ''].filter(Boolean).join(' · '),
      })),
      maintenance: sortByRelevance(query, taskRows || [], (row: any) => [row.title, row.description, row.assigned_to]).map((row: any) => ({
        kind: 'maintenance', id: row.id, equipment_id: row.equipment_id || '', title: row.title || 'Maintenance schedule',
        subtitle: equipmentName(row.equipment_id) || 'Unresolved equipment', meta: [row.status, row.frequency, row.start_date ? `Due ${row.start_date}` : ''].filter(Boolean).join(' · '),
      })),
      parts: sortByRelevance(query, partRows || [], (row: any) => [row.part_name, row.part_number, row.category, row.manufacturer, row.location]).map((row: any) => ({
        kind: 'part', id: row.id, title: row.part_name || 'Fleet part', subtitle: [row.part_number, row.manufacturer].filter(Boolean).join(' · '),
        meta: [row.category, row.location, row.quantity_on_hand != null ? `On hand ${row.quantity_on_hand}` : ''].filter(Boolean).join(' · '),
      })),
      fluids: sortByRelevance(query, fluidRows || [], (row: any) => [row.fluid_name, row.fluid_type, row.brand, row.viscosity, row.location]).map((row: any) => ({
        kind: 'fluid', id: row.id, title: row.fluid_name || 'Fleet fluid', subtitle: [row.brand, row.viscosity].filter(Boolean).join(' · '),
        meta: [row.fluid_type, row.location, row.quantity != null ? `On hand ${row.quantity} ${row.unit || ''}`.trim() : ''].filter(Boolean).join(' · '),
      })),
      requests: sortByRelevance(query, requestRows || [], (row: any) => [row.item_name, row.part_number, row.manufacturer_brand, row.requested_by_person, row.justification]).map((row: any) => ({
        kind: 'request', id: row.id, equipment_id: row.equipment_id || '', title: row.item_name || 'Fleet request',
        subtitle: [row.item_type, equipmentName(row.equipment_id)].filter(Boolean).join(' · '), meta: [row.status, row.part_number, row.requested_by_person].filter(Boolean).join(' · '),
      })),
    };

    const total = Object.values(groups).reduce((sum: number, rows: any) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
    return Response.json({ query, total, groups, limit_per_group: LIMIT });
  } catch (error) {
    console.error('fleetSearch error:', error);
    return Response.json({ error: error?.message || 'Fleet search failed.' }, { status: 500 });
  }
});
