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

// Server-side equivalent() mirror (base44/shared/fieldAudit.ts): the CAS
// compare is strict stringification with a null/'' equivalence only — no
// trim or numeric coercion. Mirroring it here keeps pre-write drift checks
// identical to what fieldHistoryAction will compute.
export const salesEquivalent=(a,b)=>JSON.stringify(a ?? null)===JSON.stringify(b ?? null) ||
  ((a==null||a==='')&&(b==null||b===''));

// Failures that prove nothing was written vs failures where the write may
// have committed with a lost response. Gateway 429 = request rejected before
// the function ran; the pre-write 409 messages below are thrown before any
// update executes. Only truly uncertain failures should block follow-up saves.
const PRE_WRITE_409=/changed in another session|no longer matches its loaded state|record changed\. Reload|is in Trash/i;
export function classifySalesQuickEditSaveError(error) {
  const status=Number(error?.status ?? error?.response?.status ?? 0);
  const message=String(error?.message || error?.response?.data?.error || '');
  if(status===429)return 'busy';
  if(status===409)return PRE_WRITE_409.test(message)?'conflict':'uncertain';
  return 'uncertain';
}

// Compare a freshly-read record against the baselines a save was about to
// CAS on. Buckets fields so the caller can keep still-valid pending edits,
// drop genuinely conflicted ones, and detect "someone already saved the
// same values" (applied — nothing to redo, nothing to report as lost).
export function analyzeSalesQuickEditDrift(record,{expectedFields={},guardFields={},changes={}}={}) {
  const applied=[],conflicted=[],guardDrift=[];
  if(!record||typeof record!=='object')return {applied,conflicted,guardDrift,unavailable:true};
  for(const field of Object.keys(expectedFields)) {
    if(salesEquivalent(record[field],changes[field]))applied.push(field);
    else if(!salesEquivalent(record[field],expectedFields[field]))conflicted.push(field);
  }
  for(const field of Object.keys(guardFields)) {
    if(Object.prototype.hasOwnProperty.call(expectedFields,field))continue;
    if(!salesEquivalent(record[field],guardFields[field]))guardDrift.push(field);
  }
  return {applied,conflicted,guardDrift,unavailable:false};
}