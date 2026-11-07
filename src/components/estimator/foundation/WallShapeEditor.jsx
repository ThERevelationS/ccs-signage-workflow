import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Trash2, Square } from "lucide-react";
import { foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments } from "./wallCalculator";

// Wall footprint in inches. Shape (matches SignEstimate Pro):
//   { points: [{x, z}], closed: bool, segments: [{ length }] }
const PX_PER_IN = 1.4; // canvas scale
const SNAP = 2; // snap to 2"

export function buildSegments(points, closed) {
  return foundationWallSegments(points, closed);
}

const shapeRecord = (current) =>
  current && typeof current === "object" && !Array.isArray(current) ? current : {};

const emitShape = (current, points, closed) => {
  const segments = foundationWallSegments(points, closed);
  if (!segments) return null;
  return { ...shapeRecord(current), points, closed, segments };
};

export default function WallShapeEditor({ shape, onChange }) {
  const basis = foundationWallOutlineBasis(shape);
  const points = basis.points;
  const closed = basis.closed;
  const [rect, setRect] = useState({ l: 96, w: 48 });
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gridId = `wallGrid-${uid}`;
  const rectLId = `rectL-${uid}`;
  const rectWId = `rectW-${uid}`;
  const rectErrId = `rect-err-${uid}`;

  const W = 520;
  const H = 300;
  const toPx = (p) => ({ x: p.x * PX_PER_IN + 20, y: p.z * PX_PER_IN + 20 });

  const addPoint = (e) => {
    if (closed) return;
    const box = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - box.left) * (W / box.width);
    const sy = (e.clientY - box.top) * (H / box.height);
    const x = Math.max(0, Math.round((sx - 20) / PX_PER_IN / SNAP) * SNAP);
    const z = Math.max(0, Math.round((sy - 20) / PX_PER_IN / SNAP) * SNAP);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const last = points[points.length - 1];
    if (last && last.x === x && last.z === z) return;
    const next = emitShape(shape, [...points, { x, z }], false);
    if (next) onChange(next);
  };

  const rectShape = foundationWallRectangle(rect.l, rect.w);
  const rectLBad = foundationWallRectangle(rect.l, 1) === null;
  const rectWBad = foundationWallRectangle(1, rect.w) === null;
  const setRectangle = () => {
    if (!rectShape) return;
    onChange({ ...shapeRecord(shape), ...rectShape });
  };

  const segments = Array.isArray(shape?.segments) ? shape.segments : [];
  const hasSegmentLengths = segments.length > 0;
  const legacyOnly = !basis.hasRecordedPoints && hasSegmentLengths;
  const malformedPoints = basis.hasRecordedPoints && !points.length;
  const clearable = points.length > 0 || hasSegmentLengths || shape?.points != null || shape?.segments != null;
  const perimeter = basis.perimeterInches;
  const emit = (pointsNext, closedNext) => {
    const next = emitShape(shape, pointsNext, closedNext);
    if (next) onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">
          Rect L (in)
          <Input
            type="number"
            step="any"
            className="w-24"
            value={rect.l}
            id={rectLId}
            aria-invalid={rectLBad || undefined}
            aria-describedby={rectLBad ? rectErrId : undefined}
            onChange={(e) => setRect({ ...rect, l: e.target.value })}
          />
        </label>
        <label className="text-xs text-gray-500">
          Rect W (in)
          <Input
            type="number"
            step="any"
            className="w-24"
            value={rect.w}
            id={rectWId}
            aria-invalid={rectWBad || undefined}
            aria-describedby={rectWBad ? rectErrId : undefined}
            onChange={(e) => setRect({ ...rect, w: e.target.value })}
          />
        </label>
        <Button variant="outline" size="sm" onClick={setRectangle} disabled={!rectShape}
          aria-describedby={!rectShape ? rectErrId : undefined}>
          <Square className="w-4 h-4" aria-hidden="true" /> Use rectangle
        </Button>
        {!rectShape && (
          <span role="status" id={rectErrId} className="text-xs text-amber-600">
            Rectangle dimensions must be positive finite inches; current outline is unchanged.
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={points.length < 3 || closed}
          onClick={() => emit(points, true)}
        >
          Close outline
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!points.length}
          onClick={() => emit(points.slice(0, -1), false)}
        >
          <Undo2 className="w-4 h-4" aria-hidden="true" /> Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!clearable}
          onClick={() => {
            if (!window.confirm("Clear the drawn outline?")) return;
            onChange({ ...shapeRecord(shape), points: [], closed: false, segments: [] });
          }}
        >
          <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" /> Clear
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
          <pattern id={gridId} width={12 * PX_PER_IN} height={12 * PX_PER_IN} patternUnits="userSpaceOnUse">
            <path d={`M ${12 * PX_PER_IN} 0 L 0 0 0 ${12 * PX_PER_IN}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#${gridId})`} />

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
        {hasSegmentLengths ? `${segments.length} segment${segments.length === 1 ? "" : "s"}` : "no segments"} · perimeter{" "}
        <span className="font-semibold text-gray-900">{perimeter === null ? "Unavailable" : `${Math.round(perimeter)}"`}</span>
        {closed ? " · closed" : points.length > 2 ? " · open (close it for an internal fill wall)" : ""}
      </div>
      {legacyOnly && (
        <div role="status" className="text-xs text-amber-600">
          Recorded segment lengths only — no drawable footprint. Draw or enter a rectangle to re-establish geometry.
        </div>
      )}
      {malformedPoints && (
        <div role="status" className="text-xs text-amber-600">
          Recorded footprint coordinates need repair before a preview can be drawn.
        </div>
      )}
    </div>
  );
}
