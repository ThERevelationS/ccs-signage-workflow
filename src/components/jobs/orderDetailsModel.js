// D-04 — Order Details drawer model: per-product price / cost / margin +
// "overridden during order entry" flags + the order-level margin rollup.
//
// Pure and IO-free — esbuild-bundled + unit-tested under Node
// (scripts/test-job-workspace-tabs.mjs). Integer cents end-to-end, same
// convention as orderWaterfall.js / marginModel.ts: dollars convert once via
// toCents, all sums are integers, *_cents outputs mirror to 2dp dollars.
//
// Cost-basis precedence per product (`cost_basis`), lightest first — the
// drawer never loads BuilderPart/Machine/LaborLevel registries, so this is
// deliberately the profitability.js level of depth plus the parts manifest
// the WO already carries:
//   1. 'product'  — explicit cost fields stored on the product row itself
//                   (ext_cost/extended_cost/unit_cost×qty; workOrderPrintModel
//                   reads the same field set for its internal column).
//   2. 'parts'    — productsToPartsModel rollup over the product's embedded
//                   part rows and/or the WO-level materials[] manifest
//                   (extended_cents sums; uncosted parts flagged).
//   3. 'estimate' — the source estimate's line_items[].total_snapshot ×
//                   customer_quantity — exactly the acceptedInternalEstimateCost
//                   basis profitability.js uses, joined by estimate_line_id /
//                   builder_product_id / product id. The page lazy-loads the
//                   estimate on first drawer open and passes it through.
//   4. null       — unresolved: the row renders "—", never a fake $0.
//
// Sell side is always the customer price on the WO product:
//   sell_cents = quoted_total ?? quoted_unit_price × quantity (integer cents).
// This matches the workspace products table and jobFinancialSummary's quoted
// basis. Fees/tax are out of scope — same rule profitability.js documents
// (pass-through amounts carry no tracked internal cost).

import { productParts, partsSummary } from "./productsToPartsModel.js";
import {
  hasOrderEntryOverride,
  overrideBadgeLabel,
  overrideBadgeTooltip,
} from "./orderEntryOverrideModel.js";

const clean = (v) => String(v ?? "").trim();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

// Sign-safe dollars→integer-cents (reconciliationModel/marginModel convention:
// half away from zero both directions).
export const toCents = (v) => {
  const n = num(v);
  if (n === null) return null;
  return Math.round(n * 100 + Math.sign(n) * 1e-7);
};
export const fromCents = (c) => (Number.isFinite(Number(c)) ? Math.round(Number(c)) / 100 : null);

// margin% of sell — marginModel.marginPctOf parity (2dp, 0 when sell <= 0).
export const marginPctOf = (marginCents, sellCents) => {
  const sell = num(sellCents);
  if (!(sell > 0)) return 0;
  return Math.round(((num(marginCents) / sell) * 100 + Number.EPSILON) * 100) / 100;
};
// markup% on cost — profitability.js markupOnCostPercent parity.
export const markupPctOf = (marginCents, costCents) => {
  const cost = num(costCents);
  if (!(cost > 0)) return 0;
  return Math.round(((num(marginCents) / cost) * 100 + Number.EPSILON) * 100) / 100;
};

// --- sell side ----------------------------------------------------------------

const productQty = (p) => {
  const q = num(p?.quantity);
  return q !== null ? q : 1;
};

// Customer sell price in cents: stored quoted_total wins, else unit × qty.
// 0 is a real sell (a comped line); null means "no sell stored".
export function productSellCents(product) {
  const p = isObj(product) ? product : {};
  const total = toCents(p.quoted_total);
  if (total !== null) return total;
  const unit = toCents(p.quoted_unit_price ?? p.unit_price ?? p.price);
  if (unit !== null) return Math.round(unit * productQty(p));
  return null;
}

// --- cost basis ----------------------------------------------------------------

// Explicit cost fields on the product itself — extended forms first, then
// unit forms × quantity. Returns integer cents or null.
const explicitProductCostCents = (p) => {
  const extended = toCents(
    p.ext_cost_cents ?? p.extended_cost_cents ?? p.ext_cost ?? p.extended_cost ??
    p.internal_cost ?? p.internal_extended_cost,
  );
  if (extended !== null) return extended;
  const unit = toCents(p.unit_cost_cents ?? p.unit_cost ?? p.cost ?? p.est_unit_cost ?? p.internal_unit_cost);
  if (unit !== null) return Math.round(unit * productQty(p));
  return null;
};

// Parts rollup via productsToPartsModel: embedded product part lists first,
// then caller catalog (the page passes workOrder.materials). Returns
// { cents|null, uncosted } — null only when NO part row resolved any cost.
const partsCostCents = (product, partsCatalog) => {
  const parts = productParts(product, { partsCatalog });
  if (!parts.length) return { cents: null, uncosted: 0, part_count: 0 };
  const summary = partsSummary(product, parts);
  const cents = summary.total_cost_cents > 0 || parts.some((r) => Number.isFinite(r?.extended_cents))
    ? summary.total_cost_cents
    : null;
  return { cents, uncosted: summary.uncosted_parts, part_count: summary.total_parts };
};

// Estimate line matching this product: estimate_line_id first (canonical seed
// from buildEstimateWorkOrderProducts), then builder_product_id, then the
// product's own id (seeded as builder_product_id || line_id at conversion).
function estimateLineForProduct(product, estimate) {
  const p = isObj(product) ? product : {};
  const lines = asList(estimate?.line_items).filter(isObj);
  if (!lines.length) return null;
  const lineId = clean(p.estimate_line_id) || clean(p.source_estimate_line_id);
  const builderId = clean(p.builder_product_id);
  const pid = clean(p.id) || clean(p.product_id);
  const match = (l, key) => clean(l?.[key]) && [lineId, builderId, pid].includes(clean(l?.[key]));
  return (
    lines.find((l) => lineId && (clean(l.line_id) === lineId || clean(l.estimate_line_id) === lineId)) ||
    lines.find((l) => builderId && clean(l.builder_product_id) === builderId) ||
    lines.find((l) => pid && (match(l, "builder_product_id") || match(l, "line_id") || match(l, "project_id"))) ||
    null
  );
}

// profitability.js basis: total_snapshot (internal unit cost) ×
// customer_quantity — the exact per-line share of
// acceptedInternalEstimateCost(estimate.line_items).
const estimateCostCents = (product, estimate) => {
  const line = estimateLineForProduct(product, estimate);
  if (!line) return null;
  const unitCost = num(line.total_snapshot);
  if (unitCost === null) return null;
  const qty = num(line.customer_quantity);
  return toCents(unitCost * (qty !== null ? Math.max(0, qty) : productQty(product)));
};

// Resolve one product's cost. Returns { cents|null, basis, uncosted_parts } —
// basis ∈ 'product' | 'parts' | 'estimate' | ''.
export function productCostCents(product, { estimate = null, partsCatalog = null } = {}) {
  const explicit = explicitProductCostCents(product);
  if (explicit !== null) return { cents: explicit, basis: "product", uncosted_parts: 0 };
  const parts = partsCostCents(product, partsCatalog);
  if (parts.cents !== null) {
    return { cents: parts.cents, basis: "parts", uncosted_parts: parts.uncosted, part_count: parts.part_count };
  }
  const est = estimateCostCents(product, estimate);
  if (est !== null) return { cents: est, basis: "estimate", uncosted_parts: parts.uncosted || 0 };
  return { cents: null, basis: "", uncosted_parts: parts.uncosted || 0 };
}

// --- rows ---------------------------------------------------------------------

// productMarginRows(workOrder, { estimate, partsCatalog }) →
//   [{ product_id, position, name, module_key, quantity,
//      unit_price_cents|null, sell_cents|null, cost_cents|null, cost_basis,
//      uncosted_parts, margin_cents|null, margin_pct|null, markup_pct|null,
//      overridden, override_badge, override_tooltip, override_edits }]
export function productMarginRows(workOrder, { estimate = null, partsCatalog } = {}) {
  const wo = isObj(workOrder) ? workOrder : {};
  const catalog = partsCatalog === undefined ? wo.materials : partsCatalog;
  return asList(wo.products)
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isObj(p))
    .map(({ p, i }) => {
      const sell = productSellCents(p);
      const cost = productCostCents(p, { estimate, partsCatalog: catalog });
      const margin = sell !== null && cost.cents !== null ? sell - cost.cents : null;
      const unit = toCents(p.quoted_unit_price ?? p.unit_price ?? p.price);
      return {
        product_id: clean(p.id) || `${clean(wo.id)}-${i}`,
        position: i + 1,
        name: clean(p.description) || clean(p.client_product_name) || `Product ${i + 1}`,
        module_key: clean(p.module_key),
        quantity: productQty(p),
        unit_price_cents: unit,
        sell_cents: sell,
        cost_cents: cost.cents,
        cost_basis: cost.basis,
        uncosted_parts: cost.uncosted_parts || 0,
        margin_cents: margin,
        margin_pct: margin !== null ? marginPctOf(margin, sell) : null,
        markup_pct: margin !== null ? markupPctOf(margin, cost.cents) : null,
        overridden: hasOrderEntryOverride(p),
        override_badge: overrideBadgeLabel(p),
        override_tooltip: overrideBadgeTooltip(p),
        override_edits: asList(p.override_edits),
      };
    });
}

// --- order rollup ---------------------------------------------------------------

// orderMarginSummary(rows, { workOrder }) →
//   { sell_cents, cost_cents|null, margin_cents|null, margin_pct|null,
//     markup_pct|null, resolved_products, unresolved_products, product_count,
//     partial }
// Cost/margin cover the RESOLVED products only; `partial` flags that at least
// one product's cost is unresolved so the drawer never presents a subset sum
// as the whole-order margin.
export function orderMarginSummary(rows, { workOrder } = {}) {
  const list = asList(rows);
  const sellCents = list.reduce((s, r) => s + (Number.isFinite(r?.sell_cents) ? r.sell_cents : 0), 0);
  const resolved = list.filter((r) => Number.isFinite(r?.cost_cents));
  const unresolved = list.filter((r) => !Number.isFinite(r?.cost_cents));
  // When nothing resolved, the WO-level actual_cost field is still a real
  // shop number — surface it as a 'wo_actual' hint but never as margin basis.
  const actualCostCents = toCents(workOrder?.actual_cost);
  const costCents = resolved.length ? resolved.reduce((s, r) => s + r.cost_cents, 0) : null;
  const marginCents = costCents !== null ? sellCents - costCents : null;
  return {
    sell_cents: sellCents,
    cost_cents: costCents,
    margin_cents: marginCents,
    margin_pct: marginCents !== null ? marginPctOf(marginCents, sellCents) : null,
    markup_pct: marginCents !== null ? markupPctOf(marginCents, costCents) : null,
    resolved_products: resolved.length,
    unresolved_products: unresolved.length,
    product_count: list.length,
    partial: unresolved.length > 0,
    actual_cost_cents: actualCostCents,
  };
}
