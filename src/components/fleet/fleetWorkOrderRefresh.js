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
