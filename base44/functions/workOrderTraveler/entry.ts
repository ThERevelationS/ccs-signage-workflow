import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public shop-traveler payload. The work order id is the capability: travelers
// are opened from printed QR links on the shop floor without an app login, so
// this endpoint intentionally needs no session. It returns only the fields
// the traveler document renders — never the full record (contact PII,
// financials, sync internals stay server-side).

const WO_FIELDS = [
  'id', 'title', 'client_name', 'description', 'image_url', 'current_stage',
  'start_date', 'due_date', 'assigned_to', 'asap', 'permitting',
  'township_city', 'county', 'permit_code', 'permit_class', 'permit_number',
  'permit_submitted_date', 'permit_approved_date', 'permit_receipt_confirmed_date',
  'product_1', 'product_2', 'product_3', 'product_4', 'product_5', 'product_6',
];
const RIDER_FIELDS = ['id', 'title', 'rider_stage', 'current_stage', 'due_date', 'description', 'deleted'];
const TASK_FIELDS = ['id', 'text', 'completed', 'is_milestone', 'is_critical_path', 'assigned_to', 'due_date', 'estimated_hours', 'checklist_context'];
const SUBTASK_FIELDS = ['id', 'text', 'completed'];
const PRODUCT_FIELDS = ['id', 'description', 'customer_description', 'product_type', 'category', 'quantity'];
const PERMIT_FIELDS = ['id', 'row_name', 'office_types', 'locality_name', 'permit_received_date', 'status', 'jurisdiction_fee_amount', 'jurisdiction_fee_status'];
const MATERIAL_FIELDS = ['id', 'item_label', 'reason', 'delta', 'unit_cost'];

function pick(row: any, fields: string[]) {
  const out: Record<string, any> = {};
  for (const key of fields) if (row?.[key] !== undefined) out[key] = row[key];
  return out;
}

function pickTask(task: any) {
  const out = pick(task, TASK_FIELDS);
  if (Array.isArray(task?.sub_tasks)) {
    out.sub_tasks = task.sub_tasks.map((st: any) => pick(st, SUBTASK_FIELDS));
  }
  return out;
}

function pickWorkOrder(wo: any) {
  const out = pick(wo, WO_FIELDS);
  if (Array.isArray(wo?.notes)) out.notes = wo.notes.map(pickTask);
  if (Array.isArray(wo?.products)) out.products = wo.products.map((p: any) => pick(p, PRODUCT_FIELDS));
  if (Array.isArray(wo?.files)) out.files = wo.files.map((f: any) => pick(f, ['id', 'name']));
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.work_order_id || body?.wo || '').trim();
    if (!id || id.length > 80) {
      return Response.json({ error: 'A valid work order id is required.' }, { status: 400 });
    }

    const entities = base44.asServiceRole.entities;
    const wo = await entities.WorkOrder.get(id).catch(() => null);
    if (!wo?.id || wo.deleted === true) {
      return Response.json({ error: 'Work order not found.' }, { status: 404 });
    }

    const [riderRows, permitRows, materialRows] = await Promise.all([
      entities.WorkOrder.filter({ parent_work_order_id: id }).catch(() => []),
      entities.PermitLineItem.filter({ work_order_id: id }).catch(() => []),
      entities.InventoryMovement.filter({ work_order_id: id }).catch(() => []),
    ]);

    return Response.json({
      work_order: pickWorkOrder(wo),
      riders: (riderRows || [])
        .filter((r: any) => r?.id && r.deleted !== true)
        .map((r: any) => {
          const out = pick(r, RIDER_FIELDS);
          if (Array.isArray(r.notes)) out.notes = r.notes.map(pickTask);
          return out;
        }),
      permits: (permitRows || []).filter((p: any) => p?.id).map((p: any) => pick(p, PERMIT_FIELDS)),
      materials: (materialRows || []).filter((m: any) => m?.id).map((m: any) => pick(m, MATERIAL_FIELDS)),
    });
  } catch (error: any) {
    console.error('workOrderTraveler error:', error?.message || error);
    return Response.json({ error: 'The traveler could not be loaded.' }, { status: 500 });
  }
});
