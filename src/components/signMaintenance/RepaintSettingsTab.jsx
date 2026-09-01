// Sign Maintenance — Settings tab for the Repaint action.
// Surfaces every "maintenance_repaint_*" setting that drives RepaintMonumentPanel
// and the maintenanceCalculator's repaint logic.

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Paintbrush2, Layers, Sparkles, Gauge } from "lucide-react";
import SectionCard, { AnimatedGrid } from "./SectionCard";
import { REPAINT_FEATURES } from "./repaintDefaults";

const PAINT_FIELDS = [
  { name: "maintenance_repaint_coverage_sqft_per_gallon", label: "Paint Coverage",         suffix: "sqft / gal" },
  { name: "maintenance_repaint_paint_cost_per_gallon",    label: "Paint Cost",             suffix: "$ / gal" },
  { name: "maintenance_repaint_primer_coats",             label: "Primer Coats",           suffix: "coats" },
  { name: "maintenance_repaint_finish_coats",             label: "Finish Coats",           suffix: "coats" },
];

const PRODUCTIVITY_FIELDS = [
  { name: "maintenance_repaint_sqft_per_hour", label: "Prep + Paint Rate", suffix: "sqft / hr" },
];

const CONDITION_FIELDS = [
  { name: "maintenance_repaint_condition_step_pct", label: "Difficulty per Condition Level", suffix: "% / step" },
];

export default function RepaintSettingsTab({ globalSettings, setGlobalSettings, isLocked }) {
  const set = (k, v) => setGlobalSettings(prev => ({ ...prev, [k]: v }));

  const Field = ({ def, step = "0.01" }) => (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <Label className="text-sm font-medium text-slate-800">{def.label}</Label>
        <span className="text-[10px] uppercase tracking-wider text-orange-600 font-semibold">{def.suffix}</span>
      </div>
      <Input
        type="number" step={step} min="0"
        value={globalSettings[def.name] ?? ""}
        onChange={(e) => set(def.name, e.target.value)}
        disabled={isLocked}
        className="h-10 bg-white text-sm tabular-nums font-medium border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        icon={Paintbrush2}
        theme="amber"
        title="Paint Material"
        description="Paint coverage, cost per gallon, and standard coat counts."
      >
        <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PAINT_FIELDS.map(def => <Field key={def.name} def={def} step="0.01" />)}
        </AnimatedGrid>
      </SectionCard>

      <SectionCard
        icon={Layers}
        theme="amber"
        title="Productivity"
        description="How many square feet a tech can prep + paint per hour (base rate, before feature & condition multipliers)."
      >
        <AnimatedGrid className="grid sm:grid-cols-2 gap-4">
          {PRODUCTIVITY_FIELDS.map(def => <Field key={def.name} def={def} step="1" />)}
        </AnimatedGrid>
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        theme="amber"
        title="Face Features — Time & Material Multipliers"
        description="When repainting an entire monument panel, these multipliers stack onto the base labor (e.g. dimensional letters require cutting in around each letter)."
      >
        <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {REPAINT_FEATURES.map(f => (
            <Field
              key={f.setting}
              def={{ name: f.setting, label: f.label, suffix: "× multiplier" }}
              step="0.01"
            />
          ))}
        </AnimatedGrid>
      </SectionCard>

      <SectionCard
        icon={Gauge}
        theme="amber"
        title="Paint Condition Difficulty"
        description="A 10-position slider on each item describes the sign's current paint condition. This setting controls how much each step (over level 1) adds to prep labor."
      >
        <AnimatedGrid className="grid sm:grid-cols-2 gap-4">
          {CONDITION_FIELDS.map(def => <Field key={def.name} def={def} step="0.5" />)}
          <div className="text-xs text-slate-500 bg-white border border-amber-200 rounded-lg p-3 space-y-1">
            <div className="font-semibold text-slate-700">Example</div>
            <div>At <span className="font-bold">8%</span>/step:</div>
            <div>• Level 1 (Like New) → ×1.00 labor</div>
            <div>• Level 5 (Fair)     → ×1.32 labor</div>
            <div>• Level 10 (Severe) → ×1.72 labor</div>
          </div>
        </AnimatedGrid>
      </SectionCard>
    </div>
  );
}