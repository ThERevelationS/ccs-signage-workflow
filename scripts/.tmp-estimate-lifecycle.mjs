// src/components/estimator/estimateLifecycle.js
var PROTECTED_STATUSES = /* @__PURE__ */ new Set(["sent", "approved", "archived", "cancelled"]);
var SYSTEM_FIELDS = /* @__PURE__ */ new Set(["id", "created_date", "updated_date", "created_by_id", "created_by", "edit_reason"]);
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function isEstimateProtected(status) {
  return PROTECTED_STATUSES.has(String(status || ""));
}
function requiresEstimateLifecycleReason(previousStatus, nextStatus) {
  const before = String(previousStatus || "draft");
  const after = String(nextStatus || "draft");
  if (before === after) return false;
  return isEstimateProtected(before) || isEstimateProtected(after);
}
function estimateAuditSnapshot(estimate = {}, { quoteTotal, internalCost } = {}) {
  const snapshot = {};
  Object.entries(estimate || {}).forEach(([key, value]) => {
    if (SYSTEM_FIELDS.has(key)) return;
    snapshot[key] = value;
  });
  snapshot.total_cost = internalCost === void 0 ? num(estimate.total_cost) : num(internalCost);
  snapshot.quote_total = quoteTotal === void 0 ? num(estimate.quote_total) : num(quoteTotal);
  return JSON.parse(JSON.stringify(snapshot));
}
function summarizeEstimateChanges(before = {}, after = {}) {
  const changes = [];
  if (String(before.status || "") !== String(after.status || "")) {
    changes.push(`Status: ${before.status || "draft"} \u2192 ${after.status || "draft"}`);
  }
  if (num(before.quote_version) !== num(after.quote_version)) {
    changes.push(`Customer quote issued: Version ${num(after.quote_version)} \xB7 ${after.quote_issue_date || "date not recorded"}`);
  }
  if (Math.abs(num(before.quote_total) - num(after.quote_total)) > 5e-3) {
    changes.push(`Customer quote total: ${num(before.quote_total).toFixed(2)} \u2192 ${num(after.quote_total).toFixed(2)}`);
  }
  if (Math.abs(num(before.total_cost) - num(after.total_cost)) > 5e-3) {
    changes.push(`Internal cost: ${num(before.total_cost).toFixed(2)} \u2192 ${num(after.total_cost).toFixed(2)}`);
  }
  const beforeLines = Array.isArray(before.line_items) ? before.line_items : [];
  const afterLines = Array.isArray(after.line_items) ? after.line_items : [];
  if (JSON.stringify(beforeLines) !== JSON.stringify(afterLines)) {
    const lineName = (l) => l?.client_product_name || l?.builder_name || l?.module_key || "Product";
    const beforeById = new Map(beforeLines.map((l) => [String(l?.line_id || ""), l]));
    const afterById = new Map(afterLines.map((l) => [String(l?.line_id || ""), l]));
    const names = (keys, map) => keys.slice(0, 3).map((k) => lineName(map.get(k))).join(", ") + (keys.length > 3 ? ` +${keys.length - 3} more` : "");
    const added = [...afterById.keys()].filter((k) => !beforeById.has(k));
    const removed = [...beforeById.keys()].filter((k) => !afterById.has(k));
    const renamed = [...afterById.keys()].filter((k) => beforeById.has(k) && lineName(beforeById.get(k)) !== lineName(afterById.get(k)));
    const parts = [];
    if (beforeLines.length !== afterLines.length) parts.push(`sections ${beforeLines.length} \u2192 ${afterLines.length}`);
    if (added.length) parts.push(`added: ${names(added, afterById)}`);
    if (removed.length) parts.push(`removed: ${names(removed, beforeById)}`);
    if (renamed.length) parts.push(`renamed: ${names(renamed, afterById)}`);
    changes.push(parts.length ? `Product scope changed \u2014 ${parts.join("; ")}` : "Product scope / Product pricing changed");
  }
  const quoteKeys = [
    "discount_percent",
    "contingency_percent",
    "tax_percent",
    "deposit_percent",
    "shipping_fee",
    "permit_fee",
    "hide_section_prices",
    "quote_title",
    "quote_intro_text",
    "scope_inclusions",
    "scope_exclusions",
    "payment_terms",
    "quote_terms_conditions",
    "warranty_text",
    "lead_time_text"
  ];
  if (quoteKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Customer quote settings / terms changed");
  }
  const detailKeys = [
    "project_name",
    "client_name",
    "customer_id",
    "po_number",
    "site_address",
    "order_contact",
    "contact_name",
    "contact_email",
    "contact_phone",
    "salesperson",
    "target_install_date",
    "priority",
    "tags"
  ];
  if (detailKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Estimate / customer details changed");
  }
  return changes.length ? changes : ["Estimate saved with no material customer-facing change detected"];
}
export {
  estimateAuditSnapshot,
  isEstimateProtected,
  requiresEstimateLifecycleReason,
  summarizeEstimateChanges
};
