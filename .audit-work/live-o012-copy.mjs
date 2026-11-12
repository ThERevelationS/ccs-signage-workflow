// O-012 Option A live probe — duplicate produces a REAL working copy:
// source estimate w/ project+product+parts → ensureNewEstimate (dup lineage)
// → copy has line_items, remapped to NEW owned clones (project/product/parts),
// retry same creation key → same estimate, no double-clone.
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

// ---- fixture: customer + project + product(+parts) + source estimate ----
const cust = await call('ensureNewCustomer', { creation_key: `o012-cust-${STAMP}`, customer: { company_name: `O012 Copy ${STAMP}`, status: 'active' } });
const customerId = d(cust)?.customer?.id;
const proj = await write('FoundationProject', 'create', { data: { project_name: `O012 Src Project ${STAMP}`, estimate_id: 'pending', client_name: `O012 Copy ${STAMP}`, total_cost: 800, status: 'draft', builder_sync_attempt: { schema_version: 1, key: `rcpt-${STAMP}`, estimate_id: 'pending', requested_at: new Date().toISOString() } } });
const projectId = d(proj)?.record?.id || d(proj)?.id || d(proj)?.result?.id;
probe('fixture project', !!projectId, { projectId, resp: !projectId ? d(proj) : undefined });
const prod = await write('BuilderProduct', 'create', { data: { builder_name: `O012 Product ${STAMP}`, estimate_id: 'pending', source_project_id: projectId, module_key: 'foundation', builder_snapshot_hash: `snap-${STAMP}`, frozen_cost: 800, price_state: 'current', quantity: 1, hard_due_date: true, operational_status: 'in_production' } });
const productId = d(prod)?.record?.id || d(prod)?.id || d(prod)?.result?.id;
probe('fixture product', !!productId, { productId, resp: !productId ? d(prod) : undefined });
const part1 = await write('BuilderPart', 'create', { data: { builder_product_id: productId, part_key: `p1-${STAMP}`, part_name: 'Concrete', quantity: 2, frozen_unit_cost: 100 } });
const part2 = await write('BuilderPart', 'create', { data: { builder_product_id: productId, part_key: `p2-${STAMP}`, part_name: 'Rebar', quantity: 4, frozen_unit_cost: 50 } });
probe('fixture parts', !!(d(part1)?.record?.id || d(part1)?.id) && !!(d(part2)?.record?.id || d(part2)?.id), { r1: d(part1)?.error, r2: d(part2)?.error });

const est = await call('ensureNewEstimate', { creation_key: `o012-src-${STAMP}`, estimate: { project_name: `O012 Source ${STAMP}`, client_name: `O012 Copy ${STAMP}`, customer_id: customerId, status: 'draft' } });
const srcId = d(est)?.estimate?.id;
const srcLine = { line_id: `L${STAMP}`, module_key: 'foundation', project_name: 'Src foundation', customer_quantity: 1, customer_unit_price: 800, internal_cost: 800, total_cost: 800, project_id: projectId, builder_product_id: productId };
const srcPre = await readId('AllInOneEstimate', srcId);
await write('AllInOneEstimate', 'updateMany', { id: srcId, query: { id: srcId, updated_date: srcPre?.updated_date }, update: { $set: { line_items: [srcLine], quote_total: 800, total_cost: 800 } } });
const src = await readId('AllInOneEstimate', srcId);
probe('source armed', src?.line_items?.[0]?.builder_product_id === productId);

// ---- duplicate (client-equivalent payload: full clone + lineage marker) ----
const clone = { ...src };
for (const k of ['id', 'created_date', 'updated_date', 'created_by', 'estimate_number', 'status', 'quote_version']) delete clone[k];
clone.status = 'draft';
clone.duplicated_from_estimate_id = srcId;
const dupKey = `o012-copy-${STAMP}`;
const dup = await call('ensureNewEstimate', { creation_key: dupKey, estimate: clone });
const dupId = d(dup)?.estimate?.id;
probe('copy created', !!dupId, { dupId, resp: !dupId ? d(dup) : undefined });

const copy = await readId('AllInOneEstimate', dupId);
const cLine = copy?.line_items?.[0];
probe('copy has line_items', Array.isArray(copy?.line_items) && copy.line_items.length === 1, { count: copy?.line_items?.length });
probe('line project remapped', !!cLine?.project_id && cLine.project_id !== projectId, { project_id: cLine?.project_id });
probe('line product remapped', !!cLine?.builder_product_id && cLine.builder_product_id !== productId, { builder_product_id: cLine?.builder_product_id });

const newProj = cLine?.project_id ? await readId('FoundationProject', cLine.project_id) : null;
// Module projects carry no estimate_id field — ownership is the copy's
// line_items[].project_id pointer + keyed clone lineage + estimate_number.
probe('project clone owned by copy', !!newProj?.id && newProj.creation_request_key === `copy-proj:${dupId}:${projectId}` && cLine.project_id !== projectId, { key: newProj?.creation_request_key });
probe('project clone number', String(newProj?.estimate_number || '') === String(copy?.estimate_number || ''), { num: newProj?.estimate_number, want: copy?.estimate_number });
probe('project clone key', newProj?.creation_request_key === `copy-proj:${dupId}:${projectId}`, { key: newProj?.creation_request_key });
probe('no sync receipt transplanted', newProj?.builder_sync_attempt == null || newProj?.builder_sync_attempt === '', { bsa: newProj?.builder_sync_attempt });

const newProd = cLine?.builder_product_id ? await readId('BuilderProduct', cLine.builder_product_id) : null;
probe('product clone owned by copy', newProd?.estimate_id === dupId, { est: newProd?.estimate_id });
probe('product clone line link', newProd?.estimate_line_id === cLine?.line_id, { eli: newProd?.estimate_line_id });
probe('product source_project remapped', newProd?.source_project_id === cLine?.project_id, { sp: newProd?.source_project_id });
const newParts = cLine?.builder_product_id ? await filter('BuilderPart', { builder_product_id: cLine.builder_product_id }) : [];
probe('parts cloned', newParts.length === 2 && newParts.every((p) => p.builder_product_id === cLine.builder_product_id), { count: newParts.length, keys: newParts.map((p) => p.part_key) });
probe('lifecycle reset', newProd?.operational_status !== 'in_production' && newProd?.hard_due_date !== true && newProd?.fulfillment_state !== 'active', { fs: newProd?.fulfillment_state, os: newProd?.operational_status, hdd: newProd?.hard_due_date });
probe('design preserved', newProd?.builder_snapshot_hash === `snap-${STAMP}` && newProd?.frozen_cost === 800, { hash: newProd?.builder_snapshot_hash });
probe('totals attached', copy?.total_cost === 800 && copy?.quote_total === 800, { tc: copy?.total_cost, qt: copy?.quote_total });

// ---- retry same creation key → same estimate, no double-clone ----
const retry = await call('ensureNewEstimate', { creation_key: dupKey, estimate: clone });
const retryId = d(retry)?.estimate?.id;
probe('retry same id', retryId === dupId, { retryId });
const prodCount = (await filter('BuilderProduct', { estimate_id: dupId })).length;
const projCount = (await filter('FoundationProject', { creation_request_key: `copy-proj:${dupId}:${projectId}` })).length;
const partCount = (await filter('BuilderPart', { builder_product_id: cLine?.builder_product_id })).length;
probe('no double-clone', prodCount === 1 && projCount === 1 && partCount === 2, { prodCount, projCount, partCount });

const passed = ev.probes.filter((p) => p.pass).length;
console.log(`\n${ev.ok ? 'PASS' : 'FAIL'} live-o012-copy: ${passed}/${ev.probes.length}`);
writeFileSync(new URL(`./live-o012-${STAMP}.json`, import.meta.url), JSON.stringify(ev, null, 2));
process.exit(ev.ok ? 0 : 1);
