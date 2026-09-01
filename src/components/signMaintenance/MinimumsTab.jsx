import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge } from "lucide-react";
import { SIGN_TYPES } from "./constants";
import { DEFAULT_MIN_HOURS } from "./defaults";
import SectionCard, { AnimatedGrid } from "./SectionCard";

// Minimum billable hours per sign type. When a service item's calculated
// labor hours come in BELOW this floor, the estimator bumps it up.
export const minimumSettingKey = (signTypeId) => `maintenance_min_hours_${signTypeId}`;

// Map sign-type color → tailwind utility classes for the per-card accent.
const COLOR_CLASSES = {
  blue:    { dot: "bg-blue-500",    focus: "focus:border-blue-400 focus:ring-blue-100",    label: "text-blue-600" },
  amber:   { dot: "bg-amber-500",   focus: "focus:border-amber-400 focus:ring-amber-100",  label: "text-amber-600" },
  purple:  { dot: "bg-purple-500",  focus: "focus:border-purple-400 focus:ring-purple-100",label: "text-purple-600" },
  teal:    { dot: "bg-teal-500",    focus: "focus:border-teal-400 focus:ring-teal-100",    label: "text-teal-600" },
  indigo:  { dot: "bg-indigo-500",  focus: "focus:border-indigo-400 focus:ring-indigo-100",label: "text-indigo-600" },
  stone:   { dot: "bg-stone-500",   focus: "focus:border-stone-400 focus:ring-stone-100",  label: "text-stone-600" },
  slate:   { dot: "bg-slate-500",   focus: "focus:border-slate-400 focus:ring-slate-100",  label: "text-slate-600" },
  emerald: { dot: "bg-emerald-500", focus: "focus:border-emerald-400 focus:ring-emerald-100",label: "text-emerald-600" },
};

export default function MinimumsTab({ globalSettings, setGlobalSettings, isLocked }) {
  return (
    <SectionCard
      icon={Gauge}
      theme="violet"
      title="Minimum Rates by Sign Type"
      description="Minimum billable labor hours per service item. If the calculated labor for a service item comes in below this floor, the estimator bumps it up."
    >
      <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SIGN_TYPES.map(st => {
          const key = minimumSettingKey(st.id);
          const val = globalSettings[key] ?? String(DEFAULT_MIN_HOURS[st.id] ?? 2);
          const c = COLOR_CLASSES[st.color] || COLOR_CLASSES.slate;
          return (
            <div key={st.id} className="group p-3 rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/40 hover:from-white hover:to-slate-50 hover:shadow-sm transition-all">
              <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <Label htmlFor={key} className="text-sm font-medium text-slate-800 flex items-center gap-2 truncate">
                  <span className={`w-2 h-2 rounded-full ${c.dot} shadow-sm`} />
                  <span className="truncate">{st.label}</span>
                </Label>
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${c.label}`}>hrs (min)</span>
              </div>
              <Input
                id={key}
                type="number" min="0" step="0.25"
                value={val}
                disabled={isLocked}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, [key]: e.target.value }))}
                className={`h-10 bg-white text-sm tabular-nums font-medium border-slate-200 focus:ring-2 transition-all ${c.focus}`}
              />
              <p className="mt-1.5 text-[11px] text-slate-500 leading-tight">{st.description}</p>
            </div>
          );
        })}
      </AnimatedGrid>
    </SectionCard>
  );
}