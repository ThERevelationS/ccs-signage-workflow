import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-order-header.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/jobs/orderHeaderModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const { orderHeaderFields, headerCompleteness, orderNumberFor, salesCenterFor } = await import(pathToFileURL(out).href);

const get = (fields, key) => fields.find((f) => f.key === key);
const LOCATIONS = [
  { id: 'loc-1', name: 'Cincinnati Custom Signs', code: 'CCS', active: true },
  { id: 'loc-2', name: 'Florence', code: 'FLO', active: true },
];
const SINGLE_LOCATION = [{ id: 'loc-9', name: 'Cincinnati Custom Signs', code: 'CCS', active: true }];

// Full order: every chain resolves from the WO's own fields.
{
  const wo = {
    id: 'wo-1234567890',
    current_stage: 'production',
    title: 'Main St monument sign',
    estimate_number: 'EST-1042',
    corbridge_invoice_number: 'INV-2088',
    payment_terms_label: 'Balance Due Upon Receipt',
    po_number: 'PO-7781',
    sales_rep: 'brett@ccs.example',
    entered_by_display: 'Brett H.',
    sales_center: 'Cincinnati Custom Signs',
    description: 'Internally illuminated monument',
    date_order_created: '2026-10-30',
    follow_up_date: '2026-11-06',
    estimate_id: 'est-1',
  };
  const fields = orderHeaderFields(wo, { locations: LOCATIONS });
  assert.equal(fields.length, 12, 'header emits the 12 parity fields');
  assert.deepEqual(
    fields.map((f) => f.key),
    ['status', 'title', 'estimate_number', 'order_number', 'payment_terms', 'po_number',
      'salesperson', 'entered_by', 'sales_center', 'description', 'created_date', 'follow_up_date'],
    'fields keep the CoreBridge header order',
  );
  assert.equal(get(fields, 'status').value, 'Production', 'stage key maps to its workspace label');
  assert.equal(get(fields, 'estimate_number').value, 'EST-1042');
  assert.equal(get(fields, 'order_number').value, 'INV-2088');
  assert.equal(get(fields, 'payment_terms').value, 'Balance Due Upon Receipt');
  assert.equal(get(fields, 'po_number').value, 'PO-7781');
  assert.equal(get(fields, 'salesperson').value, 'brett@ccs.example');
  assert.equal(get(fields, 'entered_by').value, 'Brett H.');
  assert.equal(get(fields, 'sales_center').value, 'Cincinnati Custom Signs');
  assert.equal(get(fields, 'description').value, 'Internally illuminated monument');
  assert.equal(get(fields, 'created_date').value, '2026-10-30');
  assert.equal(get(fields, 'follow_up_date').value, '2026-11-06');
  assert.ok(fields.every((f) => f.missing === false), 'a complete order marks nothing missing');
  assert.equal(get(fields, 'estimate_number').href, '/EstimateDetail?id=est-1', 'estimate field links to the estimate');
}

// Missing fields are flagged, not hidden — the UI greys them.
{
  const fields = orderHeaderFields({ id: 'wo-bare' });
  const missing = fields.filter((f) => f.missing).map((f) => f.key);
  assert.ok(missing.includes('title') && missing.includes('estimate_number') && missing.includes('po_number'),
    'unpopulated fields carry missing:true');
  assert.equal(get(fields, 'status').missing, true);
  assert.equal(get(fields, 'created_date').missing, true, 'no created dates at all → missing');
}

// Status: wo.status wins over current_stage; completed flag is the last
// fallback; unknown keys are prettified.
{
  const byStatus = orderHeaderFields({ id: 'w', status: 'won', current_stage: 'design' });
  assert.equal(get(byStatus, 'status').value, 'won', 'explicit status beats current_stage');
  const byStage = orderHeaderFields({ id: 'w', current_stage: 'installation' });
  assert.equal(get(byStage, 'status').value, 'Installation');
  const legacy = orderHeaderFields({ id: 'w', completed: true });
  assert.equal(get(legacy, 'status').value, 'Completed', 'completed flag labels as Completed');
  const odd = orderHeaderFields({ id: 'w', status: 'order_review' });
  assert.equal(get(odd, 'status').value, 'order review', 'unmapped status keys lose underscores');
}

// Estimate number chain: estimate row fallback + EST-shaped corbridge number.
{
  const viaEstimate = orderHeaderFields({ id: 'w' }, { estimate: { id: 'e9', estimate_number: 'EST-2001' } });
  assert.equal(get(viaEstimate, 'estimate_number').value, 'EST-2001', 'estimate row supplies the number');
  assert.equal(get(viaEstimate, 'estimate_number').href, '/EstimateDetail?id=e9');
  const converted = orderHeaderFields({ id: 'w', corbridge_invoice_number: 'EST-1777' });
  assert.equal(get(converted, 'estimate_number').value, 'EST-1777',
    'conversion-copied corbridge number reads as the estimate number');
  const invOnly = orderHeaderFields({ id: 'w', corbridge_invoice_number: 'INV-3000' });
  assert.equal(get(invOnly, 'estimate_number').missing, true,
    'an INV- corbridge number never reads as an estimate number');
}

// Order number chain: corbridge → wo.invoice_number → invoice.invoice_number.
{
  const viaWo = orderHeaderFields({ id: 'w', invoice_number: 'INV-4100' });
  assert.equal(get(viaWo, 'order_number').value, 'INV-4100');
  const viaInv = orderHeaderFields({ id: 'w' }, { invoice: { id: 'inv-7', invoice_number: 'INV-4201', terms: 'Net 30' } });
  assert.equal(get(viaInv, 'order_number').value, 'INV-4201');
  assert.equal(get(viaInv, 'order_number').href, '/Invoices?invoice=inv-7', 'links to the invoice when its row is loaded');
  assert.equal(get(viaWo, 'order_number').href, undefined, 'no invoice row → no href');
}

// Payment terms: label beats terms text; invoice terms is the last fallback.
{
  const viaTerms = orderHeaderFields({ id: 'w' }, { estimate: { payment_terms: 'Net 30' } });
  assert.equal(get(viaTerms, 'payment_terms').value, 'Net 30', 'estimate.payment_terms fallback');
  const viaInvoice = orderHeaderFields({ id: 'w' }, { invoice: { terms: 'Due on receipt' } });
  assert.equal(get(viaInvoice, 'payment_terms').value, 'Due on receipt', 'invoice terms fallback');
  const labelWins = orderHeaderFields(
    { id: 'w', terms: 'Net 60' },
    { estimate: { payment_terms_label: 'Half down, half on install' } },
  );
  assert.equal(get(labelWins, 'payment_terms').value, 'Half down, half on install',
    'payment_terms_label outranks terms text');
}

// PO #: WO wins, estimate fills.
{
  const viaEst = orderHeaderFields({ id: 'w' }, { estimate: { po_number: 'PO-E-5' } });
  assert.equal(get(viaEst, 'po_number').value, 'PO-E-5');
  const viaWo = orderHeaderFields({ id: 'w', po_number: 'PO-W-9' }, { estimate: { po_number: 'PO-E-5' } });
  assert.equal(get(viaWo, 'po_number').value, 'PO-W-9', 'WO po_number outranks the estimate');
}

// Salesperson: sales_rep → salesperson → estimator → estimate/invoice →
// representative (the mounted header's own fallback).
{
  const chain = orderHeaderFields({ id: 'w', salesperson: 'rep-b', estimator: 'est-c', representative: 'rep-d' });
  assert.equal(get(chain, 'salesperson').value, 'rep-b', 'wo.salesperson beats estimator');
  const est = orderHeaderFields({ id: 'w', estimator: 'est-c' }, { estimate: { salesperson: 'rep-e' } });
  assert.equal(get(est, 'salesperson').value, 'est-c', 'estimator beats the estimate row');
  const rep = orderHeaderFields({ id: 'w', representative: 'rep-d' }, { invoice: { salesperson: 'rep-i' } });
  assert.equal(get(rep, 'salesperson').value, 'rep-i', 'invoice salesperson beats representative');
  const last = orderHeaderFields({ id: 'w', representative: 'rep-d' });
  assert.equal(get(last, 'salesperson').value, 'rep-d', 'representative is the final fallback');
}

// Entered by: display name → entered_by → created_by across rows.
{
  const viaEntered = orderHeaderFields({ id: 'w', entered_by: 'staff@x', created_by: 'system@x' });
  assert.equal(get(viaEntered, 'entered_by').value, 'staff@x', 'entered_by beats created_by');
  const viaCreated = orderHeaderFields({ id: 'w', created_by: 'system@x' });
  assert.equal(get(viaCreated, 'entered_by').value, 'system@x', 'created_by is the final fallback');
  const viaEst = orderHeaderFields({ id: 'w' }, { estimate: { entered_by_display: 'Est User' } });
  assert.equal(get(viaEst, 'entered_by').value, 'Est User', 'estimate display name fills');
}

// Sales center: text wins, then a resolved registry row, then the
// single-active-location default.
{
  const fields = orderHeaderFields({ id: 'w', sales_center: 'Florence' }, { locations: LOCATIONS });
  assert.equal(get(fields, 'sales_center').value, 'Florence', 'stored text displays');
  const byRow = orderHeaderFields({ id: 'w', location_id: 'loc-2' }, { locations: LOCATIONS });
  assert.equal(get(byRow, 'sales_center').value, 'Florence', 'location_id resolves to the row name');
  const byDefault = orderHeaderFields({ id: 'w' }, { locations: SINGLE_LOCATION });
  assert.equal(get(byDefault, 'sales_center').value, 'Cincinnati Custom Signs',
    'a single active location is the default');
  const ambiguous = orderHeaderFields({ id: 'w' }, { locations: LOCATIONS });
  assert.equal(get(ambiguous, 'sales_center').missing, true,
    'multiple locations with no match stay missing — never a guessed center');
}

// salesCenterFor: id match → code/name match → default.
{
  assert.equal(salesCenterFor({ location_id: 'loc-2' }, { locations: LOCATIONS })?.id, 'loc-2');
  assert.equal(salesCenterFor({ sales_center: 'florence' }, { locations: LOCATIONS })?.id, 'loc-2',
    'name match is case-insensitive');
  assert.equal(salesCenterFor({ sales_center: 'FLO' }, { locations: LOCATIONS })?.id, 'loc-2',
    'code match works');
  assert.equal(salesCenterFor({}, { locations: SINGLE_LOCATION })?.id, 'loc-9', 'single active is the default');
  assert.equal(salesCenterFor({}, { locations: LOCATIONS }), null, 'ambiguous defaults stay null');
  assert.equal(salesCenterFor({}, { locations: [] }), null, 'empty registry resolves nothing');
}

// Description + created/follow-up date chains.
{
  const desc = orderHeaderFields({ id: 'w', order_description: 'Alt desc' });
  assert.equal(get(desc, 'description').value, 'Alt desc', 'order_description alias resolves');
  const created = orderHeaderFields({ id: 'w', created_date: '2026-11-01T15:00:00Z' });
  assert.equal(get(created, 'created_date').value, '2026-11-01T15:00:00Z', 'system timestamp is the fallback');
  const both = orderHeaderFields({ id: 'w', date_order_created: '2026-10-01', created_date: '2026-11-01' });
  assert.equal(get(both, 'created_date').value, '2026-10-01', 'business order date wins (matches mounted header)');
  const fu = orderHeaderFields({ id: 'w' }, { estimate: { follow_up_date: '2026-11-20' } });
  assert.equal(get(fu, 'follow_up_date').value, '2026-11-20', 'estimate follow-up fills');
}

// orderNumberFor precedence: corbridge → title → short id.
{
  assert.equal(orderNumberFor({ id: 'abcdefghijk', corbridge_invoice_number: 'INV-1', title: 'T' }), 'INV-1');
  assert.equal(orderNumberFor({ id: 'abcdefghijk', title: 'Storefront job' }), 'Storefront job');
  assert.equal(orderNumberFor({ id: 'abcdefghijk' }), 'abcdefgh', 'short id is 8 chars');
  assert.equal(orderNumberFor(null), '', 'null order yields empty');
}

// headerCompleteness: populated count + missing keys for the parity audit.
{
  const sparse = headerCompleteness({ id: 'w', title: 'T', corbridge_invoice_number: 'INV-1', current_stage: 'design' });
  assert.equal(sparse.total, 12);
  assert.equal(sparse.populated + sparse.missing_keys.length, sparse.total, 'counts partition the field set');
  assert.ok(sparse.missing_keys.includes('payment_terms') && sparse.missing_keys.includes('entered_by'));
  const full = headerCompleteness({
    id: 'w', current_stage: 'sales', title: 'T', estimate_number: 'E', corbridge_invoice_number: 'I',
    payment_terms_label: 'P', po_number: 'PO', sales_rep: 'R', entered_by_display: 'E',
    sales_center: 'C', description: 'D', date_order_created: '2026-11-01', follow_up_date: '2026-11-02',
  });
  assert.equal(full.populated, 12, 'a fully-parity order reports 12/12');
  assert.deepEqual(full.missing_keys, []);
}

rmSync(out, { force: true });
console.log('PASS order-header');
