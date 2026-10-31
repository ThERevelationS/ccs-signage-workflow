import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const page = readFileSync(resolve(root, 'src/pages/Customer360.jsx'), 'utf8');
const sections = readFileSync(resolve(root, 'src/components/customer360/Sections.jsx'), 'utf8');
const datalist = readFileSync(resolve(root, 'src/components/customer360/DataList.jsx'), 'utf8');
const kpi = readFileSync(resolve(root, 'src/components/customer360/KpiStrip.jsx'), 'utf8');
const model = readFileSync(resolve(root, 'src/components/customer360/customer360Model.js'), 'utf8');
const allSrc = [page, sections, datalist, kpi, model].join('\n');

// --- Param contract ----------------------------------------------------------
// `?id=` is canonical; `?customer=` is the alias. Both lookups live in
// readCustomerIdParam so the page stays a thin wrapper.
assert.match(model, /get\("id"\)/, 'model must read the ?id= param');
assert.match(model, /get\("customer"\)/, 'model must read the ?customer= alias');
assert.match(page, /readCustomerIdParam\(window\.location\.search\)/, 'page must read the id from the query string');

// --- Backend contract ----------------------------------------------------------
assert.match(page, /functions\.invoke\("opportunityWorkspaceAction"/, 'page must invoke the workspace function');
assert.match(page, /action:\s*"customer_workspace"/, 'page must call action:"customer_workspace"');
assert.match(page, /customer_id:\s*customerId/, 'page must pass customer_id');

// --- Sections ------------------------------------------------------------------
for (const label of ['Overview', 'Estimates', 'Jobs', 'Financials', 'Contacts & Locations']) {
  assert.ok(page.includes(`label: "${label}"`), `tab "${label}" must be registered`);
}
assert.ok(page.includes('CRM / Activity'), 'CRM / Activity tab must be registered');
for (const key of ['overview', 'estimates', 'jobs', 'financials', 'activity', 'contacts']) {
  assert.ok(page.includes(`tab === "${key}"`), `tab "${key}" must render`);
}

// --- Deep links ------------------------------------------------------------------
// Record rows link through kit RecordLink (kind -> canonical href in
// recordRoutes.js). Assert the kind usage here and the route map below.
for (const kind of [
  'estimate',
  'workorder',
  'invoice',
  'po',
  'opportunity',
]) {
  assert.ok(sections.includes(`RecordLink kind="${kind}"`), `deep link for kind=${kind} must render via RecordLink`);
}
// Literal routes that remain hand-linked (no RecordLink kind for change
// orders; page-level actions keep explicit hrefs).
for (const link of [
  '/ChangeOrders?co=',
  '/CustomerStatements?customer=',
  '/NewAllInOneEstimate?customer=',
]) {
  assert.ok(allSrc.includes(link), `deep link ${link} must be rendered`);
}
// The canonical route map carries the actual hrefs RecordLink emits.
const recordRoutes = readFileSync(resolve(root, 'src/components/kit/recordRoutes.js'), 'utf8');
for (const route of [
  'customer: { path: "/Customer360", param: "id"',
  'estimate: { path: "/EstimateDetail", param: "id"',
  'workorder: { path: "/JobWorkspace", param: "wo"',
  'invoice: { path: "/Invoices", param: "invoice"',
  'po: { path: "/PurchaseOrders", param: "po"',
  'opportunity: { path: "/Opportunities", param: "open"',
]) {
  assert.ok(recordRoutes.includes(route), `recordRoutes must map ${route}`);
}

// --- Graceful degradation ---------------------------------------------------------
assert.ok(page.includes('Customer 360 backend not deployed yet'), 'degraded banner must exist');
assert.match(page, /Customer\.get\(customerId\)/, 'page must fall back to a staffDataRead Customer get');
assert.match(page, /computeTotals/, 'page must compute totals client-side when totals are absent');
assert.match(page, /catch\(\(err\)\s*=>\s*\(\{ ok: false/, 'workspace invoke must fail soft');
assert.ok(datalist.includes('BackendRequired') || sections.includes('BackendRequired'), 'function-only sections need a backend-required empty state');
assert.match(datalist, /md:hidden/, 'lists must collapse to cards on mobile');
assert.match(datalist, /hidden overflow-x-auto md:block/, 'lists must render as tables on md+');

// --- Session gating -----------------------------------------------------------------
assert.match(page, /useAuth\(\)/, 'page must use the EmailGate auth context');
assert.match(page, /if \(!isRegistered\) return null/, 'page must gate on isRegistered like sibling pages');
assert.match(page, /sessionToken/, 'page must pass the staff session token');

// --- Loading / error / truncated states ----------------------------------------------
assert.match(page, /animate-pulse/, 'loading skeleton must exist');
assert.match(page, /setError/, 'error state must exist');
assert.match(page, /truncated/, 'truncated-list notice must be wired');
assert.match(model, /truncatedListNames/, 'truncated flag must be normalized');

// --- Unit: model behaviour ------------------------------------------------------------
const out = resolve(here, '.tmp-customer360.mjs');
buildSync({
  entryPoints: [resolve(root, 'src/components/customer360/customer360Model.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const m = await import(pathToFileURL(out).href);

assert.equal(m.readCustomerIdParam('?id=abc'), 'abc');
assert.equal(m.readCustomerIdParam('?customer=xyz'), 'xyz');
assert.equal(m.readCustomerIdParam('?id=a&customer=b'), 'a', 'id wins over customer');
assert.equal(m.readCustomerIdParam('?other=1'), '');
assert.equal(m.readCustomerIdParam(''), '');

// Semantics mirror the deployed customer_workspace action: estimates count
// every non-deleted row, open_estimate_value covers draft/calculated/sent, and
// invoice money runs over non-void rows (drafts included).
const totals = m.computeTotals({
  estimates: [
    { id: 'e1', status: 'sent', quote_total: 100 },
    { id: 'e2', status: 'approved', quote_total: 250 },
    { id: 'e3', status: 'draft', quote_total: 50 },
    { id: 'e4', status: 'cancelled', quote_total: 999 },
    { id: 'e5', status: 'sent', quote_total: 5, deleted: true },
  ],
  work_orders: [{ id: 'w1' }, { id: 'w2', deleted: true }],
  invoices: [
    { id: 'i1', status: 'sent', total: 100, amount_paid: 40, balance_due: 60 },
    { id: 'i2', status: 'paid', total: 50, amount_paid: 50, balance_due: 0 },
    { id: 'i3', status: 'draft', total: 999 },
    { id: 'i4', status: 'void', total: 999 },
  ],
  payments: [{ id: 'p1', amount: 90, status: 'posted' }],
  purchase_orders: [
    { id: 'po1', status: 'sent' },
    { id: 'po2', status: 'received' },
    { id: 'po3', status: 'draft' },
    { id: 'po4', status: 'cancelled' },
  ],
  activities: [
    { id: 'a1', due_at: '2030-01-01', completed_at: '' },
    { id: 'a2', due_at: '2030-01-01', completed_at: '2030-01-02' },
    { id: 'a3', event_type: 'stage_changed' },
  ],
});
assert.equal(totals.estimate_count, 4, 'only deleted estimates excluded');
assert.equal(totals.estimate_value, 1399);
assert.equal(totals.open_estimate_value, 150, 'draft + sent count as open');
assert.equal(totals.work_order_count, 1);
assert.equal(totals.invoiced, 1149, 'drafts count, void excluded');
assert.equal(totals.paid, 90, 'invoice amount_paid wins over payment sum');
assert.equal(totals.balance, 60);
assert.equal(totals.open_po_count, 2, 'draft + sent POs are open');
assert.equal(totals.open_activity_count, 1, 'only due, uncompleted activities are open');

// normalizeWorkspace: missing lists → [], missing totals → computed from lists.
const ws = m.normalizeWorkspace({
  customer: { id: 'c1', company_name: 'Acme' },
  estimates: [{ id: 'e1', status: 'sent', quote_total: 10 }],
});
assert.equal(ws.customer.id, 'c1');
assert.deepEqual(ws.invoices, []);
assert.equal(ws.totals.estimate_count, 1);
assert.equal(ws.totals.estimate_value, 10);
assert.equal(ws.totals.balance, 0);

// Explicit totals always win over computed ones (even when reporting zero).
const ws2 = m.normalizeWorkspace({ totals: { estimate_count: 0, balance: 12.5 }, estimates: [{ quote_total: 99 }] });
assert.equal(ws2.totals.estimate_count, 0);
assert.equal(ws2.totals.balance, 12.5);
assert.equal(ws2.totals.estimate_value, 99, 'omitted keys still compute from lists');

// truncated normalizes bool | array | map shapes.
assert.deepEqual(m.truncatedListNames(true), ['records']);
assert.deepEqual(m.truncatedListNames(['invoices']), ['invoices']);
assert.deepEqual(m.truncatedListNames({ invoices: true, payments: 0, estimates: 50 }), ['invoices', 'estimates']);
assert.deepEqual(m.truncatedListNames(null), []);

// Activity open/overdue semantics.
assert.equal(m.isActivityOpen({ due_at: '2030-01-01', completed_at: '' }), true);
assert.equal(m.isActivityOpen({ due_at: '2030-01-01', completed_at: '2030-01-02' }), false);
assert.equal(m.isActivityOpen({ event_type: 'note' }), false);
assert.equal(m.isActivityOverdue({ due_at: '2000-01-01' }, '2030-01-01'), true);
assert.equal(m.isActivityOverdue({ due_at: '2030-06-01' }, '2030-01-01'), false);

assert.equal(m.daysOverdue({ due_date: '2030-01-01', balance_due: 10 }, '2030-01-11'), 10);
assert.equal(m.daysOverdue({ due_date: '2030-01-01', balance_due: 0 }, '2030-01-11'), 0);

rmSync(out, { force: true });
console.log('PASS customer360-page');
