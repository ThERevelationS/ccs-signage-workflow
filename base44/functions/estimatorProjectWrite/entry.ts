import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { coerceToDeclaredScalars } from '../../shared/entityWriteTypeGuard.ts';

const WRITE_OPS: Record<string, Set<string>> = Object.fromEntries([
  'FoundationProject',
  'ChannelLetterInstallation',
  'VinylProject',
  'CNCProject',
  'LaserProject',
  'MetalProject',
  'BrickStoneProject',
  'MaintenanceProject',
  'Project',
  'CustomItemsProject',
].map((name) => [name, new Set(['create', 'update', 'updateMany', 'delete', 'deleteMany'])]));

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
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const entityName = String(body?.entity || '').trim();
    const op = String(body?.op || '').trim();
    const allowed = Object.prototype.hasOwnProperty.call(WRITE_OPS, entityName) ? WRITE_OPS[entityName] : null;
    if (!allowed || !allowed.has(op)) {
      return Response.json({ error: 'This record type cannot be written here.' }, { status: 403 });
    }

    const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
    if (JSON.stringify(data).length > 200000) throw bad('Record payload is too large.');
    rejectOperatorKeys(data);
    for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (data as any)[f];

    const entity = (base44.asServiceRole.entities as any)[entityName];
    if (!entity) throw bad('Unknown record type.');
    const coercedFields = coerceToDeclaredScalars(entityName, data);
    if (coercedFields.length) console.log(`estimatorProjectWrite coerced scalar fields on ${entityName}: ${coercedFields.join(', ')}`);

    if (op === 'create') {
      const created = await entity.create(data);
      return Response.json({ success: true, record: created });
    }

    if (op === 'deleteMany') {
      // Only CAS deletes ({id, updated_date, ...guardFields}) — an unanchored
      // query could otherwise wipe a whole table.
      const delQuery = body?.query;
      if (
        !delQuery || typeof delQuery !== 'object' || Array.isArray(delQuery)
        || !String((delQuery as Record<string, unknown>).id || '').trim()
        || !String((delQuery as Record<string, unknown>).updated_date || '').trim()
      ) {
        throw bad('deleteMany requires an id and updated_date anchored query.');
      }
      rejectOperatorKeys(delQuery, 'query');
      const result = await entity.deleteMany(delQuery);
      return Response.json({ success: true, result });
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

    if (op === 'updateMany') {
      const query = body?.query;
      const update = body?.update;
      if (entityName === 'FoundationProject' && (typeof query?.id !== 'string' || typeof query?.updated_date !== 'string')) {
        throw bad('A foundation conditional update requires string id and updated_date values.');
      }
      const queryKeys = query && typeof query === 'object' && !Array.isArray(query) ? Object.keys(query) : [];
      const queryId = String((query as any)?.id || '').trim();
      const queryVersion = String((query as any)?.updated_date || '').trim();
      if (queryKeys.length !== 2 || !queryId || !queryVersion || queryId !== id) {
        throw bad('A conditional update must target exactly one record id and updated_date.');
      }
      const updateKeys = update && typeof update === 'object' && !Array.isArray(update) ? Object.keys(update) : [];
      if (updateKeys.length !== 1 || updateKeys[0] !== '$set') {
        throw bad('Only $set updates are allowed here.');
      }
      const patch = (update as any).$set;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('An update payload is required.');
      if (JSON.stringify(patch).length > 200000) throw bad('Record payload is too large.');
      rejectOperatorKeys(patch);
      for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (patch as any)[f];
      coerceToDeclaredScalars(entityName, patch);
      const result = await entity.updateMany({ id: queryId, updated_date: queryVersion }, { $set: patch });
      return Response.json({ success: true, result });
    }

    if (op === 'delete') {
      await entity.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    throw bad('Unsupported operation.');
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Write failed.' }, { status });
    }
    console.error('estimatorProjectWrite error:', error);
    return Response.json({ error: 'The record could not be saved. Try again.' }, { status: 500 });
  }
});
