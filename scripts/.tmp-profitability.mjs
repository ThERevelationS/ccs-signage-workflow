// src/components/estimator/customerPricing.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function acceptedInternalEstimateCost(lineItems = []) {
  return (lineItems || []).reduce((sum, line) => {
    const quantity = Math.max(0, num(line?.customer_quantity, 1));
    return sum + num(line?.total_snapshot) * quantity;
  }, 0);
}

// src/components/estimator/profitability.js
var num2 = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
var DEFAULT_MARGIN_FLOOR_PERCENT = 15;
function computeEstimateProfitability(estimate = {}, pricing = {}) {
  const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
  const productRevenue = num2(pricing.subtotal);
  const discount = num2(pricing.discount);
  const contingency = num2(pricing.contingency);
  const customerRevenueBeforeFeesTax = productRevenue - discount + contingency;
  const grossProfit = customerRevenueBeforeFeesTax - internalCost;
  const grossMarginPercent = customerRevenueBeforeFeesTax > 0 ? grossProfit / customerRevenueBeforeFeesTax * 100 : 0;
  const markupOnCostPercent = internalCost > 0 ? grossProfit / internalCost * 100 : 0;
  return {
    internalCost,
    productRevenue,
    discount,
    contingency,
    customerRevenueBeforeFeesTax,
    grossProfit,
    grossMarginPercent,
    markupOnCostPercent
  };
}
export {
  DEFAULT_MARGIN_FLOOR_PERCENT,
  computeEstimateProfitability
};
