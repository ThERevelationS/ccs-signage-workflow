import { writeFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
await login();
const all = async (e, q = {}) => { const out = []; for (let skip = 0; ; skip += 1000) { const p = await read({ entity: e, query: q, limit: 1000, skip, sort: 'created_date' }); out.push(...p.items); if (p.items.length < 1000) break; } return out; };
for (const e of ['WorkOrder', 'Opportunity', 'AllInOneEstimate']) {
  const rows = await all(e);
  const keys = {}; for (const r of rows) for (const k of Object.keys(r)) if (/customer|client|company|account/i.test(k)) keys[k] = (keys[k] || 0) + (r[k] ? 1 : 0);
  console.log(e, rows.length, JSON.stringify(keys));
  writeFileSync(`imports/corebridge-2026-11-16/app-${e}-snapshot.json`, JSON.stringify(rows));
}
