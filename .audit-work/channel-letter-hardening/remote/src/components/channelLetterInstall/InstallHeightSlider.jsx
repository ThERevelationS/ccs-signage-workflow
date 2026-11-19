import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, CheckCircle2, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import BoomLiftReachChart from "./BoomLiftReachChart";

// Dynamic-color install height slider.
//   <= 39 ft  -> green (safe / ladders or small lifts)
//   40-54 ft  -> yellow ("Can we reach from our parking location?")
//   >= 55 ft  -> red   ("Rental Boom Lift Required")
const MAX_FT = 180;

const getZone = (h) => {
  if (h >= 55) return {
    key: "red",
    label: "Rental Boom Lift Required",
    Icon: AlertCircle,
    track: "bg-red-500",
    range: "bg-red-500",
    thumb: "border-red-600 bg-red-50",
    bg: "bg-red-50 border-red-200",
    text: "text-red-800",
  };
  if (h >= 40) return {
    key: "yellow",
    label: "Can we reach from our parking location?",
    Icon: AlertTriangle,
    track: "bg-yellow-400",
    range: "bg-yellow-400",
    thumb: "border-yellow-500 bg-yellow-50",
    bg: "bg-yellow-50 border-yellow-200",
    text: "text-yellow-800",
  };
  return {
    key: "green",
    label: "Standard reach — ladders / small lift",
    Icon: CheckCircle2,
    track: "bg-emerald-500",
    range: "bg-emerald-500",
    thumb: "border-emerald-600 bg-emerald-50",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
  };
};

export default function InstallHeightSlider({ value, onChange }) {
  const h = parseFloat(value) || 0;
  const zone = getZone(h);
  const Icon = zone.Icon;
  const [showChart, setShowChart] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 w-24"
        />
        <span className="text-xs text-slate-500">ft</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowChart((s) => !s)}
          className="ml-auto h-8 text-xs gap-1.5"
          title="Show / hide boom lift reach chart"
        >
          <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
          Reach Chart
          {showChart ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>
      <div className="px-1">
        <Slider
          value={[Math.min(h, MAX_FT)]}
          min={0}
          max={MAX_FT}
          step={1}
          onValueChange={(v) => onChange(v[0])}
          colorClass={zone.range}
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
          <span>0</span>
          <span className="text-emerald-600">40</span>
          <span className="text-yellow-600">55</span>
          <span>120</span>
          <span>{MAX_FT}+</span>
        </div>
      </div>
      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${zone.bg} ${zone.text}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{zone.label}</span>
      </div>

      {showChart && (
        <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-3">
          <BoomLiftReachChart installationHeightFeet={h} />
        </div>
      )}
    </div>
  );
}