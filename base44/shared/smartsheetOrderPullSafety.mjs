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
