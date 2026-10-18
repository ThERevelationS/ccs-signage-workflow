// An explicit uncertain-save recovery must not require loading full Sales
// archives just to find a WorkOrder beyond page one. Target only IDs with
// an outstanding safety fence, and fail closed if the record is not in scope.
import { isExplicitNeutralSalesClosure } from './salesRecordScopes.js';

export const SALES_ARCHIVE_RECOVERY_LOOKUP_LIMIT = 8;

export async function recoverRequiredSalesArchiveRows({
  scope, rows, requiredIds, getWorkOrder, belongsToScope,
} = {}) {
  if (!Array.isArray(rows) || !Array.isArray(requiredIds)) {
    throw new Error('The Sales archive recovery page could not be verified.');
  }
  const found = new Set(rows.map(row => row?.id).filter(Boolean));
  const missing = [...new Set(requiredIds)].filter(id => !found.has(id));
  if (missing.length === 0) return rows;
  // Routine workspace refreshes do not invoke this helper. Only archive
  // recovery is eligible for bounded off-page lookup.
  if (!['all', 'history'].includes(scope) ||
      missing.length > SALES_ARCHIVE_RECOVERY_LOOKUP_LIMIT ||
      missing.some(id => typeof id !== 'string' || !id.trim()) ||
      typeof getWorkOrder !== 'function' || typeof belongsToScope !== 'function') {
    return rows;
  }
  // Read-only direct lookups, never a mass archive fetch or write.
  // Duplicate IDs are already excluded and no more than eight are inspected.
  const added = await Promise.all(missing.map(async id => {
    const record = await getWorkOrder(id);
    if (!record || record.id !== id || record.deleted === true ||
        record.is_rider === true) return null;
    const allowed = belongsToScope(record, scope) ||
      (scope === 'all' && isExplicitNeutralSalesClosure(record));
    return allowed ? record : null;
  }));
  return [...rows, ...added.filter(Boolean)];
}
