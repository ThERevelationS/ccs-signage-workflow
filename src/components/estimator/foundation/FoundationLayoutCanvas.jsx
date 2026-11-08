import { useEffect, useRef, useState } from "react";
import { Move, ZoomIn, ZoomOut } from "lucide-react";
import {
  FOUNDATION_LAYOUT_WIDTH_INCHES,
  FOUNDATION_LAYOUT_DEPTH_INCHES,
  layoutPointInches,
  foundationLayoutFootprint,
  layoutPositionInches,
  layoutItemKey,
  layoutItemFingerprint,
} from "./foundationLayoutModel";
import {
  beginSceneDrag,
  sceneDragCorner,
  commitSceneDrag,
  resolveSceneDragTarget,
  keyboardNudge,
  nudgePatch,
  sceneEditFromDrag,
  sceneEditFromNudge,
  sceneEditCoalesceKey,
} from "./foundationSceneInput";
import {
  createSceneHistory,
  rowsWithPatch,
  sceneLayoutAnchor,
} from "./foundationSceneHistory";

export default function FoundationLayoutCanvas({ items = [], poles = [], onMoveItem, sceneHistory = null }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null); // {key,x,z} transient only
  const editable = typeof onMoveItem === "function";

  // O-040 history seam — an internal store keeps the component
  // self-contained; a mounted editor passes its own via `sceneHistory` for
  // the page's undo UI (see foundationSceneHistory mount notes).
  const internalHistoryRef = useRef(null);
  if (!internalHistoryRef.current) internalHistoryRef.current = createSceneHistory();
  const history = sceneHistory || internalHistoryRef.current;

  // Geometry-CAS reconciliation — every items change that did NOT come
  // through this canvas's recorded strokes detaches the undo chain, so undo
  // can never resurrect stale geometry over an external write.
  useEffect(() => { history.observe(sceneLayoutAnchor(items)); }, [history, items]);

  const pctW = (inches) => `${(inches / FOUNDATION_LAYOUT_WIDTH_INCHES) * 100}%`;
  const pctD = (inches) => `${(inches / FOUNDATION_LAYOUT_DEPTH_INCHES) * 100}%`;

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; dragRef.current = null; }; }, []);

  const cancelDrag = (e) => {
    if (e?.pointerId !== undefined && dragRef.current && e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    setPreview(null);
  };

  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || !editable || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current) return; // secondary touch must not replace an active gesture
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const point = layoutPointInches(e.clientX, e.clientY, rect);
    if (!point) return;
    const key = layoutItemKey(item, index);
    const [kind] = key.split(":");
    // O-039 input seam — the gesture record comes from the shared primitive;
    // pos/point are already validated above so beginSceneDrag cannot fail.
    dragRef.current = beginSceneDrag({
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      corner: { x: pos.x_inches, z: pos.z_inches },
      grabPoint: point,
      fingerprint: layoutItemFingerprint(item),
    });
    try { boxRef.current.setPointerCapture(e.pointerId); }
    catch { cancelDrag(); return; }
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
    dragRef.current = null; // clear before release/callback — one commit per gesture
    try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { }
    setPreview(null);
    if (!mountedRef.current) return;
    // final corner from the release point itself, not the last move preview
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    // O-039 input seam — commitSceneDrag applies the unchanged-corner and
    // sub-inch-wiggle guards and returns the whole-inch patch; the target
    // resolver re-finds the row (deletion/reorder during gesture) and checks
    // the fingerprint (authoritative change mid-drag).
    const patch = commitSceneDrag(d, point);
    if (!patch) return;
    const target = resolveSceneDragTarget(d, items);
    if (!target) return;
    if (typeof onMoveItem !== "function") return;
    // O-040: the whole gesture — begin, every preview move, commit — records
    // as ONE history command carrying the pre-stroke corner as its inverse
    // patch. Anchors are computed as "the scene with only this row's
    // geometry swapped", so an interleaved write to a different row is
    // preserved inside the entry instead of detaching it.
    const edit = sceneEditFromDrag(d, patch);
    const applied = onMoveItem(target.index, patch);
    if (applied === false) return; // refused commit — nothing landed to undo
    if (edit) {
      history.recordEdit({
        ...edit,
        target: { key: d.key, index: target.index },
        label: `Move Foundation ${target.index + 1}`,
        coalesceKey: sceneEditCoalesceKey(edit),
        beforeAnchor: sceneLayoutAnchor(rowsWithPatch(items, target.index, edit.before)),
        afterAnchor: sceneLayoutAnchor(rowsWithPatch(items, target.index, patch)),
      });
    }
  };

  const onKeyDown = (e, item, index) => {
    if (!mountedRef.current || !editable) return;
    // O-039 input seam — keyboardNudge carries the modifier guard, the arrow
    // map and the Shift 12-inch big-step; nudgePatch builds the same patch.
    const delta = keyboardNudge(e);
    if (!delta) return;
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
    e.preventDefault();
    // O-040: consecutive nudges on the same row coalesce into ONE undo
    // command inside the store's burst window — a held arrow key is one
    // stroke, not N history entries.
    const patch = nudgePatch(pos, delta);
    const applied = onMoveItem(index, patch);
    if (applied === false) return; // refused commit — nothing landed to undo
    const edit = sceneEditFromNudge(layoutItemKey(item, index), pos, patch);
    if (edit) {
      history.recordEdit({
        ...edit,
        target: { key: layoutItemKey(item, index), index },
        label: `Move Foundation ${index + 1}`,
        coalesceKey: sceneEditCoalesceKey(edit),
        beforeAnchor: sceneLayoutAnchor(rowsWithPatch(items, index, edit.before)),
        afterAnchor: sceneLayoutAnchor(rowsWithPatch(items, index, patch)),
      });
    }
  };

  const invalidNotes = items.map((item, index) => ({ item, index }))
    .filter(({ item }) => !foundationLayoutFootprint(item) || !layoutPositionInches(item).valid);

  return (
    <div className="bg-white rounded-sm border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Layout Canvas</h3>
          <p className="text-[11px] text-gray-400">
            {editable ? "Drag a foundation, or focus it and use arrow keys (Shift for larger steps)." : "Foundation positions (read-only)."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-600">
          <span className="flex items-center gap-1">
            <Move className="w-3 h-3" aria-hidden="true" /> Move Foundation
          </span>
          <span className="text-gray-400">40ft × 26ft 8in</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            aria-label="Zoom layout out"
            className="w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50"
          >
            <ZoomOut className="w-3 h-3" aria-hidden="true" />
          </button>
          <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
            aria-label="Zoom layout in"
            className="w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50"
          >
            <ZoomIn className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-sm border border-gray-300 bg-gray-50">
        <div
          ref={boxRef}
          onPointerMove={onPointerMove}
          onPointerUp={commitDrag}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={(e) => cancelDrag(e)}
          className="relative aspect-[3/2] select-none"
          style={{
            width: `${zoom * 100}%`,
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "8.333% 12.5%",
          }}
        >
          {items.map((item, index) => {
            const fp = foundationLayoutFootprint(item);
            const pos = layoutPositionInches(item);
            if (!fp || !pos.valid) return null;
            const key = layoutItemKey(item, index);
            const shown = preview && preview.key === key ? { x_inches: preview.x, z_inches: preview.z } : pos;
            return (
              <div
                key={key}
                role={editable ? "button" : undefined}
                tabIndex={editable ? 0 : undefined}
                aria-label={editable ? `Move Foundation ${index + 1}` : undefined}
                onPointerDown={editable ? (e) => onPointerDown(e, item, index) : undefined}
                onKeyDown={editable ? (e) => onKeyDown(e, item, index) : undefined}
                className={`absolute flex items-center justify-center border-2 border-dashed border-amber-500 bg-amber-100/70 text-[10px] font-semibold text-amber-800 ${
                  editable ? "cursor-move" : ""
                } ${item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"}`}
                style={{
                  left: pctW(shown.x_inches),
                  top: pctD(shown.z_inches),
                  width: pctW(fp.width),
                  height: pctD(fp.depth),
                  transform: `rotate(${item.rotation_degrees || 0}deg)`,
                  touchAction: editable ? "none" : undefined,
                }}
                title={`Foundation ${index + 1}`}
              >
                Foundation {index + 1}
              </div>
            );
          })}

          {preview && (
            <div className="absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" style={{ pointerEvents: "none" }}>
              Move preview - release to apply
            </div>
          )}

          {poles.map((pole, index) => (
            <div
              key={layoutItemKey(pole, index)}
              className="absolute w-2.5 h-2.5 rounded-full bg-slate-700 border border-white"
              style={{
                left: pctW(pole.x_inches || 0),
                top: pctD(pole.z_inches || 0),
                transform: "translate(-50%,-50%)",
                pointerEvents: "none",
              }}
              title={`Pole ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {invalidNotes.map(({ index }) => (
        <p key={index} className="mt-1 text-[11px] text-amber-700">
          Foundation {index + 1} needs valid dimensions/coordinates before placement.
        </p>
      ))}
    </div>
  );
}