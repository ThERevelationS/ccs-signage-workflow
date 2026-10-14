// Estimate-to-Pipeline and approved-estimate conversion are Sales workflows,
// but a generic name, contact, site-address, or internal job-detail refresh is
// not proof that somebody engaged the Sales opportunity.
const SALES_FIELDS = new Set([
  'sales_status', 'sales_rep', 'estimator', 'estimate_amount',
  'date_estimate_sent', 'date_order_created', 'estimate_id', 'in_pipeline',
]);

const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function hasVerifiedEstimateSalesActivity(existing, fields = {}, {
  quoteDateVerificationRequested = false,
  includeProducts = false,
} = {}) {
  if (!existing) return true; // Actual creation of an estimator-linked Sales record.
  if (quoteDateVerificationRequested) return true; // Explicit verified quote issuance.
  return Object.entries(fields).some(([field, value]) =>
    (SALES_FIELDS.has(field) || (includeProducts && field === 'products')) &&
    !equal(existing[field], value)
  );
}
