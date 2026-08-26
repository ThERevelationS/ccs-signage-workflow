import React, { useRef, useState } from "react";
import { Move, ZoomIn, ZoomOut } from "lucide-react";

const CANVAS_INCHES = 480; // 40 ft of site shown across the canvas

export default function FoundationLayoutCanvas({ items = [], poles = [], onMoveItem }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [dragIndex, setDragIndex] = useState(null);

  const toInches = (e) => {
    const rect = boxRef.current.getBoundingClientRect();
    const scale = CANVAS_INCHES / (rect.width * zoom);
    return {
      x_inches: Math.round((e.clientX - rect.left) * scale),
      z_inches: Math.round((e.clientY - rect.top) * scale),
    };
  };

  const pct = (inches) => `${(inches / CANVAS_INCHES) * 100}%`;

  return (
    <div className="bg-white rounded-sm border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Layout Canvas</h3>
          <p className="text-[11px] text-gray-400">Drag foundations to position them on the site.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-600">
          <span className="flex items-center gap-1">
            <Move className="w-3 h-3" /> Move Foundation
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
            className="w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-sm border border-gray-300 bg-gray-50">
        <div
          ref={boxRef}
          onMouseMove={(e) => {
            if (dragIndex === null) return;
            onMoveItem(dragIndex, toInches(e));
          }}
          onMouseUp={() => setDragIndex(null)}
          onMouseLeave={() => setDragIndex(null)}
          className="relative aspect-[3/2] select-none"
          style={{
            width: `${zoom * 100}%`,
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "8.333% 12.5%",
          }}
        >
          {items.map((item, index) => {
            const w = item.foundation_type === "pillar" ? item.diameter || 24 : item.length_inches || 36;
            const d = item.foundation_type === "pillar" ? item.diameter || 24 : item.width_inches || 36;
            return (
              <div
                key={index}
                onMouseDown={() => setDragIndex(index)}
                className={`absolute flex items-center justify-center cursor-move border-2 border-dashed border-amber-500 bg-amber-100/70 text-[10px] font-semibold text-amber-800 ${
                  item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"
                }`}
                style={{
                  left: pct(item.x_inches || 0),
                  top: pct(item.z_inches || 0),
                  width: pct(w),
                  height: pct(d),
                  transform: `rotate(${item.rotation_degrees || 0}deg)`,
                }}
                title={`Foundation ${index + 1}`}
              >
                Foundation {index + 1}
              </div>
            );
          })}

          {poles.map((pole, index) => (
            <div
              key={`pole-${index}`}
              className="absolute w-2.5 h-2.5 rounded-full bg-slate-700 border border-white"
              style={{ left: pct(pole.x_inches || 0), top: pct(pole.z_inches || 0) }}
              title={`Pole ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}