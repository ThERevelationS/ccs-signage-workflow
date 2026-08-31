// Horizontal preset bar — one click toggles the right machine passes + bleed. Feature #5.

import React from "react";
import { Button } from "@/components/ui/button";
import { WORKFLOW_PRESETS } from "./vinylWorkflowPresets";
import { Sparkles } from "lucide-react";

export default function VinylPresetBar({ activePresetKey, onApply }) {
  return (
    <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-blue-50/50 border border-blue-100">
      <span className="text-[11px] font-medium text-blue-900 flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5" /> Workflow Preset:
      </span>
      {WORKFLOW_PRESETS.map(p => {
        const active = activePresetKey === p.key;
        return (
          <Button
            key={p.key}
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => onApply(p)}
            className={`h-7 text-[11px] ${active ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-white"}`}
            title={p.description}
          >
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}