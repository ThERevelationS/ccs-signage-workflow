import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_APP_ID = '68a5a85045cf8570330146ef';
const SOURCE_FUNCTION = 'configMigrationExport';
const MIGRATION_SECRET = 'rewhbP4aG6nyjgLpxFIuqv5NRZggfzkj6FeSn9s_pvI';

async function listAll(entity: any) {
  const out: any[] = [];
  const limit = 500;
  let skip = 0;
  while (true) {
    const batch = await entity.list(null, limit, skip);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < limit) break;
    skip += batch.length;
  }
  return out;
}

async function fetchSource(serverUrl: string, dataset: string) {
  const endpoint = `${serverUrl}/api/apps/${SOURCE_APP_ID}/functions/${SOURCE_FUNCTION}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: MIGRATION_SECRET, dataset }),
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error || text || `${res.status} ${res.statusText}`);
  }
  return payload;
}

async function syncDataset(entity: any, sourceRows: any[], keyFn: (r: any) => string) {
  const targetRows = await listAll(entity);
  const existing = new Map<string, any>();
  for (const row of targetRows) {
    const key = keyFn(row);
    if (key && !existing.has(key)) existing.set(key, row);
  }

  let created = 0;
  let updated = 0;
  const missing: any[] = [];
  for (const src of sourceRows) {
    const key = keyFn(src);
    if (!key) continue;
    const match = existing.get(key);
    if (match?.id) {
      await entity.update(match.id, src);
      updated++;
    } else {
      missing.push(src);
    }
  }
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const result = await entity.bulkCreate(chunk);
    const made = Array.isArray(result) ? result : (Array.isArray(result?.entities) ? result.entities : []);
    if (made.length !== chunk.length) throw new Error(`bulkCreate count mismatch: expected ${chunk.length}, got ${made.length}`);
    created += made.length;
  }
  const after = await listAll(entity);
  return { target_before: targetRows.length, created, updated, target_after: after.length };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== MIGRATION_SECRET) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const action = body?.action === 'migrate' ? 'migrate' : 'preview';
    const dataset = String(body?.dataset || '');
    if (!['settings', 'maintenance_action_rates'].includes(dataset)) {
      return Response.json({ success: false, error: 'Unsupported dataset' }, { status: 400 });
    }

    const serverUrl = (req.headers.get('Base44-Api-Url') || 'https://base44.app').replace(/\/$/, '');
    const source = await fetchSource(serverUrl, dataset);
    if (action === 'preview') {
      return Response.json({ success: true, action, dataset, source_raw: source.raw_count, source_unique: source.unique_count });
    }

    const base44 = createClientFromRequest(req);
    let sync;
    if (dataset === 'settings') {
      sync = await syncDataset(base44.asServiceRole.entities.Settings, source.rows || [], (r) => String(r?.setting_name || '').trim());
    } else {
      sync = await syncDataset(base44.asServiceRole.entities.MaintenanceActionRate, source.rows || [], (r) => `${String(r?.sign_type || '').trim()}|${String(r?.action || '').trim()}`);
    }
    return Response.json({ success: true, action, dataset, source_raw: source.raw_count, source_unique: source.unique_count, ...sync });
  } catch (error) {
    console.error('migrateEstimatorConfig error:', error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});