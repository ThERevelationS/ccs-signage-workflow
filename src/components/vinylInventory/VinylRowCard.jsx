// One compact vinyl row. No inline editor — clicking "Edit" opens the
// polished VinylEditDialog popup (handled by the parent tab).

import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Droplets, Image as ImageIcon, Copy, Layers } from "lucide-react";
import { VINYL_CATEGORIES, vinylCostPerSqft } from "./vinylConstants";

const num = (v, fb = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fb;
};

export default function VinylRowCard({ vinyl, isAdmin, groupSiblings = [], onEdit, onDelete, onDuplicate }) {
  const dollarPerSqft = vinylCostPerSqft(vinyl);
  const categoryLabel = VINYL_CATEGORIES.find(c => c.id === vinyl.vinyl_category)?.label || vinyl.vinyl_category || "—";

  return (
    <Card className="border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="p-3 grid md:grid-cols-12 gap-3 items-center bg-white">
        <div className="md:col-span-1 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-md border border-slate-200 flex items-center justify-center text-[10px] text-slate-400"
            style={{ background: vinyl.color_hex || "#fafafa" }}
            title={vinyl.color_name}
          >
            {vinyl.image_url
              ? <ImageIcon className="w-4 h-4 text-slate-500" />
              : <Droplets className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        <div className="md:col-span-3">
          <Label className="text-[10px] uppercase tracking-wider text-slate-500">Name</Label>
          <div className="h-9 flex items-center text-sm font-medium text-slate-800 truncate">
            {vinyl.vinyl_name || <span className="text-slate-400 italic">(unnamed)</span>}
          </div>
        </div>

        <div className="md:col-span-2">
          <Label className="text-[10px] uppercase tracking-wider text-slate-500">Brand / Series</Label>
          <Input
            value={`${vinyl.manufacturer || ""}${vinyl.product_series ? ` · ${vinyl.product_series}` : ""}`}
            disabled
            className="h-9 text-sm bg-slate-50"
          />
        </div>

        <div className="md:col-span-1">
          <Label className="text-[10px] uppercase tracking-wider text-slate-500">Width</Label>
          <div className="h-9 flex items-center text-sm tabular-nums text-slate-700">{num(vinyl.roll_width_inches)}"</div>
        </div>

        <div className="md:col-span-1">
          <Label className="text-[10px] uppercase tracking-wider text-slate-500">Length</Label>
          <div className="h-9 flex items-center text-sm tabular-nums text-slate-700">{num(vinyl.roll_length_yards)} yd</div>
        </div>

        <div className="md:col-span-1">
          <Label className="text-[10px] uppercase tracking-wider text-slate-500">$/sqft</Label>
          <div className="h-9 flex items-center text-sm font-semibold tabular-nums text-emerald-700">
            ${dollarPerSqft.toFixed(2)}
          </div>
        </div>

        <div className="md:col-span-3 flex items-center justify-end gap-2">
          <Badge variant="outline" className="text-[10px]">{categoryLabel}</Badge>
          {groupSiblings.length > 0 && (
            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 inline-flex items-center gap-1" title={`Group: ${groupSiblings.map(s => `${s.roll_width_inches}"`).join(", ")}`}>
              <Layers className="w-3 h-3" /> {groupSiblings.length + 1} widths
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {isAdmin ? "Edit" : "View"}
          </Button>
          {isAdmin && onDuplicate && (
            <Button size="sm" variant="outline" onClick={onDuplicate} title="Duplicate (links to same product group)">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}