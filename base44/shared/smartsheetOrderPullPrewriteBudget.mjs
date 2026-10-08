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
