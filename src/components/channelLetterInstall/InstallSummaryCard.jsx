import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Copy, FileDown, Calculator, TrendingUp } from "lucide-react";
// Note: Markup % control intentionally removed — all markups are managed on the Customer Pricing tab.
import CostBreakdownBar from "./CostBreakdownBar";

// Held/blank values render an em-dash instead of laundering into $0.00.
const fmt = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : "—");

export default function InstallSummaryCard({
  project, onUpdate, onSave, isSaving, isEditing, onCopySummary, onExportCSV
}) {
  const itemsCount = (project.items || []).length;
  // Keep possibly-null values — a held group must show "—", never $0.00.
  const labor = project.labor_cost;
  // When a crew is assigned, personnel pricing replaces the flat-rate labor in the subtotal
  const laborViaCrew = !!project.labor_priced_via_personnel;
  const laborInSubtotal = laborViaCrew ? 0 : labor;
  const materials = project.total_materials_cost;
  const equipment = project.total_equipment_cost;
  const personnel = project.total_personnel_cost;
  const travel = project.total_travel_cost;
  const letters = project.total_letters_cost;
  const subtotal = project.subtotal;
  const total = project.total_cost;
  const showSeg = (v) => v === null || (Number.isFinite(v) && v > 0);

  const segments = [
    { label: "Labor",      value: laborInSubtotal, color: "bg-purple-400" },
    { label: "Materials",  value: materials, color: "bg-emerald-400" },
    { label: "Equipment",  value: equipment, color: "bg-amber-400" },
    { label: "Personnel",  value: personnel, color: "bg-sky-400" },
    { label: "Travel",     value: travel,    color: "bg-orange-400" },
    { label: "Letters",    value: letters,   color: "bg-pink-400" },
  ].map(s => ({ ...s, value: Number.isFinite(s.value) ? s.value : 0 }));

  return (
    <Card className="border-0 shadow-xl sticky top-8 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-purple-600/30 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
            <Calculator className="w-4 h-4 text-purple-200" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">Estimate Summary</div>
            <div className="text-[11px] text-slate-300">
              {itemsCount} item{itemsCount !== 1 ? "s" : ""}
              {(project.letter_purchases || []).length > 0 && ` · ${(project.letter_purchases).length} letter line${(project.letter_purchases).length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 pt-2 pb-5 px-5">
        {project.__held && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-md px-2.5 py-1.5">
            Saved amounts (not current pricing) — fix the flagged values to reprice.
          </p>
        )}
        {/* Cost rollup rows */}
        <div className="space-y-1.5 text-sm">
          {!laborViaCrew && (
            <Row label={`Labor (${Number.isFinite(project.labor_hours) ? project.labor_hours.toFixed(2) : "—"} hrs)`} value={labor} dot="bg-purple-400" />
          )}
          <Row label="Materials" value={materials} dot="bg-emerald-400" />
          {showSeg(equipment) && (
            <Row label={`Equipment (${(project.selected_equipment || []).length})`} value={equipment} dot="bg-amber-400" />
          )}
          {showSeg(personnel) && (
            <Row
              label={laborViaCrew
                ? `Crew Labor (${(project.personnel || []).length} crew · ${Number.isFinite(project.labor_hours) ? project.labor_hours.toFixed(2) : "—"} hrs)`
                : `Personnel (${(project.personnel || []).length})`}
              value={personnel}
              dot="bg-sky-400"
            />
          )}
          {showSeg(travel) && (
            <Row label={`Travel (${(parseFloat(project.travel_miles_round_trip) || 0).toFixed(1)} mi)`} value={travel} dot="bg-orange-400" />
          )}
          {showSeg(letters) && (
            <Row label={`Letters (${(project.letter_purchases || []).length})`} value={letters} dot="bg-pink-400" />
          )}
          <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
            <span className="text-slate-300">Subtotal</span>
            <span className="font-semibold tabular-nums">{fmt(subtotal)}</span>
          </div>
        </div>

        {/* Breakdown bar */}
        {Number.isFinite(subtotal) && subtotal > 0 && (
          <div className="bg-white/5 rounded-lg p-3 space-y-2 border border-white/5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Where the money goes
              </span>
            </div>
            <CostBreakdownBar segments={segments} />
          </div>
        )}

        {/* Total — markups live in the Customer Pricing tab */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl px-4 py-3 shadow-lg border border-purple-400/30">
          <div className="text-[10px] text-purple-100 uppercase tracking-widest font-semibold">Subtotal (Before Markup)</div>
          <div className="text-3xl font-bold tabular-nums leading-tight">{fmt(Number.isFinite(subtotal) ? subtotal : total)}</div>
          <div className="text-[10px] text-purple-200 mt-0.5">
            See <span className="font-semibold">Customer Pricing</span> tab for tier-based pricing.
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {project?.updated_date && (<div className="mt-1 text-[10px] text-gray-400">Last saved {new Date(project.updated_date).toLocaleString()}</div>)}
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="w-full bg-green-500 hover:bg-green-600 text-white h-11 shadow-md"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : isEditing ? "Update Estimate" : "Save Estimate"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={onCopySummary}
              className="h-9 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy
            </Button>
            <Button
              variant="outline"
              onClick={onExportCSV}
              className="h-9 text-xs bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const Row = ({ label, value, dot }) => (
  <div className="flex justify-between items-center">
    <span className="text-slate-300 flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
    <span className="font-medium tabular-nums">{fmt(value)}</span>
  </div>
);