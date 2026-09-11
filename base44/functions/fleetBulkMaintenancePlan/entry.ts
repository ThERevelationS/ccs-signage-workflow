import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAX_EQUIPMENT = 50;
const TASK_TYPES = new Set(['recurring', 'one_off']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const FREQUENCIES = new Set(['daily', 'weekly', 'bi_weekly', 'monthly', 'bi_monthly', 'quarterly', 'every_6_months', 'annually', 'custom']);
const CUSTOM_UNITS = new Set(['days', 'weeks', 'months', 'years']);
const ACTIVE_SCHEDULE_STATUSES = ['pending', 'overdue', 'in_progress'];

const text = (value: unknown) => String(value ?? '').trim();
const numberOrNull = (value: unknown) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Bulk Fleet maintenance planning requires a CCS admin.' }, { status: 403 }) };
  return { user };
}

function canonical(rows: any[] = []) {
  return rows.slice().sort((a, b) => {
    const at = Date.parse(a?.created_date || '') || 0;
    const bt = Date.parse(b?.created_date || '') || 0;
    if (at !== bt) return at - bt;
    return text(a?.id).localeCompare(text(b?.id));
  })[0] || null;
}

function normalizeLineItems(rows: any, type: 'part' | 'fluid') {
  if (!Array.isArray(rows)) return [];
  if (type === 'part') return rows.map((row: any) => ({
    part_name: text(row?.part_name),
    quantity: Math.max(0, Number(row?.quantity || 0)),
    notes: text(row?.notes),
  })).filter((row: any) => row.part_name && row.quantity > 0);
  return rows.map((row: any) => ({
    fluid_type: text(row?.fluid_type),
    quantity: Math.max(0, Number(row?.quantity || 0)),
    unit: CUSTOM_FLUID_UNIT(row?.unit),
    notes: text(row?.notes),
  })).filter((row: any) => row.fluid_type && row.quantity > 0);
}

function CUSTOM_FLUID_UNIT(value: unknown) {
  const unit = text(value).toLowerCase();
  return ['quarts', 'gallons', 'pints', 'ounces'].includes(unit) ? unit : 'quarts';
}

function normalizeSchedule(source: any) {
  const type = text(source?.type || 'recurring');
  const frequency = type === 'recurring' ? text(source?.frequency || 'monthly') : '';
  const customValue = frequency === 'custom' ? numberOrNull(source?.custom_frequency_value) : null;
  const customUnit = frequency === 'custom' ? text(source?.custom_frequency_unit || 'months') : '';
  return {
    title: text(source?.title),
    description: text(source?.description),
    type,
    priority: text(source?.priority || 'medium'),
    frequency,
    custom_frequency_value: customValue,
    custom_frequency_unit: customUnit,
    estimated_duration: numberOrNull(source?.estimated_duration),
    start_date: text(source?.start_date),
    assigned_to: text(source?.assigned_to),
    status: 'pending',
    parts_needed: normalizeLineItems(source?.parts_needed, 'part'),
    fluids_needed: normalizeLineItems(source?.fluids_needed, 'fluid'),
  };
}

function validateSchedule(schedule: any) {
  if (!schedule.title) return 'Maintenance title is required.';
  if (!TASK_TYPES.has(schedule.type)) return 'Invalid maintenance type.';
  if (!PRIORITIES.has(schedule.priority)) return 'Invalid maintenance priority.';
  if (schedule.type === 'recurring' && !FREQUENCIES.has(schedule.frequency)) return 'Invalid maintenance frequency.';
  if (schedule.type === 'recurring' && schedule.frequency === 'custom') {
    if (!(Number(schedule.custom_frequency_value) > 0)) return 'Custom recurrence must be greater than zero.';
    if (!CUSTOM_UNITS.has(schedule.custom_frequency_unit)) return 'Invalid custom recurrence unit.';
  }
  return '';
}

function createComparable(source: any) {
  return {
    title: text(source?.title),
    description: text(source?.description),
    equipment_id: text(source?.equipment_id),
    type: text(source?.type),
    priority: text(source?.priority || 'medium'),
    frequency: text(source?.frequency),
    custom_frequency_value: numberOrNull(source?.custom_frequency_value),
    custom_frequency_unit: text(source?.custom_frequency_unit),
    estimated_duration: numberOrNull(source?.estimated_duration),
    start_date: text(source?.start_date),
    assigned_to: text(source?.assigned_to),
    status: text(source?.status || 'pending'),
    parts_needed: normalizeLineItems(source?.parts_needed, 'part'),
    fluids_needed: normalizeLineItems(source?.fluids_needed, 'fluid'),
  };
}

function logicalComparable(source: any) {
  const comparable = createComparable(source);
  delete comparable.status;
  return comparable;
}

const sameCreate = (left: any, right: any) => JSON.stringify(createComparable(left)) === JSON.stringify(createComparable(right));
const sameLogicalSchedule = (left: any, right: any) => JSON.stringify(logicalComparable(left)) === JSON.stringify(logicalComparable(right));

async function fingerprint(schedule: any, equipmentRows: any[]) {
  const stable = {
    schedule,
    equipment: equipmentRows.map(row => ({ id: text(row?.id), updated_date: text(row?.updated_date), status: text(row?.status) })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(stable));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action);
    if (!['preview', 'commit'].includes(action)) return Response.json({ error: 'Unsupported bulk maintenance action.' }, { status: 400 });

    const operationKey = text(body?.operation_key);
    if (operationKey.length < 12 || operationKey.length > 100 || /\s/.test(operationKey)) {
      return Response.json({ error: 'Bulk maintenance operation identity is missing or invalid. Reopen the planner and try again.' }, { status: 409 });
    }

    const equipmentIds = [...new Set((Array.isArray(body?.equipment_ids) ? body.equipment_ids : []).map((id: unknown) => text(id)).filter(Boolean))].sort();
    if (!equipmentIds.length) return Response.json({ error: 'Select at least one Fleet asset.' }, { status: 400 });
    if (equipmentIds.length > MAX_EQUIPMENT) return Response.json({ error: `Bulk maintenance is limited to ${MAX_EQUIPMENT} assets per operation.` }, { status: 400 });

    const schedule = normalizeSchedule(body?.schedule || {});
    const scheduleError = validateSchedule(schedule);
    if (scheduleError) return Response.json({ error: scheduleError }, { status: 400 });

    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;

    const equipmentRows: any[] = [];
    const missing: string[] = [];
    for (const id of equipmentIds) {
      const row = await Equipment.get(id).catch(() => null);
      if (!row) missing.push(id); else equipmentRows.push(row);
    }
    if (missing.length) return Response.json({ error: `Fleet equipment changed after selection. ${missing.length} selected asset(s) no longer exist.`, missing_equipment_ids: missing }, { status: 409 });

    const previewFingerprint = await fingerprint(schedule, equipmentRows);
    if (action === 'commit' && text(body?.preview_fingerprint) !== previewFingerprint) {
      return Response.json({ error: 'The selected Fleet equipment or bulk schedule changed after preview. Preview the plan again before creating schedules.' }, { status: 409 });
    }

    const plan: any[] = [];
    let blockers = 0;
    for (const equipment of equipmentRows) {
      const desired = { ...schedule, equipment_id: equipment.id };
      const creationKey = `fleetbulkmaint:${operationKey}:${equipment.id}`;
      if (equipment.status === 'retired') {
        blockers += 1;
        plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'blocked', reason: 'retired_equipment', creation_key: creationKey });
        continue;
      }

      const keyed = await Task.filter({ creation_key: creationKey });
      if (keyed.length > 1) {
        blockers += 1;
        plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'blocked', reason: 'duplicate_creation_identity', creation_key: creationKey });
        continue;
      }
      if (keyed[0]) {
        if (!sameCreate(keyed[0], desired)) {
          blockers += 1;
          plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'blocked', reason: 'creation_identity_conflict', creation_key: creationKey, task_id: keyed[0].id });
        } else {
          plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'already_applied', reason: 'same_bulk_operation', creation_key: creationKey, task_id: keyed[0].id });
        }
        continue;
      }

      const activeSchedules = await Task.filter({ equipment_id: equipment.id, status: { $in: ACTIVE_SCHEDULE_STATUSES } }, '-created_date', 200);
      const equivalent = (activeSchedules || []).find((row: any) => sameLogicalSchedule(row, desired));
      if (equivalent) {
        plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'skip_existing_equivalent', reason: 'equivalent_active_schedule_exists', creation_key: creationKey, task_id: equivalent.id });
      } else {
        plan.push({ equipment_id: equipment.id, equipment_name: equipment.name, action: 'create', creation_key: creationKey });
      }
    }

    const summary = {
      selected: equipmentRows.length,
      would_create: plan.filter(row => row.action === 'create').length,
      already_applied: plan.filter(row => row.action === 'already_applied').length,
      equivalent_existing: plan.filter(row => row.action === 'skip_existing_equivalent').length,
      blocked: blockers,
    };

    if (action === 'preview') return Response.json({ success: blockers === 0, preview: true, preview_fingerprint: previewFingerprint, plan, summary });
    if (blockers) return Response.json({ error: 'Bulk maintenance preflight found blockers. No new schedules were created.', preview_fingerprint: previewFingerprint, plan, summary }, { status: 409 });

    const created: any[] = [];
    const reused: any[] = [];
    const skipped: any[] = [];

    for (const entry of plan) {
      if (entry.action === 'already_applied') {
        reused.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: entry.task_id, reason: entry.reason });
        continue;
      }
      if (entry.action === 'skip_existing_equivalent') {
        skipped.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: entry.task_id, reason: entry.reason });
        continue;
      }
      if (entry.action !== 'create') continue;

      const desired = { ...schedule, equipment_id: entry.equipment_id };
      try {
        // Re-check immediately before each mutation so a concurrently-created equivalent
        // schedule is skipped instead of producing a logical duplicate.
        const nowKeyed = await Task.filter({ creation_key: entry.creation_key });
        if (nowKeyed.length > 1) throw new Error('Multiple schedules now share this bulk create identity.');
        if (nowKeyed[0]) {
          if (!sameCreate(nowKeyed[0], desired)) throw new Error('This bulk create identity now belongs to different schedule details.');
          reused.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: nowKeyed[0].id, reason: 'same_bulk_operation' });
          continue;
        }
        const activeNow = await Task.filter({ equipment_id: entry.equipment_id, status: { $in: ACTIVE_SCHEDULE_STATUSES } }, '-created_date', 200);
        const equivalentNow = (activeNow || []).find((row: any) => sameLogicalSchedule(row, desired));
        if (equivalentNow) {
          skipped.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: equivalentNow.id, reason: 'equivalent_active_schedule_exists' });
          continue;
        }

        const newTask = await Task.create({ ...desired, creation_key: entry.creation_key });
        await new Promise(resolve => setTimeout(resolve, 75));
        const contenders = await Task.filter({ creation_key: entry.creation_key });
        if (contenders.length > 1) {
          const winner = canonical(contenders) || newTask;
          if (winner.id !== newTask.id) {
            await Task.delete(newTask.id).catch(() => null);
            if (!sameCreate(winner, desired)) throw new Error('A concurrent create won this identity with different schedule details.');
            reused.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: winner.id, reason: 'concurrent_retry_converged' });
            continue;
          }
          for (const duplicate of contenders) if (duplicate.id !== winner.id) await Task.delete(duplicate.id).catch(() => null);
        }
        created.push({ equipment_id: entry.equipment_id, equipment_name: entry.equipment_name, task_id: newTask.id });
      } catch (error: any) {
        return Response.json({
          success: false,
          partial: created.length + reused.length + skipped.length > 0,
          error: error?.message || `Bulk maintenance stopped while creating a schedule for ${entry.equipment_name || entry.equipment_id}.`,
          created,
          reused,
          skipped,
          failed_equipment_id: entry.equipment_id,
          operation_key: operationKey,
          retry_safe: true,
          message: 'Retry this exact bulk plan with the same operation identity after reviewing the failure. Already-created schedules will be reused rather than duplicated.',
        });
      }
    }

    return Response.json({ success: true, partial: false, operation_key: operationKey, created, reused, skipped, summary: { selected: equipmentRows.length, created: created.length, reused: reused.length, skipped_existing_equivalent: skipped.length } });
  } catch (error: any) {
    console.error('fleetBulkMaintenancePlan error:', error);
    return Response.json({ error: error?.message || 'Bulk Fleet maintenance planning failed.' }, { status: 500 });
  }
});
