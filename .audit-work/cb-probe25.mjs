import { login, read } from './cb-mm.mjs';
await login();
const all = []; for (let s = 0; ; s += 1000) { const p = await read({ entity: 'WorkOrder', limit: 1000, skip: s, sort: 'created_date' }); all.push(...p.items); if (p.items.length < 1000) break; }
console.log('workorders', all.length, 'with estimate_id', all.filter((w) => w.estimate_id).length, 'with customer_id', all.filter((w) => w.customer_id).length);
