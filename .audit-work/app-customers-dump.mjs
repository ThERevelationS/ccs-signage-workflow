// Read-only snapshot of all Customer rows (backup + matching input).
import { readFileSync, writeFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const read = async (p) => { const r = await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, session_token: login.token }) }); const b = await r.json(); if (r.status !== 200) throw new Error(r.status + JSON.stringify(b).slice(0, 200)); return b.data || b; };
const rows = []; for (let skip = 0; ; skip += 983) { const p = await read({ entity: 'Customer', sort: 'created_date', limit: 983, skip }); rows.push(...p.items); if (!p.truncated) break; }
const count = (await read({ entity: 'Customer', count: true })).count;
if (rows.length !== count || new Set(rows.map((r) => r.id)).size !== count) throw new Error(`incomplete read ${rows.length} vs ${count}`);
const tiers = (await read({ entity: 'MarkupTier', limit: 100 })).items;
writeFileSync('imports/corebridge-2026-11-16/app-customers-before.json', JSON.stringify(rows, null, 1));
writeFileSync('imports/corebridge-2026-11-16/app-markup-tiers-before.json', JSON.stringify(tiers, null, 1));
console.log(`customers=${rows.length} (gateway count ${count}) tiers=${tiers.length}`);
