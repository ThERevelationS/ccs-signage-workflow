import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, ArrowUpDown } from "lucide-react";
import { materialCostPerSqin } from "./dimensionalFabCalculator";

const MATERIAL_TYPE_LABELS = {
  acrylic: "Acrylic",
  pvc: "PVC / Sintra",
  aluminum_composite: "ACM (Aluminum Composite)",
  aluminum_solid: "Solid Aluminum",
  aluminum_sheet: "Aluminum Sheet",
  steel_sheet: "Steel Sheet",
  stainless_sheet: "Stainless Sheet",
  galvanized_sheet: "Galvanized Sheet",
  polycarbonate: "Polycarbonate",
  styrene: "Styrene",
  coroplast: "Coroplast",
  gatorboard: "Gatorboard",
  wood: "Wood",
  mdf: "MDF",
  hdu: "HDU Foam",
  foam: "EPS Foam",
  other: "Other",
};

const TYPE_COLORS = {
  acrylic: "bg-cyan-100 text-cyan-800",
  pvc: "bg-blue-100 text-blue-800",
  aluminum_composite: "bg-slate-100 text-slate-800",
  aluminum_solid: "bg-zinc-100 text-zinc-800",
  wood: "bg-amber-100 text-amber-800",
  mdf: "bg-orange-100 text-orange-800",
  hdu: "bg-pink-100 text-pink-800",
  foam: "bg-purple-100 text-purple-800",
  other: "bg-slate-100 text-slate-800",
};

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const SORT_OPTIONS = {
  name: { label: "Name (A–Z)", fn: (a, b) => (a.material_name || "").localeCompare(b.material_name || "") },
  type: { label: "Material Type", fn: (a, b) => (a.material_type || "").localeCompare(b.material_type || "") },
  thickness: { label: "Thickness (low→high)", fn: (a, b) => (a.thickness_inches || 0) - (b.thickness_inches || 0) },
  cost_low: { label: "$/sqft (low→high)", fn: (a, b) => materialCostPerSqin(a) - materialCostPerSqin(b) },
  cost_high: { label: "$/sqft (high→low)", fn: (a, b) => materialCostPerSqin(b) - materialCostPerSqin(a) },
};

export default function DimensionalMaterialPickerDialog({ open, onClose, materials = [], selectedId, onSelect }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paintFilter, setPaintFilter] = useState("all");
  const [laserFilter, setLaserFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");

  const availableTypes = useMemo(() => {
    const set = new Set(materials.map((m) => m.material_type).filter(Boolean));
    return Array.from(set);
  }, [materials]);

  const filtered = useMemo(() => {
    let list = materials.filter((m) => {
      if (typeFilter !== "all" && m.material_type !== typeFilter) return false;
      if (paintFilter === "yes" && !m.needs_painting) return false;
      if (paintFilter === "no" && m.needs_painting) return false;
      if (laserFilter === "yes" && m.allow_laser === false) return false;
      if (laserFilter === "no" && m.allow_laser !== false) return false;
      if (search) {
        const hay = `${m.material_name} ${m.color || ""} ${m.supplier || ""} ${MATERIAL_TYPE_LABELS[m.material_type] || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    return list.sort(SORT_OPTIONS[sortKey].fn);
  }, [materials, typeFilter, paintFilter, laserFilter, search, sortKey]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle>Select Sheet Material</DialogTitle>
        </DialogHeader>

        {/* Search + filter + sort bar */}
        <div className="px-4 py-3 border-b space-y-2 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              placeholder="Search by name, color, supplier, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-44 text-xs bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {availableTypes.map((t) => (
                  <SelectItem key={t} value={t}>{MATERIAL_TYPE_LABELS[t] || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paintFilter} onValueChange={setPaintFilter}>
              <SelectTrigger className="h-8 w-36 text-xs bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Paint: Any</SelectItem>
                <SelectItem value="yes">Needs Paint</SelectItem>
                <SelectItem value="no">Pre-finished</SelectItem>
              </SelectContent>
            </Select>
            <Select value={laserFilter} onValueChange={setLaserFilter}>
              <SelectTrigger className="h-8 w-36 text-xs bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Laser: Any</SelectItem>
                <SelectItem value="yes">Laser OK</SelectItem>
                <SelectItem value="no">CNC Only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={setSortKey}>
              <SelectTrigger className="h-8 w-48 text-xs bg-white">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_OPTIONS).map(([k, o]) => (
                  <SelectItem key={k} value={k}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-500 self-center ml-auto">{filtered.length} of {materials.length}</span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No materials match your filters.</div>
          ) : (
            filtered.map((m) => {
              const isSel = m.id === selectedId;
              const sqin = materialCostPerSqin(m);
              return (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m.id); onClose(); }}
                  className={`w-full text-left border rounded-lg p-3 transition-colors flex items-center gap-3 ${
                    isSel ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-900 truncate">{m.material_name}</span>
                      <Badge className={`${TYPE_COLORS[m.material_type] || TYPE_COLORS.other} text-[10px]`}>
                        {MATERIAL_TYPE_LABELS[m.material_type] || m.material_type}
                      </Badge>
                      {m.allow_laser === false && (
                        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">CNC only</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{m.thickness_inches}" thick</span>
                      {m.color && <span>{m.color}</span>}
                      {m.supplier && <span>{m.supplier}</span>}
                      <span>{Math.round((m.yield_factor || 0.7) * 100)}% yield</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold tabular-nums text-slate-900">{fmt(sqin * 144)}<span className="text-[10px] text-slate-400">/sqft</span></div>
                  </div>
                  {isSel && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 border-t flex justify-end bg-slate-50">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}