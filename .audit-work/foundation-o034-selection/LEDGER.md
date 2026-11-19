# O-034 ledger — claim-safe record

**Work item:** `O-034 [OPEN] (CMP-C03) Synchronize object tree, selection, properties panel, highlights, and parent breadcrumb.` (`ESTIMATOR_MASTERPLAN.md`)

**Scope discipline:** candidates only under `.audit-work/foundation-o034-selection/`. No `sandbox write`/`edit`/`checkpoint`, no publish/deploy, no entity operations. Local `src/` was never trusted — all baselines are fresh `sandbox read` pulls.

## What was produced (local candidates)

- `o034-candidate-foundationSceneSelection.js` — new pure module (49,502 B, ~1,100 lines): stable scene-node ids across all five assembly arrays + wall segments, `buildSceneTree`, `describe`/`resolveAncestors` parent chains, `hitTestPlanAll`→node conversion, additive ctrl/shift multi-select with toggle + primary tracking, marquee region select with click-vs-drag threshold, Tab/arrow cycling, Escape clear, Delete/Backspace as a `delete-request` hook (never mutates business data), reorder/delete reconciliation that upgrades minted component ids and drops vanished positional ids, and a `createSceneSelection` external-store (`subscribe`/`useSyncExternalStore`-shaped).
- `o034-candidate-FoundationLayoutCanvas.jsx` — candidate canvas (23,069 B): wires the model at the existing pointer seam, renders selected outlines + primary handles + rubber band, keeps O-039 drag/commit and O-040 history recording verbatim, adds opt-in props `walls`, `wallCaps`, `signageCabinets`, `sceneSelection`, `onDeleteSelection` (all optional — backwards compatible), and keeps read-only interaction safe (selection works, geometry writes don't).

## Verification performed (local only)

- **Model suite** (`verify-o034-model.mjs`, Node, pure): **PASS — 21 assertion groups** covering hit→select→resolve across `items`/`walls`/`wall-segment`/`wall_caps`/`poles`/`signage_cabinets`, face/edge/vertex/segment parts, z-top-wins order, additive/toggle/primary, marquee intersect, Tab cycle, Escape, delete-request hook, drag-threshold, reorder/delete reconcile, missing ids, malformed rows, unresolved parents, degenerate geometry (`o034-model-verification.json`).
- **Bundle** (`build-bundle.cjs`, esbuild, staging tree = remote modules + candidates only): **clean — 6 module inputs, no warnings** (`bundle-metafile.json`, `o034-page-bundle.js`, `o034-browser-inputs.json`).
- **Real-component browser suite** (`verify-o034-browser.mjs`, system Chrome channel, real DOM geometry at 1280×900): **PASS — 11/11 scenarios** — click-select id+part+highlight+handles, ctrl/shift additive + toggle + primary tracking, empty-click clear / additive keep, marquee region select, additive marquee union, drag-keeps-selection + wiggle-click disambiguation, keyboard cycle/focus/delete-hook/Escape, z-top-wins pole-over-item, reconcile across delete+reorder, read-only select+marquee, O-039/O-040 seam intact (one drag = one history command) (`o034-browser-verification.json`, `o034-browser-canvas.png`).

## Remote state at verification time

- Baseline pull HEAD: `a11be3a85db0cf0800f3015a4be6d55e7c43407a` (2026-11-08).
- Recheck HEAD: `eda27bec29a70d56a5f4b7388bf32589f0059047` — remote advanced by unrelated commits; **all eight pulled files byte-identical to baseline** (sha256 re-verified).
- `src/components/estimator/foundation/foundationSceneSelection.js`: confirmed **absent** on remote at recheck (new file is a genuine addition, not a collision).
- `foundationSceneHistory.js`: consumed as-is; no missing seam found → no edit needed, dependency documented in `MOUNT-ANCHORS.md`.

## What is NOT claimed

- O-034 is **not** applied to the remote app; no remote files were changed.
- CMP-C03's full "synchronize object tree ↔ properties panel ↔ breadcrumb" end-state is **deferred**: the page mount (`sceneSelection`/`onDeleteSelection` props), object-tree panel, properties-panel sync, and breadcrumb render are follow-up wiring documented in `MOUNT-ANCHORS.md`. This unit delivers the selection model + canvas seam + verification that make that wiring possible.
- No pricing, save/recovery, or estimator lifecycle code was touched.
