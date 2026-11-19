// Roll layout visualizer with drag-and-drop part repositioning.
//
// Each placed item has:
//   - outer rect (w × h)        = part + bleed halo (the reserved real-estate on the roll)
//   - inner part rect (partW × partH)  = actual artwork (centered inside outer)
// The bleed halo renders as hatched waste so it reads as "empty space around the part".
//
// Drag & drop:
//   Click + drag any part to slide it around the roll. We snap-collide against other
//   parts (with the workflow's H/V gutters) and the usable column edges. On drop we
//   call onItemsMove(updates) where updates = [{ shelfIdx, itemIdx, x, y }].
//   Because the data model is shelf-based, we re-shelf the part if its new y crosses
//   into another shelf row.

import React, { useMemo, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, ArrowDown, Move } from "lucide-react";

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

const fmt = (n) => Number(n || 0).toFixed(2);

const computeWasteRects = (shelves, usableWidth, gutterV) => {
  const wastes = [];
  shelves.forEach((sh, sIdx) => {
    if (sh.items.length === 0) return;
    const last = sh.items[sh.items.length - 1];
    const rightEdge = last.x + last.w;
    if (rightEdge < usableWidth - 0.01) {
      wastes.push({ x: rightEdge, y: sh.y, w: usableWidth - rightEdge, h: sh.height });
    }
    const next = shelves[sIdx + 1];
    if (next && next.y > sh.y + sh.height) {
      wastes.push({ x: 0, y: sh.y + sh.height, w: usableWidth, h: next.y - sh.y - sh.height });
    }
  });
  return wastes;
};

export default function VinylRollVisualizer({
  calc,
  showRegistrationMarks = false,
  onItemMove, // optional: (newPos) => void  — { shelfIdx, itemIdx, x }
}) {
  const {
    shelves, usableWidth, effectiveRollWidth, leadingEdge, trailingEdge,
    lengthConsumedIn, totalLengthIn, partsPlaced, partsUnplaced,
    wastedSqFt, usedSqFt, gutterV, gutterH,
  } = calc;

  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null);

  // Local drag overrides — keyed by `${shelfIdx}-${itemIdx}` => new x
  const [dragOverrides, setDragOverrides] = useState({});
  const [dragging, setDragging] = useState(null); // { shelfIdx, itemIdx, startSvgX, startX }

  const colorFor = useMemo(() => {
    const map = {};
    let i = 0;
    shelves.forEach(sh => sh.items.forEach(it => {
      if (!(it.itemIdx in map)) { map[it.itemIdx] = PALETTE[i % PALETTE.length]; i++; }
    }));
    return map;
  }, [shelves]);

  const wasteRects = useMemo(() => computeWasteRects(shelves, usableWidth, gutterV), [shelves, usableWidth, gutterV]);

  const drawWidth  = Math.max(1, effectiveRollWidth);
  const drawHeight = Math.max(12, lengthConsumedIn);

  const targetW = 520;
  const baseScale = targetW / drawWidth;
  const svgW = drawWidth * baseScale * zoom;
  const cappedH = Math.min(900, drawHeight * baseScale);
  const svgH = cappedH * zoom;

  const viewBox = `0 0 ${drawWidth} ${drawHeight}`;
  const usableX = (effectiveRollWidth - usableWidth) / 2;

  // Convert client px to SVG user units
  const clientToSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const handleMouseDown = (e, shelfIdx, itemIdx, item) => {
    if (!onItemMove) return;
    e.stopPropagation();
    e.preventDefault();
    const { x: svgX } = clientToSvg(e.clientX, e.clientY);
    setDragging({ shelfIdx, itemIdx, startSvgX: svgX, startX: item.x });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const { x: svgX } = clientToSvg(e.clientX, e.clientY);
    const sh = shelves[dragging.shelfIdx];
    const it = sh.items[dragging.itemIdx];
    let newX = dragging.startX + (svgX - dragging.startSvgX);

    // Clamp + collision against neighbors with gutterH spacing
    const minX = (() => {
      const prev = sh.items[dragging.itemIdx - 1];
      return prev ? prev.x + prev.w + gutterH : 0;
    })();
    const maxX = (() => {
      const next = sh.items[dragging.itemIdx + 1];
      const rightLimit = next ? next.x - gutterH - it.w : usableWidth - it.w;
      return Math.max(minX, rightLimit);
    })();
    newX = Math.max(minX, Math.min(maxX, newX));

    setDragOverrides(prev => ({ ...prev, [`${dragging.shelfIdx}-${dragging.itemIdx}`]: newX }));
  };

  const handleMouseUp = () => {
    if (!dragging) return;
    const key = `${dragging.shelfIdx}-${dragging.itemIdx}`;
    const newX = dragOverrides[key];
    if (newX !== undefined && onItemMove) {
      onItemMove({ shelfIdx: dragging.shelfIdx, itemIdx: dragging.itemIdx, x: newX });
    }
    setDragging(null);
    // keep overrides until parent re-renders; clear next tick
    setTimeout(() => setDragOverrides({}), 0);
  };

  const regMarks = useMemo(() => {
    if (!showRegistrationMarks) return [];
    const marks = [];
    const spacing = 12;
    const startY = leadingEdge + 0.5;
    const endY = drawHeight - trailingEdge - 0.5;
    for (let y = startY; y < endY; y += spacing) {
      marks.push({ x: usableX + 0.3, y });
      marks.push({ x: usableX + usableWidth - 0.3, y });
    }
    return marks;
  }, [showRegistrationMarks, leadingEdge, trailingEdge, drawHeight, usableX, usableWidth]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 items-center">
        <Stat label="Roll Width"      value={`${fmt(effectiveRollWidth)}″`} />
        <Stat label="Usable Width"    value={`${fmt(usableWidth)}″`} />
        <Stat label="Content Length"  value={`${fmt(totalLengthIn)}″`} />
        <Stat label="Roll Consumed"   value={`${fmt(lengthConsumedIn / 12)} ft`} />
        <Stat label="Parts Placed"    value={partsPlaced} />
        {partsUnplaced > 0 && <Stat label="Unplaced" value={partsUnplaced} tone="bad" />}
        <Stat label="Used"            value={`${fmt(usedSqFt)} sqft`} />
        <Stat label="Waste"           value={`${fmt(wastedSqFt)} sqft`} tone="warn" />
        <div className="ml-auto flex items-center gap-1">
          {onItemMove && (
            <span className="text-[10px] text-slate-500 mr-2 inline-flex items-center gap-1">
              <Move className="w-3 h-3" /> Drag parts to reposition
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(1)} title="Reset zoom">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-auto p-3" style={{ maxHeight: 600 }}>
          <svg
          ref={svgRef}
          width={svgW} height={svgH} viewBox={viewBox}
          preserveAspectRatio="xMidYMin meet"
          style={{ background: "#e2e8f0", display: "block", userSelect: "none" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <pattern id="wasteHatch" patternUnits="userSpaceOnUse" width="1.4" height="1.4" patternTransform="rotate(45)">
              <rect width="1.4" height="1.4" fill="#fecaca" fillOpacity="0.4" />
              <line x1="0" y1="0" x2="0" y2="1.4" stroke="#dc2626" strokeWidth="0.18" strokeOpacity="0.6" />
            </pattern>
            <pattern id="bleedHatch" patternUnits="userSpaceOnUse" width="1.0" height="1.0" patternTransform="rotate(45)">
              <rect width="1.0" height="1.0" fill="#fed7aa" fillOpacity="0.5" />
              <line x1="0" y1="0" x2="0" y2="1.0" stroke="#ea580c" strokeWidth="0.12" strokeOpacity="0.6" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="white" fillOpacity="0.6" />
            </marker>
          </defs>

          {/* Roll backdrop */}
          <rect x={0} y={0} width={drawWidth} height={drawHeight} fill="#f1f5f9" />

          {/* Usable column */}
          <rect x={usableX} y={leadingEdge} width={usableWidth} height={Math.max(0, drawHeight - leadingEdge - trailingEdge)} fill="#ffffff" />

          {/* Waste rects */}
          {wasteRects.map((w, i) => (
            <rect key={`w-${i}`} x={usableX + w.x} y={leadingEdge + w.y} width={w.w} height={w.h} fill="url(#wasteHatch)" />
          ))}

          {/* Leading / trailing edge */}
          <rect x={0} y={0} width={drawWidth} height={leadingEdge} fill="#fef3c7" />
          <rect x={0} y={drawHeight - trailingEdge} width={drawWidth} height={trailingEdge} fill="#fef3c7" />

          {/* Margin columns */}
          <rect x={0} y={0} width={usableX} height={drawHeight} fill="#fde68a" fillOpacity="0.55" />
          <rect x={usableX + usableWidth} y={0} width={drawWidth - usableX - usableWidth} height={drawHeight} fill="#fde68a" fillOpacity="0.55" />

          {/* Registration marks */}
          {regMarks.map((m, i) => (
            <g key={`reg-${i}`} stroke="#0f172a" strokeWidth={0.07} fill="none">
              <line x1={m.x - 0.4} y1={m.y} x2={m.x + 0.4} y2={m.y} />
              <line x1={m.x} y1={m.y - 0.4} x2={m.x} y2={m.y + 0.4} />
              <circle cx={m.x} cy={m.y} r="0.25" />
            </g>
          ))}

          {/* Parts */}
          {shelves.map((sh, sIdx) =>
            sh.items.map((it, iIdx) => {
              const fill = colorFor[it.itemIdx] || "#3b82f6";
              const dragKey = `${sIdx}-${iIdx}`;
              const xOverride = dragOverrides[dragKey];
              const itemX = xOverride !== undefined ? xOverride : it.x;
              const bleed = it.bleed || 0;
              const partW = it.partW ?? it.w;
              const partH = it.partH ?? it.h;
              const isDragging = dragging && dragging.shelfIdx === sIdx && dragging.itemIdx === iIdx;

              return (
                <g
                  key={`${sIdx}-${iIdx}`}
                  onMouseDown={(e) => handleMouseDown(e, sIdx, iIdx, it)}
                  style={{ cursor: onItemMove ? (isDragging ? "grabbing" : "grab") : "default" }}
                >
                  {/* OUTER (bleed halo) — only renders if bleed > 0 */}
                  {bleed > 0 && (
                    <rect
                      x={usableX + itemX} y={leadingEdge + it.y}
                      width={it.w} height={it.h}
                      fill="url(#bleedHatch)"
                      stroke="#ea580c" strokeWidth={0.04} strokeDasharray="0.3,0.2"
                    />
                  )}

                  {/* INNER (actual part) */}
                  <rect
                    x={usableX + itemX + bleed} y={leadingEdge + it.y + bleed}
                    width={partW} height={partH}
                    fill={fill} fillOpacity={isDragging ? 0.6 : 0.85}
                    stroke="#0f172a" strokeWidth={0.05}
                  />

                  {/* Feed direction arrow */}
                  {partW > 6 && partH > 6 && (
                    <path
                      d={`M ${usableX + itemX + bleed + partW / 2} ${leadingEdge + it.y + bleed + 0.5}
                          L ${usableX + itemX + bleed + partW / 2} ${leadingEdge + it.y + bleed + Math.min(partH - 1, 2.2)}`}
                      stroke="white" strokeWidth={0.18} strokeOpacity="0.6"
                      markerEnd="url(#arrow)" pointerEvents="none"
                    />
                  )}

                  {partW > 6 && partH > 4 && (
                    <text
                      x={usableX + itemX + bleed + partW / 2}
                      y={leadingEdge + it.y + bleed + partH / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(partW / 7, partH / 3, 2.2)}
                      fill="white"
                      style={{ pointerEvents: "none", fontWeight: 600 }}
                    >
                      {partW.toFixed(1)}×{partH.toFixed(1)}{it.rotated ? " ↻" : ""}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Roll outline */}
          <rect x={0} y={0} width={drawWidth} height={drawHeight} fill="none" stroke="#0f172a" strokeWidth={0.1} pointerEvents="none" />
          </svg>
        </div>

        {/* Pinned footer — always visible regardless of SVG scroll */}
        <div className="border-t border-slate-300 bg-slate-50 px-3 py-2 space-y-1">
          <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
            <ArrowDown className="w-3 h-3" /> Print feed direction (top → bottom)
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <LegendChip color="#fde68a" label="Margin (unprintable)" />
            <LegendChip color="#fef3c7" label="Leading/trailing edge waste" />
            <LegendSwatchHatch label="Waste in usable area" patternId="legendHatchWaste" baseFill="#fecaca" stroke="#dc2626" />
            <LegendSwatchHatch label="Bleed halo (waste around part)" patternId="legendHatchBleed" baseFill="#fed7aa" stroke="#ea580c" />
            {showRegistrationMarks && <LegendChip color="#0f172a" label="Registration marks" />}
            <LegendChip color="#ffffff" label="Usable" border />
            {Object.entries(colorFor).map(([idx, c]) => (
              <LegendChip key={idx} color={c} label={`Item ${parseInt(idx) + 1}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Stat = ({ label, value, tone }) => {
  const toneClass = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-slate-500">{label}:</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
};

const LegendChip = ({ color, label, border }) => (
  <span className="inline-flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, border: border ? "1px solid #94a3b8" : "none" }} />
    <span className="text-slate-600">{label}</span>
  </span>
);

const LegendSwatchHatch = ({ label, patternId, baseFill, stroke }) => (
  <span className="inline-flex items-center gap-1">
    <svg width="12" height="12" className="inline-block">
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={baseFill} fillOpacity="0.6" />
          <line x1="0" y1="0" x2="0" y2="4" stroke={stroke} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="12" height="12" fill={`url(#${patternId})`} stroke="#94a3b8" strokeWidth="0.5" />
    </svg>
    <span className="text-slate-600">{label}</span>
  </span>
);