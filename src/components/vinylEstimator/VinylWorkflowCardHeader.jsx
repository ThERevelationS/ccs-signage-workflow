// Header for one VinylWorkflowCard.
// Clean two-row layout:
//   Row 1: chevron + color dot + editable name + total cost (big, right-aligned)
//   Row 2: status badges (parts, vinyl, yield, unplaced) + actions (template / duplicate / delete)
// Color tag picker lives in a popover so it doesn't clutter the body.

import React, { useState, useRef, useEffect } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronRight, Trash2, Copy, Bookmark,
  AlertTriangle, Pencil, Check, X, Palette,
} from "lucide-react";
import VinylWorkflowMetricsBadge from "./VinylWorkflowMetricsBadge";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

export const COLOR_SWATCHES = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#0ea5e9",
];

function NameEditor({ value, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => { onSave(draft.trim()); setEditing(false); };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="group flex items-center gap-1.5 min-w-0 max-w-full text-left rounded px-1.5 py-0.5 hover:bg-slate-100 transition-colors"
        title="Click to rename"
      >
        <CardTitle className="text-base truncate">
          {value || <span className="text-slate-400 font-normal">{placeholder}</span>}
        </CardTitle>
        <Pencil className="w-3 h-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="h-7 text-base font-semibold px-1.5 rounded border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-0 flex-1"
      />
      <Button size="icon" variant="ghost" className="h-6 w-6" onMouseDown={(e) => { e.preventDefault(); commit(); }}>
        <Check className="w-3.5 h-3.5 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onMouseDown={(e) => { e.preventDefault(); cancel(); }}>
        <X className="w-3.5 h-3.5 text-slate-500" />
      </Button>
    </div>
  );
}

function ColorTagPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="w-5 h-5 rounded-full ring-2 ring-white shadow border border-slate-200 hover:scale-110 transition-transform flex-shrink-0"
        style={{ background: value }}
        title="Change color tag"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-7 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 mb-1.5 text-[10px] text-slate-500 font-medium">
              <Palette className="w-3 h-3" /> COLOR TAG
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-6 h-6 rounded-full transition-all ${value === c ? "ring-2 ring-slate-900 ring-offset-1" : "hover:scale-110"}`}
                  style={{ background: c }}
                  aria-label={`Set color ${c}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function VinylWorkflowCardHeader({
  workflow, index, vinyl, calc, metrics, colorTag,
  open, onToggleOpen, onChange,
  onSaveTemplate, onDuplicate, onRemove,
}) {
  const partCount = (workflow.items || []).length;
  const placeholderName = `Workflow ${index + 1}`;

  return (
    <CardHeader className="pb-2.5 pt-3">
      {/* Row 1 — title + total */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleOpen}
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 flex-shrink-0 text-slate-500"
          title={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <ColorTagPicker
          value={colorTag}
          onChange={(c) => onChange({ color_tag: c })}
        />

        <div className="flex-1 min-w-0">
          <NameEditor
            value={workflow.name}
            placeholder={placeholderName}
            onSave={(v) => onChange({ name: v })}
          />
        </div>

        {/* Total cost — prominent */}
        <div className="flex-shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 leading-none">Total</div>
          <div className="text-base font-bold tabular-nums text-slate-900 leading-tight">{fmt(calc.totalCost)}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 pl-1 border-l border-slate-200 ml-1">
          <Button
            variant="ghost" size="icon"
            onClick={onSaveTemplate}
            className="h-7 w-7 text-slate-500 hover:text-blue-600"
            title="Save / apply template"
          >
            <Bookmark className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={onDuplicate}
            className="h-7 w-7 text-slate-500 hover:text-blue-600"
            title="Duplicate workflow"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={onRemove}
            className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
            title="Delete workflow"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 2 — status badges */}
      <div className="flex items-center gap-1.5 flex-wrap pl-8 mt-1.5">
        <Badge variant="outline" className="text-[10px] font-normal h-5">
          {partCount} {partCount === 1 ? "part" : "parts"}
        </Badge>
        {vinyl ? (
          <Badge variant="outline" className="text-[10px] font-normal h-5 max-w-[200px] truncate" title={vinyl.vinyl_name}>
            {vinyl.vinyl_name}
          </Badge>
        ) : (
          <Badge className="text-[10px] font-normal h-5 bg-amber-50 text-amber-800 border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> No vinyl selected
          </Badge>
        )}
        {calc.partsUnplaced > 0 && (
          <Badge className="text-[10px] font-normal h-5 bg-red-100 text-red-800 border-red-200">
            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> {calc.partsUnplaced} unplaced
          </Badge>
        )}
        <VinylWorkflowMetricsBadge metrics={metrics} />
      </div>
    </CardHeader>
  );
}