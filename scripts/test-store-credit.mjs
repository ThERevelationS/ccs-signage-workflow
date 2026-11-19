import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-store-credit.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/customer360/storeCreditModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  CREDIT_LEDGER_KINDS, ledgerSumCents, creditBalance, issueCredit,
  applyCreditPlan, applyCredit, voidCredit, reconcileCredit,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-02T18:30:00.000Z';

// --- exports -------------------------------------------------------------------
assert.deepEqual([...CREDIT_LEDGER_KINDS], [
  'credit_issued', 'credit_applied', 'credit_expired', 'credit_voided',
]);
for (const f of [ledgerSumCents, creditBalance, issueCredit, applyCreditPlan, applyCredit, voidCredit, reconcileCredit]) {
  assert.equal(typeof f, 'function');
}

// --- ledgerSumCents: signed-cent sums -------------------------------------------
{
  const rows = [
    { kind: 'credit_issued', amount: 10000 },
    { kind: 'credit_applied', amount: -2500 },
    { kind: 'credit_expired', amount: -1000 },
    { kind: 'credit_voided', amount: 2500, ref: 'x' }, // reversal of an applied row
    { kind: 'credit_issued', amount: 9999, deleted: true }, // dead row skipped
    { kind: 'unrelated_note', amount: 777 }, // unknown kind skipped
    null, undefined,
  ];
  assert.equal(ledgerSumCents(rows), 9000);
  assert.equal(ledgerSumCents([]), 0);
  assert.equal(ledgerSumCents(undefined), 0);
  assert.equal(ledgerSumCents('garbage'), 0);
}

// --- creditBalance: stored-field precedence + ledger fallback -------------------
{
  // Stored in_store_credit_balance (dollars) is authoritative → cents.
  assert.equal(
    creditBalance({ in_store_credit_balance: 123.45 }, [{ kind: 'credit_issued', amount: 1 }]),
    12345,
  );
  // Stored 0 is authoritative — present-zero is a real balance, not "missing".
  assert.equal(
    creditBalance({ in_store_credit_balance: 0 }, [{ kind: 'credit_issued', amount: 500 }]),
    0,
  );
  // Legacy parallel in_store_credit is second choice (creditTermsModel parity).
  assert.equal(creditBalance({ in_store_credit: 42.5 }, []), 4250);
  assert.equal(
    creditBalance({ in_store_credit_balance: 10, in_store_credit: 999 }, []),
    1000, // balance field wins over legacy alias
  );
  // Neither stored → ledger sum.
  assert.equal(
    creditBalance({}, [{ kind: 'credit_issued', amount: 7000 }, { kind: 'credit_applied', amount: -2000 }]),
    5000,
  );
  // Empty everything → 0.
  assert.equal(creditBalance(), 0);
  assert.equal(creditBalance({}, []), 0);
  // Garbage stored value is not a number → falls through to ledger.
  assert.equal(
    creditBalance({ in_store_credit_balance: 'oops', in_store_credit: null }, [{ kind: 'credit_issued', amount: 300 }]),
    300,
  );
  // Numeric string stored values count (entity rows deserialize loose).
  assert.equal(creditBalance({ in_store_credit_balance: '7.50' }, []), 750);
  // Negative stored balance surfaces raw (truthful net-owed signal).
  assert.equal(creditBalance({ in_store_credit_balance: -20 }, []), -2000);
}

// --- issueCredit -----------------------------------------------------------------
{
  // Stored-before path: $50.00 stored + 7500¢ issued → 12500¢.
  let r = issueCredit({
    customer: { id: 'c1', in_store_credit_balance: 50 },
    amount: 7500, reason: 'Credit memo CM-1042', actor: 'brett', now: NOW,
  });
  assert.equal(r.ledger_row.kind, 'credit_issued');
  assert.equal(r.ledger_row.amount, 7500); // signed positive cents
  assert.equal(r.ledger_row.balance_after, 12500);
  assert.equal(r.ledger_row.reason, 'Credit memo CM-1042');
  assert.equal(r.ledger_row.actor, 'brett');
  assert.equal(r.ledger_row.created_at, NOW);
  assert.equal(r.ledger_row.customer_id, 'c1');
  // customer_patch writes DOLLARS back to the entity field.
  assert.equal(r.customer_patch.in_store_credit_balance, 125);

  // Ledger-before path: no stored field → before = sum of rows.
  r = issueCredit({
    customer: { id: 'c2' },
    amount: 4000, reason: 'refund to credit', actor: 'sys', now: NOW,
    ledgerRows: [{ kind: 'credit_issued', amount: 6000 }, { kind: 'credit_applied', amount: -1000 }],
  });
  assert.equal(r.ledger_row.balance_after, 9000); // (6000-1000)+4000
  assert.equal(r.customer_patch.in_store_credit_balance, 90);

  // No customer id → row just omits customer_id.
  r = issueCredit({ customer: {}, amount: 100, now: NOW });
  assert.equal('customer_id' in r.ledger_row, false);

  // No-ops: zero / negative / missing amounts never produce rows.
  assert.deepEqual(issueCredit({ customer: { in_store_credit_balance: 5 }, amount: 0 }),
    { ledger_row: null, customer_patch: {} });
  assert.deepEqual(issueCredit({ customer: {}, amount: -2500 }),
    { ledger_row: null, customer_patch: {} });
  assert.deepEqual(issueCredit({ customer: {} }), { ledger_row: null, customer_patch: {} });

  // Cent coercion: fractional input rounds to whole cents.
  r = issueCredit({ customer: {}, amount: 100.6, now: NOW });
  assert.equal(r.ledger_row.amount, 101);
}

// --- applyCreditPlan ---------------------------------------------------------------
{
  const cust = { id: 'c1', in_store_credit_balance: 100 }; // $100.00 → 10000¢
  // Partial apply: credit covers only part of the balance due.
  let p = applyCreditPlan({ customer: cust, invoice: { id: 'i1', balance_due: 150 }, now: NOW });
  assert.equal(p.apply_amount, 10000); // cents
  assert.equal(p.new_invoice_balance, 5000); // cents
  assert.equal(p.new_credit_balance, 0);
  assert.equal(p.ledger_row.kind, 'credit_applied');
  assert.equal(p.ledger_row.amount, -10000); // signed negative
  assert.equal(p.ledger_row.balance_after, 0);
  assert.equal(p.ledger_row.invoice_id, 'i1');
  assert.equal(p.ledger_row.customer_id, 'c1');

  // Full cover: credit exceeds the balance due → apply clamps to the due.
  p = applyCreditPlan({ customer: cust, invoice: { id: 'i2', balance_due: 40 }, now: NOW });
  assert.equal(p.apply_amount, 4000); // never over-applies the invoice
  assert.equal(p.new_invoice_balance, 0);
  assert.equal(p.new_credit_balance, 6000);

  // Exact match.
  p = applyCreditPlan({ customer: cust, invoice: { balance_due: 100 }, now: NOW });
  assert.equal(p.apply_amount, 10000);
  assert.equal(p.new_invoice_balance, 0);
  assert.equal(p.new_credit_balance, 0);

  // Zero cases: either side ≤ 0 → apply 0 and NO ledger row.
  p = applyCreditPlan({ customer: { in_store_credit_balance: 0 }, invoice: { balance_due: 50 }, now: NOW });
  assert.equal(p.apply_amount, 0);
  assert.equal(p.ledger_row, null);
  assert.equal(p.new_invoice_balance, 5000); // invoice unchanged
  p = applyCreditPlan({ customer: cust, invoice: { balance_due: 0 }, now: NOW });
  assert.equal(p.apply_amount, 0);
  assert.equal(p.ledger_row, null);
  assert.equal(p.new_credit_balance, 10000); // credit unchanged
  // Negative credit balance can never be "applied".
  p = applyCreditPlan({ customer: { in_store_credit_balance: -30 }, invoice: { balance_due: 50 }, now: NOW });
  assert.equal(p.apply_amount, 0);
  assert.equal(p.ledger_row, null);
  assert.equal(p.new_credit_balance, -3000); // reported raw
  // Missing invoice / missing balance_due → due 0 → no apply.
  p = applyCreditPlan({ customer: cust, invoice: {}, now: NOW });
  assert.equal(p.apply_amount, 0);
  p = applyCreditPlan({ customer: cust, now: NOW });
  assert.equal(p.apply_amount, 0);

  // Over-apply guard at cent precision: balance 3333¢ vs due $40.00 → 3333¢.
  p = applyCreditPlan({
    customer: { in_store_credit_balance: 33.33 },
    invoice: { balance_due: 40 }, now: NOW,
  });
  assert.equal(p.apply_amount, 3333);
  assert.equal(p.new_invoice_balance, 667);
}

// --- applyCredit: entity patches -----------------------------------------------------
{
  const cust = { id: 'c1', in_store_credit_balance: 100 };
  const inv = { id: 'i1', balance_due: 150, amount_paid: 25, credit_applied: 10 };
  const r = applyCredit({ customer: cust, invoice: inv, actor: 'brett', now: NOW });
  assert.equal(r.ledger_row.kind, 'credit_applied');
  assert.equal(r.ledger_row.amount, -10000);
  assert.equal(r.ledger_row.actor, 'brett');
  assert.equal(r.ledger_row.created_at, NOW);
  // Patches are DOLLARS (entity-native).
  assert.equal(r.customer_patch.in_store_credit_balance, 0);
  assert.equal(r.invoice_patch.amount_paid, 125);    // 25 + 100
  assert.equal(r.invoice_patch.balance_due, 50);     // 150 - 100
  assert.equal(r.invoice_patch.credit_applied, 110); // 10 + 100
  assert.equal(r.apply_amount, 10000);
  assert.equal(r.apply_amount_dollars, 100);

  // Absent invoice money fields start at 0.
  const r2 = applyCredit({
    customer: { in_store_credit_balance: 20 },
    invoice: { balance_due: 8.5 }, actor: 'a', now: NOW,
  });
  assert.equal(r2.invoice_patch.amount_paid, 8.5);
  assert.equal(r2.invoice_patch.balance_due, 0);
  assert.equal(r2.invoice_patch.credit_applied, 8.5);
  assert.equal(r2.customer_patch.in_store_credit_balance, 11.5); // 20 - 8.5

  // No-op shape: empty patches, null row.
  const noop = applyCredit({ customer: { in_store_credit_balance: 0 }, invoice: { balance_due: 50 } });
  assert.deepEqual(noop, { ledger_row: null, customer_patch: {}, invoice_patch: {} });

  // Input objects are never mutated.
  const frozen = Object.freeze({ balance_due: 50, amount_paid: 0 });
  applyCredit({ customer: { in_store_credit_balance: 10 }, invoice: frozen, now: NOW });
  assert.deepEqual({ ...frozen }, { balance_due: 50, amount_paid: 0 });

  // Round-trip: patching the customer makes creditBalance() return
  // new_credit_balance — stored dollars ↔ cents contract holds.
  const before = { in_store_credit_balance: 100 };
  const applied = applyCredit({ customer: before, invoice: { balance_due: 30 }, now: NOW });
  const patchedCustomer = { ...before, ...applied.customer_patch };
  assert.equal(creditBalance(patchedCustomer, []), applied.ledger_row.balance_after);
  assert.equal(creditBalance(patchedCustomer, []), 7000);
}

// --- voidCredit -----------------------------------------------------------------------
{
  const base = [
    { id: 'L1', kind: 'credit_issued', amount: 10000 },
    { id: 'L2', kind: 'credit_applied', amount: -2500, invoice_id: 'i1' },
    { id: 'L3', kind: 'credit_applied', amount: -1000 },
  ]; // live balance 6500

  // Void an issued credit → reversal row appends; balance recomputes.
  let v = voidCredit({ ledgerRows: base, row_id: 'L1', actor: 'admin', reason: 'memo issued in error', now: NOW });
  assert.equal(v.ledger_row.kind, 'credit_voided');
  assert.equal(v.ledger_row.amount, -10000); // negation of the reversed row
  assert.equal(v.ledger_row.ref, 'L1');
  assert.equal(v.ledger_row.reversed_kind, 'credit_issued');
  assert.equal(v.ledger_row.reason, 'memo issued in error');
  assert.equal(v.balance_after, -3500); // 6500 - 10000: net-owed surfaces raw
  assert.equal(v.customer_patch.in_store_credit_balance, -35);
  assert.equal(v.reversed_row_id, 'L1');
  assert.equal('error' in v, false);

  // Append-only: the input array and the original row are untouched.
  assert.equal(base.length, 3);
  assert.deepEqual(base[0], { id: 'L1', kind: 'credit_issued', amount: 10000 });

  // Replayed balance INCLUDING the reversal equals balance_after.
  assert.equal(ledgerSumCents([...base, v.ledger_row]), -3500);

  // Voiding an applied row RESTORES credit (reversal amount positive).
  v = voidCredit({ ledgerRows: base, row_id: 'L2', actor: 'admin', now: NOW });
  assert.equal(v.ledger_row.amount, 2500);
  assert.equal(v.balance_after, 9000); // 6500 + 2500
  assert.equal(v.ledger_row.reversed_kind, 'credit_applied');
  assert.equal(v.customer_patch.in_store_credit_balance, 90);

  // Error table.
  v = voidCredit({ ledgerRows: base, row_id: 'missing', now: NOW });
  assert.equal(v.ledger_row, null);
  assert.equal(v.error, 'not_found');
  assert.equal(v.balance_after, 6500); // unchanged sum still reported
  v = voidCredit({ ledgerRows: base, row_id: '', now: NOW });
  assert.equal(v.error, 'not_found');
  // Already-voided rows refuse a second reversal.
  const withVoid = [...base, { id: 'V1', kind: 'credit_voided', amount: -10000, ref: 'L1' }];
  v = voidCredit({ ledgerRows: withVoid, row_id: 'L1', now: NOW });
  assert.equal(v.error, 'already_voided');
  assert.equal(v.ledger_row, null);
  // Reversal rows themselves cannot be voided.
  v = voidCredit({ ledgerRows: withVoid, row_id: 'V1', now: NOW });
  assert.equal(v.error, 'cannot_void_reversal');
}

// --- reconcileCredit -------------------------------------------------------------------
{
  const ledger = [{ kind: 'credit_issued', amount: 5000 }, { kind: 'credit_applied', amount: -1500 }];
  // Stored (dollars→cents) matches the ledger sum.
  assert.deepEqual(
    reconcileCredit({ in_store_credit_balance: 35 }, ledger),
    { matches: true, computed: 3500, stored: 3500 },
  );
  // Drift flags false.
  const r = reconcileCredit({ in_store_credit_balance: 34.99 }, ledger);
  assert.equal(r.matches, false);
  assert.equal(r.computed, 3500);
  assert.equal(r.stored, 3499);
  // Absent stored field + empty ledger → reconciled (both effectively zero).
  assert.deepEqual(reconcileCredit({}, []), { matches: true, computed: 0, stored: null });
  // Absent stored field + nonzero ledger → mismatch; stored reported null.
  const r2 = reconcileCredit({}, ledger);
  assert.equal(r2.matches, false);
  assert.equal(r2.stored, null);
  // Legacy alias participates when the primary field is absent.
  assert.equal(reconcileCredit({ in_store_credit: 35 }, ledger).matches, true);
}

// --- end-to-end: issue → apply → void → reconcile --------------------------------------
{
  let rows = [];
  let cust = { id: 'c9' }; // no stored balance — ledger is the authority
  // Issue $200.
  const issued = issueCredit({ customer: cust, amount: 20000, reason: 'memo', actor: 'a', now: NOW, ledgerRows: rows });
  rows.push({ id: 'E1', ...issued.ledger_row });
  cust = { ...cust, ...issued.customer_patch };
  assert.equal(cust.in_store_credit_balance, 200);
  // Apply to a $120 invoice — covers the FULL balance due (min rule).
  const inv = { id: 'inv-9', balance_due: 120, amount_paid: 0 };
  const applied = applyCredit({ customer: cust, invoice: inv, actor: 'b', now: NOW, ledgerRows: rows });
  rows.push({ id: 'E2', ...applied.ledger_row });
  cust = { ...cust, ...applied.customer_patch };
  const invPatched = { ...inv, ...applied.invoice_patch };
  assert.equal(invPatched.balance_due, 0);
  assert.equal(invPatched.amount_paid, 120);
  assert.equal(invPatched.credit_applied, 120);
  assert.equal(cust.in_store_credit_balance, 80);
  // Reconcile: stored matches ledger.
  assert.equal(reconcileCredit(cust, rows).matches, true);
  assert.equal(creditBalance(cust, rows), 8000);
  // Void the application → credit restored; invoice fix-up is caller-side.
  const v = voidCredit({ ledgerRows: rows, row_id: 'E2', actor: 'c', reason: 'voided payment', now: NOW });
  rows.push({ id: 'E3', ...v.ledger_row });
  cust = { ...cust, ...v.customer_patch };
  assert.equal(cust.in_store_credit_balance, 200);
  assert.equal(reconcileCredit(cust, rows).matches, true);
  assert.equal(ledgerSumCents(rows), 20000);
}

rmSync(out, { force: true });
console.log('PASS store-credit');
