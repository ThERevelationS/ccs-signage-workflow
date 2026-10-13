// Conservative, local-only three-way comparison for Admin HR conflict recovery.
// An HR section (including nested arrays) is atomic. Never write records here.
const normalize = value => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
const equal = (a,b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

export function reconcileHrDraft({ baseline, latest, draft, overwriteConflicts = false }) {
  const isPlain = value => value && typeof value === "object" && !Array.isArray(value);
  if (![baseline,latest,draft].every(isPlain)) throw new Error("HR comparison requires verified records.");
  const result = {...latest};
  const conflictFields = [];
  const editedFields = [];
  for (const field of new Set([...Object.keys(baseline), ...Object.keys(draft)])) {
    const baseValue = baseline[field];
    const draftValue = draft[field];
    if (equal(baseValue,draftValue)) continue;
    editedFields.push(field);
    const latestValue=latest[field];
    if (!equal(baseValue,latestValue) && !equal(draftValue,latestValue)) {
      conflictFields.push(field);
      if (!overwriteConflicts) continue;
    }
    if (Object.prototype.hasOwnProperty.call(draft,field)) {
      Object.defineProperty(result,field,{value:draftValue,writable:true,enumerable:true,configurable:true});
    } else {
      delete result[field];
    }
  }
  return { merged:result, conflictFields, editedFields };
}
