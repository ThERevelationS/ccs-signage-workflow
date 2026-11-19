// Fill EMPTY WorkOrder.customer_id from the linked estimate's customer_id (CAS on updated_date).
import { readFileSync, appendFileSync } from 'node:fs';
import { login, call } from './cb-mm.mjs';
const p = JSON.parse(readFileSync('imports/corebridge-2026-11-16/pipeline-customer-from-estimate-plan.json', 'utf8'));
await login();
let ok = 0, skip = 0;
for (const r of p.plan.filter((x) => x.customer_id)) {
  try { await call('staffEntityWrite', { entity: 'WorkOrder', op: 'updateMany', id: r.id, query: { id: r.id, updated_date: r.updated_date }, update: { $set: { customer_id: r.customer_id } } }); ok++; appendFileSync('.audit-work/cb-pipe-cust-applied.jsonl', JSON.stringify({ id: r.id, customer_id: r.customer_id }) + '\n'); }
  catch (e) { skip++; appendFileSync('.audit-work/cb-pipe-cust-skipped.jsonl', JSON.stringify({ id: r.id, error: String(e.message).slice(0, 160) }) + '\n'); }
  await new Promise((s) => setTimeout(s, 1500));
}
console.log({ ok, skip });
