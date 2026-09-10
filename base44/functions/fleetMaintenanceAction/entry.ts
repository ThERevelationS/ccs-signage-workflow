import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const nowIso = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const ACTIVE_STATUSES = new Set(['open', 'assigned', 'in_progress']);
const DUE_TASK_STATUSES = new Set(['pending', 'overdue']);
const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const TASK_TYPES = new Set(['recurring', 'one_off']);

const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || a?.started_at || '') || 0;
  const bt = Date.parse(b?.created_date || b?.started_at || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Fleet maintenance administration requires a CCS admin.' }, { status: 403 }) };
  return { user };
}

async function claimReceipt(Receipt: any, data: any) {
  const applied = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'applied' }));
  if (applied) return { receipt: applied, applied: true, owner: false };
  const started = canonical(await Receipt.filter({ operation_key: data.operation_key, status: 'started' }));
  if (started) return { receipt: started, applied: false, owner: false, existingStarted: true };
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

const taskPatch = (source: any) => {
  const allowed = [
    'title', 'description', 'equipment_id', 'type', 'priority', 'frequency',
    'custom_frequency_value', 'custom_frequency_unit', 'estimated_duration',
    'start_date', 'assigned_to', 'status', 'parts_needed', 'fluids_needed'
  ];
  const out: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
  return out;
};

function generatedWorkOrderNumber(task: any) {
  const date = String(task.start_date || today()).replaceAll('-', '');
  const suffix = String(task.id || '').slice(-6).toUpperCase();
  return `FWO-${date}-${suffix}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;

    if (action === 'create') {
      const patch = taskPatch(body?.task || body);
      if (!String(patch.title || '').trim() || !String(patch.equipment_id || '').trim() || !TASK_TYPES.has(String(patch.type || ''))) {
        return Response.json({ error: 'Title, equipment, and maintenance type are required.' }, { status: 400 });
      }
      if (patch.status && !TASK_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid maintenance status.' }, { status: 400 });
      const equipment = await Equipment.get(patch.equipment_id);
      if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      const created = await Task.create({ ...patch, status: patch.status || 'pending' });
      return Response.json({ success: true, task: created });
    }

    if (action === 'generate_due') {
      const allTasks = await loadAllEntityRows({ entity: Task, sort: '-created_date', label: 'Fleet maintenance schedules' });
      const due = allTasks.filter((task: any) => DUE_TASK_STATUSES.has(task.status) && task.start_date && task.start_date <= today());
      const report: any[] = [];

      for (const task of due) {
        const existingOrders = await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: task.id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${task.id}` });
        const active = existingOrders.find((wo: any) => ACTIVE_STATUSES.has(wo.status));
        const key = `fleetmaint:${task.id}:due:${task.start_date}`;
        const exactGenerated = existingOrders.find((wo: any) => wo.generation_key === key);
        if (active || exactGenerated) {
          report.push({ task_id: task.id, title: task.title, due_date: task.start_date, action: 'skip', reason: active ? 'active_work_order_exists' : 'generation_key_exists', work_order_id: (active || exactGenerated)?.id });
        } else {
          report.push({ task_id: task.id, title: task.title, due_date: task.start_date, action: 'create', generation_key: key });
        }
      }

      if (body?.execute !== true) {
        return Response.json({ success: true, dry_run: true, due_count: due.length, would_create: report.filter((r) => r.action === 'create').length, report });
      }

      const results: any[] = [];
      for (const item of report) {
        if (item.action !== 'create') {
          results.push(item);
          continue;
        }
        const task = await Task.get(item.task_id);
        if (!task || !DUE_TASK_STATUSES.has(task.status) || !task.start_date || task.start_date > today()) {
          results.push({ ...item, action: 'skip', reason: 'task_changed_after_dry_run' });
          continue;
        }
        const activeNow = (await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: task.id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${task.id}` })).find((wo: any) => ACTIVE_STATUSES.has(wo.status));
        if (activeNow) {
          results.push({ ...item, action: 'skip', reason: 'active_work_order_exists', work_order_id: activeNow.id });
          continue;
        }

        const claim = await claimReceipt(Receipt, {
          operation_key: item.generation_key,
          operation_type: 'scheduled_generation',
          target_entity: 'FleetMaintenanceTask',
          target_id: task.id,
          actor_email: user.email || '',
          actor_user_id: user.id || '',
          result_summary: { due_date: task.start_date, task_title: task.title },
        });
        if (claim.applied) {
          const existing = canonical(await WorkOrder.filter({ generation_key: item.generation_key }));
          results.push({ ...item, action: 'skip', reason: 'receipt_already_applied', work_order_id: existing?.id || '' });
          continue;
        }
        if (!claim.owner) {
          const existing = canonical(await WorkOrder.filter({ generation_key: item.generation_key }));
          if (existing) {
            await Task.update(task.id, { status: 'in_progress', generation_key: item.generation_key, last_generated_for_date: task.start_date });
            await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), result_summary: { ...(claim.receipt.result_summary || {}), work_order_id: existing.id, recovered: true } });
            results.push({ ...item, action: 'recovered', work_order_id: existing.id });
          } else {
            results.push({ ...item, action: 'skip', reason: 'generation_in_progress_not_replayed' });
          }
          continue;
        }

        try {
          const workOrderNumber = generatedWorkOrderNumber(task);
          const duplicates = await WorkOrder.filter({ work_order_number: workOrderNumber });
          const created = duplicates?.[0] || await WorkOrder.create({
            work_order_number: workOrderNumber,
            equipment_id: task.equipment_id,
            maintenance_task_id: task.id,
            title: task.title,
            description: task.description || `Scheduled maintenance: ${task.title}`,
            type: 'scheduled',
            priority: task.priority || 'medium',
            status: 'open',
            assigned_to: task.assigned_to || '',
            generation_key: item.generation_key,
          });
          await Task.update(task.id, { status: 'in_progress', generation_key: item.generation_key, last_generated_for_date: task.start_date });
          await Receipt.update(claim.receipt.id, { status: 'applied', applied_at: nowIso(), result_summary: { ...(claim.receipt.result_summary || {}), work_order_id: created.id, work_order_number: created.work_order_number } });
          await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
            event_type: 'work_order_created', target_id: created.id, event_token: item.generation_key,
          }).catch(() => null);
          results.push({ ...item, action: 'created', work_order_id: created.id, work_order_number: created.work_order_number });
        } catch (error) {
          await Receipt.update(claim.receipt.id, { error_message: error?.message || String(error) }).catch(() => null);
          results.push({ ...item, action: 'error', error: error?.message || String(error) });
        }
      }

      return Response.json({ success: true, dry_run: false, due_count: due.length, created: results.filter((r) => r.action === 'created').length, recovered: results.filter((r) => r.action === 'recovered').length, results });
    }

    const id = String(body?.id || body?.task_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet maintenance task id is required.' }, { status: 400 });
    const existing = await Task.get(id);
    if (!existing) return Response.json({ error: 'Fleet maintenance task not found.' }, { status: 404 });

    if (action === 'update') {
      const patch = taskPatch(body?.task || body);
      if (patch.status && !TASK_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid maintenance status.' }, { status: 400 });
      if (patch.type && !TASK_TYPES.has(patch.type)) return Response.json({ error: 'Invalid maintenance type.' }, { status: 400 });
      if (patch.equipment_id && patch.equipment_id !== existing.equipment_id) {
        const equipment = await Equipment.get(patch.equipment_id);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
        const active = (await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${id}` })).find((wo: any) => ACTIVE_STATUSES.has(wo.status));
        if (active) return Response.json({ error: 'Equipment cannot be changed while this maintenance schedule has an active Fleet work order.' }, { status: 409 });
      }
      const updated = await Task.update(id, patch);
      return Response.json({ success: true, task: updated });
    }

    if (action === 'delete') {
      const linked = await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${id}` });
      if (linked.length) return Response.json({ error: 'This maintenance schedule has Fleet work-order history and cannot be deleted. Mark it completed instead.' }, { status: 409 });
      await Task.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Unsupported Fleet maintenance action.' }, { status: 400 });
  } catch (error) {
    console.error('fleetMaintenanceAction error:', error);
    return Response.json({ error: error?.message || 'Fleet maintenance operation failed.' }, { status: 500 });
  }
});
