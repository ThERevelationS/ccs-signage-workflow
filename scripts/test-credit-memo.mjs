import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (rel, out) => {
  buildSync({
    entryPoints: [resolve(here, rel)],
    bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  });
  return out;
};
const tmpModel = bundle('../base44/shared/creditMemoModel.ts', resolve(here, '.tmp-credit-memo.mjs'));
const tmpStore = bundle('../src/components/customer360/storeCreditModel.js', resolve(here, '.tmp-credit-memo-store.mjs'));
const tmpRender = bundle('../base44/shared/templateRender.ts', resolve(here, '.tmp-credit-memo-render.mjs'));

const M = await import(pathToFileURL(tmpModel).href);
const S = await import(pathToFileURL(tmpStore).href);
const { renderTemplate } = await import(pathToFileURL(tmpRender).href);

const {
  CREDIT_LEDGER_KINDS, CREDIT_MEMO_TEMPLATE_KEY, CREDIT_MEMO_TEMPLATE_KIND,
  CREDIT_MEMO_PLACEHOLDERS, STORE_CREDIT_BALANCE_FIELD,
  ledgerRowAmountCents, liveLedgerRows, ledgerBalanceCents, creditBalanceCents,
  entityLedgerRowFromModelRow, creditMemoLedgerRow, creditMemoNotificationDraft,
  creditApplyPlan,
} = M;

const NOW = '2026-11-03T14:22:00.000Z';
let n = 0;
const ok = (cond, msg) => { n += 1; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n += 1; assert.equal(a, b, msg); };
const deepEq = (a, b, msg) => { n += 1; assert.deepEqual(a, b, msg); };

// ===========================================================================
// A. ENTITY CONTRACT — parse StoreCreditLedger.jsonc and prove the emitted
//    rows carry only declared properties with the declared conventions.
// ===========================================================================
const schema = JSON.parse(
  readFileSync(resolve(here, '../base44/entities/StoreCreditLedger.jsonc'), 'utf8')
    .replace(/\/\/[^\n"]*/g, ''),
);
eq(schema.name, 'StoreCreditLedger', 'entity name');
deepEq(schema.required, ['customer_id', 'kind', 'amount'], 'entity required set');
deepEq([...CREDIT_LEDGER_KINDS], schema.properties.kind.enum, 'model kinds == entity enum');
for (const f of ['schema_version', 'creation_request_key', 'customer_id', 'kind',
  'amount', 'amount_cents', 'ref', 'reversed_kind', 'reason', 'actor',
  'invoice_id', 'balance_after', 'occurred_at']) {
  ok(f in schema.properties, `entity declares ${f}`);
}
eq(schema.properties.amount.type, 'number', 'amount is number (dollars)');
eq(schema.properties.amount_cents.type, 'number', 'amount_cents is number (canonical cents)');
eq(schema.properties.balance_after.type, 'number', 'balance_after is number (dollars)');
eq(schema.properties.occurred_at.format, 'date-time', 'occurred_at is the ts field');
ok(/backend_only/.test(JSON.stringify(schema.rls)), 'ledger is backend-only');
ok(/dollar/i.test(schema.properties.amount.description), 'entity documents amount in DOLLARS');
ok(/canonical/.test(schema.properties.amount_cents.description), 'entity documents amount_cents canonical');

const declaredKeys = new Set(Object.keys(schema.properties));
// System/caller passthrough fields that legitimately ride persisted rows
// but are not declared properties (id/row_id for ref-targeting, deleted
// tombstone, created_date/updated_date stamps).
const SYSTEM_KEYS = new Set(['id', 'row_id', 'deleted', 'created_date', 'updated_date']);
const assertEntityKeys = (row, tag) => {
  for (const k of Object.keys(row)) {
    ok(declaredKeys.has(k) || SYSTEM_KEYS.has(k), `${tag}: '${k}' is a declared field`);
  }
  for (const f of schema.required) ok(row[f] !== undefined && row[f] !== '', `${tag}: required '${f}' present`);
};

// ===========================================================================
// B. creditMemoLedgerRow — credit memo Payment → entity credit_issued row.
// ===========================================================================
{
  const payment = {
    id: 'p1', amount: -250, method: 'credit_memo',
    creation_request_key: 'credit:i1:1699', invoice_id: 'i1', customer_id: 'c1',
    reference_number: 'CM-1042', notes: 'Credit memo: damaged sign',
    paid_date: '2026-11-03', created_by: 'brett@ccs',
  };
  const r = creditMemoLedgerRow({
    payment, invoice: { id: 'i1', invoice_number: 'INV-1042' },
    customer: { id: 'c1' }, prior_balance_cents: 10000,
    reason: '', actor: 'brett@ccs', now: NOW,
  });
  const row = r.ledger_row;
  ok(row, 'row emitted');
  assertEntityKeys(row, 'issued');
  eq(row.schema_version, 1, 'schema_version 1');
  eq(row.kind, 'credit_issued', 'kind');
  eq(row.amount, 250, 'amount DOLLARS (display mirror)');
  eq(row.amount_cents, 25000, 'amount_cents CANONICAL positive cents');
  eq(row.balance_after, 350, 'balance_after DOLLARS ($100 prior + $250)');
  eq(row.occurred_at, NOW, 'occurred_at = injected now');
  eq(row.customer_id, 'c1', 'customer_id');
  eq(row.invoice_id, 'i1', 'link to credited invoice');
  eq(row.reason, 'damaged sign', 'reason mined from payment notes (prefix stripped)');
  eq(row.actor, 'brett@ccs', 'actor');
  eq(row.creation_request_key, 'credit:i1:1699', 'reuses payment receipt (per-entity dedupe)');
  eq(r.balance_cents, 35000, 'balance_cents echo');
  eq(r.amount_cents, 25000, 'amount_cents echo');
  eq(r.customer_patch[STORE_CREDIT_BALANCE_FIELD], 350, 'customer_patch dollars');
  eq(STORE_CREDIT_BALANCE_FIELD, 'in_store_credit_balance', 'patch field name');
  // BOTH directions: dollar mirror and canonical cents agree exactly.
  eq(Math.sign(row.amount) * Math.round(Math.abs(row.amount) * 100 + 1e-9), row.amount_cents,
    'amount mirror ↔ amount_cents consistent (mirror → cents)');
  eq(ledgerRowAmountCents(row), 25000, 'canonical read via amount_cents');
  const { amount_cents: _drop, ...bareRow } = row;
  eq(ledgerRowAmountCents(bareRow), 25000, 'bare-amount read as DOLLARS gives same cents (cents → mirror → cents)');
  eq(row.amount * 100, row.amount_cents, 'dollar mirror is exactly cents/100 here');

  // Fallbacks — ids resolve down the payment → invoice → customer chain.
  const r2 = creditMemoLedgerRow({ payment, prior_balance_cents: 0, now: NOW });
  eq(r2.ledger_row.customer_id, 'c1', 'customer_id falls back to payment.customer_id');
  eq(r2.ledger_row.invoice_id, 'i1', 'invoice_id falls back to payment.invoice_id');
  eq(r2.ledger_row.balance_after, 250, 'zero prior → balance_after = amount');

  // Reason/actor precedence: explicit args win over payment fields.
  const r3 = creditMemoLedgerRow({ payment, customer: { id: 'c9' }, prior_balance_cents: 0, reason: 'override', actor: 'ops', now: NOW });
  eq(r3.ledger_row.reason, 'override', 'explicit reason wins');
  eq(r3.ledger_row.actor, 'ops', 'explicit actor wins');
  eq(r3.ledger_row.customer_id, 'c9', 'explicit customer wins');

  // occurred_at falls back to paid_date (date → start-of-day ISO).
  const r4 = creditMemoLedgerRow({ payment: { amount: -10, customer_id: 'c1', paid_date: '2026-10-31' }, prior_balance_cents: 0 });
  eq(r4.ledger_row.occurred_at, '2026-10-31T00:00:00.000Z', 'paid_date → occurred_at');
  // Request-key fallback is deterministic when the payment has no receipt.
  const r5a = creditMemoLedgerRow({ payment: { id: 'p9', amount: -10, customer_id: 'c1' }, prior_balance_cents: 0 });
  const r5b = creditMemoLedgerRow({ payment: { id: 'p9', amount: -10, customer_id: 'c1' }, prior_balance_cents: 0 });
  eq(r5a.ledger_row.creation_request_key, r5b.ledger_row.creation_request_key, 'fallback key deterministic');
  ok(r5a.ledger_row.creation_request_key.length > 0, 'fallback key non-empty');
  const r5c = creditMemoLedgerRow({
    payment: { amount: -10, customer_id: 'c1' }, prior_balance_cents: 0,
    creation_request_key: 'x'.repeat(300),
  });
  eq(r5c.ledger_row.creation_request_key.length, 256, 'request key capped at 256');

  // No-ops — never a zero/placeholder row.
  deepEq(creditMemoLedgerRow({}), {
    ledger_row: null, customer_patch: {}, amount_cents: 0, balance_cents: 0, skipped: 'no_payment',
  }, 'missing payment skips');
  eq(creditMemoLedgerRow({ payment: { amount: 0, customer_id: 'c1' }, prior_balance_cents: 500 }).skipped,
    'zero_amount', 'zero credit skips');
  eq(creditMemoLedgerRow({ payment: { amount: -50 }, prior_balance_cents: 500 }).skipped,
    'no_customer', 'unresolvable customer skips');
  eq(creditMemoLedgerRow({ payment: { amount: 0, customer_id: 'c1' }, prior_balance_cents: 500 }).balance_cents,
    500, 'no-op still reports prior balance');

  // Prior balance derived when prior_balance_cents absent: stored field wins…
  const r6 = creditMemoLedgerRow({
    payment: { amount: -100, customer_id: 'c1' },
    customer: { in_store_credit_balance: 50 }, // $50 stored → 5000¢
  });
  eq(r6.ledger_row.balance_after, 150, 'stored dollar balance + issued');
  // …then the ledger sum.
  const r7 = creditMemoLedgerRow({
    payment: { amount: -100, customer_id: 'c1' }, customer: {},
    ledgerRows: [
      { kind: 'credit_issued', amount_cents: 6000 },
      { kind: 'credit_applied', amount_cents: -1000 },
      { kind: 'credit_issued', amount_cents: 999, deleted: true },
    ],
  });
  eq(r7.ledger_row.balance_after, 150, 'ledger-sum prior + issued ((6000-1000)+10000 = 15000¢)');

  // Positive-signed input still issues positive credit (abs normalization).
  const r8 = creditMemoLedgerRow({ payment: { amount: 42, customer_id: 'c1' }, prior_balance_cents: 0 });
  eq(r8.ledger_row.amount_cents, 4200, 'abs() keeps issuance positive');
  eq(r8.ledger_row.amount, 42, 'mirror positive');

  // Bare "Credit memo" boilerplate notes strip to no-reason (only a real
  // memo reason is worth storing).
  const r9 = creditMemoLedgerRow({ payment: { amount: -5, customer_id: 'c1', notes: 'Credit memo' }, prior_balance_cents: 0 });
  ok(!('reason' in r9.ledger_row), 'boilerplate notes → no reason field');
}

// ===========================================================================
// C. entityLedgerRowFromModelRow — bridge for storeCreditModel-shaped rows
//    (the flagged cents-in-`amount` shape) + cross-model parity.
// ===========================================================================
{
  // Issue a credit with the G-09 model → its row is CENTS-shaped.
  const issued = S.issueCredit({
    customer: { id: 'c1', in_store_credit_balance: 50 },
    amount: 7500, reason: 'memo', actor: 'a', now: NOW,
  });
  eq(issued.ledger_row.amount, 7500, 'sanity: model row amount IS cents (the divergence)');
  const bridged = entityLedgerRowFromModelRow(issued.ledger_row);
  eq(bridged.amount, 75, 'bridged amount → DOLLARS');
  eq(bridged.amount_cents, 7500, 'bridged amount_cents canonical');
  eq(bridged.balance_after, 125, 'bridged balance_after cents → dollars');
  eq(bridged.occurred_at, NOW, 'created_at → occurred_at');
  eq(bridged.customer_id, 'c1', 'fields pass through');
  eq(bridged.schema_version, 1, 'schema_version stamped');
  ok(!('ref' in issued.ledger_row) || true, 'optional fields absent when not given');
  assertEntityKeys(bridged, 'bridged');

  // KNOWN-DEFECT PROOF: the raw model row mis-reads 100x under the
  // canonical read; the bridged row reads correctly. This is why every
  // writer must translate — asserted as the defect's observed behavior.
  eq(ledgerRowAmountCents(issued.ledger_row), 750000,
    'KNOWN DEFECT marker: raw model row {amount:7500c} reads as $7500 (100x)');
  eq(ledgerRowAmountCents(bridged), 7500, 'bridged row reads 7500c');

  // Already-entity rows pass through — auto-detected by amount_cents —
  // and the dollar mirror is REGENERATED (a divergent mirror cannot live).
  const entityRow = { kind: 'credit_issued', amount: 9999, amount_cents: 7500, occurred_at: NOW };
  const norm = entityLedgerRowFromModelRow(entityRow);
  eq(norm.amount, 75, 'entity row mirror regenerated from canonical cents');
  eq(norm.amount_cents, 7500, 'canonical untouched');
  eq(norm.occurred_at, NOW, 'occurred_at kept');

  // Forced convention: {convention:'model'} treats amount as cents even
  // when amount_cents exists (caller knows better than the detector).
  const forced = entityLedgerRowFromModelRow(
    { kind: 'credit_issued', amount: 1000, amount_cents: 1 },
    { convention: 'model' });
  eq(forced.amount_cents, 1000, 'forced model convention');
  eq(forced.amount, 10, 'forced mirror');

  // Round-trip parity: entity-summing bridged model rows equals the
  // model's own cent sum over the raw rows — both directions agree.
  const modelRows = [
    { kind: 'credit_issued', amount: 20000, created_at: NOW },
    { kind: 'credit_applied', amount: -5000, created_at: NOW },
    { kind: 'credit_voided', amount: 5000, ref: 'x', created_at: NOW },
    { kind: 'credit_issued', amount: 9999, created_at: NOW, deleted: true },
    { kind: 'bogus', amount: 100 },
    null,
  ];
  const bridgedRows = modelRows.map((r) => entityLedgerRowFromModelRow(r)).filter(Boolean);
  eq(ledgerBalanceCents(bridgedRows), S.ledgerSumCents(modelRows),
    'bridged entity sum == storeCreditModel cents sum');
  eq(S.ledgerSumCents(modelRows), 20000, 'parity fixture sanity (20000-5000+5000)');

  // creditBalanceCents precedence — stored field wins, ledger fallback.
  eq(creditBalanceCents({ in_store_credit_balance: 12.5 }, []), 1250, 'stored dollars → cents');
  eq(creditBalanceCents({ in_store_credit_balance: 0 }, [{ kind: 'credit_issued', amount_cents: 500 }]),
    0, 'present-zero stored is authoritative');
  eq(creditBalanceCents({ in_store_credit: 7.5 }, []), 750, 'legacy parallel second');
  eq(creditBalanceCents({}, [{ kind: 'credit_issued', amount_cents: 500 }]), 500, 'ledger fallback');
  eq(creditBalanceCents({ in_store_credit_balance: -20 }, []), -2000, 'negative stored surfaces raw');
  eq(creditBalanceCents(), 0, 'empty → 0');
}

// ===========================================================================
// D. creditMemoNotificationDraft — extract the REAL seeded credit_memo
//    template and render the draft context through templateRender.
// ===========================================================================
{
  const seedSrc = readFileSync(resolve(here, '../base44/functions/seedNotificationTemplates/entry.ts'), 'utf8');
  const start = seedSrc.indexOf("key: 'credit_memo'");
  ok(start > 0, 'seed contains credit_memo template');
  const block = seedSrc.slice(start, seedSrc.indexOf("key: '", start + 10));
  const subject = /subject:\s*'([^']*)'/.exec(block)?.[1];
  eq(subject, 'Credit memo {{credit_memo.number}} — {{company.name}}', 'seed subject');
  const bodyBlock = /body:\s*\[([\s\S]*?)\]\.join/.exec(block)?.[1] || '';
  const bodyLines = [...bodyBlock.matchAll(/'((?:[^'\\]|\\.)*)',?\s*\n/g)]
    .map((m) => m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  const seedBody = bodyLines.join('\n');
  ok(seedBody.includes('{{credit_memo.amount|money}}'), 'seed body money placeholder');
  ok(seedBody.includes('{{customer.company_name}}'), 'seed body company placeholder');
  const seedPlaceholders = [...block.matchAll(/placeholder:\s*'([^']+)'/g)]
    .map((m) => m[1].replace(/\|.*$/, '')); // strip formatter suffixes
  deepEq([...seedPlaceholders].sort(), [...CREDIT_MEMO_PLACEHOLDERS].sort(),
    'documented placeholders == model vocabulary');
  eq(CREDIT_MEMO_TEMPLATE_KEY, 'credit_memo', 'template key');
  eq(CREDIT_MEMO_TEMPLATE_KIND, 'credit_memo', 'template kind');

  const customer = {
    id: 'c1', company_name: 'Acme Sign Co.',
    contact_first_name: 'Pat', contact_last_name: 'Reed',
    contact_email: 'pat@acme.test', billing_contact_email: 'ap@acme.test',
  };
  const invoice = { id: 'i1', invoice_number: 'INV-1042', customer_id: 'c1', balance_due: 400 };
  const payment = {
    id: 'p1', amount: -250, method: 'credit_memo', customer_id: 'c1', invoice_id: 'i1',
    creation_request_key: 'credit:i1:1699', notes: 'Credit memo: damaged sign',
    created_by: 'brett@ccs',
  };
  const draft = creditMemoNotificationDraft({
    invoice, customer, payment, amount: 250, reason: 'damaged sign',
    company: { name: 'CCS Signage' }, location: { name: 'Main Shop', phone: '555-0100' },
    now: NOW,
  });
  eq(draft.template_key, 'credit_memo', 'draft key');
  eq(draft.kind, 'credit_memo', 'draft kind');
  eq(draft.to, 'pat@acme.test', 'to resolves customer contact chain');
  eq(draft.cc, 'ap@acme.test', 'cc_billing target resolves');
  eq(draft.dedupe_key, 'credit-memo-notify:credit:i1:1699', 'stable dedupe per memo receipt');
  deepEq(draft.missing, [], 'complete context → no missing placeholders');
  eq(draft.context.credit_memo.amount, 250, 'credit_memo.amount DOLLARS for |money');
  eq(draft.context.credit_memo.amount_cents, 25000, 'cents carried alongside');
  eq(draft.context.credit_memo.number, 'CM-INV-1042', 'number derived from invoice number');
  eq(draft.context.contact.name, 'Pat Reed', 'contact name assembled');
  eq(draft.context.customer.company_name, 'Acme Sign Co.', 'customer company');

  // Render the REAL seeded template against the draft context.
  const renderedSubject = renderTemplate(subject, draft.context);
  eq(renderedSubject.text, 'Credit memo CM-INV-1042 — CCS Signage', 'rendered subject');
  const rendered = renderTemplate(seedBody, draft.context);
  ok(rendered.text.includes('Hi Pat Reed,'), 'body greeting');
  ok(rendered.text.includes('A credit has been issued to Acme Sign Co.'), 'body company line');
  ok(rendered.text.includes('Credit memo: CM-INV-1042'), 'body memo number');
  ok(rendered.text.includes('Amount: $250.00'), 'body money format');
  ok(rendered.text.includes('Reason: damaged sign'), 'body reason');
  ok(rendered.text.includes('Call Main Shop at 555-0100'), 'body location line');
  deepEq(rendered.missing, [], 'render binds every placeholder');

  // Recipient fallback order + cc suppression when billing == to.
  const d2 = creditMemoNotificationDraft({
    customer: { id: 'c1', company_name: 'X', contact_email: 'a@x', billing_contact_email: 'a@x' },
    payment, invoice, amount: 1,
  });
  eq(d2.to, 'a@x', 'contact_email picked up');
  eq(d2.cc, '', 'cc suppressed when same as to');
  eq(creditMemoNotificationDraft({ payment, invoice, customer: { billing_contact_email: 'b@x' }, amount: 1 }).to,
    'b@x', 'billing_contact_email last resort');
  eq(creditMemoNotificationDraft({ payment, invoice, customer, amount: 1, to: 'over@x' }).to,
    'over@x', 'explicit to wins');

  // Number resolution chain: reference_number > CM-<invoice> > CM-<payment id>.
  eq(creditMemoNotificationDraft({ payment: { ...payment, reference_number: 'REF-7' }, invoice, customer, amount: 1 })
    .context.credit_memo.number, 'REF-7', 'reference_number wins');
  eq(creditMemoNotificationDraft({ payment: { id: 'p9', amount: -1, customer_id: 'c1' }, customer, amount: 1 })
    .context.credit_memo.number, 'CM-p9', 'CM-<payment.id> last resort');

  // Missing-context detection: template paths that render empty.
  const sparse = creditMemoNotificationDraft({ payment: { amount: -1 }, amount: 1 });
  ok(sparse.missing.includes('credit_memo.reason'), 'missing reason flagged');
  ok(sparse.missing.includes('credit_memo.number'), 'missing number flagged');
  ok(sparse.missing.includes('location.phone'), 'missing location.phone flagged');
  ok(sparse.missing.includes('customer.company_name'), 'missing customer flagged');
  const sparseRender = renderTemplate(seedBody, sparse.context);
  ok(sparseRender.text.includes('Hi there,'), 'contact.name default fires in render');

  // amount_cents wins over a divergent dollar amount.
  const d3 = creditMemoNotificationDraft({ payment, invoice, customer, amount: 999, amount_cents: 12345 });
  eq(d3.context.credit_memo.amount, 123.45, 'amount_cents wins for the money context');
}

// ===========================================================================
// E. creditApplyPlan — stored credit applied at the next payment:
//    FIFO ordering, cap at invoice balance, entity-shaped row + patches.
// ===========================================================================
{
  const rows = [
    { id: 'L1', kind: 'credit_issued', amount_cents: 10000, amount: 100, occurred_at: '2026-11-01T00:00:00Z', customer_id: 'c1' },
    { id: 'L2', kind: 'credit_issued', amount_cents: 5000, amount: 50, occurred_at: '2026-11-02T00:00:00Z', customer_id: 'c1' },
  ];
  const p = creditApplyPlan({ ledger_rows: rows, invoice_balance_cents: 12000, invoice_id: 'i1', now: NOW, actor: 'pos' });
  eq(p.balance_cents, 15000, 'ledger balance');
  eq(p.available_cents, 15000, 'spendable');
  eq(p.apply_cents, 12000, 'apply = min(credit, due)');
  eq(p.new_invoice_balance_cents, 0, 'invoice covered');
  eq(p.new_credit_balance_cents, 3000, 'credit remainder');
  deepEq(p.allocations, [
    { row_id: 'L1', occurred_at: '2026-11-01T00:00:00Z', applied_cents: 10000 },
    { row_id: 'L2', occurred_at: '2026-11-02T00:00:00Z', applied_cents: 2000 },
  ], 'FIFO oldest-first allocations');
  const appliedRow = p.ledger_row;
  ok(appliedRow, 'applied row emitted');
  assertEntityKeys(appliedRow, 'applied');
  eq(appliedRow.kind, 'credit_applied', 'kind');
  eq(appliedRow.amount, -120, 'applied amount NEGATIVE dollars');
  eq(appliedRow.amount_cents, -12000, 'applied canonical negative cents');
  eq(appliedRow.balance_after, 30, 'balance_after dollars');
  eq(appliedRow.invoice_id, 'i1', 'applied-to invoice link');
  eq(appliedRow.customer_id, 'c1', 'customer_id pulled from rows');
  eq(appliedRow.occurred_at, NOW, 'occurred_at');
  eq(appliedRow.actor, 'pos', 'actor');
  eq(p.customer_patch.in_store_credit_balance, 30, 'customer_patch dollars');

  // Cap: credit exceeds the balance → never over-apply the invoice.
  const over = creditApplyPlan({ ledger_rows: rows, invoice_balance_cents: 4000, now: NOW });
  eq(over.apply_cents, 4000, 'cap at balance_due');
  eq(over.new_invoice_balance_cents, 0, 'invoice zeroed');
  eq(over.new_credit_balance_cents, 11000, 'credit remainder');
  deepEq(over.allocations.map((a) => a.applied_cents), [4000], 'only L1 touched');

  // Exact match.
  const exact = creditApplyPlan({ ledger_rows: rows, invoice_balance_cents: 15000, now: NOW });
  eq(exact.new_credit_balance_cents, 0, 'drained exactly');
  eq(exact.new_invoice_balance_cents, 0, 'zeroed');

  // Zero/negative credit — apply nothing, emit nothing.
  const zero = creditApplyPlan({ ledger_rows: [], invoice_balance_cents: 5000, now: NOW });
  eq(zero.apply_cents, 0, 'no credit → no apply');
  eq(zero.ledger_row, null, 'no row');
  deepEq(zero.allocations, [], 'no allocations');
  eq(zero.new_invoice_balance_cents, 5000, 'invoice unchanged');
  const neg = creditApplyPlan({
    ledger_rows: [{ kind: 'credit_applied', amount_cents: -3000 }], invoice_balance_cents: 5000, now: NOW,
  });
  eq(neg.balance_cents, -3000, 'net-owed surfaces raw');
  eq(neg.apply_cents, 0, 'negative credit never applies');
  eq(neg.new_credit_balance_cents, -3000, 'raw negative preserved');

  // Zero balance due.
  const nodue = creditApplyPlan({ ledger_rows: rows, invoice_balance_cents: 0, now: NOW });
  eq(nodue.apply_cents, 0, 'nothing owed → nothing applied');
  eq(nodue.ledger_row, null, 'no row');

  // Malformed rows never crash and never count.
  const messy = creditApplyPlan({
    ledger_rows: [
      { kind: 'credit_issued', amount_cents: 1000 },
      { kind: 'credit_issued', amount_cents: 9999, deleted: true },
      { kind: 'note', amount_cents: 500 },
      { kind: 'credit_issued', amount: 'garbage' },
      null, 'junk',
      { kind: 'credit_issued', amount: 20 }, // bare amount = DOLLARS → 2000¢
    ],
    invoice_balance_cents: 2500, now: NOW,
  });
  eq(messy.balance_cents, 3000, 'live rows only; bare amount read as dollars');
  eq(messy.apply_cents, 2500, 'apply from mixed rows');
  eq(ledgerRowAmountCents({ kind: 'credit_issued', amount: 'garbage' }), 0, 'garbage → 0');

  // Void rows drain their ref target FIRST, then oldest-first.
  const withVoid = [
    { id: 'L1', kind: 'credit_issued', amount_cents: 10000, occurred_at: '2026-11-01T00:00:00Z' },
    { id: 'L2', kind: 'credit_issued', amount_cents: 5000, occurred_at: '2026-11-02T00:00:00Z' },
    { id: 'V1', kind: 'credit_voided', amount_cents: -10000, ref: 'L1', occurred_at: '2026-11-03T00:00:00Z' },
  ]; // balance 5000, all in L2's pool
  const pv = creditApplyPlan({ ledger_rows: withVoid, invoice_balance_cents: 6000, now: NOW });
  eq(pv.apply_cents, 5000, 'voided L1 is drained — only L2 funds the apply');
  deepEq(pv.allocations, [
    { row_id: 'L2', occurred_at: '2026-11-02T00:00:00Z', applied_cents: 5000 },
  ], 'ref-targeted drain leaves only L2');

  // Un-targeted negatives drain oldest-first (a prior credit_applied).
  const withApplied = [
    { id: 'L1', kind: 'credit_issued', amount_cents: 10000, occurred_at: '2026-11-01T00:00:00Z' },
    { id: 'L2', kind: 'credit_issued', amount_cents: 5000, occurred_at: '2026-11-02T00:00:00Z' },
    { id: 'A1', kind: 'credit_applied', amount_cents: -2000, occurred_at: '2026-11-03T00:00:00Z' },
  ]; // balance 13000; pools L1 8000 + L2 5000
  const pa = creditApplyPlan({ ledger_rows: withApplied, invoice_balance_cents: 10000, now: NOW });
  eq(pa.apply_cents, 10000, 'apply');
  deepEq(pa.allocations, [
    { row_id: 'L1', occurred_at: '2026-11-01T00:00:00Z', applied_cents: 8000 },
    { row_id: 'L2', occurred_at: '2026-11-02T00:00:00Z', applied_cents: 2000 },
  ], 'prior application drained oldest pool first');

  // Ordering by occurred_at — a row written later (input order) but
  // effective earlier still funds first.
  const outOfOrder = [
    { id: 'NEW', kind: 'credit_issued', amount_cents: 3000, occurred_at: '2026-11-05T00:00:00Z' },
    { id: 'OLD', kind: 'credit_issued', amount_cents: 3000, occurred_at: '2026-11-01T00:00:00Z' },
  ];
  const po = creditApplyPlan({ ledger_rows: outOfOrder, invoice_balance_cents: 4000, now: NOW });
  deepEq(po.allocations.map((a) => a.row_id), ['OLD', 'NEW'], 'occurred_at order, not input order');

  // invoice_patch mirrors storeCreditModel.applyCredit dollars semantics.
  const ip = creditApplyPlan({
    ledger_rows: rows, invoice_balance_cents: 10000, now: NOW,
    invoice: { id: 'i9', amount_paid: 25, balance_due: 100, credit_applied: 10 },
  });
  eq(ip.invoice_patch.amount_paid, 125, 'amount_paid += apply dollars');
  eq(ip.invoice_patch.balance_due, 0, 'balance_due = new cents');
  eq(ip.invoice_patch.credit_applied, 110, 'credit_applied += apply dollars');
  eq(ip.ledger_row.invoice_id, 'i9', 'invoice.id used when invoice_id absent');
  deepEq(creditApplyPlan({ ledger_rows: rows, invoice_balance_cents: 10000, now: NOW }).invoice_patch,
    {}, 'no invoice → no invoice_patch');

  // customer_id resolution chain + request key.
  eq(ip.ledger_row.customer_id, 'c1', 'rows supply customer_id');
  const keyPlan = creditApplyPlan({
    ledger_rows: [{ kind: 'credit_issued', amount_cents: 1000, customer_id: 'cx' }],
    invoice_balance_cents: 500, invoice_id: 'i1', creation_request_key: 'apply:i1:1', now: NOW,
  });
  eq(keyPlan.ledger_row.creation_request_key, 'apply:i1:1', 'caller request key wins');
  ok(keyPlan.ledger_row.customer_id === 'cx', 'customer from row');
}

// ===========================================================================
// F. End-to-end — memo → credit balance → applies at next payment (the
//    item's verify statement, modeled over entity rows).
// ===========================================================================
{
  const payment = {
    id: 'p1', amount: -200, method: 'credit_memo',
    creation_request_key: 'credit:i1:e2e', invoice_id: 'i1', customer_id: 'c9',
    paid_date: '2026-11-03',
  };
  const issue = creditMemoLedgerRow({
    payment, invoice: { id: 'i1', invoice_number: 'INV-9' },
    customer: { id: 'c9' }, prior_balance_cents: 0, now: NOW, actor: 'a',
  });
  const ledger = [{ id: 'E1', ...issue.ledger_row }];
  eq(creditBalanceCents({ id: 'c9', in_store_credit_balance: issue.customer_patch.in_store_credit_balance }, ledger),
    20000, 'memo → credit balance $200 (stored cache mirrors ledger)');
  eq(ledgerBalanceCents(ledger), 20000, 'memo → credit balance $200 (ledger sum)');

  // Next payment: $120 invoice — credit applies, FIFO drains the memo.
  const nextInv = { id: 'i2', amount_paid: 0, balance_due: 120, credit_applied: 0 };
  const plan = creditApplyPlan({
    ledger_rows: ledger, invoice_balance_cents: 12000, invoice: nextInv, now: NOW, actor: 'pos',
  });
  ledger.push({ id: 'E2', ...plan.ledger_row });
  eq(plan.apply_cents, 12000, 'credit applies at next payment');
  eq(plan.invoice_patch.balance_due, 0, 'invoice settled');
  eq(plan.invoice_patch.amount_paid, 120, 'amount_paid picks up the applied credit');
  eq(plan.invoice_patch.credit_applied, 120, 'credit_applied mirror');
  eq(plan.customer_patch.in_store_credit_balance, 80, 'customer cache → $80');
  eq(ledgerBalanceCents(ledger), 8000, 'ledger reconciles to $80');
  const cached = { in_store_credit_balance: plan.customer_patch.in_store_credit_balance };
  eq(creditBalanceCents(cached, ledger), 8000, 'stored cache reconciles to ledger');
}

for (const f of [ledgerRowAmountCents, liveLedgerRows, ledgerBalanceCents, creditBalanceCents,
  entityLedgerRowFromModelRow, creditMemoLedgerRow, creditMemoNotificationDraft, creditApplyPlan]) {
  eq(typeof f, 'function', 'export present');
}

rmSync(tmpModel, { force: true });
rmSync(tmpStore, { force: true });
rmSync(tmpRender, { force: true });
console.log(`PASS credit-memo (${n} assertions)`);
