# WS-O Remaining-Item Map — Concrete | Masonry | Pole

**Date:** 2026-11-08 · **Source:** `ESTIMATOR_MASTERPLAN.md` L523-716 (WS-O ledger) + `ESTIMATOR_CONCRETE_MASONRY_POLE_MASTERPLAN.md` (CMP detail + §5 phase table) · **Scope:** all `[OPEN]` `O-*` items · **Mode:** READ-ONLY analysis; no sandbox writes.

## Dependency classes

- **(a) implementable now** on current remote checkpoint (no Phase B-2 UX, no publish needed)
- **(b) needs Phase B-2+** — reinforcement editor/proposal UX (in flight), support model, or shared scene/visual-assembly work (sub-tags: `b-editor`, `b-support`, `b-scene`, `b-ai`, `b-late`)
- **(c) needs live/published proof** — real sessions, business records, published endpoints, paid AI
- **(d) needs cross-module or out-of-scope work** — other estimator modules, invoicing, FileBridge, engineer sign-off, external asset/license decisions, Brett decision required

## Phase map (CMP masterplan §5)

| Phase | Covers | Status |
|---|---|---|
| 1 — Integrity (WS-A) | O-001–O-014 | Core landed; tails open (O-004/007/008/009/010/012/013/014) |
| 2 — Rebar/support + visual-assembly foundation (WS-B) | O-015–O-032 | B-1 schema+dispatch live `a9ffbbdb`; **B-2 editor/proposal UX in flight** |
| 3 — Walls, poles, signs, caps, scene editor (WS-C/D/E) | O-032–O-067 | Not started (O-032 2D subunit landed) |
| 4 — AI design agent (WS-G + shared W-012..022) | O-078–O-091 | Not started; no `estimatorDesignAction`/`foundationDesignAction` function exists yet |
| 5 — Landscape/assets + QoL/handoff (WS-F/H) | O-068–O-077, O-092–O-101 | Not started |
| 6 — Regression/release | all | — |
| Research lane (WS-I, lead-owned, parallel) | O-102–O-121 | Only CMP-SUP-001 register entry seeded |

## Already-progressed items — status only (per orchestrator; not re-analyzed)

| Item | Landed | Remaining tail |
|---|---|---|
| O-004 (CMP-A04) | draft store + Restore/Discard + dirty-route guard | storage death beyond tombstone; draft↔source merge conflicts; conflict recovery; partial Builder-sync retry; live authz |
| O-007 (CMP-A07) | 31 template fields, pricing sanitize, copy carries estimate_number/links/engine | quote lineage (O-012); accepted-design v2 part model; `ai_engineering_data.source_key` staleness on apply |
| O-008 (CMP-A08) | `inventoryNormalization.js` boundary consolidation | supplier grouping; form-init `\|\|0` presets + `openAdd` minted-0; `normalizeConcreteSupplier` `default_rate\|\|0`; non-CMP surfaces |
| O-009 (CMP-A09) | pole/cap/wall + equipment + concrete/rebar/forming integrity | inactive/unpriced/free classification; invalid rates/types/geometry; unassigned defaults; supplier grouping; live authz |
| O-010 (CMP-A10) | 12-field canonical totals, precedence ladder, advisory strips | WO→invoice exact-once tail needs live-record evidence |
| O-011 (CMP-A11) | cabinet/landscape/equipment extraction | rebar supports + v2 rebar-mat parts (Phase B) |
| O-012 (CMP-A12) | chain contract hardening (5 gaps closed) | real business-record lifecycle; dup/split `project_id`+`builder_product_id` policy gap; live null-clear proof |
| O-013 (CMP-A13) | 252-entity RLS static audit; F-2/3/4 fixes | real-session revocation/expiry; runtime probes; portal-token expiry; `fileBridgeMaintenance` anon-invoke (F-1 = FileBridge, out-of-scope, surface to Brett) |
| O-014 (CMP-A14) | audit found no false-Saved paths; template dialog `saveDisabled` landed (O-007 wire completes page wiring) | scoped ESLint at HEAD; stale-success audit beyond Foundation (other modules) |
| O-015 (CMP-B01) | basic dims/count/active-field validation | broader unit/rate/override/reinforcement validation; large-scene limits; engineering acceptance |
| O-016 (CMP-B02) | phaseb1 calc path (single-mat horizontal steel separate) | editor/proposal UX + `reinforcement_design` authored path — **Phase B-2 in flight** |
| O-018 (CMP-B04) | legacy input syntax/range guards | cover/elevation/clearance/placement authored model; engineering acceptance — Phase B-2 |
| O-021 (CMP-B07) | `rebar_support` schema enum + 12 metadata fields | catalog/admin UI; selection modes (O-022); economics (O-027); BOM parts |
| O-030 (CMP-B16) | **DONE** — construction advisories channel | — |
| O-031 (CMP-B17) | `calculateVersionedItem` dispatch; v1 byte-identical; v3 holds | proposal panel + acceptance UX (B-2); `engineering_approved` gate; cost-delta display |
| O-032 (CMP-C01) | 2D plan placement (480x320 projection, drag/pointer) | front/side elevation + 3D parity — scene phase |

## Batch 1 — Phase-1 tails (progressed items, remaining subunits)

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-004 tail | Per-tab storage death/eviction beyond write-refusal tombstone; draft↔source merge-conflict resolution beyond `baseUpdatedAt` warn; conflict-recovery UX; partial Builder-sync retry; live authorization | **(a)** conflict UX + retry; **(c)** live authz; storage-death realism is mostly **(c)** | `foundationDraftRecovery.js`, `foundationSyncRecovery.js`, `foundationSaveSession.js`, `FoundationEstimator.jsx` | O-012 tail (sync recovery files); O-095 (draft surfaces); Phase B-2 page edits |
| O-007 tail | Quote lineage preservation; accepted-design v2 part model; `ai_engineering_data.source_key` provenance staleness detection on template apply | **(a)** source_key stamp; **(b-editor)** v2 part model; lineage **(c/d)** via O-012 | `foundationTemplateService.js`, `foundationTemplateModel.js`, `FoundationTemplateDialog.jsx` | O-094 (templates); O-099 (revision model) |
| O-008 tail | Supplier grouping in catalog UX; kill form-init `\|\|0` presets + `openAdd` minted-0 defaults; `default_rate\|\|0` verbatim policy; non-CMP surfaces | **(a)** all CMP parts; **(d)** non-CMP surfaces | `FoundationInventory.jsx`, `FoundationCatalog.jsx`, `FoundationMaterialDialog.jsx`, `inventoryNormalization.js`, `foundationFieldSchema.js` | O-009 tail (same catalog files); O-021 catalog UI; O-046 |
| O-009 tail | Missing/deleted/**inactive**/unpriced-vs-free classification; invalid rates/types/geometry checks; unassigned-default warnings; supplier grouping; live authz | **(a)** classification+checks; **(c)** authz | `foundationCatalogIntegrity.js`, `FoundationInventory.jsx`, `FoundationCatalog.jsx` | O-008 tail; O-021; O-022 (`off` mode honesty depends on this) |
| O-010 tail | WO→invoice exact-once ownership on real records | **(c)** (live-record evidence); code seams already verified | `invoicingAction` chain reads only | O-012 tail; out-of-module invoice surfaces (**d**-adjacent but in estimator scope per AGENTS) |
| O-011 tail | Builder part extraction for rebar supports + v2 rebar-mat part model | **(b-support/b-editor)** — needs support model (O-021–027) + v2 parts | `foundationReinforcementWorkOrderPart.js`, `foundationReinforcementPartDescriptors.js`, `FoundationBOM.jsx`, `builder/partSync.js` | O-025, O-027, O-043, O-066, O-100 (same extraction files) |
| O-012 tail | Real business-record lifecycle evidence; dup/split `project_id`+`builder_product_id` policy gap; live entity null-clear | **(c)** lifecycle evidence; policy gap needs **(d)** Brett decision then **(a)** fix | `estimateCreationService.js`/dup-split paths, `foundationSyncRecovery.js` | O-004 tail; O-066 (link preservation) |
| O-013 tail | Real-session revocation/expiry; `complete_manual_revision` runtime probe; `jurisdiction_research` non-admin breadth; portal-token expiry/cross-customer rejection | **(c)** published-endpoint probes only | none (probe-only) | none — can batch with any live gate |
| O-014 tail | Scoped ESLint run at HEAD; stale-"success" audit beyond Foundation | **(a)** lint; **(d)** cross-module audit | none new (audit) | none |
| O-015 tail | Broader unit/rate/override/reinforcement/other-assembly validation; large-scene limits; engineering acceptance | **(a)** non-rebar validation; **(b-editor)** rebar-side inputs; **(d)** engineering acceptance | `foundationInputValidation.js`, `foundationGeometryInputs.js`, `FoundationItemCard.jsx` | **B-2 in-flight owns reinforcement input surfaces**; O-018, O-045 |

## Batch 2 — Phase-B remainder (rebar/support model + versioned acceptance)

Phase-B items share the `foundationReinforcement*.js(x)` cluster + `foundationInputValidation.js` + `foundationCalc.js` rebar paths — **in-flight B-2 (O-016/018/019/031 UX) owns these files now**. New dispatches here must wait for or merge with B-2.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-016 | Single-mat horizontal steel ≠ inter-layer ties, authored + accepted via editor/proposal UX | **(b-editor)** in flight | `foundationReinforcementProjection.js`, `foundationReinforcementProposal.js`, `FoundationReinforcementProposalPanel.jsx`, `useFoundationReinforcementEditor.js` | whole B-2 cluster |
| O-017 | Pillar longitudinal bars survive when pillar has only one hoop layer | **(a/b-editor)** — v1 guard could land in `foundationCalc.js` legacy path now; proper fix rides B-2 model | `foundationReinforcementModel.js`/`foundationCalc.js` (pillar branch) | B-2 files; O-018 (pillar hoop/bar model) |
| O-018 | Explicit cover, mat elevations, spacing, layer count, valid clearances | **(b-editor)** in flight; engineering acceptance **(d)** | `foundationReinforcementModel.js`, `foundationInputValidation.js`, `FoundationItemCard.jsx` | O-015 tail |
| O-019 | Top-mat preset for thick-footing/single-layer workflow | **(b-editor)** — `reinforcement_design` authored path | `foundationReinforcementModel.js`, `foundationReinforcementDraft.js`, proposal panel | O-020 (placement explicitness) |
| O-020 | Explicit top/bottom/multilayer placement; engineer-approved design governs structural placement | **(b-editor)**; engineer-approval gate **(d)** | `foundationReinforcementModel.js`, `foundationReinforcementEditorSession.js`, `reinforcement_acceptance` field flow | O-019, O-031 (acceptance UX) |
| O-021 tail | `rebar_support` catalog/admin UI (type fields already in `FoundationInventory.jsonc`) | **(a)** — pure catalog UI, no support model needed | `FoundationInventory.jsx`, `FoundationReinforcementCatalogMetadataFields.jsx`, `foundationReinforcementCatalogMetadata.js` | O-008/O-009 catalog cluster — **only B-adjacent item safe to run during B-2** |
| O-022 | Support modes `auto`/`manual`/`off`; `off` needs explained condition, never silent build-ready | **(b-support)** — needs support model + item design fields | `foundationReinforcementModel.js`, schema `items.reinforcement_design`, editor session | O-023–O-028 sequential |
| O-023 | Bottom-resting stands: feet on concrete bottom, rise to mat w/o violating cover/clearances | **(b-support)** — support geometry solver | new `foundationSupportModel.js` (suggest), `foundationReinforcementProjection.js` | O-024/025 sequential |
| O-024 | Derive stand height (bottom→mat bearing incl. bar thickness); pick compatible catalog support or report none | **(b-support)** — consumes O-021 catalog rows | `foundationSupportModel.js`, `foundationReinforcementCatalogMetadata.js` | O-021 tail (catalog rows), O-026 |
| O-025 | Stand geometry/counts separate from structural vertical steel + inter-mat ties | **(b-support)** — model + part separation | `foundationReinforcementModel.js`, `foundationReinforcementPartDescriptors.js`, BOM rows | O-011 tail (part extraction) |
| O-026 | Support placement/counts from reviewed spacing/edge rules + manual overrides; no invented density | **(b-support)** + consumes research **O-111/O-113** rule registry | `foundationSupportModel.js`, future `foundationRuleRegistry.js` | O-113 (rules), O-024 |
| O-027 | Supports → quantities, pack rounding, labor, BOM, Builder parts, internal+customer pricing, purchasing, save/reopen, 3D | **(b-support)** — wide integration | `foundationCalc.js`, `foundationSellPricing.js`, `FoundationBOM.jsx`, `partSync.js`, preview3D | O-011 tail, O-033 (3D), O-025/026 |
| O-028 | Edge cases: no-rebar/no-support, 1/N layers, pillars, obstructions, quantity instances; flag infeasible | **(b-support)** — solver edge matrix | `foundationSupportModel.js`, `foundationInputValidation.js` | O-023–O-026 |
| O-029 | Rebar cut/bend schedule, stock-length/waste accounting, exploded/section views | **(b-support)** schedule; **(b-scene)** views | new `foundationRebarSchedule.js`, `foundationReinforcementPrintMaterial.js`, preview3D | O-043/O-100 (export surface) |
| O-031 tail | Proposal panel + acceptance UX; `engineering_approved` gate; cost-delta display | **(b-editor)** in flight; gate **(d)** | proposal panel, `foundationReinforcementProposal.js`, `FoundationTotals.jsx` (delta display) | O-016/018/019/020 |
| O-032 tail | Front/side elevation + 3D parity with measured 2D placement | **(b-scene)** | `foundationLayoutModel.js`, `Foundation3DPreview.jsx`, new elevation renderer | C-series infra (O-034–O-041) |

## Batch 3 — WS-C shared scene & editing (O-033–O-043)

All Phase-3 scene work. Foundation: `foundationAssemblyModel.js` (stable IDs/relations landed), `FoundationLayoutCanvas.jsx` (2D plan), `Foundation3DPreview.jsx` + `foundationPreviewCamera.js` + `foundationPolePreview3D.js` (existing thin 3D). Recommend a new `scene/` file cluster (e.g. `foundationSceneModel.js`, `FoundationSceneTree.jsx`) rather than growing the canvas.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-033 | Render foundations, masonry, caps, poles, signs, reinforcement, supports, landscape in shared scene | **(b-scene)**; partial (fdns+poles) could start once render-model seam exists | `Foundation3DPreview.jsx`, new scene model | consumes D/E/F object models — sequence after or with adapters |
| O-034 | Object tree + selection + properties panel + highlights + parent breadcrumb stay in sync | **(b-scene)** | new `FoundationSceneTree.jsx`, `FoundationEstimator.jsx` selection state | O-035/036 same selection infra |
| O-035 | Move/rotate/duplicate/delete, typed coords, snap/grid, alignment, dimensions | **(b-scene)** | `FoundationLayoutCanvas.jsx`, `foundationLayoutModel.js`, `FoundationEstimator.jsx` (undo history) | O-040 (undo), O-038/039 (transforms/input) |
| O-036 | Attach/detach/reparent w/ world-or-local position choice + visible mount handles | **(b-scene)** — relations model exists | `foundationAssemblyModel.js`, scene tree, `FoundationItemCard.jsx` | O-058 (pole↔footing), O-036↔O-059 mounting |
| O-037 | Layer visibility/lock/isolation, transparent concrete, cutaways, below-grade, fit-to-selection, scale labels | **(b-scene)** | `Foundation3DPreview.jsx`, `foundationPreviewCamera.js` | O-041 (renderer lifecycle) |
| O-038 | Correct screen/world transforms across zoom/aspect/scroll/responsive SVG | **(b-scene)** — foundational, do FIRST in cluster | `FoundationLayoutCanvas.jsx`, shared transform helper | O-035/039/045/070 all depend |
| O-039 | Pointer capture, touch/pen, keyboard manipulation, numeric fallback, labels | **(b-scene)** — foundational input layer | `FoundationLayoutCanvas.jsx`, `foundationGeometryInputs.js` | O-038 (transform math first) |
| O-040 | Drag/paint stroke = one undo command; redo preserved | **(a/b-scene)** — undo infra exists on page; stroke coalescing needs canvas | `FoundationEstimator.jsx` history, `FoundationLayoutCanvas.jsx` | O-035, O-071 (brush strokes) |
| O-041 | Single renderer lifecycle: dispose geo/mats/textures, resize/fullscreen, WebGL failure/context-loss, demand render, bounded complexity | **(b-scene)** | `Foundation3DPreview.jsx`, `foundationPreviewCamera.js` | O-033/037; gate before heavy F-assets |
| O-042 | Conflict/clearance diagnostics w/ click-to-object navigation | **(b-scene)** — needs scene+selection | new diagnostics channel (parallel to `foundationConstructionChecks.js`), `FoundationSectionBanner.jsx` | O-058/065 clash checks feed it; O-097 click-to-fix |
| O-043 | Export labeled plan/elevations/assembly/BOM/presentation images from same accepted revision; concept renders ≠ construction docs | **(b-scene)** export; needs accepted-revision identity (B-2 provides pattern) | new export module, `FoundationBOM.jsx`, elevation/plan renderers | O-100 (production package — merge scheduling), O-118 (design-basis in package) |

## Batch 4 — WS-D masonry walls & caps (O-044–O-055)

Existing: `walls[]` schema w/ `shape.points/segments` + `useExistingFoundation` + cached `calculatedCosts`; `wallCalculator.js`, `wallCapCalculator.js`, `FoundationWallsPanel.jsx`, `FoundationWallCapsPanel.jsx`; `wall_caps[]` already persist wall/segment links (index + `component_id`). Split: **calc/model sub-units = (a)**, **visual editing/acceptance = (b-scene)**.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-044 | Straight, L/U, closed-monument, multi-run wall layouts tied to foundations | **(a-model)** layout types; **(b-scene)** visual authoring | `wallCalculator.js`, `walls.shape` schema, `FoundationWallsPanel.jsx` | O-045/048 |
| O-045 | Editable vertices/lengths/offsets/thickness/height/openings; open/closed, self-intersection, zero-length handling | **(a-model)** validity layer; **(b-scene)** vertex editing | `foundationInputValidation.js`+`wallCalculator.js`, canvas | O-038/039 (input infra), O-015 tail |
| O-046 | Normalize brick/CMU/stone dims; poured concrete ≠ unit masonry | **(a)** — catalog boundary work, mirrors O-008 pattern | `wallCalculator.js`, `inventoryNormalization.js`, `FoundationInventory.jsx` | O-008/009 catalog cluster — **good now-candidate** |
| O-047 | Bond/courses, mortar, waste/cuts, corners/returns, internal/fill — geometry-aware, no one-shortcut reduction | **(a-model)** calc upgrade; scene only for display | `wallCalculator.js` (`calculatedCosts` path) | O-044/045 (new geometry feeds) |
| O-048 | Explicit existing/new foundation assignment; track unsupported wall spans | **(a-model)** assignment+span flags; **(b-scene)** display | `walls.useExistingFoundation` flow, `foundationAssemblyModel.js` | O-036 (attach model), O-042 diagnostics |
| O-049 | "Cap this wall/run/all selected" from actual wall geometry | **(a-model)** generation logic; **(b-scene)** selection UX | `wallCapCalculator.js`, `FoundationWallCapsPanel.jsx` | O-034 selection infra for UX half |
| O-050 | Cap profile/material/width/thickness/overhang/elevation/joints/slope/ends + preview + supported-profile validation | **(a-model)** fields+validation; **(b-scene)** preview | `wall_caps` schema (additive), `wallCapCalculator.js`, `FoundationWallCapsPanel.jsx` | O-052/055 |
| O-051 | Cap segments, corners/miters/end pieces, cuts, overlaps/gaps, cut list | **(a)** — pure geometry generation | `wallCapCalculator.js` | O-049/050 |
| O-052 | Reject/split cut longer than stock; no placement without a wall | **(a)** — pure validation | `wallCapCalculator.js`, `foundationInputValidation.js` | O-051/053 |
| O-053 | Full-stock-per-cut billing default; offcut reuse only as explicit alternative w/ waste/labor/price shown | **(a)** — pricing policy in calc | `wallCapCalculator.js`, `foundationCalc.js` wall-cap totals | O-027 (same calc file later), O-116 |
| O-054 | Rebuild cap placement after wall edits w/o destroying locked manual pieces | **(a-model)** lock+rebuild logic; **(b-scene)** later | `wallCapCalculator.js`, `FoundationWallCapsPanel.jsx` | O-049/051, O-095 locks pattern |
| O-055 | Persist cap→wall/segment IDs; fit validation; stock+supplies+cuts/labor→BOM/pricing/production/3D | **(a-model)** mostly landed pattern; BOM/production/3D **(b-scene)** | `wall_caps` schema (exists), `FoundationBOM.jsx`, `partSync.js`, preview3D | O-011 extraction cluster, O-033 |

## Batch 5 — WS-E poles, signs & mounting (O-056–O-067)

Existing: `poles[]` (pos/height/rotation/foundation link + thin `signs[]`), `signage_cabinets[]` (dims/mount/mount_height/pole+foundation refs/qty/unit_cost), `poleCalculator.js`, `FoundationPolesPanel.jsx`, `foundationPolePreview3D.js`. Sign model is skeletal — E-series needs schema growth.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-056 | Consolidate item-pole (`items.selected_pole_id`) vs project-pole (`poles[]`) without double charging | **(a)** — model/calc consolidation + migration-free adapter | `poleCalculator.js`, `foundationCalc.js`, `foundationAssemblyModel.js` | O-011 extraction, O-057/058 |
| O-057 | Distinguish stock length vs height-above-grade vs embedment vs offset vs shape | **(a)** — pole model fields + calc | `poleCalculator.js`, `poles` schema (additive), `FoundationPolesPanel.jsx` | O-056 |
| O-058 | Snap poles into assigned footing instances w/ position, edge/cover, clash checks | **(a-model)** snap+checks; **(b-scene)** visual snap | `foundationAssemblyModel.js`, `poleCalculator.js`, `foundationInputValidation.js` | O-036 reparent, O-042 diagnostics |
| O-059 | Centered/single, twin/multipole, foundation/wall-top mounting | **(b-scene)** — model partial (a), acceptance visual | `poles` schema, `FoundationPolesPanel.jsx`, scene | O-036, O-033 |
| O-060 | Visual sign editor: dims/faces/cabinet shape/depth/orientation/mount height/offset/artwork/colors/envelope | **(b-scene)** — needs scene + richer sign schema | `signage_cabinets` schema (additive), new `FoundationSignEditor.jsx`, scene | O-061/064/065 |
| O-061 | Reference/artwork upload w/ crop/fit/scale, undo, replace, load failures | **(a)** upload/refs infra (file-ref only, W-013 pattern); **(b-scene)** crop UX | new upload helper, `beautify_data_url`/file-ref fields | O-079 (shared AI intake — align reference contracts), W-013
| O-062 | Typed mounts, brackets/base plates/anchors where supported; unsupported = engineering-review issue | **(a-model)** mount types + flag channel; catalog adds | `signage_cabinets.mount` enum expansion, `FoundationInventory.jsonc` (hardware), issues channel | O-113 rules, O-042 diagnostics |
| O-063 | Integrate existing estimator sign products w/ explicit cost ownership — no double charge for display-only links | **(d)** cross-module link policy + **(a)** ownership logic in extraction | `FoundationItemCard.jsx`/cabinets, `partSync.js`, link fields | O-066, other modules' pricing wires (**d**) |
| O-064 | Several signs per pole/assembly; correct repeated-sign counts | **(a-model)** — `signs[]` exists; counts+placement | `poles.signs` schema growth, `poleCalculator.js` | O-060/065 |
| O-065 | Sign/mount collision, impossible fit, unresolved weight/load, parent validation | **(a-model)** checks; **(b-scene)** display | `foundationInputValidation.js`/new clash checker | O-042 diagnostics, O-106 wind loads |
| O-066 | Sign+mount costs exactly once (purchase/fab/hardware/labor/paint/waste); preserve quote+job links on scene revise | **(a-model)** extraction; link preservation **(c/d)** | `foundationCalc.js`, `FoundationBOM.jsx`, `partSync.js` | O-011 extraction, O-012 links |
| O-067 | All sign/mount changes live in plan/elevation/3D + after save/reopen | **(b-scene)** | scene renderers, persistence adapter | O-032/033/035 |

## Batch 6 — WS-F landscape & asset quality (O-068–O-077)

Existing: `landscape` = free-form material rows priced via `landscapeMaterials.js` + catalog; flat colored-cell presentation only. O-011 landed per-material part minting. Phase-5 work; asset sourcing (O-074/075) is lead-owned and can start early.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-068 | Realistic materials + placed objects replace flat colored cells | **(b-scene)** — needs renderer + assets | `Foundation3DPreview.jsx`, `landscape` model growth | O-074/075 (assets first), O-033 |
| O-069 | Beds/polygons, paths/borders, ground covers, shrubs/grasses/trees/rocks/lights | **(b-scene)**; object model **(a)** seedable | `landscape` schema (typed objects), new `landscapeObjects.js` | O-070/071/073 |
| O-070 | Real scale/rotation/elevation/spacing/clipping/boundaries + foundation setbacks | **(b-scene)** | `landscapeObjects.js`, scene transforms | O-038 transforms, O-069 |
| O-071 | Brush/erase/fill/selection, object editing, grouped placement, stroke-level undo | **(b-scene)** | canvas, `FoundationEstimator.jsx` history | O-039/040 (input+undo infra) |
| O-072 | Site-photo/plan backdrops w/ user-confirmed scale; manual corrections preserved | **(b-scene)**; upload refs **(a)** shares O-061/O-079 infra | backdrop model + canvas layer | O-061/079 shared upload contract |
| O-073 | Visual-only assets vs billable landscaping; catalog quantities, plant counts, bed volume, labor, waste, unpriced warnings | **(a-model)** split+pricing; display **(b)** | `landscapeMaterials.js`, `foundationCalc.js`, `landscape` schema | O-011 parts, O-009 unpriced classification |
| O-074 | Curated realistic CC0 PBR/model sources (not blanket low-poly pack) | **(a)** — lead-owned sourcing/research; **(d)** hosting/license decisions need Brett | `.audit-work/` source register + manifest design | O-075 (manifest follows), O-120 licensing |
| O-075 | Asset manifest: URL/license/author/scale/preview/hashes/bounds/pivot/fallback | **(a)** — schema+file once O-074 has candidates | new `landscape/assetManifest` + manifest json | O-074, O-077 verifies entries |
| O-076 | GLB/texture optimization, shared mats, instancing, LOD, caching, lazy loads; heavy raws out of bundle | **(b-scene)** + build-pipeline care | preview3D loader + manifest consumers | O-041 renderer, O-077 |
| O-077 | Verify foliage transparency/shadows/color/scale/thumbs/CORS/unavailable/low-power fallback per entry | **(a)** harness + **(c)** real-asset live load proof | test harness + manifest approval gate | O-075/076 |

## Batch 7 — WS-G interactive AI design agent (O-078–O-091)

Phase 4. **No `estimatorDesignAction`/`foundationDesignAction` function exists yet** (only `foundationAiReview.js` client review). Requires: new session-authed function (W-020), `references`/`brief`/provenance schema growth (W-013/014), proposal validate/apply contract (W-016/017). Live AI budget hard cap: **FIVE total attempts** — synthetic/mocked default.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-078 | "Start with AI" / "Use a template" / "Build manually" entry point | **(a)** — pure UX gate, needs no AI backend | `FoundationEstimator.jsx` entry/`FoundationToolbar.jsx`, maybe `NewAllInOneEstimate` flow | O-094 templates path |
| O-079 | Multi-photo intake: thumbs, purpose, reorder/remove, notes, type/size validation, upload/privacy consent before AI | **(b-ai)** backend refs; upload infra **(a)** shared w/ O-061/072 | new references model + `FoundationProject` fields | O-061/072 (one upload contract), W-013 |
| O-080 | User marks sign/base/pole/wall/landscape details + known dims on references | **(b-ai)** annotation model; **(b-scene)** if on-canvas | references model + editor | O-079 |
| O-081 | Structured brief: confirmed facts, observations, prefs, missing inputs, conflicts, assumptions, answered Qs | **(b-ai)** — W-014 contract + schema | new `foundationDesignBrief.js`, project fields | W-014 shared shape |
| O-082 | Grouped relevant follow-ups (style/size/weight/mount/fdn/wall/cap/site/eng/scope/budget) | **(b-ai)** — `next_questions` dispatch | `estimatorDesignAction` fn + brief | O-081, W-020 |
| O-083 | Accept "I don't know"; explain why facts matter; concept-only progress w/o fake verified data | **(b-ai)** — brief semantics (no backend needed for modeling) | brief model + intake UX | O-081/082 |
| O-084 | Resolve photo/answer/geometry/catalog contradictions | **(b-ai)** conflict rules in proposal validate | `foundationReinforcementProposal`-style validator generalized | W-017 validator, O-081 |
| O-085 | Propose assemblies/catalog matches/alternatives w/ cost-impact; never invent stock/price/cert/dims/soil | **(b-ai)** — propose dispatch; deterministic calc owns money | `estimatorDesignAction` fn | O-084/086, I-series sources |
| O-086 | Editable proposal preview (assumptions/missing costs/issues/object adds-changes-deletes) before Apply | **(b-ai)** — proposal review UI; B-2 proposal panel is the pattern | proposal panel (generalize), `FoundationEstimator.jsx` | O-031 panel pattern, W-017 |
| O-087 | Apply only schema/referential/base-version-valid changes; one undo; reject unknown fields/nonfinite/huge payloads | **(b-ai)** — validate/apply contract (W-016/017) | new `foundationProposalApply.js` | O-084/086 |
| O-088 | Conversational revisions ("two poles", "cap the perimeter", keep manual position); preserve locked/user decisions | **(b-ai)** — revise dispatch + locks | revise dispatch + assembly locks (O-054 pattern) | O-087, O-054 locks |
| O-089 | Cancel/retry/resume, rate-limit/network errors, bounded context, idempotent apply receipts (no dup objects/paid work) | **(b-ai)** — dispatch plumbing; paid-call receipts | `estimatorDesignAction` fn + client session | W-019 shared, O-087 |
| O-090 | Provenance + review status per generated revision; material geometry/load change invalidates checks/approvals | **(b-ai)** — revision-bound provenance fields | project schema (`design_provenance`), acceptance flows | O-031 acceptance, O-099 revisions |
| O-091 | Test suite: misleading images, unsupported designs, hostile ref text, incomplete answers, stale responses, multi-revision, unavailable services | **(b-ai)** — eval fixtures (mocked model); live AI proof **(c)** w/ credit cap | test scripts + eval corpus | lead-owned evals, W-022 |

## Batch 8 — WS-H quality-of-life & operational handoff (O-092–O-101)

Phase-5 polish over a working module. Several items are thin-slice implementable now (totals, labels, a11y patterns already established per unit); full acceptance waits for scene/module completeness.

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-092 | Guided steps: Brief→Structure→Walls/Caps→Signs/Site→Review/Pricing | **(b-late)** — needs module sections to exist | `FoundationEstimator.jsx` flow shell | O-078 entry, page churn |
| O-093 | Plain-language labels, ft/in entry, dimensional diagram, contextual help, defaults | **(a)** labels/entry/help now; diagram **(b-scene)** | `FoundationItemCard.jsx`, `foundationGeometryInputs.js`, panels | O-015 validation surfaces |
| O-094 | Start-from-assembly presets, duplicate/mirror, bulk material change, reusable templates | **(a)** — template infra landed (O-007) | `foundationTemplate*.js`, `FoundationTemplateDialog.jsx` | O-007 tail |
| O-095 | Autosave status, explicit saved revision, recoverable drafts, clear cost-change review | **(a/b-editor)** — drafts+save status landed; cost-change review rides B-2 acceptance UX | `foundationSaveSession.js`, `foundationDraftRecovery.js`, totals | O-004/031 |
| O-096 | Sticky totals: cost/sell/margin split, itemized takeoff, missing-input checklist | **(a)** — `FoundationTotals.jsx` exists; pure display+model | `FoundationTotals.jsx`, `foundationSellPricing.js` | O-031 cost-delta display — **good now-candidate** |
| O-097 | "Why this qty/cost?" inspection + click-to-fix validation links | **(a)** wiring issues→anchors; richer **(b-scene)** click-to-object merges w/ O-042 | `FoundationBOM.jsx`, `FoundationSectionBanner.jsx`, panels | O-042 diagnostics, O-009 issue codes |
| O-098 | Responsive editing, keyboard nav, accessible contrast/labels, reduced motion | **(a)** — continuous per-unit (1280/390 pattern already enforced) | all panels | every unit contributes |
| O-099 | Revision comparison: geometry, assumptions, quantities, costs, review state | **(b-editor/late)** — needs revision snapshot model (B-2 proposal+acceptance provides base) | new revision-diff view, `estimateRevisionService`? project-local revisions | O-031 acceptance, O-090 provenance |
| O-100 | Exportable field/production package: plan/elev/dims/cut lists/BOM/delivery/equipment/install notes/eng flags/accepted-revision identity | **(b-scene/late)** — merges w/ O-043 export surface | export module, `FoundationBOM.jsx`, `foundationReinforcementPrintMaterial.js` | O-043 — **schedule as one item** |
| O-101 | Release notes + operator walkthrough on representative synthetic projects | **(b-late)** — end-of-module; **(c)** publish-adjacent | docs + walkthrough fixtures | last item |

## Batch 9 — WS-I research-backed preliminary engineering basis (O-102–O-121)

Lead-owned research lane — **runs parallel to all phases, no page-file conflicts** (docs + new registry files only). Register seeded: `.audit-work/CONCRETE_FOUNDATION_SOURCE_REGISTER.md` (CMP-SUP-001 only).

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-102 | Source register by topic: authority/title/edition/section/URL/date/permitted-use/applicability/limits/verified-flag | **(a)** — docs; register started | `.audit-work/CONCRETE_FOUNDATION_SOURCE_REGISTER.md` | lead-owned; none |
| O-103 | Separate adopted local code, referenced standards, eng guidance, mfr instructions, shop assumptions | **(a)** — register taxonomy | register + taxonomy doc | O-102 same file — one writer |
| O-104 | Capture project design-basis edition + locality; no silent basis change | **(b-editor)** schema `design_basis` fields + UX; concept lands w/ register now | `FoundationProject.jsonc` additive, `FoundationSettings.jsx`/project panel | O-118 (uses field), O-031 |
| O-105 | Site/hazard inputs: coords/units/edition/risk/exposure/timestamp; manual entry before API | **(a)** — model+form fields; API later | project schema additive + settings/project UI | O-104 same surfaces |
| O-106 | Research sign wind methods (force/area/height/eccentricity, solid vs open, single/twin, exclusions) | **(a)** — research + register | register + `foundationRuleRegistry` notes | O-065 (consumer), O-108 |
| O-107 | Research spread-footing bearing/overturning/sliding/uplift/frost — distinct checks + assumptions | **(a)** — research | register | O-113 (rules encode) |
| O-108 | Research embedded-pole/drilled-shaft methods, constrained/nonconstrained, depth/soil limits, lateral vs bearing | **(a)** — research | register | O-057/058 (consumers) |
| O-109 | Research soils/groundwater/fill/presumptive values/geotech exclusions/slope/frost | **(a)** — research | register | O-105 inputs |
| O-110 | Research concrete strength, earth-vs-formed cover, bar sizes/grades, spacing, dev/lap/bend, durability by edition | **(a)** — research | register | O-018/023 (consumers) |
| O-111 | Research mats/ties/pillar bars/chairs/bolsters/stands/base plates/support limits/mfr placement guidance | **(a)** — research; CMP-SUP-001 already seeds this | register | **O-022–O-026 blocked on this** — highest-leverage research item |
| O-112 | Research masonry support/caps/coping/drips/overhangs/mortar/grout/connection detailing for quantities | **(a)** — research | register | O-047/050 (consumers) |
| O-113 | Rule registry: source IDs, units, domain, equations/decision logic, defaults, unsupported-case reasons | **(a)** — code artifact; needs O-102+ corpus to populate | new `foundationRuleRegistry.js` + tests | O-026/O-114+ consumers; design now, populate as research lands |

## Batch 10 — WS-I continued (O-114–O-121)

| Item | Acceptance (1-line) | Class | Files touched | Conflicts |
|---|---|---|---|---|
| O-114 | Reproduce published worked examples; check dims/units/boundaries/monotonicity/convergence before enabling a sizing method | **(a)** — needs O-107/108 corpus + registry | registry + test fixtures | O-113 |
| O-115 | Feasible candidate dims inside documented method domain (no unexplained multiplier); expose governing checks + alternatives | **(b)** — registry-driven suggestion engine feeding reinforcement_design | registry + `foundationReinforcementModel.js` | O-022–026 support model, O-019 |
| O-116 | Separate published minima vs calculated baseline vs shop contingencies; show what changed price & why | **(b)** — calc line-item provenance | `foundationCalc.js` line provenance, `FoundationTotals.jsx`/`FoundationBOM.jsx` | O-097 why-inspection, O-053 |
| O-117 | Sensitivity/alternative estimates for uncertain inputs w/ assumptions; real costs from catalogs/disclosed allowances | **(b)** — alternatives engine | calc + proposal patterns | O-085 (AI alternatives share shape) |
| O-118 | Save preliminary design-basis summary w/ estimate + engineer handoff | **(b-late)** — needs O-104/105 fields + export surface | schema + export module | O-043/100 export, O-104 |
| O-119 | "Preliminary estimating only — final engineering required" persistent on concepts, client notes, handoffs | **(a)** surfaces now (notes/labels); export instances **(b-late)** | `FoundationEstimator.jsx` notes, `FoundationBOM.jsx`, templates | cheap now-candidate; O-043/100 finish it |
| O-120 | Respect source licenses; no paid-standard bypass or embedded code texts; permitted excerpts or unresolved | **(d/a)** — sourcing policy, lead-owned | register permitted-use fields | O-102 same file; policy gate for research |
| O-121 | Version rule updates; show affected projects + optional recalc w/o touching accepted client pricing | **(b)** — registry versioning + O-031-style acceptance | registry + versioned-dispatch pattern | O-031 acceptance UX pattern |

## File-ownership conflict matrix (for parallel scheduling)

| File/cluster | Competing open items | Rule |
|---|---|---|
| `foundationReinforcement*.js(x)` (15+ files), `useFoundationReinforcementEditor.js`, `foundationReinforcementDraft.js` | O-015t,O-016,O-017,O-018,O-019,O-020,O-022–O-029,O-031t,O-115 | **B-2 in flight — serialize everything behind it** |
| `foundationInputValidation.js` | O-015t,O-018,O-045,O-052,O-058,O-065 | single owner at a time; append-only issue codes |
| `foundationCalc.js` + `legacyFoundationCalc.js` + `foundationSellPricing.js` | O-017,O-027,O-047,O-053,O-056,O-066,O-073,O-116,O-117 | calc is a choke — pure new modules preferred over edits |
| `FoundationEstimator.jsx` + `FoundationItemCard.jsx` + `FoundationToolbar.jsx` | O-004t,O-014t,O-015t,O-018,O-034,O-035,O-040,O-078,O-086,O-092,O-093,O-095,O-098,O-119 | the page is the worst choke; units must land behind panel seams |
| `FoundationInventory.jsx`/`FoundationCatalog.jsx`/`FoundationSettings.jsx`/`FoundationMaterialDialog.jsx`/`foundationFieldSchema.js`/`inventoryNormalization.js` | O-008t,O-009t,O-021t,O-046,O-062,O-104,O-105 | catalog cluster — one worker |
| `FoundationLayoutCanvas.jsx`/`foundationLayoutModel.js` | O-032t,O-035,O-038,O-039,O-044,O-045,O-048,O-058,O-070,O-071,O-072 | scene-input cluster — O-038/039 FIRST |
| `Foundation3DPreview.jsx`/`foundationPreviewCamera.js`/`foundationPolePreview3D.js`/`*Preview3D.js` | O-029,O-033,O-037,O-041,O-055,O-059,O-067,O-068,O-076 | renderer cluster — O-041 lifecycle FIRST |
| `wallCalculator.js`/`wallCapCalculator.js`/`FoundationWallsPanel.jsx`/`FoundationWallCapsPanel.jsx` | O-044–O-055 | D-series one worker; pure-calc sub-units safe pre-scene |
| `poleCalculator.js`/`FoundationPolesPanel.jsx` | O-056–O-059,O-064 | E-pole one worker |
| `signage_cabinets` surfaces + new sign editor | O-060–O-067 | E-sign one worker |
| `landscapeMaterials.js` + `landscape` schema | O-068–O-073 | F-model one worker |
| `FoundationBOM.jsx`/`foundationReinforcementBOMRows.js`/`foundationReinforcementPartDescriptors.js`/`foundationReinforcementWorkOrderPart.js`/`builder/partSync.js` | O-011t,O-025,O-027,O-043,O-066,O-100 | extraction cluster — serialize |
| `FoundationTotals.jsx`/`CustomerPricingPanel`/`customerPricing.js` | O-010t,O-031t,O-096,O-116,O-117 | totals cluster |
| `foundationTemplate*`/`FoundationTemplateDialog.jsx` | O-007t,O-094 | template cluster |
| `foundationDraftRecovery.js`/`foundationSaveSession.js`/`foundationSyncRecovery.js`/`foundationBuilderRecovery.js` | O-004t,O-012t,O-014t,O-095 | recovery cluster |
| `foundationAssemblyModel.js` | O-036,O-048,O-056,O-058 | relations model — serialize |
| `FoundationProject.jsonc`/`FoundationInventory.jsonc` schemas | O-045,O-050,O-057,O-060,O-062,O-064,O-069,O-079–O-081,O-090,O-104,O-105,O-118 | additive-only; one schema edit per checkpoint |
| `foundationAiReview.js` + NEW `estimatorDesignAction` fn + brief/proposal files | O-078–O-091 + W-012..022 | Phase-4 cluster — new files, low collision |
| `.audit-work/CONCRETE_FOUNDATION_SOURCE_REGISTER.md` | O-102–O-112,O-120 | lead-owned docs, zero code conflicts |
| `scripts/test-foundation*.mjs` | every unit | append new files, don't edit shared harnesses |

## Recommended sequence after Phase B-2 lands

**Wave 0 — merge/cleanup gates (cheap, unblocks trust):**
1. O-014t scoped ESLint at HEAD + O-013 live-probe batch at next published gate (c).
2. O-012 policy decision (dup/split `project_id`+`builder_product_id`) → Brett decision (d), then fix.

**Wave 1 — A-series tails + catalog cluster (all (a), one worker):**
O-021t rebar_support catalog UI → O-008t supplier grouping + form-init zeros → O-009t inactive/unpriced/free classification → O-046 masonry normalization. Then O-007t `source_key` stamp, O-004t conflict UX + Builder-sync retry, O-096 sticky totals, O-119 preliminary-only notices, O-093 labels/entry.

**Wave 2 — Phase B support model (b-support, sequential, one worker):**
O-111 research (lead, parallel) → O-022 modes → O-023/024 geometry+height → O-025 separation → O-026 placement rules (needs O-113 registry skeleton) → O-028 edge cases → O-027 roll-in (closes O-011t) → O-029 schedule → O-017/O-019/O-020 confirm inside editor.

**Wave 3 — Phase C scene infra (b-scene):**
O-038 transforms → O-039 input → O-040 stroke-undo → O-041 renderer lifecycle → O-034 tree/selection → O-035 edit ops → O-036 reparent → O-032t elevations → O-033 render coverage → O-037 layers → O-042 diagnostics → O-043+O-100 export (one item).

**Wave 4 — Phase D walls/caps:** model halves (O-044/045/047/048) may start in Wave 3 parallel on calc files; caps chain O-049→O-050→O-051→O-052→O-053→O-054→O-055.

**Wave 5 — Phase E poles/signs:** O-056/057 → O-058/059 → O-060/061 → O-062/064 → O-065 → O-066 → O-063 (cross-module link policy, needs Brett) → O-067.

**Wave 6 — Phase F landscape/assets:** O-074/075 (lead sourcing, start anytime) → O-069/070 model → O-068/071/072 scene → O-073 billing split → O-076/077.

**Wave 7 — Phase G AI:** W-012..022 shared contract first → O-079/080 intake → O-081 brief → O-082/083 questions → O-084/085 propose → O-086/087 review/apply → O-088 revise → O-089 plumbing → O-090 provenance → O-091 evals. O-078 entry can land earlier (Wave 1).

**Wave 8 — I-series consumers + H-late + live gates:** O-113→O-114→O-115→O-116/117 (as calc stabilizes) → O-104/105 fields (Wave 1 OK) → O-118 w/ export → O-121 versioning → O-092/094/095/099 → O-101 last. Batch all (c) live proofs at one published-session gate: O-004t/O-010t/O-012t/O-013t/O-077/O-091.

## Compact summary — remaining items by class

| Class | Count | Items |
|---|---|---|
| (a) implementable now | ~24 | O-004t*, O-007t*, O-008t, O-009t, O-012t(fix), O-014t(lint), O-015t*, O-021t, O-040*, O-046, O-047*, O-049–O-054*, O-056–O-058*, O-061*, O-062, O-064, O-073*, O-074, O-075, O-078, O-093*, O-094, O-096, O-097, O-098, O-102–O-114, O-119* (*=partial, model-side only) |
| (b) needs Phase B-2+/scene/AI/late | ~60 | O-011t, O-015t*, O-016–O-032(except catalog/O-040*), O-033–O-045, O-048*, O-055*, O-059, O-060, O-063*, O-065*, O-066*, O-067–O-073, O-076, O-079–O-091, O-092, O-095*, O-099, O-100, O-101, O-104*, O-115–O-118, O-121 |
| (c) live/published proof | ~8 | O-004t*, O-009t*, O-010t, O-012t, O-013t, O-077*, O-091*, O-101* |
| (d) cross-module/decision/out-of-scope | ~9 | O-008t(non-CMP), O-010t(invoice adjacency), O-012t(policy), O-013 F-1(FileBridge→Brett), O-014t(other modules), O-015t/O-018/O-020/O-031(engineer acceptance), O-063(sign products), O-074*/O-120(licensing) |

*(many items are mixed-class; table shows the dominant gate — see per-item rows)*

## Top-10 next-actionable (no B-2 file collision)

1. **O-021t** — `rebar_support` catalog/admin UI (schema landed; catalog files only) — unblocks O-022+ economics.
2. **O-008t** — supplier grouping + kill `||0` form-init/minted-0 presets (FoundationInventory/catalog cluster).
3. **O-009t** — inactive/unpriced/free classification + invalid-rate/type/geometry checks (`foundationCatalogIntegrity.js`) — prerequisite for O-022 `off`-mode honesty.
4. **O-046** — brick/CMU/stone normalization + poured-vs-unit split (`wallCalculator.js` + catalog boundary).
5. **O-056+O-057** — pole model consolidation: item-pole vs project-pole, stock/height/embedment/offset/shape (`poleCalculator.js`).
6. **O-004t** — draft↔source merge-conflict UX + partial Builder-sync retry (recovery cluster).
7. **O-096** — sticky totals cost/sell/margin + itemized takeoff + missing-input checklist (`FoundationTotals.jsx`).
8. **O-119** — "Preliminary estimating only" persistent notice surfaces (page/notes/BOM; cheap, safety-critical).
9. **O-007t** — `ai_engineering_data.source_key` provenance staleness on template apply (`foundationTemplateService.js`; small).
10. **O-111+O-113** — lead research: support/mats/chairs/bolster corpus + `foundationRuleRegistry.js` skeleton — gates O-022–O-026 support model.

**Live-gate batch (c)** to schedule at next published session: O-013t probes, O-012t record lifecycle, O-010t WO→invoice, O-004t authz. **Decisions for Brett (d):** O-012 dup/split policy, O-063 sign-product link ownership, O-074/O-120 asset licensing/hosting, O-013 F-1 FileBridge anon-write.

*End of map — 2026-11-08*

