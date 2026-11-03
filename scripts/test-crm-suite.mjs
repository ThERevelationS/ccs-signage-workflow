// CRM verification suite — masterplan item N-07 (worker w-132).
// ONE suite that esbuild-bundles the CRM-side shared models (plus the two
// frontend twins the reports pack replicates) and asserts lifecycle,
// schema-contract and cross-model reconciliation across them:
//
//   base44/shared/customerLifecycleRules.ts  (G-03 sweep + auto-inactive)
//   base44/shared/customerReports.ts         (J-04 nine customer reports)
//   base44/shared/customerAnalyticsModel.ts  (G-12 360 analytics)
//   base44/shared/customerWarningModel.ts    (G-11 warning flags)
//   base44/shared/customerTierModel.ts       (F-22 pricing tier)
//   base44/shared/customerImportModel.ts     (G-13 CSV import dedupe)
//   base44/shared/estimateReports.ts         (J-04 estimate pack — origination)
//   src/components/customer360/creditTermsModel.js (w-63 limit check — the
//      model customerReports.ts replicates inline)
//   src/components/customer360/taxExemptModel.js   (G-08 registry — ditto)
// + schema contract vs base44/entities/Customer.jsonc / Invoice.jsonc and
//   merge-sweep wiring vs src/components/estimator/CustomerMergeDialog.jsx,
//   base44/functions/ensureCustomerSummary/entry.ts,
//   base44/functions/manageCustomerLifecycle/entry.ts.
//
// Coverage (workstream G brief):
//   1. origination hierarchy  — customer_origination/origination_path +
//      master_account parent/child chains.
//   2. master rollup          — customers_by_master open-balance rollup,
//      children AR aggregation vs customer_balance.
//   3. auto-inactive          — resolveAutoInactiveMonths/shouldAutoInactivate/
//      sweepPlan + manageCustomerLifecycle write path.
//   4. credit limit           — creditUsage parity, limit ladder, credit_hold
//      warning derivation, warning_flag_details sidecar.
//   5. tax-exempt expiry      — registry status ladder, grace window,
//      per-state gap, report + frontend replica parity.
//   6. merge sweep            — import dedupe, merged stub semantics, merge
//      dialog relink list, summary CAS dedupe.
//
// Verification only — this file never edits model code; a mismatch is a
// defect to report, not something to patch.
//
// Run: node scripts/test-crm-suite.mjs  →  prints PASS crm-suite + count

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = (...p) => resolve(here, '..', ...p);
const readText = (p) => readFileSync(repo(p), 'utf8');

const tmpFiles = [];
const bundle = async (entry, tag) => {
  const out = repo('scripts', `.tmp-crm-suite-${tag}.mjs`);
  buildSync({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  tmpFiles.push(out);
  return import(pathToFileURL(out).href);
};

const lc = await bundle(repo('base44/shared/customerLifecycleRules.ts'), 'lifecycle');
const rep = await bundle(repo('base44/shared/customerReports.ts'), 'reports');
const ana = await bundle(repo('base44/shared/customerAnalyticsModel.ts'), 'analytics');
const warn = await bundle(repo('base44/shared/customerWarningModel.ts'), 'warning');
const tier = await bundle(repo('base44/shared/customerTierModel.ts'), 'tier');
const imp = await bundle(repo('base44/shared/customerImportModel.ts'), 'import');
const estR = await bundle(repo('base44/shared/estimateReports.ts'), 'estreports');
const ct = await bundle(repo('src/components/customer360/creditTermsModel.js'), 'creditterms');
const tex = await bundle(repo('src/components/customer360/taxExemptModel.js'), 'taxexempt');

// --- assertion counter -------------------------------------------------------
let COUNT = 0;
const eq = (a, b, msg) => { COUNT++; assert.equal(a, b, msg); };
const deq = (a, b, msg) => { COUNT++; assert.deepEqual(a, b, msg); };
const ok = (v, msg) => { COUNT++; assert.ok(v, msg); };
const thr = (fn, msg) => { COUNT++; assert.throws(fn, undefined, msg); };

// --- deterministic clocks ----------------------------------------------------
// As-of params are 'YYYY-MM-DD' text; lifecycle inputs are UTC ISO stamps.
const AS_OF = '2026-11-15';
const NOW_ISO = '2026-11-15T00:00:00Z';

// =============================================================================
// Canonical customer-family fixture — ONE dataset every model reads.
//   c1 Acme Sign Co  — active master; $5000/Net30; active cert (2027-01-31);
//                      stored credit 125.50; BOTH origination fields set;
//                      recent contact activity.
//   c2 Acme East     — child via master_account_id; $1000 limit EXCEEDED by
//                      i3; legacy-flag expired cert (2026-10-01).
//   c3 Acme West     — prospect child via master_account LABEL; $500 limit
//                      exactly AT i4; revoked cert; opportunity activity.
//   c4 Acme North    — child-of-child (master_account_id c2) proving the
//                      hierarchy is single-level; small open invoice.
//   c5 Acme Gulf     — merged stub (merged_into_customer_id c1) with a
//                      post-merge orphan open invoice i9.
//   c6 Beta Works    — dormant; auto_inactive_months 6 → sweep target.
//   c7 Shielded Co   — active; auto_inactive_disabled:true + ancient activity
//                      → opt-out shields the sweep but NOT dormancy.
//   c8 Zero Win Co   — auto_inactive_months:0 + auto_inactive_after_months:18
//                      (schema says 0 disables; model falls to default).
//   c9 Never Co      — active; zero parseable activity; master_account
//                      'Umbrella Corp' label that resolves to nobody.
//   c10 Path Only    — origination_path only (no flat label); created exactly
//                      90 days before AS_OF (dormancy boundary).
// =============================================================================
const CUSTOMERS = [
  {
    id: 'c1', company_name: 'Acme Sign Co', customer_status: 'active',
    salesperson: 'Sam', terms: 'Net 30', credit_terms_days: 30, credit_limit: 5000,
    in_store_credit_balance: 125.5,
    tax_exemption: { reason: 'resale', certificate_id: 'OH-99', expires_on: '2027-01-31', issued_by: 'Ohio DOR', status: 'active' },
    customer_origination: 'referral',
    origination_path: 'Networking Group : BNI - Carl',
    created_date: '2026-06-01', last_contacted_at: '2026-11-12T09:00:00Z',
  },
  {
    id: 'c2', company_name: 'Acme East', customer_status: 'active',
    master_account_id: 'c1', master_account: 'Acme Sign Co',
    credit_terms_days: 30, credit_limit: 1000,
    tax_exempt: true, tax_exempt_id: 'LEG-9', tax_exempt_expires: '2026-10-01',
    customer_origination: 'networking',
    created_date: '2026-09-20',
  },
  {
    id: 'c3', company_name: 'Acme West', customer_status: 'prospect',
    master_account: 'Acme Sign Co', // label-only link — resolves by name
    credit_terms_days: 15, credit_limit: 500,
    tax_exemption: { status: 'revoked', reason: 'audit failure', expires_on: '2027-06-01' },
    created_date: '2026-11-10',
  },
  {
    id: 'c4', company_name: 'Acme North', customer_status: 'active',
    master_account_id: 'c2', // child-of-child — single-level hierarchy proof
    created_date: '2026-11-08',
  },
  {
    id: 'c5', company_name: 'Acme Gulf', customer_status: 'active',
    merged_into_customer_id: 'c1', // audit stub — excluded everywhere
    master_account_id: 'c1', in_store_credit_balance: 999, credit_limit: 999,
    created_date: '2026-01-05',
  },
  {
    id: 'c6', company_name: 'Beta Works', customer_status: 'active',
    auto_inactive_months: 6, created_date: '2026-01-15',
  },
  {
    id: 'c7', company_name: 'Shielded Co', customer_status: 'active',
    auto_inactive_disabled: true, created_date: '2024-01-01',
  },
  {
    id: 'c8', company_name: 'Zero Win Co', customer_status: 'active',
    auto_inactive_months: 0, auto_inactive_after_months: 18,
    created_date: '2024-01-01',
  },
  {
    id: 'c9', company_name: 'Never Co', customer_status: 'active',
    master_account: 'Umbrella Corp', // unresolvable label → its own group
    created_date: '',
  },
  {
    id: 'c10', company_name: 'Path Only Co', customer_status: 'active',
    origination_path: 'Networking Group : BNI', // no flat customer_origination
    created_date: '2026-08-17', // exactly 90 days before AS_OF → NOT dormant
  },
];

const inv = (over = {}) => ({
  id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
  issue_date: '2026-10-01', total: 0, balance_due: 0, ...over,
});
const INVOICES = [
  inv({ id: 'i1', invoice_number: 'INV-1', due_date: '2026-10-31', total: 1000, amount_paid: 100, balance_due: 400, issue_date: '2026-10-01' }), // stamped paid 100 beats the total−balance (600) derivation
  inv({ id: 'i2', invoice_number: 'INV-2', status: 'paid', total: 500, amount_paid: 500, balance_due: 0, paid_date: '2026-10-20', issue_date: '2026-10-05' }),
  inv({ id: 'i3', invoice_number: 'INV-3', customer_id: 'c2', issue_date: '2026-11-01', due_date: '2026-11-20', total: 1200, balance_due: 1200 }),
  inv({ id: 'i4', invoice_number: 'INV-4', customer_id: 'c3', issue_date: '2026-11-05', due_date: '2026-11-30', total: 500, balance_due: 500 }),
  inv({ id: 'i5', invoice_number: 'INV-5', customer_id: 'c6', issue_date: '2026-02-01', due_date: '2026-02-15', total: 300, balance_due: 300, created_date: '2026-02-01' }),
  inv({ id: 'i6', invoice_number: 'INV-6', status: 'draft', total: 999, balance_due: 999 }),             // AR excl — usage INCL
  inv({ id: 'i7', invoice_number: 'INV-7', customer_id: 'c2', status: 'void', total: 999, balance_due: 999 }),
  inv({ id: 'i8', invoice_number: 'INV-8', issue_date: '2026-11-20', total: 500, balance_due: 500 }),     // future bill — AR excl, usage INCL
  inv({ id: 'i9', invoice_number: 'INV-9', customer_id: 'c5', issue_date: '2026-10-10', due_date: '2026-11-01', total: 700, balance_due: 700 }), // merged-stub orphan AR
  inv({ id: 'i10', invoice_number: 'INV-10', customer_id: 'c6', status: 'refunded', total: 150, balance_due: 150, issue_date: '2026-03-01', created_date: '2026-03-01' }), // voidish → AR excl, usage INCL; c6's newest activity
  inv({ id: 'i11', invoice_number: 'INV-11', customer_id: 'c4', issue_date: '2026-10-15', due_date: '2026-11-01', total: 50, balance_due: 50 }),
];

const PAYMENTS = [
  { id: 'p1', customer_id: 'c1', amount: 500, method: 'check', status: 'recorded', paid_date: '2026-11-05', invoice_id: 'i1' },
  { id: 'p2', customer_id: 'c3', amount: 250, method: 'cash', status: 'recorded', paid_date: '2026-11-02' },
];

const WORK_ORDERS = [
  { id: 'w1', customer_id: 'c1', created_date: '2026-10-10', completed_date: '2026-11-05', completed: true, total: 800 },
];
const OPPORTUNITIES = [
  { id: 'o1', customer_id: 'c3', last_activity_at: '2026-11-01T15:00:00Z' },
];
const ESTIMATES = [
  { id: 'e1', customer_id: 'c1', status: 'sent', quote_total: 5000, sent_at: '2026-10-01', estimate_number: 'EST-1' },
  { id: 'e2', customer_id: 'c1', status: 'approved', quote_total: 3000, work_order_id: 'w1', estimate_number: 'EST-2' },
  { id: 'e3', customer_id: 'c1', status: 'draft', quote_total: 2200, estimate_number: 'EST-3' },
];

// ============================================================================
// A. SCHEMA CONTRACT — Customer.jsonc / Invoice.jsonc fields the models read.
//    Undeclared-but-tolerated fields are needed-but-missing, asserted absent.
// ============================================================================
{
  const stripJsonc = (src) => {
    let out = ''; let inStr = false; let esc = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
      out += ch;
    }
    return out;
  };
  const customerSchema = JSON.parse(stripJsonc(readText('base44/entities/Customer.jsonc')));
  const invoiceSchema = JSON.parse(stripJsonc(readText('base44/entities/Invoice.jsonc')));
  const P = customerSchema.properties;
  const IP = invoiceSchema.properties;

  // Origination + hierarchy fields are declared.
  eq(P.customer_origination?.type, 'string', 'schema: customer_origination string');
  eq(P.origination_path?.type, 'string', 'schema: origination_path string');
  eq(P.master_account?.type, 'string', 'schema: master_account label');
  eq(P.master_account_id?.type, 'string', 'schema: master_account_id link');
  eq(P.merged_into_customer_id?.type, 'string', 'schema: merged stub marker');
  eq(P.legacy_client_names?.type, 'array', 'schema: legacy_client_names dedupe list');

  // Lifecycle storage: enum lacks 'lead' (lifecycle-only state — documented).
  deq(P.customer_status?.enum, ['prospect', 'active', 'inactive'], 'schema: customer_status enum (no lead)');
  eq(P.status?.type, 'string', 'schema: free-string status mirror');
  eq(P.last_contacted_at?.type, 'string', 'schema: last_contacted_at activity stamp');
  eq(P.auto_inactive_months?.type, 'number', 'schema: masterplan months field');
  eq(P.auto_inactive_after_months?.type, 'number', 'schema: entity months field');
  // N-07.3 fixed: 0 now documents fall-through (opt-out is the flag, not 0).
  ok(/falls through/i.test(String(P.auto_inactive_months?.description ?? '')), "schema documents 0 = fall-through for auto_inactive_months");
  ok(/falls through/i.test(String(P.auto_inactive_after_months?.description ?? '')), "schema documents 0 = fall-through for auto_inactive_after_months");

  // N-07 schema gaps FIXED — previously-stored-but-undeclared fields are now
  // declared (the asserts that pinned their absence are flipped to contract).
  eq(P.auto_inactive_disabled?.type, 'boolean', 'DECLARED auto_inactive_disabled — sweep opt-out flag');
  eq(P.lifecycle_status?.type, 'string', 'DECLARED lifecycle_status — denormalized lifecycle mirror');
  eq(P.tax_exempt_issued_by?.type, 'string', 'DECLARED tax_exempt_issued_by — issued-by alias');
  eq(P.tax_exempt_status?.type, 'string', 'DECLARED tax_exempt_status — flat status alias');
  eq(P.tax_exempt_revoked?.type, 'boolean', 'DECLARED tax_exempt_revoked — revoked flag alias');

  // Warning-flag storage contract.
  eq(P.warning_flags?.type, 'array', 'schema: warning_flags array');
  eq(P.warning_flags?.items?.type, 'string', 'schema: warning_flags entries are string keys');
  eq(P.warning_flag_details?.type, 'object', 'schema: warning_flag_details sidecar');

  // Tax-exemption registry object + legacy flats.
  eq(P.tax_exemption?.type, 'object', 'schema: tax_exemption registry object');
  deq(P.tax_exemption?.properties?.status?.enum, ['active', 'expired', 'revoked'], 'schema: exemption status enum');
  for (const f of ['reason', 'certificate_id', 'expires_on', 'issued_by']) {
    eq(P.tax_exemption?.properties?.[f]?.type, 'string', `schema: tax_exemption.${f} string`);
  }
  eq(P.tax_exempt?.type, 'boolean', 'schema: legacy tax_exempt boolean');
  for (const f of ['tax_exempt_id', 'tax_exempt_expires', 'tax_exempt_expiration', 'tax_exempt_reason', 'tax_id_number']) {
    eq(P[f]?.type, 'string', `schema: legacy flat ${f}`);
  }

  // Credit / tier / PO fields.
  eq(P.credit_limit?.type, 'number', 'schema: credit_limit number');
  eq(P.credit_terms_days?.type, 'number', 'schema: credit_terms_days number');
  eq(P.credit_hold?.type, 'boolean', 'schema: credit_hold boolean');
  eq(P.in_store_credit?.type, 'number', 'schema: in_store_credit number');
  eq(P.in_store_credit_balance?.type, 'number', 'schema: in_store_credit_balance number');
  eq(P.pricing_tier?.type, 'number', 'schema: pricing_tier number');
  eq(P.pricing_tier?.default, 1, 'schema: pricing_tier defaults to 1');
  eq(P.po_required?.type, 'boolean', 'schema: po_required boolean');
  eq(P.require_purchase_order?.type, 'boolean', 'schema: require_purchase_order boolean');
  eq(P.po_required_note?.type, 'string', 'schema: po_required_note detail');
  eq(P.customer_type?.type, 'string', 'schema: customer_type string');
  eq(P.company_name && 'company_name' in P, true, 'schema: company_name');
  deq(customerSchema.required, ['company_name'], 'schema: company_name is the only required field');

  // Invoice fields the CRM models consume.
  for (const f of ['status', 'customer_id', 'work_order_id', 'estimate_id', 'total', 'amount_paid', 'balance_due', 'issue_date', 'due_date', 'sent_date', 'paid_date', 'discount_amount', 'tax_amount', 'credit_applied', 'line_items', 'fee_lines']) {
    ok(f in IP, `schema: Invoice.${f} declared`);
  }
}

// ============================================================================
// B. ORIGINATION HIERARCHY — flat label, hierarchical path, parent/child.
// ============================================================================
{
  // FIXED DEFECT N-07.1 — canonical precedence is path-first everywhere:
  // origination_path (structured) wins over the legacy flat label, matching
  // estimateReports. customersByCreatedRows now resolves identically.
  const rows = rep.customersByCreatedRows(CUSTOMERS, {});
  const c1 = rows.find((r) => r.customer_id === 'c1');
  eq(c1.customer_origination, 'Networking Group : BNI - Carl', 'N-07.1 fixed: path wins on customers_by_created');
  const c10 = rows.find((r) => r.customer_id === 'c10');
  eq(c10.customer_origination, 'Networking Group : BNI', 'origination: path still resolves when flat is blank');
  const c2 = rows.find((r) => r.customer_id === 'c2');
  eq(c2.customer_origination, 'networking', 'origination: flat is the fallback when path is blank');
  const c9 = rows.find((r) => r.customer_id === 'c9');
  eq(c9.customer_origination, '', 'origination: neither field → empty');

  // estimateReports.estimateRows resolves identically — packs converged.
  const estRows = estR.estimateRows(ESTIMATES, { customersById: CUSTOMERS, asOf: AS_OF });
  const e1 = estRows.find((r) => r.estimate_id === 'e1');
  eq(
    e1.origination,
    'Networking Group : BNI - Carl',
    'N-07.1 fixed: estimateRows path-first (already canonical)',
  );
  // Estimate-level fields are the trailing fallback chain on the estimate row.
  const estOnly = estR.estimateRows(
    [{ id: 'e9', customer_id: 'c9', status: 'sent', origination: 'walk_in' }],
    { customersById: CUSTOMERS, asOf: AS_OF },
  );
  eq(estOnly[0].origination, 'walk_in', 'origination: estimate field is the last-resort fallback');
  const custPathOnly = estR.estimateRows(
    [{ id: 'e10', customer_id: 'c10', status: 'sent' }],
    { customersById: CUSTOMERS, asOf: AS_OF },
  );
  eq(custPathOnly[0].origination, 'Networking Group : BNI', 'origination: customer path reached through estimate rows');

  // CSV import writes the flat field only — origination_path has no column.
  const originationCol = imp.CUSTOMER_COLUMNS.find((c) => c.key === 'origination');
  eq(originationCol?.field, 'customer_origination', 'import: origination column → flat field');
  eq(
    imp.CUSTOMER_COLUMNS.filter((c) => c.field === 'origination_path' || c.key === 'origination_path').length,
    0,
    'GAP: no CSV import column reaches origination_path — hierarchical path is hand-entry/import-by-other-means only',
  );

  // Parent/child chains: id-ref and name-label spellings land in ONE group.
  const master = rep.masterAccountRows(CUSTOMERS, { asOf: AS_OF, invoices: INVOICES });
  const acme = master.find((r) => r.master_name === 'Acme Sign Co');
  ok(acme, 'master rollup: Acme group exists');
  deq(
    acme.children.map((c) => c.id).sort(),
    ['c2', 'c3'],
    'hierarchy: master_account_id ref + master_account label resolve to the same master',
  );
  const east = master.find((r) => r.master_name === 'Acme East');
  deq(
    east.children.map((c) => c.id),
    ['c4'],
    'hierarchy: single-level only — c4 links to child c2, forming its own group (no transitive fold into c1)',
  );
  const umbrella = master.find((r) => r.master_name === 'Umbrella Corp');
  eq(umbrella.master_id, '', 'hierarchy: unresolvable master label keeps its own group (raw label shown)');
  deq(umbrella.children.map((c) => c.id), ['c9'], 'unresolvable label still groups its children');
  ok(
    !master.some((r) => r.children.some((ch) => ch.id === 'c5')),
    'hierarchy: merged stub never lists as a child even when its master link survives',
  );
  ok(
    !master.some((r) => r.master_id === 'c5'),
    'hierarchy: a master link pointing at a merged stub resolves to no group under c5 (c5 resolves, but no children point there)',
  );
  // The master customer itself is never its own child.
  ok(
    !acme.children.some((ch) => ch.id === 'c1'),
    'hierarchy: master account row never appears as its own child',
  );
}

// ============================================================================
// C. MASTER ROLLUP — children AR aggregates under the master; reconciliations.
// ============================================================================
{
  const master = rep.masterAccountRows(CUSTOMERS, { asOf: AS_OF, invoices: INVOICES });
  const acme = master.find((r) => r.master_name === 'Acme Sign Co');
  eq(acme.customer_count, 2, 'rollup: Acme masters two children');
  eq(acme.customer_names, 'Acme East | Acme West', "rollup: children names join with ' | ' (name-sorted)");
  deq(acme.children, [
    { id: 'c2', name: 'Acme East' },
    { id: 'c3', name: 'Acme West' },
  ], 'rollup: children carry {id,name} sorted by name');
  eq(acme.open_balance_cents, 170000, 'rollup: children open AR = 1200 (c2) + 500 (c3)');
  eq(acme.master_id, 'c1', 'rollup: resolved master id shown');

  // The master's OWN open invoices do NOT enter the rollup — the column is
  // "children AR only" per the model contract (verified vs customer_balance).
  const balances = rep.customerBalanceRows(INVOICES, { asOf: AS_OF, customersById: CUSTOMERS });
  const childIds = new Set(acme.children.map((c) => c.id));
  const childrenAr = balances
    .filter((r) => childIds.has(r.customer_id))
    .reduce((s, r) => s + r.open_balance_cents, 0);
  eq(acme.open_balance_cents, childrenAr, 'rollup: master open_balance ≡ Σ customer_balance over the child set');
  const c1Ar = balances.find((r) => r.customer_id === 'c1').open_balance_cents;
  ok(c1Ar > 0 && acme.open_balance_cents !== childrenAr + c1Ar,
    'rollup: master-row own AR (400) is deliberately outside the children rollup — combined-family view needs c1+c2+c3, not just the group row');
  eq(childrenAr + c1Ar, 210000, 'rollup: family total incl. master row = 1700 + 400');

  // Single-level: c2's group rolls up ITS child c4 only.
  const east = master.find((r) => r.master_name === 'Acme East');
  eq(east.open_balance_cents, 5000, 'rollup: child-of-child AR lands on c2 group, not c1');
  ok(!acme.children.some((ch) => ch.id === 'c4'), 'rollup: grandchild does not surface in the top group');
  eq(master[0].master_name, 'Acme Sign Co', 'rollup: largest child set sorts first');

  // Sorting + totals through the report spec.
  const spec = rep.CUSTOMER_REPORTS_BY_ID.customers_by_master;
  const res = spec.run({ as_of: AS_OF }, { customers: CUSTOMERS, invoices: INVOICES });
  eq(res.rows.find((r) => r.master_name === 'Acme Sign Co').open_balance, 1700, 'spec: cents→dollars at the report boundary');
  const summary = spec.summarize(res.rows);
  eq(summary.totals.customer_count, 4, 'spec totals: children counted across all groups');
  eq(summary.totals.open_balance, 1750, 'spec totals: open balance = 1700 + 50 (c4 under c2) + 0 (umbrella)');

  // GAP — the merged stub's orphan open invoice still reports under the STUB
  // as if it were a live customer. Merge never relinks Invoice rows.
  const stubRow = balances.find((r) => r.customer_id === 'c5');
  eq(
    stubRow?.customer_name,
    'Acme Gulf',
    'KNOWN DEFECT N-07.2 — post-merge orphan AR: i9 (700) still attributes ' +
    'to merged stub c5 in customer_balance (indexById never filters ' +
    'merged_into_customer_id), instead of folding into winner c1 or landing ' +
    'in "(unassigned)". Expected: stub AR rolls under the merge winner or ' +
    'flags as unassigned. Actual: a separate "Acme Gulf" AR row persists.',
  );
  ok(
    !balances.some((r) => r.customer_id === 'c1' && r.open_balance_cents === 40000 + 70000),
    'cross-check: winner c1 does not absorb the stub balance (400 ≠ 1100)',
  );

  // customerAnalytics has no family/master concept — per-customer only (gap).
  const a1 = ana.customerAnalytics({ invoices: INVOICES.filter((i) => i.customer_id === 'c1'), workOrders: WORK_ORDERS, estimates: ESTIMATES }, { now: NOW_ISO });
  eq(a1.lifetime.invoiced_cents, 200000, 'analytics: c1 posted totals = 1000 + 500 + 500 (draft excl; post-as-of sent bill STILL posts — analytics has no as-of gate)');
  eq(a1.lifetime.paid_cents, 60000, 'analytics: stamped amount_paid wins (i1 100 + i2 500 — not the 600 balance-snapshot derivation)');
  eq(a1.lifetime.open_balance_cents, 90000, 'analytics: open balance = posted balance_due (400 + 500 future bill)');
  ok(!('master' in a1) && !('family' in a1) && !('household' in a1),
    'GAP: analytics carries no household/family rollup block — master-account aggregation exists only in customers_by_master');
  const a2 = ana.customerAnalytics({ invoices: INVOICES.filter((i) => i.customer_id === 'c2') }, { now: NOW_ISO });
  eq(a2.lifetime.invoiced_cents, 120000, 'analytics: child rows aggregate independently (c2 = its own 1200)');
}

// ============================================================================
// D. AUTO-INACTIVE — thresholds, verdicts, sweep plan, function wiring.
// ============================================================================
{
  deq([...lc.LIFECYCLE_STATUSES], ['Lead', 'Prospect', 'Active', 'Inactive'], 'lifecycle vocabulary');
  eq(lc.normalizeLifecycle('ACTIVE'), 'Active');
  eq(lc.normalizeLifecycle('garbage'), 'Lead', 'unrecognized → Lead');
  eq(lc.customerLifecycleStatus({ customer_status: 'inactive' }), 'Inactive');
  eq(lc.customerLifecycleStatus({ status: 'prospect' }), 'Prospect', 'free-string status alias');
  eq(lc.customerLifecycleStatus({ lifecycle_status: 'Active' }), 'Active', 'denormalized alias');

  // Window resolution: masterplan field → entity field → default.
  eq(lc.resolveAutoInactiveMonths({ auto_inactive_months: 6 }, 12), 6, 'per-customer masterplan field wins');
  eq(lc.resolveAutoInactiveMonths({ auto_inactive_after_months: 18 }, 12), 18, 'entity field wins when masterplan absent');
  eq(lc.resolveAutoInactiveMonths({ auto_inactive_months: 6, auto_inactive_after_months: 18 }, 12), 6, 'masterplan field beats entity field');
  eq(
    lc.resolveAutoInactiveMonths({ auto_inactive_months: 0, auto_inactive_after_months: 18 }, 12),
    12,
    'subtlety: explicit 0 in the FIRST field is a finite value that falls ' +
    'through to the default — it does NOT fall through to the second field',
  );
  eq(lc.resolveAutoInactiveMonths({}, 12), 12, 'absent → shop default');
  eq(lc.resolveAutoInactiveMonths({}, 0), 0, 'no window → automation off');
  eq(lc.resolveAutoInactiveMonths({ auto_inactive_months: -3 }, 7), 7, 'non-positive falls to default');
  eq(lc.resolveAutoInactiveMonths({ auto_inactive_months: '9' }, 3), 9, 'loose number parses');

  // monthsAgo clamping + fail-closed.
  eq(lc.monthsAgo('2026-01-31T12:00:00Z', 1).toISOString().slice(0, 10), '2025-12-31', 'month-end clamp (Jan 31 − 1mo)');
  eq(lc.monthsAgo('2026-03-31T12:00:00Z', 1).toISOString().slice(0, 10), '2026-02-28', 'non-leap Feb clamp');
  eq(lc.monthsAgo('not-a-date', 3), null, 'unparseable now → null');
  eq(lc.monthsAgo('2026-11-15T00:00:00Z', -5).toISOString().slice(0, 10), '2026-11-15', 'negative months floor at 0');

  // shouldAutoInactivate reason ladder.
  deq(lc.shouldAutoInactivate({ customer: { auto_inactive_disabled: true }, lastActivity: '2020-01-01', now: NOW_ISO, defaultMonths: 6 }),
    { inactivate: false, months: 0, reason: 'auto_inactive_disabled' }, 'disabled flag short-circuits');
  deq(lc.shouldAutoInactivate({ customer: {}, lastActivity: '2020-01-01', now: NOW_ISO, defaultMonths: 0 }),
    { inactivate: false, months: 0, reason: 'no_window' }, 'no resolved window → off');
  const noAct = lc.shouldAutoInactivate({ customer: { auto_inactive_months: 6 }, lastActivity: null, now: NOW_ISO, defaultMonths: 0 });
  eq(noAct.reason, 'no_activity', 'no parseable activity → never auto-inactivated');
  eq(noAct.inactivate, false);
  const within = lc.shouldAutoInactivate({ customer: { auto_inactive_months: 6 }, lastActivity: '2026-11-01T00:00:00Z', now: NOW_ISO });
  eq(within.reason, 'within_window');
  eq(within.inactivate, false);
  // Boundary is INCLUSIVE: last activity at exactly the cutoff inactivates.
  // (monthsAgo runs in LOCAL time — derive the cutoff from the model itself
  // so the boundary test is TZ/DST-proof.)
  const cutoffIso = lc.monthsAgo(NOW_ISO, 6).toISOString();
  const edge = lc.shouldAutoInactivate({ customer: { auto_inactive_months: 6 }, lastActivity: cutoffIso, now: NOW_ISO });
  eq(edge.inactivate, true, 'activity exactly at the cutoff is past the window (inclusive boundary)');
  eq(edge.reason, 'past_inactivity_window');
  eq(edge.months, 6);
  const edgeIn = lc.shouldAutoInactivate({ customer: { auto_inactive_months: 6 }, lastActivity: new Date(Date.parse(cutoffIso) + 1000).toISOString(), now: NOW_ISO });
  eq(edgeIn.inactivate, false, 'one second inside the cutoff stays active');

  // Activity hits: work-order/invoice/opportunity/customer fields, newest-first.
  // (i8's future issue_date is real activity — it beats last_contacted.)
  const hits = lc.activityHits({
    customer: CUSTOMERS[0],
    workOrders: WORK_ORDERS,
    invoices: INVOICES.filter((i) => i.customer_id === 'c1'),
    opportunities: [],
  });
  eq(hits[0].id, 'i8', 'newest hit = the future-dated invoice issue');
  eq(hits[0].kind, 'invoice');
  eq(hits[0].field, 'issue_date');
  const hitsNoFuture = lc.activityHits({
    customer: CUSTOMERS[0],
    workOrders: WORK_ORDERS,
    invoices: INVOICES.filter((i) => i.customer_id === 'c1' && i.id !== 'i8'),
    opportunities: [],
  });
  eq(hitsNoFuture[0].at, '2026-11-12T09:00:00.000Z', 'without the future bill: newest hit = customer last_contacted_at');
  eq(hitsNoFuture[0].kind, 'customer');
  eq(hitsNoFuture[0].field, 'last_contacted_at');
  ok(hits.some((h) => h.kind === 'work_order' && h.field === 'completed_date'), 'WO completion counts as activity');
  ok(hits.some((h) => h.kind === 'invoice' && h.field === 'issue_date'), 'invoice issue counts as activity');
  const summary = lc.lastActivitySummary({ customer: CUSTOMERS[0], workOrders: WORK_ORDERS });
  eq(summary.last_activity_at, '2026-11-12T09:00:00.000Z');
  eq(summary.winner.kind, 'customer');
  eq(summary.sources.work_order.field, 'completed_date', 'per-kind newest hit reported');

  // activityMapByCustomerId — customer + linked rows fold under customer_id.
  const map = lc.activityMapByCustomerId({
    customers: CUSTOMERS,
    workOrders: WORK_ORDERS,
    invoices: INVOICES,
    opportunities: OPPORTUNITIES,
  });
  ok(map.c6 > 0 && new Date(map.c6).toISOString().slice(0, 10) === '2026-03-01', 'c6 newest activity = i10 created 2026-03-01');
  ok(map.c3 > 0, 'opportunity activity folds under c3');
  ok(!('' in map), 'rows without customer_id fold nowhere');

  // sweepPlan — Active-only, stub-skip, opt-out, per-customer window.
  const plan = lc.sweepPlan(CUSTOMERS, {
    activityById: map,
    now: NOW_ISO,
    defaultMonths: 12,
  });
  const planIds = plan.map((p) => p.customer_id);
  deq(planIds.sort(), ['c6', 'c8'], 'sweep: exactly the stale-window actives are planned');
  const c6Plan = plan.find((p) => p.customer_id === 'c6');
  eq(c6Plan.reason, 'past_inactivity_window');
  eq(c6Plan.months, 6, 'sweep: per-customer 6-month window used, not the 12-month default');
  eq(c6Plan.from_status, 'Active');
  eq(c6Plan.last_activity_at.slice(0, 10), '2026-03-01', 'sweep: plan carries the last-activity day');
  ok(!planIds.includes('c3'), 'sweep: prospect never transitions (Active-only)');
  ok(!planIds.includes('c5'), 'sweep: merged stub skipped even when still marked active');
  ok(!planIds.includes('c7'), 'sweep: auto_inactive_disabled shields despite ancient activity');
  ok(!planIds.includes('c9'), 'sweep: zero parseable activity → no_activity, not swept');
  const c8Plan = plan.find((p) => p.customer_id === 'c8');
  eq(c8Plan.months, 12, 'sweep: default window applied to c8');
  eq(
    c8Plan.reason,
    'past_inactivity_window',
    'KNOWN DEFECT N-07.3 — schema-vs-model contract: Customer.jsonc ' +
    'documents auto_inactive_months/auto_inactive_after_months "0 disables ' +
    'the automation", but resolveAutoInactiveMonths treats 0 as "no ' +
    'per-customer window" and falls through to the shop default — a customer ' +
    'disabled via 0 is still swept whenever a default is configured. ' +
    'Expected: explicit 0 → automation off for that customer. Actual: 0 → ' +
    'default window (opt-out requires the undeclared auto_inactive_disabled flag).',
  );
  // Dry-run determinism: same inputs → identical plan (no clock, no random).
  deq(
    lc.sweepPlan(CUSTOMERS, { activityById: map, now: NOW_ISO, defaultMonths: 12 }),
    plan,
    'sweep plan is deterministic',
  );
  // activityById override beats the customer's own dates.
  const override = lc.sweepPlan(
    [{ id: 'x1', customer_status: 'active', created_date: '2020-01-01' }],
    { activityById: { x1: Date.parse('2026-11-14T00:00:00Z') }, now: NOW_ISO, defaultMonths: 1 },
  );
  eq(override.length, 0, 'sweep: provided activity map wins over stale customer row dates');

  // Function wiring (static): admin gate, inactive write, projection fields.
  const fnSrc = readText('base44/functions/manageCustomerLifecycle/entry.ts');
  ok(fnSrc.includes("action === 'sweep_auto_inactive'"), 'fn: sweep action exists');
  ok(fnSrc.includes("action === 'get_lifecycle'"), 'fn: get_lifecycle action exists');
  ok(/!dryRun && !isAdmin\(user\)/.test(fnSrc), 'fn: non-dry-run sweep is admin-gated');
  ok(fnSrc.includes("{ customer_status: 'inactive' }"), 'fn: sweep writes customer_status inactive (lowercase stored enum)');
  ok(fnSrc.includes("'auto_inactive_disabled'"), 'fn: projected fields include the undeclared opt-out flag');
  ok(fnSrc.includes('sweepPlan') && fnSrc.includes('activityMapByCustomerId'), 'fn: uses the canonical shared rules');
  ok(fnSrc.includes('merged_into_customer_id'), 'fn: stub awareness in evaluated_active count');
}

// ============================================================================
// E. CREDIT LIMIT — usage parity, limit ladder, hold + PO flags, patch writes.
// ============================================================================
{
  // creditUsage parity: shared cents replica ≡ frontend dollar model ×100.
  // Usage counts drafts + post-as-of bills + 'refunded' rows — credit
  // exposure, not billed AR (intentional divergence, documented in source).
  const usageC1 = rep.creditUsageCents('c1', INVOICES);
  eq(usageC1, 189900, 'usage: c1 = 400 (open) + 999 (draft) + 500 (post-as-of)');
  const ct1 = ct.creditUsage({ customer: { id: 'c1' }, invoices: INVOICES });
  eq(usageC1, Math.round(ct1.openInvoiceBalance * 100), 'usage parity: shared replica ≡ creditTermsModel.creditUsage ×100');
  eq(ct1.totalUsage, ct1.openInvoiceBalance, 'usage: no portalPending supplied → totalUsage = openInvoiceBalance');
  eq(rep.creditUsageCents('c2', INVOICES), 120000, 'usage: void i7 excluded');
  eq(rep.creditUsageCents('c6', INVOICES), 45000, "usage: 'refunded' i10 counts (not void/paid) — exposure not AR");
  eq(rep.creditUsageCents('zzz', INVOICES), 0, 'usage: unknown customer → 0');
  eq(rep.creditUsageCents('', INVOICES), 0, 'usage: blank id → 0 (fail closed)');

  // Usage ladder — creditTermsUsageRows.
  const usageRows = rep.creditTermsUsageRows(CUSTOMERS, INVOICES, { includeAll: true });
  const byId = Object.fromEntries(usageRows.map((r) => [r.customer_id, r]));
  eq(byId.c2.status, 'exceeded', 'ladder: 1200 used > 1000 limit');
  eq(byId.c2.available_cents, 0, 'available floors at 0 when exceeded');
  eq(byId.c2.usage_pct, 1.2, 'usage_pct can exceed 1');
  eq(byId.c3.status, 'at_limit', 'ladder: 500 used == 500 limit');
  eq(byId.c3.available_cents, 0);
  eq(byId.c1.status, 'within_limit', 'ladder: 1899 < 5000');
  eq(byId.c1.available_cents, 310100);
  eq(byId.c6.status, 'no_limit', 'ladder: 0/absent limit never warns');
  eq(byId.c6.available_cents, null);
  eq(byId.c6.usage_pct, null);
  eq(byId.c1.terms, 'Net 30', 'stored terms text wins');
  eq(byId.c6.terms, 'Due on receipt', 'no terms → Due on receipt label');
  ok(!('c5' in byId), 'merged stub excluded from credit usage report');
  eq(usageRows[0].customer_id, 'c2', 'sort: highest usage_pct first');

  // Frontend limit check ladder (the model the pack mirrors).
  const chk = (usage, newAmount, limit = 1000) => ct.creditLimitCheck({ customer: { credit_limit: limit }, usage, newAmount });
  eq(chk(500, 200).severity, 'ok', 'check: under limit');
  eq(chk(800, 200).severity, 'ok', 'check: landing projected ON the limit is ok (exceeded is strict >)');
  eq(chk(1200, 0).severity, 'exceeded', 'check: already over → exceeded');
  eq(chk(800, 300).severity, 'exceeded', 'check: projection over → exceeded');
  eq(chk(1000, 0).severity, 'warn', 'check: at limit pre-amount → warn');
  eq(chk(500, 0, 0).severity, 'ok', 'check: unconfigured limit → ok');
  eq(chk(1200, 0).over, true);
  // Ladder parity at zero new amount: 'at_limit' ≡ 'warn', 'exceeded' ≡ 'exceeded'.
  for (const r of usageRows) {
    const check = ct.creditLimitCheck({ customer: { credit_limit: r.credit_limit_cents / 100 }, usage: r.used_cents / 100, newAmount: 0 });
    const want = r.status === 'at_limit' ? 'warn' : r.status === 'exceeded' ? 'exceeded' : 'ok';
    eq(check.severity, want, `ladder parity ${r.customer_id}: report status ${r.status} ≡ check ${want}`);
  }
  eq(ct.creditLimitBanner(chk(1200, 0)).tone, 'red', 'banner: exceeded → red');
  eq(ct.creditLimitBanner(chk(1000, 0)).tone, 'amber', 'banner: warn → amber');
  eq(ct.creditLimitBanner(chk(500, 0)).show, false, 'banner: ok → hidden');
  ok(ct.creditLimitBanner(chk(1200, 0)).text.includes('warning only'), 'banner text is warn-only, never blocks');

  // applyInStoreCredit — clamped application.
  deq(ct.applyInStoreCredit({ customer: { in_store_credit_balance: 125.5 }, amount: 100 }), { applied: 100, remainingCredit: 25.5, remainingAmount: 0 }, 'credit apply: under balance');
  deq(ct.applyInStoreCredit({ customer: { in_store_credit_balance: 125.5 }, amount: 200 }), { applied: 125.5, remainingCredit: 0, remainingAmount: 74.5 }, 'credit apply: clamps at balance');
  eq(ct.applyInStoreCredit({ customer: { in_store_credit: 60 }, amount: 10 }).applied, 10, 'credit apply: in_store_credit alias');
  eq(ct.applyInStoreCredit({ customer: {}, amount: 10 }).applied, 0, 'credit apply: no stored credit → 0');

  // Warning-flag derivation — credit_hold.
  const holdCust = { id: 'cx', company_name: 'Hold Co', credit_hold: true };
  const dHold = warn.derivedWarningFlags(holdCust, { asOf: AS_OF });
  eq(dHold.length, 1);
  eq(dHold[0].flag, 'credit_hold', 'derived: schema credit_hold flag');
  eq(dHold[0].tone, 'red');
  eq(dHold[0].source, 'derived');
  const dTerms = warn.derivedWarningFlags({ id: 'cx' }, { creditTerms: { status: 'on_hold', note: 'NSF check' }, asOf: AS_OF });
  eq(dTerms[0].flag, 'credit_hold', 'derived: credit-terms status hold');
  eq(dTerms[0].detail, 'NSF check', 'terms note becomes the badge detail');
  eq(warn.derivedWarningFlags({ id: 'cx' }, { terms: 'hold' })[0].flag, 'credit_hold', 'ctx.terms alias + bare status string');
  eq(warn.derivedWarningFlags({ id: 'cx', credit_hold: false }, { creditTerms: { status: 'active' }, asOf: AS_OF }).length, 0, 'no hold signals → no credit_hold');

  // Warning-flag derivation — past_due (open-AR replication).
  const dueCust = { id: 'c2' };
  const dPast = warn.derivedWarningFlags(dueCust, { invoices: INVOICES, asOf: AS_OF });
  eq(dPast.filter((b) => b.flag === 'past_due').length, 0, 'past_due: c2 invoice due 2026-11-20 is NOT past due at as-of');
  const dPast1 = warn.derivedWarningFlags({ id: 'c1' }, { invoices: INVOICES, asOf: AS_OF });
  const pd1 = dPast1.find((b) => b.flag === 'past_due');
  ok(pd1, 'past_due: c1 i1 due 2026-10-31 is past due');
  ok(pd1.detail.includes('1 open invoice past due'), 'past_due detail counts invoices');
  ok(pd1.detail.includes('$400.00'), 'past_due detail carries the total');
  ok(pd1.detail.includes('oldest due 2026-10-31'), 'past_due detail carries oldest due day');
  eq(
    warn.derivedWarningFlags({ company_name: 'No Id' }, { invoices: INVOICES, asOf: AS_OF }).filter((b) => b.flag === 'past_due').length,
    0,
    'past_due: blank customer id never attributes (fail closed)',
  );
  // Boundary: due exactly at as-of is NOT past due (strictly-before rule).
  const edgeDue = warn.derivedWarningFlags({ id: 'c9' }, { invoices: [{ customer_id: 'c9', status: 'sent', issue_date: '2026-10-01', due_date: AS_OF, total: 10, balance_due: 10 }], asOf: AS_OF });
  eq(edgeDue.filter((b) => b.flag === 'past_due').length, 0, 'past_due: due on the as-of day is inside terms');

  // requires_po derivation + stored-wins alias dedupe.
  const dPo = warn.derivedWarningFlags({ id: 'cx', po_required: true, po_required_note: 'PO on all orders' }, { asOf: AS_OF });
  eq(dPo[0].flag, 'requires_po');
  eq(dPo[0].detail, 'PO on all orders');
  eq(warn.derivedWarningFlags({ id: 'cx', require_purchase_order: true }, { asOf: AS_OF })[0].flag, 'requires_po', 'parallel field derives the same flag');
  const merged = warn.autoWarningFlags(
    { id: 'cx', warning_flags: ['po_required'], po_required: true },
    { asOf: AS_OF },
  );
  eq(merged.length, 1, 'stored po_required alias suppresses the derived requires_po twin');
  eq(merged[0].source, 'stored');
  eq(merged[0].flag, 'requires_po', 'alias normalizes to the canonical key');

  // setFlagPatch — add/remove/sidecar/throws.
  const base = { warning_flags: ['vip'], warning_flag_details: {} };
  const add = warn.setFlagPatch(base, 'credit_hold', { actor_id: 'admin@x', now: NOW_ISO, note: 'NSF' });
  deq(add.warning_flags, ['vip', 'credit_hold'], 'patch: appends canonical key');
  eq(add.warning_flag_details.credit_hold.note, 'NSF');
  eq(add.warning_flag_details.credit_hold.set_by, 'admin@x');
  eq(add.warning_flag_details.credit_hold.set_at, NOW_ISO);
  const again = warn.setFlagPatch({ ...base, warning_flags: ['credit_hold'] }, 'on_credit_hold', { now: NOW_ISO });
  deq(again.warning_flags, ['credit_hold'], 'patch: alias dedupe — no double append');
  const rem = warn.setFlagPatch({ warning_flags: ['credit_hold', 'vip'], warning_flag_details: { credit_hold: { note: 'x' } } }, 'credit_hold', { on: false });
  deq(rem.warning_flags, ['vip'], 'patch: remove drops the flag');
  eq('credit_hold' in rem.warning_flag_details, false, 'patch: remove drops the sidecar slot');
  thr(() => warn.setFlagPatch(base, ''), 'patch: blank flag throws');
  thr(() => warn.setFlagPatch(base, {}), 'patch: object with no key fields throws');
  const summary = warn.flagSummary(warn.autoWarningFlags({ id: 'cx', credit_hold: true, warning_flags: ['vip'] }, { asOf: AS_OF }));
  eq(summary.count, 2);
  eq(summary.highest_tone, 'red', 'flagSummary: worst tone wins (credit_hold red > vip emerald)');
  deq(warn.flagSummary([]), { count: 0, highest_tone: null }, 'flagSummary: empty → null tone');
}

// ============================================================================
// F. TAX-EXEMPT EXPIRY — registry ladder, grace window, replica parity,
//    report sort, warning-flag surface, per-state gap.
// ============================================================================
{
  // Replica parity: shared customerTaxExemption ≡ frontend taxExemption on
  // every well-formed fixture row.
  for (const c of CUSTOMERS) {
    const shared = rep.customerTaxExemption(c, { asOf: AS_OF });
    const fe = tex.taxExemption(c, { now: '2026-11-15T12:00:00Z' });
    eq(shared.status, fe.status, `parity ${c.id}: status ${shared.status}`);
    eq(shared.days_until_expiry, fe.days_until_expiry, `parity ${c.id}: days_until_expiry`);
    eq(shared.record?.perpetual ?? null, fe.record?.perpetual ?? null, `parity ${c.id}: perpetual`);
  }
  const c1 = rep.customerTaxExemption(CUSTOMERS[0], { asOf: AS_OF });
  eq(c1.status, 'active');
  eq(c1.days_until_expiry, 77, 'Nov 15 → Jan 31 = 77 days');
  eq(c1.record.certificate_id, 'OH-99');
  eq(c1.record.source, 'tax_exemption');
  const c2 = rep.customerTaxExemption(CUSTOMERS[1], { asOf: AS_OF });
  eq(c2.status, 'expired', 'legacy flat expiry in the past');
  eq(c2.days_until_expiry, -45, 'negative days when expired');
  eq(c2.record.source, 'legacy', 'flat-only record reports legacy source');
  const c3 = rep.customerTaxExemption(CUSTOMERS[2], { asOf: AS_OF });
  eq(c3.status, 'revoked', 'revoked beats a FUTURE expiry');
  const none = rep.customerTaxExemption(CUSTOMERS[7], { asOf: AS_OF });
  eq(none.status, 'none');
  eq(none.record, null);
  // Boundary: valid THROUGH expires_on — expiry today is still active.
  const edgeCert = { tax_exemption: { certificate_id: 'X', expires_on: AS_OF } };
  eq(rep.customerTaxExemption(edgeCert, { asOf: AS_OF }).status, 'active', 'cert valid through its expires_on day');
  eq(rep.customerTaxExemption({ tax_exemption: { certificate_id: 'X', expires_on: '2026-11-14' } }, { asOf: AS_OF }).status, 'expired', 'expired the day after expires_on');
  // Perpetual: no expiry date → active, null days.
  const perp = rep.customerTaxExemption({ tax_exempt: true }, { asOf: AS_OF });
  eq(perp.status, 'active');
  eq(perp.record.perpetual, true);
  eq(perp.days_until_expiry, null);

  // FIXED DEFECT N-07.4 — malformed rollover-date expiry now converges:
  // non-empty-but-unparseable expires_on fails CLOSED to 'expired' on the
  // frontend (was: perpetual active — granted exemption on garbage data),
  // matching the reports side's expired verdict. Blank stays perpetual.
  const badCert = { tax_exemption: { certificate_id: 'B', expires_on: '2026-02-31' } };
  const feBad = tex.taxExemption(badCert, { now: '2026-11-15T12:00:00Z' });
  const shBad = rep.customerTaxExemption(badCert, { asOf: AS_OF });
  eq(feBad.status, 'expired', 'N-07.4 fixed: malformed expiry → expired, not perpetual');
  eq(feBad.record.malformed_expiry, true, 'N-07.4 fixed: record flags malformed_expiry');
  eq(feBad.record.perpetual, false, 'N-07.4 fixed: malformed is NOT perpetual');
  eq(shBad.status, 'expired', 'reports side already said expired — now converged');

  // Grace window — expiring ≤30 days warns, expired errors, >30 silent.
  eq(tex.EXEMPTION_EXPIRING_DAYS, 30, 'grace window constant');
  const expiredWarn = tex.estimateTaxWarning({ customer: CUSTOMERS[1], now: '2026-11-15T12:00:00Z' });
  eq(expiredWarn.code, 'exemption_expired', 'expired cert → estimate warning');
  ok(expiredWarn.message.includes('2026-10-01'), 'warning names the expiry');
  ok(expiredWarn.message.includes('applying tax'), 'warning says tax is applied');
  const soonCert = { tax_exemption: { certificate_id: 'S', expires_on: '2026-12-15' } };
  const soonWarn = tex.estimateTaxWarning({ customer: soonCert, now: '2026-11-15T12:00:00Z' });
  eq(soonWarn.code, 'exemption_expiring', 'expiry within the 30-day grace window warns');
  ok(soonWarn.message.includes('30 days'), 'expiring warning counts down');
  const day0 = tex.estimateTaxWarning({ customer: { tax_exemption: { expires_on: '2026-11-15' } }, now: '2026-11-15T12:00:00Z' });
  eq(day0.code, 'exemption_expiring');
  ok(day0.message.includes('expires today'), 'day-0 message');
  eq(tex.estimateTaxWarning({ customer: { tax_exemption: { expires_on: '2026-12-16' } }, now: '2026-11-15T12:00:00Z' }), null, 'day-31 is outside the window → silent');
  eq(tex.estimateTaxWarning({ customer: CUSTOMERS[2], now: '2026-11-15T12:00:00Z' }), null, 'revoked → no expiring warning (dead record)');
  eq(tex.estimateTaxWarning({ customer: { tax_exempt: true }, now: '2026-11-15T12:00:00Z' }), null, 'perpetual never warns');

  // Taxability ladder.
  deq(tex.taxableEstimate({ customer: CUSTOMERS[0], now: '2026-11-15T12:00:00Z' }), { taxable: false, reason: 'exempt_active' }, 'active cert → not taxed');
  deq(tex.taxableEstimate({ customer: CUSTOMERS[1], now: '2026-11-15T12:00:00Z' }), { taxable: true, reason: 'exemption_expired' }, 'expired → taxed normally');
  deq(tex.taxableEstimate({ customer: CUSTOMERS[2], now: '2026-11-15T12:00:00Z' }), { taxable: true, reason: 'exemption_revoked' }, 'revoked → taxed normally');
  deq(tex.taxableEstimate({ customer: CUSTOMERS[7], now: '2026-11-15T12:00:00Z' }), { taxable: true, reason: 'no_exemption' }, 'no record → taxed');

  // Report rows — registry lists every record holder, sorted expiry asc,
  // perpetual last.
  const rows = rep.taxExemptionRows(CUSTOMERS, { asOf: AS_OF });
  deq(rows.map((r) => r.customer_id), ['c2', 'c1', 'c3'], 'exemption rows: soonest expiry first (revoked dated sorts by its stored expiry)');
  eq(rows.find((r) => r.customer_id === 'c2').status, 'expired');
  eq(rows.find((r) => r.customer_id === 'c3').status, 'revoked');
  eq(rows.length, 3, 'only record holders list');
  const perpRows = rep.taxExemptionRows([{ id: 'p1', company_name: 'Perp', tax_exempt: true }], { asOf: AS_OF });
  eq(perpRows[0].perpetual, true);
  eq(perpRows[0].expires_on, '', 'perpetual rows carry blank expiry');

  // GAP — per-state handling is NOT modeled: issued_by is a free string and
  // nothing keys expiry/grace rules per issuing state.
  ok(
    !rep.taxExemptionRows(CUSTOMERS, { asOf: AS_OF }).some((r) => 'state' in r || 'jurisdiction' in r),
    'GAP: no per-state certificate handling — issued_by is free text, no state-keyed grace periods exist',
  );

  // The expired cert produces NO derived warning flag — the 'tax_expired'
  // registry kind is stored-flag only (gap, documented: derived set is
  // exactly past_due/credit_hold/requires_po).
  const derived = warn.derivedWarningFlags(CUSTOMERS[1], { asOf: AS_OF });
  eq(
    derived.filter((b) => b.flag === 'tax_expired').length,
    0,
    'GAP: expired certificate derives no tax_expired badge — flagging relies ' +
    'on a stored flag or the estimate-time estimateTaxWarning path',
  );
  // …but a stored tax_expired flag renders via the registry.
  const storedFlag = warn.warningBadges({ warning_flags: ['tax_expired'], warning_flag_details: { tax_expired: { note: 'cert lapsed 10/01' } } });
  eq(storedFlag[0].label, 'Tax exemption expired');
  eq(storedFlag[0].tone, 'amber');
  eq(storedFlag[0].detail, 'cert lapsed 10/01', 'sidecar note surfaces');
  eq(warn.isKnownFlag('tax_exempt_expired'), true, 'alias folds onto the registry kind');
  eq(warn.WARNING_TONES.tax_exempt_verify, 'amber');
}

// ============================================================================
// G. TIER — assignment resolution + schema-typed storage (brief mentions
//    customerTierModel alongside credit checks).
// ============================================================================
{
  eq(tier.resolveCustomerTier({ pricing_tier: 2 }), '2', 'numeric stored tier resolves to its key');
  eq(tier.resolveCustomerTier({ pricing_tier: 'wholesale' }), 'wholesale', 'named tier');
  eq(tier.resolveCustomerTier({}), 'retail', 'no tier → retail hard default');
  const info = tier.resolveCustomerTierInfo({ pricing_tier: 0 });
  eq(info.tier, 'retail', 'pricing_tier 0 is outside 1-8 → skipped → default');
  eq(info.unknown, true, 'out-of-range tier flagged, not silently honored');
  deq(info.unknown_tiers, ['0']);
  eq(info.source, 'hard_default');
  const unk = tier.resolveCustomerTierInfo({ pricing_tier: 'bogus', tier: 3 });
  eq(unk.tier, '3', 'unknown primary field skipped, valid secondary wins');
  deq(unk.unknown_tiers, ['bogus']);
  eq(tier.isKnownTier(8), true, 'upper bound known');
  eq(tier.isKnownTier(9), false, 'tier 9 out of range');
  eq(tier.isKnownTier('vip'), true, 'canonical named tier');
  const patch = tier.tierAssignmentPatch({}, 4, { actor_id: 'ops@x', now: NOW_ISO });
  eq(patch.pricing_tier, 4, 'assignment writes a NUMBER (schema type)');
  eq(patch.pricing_tier_set_by, 'ops@x');
  eq(patch.pricing_tier_set_at, NOW_ISO);
  const namedPatch = tier.tierAssignmentPatch({}, 'wholesale', { now: NOW_ISO });
  eq(namedPatch.pricing_tier, 'wholesale', 'named assignment writes the key string');
  thr(() => tier.tierAssignmentPatch({}, 0), 'assignment rejects out-of-range');
  thr(() => tier.tierAssignmentPatch({}, 'platinum'), 'assignment rejects unknown name');
  eq(tier.effectiveTierForQuote({ pricing_tier: 2 }, { estimate: { pricing_tier: 5 } }), '5', 'estimate override beats customer tier');
  eq(tier.effectiveTierForQuote({ pricing_tier: 2 }, { estimate: {} }), '2', 'blank estimate falls to customer');
  eq(tier.tierLabel(2), 'Tier 2', 'numeric label without a catalog');
  eq(tier.tierLabel('vip'), 'VIP', 'named label override');
}

// ============================================================================
// H. MERGE SWEEP — import dedupe keys, stub semantics, relink list, CAS.
// ============================================================================
{
  // matchCustomer precedence — email-hit > name-hit > multi-way → skip.
  const existing = [
    { id: 'x1', company_name: 'Acme Sign Co', contact_email: 'alice@acme.com' },
    { id: 'x2', company_name: 'Beta Works', billing_contact_email: 'ap@beta.com' },
    { id: 'x3', company_name: 'Beta Works' }, // same name as x2 → name-multi
    { id: 'x4', company_name: 'Other Co', additional_contacts: [{ email: 'extra@acme.com' }], legacy_client_names: ['ACME SIGN'] },
  ];
  const canon = (obj) => imp.canonicalizeCustomerRow({ row: 2, ...obj });
  eq(imp.matchCustomer(canon({ company_name: 'Nobody', email: 'alice@acme.com' }), existing).action, 'merge', 'dedupe: exact email on ONE customer → merge');
  eq(imp.matchCustomer(canon({ company_name: 'Acme Sign Co' }), existing).action, 'merge', 'dedupe: company-name-only single hit → merge');
  eq(
    imp.matchCustomer(canon({ company_name: 'New Co', email: 'ap@beta.com' }), existing).action,
    'merge',
    'dedupe: email found in billing_contact_email still hits',
  );
  eq(
    imp.matchCustomer(canon({ company_name: 'New Co', email: 'extra@acme.com' }), existing).action,
    'merge',
    'dedupe: additional_contacts[].email participates',
  );
  const conflict = imp.matchCustomer(canon({ company_name: 'Beta Works', email: 'alice@acme.com' }), existing);
  eq(conflict.action, 'skip', 'dedupe: email→x1 and name→x2/x3 different customers → ambiguous skip');
  eq(conflict.ambiguous, true);
  const nameMulti = imp.matchCustomer(canon({ company_name: 'Beta Works' }), existing);
  eq(nameMulti.action, 'skip', 'dedupe: name-only multi-hit → ambiguous skip');
  eq(nameMulti.ambiguous, true);
  const emailMulti = imp.matchCustomer(canon({ company_name: 'Z', email: 'multi@x.com' }), [
    { id: 'm1', company_name: 'M1', contact_email: 'multi@x.com' },
    { id: 'm2', company_name: 'M2', contact_email: 'multi@x.com' },
  ]);
  eq(emailMulti.action, 'skip', 'dedupe: email multi-hit → ambiguous skip');
  eq(imp.matchCustomer(canon({ company_name: 'ACME SIGN' }), existing).action, 'merge', 'dedupe: legacy_client_names fold into name matching');
  eq(imp.matchCustomer(canon({ company_name: 'Brand New LLC', email: 'new@x.com' }), existing).action, 'create', 'dedupe: no hit → create');
  // Normalization semantics behind dedupe.
  eq(imp.normalizeCompanyName('Acme & Co.'), 'acme and co', 'company key: &→and, punctuation→space');
  eq(imp.normalizeEmail('  Alice@ACME.com '), 'alice@acme.com', 'email key: trim+lowercase');

  // rowsToCustomerPatches — in-file folding + real-match precedence.
  const file = [
    { row: 2, company_name: 'File Co', contact_name: 'Alice File', email: 'alice@file.com', phone: '513-555-1' },
    { row: 3, company_name: 'File Co', contact_name: 'Bob File', email: 'bob@file.com' },
    { row: 4, company_name: 'File Co', contact_name: 'Alice File', email: 'alice@file.com' }, // exact in-file dup
    { row: 5, company_name: 'Acme Sign Co', contact_name: 'Pat', email: 'pat@acme.test' },   // existing email hit (x4 additional? no — new row email vs existing x1 alice? craft below)
  ];
  const plan = imp.rowsToCustomerPatches(file, { existingCustomers: existing, now: '2026-11-20T00:00:00Z' });
  eq(plan[0].action, 'create', 'row2 creates');
  eq(plan[0].key, `custimp:file-co:alice@file.com`, 'deterministic creation_request_key');
  eq(plan[1].action, 'merge', 'row3 same company, different contact → in-file merge');
  eq(plan[1].matched_pending_key, plan[0].key, 'in-file merge points at the pending create key');
  eq(plan[1].contacts[0].customer_id, `pending:${plan[0].key}`, 'folded contact carries the pending placeholder');
  eq(plan[2].action, 'skip', 'row4 exact duplicate → skip');
  ok(plan[2].reason.includes('duplicate in file of row 2'), 'skip names the winning row');
  eq(plan[3].action, 'merge', 'row5 existing-company email hit → merge');
  deq(plan[3].matched_customer_ids, ['x1'], 'matched id on merge rows');
  eq(plan[3].contacts[0].customer_id, 'x1', 'existing-customer merge carries the REAL id, not a placeholder');

  // Existing match beats in-file fold — a pending create must not swallow an
  // authoritative existing customer.
  const file2 = [
    { row: 2, company_name: 'File Co', email: 'first@file.com' },
    { row: 3, company_name: 'File Co', email: 'alice@acme.com' }, // email hits existing x1
  ];
  const plan2 = imp.rowsToCustomerPatches(file2, { existingCustomers: existing });
  eq(plan2[0].action, 'create');
  eq(plan2[1].action, 'merge', 'email hit on existing beats folding into the pending create');
  deq(plan2[1].matched_customer_ids, ['x1']);
  eq(plan2[1].matched_pending_key, undefined, 'real matches never carry a pending key');

  // Row-level contract: error rows write nothing; patch is sparse.
  const bad = imp.rowsToCustomerPatches([{ row: 2, company_name: '', contact_name: '', email: 'not-an-email' }]);
  eq(bad[0].action, 'error');
  ok(bad[0].errors.length > 0);
  const { patch } = imp.rowToCustomerPatch(canon({ company_name: 'Solo Person', contact_name: 'Solo Person', email: 'solo@x.com' }));
  eq(patch.company_name, 'Solo Person', 'patch: company falls back to contact name');
  ok(patch.creation_request_key.startsWith('custimp:'), 'patch always carries the deterministic key');
  ok(!('notes' in patch), 'patch is sparse — blank cells emit nothing');
  eq(typeof imp.customerImportKey(canon({ company_name: 'K Co', email: 'k@k.com' })), 'string');
  eq(imp.customerImportKey(canon({ company_name: 'K Co', email: 'k@k.com' })), imp.customerImportKey(canon({ company_name: 'K Co', email: 'k@k.com' })), 'import key deterministic (retry-safe)');
  eq(imp.customerImportKey(canon({ company_name: 'K Co' })), 'custimp:k-co:nophone', 'no email → nophone slot');

  // Child-row shapes (the merge/dedupe child-create contract).
  const rich = imp.rowsToCustomerPatches([{
    row: 2, company_name: 'Rich Co', first_name: 'Al', last_name: 'Rich',
    email: 'al@rich.com', contact_title: 'Owner', mobile_phone: '513',
    billing_contact_name: 'Book Keep', billing_email: 'books@rich.com',
    address1: '1 Main', city: 'Cincy', state: 'OH', zip: '45202',
    shipping_address1: '9 Dock', shipping_city: 'Erl', shipping_state: 'KY', shipping_zip: '41018',
  }], { now: '2026-11-20T00:00:00Z' })[0];
  eq(rich.contacts.length, 2, 'primary + billing contacts');
  eq(rich.contacts[0].role, 'primary');
  eq(rich.contacts[0].is_primary, true);
  eq(rich.contacts[1].role, 'billing');
  eq(rich.contacts[1].is_billing_contact, true);
  ok(rich.contacts.every((c) => c.creation_request_key.startsWith('custimp-ct:rich-co:')), 'contact keys namespaced');
  eq(rich.locations.length, 2, 'billing + site locations');
  eq(rich.locations[0].site_type, 'billing', 'site address present → billing row is billing-only');
  eq(rich.locations[0].is_billing_address, true);
  eq(rich.locations[1].site_type, 'install');
  eq(rich.locations[1].is_primary_site, true);
  const billOnly = imp.rowsToCustomerPatches([{ row: 2, company_name: 'B', address1: '1 Main' }])[0];
  eq(billOnly.locations[0].site_type, 'install_and_billing', 'single address → combined site_type');
  eq(billOnly.locations[0].is_primary_site, true);

  // importSummary — disjoint counts + ambiguous detail.
  const summary = imp.importSummary(plan);
  eq(summary.import_type, 'customers');
  eq(summary.total_items, 4);
  eq(summary.created_items, 1);
  eq(summary.updated_items, 2, 'in-file fold + real merge both count as merges');
  eq(summary.skipped_items, 1);
  eq(summary.ambiguous_items, 0);
  eq(summary.invalid_items, 0);
  eq(summary.total_items, summary.created_items + summary.updated_items + summary.skipped_items + summary.ambiguous_items + summary.invalid_items, 'counts partition the file');
  const ambSummary = imp.importSummary([
    { row: 2, key: 'k', action: 'skip', ambiguous: true, matched_customer_ids: ['a', 'b'], reason: 'email matches multiple customers', contacts: [], locations: [], errors: [] },
  ]);
  eq(ambSummary.ambiguous_items, 1);
  eq(ambSummary.skipped_items, 0, 'ambiguous skips are counted separately from plain skips');
  eq(ambSummary.ambiguous[0].matched_customer_ids.length, 2, 'ambiguous detail carries the hit list');

  // --- merge dialog wiring (static) ----------------------------------------
  // G-14: the dialog delegates to manageCustomerLifecycle + the shared
  // customerMergeModel — relink coverage + the loser-field fold live there.
  const dlgSrc = readText('src/components/estimator/CustomerMergeDialog.jsx');
  const mrgSrc = readText('base44/shared/customerMergeModel.ts');
  ok(/manageCustomerLifecycle|customerMergeModel|invokeFleet/.test(dlgSrc), 'dialog delegates to the server merge path');
  ok(mrgSrc.includes('merged_into_customer_id'), 'model: loser marked merged');
  ok(mrgSrc.includes("customer_status: 'inactive'"), 'model: loser also inactivated');
  for (const ent of ['AllInOneEstimate','WorkOrder','Invoice','Payment','Opportunity','CustomerContact','CustomerLocation','OpportunityActivity','StoreCreditLedger']) {
    ok(mrgSrc.includes("'" + ent + "'"), 'model relink list covers ' + ent + ' (N-07.5 closed)');
  }
  ok(/legacy_client_names/.test(mrgSrc), 'model folds loser names into winner legacy_client_names (N-07.5b partially closed)');
  ok(mrgSrc.includes('in_store_credit'), 'model merges the loser in-store credit balance into the winner');
  ok(/warning_flag_details/.test(mrgSrc), 'model unions loser warning_flags + absorbs flag details (N-07.5b closed)');
  {
    const wp = (await bundle(repo('base44/shared/customerMergeModel.ts'), 'merge-model')).buildWinnerPatch({
      keep: { id: 'w', warning_flags: ['credit_hold'], warning_flag_details: { credit_hold: { note: 'kept' } } },
      lose: { warning_flags: ['credit_hold', 'do_not_mail'], warning_flag_details: { do_not_mail: { note: 'loser note' }, credit_hold: { note: 'dup' } } },
    });
    eq((wp.warning_flags || []).join(','), 'credit_hold,do_not_mail', 'winner patch unions warning_flags');
    eq(wp.warning_flag_details.credit_hold.note, 'kept', 'winner keeps its own flag details');
    eq(wp.warning_flag_details.do_not_mail.note, 'loser note', 'loser flag details absorbed for new flags');
  }

  // --- merged-stub downstream semantics --------------------------------------
  const dormant = rep.dormantCustomerRows(CUSTOMERS, {
    asOf: AS_OF, days: 90, invoices: INVOICES, workOrders: WORK_ORDERS,
    opportunities: OPPORTUNITIES, payments: PAYMENTS,
  });
  ok(!dormant.some((r) => r.customer_id === 'c5'), 'stub excluded from dormant report');
  ok(dormant.some((r) => r.customer_id === 'c7'), 'auto_inactive_disabled does NOT shield dormancy (different feature)');
  const byCreated = rep.customersByCreatedRows(CUSTOMERS, {});
  ok(!byCreated.some((r) => r.customer_id === 'c5'), 'stub excluded from created cohort');
  const phone = rep.phoneAddressRows(CUSTOMERS);
  ok(!phone.some((r) => r.customer_id === 'c5'), 'stub excluded from directory');
  const instore = rep.instoreCreditRows(CUSTOMERS, [], { includeZero: true });
  ok(!instore.some((r) => r.customer_id === 'c5'), 'stub excluded from credit positions (its stored 999 never surfaces)');

  // --- ensureCustomerSummary merge/CAS rules (static) -------------------------
  const sumSrc = readText('base44/functions/ensureCustomerSummary/entry.ts');
  ok(/summaryKeyFor\(normalizedName\)\s*=>?\s*`customer_summary:v1:/.test(sumSrc.replace(/\s+/g, ' ')) || sumSrc.includes('customer_summary:v1:'), 'summary: deterministic v1 key per normalized client name');
  ok(sumSrc.includes('`${String(link?.module || \'\')}::${String(link?.project_id || \'\')}`') || sumSrc.includes('projectLinkKey'), 'summary: linked_projects dedupe by module::project_id');
  ok(sumSrc.includes('linked_projects'), 'summary: re-pointed list is linked_projects');
  ok(/canonicalRow[\s\S]*aTime - bTime/.test(sumSrc), 'summary: oldest created row is canonical (winner)');
  ok(sumSrc.includes('duplicateIsSafeToDelete'), 'summary: duplicates gated before delete');
  ok(/notes.*!== ''\)\s*return false|String\(row\?\.notes \|\| ''\)\.trim\(\)/.test(sumSrc), 'summary: a noted duplicate is protected data (no delete)');
  ok(sumSrc.includes("tier_number ?? 1) !== 1"), 'summary: non-default tier duplicate protected');
  ok(sumSrc.includes('updated_date'), 'summary: CAS anchored on updated_date');
  ok(sumSrc.includes('merged_into_customer_id') === false, 'summary: entity-level merge stubs are a different mechanism — not this CAS path');
}

// ============================================================================
for (const f of tmpFiles) rmSync(f, { force: true });
console.log('PASS crm-suite');
console.log(`${COUNT} assertions`);
