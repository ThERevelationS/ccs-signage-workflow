import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Fuel, RefreshCw } from "lucide-react";

// Standard setting renderer used by Travel + Site Conditions tabs.
// Mirrors the renderSettingInput() in ChannelLetterInstallationSettings.
export default function SettingInput({ def, value, onChange, isLocked, isFuel = false, onRefreshFuel, refreshingFuel }) {
  let step = "0.01";
  if (def.name.includes("multiplier")) step = "0.05";
  else if (def.suffix === "min/letter" || def.suffix === "min/ft" || def.suffix === "+min/letter" || def.suffix === "+min/raceway") step = "1";
  else if (def.name.includes("rate") && !def.name.includes("labor_rate")) step = "0.25";

  if (def.type === "text") {
    const fullSpan = def.name === "maintenance_shop_address";
    return (
      <div className={fullSpan ? "md:col-span-3" : ""}>
        <div className="flex items-baseline justify-between mb-1.5">
          <Label htmlFor={def.name} className="text-sm font-medium text-slate-800">{def.label}</Label>
        </div>
        <Input
          type="text" id={def.name}
          value={value || ""}
          onChange={(e) => onChange(def.name, e.target.value)}
          disabled={isLocked}
          className="h-10 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm transition-colors"
        />
        {def.description && <p className="mt-1.5 text-xs text-slate-500 leading-tight">{def.description}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <Label htmlFor={def.name} className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          {isFuel && <Fuel className="w-3.5 h-3.5 text-emerald-600" />}
          {def.label}
        </Label>
        {def.suffix && <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{def.suffix}</span>}
      </div>
      <div className="flex gap-2">
        <Input
          type="number" step={step} id={def.name}
          value={value ?? ""}
          onChange={(e) => onChange(def.name, e.target.value)}
          disabled={isLocked}
          className="h-10 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm tabular-nums font-medium transition-colors"
          min="0"
        />
        {isFuel && onRefreshFuel && (
          <Button type="button" variant="outline" size="sm"
            onClick={onRefreshFuel}
            disabled={isLocked || refreshingFuel}
            className="h-10 px-3 whitespace-nowrap"
            title="Refresh fuel price now"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingFuel ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
      {def.description && <p className="mt-1.5 text-xs text-slate-500 leading-tight">{def.description}</p>}
    </div>
  );
}