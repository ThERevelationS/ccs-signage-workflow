import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { setFleetInventoryQuantityIfUnchanged } from '../../shared/fleetInventoryQuantity.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const nowIso = () => new Date().toISOString();
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sameNumber = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) < 1e-9;
const normIdentity = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const RECEIVE_STALE_MS = 60 * 1000;
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
    if (summary.safe_retry !== true && (summary.inventory_item_id || summary.before_quantity != null || summary.after_quantity != null)) {
      return { receipt: failed, applied: false, owner: false, failedWithMutationEvidence: true };
    }
    const retryToken = crypto.randomUUID();
    const stamp = nowIso();
    await Receipt.update(failed.id, {
      status: 'started',
      started_at: stamp,
      error_message: '',
      result_summary: { ...(failed.result_summary || {}), ...(data.result_summary || {}), retry_claim_token: retryToken, retry_claimed_at: stamp },
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
  const activeReceipt = await Receipt.get(receipt.id).catch(() => receipt);
  const summary = activeReceipt?.result_summary || receipt?.result_summary || {};
  const current = await Request.get(request.id).catch(() => null);
  if (!current) throw new Error('Fleet request no longer exists during receive finalization.');

  const stamp = nowIso();
  if (current.status === 'received' && String(current.receipt_key || '') === String(activeReceipt.operation_key || '')) {
    await Receipt.update(activeReceipt.id, {
      status: 'applied',
      applied_at: current.receipt_applied_at || stamp,
      result_summary: { ...summary, inventory_item_id: itemId || current.inventory_item_id || '', request_finalized: true, reconciled_from_received_request: true },
      error_message: '',
    });
    return current;
  }
  if (String(current.receipt_key || '') !== String(activeReceipt.operation_key || '')) {
    const conflict: any = new Error('Fleet request no longer holds its receive lock. Inventory was not replayed and the request was not overwritten.');
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  const lockedVersion = String(summary.request_locked_updated_date || '').trim();
  if (!lockedVersion || lockedVersion !== String(current.updated_date || '')) {
    const conflict: any = new Error('Fleet request changed after its receive lock was acquired. Inventory was not replayed and finalization was stopped.');
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  const qty = num(body?.quantity_received ?? summary.quantity_received);
  const unit = request?.item_type === 'part'
    ? 'units'
    : String(body?.unit || body?.received_unit || summary.unit || '').trim();
  const location = String(body?.location || summary.location || '').trim();
  const noteLine = `Received ${qty}${unit ? ` ${unit}` : ''} on ${stamp.slice(0, 10)}. Added to Fleet inventory.${location ? ` Storage: ${location}.` : ''}`;
  const updated = await updateFleetRecordIfCurrent({
    entity: Request,
    id: request.id,
    expectedUpdatedAt: lockedVersion,
    patch: {
      status: 'received',
      quantity_received: qty,
      received_unit: unit || null,
      received_at: stamp,
      received_by: body?.received_by || activeReceipt?.actor_email || '',
      inventory_item_id: itemId,
      receipt_key: activeReceipt.operation_key,
      receipt_applied_at: stamp,
      notes: [request.notes, noteLine].filter(Boolean).join('\n'),
    },
    label: 'Fleet request receiving',
  });
  await Receipt.update(activeReceipt.id, {
    status: 'applied', applied_at: stamp,
    result_summary: { ...summary, inventory_item_id: itemId, request_finalized: true },
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
      const creationKey = String(body?.creation_key || '').trim();
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: 'Fleet request create identity is missing or invalid. Reopen the New Request dialog and try again.' }, { status: 409 });
      }
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

      const matchesCreateIntent = (row: any) =>
        String(row?.item_type || '') === String(patch.item_type || '')
        && String(row?.inventory_item_id || '') === String(patch.inventory_item_id || '')
        && normIdentity(row?.item_name) === normIdentity(patch.item_name)
        && String(row?.equipment_id || '') === String(patch.equipment_id || '')
        && sameNumber(row?.quantity_needed, patch.quantity_needed)
        && normIdentity(row?.justification) === normIdentity(patch.justification)
        && String(row?.requester_email || '').toLowerCase() === String(user.email || '').toLowerCase();

      const existingRows = await Request.filter({ creation_key: creationKey });
      if (existingRows?.length > 1) {
        return Response.json({ error: 'Multiple Fleet requests share this create identity. No new request was created; review the duplicates before retrying.' }, { status: 409 });
      }
      if (existingRows?.[0]) {
        const reused = existingRows[0];
        if (!matchesCreateIntent(reused)) {
          return Response.json({ error: 'This create identity already belongs to a different Fleet request. Reopen the New Request dialog before submitting another request.' }, { status: 409 });
        }
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: 'request_created', target_id: reused.id, event_token: `request-created:${creationKey}`
        }).catch(() => null);
        return Response.json({ success: true, reused: true, request: reused });
      }

      const created = await Request.create({
        ...patch,
        status: 'pending',
        requester_email: user.email,
        requested_by_person: patch.requested_by_person || user.full_name || user.name || user.email,
        creation_key: creationKey,
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Request.filter({ creation_key: creationKey });
      if (contenders?.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Request.delete(created.id).catch(() => null);
          if (!matchesCreateIntent(winner)) {
            return Response.json({ error: 'Another Fleet request won this create identity with different details. The losing duplicate was discarded; reopen the New Request dialog.' }, { status: 409 });
          }
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'request_created', target_id: winner.id, event_token: `request-created:${creationKey}`
          }).catch(() => null);
          return Response.json({ success: true, reused: true, request: winner });
        }
        for (const duplicate of contenders) {
          if (duplicate.id !== winner.id) await Request.delete(duplicate.id).catch(() => null);
        }
      }

      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
        event_type: 'request_created', target_id: created.id, event_token: `request-created:${creationKey}`
      }).catch(() => null);
      return Response.json({ success: true, request: created });
    }

    const id = String(body?.id || body?.request_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet request id is required.' }, { status: 400 });
    const existing = await Request.get(id);
    if (!existing) return Response.json({ error: 'Fleet request not found.' }, { status: 404 });
    const ownsRequest = String(existing.requester_email || '').toLowerCase() === String(user.email || '').toLowerCase();
    const activeReceiveLock = async () => {
      const receiptKey = String(existing.receipt_key || '').trim();
      if (!receiptKey || existing.status === 'received') return null;
      const rows = await Receipt.filter({ operation_key: receiptKey, status: { $in: ['started', 'failed'] } });
      return canonical((rows || []).filter((row: any) =>
        row.operation_type === 'request_receive' && (row?.result_summary?.request_lock_acquired === true || receiptKey === `fleetrequest:${id}:receive`)
      ));
    };

    if (action === 'update') {
      if (!isAdmin && !ownsRequest) return Response.json({ error: 'You can only edit your own Fleet requests.' }, { status: 403 });
      if (await activeReceiveLock()) return Response.json({ error: 'This Fleet request has a receive operation in progress or awaiting reconciliation. Finish/review receiving before editing it.' }, { status: 409 });
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
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (!expectedUpdatedAt) return Response.json({ error: 'Fleet request version is missing. Reload before saving.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Request,
        id,
        expectedUpdatedAt,
        patch,
        label: 'Fleet request',
      });
      return Response.json({ success: true, request: updated });
    }

    if (action === 'cancel') {
      if (!isAdmin && !ownsRequest) return Response.json({ error: 'You can only cancel your own Fleet requests.' }, { status: 403 });
      if (await activeReceiveLock()) return Response.json({ error: 'This Fleet request has a receive operation in progress or awaiting reconciliation. Finish/review receiving before cancelling it.' }, { status: 409 });
      if (existing.status === 'received') return Response.json({ error: 'A received request cannot be cancelled because inventory has already been applied.' }, { status: 409 });
      if (!isAdmin && existing.status !== 'pending') return Response.json({ error: 'Only an admin can cancel a request after it has been ordered.' }, { status: 403 });
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (!expectedUpdatedAt) return Response.json({ error: 'Fleet request version is missing. Reload before cancelling.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Request,
        id,
        expectedUpdatedAt,
        patch: { status: 'cancelled' },
        label: 'Fleet request',
      });
      return Response.json({ success: true, request: updated });
    }

    if (action === 'order') {
      if (!isAdmin) return Response.json({ error: 'Only a CCS admin can mark Fleet requests as ordered.' }, { status: 403 });
      if (await activeReceiveLock()) return Response.json({ error: 'This Fleet request has a receive operation in progress or awaiting reconciliation. Finish/review receiving before changing order details.' }, { status: 409 });
      if (!['pending', 'ordered'].includes(existing.status)) return Response.json({ error: 'Only pending or ordered requests can have order details updated.' }, { status: 409 });
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (!expectedUpdatedAt) return Response.json({ error: 'Fleet request version is missing. Reload before changing order details.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Request,
        id,
        expectedUpdatedAt,
        patch: {
          status: 'ordered',
          estimated_delivery_date: body?.estimated_delivery_date || existing.estimated_delivery_date || null,
          unit_cost: body?.unit_cost == null || body?.unit_cost === '' ? existing.unit_cost : num(body.unit_cost),
        },
        label: 'Fleet request',
      });
      return Response.json({ success: true, request: updated });
    }

    if (action === 'receive') {
      if (!isAdmin) return Response.json({ error: 'Only a CCS admin can receive Fleet inventory.' }, { status: 403 });
      if (existing.status === 'received' && existing.receipt_applied_at) {
        if (!existing.migration_source_id && existing.receipt_key) {
          const receiptRows = await Receipt.filter({ operation_key: existing.receipt_key });
          const receiveReceipt = canonical(receiptRows);
          if (receiveReceipt && receiveReceipt.status !== 'applied') {
            await Receipt.update(receiveReceipt.id, {
              status: 'applied',
              applied_at: existing.receipt_applied_at,
              error_message: '',
              result_summary: {
                ...(receiveReceipt.result_summary || {}),
                inventory_item_id: existing.inventory_item_id || receiveReceipt?.result_summary?.inventory_item_id || '',
                request_finalized: true,
                reconciled_from_received_request: true,
              },
            });
          }
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
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      const key = `fleetrequest:${id}:receive`;
      const existingReceiveLock = String(existing.receipt_key || '') === key;
      if (!expectedUpdatedAt && !existingReceiveLock) {
        return Response.json({ error: 'Fleet request version is missing. Reload before receiving inventory.' }, { status: 409 });
      }
      if (!existingReceiveLock && expectedUpdatedAt !== String(existing.updated_date || '')) {
        return Response.json({ error: 'This Fleet request changed after the Receive dialog was opened. Reload it before applying inventory.' }, { status: 409 });
      }

      const quantityReceived = num(body?.quantity_received);
      if (quantityReceived <= 0) return Response.json({ error: 'Quantity received must be greater than zero.' }, { status: 400 });
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
          request_expected_updated_date: expectedUpdatedAt || String(existing.updated_date || ''),
        },
      });
      if (claim.applied) {
        const current = await Request.get(id);
        return Response.json({ success: true, reused: true, request: current });
      }

      let operationOwner = claim.owner;
      let lockRequest = await Request.get(id);
      let lockHeld = String(lockRequest?.receipt_key || '') === key;
      let lockSummary = claim.receipt?.result_summary || {};

      if (lockHeld) {
        const storedLockedVersion = String(lockSummary.request_locked_updated_date || '').trim();
        if (storedLockedVersion && storedLockedVersion !== String(lockRequest?.updated_date || '')) {
          return Response.json({
            error: 'This Fleet request changed after its receive lock was acquired. Inventory was not replayed; review FleetOperationReceipt before proceeding.',
            operation_key: key,
          }, { status: 409 });
        }
        if (lockSummary.request_lock_acquired !== true || !storedLockedVersion) {
          await Receipt.update(claim.receipt.id, {
            result_summary: {
              ...lockSummary,
              request_lock_acquired: true,
              request_locked_updated_date: String(lockRequest?.updated_date || ''),
              request_expected_updated_date: lockSummary.request_expected_updated_date || expectedUpdatedAt || String(existing.updated_date || ''),
            },
          });
          claim.receipt = await Receipt.get(claim.receipt.id);
          lockSummary = claim.receipt?.result_summary || lockSummary;
        }
        if (!operationOwner) {
          const hasMutationEvidence = lockSummary.inventory_applied === true
            || lockSummary.new_item === true
            || !!lockSummary.inventory_item_id
            || lockSummary.before_quantity != null
            || lockSummary.after_quantity != null;
          const startedAt = Date.parse(claim.receipt?.started_at || claim.receipt?.created_date || '') || 0;
          const stale = !!startedAt && (Date.now() - startedAt) >= RECEIVE_STALE_MS;
          if (!hasMutationEvidence && stale) {
            try {
              const reclaimed = await updateFleetRecordIfCurrent({
                entity: Receipt,
                id: claim.receipt.id,
                expectedUpdatedAt: String(claim.receipt.updated_date || ''),
                patch: {
                  status: 'started',
                  started_at: nowIso(),
                  error_message: '',
                  result_summary: { ...lockSummary, stale_resume: true, stale_resumed_at: nowIso() },
                },
                label: 'Fleet request receive receipt',
              });
              claim.receipt = reclaimed;
              lockSummary = reclaimed.result_summary || lockSummary;
              operationOwner = true;
            } catch (error: any) {
              if (error?.code !== 'FLEET_RECORD_CONFLICT') throw error;
            }
          }
        }
      } else if (operationOwner) {
        const expectedForLock = expectedUpdatedAt || String(lockSummary.request_expected_updated_date || '').trim();
        if (!expectedForLock) {
          await Receipt.delete(claim.receipt.id).catch(() => null);
          return Response.json({ error: 'Fleet request version is missing. Reload before receiving inventory.' }, { status: 409 });
        }
        try {
          const locked = await updateFleetRecordIfCurrent({
            entity: Request,
            id,
            expectedUpdatedAt: expectedForLock,
            patch: { receipt_key: key },
            label: 'Fleet request',
          });
          lockRequest = locked;
          lockHeld = true;
          await Receipt.update(claim.receipt.id, {
            result_summary: {
              ...lockSummary,
              request_lock_acquired: true,
              request_locked_updated_date: String(locked.updated_date || ''),
              request_expected_updated_date: expectedForLock,
            },
          });
          claim.receipt = await Receipt.get(claim.receipt.id);
          lockSummary = claim.receipt?.result_summary || lockSummary;
        } catch (error: any) {
          const after = await Request.get(id).catch(() => null);
          if (String(after?.receipt_key || '') === key) {
            lockRequest = after;
            lockHeld = true;
            await Receipt.update(claim.receipt.id, {
              result_summary: {
                ...lockSummary,
                request_lock_acquired: true,
                request_locked_updated_date: String(after?.updated_date || ''),
                request_expected_updated_date: expectedForLock,
                lock_verified_after_error: true,
              },
            });
            claim.receipt = await Receipt.get(claim.receipt.id);
            lockSummary = claim.receipt?.result_summary || lockSummary;
          } else {
            await Receipt.delete(claim.receipt.id).catch(() => null);
            throw error;
          }
        }
      } else {
        const hasMutationEvidence = lockSummary.inventory_applied === true
          || lockSummary.new_item === true
          || !!lockSummary.inventory_item_id
          || lockSummary.before_quantity != null
          || lockSummary.after_quantity != null;
        const startedAt = Date.parse(claim.receipt?.started_at || claim.receipt?.created_date || '') || 0;
        const stale = !!startedAt && (Date.now() - startedAt) >= RECEIVE_STALE_MS;
        if (hasMutationEvidence) {
          return Response.json({
            error: 'This receive receipt has inventory-side evidence but no request lock. It cannot be replayed automatically; review FleetOperationReceipt.',
            operation_key: key,
          }, { status: 409 });
        }
        if (!stale) {
          return Response.json({ error: 'This receive operation is already in progress and has not acquired its request lock yet. It was not replayed.' }, { status: 409 });
        }
        const expectedForLock = String(lockSummary.request_expected_updated_date || expectedUpdatedAt || '').trim();
        lockRequest = await Request.get(id);
        if (!expectedForLock || String(lockRequest?.updated_date || '') !== expectedForLock) {
          await Receipt.delete(claim.receipt.id).catch(() => null);
          return Response.json({ error: 'The stale receive claim expired before acquiring its lock and the request has since changed. No inventory was modified; reload and receive again.' }, { status: 409 });
        }
        const locked = await updateFleetRecordIfCurrent({
          entity: Request,
          id,
          expectedUpdatedAt: expectedForLock,
          patch: { receipt_key: key },
          label: 'Fleet request',
        });
        lockRequest = locked;
        lockHeld = true;
        await Receipt.update(claim.receipt.id, {
          started_at: nowIso(),
          error_message: '',
          result_summary: {
            ...lockSummary,
            request_lock_acquired: true,
            request_locked_updated_date: String(locked.updated_date || ''),
            request_expected_updated_date: expectedForLock,
            stale_resume: true,
            stale_resumed_at: nowIso(),
          },
        });
        claim.receipt = await Receipt.get(claim.receipt.id);
        lockSummary = claim.receipt?.result_summary || lockSummary;
        operationOwner = true;
      }

      if (!operationOwner) {
        const summary = claim.receipt?.result_summary || {};
        let item: any = null;
        let createdByReceiptEvidence = false;
        if (summary.inventory_item_id) {
          item = summary.item_type === 'part' ? await Part.get(summary.inventory_item_id) : await Fluid.get(summary.inventory_item_id);
        }
        if (!item) {
          const createdByReceipt = summary.item_type === 'part'
            ? await Part.filter({ receive_receipt_key: key })
            : await Fluid.filter({ receive_receipt_key: key });
          item = canonical(createdByReceipt);
          createdByReceiptEvidence = !!item;
        }
        if (item && (summary.new_item === true || createdByReceiptEvidence)) {
          if (createdByReceiptEvidence && summary.new_item !== true) {
            await Receipt.update(claim.receipt.id, {
              result_summary: { ...summary, inventory_item_id: item.id, new_item: true, inventory_applied: true, safe_retry: false },
            }).catch(() => null);
          }
          const finalized = await finalizeReceive(Request, Receipt, existing, await Receipt.get(claim.receipt.id), item.id, body);
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'request_received', target_id: id, event_token: claim.receipt.operation_key
          }).catch(() => null);
          return Response.json({ success: true, reused: true, recovered: true, request: finalized, inventory_item: item });
        }
        if (item && summary.new_item === false && summary.inventory_applied === true) {
          const finalized = await finalizeReceive(Request, Receipt, existing, claim.receipt, item.id, body);
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'request_received', target_id: id, event_token: claim.receipt.operation_key
          }).catch(() => null);
          return Response.json({ success: true, reused: true, recovered: true, request: finalized, inventory_item: item });
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
          const wantedPartNumber = normIdentity(existing.part_number);
          const matches = (await loadAllEntityRows({ entity: Part, sort: 'part_number', label: 'Fleet parts for request receiving' }))
            .filter((row: any) => normIdentity(row.part_number) === wantedPartNumber);
          if (matches.length > 1) {
            await Receipt.update(claim.receipt.id, { status: 'failed', failed_at: nowIso(), error_message: 'Multiple Fleet parts share this exact part number.' });
            return Response.json({ error: 'Multiple Fleet parts share this exact part number. Choose/merge the inventory item before receiving.' }, { status: 409 });
          }
          inventoryItem = matches[0] || null;
        }
        if (inventoryItem) {
          beforeQuantity = num(inventoryItem.quantity_on_hand);
          afterQuantity = beforeQuantity + quantityReceived;
          const summary = { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: false, before_quantity: beforeQuantity, after_quantity: afterQuantity, safe_retry: false };
          await Receipt.update(claim.receipt.id, { result_summary: summary });
          try {
            const quantityResult = await setFleetInventoryQuantityIfUnchanged({
              entity: Part,
              itemId: inventoryItem.id,
              field: 'quantity_on_hand',
              expectedQuantity: beforeQuantity,
              nextQuantity: afterQuantity,
              label: `${inventoryItem.part_name || 'Fleet part'} stock`,
            });
            inventoryItem = quantityResult.item || await Part.get(inventoryItem.id);
            await Receipt.update(claim.receipt.id, { result_summary: { ...summary, inventory_applied: true, safe_retry: false } });
          } catch (error: any) {
            const safeRetry = error?.code === 'FLEET_INVENTORY_QUANTITY_CONFLICT';
            await Receipt.update(claim.receipt.id, {
              status: 'failed', failed_at: nowIso(), error_message: error?.message || String(error),
              result_summary: { ...summary, safe_retry: safeRetry, ...(safeRetry ? { inventory_applied: false } : { inventory_outcome_ambiguous: true }) },
            }).catch(() => null);
            return Response.json({ error: safeRetry
              ? 'Fleet part stock changed while this receipt was being applied. Reload the request and retry; no quantity was overwritten.'
              : 'Fleet part stock update could not be proven safe. Inventory was not replayed; review FleetOperationReceipt before retrying.' }, { status: 409 });
          }
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
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: true, before_quantity: 0, after_quantity: afterQuantity, inventory_applied: true, safe_retry: false } });
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
          const wantedName = normIdentity(existing.item_name);
          const wantedBrand = normIdentity(existing.manufacturer_brand || '');
          const matches = (await loadAllEntityRows({ entity: Fluid, sort: 'fluid_name', label: 'Fleet fluids for request receiving' }))
            .filter((row: any) => normIdentity(row.fluid_name) === wantedName && normIdentity(row.brand || '') === wantedBrand);
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
          const summary = { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: false, before_quantity: beforeQuantity, after_quantity: afterQuantity, unit: inventoryItem.unit || requestedUnit, safe_retry: false };
          await Receipt.update(claim.receipt.id, { result_summary: summary });
          try {
            const quantityResult = await setFleetInventoryQuantityIfUnchanged({
              entity: Fluid,
              itemId: inventoryItem.id,
              field: 'quantity',
              expectedQuantity: beforeQuantity,
              nextQuantity: afterQuantity,
              label: `${inventoryItem.fluid_name || 'Fleet fluid'} stock`,
            });
            inventoryItem = quantityResult.item || await Fluid.get(inventoryItem.id);
            await Receipt.update(claim.receipt.id, { result_summary: { ...summary, inventory_applied: true, safe_retry: false } });
          } catch (error: any) {
            const safeRetry = error?.code === 'FLEET_INVENTORY_QUANTITY_CONFLICT';
            await Receipt.update(claim.receipt.id, {
              status: 'failed', failed_at: nowIso(), error_message: error?.message || String(error),
              result_summary: { ...summary, safe_retry: safeRetry, ...(safeRetry ? { inventory_applied: false } : { inventory_outcome_ambiguous: true }) },
            }).catch(() => null);
            return Response.json({ error: safeRetry
              ? 'Fleet fluid stock changed while this receipt was being applied. Reload the request and retry; no quantity was overwritten.'
              : 'Fleet fluid stock update could not be proven safe. Inventory was not replayed; review FleetOperationReceipt before retrying.' }, { status: 409 });
          }
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
          await Receipt.update(claim.receipt.id, { result_summary: { ...(claim.receipt.result_summary || {}), inventory_item_id: inventoryItem.id, new_item: true, before_quantity: 0, after_quantity: afterQuantity, unit, inventory_applied: true, safe_retry: false } });
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
  } catch (error: any) {
    console.error('fleetRequestAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet request operation failed.' }, { status: 500 });
  }
});
