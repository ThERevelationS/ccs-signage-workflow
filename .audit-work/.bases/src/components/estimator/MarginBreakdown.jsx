import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cog,
  Package,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
// NOTE: the shared file must be named in the frontend-shared-modules Vite
// allowlist (scripts/frontend-shared-modules.mjs) before this import resolves
// at dev/build time — same gate as VendorCostBadge.jsx /
// workOrderConversion.js shared-TS imports.
import { estimateMargin, DEFAULT_LOW_MARGIN_PCT } from "../../../base44/shared/marginModel.ts";
import { money } from "@/components/estimator/aioPricing";

// F-25: internal "cost vs sell" margin view for the All-In-One estimator —
// extends the profitability.js summary with resolved cost components
// (machine time × Machine rates, labor allocation × LaborLevel rates,
// PricingModifier cost columns) at both line and estimate level.
//
//   <MarginBreakdown estimate parts machines laborLevels modifiers projects
//                    pricing lowMarginPct margin />
//
//   estimate     AllInOneEstimate row (line_items + waterfall fields).
//   parts        flat BuilderPart list for the estimate (filtered by
//                builder_product_id inside the model).
//   machines     Machine registry rows for machine_id → cost_per_hour
//                resolution (backend-only entity; caller supplies).
//   laborLevels  LaborLevel registry rows.
//   modifiers    PricingModifier registry rows (catalog — attachment lists
//                on the parts gate what actually applies).
//   projects     module project records — map keyed by project_id, an array,
//                or embedded line.project (powers the 'project' cost basis).
//   pricing      optional aioPricing.computePricing result — when present
//                its subtotal/discount/contingency drive the estimate-level
//                sell so the margin matches displayed customer numbers.
//   margin       optional precomputed estimateMargin result (skips the
//                in-component compute — backend-computed margins mount here).
//   lowMarginPct per-line flag threshold (default DEFAULT_LOW_MARGIN_PCT=15,
//                matching profitability.js's margin-floor convention).

const COMPONENT_META = [
  { key: "material", label: "Material", icon: Package },
  { key: "machine", label: "Machine", icon: Cog },
  { key: "labor", label: "Labor", icon: Users },
  { key: "modifier", label: "Modifiers", icon: SlidersHorizontal },
];

const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const pct = (value) => `${num(value).toFixed(1)}%`;

const marginTone = (marginCents, marginPct, threshold) => {
  if (num(marginCents) < 0) return "negative";
  if (num(marginPct) < threshold) return "warn";
  return "positive";
};

const toneClass = {
  positive: "text-emerald-700",
  warn: "text-amber-700",
  negative: "text-red-700",
  neutral: "text-gray-900",
};

function Metric({ label, value, sub, tone = "neutral" }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2.5 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-[14px] font-bold tabular-nums ${toneClass[tone] || toneClass.neutral}`}>{value}</div>
      {sub ? <div className="text-[9px] text-gray-400 tabular-nums">{sub}</div> : null}
    </div>
  );
}

export default function MarginBreakdown({
  estimate = {},
  parts = [],
  machines = [],
  laborLevels = [],
  modifiers = [],
  projects = null,
  pricing = null,
  margin = null,
  lowMarginPct = DEFAULT_LOW_MARGIN_PCT,
  title = "Margin breakdown",
  defaultOpen = true,
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const threshold = Number.isFinite(Number(lowMarginPct))
    ? Number(lowMarginPct)
    : DEFAULT_LOW_MARGIN_PCT;

  const resolved = useMemo(
    () => margin || estimateMargin({ estimate, parts, machines, laborLevels, modifiers, projects, pricing }),
    [margin, estimate, parts, machines, laborLevels, modifiers, projects, pricing],
  );

  const tone = marginTone(resolved.margin_cents, resolved.margin_pct, threshold);
  const TrendIcon = num(resolved.margin_cents) < 0 ? TrendingDown : TrendingUp;
  const lowLines = (resolved.lines || []).filter((l) => num(l.sell_cents) > 0 && num(l.margin_pct) < threshold);
  const hasComponentCost = ["machine", "labor", "modifier"].some(
    (k) => num(resolved.by_component?.[`${k}_cents`]) !== 0,
  );

  return (
    <div className={`clay-card p-4 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
        <TrendIcon className={`w-3.5 h-3.5 ${toneClass[tone]}`} aria-hidden="true" />
        <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">{title}</span>
        <span className={`ml-auto text-[12px] font-bold tabular-nums ${toneClass[tone]}`}>
          {money(resolved.margin_cents / 100)} · {pct(resolved.margin_pct)}
        </span>
        {lowLines.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
            {lowLines.length} low
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Estimate-level summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
            <Metric label="Sell (pre fees/tax)" value={money(resolved.total_sell)} sub={resolved.discount_cents || resolved.contingency_cents || resolved.internal_discount_cents ? "after discount + contingency" : undefined} />
            <Metric label="Resolved cost" value={money(resolved.total_cost)} sub={`${resolved.line_count} line${resolved.line_count === 1 ? "" : "s"}`} />
            <Metric label="Margin" value={money(resolved.margin_cents / 100)} tone={tone} sub={`markup on cost ${pct(resolved.markup_on_cost_pct)}`} />
            <Metric label="Margin %" value={pct(resolved.margin_pct)} tone={tone} sub={num(resolved.margin_pct) < threshold ? `below ${threshold}% floor` : undefined} />
          </div>

          {/* Per-component cost rows */}
          <div className="rounded border border-gray-200 bg-gray-50 p-2.5">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-1.5">COST COMPONENTS</div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5">
              {COMPONENT_META.map(({ key, label, icon: Icon }) => {
                const share = num(resolved.by_component?.[`${key}_share_pct`]);
                return (
                  <div key={key} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5">
                    <Icon className="w-3 h-3 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    <span className="text-[10px] text-gray-500 flex-1 truncate">{label}</span>
                    <span className="text-[10px] font-semibold text-gray-800 tabular-nums">{money(resolved.by_component?.[key])}</span>
                    {resolved.total_cost_cents > 0 && (
                      <span className="text-[9px] text-gray-400 tabular-nums w-[34px] text-right">{pct(share)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {!hasComponentCost && (
              <div className="mt-1.5 text-[9px] text-gray-400">
                Only material cost resolved — configure machine_ids, labor levels, or modifiers on parts for component detail.
              </div>
            )}
          </div>

          {/* Per-line margin table */}
          {resolved.lines?.length > 0 && (
            <div className="rounded border border-gray-200 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-[9px] font-bold tracking-widest text-gray-400">
                    <th className="px-2 py-1.5 font-bold">PRODUCT</th>
                    <th className="px-2 py-1.5 font-bold text-right">SELL</th>
                    <th className="px-2 py-1.5 font-bold text-right">MATERIAL</th>
                    <th className="px-2 py-1.5 font-bold text-right">MACHINE</th>
                    <th className="px-2 py-1.5 font-bold text-right">LABOR</th>
                    <th className="px-2 py-1.5 font-bold text-right">MODS</th>
                    <th className="px-2 py-1.5 font-bold text-right">COST</th>
                    <th className="px-2 py-1.5 font-bold text-right">MARGIN</th>
                    <th className="px-2 py-1.5 font-bold text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.lines.map((line, i) => {
                    const low = num(line.sell_cents) > 0 && num(line.margin_pct) < threshold;
                    const neg = num(line.margin_cents) < 0;
                    return (
                      <tr key={line.line_id || i} className={`border-t border-gray-100 ${neg ? "bg-red-50/60" : low ? "bg-amber-50/60" : ""}`}>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-gray-800 truncate max-w-[220px]">{line.label}</div>
                          <div className="text-[9px] text-gray-400">
                            {line.module_key || "product"}
                            {line.quantity !== 1 ? ` ×${line.quantity}` : ""}
                            {line.cost_basis !== "parts" ? ` · ${line.cost_basis} basis` : ""}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{money(line.sell)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{money(line.material_cost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{money(line.machine_cost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{money(line.labor_cost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{money(line.modifier_cost)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-gray-800">{money(line.total_cost)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${neg ? "text-red-700" : low ? "text-amber-700" : "text-emerald-700"}`}>
                          {money(line.margin_cents / 100)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${neg ? "bg-red-100 text-red-700" : low ? "bg-amber-100 text-amber-700" : "text-gray-700"}`}>
                            {(neg || low) && <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />}
                            {pct(line.margin_pct)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {resolved.warnings?.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2">
              <div className="text-[9px] font-bold tracking-widest text-amber-700 mb-1">RESOLUTION WARNINGS</div>
              <ul className="space-y-0.5 text-[9px] text-amber-800 list-disc pl-3.5">
                {resolved.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                {resolved.warnings.length > 8 && <li>…and {resolved.warnings.length - 8} more</li>}
              </ul>
            </div>
          )}

          <div className="text-[9px] leading-4 text-gray-400">
            Cost vs sell with resolved machine, labor, and modifier cost components. Sell is the customer price before fees/tax (after discount, contingency, and internal discount); cost resolves part frozen costs plus configured machine rates, labor levels, and modifier cost columns. Unresolved registries degrade to $0 rather than guessing.
          </div>
        </div>
      )}
    </div>
  );
}
