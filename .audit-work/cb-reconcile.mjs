// Find Customers created by this import (creation_request_key cb:customers:<id>) whose
// LegacyMigrationMap row is missing or marked error, and repair the ledger (no re-create).
import { login, read, call } from './cb-mm.mjs';
const BATCH = process.argv[2] === 'estimates' ? 'cb-estimates-2026-11-17' : 'cb-customers-2026-11-17';
const entity = process.argv[2] || 'customers', target = { customers: 'Customer', contacts: 'CustomerContact', estimates: 'AllInOneEstimate' }[entity];
const fix = process.argv[3] === 'fix';
await login();
const all = async (e, q) => { const out = []; for (let skip = 0; ; skip += 1000) { const p = await read({ entity: e, query: q, limit: 1000, skip, sort: 'created_date' }); out.push(...p.items); if (p.items.length < 1000) break; } return out; };
const created = (await all(target, {})).filter((r) => String(r.creation_request_key || '').startsWith(`cb:${entity}:`));
const maps = await all('LegacyMigrationMap', { source_entity: entity });
const bySrc = new Map(); for (const m of maps) { if (!bySrc.has(m.source_id)) bySrc.set(m.source_id, []); bySrc.get(m.source_id).push(m); }
const byKey = new Map(); for (const r of created) { const k = r.creation_request_key.split(':').slice(2).join(':'); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
const dupTargets = [...byKey].filter(([, v]) => v.length > 1);
let orphan = 0, repaired = 0;
for (const [src, rows] of byKey) {
  const ms = bySrc.get(src) || []; const good = ms.find((m) => m.target_id && m.target_id !== '__error__');
  if (good) continue; orphan++;
  if (!fix) continue;
  const keep = rows.sort((a, b) => a.created_date.localeCompare(b.created_date))[0];
  const data = { target_id: keep.id, migration_batch: BATCH, notes: JSON.stringify({ status: 'created', reconciled: true, at: new Date().toISOString() }) };
  if (ms[0]) await call('staffEntityWrite', { entity: 'LegacyMigrationMap', op: 'updateMany', query: { id: ms[0].id }, update: { $set: data } });
  else await call('staffEntityWrite', { entity: 'LegacyMigrationMap', op: 'create', data: { source_app_id: 'corebridge', source_entity: entity, source_id: src, target_entity: target, ...data } });
  repaired++;
}
console.log({ entity, created_rows: created.length, distinct_sources: byKey.size, duplicate_creates: dupTargets.length, orphans: orphan, repaired, map_rows: maps.length });
if (dupTargets.length) console.log('dups', JSON.stringify(dupTargets.slice(0, 5).map(([k, v]) => [k, v.map((x) => x.id)])));
