import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

const OPTIONS = [
  { value: "flush_mount", label: "Flush Mount" },
  { value: "halo_lit", label: "Halo-Lit" },
  { value: "raceway", label: "Raceway" },
  { value: "dimensional_lettering", label: "Dimensional Lettering" },
];

// Multi-select dropdown for the "Applies To" field on inventory items.
// Empty array means "applies to all".
export default function AppliesToMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(value) ? value : [];

  const toggle = (v) => {
    if (list.includes(v)) onChange(list.filter(x => x !== v));
    else onChange([...list, v]);
  };

  const summary = list.length === 0
    ? "All"
    : list.length === OPTIONS.length
      ? "All"
      : list.map(v => OPTIONS.find(o => o.value === v)?.label || v).join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-8 w-full justify-between font-normal text-xs px-2 mt-0.5"
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
            >
              <Checkbox
                checked={list.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
          <div className="border-t pt-1 mt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
            >
              Clear (apply to all)
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}