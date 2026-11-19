import { permitCreds } from '../scripts/lib/permit-creds.mjs';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const STAMP = Date.now();
const inv = async (fn, p) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const d = (r) => r?.body?.data || r?.body || {};
const login = await inv('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token = d(login)?.token;
const call = (fn, p) => inv(fn, { ...p, session_token: token });
let n = 0;
const readId = async (entity, id) => d(await call('staffDataRead', { entity, id, limit: 50 + n++ }))?.item;

// source estimate WITH a builder-backed line shape (project_id/builder_product_id placeholders)
const cust = await call('ensureNewCustomer', { creation_key: `dup-probe-cust-${STAMP}`, customer: { company_name: `Dup Probe ${STAMP}`, status: 'active' } });
const customerId = d(cust)?.customer?.id;
const line = { line_id: `L${STAMP}`, module_key: 'foundation', project_name: 'Src foundation', customer_quantity: 1, customer_unit_price: 500, internal_cost: 300, total_cost: 300, project_id: 'src-proj-abc', builder_product_id: 'src-prod-xyz' };
const est = await call('ensureNewEstimate', { creation_key: `dup-probe-src-${STAMP}`, estimate: { project_name: `Dup Src ${STAMP}`, client_name: `Dup Probe ${STAMP}`, customer_id: customerId, status: 'draft' } });
const srcId = d(est)?.estimate?.id;
const pre = await readId('AllInOneEstimate', srcId);
await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: srcId, query: { id: srcId, updated_date: pre?.updated_date }, update: { $set: { line_items: [line], quote_total: 500, total_cost: 300 } } });
const srcRead = await readId('AllInOneEstimate', srcId);
console.log('source lines:', JSON.stringify(srcRead?.line_items?.map(l => ({ bp: l.builder_product_id, proj: l.project_id }))));

// now duplicate via the same path the client uses: full clone incl. line_items
const clone = { ...srcRead, line_items: srcRead.line_items };
delete clone.id; delete clone.created_date; delete clone.updated_date; delete clone.created_by;
delete clone.estimate_number; delete clone.status; delete clone.quote_version;
delete clone.duplicated_from_estimate_id;
clone.status = 'draft'; clone.duplicated_from_estimate_id = srcId;
const dup = await call('ensureNewEstimate', { creation_key: `dup-probe-copy-${STAMP}`, estimate: clone });
const dupId = d(dup)?.estimate?.id;
const dupRead = await readId('AllInOneEstimate', dupId);
console.log('copy id:', dupId);
console.log('copy line_items:', JSON.stringify(dupRead?.line_items));
console.log('copy duplicated_from:', dupRead?.duplicated_from_estimate_id);
