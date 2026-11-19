import { login, read } from './cb-mm.mjs';
await login();
for (const e of ['TaxGroup', 'TaxAgency']) { try { const r = await read({ entity: e, limit: 200 }); console.log(e, r.items.length, JSON.stringify(r.items.slice(0, 3))); } catch (x) { console.log(e, x.message.slice(0, 150)); } }
