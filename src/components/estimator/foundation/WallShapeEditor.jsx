import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Undo2, Trash2, Square } from "lucide-react";
import { foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments } from "./wallCalculator";
import { formatFoundationDimension, foundationDimensionInputIssue, parseFoundationDimension } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";

// O-093 (CMP-H02): rectangle outline entry takes feet/inches text â€” the rect
// draft stays raw local state (same as before); parsing happens at validation/
// apply time so a malformed draft disables Apply and shows the syntax hint
// instead of silently coercing. Labels/help/placeholders come from the field
// meta map (display text only â€” never stored defaults).
const rectLMeta = foundationDimensionFieldMeta("wallOutline", "rect_length");
const rectWMeta = foundationDimensionFieldMeta("wallOutline", "rect_width");

// Wall footprint in inches. Shape (matches SignEstimate Pro):
//   { points: [{x, z}], closed: bool, segments: [{ length }] }
const PX_PER_IN = 1.4; // canvas scale
const SNAP = 2; // snap to 2"

export function buildSegments(points, closed) {
  return foundationWallSegments(points, closed);
}

// O-045 (CMP-D02): advisory outline checks — duplicate-point (zero-length)
// segments and non-adjacent proper crossings. Warnings never block editing;
// the calc/pricing layer stays the fail-closed boundary on saved quantities.
export function wallShapeIssues(points, closed) {
  const issues = [];
  const pts = Array.isArray(points) ? points : [];
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  if (closed === true && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
  const fin = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
  segs.forEach(([a, b], i) => {
    if (fin(a) && fin(b) && a.x === b.x && a.z === b.z) {
      issues.push(`Segment ${i + 1} has zero length (duplicate points).`);
    }
  });
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const proper = (a, b, c, d) => {
    if (![a, b, c, d].every(fin)) return false;
    const d1 = cross(c, d, a), d2 = cross(c, d, b);
    const d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1 && closed) continue; // adjacent through closure
      if (proper(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) {
        issues.push(`Segments ${i + 1} and ${j + 1} cross each other.`);
      }
    }
  }
  return issues;
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
  // Draft defaults display in the same ft/in form the parser accepts (8'Ã—4').
  const [rect, setRect] = useState(() => ({
    l: formatFoundationDimension(96),
    w: formatFoundationDimension(48),
  }));
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

  // ft/in aware: parse the raw drafts first; validity is the parse plus the
  // canonical-inch rectangle check (positive finite inches â€” unchanged rule).
  const rectL = parseFoundationDimension(rect.l);
  const rectW = parseFoundationDimension(rect.w);
  const rectShape = rectL.ok && rectW.ok ? foundationWallRectangle(rectL.inches, rectW.inches) : null;
  const rectLBad = !rectL.ok || foundationWallRectangle(rectL.inches, 1) === null;
  const rectWBad = !rectW.ok || foundationWallRectangle(1, rectW.inches) === null;
  const rectLHint = rect.l !== "" && !rectL.ok ? foundationDimensionInputIssue(rect.l) : null;
  const rectWHint = rect.w !== "" && !rectW.ok ? foundationDimensionInputIssue(rect.w) : null;
  const setRectangle = () => {
    if (!rectShape) return;
    onChange({ ...shapeRecord(shape), ...rectShape });
  };

  // O-044 (CMP-D01): L/U monument presets — same rect drafts, canonical
  // closed outlines built from the parsed inches (never stored defaults).
  const presetOutline = (kind) => {
    if (!rectL.ok || !rectW.ok) return;
    const l = rectL.inches, w = rectW.inches;
    const hl = l / 2, hw = w / 2;
    const shapes = {
      l: [{ x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: hw }, { x: hl, z: hw }, { x: hl, z: w }, { x: 0, z: w }],
      u: [{ x: 0, z: w }, { x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: w }, { x: l - hl, z: w }, { x: l - hl, z: hw }, { x: hl, z: hw }, { x: hl, z: w }],
    };
    const pts = shapes[kind];
    if (!pts) return;
    const next = emitShape(shape, pts, true);
    if (next) onChange(next);
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
          {rectLMeta?.label ?? "Rect L (in)"}
          <Input
            type="text"
            inputMode="text"
            className="w-24"
            value={rect.l}
            id={rectLId}
            placeholder={rectLMeta?.placeholder}
            title={rectLMeta?.help}
            aria-label="Rectangle outline length (inches)"
            aria-invalid={rectLBad || undefined}
            aria-describedby={rectLBad ? rectErrId : undefined}
            onChange={(e) => setRect({ ...rect, l: e.target.value })}
          />
          {rectLHint && (
            <span role="status" className="block text-[10px] text-amber-700 mt-0.5">
              {rectLHint}
            </span>
          )}
        </label>
        <label className="text-xs text-gray-500">
          {rectWMeta?.label ?? "Rect W (in)"}
          <Input
            type="text"
            inputMode="text"
            className="w-24"
            value={rect.w}
            id={rectWId}
            placeholder={rectWMeta?.placeholder}
            title={rectWMeta?.help}
            aria-label="Rectangle outline width (inches)"
            aria-invalid={rectWBad || undefined}
            aria-describedby={rectWBad ? rectErrId : undefined}
            onChange={(e) => setRect({ ...rect, w: e.target.value })}
          />
          {rectWHint && (
            <span role="status" className="block text-[10px] text-amber-700 mt-0.5">
              {rectWHint}
            </span>
          )}
        </label>
        <Button variant="outline" size="sm" onClick={setRectangle} disabled={!rectShape}
          aria-describedby={!rectShape ? rectErrId : undefined}>
          <Square className="w-4 h-4" aria-hidden="true" /> Use rectangle
        </Button>
        <Button variant="outline" size="sm" onClick={() => presetOutline("l")} disabled={!rectShape}>
          L shape
        </Button>
        <Button variant="outline" size="sm" onClick={() => presetOutline("u")} disabled={!rectShape}>
          U shape
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

      {wallShapeIssues(points, closed).map((msg) => (
        <div key={msg} role="status" className="text-xs text-amber-600">{msg}</div>
      ))}
      <div className="text-xs text-gray-600">
        {hasSegmentLengths ? `${segments.length} segment${segments.length === 1 ? "" : "s"}` : "no segments"} Â· perimeter{" "}
        <span className="font-semibold text-gray-900">{perimeter === null ? "Unavailable" : `${Math.round(perimeter)}"`}</span>
        {closed ? " Â· closed" : points.length > 2 ? " Â· open (close it for an internal fill wall)" : ""}
      </div>
      {legacyOnly && (
        <div role="status" className="text-xs text-amber-600">
          Recorded segment lengths only â€” no drawable footprint. Draw or enter a rectangle to re-establish geometry.
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