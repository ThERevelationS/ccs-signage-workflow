import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatRelative } from "./materialsHelpers";
import { CRITERIA_MAP } from "./materialsConstants";

const PRICE_FIELDS = [
  "cost_per_letter", "cost_extra_small", "cost_small", "cost_medium",
  "cost_large", "cost_extra_large", "cost_extra_extra_large",
  "cost_per_foot", "cost_flat",
];

const currentHeadlinePrice = (item) => {
  switch (item.pricing_mode) {
    case "per_letter_flat": return parseFloat(item.cost_per_letter) || 0;
    case "per_raceway_foot": return parseFloat(item.cost_per_foot) || 0;
    case "per_project_flat": return parseFloat(item.cost_flat) || 0;
    case "per_letter_by_size": {
      const vals = ["cost_extra_small", "cost_small", "cost_medium", "cost_large", "cost_extra_large", "cost_extra_extra_large"]
        .map(k => parseFloat(item[k]) || 0).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    default: return 0;
  }
};

const snapshotHeadline = (snap) => {
  if (!snap) return 0;
  switch (snap.pricing_mode) {
    case "per_letter_flat": return parseFloat(snap.cost_per_letter) || 0;
    case "per_raceway_foot": return parseFloat(snap.cost_per_foot) || 0;
    case "per_project_flat": return parseFloat(snap.cost_flat) || 0;
    case "per_letter_by_size": {
      const vals = ["cost_extra_small", "cost_small", "cost_medium", "cost_large", "cost_extra_large", "cost_extra_extra_large"]
        .map(k => parseFloat(snap[k]) || 0).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    default: return 0;
  }
};

export default function PriceHistoryDialog({ open, onOpenChange, item }) {
  if (!item) return null;
  const history = Array.isArray(item.price_history) ? [...item.price_history].reverse() : [];
  const currentPrice = currentHeadlinePrice(item);
  const crit = CRITERIA_MAP[item.pricing_mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600" />
            Price History — {item.item_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-700 font-medium">Current Price</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">
              ${currentPrice.toFixed(2)}
              <span className="text-sm font-normal text-purple-700 ml-2">{crit?.short}</span>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No price history yet. Future price changes will be recorded here.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry, idx) => {
                const oldPrice = snapshotHeadline(entry.snapshot);
                const newer = idx === 0 ? currentPrice : snapshotHeadline(history[idx - 1].snapshot);
                const delta = newer - oldPrice;
                const pct = oldPrice > 0 ? (delta / oldPrice) * 100 : 0;
                const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                const trendColor = delta > 0 ? "text-red-600" : delta < 0 ? "text-green-600" : "text-slate-500";

                return (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-700">
                        ${oldPrice.toFixed(2)} <span className="text-slate-400 text-xs">→ ${newer.toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatRelative(entry.changed_at)} · by {entry.changed_by}
                      </div>
                    </div>
                    <Badge variant="outline" className={`gap-1 ${trendColor}`}>
                      <TrendIcon className="w-3 h-3" />
                      {delta >= 0 ? "+" : ""}{pct.toFixed(1)}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}