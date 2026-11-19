import { login, read } from './cb-mm.mjs';
await login();
console.log('map count', (await read({ entity: 'LegacyMigrationMap', query: { source_entity: 'customers' }, count: true })).count);
const p = await read({ entity: 'LegacyMigrationMap', query: { source_entity: 'customers' }, limit: 1000, sort: '-created_date' });
console.log(p.items.length, p.items.slice(0, 3).map((m) => `${m.source_id}->${m.target_id} ${m.notes}`).join('\n'));
console.log('cust count', (await read({ entity: 'Customer', count: true })).count);
