// Compare current vinyl cost vs other vinyls. Feature #22.

import React, { useMemo } from "react";
import { computeAlternativeVinylCost } from "./vinylCostHelpers";
import { TrendingDown, TrendingUp } from "lucide-react";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function VinylAlternativeCompare({ calc, currentVinyl, vinyls }) {
  const options = useMemo(() => {
    if (!calc || !currentVinyl) return [];
    return vinyls
      .filter(v => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false && v.id !== currentVinyl.id)
      .map(v => ({
        vinyl: v,
        cost: computeAlternativeVinylCost(calc, v),
        delta: computeAlternativeVinylCost(calc, v) - (calc.vinylCost || 0),
      }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 6);
  }, [calc, currentVinyl, vinyls]);

  if (options.length === 0 || !calc?.vinylCost) return null;

  return (
    <div className="text-xs space-y-1">
      <div className="font-semibold text-slate-700">Compare to other vinyls (same area):</div>
      <div className="border border-slate-200 rounded overflow-hidden bg-white">
        <table className="w-full text-xs">
          <tbody>
            <tr className="bg-slate-50 border-b border-slate-200">
              <td className="px-2 py-1.5 font-medium">{currentVinyl.vinyl_name} <span className="text-[10px] text-slate-500">(current)</span></td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(calc.vinylCost)}</td>
              <td className="px-2 py-1.5 text-right text-slate-400">—</td>
            </tr>
            {options.map(({ vinyl, cost, delta }) => {
              const cheaper = delta < 0;
              return (
                <tr key={vinyl.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5 truncate">{vinyl.vinyl_name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(cost)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums flex items-center justify-end gap-1 ${cheaper ? "text-emerald-700" : "text-red-600"}`}>
                    {cheaper ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {cheaper ? "−" : "+"}{fmt(Math.abs(delta))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}