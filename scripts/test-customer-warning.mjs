// test-customer-warning.mjs — worker w-114 (G-11)
// Asserts customerWarningModel.ts normalizes warning_flags[] storage shapes
// into badge contracts, derives past_due/credit_hold/requires_po from
// account state (arAgingReports open-AR + G-10 poRequirement parity), merges
// stored-over-derived, summarizes worst tone, and writes schema-clean
// set/remove patches.
// Run: node scripts/test-customer-warning.mjs  →  prints PASS

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-warning.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customerWarningModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  WARNING_FLAG_KINDS, WARNING_TONES, WARNING_TONE_SEVERITY,
  normalizeFlagKey, isKnownFlag, warningFlagLabel, warningFlagTone,
  warningBadges, derivedWarningFlags, autoWarningFlags, flagSummary, setFlagPatch,
} = await import(pathToFileURL(out).href);

const AS_OF = '2026-11-02';
const ctx = (extra = {}) => ({ asOf: AS_OF, ...extra });
const inv = (over = {}) => ({
  id: 'i1', customer_id: 'c1', status: 'sent',
  issue_date: '2026-09-01', due_date: '2026-10-01',
  total: 200, balance_due: 150, ...over,
});

// --- registry ----------------------------------------------------------------
assert.deepEqual([...WARNING_FLAG_KINDS].slice(0, 8), [
  'credit_hold', 'tax_exempt_verify', 'bad_debt', 'do_not_quote',
  'vip', 'requires_po', 'past_due', 'custom',
], 'canonical 8-kind set first');
assert.ok(WARNING_FLAG_KINDS.includes('do_not_mail') && WARNING_FLAG_KINDS.includes('tax_expired'),
  'schema-documented extras in registry');
assert.equal(WARNING_TONES.credit_hold, 'red');
assert.equal(WARNING_TONES.bad_debt, 'red');
assert.equal(WARNING_TONES.do_not_quote, 'red');
assert.equal(WARNING_TONES.past_due, 'amber');
assert.equal(WARNING_TONES.tax_exempt_verify, 'amber');
assert.equal(WARNING_TONES.requires_po, 'blue');
assert.equal(WARNING_TONES.vip, 'emerald');
assert.equal(WARNING_TONES.custom, 'slate');
assert.equal(WARNING_TONES.do_not_mail, 'slate');
assert.equal(WARNING_TONES.tax_expired, 'amber');
assert.ok(WARNING_TONE_SEVERITY.red > WARNING_TONE_SEVERITY.amber
  && WARNING_TONE_SEVERITY.amber > WARNING_TONE_SEVERITY.blue
  && WARNING_TONE_SEVERITY.blue > WARNING_TONE_SEVERITY.emerald
  && WARNING_TONE_SEVERITY.emerald > WARNING_TONE_SEVERITY.slate,
  'severity ladder red>amber>blue>emerald>slate');

// --- normalizeFlagKey / isKnownFlag ------------------------------------------
assert.equal(normalizeFlagKey('Credit Hold'), 'credit_hold', 'space → snake + lowercase');
assert.equal(normalizeFlagKey('CREDIT-HOLD'), 'credit_hold', 'dash folds to underscore');
assert.equal(normalizeFlagKey('po_required'), 'requires_po', 'parallel-field alias folds');
assert.equal(normalizeFlagKey('require_purchase_order'), 'requires_po', 'legacy field alias folds');
assert.equal(normalizeFlagKey('OVERDUE'), 'past_due', 'synonym alias');
assert.equal(normalizeFlagKey('collections'), 'bad_debt', 'collections → bad_debt');
assert.equal(normalizeFlagKey({ flag: 'vip' }), 'vip', 'object flag slot');
assert.equal(normalizeFlagKey({ kind: 'past_due' }), 'past_due', 'object kind slot');
assert.equal(normalizeFlagKey({ type: 'do_not_quote' }), 'do_not_quote', 'object type slot');
assert.equal(normalizeFlagKey(''), '');
assert.equal(normalizeFlagKey(null), '');
assert.equal(normalizeFlagKey({}), '');
assert.equal(normalizeFlagKey(' mystery_flag '), 'mystery_flag', 'unknown keeps its key');
assert.equal(isKnownFlag('vip'), true);
assert.equal(isKnownFlag('mystery_flag'), false);

// --- label / tone --------------------------------------------------------------
assert.equal(warningFlagLabel('credit_hold'), 'Credit hold');
assert.equal(warningFlagLabel('requires_po'), 'PO required');
assert.equal(warningFlagLabel('mystery_flag'), 'Mystery Flag', 'unknown title-cases');
assert.equal(warningFlagTone('bad_debt'), 'red');
assert.equal(warningFlagTone('mystery_flag'), 'slate', 'unknown → custom tone');
assert.equal(warningFlagTone(''), 'slate', 'blank → slate');

// --- warningBadges normalization shapes ----------------------------------------
{
  // string[] canonical storage.
  const b1 = warningBadges({ warning_flags: ['credit_hold', 'vip'] });
  assert.equal(b1.length, 2);
  assert.deepEqual(
    b1.map((b) => [b.flag, b.label, b.tone, b.source]),
    [['credit_hold', 'Credit hold', 'red', 'stored'], ['vip', 'VIP', 'emerald', 'stored']],
    'string[] → badge list');
  assert.equal(b1.every((b) => b.known), true);
  assert.equal(b1[0].detail, undefined, 'no detail when absent');

  // object[] tolerated shapes.
  const b2 = warningBadges({
    warning_flags: [
      { flag: 'credit_hold', note: 'Over credit limit' },
      { kind: 'tax_exempt_verify', detail: 'Cert expired 2026-01-01' },
      { type: 'bad_debt', message: 'Sent to collections' },
    ],
  });
  assert.equal(b2.length, 3);
  assert.equal(b2[0].flag, 'credit_hold');
  assert.equal(b2[0].detail, 'Over credit limit', 'object note → detail');
  assert.equal(b2[1].flag, 'tax_exempt_verify');
  assert.equal(b2[1].detail, 'Cert expired 2026-01-01', 'detail slot');
  assert.equal(b2[2].flag, 'bad_debt');
  assert.equal(b2[2].detail, 'Sent to collections', 'message slot');

  // single string + comma-separated.
  const b3 = warningBadges({ warning_flags: 'do_not_quote' });
  assert.equal(b3.length, 1);
  assert.equal(b3[0].flag, 'do_not_quote');
  const b4 = warningBadges({ warning_flags: 'vip, past_due' });
  assert.deepEqual(b4.map((b) => b.flag), ['vip', 'past_due'], 'comma string splits');

  // dedupe on canonical key — alias twins collapse, first wins.
  const b5 = warningBadges({ warning_flags: ['po_required', 'requires_po', 'credit_hold'] });
  assert.equal(b5.length, 2, 'alias twin dedupes');
  assert.equal(b5[0].flag, 'requires_po');
  assert.equal(b5[1].flag, 'credit_hold');

  // bare-string detail from warning_flag_details sidecar.
  const b6 = warningBadges({
    warning_flags: ['credit_hold'],
    warning_flag_details: { credit_hold: { note: 'Hold pending review', set_by: 'a@b', set_at: '2026-10-01' } },
  });
  assert.equal(b6[0].detail, 'Hold pending review', 'sidecar note → detail');

  // unknown flag still renders, flagged known:false; blanks/garbage skipped.
  const b7 = warningBadges({ warning_flags: ['zebra_watch', '', null, {}, 'vip'] });
  assert.deepEqual(b7.map((b) => b.flag), ['zebra_watch', 'vip']);
  assert.equal(b7[0].known, false);
  assert.equal(b7[0].tone, 'slate');

  // null/absent customers never throw.
  assert.deepEqual(warningBadges(null), []);
  assert.deepEqual(warningBadges({}), []);
}

// --- derivedWarningFlags -------------------------------------------------------
{
  // past_due — one open overdue invoice.
  const d1 = derivedWarningFlags({ id: 'c1' }, ctx({ invoices: [inv()] }));
  assert.equal(d1.length, 1);
  assert.equal(d1[0].flag, 'past_due');
  assert.equal(d1[0].tone, 'amber');
  assert.equal(d1[0].source, 'derived');
  assert.match(d1[0].detail, /1 open invoice past due — \$150\.00 total \(oldest due 2026-10-01\)/);

  // multi-invoice aggregation; paid/void/draft/future-due/other-customer skipped.
  const d2 = derivedWarningFlags({ id: 'c1' }, ctx({
    invoices: [
      inv({ id: 'i1', due_date: '2026-09-15', balance_due: 100 }),
      inv({ id: 'i2', due_date: '2026-10-20', balance_due: 250 }),
      inv({ id: 'i3', status: 'paid', balance_due: 0 }),               // paid → not AR
      inv({ id: 'i4', status: 'void', balance_due: 999 }),             // void → not AR
      inv({ id: 'i5', status: 'draft', balance_due: 999 }),            // draft → not billed
      inv({ id: 'i6', due_date: '2026-12-01', balance_due: 999 }),     // not due yet
      inv({ id: 'i7', customer_id: 'c9', balance_due: 999 }),          // other customer
      inv({ id: 'i8', due_date: '2026-10-01', balance_due: 0, total: 50 }), // zero balance
    ],
  }));
  assert.equal(d2.length, 1);
  assert.match(d2[0].detail, /2 open invoices past due — \$350\.00/);
  assert.match(d2[0].detail, /oldest due 2026-09-15/);

  // balance falls back to total − paid when no balance fields.
  const d3 = derivedWarningFlags({ id: 'c1' }, ctx({
    invoices: [{ id: 'i9', customer_id: 'c1', status: 'sent', issue_date: '2026-09-01', due_date: '2026-10-01', total: 100, amount_paid: 40 }],
  }));
  assert.equal(d3.length, 1);
  assert.match(d3[0].detail, /\$60\.00/);

  // no customer id → no attributable invoices; no overdue → no flag.
  assert.equal(derivedWarningFlags({}, ctx({ invoices: [inv()] })).length, 0);
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx()).length, 0);

  // credit_hold — customer boolean, then terms.status spellings.
  assert.equal(derivedWarningFlags({ id: 'c1', credit_hold: true }, ctx())[0].flag, 'credit_hold');
  assert.equal(derivedWarningFlags({ id: 'c1', credit_hold: true }, ctx())[0].tone, 'red');
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx({ creditTerms: { status: 'hold' } }))[0].flag, 'credit_hold');
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx({ creditTerms: { status: 'on_hold' } }))[0].flag, 'credit_hold');
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx({ creditTerms: 'hold' }))[0].flag, 'credit_hold', 'bare status string');
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx({ terms: { status: 'hold', reason: 'Slow pay' } }))[0].detail, 'Slow pay', 'terms alias + reason detail');
  assert.equal(derivedWarningFlags({ id: 'c1' }, ctx({ creditTerms: { status: 'active' } })).length, 0, 'non-hold status derives nothing');

  // requires_po — both parallel fields + note detail.
  const d7 = derivedWarningFlags({ id: 'c1', po_required: true, po_required_note: 'PO on all orders' }, ctx());
  assert.equal(d7[0].flag, 'requires_po');
  assert.equal(d7[0].tone, 'blue');
  assert.equal(d7[0].detail, 'PO on all orders');
  assert.equal(derivedWarningFlags({ id: 'c1', require_purchase_order: true }, ctx())[0].flag, 'requires_po');
  assert.equal(derivedWarningFlags({ id: 'c1', po_required: 'yes' }, ctx()).length, 0, 'non-boolean ignored');
}

// --- autoWarningFlags merge ------------------------------------------------------
{
  // stored wins: stored 'po_required' string suppresses derived requires_po.
  const m1 = autoWarningFlags(
    { id: 'c1', po_required: true, warning_flags: ['po_required'] }, ctx());
  assert.equal(m1.length, 1, 'alias twin suppressed');
  assert.equal(m1[0].flag, 'requires_po');
  assert.equal(m1[0].source, 'stored');

  // derived adds missing alongside stored.
  const m2 = autoWarningFlags(
    { id: 'c1', warning_flags: ['vip'] },
    ctx({ invoices: [inv()], creditTerms: { status: 'hold' } }));
  assert.deepEqual(
    m2.map((b) => [b.flag, b.source]),
    [['vip', 'stored'], ['past_due', 'derived'], ['credit_hold', 'derived']],
    'stored order preserved, derived appended');

  // stored flag kept verbatim when a derived twin exists (its note wins).
  const m3 = autoWarningFlags(
    { id: 'c1', credit_hold: true, warning_flags: [{ flag: 'credit_hold', note: 'Manual hold' }] },
    ctx());
  assert.equal(m3.length, 1);
  assert.equal(m3[0].detail, 'Manual hold', 'stored note wins over derived');

  // nothing stored, nothing derived → empty.
  assert.deepEqual(autoWarningFlags({ id: 'c1' }, ctx()), []);
}

// --- flagSummary ------------------------------------------------------------------
{
  assert.deepEqual(flagSummary({}), { count: 0, highest_tone: null });
  assert.deepEqual(flagSummary(null), { count: 0, highest_tone: null });
  assert.deepEqual(
    flagSummary({ warning_flags: ['vip', 'requires_po', 'past_due'] }),
    { count: 3, highest_tone: 'amber' }, 'worst tone wins');
  assert.deepEqual(
    flagSummary({ warning_flags: ['vip', 'credit_hold'] }),
    { count: 2, highest_tone: 'red' });
  assert.deepEqual(
    flagSummary({ warning_flags: ['vip', 'do_not_mail'] }),
    { count: 2, highest_tone: 'emerald' }, 'emerald outranks slate');
  // accepts a precomputed badge array (merged view).
  const merged = autoWarningFlags(
    { id: 'c1', warning_flags: ['vip'] }, ctx({ invoices: [inv()] }));
  assert.deepEqual(flagSummary(merged), { count: 2, highest_tone: 'amber' });
  // unknown flag counts, stays slate.
  assert.deepEqual(
    flagSummary({ warning_flags: ['mystery_flag'] }),
    { count: 1, highest_tone: 'slate' });
}

// --- setFlagPatch -------------------------------------------------------------------
{
  // add: canonical string appended; details stamped with note/actor/at.
  const p1 = setFlagPatch(
    { warning_flags: ['vip'] }, 'credit_hold',
    { note: 'Over limit', actor_id: 'admin@x.com', now: '2026-11-02T12:00:00Z' });
  assert.deepEqual(p1.warning_flags, ['vip', 'credit_hold']);
  assert.deepEqual(p1.warning_flag_details, {
    credit_hold: { set_by: 'admin@x.com', set_at: '2026-11-02T12:00:00Z', note: 'Over limit' },
  });

  // add without note omits the note key.
  const p2 = setFlagPatch({}, 'past_due', { actor_id: 'a@b', now: '2026-01-01' });
  assert.deepEqual(p2.warning_flags, ['past_due']);
  assert.deepEqual(p2.warning_flag_details, { past_due: { set_by: 'a@b', set_at: '2026-01-01' } });

  // re-adding an existing flag never duplicates but refreshes details.
  const p3 = setFlagPatch({ warning_flags: ['credit_hold'] }, 'credit_hold', { actor_id: 'b@c', now: '2026-02-02' });
  assert.deepEqual(p3.warning_flags, ['credit_hold']);
  assert.equal(p3.warning_flag_details.credit_hold.set_by, 'b@c');

  // alias input stores the canonical key.
  const p4 = setFlagPatch({}, 'po_required', { now: '2026-03-03' });
  assert.deepEqual(p4.warning_flags, ['requires_po']);
  assert.ok(p4.warning_flag_details.requires_po);

  // remove: every matching entry drops (aliases too) + details slot deleted;
  // other entries preserved verbatim (objects keep their shape).
  const before = {
    warning_flags: ['vip', { flag: 'credit_hold', note: 'n' }, 'on_credit_hold', 'past_due'],
    warning_flag_details: { vip: { note: 'keep me' }, credit_hold: { note: 'n' } },
  };
  const p5 = setFlagPatch(before, 'credit_hold', { on: false });
  assert.deepEqual(p5.warning_flags, ['vip', 'past_due'], 'both spellings removed, others verbatim');
  assert.equal(p5.warning_flags[0], 'vip');
  assert.deepEqual(p5.warning_flag_details, { vip: { note: 'keep me' } });

  // remove absent flag → arrays preserved.
  const p6 = setFlagPatch({ warning_flags: ['vip'] }, 'bad_debt', { on: false });
  assert.deepEqual(p6.warning_flags, ['vip']);

  // patch never mutates the source customer.
  const src = { warning_flags: ['vip'], warning_flag_details: { vip: { note: 'x' } } };
  setFlagPatch(src, 'bad_debt', { now: '2026-01-01' });
  assert.deepEqual(src.warning_flags, ['vip']);
  assert.deepEqual(Object.keys(src.warning_flag_details), ['vip']);

  // blank flag throws.
  assert.throws(() => setFlagPatch({}, ''), /warning flag is required/);
  assert.throws(() => setFlagPatch({}, {}), /warning flag is required/);

  // omitted now → ISO stamp generated.
  const p7 = setFlagPatch({}, 'vip', { actor_id: 'a' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(p7.warning_flag_details.vip.set_at));
}

rmSync(out, { force: true });
console.log('PASS customer-warning');
