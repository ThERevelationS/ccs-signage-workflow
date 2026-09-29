function normalizeMetadataValue(value) {
  if (Array.isArray(value)) return value.map(normalizeMetadataValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalizeMetadataValue(value[key]);
    return out;
  }, {});
}

function sameMetadataValue(left, right) {
  return JSON.stringify(normalizeMetadataValue(left)) === JSON.stringify(normalizeMetadataValue(right));
}

// A successful bulkUpdate response is not sufficient evidence that sync
// reconciliation metadata actually persisted. This comparison is dataset
// agnostic; the Order-named export below is retained for existing callers/tests.
export function findUnverifiedSyncMetadata(expectedUpdates = [], records = []) {
  const byId = new Map(
    (Array.isArray(records) ? records : [])
      .filter(record => record?.id)
      .map(record => [String(record.id), record]),
  );

  const failures = [];
  for (const expected of Array.isArray(expectedUpdates) ? expectedUpdates : []) {
    const id = String(expected?.id || '').trim();
    if (!id) {
      failures.push({ id: '', reason: 'missing_expected_id' });
      continue;
    }
    const record = byId.get(id);
    if (!record) {
      failures.push({ id, reason: 'record_missing' });
      continue;
    }
    if (!sameMetadataValue(record.smartsheet_sync_snapshot, expected.smartsheet_sync_snapshot)) {
      failures.push({ id, reason: 'snapshot_mismatch' });
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(expected, 'smartsheet_last_synced_at') &&
      String(record.smartsheet_last_synced_at || '') !== String(expected.smartsheet_last_synced_at || '')
    ) {
      failures.push({ id, reason: 'timestamp_mismatch' });
    }
  }
  return failures;
}

export const findUnverifiedOrderSyncMetadata = findUnverifiedSyncMetadata;
