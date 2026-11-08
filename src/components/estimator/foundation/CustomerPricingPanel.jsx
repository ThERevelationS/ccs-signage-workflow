import { Input } from "@/components/ui/input";
import { money } from "./foundationCalc";
import { foundationHasEnginePricing } from "./foundationSellPricing";

export default function CustomerPricingPanel({ cost, project, onChange }) {
  const markup = project.customer_markup_percent || 0;
  const override = project.customer_price_override;
  const marked = cost * (1 + markup / 100);
  const price = override > 0 ? override : marked;
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

  // Sell-side precedence (CMP-A10; mirrors sourceProjectEconomics' foundation
  // branch in customerPricing.js): explicit pricing-engine config resolves
  // the live customer price first; absent engine config an applied Markup
  // Tier snapshot (customer_pricing.applied === true with a numeric total)
  // replaces it wholesale; otherwise the manual baseline below wins —
  // customer_price_override > 0 beats cost x (1 + markup %). `price` here is
  // therefore the MANUAL baseline: honest whenever neither upstream layer is
  // engaged, advisory-shadowed otherwise.
  const enginePriced = foundationHasEnginePricing(project);
  const tierTotal = project.customer_pricing?.applied === true && Number.isFinite(Number(project.customer_pricing?.total))
    ? Number(project.customer_pricing.total)
    : null;
  const tierShadowsBaseline = !enginePriced && tierTotal !== null && Math.abs(tierTotal - price) > 0.005;

  return (
    <div className="max-w-xl bg-white rounded-sm border border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="text-[13px] font-bold text-gray-900">Customer Pricing</h3>
        <p className="text-[11px] text-gray-400">
          Internal cost stays private — the customer price below is what flows to the estimate presentation.
        </p>
      </div>

      {enginePriced && (
        <p role="status" className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
          Pricing-engine configuration on this project resolves the live customer price (precedence: pricing engine → applied tier → price override → markup %). The manual markup/override below still applies to components without engine config.
        </p>
      )}
      {tierShadowsBaseline && (
        <p role="status" className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
          Applied Tier {project.customer_pricing?.tier_number} pricing ({money(tierTotal)}) is the live customer price — the markup/override below is stored but not used while a tier is applied. Editing either field switches this section back to manual pricing.
        </p>
      )}

      <div className="flex justify-between text-[12px] text-gray-600">
        <span>Internal section cost</span>
        <span className="font-semibold text-gray-900">{money(cost)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-gray-500">
          Markup %
          <Input
            type="number"
            value={markup}
            onChange={(e) => onChange({ customer_markup_percent: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Price override
          <Input
            type="number"
            value={override ?? ""}
            placeholder="Use markup"
            onChange={(e) => onChange({ customer_price_override: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-1 text-[12px]">
        <div className="flex justify-between text-gray-600">
          <span>Markup amount</span>
          <span>{money(marked - cost)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Gross margin</span>
          <span>{margin.toFixed(1)}%</span>
        </div>
        {/* O-096: when the applied tier is the live sell, the acknowledged
            margin pair comes straight from the customer_pricing snapshot
            fields (total vs raw_subtotal) — never recomputed from the manual
            baseline it shadows. */}
        {tierShadowsBaseline && Number.isFinite(Number(project.customer_pricing?.raw_subtotal)) && (
          <div className="flex justify-between text-blue-700">
            <span>Tier {project.customer_pricing?.tier_number} snapshot margin (acknowledged)</span>
            <span>
              {money(tierTotal - Number(project.customer_pricing.raw_subtotal))}
              {tierTotal > 0 ? ` · ${(((tierTotal - Number(project.customer_pricing.raw_subtotal)) / tierTotal) * 100).toFixed(1)}%` : ""}
            </span>
          </div>
        )}
        <div className="flex justify-between text-[14px] font-bold text-gray-900 pt-1">
          <span>Customer price</span>
          <span className="text-red-700">{money(price)}</span>
        </div>
      </div>
    </div>
  );
}