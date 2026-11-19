import { login, read } from './cb-mm.mjs';
await login();
const c = await read({ entity: 'Inventory', count: true }); console.log('Inventory', c.count);
const p = await read({ entity: 'Inventory', limit: 5 }); console.log(JSON.stringify(p.items.map((x) => ({ n: x.name || x.item_name, cat: x.category, cost: x.unit_cost ?? x.cost, act: x.is_active, src: x.legacy_source_id }))));
const all = []; for (let s = 0; ; s += 1000) { const r = await read({ entity: 'Inventory', limit: 1000, skip: s }); all.push(...r.items); if (r.items.length < 1000) break; }
console.log('legacy src', all.filter((x) => x.legacy_source_id).length, 'keys', Object.keys(all[0] || {}).join(','));
