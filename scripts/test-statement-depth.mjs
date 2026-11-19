// I-11 statement depth — esbuild-bundle harness for
//   base44/shared/statementTextModel.ts       (customizable statement text)
//   base44/shared/statementBatchWriteModel.ts (batch write side)
//   base44/shared/statementBatchModel.ts      (read/plan side — fixture contexts)
// Pure models, no I/O: run `node scripts/test-statement-depth.mjs`.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tmpdir = resolve(here, '.tmp-statement-depth');
mkdirSync(tmpdir, { recursive: true });
buildSync({
  entryPoints: [
    resolve(here, '../base44/shared/statementTextModel.ts'),
    resolve(here, '../base44/shared/statementBatchWriteModel.ts'),
    resolve(here, '../base44/shared/statementBatchModel.ts'),
  ],
  bundle: true, format: 'esm', outdir: tmpdir, logLevel: 'silent',
});
const text = await import(pathToFileURL(resolve(tmpdir, 'statementTextModel.js')).href);
const write = await import(pathToFileURL(resolve(tmpdir, 'statementBatchWriteModel.js')).href);
const batch = await import(pathToFileURL(resolve(tmpdir, 'statementBatchModel.js')).href);

const {
  STATEMENT_SETTINGS_KEY,
  STATEMENT_TEXT_DEFAULTS,
  STATEMENT_TOKENS,
  normalizeStatementSettings,
  mergeStatementText,
  statementTokenValues,
  applyStatementTokens,
  renderStatementText,
  normalizeRemitLines,
  isStatementSettingsCarrier,
} = text;
const {
  statementBatchId,
  statementDedupeKeyLocal,
  statementHistoryDedupeKey,
  statementInvoiceStamp,
  invoiceStatementMark,
  statementCustomerWrite,
  statementBatchWritePlan,
  markStatementSent,
  statementBatchReceipt,
  STATEMENT_INVOICE_STAMP_FIELDS,
  STATEMENT_RECORD_KIND,
} = write;
const { statementCandidates, statementBatchPlan, customerStatementContext } = batch;

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const deep = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

const PERIOD = { period_start: '2026-10-01', period_end: '2026-10-31', label: 'October 2026' };
const NOW = '2026-11-01T09:30:00Z';

// ===========================================================================
// A. statementTextModel — carriers + normalization
// ===========================================================================
{
  eq(STATEMENT_SETTINGS_KEY, 'statementSettings', 'canonical GlobalSettings key');
  ok(STATEMENT_TEXT_DEFAULTS.header_text.length > 0, 'built-in default header exists');
  ok(STATEMENT_TOKENS.includes('balance_due') && STATEMENT_TOKENS.includes('remit_to'), 'spec token registry');

  // Bare slice
  const bare = normalizeStatementSettings({ header_text: 'Hi there', show_payment_detail: false });
  eq(bare.header_text, 'Hi there');
  eq(bare.show_payment_detail, false);
  eq(bare.footer_text, undefined, 'absent keys stay absent for merge');

  // Flat block carrier
  const flat = normalizeStatementSettings({ statementSettings: { terms_text: 'Net 30', other: 'x' } });
  eq(flat.terms_text, 'Net 30');

  // KV row carrier
  const kv = normalizeStatementSettings({ setting_key: 'statementSettings', setting_value: { footer_text: 'Bye' } });
  eq(kv.footer_text, 'Bye', 'setting_key + setting_value row resolves');

  // KV blob carrier
  const blob = normalizeStatementSettings({ setting_key: 'unrelated', setting_value: { statementSettings: { aging_note: 'A note' } } });
  eq(blob.aging_note, 'A note', 'nested blob block resolves');

  // Aliases
  eq(normalizeStatementSettings({ statement_settings: { header_text: 'snake' } }).header_text, 'snake');
  eq(normalizeStatementSettings({ statementText: { header_text: 'camel' } }).header_text, 'camel');

  // Non-slice input → empty object, never throws
  deep(normalizeStatementSettings('junk'), {});
  deep(normalizeStatementSettings(null), {});
  deep(normalizeStatementSettings({ unrelated: true }), {});

  // Toggle garbage dropped, remit normalized
  const messy = normalizeStatementSettings({ show_aging_buckets: 'yes', remit_to: 'Line 1\n\nLine 2;;Line 3' });
  eq(messy.show_aging_buckets, undefined, 'non-boolean toggle dropped');
  deep(messy.remit_to, ['Line 1', 'Line 2', 'Line 3'], 'string remit splits + blanks drop');
}

// ===========================================================================
// B. mergeStatementText — precedence
// ===========================================================================
{
  const settings = normalizeStatementSettings({
    statementSettings: { header_text: 'Shop header', footer_text: 'Shop footer', remit_to: ['Shop St 1'] },
  });

  // override > settings > default
  let m = mergeStatementText(settings, { header_text: 'Run header' });
  eq(m.header_text, 'Run header', 'override beats settings');
  eq(m.sources.header_text, 'override');
  eq(m.footer_text, 'Shop footer', 'settings beats default');
  eq(m.sources.footer_text, 'settings');
  eq(m.terms_text, STATEMENT_TEXT_DEFAULTS.terms_text, 'default fills unset');
  eq(m.sources.terms_text, 'default');

  // Blank falls through — '' never suppresses
  m = mergeStatementText(settings, { header_text: '   ' });
  eq(m.header_text, 'Shop header', 'blank override falls through to settings');
  m = mergeStatementText({ header_text: '' }, {});
  eq(m.header_text, STATEMENT_TEXT_DEFAULTS.header_text, 'blank settings falls through to default');

  // Literal false suppresses at its layer
  m = mergeStatementText(settings, { footer_text: false });
  eq(m.footer_text, '', 'false override suppresses');
  eq(m.sources.footer_text, 'suppressed');
  m = mergeStatementText({ footer_text: false }, { header_text: 'x' });
  eq(m.footer_text, '', 'false in settings suppresses default');

  // Toggles
  m = mergeStatementText({ show_aging_buckets: false }, { show_payment_detail: false });
  eq(m.show_aging_buckets, false, 'settings toggle wins over default');
  eq(m.show_payment_detail, false, 'override toggle wins');
  m = mergeStatementText({ show_aging_buckets: false }, {});
  eq(m.show_aging_buckets, false);
  eq(m.show_payment_detail, true, 'unset toggle defaults true');
  // non-boolean toggle in overrides falls through to settings
  m = mergeStatementText({ show_aging_buckets: false }, { show_aging_buckets: 'no' });
  eq(m.show_aging_buckets, false, 'non-boolean override falls through');

  // remit_to precedence — present [] wins (deliberate empty)
  m = mergeStatementText(settings, { remit_to: [] });
  deep(m.remit_to, [], 'explicit empty remit list wins');
  eq(m.sources.remit_to, 'override');
  m = mergeStatementText(settings, {});
  deep(m.remit_to, ['Shop St 1'], 'settings remit survives');
  m = mergeStatementText({}, {});
  deep(m.remit_to, [], 'default remit is empty');
  eq(m.sources.remit_to, 'default');
  m = mergeStatementText(settings, { remit_to: 'A\nB' });
  deep(m.remit_to, ['A', 'B'], 'string override normalizes to lines');
}

// ===========================================================================
// C. normalizeRemitLines bounds
// ===========================================================================
{
  deep(normalizeRemitLines(['  a  ', '', 'b', { line: 'obj' }, { address: 'addr' }]), ['a', 'b', 'obj', 'addr']);
  eq(normalizeRemitLines([`x`.repeat(300)])[0].length, 200, 'line length capped');
  eq(normalizeRemitLines(Array.from({ length: 20 }, (_, i) => `L${i}`)).length, 12, 'line count capped');
  deep(normalizeRemitLines(undefined), []);
}

// ===========================================================================
// D. tokens — applyStatementTokens + statementTokenValues
// ===========================================================================
{
  // Registered tokens substitute; unknown stays literal
  const r = applyStatementTokens('A {{company_name}} B {{customer.payment_url}} C {{bogus}}', { company_name: 'CCS' });
  eq(r.text, 'A CCS B {{customer.payment_url}} C {{bogus}}', 'foreign placeholders untouched');
  deep(r.missing, [], 'no registered misses');
  const r2 = applyStatementTokens('Pay {{balance_due}} to {{company_name}}', { balance_due: '$5.00' });
  eq(r2.text, 'Pay $5.00 to ', 'missing registered token → blank');
  deep(r2.missing, ['company_name'], 'missing recorded once');

  // Statement context → token map (batch shape: cents + customer company_name)
  const ctx = {
    company_name: 'Acme Sign Co',      // batch context: the CUSTOMER
    billing_email: 'ap@acme.test',
    period_start: '2026-10-01', period_end: '2026-10-31', period_label: 'October 2026',
    as_of: '2026-10-31', closing_balance: 125000,
  };
  let t = statementTokenValues(ctx, { remit_to: ['Pay {{company_name}}'] });
  eq(t.customer_name, 'Acme Sign Co', 'context company_name is the CUSTOMER lane');
  eq(t.company_name, '', 'issuer name never reads the customer lane');
  eq(t.balance_due, '$1,250.00', 'closing_balance is CENTS');
  eq(t.period_start, '2026-10-01');
  eq(t.period_label, 'October 2026');
  eq(t.as_of, '2026-10-31');
  eq(t.remit_to, 'Pay {{company_name}}', 'remit lines join; tokens apply later');

  // Issuer via company block (QuoteDefaults shape)
  t = statementTokenValues({ ...ctx, company: { company_name: 'CCS Signage' } }, {});
  eq(t.company_name, 'CCS Signage', 'company block feeds issuer lane');
  eq(t.customer_name, 'Acme Sign Co', 'customer lane preserved');

  // Flat token map: company_name means what the caller says
  t = statementTokenValues({ company_name: 'Flat Shop', balance_due: 1250 }, {});
  eq(t.company_name, 'Flat Shop', 'flat map company_name verbatim');
  eq(t.balance_due, '$1,250.00', 'flat balance_due number is DOLLARS');
  t = statementTokenValues({ balance_due_cents: 125000 }, {});
  eq(t.balance_due, '$1,250.00', 'balance_due_cents is cents');
  t = statementTokenValues({ balance: 99.5 }, {});
  eq(t.balance_due, '$99.50', 'frontend balance is dollars');
  t = statementTokenValues({ balance_due: '$7.25' }, {});
  eq(t.balance_due, '$7.25', 'string balance_due verbatim');
}

// ===========================================================================
// E. renderStatementText — end-to-end
// ===========================================================================
{
  const settings = {
    setting_key: 'statementSettings',
    setting_value: {
      header_text: 'Statement for {{customer_name}} — {{period_label}}',
      footer_text: 'Remit to:\n{{remit_to}}',
      terms_text: 'Balance due {{balance_due}} payable to {{company_name}}.',
      remit_to: ['{{company_name}}', '123 Sign Way', 'Cincinnati, OH 45202'],
      show_aging_buckets: true,
    },
  };
  const ctx = {
    company_name: 'Acme Sign Co',
    company: { company_name: 'CCS Signage' },
    period_start: '2026-10-01', period_end: '2026-10-31', period_label: 'October 2026',
    closing_balance: 125000,
  };
  const r = renderStatementText(settings, { header_text: 'Custom for {{customer_name}}' }, ctx);
  eq(r.header_text, 'Custom for Acme Sign Co', 'override + token');
  eq(r.footer_text, 'Remit to:\nCCS Signage\n123 Sign Way\nCincinnati, OH 45202', 'remit lines render inside footer');
  eq(r.terms_text, 'Balance due $1,250.00 payable to CCS Signage.', 'money + issuer tokens');
  eq(r.aging_note, STATEMENT_TEXT_DEFAULTS.aging_note, 'default note rendered');
  deep(r.remit_to, ['CCS Signage', '123 Sign Way', 'Cincinnati, OH 45202'], 'remit lines token-applied');
  eq(r.remit_to_text, 'CCS Signage\n123 Sign Way\nCincinnati, OH 45202');
  eq(r.show_payment_detail, true);
  eq(r.show_aging_buckets, true);
  deep(r.missing_tokens, [], 'all tokens resolved');

  // Missing context → registered tokens blank + reported (only when used)
  const r2 = renderStatementText(null, null, {});
  eq(r2.terms_text, STATEMENT_TEXT_DEFAULTS.terms_text, 'default terms render');
  deep(r2.missing_tokens, [], 'defaults carry no tokens → nothing missing');
  const r2b = renderStatementText({ terms_text: 'Due {{balance_due}} now.' }, null, {});
  eq(r2b.terms_text, 'Due  now.', 'missing token renders blank in place');
  deep(r2b.missing_tokens, ['balance_due'], 'used-but-missing token reported');
  const r3 = renderStatementText({ header_text: '{{company_name}} says hi {{nope}}' }, null, {});
  eq(r3.header_text, ' says hi {{nope}}', 'missing issuer → blank; unknown stays literal');
  ok(r3.missing_tokens.includes('company_name'));

  // Carrier guard
  ok(isStatementSettingsCarrier(settings), 'KV row is a carrier');
  ok(isStatementSettingsCarrier({ statementSettings: {} }), 'flat block is a carrier');
  ok(!isStatementSettingsCarrier({ hello: 1 }), 'plain object is not');
  ok(!isStatementSettingsCarrier('x'), 'non-object is not');
}

// ===========================================================================
// F. statementBatchWriteModel — identity + stamp
// ===========================================================================
{
  eq(statementBatchId(PERIOD), 'stmt-batch:2026-10-01', 'batch id deterministic on period');
  eq(statementBatchId('2026-10-01'), 'stmt-batch:2026-10-01', 'bare day accepted');
  eq(statementBatchId({}), '', 'no period → no batch id');
  eq(statementBatchId({ period_start: 'junk' }), '', 'unparseable → no batch id');
  eq(statementDedupeKeyLocal('c1', '2026-10-01'), 'stmt:c1:2026-10-01', 'plan-key parity');
  eq(statementHistoryDedupeKey('c1', '2026-10-01'), 'stmt-rec:c1:2026-10-01', 'history key namespace');

  const stamp = statementInvoiceStamp({ batch_id: 'stmt-batch:2026-10-01', period: PERIOD, now: NOW });
  deep(Object.keys(stamp).sort(), [...STATEMENT_INVOICE_STAMP_FIELDS].sort(), 'stamp field set');
  eq(stamp.statement_batch_id, 'stmt-batch:2026-10-01');
  eq(stamp.statement_period_start, '2026-10-01');
  eq(stamp.statement_period_end, '2026-10-31');
  eq(stamp.statement_generated_at, '2026-11-01T09:30:00.000Z');
  deep(statementInvoiceStamp({ batch_id: '', period: PERIOD }), {}, 'no batch → no stamp');
  deep(statementInvoiceStamp({ batch_id: 'b', period: {} }), {}, 'no period start → no stamp');

  // invoiceStatementMark lanes
  const batchId = 'stmt-batch:2026-10-01';
  eq(invoiceStatementMark({}, { batch_id: batchId, period_start: '2026-10-01' }), 'unstamped');
  eq(invoiceStatementMark({ statement_batch_id: batchId, statement_period_start: '2026-10-01' }, { batch_id: batchId, period_start: '2026-10-01' }), 'current');
  eq(invoiceStatementMark({ statement_batch_id: batchId }, { batch_id: batchId, period_start: '2026-10-01' }), 'current', 'legacy stamp w/o period still current');
  eq(invoiceStatementMark({ statement_batch_id: 'stmt-batch:2026-09-01' }, { batch_id: batchId, period_start: '2026-10-01' }), 'other_batch');
  eq(invoiceStatementMark({ statement_batch_id: batchId, statement_period_start: '2026-09-01' }, { batch_id: batchId, period_start: '2026-10-01' }), 'conflict');
}

// ===========================================================================
// G. statementCustomerWrite — per-customer write specs
// ===========================================================================
{
  const ctx = {
    customer_id: 'c1', company_name: 'Acme Sign Co', billing_email: 'ap@acme.test',
    period_start: '2026-10-01', period_end: '2026-10-31', period_label: 'October 2026',
    closing_balance: 115000,
    line_items: [
      { invoice_id: 'i1', invoice_number: 'INV-1', balance: 40000 },
      { invoice_id: 'i2', invoice_number: 'INV-2', balance: 25000 },
      { invoice_id: 'i1', invoice_number: 'INV-1', balance: 40000 },   // dup row
      { invoice_number: 'INV-NOID', balance: 50000 },                   // unkeyed
    ],
  };
  const cand = { customer: { id: 'c1', company_name: 'Acme Sign Co', send_monthly_statements: true }, context: ctx, missing_email: false };

  const spec = statementCustomerWrite(cand, { batch_id: 'stmt-batch:2026-10-01', now: NOW });
  eq(spec.skipped, false);
  eq(spec.customer_id, 'c1');
  eq(spec.dedupe_key, 'stmt:c1:2026-10-01', 'dedupe key derived');
  eq(spec.invoice_patches.length, 2, 'dup invoice id deduped; unkeyed skipped');
  eq(spec.invoice_patches[0].invoice_id, 'i1');
  eq(spec.invoice_patches[0].patch.statement_batch_id, 'stmt-batch:2026-10-01');
  eq(spec.invoice_patches[0].patch.statement_generated_at, '2026-11-01T09:30:00.000Z');
  eq(spec.invoice_patches[0].expected.statement_batch_id, '', 'CAS anchor: expected unstamped');
  deep(spec.unkeyed_invoice_numbers, ['INV-NOID'], 'unkeyed items reported');
  eq(spec.send_opted_out, false);
  eq(spec.missing_email, false);
  // history row
  eq(spec.history.kind, STATEMENT_RECORD_KIND);
  eq(spec.history.dedupe_key, 'stmt:c1:2026-10-01');
  eq(spec.history.creation_request_key, 'stmt-rec:c1:2026-10-01');
  eq(spec.history.statement_status, 'generated');
  eq(spec.history.closing_balance, 115000, 'cents carried verbatim');
  eq(spec.history.open_invoice_count, 4, 'count = line_items rows');
  deep(spec.history.invoice_ids.sort(), ['i1', 'i2']);

  // Idempotent: stored stamps already current → skip, no patches
  const invoicesById = {
    i1: { id: 'i1', statement_batch_id: 'stmt-batch:2026-10-01', statement_period_start: '2026-10-01' },
    i2: { id: 'i2', statement_batch_id: 'stmt-batch:2026-10-01', statement_period_start: '2026-10-01' },
  };
  const rerun = statementCustomerWrite(cand, { batch_id: 'stmt-batch:2026-10-01', now: NOW, invoicesById });
  eq(rerun.skipped, true, 'fully-stamped customer skipped');
  eq(rerun.skip_reason, 'already_stamped');
  deep(rerun.already_stamped_invoice_ids, ['i1', 'i2']);

  // Partially stamped → patches only the unstamped; expected anchors the stored stamp
  const partial = statementCustomerWrite(cand, {
    batch_id: 'stmt-batch:2026-10-01', now: NOW,
    invoicesById: { i1: invoicesById.i1, i2: { id: 'i2', statement_batch_id: 'stmt-batch:2026-09-01' } },
  });
  eq(partial.skipped, false);
  eq(partial.invoice_patches.length, 1, 'only the other-batch invoice re-patches');
  eq(partial.invoice_patches[0].invoice_id, 'i2');
  eq(partial.invoice_patches[0].mark, 'other_batch');
  eq(partial.invoice_patches[0].expected.statement_batch_id, 'stmt-batch:2026-09-01', 'CAS anchor on stored stamp');
  deep(partial.already_stamped_invoice_ids, ['i1']);

  // dedupe-set skip
  const dedup = statementCustomerWrite(cand, { batch_id: 'stmt-batch:2026-10-01', now: NOW, existingKeys: ['stmt:c1:2026-10-01'] });
  eq(dedup.skipped, true);
  eq(dedup.skip_reason, 'already_generated');

  // unkeyable / no-period skips
  eq(statementCustomerWrite({ context: { period_start: '2026-10-01' } }, {}).skip_reason, 'no_customer_id');
  eq(statementCustomerWrite({ customer: { id: 'c9' }, context: { customer_id: 'c9' } }, {}).skip_reason, 'no_period');

  // opt-out via customersById on a plan-shaped row (no .customer)
  const planRow = { customer_id: 'c2', dedupe_key: 'stmt:c2:2026-10-01', context: { ...ctx, customer_id: 'c2' }, missing_email: false };
  const opt = statementCustomerWrite(planRow, { batch_id: 'stmt-batch:2026-10-01', now: NOW, customersById: { c2: { id: 'c2', send_monthly_statements: false } } });
  eq(opt.send_opted_out, true, 'opt-out resolves through customersById');
  eq(opt.history.send_opted_out, true);
  // plan row without lookup → opt-out unknown → false
  const noLookup = statementCustomerWrite(planRow, { batch_id: 'stmt-batch:2026-10-01', now: NOW });
  eq(noLookup.send_opted_out, false, 'no customer row → not flagged');
  eq(noLookup.dedupe_key, 'stmt:c2:2026-10-01', 'plan-row dedupe key used verbatim');

  // missing email from context (no billing_email + no flag)
  const noEmail = statementCustomerWrite({ customer_id: 'c3', context: { ...ctx, customer_id: 'c3', billing_email: '' } }, { batch_id: 'stmt-batch:2026-10-01', now: NOW });
  eq(noEmail.missing_email, true, 'context billing_email absence flags missing_email');
}

// ===========================================================================
// H. statementBatchWritePlan — batch assembly
// ===========================================================================
{
  const rowFor = (cid, extra = {}) => ({
    customer_id: cid,
    context: {
      customer_id: cid, company_name: `${cid} Co`, billing_email: `${cid}@x.test`,
      period_start: '2026-10-01', period_end: '2026-10-31', closing_balance: 1000,
      line_items: [{ invoice_id: `inv-${cid}`, invoice_number: `INV-${cid}`, balance: 1000 }],
      ...extra,
    },
  });

  const plan = statementBatchWritePlan(
    [rowFor('c1'), rowFor('c2'), rowFor('c1'), { context: {} }],
    { now: NOW },
  );
  eq(plan.batch_id, 'stmt-batch:2026-10-01', 'batch id derived from rows');
  eq(plan.period_start, '2026-10-01');
  eq(plan.rows.length, 2, 'two unique customers');
  eq(plan.skipped.length, 2, 'dup + unkeyable skipped');
  eq(plan.skipped[0].skip_reason, 'duplicate_in_plan', 'same dedupe key twice → dup');
  eq(plan.skipped[1].skip_reason, 'no_customer_id');
  eq(plan.rows[0].invoice_patches[0].invoice_id, 'inv-c1');

  // Explicit batch id wins; existingKeys honored
  const plan2 = statementBatchWritePlan([rowFor('c1'), rowFor('c2')], {
    batch_id: 'custom-batch', now: NOW, existingKeys: new Set(['stmt:c1:2026-10-01']),
  });
  eq(plan2.batch_id, 'custom-batch');
  eq(plan2.rows.length, 1);
  eq(plan2.rows[0].customer_id, 'c2');
  eq(plan2.rows[0].invoice_patches[0].patch.statement_batch_id, 'custom-batch');
  eq(plan2.skipped[0].skip_reason, 'already_generated');

  // Dedupe keys unique per customer+period
  const keys = plan.rows.map((r) => r.dedupe_key);
  eq(new Set(keys).size, keys.length, 'dedupe keys unique within plan');
  ok(keys.every((k) => k.endsWith(':2026-10-01')), 'all keys bound to the period');
}

// ===========================================================================
// I. markStatementSent — sent patch builder
// ===========================================================================
{
  const m = markStatementSent({
    customer_id: 'c1', dedupe_key: 'stmt:c1:2026-10-01', batch_id: 'stmt-batch:2026-10-01',
    context: { billing_email: 'ap@acme.test' }, channel: 'email', now: NOW,
  });
  eq(m.dedupe_key, 'stmt:c1:2026-10-01');
  eq(m.patch.statement_status, 'sent');
  eq(m.patch.statement_sent_at, '2026-11-01T09:30:00.000Z');
  eq(m.patch.statement_sent_to, 'ap@acme.test', 'sent_to falls back to billing email');
  eq(m.patch.statement_channel, 'email');
  eq(m.patch.statement_batch_id, 'stmt-batch:2026-10-01');

  // Row-shaped input + print lane + derived batch
  const m2 = markStatementSent({
    row: { customer_id: 'c2', dedupe_key: 'stmt:c2:2026-10-01' },
    context: { period_start: '2026-10-01' }, channel: 'print', now: NOW,
  });
  eq(m2.batch_id, 'stmt-batch:2026-10-01', 'batch derived from context period');
  eq(m2.patch.statement_sent_to, '', 'print lane has no recipient');
  eq(m2.patch.statement_channel, 'print');
  const m3 = markStatementSent({ customer_id: 'c3', context: { period_start: '2026-10-01' }, sent_to: 'x@y.z', now: NOW });
  eq(m3.channel, 'email', 'channel defaults to email');
  eq(m3.dedupe_key, 'stmt:c3:2026-10-01', 'dedupe key derived from customer+period');
}

// ===========================================================================
// J. statementBatchReceipt — run report totals
// ===========================================================================
{
  const plan = statementBatchWritePlan([
    { customer_id: 'c1', context: { customer_id: 'c1', company_name: 'A', billing_email: 'a@x.test', period_start: '2026-10-01', period_end: '2026-10-31', closing_balance: 500, line_items: [{ invoice_id: 'i1', invoice_number: 'I-1' }, { invoice_id: 'i2', invoice_number: 'I-2' }] } },
    { customer_id: 'c2', context: { customer_id: 'c2', company_name: 'B', billing_email: '', period_start: '2026-10-01', period_end: '2026-10-31', closing_balance: 700, line_items: [{ invoice_id: 'i3', invoice_number: 'I-3' }] } },
    { customer_id: 'c3', context: { customer_id: 'c3', company_name: 'C', billing_email: 'c@x.test', period_start: '2026-10-01', period_end: '2026-10-31', closing_balance: 900, line_items: [] } },
    { customer_id: 'dup', context: { customer_id: 'dup', period_start: '2026-10-01' }, dedupe_key: 'stmt:c1:2026-10-01' },
  ], { now: NOW });
  eq(plan.rows.length, 3);
  eq(plan.skipped.length, 1);

  const receipt = statementBatchReceipt({
    batch_id: plan.batch_id, plan,
    results: [
      { dedupe_key: 'stmt:c1:2026-10-01', sent: true, channel: 'email' },
      { customer_id: 'c2', sent: false, skipped: true, reason: 'missing_email' },
      // c3: no result → generated, not sent
    ],
    now: NOW,
  });
  eq(receipt.batch_id, 'stmt-batch:2026-10-01');
  eq(receipt.count, 3, 'count = generated rows');
  eq(receipt.sent, 1, 'one delivered');
  eq(receipt.skipped, 2, 'plan-skip + result-skip');
  deep(receipt.skipped_ids.sort(), ['c2', 'dup']);
  deep(receipt.missing_email_ids, ['c2'], 'missing-email lane');
  deep(receipt.opted_out_ids, [], 'no opt-outs in fixture');
  deep(receipt.dedupe_keys, ['stmt:c1:2026-10-01', 'stmt:c2:2026-10-01', 'stmt:c3:2026-10-01'],
    'dedupe keys for generated rows only — skipped row never keys');
  eq(receipt.invoice_patch_count, 3);
  deep(receipt.invoice_ids.sort(), ['i1', 'i2', 'i3']);
  eq(receipt.period_start, '2026-10-01');
  eq(receipt.period_end, '2026-10-31');

  // Empty plan → zeroed receipt, never throws
  const empty = statementBatchReceipt({ plan: statementBatchWritePlan([], { now: NOW }) });
  eq(empty.count, 0);
  eq(empty.sent, 0);
  deep(empty.dedupe_keys, []);
}

// ===========================================================================
// K. END-TO-END — real statementBatchModel → write plan → receipt
//    Fixture exercises N-05.1 semantics: refunded payment + refund leg are
//    BOTH live money rows that net each other.
// ===========================================================================
{
  const inv = (over = {}) => ({
    id: 'i?', invoice_number: 'INV-?', status: 'sent', customer_id: 'c1',
    issue_date: '2026-10-01', due_date: '', total: 0, ...over,
  });
  const pay = (over = {}) => ({
    id: 'p?', invoice_id: '', invoice_number: '', customer_id: 'c1', status: 'recorded',
    paid_date: '2026-10-01', amount: 0, method: 'check', ...over,
  });
  const customers = [
    { id: 'c1', company_name: 'Acme Sign Co', billing_email: 'ap@acme.test' },
    { id: 'c2', company_name: 'Beta Works', billing_email: 'b@beta.test', send_monthly_statements: false },
    { id: 'c3', company_name: 'NoEmail LLC' },
    { id: 'c4', company_name: 'Zero Bal Inc', billing_email: 'z@zero.test' },
  ];
  const invoices = [
    inv({ id: 'i1', invoice_number: 'INV-1', issue_date: '2026-09-15', due_date: '2026-10-10', total: 400 }),
    inv({ id: 'i2', invoice_number: 'INV-2', issue_date: '2026-10-05', due_date: '2026-11-20', total: 250 }),
    inv({ id: 'i3', invoice_number: 'INV-3', customer_id: 'c2', issue_date: '2026-10-07', due_date: '2026-10-20', total: 120 }),
    inv({ id: 'i4', invoice_number: 'INV-4', customer_id: 'c3', issue_date: '2026-10-08', due_date: '2026-10-25', total: 75 }),
    inv({ id: 'i5', invoice_number: 'INV-5', customer_id: 'c4', issue_date: '2026-10-09', total: 50 }),
    inv({ id: 'i6', invoice_number: 'INV-VOID', issue_date: '2026-10-10', total: 999, status: 'void' }),
    inv({ id: 'i7', invoice_number: 'INV-DRAFT', issue_date: '2026-10-11', total: 888, status: 'draft' }),
  ];
  const payments = [
    pay({ id: 'p1', invoice_id: 'i1', paid_date: '2026-10-12', amount: 100, status: 'refunded' }), // refunded original — LIVE
    pay({ id: 'p2', invoice_id: 'i1', paid_date: '2026-10-13', amount: -100, refund_of_payment_id: 'p1' }), // refund leg — LIVE
    pay({ id: 'p3', invoice_id: 'i1', paid_date: '2026-10-14', amount: 60 }),                       // real kept payment
    pay({ id: 'p4', invoice_id: 'i2', paid_date: '2026-10-15', amount: 50 }),
    pay({ id: 'p5', invoice_id: 'i5', customer_id: 'c4', paid_date: '2026-10-20', amount: 50 }),    // c4 fully paid → skipped
    pay({ id: 'p6', invoice_id: 'i4', customer_id: 'c3', paid_date: '2026-10-16', amount: 25, status: 'void' }), // void never happened
  ];

  const candidates = statementCandidates({ customers, invoices, payments, period: PERIOD, now: NOW });
  eq(candidates.length, 3, 'zero-balance c4 skipped');
  deep(candidates.map((c) => c.customer.id), ['c1', 'c2', 'c3']);
  eq(candidates[0].missing_email, false);
  eq(candidates[1].missing_email, false);
  eq(candidates[2].missing_email, true);

  // N-05.1 check: refunded original + leg net — i1 applied = 100 - 100 + 60 = 60
  const c1ctx = candidates[0].context;
  const i1 = c1ctx.line_items.find((l) => l.invoice_number === 'INV-1');
  eq(i1.paid, 6000, 'refund pair nets; kept payment applies');
  eq(i1.balance, 34000, 'partial refund reopened AR');
  eq(c1ctx.aging.b1_30, 34000, 'INV-1 due 10-10 → 21d past at 10-31');
  eq(c1ctx.aging.current, 20000, 'INV-2 due 11-20 → current');
  eq(c1ctx.closing_balance, c1ctx.opening_balance + c1ctx.invoiced - c1ctx.paid + c1ctx.adjustments,
    'roll-forward identity holds on fixture');

  const planRows = statementBatchPlan(candidates, {});
  eq(planRows.length, 3);

  const customersById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const plan = statementBatchWritePlan(planRows, { now: NOW, customersById });
  eq(plan.rows.length, 3);
  eq(plan.batch_id, 'stmt-batch:2026-10-01');
  const c1row = plan.rows.find((r) => r.customer_id === 'c1');
  deep(c1row.invoice_patches.map((p) => p.invoice_id).sort(), ['i1', 'i2'], 'open invoices marked');
  ok(!c1row.invoice_patches.some((p) => p.invoice_id === 'i6' || p.invoice_id === 'i7'),
    'void + draft invoices never stamped');
  eq(plan.rows.find((r) => r.customer_id === 'c2').send_opted_out, true, 'opt-out flows from customersById');
  eq(plan.rows.find((r) => r.customer_id === 'c3').missing_email, true);
  eq(c1row.history.statement_batch_id, 'stmt-batch:2026-10-01');
  eq(c1row.history.statement_period_start, '2026-10-01');
  eq(c1row.history.statement_period_end, '2026-10-31');

  // Simulate the write: apply patches, then rerun the whole batch → full skip.
  const stored = {};
  for (const row of plan.rows) {
    for (const ip of row.invoice_patches) stored[ip.invoice_id] = { id: ip.invoice_id, ...ip.patch };
  }
  const rerun = statementBatchWritePlan(planRows, { now: '2026-11-01T10:00:00Z', customersById, invoicesById: stored });
  eq(rerun.rows.length, 0, 'rerun after stamping → nothing to write');
  eq(rerun.skipped.length, 3);
  ok(rerun.skipped.every((s) => s.skip_reason === 'already_stamped'));

  // Receipt for the first run: 2 emailed (c1, c3→missing_email skips send),
  // c2 opted out of email but still generated.
  const receipt = statementBatchReceipt({
    plan,
    results: [
      { dedupe_key: 'stmt:c1:2026-10-01', sent: true },
      { dedupe_key: 'stmt:c2:2026-10-01', sent: false, skipped: true, reason: 'opted_out' },
      { dedupe_key: 'stmt:c3:2026-10-01', sent: false, skipped: true, reason: 'missing_email' },
    ],
    now: NOW,
  });
  eq(receipt.count, 3);
  eq(receipt.sent, 1);
  eq(receipt.skipped, 2);
  deep(receipt.missing_email_ids, ['c3']);
  deep(receipt.opted_out_ids, ['c2']);
  eq(receipt.dedupe_keys.length, 3, 'all generated rows contribute keys');
  eq(new Set(receipt.dedupe_keys).size, 3, 'dedupe keys unique per customer+period');
  deep(receipt.invoice_ids.sort(), ['i1', 'i2', 'i3', 'i4']);
  eq(receipt.batch_id, 'stmt-batch:2026-10-01');
}

// ===========================================================================
// L. Combined render — real batch context through the text model
// ===========================================================================
{
  const ctx = customerStatementContext({
    customer: { id: 'cx', company_name: 'Delta Signs', billing_email: 'd@delta.test' },
    invoices: [{ id: 'dx', invoice_number: 'D-1', customer_id: 'cx', status: 'sent', issue_date: '2026-10-01', due_date: '2026-10-15', total: 88 }],
    payments: [],
    period: PERIOD,
  });
  const r = renderStatementText(
    { statementSettings: { header_text: '{{company_name}} statement for {{customer_name}}: {{balance_due}} due ({{period_start}}–{{period_end}})' } },
    { company_name: undefined },
    { ...ctx, company: { name: 'CCS Sign Co' } },
  );
  eq(r.header_text, 'CCS Sign Co statement for Delta Signs: $88.00 due (2026-10-01–2026-10-31)',
    'full token chain on a real context');
}

rmSync(tmpdir, { recursive: true, force: true });
console.log(`PASS statement-depth (${n} assertions)`);
