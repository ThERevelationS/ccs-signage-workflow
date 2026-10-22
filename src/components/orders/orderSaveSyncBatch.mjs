// The backend independently enforces this cap; parity is regression-tested.
export const ORDER_SAVE_SYNC_BATCH_LIMIT = 25;

export class OrderSaveSyncBatchLimitError extends Error {
  constructor(limit) {
    super(`Save & Sync accepts up to ${limit} Orders per batch. All remaining Orders stay queued. Press Save & Sync again to continue with the smaller batch.`);
    this.name = 'OrderSaveSyncBatchLimitError';
    this.limit = limit;
  }
}

export function readOrderSaveSyncBatchLimitError(result) {
  const limit = result?.order_batch_limit;
  if (result?.success !== false || result?.code !== 'ORDER_SYNC_BATCH_LIMIT' ||
      result?.smartsheet_writes_attempted !== false ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > ORDER_SAVE_SYNC_BATCH_LIMIT) return null;
  return new OrderSaveSyncBatchLimitError(limit);
}

export function orderSaveSyncBatchMessage(message, remainingCount) {
  if (!Number.isSafeInteger(remainingCount) || remainingCount < 0) {
    throw new Error('The remaining Order queue could not be verified. Reload Orders before continuing.');
  }
  return remainingCount === 0 ? message
    : `This batch is synchronized. ${remainingCount} Order${remainingCount === 1 ? '' : 's'} remain queued. Press Save & Sync to continue.`;
}
