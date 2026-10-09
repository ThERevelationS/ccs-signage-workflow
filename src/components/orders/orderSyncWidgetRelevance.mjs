export function orderFormSyncStatusRelevant(status) {
  if (!status || typeof status !== 'object') return false;
  const results = Array.isArray(status.results) ? status.results : [];

  if (status.status === 'running') {
    return status?.progress_dataset === 'orders' ||
      /^Order Form\b/.test(String(status?.current_step_label || '').trim());
  }

  // A failed in-flight Order bulk write can leave only coordinator evidence,
  // not a completed result. Keep that run visible for admin review.
  if (status?.progress_dataset === 'orders' &&
      Number(status?.order_pull_batch_evidence?.attempted_batches || 0) > 0) return true;
  return results.some((result) => result?.dataset === 'orders');
}
