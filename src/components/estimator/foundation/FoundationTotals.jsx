import { useMemo } from "react";
import { money, calcSignageCabinetPricing } from "./foundationCalc";
import { landscapeSummary } from "./landscapeMaterials";
import { foundationAssemblyIssues } from "./foundationAssemblyModel";
import { foundationEngineEconomics, foundationHasEnginePricing } from "./foundationSellPricing";
import {
  resolveFoundationStickySummary,
  buildFoundationTakeoff,
  buildFoundationInputChecklist,
} from "./foundationTotalsSummary";

const amt = (v) => (Number.isFinite(v) ? money(v) : "Not saved");
const known = (v, d, u) => (Number.isFinite(v) ? `${v.toFixed(d)} ${u}` : "Not saved");

// O-096 (CMP-H05): `project` and `calc` are OPTIONAL — the panel consumes the
// original four props as before and lights up progressively when the page
// wires them (`project={project} calc={calc}` on the existing call site).
// Unwired, the panel still shows the cost column, the totals-quantity
// takeoff, and the held-amounts checklist — it never claims the issue
// channels were checked when they were not passed.
export default function FoundationTotals({ totals, pricingUnavailable = false, savedSectionTotal = null, sectionTotal = null, project = null, calc = null }) {
  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite)
    ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost
    : null;
  // Saved-vs-current reconciliation (CMP-A10): `savedSectionTotal` is the
  // acknowledged record's persisted split-total sum (the same number the
  // linked estimate stored as live_total_snapshot at the last Builder save);
  // `sectionTotal` is the live recalculation including cabinets + landscape.
  // Advisory only — never blocks — and |delta| <= $0.005 never fires, the
  // same tolerance builderService.sameNumber / useSectionSync / ProductRow
  // already use for frozen-vs-live snapshot comparisons.
  const saved = Number.isFinite(savedSectionTotal) ? savedSectionTotal : null;
  const currentKnown = Number.isFinite(sectionTotal);
  const savedDelta = saved !== null && currentKnown ? sectionTotal - saved : null;
  const savedDiffers = savedDelta !== null && Math.abs(savedDelta) > 0.005;

  // Separate cost/sell/margin (CMP-H05). Sell precedence mirrors
  // customerPricing.sourceProjectEconomics' foundation branch: engine >
  // applied tier snapshot > override > markup %. Computed sells (engine +
  // markup) require the live cost — a held amount is never multiplied into a
  // fabricated customer price. The engine seam only runs when the record
  // actually carries config (foundationHasEnginePricing — the same cheap
  // detector CustomerPricingPanel uses).
  const summary = useMemo(
    () => resolveFoundationStickySummary({
      sectionTotal,
      savedSectionTotal,
      pricingUnavailable,
      project,
      engineResolver: project && foundationHasEnginePricing(project) ? foundationEngineEconomics : null,
    }),
    [sectionTotal, savedSectionTotal, pricingUnavailable, project]
  );

  // Itemized takeoff (CMP-H05): per-component quantity+amount rows. Falls
  // back to the totals quantity snapshot when `calc`/`project` aren't wired.
  const takeoff = useMemo(
    () => buildFoundationTakeoff({
      totals,
      items: calc?.items, itemPricing: calc?.itemPricing,
      walls: calc?.walls, wallPricing: calc?.wallPricing,
      poles: calc?.poles, polePricing: calc?.polePricing,
      wallCaps: calc?.wallCaps,
      equipment: calc?.equipment, equipmentPricing: calc?.equipmentPricing,
      delivery: calc?.delivery,
      cabinets: project?.signage_cabinets,
      cabinetRows: project ? calcSignageCabinetPricing(project.signage_cabinets) : null,
      landscapeLines: project ? landscapeSummary(project.landscape).lines : null,
      landscapePricing: calc?.landscapePricing,
    }),
    [totals, calc, project]
  );

  // Missing-input checklist (CMP-H05): the blocking channels are exactly the
  // lists the page's pricingBlocked gate reads (calc.inputIssues +
  // calc.catalogIssues); placement + construction warnings are advisory; the
  // held-amounts channel is derived from the partition totals so held
  // buckets surface even where upstream issue lists don't reach (wall caps).
  const checklist = useMemo(
    () => buildFoundationInputChecklist({
      totals,
      pricingUnavailable,
      calc,
      assemblyIssues: project ? foundationAssemblyIssues(project) : null,
    }),
    [totals, pricingUnavailable, calc, project]
  );

  const lines = [
    ["Concrete", totals.total_concrete_cost],
    ["Rebar", totals.total_rebar_cost],
    ["Excavation", totals.total_excavation_cost],
    ["Forming materials", totals.total_forming_materials_cost],
    ["Labor", totals.total_labor_cost],
    ["Poles", totals.total_pole_cost],
    ["Pole painting", totals.total_pole_painting_cost],
    ["Wall material", totals.total_brick_cost],
    ["Internal fill wall", totals.total_fill_cost],
    ["Wall mortar + labor", wallMortar],
    ["Wall caps", totals.total_wall_cap_cost],
    ["Equipment", totals.total_equipment_cost],
  ];

  const marginText = summary.margin.amount !== null
    ? `${money(summary.margin.amount)}${summary.margin.pct !== null ? ` · ${summary.margin.pct.toFixed(1)}%` : ""}`
    : "—";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
      <h2 className="font-semibold text-gray-900 mb-3">Section Total</h2>
      {pricingUnavailable && <p className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Saved/known amounts only; current pricing is incomplete.</p>}

      {/* Separate cost / sell / margin (O-096). Sell side carries its
          precedence source so a tier/engine/override number never masquerades
          as the manual baseline; held sides render — instead of fabricating. */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Cost (internal)</div>
          <div className="text-sm font-semibold text-gray-800">
            {summary.cost.value !== null ? money(summary.cost.value) : "Not saved"}
          </div>
          <div className="text-[10px] text-gray-400">
            {summary.cost.source === "saved" ? "acknowledged saved" : summary.cost.source === "live" ? "current" : ""}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Sell (customer)</div>
          <div className="text-sm font-semibold text-gray-800">
            {summary.sell.value !== null ? money(summary.sell.value) : "—"}
          </div>
          <div className="text-[10px] text-gray-400">
            {summary.sell.value !== null ? summary.sell.label : (summary.projectLinked ? "not recorded" : "")}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Margin</div>
          <div className={`text-sm font-semibold ${summary.margin.amount !== null && summary.margin.amount < 0 ? "text-red-700" : "text-gray-800"}`}>
            {marginText}
          </div>
          <div className="text-[10px] text-gray-400">
            {summary.margin.basis === "saved" ? "vs saved cost" : summary.margin.basis === "live" ? "sell − cost" : ""}
          </div>
        </div>
      </div>
      {summary.acknowledged?.differs && (
        <p role="status" className="mb-3 rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
          Tier snapshot recorded internal cost {money(summary.acknowledged.cost)} → acknowledged margin {money(summary.acknowledged.marginAmount)}{summary.acknowledged.marginPct !== null ? ` (${summary.acknowledged.marginPct.toFixed(1)}%)` : ""}; the cost column above reflects the {summary.cost.source === "saved" ? "saved" : "current"} section total.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        {[
          ["Concrete", known(totals.total_concrete_volume_cy, 2, "CY")],
          ["Excavation", known(totals.total_excavation_volume_cy, 2, "CY")],
          ["Labor", known(totals.total_labor_hours, 1, "hr")],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-50 rounded-lg py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
            <div className="text-sm font-semibold text-gray-800">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between text-gray-600">
            <span>{label}</span>
            <span>{amt(value)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
          <span>Total</span>
          <span className="text-red-600">{pricingUnavailable ? <span className="text-amber-700">Pricing unavailable</span> : money(totals.grand_total)}</span>
        </div>
      </div>

      {/* Missing-input checklist (O-096): blocking channels auto-expand;
          advisory and held channels stay collapsed under the count. */}
      {checklist.complete ? (
        <p role="status" className="mt-3 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
          All inputs recorded — no missing or held amounts.
        </p>
      ) : checklist.totalCount > 0 ? (
        <details className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1" open={checklist.blockingCount > 0}>
          <summary className="cursor-pointer select-none text-[11px] font-semibold text-amber-800">
            Missing inputs &amp; held amounts —{" "}
            {[
              checklist.blockingCount > 0 ? `${checklist.blockingCount} blocking` : null,
              checklist.advisoryCount > 0 ? `${checklist.advisoryCount} advisory` : null,
              checklist.heldCount > 0 ? `${checklist.heldCount} held` : null,
            ].filter(Boolean).join(", ")}
          </summary>
          <div className="mt-1 max-h-56 space-y-2 overflow-y-auto">
            {checklist.groups.map((g) => (
              <div key={g.key}>
                <div className={`text-[10px] uppercase tracking-wide ${g.severity === "blocking" ? "text-amber-700" : g.severity === "held" ? "text-gray-500" : "text-blue-700"}`}>
                  {g.label} ({g.items.length})
                </div>
                <ul className={`list-disc pl-4 text-[11px] ${g.severity === "advisory" ? "text-blue-900" : "text-amber-900"}`}>
                  {g.items.map((it) => <li key={it.key}>{it.message}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : !checklist.channelsKnown ? (
        <p className="mt-3 text-[11px] text-gray-400">No held amounts in the totals snapshot.</p>
      ) : null}

      {/* Itemized takeoff (O-096): per-component quantity + amount rows —
          collapsible so the sticky card stays compact. */}
      {takeoff.rowCount > 0 && (
        <details className="mt-3 rounded-sm border border-gray-200 bg-slate-50 px-2 py-1">
          <summary className="cursor-pointer select-none text-[11px] font-semibold text-gray-700">
            Itemized takeoff — {takeoff.rowCount} row{takeoff.rowCount === 1 ? "" : "s"}
          </summary>
          <div className="mt-1 max-h-64 space-y-2 overflow-y-auto">
            {takeoff.groups.map((g) => (
              <div key={g.key}>
                <div className="text-[10px] uppercase tracking-wide text-gray-400">{g.label}</div>
                <ul className="space-y-0.5">
                  {g.rows.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2 text-[11px] text-gray-700">
                      <span className="min-w-0">
                        {r.label}
                        {r.held && <span className="ml-1 font-semibold text-amber-700">(saved)</span>}
                        {r.qty && <span className="block text-[10px] text-gray-400">{r.qty}</span>}
                      </span>
                      <span className="whitespace-nowrap">{r.amount !== null ? money(r.amount) : r.held ? "Not saved" : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {saved !== null && !currentKnown && (
        <div role="status" className="mt-3 rounded-sm border border-gray-300 bg-slate-50 px-2 py-1 text-[11px] text-gray-700">
          Saved section total {money(saved)} — current pricing unavailable.
        </div>
      )}
      {savedDiffers && (
        <div role="status" className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Saved {money(saved)} — current {money(sectionTotal)} ({savedDelta > 0 ? "+" : "−"}{money(Math.abs(savedDelta))}) — recalculated from current inputs and catalog. Save to update the estimate.
        </div>
      )}
    </div>
  );
}
