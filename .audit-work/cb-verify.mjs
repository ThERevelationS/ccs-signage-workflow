import { readFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
await login();
const rows = JSON.parse(readFileSync('imports/corebridge-2026-11-16/rows-new-customers.json', 'utf8'));
const maps = (await read({ entity: 'LegacyMigrationMap', query: { source_entity: 'customers', migration_batch: 'cb-customers-2026-11-17' }, limit: 5000 })).items;
const byS = new Map(maps.map((m) => [m.source_id, m]));
let bad = 0, n = 0;
for (const r of rows.slice(0, Number(process.argv[2]) || 5)) {
  const m = byS.get(r.__source_id__); if (!m) { console.log('no map', r.__source_id__); bad++; continue; }
  const c = (await read({ entity: 'Customer', id: m.target_id })); const row = c.item || c.items?.[0] || c;
  for (const [k, v] of Object.entries(r)) { if (k === '__source_id__' || k === 'notes') continue; const got = row[k]; const ok = String(got).replace(/\D/g, '') === String(v).replace(/\D/g, '') && /phone|fax/.test(k) || got === v || String(got) === String(v); if (!ok) { bad++; console.log(r.__source_id__, k, JSON.stringify(v), '->', JSON.stringify(got)); } }
  n++;
}
console.log(`verified ${n} rows, mismatches=${bad}`);
