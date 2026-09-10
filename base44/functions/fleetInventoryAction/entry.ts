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
const fluidOuncesPerUnit: Record<string, number> = { ounces: 1, pints: 16, quarts: 32, gallons: 128 };
const USAGE_STALE_MS = 60 * 1000;
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

const nowIso = () => new Date().toISOString();
const num = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sameNumber = (a: any, b: any) => Math.abs(num(a) - num(b)) < 1e-9;
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || a?.started_at || '') || 0;
  const bt = Date.parse(b?.created_date || b?.started_at || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function claimUsageReceipt(Receipt: any, data: any) {
  const applied = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'applied' }));
  if (applied) return { receipt: applied, applied: true, owner: false };
  const started = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'started' }));
  if (started) return { receipt: started, applied: false, owner: false };
  const failed = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'failed' }));
  if (failed) return { receipt: failed, applied: false, owner: false };
  const created = await Receipt.create({ ...data, status: 'started', started_at: nowIso() });
  await new Promise(resolve => setTimeout(resolve, 75));
  const contenders = await Receipt.filter({ operation_key: data.operation_key, status: 'started' });
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(() => null);
    return { receipt: winner, applied: false, owner: false };
  }
  return { receipt: created, applied: false, owner: true };
}

function fluidMinimumInStockUnit(item: any) {
  const minimum = num(item?.minimum_stock, NaN);
  const stockUnit = String(item?.unit || '').toLowerCase();
  const minimumUnit = String(item?.minimum_stock_unit || item?.unit || '').toLowerCase();
  if (!Number.isFinite(minimum) || !fluidOuncesPerUnit[stockUnit] || !fluidOuncesPerUnit[minimumUnit]) return NaN;
  return minimum * fluidOuncesPerUnit[minimumUnit] / fluidOuncesPerUnit[stockUnit];
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
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
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
      return Response.json({ success: true, item: created });
    }

    const id = String(body?.id || body?.item_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet inventory item id is required.' }, { status: 400 });
    const existing = await Entity.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Fleet inventory item not found.' }, { status: 404 });

    if (action === 'record_usage') {
      const equipmentId = String(body?.equipment_id || '').trim();
      const clientKey = String(body?.operation_key || '').trim();
      const enteredQuantity = num(body?.quantity, NaN);
      if (!equipmentId) return Response.json({ error: 'Fleet equipment is required to record usage.' }, { status: 400 });
      if (!clientKey || clientKey.length > 200) return Response.json({ error: 'A valid usage operation key is required.' }, { status: 400 });
      if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0) return Response.json({ error: 'Usage quantity must be greater than zero.' }, { status: 400 });
      if (itemType === 'part' && !Number.isInteger(enteredQuantity)) return Response.json({ error: 'Part usage must be entered in whole units.' }, { status: 400 });

      const equipment = await Equipment.get(equipmentId).catch(() => null);
      if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      if (Array.isArray(existing.compatible_equipment_ids) && existing.compatible_equipment_ids.length && !existing.compatible_equipment_ids.includes(equipmentId)) {
        return Response.json({ error: `${existing.part_name || existing.fluid_name || 'This item'} is not marked compatible with the selected Fleet equipment.` }, { status: 409 });
      }

      const enteredUnit = itemType === 'part' ? 'units' : String(body?.unit || existing.unit || '').trim().toLowerCase();
      const stockUnit = itemType === 'part' ? 'units' : String(existing.unit || '').trim().toLowerCase();
      if (itemType === 'fluid' && (!units.has(enteredUnit) || !units.has(stockUnit))) {
        return Response.json({ error: 'Fleet fluid usage requires valid entered and stock units.' }, { status: 400 });
      }
      const stockDeduction = itemType === 'part'
        ? enteredQuantity
        : enteredQuantity * fluidOuncesPerUnit[enteredUnit] / fluidOuncesPerUnit[stockUnit];
      const operationKey = `fleetinventory:${itemType}:${id}:usage:${clientKey}`;
      const logKey = `${operationKey}:log`;
      const priorReceipt = canonical(await Receipt.filter({ operation_key: operationKey }));
      const beforeQuantity = itemType === 'part' ? num(existing.quantity_on_hand) : num(existing.quantity);
      if (!priorReceipt && beforeQuantity + 1e-9 < stockDeduction) {
        return Response.json({ error: `Insufficient Fleet stock. Available ${beforeQuantity} ${stockUnit}; this usage requires ${stockDeduction} ${stockUnit}.` }, { status: 409 });
      }
      const afterQuantity = beforeQuantity - stockDeduction;
      const usageNotes = String(body?.notes || '').trim();
      const resultSummary = {
        item_type: itemType,
        item_id: id,
        equipment_id: equipmentId,
        entered_quantity: enteredQuantity,
        entered_unit: enteredUnit,
        stock_unit: stockUnit,
        stock_deduction: stockDeduction,
        before_quantity: beforeQuantity,
        after_quantity: afterQuantity,
        notes: usageNotes,
        log_key: logKey,
      };
      const claim = await claimUsageReceipt(Receipt, {
        operation_key: operationKey,
        operation_type: 'inventory_usage',
        target_entity: itemType === 'part' ? 'FleetPart' : 'FleetFluid',
        target_id: id,
        actor_email: auth.user?.email || '',
        actor_user_id: auth.user?.id || '',
        result_summary: resultSummary,
      });
      const claimedSummary = claim.receipt?.result_summary || resultSummary;
      const sameRequest = String(claimedSummary.item_id || id) === id
        && String(claimedSummary.equipment_id || '') === equipmentId
        && sameNumber(claimedSummary.entered_quantity, enteredQuantity)
        && String(claimedSummary.entered_unit || enteredUnit) === enteredUnit
        && String(claimedSummary.notes || '') === usageNotes;
      if (!sameRequest) {
        return Response.json({ error: 'This retry key belongs to different Fleet usage details. Close and reopen Record Usage before submitting the changed values.' }, { status: 409 });
      }
      if (!claim.owner && !claim.applied && claim.receipt?.status === 'started') {
        const startedAt = Date.parse(claim.receipt?.started_at || claim.receipt?.created_date || '') || 0;
        if (startedAt && Date.now() - startedAt < USAGE_STALE_MS) {
          return Response.json({ error: 'This Fleet usage operation is already in progress. It was not replayed or deducted again.' }, { status: 409 });
        }
      }

      const reconcile = async () => {
        const summary = claim.receipt?.result_summary || resultSummary;
        const currentItem = await Entity.get(id);
        const currentQuantity = itemType === 'part' ? num(currentItem?.quantity_on_hand) : num(currentItem?.quantity);
        const existingLog = canonical(await Log.filter({ usage_receipt_key: summary.log_key || logKey }));
        const expectedBefore = num(summary.before_quantity, NaN);
        const expectedAfter = num(summary.after_quantity, NaN);
        if (!Number.isFinite(expectedBefore) || !Number.isFinite(expectedAfter)) {
          throw new Error('Existing Fleet usage receipt is missing reconciliation quantities. Review FleetOperationReceipt.');
        }
        if (!sameNumber(currentQuantity, expectedBefore) && !sameNumber(currentQuantity, expectedAfter)) {
          throw new Error('Fleet inventory changed during this usage operation. It was not replayed; review FleetOperationReceipt.');
        }
        if (!existingLog) {
          await Log.create({
            equipment_id: summary.equipment_id || equipmentId,
            item_id: id,
            item_name: existing.part_name || existing.fluid_name || '',
            item_type: itemType,
            quantity_used: num(summary.entered_quantity, enteredQuantity),
            unit: summary.entered_unit || enteredUnit,
            notes: String(summary.notes || usageNotes),
            recorded_by: auth.user?.email || '',
            usage_receipt_key: summary.log_key || logKey,
          });
        }
        if (sameNumber(currentQuantity, expectedBefore)) {
          await Entity.update(id, itemType === 'part' ? { quantity_on_hand: expectedAfter } : { quantity: expectedAfter });
        }
        await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '', result_summary: { ...summary, reconciled: !claim.owner } });
        return await Entity.get(id);
      };

      let updatedItem: any = null;
      try {
        if (claim.applied) {
          updatedItem = await Entity.get(id);
        } else {
          updatedItem = await reconcile();
        }
      } catch (error: any) {
        if (claim.receipt?.id && claim.receipt?.status !== 'applied') {
          await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: error?.message || String(error) }).catch(() => null);
        }
        throw error;
      }

      const effectiveSummary = claim.receipt?.result_summary || resultSummary;
      const effectiveBefore = num(effectiveSummary.before_quantity, beforeQuantity);
      const effectiveAfter = num(effectiveSummary.after_quantity, afterQuantity);
      const minimum = itemType === 'part' ? num(updatedItem?.minimum_stock, NaN) : fluidMinimumInStockUnit(updatedItem);
      if (updatedItem?.enable_low_stock_alerts !== false && Number.isFinite(minimum) && effectiveBefore > minimum && effectiveAfter <= minimum) {
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: itemType === 'part' ? 'low_stock_part' : 'low_stock_fluid',
          target_id: id,
          event_token: operationKey,
        }).catch(() => null);
      }
      return Response.json({ success: true, reused: claim.applied || !claim.owner, item: updatedItem, operation_key: operationKey });
    }

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
      return Response.json({ success: true, item: updated });
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