import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const read = async (p) => { const b = (await (await fetch(`${FN}/staffDataRead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, session_token: login.token }) })).json()); return b.data || b; };
const tiers = (await read({ entity: 'MarkupTier', limit: 50 })).items;
for (const t of tiers) console.log('TIER', t.tier_number, JSON.stringify(t.name), 'markups=', JSON.stringify(t.markups).slice(0, 160), 'created', String(t.created_date).slice(0, 10), 'by', t.created_by, 'migr=', t.migration_batch_id || t.source_system || '-');
const cust = [];
for (let skip = 0; ; skip += 993) { const p = await read({ entity: 'Customer', limit: 993, skip }); cust.push(...p.items); if (!p.truncated) break; }
const by = (f) => { const m = {}; for (const r of cust) { const k = f(r); m[k] = (m[k] || 0) + 1; } return m; };
console.log('customers', cust.length);
console.log('created by date', JSON.stringify(by((r) => String(r.created_date).slice(0, 10))));
console.log('source', JSON.stringify(by((r) => r.source_system || r.migration_batch_id ? 'migrated' : (r.corebridge_id || r.external_id ? 'has-ext-id' : 'native'))));
console.log('tier set', JSON.stringify(by((r) => r.pricing_tier ?? r.markup_tier_id ?? 'none')));
console.log('has contact email', cust.filter((r) => r.contact_email).length, 'has billing addr', cust.filter((r) => r.billing_address_1).length);
console.log('sample keys', Object.keys(cust[0]).join(','));
