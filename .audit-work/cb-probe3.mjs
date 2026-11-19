import { login, read } from './cb-mm.mjs';
await login();
const p = await read({ entity: 'TaxGroup', limit: 200 });
console.log(p.items.length, p.items.map((r) => `${r.id}|${r.name}|${r.rate ?? r.tax_rate ?? r.total_rate}`).join('\n'));
