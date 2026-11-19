import React from "react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const ROWS = [
  ["Vinyl", "total_vinyl_cost"],
  ["Laminate", "total_laminate_cost"],
  ["Print / ink", "total_ink_cost"],
  ["Supplies", "total_supplies_cost"],
  ["Labor", "labor_cost"],
];

export default function VinylTotals({ totals }) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-4 sticky top-4">
      <h3 className="font-semibold text-gray-900 mb-3">Section Total</h3>
      <div className="space-y-1.5 text-sm">
        {ROWS.map(([label, key]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-900">{money(totals[key])}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs text-gray-400 pt-1">
          <span>Vinyl sqft</span>
          <span>{Number(totals.total_vinyl_sqft || 0).toFixed(1)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Labor hours</span>
          <span>{Number(totals.labor_hours || 0).toFixed(1)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-gray-900">{money(totals.subtotal)}</span>
        </div>
        {totals.markup_amount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Markup</span>
            <span className="text-gray-900">{money(totals.markup_amount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-red-200 pt-2 mt-2 font-bold text-lg">
          <span className="text-gray-900">Total</span>
          <span className="text-red-600">{money(totals.total_cost)}</span>
        </div>
      </div>
    </div>
  );
}