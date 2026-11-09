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
  snapCandidatesForScene,
} from "./foundationSceneInput";
import {
  createSceneHistory,
  sceneLayoutAnchor,
} from "./foundationSceneHistory";
import {
  createSceneSelection,
  beginClickCandidate,
  isClickRelease,
  sceneNodeId,
  parseSceneNodeId,
  nodeBreadcrumb,
} from "./foundationSceneSelection";
import {
  planReparentSelection,
  reparentTargetsFor,
  reparentChildSpec,
  mountLinkDescriptors,
} from "./foundationReparentModel";
import {
  beginItemResize,
  resizeItemFromHandle,
  beginItemRotate,
  rotateItemFromPointer,
  rotateItemBy,
  snapDraggedItem,
  snapCandidatesOutside,
  moveSelectionPatch,
  alignSelectionPatch,
  distributeSelectionPatch,
  typedItemPatch,
  beforeFieldsOf,
  patchesFitSingleItemChannel,
  editRecordForPatches,
  deleteSelectionPlan,
  duplicateSelectionPlan,
  opSceneWithPatches,
  ITEM_RESIZE_HANDLES,
  ALIGN_EDGES,
  DEFAULT_SNAP_TOLERANCE_INCHES,
  ROTATE_KEY_STEP_DEGREES,
  ROTATE_KEY_BIG_STEP_DEGREES,
} from "./foundationSceneEditOps";
import {
  parseFoundationDimension,
  formatFoundationDimension,
} from "./foundationFtInEntry";

const HANDLE_CURSORS = {
  nw: "nwse-resize", se: "nwse-resize",
  ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize",
  e: "ew-resize", w: "ew-resize",
};
const HANDLE_POSITION = {
  nw: { left: "-4px", top: "-4px" },
  n: { left: "calc(50% - 4px)", top: "-4px" },
  ne: { right: "-4px", top: "-4px" },
  e: { right: "-4px", top: "calc(50% - 4px)" },
  se: { right: "-4px", bottom: "-4px" },
  s: { left: "calc(50% - 4px)", bottom: "-4px" },
  sw: { left: "-4px", bottom: "-4px" },
  w: { left: "-4px", top: "calc(50% - 4px)" },
};
const ALIGN_LABELS = {
  left: "Align left edges", centerX: "Align horizontal centers", right: "Align right edges",
  top: "Align top edges", centerZ: "Align vertical centers", bottom: "Align bottom edges",
};
const ALIGN_TEXT = { left: "◧", centerX: "↔", right: "◨", top: "⬒", centerZ: "↕", bottom: "⬓" };

// O-036 — honest user-facing text for the model's structured refusals.
const REPARENT_REASON_TEXT = {
  "read-only": "The layout is read-only.",
  "unresolved": "That object could not be resolved.",
  "locked": "The object is locked.",
  "kind-not-reparentable": "Only poles, wall caps, and cabinets can be mounted.",
  "legacy-parent-unresolved": "Its mount is stored in legacy form — save once to normalize before remounting.",
  "target-not-found": "Mount target not found.",
  "target-not-addressable": "That target can't hold a mount (no component id — save once to normalize).",
  "invalid-target-type": "That target can't hold the selected object.",
  "segment-not-on-wall": "That segment belongs to a different wall.",
  "cycle": "An object can't be mounted to itself.",
  "invalid-geometry": "The object's position can't be resolved.",
  "invalid-target-geometry": "The target's frame can't be resolved.",
  "invalid-source-geometry": "The current mount's frame can't be resolved.",
  "empty-selection": "Nothing mountable is selected.",
  "commit-refused": "The page refused the mount change.",
  "unavailable": "Mounting needs the multi-object channel.",
};

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
  onDuplicateSelection,
  onPatchScene,
  objectSnap = true,
  snapToleranceInches = DEFAULT_SNAP_TOLERANCE_INCHES,
  gridSnapInches = 0,
}) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);   // move gesture record (O-039 shape) + _item/_multi
  const editDragRef = useRef(null); // resize/rotate gesture: {mode,pointerId,key,identityKind,legacyIndex,count,fingerprint,session,snapCandidates}
  const [preview, setPreview] = useState(null); // {patches:{key:patch}, guides:[...] } transient only
  const editable = typeof onMoveItem === "function";
  const multiChannel = typeof onPatchScene === "function";

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

  // Geometry-CAS reconciliation — every scene change that did NOT come
  // through this canvas's recorded strokes detaches the undo chain, so undo
  // can never resurrect stale geometry over an external write. O-035:
  // observe spans the whole scene (items + poles + walls) so single-row
  // and multi-row entries chain in ONE domain — an external pole/wall
  // write detaches recorded geometry just like an items write.
  useEffect(() => { history.observe(sceneLayoutAnchor(scene)); }, [history, items, poles, walls]);

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

  // O-036 reparent seam — the mount-handle chrome renders from the pure
  // descriptor list and the picker plans through the same commitOpPatches
  // channel every other op uses (one reparent = one undoable stroke).
  const [reparentOpen, setReparentOpen] = useState(false);
  const [reparentKeep, setReparentKeep] = useState("world");
  const [reparentNote, setReparentNote] = useState(null);
  useEffect(() => { setReparentOpen(false); setReparentNote(null); }, [selState.primaryId, selState.count]);
  const mountLinks = mountLinkDescriptors(scene);
  const reparentableIds = selState.ids.filter((id) => reparentChildSpec(parseSceneNodeId(id)?.kind));
  const reparentPrimaryId = reparentableIds.includes(selState.primaryId)
    ? selState.primaryId
    : reparentableIds[reparentableIds.length - 1] ?? null;
  // keep:"local" only transforms poles (the only child with plan geometry);
  // the toggle stays honest by appearing only when a pole could move.
  const reparentLocalEligible = reparentableIds.some((id) => parseSceneNodeId(id)?.kind === "pole");
  const reparentTargets = reparentOpen && reparentPrimaryId
    ? reparentTargetsFor(scene, reparentPrimaryId)
    : null;

  // O-034 breadcrumb — the primary selection's root→node trail through
  // mounts (e.g. Wall 1 › Segment 2 › Cap 1). Shown for any selection,
  // read-only canvases included — the toolbar stays edit-gated.
  const breadcrumb = selState.primaryId ? nodeBreadcrumb(scene, selState.primaryId) : [];

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
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; dragRef.current = null; editDragRef.current = null; pickRef.current = null; marqueeRef.current = null; }; }, []);

  const cancelDrag = (e) => {
    if (e?.pointerId !== undefined) {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) dragRef.current = null;
      else if (editDragRef.current && e.pointerId === editDragRef.current.pointerId) editDragRef.current = null;
      else if (dragRef.current || editDragRef.current) return; // foreign pointer — active gesture continues
    } else {
      dragRef.current = null;
      editDragRef.current = null;
    }
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

  // Snap helpers — candidates for everything except the moving row(s).
  const snapOpts = () => ({
    tolInches: Number.isFinite(snapToleranceInches) ? snapToleranceInches : DEFAULT_SNAP_TOLERANCE_INCHES,
    gridStepInches: Number.isFinite(gridSnapInches) && gridSnapInches > 0 ? gridSnapInches : 0,
  });
  const snapEnabled = (e) => (objectSnap !== false || snapOpts().gridStepInches > 0) && !(e && e.shiftKey);
  const candidatesExcept = (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    // The input seam's excludeKey drops one row; for several moving rows
    // build candidates from the scene minus movers (same helper).
    if (list.length === 1) return snapCandidatesForScene(scene, { excludeKey: list[0] });
    const moving = new Set(list);
    const keep = (rows) => (Array.isArray(rows) ? rows.filter((r, i) => !moving.has(layoutItemKey(r, i))) : []);
    return snapCandidatesForScene({ items: keep(items), poles: keep(poles), walls: keep(walls) });
  };

  // O-035 commit channel — route a computed patch list to the single-item
  // channel when it fits (patchItem already round-trips its undo) or the
  // optional multi-row channel. Anything else reports 'unavailable' so a
  // partial application can never happen silently.
  //
  // ALL recorded anchors live in the full-scene domain — the same domain
  // observe() uses — so single and multi entries chain together and the
  // mounted page's undo gate reads sceneLayoutAnchor({items,poles,walls}).
  const anchorWith = (patches, side) =>
    sceneLayoutAnchor(opSceneWithPatches(scene, patches, { side }));
  const commitOpPatches = (op, method, patches, { label } = {}) => {
    if (!Array.isArray(patches) || !patches.length) return { status: "noop" };
    if (patchesFitSingleItemChannel(patches) && editable) {
      const p = patches[0];
      const applied = onMoveItem(p.index, p.patch);
      if (applied === false) return { status: "commit-refused", op };
      const edit = editRecordForPatches(op, method, patches, { label });
      if (edit) {
        history.recordEdit({
          ...edit,
          coalesceKey: null,
          beforeAnchor: anchorWith(patches, "before"),
          afterAnchor: anchorWith(patches, "patch"),
        });
      }
      return { status: "applied", channel: "single", op };
    }
    if (multiChannel) {
      const applied = onPatchScene(patches);
      if (applied === false) return { status: "commit-refused", op };
      const edit = editRecordForPatches(op, method, patches, { label });
      if (edit) {
        // One op = one undo command, recorded through the stroke seam.
        // Anchors span the FULL scene; the multi record carries
        // target:null so the current single-row undo apply refuses it
        // explicitly ('rejected') instead of fake-applying a no-op —
        // the mounted multi apply branches on rev.patch.multi and never
        // touches target (MOUNT-ANCHORS.md).
        history.beginStroke({
          kind: edit.kind, method: edit.method, label: edit.label, target: edit.target,
          before: edit.before,
          beforeAnchor: anchorWith(patches, "before"),
        });
        history.commitStroke({
          after: edit.after, label: edit.label,
          afterAnchor: anchorWith(patches, "patch"),
        });
      }
      return { status: "applied", channel: "multi", op };
    }
    return { status: "unavailable", op };
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

  // Ctrl/Cmd+D — duplicate hook. The descriptor (sources + suggested
  // offset) goes to the consumer; the canvas never clones business data.
  const applyDuplicateKey = (e) => {
    if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (e.key !== "d" && e.key !== "D") return false;
    e.preventDefault();
    if (typeof onDuplicateSelection === "function") {
      const plan = duplicateSelectionPlan(scene, selection.entries());
      if (plan.status === "ok") onDuplicateSelection(plan);
    }
    return true;
  };

  const onPointerDown = (e, item, index) => {
    if (!mountedRef.current || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current || editDragRef.current) return; // secondary touch must not replace an active gesture
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
    const drag = beginSceneDrag({
      pointerId: e.pointerId,
      key,
      identityKind: kind,
      legacyIndex: index,
      count: items.length,
      corner: { x: pos.x_inches, z: pos.z_inches },
      grabPoint: point,
      fingerprint: layoutItemFingerprint(item),
    });
    // O-035: the row record + multi-drag marker ride the gesture record —
    // resolveSceneDragTarget/commitSceneDrag read only the fields they
    // know, so the extras are inert on the O-039 path.
    drag._item = item;
    drag._multi =
      multiChannel && selIds.has(sceneNodeId.item(key)) && selState.count > 1;
    dragRef.current = drag;
    try { boxRef.current.setPointerCapture(e.pointerId); }
    catch { cancelDrag(); return; }
    setPreview({ patches: { [key]: { x_inches: pos.x_inches, z_inches: pos.z_inches } }, guides: [] });
  };

  // O-035 handle press — resize ('nw'|'n'|...|'w') or rotate. Handles live
  // inside the primary item's rotated div so they track rotated corners /
  // edges for free; the press stops before the item's move-drag seam.
  const onHandleDown = (e, item, index, mode, handle) => {
    e.stopPropagation();
    if (!mountedRef.current || !editable || e.button !== 0) return;
    if (e.isPrimary === false || dragRef.current || editDragRef.current) return;
    const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
    if (!point) return;
    const key = layoutItemKey(item, index);
    const [kind] = key.split(":");
    const session = mode === "resize"
      ? beginItemResize(item, handle, point)
      : beginItemRotate(item, point);
    if (!session) return;
    editDragRef.current = {
      mode, pointerId: e.pointerId, key,
      identityKind: kind, legacyIndex: index, count: items.length,
      fingerprint: layoutItemFingerprint(item),
      session,
      snapCandidates: snapEnabled(e) ? candidatesExcept(key) : null,
    };
    try { boxRef.current.setPointerCapture(e.pointerId); }
    catch { editDragRef.current = null; return; }
    setPreview({ patches: {}, guides: [] });
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
    const ed = editDragRef.current;
    if (ed && e.pointerId === ed.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      if (ed.mode === "resize") {
        const r = resizeItemFromHandle(ed.session, point, {
          snap: ed.snapCandidates ? { candidates: ed.snapCandidates, tolInches: snapOpts().tolInches } : null,
        });
        if (r?.patch) setPreview({ patches: { [ed.key]: r.patch }, guides: r.guides || [] });
      } else if (ed.mode === "rotate") {
        const r = rotateItemFromPointer(ed.session, point, { free: e.shiftKey });
        if (r?.patch) setPreview({ patches: { [ed.key]: r.patch }, guides: [] });
      }
      return;
    }
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      d.moved = true;
      const raw = sceneDragCorner(d, point);
      if (!raw) return;
      d.last = raw;
      // O-035 snap-assisted drag: object candidates (edges/centers/poles/
      // wall vertices/bounds) then grid on unsnapped axes — Shift frees it.
      if (d._multi) {
        const delta = { dx: raw.x - d.corner.x, dz: raw.z - d.corner.z };
        const r = moveSelectionPatch(scene, selState.ids, delta, {
          snap: snapEnabled(e) ? { candidates: snapCandidatesOutside(scene, selState.ids), tolInches: snapOpts().tolInches } : null,
          gridStepInches: snapEnabled(e) ? snapOpts().gridStepInches : 0,
        });
        if (r.status === "ok") {
          const patches = {};
          for (const p of r.patches) {
            // Wall patches carry {shape} — only item corners preview.
            if (p.collection === "items") patches[p.key] = p.patch;
          }
          setPreview({ patches, guides: r.guides || [] });
        }
        return;
      }
      const adj = snapEnabled(e) && d._item
        ? snapDraggedItem(d._item, raw, candidatesExcept(d.key), snapOpts())
        : null;
      const cx = raw.x + (adj?.dx ?? 0);
      const cz = raw.z + (adj?.dz ?? 0);
      d._guides = adj?.guides || [];
      setPreview({ patches: { [d.key]: { x_inches: cx, z_inches: cz } }, guides: d._guides });
      return;
    }
    const m = marqueeRef.current;
    if (m && e.pointerId === m.pointerId) {
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (point) selection.updateMarquee(point);
    }
  };

  const commitDrag = (e) => {
    const ed = editDragRef.current;
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
    // O-035 resize/rotate gesture — one commit at release, one history
    // command. No click candidate was recorded (handle presses stop before
    // the item's pointer seam), so a null patch is a clean cancel.
    if (ed && e.pointerId === ed.pointerId) {
      editDragRef.current = null;
      try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { }
      setPreview(null);
      if (!mountedRef.current) return;
      const point = layoutPointInches(e.clientX, e.clientY, boxRef.current?.getBoundingClientRect());
      if (!point) return;
      const target = resolveSceneDragTarget(ed, items);
      if (!target) return;
      if (ed.mode === "resize") {
        const r = resizeItemFromHandle(ed.session, point, {
          round: true,
          snap: ed.snapCandidates ? { candidates: ed.snapCandidates, tolInches: snapOpts().tolInches } : null,
        });
        if (!r?.patch) return;
        const patch = { collection: "items", index: target.index, key: ed.key, before: beforeFieldsOf(target.item, r.patch), patch: r.patch };
        if (JSON.stringify(patch.before) === JSON.stringify(patch.patch)) return;
        commitOpPatches("resize", "handle", [patch], { label: `Resize Foundation ${target.index + 1}` });
        return;
      }
      if (ed.mode === "rotate") {
        const r = rotateItemFromPointer(ed.session, point, { free: e.shiftKey });
        if (!r?.patch) return;
        const patch = { collection: "items", index: target.index, key: ed.key, before: beforeFieldsOf(target.item, r.patch), patch: r.patch };
        if (JSON.stringify(patch.before) === JSON.stringify(patch.patch)) return;
        commitOpPatches("rotate", "handle", [patch], { label: `Rotate Foundation ${target.index + 1}` });
        return;
      }
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
    const releasePoint = (() => {
      // O-035 snap assist: adjust the release point by the same bounds
      // adjustment the live preview showed, then the unchanged path runs
      // the O-039 math verbatim (snap disabled → identical results).
      if (!snapEnabled(e) || !d._item || d._multi) return point;
      const raw = sceneDragCorner(d, point);
      const adj = raw ? snapDraggedItem(d._item, raw, candidatesExcept(d.key), snapOpts()) : null;
      // layoutPointInches returns {x_inches,z_inches} — preserve the shape,
      // adjusting the same fields the point actually carries.
      return adj
        ? { ...point, x_inches: point.x_inches + adj.dx, z_inches: point.z_inches + adj.dz }
        : point;
    })();
    const patch = commitSceneDrag(d, releasePoint);
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
    if (d._multi) {
      // Multi-drag: the raw corner delta translates every selected planar
      // row — one op, one multi-channel commit, one history stroke. Snap
      // runs on the selection bounds (same math the preview showed).
      const raw = sceneDragCorner(d, point);
      const delta = raw ? { dx: raw.x - d.corner.x, dz: raw.z - d.corner.z } : null;
      const r = delta
        ? moveSelectionPatch(scene, selState.ids, delta, {
            round: true,
            snap: snapEnabled(e) ? { candidates: snapCandidatesOutside(scene, selState.ids), tolInches: snapOpts().tolInches } : null,
            gridStepInches: snapEnabled(e) ? snapOpts().gridStepInches : 0,
          })
        : null;
      if (r?.status === "ok") {
        commitOpPatches("move", "drag", r.patches, { label: `Move ${r.patches.length} objects` });
        return;
      }
      // No move landed — the click-vs-drag rule applies exactly like the
      // single-item path.
      if (pick && isClickRelease(pick, e)) {
        selection.selectHit(pick.hit, { additive: pick.additive });
      }
      return;
    }
    // O-040: the whole gesture — begin, every preview move, commit — records
    // as ONE history command carrying the pre-stroke corner as its inverse
    // patch. Anchors are computed as "the scene with only this row's
    // geometry swapped", so an interleaved write to a different row is
    // preserved inside the entry instead of detaching it.
    const edit = sceneEditFromDrag(d, patch);
    const applied = onMoveItem(target.index, patch);
    if (applied === false) return; // refused commit — nothing landed to undo
    if (edit) {
      const patchRow = { collection: "items", index: target.index, before: edit.before, patch };
      history.recordEdit({
        ...edit,
        target: { key: d.key, index: target.index },
        label: `Move Foundation ${target.index + 1}`,
        coalesceKey: sceneEditCoalesceKey(edit),
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch"),
      });
    }
  };

  // O-035 keyboard rotate — '[' / ']' step the focused item about its
  // center (Shift = the 45° big step), bursts on one row coalescing into
  // one undo command like arrow nudges do.
  const applyRotateKey = (e, item, index) => {
    if (!editable || !item) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== "[" && e.key !== "]") return false;
    const fp = foundationLayoutFootprint(item);
    const pos = layoutPositionInches(item);
    if (!fp || !pos.valid) return false;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? ROTATE_KEY_BIG_STEP_DEGREES : ROTATE_KEY_STEP_DEGREES;
    const r = rotateItemBy(item, e.key === "]" ? step : -step);
    if (!r?.patch) return true;
    const key = layoutItemKey(item, index);
    const patchRow = { collection: "items", index, key, before: beforeFieldsOf(item, r.patch), patch: r.patch };
    if (JSON.stringify(patchRow.before) === JSON.stringify(patchRow.patch)) return true;
    // Coalesce a key burst into one command — same window/identity rule
    // the nudge path uses, keyed to the rotate op on this row.
    const applied = onMoveItem(index, r.patch);
    if (applied === false) return true;
    const edit = editRecordForPatches("rotate", "key", [patchRow], { label: `Rotate Foundation ${index + 1}` });
    if (edit) {
      history.recordEdit({
        ...edit,
        coalesceKey: `editop-rotate:${key}`,
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch"),
      });
    }
    return true;
  };

  const onKeyDown = (e, item, index) => {
    if (!mountedRef.current || !editable) return;
    // O-035 — duplicate/rotate hooks run before the nudge/selection split.
    if (applyDuplicateKey(e)) { e.stopPropagation(); return; }
    if (applyRotateKey(e, item, index)) return;
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
        const patchRow = { collection: "items", index, before: edit.before, patch };
        history.recordEdit({
          ...edit,
          target: { key: layoutItemKey(item, index), index },
          label: `Move Foundation ${index + 1}`,
          coalesceKey: sceneEditCoalesceKey(edit),
          beforeAnchor: anchorWith([patchRow], "before"),
          afterAnchor: anchorWith([patchRow], "patch"),
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
    if (applyDuplicateKey(e)) return;
    applySelectionKey(e);
  };

  // O-035 ops toolbar actions — each runs the pure op over the live
  // selection and routes the patch list through commitOpPatches.
  const runOp = (fn, { label } = {}) => {
    const result = fn();
    if (result?.status === "ok") commitOpPatches(result.op, "toolbar", result.patches, { label });
    return result;
  };
  const opAlign = (edge) => runOp(
    () => alignSelectionPatch(scene, selState.ids, edge, { primaryId: selState.primaryId, round: true }),
    { label: `${ALIGN_LABELS[edge]} (${selState.count} sel)` },
  );
  const opDistribute = (axis) => runOp(
    () => distributeSelectionPatch(scene, selState.ids, axis, { round: true }),
    { label: `Distribute ${axis === "x" ? "horizontally" : "vertically"} (${selState.count} sel)` },
  );
  const opRotateStep = (deg) => {
    // Toolbar rotation applies to every selected ITEM row.
    const ids = selState.ids.filter((id) => id.startsWith("item:"));
    const patches = [];
    ids.forEach((id) => {
      const res = items.findIndex((it, i) => layoutItemKey(it, i) === id.split(":").slice(1).join(":"));
      if (res < 0) return;
      const r = rotateItemBy(items[res], deg);
      if (r?.patch) patches.push({ collection: "items", index: res, key: layoutItemKey(items[res], res), before: beforeFieldsOf(items[res], r.patch), patch: r.patch });
    });
    if (patches.length) commitOpPatches("rotate", "toolbar", patches, { label: `Rotate ${deg > 0 ? "+" : ""}${deg}°` });
  };
  const opDelete = () => {
    const plan = deleteSelectionPlan(scene, selection.entries());
    if (plan.status === "ok" && typeof onDeleteSelection === "function") onDeleteSelection(selection.entries());
  };
  const opDuplicate = () => {
    const plan = duplicateSelectionPlan(scene, selection.entries());
    if (plan.status === "ok" && typeof onDuplicateSelection === "function") onDuplicateSelection(plan);
  };

  // O-036 reparent — one plan over the whole selection (the target probes
  // structurally once; per-child skips land honestly in `skipped`),
  // committed through commitOpPatches so the reparent is ONE undoable
  // stroke. Selection is stable across a mount change (node ids carry
  // component ids), so reconcile() retains it — skipped children stay
  // selected and the note says exactly what didn't move.
  const runReparent = (target) => {
    setReparentNote(null);
    const result = planReparentSelection(scene, selState.ids, target, { keep: reparentKeep });
    if (result.status === "noop") { setReparentOpen(false); return result; }
    if (result.status !== "ok") {
      setReparentNote(REPARENT_REASON_TEXT[result.reason] ?? `Can't mount there (${result.reason ?? "rejected"}).`);
      return result;
    }
    const applied = commitOpPatches("reparent", "picker", result.patches, { label: result.label });
    if (applied.status !== "applied") {
      setReparentNote(REPARENT_REASON_TEXT[applied.status] ?? `Mount not applied (${applied.status}).`);
      return applied;
    }
    if (result.skipped?.length) {
      const reasons = [...new Set(result.skipped.map((s) => REPARENT_REASON_TEXT[s.reason] ?? s.reason))].join(" ");
      setReparentNote(`${result.count} remounted; ${result.skipped.length} skipped — ${reasons}`);
    }
    setReparentOpen(false);
    return result;
  };

  // Typed-coordinate commits — a field blur/Enter parses (ft/in via the
  // O-093 boundary for length fields, strict numeric for rotation), the
  // typed op validates atomically, and a landed patch records like any
  // other single-item command.
  const primaryEntry = selState.primary;
  const primaryItemRow = (() => {
    if (!primaryEntry?.id?.startsWith("item:")) return null;
    const key = primaryEntry.id.slice(5);
    const i = items.findIndex((it, j) => layoutItemKey(it, j) === key);
    return i >= 0 ? { item: items[i], index: i, key } : null;
  })();
  // Enter commits then blurs — the blur's own commit runs in the SAME tick
  // against this stale render closure (the row still shows the pre-commit
  // value), which would record the same patch twice. Dedupe identical
  // commits inside a short window; a genuinely different value or a later
  // commit always re-validates against fresh state.
  const typedCommitRef = useRef(null); // {field, value, at}
  const commitTypedField = (field, text, parse) => {
    if (!primaryItemRow) return;
    const parsed = parse(text);
    if (parsed === undefined) return; // input stays verbatim; nothing landed
    const last = typedCommitRef.current;
    if (last && last.field === field && last.value === parsed && Date.now() - last.at < 600) return;
    const r = typedItemPatch(primaryItemRow.item, { [field]: parsed });
    if (r.status !== "ok") return;
    const patchRow = { collection: "items", index: primaryItemRow.index, key: primaryItemRow.key, before: r.before, patch: r.patch };
    if (JSON.stringify(patchRow.before) === JSON.stringify(patchRow.patch)) return;
    const applied = onMoveItem(primaryItemRow.index, r.patch);
    if (applied === false) return;
    typedCommitRef.current = { field, value: parsed, at: Date.now() };
    const edit = editRecordForPatches("geometry", "typed", [patchRow], { label: `Edit Foundation ${primaryItemRow.index + 1} ${field}` });
    if (edit) {
      history.recordEdit({
        ...edit,
        coalesceKey: null,
        beforeAnchor: anchorWith([patchRow], "before"),
        afterAnchor: anchorWith([patchRow], "patch"),
      });
    }
  };
  const dimParse = (text) => {
    const p = parseFoundationDimension(text);
    return p.ok ? p.inches : undefined;
  };
  const rotParse = (text) => {
    const t = String(text).trim();
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t) ? Number(t) : undefined;
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

  const guides = preview?.guides || [];
  const selectedItemCount = selState.ids.filter((id) => id.startsWith("item:")).length;
  const singleItemSel = selState.count === 1 && selectedItemCount === 1 && primaryItemRow;
  // An op needs the multi channel when it can touch anything other than
  // exactly one items row.
  const alignNeedsMulti = selState.count > 1;
  const canAlign = editable && selState.count >= 1 && (!alignNeedsMulti || multiChannel);
  const canDistribute = editable && selState.count >= 3 && multiChannel;
  const canRotateSel = editable && selectedItemCount >= 1 && (selectedItemCount === 1 || multiChannel);
  const canDuplicate = typeof onDuplicateSelection === "function";
  const canDelete = typeof onDeleteSelection === "function" && selState.count >= 1;
  // Reparent patches never fit the single-items channel — a mount op
  // needs the multi channel even for one child.
  const canReparent = editable && multiChannel && reparentableIds.length >= 1;

  const typedField = (field, label, stored, parse, format) => (
    <input
      key={`${primaryItemRow?.key}:${field}:${String(stored)}`}
      type="text"
      defaultValue={format ? format(stored) : String(stored ?? "")}
      aria-label={label}
      title={label}
      data-typed-field={field}
      className="w-14 h-6 px-1 rounded-sm border border-gray-300 text-[11px] text-gray-800"
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitTypedField(field, e.currentTarget.value, parse); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.value = format ? format(stored) : String(stored ?? ""); e.currentTarget.blur(); }
        e.stopPropagation();
      }}
      onBlur={(e) => commitTypedField(field, e.currentTarget.value, parse)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );

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
          {/* O-036 mount chrome — one dashed tether + handle badge per live
              mount (pole→item, cap→wall/segment, cabinet→pole|item).
              Detached, dangling and unresolved mounts emit nothing: there
              is no mount to show. Plan-space overlay under the objects;
              pointer events never pass through. */}
          <svg
            aria-hidden="true"
            data-mount-links="true"
            className="absolute inset-0"
            viewBox={`0 0 ${FOUNDATION_LAYOUT_WIDTH_INCHES} ${FOUNDATION_LAYOUT_DEPTH_INCHES}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: "none", zIndex: 1 }}
          >
            {mountLinks.map((link) => {
              const sel = selIds.has(link.childId);
              const a = link.handlePoint;
              const b = link.parentPoint;
              const showLine = a && b && (a.x !== b.x || a.z !== b.z);
              return (
                <g key={link.childId} data-mount-link={link.childId} data-mount-kind={link.childKind}>
                  {showLine && (
                    <line
                      x1={a.x} y1={a.z} x2={b.x} y2={b.z}
                      stroke={sel ? "#0369a1" : "#64748b"}
                      strokeOpacity={sel ? 0.9 : 0.45}
                      strokeWidth={sel ? 2 : 1.25}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {a && (
                    <rect
                      x={a.x - 2.5} y={a.z - 2.5} width={5} height={5}
                      transform={`rotate(45 ${a.x} ${a.z})`}
                      fill={sel ? "#0284c7" : "#f8fafc"}
                      stroke={sel ? "#075985" : "#64748b"}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          {items.map((item, index) => {
            const fp = foundationLayoutFootprint(item);
            const pos = layoutPositionInches(item);
            if (!fp || !pos.valid) return null;
            const key = layoutItemKey(item, index);
            const nodeId = sceneNodeId.item(key);
            const isSel = selIds.has(nodeId);
            const isPrimary = selState.primaryId === nodeId;
            const pv = preview?.patches?.[key];
            const shown = pv
              ? { x_inches: pv.x_inches ?? pos.x_inches, z_inches: pv.z_inches ?? pos.z_inches }
              : pos;
            const shownW = pv?.diameter ?? pv?.length_inches ?? fp.width;
            const shownD = pv?.diameter ?? pv?.width_inches ?? fp.depth;
            const shownRot = pv?.rotation_degrees ?? item.rotation_degrees ?? 0;
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
                  width: pctW(shownW),
                  height: pctD(shownD),
                  transform: `rotate(${shownRot}deg)`,
                  touchAction: editable ? "none" : undefined,
                }}
                title={`Foundation ${index + 1}`}
              >
                <span className="flex flex-col items-center leading-tight" style={{ pointerEvents: "none" }}>
                  <span>Foundation {index + 1}</span>
                  {isSel && (
                    <span data-dim-chip="true" className="text-[9px] font-normal">
                      {item.foundation_type === "pillar"
                        ? `⌀ ${formatFoundationDimension(shownW)}`
                        : `${formatFoundationDimension(shownW)} × ${formatFoundationDimension(shownD)}`}
                    </span>
                  )}
                </span>
                {isPrimary && editable && ITEM_RESIZE_HANDLES.map((h) => (
                  <span
                    key={h}
                    data-resize-handle={h}
                    aria-hidden="true"
                    onPointerDown={(e) => onHandleDown(e, item, index, "resize", h)}
                    className="absolute w-2 h-2 bg-white border border-sky-700 rounded-[2px]"
                    style={{
                      ...HANDLE_POSITION[h],
                      cursor: HANDLE_CURSORS[h],
                      pointerEvents: "auto",
                    }}
                  />
                ))}
                {isPrimary && editable && (
                  <span
                    data-rotate-handle="true"
                    aria-hidden="true"
                    onPointerDown={(e) => onHandleDown(e, item, index, "rotate", "n")}
                    className="absolute w-2.5 h-2.5 bg-sky-500 border border-sky-800 rounded-full"
                    style={{
                      left: "calc(50% - 5px)",
                      top: "-18px",
                      cursor: "grab",
                      pointerEvents: "auto",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.8)",
                    }}
                  />
                )}
              </div>
            );
          })}

          {preview && (
            <div className="absolute left-1 top-1 z-10 rounded-sm bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" style={{ pointerEvents: "none" }}>
              Move preview - release to apply
            </div>
          )}

          {guides.map((gd, i) => (
            gd.axis === "x"
              ? <div key={`gx-${i}`} data-snap-guide="x" aria-hidden="true" className="absolute top-0 bottom-0 border-l border-sky-500/70 z-20" style={{ left: pctW(gd.value), pointerEvents: "none" }} />
              : <div key={`gz-${i}`} data-snap-guide="z" aria-hidden="true" className="absolute left-0 right-0 border-t border-sky-500/70 z-20" style={{ top: pctD(gd.value), pointerEvents: "none" }} />
          ))}

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

      {breadcrumb.length > 0 && (
        <div data-breadcrumb="true" className="mt-1.5 text-[10px] text-gray-500" aria-label="Selection path">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id}>
              {i > 0 && <span className="mx-1 text-gray-300" aria-hidden="true">›</span>}
              <span className={crumb.id === selState.primaryId ? "font-semibold text-gray-700" : ""}>
                {crumb.label ?? crumb.id}
              </span>
            </span>
          ))}
        </div>
      )}

      {selState.count >= 1 && editable && (
        <div data-editops-toolbar="true" className="flex flex-wrap items-center gap-1 mt-2 text-[10px]">
          <span className="text-gray-500 mr-1">{selState.count} selected:</span>
          {ALIGN_EDGES.map((edge) => (
            <button
              key={edge}
              type="button"
              data-op={`align-${edge}`}
              disabled={!canAlign}
              title={canAlign ? `${ALIGN_LABELS[edge]}${selState.count > 1 ? " to primary" : " to plan"}` : "Requires multi-object page channel (O-035 mount)"}
              onClick={() => opAlign(edge)}
              className={`px-1.5 py-0.5 rounded-sm border ${canAlign ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
            >
              {ALIGN_TEXT[edge]}
            </button>
          ))}
          <button
            type="button"
            data-op="distribute-x"
            disabled={!canDistribute}
            title={selState.count < 3 ? "Select 3+ objects to distribute" : multiChannel ? "Distribute horizontally" : "Requires multi-object page channel (O-035 mount)"}
            onClick={() => opDistribute("x")}
            className={`px-1.5 py-0.5 rounded-sm border ${canDistribute ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            Dist X
          </button>
          <button
            type="button"
            data-op="distribute-z"
            disabled={!canDistribute}
            title={selState.count < 3 ? "Select 3+ objects to distribute" : multiChannel ? "Distribute vertically" : "Requires multi-object page channel (O-035 mount)"}
            onClick={() => opDistribute("z")}
            className={`px-1.5 py-0.5 rounded-sm border ${canDistribute ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            Dist Z
          </button>
          <button
            type="button"
            data-op="rotate-ccw"
            disabled={!canRotateSel}
            title={canRotateSel ? "Rotate −15° ([ key)" : "Select an item to rotate"}
            onClick={() => opRotateStep(-ROTATE_KEY_STEP_DEGREES)}
            className={`px-1.5 py-0.5 rounded-sm border ${canRotateSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            ⟲15°
          </button>
          <button
            type="button"
            data-op="rotate-cw"
            disabled={!canRotateSel}
            title={canRotateSel ? "Rotate +15° (] key)" : "Select an item to rotate"}
            onClick={() => opRotateStep(ROTATE_KEY_STEP_DEGREES)}
            className={`px-1.5 py-0.5 rounded-sm border ${canRotateSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            ⟳15°
          </button>
          <button
            type="button"
            data-op="duplicate"
            disabled={!canDuplicate}
            title={canDuplicate ? "Duplicate selection (Ctrl+D)" : "Requires duplicate page channel (O-035 mount)"}
            onClick={opDuplicate}
            className={`px-1.5 py-0.5 rounded-sm border ${canDuplicate ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            Duplicate
          </button>
          <button
            type="button"
            data-op="delete"
            disabled={!canDelete}
            title={canDelete ? "Delete selection (Del)" : "Requires delete page channel"}
            onClick={opDelete}
            className={`px-1.5 py-0.5 rounded-sm border ${canDelete ? "border-red-300 hover:bg-red-50 text-red-700" : "border-gray-200 text-gray-300"}`}
          >
            Delete
          </button>
          {reparentableIds.length >= 1 && (
            <span className="relative inline-block">
              <button
                type="button"
                data-op="reparent"
                disabled={!canReparent}
                title={canReparent
                  ? "Mount, remount, or detach the selected object"
                  : "Requires multi-object page channel (O-035 mount)"}
                onClick={() => { setReparentOpen((v) => !v); setReparentNote(null); }}
                className={`px-1.5 py-0.5 rounded-sm border ${canReparent ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
              >
                Mount ▾
              </button>
              {reparentOpen && canReparent && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setReparentOpen(false)} />
                  <div
                    data-reparent-menu="true"
                    className="absolute left-0 bottom-full mb-1 z-40 w-56 max-h-60 overflow-auto rounded-sm border border-gray-300 bg-white shadow-lg text-left"
                  >
                    {reparentLocalEligible && (
                      <label className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reparentKeep === "local"}
                          onChange={(e) => setReparentKeep(e.target.checked ? "local" : "world")}
                        />
                        Keep local offset (poles only)
                      </label>
                    )}
                    {(reparentTargets?.targets || []).map((t) => (
                      <button
                        key={`${t.kind}:${t.componentId}`}
                        type="button"
                        data-reparent-target={t.kind}
                        disabled={!!t.current}
                        onClick={() => runReparent(t)}
                        className={`block w-full px-2 py-1 text-left ${t.current ? "text-sky-700 bg-sky-50" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        {t.label}{t.current ? " — current" : ""}
                      </button>
                    ))}
                    {reparentTargets?.detach && (
                      <button
                        type="button"
                        data-reparent-target="standalone"
                        disabled={reparentTargets.detached}
                        onClick={() => runReparent("standalone")}
                        className={`block w-full px-2 py-1 text-left border-t border-gray-200 ${reparentTargets.detached ? "text-gray-300" : "text-red-700 hover:bg-red-50"}`}
                      >
                        Detach (standalone)
                      </button>
                    )}
                  </div>
                </>
              )}
            </span>
          )}
        </div>
      )}

      {singleItemSel && editable && (
        <div data-typed-bar="true" className="flex flex-wrap items-center gap-1 mt-2 text-[10px] text-gray-500">
          <span className="mr-1">Position/size (in):</span>
          {typedField("x", "Plan X (inches, e.g. 96 or 8')", primaryItemRow.item.x_inches, dimParse, formatFoundationDimension)}
          {typedField("z", "Plan Z (inches)", primaryItemRow.item.z_inches, dimParse, formatFoundationDimension)}
          {primaryItemRow.item.foundation_type === "pillar"
            ? typedField("diameter", "Diameter (inches)", primaryItemRow.item.diameter, dimParse, formatFoundationDimension)
            : <>
                {typedField("length", "Length (inches)", primaryItemRow.item.length_inches, dimParse, formatFoundationDimension)}
                {typedField("width", "Width (inches)", primaryItemRow.item.width_inches, dimParse, formatFoundationDimension)}
              </>}
          {typedField("rotation", "Rotation (degrees)", primaryItemRow.item.rotation_degrees ?? 0, rotParse, (v) => String(v ?? 0))}
        </div>
      )}

      {reparentNote && (
        <p data-reparent-note="true" className="mt-1 text-[11px] text-amber-700">{reparentNote}</p>
      )}

      {invalidNotes.map(({ index }) => (
        <p key={index} className="mt-1 text-[11px] text-amber-700">
          Foundation {index + 1} needs valid dimensions/coordinates before placement.
        </p>
      ))}
    </div>
  );
}