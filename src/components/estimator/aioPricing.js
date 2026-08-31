// Customer pricing waterfall for an All-In-One estimate:
// per-section adjustments -> discount -> contingency -> fees -> tax -> deposit.
export function computePricing(estimate) {
  const lines = estimate.line_items || [];

  const sections = lines.map((line) => {
    const unitRaw = Number(line.total_snapshot || 0);
    const quantity = Math.max(0, Number(line.customer_quantity ?? 1) || 0);
    const raw = unitRaw * quantity;
    const adj = Number(line.adjustment_percent || 0);
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
  const quoteTotal = taxableBase + tax;
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
    balance: quoteTotal - deposit,
  };
}

export const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;