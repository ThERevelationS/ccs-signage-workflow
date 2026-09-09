import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress']);
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

async function buildInventoryPlans(base44: any, workOrder: any, patch: any, completionKey: string) {
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

  if (grouped.size > 0 && !String(patch.equipment_id ?? workOrder.equipment_id ?? '').trim()) {
    throw new Error('An equipment link is required before inventory-backed parts or fluids can be consumed.');
  }

  const plans: any[] = [];
  let index = 0;
  for (const plan of grouped.values()) {
    const entity = plan.item_type === 'part' ? base44.asServiceRole.entities.FleetPart : base44.asServiceRole.entities.FleetFluid;
    const item = await entity.get(plan.item_id);
    if (!item) throw new Error(`${plan.item_type === 'part' ? 'Part' : 'Fluid'} inventory item not found: ${plan.item_id}`);
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
      operation_key: `${completionKey}:inventory:${index}:${plan.item_type}:${plan.item_id}`,
      log_key: `${completionKey}:usage:${index}:${plan.item_type}:${plan.item_id}`,
    });
    index += 1;
  }
  return plans;
}

async function applyInventoryPlan(base44: any, Receipt: any, plan: any, workOrder: any, actor: any) {
  const receiptClaim = await claimReceipt(Receipt, {
    operation_key: plan.operation_key,
    operation_type: 'inventory_usage',
    target_entity: plan.item_type === 'part' ? 'FleetPart' : 'FleetFluid',
    target_id: plan.item_id,
    actor_email: actor.email || '',
    actor_user_id: actor.id || '',
    result_summary: {
      work_order_id: workOrder.id,
      item_type: plan.item_type,
      item_id: plan.item_id,
      quantity_used: plan.quantity,
      unit: plan.unit,
      before_quantity: plan.before_quantity,
      after_quantity: plan.after_quantity,
      log_key: plan.log_key,
    },
  });
  if (receiptClaim.applied) return { reused: true, receipt: receiptClaim.receipt };

  const entity = plan.item_type === 'part' ? base44.asServiceRole.entities.FleetPart : base44.asServiceRole.entities.FleetFluid;
  const Log = base44.asServiceRole.entities.FleetEquipmentLog;
  const item = await entity.get(plan.item_id);
  const current = plan.item_type === 'part' ? num(item?.quantity_on_hand) : num(item?.quantity);
  const logs = await Log.filter({ usage_receipt_key: plan.log_key });
  const usageLog = canonical(logs);

  if (!receiptClaim.owner) {
    if (usageLog && sameNumber(current, plan.after_quantity)) {
      await Receipt.update(receiptClaim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '' });
      return { reused: true, recovered: true, receipt: receiptClaim.receipt };
    }
    if (usageLog && sameNumber(current, plan.before_quantity)) {
      await entity.update(plan.item_id, plan.item_type === 'part'
        ? { quantity_on_hand: plan.after_quantity }
        : { quantity: plan.after_quantity });
      await Receipt.update(receiptClaim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '' });
      return { reused: true, recovered: true, receipt: receiptClaim.receipt };
    }
    throw new Error(`Inventory operation ${plan.operation_key} is already in progress and cannot be safely reconciled automatically.`);
  }

  if (!sameNumber(current, plan.before_quantity)) {
    await Receipt.update(receiptClaim.receipt.id, {
      status: 'failed', failed_at: nowIso(),
      error_message: `Inventory changed after completion preflight. Expected ${plan.before_quantity}, found ${current}.`,
    });
    throw new Error(`Inventory changed while completing this work order for ${plan.item_name}. Reload and try again.`);
  }

  if (!usageLog) {
    await Log.create({
      equipment_id: workOrder.equipment_id,
      item_id: plan.item_id,
      item_name: plan.item_name,
      item_type: plan.item_type,
      quantity_used: plan.quantity,
      unit: plan.unit,
      work_order_id: workOrder.id,
      recorded_by: actor.email || 'system',
      usage_receipt_key: plan.log_key,
    });
  }

  await entity.update(plan.item_id, plan.item_type === 'part'
    ? { quantity_on_hand: plan.after_quantity }
    : { quantity: plan.after_quantity });
  await Receipt.update(receiptClaim.receipt.id, { status: 'applied', applied_at: nowIso() });
  return { reused: false, receipt: receiptClaim.receipt };
}

async function applySchedule(base44: any, Receipt: any, workOrder: any, completionKey: string, actor: any) {
  if (!workOrder.maintenance_task_id) return { operation_key: '', applied: false };
  const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
  const task = await Task.get(workOrder.maintenance_task_id);
  if (!task) throw new Error(`Maintenance task ${workOrder.maintenance_task_id} was not found.`);

  const after = task.type === 'recurring'
    ? { status: 'pending', start_date: calculateNextDueDate(task) }
    : { status: 'completed', start_date: task.start_date || null };
  const key = `${completionKey}:schedule:${task.id}`;
  const claim = await claimReceipt(Receipt, {
    operation_key: key,
    operation_type: 'maintenance_reschedule',
    target_entity: 'FleetMaintenanceTask',
    target_id: task.id,
    actor_email: actor.email || '',
    actor_user_id: actor.id || '',
    result_summary: {
      before_status: task.status,
      before_start_date: task.start_date || null,
      after_status: after.status,
      after_start_date: after.start_date,
      work_order_id: workOrder.id,
    },
  });
  if (claim.applied) return { operation_key: key, applied: true, reused: true, after };

  const current = await Task.get(task.id);
  const isAfter = current?.status === after.status && String(current?.start_date || '') === String(after.start_date || '');
  const summary = claim.receipt?.result_summary || {};
  const isBefore = current?.status === summary.before_status && String(current?.start_date || '') === String(summary.before_start_date || '');

  if (!claim.owner) {
    if (isAfter) {
      await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '' });
      return { operation_key: key, applied: true, reused: true, recovered: true, after };
    }
    if (isBefore) {
      await Task.update(task.id, after);
      await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), error_message: '' });
      return { operation_key: key, applied: true, reused: true, recovered: true, after };
    }
    throw new Error(`Maintenance schedule operation ${key} is ambiguous and needs review.`);
  }

  await Task.update(task.id, after);
  await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso() });
  return { operation_key: key, applied: true, reused: false, after };
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
  const Equipment = base44.asServiceRole.entities.FleetEquipment;
  const patch = plan.work_order_patch;
  if (plan.equipment_status && patch.equipment_id) {
    await Equipment.update(patch.equipment_id, { status: plan.equipment_status });
  }
  const stamp = nowIso();
  const completed = await WorkOrder.update(workOrderId, {
    ...patch,
    status: 'completed',
    completed_date: patch.completed_date || today(),
    completion_receipt_key: mainReceipt.operation_key,
    inventory_applied_at: stamp,
    schedule_applied_at: plan.schedule_operation_key ? stamp : null,
  });
  await Receipt.update(mainReceipt.id, {
    status: 'applied', applied_at: stamp,
    result_summary: { ...plan, finalized_from_retry: true },
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
      if (patch.equipment_id) {
        const equipment = await Equipment.get(patch.equipment_id);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      }
      const updated = await WorkOrder.update(id, patch);
      return Response.json({ success: true, work_order: updated });
    }

    if (action === 'reopen') {
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
      const reopened = await WorkOrder.update(id, { status: 'in_progress', completed_date: null });
      await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso() });
      return Response.json({ success: true, work_order: reopened, inventory_reversed: false });
    }

    if (action === 'complete') {
      if (existing.status === 'completed') {
        return Response.json({ success: true, reused: true, work_order: existing });
      }
      if (existing.status === 'cancelled') {
        return Response.json({ error: 'A cancelled Fleet work order must be reopened/edited before it can be completed.' }, { status: 409 });
      }

      const completionPatch = safePatch(body?.work_order || body);
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
      }

      const appliedCompletions = await Receipt.filter({ operation_type: 'work_order_complete', target_id: id, status: 'applied' });
      const completionKey = `fleetwo:${id}:complete:${appliedCompletions.length}`;
      const equipmentStatus = String(body?.equipment_status || '').trim();
      if (equipmentStatus && !EQUIPMENT_STATUSES.has(equipmentStatus)) {
        return Response.json({ error: 'Invalid equipment status.' }, { status: 400 });
      }

      const inventoryPlans = await buildInventoryPlans(base44, existing, completionPatch, completionKey);
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
        },
      });

      if (mainClaim.applied) {
        const current = await WorkOrder.get(id);
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
          event_type: 'work_order_completed', target_id: id, event_token: current?.completion_receipt_key || completionKey
        }).catch(() => null);
        return Response.json({ success: true, reused: true, work_order: current });
      }
      if (!mainClaim.owner) {
        const finalized = await finalizeStartedCompletion(base44, Receipt, mainClaim.receipt);
        if (finalized) {
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'work_order_completed', target_id: id, event_token: finalized?.completion_receipt_key || completionKey
          }).catch(() => null);
          return Response.json({ success: true, reused: true, recovered: true, work_order: finalized });
        }
        return Response.json({
          error: 'This completion is already in progress. It was not replayed because one or more side effects are not yet safely reconcilable. Review FleetOperationReceipt before retrying.',
          operation_key: completionKey,
        }, { status: 409 });
      }

      try {
        for (const plan of inventoryPlans) {
          await applyInventoryPlan(base44, Receipt, plan, { ...existing, ...completionPatch, id }, user);
        }
        const schedule = await applySchedule(base44, Receipt, { ...existing, ...completionPatch, id }, completionKey, user);
        if (equipmentStatus && completionPatch.equipment_id) {
          await Equipment.update(completionPatch.equipment_id, { status: equipmentStatus });
        }
        const stamp = nowIso();
        const completed = await WorkOrder.update(id, {
          ...completionPatch,
          status: 'completed',
          completed_date: completionPatch.completed_date || today(),
          completion_receipt_key: completionKey,
          inventory_applied_at: stamp,
          schedule_applied_at: schedule?.applied ? stamp : null,
        });
        await Receipt.update(mainClaim.receipt.id, {
          status: 'applied',
          applied_at: stamp,
          result_summary: {
            ...(mainClaim.receipt.result_summary || {}),
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
          const minimum = plan.item_type === 'part' ? num(item?.minimum_stock, NaN) : fluidMinimumInStockUnit(item);
          if (item && Number.isFinite(minimum) && plan.before_quantity > minimum && plan.after_quantity <= minimum) {
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
        await Receipt.update(mainClaim.receipt.id, { error_message: error?.message || String(error) }).catch(() => null);
        throw error;
      }
    }

    return Response.json({ error: 'Unsupported Fleet work-order action.' }, { status: 400 });
  } catch (error) {
    console.error('fleetWorkOrderAction error:', error);
    return Response.json({ error: error?.message || 'Fleet work-order operation failed.' }, { status: 500 });
  }
});
