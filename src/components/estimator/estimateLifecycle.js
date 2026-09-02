const PROTECTED_STATUSES = new Set(["sent", "approved", "archived", "cancelled"]);
const SYSTEM_FIELDS = new Set(["id", "created_date", "updated_date", "created_by_id", "created_by", "edit_reason"]);

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function isEstimateProtected(status) {
  return PROTECTED_STATUSES.has(String(status || ""));
}

export function requiresEstimateLifecycleReason(previousStatus, nextStatus) {
  const before = String(previousStatus || "draft");
  const after = String(nextStatus || "draft");
  if (before === after) return false;
  return isEstimateProtected(before) || isEstimateProtected(after);
}

export function estimateAuditSnapshot(estimate = {}, { quoteTotal, internalCost } = {}) {
  const snapshot = {};
  Object.entries(estimate || {}).forEach(([key, value]) => {
    if (SYSTEM_FIELDS.has(key)) return;
    snapshot[key] = value;
  });
  snapshot.total_cost = internalCost === undefined ? num(estimate.total_cost) : num(internalCost);
  snapshot.quote_total = quoteTotal === undefined ? num(estimate.quote_total) : num(quoteTotal);
  return JSON.parse(JSON.stringify(snapshot));
}

export function summarizeEstimateChanges(before = {}, after = {}) {
  const changes = [];
  if (String(before.status || "") !== String(after.status || "")) {
    changes.push(`Status: ${before.status || "draft"} → ${after.status || "draft"}`);
  }
  if (num(before.quote_version) !== num(after.quote_version)) {
    changes.push(`Customer quote issued: Version ${num(after.quote_version)} · ${after.quote_issue_date || "date not recorded"}`);
  }
  if (Math.abs(num(before.quote_total) - num(after.quote_total)) > 0.005) {
    changes.push(`Customer quote total: ${num(before.quote_total).toFixed(2)} → ${num(after.quote_total).toFixed(2)}`);
  }
  if (Math.abs(num(before.total_cost) - num(after.total_cost)) > 0.005) {
    changes.push(`Internal cost: ${num(before.total_cost).toFixed(2)} → ${num(after.total_cost).toFixed(2)}`);
  }
  if (JSON.stringify(before.line_items || []) !== JSON.stringify(after.line_items || [])) {
    changes.push("Product scope / Product pricing changed");
  }

  const quoteKeys = [
    "discount_percent", "contingency_percent", "tax_percent", "deposit_percent", "shipping_fee", "permit_fee",
    "hide_section_prices", "quote_title", "quote_intro_text", "scope_inclusions", "scope_exclusions", "payment_terms",
    "quote_terms_conditions", "warranty_text", "lead_time_text",
  ];
  if (quoteKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Customer quote settings / terms changed");
  }

  const detailKeys = [
    "project_name", "client_name", "customer_id", "po_number", "site_address", "order_contact", "contact_name",
    "contact_email", "contact_phone", "salesperson", "target_install_date", "priority", "tags",
  ];
  if (detailKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push("Estimate / customer details changed");
  }

  return changes.length ? changes : ["Estimate saved with no material customer-facing change detected"];
}
