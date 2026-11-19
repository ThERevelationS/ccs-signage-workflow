// Pipeline rows with no customer_id: derive the client from the linked estimate (estimate_id) — the authoritative link.
import { readFileSync, writeFileSync } from 'node:fs';
import { login, read } from './cb-mm.mjs';
await login();
const page = async (entity) => { const all = []; for (let s = 0; ; s += 1000) { const p = await read({ entity, limit: 1000, skip: s, sort: 'created_date' }); all.push(...p.items); if (p.items.length < 1000) break; } return all; };
const wos = await page('WorkOrder');
const done = readFileSync('imports/corebridge-2026-11-16/estimate-lines-done.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const estIds = new Set(done.map((d) => d.target_id));
const unlinked = wos.filter((w) => !w.customer_id && w.deleted !== true);
const withEst = unlinked.filter((w) => w.estimate_id);
const withNum = unlinked.filter((w) => !w.estimate_id && String(w.est_inv_at || '').match(/\d/));
const none = unlinked.filter((w) => !w.estimate_id && !String(w.est_inv_at || '').match(/\d/));
const est = new Map();
for (const w of withEst) { if (est.has(w.estimate_id)) continue; const r = await read({ entity: 'AllInOneEstimate', id: w.estimate_id }); const e = r.item || r.items?.[0] || r; est.set(w.estimate_id, e); await new Promise((s) => setTimeout(s, 400)); }
const plan = withEst.map((w) => { const e = est.get(w.estimate_id) || {}; return { id: w.id, updated_date: w.updated_date, client_name: w.client_name, est_inv_at: w.est_inv_at, estimate_id: w.estimate_id, estimate_number: e.estimate_number, customer_id: e.customer_id || null, imported_cb: estIds.has(w.estimate_id) }; });
writeFileSync('imports/corebridge-2026-11-16/pipeline-customer-from-estimate-plan.json', JSON.stringify({ plan, withNum: withNum.map((w) => ({ id: w.id, client_name: w.client_name, est_inv_at: w.est_inv_at })), none: none.map((w) => ({ id: w.id, client_name: w.client_name, title: w.title, created_date: w.created_date, corbridge_link: w.corbridge_link || '' })) }, null, 1));
console.log({ workorders: wos.length, unlinked: unlinked.length, linked_estimate: withEst.length, estimate_has_customer: plan.filter((p) => p.customer_id).length, estimate_no_customer: plan.filter((p) => !p.customer_id).length, number_but_no_estimate_link: withNum.length, no_estimate_number_at_all: none.length });
