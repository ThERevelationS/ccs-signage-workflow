import React from "react";
import { SIGN_TYPES } from "./constants";
import { Wrench, Type, Square, Anchor, Columns, Layers, Sparkles, Box } from "lucide-react";

const ICON_FOR = {
  flush_channel: Type,
  halo_channel: Sparkles,
  raceway_channel: Columns,
  capsule_logo: Layers,
  dimensional_letters: Box,
  monument_sign: Square,
  pylon_sign: Anchor,
  post_and_panel: Wrench,
};

const COLOR_CLASSES = {
  blue:     { on: "border-blue-500 bg-blue-50 text-blue-900",       dot: "bg-blue-500" },
  amber:    { on: "border-amber-500 bg-amber-50 text-amber-900",    dot: "bg-amber-500" },
  purple:   { on: "border-purple-500 bg-purple-50 text-purple-900", dot: "bg-purple-500" },
  teal:     { on: "border-teal-500 bg-teal-50 text-teal-900",       dot: "bg-teal-500" },
  indigo:   { on: "border-indigo-500 bg-indigo-50 text-indigo-900", dot: "bg-indigo-500" },
  stone:    { on: "border-stone-500 bg-stone-50 text-stone-900",    dot: "bg-stone-500" },
  slate:    { on: "border-slate-500 bg-slate-100 text-slate-900",   dot: "bg-slate-500" },
  emerald:  { on: "border-emerald-500 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" },
};

export default function SignTypePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
      {SIGN_TYPES.map(t => {
        const selected = value === t.id;
        const Icon = ICON_FOR[t.id] || Wrench;
        const c = COLOR_CLASSES[t.color] || COLOR_CLASSES.slate;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative rounded-lg border-2 transition-all text-left overflow-hidden p-2 ${
              selected ? c.on + " shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {selected && <div className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${c.dot}`} />}
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold leading-tight">{t.label}</span>
            </div>
            <div className="text-[9px] opacity-70 leading-tight">{t.description}</div>
          </button>
        );
      })}
    </div>
  );
}

// Safelist hint for Tailwind purge:
// border-blue-500 bg-blue-50 text-blue-900 bg-blue-500
// border-amber-500 bg-amber-50 text-amber-900 bg-amber-500
// border-purple-500 bg-purple-50 text-purple-900 bg-purple-500
// border-teal-500 bg-teal-50 text-teal-900 bg-teal-500
// border-indigo-500 bg-indigo-50 text-indigo-900 bg-indigo-500
// border-stone-500 bg-stone-50 text-stone-900 bg-stone-500
// border-slate-500 bg-slate-100 text-slate-900 bg-slate-500
// border-emerald-500 bg-emerald-50 text-emerald-900 bg-emerald-500