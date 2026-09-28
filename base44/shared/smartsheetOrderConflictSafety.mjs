export function orderMissingBoundCellConflicts(snapshot = {}, bindingColumnIds = [], seenBoundColumnIds = []) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const seen = seenBoundColumnIds instanceof Set ? seenBoundColumnIds : new Set(seenBoundColumnIds || []);
  for (const rawId of bindingColumnIds || []) {
    const columnId = String(rawId ?? '').trim();
    if (!columnId || seen.has(columnId) || !Object.prototype.hasOwnProperty.call(snapshot, columnId)) continue;
    if (String(snapshot[columnId] ?? '').trim() !== '') return true;
  }
  return false;
}
