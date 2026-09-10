import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { setFleetInventoryQuantityIfUnchanged } from '../../shared/fleetInventoryQuantity.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress']);
const STALE_CLAIM_MS = 30 * 60 * 1000;
const WORK_ORDER_STATUSES = new Set(['open', 'assigned', 'in_progress', 'completed', 'cancelled']);
const EQUIPMENT_STATUSES = new Set(['operational', 'maintenance', 'down', 'retired']);

const nowIso = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sameNumber = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) < 1e-9;
const FLUID_OUNCES_PER_UNIT: Record<string, number> = { ounces: 1, pints: 16, quarts: 32, gallons: 128 };
const fluidMinimumInStockUnit = (item: any) => {
  const minimum = num(item?.minimum_stock, NaN);
  const stockUnit = String(item?.unit || '').toLowerCase();
  const minimumUnit = String(item?.minimum_stock_unit || item?.unit || '').toLowerCase();
  if (!Number.isFinite(minimum) || !FLUID_OUNCES_PER_UNIT[stockUnit] || !FLUID_OUNCES_PER_UNIT[minimumUnit]) return NaN;
  return minimum * FLUID_OUNCES_PER_UNIT[minimumUnit] / FLUID_OUNCES_PER_UNIT[stockUnit];
};

const safePatch = (body: any) => {
  const allowed = [
    'equipment_id', 'maintenance_task_id', 'title', 'description', 'type', 'priority',
    'status', 'assigned_to', 'started_date', 'projected_completion_date', 'completed_date',
    'actual_hours', 'parts_used', 'fluids_used', 'corrective_action', 'before_photos',
    'after_photos', 'problem_photos', 'notes', 'total_cost'
  ];
  const out: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body || {}, key)) out[key] = body[key];
  return out;
};

const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || a?.started_at || '') || 0;
  const bt = Date.parse(b?.created_date || b?.started_at || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function authorize(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user, authorized: { role: 'admin', email: user.email } };
  const matches = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  const authorized = matches?.[0] || null;
  if (!authorized) return { error: Response.json({ error: 'This CCS account is not authorized for Fleet operations.' }, { status: 403 }) };
  return { user, authorized };
}

async function claimReceipt(Receipt: any, data: any) {
  const applied = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'applied' }));
  if (applied) return { receipt: applied, applied: true, owner: false };

  const started = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'started' }));
  if (started) return { receipt: started, applied: false, owner: false, existingStarted: true };

  const failed = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'failed' }));
  if (failed) {
    if (data.operation_type === 'inventory_usage' && failed?.result_summary?.safe_retry !== true) {
      return { receipt: failed, applied: false, owner: false, failedInventoryReceipt: true };
    }
    const retryToken = crypto.randomUUID();
    const stamp = nowIso();
    await Receipt.update(failed.id, {
      status: 'started',
      started_at: stamp,
      error_message: '',
      result_summary: { ...(failed.result_summary || {}), ...(data.result_summary || {}), retry_claim_token: retryToken, retry_claimed_at: stamp },
      payload_fingerprint: data.payload_fingerprint || failed.payload_fingerprint || '',
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    const refreshed = await Receipt.get(failed.id);
    if (refreshed?.result_summary?.retry_claim_token !== retryToken) return { receipt: refreshed || failed, applied: false, owner: false, concurrent: true };
    return { receipt: refreshed, applied: false, owner: true, retry: true };
  }

  const created = await Receipt.create({
    ...data,
    status: 'started',
    started_at: nowIso(),
  });
  await new Promise((resolve) => setTimeout(resolve, 75));
  const contenders = await Receipt.filter({ operation_key: data.operation_key, status: 'started' });
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(() => null);
    return { receipt: winner, applied: false, owner: false, concurrent: true };
  }
  return { receipt: created, applied: false, owner: true };
}

function calculateNextDueDate(task: any) {
  const baseText = String(task?.start_date || '').trim();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(baseText)
    ? new Date(`${baseText}T00:00:00Z`)
    : new Date(`${today()}T00:00:00Z`);
  let result = new Date(base);
  const frequency = task?.frequency;
  switch (frequency) {
    case 'daily': result.setUTCDate(result.getUTCDate() + 1); break;
    case 'weekly': result.setUTCDate(result.getUTCDate() + 7); break;
    case 'bi_weekly': result.setUTCDate(result.getUTCDate() + 14); break;
    case 'monthly': result.setUTCMonth(result.getUTCMonth() + 1); break;
    case 'bi_monthly': result.setUTCMonth(result.getUTCMonth() + 2); break;
    case 'quarterly': result.setUTCMonth(result.getUTCMonth() + 3); break;
    case 'every_6_months': result.setUTCMonth(result.getUTCMonth() + 6); break;
    case 'annually': result.setUTCFullYear(result.getUTCFullYear() + 1); break;
    case 'custom': {
      const value = Math.max(1, Math.floor(num(task?.custom_frequency_value, 1)));
      switch (task?.custom_frequency_unit) {
        case 'days': result.setUTCDate(result.getUTCDate() + value); break;
        case 'weeks': result.setUTCDate(result.getUTCDate() + value * 7); break;
        case 'months': result.setUTCMonth(result.getUTCMonth() + value); break;
        case 'years': result.setUTCFullYear(result.getUTCFullYear() + value); break;
        default: result.setUTCMonth(result.getUTCMonth() + 1);
      }
      break;
    }
    default: result.setUTCMonth(result.getUTCMonth() + 1);
  }
  const todayDate = new Date(`${today()}T00:00:00Z`);
  if (result < todayDate) {
    const fromToday = { ...task, start_date: today() };
    return calculateNextDueDate(fromToday);
  }
  return result.toISOString().slice(0, 10);
}

async function buildInventoryPlans(base44: any, Receipt: any, workOrder: any, patch: any, completionKey: string) {
  const parts = Array.isArray(patch.parts_used) ? patch.parts_used : (workOrder.parts_used || []);
  const fluids = Array.isArray(patch.fluids_used) ? patch.fluids_used : (workOrder.fluids_used || []);
  const grouped = new Map<string, any>();

  for (const line of parts) {
    const id = String(line?.part_id || '').trim();
    const quantity = num(line?.quantity);
    if (!id || id === 'custom' || quantity <= 0) continue;
    const key = `part:${id}`;
    const existing = grouped.get(key) || { item_type: 'part', item_id: id, quantity: 0, item_name: line?.part_name || '', unit: 'units' };
    existing.quantity += quantity;
    grouped.set(key, existing);
  }

  for (const line of fluids) {
    const id = String(line?.fluid_id || '').trim();
    const quantity = num(line?.quantity, num(line?.quantity_quarts));
    if (!id || id === 'custom' || quantity <= 0) continue;
    const key = `fluid:${id}`;
    const existing = grouped.get(key) || { item_type: 'fluid', item_id: id, quantity: 0, item_name: line?.fluid_name || '', unit: line?.unit || '' };
    existing.quantity += quantity;
    grouped.set(key, existing);
  }

  const equipmentId = String(patch.equipment_id ?? workOrder.equipment_id ?? '').trim();
  if (grouped.size > 0 && !equipmentId) {
    throw new Error('An equipment link is required before inventory-backed parts or fluids can be consumed.');
  }

  const plans: any[] = [];
  let index = 0;
  for (const plan of grouped.values()) {
    const operationKey = `${completionKey}:inventory:${index}:${plan.item_type}:${plan.item_id}`;
    const logKey = `${completionKey}:usage:${index}:${plan.item_type}:${plan.item_id}`;
    const entity = plan.item_type === 'part' ? base44.asServiceRole.entities.FleetPart : base44.asServiceRole.entities.FleetFluid;
    const item = await entity.get(plan.item_id);
    if (!item) throw new Error(`${plan.item_type === 'part' ? 'Part' : 'Fluid'} inventory item not found: ${plan.item_id}`);
    const existingReceipt = canonical(await Receipt.filter({ operation_key: operationKey }));
    const stored = existingReceipt?.result_summary || {};
    const hasMutationEvidence = existingReceipt?.status === 'applied' || stored.inventory_applied === true || (existingReceipt && stored.safe_retry !== true);

    if (hasMutationEvidence && Number.isFinite(Number(stored.before_quantity)) && Number.isFinite(Number(stored.after_quantity))) {
      plans.push({
        ...plan,
        item_name: item.part_name || item.fluid_name || plan.item_name,
        unit: stored.unit || (plan.item_type === 'part' ? 'units' : (item.unit || plan.unit || 'quarts')),
        before_quantity: Number(stored.before_quantity),
        after_quantity: Number(stored.after_quantity),
        operation_key: operationKey,
        log_key: stored.log_key || logKey,
      });
      index += 1;
      continue;
    }

    if (Array.isArray(item.compatible_equipment_ids) && item.compatible_equipment_ids.length && !item.compatible_equipment_ids.includes(equipmentId)) {
      throw new Error(`${item.part_name || item.fluid_name || plan.item_id} is not marked compatible with the selected Fleet equipment.`);
    }
    const before = plan.item_type === 'part' ? num(item.quantity_on_hand) : num(item.quantity);
    if (before + 1e-9 < plan.quantity) {
      throw new Error(`Insufficient stock for ${item.part_name || item.fluid_name || plan.item_id}. Available ${before}, requested ${plan.quantity}.`);
    }
    const unit = plan.item_type === 'part' ? 'units' : (item.unit || plan.unit || 'quarts');
    if (plan.item_type === 'fluid' && plan.unit && item.unit && plan.unit !== item.unit) {
      throw new Error(`Fluid unit mismatch for ${item.fluid_name || plan.item_id}: work order uses ${plan.unit}, inventory uses ${item.unit}.`);
    }
    const after = before - plan.quantity;
    plans.push({
      ...plan,
      item_name: item.part_name || item.fluid_name || plan.item_name,
      unit,
      before_quantity: before,
      after_quantity: after,
      operation_key: operationKey,
      log_key: logKey,
    });
    index += 1;
  }
  return plans;
}

async function applyInventoryPlan(base44: any, Receipt: any, plan: any, workOrder: any, actor: any) {
  const initialSummary = {
    work_order_id: workOrder.id,
    item_type: plan.item_type,
    item_id: plan.item_id,
    quantity_used: plan.quantity,
    unit: plan.unit,
    before_quantity: plan.before_quantity,
    after_quantity: plan.after_quantity,
    log_key: plan.log_key,
    safe_retry: false,
  };
  const receiptClaim = await claimReceipt(Receipt, {
    operation_key: plan.operation_key,
    operation_type: 'inventory_usage',
    target_entity: plan.item_type === 'part' ? 'FleetPart' : 'FleetFluid',
    target_id: plan.item_id,
    actor_email: actor.email || '',
    actor_user_id: actor.id || '',
    result_summary: initialSummary,
  });
  if (receiptClaim.applied) return { reused: true, receipt: receiptClaim.receipt };

  const entity = plan.item_type === 'part' ? base44.asServiceRole.entities.FleetPart : base44.asServiceRole.entities.FleetFluid;
  const Log = base44.asServiceRole.entities.FleetEquipmentLog;
  const summary = receiptClaim.receipt?.result_summary || initialSummary;
  const logKey = String(summary.log_key || plan.log_key);
  const usageLog = canonical(await Log.filter({ usage_receipt_key: logKey }));

  if (!receiptClaim.owner) {
    if (summary.inventory_applied === true) {
      if (!usageLog) {
        await Log.create({
          equipment_id: workOrder.equipment_id,
          item_id: plan.item_id,
          item_name: plan.item_name,
          item_type: plan.item_type,
          quantity_used: num(summary.quantity_used, plan.quantity),
          unit: summary.unit || plan.unit,
          work_order_id: workOrder.id,
          recorded_by: actor.email || 'system',
          usage_receipt_key: logKey,
        });
      }
      await Receipt.update(receiptClaim.receipt.id, {
        status: 'applied', applied_at: nowIso(), error_message: '',
        result_summary: { ...summary, safe_retry: false, recovered: true },
      });
      return { reused: true, recovered: true, receipt: receiptClaim.receipt };
    }
    throw new Error(`Inventory operation ${plan.operation_key} has no durable proof that its stock change was applied. It was not replayed automatically; review FleetOperationReceipt.`);
  }

  const expectedBefore = num(summary.before_quantity, NaN);
  const expectedAfter = num(summary.after_quantity, NaN);
  if (!Number.isFinite(expectedBefore) || !Number.isFinite(expectedAfter)) {
    throw new Error(`Inventory operation ${plan.operation_key} is missing reconciliation quantities.`);
  }

  let updatedItem: any = null;
  try {
    const quantityResult = await setFleetInventoryQuantityIfUnchanged({
      entity,
      itemId: plan.item_id,
      field: plan.item_type === 'part' ? 'quantity_on_hand' : 'quantity',
      expectedQuantity: expectedBefore,
      nextQuantity: expectedAfter,
      label: `${plan.item_name || 'Fleet inventory'} stock`,
    });
    updatedItem = quantityResult.item || await entity.get(plan.item_id);
  } catch (error: any) {
    const safeRetry = error?.code === 'FLEET_INVENTORY_QUANTITY_CONFLICT';
    await Receipt.update(receiptClaim.receipt.id, {
      status: 'failed', failed_at: nowIso(), error_message: error?.message || String(error),
      result_summary: { ...summary, safe_retry: safeRetry, ...(safeRetry ? { inventory_applied: false } : { inventory_outcome_ambiguous: true }) },
    }).catch(() => null);
    throw error;
  }

  await Receipt.update(receiptClaim.receipt.id, {
    result_summary: { ...summary, inventory_applied: true, safe_retry: false },
    error_message: '',
  });

  if (!usageLog) {
    await Log.create({
      equipment_id: workOrder.equipment_id,
      item_id: plan.item_id,
      item_name: plan.item_name,
      item_type: plan.item_type,
      quantity_used: num(summary.quantity_used, plan.quantity),
      unit: summary.unit || plan.unit,
      work_order_id: workOrder.id,
      recorded_by: actor.email || 'system',
      usage_receipt_key: logKey,
    });
  }

  await Receipt.update(receiptClaim.receipt.id, {
    status: 'applied', applied_at: nowIso(), error_message: '',
    result_summary: { ...summary, inventory_applied: true, safe_retry: false },
  });
  return { reused: false, receipt: receiptClaim.receipt, item: updatedItem };
}

async function applySchedule(base44: any, Receipt: any, workOrder: any, completionKey: string, actor: any) {
  if (!workOrder.maintenance_task_id) return { operation_key: '', applied: false };
  const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
  const task = await Task.get(workOrder.maintenance_task_id);
  if (!task) throw new Error(`Maintenance task ${workOrder.maintenance_task_id} was not found.`);

  const key = `${completionKey}:schedule:${task.id}`;
  const priorReceipt = canonical(await Receipt.filter({ operation_key: key }));
  const priorSummary = priorReceipt?.result_summary || null;
  const initialAfter = task.type === 'recurring'
    ? { status: 'pending', start_date: calculateNextDueDate(task) }
    : { status: 'completed', start_date: task.start_date || null };
  const initialSummary = priorSummary || {
    before_status: task.status,
    before_start_date: task.start_date || null,
    before_updated_date: task.updated_date || '',
    after_status: initialAfter.status,
    after_start_date: initialAfter.start_date,
    work_order_id: workOrder.id,
  };
  const after = {
    status: initialSummary.after_status,
    start_date: initialSummary.after_start_date ?? null,
  };

  const claim = await claimReceipt(Receipt, {
    operation_key: key,
    operation_type: 'maintenance_reschedule',
    target_entity: 'FleetMaintenanceTask',
    target_id: task.id,
    actor_email: actor.email || '',
    actor_user_id: actor.id || '',
    result_summary: initialSummary,
  });
  if (claim.applied) return { operation_key: key, applied: true, reused: true, after };

  const summary = claim.receipt?.result_summary || initialSummary;
  const current = await Task.get(task.id);
  if (!current) throw new Error(`Maintenance task ${task.id} was not found during completion.`);
  const isAfter = current.status === summary.after_status && String(current.start_date || '') === String(summary.after_start_date || '');
  const isBefore = current.status === summary.before_status
    && String(current.start_date || '') === String(summary.before_start_date || '')
    && String(current.updated_date || '') === String(summary.before_updated_date || '');

  if (isAfter) {
    await Receipt.update(claim.receipt.id, {
      status: 'applied',
      applied_at: nowIso(),
      error_message: '',
      result_summary: { ...summary, schedule_applied: true, recovered_from_after_state: !claim.owner },
    });
    return { operation_key: key, applied: true, reused: !claim.owner, recovered: !claim.owner, after };
  }

  if (!isBefore) {
    await Receipt.update(claim.receipt.id, {
      status: 'failed',
      failed_at: nowIso(),
      error_message: `Maintenance schedule changed after completion began; expected ${summary.before_status}/${summary.before_start_date || ''} at ${summary.before_updated_date || 'unknown version'}.`,
      result_summary: { ...summary, safe_retry: false, schedule_outcome_ambiguous: false, schedule_conflict: true },
    }).catch(() => null);
    const conflict: any = new Error('The linked maintenance schedule changed while this work order was being completed. The newer schedule was not overwritten. Review the schedule, then reconcile the completion receipt before retrying.');
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  try {
    const updated = await updateFleetRecordIfCurrent({
      entity: Task,
      id: task.id,
      expectedUpdatedAt: String(summary.before_updated_date || ''),
      patch: after,
      label: 'Fleet maintenance schedule completion reschedule',
    });
    await Receipt.update(claim.receipt.id, {
      status: 'applied',
      applied_at: nowIso(),
      error_message: '',
      result_summary: { ...summary, schedule_applied: true, schedule_updated_date: updated.updated_date || '' },
    });
    return { operation_key: key, applied: true, reused: !claim.owner, recovered: !claim.owner, after };
  } catch (error: any) {
    const latest = await Task.get(task.id).catch(() => null);
    const nowAfter = latest?.status === summary.after_status && String(latest?.start_date || '') === String(summary.after_start_date || '');
    if (nowAfter) {
      await Receipt.update(claim.receipt.id, {
        status: 'applied',
        applied_at: nowIso(),
        error_message: '',
        result_summary: { ...summary, schedule_applied: true, reconciled_after_update_error: true },
      }).catch(() => null);
      return { operation_key: key, applied: true, reused: true, recovered: true, after };
    }
    await Receipt.update(claim.receipt.id, {
      status: 'failed',
      failed_at: nowIso(),
      error_message: error?.message || String(error),
      result_summary: { ...summary, safe_retry: false, schedule_conflict: error?.code === 'FLEET_RECORD_CONFLICT' },
    }).catch(() => null);
    throw error;
  }
}

async function applyCompletionEquipmentStatus(base44: any, Receipt: any, mainReceipt: any, equipmentId: string, desiredStatus: string) {
  if (!equipmentId || !desiredStatus) return { applied: false, skipped: true };
  const Equipment = base44.asServiceRole.entities.FleetEquipment;
  let receipt = await Receipt.get(mainReceipt.id).catch(() => mainReceipt);
  const summary = receipt?.result_summary || {};
  if (summary.equipment_status_applied === true) {
    return { applied: true, reused: true, equipment: await Equipment.get(equipmentId).catch(() => null) };
  }

  const current = await Equipment.get(equipmentId).catch(() => null);
  if (!current) throw new Error(`Fleet equipment ${equipmentId} was not found during completion status update.`);

  if (String(current.status || '') === desiredStatus) {
    await Receipt.update(receipt.id, {
      result_summary: {
        ...summary,
        equipment_status_applied: true,
        equipment_status_reconciled_without_write: true,
        equipment_status_updated_date: current.updated_date || '',
      },
      error_message: '',
    });
    return { applied: true, reused: true, no_write: true, equipment: current };
  }

  const expectedUpdatedAt = String(summary.equipment_expected_updated_date || '').trim();
  if (!expectedUpdatedAt || String(current.updated_date || '') !== expectedUpdatedAt) {
    const message = 'Fleet equipment changed after the work-order completion dialog was opened. The newer equipment record was not overwritten; reconcile the completion receipt before retrying.';
    await Receipt.update(receipt.id, {
      status: 'failed',
      failed_at: nowIso(),
      error_message: message,
      result_summary: {
        ...summary,
        equipment_status_conflict: true,
        equipment_status_applied: false,
        equipment_current_updated_date: current.updated_date || '',
        equipment_current_status: current.status || '',
      },
    }).catch(() => null);
    const conflict: any = new Error(message);
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  try {
    const updated = await updateFleetRecordIfCurrent({
      entity: Equipment,
      id: equipmentId,
      expectedUpdatedAt,
      patch: { status: desiredStatus },
      label: 'Fleet equipment completion status',
    });
    await Receipt.update(receipt.id, {
      result_summary: {
        ...summary,
        equipment_status_applied: true,
        equipment_status_updated_date: updated.updated_date || '',
      },
      error_message: '',
    });
    return { applied: true, reused: false, equipment: updated };
  } catch (error: any) {
    const latest = await Equipment.get(equipmentId).catch(() => null);
    if (latest && String(latest.status || '') === desiredStatus) {
      await Receipt.update(receipt.id, {
        result_summary: {
          ...summary,
          equipment_status_applied: true,
          equipment_status_reconciled_after_update_error: true,
          equipment_status_updated_date: latest.updated_date || '',
        },
        error_message: '',
      }).catch(() => null);
      return { applied: true, reused: true, recovered: true, equipment: latest };
    }
    await Receipt.update(receipt.id, {
      status: 'failed',
      failed_at: nowIso(),
      error_message: error?.message || String(error),
      result_summary: {
        ...summary,
        equipment_status_applied: false,
        equipment_status_conflict: error?.code === 'FLEET_RECORD_CONFLICT',
      },
    }).catch(() => null);
    throw error;
  }
}

async function finalizeStartedCompletion(base44: any, Receipt: any, mainReceipt: any) {
  const plan = mainReceipt?.result_summary || {};
  const workOrderId = String(mainReceipt?.target_id || '');
  if (!workOrderId || !plan?.work_order_patch) return null;

  for (const key of plan.inventory_operation_keys || []) {
    const rows = await Receipt.filter({ operation_key: key, status: 'applied' });
    if (!rows?.length) return null;
  }
  if (plan.schedule_operation_key) {
    const rows = await Receipt.filter({ operation_key: plan.schedule_operation_key, status: 'applied' });
    if (!rows?.length) return null;
  }

  const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
  const patch = plan.work_order_patch;
  const current = await WorkOrder.get(workOrderId);
  if (!current) throw new Error(`Fleet work order ${workOrderId} no longer exists.`);
  if (String(current.completion_receipt_key || '') !== String(mainReceipt.operation_key || '')) {
    throw new Error(`Fleet work order ${workOrderId} no longer holds completion lock ${mainReceipt.operation_key}. Recovery was not applied.`);
  }

  const stamp = nowIso();
  let completed = current;
  if (current.status !== 'completed') {
    const lockedVersion = String(plan.work_order_locked_updated_date || current.updated_date || '').trim();
    if (!lockedVersion || lockedVersion !== String(current.updated_date || '')) {
      const conflict: any = new Error('Fleet work order changed after its completion lock was acquired. Recovery was not applied.');
      conflict.code = 'FLEET_RECORD_CONFLICT';
      throw conflict;
    }
    completed = await updateFleetRecordIfCurrent({
      entity: WorkOrder,
      id: workOrderId,
      expectedUpdatedAt: lockedVersion,
      patch: {
        ...patch,
        status: 'completed',
        completed_date: patch.completed_date || today(),
        completion_receipt_key: mainReceipt.operation_key,
        inventory_applied_at: stamp,
        schedule_applied_at: plan.schedule_operation_key ? stamp : null,
      },
      label: 'Fleet work order completion recovery',
    });
  }
  if (plan.equipment_status && patch.equipment_id) {
    await applyCompletionEquipmentStatus(base44, Receipt, mainReceipt, patch.equipment_id, plan.equipment_status);
  }
  const refreshedReceipt = await Receipt.get(mainReceipt.id).catch(() => mainReceipt);
  await Receipt.update(mainReceipt.id, {
    status: 'applied', applied_at: stamp,
    result_summary: { ...(refreshedReceipt?.result_summary || plan), finalized_from_retry: true },
    error_message: '',
  });
  return completed;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;

    if (action === 'create') {
      const patch = safePatch(body?.work_order || body);
      patch.status = WORK_ORDER_STATUSES.has(patch.status) ? patch.status : 'open';
      if (patch.status === 'completed') {
        return Response.json({ error: 'Create the work order first, then use the complete action so inventory and scheduling are processed safely.' }, { status: 400 });
      }
      if (!String(patch.title || '').trim() || !String(patch.equipment_id || '').trim()) {
        return Response.json({ error: 'Equipment and title are required for a new Fleet work order.' }, { status: 400 });
      }
      const equipment = await Equipment.get(patch.equipment_id);
      if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      if (patch.maintenance_task_id) {
        const task = await Task.get(patch.maintenance_task_id);
        if (!task) return Response.json({ error: 'Selected Fleet maintenance task was not found.' }, { status: 404 });
        if (task.equipment_id && task.equipment_id !== patch.equipment_id) {
          return Response.json({ error: 'Maintenance task belongs to different equipment.' }, { status: 409 });
        }
      }
      let workOrderNumber = String(body?.work_order_number || patch.work_order_number || '').trim();
      if (!workOrderNumber) workOrderNumber = `FWO-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}`;
      const duplicates = await WorkOrder.filter({ work_order_number: workOrderNumber });
      if (duplicates?.length) return Response.json({ error: 'That Fleet work-order number already exists.' }, { status: 409 });
      const created = await WorkOrder.create({ ...patch, work_order_number: workOrderNumber });
      if (patch.maintenance_task_id && ACTIVE_STATUSES.has(created.status)) {
        await Task.update(patch.maintenance_task_id, { status: 'in_progress' });
      }
      await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
        event_type: 'work_order_created', target_id: created.id, event_token: `created:${created.id}`
      }).catch(() => null);
      return Response.json({ success: true, work_order: created });
    }

    const id = String(body?.id || body?.work_order_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet work-order id is required.' }, { status: 400 });
    const existing = await WorkOrder.get(id);
    if (!existing) return Response.json({ error: 'Fleet work order not found.' }, { status: 404 });

    if (action === 'update') {
      const unresolvedCompletionReceipts = await Receipt.filter({
        operation_type: 'work_order_complete',
        target_id: id,
        status: { $in: ['started', 'failed'] },
      });
      const completionLock = canonical((unresolvedCompletionReceipts || []).filter((receipt: any) =>
        receipt?.result_summary?.work_order_lock_acquired === true || String(existing.completion_receipt_key || '') === String(receipt.operation_key || '')
      ));
      if (completionLock) {
        return Response.json({ error: 'This Fleet work order has a completion operation in progress or awaiting reconciliation. Finish/review that completion before editing the work order.' }, { status: 409 });
      }
      const patch = safePatch(body?.work_order || body);
      if (patch.status === 'completed' && existing.status !== 'completed') {
        return Response.json({ error: 'Use the complete action to complete a Fleet work order.' }, { status: 409 });
      }
      if (existing.status === 'completed' && patch.status && patch.status !== 'completed') {
        return Response.json({ error: 'Use the reopen action to reopen a completed Fleet work order.' }, { status: 409 });
      }
      if (existing.status === 'completed') {
        for (const field of ['parts_used', 'fluids_used', 'equipment_id', 'maintenance_task_id']) {
          if (Object.prototype.hasOwnProperty.call(patch, field)) {
            return Response.json({ error: `${field} cannot be changed on a completed work order because inventory/history has already been applied.` }, { status: 409 });
          }
        }
      }
      const nextEquipmentId = Object.prototype.hasOwnProperty.call(patch, 'equipment_id') ? patch.equipment_id : existing.equipment_id;
      const nextTaskId = Object.prototype.hasOwnProperty.call(patch, 'maintenance_task_id') ? patch.maintenance_task_id : existing.maintenance_task_id;
      if (nextEquipmentId) {
        const equipment = await Equipment.get(nextEquipmentId);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      }
      if (nextTaskId) {
        const task = await Task.get(nextTaskId);
        if (!task) return Response.json({ error: 'Selected Fleet maintenance task was not found.' }, { status: 404 });
        if (task.equipment_id && nextEquipmentId && task.equipment_id !== nextEquipmentId) {
          return Response.json({ error: 'Maintenance task belongs to different Fleet equipment.' }, { status: 409 });
        }
      }
      const updated = await updateFleetRecordIfCurrent({
        entity: WorkOrder,
        id,
        expectedUpdatedAt: String(body?.expected_updated_date || existing.updated_date || ''),
        patch,
        label: 'Fleet work order',
      });
      return Response.json({ success: true, work_order: updated });
    }

    if (action === 'reopen') {
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (expectedUpdatedAt && expectedUpdatedAt !== String(existing.updated_date || '')) {
        return Response.json({ error: 'This Fleet work order changed after the reopen confirmation was opened. Reload it before reopening.' }, { status: 409 });
      }
      const completedReceipts = await Receipt.filter({ operation_type: 'work_order_complete', target_id: id, status: 'applied' });
      const key = `fleetwo:${id}:reopen:${completedReceipts.length}`;
      const claim = await claimReceipt(Receipt, {
        operation_key: key,
        operation_type: 'work_order_reopen',
        target_entity: 'FleetMaintenanceWorkOrder',
        target_id: id,
        actor_email: user.email || '',
        actor_user_id: user.id || '',
        result_summary: { prior_status: existing.status, inventory_reversed: false },
      });
      if (claim.applied) {
        const current = await WorkOrder.get(id);
        return Response.json({ success: true, reused: true, work_order: current });
      }
      if (!claim.owner && existing.status !== 'completed') {
        return Response.json({ success: true, reused: true, work_order: existing });
      }
      if (existing.status !== 'completed') {
        return Response.json({ error: 'Only completed Fleet work orders can be reopened.' }, { status: 409 });
      }
      try {
        const reopened = await updateFleetRecordIfCurrent({
          entity: WorkOrder,
          id,
          expectedUpdatedAt: expectedUpdatedAt || String(existing.updated_date || ''),
          patch: { status: 'in_progress', completed_date: null },
          label: 'Fleet work order',
        });
        await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '' });
        return Response.json({ success: true, work_order: reopened, inventory_reversed: false });
      } catch (error: any) {
        await Receipt.update(claim.receipt.id, {
          status: 'failed',
          failed_at: nowIso(),
          error_message: error?.message || String(error),
          result_summary: { ...(claim.receipt.result_summary || {}), safe_retry: error?.code === 'FLEET_RECORD_CONFLICT' },
        }).catch(() => null);
        throw error;
      }
    }

    if (action === 'complete') {
      if (existing.status === 'completed') {
        const completionKey = String(existing.completion_receipt_key || '').trim();
        if (completionKey) {
          const completionReceipts = await Receipt.filter({ operation_key: completionKey });
          const completionReceipt = canonical(completionReceipts);
          if (completionReceipt && completionReceipt.status !== 'applied') {
            const summary = completionReceipt.result_summary || {};
            const equipmentId = String(summary?.work_order_patch?.equipment_id || existing.equipment_id || '').trim();
            const equipmentStatus = String(summary?.equipment_status || '').trim();
            if (equipmentId && equipmentStatus && EQUIPMENT_STATUSES.has(equipmentStatus)) {
              await applyCompletionEquipmentStatus(base44, Receipt, completionReceipt, equipmentId, equipmentStatus);
            }
            const refreshedReceipt = await Receipt.get(completionReceipt.id).catch(() => completionReceipt);
            await Receipt.update(completionReceipt.id, {
              status: 'applied',
              applied_at: existing.inventory_applied_at || nowIso(),
              error_message: '',
              result_summary: { ...(refreshedReceipt?.result_summary || summary), reconciled_from_completed_work_order: true },
            });
          }
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'work_order_completed', target_id: id, event_token: completionKey
          }).catch(() => null);
        }
        return Response.json({ success: true, reused: true, reconciled_receipt: !!completionKey, work_order: existing });
      }
      if (existing.status === 'cancelled') {
        return Response.json({ error: 'A cancelled Fleet work order must be reopened/edited before it can be completed.' }, { status: 409 });
      }

      let completionPatch = safePatch(body?.work_order || body);
      completionPatch.equipment_id = completionPatch.equipment_id ?? existing.equipment_id;
      completionPatch.maintenance_task_id = completionPatch.maintenance_task_id ?? existing.maintenance_task_id;
      completionPatch.title = completionPatch.title ?? existing.title;
      completionPatch.description = completionPatch.description ?? existing.description;
      completionPatch.type = completionPatch.type ?? existing.type;
      completionPatch.priority = completionPatch.priority ?? existing.priority;
      completionPatch.assigned_to = completionPatch.assigned_to ?? existing.assigned_to;
      completionPatch.started_date = completionPatch.started_date ?? existing.started_date;
      completionPatch.projected_completion_date = completionPatch.projected_completion_date ?? existing.projected_completion_date;
      completionPatch.actual_hours = completionPatch.actual_hours ?? existing.actual_hours;
      completionPatch.parts_used = completionPatch.parts_used ?? existing.parts_used ?? [];
      completionPatch.fluids_used = completionPatch.fluids_used ?? existing.fluids_used ?? [];
      completionPatch.corrective_action = completionPatch.corrective_action ?? existing.corrective_action;
      completionPatch.before_photos = completionPatch.before_photos ?? existing.before_photos ?? [];
      completionPatch.after_photos = completionPatch.after_photos ?? existing.after_photos ?? [];
      completionPatch.problem_photos = completionPatch.problem_photos ?? existing.problem_photos ?? [];
      completionPatch.notes = completionPatch.notes ?? existing.notes;
      completionPatch.total_cost = completionPatch.total_cost ?? existing.total_cost;
      completionPatch.completed_date = body?.completed_date || today();
      delete completionPatch.status;

      const appliedCompletions = await Receipt.filter({ operation_type: 'work_order_complete', target_id: id, status: 'applied' });
      const completionKey = `fleetwo:${id}:complete:${appliedCompletions.length}`;
      const unresolvedMain = canonical(await Receipt.filter({ operation_key: completionKey, status: { $in: ['started','failed'] } }));
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (!unresolvedMain && expectedUpdatedAt && expectedUpdatedAt !== String(existing.updated_date || '')) {
        return Response.json({ error: 'This Fleet work order changed after the completion dialog was opened. Reload it before completing so newer work, notes, or usage are not overwritten.' }, { status: 409 });
      }
      let equipmentStatus = String(body?.equipment_status || '').trim();
      if (unresolvedMain?.result_summary?.work_order_patch) {
        completionPatch = { ...unresolvedMain.result_summary.work_order_patch };
        equipmentStatus = String(unresolvedMain.result_summary.equipment_status || equipmentStatus || '').trim();
      }

      if (!String(completionPatch.corrective_action || '').trim()) {
        return Response.json({ error: 'Corrective action is required to complete a Fleet work order.' }, { status: 400 });
      }
      if (completionPatch.equipment_id) {
        const equipment = await Equipment.get(completionPatch.equipment_id);
        if (!equipment) return Response.json({ error: 'Linked Fleet equipment was not found.' }, { status: 404 });
      }
      if (completionPatch.maintenance_task_id) {
        const task = await Task.get(completionPatch.maintenance_task_id);
        if (!task) return Response.json({ error: 'Linked Fleet maintenance task was not found.' }, { status: 404 });
        if (task.equipment_id && completionPatch.equipment_id && task.equipment_id !== completionPatch.equipment_id) {
          return Response.json({ error: 'Linked maintenance task belongs to different Fleet equipment.' }, { status: 409 });
        }
      }

      if (equipmentStatus && !EQUIPMENT_STATUSES.has(equipmentStatus)) {
        return Response.json({ error: 'Invalid equipment status.' }, { status: 400 });
      }

      const inventoryPlans = await buildInventoryPlans(base44, Receipt, existing, completionPatch, completionKey);
      let schedulePreview: any = null;
      if (completionPatch.maintenance_task_id) {
        const task = await Task.get(completionPatch.maintenance_task_id);
        schedulePreview = task?.type === 'recurring'
          ? { status: 'pending', start_date: calculateNextDueDate(task) }
          : { status: 'completed', start_date: task?.start_date || null };
      }
      const scheduleKey = completionPatch.maintenance_task_id
        ? `${completionKey}:schedule:${completionPatch.maintenance_task_id}`
        : '';

      const mainClaim = await claimReceipt(Receipt, {
        operation_key: completionKey,
        operation_type: 'work_order_complete',
        target_entity: 'FleetMaintenanceWorkOrder',
        target_id: id,
        actor_email: user.email || '',
        actor_user_id: user.id || '',
        result_summary: {
          work_order_patch: completionPatch,
          equipment_status: equipmentStatus || '',
          inventory_operation_keys: inventoryPlans.map((p) => p.operation_key),
          schedule_operation_key: scheduleKey,
          schedule_preview: schedulePreview,
          work_order_expected_updated_date: expectedUpdatedAt || String(existing.updated_date || ''),
        },
      });

      if (mainClaim.applied) {
        const current = await WorkOrder.get(id);
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: 'work_order_completed', target_id: id, event_token: current?.completion_receipt_key || completionKey
        }).catch(() => null);
        return Response.json({ success: true, reused: true, work_order: current });
      }
      let activeMainReceipt = mainClaim.receipt;
      let lockedWorkOrderVersion = '';
      let lockCurrent = await WorkOrder.get(id);
      let lockHeld = String(lockCurrent?.completion_receipt_key || '') === completionKey;
      let lockSummary = activeMainReceipt?.result_summary || {};

      if (lockHeld) {
        const storedLockedVersion = String(lockSummary.work_order_locked_updated_date || '').trim();
        if (storedLockedVersion && storedLockedVersion !== String(lockCurrent?.updated_date || '')) {
          return Response.json({
            error: 'This Fleet work order changed after its completion lock was acquired. Completion was not replayed; review FleetOperationReceipt before proceeding.',
            operation_key: completionKey,
          }, { status: 409 });
        }
        lockedWorkOrderVersion = String(lockCurrent?.updated_date || '');
        if (lockSummary.work_order_lock_acquired !== true || !storedLockedVersion) {
          await Receipt.update(activeMainReceipt.id, {
            result_summary: {
              ...lockSummary,
              work_order_lock_acquired: true,
              work_order_locked_updated_date: lockedWorkOrderVersion,
              work_order_expected_updated_date: lockSummary.work_order_expected_updated_date || expectedUpdatedAt || String(existing.updated_date || ''),
            },
          });
          activeMainReceipt = await Receipt.get(activeMainReceipt.id);
          lockSummary = activeMainReceipt?.result_summary || lockSummary;
        }
      } else if (mainClaim.owner) {
        const expectedForLock = expectedUpdatedAt || String(existing.updated_date || '');
        if (!expectedForLock) {
          await Receipt.delete(activeMainReceipt.id).catch(() => null);
          return Response.json({ error: 'Fleet work-order version is missing. Reload before completing.' }, { status: 409 });
        }
        try {
          const locked = await updateFleetRecordIfCurrent({
            entity: WorkOrder,
            id,
            expectedUpdatedAt: expectedForLock,
            patch: { completion_receipt_key: completionKey },
            label: 'Fleet work order',
          });
          lockedWorkOrderVersion = String(locked.updated_date || '');
          lockHeld = true;
          await Receipt.update(activeMainReceipt.id, {
            result_summary: {
              ...lockSummary,
              work_order_lock_acquired: true,
              work_order_locked_updated_date: lockedWorkOrderVersion,
              work_order_expected_updated_date: expectedForLock,
            },
          });
          activeMainReceipt = await Receipt.get(activeMainReceipt.id);
          lockSummary = activeMainReceipt?.result_summary || lockSummary;
        } catch (error: any) {
          const after = await WorkOrder.get(id).catch(() => null);
          if (String(after?.completion_receipt_key || '') === completionKey) {
            lockedWorkOrderVersion = String(after?.updated_date || '');
            lockHeld = true;
            await Receipt.update(activeMainReceipt.id, {
              result_summary: {
                ...lockSummary,
                work_order_lock_acquired: true,
                work_order_locked_updated_date: lockedWorkOrderVersion,
                work_order_expected_updated_date: expectedForLock,
                lock_verified_after_error: true,
              },
            });
            activeMainReceipt = await Receipt.get(activeMainReceipt.id);
            lockSummary = activeMainReceipt?.result_summary || lockSummary;
          } else {
            await Receipt.delete(activeMainReceipt.id).catch(() => null);
            throw error;
          }
        }
      }

      if (!mainClaim.owner && !lockHeld) {
        const startedAt = Date.parse(activeMainReceipt?.started_at || activeMainReceipt?.created_date || '') || 0;
        const stale = !!startedAt && (Date.now() - startedAt) >= STALE_CLAIM_MS;
        if (!stale) {
          return Response.json({
            error: 'This completion claim is already in progress but has not acquired the work-order lock yet. It was not replayed.',
            operation_key: completionKey,
          }, { status: 409 });
        }
        const subKeys = [...(lockSummary.inventory_operation_keys || []), lockSummary.schedule_operation_key].filter(Boolean);
        for (const key of subKeys) {
          const rows = await Receipt.filter({ operation_key: key });
          if (rows?.length) {
            return Response.json({
              error: 'This stale completion has side-effect receipts but no work-order lock evidence. It cannot be resumed automatically; review FleetOperationReceipt.',
              operation_key: completionKey,
            }, { status: 409 });
          }
        }
        const expectedForLock = String(lockSummary.work_order_expected_updated_date || expectedUpdatedAt || '').trim();
        lockCurrent = await WorkOrder.get(id);
        if (!expectedForLock || String(lockCurrent?.updated_date || '') !== expectedForLock) {
          await Receipt.delete(activeMainReceipt.id).catch(() => null);
          return Response.json({
            error: 'The stale completion claim expired before acquiring its lock and the work order has since changed. No side effects were replayed; reload and complete again.',
          }, { status: 409 });
        }
        try {
          const locked = await updateFleetRecordIfCurrent({
            entity: WorkOrder,
            id,
            expectedUpdatedAt: expectedForLock,
            patch: { completion_receipt_key: completionKey },
            label: 'Fleet work order',
          });
          lockedWorkOrderVersion = String(locked.updated_date || '');
          lockHeld = true;
          await Receipt.update(activeMainReceipt.id, {
            started_at: nowIso(),
            error_message: '',
            result_summary: {
              ...lockSummary,
              work_order_lock_acquired: true,
              work_order_locked_updated_date: lockedWorkOrderVersion,
              stale_resume: true,
              stale_resumed_at: nowIso(),
            },
          });
          activeMainReceipt = await Receipt.get(activeMainReceipt.id);
          lockSummary = activeMainReceipt?.result_summary || lockSummary;
        } catch (error: any) {
          await Receipt.delete(activeMainReceipt.id).catch(() => null);
          throw error;
        }
      }

      if (!mainClaim.owner) {
        const finalized = await finalizeStartedCompletion(base44, Receipt, activeMainReceipt);
        if (finalized) {
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'work_order_completed', target_id: id, event_token: finalized?.completion_receipt_key || completionKey
          }).catch(() => null);
          return Response.json({ success: true, reused: true, recovered: true, work_order: finalized });
        }
        const startedAt = Date.parse(activeMainReceipt?.started_at || activeMainReceipt?.created_date || '') || 0;
        const stale = !!startedAt && (Date.now() - startedAt) >= STALE_CLAIM_MS;
        if (!stale) {
          return Response.json({
            error: 'This completion is already in progress. It was not replayed because one or more side effects are not yet safely reconcilable. Review FleetOperationReceipt before retrying.',
            operation_key: completionKey,
          }, { status: 409 });
        }
        await Receipt.update(activeMainReceipt.id, {
          started_at: nowIso(),
          error_message: '',
          result_summary: { ...(activeMainReceipt.result_summary || {}), stale_resume: true, stale_resumed_at: nowIso() },
        });
        activeMainReceipt = await Receipt.get(activeMainReceipt.id);
      }

      try {
        for (const plan of inventoryPlans) {
          await applyInventoryPlan(base44, Receipt, plan, { ...existing, ...completionPatch, id }, user);
        }
        const schedule = await applySchedule(base44, Receipt, { ...existing, ...completionPatch, id }, completionKey, user);
        if (!lockedWorkOrderVersion) throw new Error('Fleet completion lock is missing its work-order version. Completion was not finalized.');
        const stamp = nowIso();
        const completed = await updateFleetRecordIfCurrent({
          entity: WorkOrder,
          id,
          expectedUpdatedAt: lockedWorkOrderVersion,
          patch: {
            ...completionPatch,
            status: 'completed',
            completed_date: completionPatch.completed_date || today(),
            completion_receipt_key: completionKey,
            inventory_applied_at: stamp,
            schedule_applied_at: schedule?.applied ? stamp : null,
          },
          label: 'Fleet work order completion',
        });
        if (equipmentStatus && completionPatch.equipment_id) {
          await Equipment.update(completionPatch.equipment_id, { status: equipmentStatus });
        }
        await Receipt.update(activeMainReceipt.id, {
          status: 'applied',
          applied_at: stamp,
          result_summary: {
            ...(activeMainReceipt.result_summary || {}),
            inventory_operations_applied: inventoryPlans.length,
            schedule_result: schedule || null,
          },
        });
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: 'work_order_completed', target_id: id, event_token: completionKey
        }).catch(() => null);
        for (const plan of inventoryPlans) {
          const entity = plan.item_type === 'part' ? base44.asServiceRole.entities.FleetPart : base44.asServiceRole.entities.FleetFluid;
          const item = await entity.get(plan.item_id).catch(() => null);
          const appliedRows = await Receipt.filter({ operation_key: plan.operation_key, status: 'applied' });
          const appliedSummary = canonical(appliedRows)?.result_summary || {};
          const actualBefore = num(appliedSummary.before_quantity, NaN);
          const actualAfter = num(appliedSummary.after_quantity, NaN);
          const minimum = plan.item_type === 'part' ? num(item?.minimum_stock, NaN) : fluidMinimumInStockUnit(item);
          if (item && Number.isFinite(minimum) && Number.isFinite(actualBefore) && Number.isFinite(actualAfter) && actualBefore > minimum && actualAfter <= minimum) {
            await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
              event_type: plan.item_type === 'part' ? 'low_stock_part' : 'low_stock_fluid',
              target_id: plan.item_id,
              event_token: plan.operation_key,
            }).catch(() => null);
          }
        }
        return Response.json({
          success: true,
          work_order: completed,
          inventory_operations_applied: inventoryPlans.length,
          schedule: schedule || null,
        });
      } catch (error) {
        await Receipt.update(activeMainReceipt.id, {
          status: 'failed',
          failed_at: nowIso(),
          error_message: error?.message || String(error),
        }).catch(() => null);
        throw error;
      }
    }

    return Response.json({ error: 'Unsupported Fleet work-order action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetWorkOrderAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT' || error?.code === 'FLEET_INVENTORY_QUANTITY_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet work-order operation failed.' }, { status: 500 });
  }
});
