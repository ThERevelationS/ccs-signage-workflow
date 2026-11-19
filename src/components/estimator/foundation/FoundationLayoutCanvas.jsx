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
  buildSceneTree,
  resolveSceneNode,
} from "./foundationSceneSelection";
import {
  planReparentSelection,
  reparentTargetsFor,
  reparentChildSpec,
  mountLinkDescriptors,
} from "./foundationReparentModel";
import { buildFoundationPlanSvg } from "./foundationPlanExport";
import {
  foundationSceneDiagnostics,
  diagnosticTarget,
} from "./foundationSceneDiagnostics";
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

// O-034 properties sync — notable fields per kind, shown only when the
// resolved row actually carries them (no guessed values).
const KIND_FIELD_KEYS = {
  pole: [["height", "height_inches"], ["embed", "embedment_inches"], ["x", "x_inches"], ["z", "z_inches"]],
  wall: [["height", "height_inches"], ["thickness", "thickness_inches"]],
  "wall-segment": [["length", "length_inches"]],
  "wall-cap": [["profile", "profile"], ["width", "width_inches"]],
  cabinet: [["mount", "mount"], ["w", "width_inches"], ["h", "height_inches"], ["d", "depth_inches"]],
};
const nodeSummaryFields = (resolved) =>
  (KIND_FIELD_KEYS[resolved?.node] || [])
    .filter(([, key]) => resolved.row?.[key] !== undefined && resolved.row?.[key] !== null)
    .map(([label, key]) => [label, resolved.row[key]]);

// O-037 — the five scene collections are the canvas's layers; the
// collection→layer map feeds the lock gate in commitOpPatches so a locked
// layer refuses every channel (single, multi, reparent) honestly.
const COLL_LAYER = { items: "items", poles: "poles", walls: "walls", wall_caps: "caps", signage_cabinets: "cabinets" };
const KIND_LAYER = { item: "items", pole: "poles", wall: "walls", "wall-segment": "walls", "wall-cap": "caps", cabinet: "cabinets" };
const LAYER_ROWS = [
  ["items", "Foundations"], ["poles", "Poles"], ["walls", "Walls"],
  ["caps", "Wall caps"], ["cabinets", "Cabinets"],
];

// O-032 elevation parity — a side profile beside the plan: each item's
// depth drops from its grade line at the same measured x position, each
// pole rises by its authored height above the same grade. Everything is
// drawn from saved inches — no derived/estimated placement.
const ELEV_DEPTH_IN = 96; // profile window: 8 ft of vertical space
const ElevationStrip = ({ items, poles, cabinets = [], selIds, widthIn, onSelect }) => {
  // O-032 -- front/side toggle: side projects at x/length (looking along +z);
  // front projects at z/width (looking along +x). Same vertical profile
  // (depth below grade / offset above / pole+sign heights), different axis.
  const [view, setView] = useState("side");
  const hx = (o) => Number(view === "front" ? o?.z_inches : o?.x_inches) || 0;
  const hw = (o) => Number(view === "front" ? o?.width_inches : (o?.length_inches ?? o?.diameter)) || 0;
  const itemsDrawn = (items || []).map((item, i) => ({
    item, i,
    key: layoutItemKey(item, i),
    x: hx(item),
    w: hw(item),
    depth: Number(item.depth_inches) || 0,
    off: Number(item.grade_offset_inches) || 0,
  })).filter((d) => d.w > 0 || d.depth > 0);
  const polesDrawn = (poles || []).map((pole, i) => ({
    pole, i,
    key: layoutItemKey(pole, i),
    x: hx(pole),
    h: Number(pole.height_inches) || 0,
    embed: Number(pole.embedment_inches ?? pole.y_offset_inches) || 0,
  }));
  // O-067 — cabinets sit at their mount's plan x (pole center or item
  // footprint center) rising by mount_height; unresolved mounts draw nothing.
  const itemById = new Map((items || []).map((it, i) => [it?.component_id, { it, i }]));
  const poleById = new Map((poles || []).map((p, i) => [p?.component_id, { p, i }]));
  const cabsDrawn = (cabinets || []).map((cab, i) => {
    let x = null;
    if (cab?.mount === "pole") {
      const rec = poleById.get(cab?.pole_component_id);
      if (rec) x = hx(rec.p);
    } else if (cab?.mount === "foundation") {
      const rec = itemById.get(cab?.foundation_component_id);
      if (rec) x = hx(rec.it) + hw(rec.it) / 2;
    }
    if (x === null) return null;
    return {
      cab, i, x,
      mh: Number(cab.mount_height_inches) || 0,
      w: Number(cab.width_inches) || 0,
      h: Number(cab.height_inches) || 0,
      key: layoutItemKey(cab, i),
    };
  }).filter((d) => d && d.w > 0 && d.h > 0);
  // Pole signs — a sign mounts at its pole's plan x, rising mount_height;
  // authored dims only (unresolved heights/widths draw nothing).
  const signsDrawn = [];
  (poles || []).forEach((pole, i) => {
    const x = hx(pole);
    (pole.signs || []).forEach((s, si) => {
      const w = Number(s?.width_inches), h = Number(s?.height_inches), mh = Number(s?.mount_height_inches) || 0;
      if (!(w > 0) || !(h > 0)) return;
      signsDrawn.push({ s, si, poleIndex: i, x, mh, w, h, key: `${layoutItemKey(pole, i)}-sign-${si}` });
    });
  });
  if (!itemsDrawn.length && !polesDrawn.length && !cabsDrawn.length && !signsDrawn.length) return null;
  const maxDepth = Math.max(24, ...itemsDrawn.map((d) => d.depth - Math.min(0, d.off)), ...polesDrawn.map((p) => p.embed));
  const maxUp = Math.max(24, ...polesDrawn.map((p) => p.h + Math.max(0, 0)), ...itemsDrawn.map((d) => Math.max(0, d.off)), ...cabsDrawn.map((c) => c.mh + c.h), ...signsDrawn.map((s) => s.mh + s.h));
  const H = ELEV_DEPTH_IN;
  const gradeY = (maxUp / (maxUp + maxDepth)) * H;
  const scaleY = H / (maxUp + maxDepth);
  const scaleX = (v) => (v / (widthIn || 480)) * 100;
  return (
    <div data-elevation-view={view}>
      <div className="mt-1 flex gap-1">
        {["side", "front"].map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`h-4 px-1.5 rounded-sm text-[9px] ${view === v ? "bg-violet-600 text-white" : "border border-gray-300 text-gray-500"}`}>
            {v === "side" ? "Side (x)" : "Front (z)"}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="mt-0.5 h-16 w-full rounded-sm border border-gray-200 bg-gray-50" data-elevation-strip="true">
      <line x1="0" y1={gradeY} x2="100" y2={gradeY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      {itemsDrawn.map((d) => (
        <rect
          key={d.key}
          data-elev-item={d.key}
          x={scaleX(d.x)} y={gradeY - d.off * scaleY}
          width={Math.max(0.5, scaleX(d.w))} height={d.depth * scaleY}
          fill={selIds.has(`item:component:${d.item.component_id}`) || selIds.has(`item:${d.key}`) ? "rgba(2,132,199,0.35)" : "rgba(245,158,11,0.25)"}
          stroke={selIds.has(`item:component:${d.item.component_id}`) || selIds.has(`item:${d.key}`) ? "#0284c7" : "#f59e0b"}
          strokeWidth="1" vectorEffect="non-scaling-stroke"
          onClick={() => onSelect?.(`item:component:${d.item.component_id}`)}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        />
      ))}
      {polesDrawn.map((p) => (
        <line
          key={p.key}
          data-elev-pole={p.key}
          x1={scaleX(p.x)} y1={gradeY + p.embed * scaleY} x2={scaleX(p.x)} y2={gradeY - p.h * scaleY}
          stroke={selIds.has(`pole:component:${p.pole.component_id}`) || selIds.has(`pole:${p.key}`) ? "#0284c7" : "#475569"}
          strokeWidth="2" vectorEffect="non-scaling-stroke"
          onClick={() => onSelect?.(`pole:component:${p.pole.component_id}`)}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        />
      ))}
      {cabsDrawn.map((d) => (
        <rect
          key={d.key}
          data-elev-cabinet={d.key}
          x={scaleX(d.x) - Math.max(0.3, scaleX(d.w)) / 2}
          y={gradeY - (d.mh + d.h) * scaleY}
          width={Math.max(0.3, scaleX(d.w))} height={d.h * scaleY}
          fill={selIds.has(`cabinet:component:${d.cab.component_id}`) ? "rgba(2,132,199,0.35)" : "rgba(71,85,105,0.3)"}
          stroke={selIds.has(`cabinet:component:${d.cab.component_id}`) ? "#0284c7" : "#475569"}
          strokeWidth="1" vectorEffect="non-scaling-stroke"
          onClick={() => onSelect?.(`cabinet:component:${d.cab.component_id}`)}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        />
      ))}
      {signsDrawn.map((d) => (
        <rect
          key={d.key}
          data-elev-sign={d.key}
          x={scaleX(d.x) - Math.max(0.3, scaleX(d.w)) / 2}
          y={gradeY - (d.mh + d.h) * scaleY}
          width={Math.max(0.3, scaleX(d.w))} height={d.h * scaleY}
          fill="rgba(59,130,246,0.3)"
          stroke="#2563eb"
          strokeWidth="1" vectorEffect="non-scaling-stroke"
        />
      ))}
      </svg>
    </div>
  );
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
  landscape = null,
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
  const scene = { items, poles, walls, wall_caps: wallCaps, signage_cabinets: signageCabinets, landscape };

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

  // O-034 properties sync — a resolved-row readout for the primary
  // selection: non-item kinds always (they have no typed bar), items on
  // read-only canvases (editable items already edit in the typed bar).
  const primaryResolved = selState.primaryId ? resolveSceneNode(scene, selState.primaryId) : null;
  const primaryProps = primaryResolved && (primaryResolved.node !== "item" || !editable)
    ? nodeSummaryFields(primaryResolved)
    : null;

  // O-037 layer visibility — per-collection show/hide + lock + transparent
  // concrete. Visibility is render-only; lock is enforced at the commit
  // channel so no edit path can bypass it.
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState({ items: true, poles: true, walls: true, caps: true, cabinets: true });
  const [lockedLayers, setLockedLayers] = useState(() => new Set());
  const [transparentConcrete, setTransparentConcrete] = useState(false);
  const toggleLayer = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleLock = (key) => setLockedLayers((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const visibleMountLinks = mountLinks.filter((l) => layers[KIND_LAYER[l.childKind]] !== false);

  // O-042 diagnostics — pure conflict/clearance findings over the live
  // scene; clicking a finding selects + focuses the object it names.
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagView, setDiagView] = useState("all");
  const diagnostics = diagOpen ? foundationSceneDiagnostics(scene) : null;
  // O-042 -- plan-vs-elevation filter: mount/height findings surface on the
  // elevation view; placement/clash findings on the plan view.
  const ELEVATION_KINDS = new Set(["sign-fit", "sign-collision", "mounted-off-foundation", "unresolvable-mount", "legacy-mount", "impossible-fit"]);
  const PLAN_KINDS = new Set(["out-of-bounds", "footprint-clash", "mount-candidate", "ambiguous-footprint", "unplaced", "unmounted-cap", "unmounted-cabinet", "mounted-off-foundation"]);
  const diagFiltered = (diagnostics || []).filter((f) =>
    diagView === "all" || (diagView === "elevation" ? ELEVATION_KINDS.has(f.kind) : PLAN_KINDS.has(f.kind)));
  const diagClick = (finding) => {
    const id = diagnosticTarget(scene, finding);
    if (!id) return;
    selection.select(id);
    focusNode(id);
  };

  // O-034 object tree — the scene tree the selection model already
  // builds (roots → children by mount), rendered as a collapsible list.
  // Rows click-select through the store so tree/canvas stay in sync.
  const [treeOpen, setTreeOpen] = useState(false);
  const sceneTree = treeOpen ? buildSceneTree(scene) : null;

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
    // O-037 — locked layers refuse at the commit channel itself, so drag,
    // toolbar ops, typed edits and reparent all honor the same guard.
    if (patches.some((p) => lockedLayers.has(COLL_LAYER[p?.collection]))) {
      setReparentNote("Layer is locked — unlock it in Layers ▸.");
      return { status: "locked", op };
    }
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
  // O-094 — mirror the selection about the plan's vertical center line.
  // Items/poles mirror their plan x (items also negate rotation); walls
  // mirror each outline point with order reversed so winding stays
  // consistent. Mounted caps/cabinets carry no coords — they follow their
  // parents automatically. ONE undoable commit for the whole selection.
  const opMirror = () => {
    const cx = PLAN_W;
    const patches = [];
    selState.ids.forEach((id) => {
      const [kind, ref] = [id.split(":")[0], id.split(":").slice(1).join(":")];
      if (kind === "item") {
        const res = items.findIndex((it, i) => layoutItemKey(it, i) === ref);
        if (res < 0) return;
        const fp = foundationLayoutFootprint(items[res]);
        const pos = layoutPositionInches(items[res]);
        if (!fp || !pos.valid) return;
        const patch = { x_inches: Math.round((cx - (pos.x_inches + fp.width)) * 100) / 100 };
        const rot = Number(items[res].rotation_degrees) || 0;
        if (rot) patch.rotation_degrees = Math.round(((360 - rot) % 360) * 100) / 100;
        patches.push({ collection: "items", index: res, key: ref, before: beforeFieldsOf(items[res], patch), patch });
      } else if (kind === "pole") {
        const res = poles.findIndex((p, i) => layoutItemKey(p, i) === ref);
        if (res < 0) return;
        const x = Number(poles[res].x_inches);
        if (!Number.isFinite(x)) return;
        const patch = { x_inches: Math.round((cx - x) * 100) / 100 };
        patches.push({ collection: "poles", index: res, key: ref, before: beforeFieldsOf(poles[res], patch), patch });
      } else if (kind === "wall") {
        const res = walls.findIndex((w, i) => layoutItemKey(w, i) === ref);
        if (res < 0) return;
        const pts = walls[res]?.shape?.points;
        if (!Array.isArray(pts) || !pts.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z))) return;
        const patch = { shape: { ...walls[res].shape, points: [...pts].reverse().map((p) => ({ x: Math.round((cx - p.x) * 100) / 100, z: p.z })) } };
        patches.push({ collection: "walls", index: res, key: ref, before: beforeFieldsOf(walls[res], patch), patch });
      }
    });
    if (patches.length) commitOpPatches("mirror", "toolbar", patches, { label: `Mirror ${patches.length} object${patches.length === 1 ? "" : "s"}` });
  };
  const canMirrorSel = editable && selState.count > 0 && selState.ids.some((id) => /^(item|pole|wall):/.test(id));
  // O-043 -- labeled plan export: the pure builder renders the SAME scene
  // (authored values only, unresolved mounts skipped) into a standalone
  // SVG document; the download is a Blob -- nothing is sent anywhere.
  const exportPlan = () => {
    const svg = buildFoundationPlanSvg(scene, { width: FOUNDATION_LAYOUT_WIDTH_INCHES, depth: FOUNDATION_LAYOUT_DEPTH_INCHES });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foundation-plan-${FOUNDATION_LAYOUT_WIDTH_INCHES}x${FOUNDATION_LAYOUT_DEPTH_INCHES}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
          <p className="text-[11px] text-gray-500">
            {editable
              ? "Drag a foundation or use arrow keys (Shift for larger steps). Click selects, Ctrl/Shift-click adds, drag empty space to box-select, Tab/arrows cycle, Esc clears."
              : "Foundation positions (read-only). Click to select, drag empty space to box-select."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-600">
          <span className="flex items-center gap-1">
            <Move className="w-3 h-3" aria-hidden="true" /> Move Foundation
          </span>
          <span className="text-gray-500">40ft × 26ft 8in</span>
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
            onClick={() => setZoom((z) => Math.min(6, +(z + 0.25).toFixed(2)))}
            aria-label="Zoom layout in"
            className="w-6 h-6 flex items-center justify-center rounded-sm border border-gray-300 hover:bg-gray-50"
          >
            <ZoomIn className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-op="fit-selection"
            disabled={!primaryItemRow}
            title="Zoom so the selected foundation fills the plan"
            onClick={() => {
              const fp = primaryItemRow?.item && foundationLayoutFootprint(primaryItemRow.item);
              if (!fp) return;
              const frac = fp.width / FOUNDATION_LAYOUT_WIDTH_INCHES;
              if (frac > 0) setZoom(Math.min(6, Math.max(0.5, +(1 / frac).toFixed(2))));
            }}
            className={`h-6 px-2 rounded-sm border text-[11px] ${primaryItemRow ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            Fit
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
          {/* O-037 scale labels — feet marks along the top edge, pinned to
              plan coordinates so they track zoom like the grid does. */}
          <div aria-hidden="true" data-scale-ruler="true" className="absolute left-0 right-0 top-0 h-4" style={{ pointerEvents: "none" }}>
            {[0, 120, 240, 360, 480].map((inches) => (
              <span
                key={inches}
                className="absolute text-[9px] text-gray-500"
                style={{ left: pctW(inches), transform: "translateX(-50%)" }}
              >
                {inches / 12}&apos;
              </span>
            ))}
          </div>
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
            {visibleMountLinks.map((link) => {
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
          {layers.items && items.map((item, index) => {
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
                    ? `border-solid border-sky-600 ${transparentConcrete ? "bg-sky-100/20" : "bg-sky-100/70"} text-sky-900 z-10`
                    : `border-dashed border-amber-500 ${transparentConcrete ? "bg-amber-100/20" : "bg-amber-100/70"} text-amber-800`
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

          {layers.poles && poles.map((pole, index) => {
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
          {(poles || []).map((pole) =>
            (pole.signs || []).flatMap((s, si) => {
              const w = Number(s?.width_inches), d = Number(s?.depth_inches);
              if (!(w > 0) || !(d > 0)) return [];
              const off = Number(s?.horizontal_offset_inches) || 0;
              // A twin mirrored across the pole at ±offset -- a centered twin
              // (offset 0) is the same box, so only one renders.
              const offs = s?.twin === true && off !== 0 ? [off, -off] : [off];
              return offs.map((o, oi) => (
                <div
                  key={`sign-${pole.component_id || pole.x_inches}-${si}-${oi}`}
                  className="absolute border border-blue-600 bg-blue-400/20"
                  style={{
                    left: pctW((Number(pole.x_inches) || 0) + o - w / 2),
                    top: pctD((Number(pole.z_inches) || 0) - d / 2),
                    width: pctW(w), height: pctD(d),
                    pointerEvents: "none",
                  }}
                  title={`Sign ${si + 1} on pole${s?.twin === true ? ` (${oi === 0 ? "near" : "far"} twin)` : ""}`}
                />
              ));
            })
          )}
        </div>
      </div>

      {/* O-032 — side-elevation companion to the plan: same measured x,
          authored depth below / pole height above a shared grade line. */}
      <ElevationStrip
        items={items}
        poles={poles}
        cabinets={signageCabinets}
        selIds={selIds}
        widthIn={FOUNDATION_LAYOUT_WIDTH_INCHES}
        onSelect={(id) => selection.select(id)}
      />

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

      {primaryProps && primaryProps.length > 0 && (
        <div data-selected-props="true" className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
          <span className="font-semibold text-gray-600">{primaryResolved.node}:</span>
          {primaryProps.map(([label, value]) => (
            <span key={label}><span className="text-gray-500">{label}</span> {String(value)}</span>
          ))}
          <span className="text-gray-500 italic">edit via its panel</span>
        </div>
      )}

      <button
        type="button"
        data-tree-toggle="true"
        onClick={() => setTreeOpen((v) => !v)}
        className="mt-1.5 text-[10px] text-gray-500 hover:text-gray-600"
      >
        {treeOpen ? "▾" : "▸"} Objects
      </button>
      <button
        type="button"
        data-layers-toggle="true"
        onClick={() => setLayersOpen((v) => !v)}
        className="mt-1.5 ml-3 text-[10px] text-gray-500 hover:text-gray-600"
      >
        {layersOpen ? "▾" : "▸"} Layers
      </button>
      <button
        type="button"
        data-diag-toggle="true"
        onClick={() => setDiagOpen((v) => !v)}
        className="mt-1.5 ml-3 text-[10px] text-gray-500 hover:text-gray-600"
      >
        {diagOpen ? "▾" : "▸"} Diagnostics
      </button>
      {diagOpen && (
        <div data-diag-panel="true" className="mt-0.5 max-h-36 overflow-auto rounded-sm border border-gray-200 bg-gray-50 p-1 text-[10px]">
          <div className="flex gap-1 mb-0.5">
            {["all", "plan", "elevation"].map((v) => (
              <button key={v} type="button" onClick={() => setDiagView(v)}
                className={`h-4 px-1 rounded-sm text-[9px] ${diagView === v ? "bg-violet-600 text-white" : "border border-gray-300 text-gray-500"}`}>
                {v}
              </button>
            ))}
          </div>
          {(!diagFiltered.length) && (
            <p className="px-1 py-1 text-gray-500">No conflicts detected.</p>
          )}
          {diagFiltered.map((f, i) => (
            <button
              key={i}
              type="button"
              data-diag-severity={f.severity}
              onClick={() => diagClick(f)}
              title={diagnosticTarget(scene, f) ? "Click to select the object" : undefined}
              className={`block w-full rounded-sm px-1 py-0.5 text-left ${
                f.severity === "error" ? "text-red-700 hover:bg-red-50"
                : f.severity === "warning" ? "text-amber-700 hover:bg-amber-50"
                : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f.message}
            </button>
          ))}
        </div>
      )}
      {layersOpen && (
        <div data-layers-panel="true" className="mt-0.5 rounded-sm border border-gray-200 bg-gray-50 p-1.5 text-[10px]">
          {LAYER_ROWS.map(([key, label]) => (
            <div key={key} data-layer={key} className="flex items-center gap-3 px-1 py-0.5">
              <label className="flex flex-1 items-center gap-1.5 text-gray-600 cursor-pointer">
                <input type="checkbox" checked={layers[key] !== false} onChange={() => toggleLayer(key)} />
                {label}
              </label>
              <button
                type="button"
                data-layer-lock={key}
                title={lockedLayers.has(key) ? "Unlock layer" : "Lock layer (blocks edits)"}
                onClick={() => toggleLock(key)}
                className={lockedLayers.has(key) ? "text-amber-600 font-semibold" : "text-gray-300 hover:text-gray-500"}
              >
                {lockedLayers.has(key) ? "🔒" : "🔓"}
              </button>
            </div>
          ))}
          <label className="mt-1 flex items-center gap-1.5 border-t border-gray-200 px-1 pt-1 text-gray-600 cursor-pointer">
            <input type="checkbox" checked={transparentConcrete} onChange={(e) => setTransparentConcrete(e.target.checked)} />
            Transparent concrete
          </label>
          <div className="mt-1 flex gap-1 border-t border-gray-200 px-1 pt-1">
            <button
              type="button"
              data-layer-op="isolate"
              disabled={selState.count < 1}
              title="Show only the kinds in the current selection"
              onClick={() => setLayers(() => {
                const only = new Set(selState.ids.map((id) => KIND_LAYER[parseSceneNodeId(id)?.kind]).filter(Boolean));
                return { items: only.has("items"), poles: only.has("poles"), walls: only.has("walls"), caps: only.has("caps"), cabinets: only.has("cabinets") };
              })}
              className={`px-1.5 py-0.5 rounded-sm border ${selState.count >= 1 ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
            >
              Isolate sel
            </button>
            <button
              type="button"
              data-layer-op="show-all"
              onClick={() => setLayers({ items: true, poles: true, walls: true, caps: true, cabinets: true })}
              className="px-1.5 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-50 text-gray-700"
            >
              Show all
            </button>
          </div>
        </div>
      )}
      {treeOpen && sceneTree && (
        <div data-object-tree="true" className="mt-0.5 max-h-44 overflow-auto rounded-sm border border-gray-200 bg-gray-50 p-1 text-[10px]">
          {sceneTree.order.map((id) => {
            const n = sceneTree.nodes.get(id);
            if (!n) return null;
            const sel = selIds.has(id);
            return (
              <button
                key={id}
                type="button"
                data-tree-node={id}
                data-selected={sel ? "true" : undefined}
                onClick={() => selection.select(id)}
                className={`block w-full truncate rounded-sm px-1 py-0.5 text-left ${sel ? "bg-sky-100 text-sky-800 font-semibold" : "text-gray-600 hover:bg-gray-100"}`}
                style={{ paddingLeft: `${4 + (n.depth || 0) * 12}px` }}
                title={n.label ?? id}
              >
                {n.label ?? id}
              </button>
            );
          })}
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
            data-op="mirror"
            disabled={!canMirrorSel}
            title={canMirrorSel ? "Mirror selection about the plan's vertical center" : "Select an item, pole or wall to mirror"}
            onClick={opMirror}
            className={`px-1.5 py-0.5 rounded-sm border ${canMirrorSel ? "border-gray-300 hover:bg-gray-50 text-gray-700" : "border-gray-200 text-gray-300"}`}
          >
            Mirror
          </button>
          <button
            type="button"
            data-op="export-plan"
            title="Download a labeled plan drawing (SVG)"
            onClick={exportPlan}
            className="px-1.5 py-0.5 rounded-sm border border-gray-300 hover:bg-gray-50 text-gray-700"
          >
            Export
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