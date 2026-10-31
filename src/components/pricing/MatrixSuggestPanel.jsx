import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { loadPricingCatalog } from "@/components/pricing/pricingPersistence";
import { resolveEffectivePrice, round4 } from "@/components/pricing/pricingEngine";
import { acceptedCustomerUnitPrice } from "@/components/estimator/customerPricing";

// Matrix pricing suggestions — read-only pricing-engine advice for the lines on
// an open estimate. Each Product row is priced against the PricingTierMatrix
// catalog (tier × category → markup, market, or qty-break unit price) and the
// suggestion is shown next to the current customer unit price. "Apply" only
// writes the suggestion into the line's local draft state (the caller's
// onApplyLine → patchLine); nothing persists until the normal estimate Save.
//
// Line field mapping (AllInOneEstimate.line_items):
//   current unit price → acceptedCustomerUnitPrice(line)  (customer_price_snapshot ?? total_snapshot)
//   unit cost          → line.total_snapshot              (frozen unit cost)
//   qty                → line.customer_quantity           (default 1)
//   category           → line.product_category, editable per line because the
//                        field is free text and matrix rows key on
//                        MarkupCategory.category_key
//   tier               → estimate.pricing_tier (a MarkupTier.tier_number copied
//                        from the Customer at creation), overridable via select

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const SOURCE_LABEL = {
  matrix_markup: "markup",
  market: "market",
  qty_break: "qty break",
  default_markup: "default",
};

export default function MatrixSuggestPanel({ estimate, lines = [], onApplyLine, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tierKey, setTierKey] = useState("");
  const [tierTouched, setTierTouched] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState({});
  const [applied, setApplied] = useState(() => new Set());

  const load = () => {
    setLoading(true);
    loadPricingCatalog()
      .then((data) => {
        setCatalog(data);
        setError("");
      })
      .catch((e) => setError(e?.message || "Could not load the pricing matrix."))
      .finally(() => setLoading(false));
  };

  // Lazy-load the pricing catalog the first time the panel is expanded.
  useEffect(() => {
    if (open && !catalog && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The estimate carries pricing_tier (a MarkupTier.tier_number). Once the
  // catalog is in, resolve it to the tier record and use it as the default —
  // staff can still switch to any tier or none.
  const estimateTier = useMemo(() => {
    const want = Number(estimate?.pricing_tier);
    if (!Number.isFinite(want) || want <= 0) return null;
    return (catalog?.tiers || []).find((t) => Number(t.tier_number) === want) || null;
  }, [catalog, estimate?.pricing_tier]);

  useEffect(() => {
    if (!tierTouched && !tierKey && estimateTier) {
      setTierKey(estimateTier.tier_name || String(estimateTier.tier_number));
    }
  }, [estimateTier, tierKey, tierTouched]);

  const customerTier = useMemo(() => {
    const hit = (catalog?.tiers || []).find(
      (t) => (t.tier_name || t.name) === tierKey || String(t.tier_number ?? "") === tierKey,
    );
    return hit || tierKey || null;
  }, [catalog, tierKey]);

  // Category options: MarkupCategory keys first, then any product_category
  // values already on the lines so a typed value can be re-picked.
  const categoryOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of catalog?.categories || []) {
      const v = c?.category_key || c?.category_name || "";
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    for (const l of lines || []) {
      const v = String(l?.product_category || "").trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }, [catalog, lines]);

  const suggestions = useMemo(
    () =>
      (lines || []).map((line, index) => {
        const category =
          categoryOverrides[index] !== undefined
            ? categoryOverrides[index]
            : String(line?.product_category || "");
        const qty = Math.max(0, num(line?.customer_quantity, 1));
        const unitCost = num(line?.total_snapshot);
        const current = acceptedCustomerUnitPrice(line);
        const priced = resolveEffectivePrice({
          label: line?.client_product_name || line?.project_name || `Line ${index + 1}`,
          category,
          qty,
          unitCost,
          customerTier,
          matrices: catalog?.matrices || [],
        });
        // A suggestion only exists when a matrix row actually matched — the
        // global default-markup fallback is not matrix guidance.
        let suggested = null;
        if (priced.matchedRow && qty > 0) {
          suggested = priced.minimumApplied
            ? round4(priced.minimumCharge / qty)
            : priced.unitPrice;
        }
        const deltaPct =
          suggested != null && current > 0 ? ((suggested - current) / current) * 100 : null;
        return { index, line, category, qty, unitCost, current, priced, suggested, deltaPct };
      }),
    [lines, categoryOverrides, customerTier, catalog],
  );

  const applicable = suggestions.filter((s) => s.suggested != null);

  const applyOne = (s) => {
    if (readOnly || s.suggested == null || typeof onApplyLine !== "function") return;
    onApplyLine(s.index, {
      customer_price_snapshot: s.suggested,
      price_state: "manual",
    });
    setApplied((prev) => new Set(prev).add(s.index));
  };

  const applyAll = () => {
    if (readOnly || !applicable.length) return;
    if (
      !window.confirm(
        `Apply matrix-suggested prices to ${applicable.length} product${applicable.length === 1 ? "" : "s"}? This only updates the draft — Save the estimate to persist.`,
      )
    ) {
      return;
    }
    for (const s of applicable) applyOne(s);
  };

  const matchedCount = applicable.length;
  const th = "px-2 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const td = "px-2 py-1.5 text-[11px] text-gray-700 align-middle";

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 bg-gray-50 flex items-center justify-between gap-3 hover:bg-gray-100 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <Calculator className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Matrix pricing</span>
          <span className="text-[10px] text-gray-400 truncate">
            Suggest unit prices from the tier × category matrix — applies to the draft only
          </span>
        </span>
        {catalog && matchedCount > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
            {matchedCount} suggestion{matchedCount === 1 ? "" : "s"}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tier</label>
            <select
              value={tierKey}
              onChange={(e) => {
                setTierKey(e.target.value);
                setTierTouched(true);
              }}
              className="h-[28px] px-2 border border-gray-200 rounded text-[11px] text-gray-700 bg-white"
            >
              <option value="">(no tier — category/default rows only)</option>
              {(catalog?.tiers || []).map((t) => {
                const v = t.tier_name || t.name || String(t.tier_number ?? "");
                return (
                  <option key={t.id || v} value={v}>
                    Tier {t.tier_number ?? "—"} — {v}
                  </option>
                );
              })}
            </select>
            {estimateTier ? (
              <span className="text-[9px] text-gray-400">from estimate tier {estimateTier.tier_number}</span>
            ) : estimate?.pricing_tier ? (
              <span className="text-[9px] text-amber-600">estimate tier {estimate.pricing_tier} has no matching MarkupTier row</span>
            ) : (
              <span className="text-[9px] text-gray-400">estimate has no pricing_tier — pick one or leave blank</span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="h-[26px] px-2 inline-flex items-center gap-1 rounded border border-gray-300 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Reload the pricing matrix catalog"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Reload
            </button>
            <button
              type="button"
              onClick={applyAll}
              disabled={readOnly || applicable.length === 0}
              className="h-[26px] px-2.5 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-40"
              title={readOnly ? "Estimate is protected — start a revision to edit" : "Apply every suggestion to the draft"}
            >
              Apply all
            </button>
          </div>

          {error && <div className="px-4 py-2 border-b border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}
          {loading && !catalog && <div className="px-4 py-6 text-center text-[11px] text-gray-400">Loading pricing matrix…</div>}

          {catalog && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className={th}>Product</th>
                    <th className={th}>Qty</th>
                    <th className={th}>Category</th>
                    <th className={`${th} text-right`}>Current</th>
                    <th className={`${th} text-right`}>Suggested</th>
                    <th className={`${th} text-right`}>Delta</th>
                    <th className={th}>Matrix row</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-[11px] text-gray-400">
                        No products on this estimate yet.
                      </td>
                    </tr>
                  )}
                  {suggestions.map((s) => {
                    const name = s.line?.client_product_name || s.line?.project_name || `Product ${s.index + 1}`;
                    const rowLabel = s.priced.matchedRow
                      ? s.priced.matchedRowName || s.priced.matchedRowId || "matrix row"
                      : "";
                    const alreadyApplied = applied.has(s.index);
                    return (
                      <tr key={s.line?.line_id || s.line?.id || s.index} className="border-b border-gray-100">
                        <td className={`${td} font-semibold text-gray-900 max-w-[220px] truncate`} title={name}>
                          {name}
                          {s.line?.module_key ? <span className="ml-1 text-[9px] font-normal text-gray-400">{s.line.module_key}</span> : null}
                        </td>
                        <td className={td}>{s.qty}</td>
                        <td className={td}>
                          <input
                            list="matrix-suggest-categories"
                            value={s.category}
                            onChange={(e) =>
                              setCategoryOverrides((prev) => ({ ...prev, [s.index]: e.target.value }))
                            }
                            placeholder="(no category)"
                            className="h-[24px] w-[130px] px-1.5 border border-gray-200 rounded text-[10px] text-gray-700 bg-white"
                          />
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{money(s.current)}</td>
                        <td className={`${td} text-right tabular-nums font-semibold ${s.suggested != null ? "text-emerald-700" : "text-gray-300"}`}>
                          {s.suggested != null ? money(s.suggested) : "—"}
                          {s.priced.minimumApplied && s.suggested != null && (
                            <span className="ml-1 text-[9px] font-normal text-amber-600" title="Minimum charge floors this line">min</span>
                          )}
                        </td>
                        <td className={`${td} text-right tabular-nums ${s.deltaPct == null ? "text-gray-300" : s.deltaPct > 0 ? "text-emerald-600" : s.deltaPct < 0 ? "text-red-600" : "text-gray-400"}`}>
                          {s.deltaPct == null ? "—" : `${s.deltaPct > 0 ? "+" : ""}${s.deltaPct.toFixed(1)}%`}
                        </td>
                        <td className={`${td} max-w-[200px]`}>
                          {s.priced.matchedRow ? (
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <span className="truncate text-gray-600" title={rowLabel}>{rowLabel}</span>
                              <span className={`text-[9px] px-1 rounded border whitespace-nowrap ${
                                s.priced.pricingMode === "market"
                                  ? "border-sky-200 bg-sky-50 text-sky-700"
                                  : s.priced.source === "qty_break"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : "border-gray-200 bg-gray-50 text-gray-500"
                              }`}>
                                {s.priced.pricingMode === "market" && s.priced.source !== "qty_break"
                                  ? "market"
                                  : SOURCE_LABEL[s.priced.source] || s.priced.source}
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-300" title="No PricingTierMatrix row matches this tier × category">no row</span>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <button
                            type="button"
                            onClick={() => applyOne(s)}
                            disabled={readOnly || s.suggested == null}
                            className="h-[24px] px-2 rounded border border-emerald-300 bg-white text-emerald-700 text-[10px] font-bold hover:bg-emerald-50 disabled:opacity-30"
                            title={
                              readOnly
                                ? "Estimate is protected — start a revision to edit"
                                : s.suggested == null
                                  ? "No matrix row matches this line"
                                  : `Set this product's customer unit price to ${money(s.suggested)} in the draft`
                            }
                          >
                            {alreadyApplied ? "Applied" : "Apply"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="matrix-suggest-categories">
                {categoryOptions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
          )}

          {catalog && (
            <div className="px-4 py-2 border-t border-gray-100 text-[9px] text-gray-400">
              Suggestions write to <span className="font-semibold">customer_price_snapshot</span> in the draft only — Save the estimate to persist. Qty breaks and market-mode rows price exactly like the pricing engine; lines with no matching row show “no row”.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
