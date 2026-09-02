import { acceptedInternalEstimateCost } from "./customerPricing";

const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

// Internal profitability view for the All-In-One estimator.
//
// Cost basis:
//   accepted/frozen Product internal cost × customer quantity
//
// Revenue basis:
//   accepted customer Product pricing after per-Product adjustments,
//   then estimate discount and contingency.
//
// Shipping, permit/admin fees and tax are intentionally excluded because this
// estimator does not track a corresponding internal cost for those pass-through
// amounts. This keeps the displayed gross profit deterministic and avoids
// presenting untracked fees as pure profit.
export function computeEstimateProfitability(estimate = {}, pricing = {}) {
  const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
  const productRevenue = num(pricing.subtotal);
  const discount = num(pricing.discount);
  const contingency = num(pricing.contingency);
  const customerRevenueBeforeFeesTax = productRevenue - discount + contingency;
  const grossProfit = customerRevenueBeforeFeesTax - internalCost;
  const grossMarginPercent = customerRevenueBeforeFeesTax > 0
    ? (grossProfit / customerRevenueBeforeFeesTax) * 100
    : 0;
  const markupOnCostPercent = internalCost > 0
    ? (grossProfit / internalCost) * 100
    : 0;

  return {
    internalCost,
    productRevenue,
    discount,
    contingency,
    customerRevenueBeforeFeesTax,
    grossProfit,
    grossMarginPercent,
    markupOnCostPercent,
  };
}
