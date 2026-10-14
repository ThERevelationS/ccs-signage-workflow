// Order Form only. A typed, bounded diagnostic from the exact permanent-row
// read-back is useful even when overall Save & Sync failed safely. It never
// authorizes clearing the pending marker or retrying the remote PUT.
export function orderRemoteVerificationReviewMessage(result, expectedOrderCount) {
  if (!Number.isSafeInteger(expectedOrderCount) || expectedOrderCount < 1 ||
      result?.success !== true || result?.configured !== true ||
      result?.write_actions_available !== true ||
      (result.sync_complete === true && result.needs_review === false) ||
      !Array.isArray(result.results) || result.results.length !== 1) return '';

  const item = result.results[0];
  const count = item?.remote_verification_review_count;
  const reviews = item?.remote_verification_review_items;
  if (item?.dataset !== 'orders' || item?.direction !== 'push' ||
      !/^\d+$/.test(String(item?.sheet_id ?? '')) ||
      item.records_examined !== expectedOrderCount ||
      !Number.isSafeInteger(item.errors) || item.errors < 1 ||
      !Number.isSafeInteger(count) || count < 1 ||
      count > expectedOrderCount || count > item.errors ||
      !Array.isArray(reviews) || reviews.length !== Math.min(count, 10) ||
      !Array.isArray(item.unresolved_record_ids)) return '';

  const unresolved = new Set(item.unresolved_record_ids);
  const seenOrders = new Set(), seenRows = new Set(), normalized = [];
  for (const review of reviews) {
    const orderId = review?.order_id, rowId = review?.row_id;
    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(orderId) ||
        typeof rowId !== 'string' || !/^\d+$/.test(rowId) ||
        !['row_mismatch', 'verification_unavailable'].includes(review?.state) ||
        !unresolved.has(orderId) || seenOrders.has(orderId) || seenRows.has(rowId)) return '';
    seenOrders.add(orderId); seenRows.add(rowId);
    normalized.push({ orderId, rowId, state: review.state });
  }
  if (!normalized.length) return '';

  const examples = normalized.slice(0, 3).map(r =>
    `Smartsheet row ${r.rowId} (Order ${r.orderId})`).join('; ');
  const more = count > 3 ? ` and ${count - 3} more` : '';
  const changed = normalized.some(r => r.state === 'row_mismatch');
  const unavailable = normalized.some(r => r.state === 'verification_unavailable');
  const problem = changed && unavailable
    ? 'Some remote values changed or could not be verified'
    : changed
      ? 'Smartsheet values no longer matched the planned Order update'
      : 'Smartsheet could not be freshly verified';
  return `${problem}: ${examples}${more}. ${count} affected Order${count === 1 ? '' : 's'} remain queued in Base44. Review the current Smartsheet row values and reload Orders before using Retry Sync. Do not overwrite or resubmit the old values automatically.`;
}
