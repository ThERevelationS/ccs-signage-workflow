import { login, mm, read } from './cb-mm.mjs';
const l = await login(); console.log('role', l.user?.role || l.role, Object.keys(l));
console.log(JSON.stringify(await mm({ action: 'list_batches' })).slice(0, 1500));
try { console.log('map count', JSON.stringify(await read({ entity: 'LegacyMigrationMap', count: true }))); } catch (e) { console.log('map read', e.message); }
for (const e of ['CustomerContact', 'CustomerLocation']) try { console.log(e, JSON.stringify(await read({ entity: e, count: true }))); } catch (x) { console.log(e, x.message.slice(0,200)); }
