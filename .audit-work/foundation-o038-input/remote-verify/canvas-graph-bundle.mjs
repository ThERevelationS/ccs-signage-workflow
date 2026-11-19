// FoundationLayoutCanvas.jsx
import { useEffect, useRef, useState } from "react";
import { Move, ZoomIn, ZoomOut } from "lucide-react";

// foundationSceneTransforms.js
var INCHES_PER_FOOT = 12;
var PLAN_TO_WORLD_SCALE = 1 / INCHES_PER_FOOT;
var DEFAULT_PLAN_EXTENT = Object.freeze({ width: 480, depth: 320 });
var DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.5, max: 2 });
var fin = (v) => typeof v === "number" && Number.isFinite(v);
var DEG_TO_RAD = Math.PI / 180;
var validExtent = (extent) => !!extent && fin(extent.width) && fin(extent.depth) && extent.width > 0 && extent.depth > 0;
var resolveExtent = (extent) => validExtent(extent) ? extent : DEFAULT_PLAN_EXTENT;
function planViewFromElementRect(rect, extent = DEFAULT_PLAN_EXTENT) {
  if (!rect || !fin(rect.left) || !fin(rect.top) || !fin(rect.width) || !fin(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ex = resolveExtent(extent);
  if (!validExtent(ex)) return null;
  return {
    originX: rect.left,
    originY: rect.top,
    scaleX: rect.width / ex.width,
    scaleY: rect.height / ex.depth,
    extent: { width: ex.width, depth: ex.depth }
  };
}
var validView = (view) => !!view && fin(view.originX) && fin(view.originY) && fin(view.scaleX) && fin(view.scaleY) && view.scaleX !== 0 && view.scaleY !== 0;
function screenToPlan(view, screenX, screenY) {
  if (!fin(screenX) || !fin(screenY)) return null;
  if (!validView(view)) return null;
  return {
    x_inches: (screenX - view.originX) / view.scaleX,
    z_inches: (screenY - view.originY) / view.scaleY
  };
}
function planPointOf(point) {
  if (!point || typeof point !== "object") return null;
  const x = fin(point.x) ? point.x : fin(point.x_inches) ? point.x_inches : null;
  const z = fin(point.z) ? point.z : fin(point.z_inches) ? point.z_inches : null;
  if (x === null || z === null) return null;
  return { x, z };
}

// foundationLayoutModel.js
var FOUNDATION_LAYOUT_WIDTH_INCHES = 480;
var FOUNDATION_LAYOUT_DEPTH_INCHES = 320;
var finiteNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
function layoutPointInches(clientX, clientY, rect) {
  const view = planViewFromElementRect(rect, {
    width: FOUNDATION_LAYOUT_WIDTH_INCHES,
    depth: FOUNDATION_LAYOUT_DEPTH_INCHES
  });
  return screenToPlan(view, clientX, clientY);
}
function foundationLayoutFootprint(item) {
  if (!item || typeof item !== "object") return null;
  const w = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.length_inches);
  const d = item.foundation_type === "pillar" ? finiteNumber(item.diameter) : finiteNumber(item.width_inches);
  if (w === null || d === null || w <= 0 || d <= 0) return null;
  return { width: w, depth: d };
}
function layoutPositionInches(item) {
  if (!item || typeof item !== "object") return { valid: false, x_inches: 0, z_inches: 0 };
  const read = (v) => {
    if (v === void 0 || v === null) return 0;
    return finiteNumber(v);
  };
  const x = read(item.x_inches);
  const z = read(item.z_inches);
  if (x === null || z === null) return { valid: false, x_inches: 0, z_inches: 0 };
  return { valid: true, x_inches: x, z_inches: z };
}
function layoutItemKey(item, index) {
  if (item?.component_id) return `component:${item.component_id}`;
  if (item?.id !== void 0 && item?.id !== null) return `legacy:${item.id}`;
  return `index:${index}`;
}
function layoutItemFingerprint(item) {
  if (!item || typeof item !== "object") return null;
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  return JSON.stringify({
    v: pos.valid,
    t: item.foundation_type || null,
    x: pos.x_inches,
    z: pos.z_inches,
    w: fp?.width ?? null,
    d: fp?.depth ?? null,
    r: item.rotation_degrees ?? null
  });
}

// foundationSceneInput.js
var fin2 = (v) => typeof v === "number" && Number.isFinite(v);
var PLAN_EXTENT = Object.freeze({
  width: FOUNDATION_LAYOUT_WIDTH_INCHES,
  depth: FOUNDATION_LAYOUT_DEPTH_INCHES
});
var DEFAULT_HIT_TOLERANCES = Object.freeze({
  edgeInches: 3,
  vertexInches: 4,
  poleInches: 4
});
function beginSceneDrag({ pointerId, key, identityKind, legacyIndex, count, corner, grabPoint, fingerprint } = {}) {
  const c = planPointOf(corner);
  const g = planPointOf(grabPoint);
  if (!c || !g) return null;
  return {
    pointerId,
    key,
    identityKind,
    legacyIndex,
    count,
    corner: { x: c.x, z: c.z },
    grab: { dx: g.x - c.x, dz: g.z - c.z },
    fingerprint,
    moved: false
  };
}
function sceneDragCorner(drag, planPoint) {
  const p = planPointOf(planPoint);
  if (!drag || !p || !fin2(drag?.grab?.dx) || !fin2(drag?.grab?.dz)) return null;
  return { x: p.x - drag.grab.dx, z: p.z - drag.grab.dz };
}
function commitSceneDrag(drag, releasePlanPoint) {
  const raw = sceneDragCorner(drag, releasePlanPoint);
  if (!raw || !drag || !fin2(drag?.corner?.x) || !fin2(drag?.corner?.z)) return null;
  if (raw.x === drag.corner.x && raw.z === drag.corner.z) return null;
  const roundX = Math.round(raw.x);
  const roundZ = Math.round(raw.z);
  if (roundX === drag.corner.x && roundZ === drag.corner.z) return null;
  return { x_inches: roundX, z_inches: roundZ };
}
function resolveSceneDragTarget(drag, items, { keyOf = layoutItemKey, fingerprintOf = layoutItemFingerprint } = {}) {
  if (!drag || !Array.isArray(items)) return null;
  let index;
  if (drag.identityKind === "index") {
    index = items.length === drag.count ? drag.legacyIndex : -1;
  } else {
    index = items.findIndex((it, i) => keyOf(it, i) === drag.key);
  }
  if (typeof index !== "number" || index < 0 || index >= items.length) return null;
  const item = items[index];
  if (fingerprintOf(item) !== drag.fingerprint) return null;
  return { index, item };
}
var SCENE_KEYBOARD_STEP_INCHES = 1;
var SCENE_KEYBOARD_BIG_STEP_INCHES = 12;
function keyboardNudge(event, { step = SCENE_KEYBOARD_STEP_INCHES, bigStep = SCENE_KEYBOARD_BIG_STEP_INCHES } = {}) {
  if (!event || typeof event !== "object") return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const s = event.shiftKey ? bigStep : step;
  const dirs = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const d = dirs[event.key];
  if (!d) return null;
  return { dx: d[0], dz: d[1] };
}
function nudgePatch(position, delta) {
  const pos = planPointOf(position);
  if (!pos || !delta || !fin2(delta.dx) || !fin2(delta.dz)) return null;
  return { x_inches: pos.x + delta.dx, z_inches: pos.z + delta.dz };
}

// FoundationLayoutCanvas.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function FoundationLayoutCanvas({ items = [], poles = [], onMoveItem }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const editable = typeof onMoveItem === "function";
  const pctW = (inches) => `${inches / FOUNDATION_LAYOUT_WIDTH_INCHES * 100}%`;
  const pctD = (inches) => `${inches / FOUNDATION_LAYOUT_DEPTH_INCHES * 100}%`;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dragRef.current = null;
    };
  }, []);
  const cancelDrag = (e) => {
    if (e?.pointerId !== void 0 && dragRef.current && e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    setPreview(null);
  };
  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || !editable || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current) return;
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const point = layoutPointInches(e.clientX, e.clientY, rect);
    if (!point) return;
    const key = layoutItemKey(item, index);
    const [kind] = key.split(":");
    dragRef.current = beginSceneDrag({
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      corner: { x: pos.x_inches, z: pos.z_inches },
      grabPoint: point,
      fingerprint: layoutItemFingerprint(item)
    });
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch {
      cancelDrag();
      return;
    }
    setPreview({ key, x: pos.x_inches, z: pos.z_inches });
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    d.moved = true;
    d.last = sceneDragCorner(d, point);
    setPreview({ key: d.key, x: d.last.x, z: d.last.z });
  };
  const commitDrag = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    try {
      boxRef.current?.releasePointerCapture(e.pointerId);
    } catch {
    }
    setPreview(null);
    if (!mountedRef.current) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    const patch = commitSceneDrag(d, point);
    if (!patch) return;
    const target = resolveSceneDragTarget(d, items);
    if (!target) return;
    if (typeof onMoveItem !== "function") return;
    onMoveItem(target.index, patch);
  };
  const onKeyDown = (e, item, index) => {
    if (!mountedRef.current || !editable) return;
    const delta = keyboardNudge(e);
    if (!delta) return;
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
    e.preventDefault();
    onMoveItem(index, nudgePatch(pos, delta));
  };
  const invalidNotes = items.map((item, index) => ({ item, index })).filter(({ item }) => !foundationLayoutFootprint(item) || !layoutPositionInches(item).valid);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-sm border border-gray-200 p-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-[13px] font-bold text-gray-900", children: "Layout Canvas" }),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-400", children: editable ? "Drag a foundation, or focus it and use arrow keys (Shift for larger steps)." : "Foundation positions (read-only)." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap text-[11px] text-gray-600", children: [
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsx(Move, { className: "w-3 h-3", "aria-hidden": "true" }),
          " Move Foundation"
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-gray-400", children: "40ft \xD7 26ft 8in" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2))),
            "aria-label": "Zoom layout out",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx(ZoomOut, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ jsxs("span", { className: "w-10 text-center", children: [
          Math.round(zoom * 100),
          "%"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2))),
            "aria-label": "Zoom layout in",
            className: "w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50",
            children: /* @__PURE__ */ jsx(ZoomIn, { className: "w-3 h-3", "aria-hidden": "true" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "overflow-auto rounded-sm border border-gray-300 bg-gray-50", children: /* @__PURE__ */ jsxs(
      "div",
      {
        ref: boxRef,
        onPointerMove,
        onPointerUp: commitDrag,
        onPointerCancel: cancelDrag,
        onLostPointerCapture: (e) => cancelDrag(e),
        className: "relative aspect-[3/2] select-none",
        style: {
          width: `${zoom * 100}%`,
          backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "8.333% 12.5%"
        },
        children: [
          items.map((item, index) => {
            const fp = foundationLayoutFootprint(item);
            const pos = layoutPositionInches(item);
            if (!fp || !pos.valid) return null;
            const key = layoutItemKey(item, index);
            const shown = preview && preview.key === key ? { x_inches: preview.x, z_inches: preview.z } : pos;
            return /* @__PURE__ */ jsxs(
              "div",
              {
                role: editable ? "button" : void 0,
                tabIndex: editable ? 0 : void 0,
                "aria-label": editable ? `Move Foundation ${index + 1}` : void 0,
                onPointerDown: editable ? (e) => onPointerDown(e, item, index) : void 0,
                onKeyDown: editable ? (e) => onKeyDown(e, item, index) : void 0,
                className: `absolute flex items-center justify-center border-2 border-dashed border-amber-500 bg-amber-100/70 text-[10px] font-semibold text-amber-800 ${editable ? "cursor-move" : ""} ${item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"}`,
                style: {
                  left: pctW(shown.x_inches),
                  top: pctD(shown.z_inches),
                  width: pctW(fp.width),
                  height: pctD(fp.depth),
                  transform: `rotate(${item.rotation_degrees || 0}deg)`,
                  touchAction: editable ? "none" : void 0
                },
                title: `Foundation ${index + 1}`,
                children: [
                  "Foundation ",
                  index + 1
                ]
              },
              key
            );
          }),
          preview && /* @__PURE__ */ jsx("div", { className: "absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800", style: { pointerEvents: "none" }, children: "Move preview - release to apply" }),
          poles.map((pole, index) => /* @__PURE__ */ jsx(
            "div",
            {
              className: "absolute w-2.5 h-2.5 rounded-full bg-slate-700 border border-white",
              style: {
                left: pctW(pole.x_inches || 0),
                top: pctD(pole.z_inches || 0),
                transform: "translate(-50%,-50%)",
                pointerEvents: "none"
              },
              title: `Pole ${index + 1}`
            },
            layoutItemKey(pole, index)
          ))
        ]
      }
    ) }),
    invalidNotes.map(({ index }) => /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[11px] text-amber-700", children: [
      "Foundation ",
      index + 1,
      " needs valid dimensions/coordinates before placement."
    ] }, index))
  ] });
}
export {
  FoundationLayoutCanvas as default
};
