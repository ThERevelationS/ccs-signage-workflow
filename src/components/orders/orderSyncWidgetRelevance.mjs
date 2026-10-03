export function orderFormSyncStatusRelevant(status) {
  if (!status || typeof status !== 'object') return false;
  const results = Array.isArray(status.results) ? status.results : [];

  if (status.status === 'running') {
    return status?.progress_dataset === 'orders' ||
      /^Order Form\b/.test(String(status?.current_step_label || '').trim());
  }

  return results.some((result) => result?.dataset === 'orders');
}
