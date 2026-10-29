// src/components/estimator/estimateSalesActivity.mjs
var SALES_FIELDS = /* @__PURE__ */ new Set([
  "sales_status",
  "sales_rep",
  "estimator",
  "estimate_amount",
  "date_estimate_sent",
  "date_order_created",
  "estimate_id",
  "in_pipeline"
]);
var equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function hasVerifiedEstimateSalesActivity(existing, fields = {}, {
  quoteDateVerificationRequested = false,
  includeProducts = false
} = {}) {
  if (!existing) return true;
  if (quoteDateVerificationRequested) return true;
  return Object.entries(fields).some(
    ([field, value]) => (SALES_FIELDS.has(field) || includeProducts && field === "products") && !equal(existing[field], value)
  );
}
export {
  hasVerifiedEstimateSalesActivity
};
