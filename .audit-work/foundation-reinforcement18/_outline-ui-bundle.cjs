var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// frozen:/app/entry.js
var entry_exports = {};
__export(entry_exports, {
  WallShapeEditor: () => WallShapeEditor,
  buildSegments: () => buildSegments,
  foundationWallOutlineBasis: () => foundationWallOutlineBasis,
  foundationWallRectangle: () => foundationWallRectangle,
  foundationWallSegments: () => foundationWallSegments
});
module.exports = __toCommonJS(entry_exports);

// frozen:/app/src/components/estimator/foundation/WallShapeEditor.jsx
var import_react = require("react");

// frozen:/app/src/components/ui/button.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var Button = ({ children, ...p }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { ...p, children });

// frozen:/app/src/components/ui/input.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var Input = ({ className, ...p }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className, ...p });

// frozen:/app/lucide-react/index.jsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var Undo2 = (p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...p });
var Trash2 = (p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...p });
var Square = (p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { ...p });

// frozen:/app/src/components/estimator/foundation/wallCalculator.js
function wallDimensionNumber(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
var wallRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var wallPoint = (point) => wallRecord(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.z === "number" && Number.isFinite(point.z);
function foundationWallSegments(points, closed = false) {
  if (!Array.isArray(points) || !points.every(wallPoint) || typeof closed !== "boolean") return null;
  const segments = [];
  const add = (a, b) => segments.push({ length: Math.hypot(b.x - a.x, b.z - a.z) });
  for (let i = 0; i < points.length - 1; i++) add(points[i], points[i + 1]);
  if (closed && points.length > 2) add(points[points.length - 1], points[0]);
  return segments.every((segment) => Number.isFinite(segment.length)) ? segments : null;
}
function foundationWallOutlineBasis(shape) {
  const result = {
    shape: null,
    points: [],
    closed: shape?.closed === true,
    hasRecordedPoints: false,
    perimeterInches: null,
    issues: []
  };
  const add = (code, message) => result.issues.push({ code, message });
  const unavailable = () => add("wall_outline_unavailable", "draw an outline with positive segment lengths before repricing");
  if (!wallRecord(shape)) {
    unavailable();
    return result;
  }
  result.hasRecordedPoints = shape.points != null && (!Array.isArray(shape.points) || shape.points.length > 0);
  const validPoints = Array.isArray(shape.points) && shape.points.every(wallPoint);
  if (validPoints) result.points = shape.points.map((point) => ({ ...point }));
  if (result.hasRecordedPoints && !validPoints) {
    add("wall_outline_points_unavailable", "repair the recorded footprint coordinates before repricing");
  }
  if ((shape.closed != null || result.hasRecordedPoints) && typeof shape.closed !== "boolean") {
    add("wall_outline_closure_unavailable", "record whether the outline is open or closed before repricing");
  }
  let segments = null;
  if (!Array.isArray(shape.segments) || !shape.segments.length) {
    unavailable();
  } else {
    const lengths = shape.segments.map((segment) => wallRecord(segment) ? wallDimensionNumber(segment.length) : null);
    if (lengths.some((length) => length === null)) {
      add("wall_outline_segment_unavailable", "record positive, finite segment lengths in inches before repricing");
    } else {
      segments = shape.segments.map((segment, index) => ({ ...segment, length: lengths[index] }));
      if (!Number.isFinite(lengths.reduce((sum, length) => sum + length, 0))) {
        add("wall_outline_length_unavailable", "record a finite outline perimeter before repricing");
      }
    }
  }
  if (segments && result.hasRecordedPoints && validPoints && typeof shape.closed === "boolean") {
    const expected = foundationWallSegments(result.points, shape.closed);
    const same = result.points.length >= (shape.closed ? 3 : 2) && expected && expected.length === segments.length && expected.every((segment, index) => {
      const stored = segments[index].length;
      const tolerance = Number.EPSILON * 8 * Math.max(1, segment.length, stored);
      return segment.length > 0 && Math.abs(segment.length - stored) <= tolerance;
    });
    if (!same) add("wall_outline_geometry_mismatch", "repair footprint points and segment lengths so they describe the same outline before repricing");
  }
  if (!result.issues.length) {
    result.shape = { ...shape, segments };
    if (validPoints) result.shape.points = result.points;
    result.perimeterInches = segments.reduce((sum, segment) => sum + segment.length, 0);
  }
  return result;
}
function foundationWallRectangle(length, width) {
  const l = wallDimensionNumber(length), w = wallDimensionNumber(width);
  if (l === null || w === null) return null;
  const points = [{ x: 0, z: 0 }, { x: l, z: 0 }, { x: l, z: w }, { x: 0, z: w }];
  return foundationWallOutlineBasis({ points, closed: true, segments: foundationWallSegments(points, true) }).shape;
}

// frozen:/app/src/components/estimator/foundation/WallShapeEditor.jsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var PX_PER_IN = 1.4;
var SNAP = 2;
function buildSegments(points, closed) {
  return foundationWallSegments(points, closed);
}
var shapeRecord = (current) => current && typeof current === "object" && !Array.isArray(current) ? current : {};
var emitShape = (current, points, closed) => {
  const segments = foundationWallSegments(points, closed);
  if (!segments) return null;
  return { ...shapeRecord(current), points, closed, segments };
};
function WallShapeEditor({ shape, onChange }) {
  const basis = foundationWallOutlineBasis(shape);
  const points = basis.points;
  const closed = basis.closed;
  const [rect, setRect] = (0, import_react.useState)({ l: 96, w: 48 });
  const uid = (0, import_react.useId)().replace(/[^a-zA-Z0-9_-]/g, "");
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex flex-wrap items-end gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "text-xs text-gray-500", children: [
        "Rect L (in)",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          Input,
          {
            type: "number",
            step: "any",
            className: "w-24",
            value: rect.l,
            id: rectLId,
            "aria-invalid": rectLBad || void 0,
            "aria-describedby": rectLBad ? rectErrId : void 0,
            onChange: (e) => setRect({ ...rect, l: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "text-xs text-gray-500", children: [
        "Rect W (in)",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          Input,
          {
            type: "number",
            step: "any",
            className: "w-24",
            value: rect.w,
            id: rectWId,
            "aria-invalid": rectWBad || void 0,
            "aria-describedby": rectWBad ? rectErrId : void 0,
            onChange: (e) => setRect({ ...rect, w: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        Button,
        {
          variant: "outline",
          size: "sm",
          onClick: setRectangle,
          disabled: !rectShape,
          "aria-describedby": !rectShape ? rectErrId : void 0,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Square, { className: "w-4 h-4", "aria-hidden": "true" }),
            " Use rectangle"
          ]
        }
      ),
      !rectShape && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { role: "status", id: rectErrId, className: "text-xs text-amber-600", children: "Rectangle dimensions must be positive finite inches; current outline is unchanged." }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        Button,
        {
          variant: "outline",
          size: "sm",
          disabled: points.length < 3 || closed,
          onClick: () => emit(points, true),
          children: "Close outline"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: !points.length,
          onClick: () => emit(points.slice(0, -1), false),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Undo2, { className: "w-4 h-4", "aria-hidden": "true" }),
            " Undo"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: !clearable,
          onClick: () => {
            if (!window.confirm("Clear the drawn outline?")) return;
            onChange({ ...shapeRecord(shape), points: [], closed: false, segments: [] });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }),
            " Clear"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "svg",
      {
        width: "100%",
        viewBox: `0 0 ${W} ${H}`,
        onClick: addPoint,
        className: "rounded-lg border border-gray-200 bg-slate-50",
        style: { cursor: closed ? "default" : "crosshair" },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pattern", { id: gridId, width: 12 * PX_PER_IN, height: 12 * PX_PER_IN, patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: `M ${12 * PX_PER_IN} 0 L 0 0 0 ${12 * PX_PER_IN}`, fill: "none", stroke: "#e2e8f0", strokeWidth: "1" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { width: W, height: H, fill: `url(#${gridId})` }),
          points.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "polyline",
            {
              points: [...points, ...closed ? [points[0]] : []].map((p) => {
                const q = toPx(p);
                return `${q.x},${q.y}`;
              }).join(" "),
              fill: closed ? "rgba(248,113,113,0.12)" : "none",
              stroke: "#ef4444",
              strokeWidth: "3"
            }
          ),
          points.map((p, i) => {
            const q = toPx(p);
            return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: q.x, cy: q.y, r: "5", fill: "#fff", stroke: "#ef4444", strokeWidth: "2" }, i);
          }),
          points.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("text", { x: "20", y: "28", fontSize: "12", fill: "#94a3b8", children: "Click to place footprint corners, or enter a rectangle above." })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "text-xs text-gray-600", children: [
      hasSegmentLengths ? `${segments.length} segment${segments.length === 1 ? "" : "s"}` : "no segments",
      " \xB7 perimeter",
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "font-semibold text-gray-900", children: perimeter === null ? "Unavailable" : `${Math.round(perimeter)}"` }),
      closed ? " \xB7 closed" : points.length > 2 ? " \xB7 open (close it for an internal fill wall)" : ""
    ] }),
    legacyOnly && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "status", className: "text-xs text-amber-600", children: "Recorded segment lengths only \u2014 no drawable footprint. Draw or enter a rectangle to re-establish geometry." }),
    malformedPoints && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "status", className: "text-xs text-amber-600", children: "Recorded footprint coordinates need repair before a preview can be drawn." })
  ] });
}
