import { readFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
await login();
const rows = readFileSync('.audit-work/cb-pipe-cust-applied.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, 3);
for (const r of rows) { const x = await read({ entity: 'WorkOrder', id: r.id }); const w = x.item || x.items?.[0] || x; console.log(w.client_name, '|', w.customer_id === r.customer_id ? 'OK' : 'MISMATCH ' + w.customer_id); }
