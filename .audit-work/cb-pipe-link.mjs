// Link Sales Pipeline WorkOrders (one row per job) to their Customer by client name.
// Only fills an EMPTY customer_id; never changes client_name (the Smartsheet-mapped field).
// usage: node cb-pipe-link.mjs plan | apply
import { readFileSync, writeFileSync } from 'node:fs';
import { login, read, call } from './cb-mm.mjs';
const D = 'imports/corebridge-2026-11-16/'; const mode = process.argv[2] || 'plan';
await login();
const all = async (e, q = {}) => { const out = []; for (let skip = 0; ; skip += 1000) { const p = await read({ entity: e, query: q, limit: 1000, skip, sort: 'created_date' }); out.push(...p.items); if (p.items.length < 1000) break; } return out; };
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|llc|inc|incorporated|co|company|corp|corporation|ltd|pllc|pc|lp|llp)\b/g, ' ').replace(/\s+/g, ' ').trim();
const customers = (await all('Customer')).filter((c) => c.is_active !== false || true);
const byName = new Map(); for (const c of customers) for (const n of [c.company_name, ...(c.legacy_client_names || [])]) { const k = norm(n); if (!k) continue; if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(c.id); }
const wos = await all('WorkOrder');
const candidates = (name) => { const raw = String(name || ''); const keys = [raw]; for (const sep of [' - ', ' – ', ' / ', '/', ' (', ' | ', ': ', ' -', '- ']) { const i = raw.indexOf(sep); if (i > 1) keys.push(raw.slice(0, i)); } return [...new Set(keys.map(norm).filter((k) => k && k !== 'unknown'))]; };
const plan = [], ambiguous = [], none = []; let already = 0;
for (const w of wos) {
  if (w.customer_id) { already++; continue; }
  let hit = null, how = '';
  for (const [i, k] of candidates(w.client_name).entries()) { const ids = byName.get(k); if (!ids) continue; if (ids.size === 1) { hit = [...ids][0]; how = i === 0 ? 'exact' : `prefix:${k}`; } else { ambiguous.push({ id: w.id, client_name: w.client_name, key: k, ids: [...ids] }); hit = 'AMB'; } break; }
  if (hit && hit !== 'AMB') plan.push({ id: w.id, updated_date: w.updated_date, client_name: w.client_name, customer_id: hit, how });
  else if (!hit) none.push({ id: w.id, client_name: w.client_name });
}
const byHow = {}; for (const p of plan) { const h = p.how.startsWith('prefix') ? 'prefix' : p.how; byHow[h] = (byHow[h] || 0) + 1; }
writeFileSync(D + 'pipeline-link-plan.json', JSON.stringify({ plan, ambiguous, none }, null, 1));
console.log({ workorders: wos.length, already_linked: already, to_link: plan.length, byHow, ambiguous: ambiguous.length, no_match: none.length, customers: customers.length });
console.log('prefix samples:', plan.filter((p) => p.how !== 'exact').slice(0, 12).map((p) => `${p.client_name} => ${customers.find((c) => c.id === p.customer_id).company_name}`).join(' | '));
if (mode === 'apply') {
  let ok = 0, conflict = 0;
  for (const p of plan) {
    try { await call('staffEntityWrite', { entity: 'WorkOrder', op: 'updateMany', id: p.id, query: { id: p.id, updated_date: p.updated_date }, update: { $set: { customer_id: p.customer_id } } }); ok++; }
    catch (e) { conflict++; if (conflict < 5) console.log('skip', p.id, e.message.slice(0, 160)); }
    if ((ok + conflict) % 100 === 0) process.stdout.write(`\rlinked ${ok} skipped ${conflict}`);
    await new Promise((s) => setTimeout(s, 300));
  }
  console.log(`\nlinked=${ok} skipped=${conflict}`);
}
