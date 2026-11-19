// Sticky summary card for the right side of the Vinyl Estimator page.
// Rolls up across all workflows + installation + travel + personnel + markup.
//
// Pricing-availability: every number the card shows is either the real live
// rollup or the saved acknowledged snapshot. When current pricing is
// unavailable the card says so ("Saved amounts (not current pricing)") and
// shows "Not saved" for anything with no snapshot — never a laundered $0.


import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, AlertTriangle } from "lucide-react";
import { hasIssueFor, hasVinylCostSnapshot, vinylDraftValue } from "./vinylPricingAvailability";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const money = (v) => hasVinylCostSnapshot(v)
  ? fmt(v)
  : <span className="text-amber-700 font-medium">Not saved</span>;

const Line = ({ label, value, muted }) => (
  <div className={`flex justify-between text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}>
    <span className="truncate pr-2">{label}</span>
    <span className="tabular-nums shrink-0">{value}</span>
  </div>
);

export default function VinylProjectSummaryCard({
  rollup, project, onUpdateProject, onSave, isSaving,
  pricingUnavailable = false, pricingBlocked = false, issues = [], issuesId = "vinyl-pricing-issues",
}) {
  const laborLabel = hasVinylCostSnapshot(rollup.laborHours)
    ? `Labor · ${rollup.laborHours.toFixed(2)} hr`
    : "Labor";
  return (
    <Card className="sticky top-4 bg-white border-0 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-base">Estimate Summary</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {pricingUnavailable && (
          <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              <b>Saved amounts (not current pricing)</b> — current pricing is unavailable.
              Fix the flagged values to reprice{pricingBlocked ? "; saving is paused until then" : ""}.
            </span>
          </div>
        )}
        <div className="space-y-1">
          <Line label="Vinyl"    value={money(rollup.vinylCost)} />
          <Line label="Laminate" value={money(rollup.laminateCost)} muted />
          <Line label="Ink"      value={money(rollup.inkCost)} muted />
          <Line label="Blade"    value={money(rollup.bladeCost)} muted />
        </div>

        <div className="border-t pt-2 space-y-1">
          <Line label="Machine Time" value={money(rollup.machineCost)} />
          <Line label={laborLabel} value={money(rollup.laborCost)} />
        </div>

        {(rollup.equipmentCost > 0 || rollup.personnelCost > 0 || rollup.travelCost > 0
          || rollup.equipmentCost === null || rollup.personnelCost === null || rollup.travelCost === null) && (
          <div className="border-t pt-2 space-y-1">
            {(rollup.equipmentCost === null || rollup.equipmentCost > 0) && <Line label="Equipment" value={money(rollup.equipmentCost)} />}
            {(rollup.personnelCost === null || rollup.personnelCost > 0) && <Line label="Personnel" value={money(rollup.personnelCost)} />}
            {(rollup.travelCost === null || rollup.travelCost > 0)    && <Line label="Travel"    value={money(rollup.travelCost)} />}
          </div>
        )}

        <div className="border-t pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Supplies %</Label>
              <Input type="number" step="0.5"
                value={project.supplies_percent_of_materials ?? ""}
                onChange={(e) => onUpdateProject({ supplies_percent_of_materials: vinylDraftValue(e.target.value) })}
                aria-invalid={hasIssueFor(issues, "supplies_percent_of_materials") || undefined}
                aria-describedby={hasIssueFor(issues, "supplies_percent_of_materials") ? issuesId : undefined}
                className="h-8 text-sm tabular-nums" />
            </div>
            <div>
              <Label className="text-[11px]">Extra Supplies $</Label>
              <Input type="number" step="1"
                value={project.extra_supplies_cost ?? ""}
                onChange={(e) => onUpdateProject({ extra_supplies_cost: vinylDraftValue(e.target.value) })}
                aria-invalid={hasIssueFor(issues, "extra_supplies_cost") || undefined}
                aria-describedby={hasIssueFor(issues, "extra_supplies_cost") ? issuesId : undefined}
                className="h-8 text-sm tabular-nums" />
            </div>
          </div>
          <Line label="Supplies Total" value={money(rollup.supplies)} muted />
        </div>

        <div className="border-t pt-3 space-y-2">
          <div>
            <Label className="text-[11px]">Markup %</Label>
            <Input type="number" step="0.5"
              value={project.markup_percent ?? ""}
              onChange={(e) => onUpdateProject({ markup_percent: vinylDraftValue(e.target.value) })}
              aria-invalid={hasIssueFor(issues, "markup_percent") || undefined}
              aria-describedby={hasIssueFor(issues, "markup_percent") ? issuesId : undefined}
              className="h-8 text-sm tabular-nums" />
          </div>
          <Line label="Subtotal" value={money(rollup.subtotal)} muted />
          <Line label="Markup"   value={money(rollup.markupAmount)} muted />
        </div>

        <div className="border-t pt-3 bg-slate-900 text-white -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="tabular-nums">
              {hasVinylCostSnapshot(rollup.totalCost) ? fmt(rollup.totalCost) : <span className="text-amber-300">Not saved</span>}
            </span>
          </div>
        </div>

        {project?.updated_date && (<div className="mt-1 text-[10px] text-gray-400">Last saved {new Date(project.updated_date).toLocaleString()}</div>)}
        <Button onClick={onSave} disabled={isSaving || pricingBlocked}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-3 disabled:opacity-60">
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Estimate
        </Button>
        {pricingBlocked && (
          <p className="text-[11px] text-amber-800 text-center">
            Fix the flagged pricing values to save — unavailable pricing is never written as $0.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
