import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const INSPECTION_TYPES = new Set(['pre_trip','post_trip','daily','weekly','monthly','safety','custom']);
const RESPONSE_TYPES = new Set(['pass_fail','checkbox','text','number']);
const SEVERITIES = new Set(['low','medium','high','critical']);
const PRIORITY = new Set(['low','medium','high','critical']);
const norm = (value: unknown) => String(value ?? '').trim();
const uniq = (values: unknown) => Array.isArray(values) ? [...new Set(values.map(value => norm(value)).filter(Boolean))] : [];
const nowIso = () => new Date().toISOString();
const easternDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function authorize(base44: any, adminRequired = false) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user, admin: true };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  const authorized = rows?.[0] || null;
  if (!authorized) return { error: Response.json({ error: 'This CCS account is not authorized for Fleet operations.' }, { status: 403 }) };
  if (adminRequired && authorized.role !== 'admin') return { error: Response.json({ error: 'Fleet inspection template administration requires a CCS admin.' }, { status: 403 }) };
  return { user, admin: authorized.role === 'admin' };
}

function normalizeTemplate(source: any) {
  const items = Array.isArray(source?.items) ? source.items.slice(0, 100).map((item: any, index: number) => ({
    key: norm(item?.key) || `item-${index + 1}`,
    label: norm(item?.label),
    instructions: norm(item?.instructions),
    response_type: RESPONSE_TYPES.has(norm(item?.response_type)) ? norm(item?.response_type) : 'pass_fail',
    required: item?.required !== false,
    severity: SEVERITIES.has(norm(item?.severity)) ? norm(item?.severity) : 'medium',
    fail_creates_work_order: item?.fail_creates_work_order === true,
  })).filter((item: any) => item.label) : [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) throw new Error(`Inspection template item key "${item.key}" is duplicated.`);
    seen.add(item.key);
  }
  return {
    name: norm(source?.name),
    description: norm(source?.description),
    inspection_type: INSPECTION_TYPES.has(norm(source?.inspection_type)) ? norm(source?.inspection_type) : 'custom',
    applicable_equipment_types: uniq(source?.applicable_equipment_types),
    items,
    active: source?.active !== false,
  };
}

function responseMap(rows: any[]) {
  return new Map((Array.isArray(rows) ? rows : []).map((row: any) => [norm(row?.item_key), row]));
}

function normalizeResponses(template: any, incoming: any[], requireComplete = false) {
  const map = responseMap(incoming);
  const rows: any[] = [];
  for (const item of template?.items || []) {
    const provided = map.get(item.key) || {};
    const result = ['pass','fail','na'].includes(norm(provided?.result)) ? norm(provided.result) : '';
    const value = norm(provided?.value);
    const notes = norm(provided?.notes);
    const photos = uniq(provided?.photo_urls);
    if (requireComplete && item.required) {
      if (item.response_type === 'pass_fail' && !['pass','fail','na'].includes(result)) throw new Error(`Complete the required inspection item: ${item.label}.`);
      if (item.response_type === 'checkbox' && !['pass','fail','na'].includes(result)) throw new Error(`Complete the required inspection item: ${item.label}.`);
      if (item.response_type === 'text' && !value) throw new Error(`Enter the required inspection value: ${item.label}.`);
      if (item.response_type === 'number' && (value === '' || !Number.isFinite(Number(value)))) throw new Error(`Enter a valid number for: ${item.label}.`);
    }
    rows.push({
      item_key: item.key,
      label: item.label,
      result: result || (item.response_type === 'text' || item.response_type === 'number' ? 'pass' : 'na'),
      value,
      notes,
      photo_urls: photos,
      severity: item.severity,
      fail_creates_work_order: item.fail_creates_work_order === true,
    });
  }
  return rows;
}

async function shortHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function inspectionWorkOrderNumber(inspectionId: string, itemKey: string) {
  return `FINSP-${easternDate().replaceAll('-', '')}-${(await shortHash(`${inspectionId}:${itemKey}`)).slice(0, 12)}`;
}

async function ensureFailureWorkOrder(base44: any, WorkOrder: any, Equipment: any, inspection: any, response: any) {
  const number = await inspectionWorkOrderNumber(inspection.id, response.item_key);
  const existing = await WorkOrder.filter({ work_order_number: number });
  if (existing?.length > 1) throw new Error(`Inspection failure ${response.label} has duplicate generated Fleet work orders. Review before retrying.`);
  if (existing?.[0]) return existing[0];
  const equipment = await Equipment.get(inspection.equipment_id).catch(() => null);
  if (!equipment) throw new Error('Inspection equipment was not found while creating follow-up work.');
  if (equipment.status === 'retired') throw new Error('Retired Fleet equipment cannot receive inspection-generated work orders.');
  const severity = PRIORITY.has(norm(response.severity)) ? norm(response.severity) : 'medium';
  const created = await WorkOrder.create({
    work_order_number: number,
    equipment_id: inspection.equipment_id,
    title: `Inspection failure: ${response.label}`,
    description: [
      `Generated from ${inspection.template_name || 'Fleet inspection'} (${inspection.inspection_type || 'inspection'}).`,
      response.notes ? `Inspector notes: ${response.notes}` : '',
      response.value ? `Recorded value: ${response.value}` : '',
    ].filter(Boolean).join('\n'),
    type: 'inspection',
    priority: severity,
    status: 'open',
    assigned_to: '',
    problem_photos: response.photo_urls || [],
    notes: `Source FleetInspection: ${inspection.id}\nChecklist item: ${response.item_key}`,
  });
  await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher', {
    event_type: 'work_order_created',
    target_id: created.id,
    event_token: `inspection-created:${inspection.id}:${response.item_key}`,
  }).catch(async (error: any) => {
    await base44.asServiceRole.entities.FleetSystemLog.create({
      source: 'fleetInspectionAction', level: 'warning',
      message: 'Inspection-generated Fleet work order was created, but notification dispatch failed.',
      details: { inspection_id: inspection.id, work_order_id: created.id, item_key: response.item_key, error: error?.message || String(error) },
    }).catch(() => null);
  });
  return created;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = norm(body?.action);
    const adminRequired = ['template_create','template_update'].includes(action);
    const auth = await authorize(base44, adminRequired);
    if (auth.error) return auth.error;

    const Template = base44.asServiceRole.entities.FleetInspectionTemplate;
    const Inspection = base44.asServiceRole.entities.FleetInspection;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;

    if (action === 'template_create') {
      const creationKey = norm(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({ error: 'Inspection template create identity is missing or invalid.' }, { status: 409 });
      const payload = normalizeTemplate(body?.template || body);
      if (!payload.name || !payload.items.length) return Response.json({ error: 'Template name and at least one checklist item are required.' }, { status: 400 });
      const existing = await Template.filter({ creation_key: creationKey });
      if (existing?.[0]) return Response.json({ success: true, reused: true, template: existing[0] });
      const created = await Template.create({ ...payload, created_by_email: auth.user.email, creation_key: creationKey });
      return Response.json({ success: true, template: created });
    }

    if (action === 'template_update') {
      const id = norm(body?.id);
      const expected = norm(body?.expected_updated_date);
      if (!id || !expected) return Response.json({ error: 'Template identity/version is required.' }, { status: 409 });
      const payload = normalizeTemplate(body?.template || body);
      if (!payload.name || !payload.items.length) return Response.json({ error: 'Template name and at least one checklist item are required.' }, { status: 400 });
      const updated = await updateFleetRecordIfCurrent({ entity: Template, id, expectedUpdatedAt: expected, patch: payload, label: 'Fleet inspection template' });
      return Response.json({ success: true, template: updated });
    }

    if (action === 'inspection_start') {
      const creationKey = norm(body?.creation_key);
      const equipmentId = norm(body?.equipment_id);
      const templateId = norm(body?.template_id);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({ error: 'Inspection session identity is missing or invalid.' }, { status: 409 });
      const equipment = equipmentId ? await Equipment.get(equipmentId).catch(() => null) : null;
      if (!equipment) return Response.json({ error: 'Select valid Fleet equipment.' }, { status: 404 });
      if (equipment.status === 'retired') return Response.json({ error: 'Retired Fleet equipment cannot start a new inspection.' }, { status: 409 });
      const template = templateId ? await Template.get(templateId).catch(() => null) : null;
      if (!template || template.active === false) return Response.json({ error: 'Select an active Fleet inspection template.' }, { status: 404 });
      if (template.applicable_equipment_types?.length && !template.applicable_equipment_types.includes(equipment.type)) return Response.json({ error: 'This inspection template is not configured for the selected equipment type.' }, { status: 409 });
      const existing = await Inspection.filter({ creation_key: creationKey });
      if (existing?.length > 1) return Response.json({ error: 'Multiple inspections share this session identity. Review before retrying.' }, { status: 409 });
      if (existing?.[0]) {
        if (existing[0].equipment_id !== equipmentId || existing[0].template_id !== templateId) return Response.json({ error: 'This inspection session identity belongs to a different inspection.' }, { status: 409 });
        return Response.json({ success: true, reused: true, inspection: existing[0], template });
      }
      const created = await Inspection.create({
        equipment_id: equipmentId,
        template_id: templateId,
        template_name: template.name,
        inspection_type: template.inspection_type,
        inspector_email: auth.user.email,
        inspector_name: auth.user.full_name || auth.user.name || auth.user.email,
        status: 'draft',
        started_at: nowIso(),
        responses: [],
        failed_item_count: 0,
        generated_work_order_ids: [],
        creation_key: creationKey,
      });
      return Response.json({ success: true, inspection: created, template });
    }

    if (action === 'inspection_save' || action === 'inspection_complete') {
      const id = norm(body?.id);
      const expected = norm(body?.expected_updated_date);
      if (!id || !expected) return Response.json({ error: 'Inspection identity/version is required. Reload before saving.' }, { status: 409 });
      const inspection = await Inspection.get(id).catch(() => null);
      if (!inspection) return Response.json({ error: 'Fleet inspection was not found.' }, { status: 404 });
      if (inspection.completed_at) return Response.json({ success: true, reused: true, inspection });
      const equipment = await Equipment.get(inspection.equipment_id).catch(() => null);
      if (!equipment) return Response.json({ error: 'Inspection equipment no longer exists.' }, { status: 404 });
      const template = await Template.get(inspection.template_id).catch(() => null);
      if (!template) return Response.json({ error: 'Inspection template no longer exists.' }, { status: 404 });
      const responses = normalizeResponses(template, body?.responses || inspection.responses || [], action === 'inspection_complete');
      const meterValue = body?.meter_value === '' || body?.meter_value == null ? undefined : Number(body.meter_value);
      if (meterValue != null && (!Number.isFinite(meterValue) || meterValue < 0)) return Response.json({ error: 'Inspection mileage/hours must be a valid non-negative number.' }, { status: 400 });
      const meterUnit = ['miles','hours'].includes(norm(body?.meter_unit)) ? norm(body.meter_unit) : undefined;
      const patch: any = {
        responses,
        notes: norm(body?.notes),
        photo_urls: uniq(body?.photo_urls),
        ...(meterValue == null ? {} : { meter_value: meterValue }),
        ...(meterUnit ? { meter_unit: meterUnit } : {}),
      };
      if (action === 'inspection_save') {
        const saved = await updateFleetRecordIfCurrent({ entity: Inspection, id, expectedUpdatedAt: expected, patch, label: 'Fleet inspection draft' });
        return Response.json({ success: true, inspection: saved });
      }

      const failures = responses.filter((response: any) => response.result === 'fail');
      const locked = await updateFleetRecordIfCurrent({
        entity: Inspection,
        id,
        expectedUpdatedAt: expected,
        patch: { ...patch, status: failures.length ? 'needs_attention' : 'draft', failed_item_count: failures.length },
        label: 'Fleet inspection completion claim',
      });
      const generatedIds = [...new Set(locked.generated_work_order_ids || [])];
      for (const failure of failures.filter((response: any) => response.fail_creates_work_order === true)) {
        const workOrder = await ensureFailureWorkOrder(base44, WorkOrder, Equipment, locked, failure);
        if (!generatedIds.includes(workOrder.id)) generatedIds.push(workOrder.id);
      }
      const completed = await updateFleetRecordIfCurrent({
        entity: Inspection,
        id,
        expectedUpdatedAt: locked.updated_date,
        patch: { status: failures.length ? 'failed' : 'passed', completed_at: nowIso(), failed_item_count: failures.length, generated_work_order_ids: generatedIds },
        label: 'Fleet inspection completion',
      });
      return Response.json({ success: true, inspection: completed, generated_work_order_ids: generatedIds });
    }

    return Response.json({ error: 'Unsupported Fleet inspection action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetInspectionAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet inspection operation failed.' }, { status: 500 });
  }
});
