import React from "react";
import { Type, Layers, Wrench, Paintbrush, Zap, Cpu, Hammer, Sticker, Plus } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

const META = {
  channel_letters: { icon: Type, color: "text-purple-600", tile: "bg-purple-50 border-purple-200 hover:bg-purple-100", blurb: "Letter purchases, install labor, crew, equipment & travel" },
  foundation: { icon: Layers, color: "text-amber-600", tile: "bg-amber-50 border-amber-200 hover:bg-amber-100", blurb: "Foundations, excavation, walls, poles & site landscaping" },
  maintenance: { icon: Wrench, color: "text-teal-600", tile: "bg-teal-50 border-teal-200 hover:bg-teal-100", blurb: "Service calls, repairs, retrofits, crew & travel" },
  paint: { icon: Paintbrush, color: "text-blue-600", tile: "bg-blue-50 border-blue-200 hover:bg-blue-100", blurb: "Paint masking, liquid paint, supplies & labor" },
  laser: { icon: Zap, color: "text-pink-600", tile: "bg-pink-50 border-pink-200 hover:bg-pink-100", blurb: "Laser machine time, supplies & labor" },
  cnc: { icon: Cpu, color: "text-emerald-600", tile: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100", blurb: "CNC machine time & labor" },
  metal: { icon: Hammer, color: "text-orange-600", tile: "bg-orange-50 border-orange-200 hover:bg-orange-100", blurb: "Material, fabrication, welding & finishing" },
  brick_stone: { icon: Layers, color: "text-stone-600", tile: "bg-stone-100 border-stone-300 hover:bg-stone-200", blurb: "Brick, stone, mortar & masonry labor" },
  vinyl: { icon: Sticker, color: "text-indigo-600", tile: "bg-indigo-50 border-indigo-200 hover:bg-indigo-100", blurb: "Vinyl cutting, printing, lamination workflows" },
};

export default function AddProductGrid({ counts = {}, onAdd }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md">
      <div className="px-4 py-2 border-b border-gray-200 text-[11px] font-bold tracking-wider text-red-600">
        ADD A PRODUCT
      </div>
      <p className="px-4 pt-2 text-[11px] text-gray-400">
        Each product loads that module's <span className="font-semibold text-gray-600">full estimator right here on this page</span> — project info is auto-filled from Estimate Details, so you never re-enter it.
      </p>
      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {ESTIMATOR_MODULES.map((mod) => {
          const meta = META[mod.key] || {
            icon: Layers,
            color: "text-gray-500",
            tile: "bg-gray-50 border-gray-200 hover:bg-gray-100",
            blurb: "",
          };
          const Icon = meta.icon;
          const count = counts[mod.key] || 0;
          return (
            <button
              key={mod.key}
              onClick={() => onAdd(mod)}
              className={`text-left border rounded-md px-2.5 py-2 transition-colors ${meta.tile}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                <span className="text-[12px] font-bold text-gray-800 truncate">{mod.label}</span>
                {count > 0 && <span className="ml-auto text-[11px] text-gray-500">{count}</span>}
              </div>
              <p className="mt-0.5 text-[10px] text-gray-500 leading-snug line-clamp-2">{meta.blurb}</p>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                <Plus className="w-3 h-3" /> Add Product
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}