import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Layers, X, AlertCircle } from "lucide-react";
import { ChannelLetterInstallInventory } from "@/entities/all";
import BackerFabPanel from "./BackerFabPanel";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

/**
 * BackerSection — renders inside a Dimensional Letters purchase row
 * when backer_enabled is true. Lets the user pick:
 *  - Backer material (from DimensionalLetterMaterial)
 *  - Standoff (from ChannelLetterInstallInventory where applies_to_list includes "backer")
 *  - # of standoffs
 *  - Build Backer Fab Cost (opens BackerFabModal)
 */
export default function BackerSection({ purchase, onUpdate, onDisable }) {
  const [standoffs, setStandoffs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const inv = await ChannelLetterInstallInventory.list("sort_order");
        const filtered = (inv || []).filter(i => {
          const list = Array.isArray(i.applies_to_list) ? i.applies_to_list : [];
          return list.includes("backer");
        });
        setStandoffs(filtered);
      } catch (e) {
        console.error("BackerSection load failed", e);
      }
    })();
  }, []);

  const fab = purchase.backer_fab_config;
  const standoffPicked = standoffs.find(s => s.id === purchase.backer_standoff_inventory_id);
  const standoffUnitCost = standoffPicked ? (parseFloat(standoffPicked.cost_per_letter) || parseFloat(standoffPicked.cost_flat) || 0) : 0;
  const standoffTotalCost = standoffUnitCost * (parseFloat(purchase.backer_standoff_qty) || 0);

  return (
    <div className="border-2 border-orange-200 bg-orange-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-900">Backer Panel Configuration</span>
          <Badge className="bg-orange-200 text-orange-900 border-orange-300 text-[10px]">SWITCHES PRICING SCHEDULE</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onDisable} className="h-7 text-xs text-orange-700 hover:bg-orange-100">
          <X className="w-3 h-3 mr-1" /> Remove Backer
        </Button>
      </div>

      {/* Standoff picker — backer material + W/H are configured in the inline panel below */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Standoff Type</Label>
          <Select
            value={purchase.backer_standoff_inventory_id || ""}
            onValueChange={(v) => onUpdate({ backer_standoff_inventory_id: v })}
          >
            <SelectTrigger className="h-9 mt-1 bg-white">
              <SelectValue placeholder="Pick a standoff..." />
            </SelectTrigger>
            <SelectContent>
              {standoffs.length === 0 && <SelectItem value="__none" disabled>No backer standoffs in inventory</SelectItem>}
              {standoffs.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.item_name} — {fmt(parseFloat(s.cost_per_letter) || parseFloat(s.cost_flat) || 0)}/ea</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Qty of Standoffs (per letter)</Label>
          <Input
            type="number" min="0" step="1"
            value={purchase.backer_standoff_qty ?? 0}
            onChange={(e) => onUpdate({ backer_standoff_qty: parseFloat(e.target.value) || 0 })}
            className="h-9 mt-1 bg-white"
          />
        </div>
      </div>

      {standoffs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            No standoffs yet. Add them in <strong>Channel Letter Install Inventory → Materials → Backer</strong> group.
          </p>
        </div>
      )}

      {/* Inline Backer Fab panel (replaces the popup) */}
      <div className="border-t border-orange-200 pt-3">
        <BackerFabPanel purchase={purchase} onUpdate={onUpdate} />
      </div>

      {/* Mini rollup */}
      <div className="bg-white rounded-lg border border-orange-200 p-2.5 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Backer Fab × Qty</div>
          <div className="font-semibold tabular-nums text-slate-900">{fmt((fab?.unit_total_cost || 0) * (parseFloat(purchase.qty) || 0))}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Standoffs ({purchase.backer_standoff_qty || 0})</div>
          <div className="font-semibold tabular-nums text-slate-900">{fmt(standoffTotalCost)}</div>
          <div className="text-[10px] text-slate-400">Per install line</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Pricing Schedule</div>
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">w/ Backer</Badge>
        </div>
      </div>

    </div>
  );
}