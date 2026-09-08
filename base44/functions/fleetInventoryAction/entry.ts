import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Fleet inventory administration requires a CCS admin.' }, { status: 403 }) };
  return { user };
}

const units = new Set(['quarts', 'gallons', 'pints', 'ounces']);
const partFields = ['part_name','part_number','category','manufacturer','quantity_on_hand','minimum_stock','unit_cost','location','notes','enable_low_stock_alerts','compatible_equipment_ids'];
const fluidFields = ['fluid_name','fluid_type','viscosity','brand','quantity','unit','minimum_stock','minimum_stock_unit','cost_per_unit','location','notes','enable_low_stock_alerts','compatible_equipment_ids'];

function pick(source: any, fields: string[]) {
  const out: any = {};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
  return out;
}

function numberOrUndefined(value: any) {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizePart(source: any) {
  const out = pick(source, partFields);
  for (const key of ['quantity_on_hand','minimum_stock','unit_cost']) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = numberOrUndefined(out[key]);
  }
  out.part_name = String(out.part_name || '').trim();
  out.part_number = String(out.part_number || '').trim();
  out.category = String(out.category || '').trim();
  out.manufacturer = String(out.manufacturer || '').trim();
  out.location = String(out.location || '').trim();
  out.notes = String(out.notes || '').trim();
  out.compatible_equipment_ids = Array.isArray(out.compatible_equipment_ids) ? [...new Set(out.compatible_equipment_ids.map(String).filter(Boolean))] : [];
  return out;
}

function normalizeFluid(source: any) {
  const out = pick(source, fluidFields);
  for (const key of ['quantity','minimum_stock','cost_per_unit']) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = numberOrUndefined(out[key]);
  }
  out.fluid_name = String(out.fluid_name || '').trim();
  out.fluid_type = String(out.fluid_type || '').trim();
  out.viscosity = String(out.viscosity || '').trim();
  out.brand = String(out.brand || '').trim();
  out.location = String(out.location || '').trim();
  out.notes = String(out.notes || '').trim();
  out.compatible_equipment_ids = Array.isArray(out.compatible_equipment_ids) ? [...new Set(out.compatible_equipment_ids.map(String).filter(Boolean))] : [];
  return out;
}

async function validateCompatibility(Equipment: any, ids: string[]) {
  for (const id of ids || []) {
    const row = await Equipment.get(id).catch(() => null);
    if (!row) throw new Error(`Compatible Fleet equipment ${id} was not found.`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const itemType = String(body?.item_type || body?.type || '').trim();
    if (!['part','fluid'].includes(itemType)) return Response.json({ error: 'item_type must be part or fluid.' }, { status: 400 });

    const Part = base44.asServiceRole.entities.FleetPart;
    const Fluid = base44.asServiceRole.entities.FleetFluid;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Log = base44.asServiceRole.entities.FleetEquipmentLog;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Request = base44.asServiceRole.entities.FleetPartFluidRequest;
    const Entity = itemType === 'part' ? Part : Fluid;

    if (action === 'create') {
      const payload = itemType === 'part' ? normalizePart(body?.item || body) : normalizeFluid(body?.item || body);
      if (itemType === 'part') {
        if (!payload.part_name || !payload.category) return Response.json({ error: 'Part name and category are required.' }, { status: 400 });
        if ([payload.quantity_on_hand,payload.minimum_stock,payload.unit_cost].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Part quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      } else {
        if (!payload.fluid_name) return Response.json({ error: 'Fluid name is required.' }, { status: 400 });
        if (payload.unit && !units.has(payload.unit)) return Response.json({ error: 'Invalid fluid stock unit.' }, { status: 400 });
        if (payload.minimum_stock_unit && !units.has(payload.minimum_stock_unit)) return Response.json({ error: 'Invalid fluid minimum-stock unit.' }, { status: 400 });
        if ([payload.quantity,payload.minimum_stock,payload.cost_per_unit].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Fluid quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      }
      await validateCompatibility(Equipment, payload.compatible_equipment_ids || []);
      const created = await Entity.create(payload);
      return Response.json({ success: true, item: created, notifications_enabled: false });
    }

    const id = String(body?.id || body?.item_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet inventory item id is required.' }, { status: 400 });
    const existing = await Entity.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Fleet inventory item not found.' }, { status: 404 });

    if (action === 'update') {
      const payload = itemType === 'part' ? normalizePart(body?.item || body) : normalizeFluid(body?.item || body);
      if (itemType === 'part') {
        if (Object.prototype.hasOwnProperty.call(payload, 'part_name') && !payload.part_name) return Response.json({ error: 'Part name cannot be blank.' }, { status: 400 });
        if (Object.prototype.hasOwnProperty.call(payload, 'category') && !payload.category) return Response.json({ error: 'Part category cannot be blank.' }, { status: 400 });
        if ([payload.quantity_on_hand,payload.minimum_stock,payload.unit_cost].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Part quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      } else {
        if (Object.prototype.hasOwnProperty.call(payload, 'fluid_name') && !payload.fluid_name) return Response.json({ error: 'Fluid name cannot be blank.' }, { status: 400 });
        if (payload.unit && !units.has(payload.unit)) return Response.json({ error: 'Invalid fluid stock unit.' }, { status: 400 });
        if (payload.minimum_stock_unit && !units.has(payload.minimum_stock_unit)) return Response.json({ error: 'Invalid fluid minimum-stock unit.' }, { status: 400 });
        if ([payload.quantity,payload.minimum_stock,payload.cost_per_unit].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Fluid quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      }
      await validateCompatibility(Equipment, payload.compatible_equipment_ids || []);
      const updated = await Entity.update(id, payload);
      return Response.json({ success: true, item: updated, notifications_enabled: false });
    }

    if (action === 'delete') {
      const logs = await Log.filter({ item_id: id });
      const requests = await Request.filter({ inventory_item_id: id });
      const workOrders = await WorkOrder.list();
      const woRefs = (workOrders || []).filter((wo: any) => itemType === 'part'
        ? (wo.parts_used || []).some((row: any) => row.part_id === id)
        : (wo.fluids_used || []).some((row: any) => row.fluid_id === id));
      if (logs.length || requests.length || woRefs.length) return Response.json({ error: 'This Fleet inventory item has usage/request history and cannot be deleted. Set its stock to 0 and keep it for history.' }, { status: 409 });
      await Entity.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Unsupported Fleet inventory action.' }, { status: 400 });
  } catch (error) {
    console.error('fleetInventoryAction error:', error);
    return Response.json({ error: error?.message || 'Fleet inventory operation failed.' }, { status: 500 });
  }
});