import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Session-authenticated write gateway for staff-tier entities. Entity RLS is
// backend-only now, so every staff-facing mutation flows through this narrow
// path: a valid sign-shop session is required, the entity/operation must be
// explicitly allowed below, and operator-style keys ($set, $where, ...) are
// rejected at any depth so the payload can only ever describe a plain record.
const WRITE_OPS: Record<string, Set<string>> = {
  BuilderPart: new Set(['create']),
  BuilderProduct: new Set(['create']),
  CustomerLocation: new Set(['create']),
  GeneralTask: new Set(['create', 'update']),
  ImportJob: new Set(['create', 'update']),
  JurisdictionProfile: new Set(['create', 'update']),
  LegacyMigrationMap: new Set(['create']),
  PermitLineItem: new Set(['create']),
  PermittingWorkflowDraft: new Set(['create', 'update']),
  RegulationAlert: new Set(['update', 'delete']),
  SipChecklistTemplate: new Set(['create', 'update', 'delete']),
  WorkOrder: new Set(['create']),
};

function rejectOperatorKeys(value: unknown, path = 'data'): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      throw Object.assign(new Error(`Operator-style field "${path}.${key}" is not allowed.`), { status: 400 });
    }
    rejectOperatorKeys(val, `${path}.${key}`);
  }
}

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const entityName = String(body?.entity || '').trim();
    const op = String(body?.op || '').trim();
    const allowed = WRITE_OPS[entityName];
    if (!allowed || !allowed.has(op)) {
      return Response.json({ error: 'This record type cannot be written here.' }, { status: 403 });
    }

    const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
    if (JSON.stringify(data).length > 200000) throw bad('Record payload is too large.');
    rejectOperatorKeys(data);
    // Identity/system fields are never client-supplied.
    for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (data as any)[f];

    const entity = (base44.asServiceRole.entities as any)[entityName];
    if (!entity) throw bad('Unknown record type.');

    if (op === 'create') {
      const created = await entity.create(data);
      return Response.json({ success: true, record: created });
    }

    const id = String(body?.id || '').trim();
    if (!id) throw bad('Record id is required.');
    const current = await entity.get(id).catch(() => null);
    if (!current?.id) return Response.json({ error: 'Record not found.' }, { status: 404 });

    if (op === 'update') {
      const expected = String(body?.expected_updated_date || '').trim();
      if (expected && expected !== String(current.updated_date || '')) {
        return Response.json({ error: 'This record changed in another session. Reload before saving.' }, { status: 409 });
      }
      const saved = await entity.update(id, data);
      return Response.json({ success: true, record: saved });
    }

    if (op === 'delete') {
      await entity.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    throw bad('Unsupported operation.');
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if ([400, 401, 403, 404, 409].includes(status)) {
      return Response.json({ error: error?.message || 'Write failed.' }, { status });
    }
    console.error('staffEntityWrite error:', error);
    return Response.json({ error: 'The record could not be saved. Try again.' }, { status: 500 });
  }
});
