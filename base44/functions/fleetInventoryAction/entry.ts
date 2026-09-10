import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { setFleetInventoryQuantityIfUnchanged } from '../../shared/fleetInventoryQuantity.ts';

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
  if (failed) {
    if (failed?.result_summary?.safe_retry !== true) return { receipt: failed, applied: false, owner: false };
    const retryToken = crypto.randomUUID();
    const stamp = nowIso();
    await Receipt.update(failed.id, {
      status: 'started',
      started_at: stamp,
      error_message: '',
      result_summary: { ...(data.result_summary || {}), retry_claim_token: retryToken, retry_claimed_at: stamp },
    });
    await new Promise(resolve => setTimeout(resolve, 75));
    const refreshed = await Receipt.get(failed.id);
    if (refreshed?.result_summary?.retry_claim_token !== retryToken) return { receipt: refreshed || failed, applied: false, owner: false };
    return { receipt: refreshed, applied: false, owner: true, retry: true };
  }
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

function inventoryIsLow(itemType: string, item: any) {
  if (!item || item.enable_low_stock_alerts === false) return false;
  if (itemType === 'part') {
    const quantity = num(item.quantity_on_hand, NaN);
    const minimum = num(item.minimum_stock, NaN);
    return Number.isFinite(quantity) && Number.isFinite(minimum) && quantity <= minimum;
  }
  const quantity = num(item.quantity, NaN);
  const minimum = fluidMinimumInStockUnit(item);
  return Number.isFinite(quantity) && Number.isFinite(minimum) && quantity <= minimum + 1e-9;
}

async function dispatchLowStock(base44: any, itemType: string, item: any, eventToken: string) {
  if (!inventoryIsLow(itemType, item)) return;
  try {
    const result = await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
      event_type: itemType === 'part' ? 'low_stock_part' : 'low_stock_fluid',
      target_id: item.id,
      event_token: eventToken,
    });
    if (result?.data?.error) throw new Error(result.data.error);
  } catch (error: any) {
    await base44.asServiceRole.entities.FleetSystemLog.create({
      source: 'fleetInventoryAction',
      level: 'warning',
      message: 'Fleet inventory changed to low stock, but notification dispatch failed.',
      details: { item_type: itemType, item_id: item.id, error: error?.message || String(error) },
    }).catch(() => null);
  }
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

const optionalNumber = (value: any) => value == null || value === '' ? null : Number(value);
const sortedIds = (value: any) => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].sort() : [];
const inventoryCreateComparable = (itemType: string, source: any) => itemType === 'part' ? {
  part_name: String(source?.part_name || '').trim(),
  part_number: String(source?.part_number || '').trim(),
  category: String(source?.category || '').trim(),
  manufacturer: String(source?.manufacturer || '').trim(),
  quantity_on_hand: Number(source?.quantity_on_hand ?? 0),
  minimum_stock: Number(source?.minimum_stock ?? 1),
  unit_cost: optionalNumber(source?.unit_cost),
  location: String(source?.location || '').trim(),
  notes: String(source?.notes || '').trim(),
  enable_low_stock_alerts: source?.enable_low_stock_alerts !== false,
  compatible_equipment_ids: sortedIds(source?.compatible_equipment_ids),
} : {
  fluid_name: String(source?.fluid_name || '').trim(),
  fluid_type: String(source?.fluid_type || '').trim(),
  viscosity: String(source?.viscosity || '').trim(),
  brand: String(source?.brand || '').trim(),
  quantity: optionalNumber(source?.quantity),
  unit: String(source?.unit || '').trim(),
  minimum_stock: optionalNumber(source?.minimum_stock),
  minimum_stock_unit: String(source?.minimum_stock_unit || '').trim(),
  cost_per_unit: optionalNumber(source?.cost_per_unit),
  location: String(source?.location || '').trim(),
  notes: String(source?.notes || '').trim(),
  enable_low_stock_alerts: source?.enable_low_stock_alerts == null ? null : source.enable_low_stock_alerts === true,
  compatible_equipment_ids: sortedIds(source?.compatible_equipment_ids),
};
const sameInventoryCreate = (itemType: string, row: any, desired: any) => JSON.stringify(inventoryCreateComparable(itemType, row)) === JSON.stringify(inventoryCreateComparable(itemType, desired));

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
      const creationKey = String(body?.creation_key || '').trim();
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: `Fleet ${itemType} create identity is missing or invalid. Reopen the New ${itemType === 'part' ? 'Part' : 'Fluid'} dialog and try again.` }, { status: 409 });
      }
      const payload = itemType === 'part' ? normalizePart(body?.item || body) : normalizeFluid(body?.item || body);
      if (itemType === 'part') {
        payload.quantity_on_hand = payload.quantity_on_hand ?? 0;
        payload.minimum_stock = payload.minimum_stock ?? 1;
        payload.enable_low_stock_alerts = payload.enable_low_stock_alerts !== false;
        if (!payload.part_name || !payload.category) return Response.json({ error: 'Part name and category are required.' }, { status: 400 });
        if ([payload.quantity_on_hand,payload.minimum_stock,payload.unit_cost].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Part quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      } else {
        if (!payload.fluid_name || !payload.fluid_type) return Response.json({ error: 'Fluid name and type are required.' }, { status: 400 });
        if (payload.unit && !units.has(payload.unit)) return Response.json({ error: 'Invalid fluid stock unit.' }, { status: 400 });
        if (payload.minimum_stock_unit && !units.has(payload.minimum_stock_unit)) return Response.json({ error: 'Invalid fluid minimum-stock unit.' }, { status: 400 });
        if ([payload.quantity,payload.minimum_stock,payload.cost_per_unit].some((v: any) => Number.isNaN(v) || (v != null && v < 0))) return Response.json({ error: 'Fluid quantities/costs must be valid non-negative numbers.' }, { status: 400 });
      }
      await validateCompatibility(Equipment, payload.compatible_equipment_ids || []);

      const existingRows = await Entity.filter({ creation_key: creationKey });
      if (existingRows.length > 1) return Response.json({ error: `Multiple Fleet ${itemType} records share this create identity. Review the duplicates before retrying.` }, { status: 409 });
      if (existingRows[0]) {
        const reused = existingRows[0];
        if (!sameInventoryCreate(itemType, reused, payload)) {
          return Response.json({ error: `This create identity already belongs to different Fleet ${itemType} details. Reopen the New ${itemType === 'part' ? 'Part' : 'Fluid'} dialog before creating another item.` }, { status: 409 });
        }
        if (inventoryIsLow(itemType, reused)) {
          await dispatchLowStock(base44, itemType, reused, `inventory-created-low:${itemType}:${creationKey}`);
        }
        return Response.json({ success: true, reused: true, item: reused });
      }

      const created = await Entity.create({ ...payload, creation_key: creationKey });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Entity.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Entity.delete(created.id).catch(() => null);
          if (!sameInventoryCreate(itemType, winner, payload)) {
            return Response.json({ error: `Another Fleet ${itemType} create won this identity with different details. The losing duplicate was discarded; reopen the dialog.` }, { status: 409 });
          }
          if (inventoryIsLow(itemType, winner)) {
            await dispatchLowStock(base44, itemType, winner, `inventory-created-low:${itemType}:${creationKey}`);
          }
          return Response.json({ success: true, reused: true, item: winner });
        }
        for (const duplicate of contenders) if (duplicate.id !== winner.id) await Entity.delete(duplicate.id).catch(() => null);
      }
      if (inventoryIsLow(itemType, created)) {
        await dispatchLowStock(base44, itemType, created, `inventory-created-low:${itemType}:${creationKey}`);
      }
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

      let inventoryApplied = claim.receipt?.result_summary?.inventory_applied === true;
      const reconcile = async () => {
        const summary = claim.receipt?.result_summary || resultSummary;
        let currentItem = await Entity.get(id);
        const existingLog = canonical(await Log.filter({ usage_receipt_key: summary.log_key || logKey }));
        const expectedBefore = num(summary.before_quantity, NaN);
        const expectedAfter = num(summary.after_quantity, NaN);
        if (!Number.isFinite(expectedBefore) || !Number.isFinite(expectedAfter)) {
          throw new Error('Existing Fleet usage receipt is missing reconciliation quantities. Review FleetOperationReceipt.');
        }

        if (!claim.owner) {
          if (summary.inventory_applied !== true) {
            throw new Error('This Fleet usage receipt has no durable proof that its stock deduction was applied. It was not replayed automatically; review FleetOperationReceipt.');
          }
          inventoryApplied = true;
        } else {
          const quantityResult = await setFleetInventoryQuantityIfUnchanged({
            entity: Entity,
            itemId: id,
            field: itemType === 'part' ? 'quantity_on_hand' : 'quantity',
            expectedQuantity: expectedBefore,
            nextQuantity: expectedAfter,
            label: `${existing.part_name || existing.fluid_name || 'Fleet inventory'} stock`,
          });
          currentItem = quantityResult.item || await Entity.get(id);
          await Receipt.update(claim.receipt.id, {
            result_summary: { ...summary, inventory_applied: true, safe_retry: false },
            error_message: '',
          });
          inventoryApplied = true;
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
        await Receipt.update(claim.receipt.id, {
          status: 'applied', applied_at: nowIso(), error_message: '',
          result_summary: { ...summary, inventory_applied: true, safe_retry: false, reconciled: !claim.owner },
        });
        return currentItem?.id ? currentItem : await Entity.get(id);
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
          const safeRetry = !inventoryApplied && error?.code === 'FLEET_INVENTORY_QUANTITY_CONFLICT';
          await Receipt.update(claim.receipt.id, {
            status: 'failed',
            failed_at: nowIso(),
            error_message: error?.message || String(error),
            result_summary: {
              ...(claim.receipt?.result_summary || resultSummary),
              safe_retry: safeRetry,
              ...(inventoryApplied ? { inventory_applied: true } : {}),
              ...(!inventoryApplied && !safeRetry ? { inventory_outcome_ambiguous: true } : {}),
            },
          }).catch(() => null);
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
      const wasLow = inventoryIsLow(itemType, existing);
      const beforeQuantity = itemType === 'part' ? num(existing.quantity_on_hand, NaN) : num(existing.quantity, NaN);
      const expectedUpdatedAt = String(body?.expected_updated_date || existing.updated_date || '').trim();
      if (!expectedUpdatedAt) return Response.json({ error: 'Fleet inventory record version is missing. Reload this item before saving.' }, { status: 409 });
      const result = await Entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: payload },
      );
      if (!result || typeof result.updated !== 'number') return Response.json({ error: 'Fleet inventory update result could not be verified.' }, { status: 500 });
      if (result.updated > 1) return Response.json({ error: 'Fleet inventory update returned an impossible multi-record result.' }, { status: 500 });
      if (result.updated === 0) return Response.json({ error: 'This Fleet inventory item changed after you opened it. Reload the item and reapply your edit; newer stock was not overwritten.' }, { status: 409 });
      const updated = await Entity.get(id);
      if (!updated) return Response.json({ error: 'Fleet inventory was updated but could not be re-read.' }, { status: 500 });
      const afterQuantity = itemType === 'part' ? num(updated.quantity_on_hand, NaN) : num(updated.quantity, NaN);
      if (Number.isFinite(beforeQuantity) && Number.isFinite(afterQuantity) && !sameNumber(beforeQuantity, afterQuantity)) {
        await base44.asServiceRole.entities.FleetSystemLog.create({
          source: 'fleetInventoryAction',
          level: 'info',
          message: 'Fleet inventory quantity adjusted manually.',
          details: {
            item_type: itemType,
            item_id: id,
            item_name: updated.part_name || updated.fluid_name || '',
            before_quantity: beforeQuantity,
            after_quantity: afterQuantity,
            unit: itemType === 'part' ? 'units' : (updated.unit || existing.unit || ''),
            changed_by: auth.user?.email || '',
          },
        }).catch(() => null);
      }
      if (!wasLow && inventoryIsLow(itemType, updated)) {
        await dispatchLowStock(base44, itemType, updated, `inventory-manual-low:${id}:${updated.updated_date || nowIso()}`);
      }
      return Response.json({ success: true, item: updated });
    }

    if (action === 'delete') {
      const logs = await Log.filter({ item_id: id });
      const requests = await Request.filter({ inventory_item_id: id });
      const workOrders = await loadAllEntityRows({ entity: WorkOrder, sort: '-created_date', label: 'Fleet work orders for inventory delete protection' });
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