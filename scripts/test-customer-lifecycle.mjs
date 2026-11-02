import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-customer-lifecycle.mjs');
// The frontend wrapper is the consumer surface: bundling it proves the
// shared-module import chain resolves end to end.
buildSync({
  entryPoints: [resolve(here, '../src/components/customer360/customerLifecycleModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  LIFECYCLE_STATUSES,
  normalizeLifecycle,
  customerLifecycleStatus,
  lastActivityAt,
  lastActivitySummary,
  activityMapByCustomerId,
  resolveAutoInactiveMonths,
  monthsAgo,
  shouldAutoInactivate,
  sweepPlan,
  AUTO_INACTIVE_REASONS,
} = await import(pathToFileURL(out).href);

// --- Vocabulary + normalization ---------------------------------------------
assert.deepEqual([...LIFECYCLE_STATUSES], ['Lead', 'Prospect', 'Active', 'Inactive']);
assert.equal(normalizeLifecycle('Active'), 'Active');
assert.equal(normalizeLifecycle('active'), 'Active', 'stored lowercase maps up');
assert.equal(normalizeLifecycle('  PROSPECT '), 'Prospect', 'trim + case fold');
assert.equal(normalizeLifecycle('inactive'), 'Inactive');
assert.equal(normalizeLifecycle('lead'), 'Lead');
assert.equal(normalizeLifecycle('vip'), 'Lead', 'unknown falls back to Lead');
assert.equal(normalizeLifecycle(''), 'Lead');
assert.equal(normalizeLifecycle(null), 'Lead');
assert.equal(normalizeLifecycle(undefined), 'Lead');
assert.equal(customerLifecycleStatus({ customer_status: 'active' }), 'Active');
assert.equal(customerLifecycleStatus({ status: 'inactive' }), 'Inactive', 'status alias');
assert.equal(customerLifecycleStatus({}), 'Lead', 'absent status → Lead');

// --- lastActivityAt ----------------------------------------------------------
{
  // Max across record kinds: a 2026 invoice beats older WO/customer dates.
  const at = lastActivityAt({
    customer: { created_date: '2024-01-01', last_contacted_at: '2025-02-01T00:00:00Z' },
    workOrders: [{ created_date: '2025-06-01T12:00:00Z' }, { created_date: '2024-03-01' }],
    invoices: [{ issue_date: '2026-02-10T00:00:00Z' }],
    opportunities: [{ last_activity_at: '2025-09-15T00:00:00Z' }],
  });
  assert.equal(at, '2026-02-10T00:00:00.000Z');
}
{
  // WO date_order_created + opportunity updated_date count as activity.
  const at = lastActivityAt({
    workOrders: [{ date_order_created: '2025-05-05' }],
    opportunities: [{ updated_date: '2025-08-08T10:00:00Z' }],
  });
  assert.equal(at, '2025-08-08T10:00:00.000Z');
}
assert.equal(lastActivityAt({}), null, 'no inputs → null');
assert.equal(lastActivityAt({ customer: {} }), null);
assert.equal(
  lastActivityAt({ workOrders: [{ created_date: 'not-a-date' }] }),
  null,
  'unparseable dates are skipped',
);
{
  const summary = lastActivitySummary({
    invoices: [{ paid_date: '2026-01-20T00:00:00Z' }],
    workOrders: [{ created_date: '2026-01-25T00:00:00Z' }],
  });
  assert.equal(summary.last_activity_at, '2026-01-25T00:00:00.000Z');
  assert.equal(summary.winner.kind, 'work_order');
  assert.equal(summary.sources.invoice.at, '2026-01-20T00:00:00.000Z');
  assert.equal(summary.sources.opportunity, null);
}
{
  // activityMapByCustomerId folds rows under customer_id, keeping the max.
  const map = activityMapByCustomerId({
    customers: [{ id: 'c1', created_date: '2024-01-01' }],
    workOrders: [
      { customer_id: 'c1', created_date: '2025-01-01T00:00:00Z' },
      { customer_id: 'c1', completed_date: '2025-07-01T00:00:00Z' },
      { customer_id: 'c2', created_date: '2025-03-01T00:00:00Z' },
    ],
    invoices: [{ customer_id: 'c1', sent_date: '2025-04-01T00:00:00Z' }],
  });
  assert.equal(new Date(map.c1).toISOString(), '2025-07-01T00:00:00.000Z');
  assert.equal(new Date(map.c2).toISOString(), '2025-03-01T00:00:00.000Z');
}

// --- Window resolution -------------------------------------------------------
assert.equal(resolveAutoInactiveMonths({ auto_inactive_months: 4 }, 6), 4);
assert.equal(resolveAutoInactiveMonths({ auto_inactive_after_months: 9 }, 6), 9);
assert.equal(resolveAutoInactiveMonths({ auto_inactive_months: 3, auto_inactive_after_months: 9 }, 6), 3,
  'masterplan field wins over the entity field');
assert.equal(resolveAutoInactiveMonths({}, 6), 6, 'absent customer value → default');
assert.equal(resolveAutoInactiveMonths({ auto_inactive_months: 0 }, 6), 6,
  'explicit 0 falls through to the shop default — opt-out is the flag');
assert.equal(resolveAutoInactiveMonths({}, 0), 0);
assert.equal(resolveAutoInactiveMonths({}, undefined), 0);

// --- monthsAgo ---------------------------------------------------------------
assert.equal(monthsAgo('2026-06-15T00:00:00Z', 6)?.toISOString().slice(0, 10), '2025-12-15');
assert.equal(monthsAgo('2026-01-31', 1)?.getDate(), 31, 'month-end clamps, does not roll over');
assert.equal(monthsAgo('garbage', 3), null);

// --- shouldAutoInactivate ----------------------------------------------------
{
  const r = shouldAutoInactivate({
    customer: {},
    lastActivity: '2025-01-01T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 6,
  });
  assert.deepEqual(r, { inactivate: true, months: 6, reason: 'past_inactivity_window' });
}
{
  const r = shouldAutoInactivate({
    customer: {},
    lastActivity: '2026-05-01T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 6,
  });
  assert.equal(r.inactivate, false);
  assert.equal(r.reason, 'within_window');
}
{
  // Per-customer window beats the shop default.
  const r = shouldAutoInactivate({
    customer: { auto_inactive_months: 2 },
    lastActivity: '2026-03-01T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 12,
  });
  assert.equal(r.inactivate, true);
  assert.equal(r.months, 2);
}
{
  // Entity-declared field name also resolves.
  const r = shouldAutoInactivate({
    customer: { auto_inactive_after_months: 1 },
    lastActivity: '2026-04-20T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 0,
  });
  assert.equal(r.inactivate, true);
  assert.equal(r.months, 1);
}
{
  // Disabled flag is the per-customer opt-out — wins over every window.
  const r = shouldAutoInactivate({
    customer: { auto_inactive_disabled: true, auto_inactive_months: 1 },
    lastActivity: '2020-01-01T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 6,
  });
  assert.equal(r.inactivate, false);
  assert.equal(r.reason, AUTO_INACTIVE_REASONS.DISABLED_FLAG);
}
{
  // No resolved window → never.
  const r = shouldAutoInactivate({
    customer: {},
    lastActivity: '2001-01-01T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 0,
  });
  assert.equal(r.inactivate, false);
  assert.equal(r.months, 0);
  assert.equal(r.reason, 'no_window');
}
{
  // No parseable activity → never (cannot prove the window elapsed).
  const r = shouldAutoInactivate({
    customer: { auto_inactive_months: 6 },
    lastActivity: null,
    now: '2026-06-15T00:00:00Z',
  });
  assert.equal(r.inactivate, false);
  assert.equal(r.reason, 'no_activity');
}
{
  // Boundary: activity exactly `months` ago has elapsed the full window.
  const r = shouldAutoInactivate({
    customer: {},
    lastActivity: '2025-12-15T00:00:00Z',
    now: '2026-06-15T00:00:00Z',
    defaultMonths: 6,
  });
  assert.equal(r.inactivate, true, 'at the cutoff the window has elapsed');
}

// --- sweepPlan ---------------------------------------------------------------
{
  const customers = [
    { id: 'stale', customer_status: 'active' },
    { id: 'fresh', customer_status: 'active' },
    { id: 'prosp', customer_status: 'prospect' },
    { id: 'gone', customer_status: 'active', merged_into_customer_id: 'other' },
    { id: 'exempt', customer_status: 'active', auto_inactive_disabled: true },
  ];
  const activityById = {
    stale: '2025-01-01T00:00:00Z',
    fresh: '2026-06-01T00:00:00Z',
    prosp: '2000-01-01T00:00:00Z',
    gone: '2000-01-01T00:00:00Z',
    exempt: '2000-01-01T00:00:00Z',
  };
  const plan = sweepPlan(customers, { activityById, now: '2026-06-15T00:00:00Z', defaultMonths: 6 });
  assert.equal(plan.length, 1, 'only the stale Active customer is planned');
  assert.equal(plan[0].customer_id, 'stale');
  assert.equal(plan[0].from_status, 'Active');
  assert.equal(plan[0].reason, 'past_inactivity_window');
}
{
  // Customer-level dates are the fallback when the activity map has no entry.
  const plan = sweepPlan(
    [{ id: 'c', customer_status: 'active', created_date: '2020-01-01T00:00:00Z' }],
    { activityById: {}, now: '2026-06-15T00:00:00Z', defaultMonths: 6 },
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].last_activity_at, '2020-01-01T00:00:00.000Z');
}
{
  const plan = sweepPlan(null, { now: '2026-06-15', defaultMonths: 6 });
  assert.deepEqual(plan, []);
}

// --- entry.ts + wrapper source shape -----------------------------------------
const entrySrc = readFileSync(resolve(here, '../base44/functions/manageCustomerLifecycle/entry.ts'), 'utf8');
assert.ok(entrySrc.includes("action === 'sweep_auto_inactive'"), 'sweep action present');
assert.ok(entrySrc.includes("action === 'get_lifecycle'"), 'get_lifecycle action present');
assert.ok(entrySrc.includes('authenticateSignShopSession'), 'session auth');
assert.ok(entrySrc.includes('asServiceRole.entities.Customer'), 'service-role Customer');
assert.ok(entrySrc.includes("customer_status: 'inactive'"), 'stores lowercase inactive');
assert.ok(entrySrc.includes('dry_run'), 'dry_run flag');
assert.ok(entrySrc.includes('months_default'), 'months_default param');
assert.ok(entrySrc.includes('results') && entrySrc.includes('failures'), 'per-row results/failures');
assert.ok(entrySrc.includes("from '../../shared/customerLifecycleRules.ts'"), 'canonical shared import');
assert.ok(entrySrc.includes('isAdmin') && entrySrc.includes('403'), 'write path is admin-gated');

const wrapperSrc = readFileSync(resolve(here, '../src/components/customer360/customerLifecycleModel.js'), 'utf8');
assert.ok(
  wrapperSrc.includes("../../../base44/shared/customerLifecycleRules.ts"),
  'frontend wrapper re-exports the canonical shared module',
);

const jsonc = JSON.parse(
  readFileSync(resolve(here, '../base44/functions/manageCustomerLifecycle/function.jsonc'), 'utf8'),
);
assert.equal(jsonc.name, 'manageCustomerLifecycle');
assert.equal(jsonc.entry, 'entry.ts');

rmSync(out, { force: true });
console.log('PASS customer-lifecycle');
