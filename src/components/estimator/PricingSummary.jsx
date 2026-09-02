import { Input } from "@/components/ui/input";
import { money } from "./aioPricing";
import { computeEstimateProfitability } from "./profitability";

const PERCENT_FIELDS = [
  { key: "discount_percent", label: "Discount %" },
  { key: "contingency_percent", label: "Contingency %" },
  { key: "tax_percent", label: "Tax %" },
  { key: "deposit_percent", label: "Deposit %" },
];

const FEE_FIELDS = [
  { key: "shipping_fee", label: "Shipping / freight" },
  { key: "permit_fee", label: "Permit / admin" },
];

export default function PricingSummary({ estimate, pricing, onChange }) {
  const profitability = computeEstimateProfitability(estimate, pricing);
  const rows = [
    ["Sections subtotal", pricing.subtotal],
    ["Discount", -pricing.discount],
    ["Contingency", pricing.contingency],
    ["Fees", pricing.fees],
    ["Tax", pricing.tax],
  ];

  return (
    <div className="bg-white rounded-md border border-gray-200 p-4">
      <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
        <div className="text-[10px] font-bold tracking-wider text-gray-500 mb-2">INTERNAL PROFITABILITY</div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <Metric label="Internal product cost" value={money(profitability.internalCost)} />
          <Metric label="Customer revenue" value={money(profitability.customerRevenueBeforeFeesTax)} />
          <Metric label="Gross profit" value={money(profitability.grossProfit)} emphasis={profitability.grossProfit < 0 ? "negative" : "positive"} />
          <Metric label="Gross margin" value={`${profitability.grossMarginPercent.toFixed(1)}%`} emphasis={profitability.grossProfit < 0 ? "negative" : "positive"} />
        </div>
        <div className="mt-2 text-[9px] leading-4 text-gray-400">
          Uses accepted frozen Product cost. Customer revenue includes Product adjustments, estimate discount and contingency; shipping, permit/admin fees and tax are excluded because their internal costs are not tracked here.
        </div>
      </div>

      <div className="text-[11px] font-bold tracking-wider text-red-600 mb-3">CUSTOMER PRICING</div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[...PERCENT_FIELDS, ...FEE_FIELDS].map((f) => (
          <label key={f.key} className="text-xs text-gray-500">
            {f.label}
            <Input
              type="number"
              value={estimate[f.key] ?? 0}
              onChange={(e) => onChange({ [f.key]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>

      <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between text-gray-600">
            <span>{label}</span>
            <span>{money(value)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
          <span>Quote total</span>
          <span className="text-red-600">{money(pricing.quoteTotal)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Deposit due</span>
          <span>{money(pricing.deposit)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Balance</span>
          <span>{money(pricing.balance)}</span>
        </div>
      </div>
    </div>
  );
}