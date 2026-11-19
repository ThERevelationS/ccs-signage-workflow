import { login, read } from './cb-mm.mjs';
await login();
const p = await read({ entity: 'LegacyMigrationMap', limit: 1000 });
const t = {}; for (const r of p.items) { const k = `${r.source_app_id}|${r.source_entity}|${r.target_entity}`; t[k] = (t[k] || 0) + 1; }
console.log(t); console.log(JSON.stringify(p.items[0]).slice(0, 500));
