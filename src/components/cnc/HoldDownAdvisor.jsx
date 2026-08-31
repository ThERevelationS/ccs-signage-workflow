import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Grip, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { evaluateHoldDown, WORKHOLDING_OPTIONS } from "@/components/cnc/holdDownCalculator";

const RISK_BADGES = {
  normal: "bg-green-100 text-green-800",
  elevated: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

// Per-item hold-down advisor panel for the CNC estimator.
// Advisory only — never changes machine-time or cost calculations.
export default function HoldDownAdvisor({ item, onUpdate, letterPerimFactor }) {
  const result = evaluateHoldDown({ ...item, letter_perimeter_factor: letterPerimFactor });
  const hasMissing = result.missing.length > 0;

  return (
    <div className="mt-4 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Grip className="w-4 h-4 text-slate-600" />
          <span className="font-medium text-sm text-slate-800">Hold-Down Advisor</span>
          {!hasMissing && (
            <Badge className={RISK_BADGES[result.riskLevel]}>
              {result.riskLevel === "normal" ? "Normal risk" : result.riskLevel === "elevated" ? "Elevated risk" : "High risk"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`ehd-${item._advisorId || "x"}`} className="text-xs text-slate-600">Enhanced hold-down (small/detailed geometry)</Label>
          <Switch
            checked={!!item.force_enhanced}
            onCheckedChange={(v) => onUpdate("force_enhanced", v)}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <div>
          <Label className="text-xs">Cutter Diameter (in)</Label>
          <Input type="number" min="0" step="0.0625" value={item.cutter_diameter_in || ""} onFocus={(e) => e.target.select()}
            onChange={(e) => onUpdate("cutter_diameter_in", parseFloat(e.target.value) || 0)} placeholder='e.g. 0.25' />
        </div>
        <div>
          <Label className="text-xs">Smallest Detail Width (in)</Label>
          <Input type="number" min="0" step="0.0625" value={item.smallest_detail_in || ""} onFocus={(e) => e.target.select()}
            onChange={(e) => onUpdate("smallest_detail_in", parseFloat(e.target.value) || 0)} placeholder="narrowest stroke/feature" />
        </div>
        <div>
          <Label className="text-xs">Workholding Method</Label>
          <Select value={item.workholding_method || ""} onValueChange={(v) => onUpdate("workholding_method", v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {WORKHOLDING_OPTIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <Checkbox
              checked={item.item_type === "lettering" ? true : !!item.creates_loose_pieces}
              disabled={item.item_type === "lettering"}
              onCheckedChange={(v) => onUpdate("creates_loose_pieces", !!v)}
            />
            Cut releases loose pieces{item.item_type === "lettering" ? " (always for lettering)" : ""}
          </label>
        </div>
      </div>

      {hasMissing ? (
        <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Not enough information for a reliable recommendation.</p>
            <p className="text-xs mt-1">Please provide: {result.missing.join(", ")}.</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className={`p-3 rounded-md border text-sm flex gap-2 ${result.strategy === "enhanced" ? "bg-red-50 border-red-200 text-red-900" : "bg-green-50 border-green-200 text-green-900"}`}>
            {result.strategy === "enhanced"
              ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <p className="font-medium">{result.plan.summary}</p>
          </div>

          <div className="bg-white rounded-md border border-slate-200 divide-y divide-slate-100">
            {result.plan.items.map((line, i) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[140px_1fr] gap-2 text-xs">
                <span className="font-medium text-slate-500">{line.label}</span>
                <span className="text-slate-800">{line.value}</span>
              </div>
            ))}
          </div>

          {result.reasons.length > 0 && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Why this recommendation ({result.reasons.length} factors)</summary>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </details>
          )}

          {result.warnings.length > 0 && (
            <div className="text-xs text-amber-700 space-y-0.5">
              {result.warnings.map((w, i) => (
                <p key={i} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}