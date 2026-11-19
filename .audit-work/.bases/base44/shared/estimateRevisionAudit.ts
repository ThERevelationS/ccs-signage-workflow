const SYSTEM_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'edit_reason']);

export const estimateAuditNumber = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export function estimateAuditSnapshot(estimate: Record<string, any> = {}, overrides: { quoteTotal?: unknown; internalCost?: unknown } = {}) {
  const snapshot: Record<string, any> = {};
  for (const [key, value] of Object.entries(estimate || {})) {
    if (SYSTEM_FIELDS.has(key)) continue;
    snapshot[key] = value;
  }
  snapshot.total_cost = overrides.internalCost === undefined
    ? estimateAuditNumber(estimate?.total_cost)
    : estimateAuditNumber(overrides.internalCost);
  snapshot.quote_total = overrides.quoteTotal === undefined
    ? estimateAuditNumber(estimate?.quote_total)
    : estimateAuditNumber(overrides.quoteTotal);
  return JSON.parse(JSON.stringify(snapshot));
}

export function summarizeEstimateAuditChanges(before: Record<string, any> = {}, after: Record<string, any> = {}) {
  const changes: string[] = [];
  if (String(before.status || '') !== String(after.status || '')) {
    changes.push(`Status: ${before.status || 'draft'} → ${after.status || 'draft'}`);
  }
  if (estimateAuditNumber(before.quote_version) !== estimateAuditNumber(after.quote_version)) {
    changes.push(`Customer quote issued: Version ${estimateAuditNumber(after.quote_version)} · ${after.quote_issue_date || 'date not recorded'}`);
  }
  if (Math.abs(estimateAuditNumber(before.quote_total) - estimateAuditNumber(after.quote_total)) > 0.005) {
    changes.push(`Customer quote total: ${estimateAuditNumber(before.quote_total).toFixed(2)} → ${estimateAuditNumber(after.quote_total).toFixed(2)}`);
  }
  if (Math.abs(estimateAuditNumber(before.total_cost) - estimateAuditNumber(after.total_cost)) > 0.005) {
    changes.push(`Internal cost: ${estimateAuditNumber(before.total_cost).toFixed(2)} → ${estimateAuditNumber(after.total_cost).toFixed(2)}`);
  }
  if (JSON.stringify(before.line_items || []) !== JSON.stringify(after.line_items || [])) {
    changes.push('Product scope / Product pricing changed');
  }

  const quoteKeys = [
    'discount_percent', 'contingency_percent', 'tax_percent', 'deposit_percent', 'shipping_fee', 'permit_fee',
    'hide_section_prices', 'quote_title', 'quote_intro_text', 'scope_inclusions', 'scope_exclusions', 'payment_terms',
    'quote_terms_conditions', 'warranty_text', 'lead_time_text',
  ];
  if (quoteKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push('Customer quote settings / terms changed');
  }

  const detailKeys = [
    'project_name', 'client_name', 'customer_id', 'po_number', 'site_address', 'order_contact', 'contact_name',
    'contact_email', 'contact_phone', 'salesperson', 'target_install_date', 'priority', 'tags',
  ];
  if (detailKeys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) {
    changes.push('Estimate / customer details changed');
  }

  return changes.length ? changes : ['Estimate saved with no material customer-facing change detected'];
}

export function estimateQuoteIssueKey(estimateId: unknown, quoteVersion: unknown) {
  const id = String(estimateId || '').trim();
  const version = Math.max(0, Math.floor(estimateAuditNumber(quoteVersion)));
  return id && version > 0 ? `estimate:${id}:quote:v${version}` : '';
}
