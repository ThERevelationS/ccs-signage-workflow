// Order Form only. Never replace the coordinator's permanent-ID evidence with
// a new Order pull while a previous attempted write is still unresolved.
// A completed run has finished its read-back verification and is not blocked.
export function classifyPriorUncertainOrderPull(previous, { orderPullRequested = false } = {}) {
  if (!orderPullRequested) return { blocked: false };
  if (!previous || !['failed', 'needs_review'].includes(previous.status)) return { blocked: false };
  const evidence = previous.order_pull_batch_evidence;
  const attempts = Number(evidence?.attempted_batches);
  const recent = Array.isArray(evidence?.recent_batches) ? evidence.recent_batches : [];
  if (!(Number.isFinite(attempts) && attempts > 0) && recent.length === 0) {
    return { blocked: false };
  }
  const attemptedBatches = Number.isSafeInteger(attempts) && attempts > 0
    ? attempts : recent.length;
  return {
    blocked: true,
    attemptedBatches,
    reason: `Previous Order pull needs review: ${attemptedBatches} write batch${attemptedBatches === 1 ? '' : 'es'} were attempted, but the run did not complete safely. Permanent Base44 and Smartsheet row evidence is preserved. Review and reconcile these IDs before another Order pull. No automatic retry was started.`,
  };
}
