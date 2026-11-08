import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  hitTestPlanAll,
} from "./foundationSceneInput";
import {
  createSceneHistory,
  rowsWithPatch,
  sceneLayoutAnchor,
} from "./foundationSceneHistory";
import {
  createSceneSelection,
  beginClickCandidate,
  isClickRelease,
  sceneNodeId,
} from "./foundationSceneSelection";

export default function FoundationLayoutCanvas({
  items = [],
  poles = [],
  walls = [],
  wallCaps = [],
  signageCabinets = [],
  onMoveItem,
  sceneHistory = null,
  sceneSelection = null,
  onDeleteSelection,
}) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null); // {key,x,z} transient only
  const editable = typeof onMoveItem === "function";

  // The full scene the selection model sees — the canvas renders items +
  // poles today, but hit tests, the object tree, cycling, region selects
  // and breadcrumbs all address all five assembly arrays + wall segments.
  const scene = { items, poles, walls, wall_caps: wallCaps, signage_cabinets: signageCabinets };

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

  // O-034 selection seam — same mount shape as the history store: an
  // internal store keeps the component self-contained; a mounted editor
  // passes its own via `sceneSelection` so the object tree / properties
  // panel / breadcrumbs stay in sync (deferred page wiring — see
  // MOUNT-ANCHORS.md).
  const internalSelectionRef = useRef(null);
  if (!internalSelectionRef.current) internalSelectionRef.current = createSceneSelection();
  const selection = sceneSelection || internalSelectionRef.current;
  useSyncExternalStore(selection.subscribe, () => selection.stateVersion);
  const selState = selection.getState();
  const selIds = new Set(selState.ids);

  // Click candidates + marquee run alongside the drag seam: a press records
  // its down point + topmost hit; release travel (< 5px) decides click vs
  // drag — drags never touch selection.
  const pickRef = useRef(null);    // beginClickCandidate record
  const marqueeRef = useRef(null); // {pointerId, clientX, clientY} — plan lives in the store's marquee

  // Selection reconciliation — identity rules mirror the drag target
  // resolver: component/legacy ids survive reorders; positional `index:`
  // ids keep only while the positional row still exists (a vanished one
  // drops, never re-points); minted component ids upgrade in place.
  useEffect(() => { selection.reconcile(scene); }, [selection, items, poles, walls, wallCaps, signageCabinets]);

  const pctW = (inches) => `${(inches / FOUNDATION_LAYOUT_WIDTH_INCHES) * 100}%`;
  const pctD = (inches) => `${(inches / FOUNDATION_LAYOUT_DEPTH_INCHES) * 100}%`;

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; dragRef.current = null; pickRef.current = null; marqueeRef.current = null; }; }, []);

  const cancelDrag = (e) => {
    if (e?.pointerId !== undefined && dragRef.current && e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    pickRef.current = null;
    marqueeRef.current = null;
    selection.cancelMarquee();
    setPreview(null);
  };

  const focusNode = (id) => {
    // Focus follows a keyboard cycle so the next Tab/arrow keeps walking
    // the tree (and an item's arrows keep nudging the SELECTED row).
    const el = boxRef.current?.querySelector?.(`[data-node-id="${String(id).replace(/"/g, '\\"')}"]`);
    if (el && typeof el.focus === "function") el.focus();
  };

  // Selection keys shared by item elements and the plan container:
  // Tab/arrows cycle (focus follows), Escape clears, Delete/Backspace is a
  // hook point — the store reports it, the consumer's commit path deletes.
  const applySelectionKey = (e) => {
    const result = selection.applyKey(e, scene);
    if (!result) return false;
    e.preventDefault();
    if (result.status === "delete-request") {
      if (typeof onDeleteSelection === "function") onDeleteSelection(selection.entries());
    } else if (result.status === "cycled" && result.id) {
      focusNode(result.id);
    }
    return true;
  };

  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current) return; // secondary touch must not replace an active gesture
    const rect = boxRef.current?.getBoundingClientRect();
    const point = layoutPointInches(e.clientX, e.clientY, rect);
    if (!point) return;
    // O-034 selection seam — every primary press is a click candidate. The
    // hit test runs at the DOWN point so paint-order topmost wins (a pole
    // over an item selects the pole); whether the press becomes a click or
    // a drag is decided at release travel.
    pickRef.current = beginClickCandidate({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      hit: hitTestPlanAll(scene, point)[0] ?? null,
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
    });
    if (!editable) {
      // Read-only still selects — capture so the release resolves.
      try { boxRef.current.setPointerCapture(e.pointerId); } catch { }
      return;
    }
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return;
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

  // Press on the plan background — the marquee seam. Item divs are direct
  // children, so a background press is exactly e.target === the box. A
  // top-hit reachable through the background (pole dots are
  // pointer-events:none; future wall/cap render layers too) records a
  // click candidate instead — drags from an object are not marquees.
  const onPlanPointerDown = (e) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false) return;
    if (e.target !== e.currentTarget) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
    if (!point) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const hit = hitTestPlanAll(scene, point)[0] ?? null;
    if (hit) {
      pickRef.current = beginClickCandidate({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, hit, additive });
      try { boxRef.current.setPointerCapture(e.pointerId); } catch { }
      return;
    }
    try { boxRef.current.setPointerCapture(e.pointerId); } catch { return; }
    marqueeRef.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    selection.beginMarquee({ point, additive });
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      d.moved = true;
      d.last = sceneDragCorner(d, point);
      setPreview({ key: d.key, x: d.last.x, z: d.last.z });
      return;
    }
    const m = marqueeRef.current;
    if (m && e.pointerId === m.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point) selection.updateMarquee(point);
    }
  };

  const commitDrag = (e) => {
    const d = dragRef.current;
    const pick = pickRef.current;
    const marquee = marqueeRef.current;
    // Marquee gesture — the rubber-band path resolves entirely here.
    if (marquee && e.pointerId === marquee.pointerId) {
      marqueeRef.current = null;
      try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { }
      if (!mountedRef.current) return;
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point) selection.updateMarquee(point);
      // Release inside the slop = an empty-space click: additive keeps,
      // plain clears. Beyond it, commit the region.
      selection.commitMarquee(scene, { empty: isClickRelease(marquee, e) });
      pickRef.current = null;
      return;
    }
    // Click-candidate gesture with no drag record (read-only press, or a
    // press on a non-draggable top hit) — resolves purely as selection.
    if (pick && e.pointerId === pick.pointerId && (!d || d.pointerId !== pick.pointerId)) {
      pickRef.current = null;
      try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { }
      if (isClickRelease(pick, e)) selection.selectHit(pick.hit, { additive: pick.additive });
      return;
    }
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null; // clear before release/callback — one commit per gesture
    pickRef.current = null;
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
    if (!patch) {
      // No move landed. Release inside the click threshold selects the
      // down-point hit; a drag that travelled and returned does NOT
      // deselect — that is the whole point of the travel check.
      if (pick && isClickRelease(pick, e)) {
        selection.selectHit(pick.hit, { additive: pick.additive });
      }
      return;
    }
    // A landed drag never touches selection — multi-selected scenes keep
    // their selection through the move.
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
    if (delta) {
      const fp = foundationLayoutFootprint(item);
      const pos = layoutPositionInches(item);
      if (!fp || !pos.valid) return;
      e.preventDefault();
      e.stopPropagation(); // consumed here — the plan container must not also cycle
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
      return;
    }
    // Non-nudge keys fall through to the selection layer: Tab cycles
    // (focus follows), Escape clears, Delete/Backspace fires the hook.
    if (applySelectionKey(e)) e.stopPropagation();
  };

  const onPlanKeyDown = (e) => {
    if (!mountedRef.current) return;
    if (e.target !== e.currentTarget) return; // item elements handle their own keys first
    applySelectionKey(e);
  };

  const invalidNotes = items.map((item, index) => ({ item, index }))
    .filter(({ item }) => !foundationLayoutFootprint(item) || !layoutPositionInches(item).valid);

  const marquee = selState.marquee;
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.start.x, marquee.current.x),
        z: Math.min(marquee.start.z, marquee.current.z),
        w: Math.abs(marquee.current.x - marquee.start.x),
        h: Math.abs(marquee.current.z - marquee.start.z),
      }
    : null;

  return (
    <div className="bg-white rounded-sm border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Layout Canvas</h3>
          <p className="text-[11px] text-gray-400">
            {editable
              ? "Drag a foundation or use arrow keys (Shift for larger steps). Click selects, Ctrl/Shift-click adds, drag empty space to box-select, Tab/arrows cycle, Esc clears."
              : "Foundation positions (read-only). Click to select, drag empty space to box-select."}
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
          tabIndex={0}
          role="group"
          aria-label="Foundation layout plan — Tab or arrows cycle selection"
          data-scene-selection="true"
          onPointerDown={onPlanPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={commitDrag}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={(e) => cancelDrag(e)}
          onKeyDown={onPlanKeyDown}
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
            const nodeId = sceneNodeId.item(key);
            const isSel = selIds.has(nodeId);
            const isPrimary = selState.primaryId === nodeId;
            const shown = preview && preview.key === key ? { x_inches: preview.x, z_inches: preview.z } : pos;
            return (
              <div
                key={key}
                role={editable ? "button" : undefined}
                tabIndex={editable ? 0 : undefined}
                aria-label={editable ? `Move Foundation ${index + 1}` : undefined}
                aria-pressed={editable ? isSel : undefined}
                data-node-id={nodeId}
                data-selected={isSel ? "true" : undefined}
                data-primary={isPrimary ? "true" : undefined}
                onPointerDown={(e) => onPointerDown(e, item, index)}
                onKeyDown={editable ? (e) => onKeyDown(e, item, index) : undefined}
                className={`absolute flex items-center justify-center border-2 text-[10px] font-semibold ${
                  isSel
                    ? "border-solid border-sky-600 bg-sky-100/70 text-sky-900 z-10"
                    : "border-dashed border-amber-500 bg-amber-100/70 text-amber-800"
                } ${editable ? "cursor-move" : ""} ${item.foundation_type === "pillar" ? "rounded-full" : "rounded-sm"}`}
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
                {isPrimary && editable && [0, 1, 2, 3].map((h) => (
                  <span
                    key={h}
                    data-selection-handle="true"
                    aria-hidden="true"
                    className="absolute w-2 h-2 bg-white border border-sky-700 rounded-[2px]"
                    style={{
                      left: h === 0 || h === 3 ? "-4px" : undefined,
                      right: h === 1 || h === 2 ? "-4px" : undefined,
                      top: h === 0 || h === 1 ? "-4px" : undefined,
                      bottom: h === 2 || h === 3 ? "-4px" : undefined,
                      pointerEvents: "none",
                    }}
                  />
                ))}
              </div>
            );
          })}

          {preview && (
            <div className="absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" style={{ pointerEvents: "none" }}>
              Move preview - release to apply
            </div>
          )}

          {marqueeRect && (
            <div
              data-marquee="true"
              aria-hidden="true"
              className="absolute border border-sky-500 bg-sky-300/20 z-20"
              style={{
                left: pctW(marqueeRect.x),
                top: pctD(marqueeRect.z),
                width: pctW(marqueeRect.w),
                height: pctD(marqueeRect.h),
                pointerEvents: "none",
              }}
            />
          )}

          {poles.map((pole, index) => {
            const nodeId = sceneNodeId.pole(layoutItemKey(pole, index));
            const isSel = selIds.has(nodeId);
            return (
              <div
                key={layoutItemKey(pole, index)}
                data-node-id={nodeId}
                data-selected={isSel ? "true" : undefined}
                data-primary={selState.primaryId === nodeId ? "true" : undefined}
                className={`absolute w-2.5 h-2.5 rounded-full border ${
                  isSel ? "bg-sky-500 border-sky-800" : "bg-slate-700 border-white"
                }`}
                style={{
                  left: pctW(pole.x_inches || 0),
                  top: pctD(pole.z_inches || 0),
                  transform: "translate(-50%,-50%)",
                  pointerEvents: "none",
                  boxShadow: isSel ? "0 0 0 2px rgba(2,132,199,0.45)" : undefined,
                }}
                title={`Pole ${index + 1}`}
              />
            );
          })}
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
