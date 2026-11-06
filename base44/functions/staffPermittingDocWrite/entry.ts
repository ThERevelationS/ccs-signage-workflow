import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Session-authenticated write gateway for backend-only permitting evidence
// entities. These records have no staffEntityWrite path (RLS is backend-only)
// because the app's own functions normally write them via asServiceRole — but
// the LOCAL document pipeline needs the same writes without moving the work
// server-side. Same contract as staffEntityWrite: session required, entity and
// op allowlisted, operator keys rejected, single-record CAS via
// expected_updated_date.
const WRITE_OPS: Record<string, Set<string>> = {
  PermittingSourceDocument: new Set(['create', 'update']),
  PermittingSourceTextSegment: new Set(['create']),
  PermittingRuleExtractionRun: new Set(['create', 'update']),
  PermittingRule: new Set(['create', 'update']),
  SourceMonitorState: new Set(['create', 'update']),
  RegulationAlert: new Set(['create', 'update']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  GlobalSettings: new Set(['create', 'update']), // only SETTING_KEYS below
};

// GlobalSettings rows are writeable only for pipeline control flags — never
// general app settings.
const SETTING_KEYS = new Set(['permittingPipelineMode']);

function rejectOperatorKeys(value: unknown, path = 'data'): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      throw Object.assign(new Error(`Operator-style field "${path}.${key}" is not allowed.`), { status: 400 });
    }
    rejectOperatorKeys(val, `${path}.${key}`);
  }
}

const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Only administrators can write permitting evidence.' }, { status: 403 });

    const entityName = String(body?.entity || '').trim();
    const op = String(body?.op || '').trim();
    const allowed = WRITE_OPS[entityName];
    if (!allowed || !allowed.has(op)) {
      return Response.json({ error: 'This record type cannot be written here.' }, { status: 403 });
    }
    const entity = (base44.asServiceRole.entities as any)[entityName];
    if (!entity) throw bad('Unknown record type.');

    if (entityName === 'GlobalSettings') {
      const key = String(body?.data?.setting_key || '');
      let existing = '';
      if (!key && op === 'update' && body?.id) {
        const row = await entity.get(body.id).catch(() => null);
        existing = String(row?.setting_key || '');
      }
      if (!SETTING_KEYS.has(key || existing)) {
        return Response.json({ error: 'This record type cannot be written here.' }, { status: 403 });
      }
    }

    if (op === 'create') {
      const data = body?.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('A create payload is required.');
      rejectOperatorKeys(data);
      for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (data as any)[f];
      const created = await entity.create(data);
      return Response.json({ success: true, record: created, row: created });
    }

    // update: single-record CAS — expected_updated_date must match or 409.
    const id = String(body?.id || '').trim();
    if (!id) throw bad('An update target id is required.');
    const current = await entity.get(id);
    if (!current?.id) return Response.json({ error: 'Record not found.' }, { status: 404 });
    const expected = String(body?.expected_updated_date || '').trim();
    if (expected && expected !== String((current as any).updated_date || '')) {
      return Response.json({ error: 'This record changed in another session. Reload before saving.', updated: 0, conflict: true }, { status: 409 });
    }
    const data = body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('An update payload is required.');
    rejectOperatorKeys(data);
    for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (data as any)[f];
    const saved = await entity.update(id, data);
    return Response.json({ success: true, record: saved, row: saved, updated: 1 });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : 500;
    return Response.json({ error: error?.message || 'Write failed.' }, { status });
  }
});
