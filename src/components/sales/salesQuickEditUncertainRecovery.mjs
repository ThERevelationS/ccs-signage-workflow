// Read-only observation after a Sales quick edit received no trusted save
// acknowledgment. Matching values do not identify who wrote them and never
// authorize a second write, history finalization, or automatic completion.
const equal = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  ((a == null || a === '') && (b == null || b === ''));

export async function inspectUncertainSalesQuickEdit({workOrderId,changes,getLatest}={}) {
  if (!workOrderId || !changes || typeof changes !== 'object' ||
      Array.isArray(changes) || !Object.keys(changes).length ||
      typeof getLatest !== 'function') return {state:'unavailable'};
  try {
    const record=await getLatest(workOrderId);
    if (!record || record.id!==workOrderId || record.deleted===true)
      return {state:'unavailable'};
    const matches=Object.entries(changes).every(([field,value])=>
      Object.prototype.hasOwnProperty.call(record,field) && equal(record[field],value));
    return {state:matches?'values_match':'values_differ'};
  } catch {
    return {state:'unavailable'};
  }
}

export function uncertainSalesQuickEditWarning(state) {
  const observation=state==='values_match'
    ? 'The latest WorkOrder currently matches the attempted values, but this does not prove the save was acknowledged or who made the change.'
    : state==='values_differ'
      ? 'The latest WorkOrder does not match all the attempted values.'
      : 'The latest WorkOrder could not be checked.';
  return 'Sales save outcome is uncertain. '+observation+
    ' Do not repeat this save. Use Reload latest to inspect the authoritative record before editing it again.';
}
