// "Best Roll Width" recommender — Feature #10.
//
// Looks at vinyls that share a `product_group_key` (or fall back to the same
// vinyl_name + manufacturer + product_series) with the currently-selected
// vinyl. For each candidate width, re-runs the nesting calculator and picks
// the cheapest viable option. Shows a one-click swap.

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, ArrowRight } from "lucide-react";
import { calculateVinylProject } from "./vinylNestingCalculator";

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// Build the candidate group for a vinyl: same product_group_key if set,
// otherwise same vinyl_name + manufacturer + product_series.
const groupCandidates = (vinyl, allVinyls) => {
  if (!vinyl) return [];
  const base = allVinyls.filter(v =>
    v.id !== vinyl.id && v.is_active !== false && v.show_in_vinyl_estimator !== false && !v.is_laminate
  );
  if (vinyl.product_group_key) {
    return base.filter(v => v.product_group_key === vinyl.product_group_key);
  }
  return base.filter(v =>
    (v.vinyl_name || "").trim() === (vinyl.vinyl_name || "").trim() &&
    (v.manufacturer || "") === (vinyl.manufacturer || "") &&
    (v.product_series || "") === (vinyl.product_series || "")
  );
};

export default function VinylRollWidthRecommender({
  workflow, vinyl, vinyls, printer, cutter, laminator, transferTape, laminate,
  operatorRate, currentCalc, onPick,
}) {
  const candidates = useMemo(() => groupCandidates(vinyl, vinyls), [vinyl, vinyls]);

  const evaluated = useMemo(() => {
    if (!vinyl || candidates.length === 0 || !currentCalc) return [];
    const baseArgs = {
      items: workflow.items || [],
      printer, cutter, laminator,
      laminate, transferTape,
      operatorHourlyRate: operatorRate,
      applyPrint: !!workflow.apply_print,
      applyCut: !!workflow.apply_cut,
      applyLaminate: !!workflow.apply_laminate,
      applyTransferTape: !!workflow.apply_transfer_tape,
      printQuality: workflow.print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: workflow.spoilage_buffer_percent || 0,
      setupFeeFloor: workflow.setup_fee_floor || 0,
    };
    return candidates
      .map(c => {
        const calc = calculateVinylProject({ ...baseArgs, vinyl: c });
        return {
          vinyl: c,
          totalCost: calc.totalCost,
          partsUnplaced: calc.partsUnplaced,
          totalRollSqFtPulled: calc.totalRollSqFtPulled,
        };
      })
      .filter(r => r.partsUnplaced === 0)
      .sort((a, b) => a.totalCost - b.totalCost);
  }, [candidates, workflow, printer, cutter, laminator, laminate, transferTape, vinyl, operatorRate, currentCalc]);

  if (!vinyl || candidates.length === 0 || !currentCalc) return null;

  const currentTotal = currentCalc.totalCost || 0;
  const best = evaluated[0];
  // Only suggest if there's a meaningful saving (>2% AND >$1)
  const savings = best ? currentTotal - best.totalCost : 0;
  const showSuggestion = best && savings > 1 && savings / Math.max(currentTotal, 1) > 0.02;

  return (
    <Card className={showSuggestion ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}>
      <CardContent className="p-3 text-xs space-y-2">
        <div className="flex items-center gap-2 font-medium text-slate-800">
          <Lightbulb className={`w-3.5 h-3.5 ${showSuggestion ? "text-amber-600" : "text-slate-500"}`} />
          Roll-Width Options
          <span className="text-[10px] text-slate-500">({candidates.length} alternates in this product group)</span>
        </div>
        {showSuggestion ? (
          <div className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded p-2">
            <div>
              <div className="font-semibold text-amber-900">
                Switch to {best.vinyl.roll_width_inches}″ width
              </div>
              <div className="text-[11px] text-slate-600">
                Current {vinyl.roll_width_inches}″ = {fmt(currentTotal)} → {best.vinyl.roll_width_inches}″ = {fmt(best.totalCost)}
                <span className="ml-1 text-emerald-700 font-medium">save {fmt(savings)}</span>
              </div>
            </div>
            <Button size="sm" className="h-7 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => onPick(best.vinyl.id)}>
              Use this <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-600">
            Current {vinyl.roll_width_inches}″ width is already the most cost-effective for this part set.
          </div>
        )}
        {evaluated.length > 1 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {evaluated.map(opt => (
              <button
                key={opt.vinyl.id}
                onClick={() => onPick(opt.vinyl.id)}
                className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 tabular-nums"
                title={`${opt.vinyl.vinyl_name} ${opt.vinyl.roll_width_inches}″`}
              >
                {opt.vinyl.roll_width_inches}″ · {fmt(opt.totalCost)}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}