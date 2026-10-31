import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-statements.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/statements/statementModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  buildStatement,
  paymentsFromArCsv,
  parseDelimited,
  activityCsvRows,
  agingBucket,
  toDay,
  daysBetween,
} = await import(pathToFileURL(out).href);

const CUST = { id: 'cust-1', company_name: 'Acme Sign Co', billing_city: 'Cincinnati' };
const AS_OF = '2026-03-31';

const inv = (over = {}) => ({
  id: 'i1', invoice_number: 'INV-001', status: 'sent', customer_id: 'cust-1',
  issue_date: '2026-01-15', due_date: '2026-02-14', total: 100, ...over,
});
const pay = (over = {}) => ({
  id: 'p1', invoice_id: 'i1', customer_id: 'cust-1', status: 'recorded',
  paid_date: '2026-02-01', amount: 100, method: 'check', reference_number: 'CHK-42', ...over,
});

// --- Date/bucket primitives -------------------------------------------------
{
  assert.equal(toDay('2026-03-31'), '2026-03-31');
  assert.equal(toDay('2026-03-31T23:59:59Z'), '2026-03-31');
  assert.equal(toDay('2026-03-31T19:00:00-04:00'), '2026-03-31');
  assert.equal(toDay(''), '');
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(-5), 'current');
  assert.equal(agingBucket(1), 'd30');
  assert.equal(agingBucket(30), 'd30');
  assert.equal(agingBucket(31), 'd60');
  assert.equal(agingBucket(60), 'd60');
  assert.equal(agingBucket(61), 'd90');
  assert.equal(agingBucket(200), 'd90');
}

// --- Aging buckets: days past due_date relative to as-of --------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'a', invoice_number: 'INV-A', due_date: '2026-03-31', total: 10 }), // 0 days → current
      inv({ id: 'b', invoice_number: 'INV-B', due_date: '2026-04-15', total: 15 }), // future due → current
      inv({ id: 'c', invoice_number: 'INV-C', due_date: '2026-03-01', total: 20 }), // 30 → d30
      inv({ id: 'd', invoice_number: 'INV-D', due_date: '2026-02-14', total: 40 }), // 45 → d60
      inv({ id: 'e', invoice_number: 'INV-E', due_date: '2026-01-29', total: 80 }), // 61 → d90
      inv({ id: 'f', invoice_number: 'INV-F', due_date: '2025-11-30', total: 160 }), // 121 → d90
      inv({ id: 'g', invoice_number: 'INV-G', due_date: '', total: 7 }),             // no due → current
    ],
    payments: [],
    asOfDate: AS_OF,
  });
  assert.deepEqual(stmt.aging, { current: 32, d30: 20, d60: 40, d90: 240 });
  assert.equal(stmt.openItems.length, 7);
  assert.equal(stmt.balance, 332);
  assert.equal(stmt.totalBilled, 332);
}

// --- Void exclusion ---------------------------------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'live', invoice_number: 'INV-LIVE', total: 250 }),
      inv({ id: 'dead', invoice_number: 'INV-VOID', status: 'void', total: 500 }),
      inv({ id: 'ref', invoice_number: 'INV-REF', status: 'refunded', total: 75 }),
    ],
    payments: [],
    asOfDate: AS_OF,
  });
  assert.equal(stmt.totalBilled, 250, 'void + refunded invoices excluded from billed');
  assert.equal(stmt.balance, 250);
  assert.equal(stmt.openItems.length, 1);
  assert.equal(stmt.openItems[0].invoice_number, 'INV-LIVE');
  const voidLines = stmt.lines.filter((l) => l.void);
  assert.equal(voidLines.length, 2, 'void + refunded stay on the ledger');
  assert.ok(voidLines.every((l) => l.debit === 0 && l.credit === 0));
  assert.deepEqual(
    stmt.lines.map((l) => l.balance),
    stmt.lines.map(() => 250),
    'void lines never move the running balance'
  );
}

// --- Payment application ----------------------------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'i1', invoice_number: 'INV-1', total: 1000, due_date: '2026-02-14' }),
      inv({ id: 'i2', invoice_number: 'INV-2', total: 300, due_date: '2026-03-10' }),
    ],
    payments: [
      pay({ id: 'p1', invoice_id: 'i1', amount: 400, paid_date: '2026-02-01' }),
      pay({ id: 'p2', invoice_id: 'i1', amount: 600, paid_date: '2026-02-20' }),
      pay({ id: 'p3', invoice_id: 'i2', amount: 100, paid_date: '2026-03-05' }),
    ],
    asOfDate: AS_OF,
  });
  assert.equal(stmt.totalPaid, 1100);
  assert.equal(stmt.balance, 200);
  assert.equal(stmt.openItems.length, 1, 'INV-1 fully applied, INV-2 partially');
  assert.equal(stmt.openItems[0].invoice_number, 'INV-2');
  assert.equal(stmt.openItems[0].paid, 100);
  assert.equal(stmt.openItems[0].balance, 200);

  // Void + refunded payments apply $0 and keep the invoice fully open.
  const stmt2 = buildStatement({
    customer: CUST,
    invoices: [inv({ id: 'i9', invoice_number: 'INV-9', total: 500 })],
    payments: [
      pay({ id: 'pv', invoice_id: 'i9', amount: 200, status: 'void' }),
      pay({ id: 'pr', invoice_id: 'i9', amount: 100, status: 'refunded' }),
    ],
    asOfDate: AS_OF,
  });
  assert.equal(stmt2.totalPaid, 0);
  assert.equal(stmt2.balance, 500);
  assert.equal(stmt2.openItems[0].balance, 500);
  assert.equal(stmt2.lines.filter((l) => l.void).length, 2);
}

// --- As-of filtering --------------------------------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'early', invoice_number: 'INV-EARLY', issue_date: '2026-01-10', total: 100 }),
      inv({ id: 'late', invoice_number: 'INV-LATE', issue_date: '2026-04-05', total: 900 }),
      inv({ id: 'nodate', invoice_number: 'INV-NODATE', issue_date: '', created_date: '2026-05-01T00:00:00Z', total: 50 }),
    ],
    payments: [
      pay({ id: 'ok', invoice_id: 'early', amount: 60, paid_date: '2026-03-15' }),
      pay({ id: 'future', invoice_id: 'early', amount: 40, paid_date: '2026-04-02' }),
    ],
    asOfDate: AS_OF,
  });
  assert.equal(stmt.lines.filter((l) => l.kind === 'invoice').length, 1, 'post-as-of invoice excluded');
  assert.equal(stmt.lines.filter((l) => l.kind === 'payment').length, 1, 'post-as-of payment excluded');
  assert.equal(stmt.totalBilled, 100);
  assert.equal(stmt.totalPaid, 60);
  assert.equal(stmt.balance, 40);
  assert.equal(stmt.openItems.length, 1);
  assert.equal(stmt.openItems[0].paid, 60, 'future payment not applied');
}

// --- Running balance --------------------------------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'i1', invoice_number: 'INV-1', issue_date: '2026-01-05', total: 100 }),
      inv({ id: 'i2', invoice_number: 'INV-2', issue_date: '2026-02-05', total: 50 }),
    ],
    payments: [
      pay({ id: 'p1', invoice_id: 'i1', amount: 25, paid_date: '2026-01-20' }),
      pay({ id: 'p2', invoice_id: 'i1', amount: 75, paid_date: '2026-02-05' }), // same day as INV-2
    ],
    asOfDate: AS_OF,
  });
  const kinds = stmt.lines.map((l) => l.kind);
  assert.deepEqual(kinds, ['invoice', 'payment', 'invoice', 'payment'], 'chronological, invoice before same-day payment');
  assert.deepEqual(stmt.lines.map((l) => l.balance), [100, 75, 125, 50]);
  assert.equal(stmt.lines.at(-1).balance, stmt.balance, 'ledger ends at statement balance');

  // Fully deterministic: identical inputs → identical output.
  const again = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'i2', invoice_number: 'INV-2', issue_date: '2026-02-05', total: 50 }),
      inv({ id: 'i1', invoice_number: 'INV-1', issue_date: '2026-01-05', total: 100 }),
    ],
    payments: [
      pay({ id: 'p2', invoice_id: 'i1', amount: 75, paid_date: '2026-02-05' }),
      pay({ id: 'p1', invoice_id: 'i1', amount: 25, paid_date: '2026-01-20' }),
    ],
    asOfDate: AS_OF,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(stmt)), 'order-independent');
}

// --- Drafts, unapplied payments, foreign rows -------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [
      inv({ id: 'i1', invoice_number: 'INV-1', total: 100 }),
      inv({ id: 'draft', invoice_number: 'INV-DRAFT', status: 'draft', total: 999 }),
      inv({ id: 'other', invoice_number: 'INV-OTHER', customer_id: 'cust-2', total: 888 }),
    ],
    payments: [
      pay({ id: 'p1', invoice_id: 'i1', amount: 30 }),
      pay({ id: 'px', invoice_id: '', invoice_number: '', amount: 45, method: 'cash' }), // unapplied credit
      pay({ id: 'po', invoice_id: 'other', customer_id: 'cust-2', amount: 10 }),         // wrong customer
    ],
    asOfDate: AS_OF,
  });
  assert.equal(stmt.lines.filter((l) => l.kind === 'invoice').length, 1, 'draft + foreign invoice excluded');
  assert.equal(stmt.lines.filter((l) => l.kind === 'payment').length, 2, 'foreign payment excluded');
  assert.equal(stmt.totalBilled, 100);
  assert.equal(stmt.totalPaid, 75);
  assert.equal(stmt.balance, 25, 'unapplied credit reduces the balance');
  assert.equal(stmt.openItems[0].balance, 70, 'unapplied credit not applied to any invoice');
}

// --- AR payments CSV parsing -------------------------------------------------
{
  const csv = [
    'Date,Invoice Number,Customer,Amount,Method,Reference,Status,Notes',
    '2026-02-01,INV-1,"Acme, Inc",400.00,check,CHK-42,recorded,',
    '2026-02-20,INV-1,Acme Sign Co,"1,250.50",ach,,recorded,"wire, confirmed"',
    '2026-03-01,INV-2,Acme Sign Co,75,check,,void,',
    ',,,,,,,,',
  ].join('\r\n');
  const payments = paymentsFromArCsv(csv);
  assert.equal(payments.length, 3);
  assert.equal(payments[0].amount, 400);
  assert.equal(payments[0].invoice_number, 'INV-1');
  assert.equal(payments[0].reference_number, 'CHK-42');
  assert.equal(payments[1].amount, 1250.5, 'quoted thousands parse');
  assert.equal(payments[1].notes, 'wire, confirmed');
  assert.equal(payments[2].status, 'void');

  // Quoted cells / escaped quotes / blank rows handled by the low-level parser.
  const rows = parseDelimited('a,"b""c",d\r\n,"x\ny",z\n1,2,3');
  assert.deepEqual(rows[0], ['a', 'b"c', 'd']);
  assert.deepEqual(rows[1], ['', 'x\ny', 'z']);
  assert.deepEqual(rows[2], ['1', '2', '3']);
}

// --- Activity CSV rows --------------------------------------------------------
{
  const stmt = buildStatement({
    customer: CUST,
    invoices: [inv({ id: 'i1', invoice_number: 'INV-1', total: 100 })],
    payments: [pay({ id: 'p1', invoice_id: 'i1', amount: 30, paid_date: '2026-02-10' })],
    asOfDate: AS_OF,
  });
  const rows = activityCsvRows(stmt);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(0, 3), ['2026-01-15', 'invoice', 'INV-1']);
  assert.equal(rows[0][4], '100.00');
  assert.equal(rows[0][6], '100.00');
  assert.equal(rows[1][1], 'payment');
  assert.equal(rows[1][5], '30.00');
  assert.equal(rows[1][6], '70.00');
}

rmSync(out);
console.log('PASS statements');
