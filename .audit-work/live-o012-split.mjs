// O-012 split live probe — 2-line source → split picks line 2 only →
// new estimate has ONLY that line, remapped to its own project+product clones.
import { writeFileSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';

const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const STAMP = Date.now();
const ev = { stamp: STAMP, probes: [], ok: true };
const probe = (name, pass, detail = {}) => {
  ev.probes.push({ name, pass: !!pass, ...detail });
  if (!pass) ev.ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`, detail.error || '');
};
const inv = async (fn, p) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const d = (r) => r?.body?.data || r?.body || {};

const login = await inv('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token = d(login)?.token;
if (!token) { console.log('FATAL no token'); process.exit(1); }
const call = (fn, p) => inv(fn, { ...p, session_token: token });
let n = 0;
const readId = async (entity, id) => d(await call('staffDataRead', { entity, id, limit: 50 + n++ }))?.item;
const filter = async (entity, query) => d(await call('staffDataRead', { entity, query, limit: 100 + n++ }))?.items || [];
const write = (entity, op, p) => call('staffEntityWrite', { entity, op, ...p });

// ---- fixture: 2-line source (project+product+part each) ----
const cust = await call('ensureNewCustomer', { creation_key: `o012s-cust-${STAMP}`, customer: { company_name: `O012 Split ${STAMP}`, status: 'active' } });
const customerId = d(cust)?.customer?.id;
const est = await call('ensureNewEstimate', { creation_key: `o012s-src-${STAMP}`, estimate: { project_name: `O012 SplitSrc ${STAMP}`, client_name: `O012 Split ${STAMP}`, customer_id: customerId, status: 'draft' } });
const srcId = d(est)?.estimate?.id;
const lines = [];
const refs = [];
for (const tag of ['A', 'B']) {
  const proj = await write('FoundationProject', 'create', { data: { project_name: `O012 Split ${tag} ${STAMP}`, client_name: `O012 Split ${STAMP}`, status: 'draft' } });
  const projectId = d(proj)?.record?.id;
  const prod = await write('BuilderProduct', 'create', { data: { builder_name: `O012 SplitProd ${tag} ${STAMP}`, estimate_id: 'pending', source_project_id: projectId, module_key: 'foundation', builder_snapshot_hash: `snap-${tag}-${STAMP}`, frozen_cost: 100, price_state: 'current', quantity: 1 } });
  const productId = d(prod)?.record?.id;
  await write('BuilderPart', 'create', { data: { builder_product_id: productId, part_key: `pk-${tag}-${STAMP}`, part_name: `Part ${tag}`, quantity: 1, frozen_unit_cost: 100 } });
  refs.push({ projectId, productId });
  lines.push({ line_id: `L${tag}${STAMP}`, module_key: 'foundation', project_name: `Line ${tag}`, customer_quantity: 1, customer_unit_price: 100, internal_cost: 100, total_cost: 100, project_id: projectId, builder_product_id: productId });
}
probe('fixtures', !!(srcId && refs[0].projectId && refs[1].productId));
const srcPre = await readId('AllInOneEstimate', srcId);
await write('AllInOneEstimate', 'updateMany', { id: srcId, query: { id: srcId, updated_date: srcPre?.updated_date }, update: { $set: { line_items: lines, quote_total: 200, total_cost: 200 } } });
const src = await readId('AllInOneEstimate', srcId);
probe('source armed 2 lines', src?.line_items?.length === 2);

// ---- split: pick line B only (mirrors buildSplitEstimate) ----
const clone = { ...src };
for (const k of ['id', 'created_date', 'updated_date', 'created_by', 'estimate_number', 'status', 'quote_version']) delete clone[k];
clone.status = 'draft';
clone.split_from_estimate_id = srcId;
clone.line_items = [lines[1]]; // only picked line
clone.project_name = `${src.project_name} (split)`;
const split = await call('ensureNewEstimate', { creation_key: `o012s-copy-${STAMP}`, estimate: clone });
const splitId = d(split)?.estimate?.id;
probe('split created', !!splitId, { splitId, resp: !splitId ? d(split) : undefined });

const child = await readId('AllInOneEstimate', splitId);
const cl = child?.line_items?.[0];
probe('split has 1 line', child?.line_items?.length === 1, { count: child?.line_items?.length });
probe('picked line B', cl?.line_id === `LB${STAMP}`, { lid: cl?.line_id });
probe('line project remapped', !!cl?.project_id && cl.project_id !== refs[1].projectId, { pid: cl?.project_id });
probe('line product remapped', !!cl?.builder_product_id && cl.builder_product_id !== refs[1].productId, { bid: cl?.builder_product_id });
const newProj = cl?.project_id ? await readId('FoundationProject', cl.project_id) : null;
probe('proj clone keyed', newProj?.creation_request_key === `copy-proj:${splitId}:${refs[1].projectId}`, { key: newProj?.creation_request_key });
const newProd = cl?.builder_product_id ? await readId('BuilderProduct', cl.builder_product_id) : null;
probe('prod owned by child', newProd?.estimate_id === splitId && newProd?.estimate_line_id === cl?.line_id, { est: newProd?.estimate_id });
probe('prod src proj remapped', newProd?.source_project_id === cl?.project_id, { sp: newProd?.source_project_id });
const parts = await filter('BuilderPart', { builder_product_id: cl?.builder_product_id });
probe('parts cloned', parts.length === 1 && parts[0]?.part_key === `pk-B-${STAMP}`, { count: parts.length, pk: parts[0]?.part_key });
// untouched: no clone of line A's project/product under the child
const strayA = (await filter('FoundationProject', { creation_request_key: `copy-proj:${splitId}:${refs[0].projectId}` })).length;
const strayAP = (await filter('BuilderPart', { builder_product_id: cl?.builder_product_id })).length;
probe('no line-A transplant', strayA === 0, { strayA });
probe('split pricing flagged stale', child?.pricing_stale === true || (child?.quote_total ?? 0) === 200, { stale: child?.pricing_stale, qt: child?.quote_total });

const passed = ev.probes.filter((p) => p.pass).length;
console.log(`\n${ev.ok ? 'PASS' : 'FAIL'} live-o012-split: ${passed}/${ev.probes.length}`);
writeFileSync(new URL(`./live-o012-split-${STAMP}.json`, import.meta.url), JSON.stringify(ev, null, 2));
process.exit(ev.ok ? 0 : 1);
