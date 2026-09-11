import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function createdTime(row: any) {
  return Date.parse(row?.created_date || row?.updated_date || '') || 0;
}

function canonicalWorkOrder(rows: any[]) {
  return rows.slice().sort((a, b) => {
    const aTime = createdTime(a);
    const bTime = createdTime(b);
    if (aTime !== bTime) return aTime - bTime;
    return text(a?.id).localeCompare(text(b?.id));
  })[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Authentication required.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = text(body?.id);
    const expectedUpdatedAt = text(body?.expected_updated_date);
    const estimateId = text(body?.estimate_id);
    if (!id || !expectedUpdatedAt || !estimateId) {
      return Response.json({ error: 'Duplicate cleanup is missing its Work Order id, version, or estimate id.' }, { status: 400 });
    }

    const entity = base44.asServiceRole.entities.WorkOrder;
    const current = await entity.get(id).catch(() => null);
    if (!current) return Response.json({ success: true, status: 'already_absent' });

    const ownerId = text(current.created_by_id);
    if (user.role !== 'admin' && (!ownerId || ownerId !== text(user.id))) {
      return Response.json({ error: 'Only the administrator or the user who created this duplicate may clean it up.' }, { status: 403 });
    }
    if (text(current.updated_date) !== expectedUpdatedAt) {
      return Response.json({ error: 'The duplicate Work Order changed after creation and was left intact for review.' }, { status: 409 });
    }
    if (text(current.estimate_id) !== estimateId || current.deleted === true) {
      return Response.json({ error: 'The Work Order is no longer the active estimate-linked duplicate that was created.' }, { status: 409 });
    }

    const linked = await entity.filter({ estimate_id: estimateId });
    if (!Array.isArray(linked)) {
      return Response.json({ error: 'The estimate-linked Work Orders could not be verified safely.' }, { status: 500 });
    }
    const active = linked.filter((row: any) => row?.id && row.deleted !== true);
    const canonical = canonicalWorkOrder(active);
    if (active.length < 2 || !canonical?.id || canonical.id === id) {
      return Response.json({ error: 'Duplicate cleanup was blocked because this Work Order is not a verified losing duplicate.' }, { status: 409 });
    }

    let result;
    try {
      result = await entity.deleteMany({
        id,
        updated_date: expectedUpdatedAt,
        estimate_id: estimateId,
        deleted: { $ne: true },
      });
    } catch (error: any) {
      const afterError = await entity.get(id).catch(() => null);
      if (!afterError) return Response.json({ success: true, status: 'confirmed_absent' });
      throw error;
    }

    if (result?.deleted === 1) return Response.json({ success: true, status: 'deleted_now' });
    if (Number(result?.deleted || 0) > 1) {
      return Response.json({ error: 'Duplicate cleanup matched more than one Work Order unexpectedly.' }, { status: 500 });
    }

    const after = await entity.get(id).catch(() => null);
    if (!after) return Response.json({ success: true, status: 'confirmed_absent' });
    return Response.json({ error: 'The duplicate Work Order changed while cleanup was being confirmed and was left intact.' }, { status: 409 });
  } catch (error: any) {
    console.error('deleteCreatedDuplicateWorkOrder error:', error);
    return Response.json({ error: error?.message || 'Duplicate Work Order cleanup failed.' }, { status: 500 });
  }
});
