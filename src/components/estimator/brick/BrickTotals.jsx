import { Input } from "@/components/ui/input";
import { brickDraftValue, hasBrickCostSnapshot, hasIssueFor } from "./brickPricingAvailability";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const RATES = [
  { key: "mortar_bag_cost", label: "Mortar bag $", def: 12 },
  { key: "bricks_per_hour", label: "Bricks laid /hr", def: 40 },
  { key: "labor_rate_per_hour", label: "Mason $/hr", def: 55 },
  { key: "markup_percent", label: "Markup %", def: 0 },
];

// Live derived values render plainly; while pricing is held, the saved
// acknowledged snapshot on the record is the fallback — never an invented $0.
const moneyOrSaved = (live, saved) =>
  hasBrickCostSnapshot(live) ? money(live)
    : hasBrickCostSnapshot(saved) ? money(saved)
      : <span className="text-amber-700 font-medium">Not saved</span>;
const countOrSaved = (live, saved, digits = null) =>
  Number.isFinite(live) ? (digits === null ? String(live) : live.toFixed(digits))
    : Number.isFinite(saved) ? (digits === null ? String(saved) : saved.toFixed(digits))
      : "—";

export default function BrickTotals({ project, totals, issues = [], onChange }) {
  const pricingUnavailable = !!totals?.pricingUnavailable;
  return (
    <div className="space-y-4 sticky top-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Rates</h3>
        <div className="grid grid-cols-2 gap-3">
          {RATES.map((f) => (
            <label key={f.key} className="text-xs text-gray-500">
              {f.label}
              <Input
                type="number"
                value={project[f.key] ?? f.def}
                onChange={(e) => onChange({ [f.key]: brickDraftValue(e.target.value) })}
                aria-invalid={hasIssueFor(issues, f.key) || undefined}
                aria-describedby={hasIssueFor(issues, f.key) ? "brick-pricing-issues" : undefined}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Section Total</h3>
        {pricingUnavailable && (
          <p className="text-[11px] text-amber-800 mb-2">
            Saved amounts (not current pricing) — fix the flagged values to reprice.
          </p>
        )}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Bricks / stones</span>
            <span>{countOrSaved(totals?.calculated_bricks, project?.calculated_bricks)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Mortar bags</span>
            <span>{countOrSaved(totals?.mortar_bags_needed, project?.mortar_bags_needed)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Labor hours</span>
            <span>{countOrSaved(totals?.labor_hours, project?.labor_hours, 2)}</span>
          </div>
          {[
            ["Material", totals?.material_cost, project?.material_cost],
            ["Mortar", totals?.mortar_cost, project?.mortar_cost],
            ["Labor", totals?.labor_cost, project?.labor_cost],
          ].map(([label, live, saved]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-900">{moneyOrSaved(live, saved)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-gray-100 pt-2">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">{moneyOrSaved(totals?.subtotal, project?.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Markup</span>
            <span className="text-gray-900">{moneyOrSaved(totals?.markup_amount, project?.markup_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-red-200 pt-2 mt-2 font-bold text-lg">
            <span className="text-gray-900">Total</span>
            <span className="text-red-600">{moneyOrSaved(totals?.total_cost, project?.total_cost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
