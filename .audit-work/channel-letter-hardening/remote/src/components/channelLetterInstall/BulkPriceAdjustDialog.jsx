import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function BulkPriceAdjustDialog({ open, onOpenChange, selectedCount, onApply }) {
  const [percent, setPercent] = useState(5);
  const [direction, setDirection] = useState("up"); // "up" or "down"

  const handleApply = () => {
    const signed = direction === "down" ? -Math.abs(percent) : Math.abs(percent);
    onApply(signed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Prices on {selectedCount} Item{selectedCount !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={direction === "up" ? "default" : "outline"}
              onClick={() => setDirection("up")}
              className={`flex-1 ${direction === "up" ? "bg-red-600 hover:bg-red-700" : ""}`}
            >
              <TrendingUp className="w-4 h-4 mr-1" /> Increase
            </Button>
            <Button
              type="button"
              variant={direction === "down" ? "default" : "outline"}
              onClick={() => setDirection("down")}
              className={`flex-1 ${direction === "down" ? "bg-green-600 hover:bg-green-700" : ""}`}
            >
              <TrendingDown className="w-4 h-4 mr-1" /> Decrease
            </Button>
          </div>

          <div>
            <Label className="text-sm">Percentage</Label>
            <div className="relative mt-1">
              <Input
                type="number" step="0.1" min="0"
                value={percent}
                onChange={(e) => setPercent(parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {direction === "up" ? "Increase" : "Decrease"} all pricing fields (and quantity tiers) by{" "}
              <strong>{percent}%</strong> across the selected items.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply} className="bg-purple-600 hover:bg-purple-700 text-white">
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}