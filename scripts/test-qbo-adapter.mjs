import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-qbo-adapter.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/qboAdapterModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  QBO_SETTINGS_KEY, QBO_BLOCK_CREDENTIALS, QBO_API_MINOR_VERSION,
  QBO_DOC_TYPES, QBO_ENVIRONMENTS, QBO_ENTITY_FOR_DOC, QBO_FIELD_LIMITS,
  QBO_ACCOUNT_TYPES, QBO_US_TAX_CODES, QBO_ACCOUNT_TYPE_BY_SERIES,
  QBO_ACTION_SPEC,
  defaultQboSettings, qboSettingsShape, normalizeQboSettings, qboConnectionStatus,
  qboToCents, qboDollars,
  qboEndpointFor, qboPullAccountsEndpoint,
  qboInvoiceTxnDate, qboPaymentTxnDate,
  toQboInvoice, toQboPayment, toQboCustomer, toQboAccount, fromQboAccount,
  qboAccountTypeFor, buildQboPayload, validateQboPayload,
  qboRecordHash, qboSyncKey, qboSyncStateKey, qboSyncReceipt, qboAlreadySynced,
  qboSyncReceiptFor, pushBlockReason, dryRunEnvelope,
} = await import(pathToFileURL(out).href);

let N = 0;
const ok = (...a) => { N++; return assert.ok(...a); };
const eq = (...a) => { N++; return assert.equal(...a); };
const deq = (...a) => { N++; return assert.deepEqual(...a); };
const match = (...a) => { N++; return assert.match(...a); };
const errFields = (v) => v.errors.map((e) => e.field);
const hasErr = (v, field) => { N++; return assert.ok(v.errors.some((e) => e.field === field || e.field.startsWith(`${field}.`) || e.field.startsWith(`${field}[`)), `expected error on ${field}, got ${JSON.stringify(v.errors)}`); };

// ===========================================================================
// Fixtures — real entity shapes from base44/entities/*.jsonc.
// ===========================================================================
const INV = {
  id: 'i1', invoice_number: 'INV-1042', status: 'sent', customer_id: 'c1',
  customer_display_name: 'Acme Signs', issue_date: '2026-10-05',
  due_date: '2026-11-04', terms: 'Net 30',
  line_items: [
    { description: 'Channel letters', quantity: 2, unit_price: 30, taxable: true },
    { description: 'Install labor', quantity: 1.5, unit_price: 40.10, taxable: false },
  ],
  fee_lines: [
    { label: 'Freight', kind: 'shipping', amount: 5, taxable: true, income_account_code: '4400' },
    { label: 'Loyalty discount', kind: 'discount', amount: -8, taxable: false, income_account_code: '4900' },
  ],
  subtotal: 160.15, discount_amount: 3, tax_rate: 0.075, tax_amount: 7.65,
  total: 169.80, notes: 'Thank you for your business',
  internal_notes: 'SECRET-DO-NOT-EXPORT', salesperson: 'Brett',
  updated_date: '2026-10-05T12:00:00Z', created_date: '2026-10-01T09:00:00Z',
};
const PAY = {
  id: 'p1', invoice_id: 'i1', customer_id: 'c1', amount: 50.25,
  method: 'check', reference_number: 'CHK-0001234', paid_date: '2026-10-12',
  status: 'recorded', gl_memo: 'check pymt INV-1042',
  notes: 'internal pymt note', updated_date: '2026-10-12T09:00:00Z',
};
const CUST = {
  id: 'c1', company_name: 'Acme Signs & Graphics',
  contact_first_name: 'Amy', contact_last_name: 'Reyes',
  contact_email: 'amy@acme.com', contact_office_phone: '513-555-0141',
  contact_cell_phone: '513-555-0142', company_fax: '513-555-0143',
  website: 'https://acme.example',
  billing_address_1: '12 Main St', billing_address_2: 'Ste 4',
  billing_city: 'Cincinnati', billing_state: 'OH',
  billing_postal_code: '45202', billing_postal_ext: '1234',
  billing_country: 'United States',
  location_same_as_billing: false,
  location_address_1: '99 Site Rd', location_city: 'Mason',
  location_state: 'OH', location_postal_code: '45040',
  tax_exempt: true, is_active: true, notes: 'staff-only notes',
  updated_date: '2026-09-01T08:00:00Z',
};
const ACCT_INC = { id: 'a1', code: '4100', name: 'Sign Income', parent_account: '4000', status: 'active', updated_date: '2026-08-01T00:00:00Z' };
const ACCT_COGS = { id: 'a2', code: '5100', name: 'Materials COGS', status: 'inactive', updated_date: '2026-08-01T00:00:00Z' };

const SETTINGS_ROW = {
  setting_key: 'qbo',
  setting_value: {
    realm_id: '9341455021', refresh_token_ref: 'QBO_REFRESH_TOKEN',
    company_name: 'CCS Test Co', connected_at: '2026-10-01T00:00:00Z',
    last_sync_at: '2026-10-10T00:00:00Z', environment: 'sandbox',
    customer_map: { c1: 'QCUST-9' },
    account_map: { '4000': 'QACCT-4' },
    item_map: { partA: 'QITEM-1' },
    method_map: { check: 'QPM-2' },
    sync_state: {},
  },
};
const OPTS = { customer_map: { c1: 'QCUST-9' }, item_map: { partA: 'QITEM-1' } };

// ===========================================================================
// A — constants + action spec
// ===========================================================================
eq(QBO_SETTINGS_KEY, 'qbo');
eq(QBO_BLOCK_CREDENTIALS, 'BLOCKED-CREDENTIALS');
deq([...QBO_DOC_TYPES], ['invoice', 'payment', 'customer', 'account']);
match(QBO_ENVIRONMENTS.sandbox, /sandbox-quickbooks\.api\.intuit\.com/);
eq(QBO_ENVIRONMENTS.production, 'https://quickbooks.api.intuit.com');
ok(QBO_ACCOUNT_TYPES.includes('Income') && QBO_ACCOUNT_TYPES.includes('Cost of Goods Sold'), 'QBO AccountType enum covers our kinds');
eq(QBO_US_TAX_CODES.taxable, 'TAX');
eq(QBO_US_TAX_CODES.exempt, 'NON');
eq(QBO_ACCOUNT_TYPE_BY_SERIES['4'], 'Income');
eq(QBO_ACCOUNT_TYPE_BY_SERIES['5'], 'Cost of Goods Sold');
deq(QBO_ENTITY_FOR_DOC, { invoice: 'Invoice', payment: 'Payment', customer: 'Customer', account: 'IncomeAccount|COGSAccount' });

const specNames = QBO_ACTION_SPEC.map((a) => a.name);
for (const n of ['status', 'connect', 'disconnect', 'push_invoice', 'push_customer', 'push_payment', 'push_account', 'pull_accounts', 'dry_run']) {
  ok(specNames.includes(n), `action spec includes ${n}`);
}
const spec = (n) => QBO_ACTION_SPEC.find((a) => a.name === n);
eq(spec('push_invoice').direction, 'push');
eq(spec('push_invoice').doc_type, 'invoice');
eq(spec('push_invoice').idempotent, true);
eq(spec('push_invoice').credentials, 'required');
eq(spec('pull_accounts').direction, 'pull');
eq(spec('pull_accounts').doc_type, 'account');
eq(spec('connect').direction, 'oauth');
eq(spec('connect').credentials, 'required');
eq(spec('dry_run').credentials, 'none');
eq(spec('status').credentials, 'none');

// ===========================================================================
// B — settings shape + connection gate
// ===========================================================================
const shape = qboSettingsShape();
eq(shape.setting_key, 'qbo');
for (const k of ['realm_id', 'refresh_token_ref', 'company_name', 'connected_at', 'last_sync_at']) {
  ok(k in shape.setting_value, `settings value declares ${k}`);
}
ok(typeof shape.field_docs.realm_id === 'string' && shape.field_docs.realm_id.length > 10, 'field_docs documents realm_id');
ok(shape.field_docs.refresh_token_ref.includes('never'), 'refresh_token_ref documented as a REF not the token');
eq(defaultQboSettings().environment, 'sandbox');
eq(defaultQboSettings().minorversion, QBO_API_MINOR_VERSION);

eq(normalizeQboSettings(SETTINGS_ROW).realm_id, '9341455021', 'row {setting_value} unwraps');
eq(normalizeQboSettings(SETTINGS_ROW.setting_value).realm_id, '9341455021', 'bare value accepted');
eq(normalizeQboSettings(null).realm_id, '', 'null → defaults');
eq(normalizeQboSettings({ environment: 'production' }).environment, 'production');
eq(normalizeQboSettings({ environment: 'junk' }).environment, 'sandbox', 'unknown env → sandbox');
deq(normalizeQboSettings(SETTINGS_ROW).customer_map, { c1: 'QCUST-9' });
eq(normalizeQboSettings({ customer_map: 'nope' }).customer_map.constructor === Object, true, 'non-object map → {}');

const conn0 = qboConnectionStatus({});
eq(conn0.connected, false);
eq(conn0.blocked, true);
eq(conn0.blocked_reason, 'BLOCKED-CREDENTIALS');
deq(conn0.missing.sort(), ['realm_id', 'refresh_token_ref']);
const conn1 = qboConnectionStatus(SETTINGS_ROW);
eq(conn1.connected, true);
deq(conn1.missing, []);
eq(conn1.blocked, false);
eq(conn1.blocked_reason, '');
deq(qboConnectionStatus({ realm_id: 'r1' }).missing, ['refresh_token_ref'], 'realm without token ref still blocked');

// ===========================================================================
// C — money: cents internally, dollars on the wire
// ===========================================================================
eq(qboToCents(107.8), 10780);
eq(qboToCents('1,234.56'), 123456);
eq(qboToCents('INV-001'), 0, 'letter-laden rejected');
eq(qboToCents(0.1 + 0.2), 30, 'float dust rounds to the cent');
eq(qboToCents(-2.5), -250);
eq(qboToCents(''), 0);
eq(qboDollars(10780), 107.8);
eq(qboDollars(-250), -2.5);
eq(qboDollars(1), 0.01);

// ===========================================================================
// D — endpoints
// ===========================================================================
const ep = qboEndpointFor('invoice', '9341455021');
eq(ep.method, 'POST');
eq(ep.path, '/v3/company/9341455021/invoice');
eq(ep.url, 'https://sandbox-quickbooks.api.intuit.com/v3/company/9341455021/invoice');
eq(ep.environment, 'sandbox');
eq(qboEndpointFor('payment', 'r1', { environment: 'production' }).url,
  'https://quickbooks.api.intuit.com/v3/company/r1/payment');
eq(qboEndpointFor('invoice', { setting_value: { realm_id: 'R9', environment: 'production' } }).url,
  'https://quickbooks.api.intuit.com/v3/company/R9/invoice', 'settings object resolves realm+env');
ok(qboEndpointFor('invoice', '').path.includes('<realm_id>'), 'blank realm → placeholder');
const pullEp = qboPullAccountsEndpoint('R1');
eq(pullEp.method, 'GET');
ok(pullEp.url.startsWith('https://sandbox-quickbooks.api.intuit.com/v3/company/R1/query?'), 'query endpoint');
ok(decodeURIComponent(pullEp.url).includes('query=select * from Account'), 'account query encoded');
ok(pullEp.url.includes(`minorversion=${QBO_API_MINOR_VERSION}`), 'minorversion pinned');

// ===========================================================================
// E — toQboInvoice mapper
// ===========================================================================
const qi = toQboInvoice(INV, OPTS);
eq(qi.DocNumber, 'INV-1042');
eq(qi.TxnDate, '2026-10-05');
eq(qi.DueDate, '2026-11-04');
eq(qi.CustomerRef.value, 'QCUST-9');
eq(qi.CustomerRef.name, 'Acme Signs', 'name falls back to customer_display_name');
eq(qi.CustomerMemo.value, 'Thank you for your business', 'customer-facing notes → CustomerMemo');
ok(!('PrivateNote' in qi), 'no PrivateNote on invoices');
ok(!JSON.stringify(qi).includes('SECRET'), 'internal_notes never serialized');
eq(qi.GlobalTaxCalculation, 'TaxExcluded');
eq(qi.Line.length, 5, '2 lines + 1 fee + 1 discount fee + 1 flat discount');
deq(qi.Line.map((l) => l.LineNum), [1, 2, 3, 4, 5], 'LineNum sequential 1-based');
eq(qi.Line[0].DetailType, 'SalesItemLineDetail');
eq(qi.Line[0].Amount, 60);
eq(qi.Line[0].Description, 'Channel letters');
eq(qi.Line[0].SalesItemLineDetail.Qty, 2);
eq(qi.Line[0].SalesItemLineDetail.UnitPrice, 30);
eq(qi.Line[0].SalesItemLineDetail.TaxCodeRef.value, 'TAX');
eq(qi.Line[1].SalesItemLineDetail.TaxCodeRef.value, 'NON', 'taxable:false → NON');
eq(qi.Line[1].Amount, 60.15, 'fractional qty stays cent-exact');
eq(qi.Line[1].SalesItemLineDetail.UnitPrice, 40.10);
eq(qi.Line[2].DetailType, 'SalesItemLineDetail', 'fee_lines → sales lines');
eq(qi.Line[2].SalesItemLineDetail.Qty, 1);
eq(qi.Line[2].SalesItemLineDetail.UnitPrice, 5);
eq(qi.Line[2].Description, 'Freight');
eq(qi.Line[3].DetailType, 'DiscountLineDetail', 'fee kind=discount → discount line');
eq(qi.Line[3].Amount, 8, 'signed -8 → positive discount');
eq(qi.Line[3].DiscountLineDetail.Amount, 8);
eq(qi.Line[3].DiscountLineDetail.PercentBased, false);
eq(qi.Line[3].Description, 'Loyalty discount');
eq(qi.Line[4].DetailType, 'DiscountLineDetail', 'flat discount_amount → discount line last');
eq(qi.Line[4].Amount, 3);
eq(qi.TxnTaxDetail.TotalTax, 7.65);
eq(qi.Line[2].SalesItemLineDetail.ItemRef, undefined, 'no item map hit → ItemRef omitted');

// ItemRef resolution chain
const qiItem = toQboInvoice(
  { status: 'sent', customer_id: 'c1', line_items: [{ description: 'x', quantity: 1, unit_price: 10, part_key: 'partA' }] },
  OPTS,
);
eq(qiItem.Line[0].SalesItemLineDetail.ItemRef.value, 'QITEM-1', 'item_map[part_key] resolves');
const qiAcctItem = toQboInvoice(
  { status: 'sent', customer_id: 'c1', line_items: [{ description: 'x', quantity: 1, unit_price: 10, part_key: 'partA', income_account_code: '4400' }] },
  { ...OPTS, account_item_map: { '4400': 'QITEM-GL' } },
);
eq(qiAcctItem.Line[0].SalesItemLineDetail.ItemRef.value, 'QITEM-GL', 'account_item_map beats item_map');
const qiDefItem = toQboInvoice(
  { status: 'sent', customer_id: 'c1', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] },
  { default_item_ref: { value: 'QITEM-D', name: 'Services' } },
);
eq(qiDefItem.Line[0].SalesItemLineDetail.ItemRef.value, 'QITEM-D', 'default_item_ref fallback');
const qiNoTax = toQboInvoice({ ...INV, tax_amount: 0 }, OPTS);
ok(!('TxnTaxDetail' in qiNoTax), 'zero tax → no TxnTaxDetail');
const qiCust = toQboInvoice(INV, { ...OPTS, customer: CUST });
deq(qiCust.BillAddr, {
  Line1: '12 Main St', Line2: 'Ste 4', City: 'Cincinnati',
  CountrySubDivisionCode: 'OH', PostalCode: '45202-1234', Country: 'United States',
}, 'BillAddr from customer billing_*');
eq(qiCust.BillEmail.Address, 'amy@acme.com');
eq(qboInvoiceTxnDate({ created_date: '2026-10-25T10:00:00Z' }), '2026-10-25', 'created_date chain → day');
eq(qboInvoiceTxnDate({ invoice_date: '2026-10-01', issue_date: '2026-10-05' }), '2026-10-01', 'invoice_date wins');
const qiTerm = toQboInvoice(INV, { ...OPTS, sales_term_ref: 'QTERM-3' });
eq(qiTerm.SalesTermRef.value, 'QTERM-3');
const qiDiscAcct = toQboInvoice(INV, { ...OPTS, discount_account_map: { '4900': 'QACCT-DISC' } });
eq(qiDiscAcct.Line[3].DiscountLineDetail.DiscountAccountRef.value, 'QACCT-DISC', 'discount fee income_account_code → DiscountAccountRef');
// unresolved customer → empty value for validation to flag
const qiNoCust = toQboInvoice(INV, {});
eq(qiNoCust.CustomerRef.value, '');
eq(qiNoCust.CustomerRef.name, 'Acme Signs');

// ===========================================================================
// F — toQboPayment mapper
// ===========================================================================
const qp = toQboPayment(PAY, {
  customer_map: { c1: 'QCUST-9' },
  invoice_map: { i1: 'QINV-7' },
  invoice: INV,
  method_map: { check: 'QPM-2' },
});
eq(qp.TotalAmt, 50.25);
eq(qp.CustomerRef.value, 'QCUST-9');
eq(qp.CustomerRef.name, 'Acme Signs', 'falls back to invoice.customer_display_name');
eq(qp.TxnDate, '2026-10-12');
eq(qp.PaymentRefNum, 'CHK-0001234');
eq(qp.PrivateNote, 'check pymt INV-1042', 'gl_memo → PrivateNote');
ok(!JSON.stringify(qp).includes('internal pymt note'), 'payment notes never exported');
eq(qp.Line.length, 1);
eq(qp.Line[0].Amount, 50.25);
eq(qp.Line[0].LineNum, 1);
deq(qp.Line[0].LinkedTxn, [{ TxnId: 'QINV-7', TxnType: 'Invoice' }]);
eq(qp.PaymentMethodRef.value, 'QPM-2');
eq(qp.PaymentMethodRef.name, 'check');
eq(toQboPayment({ ...PAY, reference_number: 'X'.repeat(30) }, {}).PaymentRefNum.length, QBO_FIELD_LIMITS.doc_number, 'PaymentRefNum truncated to 21');
const qpDep = toQboPayment(PAY, { invoice_map: { i1: 'QINV-7' }, deposit_account_ref: 'QBANK-1' });
eq(qpDep.DepositToAccountRef.value, 'QBANK-1');
const qpNoInv = toQboPayment(PAY, {});
eq(qpNoInv.Line[0].LinkedTxn[0].TxnId, '', 'unresolved invoice → empty TxnId for validation');
ok(!('DepositToAccountRef' in qp), 'no deposit ref → omitted (QBO defaults to UndepositedFunds)');
eq(qboPaymentTxnDate({ created_date: '2026-10-12T23:00:00Z' }), '2026-10-12');
eq(qboPaymentTxnDate({ paid_date: '2026-10-11', created_date: '2026-10-12T23:00:00Z' }), '2026-10-11');
// invoice row carrying a synced qbo_id resolves LinkedTxn
const qpInvRow = toQboPayment(PAY, { invoice: { id: 'i1', qbo_id: 'QINV-9', invoice_number: 'INV-1042' } });
eq(qpInvRow.Line[0].LinkedTxn[0].TxnId, 'QINV-9', 'local invoice qbo_id field resolves');
// plain local row id must NOT masquerade as a QBO id
const qpLocalOnly = toQboPayment(PAY, { invoice: { id: 'i1', invoice_number: 'INV-1042' } });
eq(qpLocalOnly.Line[0].LinkedTxn[0].TxnId, '', 'local entity id is not a QBO Id');
const qiLocalCust = toQboInvoice(INV, { customer: { id: 'c1', company_name: 'Acme' } });
eq(qiLocalCust.CustomerRef.value, '', 'local customer id is not a QBO Id');
const qpLocalCust = toQboPayment(PAY, { customer: { id: 'c1', company_name: 'Acme' }, invoice_map: { i1: 'Q1' } });
eq(qpLocalCust.CustomerRef.value, '', 'payment: local customer id is not a QBO Id');
const qpCustQbo = toQboPayment(PAY, { customer: { id: 'c1', qbo_id: 'QC-5', company_name: 'Acme' }, invoice_map: { i1: 'Q1' } });
eq(qpCustQbo.CustomerRef.value, 'QC-5', 'payment: customer.qbo_id field resolves');
eq(qpCustQbo.CustomerRef.name, 'Acme');

// ===========================================================================
// G — toQboCustomer mapper
// ===========================================================================
const qc = toQboCustomer(CUST);
eq(qc.DisplayName, 'Acme Signs & Graphics');
eq(qc.CompanyName, 'Acme Signs & Graphics');
eq(qc.GivenName, 'Amy');
eq(qc.FamilyName, 'Reyes');
eq(qc.PrimaryEmailAddr.Address, 'amy@acme.com');
eq(qc.PrimaryPhone.FreeFormNumber, '513-555-0141');
eq(qc.Mobile.FreeFormNumber, '513-555-0142');
eq(qc.Fax.FreeFormNumber, '513-555-0143');
eq(qc.WebAddr.URI, 'https://acme.example');
deq(qc.BillAddr, {
  Line1: '12 Main St', Line2: 'Ste 4', City: 'Cincinnati',
  CountrySubDivisionCode: 'OH', PostalCode: '45202-1234', Country: 'United States',
});
deq(qc.ShipAddr, {
  Line1: '99 Site Rd', City: 'Mason', CountrySubDivisionCode: 'OH', PostalCode: '45040',
}, 'ShipAddr emitted when location_same_as_billing===false');
const qcSame = toQboCustomer({ ...CUST, location_same_as_billing: true });
ok(!('ShipAddr' in qcSame), 'ShipAddr omitted when same-as-billing');
eq(qc.Taxable, false, 'tax_exempt → Taxable false');
eq(qc.Active, true);
eq(qc.Job, false);
ok(!('Notes' in qc), 'internal notes excluded by default (safe-column parity)');
eq(toQboCustomer(CUST, { include_notes: true }).Notes, 'staff-only notes', 'opt-in notes');
eq(toQboCustomer({ ...CUST, is_active: false }).Active, false);
eq(toQboCustomer({ ...CUST, tax_exempt: false }).Taxable, true);
const qcParent = toQboCustomer(CUST, { parent_ref: 'QCUST-MASTER' });
eq(qcParent.ParentRef.value, 'QCUST-MASTER');
eq(qcParent.Job, true, 'sub-customer = Job:true');
const qcLong = toQboCustomer({ company_name: 'X'.repeat(60) });
eq(qcLong.CompanyName.length, QBO_FIELD_LIMITS.company_name, 'CompanyName capped at 50');

// ===========================================================================
// H — toQboAccount + fromQboAccount
// ===========================================================================
const qa1 = toQboAccount(ACCT_INC, { account_map: { '4000': 'QACCT-4' } });
eq(qa1.Name, 'Sign Income');
eq(qa1.AcctNum, '4100');
eq(qa1.AccountType, 'Income', '4xxx series → Income');
eq(qa1.Active, true);
eq(qa1.ParentRef.value, 'QACCT-4', 'parent_account code → ParentRef via account_map');
const qa2 = toQboAccount(ACCT_COGS);
eq(qa2.AccountType, 'Cost of Goods Sold', '5xxx series → COGS');
eq(qa2.Active, false, 'status inactive → Active false');
eq(toQboAccount(ACCT_COGS, { kind: 'income' }).AccountType, 'Income', 'kind override wins');
eq(toQboAccount({ code: '9999', name: 'N' }, { entity: 'IncomeAccount' }).AccountType, 'Income', 'entity name override');
eq(toQboAccount({ code: '9999', name: 'N' }).AccountType, '', 'unknown series → blank for validation');
eq(toQboAccount({ code: '4200' }).Name, '4200', 'name falls back to code');
ok(!('ParentRef' in toQboAccount(ACCT_INC)), 'unmapped parent → ParentRef omitted');
eq(toQboAccount(ACCT_INC, { account_sub_type: 'SalesOfProductIncome' }).AccountSubType, 'SalesOfProductIncome');
eq(qboAccountTypeFor('income'), 'Income');
eq(qboAccountTypeFor('COGSAccount'), 'Cost of Goods Sold');
eq(qboAccountTypeFor('7'), '');

const back = fromQboAccount({ Id: 'Q1', Name: 'Sign Income', AcctNum: '4100', AccountType: 'Income', Active: true, SyncToken: '3' });
eq(back.code, '4100');
eq(back.name, 'Sign Income');
eq(back.kind, 'income');
eq(back.status, 'active');
eq(back.qbo_id, 'Q1');
eq(back.sync_token, '3');
const backSub = fromQboAccount(
  { Id: 'Q2', Name: 'Sub Acct', AcctNum: '4110', AccountType: 'Income', Active: false, ParentRef: { value: 'Q1' } },
  { accountsById: { Q1: { code: '4100' } } },
);
eq(backSub.parent_account, '4100', 'ParentRef → local parent code');
eq(backSub.status, 'inactive');
eq(fromQboAccount({ AccountType: 'Cost of Goods Sold' }).kind, 'cogs');
eq(fromQboAccount({ AccountType: 'Bank' }).kind, '', 'non-income/cogs → kind blank');

// ===========================================================================
// I — buildQboPayload dispatch
// ===========================================================================
eq(buildQboPayload('invoice', INV, OPTS).DocNumber, 'INV-1042');
eq(buildQboPayload('payment', PAY, { invoice_map: { i1: 'Q1' } }).TotalAmt, 50.25);
eq(buildQboPayload('customer', CUST).DisplayName, 'Acme Signs & Graphics');
eq(buildQboPayload('account', ACCT_INC).AcctNum, '4100');
eq(buildQboPayload('INVOICE', INV, OPTS).DocNumber, 'INV-1042', 'case-insensitive');
eq(buildQboPayload('vendor', {}), null, 'unknown doc type → null');
eq(buildQboPayload('', {}), null);

// ===========================================================================
// J — validateQboPayload
// ===========================================================================
// Valid payloads pass clean.
ok(validateQboPayload('invoice', qi).ok, 'full invoice validates');
ok(validateQboPayload('payment', qp).ok, 'full payment validates');
ok(validateQboPayload('customer', qc).ok, 'full customer validates');
ok(validateQboPayload('account', qa1).ok, 'full account validates');
deq(validateQboPayload('invoice', qi).errors, []);

// invoice rejects
let v = validateQboPayload('invoice', { Line: qi.Line });
hasErr(v, 'CustomerRef');
v = validateQboPayload('invoice', { CustomerRef: { value: '' }, Line: qi.Line });
hasErr(v, 'CustomerRef.value');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: [] });
hasErr(v, 'Line');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: [{ DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { Qty: 1, UnitPrice: 1 } }] });
hasErr(v, 'Line[0].Amount');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: [{ Amount: 1, DetailType: 'Bogus' }] });
hasErr(v, 'Line[0].DetailType');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: [{ Amount: 1, DetailType: 'SalesItemLineDetail', SalesItemLineDetail: {} }] });
hasErr(v, 'Line[0].SalesItemLineDetail.Qty');
hasErr(v, 'Line[0].SalesItemLineDetail.UnitPrice');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: [{ Amount: 1, DetailType: 'SalesItemLineDetail', LineNum: 1, SalesItemLineDetail: { Qty: 1, UnitPrice: 1 } }, { Amount: 2, DetailType: 'SalesItemLineDetail', LineNum: 1, SalesItemLineDetail: { Qty: 1, UnitPrice: 2 } }] });
hasErr(v, 'Line[1].LineNum');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, DocNumber: 'X'.repeat(22), Line: qi.Line });
hasErr(v, 'DocNumber');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, TxnDate: '10/05/2026', Line: qi.Line });
hasErr(v, 'TxnDate');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: qi.Line, TxnTaxDetail: { TotalTax: -1 } });
hasErr(v, 'TxnTaxDetail.TotalTax');
v = validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: qi.Line, PrivateNote: 'Y'.repeat(4001) });
hasErr(v, 'PrivateNote');
ok(validateQboPayload('invoice', { CustomerRef: { value: 'Q1' }, Line: qi.Line, TxnDate: '2026-10-05' }).ok, 'valid minimal invoice passes');

// payment rejects
v = validateQboPayload('payment', { TotalAmt: 0, CustomerRef: { value: 'Q1' }, Line: qp.Line });
hasErr(v, 'TotalAmt');
v = validateQboPayload('payment', { TotalAmt: -5, CustomerRef: { value: 'Q1' }, Line: qp.Line });
hasErr(v, 'TotalAmt');
v = validateQboPayload('payment', { TotalAmt: 50.25, Line: qp.Line });
hasErr(v, 'CustomerRef');
v = validateQboPayload('payment', { TotalAmt: 50.25, CustomerRef: { value: 'Q1' }, Line: [{ Amount: 50.25, LinkedTxn: [] }] });
hasErr(v, 'Line[0].LinkedTxn');
v = validateQboPayload('payment', { TotalAmt: 50.25, CustomerRef: { value: 'Q1' }, Line: [{ Amount: 50.25, LinkedTxn: [{ TxnId: '', TxnType: 'Invoice' }] }] });
hasErr(v, 'Line[0].LinkedTxn[0].TxnId');
v = validateQboPayload('payment', { TotalAmt: 50.25, CustomerRef: { value: 'Q1' }, Line: [{ Amount: 50.25, LinkedTxn: [{ TxnId: 'Q1', TxnType: 'Estimate' }] }] });
hasErr(v, 'Line[0].LinkedTxn[0].TxnType');
v = validateQboPayload('payment', { TotalAmt: 99, CustomerRef: { value: 'Q1' }, Line: [{ Amount: 50.25, LinkedTxn: [{ TxnId: 'Q1', TxnType: 'Invoice' }] }] });
hasErr(v, 'TotalAmt');
v = validateQboPayload('payment', { TotalAmt: 5, CustomerRef: { value: 'Q1' }, PaymentRefNum: 'Z'.repeat(22), Line: [{ Amount: 5, LinkedTxn: [{ TxnId: 'Q1', TxnType: 'Invoice' }] }] });
hasErr(v, 'PaymentRefNum');

// customer rejects
v = validateQboPayload('customer', {});
hasErr(v, 'DisplayName');
v = validateQboPayload('customer', { DisplayName: 'Z'.repeat(501) });
hasErr(v, 'DisplayName');
v = validateQboPayload('customer', { DisplayName: 'Ok', Taxable: 'yes' });
hasErr(v, 'Taxable');
v = validateQboPayload('customer', { DisplayName: 'Ok', PrimaryPhone: { FreeFormNumber: '1'.repeat(31) } });
hasErr(v, 'PrimaryPhone.FreeFormNumber');
ok(validateQboPayload('customer', { DisplayName: 'Ok' }).ok, 'minimal customer passes');

// account rejects
v = validateQboPayload('account', { AccountType: 'Income' });
hasErr(v, 'Name');
v = validateQboPayload('account', { Name: 'X', AccountType: 'MadeUp' });
hasErr(v, 'AccountType');
v = validateQboPayload('account', { Name: 'X', AccountType: 'Income', AcctNum: '1'.repeat(21) });
hasErr(v, 'AcctNum');
v = validateQboPayload('account', { Name: 'X', AccountType: 'Income', Active: 'yes' });
hasErr(v, 'Active');
ok(validateQboPayload('account', { Name: 'X', AccountType: 'Income' }).ok, 'minimal account passes');

// unknown doc + non-object payload
v = validateQboPayload('vendor', {});
eq(v.ok, false);
hasErr(v, 'doc_type');
v = validateQboPayload('invoice', 'not-an-object');
hasErr(v, 'payload');
eq(v.doc_type, 'invoice');

// ===========================================================================
// K — idempotency: keys stable + change on update
// ===========================================================================
const k1 = qboSyncKey('push_invoice', INV);
match(k1, /^qbo:push_invoice:invoice:i1:h[a-z0-9]+$/, 'key format qbo:<action>:<doc>:<id>:h<fnv>');
eq(qboSyncKey('push_invoice', INV), k1, 'same record → same key (stable)');
const k2 = qboSyncKey('push_invoice', { ...INV, updated_date: '2026-10-06T00:00:00Z' });
ok(k2 !== k1, 'updated_date bump → new key');
const k3 = qboSyncKey('push_invoice', { ...INV, notes: 'changed but same updated_date' });
eq(k3, k1, 'non-stamp field change alone does not move the key (updated_date is the version)');
ok(qboSyncKey('push_payment', PAY) !== k1, 'different action/record → different key');
match(qboSyncKey('pull_accounts', ACCT_INC), /^qbo:pull_accounts:account:a1:h/, 'pull action derives doc from name');
eq(qboSyncKey('push_invoice', INV, { doc_type: 'invoice' }), k1);
eq(qboRecordHash(INV), qboRecordHash({ ...INV }), 'hash deterministic');
ok(qboRecordHash(INV) !== qboRecordHash({ ...INV, updated_date: '2026-11-01' }), 'hash tracks updated_date');
eq(qboSyncStateKey('invoice', INV), 'invoice:i1');
eq(qboSyncStateKey('payment', PAY), 'payment:p1');

// receipt round-trip through settings.sync_state
const receipt = qboSyncReceiptFor('push_invoice', 'invoice', INV, { qbo_id: 'QINV-1', synced_at: '2026-10-06T00:00:00Z' });
eq(receipt.key, k1);
eq(receipt.qbo_id, 'QINV-1');
eq(receipt.status, 'synced');
const settingsWithReceipt = { setting_value: { realm_id: 'R', refresh_token_ref: 'T', sync_state: { 'invoice:i1': receipt } } };
deq(qboSyncReceipt(settingsWithReceipt, 'invoice', INV), receipt);
eq(qboSyncReceipt(settingsWithReceipt, 'payment', PAY), null);
eq(qboAlreadySynced(settingsWithReceipt, 'push_invoice', 'invoice', INV), true, 'untouched record → already synced');
eq(qboAlreadySynced(settingsWithReceipt, 'push_invoice', 'invoice', { ...INV, updated_date: '2026-10-07' }), false, 'updated record → not synced');
eq(qboAlreadySynced(SETTINGS_ROW, 'push_invoice', 'invoice', INV), false, 'no receipt → not synced');
// sync_state doubles as invoice_map (receipt carries qbo_id)
const envReceipt = dryRunEnvelope('payment', PAY, { settings: settingsWithReceipt });
eq(envReceipt.would_send.Line[0].LinkedTxn[0].TxnId, 'QINV-1', 'sync_state receipt resolves LinkedTxn');

// ===========================================================================
// L — pushBlockReason
// ===========================================================================
eq(pushBlockReason('invoice', INV), '');
eq(pushBlockReason('invoice', { ...INV, status: 'paid' }), '');
eq(pushBlockReason('invoice', { ...INV, status: 'draft' }), 'not_posted');
eq(pushBlockReason('invoice', { ...INV, status: 'void' }), 'status_void');
eq(pushBlockReason('invoice', { id: 'x' }), 'not_posted');
eq(pushBlockReason('payment', PAY), '');
eq(pushBlockReason('payment', { ...PAY, status: 'void' }), 'status_void');
eq(pushBlockReason('payment', { ...PAY, status: 'refunded' }), 'status_refunded');
eq(pushBlockReason('payment', { ...PAY, method: 'credit_memo' }), 'credit_memo_doc');
eq(pushBlockReason('payment', { ...PAY, amount: -50 }), 'non_positive_amount');
eq(pushBlockReason('payment', { ...PAY, invoice_id: '' }), 'missing_invoice_id');
eq(pushBlockReason('customer', CUST), '');
eq(pushBlockReason('customer', { ...CUST, merged_into_customer_id: 'c9' }), 'merged');
eq(pushBlockReason('customer', { id: 'cX' }), 'missing_display_name');
eq(pushBlockReason('account', ACCT_INC), '');
eq(pushBlockReason('account', { name: 'X' }), 'missing_code');
eq(pushBlockReason('account', { code: '9999', name: 'X' }), 'unmapped_account_type');
eq(pushBlockReason('vendor', {}), 'unknown_doc_type');

// ===========================================================================
// M — dryRunEnvelope
// ===========================================================================
const env = dryRunEnvelope('invoice', INV, { settings: SETTINGS_ROW });
eq(env.mode, 'dry-run');
eq(env.action, 'push_invoice');
eq(env.doc_type, 'invoice');
eq(env.entity, 'Invoice');
eq(env.record_id, 'i1');
eq(env.idempotency_key, k1);
eq(env.endpoint.method, 'POST');
eq(env.endpoint.path, '/v3/company/9341455021/invoice');
eq(env.realm_id, '9341455021');
eq(env.would_send.DocNumber, 'INV-1042');
eq(env.would_send.CustomerRef.value, 'QCUST-9', 'settings customer_map feeds the mapper');
deq(env.would_send, toQboInvoice(INV, { settings: SETTINGS_ROW, customer_map: SETTINGS_ROW.setting_value.customer_map, item_map: SETTINGS_ROW.setting_value.item_map, account_map: SETTINGS_ROW.setting_value.account_map, method_map: SETTINGS_ROW.setting_value.method_map, invoice_map: SETTINGS_ROW.setting_value.sync_state, account_item_map: undefined }), 'would_send = merged-opts mapper output');
ok(env.validation.ok);
eq(env.push_blocked, '');
eq(env.credentials.blocked, false, 'connected settings → no credential block');
eq(env.credentials.reason, '');
eq(env.sendable, true, 'valid + posted + connected → sendable');

const envNoConn = dryRunEnvelope('invoice', INV, { settings: {} });
eq(envNoConn.credentials.blocked, true);
eq(envNoConn.credentials.reason, 'BLOCKED-CREDENTIALS');
deq(envNoConn.credentials.missing.sort(), ['realm_id', 'refresh_token_ref']);
eq(envNoConn.sendable, false, 'unconnected → never sendable');
eq(envNoConn.endpoint.path, '/v3/company/<realm_id>/invoice', 'placeholder realm in dry-run endpoint');

const envDraft = dryRunEnvelope('invoice', { ...INV, status: 'draft' }, { settings: SETTINGS_ROW });
eq(envDraft.push_blocked, 'not_posted');
eq(envDraft.sendable, false);
ok(envDraft.validation.ok, 'draft still produces a valid payload — gate is business-level');

const envCust = dryRunEnvelope('customer', CUST, { settings: SETTINGS_ROW });
eq(envCust.action, 'push_customer');
ok(envCust.validation.ok);
eq(envCust.push_blocked, '');

const envAcct = dryRunEnvelope('account', ACCT_INC, { settings: SETTINGS_ROW });
eq(envAcct.action, 'push_account');
eq(envAcct.endpoint.path, '/v3/company/9341455021/account');

const envPull = dryRunEnvelope('account', ACCT_INC, { settings: SETTINGS_ROW, action: 'pull_accounts' });
eq(envPull.endpoint.method, 'GET');
ok(envPull.endpoint.url.includes('/query?'), 'pull_accounts → query endpoint');

const envBad = dryRunEnvelope('invoice', INV, { settings: {} });
eq(envBad.would_send.CustomerRef.value, '');
ok(!envBad.validation.ok, 'unresolved CustomerRef fails the gate');
hasErr(envBad.validation, 'CustomerRef.value');

rmSync(out, { force: true });
console.log(`PASS qbo-adapter (${N} assertions)`);
