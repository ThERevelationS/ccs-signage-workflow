import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-followups.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/comms/followupModel.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
buildSync({ entryPoints: [resolve(here, '../src/components/comms/emailTemplates.js')], bundle: true, format: 'esm', outfile: resolve(here, '.tmp-followup-templates.mjs'), logLevel: 'silent' });
const {
  FOLLOWUP_KINDS,
  FOLLOWUP_SECTIONS,
  DEFAULT_FOLLOWUP_RULES,
  normalizeFollowupRules,
  isQuoteEligible,
  isInvoiceEligible,
  quoteSentMs,
  followupLogMarker,
  hasFollowupLog,
  findDueFollowups,
  groupDueFollowups,
} = await import(pathToFileURL(out).href);
const { renderTemplate, FOLLOWUP_TEMPLATES } = await import(pathToFileURL(resolve(here, '.tmp-followup-templates.mjs')).href);

const DAY = 86400000;
const NOW = new Date('2026-02-20T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString().slice(0, 10);
const est = (over = {}) => ({
  id: 'est1', status: 'sent', quote_issue_date: daysAgo(10),
  estimate_number: 'EST-1042', client_name: 'Acme Signs', customer_id: 'cust1',
  contact_name: 'Amy', contact_email: 'amy@acme.test', opportunity_id: 'opp1',
  work_order_id: '', quote_total: 1250, ...over,
});
const inv = (over = {}) => ({
  id: 'inv1', status: 'sent', due_date: daysAgo(15),
  invoice_number: 'INV-77', customer_display_name: 'Beta Co', customer_id: 'cust2',
  opportunity_id: 'opp2', balance_due: 800, total: 1600, ...over,
});
const log = (kind, targetId, over = {}) => ({
  id: 'act1', event_type: 'E-Mail: Follow Up', source: 'auto_followup',
  details: { followup_kind: kind, followup_target_id: targetId }, ...over,
});
const kinds = (rows) => rows.map((r) => r.kind).sort();

// --- Rule normalization ------------------------------------------------------
assert.deepEqual(normalizeFollowupRules(), DEFAULT_FOLLOWUP_RULES, 'blank rules fall back to defaults');
assert.deepEqual(normalizeFollowupRules(null), DEFAULT_FOLLOWUP_RULES);
assert.deepEqual(normalizeFollowupRules({ quote1: 5 }), { ...DEFAULT_FOLLOWUP_RULES, quote1: 5 }, 'every threshold is injectable');
assert.deepEqual(normalizeFollowupRules({ quote1: -4, inv2: 'x', quote2: 2.9 }), { quote1: 3, quote2: 2, inv1: 1, inv2: 14 }, 'invalid thresholds fall back; fractional floors');
assert.equal(normalizeFollowupRules({ inv1: 0 }).inv1, 0, 'zero is a valid same-day threshold');

// --- Eligibility ---------------------------------------------------------------
assert.equal(isQuoteEligible(est()), true, 'sent quote needs follow-up');
assert.equal(isQuoteEligible(est({ status: 'approved' })), false, 'approved quote is never chased');
assert.equal(isQuoteEligible(est({ accepted_at: '2026-02-19T00:00:00Z' })), false, 'accepted quote is never chased');
for (const s of ['draft', 'calculated', 'archived', 'cancelled']) {
  assert.equal(isQuoteEligible(est({ status: s })), false, `${s} quote excluded`);
}
assert.equal(isInvoiceEligible(inv()), true, 'open balance on sent invoice is AR');
assert.equal(isInvoiceEligible(inv({ balance_due: 0 })), false, 'zero balance gate');
assert.equal(isInvoiceEligible(inv({ balance_due: -5 })), false, 'credit balance gate');
assert.equal(isInvoiceEligible(inv({ status: 'partially_paid', balance_due: 200 })), true, 'partial pays still open');
for (const s of ['draft', 'paid', 'void']) {
  assert.equal(isInvoiceEligible(inv({ status: s, balance_due: 500 })), false, `${s} invoice excluded even with a balance`);
}

// --- Quote stage thresholds ------------------------------------------------------
const run = (over = {}) => findDueFollowups({ now: NOW, ...over });

assert.deepEqual(kinds(run({ estimates: [est({ quote_issue_date: daysAgo(2) })] })), [], 'day 2 < quote1=3: nothing due');
assert.deepEqual(kinds(run({ estimates: [est({ quote_issue_date: daysAgo(3) })] })), ['quote_followup_1'], 'day 3: stage-1 due');
assert.deepEqual(
  kinds(run({ estimates: [est({ quote_issue_date: daysAgo(10) })] })),
  ['quote_followup_1', 'quote_followup_2'],
  'day 10 ≥ quote2=7: both stages due',
);
assert.deepEqual(
  kinds(run({ estimates: [est({ quote_issue_date: daysAgo(5) })], rules: { quote1: 10, quote2: 30 } })),
  [], 'injected thresholds shift both stages',
);
assert.deepEqual(
  kinds(run({ estimates: [est({ quote_issue_date: daysAgo(5) })], rules: { quote1: 10, quote2: 4 } })),
  ['quote_followup_2'], 'each stage reads its own threshold',
);
assert.deepEqual(kinds(run({ estimates: [est({ quote_issue_date: '' })] })), [], 'unsent-stamped quote skipped');
assert.equal(quoteSentMs(est({ sent_date: '2026-02-10', quote_issue_date: '' })), Date.parse('2026-02-10T00:00:00Z'), 'sent_date fallback');

const due1 = run({ estimates: [est({ quote_issue_date: daysAgo(10) })] });
const q1 = due1.find((r) => r.kind === 'quote_followup_1');
assert.equal(q1.targetId, 'est1');
assert.equal(q1.customerId, 'cust1');
assert.equal(q1.targetRef, 'EST-1042');
assert.equal(q1.daysOverdue, 7, 'stage-1 was due on day 3, so 7 days overdue on day 10');
assert.equal(q1.daysSinceSent, 10);
assert.equal(q1.dueDate, daysAgo(7));
assert.equal(q1.stage, 1);
assert.equal(q1.target, 'quote');
assert.ok(q1.suggestedSubject.includes('EST-1042'), 'suggestion merges estimate number');
assert.ok(q1.suggestedBody.includes('Acme Signs'), 'suggestion merges customer name');
assert.ok(!/\{\{/.test(q1.suggestedSubject + q1.suggestedBody), 'no raw merge fields leak');

// --- Quote dedupe ------------------------------------------------------------------
assert.deepEqual(
  kinds(run({ estimates: [est({ quote_issue_date: daysAgo(10) })], activities: [log('quote_followup_1', 'est1')] })),
  ['quote_followup_2'],
  'a logged stage-1 suppresses stage-1 only',
);
assert.deepEqual(
  kinds(run({
    estimates: [est({ quote_issue_date: daysAgo(10) })],
    activities: [log('quote_followup_1', 'est1'), log('quote_followup_2', 'est1', { id: 'act2', details: { followup_kind: 'quote_followup_2', followup_target_id: 'est1' } })],
  })),
  [], 'both stages logged: fully handled',
);
assert.deepEqual(
  kinds(run({ estimates: [est({ quote_issue_date: daysAgo(10) })], activities: [log('quote_followup_1', 'est-other')] })),
  ['quote_followup_1', 'quote_followup_2'],
  'a log for a different target does not dedupe',
);
assert.equal(hasFollowupLog([log('quote_followup_1', 'est1')], 'quote_followup_1', 'est1'), true);
assert.equal(hasFollowupLog([log('quote_followup_1', 'est1')], 'quote_followup_2', 'est1'), false);
assert.equal(followupLogMarker({ event_type: 'created', summary: 'audit' }), null, 'audit rows are not follow-up logs');
assert.equal(followupLogMarker({ details: { followup_kind: 'nope', followup_target_id: 'est1' } }), null, 'unknown kinds ignored');
assert.equal(followupLogMarker({ details: { followup_kind: 'quote_followup_1' } }), null, 'missing target ignored');

// --- Invoice thresholds + gates ------------------------------------------------------
assert.deepEqual(kinds(run({ invoices: [inv({ due_date: daysAgo(1) })] })), ['invoice_overdue_1'], 'inv1=1: one day past due triggers stage-1');
assert.deepEqual(kinds(run({ invoices: [inv({ due_date: daysAgo(0) })] })), [], 'due today is not past due');
assert.deepEqual(kinds(run({ invoices: [inv({ due_date: daysAgo(15) })] })), ['invoice_overdue_1', 'invoice_overdue_2'], 'day 15 ≥ inv2=14: both notices due');
assert.deepEqual(kinds(run({ invoices: [inv({ due_date: daysAgo(15), balance_due: 0 })] })), [], 'balance>0 gate suppresses settled invoices');
assert.deepEqual(
  kinds(run({ invoices: [inv({ due_date: daysAgo(15) })], activities: [log('invoice_overdue_1', 'inv1')] })),
  ['invoice_overdue_2'], 'sent 1st notice dedupes; 2nd remains',
);
const i1 = run({ invoices: [inv({ due_date: daysAgo(15) })] }).find((r) => r.kind === 'invoice_overdue_1');
assert.equal(i1.daysPastDue, 15);
assert.equal(i1.daysOverdue, 14);
assert.equal(i1.dueDate, daysAgo(14));
assert.equal(i1.balance, 800);
assert.ok(i1.suggestedSubject.includes('INV-77'));
assert.ok(i1.suggestedBody.includes('$800.00'), 'balance merges as currency');

// --- Ordering ---------------------------------------------------------------------------
const mixed = run({
  estimates: [est({ id: 'e-new', quote_issue_date: daysAgo(3), estimate_number: 'EST-2' })],
  invoices: [inv({ id: 'i-old', due_date: daysAgo(15), invoice_number: 'INV-9' })],
});
assert.equal(mixed[0].kind, 'invoice_overdue_1', 'most-overdue follow-up sorts first');
assert.equal(mixed[0].daysOverdue >= mixed[1].daysOverdue, true, 'descending daysOverdue order');

const grouped = groupDueFollowups(run({
  estimates: [est({ quote_issue_date: daysAgo(10) })],
  invoices: [inv({ due_date: daysAgo(15) })],
}));
assert.equal(grouped.quote_1.length, 1);
assert.equal(grouped.quote_2.length, 1);
assert.equal(grouped.invoice_1.length, 1);
assert.equal(grouped.invoice_2.length, 1);
assert.deepEqual(FOLLOWUP_SECTIONS, ['quote_1', 'quote_2', 'invoice_1', 'invoice_2']);
assert.equal(FOLLOWUP_KINDS.length, 4);

// --- Templates ------------------------------------------------------------------------------
assert.equal(renderTemplate('Hi {{customer_name}}!', { customer_name: 'Acme' }), 'Hi Acme!');
assert.equal(renderTemplate('{{ customer_name }} / {{ missing }}', { customer_name: 'Acme' }), 'Acme / ', 'spaced keys render; missing keys render empty');
assert.equal(renderTemplate('{{balance}}', { balance: 0 }), '0', 'numeric zero renders');
assert.equal(renderTemplate(null, {}), '', 'blank template is safe');
assert.equal(renderTemplate('plain text'), 'plain text');
for (const kind of FOLLOWUP_KINDS) {
  assert.ok(FOLLOWUP_TEMPLATES[kind]?.subject && FOLLOWUP_TEMPLATES[kind]?.body, `template exists for ${kind}`);
}

console.log('PASS followups (rules, eligibility, stage thresholds, dedupe, balance gate, ordering, templates)');
