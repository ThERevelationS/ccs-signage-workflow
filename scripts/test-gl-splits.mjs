import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// I-02 hardening suite — invoice GL income splits model.
// Covers: resolveLineAccount chain (line → part → category → default),
// computeInvoiceSplits grouping/provenance/percent, cent-safe largest-
// remainder discount apportionment (incl. 3-way remainder), fee accrual +
// sign parity, incomeBaseCents balance base (subtotal − discount + fees,
// tax/deposit excluded), splitsBalance, manualSplitOverride validation +
// patch shape, storage round-trip, clearSplitOverride, splitAuditEvent diff.

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-gl-splits.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/glSplitModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  resolveLineAccount, computeInvoiceSplits, incomeBaseCents, splitsBalance,
  manualSplitOverride, clearSplitOverride, splitAuditEvent,
  splitsToStorage, splitsFromStorage, toCents, fromCents,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-02T12:00:00.000Z';
const sumCents = (splits) => splits.reduce((s, r) => s + r.amount_cents, 0);
const byAccount = (splits) => Object.fromEntries(splits.map((s) => [s.account_id, s]));

// --- toCents / fromCents ----------------------------------------------------
assert.equal(toCents(10.005), 1001, 'toCents rounds half-up at the penny');
assert.equal(toCents('2.5'), 250, 'toCents coerces strings');
assert.equal(toCents('junk'), 0, 'toCents non-finite → 0');
assert.equal(fromCents(1234), 12.34, 'fromCents back to dollars');

// --- resolveLineAccount chain ------------------------------------------------
assert.equal(
  resolveLineAccount({ income_account_code: '4050' }, { part: { income_account_code: '4000' }, invoiceDefault: '4999' }),
  '4050', 'line-level income_account_code wins over part + default');
assert.equal(
  resolveLineAccount({ account_id: 'acct-line-9' }, { part: { income_account_id: 'acct-part-1' } }),
  'acct-line-9', 'line account_id beats part.income_account_id');
assert.equal(
  resolveLineAccount({ description: 'x' }, { part: { income_account_id: 'acct-part-1' }, invoiceDefault: '4999' }),
  'acct-part-1', 'part.income_account_id resolves when line carries none');
assert.equal(
  resolveLineAccount({}, { part: { income_account_code: '4100' } }),
  '4100', 'canonical part.income_account_code resolves');
assert.equal(
  resolveLineAccount({}, { part: { income_account: 'Legacy 4200' } }),
  'Legacy 4200', 'legacy part.income_account spelling resolves');
assert.equal(
  resolveLineAccount({}, { part: {}, categoryDefault: '4300', invoiceDefault: '4999' }),
  '4300', 'category default (bare string) beats invoice default');
assert.equal(
  resolveLineAccount({}, { part: {}, categoryDefault: { default_income_account_id: '4350' }, invoiceDefault: '4999' }),
  '4350', 'category default row (default_income_account_id) resolves');
assert.equal(
  resolveLineAccount({}, { invoiceDefault: '4999' }),
  '4999', 'invoice default is the final fallback');
assert.equal(
  resolveLineAccount({ income_account_code: '   ' }, { part: { income_account_code: '' }, invoiceDefault: '4000' }),
  '4000', 'blank/whitespace tiers are skipped down the chain');
assert.equal(resolveLineAccount({}, {}), '', 'fully unresolved → unmapped bucket');
assert.equal(resolveLineAccount('garbage'), '', 'non-object line → unmapped, never throws');

// --- computeInvoiceSplits: grouping + provenance ----------------------------
{
  const inv = { subtotal: 30, line_items: [
    { description: 'a', quantity: 1, unit_price: 10, income_account_code: '4000' },
    { description: 'b', quantity: 1, unit_price: 20, income_account_code: '4000' },
  ] };
  const s = computeInvoiceSplits(inv);
  assert.equal(s.length, 1, 'two lines on one account merge to one split');
  assert.equal(s[0].account_id, '4000');
  assert.equal(s[0].amount_cents, 3000, 'merged amount = Σ line cents');
  assert.equal(s[0].source, 'auto', 'computed splits are source auto');
  assert.equal(s[0].percent, 100, 'sole split = 100%');
  assert.equal(s[0].line_refs.length, 2, 'both contributing lines are referenced');
  assert.deepEqual(s[0].line_refs.map((r) => r.index), [0, 1]);
  assert.ok(s[0].line_refs.every((r) => r.kind === 'line'));
}
{
  const inv = { subtotal: 30, line_items: [
    { description: 'a', quantity: 1, unit_price: 10, income_account_code: '4100' },
    { description: 'b', quantity: 2, unit_price: 10, income_account_code: '4000' },
  ] };
  const s = computeInvoiceSplits(inv);
  assert.equal(s.length, 2, 'distinct accounts → distinct splits');
  assert.deepEqual(s.map((x) => x.account_id), ['4100', '4000'], 'first-seen account order is deterministic');
  assert.equal(byAccount(s)['4000'].amount_cents, 2000, 'qty × unit_price summed');
  assert.equal(byAccount(s)['4000'].percent, 66.6667, 'percent of base, 4-dec');
}
{
  // line_total present → used verbatim (server-stamped shape)
  const s = computeInvoiceSplits({ subtotal: 12.5, line_items: [{ line_total: 12.5, income_account_code: '4000' }] });
  assert.equal(s[0].amount_cents, 1250, 'line_total dollars → cents');
}
{
  // partsByKey map: line.part_id → part.income_account_code
  const s = computeInvoiceSplits(
    { subtotal: 40, line_items: [{ part_id: 'p1', quantity: 1, unit_price: 40 }] },
    { partsByKey: { p1: { id: 'p1', income_account_code: '4550' } } },
  );
  assert.equal(s[0].account_id, '4550', 'part account resolves via partsByKey map');
}
{
  // categoriesByKey: part.part_group_id → category default
  const s = computeInvoiceSplits(
    { subtotal: 40, line_items: [{ part_id: 'p1', quantity: 1, unit_price: 40 }] },
    {
      partsByKey: [{ id: 'p1', part_group_id: 'g1' }],
      categoriesByKey: { g1: { default_income_account_id: '4600' } },
    },
  );
  assert.equal(s[0].account_id, '4600', 'category default resolves through the part group');
}
{
  // default + account name resolution
  const s = computeInvoiceSplits(
    { subtotal: 5, line_items: [{ description: 'x', quantity: 1, unit_price: 5 }] },
    { default_income_account_id: '4999', accountsByKey: [{ code: '4999', name: 'Misc Income' }] },
  );
  assert.equal(s[0].account_id, '4999', 'default_income_account_id is the last resort');
  assert.equal(s[0].account_name, 'Misc Income', 'account_name resolved from accountsByKey');
}
{
  // Map + function forms accepted
  const viaMap = computeInvoiceSplits(
    { subtotal: 8, line_items: [{ part_key: 'k', quantity: 1, unit_price: 8 }] },
    { partsByKey: new Map([['k', { income_account_code: '4010' }]]) },
  );
  assert.equal(viaMap[0].account_id, '4010', 'partsByKey Map form');
  const viaFn = computeInvoiceSplits(
    { subtotal: 8, line_items: [{ sku: 's9', quantity: 1, unit_price: 8 }] },
    { partsByKey: () => ({ income_account_code: '4020' }) },
  );
  assert.equal(viaFn[0].account_id, '4020', 'partsByKey function form');
}

// --- fee lines: accrual + discount sign parity ------------------------------
{
  const inv = {
    subtotal: 100, fee_lines: [{ label: 'Freight', kind: 'shipping', amount: 15, income_account_code: '4300' }],
    line_items: [{ description: 'a', quantity: 1, unit_price: 100, income_account_code: '4000' }],
  };
  const s = byAccount(computeInvoiceSplits(inv));
  assert.equal(s['4300'].amount_cents, 1500, 'shipping fee posts to its own account');
  assert.equal(s['4300'].line_refs[0].kind, 'fee');
  assert.equal(incomeBaseCents(inv), 11500, 'base = subtotal + signed fees');
}
{
  const inv = {
    subtotal: 100, fee_lines: [{ kind: 'discount', amount: 25, income_account_code: '4090' }],
    line_items: [{ description: 'a', quantity: 1, unit_price: 100, income_account_code: '4000' }],
  };
  const s = byAccount(computeInvoiceSplits(inv));
  assert.equal(s['4090'].amount_cents, -2500, 'positive discount amount coerced to canonical negative');
  assert.equal(incomeBaseCents(inv), 7500, 'base reduced by signed discount fee');
  assert.equal(sumCents(computeInvoiceSplits(inv)), incomeBaseCents(inv), 'splits foot to base with fee discount');
}
{
  // fee without account → fee_default → default chain
  const s = byAccount(computeInvoiceSplits(
    {
      subtotal: 10,
      line_items: [{ quantity: 1, unit_price: 10, income_account_code: '4000' }],
      fee_lines: [{ kind: 'postage', amount: 3 }],
    },
    { default_income_account_id: '4999' },
  ));
  assert.equal(s['4999'].amount_cents, 300, 'fee with no account lands on the default');
}

// --- incomeBaseCents: the documented base -----------------------------------
{
  const inv = { subtotal: 100, discount_amount: 10, tax_amount: 8, deposit_applied: 50, total: 48 };
  assert.equal(incomeBaseCents(inv), 9000, 'base = subtotal − discount; tax + deposit are NOT income');
}

// --- flat discount apportionment: largest-remainder --------------------------
{
  // 3-way remainder: $30 across three accounts, 1¢ discount → share 0.333¢
  // each → floors 0, leftover 1 → earliest-seen absorbs the penny.
  const inv = {
    subtotal: 30, discount_amount: 0.01,
    line_items: [
      { quantity: 1, unit_price: 10, income_account_code: 'A' },
      { quantity: 1, unit_price: 10, income_account_code: 'B' },
      { quantity: 1, unit_price: 10, income_account_code: 'C' },
    ],
  };
  const s = computeInvoiceSplits(inv);
  assert.equal(s.length, 3);
  assert.equal(sumCents(s), 2999, 'splits foot exactly to subtotal − 1¢ discount');
  assert.deepEqual(s.map((x) => x.amount_cents), [999, 1000, 1000],
    'leftover penny lands on earliest-seen account (ties → first)');
}
{
  // 2¢ across 3 → shares 0.667 each → two pennies → earliest two absorb.
  const inv = {
    subtotal: 30, discount_amount: 0.02,
    line_items: [
      { quantity: 1, unit_price: 10, income_account_code: 'A' },
      { quantity: 1, unit_price: 10, income_account_code: 'B' },
      { quantity: 1, unit_price: 10, income_account_code: 'C' },
    ],
  };
  assert.deepEqual(computeInvoiceSplits(inv).map((x) => x.amount_cents), [999, 999, 1000],
    'two leftover pennies distribute one each, first-seen order');
}
{
  // Uneven weights: 100/200/700, discount 10¢ → shares 1/2/7 exact → no drift.
  const inv = {
    subtotal: 1000, discount_amount: 0.10,
    line_items: [
      { quantity: 1, unit_price: 100, income_account_code: 'A' },
      { quantity: 1, unit_price: 200, income_account_code: 'B' },
      { quantity: 1, unit_price: 700, income_account_code: 'C' },
    ],
  };
  assert.deepEqual(computeInvoiceSplits(inv).map((x) => x.amount_cents), [9999, 19998, 69993],
    'pro-rata shares 1/2/7¢ exact; Σ = base');
}
{
  // Dedicated discount account → whole discount posts there, line splits intact.
  const inv = {
    subtotal: 100, discount_amount: 10,
    line_items: [{ quantity: 1, unit_price: 100, income_account_code: '4000' }],
  };
  const s = byAccount(computeInvoiceSplits(inv, { discount_account_id: '4090' }));
  assert.equal(s['4000'].amount_cents, 10000, 'line account keeps full revenue');
  assert.equal(s['4090'].amount_cents, -1000, 'discount posts as its own contra split');
  assert.equal(s['4090'].line_refs[0].kind, 'discount');
  assert.equal(sumCents(Object.values(s)), 9000, 'still foots to base');
}
{
  // Discount with no positive line revenue → fallback bucket.
  const inv = { subtotal: 0, discount_amount: 5, line_items: [] };
  const s = computeInvoiceSplits(inv, { default_income_account_id: '4999' });
  assert.equal(s.length, 1);
  assert.equal(s[0].account_id, '4999');
  assert.equal(s[0].amount_cents, -500, 'unabsorbable discount posts to the default bucket');
}

// --- drift repair -------------------------------------------------------------
{
  // line_total says 10 but subtotal says 12 → residual pushed to largest split.
  const inv = { subtotal: 12, line_items: [{ line_total: 10, income_account_code: '4000' }] };
  const s = computeInvoiceSplits(inv);
  assert.equal(sumCents(s), 1200, 'residual drift repaired onto the largest split');
}
{
  // Zero-amount rows dropped
  const s = computeInvoiceSplits({ subtotal: 0, line_items: [{ quantity: 1, unit_price: 0, income_account_code: '4000' }] });
  assert.deepEqual(s, [], 'rows netting to 0¢ are dropped');
}
{
  // Garbage invoice → empty splits, never throws
  assert.deepEqual(computeInvoiceSplits(null), []);
  assert.deepEqual(computeInvoiceSplits({ line_items: 'garbage' }), []);
}

// --- splitsBalance -------------------------------------------------------------
{
  const inv = { subtotal: 50 };
  assert.deepEqual(splitsBalance(inv, [{ account_id: '4000', amount_cents: 5000 }]),
    { ok: true, delta_cents: 0, base_cents: 5000, splits_cents: 5000 }, 'balanced splits → ok');
  const b = splitsBalance(inv, [{ account_id: '4000', amount_cents: 4999 }]);
  assert.equal(b.ok, false);
  assert.equal(b.delta_cents, -1, 'delta = splits − base');
  assert.equal(splitsBalance(inv, [{ income_account_code: '4000', amount: 50 }]).ok, true,
    'stored-shape rows balance too');
}

// --- manualSplitOverride --------------------------------------------------------
{
  const inv = { id: 'inv1', invoice_number: 'INV-1', subtotal: 100 };
  const r = manualSplitOverride(inv,
    [{ account_id: '4000', amount_cents: 6000 }, { income_account_code: '4100', amount: 40 }],
    { actor_id: 'brett@x.com', now: NOW, reason: 'reclass install revenue' });
  assert.equal(r.ok, true, 'balanced manual override allowed');
  assert.equal(r.patch.splits_override, true);
  assert.equal(r.patch.splits_override_by, 'brett@x.com');
  assert.equal(r.patch.splits_override_at, NOW);
  assert.equal(r.patch.splits_override_reason, 'reclass install revenue');
  assert.deepEqual(r.patch.income_account_splits, [
    { income_account_code: '4000', amount: 60 },
    { income_account_code: '4100', amount: 40 },
  ], 'patch stores canonical {income_account_code, amount} rows');
  assert.ok(r.splits.every((s) => s.source === 'manual'), 'rich rows stamped manual');
  assert.equal(byAccount(r.splits)['4000'].percent, 60, 'percent recomputed on manual rows');
}
{
  const inv = { subtotal: 100 };
  const r = manualSplitOverride(inv, [{ account_id: '4000', amount_cents: 9000 }], { actor_id: 'a', now: NOW });
  assert.equal(r.ok, false, 'unbalanced override rejected');
  assert.equal(r.error, 'unbalanced_splits');
  assert.equal(r.delta_cents, -1000);
  assert.equal(r.patch, undefined, 'no patch emitted on rejection');
}
{
  const inv = { subtotal: 100 };
  const r = manualSplitOverride(inv, [{ amount_cents: 10000 }], { actor_id: 'a', now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'invalid_split_row', 'row without an account is rejected');
  const r2 = manualSplitOverride(inv, 'garbage', { actor_id: 'a', now: NOW });
  assert.equal(r2.ok, false);
  assert.equal(r2.error, 'invalid_splits', 'non-array input rejected');
}
{
  // Duplicate accounts merge; empty base + empty splits is balanced.
  const inv = { subtotal: 0 };
  const r = manualSplitOverride(inv, [], { actor_id: 'a', now: NOW });
  assert.equal(r.ok, true, 'empty manual splits on a zero base are legal');
  assert.deepEqual(r.patch.income_account_splits, []);
  const inv2 = { subtotal: 50 };
  const r2 = manualSplitOverride(inv2,
    [{ account_id: '4000', amount_cents: 3000 }, { account_id: '4000', amount_cents: 2000 }],
    { actor_id: 'a', now: NOW });
  assert.equal(r2.ok, true);
  assert.equal(r2.patch.income_account_splits.length, 1, 'duplicate accounts merge into one stored row');
  assert.equal(r2.patch.income_account_splits[0].amount, 50);
}

// --- storage round-trip ---------------------------------------------------------
{
  const inv = { subtotal: 75, income_account_splits: [{ income_account_code: '4000', amount: 75 }], splits_override: true };
  const rich = splitsFromStorage(inv);
  assert.equal(rich[0].account_id, '4000');
  assert.equal(rich[0].amount_cents, 7500);
  assert.equal(rich[0].source, 'manual', 'splits_override:true → source manual on rehydrate');
  assert.equal(rich[0].percent, 100);
  assert.deepEqual(splitsToStorage(rich), [{ income_account_code: '4000', amount: 75 }], 'storage round-trip is lossless');
  assert.deepEqual(splitsToStorage([{ account_id: '4000', amount_cents: 0 }]), [], 'zero rows not persisted');
}

// --- clearSplitOverride ----------------------------------------------------------
{
  const inv = {
    subtotal: 20, splits_override: true,
    income_account_splits: [{ income_account_code: '4999', amount: 20 }],
    line_items: [{ quantity: 1, unit_price: 20, income_account_code: '4000' }],
  };
  const { patch } = clearSplitOverride(inv, {}, { actor_id: 'a', now: NOW });
  assert.equal(patch.splits_override, false);
  assert.deepEqual(patch.income_account_splits, [{ income_account_code: '4000', amount: 20 }],
    'clear recomputes auto splits');
}

// --- splitAuditEvent ---------------------------------------------------------------
{
  const inv = { id: 'inv7', invoice_number: 'INV-7' };
  const ev = splitAuditEvent(inv,
    [{ income_account_code: '4000', amount: 100 }],
    [
      { account_id: '4000', amount_cents: 6000, account_name: 'Sales' },
      { account_id: '4100', amount_cents: 4000 },
    ],
    { actor_id: 'brett@x.com', now: NOW });
  assert.equal(ev.event_type, 'invoice_income_splits_changed');
  assert.equal(ev.entity_id, 'inv7');
  assert.equal(ev.has_changes, true);
  assert.equal(ev.actor_id, 'brett@x.com');
  assert.equal(ev.occurred_at, NOW);
  assert.deepEqual(ev.added.map((a) => a.account_id), ['4100'], 'added account reported');
  assert.equal(ev.added[0].after_cents, 4000);
  assert.equal(ev.changed.length, 1);
  assert.equal(ev.changed[0].account_id, '4000');
  assert.equal(ev.changed[0].before_cents, 10000);
  assert.equal(ev.changed[0].after_cents, 6000);
  assert.equal(ev.changed[0].delta_cents, -4000);
  assert.deepEqual(ev.removed, [], 'nothing removed');
  assert.equal(ev.before_total_cents, 10000);
  assert.equal(ev.after_total_cents, 10000);
  assert.match(ev.summary, /\+4100 \$40\.00/, 'summary marks added splits');
  assert.match(ev.summary, /~4000 \$100\.00→\$60\.00/, 'summary marks changed splits');
}
{
  const ev = splitAuditEvent({ id: 'i' },
    [{ income_account_code: '4000', amount: 50 }, { income_account_code: '4200', amount: 10 }],
    [{ income_account_code: '4000', amount: 50 }],
    { actor_id: 'a', now: NOW });
  assert.equal(ev.removed.length, 1);
  assert.equal(ev.removed[0].account_id, '4200');
  assert.equal(ev.removed[0].before_cents, 1000);
  assert.match(ev.summary, /−4200 \$10\.00/, 'summary marks removed splits');
}
{
  const same = [{ income_account_code: '4000', amount: 50 }];
  const ev = splitAuditEvent({}, same, [{ account_id: '4000', amount_cents: 5000 }], { actor_id: 'a', now: NOW });
  assert.equal(ev.has_changes, false, 'identical postings → no-op event');
  assert.equal(ev.summary, 'GL splits: no posting change');
}

rmSync(out, { force: true });
console.log('PASS gl-splits');
