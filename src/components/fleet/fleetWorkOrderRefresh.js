// Estimate callbacks may explicitly return false for a failed post-save
// refresh, or throw. Both are refresh failures, never mutation failures.
export async function attemptEstimateChangeRefresh(onChanged, estimate) {
  try { return (await onChanged?.(estimate)) !== false; }
  catch { return false; }
}

// A successful server mutation is not undone by a later list-load failure.
// Never propagate a refresh error to a form that could retry the mutation.
export async function attemptPostMutationRefresh(refresh) {
  try {
    await refresh();
    return true;
  } catch {
    return false;
  }
}
