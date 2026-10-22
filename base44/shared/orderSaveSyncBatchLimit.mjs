// Keep aligned with the browser Order Save & Sync cap; parity is regression-tested.
export const ORDER_SAVE_SYNC_BATCH_LIMIT = 25;

export function orderSaveSyncBatchLimit(configuredLimit) {
  const configured = Number(configuredLimit);
  const effective = Number.isFinite(configured)
    ? Math.max(1, Math.floor(configured || ORDER_SAVE_SYNC_BATCH_LIMIT))
    : ORDER_SAVE_SYNC_BATCH_LIMIT;
  return Math.min(ORDER_SAVE_SYNC_BATCH_LIMIT, effective);
}
