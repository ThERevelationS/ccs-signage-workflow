import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const nowIso = () => new Date().toISOString();
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sameNumber = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) < 1e-9;
const normIdentity = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || a?.started_at || '') || 0;
  const bt = Date.parse(b?.created_date || b?.started_at || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function authorize(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user, role: 'admin' };
  const matches = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  const authorized = matches?.[0] || null;
  if (!authorized) return { error: Response.json({ error: 'This CCS account is not authorized for Fleet operations.' }, { status: 403 }) };
  return { user, role: authorized.role || 'user' };
}

async function claimReceipt(Receipt: any, data: any) {
  const applied = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'applied' }));
  if (applied) return { receipt: applied, applied: true, owner: false };
  const started = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'started' }));
  if (started) return { receipt: started, applied: false, owner: false, existingStarted: true };

  const failed = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'failed' }));
  if (failed) {
    const summary = failed.result_summary || {};
    if (summary.inventory_item_id || summary.before_quantity != null || summary.after_quantity != null) {
      return { receipt: failed, applied: false, owner: false, failedWithMutationEvidence: true };
    }
    const retryToken = crypto.randomUUID();
    const stamp = nowIso();
    await Receipt.update(failed.id, {
      status: 'started',
      started_at: stamp,
      error_message: '',
      result_summary: { ...(data.result_summary || {}), retry_claim_token: retryToken, retry_claimed_at: stamp },
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    const refreshed = await Receipt.get(failed.id);
    if (refreshed?.result_summary?.retry_claim_token !== retryToken) return { receipt: refreshed || failed, applied: false, owner: false, concurrent: true };
    return { receipt: refreshed, applied: false, owner: true, retry: true };
  }

  const created = await Receipt.create({ ...data, status: 'started', started_at: nowIso() });
  await new Promise((resolve) => setTimeout(resolve, 75));
  const contenders = await Receipt.filter({ operation_key: data.operation_key, status: 'started' });
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(() => null);
    return { receipt: winner, applied: false, owner: false, concurrent: true };
  }
  return { receipt: created, applied: false, owner: true };
}

const requestPatch = (source: any) => {
  const allowed = [
    'item_name', 'item_type', 'part_number', 'manufacturer_brand', 'inventory_item_id', 'quantity_needed',
    'unit_cost', 'equipment_id', 'requested_by_person', 'justification', 'vendor_link',
    'photo_urls', 'estimated_delivery_date', 'notes'
  ];
  const out: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
  return out;
};

async function finalizeReceive(Request: any, Receipt: any, request: any, receipt: any, itemId: string, body: any) {
  const stamp = nowIso();
  const qty = num(body?.quantity_received ?? receipt?.result_summary?.quantity_received);
  const unit = request?.item_type === 'part'
    ? 'units'
    : String(body?.unit || body?.received_unit || receipt?.result_summary?.unit || '').trim();
  const location = String(body?.location || receipt?.result_summary?.location || '').trim();
  const noteLine = `Received ${qty}${unit ? ` ${unit}` : ''} on ${stamp.slice(0, 10)}. Added to Fleet inventory.${location ? ` Storage: ${location}.` : ''}`;
  const updated = await Request.update(request.id, {
    status: 'received',
    quantity_received: qty,
    received_unit: unit || null,
    received_at: stamp,
    received_by: body?.received_by || receipt?.actor_email || '',
    inventory_item_id: itemId,
    receipt_key: receipt.operation_key,
    receipt_applied_at: stamp,
    notes: [request.notes, noteLine].filter(Boolean).join('\n'),
  });
  await Receipt.update(receipt.id, {
    status: 'applied', applied_at: stamp,
    result_summary: { ...(receipt.result_summary || {}), inventory_item_id: itemId, request_finalized: true },
    error_message: '',
  });
  return updated;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const isAdmin = auth.role === 'admin' || user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    const Request = base44.asServiceRole.entities.FleetPartFluidRequest;
    const Part = base44.asServiceRole.entities.FleetPart;
    const Fluid = base44.asServiceRole.entities.FleetFluid;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;

    const applyLinkedInventoryIdentity = async (sourcePatch: any, fallbackType = '') => {
      const itemId = String(sourcePatch?.inventory_item_id || '').trim();
      if (!itemId) return { patch: sourcePatch };
      const itemType = String(sourcePatch?.item_type || fallbackType || '').trim();
      if (!['part', 'fluid'].includes(itemType)) return { error: Response.json({ error: 'Linked inventory requires a valid part/fluid request type.' }, { status: 400 }) };
      const item = itemType === 'part' ? await Part.get(itemId).catch(() => null) : await Fluid.get(itemId).catch(() => null);
      if (!item) return { error: Response.json({ error: `The linked Fleet ${itemType} no longer exists.` }, { status: 404 }) };
      const patch = { ...sourcePatch, inventory_item_id: item.id, item_type: itemType };
      if (itemType === 'part') {
        patch.item_name = item.part_name || '';
        patch.part_number = item.part_number || '';
        patch.manufacturer_brand = item.manufacturer || '';
      } else {
        patch.item_name = item.fluid_name || '';
        patch.part_number = '';
        patch.manufacturer_brand = item.brand || '';
      }
      return { patch, item };
    };

    if (action === 'create') {
      const requestedPatch = requestPatch(body?.request || body);
      if (!['part', 'fluid'].includes(String(requestedPatch.item_type || ''))) return Response.json({ error: 'Request type must be part or fluid.' }, { status: 400 });
      const linked = await applyLinkedInventoryIdentity(requestedPatch);
      if (linked.error) return linked.error;
      const patch = linked.patch;
      if (!String(patch.item_name || '').trim() || num(patch.quantity_needed) <= 0 || !String(patch.justification || '').trim()) {
        return Response.json({ error: 'Item name, quantity, and justification are required.' }, { status: 400 });
      }
      if (patch.equipment_id) {
        const equipment = await Equipment.get(patch.equipment_id);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      }
      const created = await Request.create({
        ...patch,
        status: 'pending',
        requester_email: user.email,
        requested_by_person: patch.requested_by_person || user.full_name || user.name || user.email,
      });
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
        event_type: 'request_created', target_id: created.id, event_token: `created:${created.id}`
      }).catch(() => null);
      return Response.json({ success: true, request: created });
    }

    const id = String(body?.id || body?.request_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet request id is required.' }, { status: 400 });
    const existing = await Request.get(id);
    if (!existing) return Response.json({ error: 'Fleet request not found.' }, { status: 404 });
    const ownsRequest = String(existing.requester_email || '').toLowerCase() === String(user.email || '').toLowerCase();

    if (action === 'update') {
      if (!isAdmin && !ownsRequest) return Response.json({ error: 'You can only edit your own Fleet requests.' }, { status: 403 });
      if (existing.status !== 'pending') return Response.json({ error: 'Only pending Fleet requests can be edited.' }, { status: 409 });
      const requestedPatch = requestPatch(body?.request || body);
      if (existing.inventory_item_id && requestedPatch.inventory_item_id && requestedPatch.inventory_item_id !== existing.inventory_item_id) {
        return Response.json({ error: 'A linked Fleet inventory request cannot be reassigned to a different inventory item.' }, { status: 409 });
      }
      const linked = await applyLinkedInventoryIdentity({
        ...requestedPatch,
        inventory_item_id: existing.inventory_item_id || requestedPatch.inventory_item_id || '',
        item_type: existing.inventory_item_id ? existing.item_type : (requestedPatch.item_type || existing.item_type),
      }, existing.item_type);
      if (linked.error) return linked.error;
      const patch = linked.patch;
      if (patch.equipment_id) {
        const equipment = await Equipment.get(patch.equipment_id);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      }
      const updated = await Request.update(id, patch);
      return Response.json({ success: true, request: updated });
    }

    if (action === 'cancel') {
      if (!isAdmin && !ownsRequest) return Response.json({ error: 'You can only cancel your own Fleet requests.' }, { status: 403 });
      if (existing.status === 'received') return Response.json({ error: 'A received request cannot be cancelled because inventory has already been applied.' }, { status: 409 });
      if (!isAdmin && existing.status !== 'pending') return Response.json({ error: 'Only an admin can cancel a request after it has been ordered.' }, { status: 403 });
      const updated = await Request.update(id, { status: 'cancelled' });
      return Response.json({ success: true, request: updated });
    }

    if (action === 'order') {
      if (!isAdmin) return Response.json({ error: 'Only a CCS admin can mark Fleet requests as ordered.' }, { status: 403 });
      if (!['pending', 'ordered'].includes(existing.status)) return Response.json({ error: 'Only pending or ordered requests can have order details updated.' }, { status: 409 });
      const updated = await Request.update(id, {
        status: 'ordered',
        estimated_delivery_date: body?.estimated_delivery_date || existing.estimated_delivery_date || null,
        unit_cost: body?.unit_cost == null || body?.unit_cost === '' ? existing.unit_cost : num(body.unit_cost),
      });
      return Response.json({ success: true, request: updated });
    }

    if (action === 'receive') {
      if (!isAdmin) return Response.json({ error: 'Only a CCS admin can receive Fleet inventory.' }, { status: 403 });
      if (existing.status === 'received' && existing.receipt_applied_at) {
        if (!existing.migration_source_id && existing.receipt_key) {
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'request_received', target_id: id, event_token: existing.receipt_key
          }).catch(() => null);
        }
        return Response.json({ success: true, reused: true, request: existing });
      }
      if (existing.status === 'received' && !existing.receipt_applied_at) {
        return Response.json({ error: 'This request is marked received without an idempotency receipt. Inventory was not changed; review it manually.' }, { status: 409 });
      }
      if (existing.status !== 'ordered') return Response.json({ error: 'Mark the Fleet request as ordered before receiving it.' }, { status: 409 });

      const quantityReceived = num(body?.quantity_received);
      if (quantityReceived <= 0) return Response.json({ error: 'Quantity received must be greater than zero.' }, { status: 400 });
      const key = `fleetrequest:${id}:receive`;
      const claim = await claimReceipt(Receipt, {
        operation_key: key,
        operation_type: 'request_receive',
        target_entity: 'FleetPartFluidRequest',
        target_id: id,
        actor_email: user.email || '',
        actor_user_id: user.id || '',
        result_summary: {
          item_type: existing.item_type,
          quantity_received: quantityReceived,
          unit: existing.item_type === 'part' ? 'units' : (body?.unit || body?.received_unit || ''),
          location: body?.location || '',
        },
      });
      if (claim.applied) {
        const current = await Request.get(id);
        return Response.json({ success: true, reused: true, request: current });
      }

      if (!claim.owner) {
        const summary = claim.receipt?.result_summary || {};
        let item: any = null;
        if (summary.inventory_item_id) {
          item = summary.item_type === 'part' ? await Part.get(summary.inventory_item_id) : await Fluid.get(summary.inventory_item_id);
        }
        if (!item) {
          const createdByReceipt = summary.item_type === 'part'
            ? await Part.filter({ receive_receipt_key: key })
            : await Fluid.filter({ receive_receipt_key: key });
          item = canonical(createdByReceipt);
        }
        if (item && summary.new_item === true) {
          const finalized = await finalizeReceive(Request, Receipt, existing, claim.receipt, item.id, body);
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'request_received', target_id: id, event_token: claim.receipt.operation_key
          }).catch(() => null);
          return Response.json({ success: true, reused: true, recovered: true, request: finalized, inventory_item: item });
        }
        if (item && summary.new_item === false) {
          const currentQty = summary.item_type === 'part' ? num(item.quantity_on_hand) : num(item.quantity);
          if (sameNumber(currentQty, summary.after_quantity)) {
            const finalized = await finalizeReceive(Request, Receipt, existing, claim.receipt, item.id, body);
            await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
              event_type: 'request_received', target_id: id, event_token: claim.receipt.operation_key
            }).catch(() => null);
            return Response.json({ success: true, reused: true, recovered: true, request: finalized, inventory_item: item });
          }
        }
        return Response.json({ error: 'This receive operation is already in progress and cannot be safely replayed. Inventory was not incremented again; review FleetOperationReceipt.' }, { status: 409 });
      }

      let inventoryItem: any = null;
      let isNew = false;
      let beforeQuantity = 0;
      let afterQuantity = 0;
      const location = String(body?.location || '').trim();

      if (existing.item_type === 'part') {
        if (existing.inventory_item_id) {
          inventoryItem = await Part.get(existing.inventory_item_id).catch(() => null);
          if (!inventoryItem) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Linked Fleet part no longer exists.' });
            return Response.json({ error: 'This request is linked to a Fleet part that no longer exists. Repair the exact inventory link before receiving; CCS will not silently rematch it.' }, { status: 409 });
          }
        }
        if (!inventoryItem && existing.part_number) {
          const matches = await Part.filter({ part_number: existing.part_number });
          if (matches.length > 1) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Multiple Fleet parts share this exact part number.' });
            return Response.json({ error: 'Multiple Fleet parts share this exact part number. Choose/merge the inventory item before receiving.' }, { status: 409 });
          }
          inventoryItem = matches[0] || null;
        }
        if (inventoryItem) {
          beforeQuantity = num(inventoryItem.quantity_on_hand);
          afterQuantity = beforeQuantity + quantityReceived;
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: false, before_quantity: beforeQuantity, after_quantity: afterQuantity } });
          await Part.update(inventoryItem.id, { quantity_on_hand: afterQuantity });
          inventoryItem = await Part.get(inventoryItem.id);
        } else {
          const category = String(body?.category || '').trim();
          if (!category) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Category is required to create a new Fleet part.' });
            return Response.json({ error: 'Category is required when receiving a request that creates a new Fleet part.' }, { status: 400 });
          }
          isNew = true;
          inventoryItem = await Part.create({
            part_name: existing.item_name,
            part_number: existing.part_number || '',
            category,
            manufacturer: existing.manufacturer_brand || '',
            quantity_on_hand: quantityReceived,
            minimum_stock: Math.max(0, num(body?.minimum_stock, 1)),
            unit_cost: num(existing.unit_cost),
            location,
            notes: body?.notes || '',
            compatible_equipment_ids: existing.equipment_id ? [existing.equipment_id] : [],
            created_from_request_id: existing.id,
            receive_receipt_key: key,
          });
          beforeQuantity = 0;
          afterQuantity = quantityReceived;
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: true, before_quantity: 0, after_quantity: afterQuantity } });
        }
      } else if (existing.item_type === 'fluid') {
        if (existing.inventory_item_id) {
          inventoryItem = await Fluid.get(existing.inventory_item_id).catch(() => null);
          if (!inventoryItem) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Linked Fleet fluid no longer exists.' });
            return Response.json({ error: 'This request is linked to a Fleet fluid that no longer exists. Repair the exact inventory link before receiving; CCS will not silently rematch it.' }, { status: 409 });
          }
        }
        if (!inventoryItem) {
          const matches = await Fluid.filter({ fluid_name: existing.item_name, brand: existing.manufacturer_brand || '' });
          if (matches.length > 1) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Multiple Fleet fluids share this exact name and brand.' });
            return Response.json({ error: 'Multiple Fleet fluids share this exact name and brand. Resolve the inventory duplicates before receiving.' }, { status: 409 });
          }
          inventoryItem = matches[0] || null;
        }
        if (inventoryItem) {
          const requestedUnit = String(body?.unit || body?.received_unit || inventoryItem.unit || '').trim();
          if (inventoryItem.unit && requestedUnit && inventoryItem.unit !== requestedUnit) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: `Fluid unit mismatch: ${requestedUnit} vs ${inventoryItem.unit}.` });
            return Response.json({ error: `Fluid unit mismatch. Inventory is stored in ${inventoryItem.unit}; receive this request in the same unit.` }, { status: 409 });
          }
          beforeQuantity = num(inventoryItem.quantity);
          afterQuantity = beforeQuantity + quantityReceived;
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: false, before_quantity: beforeQuantity, after_quantity: afterQuantity, unit: inventoryItem.unit || requestedUnit } });
          await Fluid.update(inventoryItem.id, { quantity: afterQuantity });
          inventoryItem = await Fluid.get(inventoryItem.id);
        } else {
          const fluidType = String(body?.fluid_type || '').trim();
          const unit = String(body?.unit || body?.received_unit || '').trim();
          if (!fluidType || !['quarts', 'gallons', 'pints', 'ounces'].includes(unit)) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Fluid type and valid unit are required to create a new Fleet fluid.' });
            return Response.json({ error: 'Fluid type and a valid stock unit are required when receiving a request that creates a new Fleet fluid.' }, { status: 400 });
          }
          isNew = true;
          inventoryItem = await Fluid.create({
            fluid_name: existing.item_name,
            fluid_type: fluidType,
            brand: existing.manufacturer_brand || '',
            quantity: quantityReceived,
            unit,
            minimum_stock: Math.max(0, num(body?.minimum_stock, 0)),
            minimum_stock_unit: body?.minimum_stock_unit || unit,
            cost_per_unit: num(existing.unit_cost),
            location,
            notes: body?.notes || '',
            compatible_equipment_ids: existing.equipment_id ? [existing.equipment_id] : [],
            created_from_request_id: existing.id,
            receive_receipt_key: key,
          });
          beforeQuantity = 0;
          afterQuantity = quantityReceived;
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: true, before_quantity: 0, after_quantity: afterQuantity, unit } });
        }
      } else {
        await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Unknown request item type.' });
        return Response.json({ error: 'Unknown Fleet request item type.' }, { status: 400 });
      }

      const updatedRequest = await finalizeReceive(Request, Receipt, existing, await Receipt.get(claim.receipt.id), inventoryItem.id, {
        ...body,
        quantity_received: quantityReceived,
        unit: existing.item_type === 'part' ? 'units' : (body?.unit || body?.received_unit || inventoryItem.unit || ''),
        received_by: user.email,
      });
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
        event_type: 'request_received', target_id: id, event_token: key
      }).catch(() => null);
      return Response.json({
        success: true,
        request: updatedRequest,
        inventory_item: inventoryItem,
        inventory_created: isNew,
        before_quantity: beforeQuantity,
        after_quantity: afterQuantity,
      });
    }

    return Response.json({ error: 'Unsupported Fleet request action.' }, { status: 400 });
  } catch (error) {
    console.error('fleetRequestAction error:', error);
    return Response.json({ error: error?.message || 'Fleet request operation failed.' }, { status: 500 });
  }
});
