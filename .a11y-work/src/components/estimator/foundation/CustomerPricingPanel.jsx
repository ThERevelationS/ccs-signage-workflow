import React from "react";
import { Input } from "@/components/ui/input";
import { money } from "./foundationCalc";

export default function CustomerPricingPanel({ cost, project, onChange }) {
  const markup = project.customer_markup_percent || 0;
  const override = project.customer_price_override;
  const marked = cost * (1 + markup / 100);
  const price = override > 0 ? override : marked;
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

  return (
    <div className="max-w-xl bg-white rounded-sm border border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="text-[13px] font-bold text-gray-900">Customer Pricing</h3>
        <p className="text-[11px] text-gray-400">
          Internal cost stays private — the customer price below is what flows to the estimate presentation.
        </p>
      </div>

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
        <div className="flex justify-between text-[14px] font-bold text-gray-900 pt-1">
          <span>Customer price</span>
          <span className="text-red-700">{money(price)}</span>
        </div>
      </div>
    </div>
  );
}