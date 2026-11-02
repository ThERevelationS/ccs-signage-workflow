import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import {
  activityMapByCustomerId,
  customerLifecycleStatus,
  lastActivitySummary,
  resolveAutoInactiveMonths,
  shouldAutoInactivate,
  sweepPlan,
} from '../../shared/customerLifecycleRules.ts';

// Session-authenticated gateway for customer lifecycle maintenance (masterplan
// G-03). Customer has backend-only RLS, so staff-facing lifecycle reads and
// the auto-inactive sweep flow through here. The rules are the canonical pure
// module in base44/shared/customerLifecycleRules.ts — the frontend
// customerLifecycleModel re-exports the same logic so a dry-run plan shown to
// staff is exactly what the write path executes.
//
// Actions:
//   sweep_auto_inactive { dry_run?, months_default? }
//     Plans Active → Inactive transitions for customers whose inactivity
//     window elapsed (per-customer auto_inactive_months /
//     auto_inactive_after_months, else months_default; the
//     auto_inactive_disabled flag exempts a customer). dry_run returns the
//     plan without writes; otherwise each row is updated individually with
//     per-row errors surfaced in failures[] — a mass write is admin-gated.
//   get_lifecycle { customer_id, months_default? }
//     Returns the customer's normalized lifecycle status plus its computed
//     last-activity summary (per record-kind newest hit) and the
//     auto-inactivate verdict under the given default.

const clean = (value: any) => String(value ?? '').trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, statusCode: status });

// Projected reads keep entity-list volume under the app read cap — every
// field the rules touch is named, including the undeclared stored fields the
// sweep introduces (auto_inactive_months, auto_inactive_disabled).
const CUSTOMER_FIELDS = [
  'id', 'company_name', 'customer_status',
  'auto_inactive_months', 'auto_inactive_after_months', 'auto_inactive_disabled',
  'last_contacted_at', 'created_date', 'merged_into_customer_id',
];
const WORK_ORDER_FIELDS = [
  'id', 'customer_id', 'created_date', 'date_order_created',
  'sales_last_activity_at', 'completed_date', 'close_date',
];
const INVOICE_FIELDS = [
  'id', 'customer_id', 'created_date', 'issue_date', 'sent_date', 'paid_date',
];
const OPPORTUNITY_FIELDS = [
  'id', 'customer_id', 'last_activity_at', 'updated_date', 'created_date',
];

const isAdmin = (user: any) =>
  clean(user?.role).toLowerCase() === 'admin' || user?.is_full_admin === true;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    const Customer = base44.asServiceRole.entities.Customer;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const Opportunity = base44.asServiceRole.entities.Opportunity;

    if (action === 'sweep_auto_inactive') {
      const dryRun = body?.dry_run === true;
      const defaultMonths = num(body?.months_default, 0);

      if (!dryRun && !isAdmin(user)) {
        throw bad('Only administrators can run the auto-inactive sweep.', 403);
      }

      const [customers, workOrders, invoices, opportunities] = await Promise.all([
        loadAllEntityRows({ entity: Customer, query: {}, sort: 'created_date', fields: CUSTOMER_FIELDS, label: 'Lifecycle customers' }),
        loadAllEntityRows({ entity: WorkOrder, query: {}, sort: 'created_date', fields: WORK_ORDER_FIELDS, label: 'Lifecycle work orders' }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, query: {}, sort: 'created_date', fields: INVOICE_FIELDS, label: 'Lifecycle invoices' }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, query: {}, sort: 'created_date', fields: OPPORTUNITY_FIELDS, label: 'Lifecycle opportunities' }).catch(() => []),
      ]);
      if (!Array.isArray(customers)) throw bad('Customer lookup failed.', 500);

      const activityById = activityMapByCustomerId({ customers, workOrders, invoices, opportunities });
      const now = new Date();
      const plan = sweepPlan(customers, { activityById, now, defaultMonths });
      const activeEvaluated = customers.filter((c: any) =>
        customerLifecycleStatus(c) === 'Active' && !clean(c?.merged_into_customer_id)).length;

      const results: any[] = [];
      const failures: any[] = [];
      if (!dryRun) {
        // Sequential writes: a sweep is a batch/scheduled operation and a
        // burst of entity writes would burn the shared rate budget. Per-row
        // try/catch surfaces each failure instead of silently swallowing it.
        for (const item of plan) {
          try {
            await Customer.update(item.customer_id, { customer_status: 'inactive' });
            results.push({ ...item, to_status: 'inactive' });
          } catch (error: any) {
            failures.push({
              customer_id: item.customer_id,
              from_status: item.from_status,
              error: clean(error?.message) || 'Update failed.',
            });
          }
        }
      }

      return Response.json({
        success: true,
        action,
        dry_run: dryRun,
        months_default: defaultMonths,
        evaluated_active: activeEvaluated,
        plan,
        results,
        failures,
        swept_count: results.length,
        failed_count: failures.length,
        actor,
      });
    }

    if (action === 'get_lifecycle') {
      const customerId = clean(body?.customer_id);
      if (!customerId) throw bad('A customer_id is required.');
      const defaultMonths = num(body?.months_default, 0);

      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad('Customer not found.', 404);

      const [workOrders, invoices, opportunities] = await Promise.all([
        loadAllEntityRows({ entity: WorkOrder, query: { customer_id: customerId }, sort: 'created_date', fields: WORK_ORDER_FIELDS, label: 'Lifecycle work orders' }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, query: { customer_id: customerId }, sort: 'created_date', fields: INVOICE_FIELDS, label: 'Lifecycle invoices' }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, query: { customer_id: customerId }, sort: 'created_date', fields: OPPORTUNITY_FIELDS, label: 'Lifecycle opportunities' }).catch(() => []),
      ]);

      const summary = lastActivitySummary({ customer, workOrders, invoices, opportunities });
      const verdict = shouldAutoInactivate({
        customer,
        lastActivity: summary.last_activity_at,
        now: new Date(),
        defaultMonths,
      });

      return Response.json({
        success: true,
        action,
        customer_id: customerId,
        customer_status: clean(customer?.customer_status),
        lifecycle_status: customerLifecycleStatus(customer),
        merged_into_customer_id: clean(customer?.merged_into_customer_id),
        last_activity_at: summary.last_activity_at,
        activity: summary.sources,
        winner: summary.winner,
        auto_inactive: {
          disabled: customer?.auto_inactive_disabled === true,
          months: resolveAutoInactiveMonths(customer, defaultMonths),
          months_default: defaultMonths,
          verdict,
        },
      });
    }

    throw bad('Unknown customer lifecycle action.');
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Customer lifecycle request failed.' }, { status });
    }
    console.error('manageCustomerLifecycle error:', error);
    return Response.json({ error: 'The lifecycle request could not be completed. Try again.' }, { status });
  }
});
