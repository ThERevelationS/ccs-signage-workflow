import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Trash2, Square } from "lucide-react";

// Wall footprint in inches. Shape shape (matches SignEstimate Pro):
//   { points: [{x, z}], closed: bool, segments: [{ length }] }
const PX_PER_IN = 1.4; // canvas scale
const SNAP = 2; // snap to 2"

export function buildSegments(points, closed) {
  const segs = [];
  const len = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  for (let i = 0; i < points.length - 1; i++) segs.push({ length: len(points[i], points[i + 1]) });
  if (closed && points.length > 2) segs.push({ length: len(points[points.length - 1], points[0]) });
  return segs;
}

const makeShape = (points, closed) => ({ points, closed, segments: buildSegments(points, closed) });

export default function WallShapeEditor({ shape, onChange }) {
  const points = shape?.points || [];
  const closed = shape?.closed === true;
  const [rect, setRect] = useState({ l: 96, w: 48 });

  const W = 520;
  const H = 300;
  const toPx = (p) => ({ x: p.x * PX_PER_IN + 20, y: p.z * PX_PER_IN + 20 });

  const addPoint = (e) => {
    if (closed) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - box.left - 20) / PX_PER_IN / SNAP) * SNAP;
    const z = Math.round((e.clientY - box.top - 20) / PX_PER_IN / SNAP) * SNAP;
    onChange(makeShape([...points, { x: Math.max(0, x), z: Math.max(0, z) }], false));
  };

  const setRectangle = () => {
    const l = Math.max(1, Number(rect.l) || 0);
    const w = Math.max(1, Number(rect.w) || 0);
    onChange(makeShape([{ x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: w }, { x: 0, z: w }], true));
  };

  const segments = shape?.segments || [];
  const perimeter = segments.reduce((s, seg) => s + seg.length, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">
          Rect L (in)
          <Input
            type="number"
            className="w-24"
            value={rect.l}
            onChange={(e) => setRect({ ...rect, l: e.target.value })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Rect W (in)
          <Input
            type="number"
            className="w-24"
            value={rect.w}
            onChange={(e) => setRect({ ...rect, w: e.target.value })}
          />
        </label>
        <Button variant="outline" size="sm" onClick={setRectangle}>
          <Square className="w-4 h-4" /> Use rectangle
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={points.length < 3 || closed}
          onClick={() => onChange(makeShape(points, true))}
        >
          Close outline
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!points.length}
          onClick={() => onChange(makeShape(points.slice(0, -1), false))}
        >
          <Undo2 className="w-4 h-4" /> Undo
        </Button>
        <Button variant="ghost" size="sm" disabled={!points.length} onClick={() => onChange(makeShape([], false))}>
          <Trash2 className="w-4 h-4 text-red-500" /> Clear
        </Button>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        onClick={addPoint}
        className="rounded-lg border border-gray-200 bg-slate-50"
        style={{ cursor: closed ? "default" : "crosshair" }}
      >
        <defs>
          <pattern id="wallGrid" width={12 * PX_PER_IN} height={12 * PX_PER_IN} patternUnits="userSpaceOnUse">
            <path d={`M ${12 * PX_PER_IN} 0 L 0 0 0 ${12 * PX_PER_IN}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#wallGrid)" />

        {points.length > 1 && (
          <polyline
            points={[...points, ...(closed ? [points[0]] : [])].map((p) => {
              const q = toPx(p);
              return `${q.x},${q.y}`;
            }).join(" ")}
            fill={closed ? "rgba(248,113,113,0.12)" : "none"}
            stroke="#ef4444"
            strokeWidth="3"
          />
        )}

        {points.map((p, i) => {
          const q = toPx(p);
          return <circle key={i} cx={q.x} cy={q.y} r="5" fill="#fff" stroke="#ef4444" strokeWidth="2" />;
        })}

        {points.length === 0 && (
          <text x="20" y="28" fontSize="12" fill="#94a3b8">
            Click to place footprint corners, or enter a rectangle above.
          </text>
        )}
      </svg>

      <div className="text-xs text-gray-600">
        {segments.length} segment{segments.length === 1 ? "" : "s"} · perimeter{" "}
        <span className="font-semibold text-gray-900">{Math.round(perimeter)}"</span>
        {closed ? " · closed" : points.length > 2 ? " · open (close it for an internal fill wall)" : ""}
      </div>
    </div>
  );
}