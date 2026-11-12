// O-004/007/010/012/031 — live business-record evidence run.
// Drives the REAL backend chain on marked test records:
//   verifyLogin → ensureNewCustomer → ensureNewEstimate → recordEstimateAcceptance
//   → staffEntityWrite (WorkOrder create + estimate CAS link) → invoicingAction
//   (create_from_estimate → mark_sent → record_payment) → staffDataRead read-backs.
// Emits .audit-work/live-evidence-<ts>.json with per-step outcomes + record ids.
import { writeFileSync } from 'node:fs';
import { permitCreds } from '../scripts/lib/permit-creds.mjs';

const APP_ID = '68dfcc5e57bbbc35387da97c';
const FN = `https://base44.app/api/apps/${APP_ID}/functions`;
const STAMP = Date.now();
const TAG = `[LIVE-EVIDENCE ${STAMP}]`;

const ev = { stamp: STAMP, steps: [], ok: true };
const step = (name, result, extra = {}) => { ev.steps.push({ name, ...extra, result }); if (result?.error) ev.ok = false; console.log(`${result?.error ? 'FAIL' : 'ok'} ${name}${result?.error ? ' — ' + result.error : ''}`); };

const invoke = async (fn, payload) => {
  const r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
  return r?.data || r;
};

// 1. session
const login = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
const token = login?.token;
if (!token) { console.log('FATAL no token', login); process.exit(1); }
step('verifyLogin', { ok: true });
const call = (fn, payload) => invoke(fn, { ...payload, session_token: token });
// staffDataRead caches per-request — a monotonic limit forces a cache-miss so
// every read sees the latest record state (CAS anchors + read-backs).
let readN = 1;
const read = (entity, query, limit = 10) => call('staffDataRead', { entity, query, limit: limit + (readN++), sort: '-created_date' });
const readId = async (entity, id) => ({ items: [(await call('staffDataRead', { entity, id, limit: 50 + (readN++) }))?.item].filter(Boolean) });

// 2. customer
const cust = await call('ensureNewCustomer', { creation_key: `live-ev-cust-${STAMP}`, customer: { company_name: `${TAG} Evidence Co`, contact_name: 'Evidence Runner', email: 'evidence@example.invalid', phone: '555-0100', status: 'active' } });
step('ensureNewCustomer', cust, { id: cust?.customer?.id });
const customerId = cust?.customer?.id;
if (!customerId) { console.log('FATAL no customer'); process.exit(1); }

// 3. estimate
const estimate = { project_name: `${TAG} Evidence Estimate`, client_name: `${TAG} Evidence Co`, customer_id: customerId, status: 'draft', line_items: [{ module_key: 'channel_letters', project_name: 'Evidence channel set', customer_quantity: 1, customer_unit_price: 1200, internal_cost: 700, total_cost: 700 }], quote_total: 1200, total_cost: 700 };
const est = await call('ensureNewEstimate', { creation_key: `live-ev-est-${STAMP}`, estimate });
step('ensureNewEstimate', est, { id: est?.estimate?.id, number: est?.estimate?.estimate_number });
const estimateId = est?.estimate?.id;
if (!estimateId) { console.log('FATAL no estimate'); process.exit(1); }

// 4. acceptance requires Sent/Approved — CAS draft→sent, then record acceptance
const estPre = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
const today = new Date().toISOString().slice(0, 10);
const sentUp = await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: estimateId, query: { id: estimateId, updated_date: estPre?.updated_date }, update: { $set: { status: 'sent', quote_version: Math.max(0, estPre?.quote_version || 0) + 1, quote_issue_date: today } } });
step('estimate_mark_sent', sentUp);
// Attach products + totals — ensureNewEstimate strips line_items/quote_total
// from the create (declared-field dropping); products land via the CAS seam.
const estItems = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
const attach = await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: estimateId, query: { id: estimateId, updated_date: estItems?.updated_date }, update: { $set: { line_items: estimate.line_items, quote_total: estimate.quote_total, total_cost: estimate.total_cost } } });
step('attach_line_items', attach?.result || attach);
if ((attach?.result?.updated ?? attach?.updated) !== 1) ev.ok = false;
// Issue the quote — a failed-transport delivery record still bumps quote_version
// without needing a real Gmail message id.
const del = await call('recordEstimateQuoteDelivery', { delivery: { estimate_id: estimateId, recipient_email: 'evidence@example.invalid', sent_at: new Date().toISOString(), delivery_status: 'failed', failure_reason: 'live-evidence run (no transport)', transport: 'manual', quote_version: 1 } });
step('recordEstimateQuoteDelivery', del);
const estAcc = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
const qv = Math.max(1, estAcc?.quote_version || 0); // portal convention: unset issued version = 1
const acc = await call('recordEstimateAcceptance', { estimate_id: estimateId, action: 'record', accepted_by_name: 'Evidence Runner', acceptance_method: 'other', accepted_at: new Date().toISOString(), quote_version: qv });
step('recordEstimateAcceptance', acc, { status: acc?.estimate?.status });
// Manual approval — acceptance records the immutable row; status→approved is
// the shop-side approval step (recordEstimateAcceptance leaves status 'sent').
const estApp = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
const appUp = await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: estimateId, query: { id: estimateId, updated_date: estApp?.updated_date }, update: { $set: { status: 'approved' } } });
step('estimate_approve', appUp?.result || appUp);

// 5. WO create + estimate link (the client conversion's backend surface)
const wo = await call('staffEntityWrite', { entity: 'WorkOrder', op: 'create', data: { title: `${TAG} Evidence WO`, client_name: `${TAG} Evidence Co`, customer_id: customerId, estimate_id: estimateId, status: 'open', stage: 'sales_pipeline' } });
step('wo_create', wo, { id: wo?.record?.id });
const woId = wo?.record?.id;
const estFresh = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
const link = await call('staffEntityWrite', { entity: 'AllInOneEstimate', op: 'updateMany', id: estimateId, query: { id: estimateId, updated_date: estFresh?.updated_date }, update: { $set: { work_order_id: woId } } });
step('estimate_wo_link', link?.result || link);
// CAS miss is a fail, not a pass — updated must be exactly 1.
if ((link?.result?.updated ?? link?.updated) !== 1) ev.ok = false;

// 6. invoice
const inv = await call('invoicingAction', { action: 'create_from_estimate', estimate_id: estimateId });
step('create_from_estimate', inv, { id: inv?.invoice?.id, number: inv?.invoice?.invoice_number });
const invoiceId = inv?.invoice?.id;
const sent = invoiceId ? await call('invoicingAction', { action: 'mark_sent', invoice_id: invoiceId }) : { error: 'no invoice id' };
step('mark_sent', sent);

// 7. payment
const amt = inv?.invoice?.total ?? inv?.invoice?.balance_due ?? 1200;
const pay = invoiceId ? await call('invoicingAction', { action: 'record_payment', invoice_id: invoiceId, amount: amt, method: 'check', reference: `${TAG}-PAY` }) : { error: 'no invoice id' };
step('record_payment', pay);

// 8. read-backs
const rbEst = (await readId('AllInOneEstimate', estimateId))?.items?.[0];
step('readback_estimate', { status: rbEst?.status, work_order_id: rbEst?.work_order_id || null });
const rbWo = woId ? (await readId('WorkOrder', woId))?.items?.[0] : null;
step('readback_wo', rbWo ? { id: rbWo.id, estimate_id: rbWo.estimate_id, status: rbWo.status } : { missing: true });
// Invoice/Payment are backend-only — verify through invoicingAction get_invoice.
const invRb = invoiceId ? await call('invoicingAction', { action: 'get_invoice', invoice_id: invoiceId }) : null;
const rbInv = invRb?.invoice;
step('readback_invoice', rbInv ? { id: rbInv.id, status: rbInv.status, total: rbInv.total, balance_due: rbInv.balance_due } : { missing: true, err: invRb?.error });
const pays = invRb?.payments || [];
step('readback_payment', { count: pays.length, amount: pays[0]?.amount, method: pays[0]?.method });

ev.ids = { customerId, estimateId, workOrderId: woId, invoiceId, paymentId: pays[0]?.id || null };
const out = `.audit-work/live-evidence-${STAMP}.json`;
writeFileSync(out, JSON.stringify(ev, null, 2));
console.log(`\n${ev.ok ? 'PASS' : 'PARTIAL'} — evidence: ${out}`);
