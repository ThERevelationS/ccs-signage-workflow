function comparable(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Order Form only. Skip a pull write only when every mapped Base44 field
// already equals the normalized Smartsheet value AND the stored reconciliation
// snapshot already represents that same remote row.
export function orderPulledFieldsUnchanged(existing, pulledFields = {}) {
  if (!existing || !pulledFields || typeof pulledFields !== 'object' || Array.isArray(pulledFields)) return false;
  return Object.entries(pulledFields).every(([key, value]) =>
    comparable(existing?.[key]) === comparable(value)
  );
}

// Check actual Base44 business fields and permanent Smartsheet identity before
// promoting an acknowledged Order bulkUpdate to verified sync metadata. This
// read-only comparison is also safe for an interrupted, retried pull: anything
// uncertain retains the older snapshot rather than claiming success.
export function classifyOrderPullBusinessReadback(expectedWrites = [], actualRecords = []) {
  const byId = new Map((Array.isArray(actualRecords) ? actualRecords : [])
    .filter(record => record?.id && !record?.deleted)
    .map(record => [String(record.id), record]));
  const verified = [];
  const failures = [];
  for (const expected of Array.isArray(expectedWrites) ? expectedWrites : []) {
    const id = String(expected?.id || '').trim();
    const record = byId.get(id);
    const expectedSheet = String(expected?.sheetId || '').trim();
    const expectedRow = String(expected?.rowId || '').trim();
    if (!id || !record || !/^\d+$/.test(expectedSheet) || !/^\d+$/.test(expectedRow) ||
        String(record.smartsheet_sheet_id ?? '').trim() !== expectedSheet ||
        String(record.smartsheet_row_id ?? '').trim() !== expectedRow ||
        record.smartsheet_pending_local_sync === true ||
        !expected?.fields || typeof expected.fields !== 'object' ||
        Array.isArray(expected.fields) || Object.keys(expected.fields).length === 0 ||
        !orderPulledFieldsUnchanged(record, expected.fields)) {
      failures.push({ id, reason: 'business_fields_or_permanent_identity_not_verified' });
      continue;
    }
    verified.push(expected);
  }
  return { verified, failures };
}

export function orderPushRecordUnchanged(record, sheetId, expectedSnapshot) {
  if (record?.smartsheet_pending_local_sync === true) return false;
  const rowId = String(record?.smartsheet_row_id ?? '').trim();
  const linkedSheetId = String(record?.smartsheet_sheet_id ?? '').trim();
  return /^\d+$/.test(rowId) && linkedSheetId === String(sheetId ?? '').trim() &&
    /^\d+$/.test(linkedSheetId) && orderPullSnapshotAligned(record, expectedSnapshot);
}

export function orderPullSnapshotAligned(existing, expectedSnapshot) {
  const prior = existing?.smartsheet_sync_snapshot;
  if (!existing?.smartsheet_last_synced_at || !prior || typeof prior !== 'object' || Array.isArray(prior) ||
      !expectedSnapshot || typeof expectedSnapshot !== 'object' || Array.isArray(expectedSnapshot)) return false;

  const priorKeys = Object.keys(prior).sort();
  const expectedKeys = Object.keys(expectedSnapshot).sort();
  if (expectedKeys.length === 0) return false;
  if (priorKeys.length !== expectedKeys.length ||
      priorKeys.some((key, index) => key !== expectedKeys[index])) return false;

  return expectedKeys.every((key) => comparable(prior[key]) === comparable(expectedSnapshot[key]));
}
