import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { applyMarkups, parseVolumeDiscountBrackets, parseVolumeDiscountCategories } from "./markupEngine";
import TierBadge, { getTierTheme } from "./TierBadge";

const fmt = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Reusable Customer Pricing Summary tab for every estimator.
 *
 * Props:
 *   project      — the in-memory project object with totals
 *   categorize   — function(project) => [{ module, label, cost, category_key }]
 *   accentColor  — tailwind color name (purple, red, green, blue, orange) for the header
 */
export default function CustomerPricingTab({ project, categorize, accentColor = "slate" }) {
  const [tiers, setTiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState([]);
  const [tierNumber, setTierNumber] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, c, s] = await Promise.all([
          base44.entities.MarkupTier.list("sort_order"),
          base44.entities.MarkupCategory.list("sort_order"),
          base44.entities.Settings.filter({ category: "pricing" }),
        ]);
        setTiers(t || []);
        setCategories(c || []);
        setSettings(s || []);
      } catch (e) {
        console.error("CustomerPricingTab load error:", e);
      }
      setLoading(false);
    })();
  }, []);

  const selectedTier = useMemo(
    () => tiers.find((t) => t.tier_number === Number(tierNumber)) || tiers[0],
    [tiers, tierNumber]
  );

  const lines = useMemo(() => {
    try {
      return categorize(project) || [];
    } catch (e) {
      console.error("categorize error:", e);
      return [];
    }
  }, [project, categorize]);

  const markupResult = useMemo(() => {
    const brackets = parseVolumeDiscountBrackets(settings);
    const eligibleCategoryKeys = parseVolumeDiscountCategories(settings);
    return applyMarkups(lines, selectedTier, { brackets, eligibleCategoryKeys });
  }, [lines, selectedTier, settings]);

  const categoryNameByKey = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.category_key, c.category_name])),
    [categories]
  );

  // Group lines by category for display
  const byCategory = useMemo(() => {
    const map = {};
    markupResult.lines.forEach((l) => {
      const key = l.category_key;
      if (!map[key]) {
        map[key] = { name: categoryNameByKey[key] || key, lines: [], rawTotal: 0, finalTotal: 0 };
      }
      map[key].lines.push(l);
      map[key].rawTotal += l.cost;
      map[key].finalTotal += l.final_cost;
    });
    return map;
  }, [markupResult, categoryNameByKey]);

  const theme = getTierTheme(tierNumber);

  if (loading) {
    return (
      <Card className="bg-white border-0 shadow-sm">
        <CardContent className="p-8 text-center text-slate-500">Loading pricing tiers…</CardContent>
      </Card>
    );
  }

  if (tiers.length === 0) {
    return (
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-6 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">No pricing tiers configured</p>
              <p className="text-xs">
                Visit <span className="font-semibold">Admin → Markups</span> to set up tier markups before using this view.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (lines.length === 0) {
    return (
      <Card className="bg-white border-0 shadow-sm">
        <CardContent className="p-8 text-center text-slate-500 text-sm">
          Add items to the project to see customer pricing.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tier selector */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className={`w-5 h-5 text-${accentColor}-600`} />
            Customer Pricing Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px] flex-1">
              <Label className="text-xs mb-1.5 block">Pricing Tier</Label>
              <Select value={String(tierNumber)} onValueChange={(v) => setTierNumber(Number(v))}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t.id} value={String(t.tier_number)}>
                      Tier {t.tier_number} — {t.tier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${theme.soft} ${theme.softText} border ${theme.accent}`}>
              <TierBadge tierNumber={tierNumber} />
              <div>
                <p className="text-xs opacity-75">Selected Tier</p>
                <p className="font-semibold text-sm">{selectedTier?.tier_name || `Tier ${tierNumber}`}</p>
              </div>
            </div>
          </div>
          {selectedTier?.description && (
            <p className="text-xs text-slate-500 italic">{selectedTier.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Cost breakdown by category */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marked-Up Breakdown by Category</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-right px-4 py-2 font-medium">Cost</th>
                <th className="text-right px-4 py-2 font-medium">Markup</th>
                <th className="text-right px-4 py-2 font-medium">Vol Disc</th>
                <th className="text-right px-4 py-2 font-medium">Customer Price</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byCategory).map(([catKey, group]) => (
                <React.Fragment key={catKey}>
                  <tr className="bg-slate-100/70">
                    <td colSpan={5} className="px-4 py-2 font-semibold text-slate-700 text-xs uppercase tracking-wide">
                      {group.name}
                      <span className="ml-2 text-slate-500 font-normal normal-case tracking-normal">
                        — {fmt(group.rawTotal)} cost → <span className="font-semibold text-slate-700">{fmt(group.finalTotal)}</span>
                      </span>
                    </td>
                  </tr>
                  {group.lines.map((l, i) => (
                    <tr key={`${catKey}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2">{l.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{fmt(l.cost)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {(l.markup_multiplier * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {l.volume_discount_applied > 0 ? `${l.volume_discount_applied}%` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmt(l.final_cost)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Grand total card */}
      <Card className={`border-2 ${theme.accent} ${theme.soft}`}>
        <CardContent className="p-5 space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Internal cost subtotal</span>
            <span className="tabular-nums">{fmt(markupResult.totals.raw_subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>After Tier {tierNumber} markup</span>
            <span className="tabular-nums">{fmt(markupResult.totals.marked_subtotal)}</span>
          </div>
          {markupResult.totals.volume_discount_pct > 0 && (
            <div className="flex justify-between text-sm text-amber-700">
              <span>Volume discount ({markupResult.totals.volume_discount_pct}%)</span>
              <span className="tabular-nums">
                −{fmt(markupResult.totals.marked_subtotal - markupResult.totals.grand_total)}
              </span>
            </div>
          )}
          <div className={`border-t pt-2 flex justify-between items-center ${theme.softText}`}>
            <span className="text-lg font-bold">Customer Price</span>
            <span className="text-2xl font-bold tabular-nums">{fmt(markupResult.totals.grand_total)}</span>
          </div>
          {markupResult.totals.raw_subtotal > 0 && (
            <p className="text-xs text-slate-500 pt-1">
              Margin: <span className="font-semibold">{fmt(markupResult.totals.grand_total - markupResult.totals.raw_subtotal)}</span>
              {" "}({(((markupResult.totals.grand_total - markupResult.totals.raw_subtotal) / markupResult.totals.grand_total) * 100).toFixed(1)}% of customer price)
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-3 text-xs text-blue-900 flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Markups and volume discount brackets are configured in <strong>Admin → Markups</strong>.
            Switching tiers above only previews pricing for this estimate — it doesn't change the saved project.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}