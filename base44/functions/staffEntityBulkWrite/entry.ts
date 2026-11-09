import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Bulk companion to staffEntityWrite — the local permitting fleet's write
// flusher drains its outbox through ONE invoke carrying up to 200 writes
// instead of one HTTP request per record. Same session auth, same per-entity
// op allowlist, same operator-key + role-vocab + evidence gates, applied
// per-write so one bad record can't sink the batch.
//
// Admin-only: this lane exists for the automated fleet (which runs under an
// admin session). Staff-facing single writes stay on staffEntityWrite.
const WRITE_OPS: Record<string, Set<string>> = {
  PermitLocality: new Set(['create', 'update']),
  JurisdictionProfile: new Set(['create', 'update']),
  SourceCollectionQueue: new Set(['create', 'update', 'updateMany']),
  PermitLineItem: new Set(['create', 'update', 'updateMany', 'delete']),
  PermitResolutionRule: new Set(['create', 'update', 'updateMany']),
  PermitLookupIndex: new Set(['create']),
};

const KNOWN_ROLES = new Set(['sign_permit', 'zoning', 'building', 'electrical', 'electrical_permit', 'electrical_inspection', 'right_of_way', 'historic_review', 'planning', 'transportation', 'other']);
const badRole = (roles: any[]) => (Array.isArray(roles) ? roles : []).find((r: any) => typeof r === 'string' && r.trim() && !KNOWN_ROLES.has(r));

function rejectOperatorKeys(value: unknown, path = 'data'): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$')) throw Object.assign(new Error(`Operator-style field "${path}.${key}" is not allowed.`), { status: 400 });
    rejectOperatorKeys(val, `${path}.${key}`);
  }
}
const clean = (v: unknown) => String(v ?? '').trim();
const MAX_BATCH = 200;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 3 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Bulk writes are fleet-only (admin).' }, { status: 403 });

    const writes = Array.isArray(body?.writes) ? body.writes : [];
    if (!writes.length) return Response.json({ error: 'writes[] is required.' }, { status: 400 });
    if (writes.length > MAX_BATCH) return Response.json({ error: `writes[] capped at ${MAX_BATCH} per call.` }, { status: 400 });

    const results: any[] = new Array(writes.length);
    const email = String(user.email || '');

    // ── Validate every write first; failures are per-record, not fatal ──
    const valid: { i: number; w: any }[] = [];
    writes.forEach((w: any, i: number) => {
      try {
        const entity = clean(w?.entity), op = clean(w?.op);
        if (!WRITE_OPS[entity]?.has(op)) throw new Error('This record type cannot be written here.');
        if (w?.data && typeof w.data === 'object') rejectOperatorKeys(w.data);
        if (w?.query && typeof w.query === 'object') rejectOperatorKeys(w.query, 'query');
        if (entity === 'PermitLineItem' && (op === 'create' || op === 'update')) {
          const bad = badRole(w?.data?.office_types || []);
          if (bad) throw new Error(`Unknown office role "${bad}".`);
        }
        if (entity === 'PermitLocality' && (op === 'create' || op === 'update') && Array.isArray(w?.data?.offices)) {
          const bad = w.data.offices.map((o: any) => badRole(o?.authority_roles || [])).find(Boolean);
          if (bad) throw new Error(`Unknown office role "${bad}".`);
        }
        if (entity === 'JurisdictionProfile' && op === 'update' && w?.data?.verification_status === 'verified') {
          const d = w.data;
          const ok = (Array.isArray(d?.documents) && d.documents.length) || (Array.isArray(d?.offices) && d.offices.some((o: any) => clean(o?.portal_url || o?.source_url))) || (d?._manual_documents && Object.keys(d._manual_documents).length);
          if (!ok) throw new Error('Verified needs at least one usable source.');
        }
        valid.push({ i, w });
      } catch (e: any) { results[i] = { i, ok: false, error: String(e?.message || e).slice(0, 200) }; }
    });

    const entities = base44.asServiceRole.entities as any;

    // ── Creates: PermitLocality per-record (name+state+profile dedupe),
    //    other entities in true bulkCreate chunks ──
    const bulkCreates = new Map<string, { i: number; w: any }[]>();
    const soloCreates: { i: number; w: any }[] = [];
    for (const v of valid) {
      if (v.w.op !== 'create') continue;
      if (v.w.entity === 'PermitLocality') soloCreates.push(v);
      else {
        const arr = bulkCreates.get(v.w.entity) || []; arr.push(v); bulkCreates.set(v.w.entity, arr);
      }
    }

    for (const [entityName, group] of bulkCreates) {
      const entity = entities[entityName];
      for (let c = 0; c < group.length; c += 100) {
        const chunk = group.slice(c, c + 100);
        try {
          const created = await entity.bulkCreate(chunk.map((v) => v.w.data || {}));
          const rows = Array.isArray(created) ? created : [];
          chunk.forEach((v, j) => { results[v.i] = { i: v.i, ok: true, id: rows[j]?.id || null, record: rows[j] || null }; });
        } catch (e: any) {
          // Batch failed — per-record fallback so one bad row can't sink 99.
          for (const v of chunk) {
            try { const r = await entity.create(v.w.data || {}); results[v.i] = { i: v.i, ok: true, id: r?.id || null, record: r }; }
            catch (e2: any) { results[v.i] = { i: v.i, ok: false, error: String(e2?.message || e2).slice(0, 200) }; }
          }
        }
      }
    }

    // ── Sequential per-record ops (updates, locality creates, updateMany) ──
    for (const v of valid) {
      if (v.w.op === 'create' && v.w.entity !== 'PermitLocality') continue; // handled in bulk
      const { entity: entityName, op } = v.w;
      const entity = entities[entityName];
      if (!entity) { results[v.i] = { i: v.i, ok: false, error: 'Unknown record type.' }; continue; }
      try {
        if (op === 'create') {
          // PermitLocality dedupe — same as the single-record gateway.
          const data = v.w.data || {};
          const rawName = clean(data.name), wantName = rawName.toLowerCase(), wantState = clean(data.state).toLowerCase();
          if (rawName) {
            const dup = await entity.filter({ name: rawName }, null, 50).catch(() => []);
            const wantProfile = clean(data.jurisdiction_profile_id);
            const existing = (Array.isArray(dup) ? dup : []).find((r: any) =>
              clean(r?.name).toLowerCase() === wantName && clean(r?.state).toLowerCase() === wantState &&
              (!wantProfile || !clean(r?.jurisdiction_profile_id) || clean(r?.jurisdiction_profile_id) === wantProfile));
            if (existing?.id) { results[v.i] = { i: v.i, ok: true, id: existing.id, record: existing, deduplicated: true }; continue; }
          }
          const r = await entity.create(data);
          results[v.i] = { i: v.i, ok: true, id: r?.id || null, record: r };
          continue;
        }
        if (op === 'update') {
          const id = clean(v.w.id);
          if (!id) throw new Error('Record id is required.');
          const data = { ...(v.w.data || {}) };
          if (entityName === 'PermitLocality') {
            const current = await entity.get(id).catch(() => null);
            if (!current?.id) throw new Error('Record not found.');
            const changed = Object.keys(data).filter((f) => String((current as any)?.[f] ?? '') !== String((data as any)?.[f] ?? ''));
            if (changed.length) {
              const log = Array.isArray(current.change_log) ? current.change_log.slice(-49) : [];
              log.push({ at: new Date().toISOString(), by: email, changed_fields: changed });
              data.change_log = log;
            }
          }
          const r = await entity.update(id, data);
          results[v.i] = { i: v.i, ok: true, id: r?.id || id, record: r };
          continue;
        }
        if (op === 'updateMany') {
          const q = v.w.query || {};
          if (!clean(q.id) || !clean(q.updated_date)) throw new Error('updateMany requires an id + updated_date anchored query.');
          const patch = v.w?.update?.$set;
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('updateMany requires an update.$set patch.');
          rejectOperatorKeys(patch);
          for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (patch as any)[f];
          const r = await entity.updateMany({ id: clean(q.id), updated_date: clean(q.updated_date) }, { $set: patch });
          results[v.i] = { i: v.i, ok: true, result: r };
          continue;
        }
        if (op === 'delete') {
          const id = clean(v.w.id);
          if (!id) throw new Error('Record id is required.');
          await entity.delete(id);
          results[v.i] = { i: v.i, ok: true, deleted: true };
          continue;
        }
        results[v.i] = { i: v.i, ok: false, error: 'Unsupported operation.' };
      } catch (e: any) {
        results[v.i] = { i: v.i, ok: false, error: String(e?.message || e).slice(0, 200) };
      }
    }

    const applied = results.filter((r) => r?.ok).length;
    return Response.json({ success: true, applied, failed: writes.length - applied, results });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if ([400, 401, 403, 429].includes(status)) return Response.json({ error: error?.message || 'Bulk write failed.' }, { status });
    console.error('staffEntityBulkWrite error:', error);
    return Response.json({ error: 'The batch could not be saved. Try again.' }, { status: 500 });
  }
});
