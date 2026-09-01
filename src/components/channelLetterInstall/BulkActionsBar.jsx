import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Zap, ZapOff, TrendingUp, X } from "lucide-react";

export default function BulkActionsBar({
  selectedCount, onClear, onDuplicate, onDelete, onToggleAuto, onAdjustPrices, disabled,
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-[72px] z-20 bg-purple-600 text-white rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <span className="font-semibold text-sm">
        {selectedCount} selected
      </span>
      <div className="h-5 w-px bg-purple-400" />
      <Button
        size="sm" variant="ghost" onClick={onDuplicate} disabled={disabled}
        className="h-8 text-white hover:bg-purple-700 hover:text-white"
      >
        <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate
      </Button>
      <Button
        size="sm" variant="ghost" onClick={() => onToggleAuto(true)} disabled={disabled}
        className="h-8 text-white hover:bg-purple-700 hover:text-white"
      >
        <Zap className="w-3.5 h-3.5 mr-1" /> Auto On
      </Button>
      <Button
        size="sm" variant="ghost" onClick={() => onToggleAuto(false)} disabled={disabled}
        className="h-8 text-white hover:bg-purple-700 hover:text-white"
      >
        <ZapOff className="w-3.5 h-3.5 mr-1" /> Auto Off
      </Button>
      <Button
        size="sm" variant="ghost" onClick={onAdjustPrices} disabled={disabled}
        className="h-8 text-white hover:bg-purple-700 hover:text-white"
      >
        <TrendingUp className="w-3.5 h-3.5 mr-1" /> Adjust Prices
      </Button>
      <Button
        size="sm" variant="ghost" onClick={onDelete} disabled={disabled}
        className="h-8 text-white hover:bg-red-700 hover:text-white"
      >
        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
      </Button>
      <Button
        size="sm" variant="ghost" onClick={onClear}
        className="h-8 ml-auto text-white hover:bg-purple-700 hover:text-white"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}