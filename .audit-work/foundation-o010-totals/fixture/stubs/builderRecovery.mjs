export function pendingBuilderMutation() { return null; }
export async function resumeBuilderMutation({ line } = {}) { return { line }; }
export function pendingBuilderMutationIsStale() { return false; }
