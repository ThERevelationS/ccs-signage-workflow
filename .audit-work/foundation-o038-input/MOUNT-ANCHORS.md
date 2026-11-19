# O-038/O-039 mount anchors — where each later item consumes these modules

Anchor = the exact call site where a consumer plugs in. All modules are pure;
no DOM/React required except where noted. Verified at remote HEAD
`2083c6dbbd1f8f89cc79f40b3212ab82aa563a0a`.

## Coordinate spaces (O-038 contract)

| Space    | Units   | Frame                                                        |
|----------|---------|--------------------------------------------------------------|
| plan     | inches  | x→east across 480, z→south down 320, origin NW corner        |
| screen   | css-px  | client frame of getBoundingClientRect / clientX/Y (+x→,+y↓)  |
| world    | feet    | right-handed Y-up: x=x_in/12, y=elev_in/12, z=z_in/12        |
| rotation | degrees | about footprint center; plan/screen = CSS direction (+x→+z)  |

## Mount anchors by item

**O-040 (undo coalescing)** — `commitSceneDrag(drag, releasePoint)` is the
single place a gesture becomes a patch. A consumer wraps the canvas's
`commitDrag`/`onMoveItem` pair: collect `beginSceneDrag` at pointerdown and
the final `commitSceneDrag` result at pointerup → one undo record per
gesture. `drag.moved` is already carried on the record.

**O-041 (renderer)** — `planToWorld`/`worldToPlan`/`planRotationToWorldRadians`
map authored plan geometry to the three.js convention Foundation3DPreview
already uses (x=x, z=z, y=elevation, feet). `planViewForViewport` gives a
uniform-scale contain-fit for any future 2D/SVG renderer;
`zoomPlanViewAt`/`panPlanView` cover wheel-zoom and pan.

**O-034 (tree/selection/highlights)** — `hitTestPlan(scene, point)` /
`hitTestPlanAll` return `{kind, collection, index, key, componentId, label}`.
`key` is the canvas's `layoutItemKey` identity — selection state can key off
it directly. `hitLabel`/`sceneObjectLabel` give display labels.

**O-035 (move/typed coords/snap)** — `positionPatch` (typed coordinates →
`{x_inches,z_inches}`), `nudgePatch` (delta → patch),
`snapCandidatesForScene` + `snapToCandidates` (alignment guides + bounds),
`snapPlanPoint` (grid). `planViewForBounds` is the fit-to-selection basis.

**O-036 (attach/detach/mount handles)** — `itemPlanGeometry(item)` returns
the resolved `{corner, size, center, frame, circular}`; `framePlanCorners`
gives the four mountable corners in plan space; `item-edge`/`item-vertex`
hit kinds identify which feature is grabbed.

**O-037 (fit/scale labels)** — `planViewForBounds(bounds, viewport,
{padding})` centers arbitrary bounds; `planToExtentPercent`/
`extentPercentToPlan` cover the percent seam; `clampPlanPoint`/`pointInPlan`
for constraint surfaces.

**O-042 (conflict/clearance diagnostics)** — `hitTestPlan` is the
click-to-object navigator; `itemPlanGeometry`/`wallPlanGeometry` normalize
geometry for clearance checks; `classifyPlanPoint` separates off-plan from
misses.

**O-043 (export)** — `planViewForViewport({viewport})` + `planToScreen`
project plan geometry into SVG/PDF coordinates deterministically;
`planToExtentPercent` covers percent-based export templates;
`hitLabel`/`sceneObjectLabel` label exported objects.

**D/E/F scene work** — `wallPlanGeometry` + `hitWall` already understand
`shape.points`/`shape.closed`/segment indexing (assembly contract incl.
component_id carry-through); poles hit-test as points; item/pole/wall layer
order is caller-tunable via `opts.order`.

## Live seam summary (what the canvas uses today)

- `layoutPointInches(clientX, clientY, rect)` → `planViewFromElementRect` +
  `screenToPlan` (foundationLayoutModel.js — the rect IS the view; never
  rescale by zoom).
- `onPointerDown` → `beginSceneDrag` (gesture record).
- `onPointerMove` → `sceneDragCorner` (preview corner).
- `commitDrag` → `commitSceneDrag` + `resolveSceneDragTarget` (patch +
  identity/fingerprint guards).
- `onKeyDown` → `keyboardNudge` + `nudgePatch` (arrow/shift/modifier rules).
- Not yet wired (awaiting consumers listed above): `hitTestPlan*`,
  `snap*`, `normalizeScenePointer`, `positionPatch`, `planViewFor*`,
  `zoomPlanViewAt`, `panPlanView`, `*Label`.
