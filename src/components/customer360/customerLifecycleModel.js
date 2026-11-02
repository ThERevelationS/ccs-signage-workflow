// Customer lifecycle model (masterplan G-03) — thin frontend wrapper.
//
// The canonical pure rules live in base44/shared/customerLifecycleRules.ts so
// the manageCustomerLifecycle Deno function and the browser run identical
// logic. This file only re-exports them for src/ consumers, exactly like the
// other shared-module wrappers (see components/jobs/productStageModel.js,
// components/sales/salesTaskStageMapping.mjs).
//
// NOTE: the shared file must be named in the frontend-shared-modules Vite
// allowlist (scripts/frontend-shared-modules.mjs) before this import resolves
// at dev/build time — keep this wrapper logic-free so the allowlist stays the
// only gate.

export {
  LIFECYCLE_STATUSES,
  normalizeLifecycle,
  customerLifecycleStatus,
  CUSTOMER_ACTIVITY_FIELDS,
  WORK_ORDER_ACTIVITY_FIELDS,
  INVOICE_ACTIVITY_FIELDS,
  OPPORTUNITY_ACTIVITY_FIELDS,
  activityHits,
  lastActivityAt,
  lastActivitySummary,
  activityMapByCustomerId,
  AUTO_INACTIVE_REASONS,
  resolveAutoInactiveMonths,
  monthsAgo,
  shouldAutoInactivate,
  sweepPlan,
} from '../../../base44/shared/customerLifecycleRules.ts';
