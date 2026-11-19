# O-040 mount anchors — wiring the scene history into the page's undo surface

Anchor = the exact call site where a consumer plugs in. All modules are pure;
no DOM/React except the canvas component itself. Verified at remote HEAD
`9a872e9248c57e9b468881baecf7b899248f5c24` (owned surfaces byte-identical to
the `8a4ad456c` pull baseline).

## What is already wired (candidate state)

`FoundationLayoutCanvas` records every committed gesture into a
`createSceneHistory` store at its existing O-039 input seam:

- `commitDrag` → `sceneEditFromDrag(d, patch)` → `history.recordEdit(...)` —
  one command per gesture; `d.corner` (captured by `beginSceneDrag`) is the
  inverse patch.
- `onKeyDown` → `sceneEditFromNudge(key, pos, patch)` → `recordEdit` with
  `coalesceKey: nudge:<layoutItemKey>` — a held/repeated arrow burst on one
  row merges into ONE command inside `coalesceWindowMs` (default 1200ms).
- `useEffect(items)` → `history.observe(sceneLayoutAnchor(items))` — the
  geometry CAS reconciliation; any items change that did not arrive through
  the canvas's own recorded strokes detaches the undo chain.
- `onMoveItem` returning `=== false` (the page `commit` refusal) skips
  recording — nothing landed means nothing to undo.

With no `sceneHistory` prop the canvas uses an internal store — zero behavior
change when unmounted (verified: 9-step remote-parity replay, 0 diffs).

## Deferred anchor 1 — store + prop (FoundationEstimator.jsx, ~L1487)

```jsx
// near the other editor refs (editRevisionRef, draftSessionRef, ...):
const sceneHistoryRef = useRef(null);
if (!sceneHistoryRef.current) sceneHistoryRef.current = createSceneHistory();
const sceneHistory = sceneHistoryRef.current;
// re-render on history mutations for undo UI:
useSyncExternalStore(sceneHistory.subscribe, () => sceneHistory.stateVersion);
```

```diff
 <FoundationLayoutCanvas
   items={project.items || []}
   poles={project.poles || []}
   onMoveItem={patchItem}
+  sceneHistory={sceneHistory}
 />
```

`useSyncExternalStore` is already a React 18 builtin; `useRef`/`useState` are
already imported by the page. `useSyncExternalStore` would need adding to the
React import (or use `useReducer` + `subscribe` in `useEffect`).

## Deferred anchor 2 — undo/redo application

The store returns patch-shaped payloads; apply through `patchItem` (the same
`commit` channel the canvas already uses — CAS guards, normalize, draft
backup all stay in force):

```jsx
const sceneUndo = () =>
  sceneHistory.undo(sceneLayoutAnchor(projectRef.current?.items || []),
    (rev) => patchItem(rev.target.index, rev.patch) !== false);
const sceneRedo = () =>
  sceneHistory.redo(sceneLayoutAnchor(projectRef.current?.items || []),
    (rev) => patchItem(rev.target.index, rev.patch) !== false);
```

`rev.patch` is `{x_inches, z_inches}` for item-move entries; `rev.target.index`
was resolved under the same anchor the undo is CAS-checked against, so the
patch lands on geometrically-identical rows only. A refused `commit` returns
false → `undo` reports `'rejected'` and mutates nothing.

## Deferred anchor 3 — undo UI coexistence with page snapshot history

The page's `history.past/future` (L115, L765–787) already gives whole-project
snapshot undo where every `commit` is one entry. The scene store is a
companion, not a replacement:

- **Recommended routing:** scene-undo buttons/shortcut try `sceneUndo()`
  first; when it reports `'applied'` the gesture is reverted with
  stroke-level fidelity. Fall back to the page `undo()` for non-scene edits.
- **Honest quirk (documented):** a scene-undo application goes through
  `commit`, which pushes a page-snapshot entry — the page's own undo can then
  revert the revert. If that dual-tracking is undesirable, the page needs a
  `commit(updater, { skipHistory: true })` option — a page-owned change for
  the B-3 phase, not this unit.
- `canUndo`/`undoLabel` from `sceneHistory.getState()` feed button state +
  tooltips ("Undo Move Foundation 2").

## Deferred anchor 4 — context reset

On `contextKey` change (project/source switch — the block at L136–153), call
`sceneHistory.clear(sceneLayoutAnchor(nextItems))` — or simply let the first
post-switch `observe` detach everything (safe, lazy). `clear` is the explicit,
immediate reset.

## Deferred anchor 5 — future stroke consumers (paint tools, vertex drags)

`beginStroke/extendStroke/commitStroke/cancelStroke` cover gestures that land
multiple sub-edits (grid paint, wall vertex drags once O-035/O-044 surfaces
exist): begin captures pre-stroke state + anchor, each landed sub-edit
extends, commit records ONE entry. `observe` mismatch mid-stroke cancels the
record safely.

## Live seam summary (what the canvas uses today)

- `layoutPointInches` → `planViewFromElementRect` + `screenToPlan` (O-038).
- `onPointerDown` → `beginSceneDrag`; `onPointerMove` → `sceneDragCorner`;
  `commitDrag` → `commitSceneDrag` + `resolveSceneDragTarget` + NEW
  `sceneEditFromDrag` + `history.recordEdit`.
- `onKeyDown` → `keyboardNudge` + `nudgePatch` + NEW `sceneEditFromNudge` +
  `history.recordEdit` (coalesced).
- NEW `sceneLayoutAnchor` on every `items` change → `history.observe`.
- NEW optional prop `sceneHistory`; internal store fallback always active.
