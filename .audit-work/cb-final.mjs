import { login, read } from './cb-mm.mjs';
await login();
for (const e of ['Customer', 'CustomerContact']) console.log(e, (await read({ entity: e, count: true })).count);
const all = async (e) => { const out = []; for (let skip = 0; ; skip += 1000) { const p = await read({ entity: e, limit: 1000, skip, sort: 'created_date' }); out.push(...p.items); if (p.items.length < 1000) break; } return out; };
const w = await all('WorkOrder'); console.log('WorkOrders', w.length, 'linked', w.filter((x) => x.customer_id).length);
