// Live lineage + idempotency probes (O-012/O-007 residual depth).
// A) ensureNewEstimate retry with the SAME creation_key must return the SAME
//    record — the idempotent-create contract proven on real records.
// B) a duplicate create carrying duplicated_from_estimate_id must persist the
//    lineage field through the real entity layer.
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const r = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json());
const call = (fn, p) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, session_token: r.token }) }).then((x) => x.json()).then((d) => d?.data || d);
let pass = 0, fail = 0;
const t = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok' : 'FAIL'} ${n} ${extra}`); };

const cust = await call('ensureNewCustomer', { creation_key: `live-lin-cust-${Date.now()}`, customer: { company_name: '[LIVE-LINEAGE] probe co' } });
const cid = cust?.customer?.id;
t('customer', !!cid);

const key = `live-lin-est-${Date.now()}`;
const mk = (dup = '') => ({ creation_key: key, estimate: { project_name: '[LIVE-LINEAGE] probe est', client_name: '[LIVE-LINEAGE] probe co', customer_id: cid, status: 'draft', ...(dup ? { duplicated_from_estimate_id: dup } : {}) } });
const e1 = await call('ensureNewEstimate', mk());
const id1 = e1?.estimate?.id;
t('create_first', !!id1, id1);

// A) same creation_key → same record (idempotent), not a second create
const e2 = await call('ensureNewEstimate', mk());
t('idempotent_same_id', e2?.estimate?.id === id1, `second=${e2?.estimate?.id}`);

// B) duplicate lineage field persists
const dupKey = `live-lin-dup-${Date.now()}`;
const e3 = await call('ensureNewEstimate', { creation_key: dupKey, estimate: { project_name: '[LIVE-LINEAGE] dup', client_name: 'x', customer_id: cid, status: 'draft', duplicated_from_estimate_id: id1 } });
const got = await call('staffDataRead', { entity: 'AllInOneEstimate', id: e3?.estimate?.id, limit: 71 });
t('lineage_persists', got?.item?.duplicated_from_estimate_id === id1, `got=${got?.item?.duplicated_from_estimate_id}`);

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} live-lineage: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
