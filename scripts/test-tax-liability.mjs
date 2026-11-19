import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-tax-liability.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/taxLiabilityModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  POSTED_INVOICE_STATUSES, UNASSIGNED_AGENCY, UNGROUPED_KEY,
  invoiceDate, isPostedInvoice, invoiceTaxCents, invoiceTaxableCents,
  invoiceRatePercent, isExemptInvoice, exemptSaleCents,
  taxLiabilityRows, liabilitySummary, reconcileLiability, exemptSalesRows,
  effectiveRate, formatRate, centsToMoney,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// Fixtures — October 2026 liability period.
// TaxGroups: g1 Ohio/Hamilton Co 7.8% -> agency a1; g2 Kentucky 6% -> a2;
// g3 Indiana 7% -> no agency (rolls under UNASSIGNED_AGENCY).
// ---------------------------------------------------------------------------
const taxGroups = {
  g1: { id: 'g1', group_name: 'Ohio — Hamilton County', tax_percent: 7.8, agency_id: 'a1' },
  g2: { id: 'g2', group_name: 'Kentucky', tax_percent: 6, agency_id: 'a2' },
  g3: { id: 'g3', group_name: 'Indiana', tax_percent: 7 },
};
const agencies = {
  a1: { id: 'a1', name: 'Ohio Dept. of Taxation', rate: 5.75, jurisdiction: 'Ohio' },
  a2: { id: 'a2', name: 'Kentucky Department of Revenue', rate: 6, jurisdiction: 'Kentucky' },
};

const line = (unit_price, taxable = true, quantity = 1) => ({ description: 'x', quantity, unit_price, taxable });
const invoices = [
  // --- in-period, grouped ---------------------------------------------------
  { id: 'i1', invoice_number: 'INV-001', status: 'sent', issue_date: '2026-10-05', tax_group_id: 'g1', line_items: [line(100)], tax_rate: 0.078, tax_amount: 7.8, subtotal: 100, total: 107.8 },
  { id: 'i2', invoice_number: 'INV-002', status: 'paid', issue_date: '2026-10-31', tax_group_id: 'g1', line_items: [line(50)], tax_rate: 0.078, tax_amount: 3.9, subtotal: 50 }, // to-boundary
  { id: 'i15', invoice_number: 'INV-015', status: 'sent', issue_date: '2026-10-08', tax_group_id: 'g1', line_items: [line(100), line(50, false)], discount_amount: 20, tax_rate: 0.078, tax_amount: 6.24, subtotal: 150 }, // base 100-20
  { id: 'i6', invoice_number: 'INV-006', status: 'sent', issue_date: '2026-10-01', tax_group: 'Kentucky', line_items: [line(200)], tax_rate: 0.06, tax_amount: 12, subtotal: 200 }, // name match + from-boundary
  { id: 'i14', invoice_number: 'INV-014', status: 'paid', issue_date: '2026-10-22', source_summary: { tax_group: 'Kentucky' }, tax_rate: 0.06, tax_amount: 9, taxable_subtotal: 150 }, // source_summary stamp + explicit subtotal
  { id: 'i9', invoice_number: 'INV-009', status: 'sent', created_date: '2026-10-25T10:00:00Z', tax_group_id: 'g3', line_items: [line(40, true, 2)], tax_rate: 0.07, tax_amount: 5.6 }, // created_date fallback
  { id: 'i16', invoice_number: 'INV-016', status: 'sent', issue_date: '2026-10-09', tax_group_id: 'g3', tax_rate: 0.07, tax_amount: 14 }, // derived base 14/0.07 = 200
  { id: 'i19', invoice_number: 'INV-019', status: 'sent', issue_date: '2026-10-30', tax_group_name: 'Indiana', line_items: [line(10)], tax_rate: 0.078, tax_amount: 0.78 }, // tax_group_name match
  // --- ungrouped -------------------------------------------------------------
  { id: 'i7', invoice_number: 'INV-007', status: 'sent', issue_date: '2026-10-15', tax_rate: 0.07, tax_amount: 7, line_items: [line(100)] }, // rate bucket 7%
  { id: 'i12', invoice_number: 'INV-012', status: 'paid', issue_date: '2026-10-12', tax_rate: 0.078, tax_amount: 15.6, taxable_base: 200 }, // rate bucket 7.8% + explicit base
  { id: 'i13', invoice_number: 'INV-013', status: 'sent', issue_date: '2026-10-18', tax_group_id: 'ghost', line_items: [line(60)], tax_rate: 0.06, tax_amount: 3.6 }, // unknown group id
  { id: 'i21', invoice_number: 'INV-021', status: 'sent', issue_date: '2026-10-11', tax_group: 'Special District', tax_rate: 0.05, tax_amount: 5, line_items: [line(100)] }, // name-only bucket
  // --- exempt / untaxed ------------------------------------------------------
  { id: 'i8', invoice_number: 'INV-008', status: 'sent', issue_date: '2026-10-20', customer_id: 'c9', customer_display_name: 'Exempt Co', tax_exempt: true, exemption_reason: 'Resale', tax_exempt_id: 'OH-98-123456', subtotal: 300, tax_rate: 0, tax_amount: 0, total: 300 },
  { id: 'i18', invoice_number: 'INV-018', status: 'paid', issue_date: '2026-10-29', tax_exemption: { reason: 'Nonprofit 501(c)(3)', certificate_id: 'CERT-77', expires_on: '2027-01-31', status: 'active' }, subtotal: 80, tax_amount: 0 },
  { id: 'i17', invoice_number: 'INV-017', status: 'sent', issue_date: '2026-10-28', subtotal: 500, tax_rate: 0, tax_amount: 0, total: 500 }, // untaxed, NOT exempt
  // --- filtered out ----------------------------------------------------------
  { id: 'i3', invoice_number: 'INV-003', status: 'partially_paid', issue_date: '2026-11-01', tax_group_id: 'g1', tax_amount: 100 }, // after period
  { id: 'i10', invoice_number: 'INV-010', status: 'sent', issue_date: '2026-09-30', tax_amount: 33 }, // before period
  { id: 'i4', invoice_number: 'INV-004', status: 'draft', issue_date: '2026-10-10', tax_group_id: 'g1', tax_amount: 999 }, // draft never bills
  { id: 'i5', invoice_number: 'INV-005', status: 'void', issue_date: '2026-10-10', tax_amount: 50 }, // void reversed
  { id: 'i11', invoice_number: 'INV-011', status: 'sent', tax_group_id: 'g1', tax_amount: 44 }, // undated — excluded when bounded
  { id: 'i22', invoice_number: 'INV-022', status: 'sent', issue_date: '2026-09-15', tax_exempt: true, exemption_reason: 'Resale', subtotal: 40, tax_amount: 0 }, // exempt out of period
  { id: 'i23', invoice_number: 'INV-023', status: 'draft', issue_date: '2026-10-10', tax_exempt: true, exemption_reason: 'Government', subtotal: 60, tax_amount: 0 }, // draft exempt
];
const OPTS = { from: '2026-10-01', to: '2026-10-31', taxGroupsById: taxGroups, jurisdictionsById: agencies };
const rows = taxLiabilityRows(invoices, OPTS);
const row = (key, pred) => rows.find(pred);

// --- status + date primitives ------------------------------------------------
assert.deepEqual(POSTED_INVOICE_STATUSES, ['sent', 'partially_paid', 'paid']);
assert.equal(UNGROUPED_KEY, 'ungrouped');
assert.equal(isPostedInvoice({ status: 'sent' }), true);
assert.equal(isPostedInvoice({ status: 'partially_paid' }), true);
assert.equal(isPostedInvoice({ status: 'partial' }), true, 'partial alias tolerated');
assert.equal(isPostedInvoice({ status: 'draft' }), false);
assert.equal(isPostedInvoice({ status: 'void' }), false);
assert.equal(isPostedInvoice({ status: '' }), false, 'blank status fails closed');
assert.equal(invoiceDate({ invoice_date: '2026-10-10', issue_date: '2026-10-20' }), '2026-10-10', 'invoice_date wins');
assert.equal(invoiceDate({ issue_date: '2026-10-20', created_date: '2026-10-01T09:00:00Z' }), '2026-10-20', 'issue_date before created_date');
assert.equal(invoiceDate({ created_date: '2026-10-25T10:00:00Z' }), '2026-10-25', 'ISO prefix → UTC day');
assert.equal(invoiceDate({}), '');
assert.equal(invoiceRatePercent({ tax_rate: 0.078 }), 7.8, 'decimal rate → percent');
assert.equal(invoiceRatePercent({ tax_rate: 7.8 }), 7.8, 'already-percent tolerated');
assert.equal(invoiceRatePercent({ tax_rate: 0 }), 0, 'stored zero is real, not absent');
assert.equal(invoiceRatePercent({}), null);
assert.equal(invoiceTaxCents({ tax_amount: 7.8 }), 780);
assert.equal(invoiceTaxCents({ tax: '1,234.56' }), 123456, 'decorated import value parses');

// --- taxable base math -------------------------------------------------------
assert.equal(invoiceTaxableCents(invoices[0]), 10000, 'taxable line_items base');
assert.equal(invoiceTaxableCents(invoices[2]), 8000, 'non-taxable lines excluded; discount nets base');
assert.equal(invoiceTaxableCents(invoices[9]), 20000, 'explicit taxable_base wins verbatim');
assert.equal(invoiceTaxableCents(invoices[4]), 15000, 'taxable_subtotal − discount');
assert.equal(invoiceTaxableCents(invoices[6]), 20000, 'derived tax_amount ÷ tax_rate');
assert.equal(invoiceTaxableCents(invoices[5]), 8000, 'line total = qty × unit_price');
assert.equal(invoiceTaxableCents(invoices[12]), 0, 'flagged exempt + zero tax → 0 base');

// --- exemption detection -----------------------------------------------------
assert.equal(isExemptInvoice(invoices[12]), true, 'tax_exempt flag');
assert.equal(isExemptInvoice(invoices[13]), true, 'active tax_exemption object');
assert.equal(isExemptInvoice(invoices[14]), false, 'plain zero-tax is untaxed, not exempt');
assert.equal(isExemptInvoice({ exemption_reason: 'Resale' }), true, 'reason alone is a marker');
assert.equal(isExemptInvoice({ tax_exempt_id: 'CERT-1' }), true, 'certificate ref alone is a marker');
assert.equal(isExemptInvoice({ source_summary: { tax_exempt: true } }), true, 'source_summary stamp');
assert.equal(isExemptInvoice({ tax_exemption: { status: 'expired' } }), false, 'expired registry ≠ exempt marker');
assert.equal(exemptSaleCents(invoices[12]), 30000, 'exempt sale = subtotal − discount');
assert.equal(exemptSaleCents(invoices[13]), 8000);
assert.equal(exemptSaleCents({ tax_exempt: true, line_items: [line(40), line(20)], discount_amount: 10 }), 5000, 'line-sum fallback nets discount');

// --- grouping ----------------------------------------------------------------
assert.equal(rows.length, 8, '8 buckets: 3 groups + 2 rate + name-only + unknown-id + ungrouped');
const g1 = row('g1', (r) => r.tax_group_id === 'g1');
assert.equal(g1.name, 'Ohio — Hamilton County');
assert.equal(g1.taxable_cents, 23000, 'i1 10000 + i2 5000 + i15 8000');
assert.equal(g1.tax_collected_cents, 1794, '780 + 390 + 624');
assert.equal(g1.invoice_count, 3);
assert.equal(g1.agency, 'Ohio Dept. of Taxation');
assert.equal(g1.agency_id, 'a1');
assert.equal(g1.rate, 7.8);
assert.equal(g1.rate_source, 'group');
const g2 = row('g2', (r) => r.tax_group_id === 'g2');
assert.equal(g2.taxable_cents, 35000, 'i6 line-derived 20000 + i14 explicit 15000');
assert.equal(g2.tax_collected_cents, 2100, 'name-matched and source_summary-stamped rows group together');
assert.equal(g2.invoice_count, 2);
const g3 = row('g3', (r) => r.tax_group_id === 'g3');
assert.equal(g3.tax_collected_cents, 2038, '560 + 1400 + 78');
assert.equal(g3.taxable_cents, 29000, '8000 + derived 20000 + 1000');
assert.equal(g3.agency, null, 'no agency_id → null agency (summary rolls unassigned)');
const r7 = row('r7', (r) => r.name === 'Ungrouped (7%)');
assert.equal(r7.tax_group_id, '');
assert.equal(r7.tax_collected_cents, 700);
assert.equal(r7.rate, 7);
assert.equal(r7.rate_source, 'invoice');
const r78 = row('r78', (r) => r.name === 'Ungrouped (7.8%)');
assert.equal(r78.taxable_cents, 20000, 'explicit taxable_base in rate bucket');
const ghost = row('ghost', (r) => r.tax_group_id === 'ghost');
assert.equal(ghost.name, 'ghost', 'unknown group id buckets by raw id, merges nowhere');
assert.equal(ghost.tax_collected_cents, 360);
assert.equal(ghost.agency, null);
const special = row('special', (r) => r.name === 'Special District');
assert.equal(special.tax_group_id, '', 'name-only match keeps stored label, no id');
assert.equal(special.tax_collected_cents, 500);
const none = row('none', (r) => r.name === 'No tax group');
assert.equal(none.invoice_count, 3, 'exempt + untaxed all land in the ungrouped bucket');
assert.equal(none.exempt_count, 2, 'only marker-carrying invoices count as exempt');
assert.equal(none.exempt_sales_cents, 38000, 'i8 30000 + i18 8000; untaxed i17 contributes nothing');
assert.equal(none.taxable_cents, 0);
assert.equal(none.rate, null);

// --- ordering + period -------------------------------------------------------
assert.equal(rows[0].tax_group_id, 'g2', 'sorted by tax_collected_cents desc');
assert.equal(rows[rows.length - 1].tax_collected_cents, 0);
assert.deepEqual(rows.period, { from: '2026-10-01', to: '2026-10-31' }, 'rows carry the period');

// --- summary -----------------------------------------------------------------
{
  const sum = liabilitySummary(rows);
  assert.equal(sum.total_tax_cents, 9052, 'all bucket tax sums to the cent');
  assert.equal(sum.total_taxable_cents, 133000);
  assert.equal(sum.invoice_count, 15);
  assert.equal(sum.exempt_invoice_count, 2);
  assert.equal(sum.exempt_sales_cents, 38000);
  assert.deepEqual(sum.period, { from: '2026-10-01', to: '2026-10-31' }, 'period inherited from rows');
  assert.equal(sum.by_agency.length, 3);
  assert.equal(sum.by_agency[0].agency, UNASSIGNED_AGENCY, 'unassigned rollup leads by tax');
  assert.equal(sum.by_agency[0].tax_cents, 5158, 'g3 2038 + rate7.8 1560 + rate7 700 + special 500 + ghost 360 + none 0');
  assert.equal(sum.by_agency[0].invoice_count, 10);
  assert.equal(sum.by_agency[1].agency, 'Kentucky Department of Revenue');
  assert.equal(sum.by_agency[1].tax_cents, 2100);
  assert.equal(sum.by_agency[2].agency, 'Ohio Dept. of Taxation');
  const override = liabilitySummary(rows, { period: { from: '2026-10-01', to: '2026-10-15' } });
  assert.equal(override.period.to, '2026-10-15', 'explicit opts period wins over rows.period');
  const zero = liabilitySummary(taxLiabilityRows([], OPTS));
  assert.equal(zero.total_tax_cents, 0);
  assert.deepEqual(zero.by_agency, []);
}

// --- reconcile ----------------------------------------------------------------
{
  const rec = reconcileLiability(rows, invoices);
  assert.equal(rec.ok, true, 'bucketed tax ties to raw invoice sums to the cent');
  assert.equal(rec.delta_cents, 0);
  assert.equal(rec.expected_tax_cents, 9052);
  assert.equal(rec.computed_tax_cents, 9052);
  assert.equal(rec.expected_invoice_count, 15);
  assert.equal(rec.invoice_count_delta, 0);
  assert.equal(rec.taxable_delta_cents, 0, 'taxable bases tie too');
  const narrowed = reconcileLiability(rows, invoices, { from: '2026-10-01', to: '2026-10-15' });
  assert.equal(narrowed.ok, false, 'a tighter period surfaces the uncovered tax');
  assert.equal(narrowed.delta_cents < 0, true, 'computed exceeds re-expected → negative delta');
  // .period rides the rows array — a hand-filtered subset drops it, so the
  // window is passed explicitly here (same net effect as rows.period).
  const dropped = reconcileLiability(
    rows.filter((r) => r.tax_group_id !== 'g2'),
    invoices,
    { from: '2026-10-01', to: '2026-10-31' },
  );
  assert.equal(dropped.delta_cents, 2100, 'missing bucket = exact uncovered cents');
  assert.equal(dropped.ok, false);
  const empty = reconcileLiability([], []);
  assert.equal(empty.ok, true);
}

// --- unbounded + boundary behaviour -------------------------------------------
{
  const all = taxLiabilityRows(invoices, { taxGroupsById: taxGroups });
  const g1All = all.find((r) => r.tax_group_id === 'g1');
  assert.equal(g1All.tax_collected_cents, 16194, 'unbounded adds i3 (10000) + i11 undated (4400) to 1794');
  const noneAll = all.find((r) => r.name === 'No tax group');
  assert.equal(noneAll.tax_collected_cents, 3300, 'undated/out-of-period i10 lands when unbounded');
  const boundedAliased = taxLiabilityRows(invoices, { period_start: '2026-10-01', period_end: '2026-10-31', taxGroupsById: taxGroups });
  assert.equal(boundedAliased.length, 8, 'period_start/period_end aliases work');
  const dayOnly = taxLiabilityRows(invoices, { from: '2026-10-31', to: '2026-10-31', taxGroupsById: taxGroups });
  assert.equal(dayOnly.reduce((s, r) => s + r.invoice_count, 0), 1, 'single-day window catches only the boundary invoice');
  const undatedBounded = rows.some((r) => r.invoice_count > 0 && r.name === 'ghost') ? rows.find((r) => r.tax_group_id === 'g1') : null;
  assert.equal(undatedBounded.tax_collected_cents, 1794, 'undated i11 excluded when bounded');
}

// --- exempt sales detail -------------------------------------------------------
{
  const ex = exemptSalesRows(invoices, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(ex.length, 2, 'posted + in-period exempt markers only');
  assert.equal(ex[0].invoice_id, 'i8', 'sorted by date');
  assert.equal(ex[0].exemption_reason, 'Resale');
  assert.equal(ex[0].certificate_id, 'OH-98-123456');
  assert.equal(ex[0].customer_name, 'Exempt Co');
  assert.equal(ex[0].exempt_sales_cents, 30000);
  assert.equal(ex[1].invoice_id, 'i18');
  assert.equal(ex[1].exemption_reason, 'Nonprofit 501(c)(3)');
  assert.equal(ex[1].certificate_id, 'CERT-77');
  assert.equal(ex[1].certificate_expires, '2027-01-31');
  assert.equal(ex.every((r) => r.invoice_id !== 'i17'), true, 'untaxed-without-marker never reports exempt');
  const all = exemptSalesRows(invoices);
  assert.equal(all.length, 3, 'unbounded adds the September exempt sale');
  const withDrafts = exemptSalesRows(invoices, { from: '2026-10-01', to: '2026-10-31', include_unposted: true });
  assert.equal(withDrafts.length, 3, 'draft exempt surfaces when include_unposted');
  assert.equal(withDrafts.some((r) => r.invoice_id === 'i23' && r.status === 'draft'), true);
}

// --- display helpers -----------------------------------------------------------
assert.equal(effectiveRate({ taxable_cents: 20000, tax_collected_cents: 1560 }), 7.8, 'derived effective rate');
assert.equal(effectiveRate({ taxable_cents: 0, tax_collected_cents: 0, rate: 6 }), 6, 'stored rate fallback');
assert.equal(effectiveRate({ taxable_cents: 0, tax_collected_cents: 0 }), null);
assert.equal(formatRate(7.8), '7.8%');
assert.equal(formatRate(0), '0%');
assert.equal(formatRate(null), '—');
assert.equal(formatRate(r78), '7.8%', 'row display uses stored rate');
assert.equal(formatRate({ taxable_cents: 20000, tax_collected_cents: 1560 }), '7.8%', 'row without stored rate derives');
assert.equal(centsToMoney(12345), '$123.45');
assert.equal(centsToMoney(-500), '-$5.00');

// --- malformed input never throws ----------------------------------------------
assert.deepEqual(taxLiabilityRows(null, OPTS).length, 0);
assert.deepEqual(taxLiabilityRows([null, 'x', { status: 'sent', issue_date: '2026-10-10', tax_amount: 5 }], OPTS).length, 1, 'posted row with no group still buckets');
assert.equal(exemptSalesRows('nope').length, 0);
assert.equal(liabilitySummary(null).total_tax_cents, 0);

rmSync(out, { force: true });
console.log('PASS tax-liability');
