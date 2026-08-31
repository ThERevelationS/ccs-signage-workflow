import React, { useState } from "react";
import { Type, Layers, Wrench, Zap, Cpu, Hammer, Sticker, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

const META = {
  channel_letters: {
    icon: Type,
    color: "text-purple-600",
    tile: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    blurb: "Letter purchases, install labor, crew, equipment & travel",
  },
  foundation: {
    icon: Layers,
    color: "text-amber-600",
    tile: "bg-amber-50 border-amber-200 hover:bg-amber-100",
    blurb: "Foundations, excavation, walls, poles & site landscaping",
  },
  maintenance: {
    icon: Wrench,
    color: "text-teal-600",
    tile: "bg-teal-50 border-teal-200 hover:bg-teal-100",
    blurb: "Service calls, repairs, retrofits, crew & travel",
  },
  laser: {
    icon: Zap,
    color: "text-pink-600",
    tile: "bg-pink-50 border-pink-200 hover:bg-pink-100",
    blurb: "Laser machine time, supplies & labor",
  },
  cnc: {
    icon: Cpu,
    color: "text-emerald-600",
    tile: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    blurb: "CNC machine time & labor",
  },
  metal: {
    icon: Hammer,
    color: "text-orange-600",
    tile: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    blurb: "Material, fabrication, welding & finishing",
  },
  brick_stone: {
    icon: Layers,
    color: "text-stone-600",
    tile: "bg-stone-100 border-stone-300 hover:bg-stone-200",
    blurb: "Brick, stone, mortar & masonry labor",
  },
  vinyl: {
    icon: Sticker,
    color: "text-indigo-600",
    tile: "bg-indigo-50 border-indigo-200 hover:bg-indigo-100",
    blurb: "Vinyl cutting, printing, lamination workflows",
  },
};

export default function AddProductGrid({ counts = {}, onAdd, className = "" }) {
  const [open, setOpen] = useState(false);
  const [addingKey, setAddingKey] = useState(null);

  const handleAdd = async (mod) => {
    setAddingKey(mod.key);
    try {
      await onAdd(mod);
      setOpen(false);
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-[32px] px-3 inline-flex items-center gap-1.5 rounded-sm border border-gray-700 bg-[#454545] text-white text-[12px] font-semibold shadow-sm hover:bg-[#353535] ${className}`}
      >
        <Plus className="w-3.5 h-3.5 text-lime-300" />
        Add Product
      </button>

      <Dialog open={open} onOpenChange={(next) => !addingKey && setOpen(next)}>
        <DialogContent className="sm:max-w-[820px] p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <DialogTitle className="text-[15px] font-bold text-gray-900">Add Product</DialogTitle>
            <p className="text-[11px] text-gray-500 font-normal">
              Choose the estimator to add. The new product will open here in Step 2.
            </p>
          </DialogHeader>

          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ESTIMATOR_MODULES.map((mod) => {
              const meta = META[mod.key] || {
                icon: Layers,
                color: "text-gray-500",
                tile: "bg-gray-50 border-gray-200 hover:bg-gray-100",
                blurb: "",
              };
              const Icon = meta.icon;
              const count = counts[mod.key] || 0;
              const adding = addingKey === mod.key;

              return (
                <button
                  type="button"
                  key={mod.key}
                  disabled={!!addingKey}
                  onClick={() => handleAdd(mod)}
                  className={`text-left border rounded-md px-3 py-2.5 transition-colors disabled:opacity-60 ${meta.tile}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                    <span className="text-[12px] font-bold text-gray-800 truncate">{mod.label}</span>
                    {count > 0 && (
                      <span className="ml-auto text-[10px] min-w-[20px] h-[20px] px-1.5 rounded-full bg-white/70 border border-current/10 flex items-center justify-center text-gray-500">
                        {count}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500 leading-snug">{meta.blurb}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                    <Plus className="w-3 h-3" /> {adding ? "Adding…" : "Add Product"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
