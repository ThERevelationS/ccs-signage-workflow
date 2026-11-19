// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/customerPricing.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num(line?.total_snapshot);
}
function acceptedInternalEstimateCost(lineItems = []) {
  return (lineItems || []).reduce((sum, line) => {
    const quantity = Math.max(0, num(line?.customer_quantity, 1));
    return sum + num(line?.total_snapshot) * quantity;
  }, 0);
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/aioPricing.js
function computePricing(estimate) {
  const lines = estimate.line_items || [];
  const sections = lines.map((line) => {
    const unitRaw = acceptedCustomerUnitPrice(line);
    const quantity = Math.max(0, Number(line.customer_quantity ?? 1) || 0);
    const raw = unitRaw * quantity;
    const adj = Number(line.adjustment_percent || 0) + Number(estimate?.category_adjustments?.[line.product_category] || 0);
    return { ...line, unitRaw, quantity, raw, adjusted: raw * (1 + adj / 100) };
  });
  const rawTotal = sections.reduce((s, l) => s + l.raw, 0);
  const subtotal = sections.reduce((s, l) => s + l.adjusted, 0);
  const discount = subtotal * (Number(estimate.discount_percent || 0) / 100);
  const afterDiscount = subtotal - discount;
  const contingency = afterDiscount * (Number(estimate.contingency_percent || 0) / 100);
  const fees = Number(estimate.shipping_fee || 0) + Number(estimate.permit_fee || 0);
  const taxableBase = afterDiscount + contingency + fees;
  const tax = taxableBase * (Number(estimate.tax_percent || 0) / 100);
  const quoteTotal = estimate.round_quote_total ? Math.round(taxableBase + tax) : taxableBase + tax;
  const deposit = quoteTotal * (Number(estimate.deposit_percent || 0) / 100);
  return {
    sections,
    rawTotal,
    subtotal,
    discount,
    contingency,
    fees,
    tax,
    quoteTotal,
    deposit,
    balance: quoteTotal - deposit
  };
}

// .audit-work/foundation-o012-handoff/fixture/src/components/estimator/customerQuote.js
function buildCustomerQuoteRows(estimate, pricing) {
  const sections = pricing?.sections || [];
  if (estimate?.hide_section_prices === true) {
    return [{
      key: "project-scope",
      name: "Project scope",
      category: "",
      quantity: "",
      description: estimate?.project_name || "",
      amount: Number(pricing?.subtotal || 0),
      bundled: true
    }];
  }
  const rows = sections.filter((section) => section.include_in_customer !== false).map((section, index) => ({
    key: section.line_id || section.project_id || `product-${index}`,
    name: section.client_product_name || section.project_name || section.product_category || `Product ${index + 1}`,
    category: section.product_category || "",
    quantity: section.quantity,
    description: section.customer_description || "",
    amount: Number(section.adjusted || 0),
    bundled: false
  }));
  const bundledAmount = sections.filter((section) => section.include_in_customer === false).reduce((sum, section) => sum + Number(section.adjusted || 0), 0);
  if (Math.abs(bundledAmount) > 5e-3) {
    rows.push({
      key: "additional-project-scope",
      name: "Additional project scope",
      category: "",
      quantity: "",
      description: "Bundled scope included in project pricing.",
      amount: bundledAmount,
      bundled: true
    });
  }
  return rows;
}
function quoteRowsTotal(rows) {
  return (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
export {
  acceptedCustomerUnitPrice,
  acceptedInternalEstimateCost,
  buildCustomerQuoteRows,
  computePricing,
  quoteRowsTotal
};
