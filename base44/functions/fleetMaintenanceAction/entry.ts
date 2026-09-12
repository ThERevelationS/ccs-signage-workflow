import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

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

const normText = (value: unknown) => String(value ?? '').trim();
const normNumber = (value: unknown) => value == null || value === '' ? null : Number(value);
const maintenanceCreateComparable = (source: any) => ({
  title: normText(source?.title),
  description: normText(source?.description),
  equipment_id: normText(source?.equipment_id),
  type: normText(source?.type),
  priority: normText(source?.priority || 'medium'),
  frequency: normText(source?.frequency),
  custom_frequency_value: normNumber(source?.custom_frequency_value),
  custom_frequency_unit: normText(source?.custom_frequency_unit),
  estimated_duration: normNumber(source?.estimated_duration),
  start_date: normText(source?.start_date),
  assigned_to: normText(source?.assigned_to),
  status: normText(source?.status || 'pending'),
  parts_needed: Array.isArray(source?.parts_needed) ? source.parts_needed.map((item: any) => ({
    part_name: normText(item?.part_name), quantity: normNumber(item?.quantity), notes: normText(item?.notes),
  })) : [],
  fluids_needed: Array.isArray(source?.fluids_needed) ? source.fluids_needed.map((item: any) => ({
    fluid_type: normText(item?.fluid_type), quantity: normNumber(item?.quantity), unit: normText(item?.unit || 'quarts'), notes: normText(item?.notes),
  })) : [],
});
const sameMaintenanceCreate = (row: any, desired: any) => JSON.stringify(maintenanceCreateComparable(row)) === JSON.stringify(maintenanceCreateComparable(desired));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;

    if (action === 'create') {
      const creationKey = String(body?.creation_key || '').trim();
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: 'Maintenance schedule create identity is missing or invalid. Reopen New Schedule and try again.' }, { status: 409 });
      }
      const patch = taskPatch(body?.task || body);
      if (!String(patch.title || '').trim() || !String(patch.equipment_id || '').trim() || !TASK_TYPES.has(String(patch.type || ''))) {
        return Response.json({ error: 'Title, equipment, and maintenance type are required.' }, { status: 400 });
      }
      if (patch.status && !TASK_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid maintenance status.' }, { status: 400 });
      const equipment = await Equipment.get(patch.equipment_id);
      if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
      if (equipment.status === 'retired') return Response.json({ error: 'Retired Fleet equipment is archived and cannot receive a new maintenance schedule. Reactivate the equipment first.' }, { status: 409 });
      const desired = { ...patch, status: patch.status || 'pending', priority: patch.priority || 'medium' };
      const existingRows = await Task.filter({ creation_key: creationKey });
      if (existingRows.length > 1) return Response.json({ error: 'Multiple Fleet maintenance schedules share this create identity. Review the duplicates before retrying.' }, { status: 409 });
      if (existingRows[0]) {
        const reused = existingRows[0];
        if (!sameMaintenanceCreate(reused, desired)) {
          return Response.json({ error: 'This create identity already belongs to different maintenance schedule details. Reopen New Schedule before creating another schedule.' }, { status: 409 });
        }
        return Response.json({ success: true, reused: true, task: reused });
      }
      const created = await Task.create({ ...desired, creation_key: creationKey });
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Task.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Task.delete(created.id).catch(() => null);
          if (!sameMaintenanceCreate(winner, desired)) {
            return Response.json({ error: 'Another maintenance schedule create won this identity with different details. The losing duplicate was discarded; reopen New Schedule.' }, { status: 409 });
          }
          return Response.json({ success: true, reused: true, task: winner });
        }
        for (const duplicate of contenders) if (duplicate.id !== winner.id) await Task.delete(duplicate.id).catch(() => null);
      }
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

      const delegated = await base44.asServiceRole.functions.invoke('fleetScheduledMaintenanceGeneration', {});
      if (delegated?.data?.error) {
        return Response.json({ error: delegated.data.error, delegated: true }, { status: 500 });
      }
      return Response.json({ ...(delegated?.data || {}), delegated: true, legacy_action: 'generate_due' });
    }

    const id = String(body?.id || body?.task_id || '').trim();
    if (!id) return Response.json({ error: 'Fleet maintenance task id is required.' }, { status: 400 });
    const existing = await Task.get(id);
    if (!existing) return Response.json({ error: 'Fleet maintenance task not found.' }, { status: 404 });
    const activeGenerationLock = async () => {
      const key = String(existing.generation_key || '').trim();
      if (!key || !DUE_TASK_STATUSES.has(existing.status)) return null;
      const rows = await Receipt.filter({ operation_key: key, status: { $in: ['started', 'failed'] } });
      return canonical((rows || []).filter((row: any) =>
        row.operation_type === 'scheduled_generation' && row?.result_summary?.task_lock_acquired === true
      ));
    };
    const activeCompletionReschedule = async () => {
      const rows = await Receipt.filter({
        operation_type: 'maintenance_reschedule',
        target_id: id,
        status: { $in: ['started', 'failed'] },
      });
      return canonical((rows || []).filter((row: any) => row?.result_summary?.work_order_id));
    };

    if (action === 'update') {
      if (await activeGenerationLock()) return Response.json({ error: 'This maintenance schedule is currently reserved by Fleet work-order generation. Refresh after that operation finishes before editing it.' }, { status: 409 });
      if (await activeCompletionReschedule()) return Response.json({ error: 'This maintenance schedule is currently being advanced by a Fleet work-order completion. Finish/reconcile that completion before editing the schedule.' }, { status: 409 });
      const patch = taskPatch(body?.task || body);
      if (patch.status && !TASK_STATUSES.has(patch.status)) return Response.json({ error: 'Invalid maintenance status.' }, { status: 400 });
      if (patch.type && !TASK_TYPES.has(patch.type)) return Response.json({ error: 'Invalid maintenance type.' }, { status: 400 });
      if (patch.equipment_id && patch.equipment_id !== existing.equipment_id) {
        const equipment = await Equipment.get(patch.equipment_id);
        if (!equipment) return Response.json({ error: 'Selected Fleet equipment was not found.' }, { status: 404 });
        if (equipment.status === 'retired') return Response.json({ error: 'A maintenance schedule cannot be reassigned to retired Fleet equipment. Reactivate the equipment first.' }, { status: 409 });
        const active = (await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${id}` })).find((wo: any) => ACTIVE_STATUSES.has(wo.status));
        if (active) return Response.json({ error: 'Equipment cannot be changed while this maintenance schedule has an active Fleet work order.' }, { status: 409 });
      }
      const expectedUpdatedAt = String(body?.expected_updated_date || '').trim();
      if (!expectedUpdatedAt) return Response.json({ error: 'Maintenance schedule version is missing. Reload before saving.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Task,
        id,
        expectedUpdatedAt,
        patch,
        label: 'Fleet maintenance schedule',
      });
      return Response.json({ success: true, task: updated });
    }

    if (action === 'delete') {
      if (await activeGenerationLock()) return Response.json({ error: 'This maintenance schedule is currently reserved by Fleet work-order generation and cannot be deleted.' }, { status: 409 });
      if (await activeCompletionReschedule()) return Response.json({ error: 'This maintenance schedule is currently being advanced by a Fleet work-order completion and cannot be deleted.' }, { status: 409 });
      const linked = await loadAllEntityRows({ entity: WorkOrder, query: { maintenance_task_id: id }, sort: '-created_date', label: `Fleet work orders for maintenance task ${id}` });
      if (linked.length) return Response.json({ error: 'This maintenance schedule has Fleet work-order history and cannot be deleted. Mark it completed instead.' }, { status: 409 });
      await Task.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: 'Unsupported Fleet maintenance action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetMaintenanceAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet maintenance operation failed.' }, { status: 500 });
  }
});
