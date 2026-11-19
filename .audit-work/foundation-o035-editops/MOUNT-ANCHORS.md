# O-035 mount anchors — wiring scene edit operations into the page

Anchor = the exact call site where a consumer plugs in. All op modules are pure;
no DOM/React except the canvas component itself. Verified at remote HEAD
`fe0e913da39e646de1394d077eb34effa0f259f0` (owned surfaces byte-identical to the
pull baseline; `foundationSceneEditOps.js` absent remotely).

## What is already wired (candidate state)

`FoundationLayoutCanvas` implements the O-035 editing surface on top of the
existing seams, self-contained:

- **Selection chrome** — 8 resize handles + a rotate handle on the primary item;
  an ops toolbar (align ×6, distribute x/z, rotate ±15°, duplicate, delete); a
  typed field bar (x, z, length|width|diameter, rotation) for single-item
  selection; a live dims chip on selected items.
- **Gestures** — handle resize in the item's rotated local frame (opposite edge
  anchored, flip grows, min-size clamp, pillar diameter, Shift-free aspect via
  opts); rotate-handle drag snapped to 15° (Shift frees); pointer move-drag with
  object-snap guides + optional uniform grid.
- **Keyboard** — arrows nudge (O-039), `[`/`]` rotate ±15° (Shift ±45°), Ctrl+D
  duplicate, Delete/Backspace → delete hook.
- **History** — one op = one undo command: `recordEdit` for single-row patches
  (the O-040 shape the current `patchItem` apply already round-trips) and
  `beginStroke`+`commitStroke` wrapping a `scene-multi` record for multi-row
  patches. All anchors are computed in the full-scene domain
  (`sceneLayoutAnchor({items, poles, walls})`), matching the canvas's `observe`.
- **Commit routing** — `commitOpPatches` sends a one-row items patch through
  `onMoveItem` (unchanged channel) and everything else through the optional
  `onPatchScene`. Unmounted multi channel → toolbar buttons disable with a
  "requires multi-object page channel" hint instead of half-applying.

With no new props the canvas degrades to remote behavior exactly — every O-035
prop is optional; single-item resize/rotate/typed commits still record + undo
through `onMoveItem` alone.

## Deferred anchor 1 — page props (FoundationEstimator.jsx canvas mount)

```diff
 <FoundationLayoutCanvas
   items={project.items || []}
   poles={project.poles || []}
+  walls={project.walls || []}
+  wallCaps={project.wall_caps || []}
+  signageCabinets={project.signage_cabinets || []}
   onMoveItem={patchItem}
   sceneHistory={sceneHistory}      // O-040 anchor
   sceneSelection={sceneSelection}  // O-034 anchor
+  onPatchScene={patchScene}
+  onDeleteSelection={deleteSceneSelection}
+  onDuplicateSelection={duplicateSceneSelection}
+  gridSnapInches={layoutPrefs.gridSnapInches}
+  snapToleranceInches={layoutPrefs.snapToleranceInches}
 />
```

`walls`/`wallCaps`/`signageCabinets` are new pass-throughs: the canvas already
includes them in its internal scene record for hit tests, selection, and op
targets; rendering wall shapes stays deferred to their own work item.

## Deferred anchor 2 — the multi-row commit channel

```jsx
const patchScene = (patches) => {
  // patches: [{collection:'items'|'poles'|'walls'|'wall_caps'|'signage_cabinets',
  //            index, key, before, patch}]
  // Apply each row's `patch` merge through the SAME commit path patchItem uses
  // (CAS + normalize + draft backup stay in force). Return false to refuse —
  // the canvas records nothing when the commit is refused.
  return commit((draft) => {
    for (const p of patches) {
      const rows = draft[p.collection];
      if (Array.isArray(rows) && rows[p.index]) rows[p.index] = { ...rows[p.index], ...p.patch };
    }
  }) !== false;
};
```

One commit call for the whole patch list keeps the op atomic on the business
side, matching the single history entry the canvas records.

## Deferred anchor 3 — multi-aware undo apply

The current single-row apply (`patchItem(rev.target.index, rev.patch)`) must
gain a multi branch — **before** touching `rev.target`, which is `null` for
multi entries by design (that null is the honesty guard: without this branch
the old apply throws and the store reports `'rejected'` — an explicit refusal,
never a fake "applied" no-op):

```jsx
const applySceneRev = (rev) => {
  if (rev.patch && Array.isArray(rev.patch.multi)) {
    for (const m of rev.patch.multi) {
      const rows = /* live rows for m.collection */;
      rows[m.index] = { ...rows[m.index], ...m.fields };
    }
    return true;
  }
  return patchItem(rev.target.index, rev.patch) !== false;
};
const sceneUndo = () => sceneHistory.undo(fullAnchor(), applySceneRev);
const sceneRedo = () => sceneHistory.redo(fullAnchor(), applySceneRev);
```

`rev.patch.multi` entries are `{collection, index, fields}` — `fields` is the
`before` side on undo and the `after` side on redo (the store already picks the
right side).

## Deferred anchor 4 — full-domain observe + undo anchor

The canvas now observes `sceneLayoutAnchor({items, poles, walls})` so a pole or
wall write detaches recorded geometry just like an items write. The page's
undo/redo gate must pass the same domain:

```jsx
const fullAnchor = () =>
  sceneLayoutAnchor({ items: itemsRef.current, poles: polesRef.current, walls: wallsRef.current });
```

(Passing the old items-only anchor still refuses honestly — `stale`/`rejected` —
when poles or walls exist; it can never fake-apply.)

## Deferred anchor 5 — delete + duplicate handlers

The canvas emits **plans**, never mutations:

```jsx
const deleteSceneSelection = (entries) => {
  const plan = deleteSelectionPlan(scene, entries); // or reuse the plan the canvas computed
  // confirm → remove plan.removals rows via the existing delete path
  // (each carries {collection, index, componentId}); sub-objects + locked rows
  // arrive pre-skipped in plan.skipped.
};
const duplicateSceneSelection = (plan) => {
  // plan = {sources:[{collection,index,componentId}], offset_inches:{x:12,z:12}}
  // Route through foundationDuplicateMirror.duplicateFoundationAssembly —
  // clone + id-minting + reference remap stay page-owned.
};
```

`foundationDuplicateMirror` already owns clone/remap semantics (verified while
scoping); the plan's `sources` map onto its components input.

## Deferred anchor 6 — snap preferences

`objectSnap` (default true), `snapToleranceInches` (default 3), and
`gridSnapInches` (default 0 = off) are user prefs. Shift frees snapping for the
duration of a gesture. Guides (`data-snap-guide`) render automatically while a
preview is active.

## Honesty semantics to preserve

- **No silent partial application** — `commitOpPatches` reports `'unavailable'`
  when a patch list fits no mounted channel; the toolbar disables rather than
  half-applies.
- **No fake multi undo** — `scene-multi` entries carry `target:null`; a
  single-row apply throws on `.index` and the store reports `'rejected'` with
  stacks untouched. Mount anchor 3 for real multi undo.
- **CAS domain is all-or-nothing** — record and observe anchors must share the
  full-scene domain or every entry quarantines `stale`/`rejected`. The canvas
  keeps both in `sceneLayoutAnchor({items, poles, walls})`; page anchors must
  match.
- **Locked/read-only** — `resolveOpTargets` `opts.isLocked` and `opts.readOnly`
  reject honestly; the canvas only gates on `editable` + `item.locked===true`.
  A page-level lock field maps through when the page adds one.
- **Atomic typed commits** — `typedItemPatch` rejects the whole op on any bad
  field; the canvas only calls it after the ft/in boundary parses, and stores
  canonical inches.

## Live seam summary (what the canvas uses today)

- O-038 transforms: `planPointOf`, `planToFrameLocal`, `frameLocalToPlan`,
  `planFrameForRect`, `planViewFromElementRect`, `screenToPlan`.
- O-039 input: `beginSceneDrag`, `sceneDragCorner`, `commitSceneDrag`,
  `resolveSceneDragTarget`, `keyboardNudge`, `nudgePatch`,
  `hitTestPlanAll`, `snapCandidatesForScene`, `itemPlanGeometry`,
  `wallPlanGeometry`, `sceneEditFromDrag`, `sceneEditFromNudge`,
  `sceneEditCoalesceKey`.
- O-034 selection: `createSceneSelection`, `beginClickCandidate`,
  `isClickRelease`, `sceneNodeId`, `selectHit`, `applyKey`,
  `beginMarquee`/`updateMarquee`/`commitMarquee`/`cancelMarquee`,
  `reconcile`, `entries`, `resolveSceneNode`, `parseSceneNodeId`.
- O-040 history: `createSceneHistory`, `sceneLayoutAnchor`, `recordEdit`,
  `beginStroke`, `commitStroke`, `observe`.
- O-035 edit ops (new module): `resolveOpTargets`, `translateTargetPatch`,
  `sceneWithOpPatches`, `opSceneWithPatches`, `patchesFitSingleItemChannel`,
  `editRecordForPatches`, `beforeFieldsOf`, `moveSelectionPatch`,
  `beginItemResize`, `resizeItemFromHandle`, `itemResizePatch`,
  `beginItemRotate`, `rotateItemFromPointer`, `rotateItemBy`, `rotateItemTo`,
  `alignSelectionPatch`, `distributeSelectionPatch`, `typedItemPatch`,
  `typedPolePatch`, `deleteSelectionPlan`, `duplicateSelectionPlan`,
  `snapDraggedItem`, `snapBoundsDelta`, `snapCandidatesOutside`,
  `planBoundsOfItem`, `planBoundsOfPole`, `planBoundsOfWall`, `targetsBounds`,
  `ITEM_RESIZE_HANDLES`, `ALIGN_EDGES`, `DISTRIBUTE_AXES`,
  `MIN_ITEM_SIZE_INCHES`, `ROTATE_SNAP_DEGREES`, `ROTATE_KEY_STEP_DEGREES`,
  `ROTATE_KEY_BIG_STEP_DEGREES`, `DEFAULT_SNAP_TOLERANCE_INCHES`,
  `DEFAULT_DUPLICATE_OFFSET_INCHES`, `SCENE_OP_KINDS`.
- O-093 entry boundary: `parseFoundationDimension`, `formatFoundationDimension`.
