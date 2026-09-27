// Order Form-only protection for immediate saves that overlap unsaved edits.
// A deliberate Date Needed choice supersedes an older pending value, but a
// newer edit made during the request must survive its successful read-back.
export function remainingOrderPendingAfterImmediateSave(
  latestPending = {}, pendingAtStart = {}, savedFields = {}, supersedePendingFields = [],
) {
  const remaining = { ...latestPending };
  for (const [field, savedValue] of Object.entries(savedFields)) {
    if (!Object.hasOwn(remaining, field)) continue;
    const superseded = supersedePendingFields.includes(field) &&
      Object.hasOwn(pendingAtStart, field) &&
      Object.is(remaining[field], pendingAtStart[field]);
    if (Object.is(remaining[field], savedValue) || superseded) delete remaining[field];
  }
  return remaining;
}
