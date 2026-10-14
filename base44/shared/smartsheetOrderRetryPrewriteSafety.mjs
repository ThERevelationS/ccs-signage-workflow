// Order-only fresh pre-PUT evidence. Smartsheet has no conditional row PUT,
// so this narrows (but cannot eliminate) the gap between verification and write.
const val = value => String(value ?? '').trim();
const numeric = value => /^\d+$/.test(val(value));

export function orderSnapshotsMatchForPrewrite(planned, current) {
  if (!planned || !current || typeof planned !== 'object' || typeof current !== 'object' ||
      Array.isArray(planned) || Array.isArray(current)) return false;
  const keys = Object.keys(planned).sort();
  const currentKeys = Object.keys(current).sort();
  return keys.length > 0 && keys.length === currentKeys.length &&
    keys.every((key, index) => numeric(key) && key === currentKeys[index] &&
      val(planned[key]) === val(current[key]));
}

export function staleOrderRetryPrewriteIds(plans, plannedById, latestById, freshByRowId, sheetId) {
  if (!Array.isArray(plans) || !(plannedById instanceof Map) ||
      !(latestById instanceof Map) || !(freshByRowId instanceof Map) ||
      !numeric(sheetId)) throw new Error('Order retry needs complete permanent-ID readback evidence.');
  const claimed = new Set();
  return plans.filter(([recordId, verification]) => {
    const id = val(recordId), rowId = val(verification?.rowId);
    const initial = plannedById.get(id), latest = latestById.get(id);
    if (!id || !numeric(rowId) || claimed.has(rowId)) return true;
    claimed.add(rowId);
    return !initial || !latest || val(initial.id) !== id || val(latest.id) !== id ||
      !initial.updated_date || val(initial.updated_date) !== val(latest.updated_date) ||
      val(verification?.originalUpdatedDate) !== val(initial.updated_date) ||
      latest.deleted === true || latest.smartsheet_pending_local_sync !== true ||
      val(initial.smartsheet_sheet_id) !== val(sheetId) ||
      val(latest.smartsheet_sheet_id) !== val(sheetId) ||
      val(initial.smartsheet_row_id) !== rowId ||
      val(latest.smartsheet_row_id) !== rowId ||
      !orderSnapshotsMatchForPrewrite(verification?.plannedRemoteSnapshot, freshByRowId.get(rowId));
  }).map(([id]) => String(id));
}
