import React from "react";
import { Type, Layers, Wrench, Paintbrush, Zap, Cpu, Hammer, Sticker } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

const META = {
  channel_letters: { icon: Type, color: "text-orange-500", blurb: "Letter purchases, install labor, crew, equipment & travel" },
  foundation: { icon: Layers, color: "text-amber-600", blurb: "Foundations, excavation, walls, poles & site landscaping" },
  maintenance: { icon: Wrench, color: "text-teal-600", blurb: "Service calls, repairs, retrofits, crew & travel" },
  paint: { icon: Paintbrush, color: "text-blue-500", blurb: "Paint masking, liquid paint, supplies & labor" },
  laser: { icon: Zap, color: "text-pink-500", blurb: "Laser machine time, supplies & labor" },
  cnc: { icon: Cpu, color: "text-lime-600", blurb: "CNC machine time & labor" },
  metal: { icon: Hammer, color: "text-red-500", blurb: "Material, fabrication, welding & finishing" },
  brick_stone: { icon: Layers, color: "text-stone-500", blurb: "Brick, stone, mortar & masonry labor" },
  vinyl: { icon: Sticker, color: "text-indigo-500", blurb: "Vinyl cutting, printing, lamination workflows" },
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
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {ESTIMATOR_MODULES.map((mod) => {
          const meta = META[mod.key] || { icon: Layers, color: "text-gray-500", blurb: "" };
          const Icon = meta.icon;
          const count = counts[mod.key] || 0;
          return (
            <div key={mod.key} className="border border-gray-200 rounded-md px-3 py-2 bg-white hover:border-red-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                  <span className="text-[12px] font-bold text-gray-800 truncate">{mod.label}</span>
                </div>
                {count > 0 && <span className="text-[11px] text-gray-400">{count}</span>}
              </div>
              <p className="mt-1 text-[10px] text-gray-400 leading-snug">{meta.blurb}</p>
              <button
                onClick={() => onAdd(mod)}
                className="mt-2 text-[11px] font-semibold text-red-600 hover:text-red-700"
              >
                + Add Product
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}