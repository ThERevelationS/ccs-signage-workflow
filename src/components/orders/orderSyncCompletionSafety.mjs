// Order Form only. An older Save & Sync completion cannot clear a newer
// unsaved browser edit, even before the newer edit receives a durable version.
export function canClearCompletedOrderSyncTarget({ target, currentVersion, pendingFields } = {}) {
  const id = String(target?.id ?? '').trim();
  return Boolean(id) && currentVersion === target?.version &&
    pendingFields != null && typeof pendingFields === 'object' &&
    !Array.isArray(pendingFields) && Object.keys(pendingFields).length === 0;
}
