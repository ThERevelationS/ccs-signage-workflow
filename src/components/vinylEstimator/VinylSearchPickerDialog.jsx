// Searchable popup picker for vinyl / laminate rolls.
// Replaces the plain <Select> dropdown when there are too many options to scan.
// Supports free-text search (name, manufacturer, series, color, category, finish)
// and sorting by name / manufacturer / category / roll width.

import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, ArrowUpDown } from "lucide-react";

const SORTS = {
  name: { label: "Name", fn: (a, b) => (a.vinyl_name || "").localeCompare(b.vinyl_name || "") },
  manufacturer: { label: "Manufacturer", fn: (a, b) => (a.manufacturer || "").localeCompare(b.manufacturer || "") },
  category: { label: "Category", fn: (a, b) => (a.vinyl_category || "").localeCompare(b.vinyl_category || "") },
  width: { label: "Roll Width", fn: (a, b) => (a.roll_width_inches || 0) - (b.roll_width_inches || 0) },
};

const matchesQuery = (v, q) => {
  if (!q) return true;
  const hay = [
    v.vinyl_name, v.manufacturer, v.product_series, v.color_name,
    v.vinyl_category, v.finish, v.vinyl_use_case,
  ].filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every(term => hay.includes(term));
};

export default function VinylSearchPickerDialog({
  open, onOpenChange, options, selectedId, onSelect, title = "Select Vinyl", allowNone = false,
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("name");

  const filtered = useMemo(() => {
    const list = options.filter(v => matchesQuery(v, query));
    return [...list].sort(SORTS[sortKey].fn);
  }, [options, query, sortKey]);

  const handlePick = (id) => {
    onSelect(id);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, color, manufacturer, category…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="h-9 w-44">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([k, s]) => (
                <SelectItem key={k} value={k}>Sort: {s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-[11px] text-slate-500 px-1">{filtered.length} of {options.length} shown</div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {allowNone && (
            <button
              onClick={() => handlePick("")}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between ${
                !selectedId ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="text-sm text-slate-600 italic">None</span>
              {!selectedId && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          )}
          {filtered.map(v => {
            const isSel = v.id === selectedId;
            return (
              <button
                key={v.id}
                onClick={() => handlePick(v.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                  isSel ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {v.vinyl_name}{v.roll_width_inches ? ` · ${v.roll_width_inches}″` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {v.manufacturer && <Badge variant="outline" className="text-[10px]">{v.manufacturer}</Badge>}
                    {v.vinyl_category && <Badge variant="outline" className="text-[10px]">{v.vinyl_category}</Badge>}
                    {v.finish && <Badge variant="outline" className="text-[10px]">{v.finish}</Badge>}
                    {v.color_name && <Badge variant="outline" className="text-[10px]">{v.color_name}</Badge>}
                  </div>
                </div>
                {isSel && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-10">No matches for “{query}”.</div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}