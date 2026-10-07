// Order Form only. A completed coordinator loop is not a successful Order
// sync when a requested stage was blocked, partially saved, or left ambiguous
// permanent row links. Disabled datasets have no direction and are not errors.
export function orderRunRequiresReview(results = []) {
  return Array.isArray(results) && results.some(result =>
    result?.dataset === 'orders' && (
      (result?.skipped === true && (result?.direction === 'pull' || result?.direction === 'push')) ||
      Number(result?.errors || 0) > 0 ||
      Number(result?.conflicts || 0) > 0 ||
      Number(result?.snapshot_write_failures || 0) > 0 ||
      Number(result?.unlinked_smartsheet_rows_flagged_for_review || 0) > 0 ||
      Number(result?.orphans_flagged_for_review || 0) > 0 ||
      Number(result?.duplicate_groups_flagged_for_review || 0) > 0 ||
      Number(result?.create_attempts_need_review || 0) > 0 ||
      Number(result?.duplicate_order_row_links || 0) > 0 ||
      Number(result?.missing_permanent_row_links || 0) > 0
    )
  );
}
