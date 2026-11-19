import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const KEY = 'corebridge_sync_lock';
const clean = (value: any) => String(value ?? '').trim();
const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });

function active(row: any, now: number) {
  const lease = row?.setting_value;
  if (!lease || typeof lease !== 'object' || !clean(lease.run_id) || clean(lease.released_at)) return false;
  const expiry = Date.parse(clean(lease.expires_at));
  if (!Number.isFinite(expiry)) throw bad('A lock row has an invalid expiry.', 409);
  return expiry > now;
}

async function readRows(entity: any) {
  const rows = await loadAllEntityRows({ entity, query: { setting_key: KEY }, sort: 'created_date', pageSize: 500, label: 'CoreBridge sync lock' });
  if (rows.some((row: any) => !clean(row.id))) throw bad('A lock row has no ID.', 500);
  return rows.sort((a: any, b: any) => clean(a.id).localeCompare(clean(b.id)));
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (clean(user?.role).toLowerCase() !== 'admin' && user?.is_full_admin !== true) throw bad('Only administrators can manage the sync lock.', 403);
    const action = clean(body?.action);
    if (!['claim', 'heartbeat', 'release', 'status'].includes(action)) throw bad('Unknown sync lock action.');
    const runId = clean(body?.run_id);
    if (action !== 'status' && (!runId || runId.length > 200)) throw bad('A valid run_id is required.');
    const ttl = Number(body?.ttl_minutes ?? 360);
    if (action === 'claim' && (!Number.isFinite(ttl) || ttl <= 0 || ttl > 360)) throw bad('ttl_minutes must be greater than zero and at most 360.');
    const entity = base44.asServiceRole.entities.GlobalSettings;
    let rows = await readRows(entity);
    if (action === 'claim' && !rows.length) {
      await entity.create({ setting_key: KEY, setting_value: {} });
      rows = await readRows(entity);
    }
    if (action === 'status') return Response.json({
      success: true, action, canonical_id: rows[0]?.id || null,
      lease: rows[0]?.setting_value || null, duplicate_ids: rows.slice(1).map((row: any) => row.id),
      active_leases: rows.filter((row: any) => active(row, Date.now())).map((row: any) => ({ id: row.id, ...row.setting_value })),
    });
    if (!rows.length) return Response.json({ success: true, action, acquired: false, reason: 'lock_missing' });

    for (let attempt = 0; attempt < 2; attempt++) {
      const now = Date.now();
      const row = rows[0];
      const version = clean(row.updated_date);
      if (!version) throw bad('Lock row has no update version.', 409);
      const otherActive = rows.find((candidate: any) => active(candidate, now) && clean(candidate.setting_value?.run_id) !== runId);
      if (otherActive) return Response.json({ success: true, action, acquired: false, reason: 'already_running', canonical_id: row.id });
      const lease = row.setting_value && typeof row.setting_value === 'object' ? row.setting_value : {};
      if (action !== 'claim' && (!active(row, now) || clean(lease.run_id) !== runId)) {
        return Response.json({ success: true, action, acquired: false, reason: 'not_owner', canonical_id: row.id });
      }
      if (action === 'claim' && active(row, now) && clean(lease.run_id) === runId) {
        return Response.json({ success: true, action, acquired: true, canonical_id: row.id, lease });
      }
      const stamp = new Date(now).toISOString();
      const next = action === 'claim'
        ? { run_id: runId, claimed_at: stamp, expires_at: new Date(now + ttl * 60000).toISOString(), released_at: '' }
        : action === 'heartbeat'
          ? { ...lease, expires_at: new Date(now + 360 * 60000).toISOString() }
          : { ...lease, released_at: stamp };
      const result = await entity.updateMany({ id: row.id, updated_date: version }, { $set: { setting_value: next } });
      if (result?.updated === 1) {
        const after = await readRows(entity);
        const canonical = after[0];
        const conflicting = after.some((candidate: any) => active(candidate, Date.now()) && clean(candidate.setting_value?.run_id) !== runId);
        const mine = clean(canonical?.setting_value?.run_id) === runId;
        if (clean(canonical?.id) !== clean(row.id) || conflicting || !mine) {
          return Response.json({ success: true, action, acquired: false, reason: 'lock_changed', canonical_id: canonical?.id || null });
        }
        if (action !== 'release' && !active(canonical, Date.now())) {
          return Response.json({ success: true, action, acquired: false, reason: 'lock_expired', canonical_id: canonical.id });
        }
        return Response.json({ success: true, action, acquired: action !== 'release', released: action === 'release', canonical_id: canonical.id, lease: canonical.setting_value });
      }
      rows = await readRows(entity);
      if (!rows.length) throw bad('Lock row disappeared.', 409);
    }
    return Response.json({ success: true, action, acquired: false, reason: 'cas_conflict', canonical_id: rows[0].id });
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 429].includes(status) ? status : 500;
    return Response.json({ success: false, error: safeStatus === 500 ? 'Sync lock operation failed.' : clean(error?.message) }, { status: safeStatus });
  }
});
