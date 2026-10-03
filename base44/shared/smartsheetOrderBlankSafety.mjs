const blank = (value) => value == null || String(value).trim() === '';

export function orderPreservedRemoteBlankNeedsReview({
  localValue,
  remoteValue,
  priorValue,
  lastSyncedAt,
  localEditedAt,
} = {}) {
  if (blank(localValue) || !blank(remoteValue) || !blank(priorValue)) return false;
  const synced = Date.parse(String(lastSyncedAt || ''));
  const edited = Date.parse(String(localEditedAt || ''));
  if (!Number.isFinite(synced) || !Number.isFinite(edited)) return true;
  return edited <= synced;
}

export function latestVerifiedOrderColumnEditTime(times = []) {
  const valid = (Array.isArray(times) ? times : [])
    .filter(Boolean)
    .map((value) => ({ value, ms: Date.parse(String(value)) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => b.ms - a.ms);
  return valid[0]?.value || '';
}
