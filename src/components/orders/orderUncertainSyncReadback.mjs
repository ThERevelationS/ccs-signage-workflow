// Order Form only. An uncertain Save & Sync response is not proof of success.
// Verify every requested permanent Base44 Order ID, including records that may
// have disappeared from the current filtered/active Order Form view.
export async function verifyUncertainOrderSyncReadback(requestedIds, readRecords) {
  if (typeof readRecords !== 'function') {
    throw new Error('Uncertain Order sync has no authenticated read-back operation.');
  }
  return classifyUncertainOrderSyncReadback(requestedIds, await readRecords(requestedIds));
}

export function classifyUncertainOrderSyncReadback(requestedIds, records) {
  if (!Array.isArray(requestedIds) || !requestedIds.length ||
      !requestedIds.every(id => typeof id === 'string' && id.trim() === id && id.length > 0) ||
      new Set(requestedIds).size !== requestedIds.length || !Array.isArray(records)) {
    throw new Error('Uncertain Order sync could not verify its exact requested permanent IDs.');
  }
  const requested = new Set(requestedIds);
  const seen = new Set();
  const pendingIds = [];
  const confirmedIds = [];
  for (const record of records) {
    const id = String(record?.id ?? '').trim();
    if (!id || !requested.has(id) || seen.has(id) || record?.deleted === true) {
      throw new Error('Uncertain Order sync read-back contained a missing, duplicate, deleted, or unexpected permanent Order ID.');
    }
    seen.add(id);
    if (record.smartsheet_pending_local_sync === true) {
      pendingIds.push(id);
      continue;
    }
    if (record.smartsheet_pending_local_sync !== false ||
        !/^\d+$/.test(String(record.smartsheet_sheet_id ?? '').trim()) ||
        !/^\d+$/.test(String(record.smartsheet_row_id ?? '').trim()) ||
        !record.smartsheet_last_synced_at ||
        !record.smartsheet_sync_snapshot ||
        typeof record.smartsheet_sync_snapshot !== 'object' ||
        Array.isArray(record.smartsheet_sync_snapshot) ||
        Object.keys(record.smartsheet_sync_snapshot).length === 0) {
      throw new Error('Uncertain Order sync read-back lacked verified sync metadata. No Order was confirmed.');
    }
    confirmedIds.push(id);
  }
  if (seen.size !== requested.size) {
    throw new Error('Uncertain Order sync read-back omitted requested permanent Order IDs. No Order was confirmed.');
  }
  return { confirmedIds, pendingIds };
}
