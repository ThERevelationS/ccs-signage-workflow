# O-034 — Deferred page-wiring mount anchors

Work item: `O-034 [OPEN] (CMP-C03) Synchronize object tree, selection, properties panel, highlights, and parent breadcrumb.`

This unit ships **candidate files only**. The selection model + canvas seam are implemented and verified locally; the page-level synchronization that finishes CMP-C03 is deferred because `src/pages/FoundationEstimator.jsx` is ownership-protected in this unit and must be edited by its owner in a follow-up mount step.

Everything below is a concrete anchor — where to wire, what to pass, and what the store already provides.

---

## 1. Page-owned selection store (`sceneSelection` prop)

**Where:** `FoundationEstimator.jsx`, next to the existing O-040 `createSceneHistory` / `useSyncExternalStore` block.

```js
const sceneSelection = useMemo(() => createSceneSelection(), []);
const selState = useSyncExternalStore(sceneSelection.subscribe, sceneSelection.getVersion);
```

**Mount:**
```jsx
<FoundationLayoutCanvas
  ...
  sceneHistory={sceneHistory}
  sceneSelection={sceneSelection}          // NEW — page owns the store
  onDeleteSelection={(entries) => { /* route to page delete/commit path */ }}
/>
```

- `sceneSelection` is optional; the canvas falls back to an internal store so the component stays self-contained (same mount shape as `sceneHistory`).
- `onDeleteSelection(entries)` is the **delete hook point**: the model fires `delete-request` on Delete/Backspace with the selected entries; the page decides what to remove (foundation rows → `patchItem`/`setItems`, poles → pole removal path, etc.). The canvas never mutates business data.
- Store API surface (all in `foundationSceneSelection.js`):
  - `selection.getState()` → `{ ids, primaryId, part, entries, marquee }`
  - `selection.subscribe(fn)` / `stateVersion` — `useSyncExternalStore`-compatible
  - `selection.entries()` → resolved node descriptors (see §2)
  - `selection.setSelection(ids, {primaryId})`, `.clear()`, `.select(id, opts)`, `.toggle(id, opts)`
  - `selection.reconcile(scene)` — called inside the canvas on every array change; page calls it too if it edits the scene outside the canvas.

## 2. Object tree mount + sync

**Where:** a new object-tree panel (the CMP-C03 scene tree) inside the foundation estimator workspace.

- Tree source: `buildSceneTree(scene)` (pure, exported) — returns the ordered node list across `items`, `walls` (+ `wall-segment` children), `wall_caps`, `poles`, `signage_cabinets`, with `parentId` links resolved through `foundationAssemblyModel` parent references (component_id / legacy / positional fallback).
- Node shape: `{ id, collection, index, part, label, parentId, depth }` — `id` is a stable `"collection:key"` string (`component:` / `legacy:` / `index:`), `part` carries `{type:"face"|"edge"|"vertex"|"segment", ...}`.
- Sync is one-directional already: tree renders `selState.ids` (multi) + `selState.primaryId`; row click calls `selection.setSelection([id], {primaryId:id})`; ctrl-click calls `selection.toggle(id)`.
- The canvas re-renders on `stateVersion`, so panel→canvas highlight sync is free once the page subscribes.

## 3. Properties panel sync

**Where:** the existing foundation properties/inspector surface in `FoundationEstimator.jsx` (the right-side editors fed by the selected row).

- Read `selection.entries()[0]` (or `selState.primaryId` → `describe(id, scene)`) to get `{ collection, index, item, part, parentId, label }`.
- `collection` tells the panel which editor to show: `items` → foundation editor, `poles` → pole editor, `walls`/`wall-segment` → wall/segment editor, `wall_caps`/`signage_cabinets` → cabinet editor.
- `index` is the *live* array index — safe for `patchItem(index, patch)`-style writes because the model re-resolves ids → indexes on every `reconcile`.
- Multi-select: `entries().length > 1` → show the multi-select inspector (count + shared fields only); `primaryId` marks the lead.

## 4. Highlight sync (canvas ↔ page overlays)

- Canvas-side already renders: `data-selected`/`data-primary` styling, 4 corner handles on the primary (editable only), `aria-pressed`, marquee rubber band (`data-marquee`).
- Page-side overlays (elevation/3D scenes in later units) subscribe to the same `sceneSelection` store and map `entries()` → their object ids via `collection`+`item.component_id`.
- No pricing path is touched anywhere — selection state is entirely orthogonal.

## 5. Parent breadcrumb sync

- `describe(id, scene).parentId` / `node.parentId` from `buildSceneTree` gives the chain: e.g. `wall-segment → wall`, `wall_cap → wall`, `signage_cabinet → mount parent`.
- Breadcrumb renders `resolveAncestors(id, tree)` (exported) → `[root … parent]` labels.
- Unresolved/malformed parent references resolve to `null` honestly — the model never fabricates a parent.

## 6. What is intentionally NOT in this unit

- No `FoundationEstimator.jsx` edit (ownership-protected) — the `sceneSelection`/`onDeleteSelection` props above are the contract.
- No object-tree / properties-panel / breadcrumb UI components — those are the CMP-C03 panels the model feeds.
- No elevation/3D scene consumers — they consume the same store when they land.
- `foundationSceneHistory.js` untouched — no missing seam found; the canvas consumes its existing exports only.
