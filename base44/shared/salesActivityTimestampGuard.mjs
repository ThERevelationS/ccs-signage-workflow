// Sales staleness reporting uses this timestamp only for witnessed Sales
// activity, never generic WorkOrder updated_date or a standalone field edit.
// This is a request-level integrity check, not historical activity backfill.
const CORE_FIELDS = new Set([
  'sales_status', 'sales_rep', 'lead_source', 'estimate_amount',
  'date_estimate_sent', 'follow_up_date',
  'sales_last_follow_up_completed_at', 'sales_last_follow_up_outcome',
  'close_date', 'expected_close_date', 'lost_reason',
  'current_task_description', 'current_task_deadline',
  'current_task_assigned_to', 'in_pipeline',
]);
// The estimator supplies an explicit estimate_id with its synchronization
// payload. These changes may be Sales activity only in that scoped context.
// Ordinary job/title/contact edits alone cannot refresh the activity clock.
const ESTIMATE_FIELDS = new Set([
  'estimate_id', 'estimator', 'date_order_created', 'contact_name',
  'contact_email', 'contact_phone', 'title', 'client_name',
  'install_location', 'customer_id', 'products',
]);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const isoUTC = (value) => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function validateSalesActivityTimestampPatch(record = {}, patch = {}, equivalent = (a,b) => a === b, now = new Date()) {
  if (!has(patch, 'sales_last_activity_at') ||
      equivalent(record.sales_last_activity_at, patch.sales_last_activity_at)) return;
  const stamp = patch.sales_last_activity_at;
  if (!isoUTC(stamp) || Date.parse(stamp) > now.getTime() + 5 * 60 * 1000) {
    throw Object.assign(new Error('Sales activity requires a valid, current UTC timestamp.'), {status:400});
  }
  if (isoUTC(record.sales_last_activity_at) &&
      Date.parse(stamp) <= Date.parse(record.sales_last_activity_at)) {
    throw Object.assign(new Error('Sales activity cannot be moved backward. Reload before saving.'), {status:409});
  }

  const changed = field => has(patch, field) && !equivalent(record[field], patch[field]);
  const coreActivity = [...CORE_FIELDS].some(changed);
  // Confirming an existing quote date (previously lacking provenance) is a
  // real Sales action even though its date value remains the same. The
  // fieldHistory endpoint separately creates its confirmation marker.
  const quoteConfirmed = has(patch, 'date_estimate_sent') &&
    Boolean(String(patch.date_estimate_sent ?? '').trim()) &&
    !String(record.sales_quote_sent_verified_at || '').trim();

  const estimateIdentity = String(patch.estimate_id ?? '').trim();
  const estimateActivity = Boolean(estimateIdentity) &&
    (record.in_pipeline === true || patch.in_pipeline === true) &&
    [...ESTIMATE_FIELDS].some(changed);

  if (!coreActivity && !quoteConfirmed && !estimateActivity) {
    throw Object.assign(new Error(
      'Sales activity cannot be recorded without a changed Sales field, verified quote confirmation, or an estimate-linked Sales update.'
    ), {status:409});
  }
}
