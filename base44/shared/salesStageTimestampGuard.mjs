// Sales Pipeline's stage-aging clock may advance only for a genuine status
// transition. Regular-user fieldHistory saves are allowed to update many
// business fields, but must not backfill, repair, or reset stage timing
// independently of that transition.
const has = (record, field) => Object.prototype.hasOwnProperty.call(record || {}, field);

export function validateSalesStageTimestampPatch(record = {}, patch = {}, equivalent = (a, b) => a === b) {
  if (!has(patch, 'sales_stage_changed_at')) return;
  const statusChanged = has(patch, 'sales_status') &&
    !equivalent(record.sales_status, patch.sales_status);
  const stampChanged = !equivalent(record.sales_stage_changed_at, patch.sales_stage_changed_at);
  if (!statusChanged) {
    if (!stampChanged) return; // Identical clock value alongside an ordinary edit.
    throw Object.assign(new Error(
      'Sales stage timing cannot change unless Sales status actually changes. Reload and use the stage transition workflow.'
    ), {status:409});
  }
  // A true status transition must not keep or erase a preexisting clock.
  if (!stampChanged) {
    throw Object.assign(new Error('A real Sales stage change requires a new stage timing value.'), {status:400});
  }
  const stamp = patch.sales_stage_changed_at;
  if (typeof stamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp) ||
      !Number.isFinite(Date.parse(stamp)) ||
      new Date(stamp).toISOString() !== stamp) {
    throw Object.assign(new Error('Sales stage change timestamp must be a valid UTC ISO date-time.'), {status:400});
  }
}
