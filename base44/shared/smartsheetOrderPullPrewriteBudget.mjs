// Order Form only. Reject a slow full-sheet pull before it begins any Base44
// writes. This is an application safety reserve, not a claim about the host's
// exact function timeout. A skipped run must be reviewed, not called complete.
export const ORDER_PULL_PREWRITE_BUDGET_MS = 3 * 60 * 1000;

export function orderPullPrewriteBudget({
  startedAtMs,
  nowMs,
  budgetMs = ORDER_PULL_PREWRITE_BUDGET_MS,
} = {}) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) ||
      !Number.isFinite(budgetMs) || budgetMs <= 0 || nowMs < startedAtMs) {
    return {
      allowed: false,
      reason: 'The Order pull elapsed time could not be verified before writes. No Orders were changed.',
    };
  }
  const elapsedMs = nowMs - startedAtMs;
  if (elapsedMs >= budgetMs) {
    return {
      allowed: false,
      elapsedMs,
      budgetMs,
      reason: 'The Order pull used its pre-write time reserve while reading and matching Smartsheet. No Orders were changed. Review the run before retrying.',
    };
  }
  return { allowed: true, elapsedMs, budgetMs };
}

// After any business-field writes, an expired run cannot claim that Orders
// were unchanged. Abort at safe operation boundaries and let the coordinator
// mark the attempted pull as requiring review. This is a conservative
// application deadline, not a platform timeout guarantee.
export const ORDER_PULL_POSTWRITE_BUDGET_MS = 4 * 60 * 1000;

export function assertOrderPullContinuationBudget({
  startedAtMs,
  nowMs,
  stage,
  budgetMs = ORDER_PULL_POSTWRITE_BUDGET_MS,
} = {}) {
  const valid = Number.isFinite(startedAtMs) &&
    Number.isFinite(nowMs) && nowMs >= startedAtMs &&
    Number.isFinite(budgetMs) && budgetMs > 0;
  if (!valid || nowMs - startedAtMs >= budgetMs) {
    throw new Error(
      `Order pull stopped before ${String(stage || 'continuing')}: time budget ` +
      'exhausted or unverified. Earlier Base44 updates may already have been applied. ' +
      'Sync snapshots may be incomplete; review the pull before retrying.',
    );
  }
  return { elapsedMs: nowMs - startedAtMs, budgetMs };
}
