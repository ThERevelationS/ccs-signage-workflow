// src/components/estimator/customerPricing.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function hasNumericValue(value) {
  return value !== void 0 && value !== null && value !== "" && Number.isFinite(Number(value));
}
function acceptedCustomerUnitPrice(line) {
  return hasNumericValue(line?.customer_price_snapshot) ? Number(line.customer_price_snapshot) : num(line?.total_snapshot);
}

// src/components/estimator/aioPricing.js
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
var money = (n) => `$${Number(n || 0).toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export {
  computePricing,
  money
};
