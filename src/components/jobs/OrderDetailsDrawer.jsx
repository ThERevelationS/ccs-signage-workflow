// D-04 — Order Details drawer (CoreBridge order-details profitability pane).
// Right-side DetailDrawer showing per-product price / cost / margin, explicit
// "Overridden during order entry" badges, and the order-level margin rollup.
//
// Cost math is all in orderDetailsModel.js (integer cents, profitability.js
// parity). The estimate read is lazy — the parent enables a single
// AllInOneEstimate.get the first time the drawer opens and passes the row
// through `estimate`; rows resolve on whatever basis is available meanwhile
// (explicit product cost → parts manifest → estimate line).

import { useMemo } from "react";
import { DetailDrawer } from "@/components/kit";
import { productMarginRows, orderMarginSummary, fromCents } from "./orderDetailsModel.js";

const usd = (cents) =>
  cents === null || cents === undefined
    ? "—"
    : `$${Number(fromCents(cents) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const COST_BASIS_LABELS = {
  product: "product",
  parts: "parts",
  estimate: "estimate",
};

const marginTone = (marginCents) =>
  marginCents === null || marginCents === undefined
    ? "text-gray-300"
    : marginCents < 0
      ? "text-rose-700 font-semibold"
      : "text-emerald-700";

export default function OrderDetailsDrawer({ open, onOpenChange, workOrder, estimate = null, estimateLoading = false }) {
  const rows = useMemo(
    () => productMarginRows(workOrder, { estimate }),
    [workOrder, estimate],
  );
  const summary = useMemo(
    () => orderMarginSummary(rows, { workOrder }),
    [rows, workOrder],
  );

  const ref = String(workOrder?.corbridge_invoice_number || workOrder?.title || workOrder?.id || "");

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="Order Details"
      description={ref ? `${ref} — price, cost and margin per product` : "Price, cost and margin per product"}
    >
      {estimateLoading && (
        <div className="mb-2 rounded border border-sky-100 bg-sky-50 px-2 py-1 text-[11px] text-sky-700">
          Loading estimate cost snapshot…
        </div>
      )}

      {/* Per-product rows */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Product</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">Price</th>
            <th className="py-1.5 pr-2 text-right">Cost</th>
            <th className="py-1.5 pr-2 text-right">Margin</th>
            <th className="py-1.5 text-right">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product_id} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-2 text-gray-400">{r.position}</td>
              <td className="max-w-[220px] py-2 pr-2">
                <div className="truncate font-medium text-gray-800" title={r.name}>{r.name}</div>
                {r.overridden && (
                  <span
                    className="mt-0.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
                    title={r.override_tooltip}
                  >
                    {r.override_badge}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right text-gray-600">{r.quantity}</td>
              <td className="py-2 pr-2 text-right font-medium text-gray-800">{usd(r.sell_cents)}</td>
              <td className="py-2 pr-2 text-right text-gray-600">
                {usd(r.cost_cents)}
                {r.cost_basis && (
                  <div className="text-[9px] text-gray-400">via {COST_BASIS_LABELS[r.cost_basis] || r.cost_basis}</div>
                )}
                {!r.cost_basis && <div className="text-[9px] text-gray-300">no cost basis</div>}
              </td>
              <td className={`py-2 pr-2 text-right ${marginTone(r.margin_cents)}`}>{usd(r.margin_cents)}</td>
              <td className={`py-2 text-right ${marginTone(r.margin_cents)}`}>{pct(r.margin_pct)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-gray-400">No products on this work order.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Order-level margin rollup */}
      <div className="mt-4 rounded border border-gray-200 bg-gray-50/70 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Order margin
          {summary.partial && (
            <span className="ml-2 font-normal normal-case text-amber-700">
              · covers {summary.resolved_products} of {summary.product_count} costed products
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-gray-400">Sell</dt>
            <dd className="mt-0.5 font-semibold text-gray-800">{usd(summary.sell_cents)}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Cost</dt>
            <dd className="mt-0.5 font-semibold text-gray-800">
              {usd(summary.cost_cents)}
              {summary.partial && summary.cost_cents !== null && <span className="text-amber-600">*</span>}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Margin</dt>
            <dd className={`mt-0.5 font-semibold ${marginTone(summary.margin_cents)}`}>
              {usd(summary.margin_cents)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Margin % / Markup %</dt>
            <dd className={`mt-0.5 font-semibold ${marginTone(summary.margin_cents)}`}>
              {pct(summary.margin_pct)} / {pct(summary.markup_pct)}
            </dd>
          </div>
        </dl>
        {summary.partial && (
          <p className="mt-2 text-[10px] leading-snug text-amber-700">
            * {summary.unresolved_products} product{summary.unresolved_products === 1 ? " has" : "s have"} no cost
            basis (no product cost, uncosted parts, and no matching estimate line). Margin shown is the resolved
            subset, not the whole order.
          </p>
        )}
        {summary.cost_cents === null && summary.actual_cost_cents !== null && (
          <p className="mt-2 text-[10px] text-gray-500">
            Shop-reported actual cost on the work order: {usd(summary.actual_cost_cents)} — kept out of the margin
            math because it isn't reconciled per product.
          </p>
        )}
      </div>
    </DetailDrawer>
  );
}
