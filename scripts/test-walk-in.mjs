import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-walkin.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/walkin/walkInModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  findWalkInCustomer, newWalkInItem, walkInItemsTotal, buildWalkInSale,
  WALK_IN_PAYMENT_METHODS, WALK_IN_TITLE, WALK_IN_CUSTOMER_CREATION_KEY,
} = await import(pathToFileURL(out).href);

const items = [
  { description: 'Banner 3x6', category: 'Banners', quantity: 2, unit_price: 10, taxable: true },
  { description: 'Design fee', category: 'Service', quantity: 1, unit_price: 5, taxable: false },
];

// Totals: qty × unit price per line, tax on the taxable subtotal only.
{
  const t = walkInItemsTotal(items, 8.25);
  assert.equal(t.subtotal, 25);
  assert.equal(t.taxable_subtotal, 20);
  assert.equal(t.tax_amount, 1.65);
  assert.equal(t.total, 26.65);
  assert.equal(t.items[0].line_total, 20);
  assert.equal(t.items[1].line_total, 5);
}
// Zero tax and percent normalization.
{
  const t = walkInItemsTotal([{ description: 'x', quantity: 3, unit_price: 0.5 }], 0);
  assert.equal(t.total, 1.5);
  assert.equal(t.tax_amount, 0);
}

// Walk-in customer matching: explicit flag beats name matches; name match is
// punctuation/case-insensitive; non-matches return null.
{
  const flagged = { id: 'c9', company_name: 'Counter Account', is_walk_in: true };
  const byName = { id: 'c2', company_name: 'Walk-In Customer' };
  assert.equal(findWalkInCustomer([byName, flagged])?.id, 'c9');
  assert.equal(findWalkInCustomer([{ id: 'c1', company_name: 'walk in' }, byName])?.id, 'c1');
  assert.equal(findWalkInCustomer([{ id: 'c3', company_name: 'Acme Signs' }]), null);
  assert.equal(findWalkInCustomer([{ company_name: 'Walk-in' }]), null, 'rows need an id');
  assert.equal(findWalkInCustomer([]), null);
  assert.equal(findWalkInCustomer(null), null);
}

// Happy path: cash sale paid in full — WO + invoice + payment shapes.
{
  const sale = buildWalkInSale({
    items,
    customerId: 'cust-1',
    customerName: 'Walk-in',
    payments: [{ method: 'cash', tendered: 30 }],
    taxPercent: 8.25,
    docNumber: 'INV-09101',
    notes: 'paid at counter',
    actor: 'counter@ccs.test',
    saleDate: '2026-11-02T15:00:00.000Z',
  });
  const wo = sale.workOrderFields;
  assert.equal(wo.title, WALK_IN_TITLE);
  assert.equal(wo.current_stage, 'completed');
  assert.equal(wo.completed, true, 'no production work → completed');
  assert.equal(wo.sales_status, 'won');
  assert.equal(wo.in_pipeline, false);
  assert.equal(wo.is_walk_in_sale, true);
  assert.equal(wo.customer_id, 'cust-1');
  assert.equal(wo.corbridge_invoice_number, 'INV-09101');
  assert.equal(wo.estimate_amount, 26.65);
  assert.equal(wo.products.length, 2);
  assert.equal(wo.products[0].quoted_total, 20);
  assert.equal(wo.products[0].quoted_unit_price, 10);
  assert.equal(wo.products[0].module_key, 'walk_in');
  assert.equal(wo.products[0].operational_status, 'none');
  assert.equal(wo.products[0].fulfillment_state, 'picked_up');
  assert.equal(wo.products[0].proof_status, 'none');
  assert.ok(Array.isArray(wo.notes) && wo.notes[0].text === 'paid at counter');

  const inv = sale.invoiceFields;
  assert.ok(inv, 'invoice fields exist when a customer is linked');
  assert.equal(inv.customer_id, 'cust-1');
  assert.equal(inv.line_items.length, 2);
  assert.equal(inv.line_items[0].taxable, true);
  assert.equal(inv.line_items[1].taxable, false);
  assert.equal(inv.tax_rate, 0.0825, 'invoicingAction tax_rate is a fraction');
  assert.equal(inv.terms, 'Due on receipt');
  assert.equal(inv.source_summary.kind, 'walk_in_sale');

  assert.equal(sale.paymentFields.length, 1);
  const pay = sale.paymentFields[0];
  assert.equal(pay.amount, 26.65, 'recorded amount is the invoice share, not tendered');
  assert.equal(pay.method, 'cash');
  assert.equal(pay.amount_tendered, 30);
  assert.equal(pay.change_due, 3.35);
  assert.equal(sale.walkInSale.balance_due, 0);
  assert.equal(sale.requiresProduction, false);
}

// Tendered/change math and split tender.
{
  const sale = buildWalkInSale({
    items: [{ description: 'Decal', quantity: 1, unit_price: 20 }],
    customerId: 'c', customerName: 'Walk-in',
    payments: [{ method: 'cash', amount: 10, tendered: 10 }, { method: 'card', amount: 10, reference_number: 'AUTH42' }],
  });
  assert.equal(sale.paymentFields.length, 2);
  assert.equal(sale.paymentFields[0].change_due, 0);
  assert.equal(sale.paymentFields[1].method, 'card');
  assert.equal(sale.walkInSale.amount_paid, 20);
}
// Cash short/over tendered checks.
{
  assert.throws(
    () => buildWalkInSale({ items: [{ description: 'x', quantity: 1, unit_price: 10 }], payments: [{ method: 'cash', tendered: 5 }] }),
    /less than|paid in full/i,
  );
  const sale = buildWalkInSale({
    items: [{ description: 'x', quantity: 1, unit_price: 10 }],
    customerId: 'c',
    payments: [{ method: 'cash', tendered: 12.5 }],
  });
  assert.equal(sale.paymentFields[0].amount, 10);
  assert.equal(sale.paymentFields[0].change_due, 2.5);
}

// Production-flagged items stay queue-visible; the order stays open for them.
{
  const sale = buildWalkInSale({
    items: [{ description: 'Channel letters', quantity: 1, unit_price: 900, produces_work: true }],
    customerId: 'c',
    payments: [{ method: 'card' }],
  });
  const p = sale.workOrderFields.products[0];
  assert.equal(p.operational_status, 'order_review');
  assert.equal(p.fulfillment_state, 'none');
  assert.equal(p.requires_production, true);
  assert.equal(p.customer_facing_status, 'Prepping Your Order');
  assert.equal(sale.workOrderFields.completed, false, 'pending production keeps the WO open for queues');
  assert.equal(sale.workOrderFields.current_stage, 'completed');
  assert.equal(sale.requiresProduction, true);
}

// No customer → WorkOrder only; invoice/payment omitted (backend requires a
// Customer for invoicing). Payment summary still lands on the WO.
{
  const sale = buildWalkInSale({
    items: [{ description: 'x', quantity: 1, unit_price: 10 }],
    payments: [{ method: 'cash' }],
  });
  assert.equal(sale.invoiceFields, null);
  assert.deepEqual(sale.paymentFields, []);
  assert.equal(sale.workOrderFields.customer_id, '');
  assert.equal(sale.walkInSale.payments[0].method, 'cash');
}

// Zero-total sales take no payment rows.
{
  const sale = buildWalkInSale({
    items: [{ description: 'Free sticker', quantity: 1, unit_price: 0 }],
    customerId: 'c',
    payments: [],
  });
  assert.equal(sale.totals.total, 0);
  assert.equal(sale.paymentFields.length, 0);
}

// Validation failures.
{
  assert.throws(() => buildWalkInSale({ items: [], payments: [] }), /at least one item/i);
  assert.throws(
    () => buildWalkInSale({ items: [{ description: '', quantity: 1, unit_price: 5 }] }),
    /description/i,
  );
  assert.throws(
    () => buildWalkInSale({ items: [{ description: 'x', quantity: 0, unit_price: 5 }] }),
    /positive quantity/i,
  );
  assert.throws(
    () => buildWalkInSale({ items: [{ description: 'x', quantity: 1, unit_price: -5 }] }),
    /non-negative unit price/i,
  );
  assert.throws(
    () => buildWalkInSale({ items: [{ description: 'x', quantity: 1, unit_price: 5 }], payments: [{ method: 'bitcoin', amount: 5 }] }),
    /Unknown payment method/i,
  );
  assert.throws(
    () => buildWalkInSale({ items: [{ description: 'x', quantity: 1, unit_price: 10 }], payments: [{ method: 'cash', amount: 5 }] }),
    /paid in full/i,
  );
}

// Conventions sanity: payment methods mirror invoicingAction's allowlist.
assert.deepEqual(WALK_IN_PAYMENT_METHODS, ['cash', 'card', 'check', 'ach', 'financing', 'other']);
assert.ok(WALK_IN_CUSTOMER_CREATION_KEY.length <= 256);
const blank = newWalkInItem();
assert.equal(blank.taxable, true);
assert.equal(blank.produces_work, false);

rmSync(out, { force: true });
console.log('PASS walk-in');
