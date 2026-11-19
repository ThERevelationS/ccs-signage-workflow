import { useCallback, useMemo, useState } from "react";
import { ChevronRight, Loader2, TrendingUp } from "lucide-react";
import MarginBreakdown from "./MarginBreakdown";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

// F-25 lazy mount: the margin model needs four registries (Machine,
// LaborLevel, PricingModifier) plus this estimate's BuilderPart rows — none
// of which EstimateDetail otherwise loads. To keep the detail page's read
// budget flat, nothing is fetched until the user expands this section;
// registries then ride loadAllEntityRows' 30s catalog cache.

const MAX_PRODUCT_PART_QUERIES = 24;

const productIdsFor = (estimate) => {
  const lines = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const ids = [];
  const seen = new Set();
  for (const line of lines) {
    const id = String(line?.builder_product_id ?? line?.product_id ?? "").trim();
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
};

export default function EstimateMarginSection({ estimate, pricing, className = "" }) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const productIds = useMemo(() => productIdsFor(estimate), [estimate]);

  const load = useCallback(async () => {
    if (loading || data) return;
    setRequested(true);
    setLoading(true);
    setError("");
    try {
      const pagedIds = productIds.slice(0, MAX_PRODUCT_PART_QUERIES);
      const [machines, laborLevels, modifiers, ...partPages] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.Machine, label: "Margin Machine registry" }),
        loadAllEntityRows({ entity: staffEntities.LaborLevel, label: "Margin LaborLevel registry" }),
        loadAllEntityRows({ entity: staffEntities.PricingModifier, label: "Margin PricingModifier registry" }),
        ...pagedIds.map((pid) =>
          loadAllEntityRows({
            entity: staffEntities.BuilderPart,
            query: { builder_product_id: pid },
            label: "Margin BuilderPart rows",
          })
        ),
      ]);
      const parts = partPages.flat();
      const skipped = productIds.length - pagedIds.length;
      setData({
        parts,
        machines,
        laborLevels,
        modifiers,
        note: skipped > 0 ? `Parts for ${skipped} product${skipped === 1 ? "" : "s"} beyond the ${MAX_PRODUCT_PART_QUERIES}-product read cap were not loaded.` : "",
      });
    } catch (e) {
      setError(e?.message || "Margin data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loading, data, productIds]);

  if (!requested) {
    return (
      <button
        type="button"
        onClick={load}
        className={`clay-card w-full p-3 flex items-center gap-2 text-left hover:bg-gray-50 ${className}`}
      >
        <ChevronRight className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
        <TrendingUp className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
        <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">Margin breakdown</span>
        <span className="ml-auto text-[10px] text-gray-400">load machine, labor &amp; modifier cost detail</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className={`clay-card p-4 flex items-center gap-2 text-[11px] text-gray-500 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Resolving cost components…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`clay-card p-4 ${className}`}>
        <div className="text-[11px] font-semibold text-red-700">Margin data unavailable</div>
        <div className="mt-0.5 text-[10px] text-gray-500">{error}</div>
        <button type="button" onClick={load} className="mt-2 text-[10px] font-semibold text-indigo-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <MarginBreakdown
        estimate={estimate}
        pricing={pricing}
        parts={data?.parts || []}
        machines={data?.machines || []}
        laborLevels={data?.laborLevels || []}
        modifiers={data?.modifiers || []}
        defaultOpen
      />
      {data?.note ? <div className="mt-1 text-[9px] text-gray-400">{data.note}</div> : null}
    </div>
  );
}
