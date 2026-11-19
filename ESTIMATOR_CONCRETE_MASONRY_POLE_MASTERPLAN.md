# Concrete | Masonry | Pole - Estimator Masterplan

Date: 2026-11-05
App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`), sandbox branch `main`.
Status: DESIGN / INITIAL SOURCE AUDIT COMPLETE; implementation awaiting plan approval.
Companion evidence: `ESTIMATOR_CONCRETE_MASONRY_POLE_AUDIT.md`.

Brett's clarified design intent: there are no existing engineering schedules. Research published
requirements and methods to create a defensible PRELIMINARY ESTIMATING BASIS. The output is used
to price work for clients; every structural foundation will ALWAYS go to a real engineer.
Unknown final-engineering details must not make the entire estimating workflow unusable.

## 1. Mission And Boundaries

Deliver a connected, visual assembly builder, not a collection of disconnected forms.
The intended flow is:

`References + conversation -> confirmed brief -> editable proposal -> validated assembly -> quantities + costs -> estimate -> approved production handoff`

- Work only on this estimator module and its necessary integration seams.
- Keep the existing estimator lifecycle, accepted pricing, customer identity, and guarded-save behavior.
- Preserve existing projects; do not silently reprice, migrate, overwrite, or reinterpret them.
- At most two active agents total for this work: the lead and one implementation worker.
- One writer per file; reread remote source before changes and preserve concurrent work.
- Synthetic/offline fixtures only for testing; no production records or inventory seeding.
- No purchases, third-party photo uploads, deployment, or publishing without specific authorization.
- This document does not supersede the broader estimator ledger or unrelated sessions.

## 2. What "Full Featured" Means

- AI asks useful questions before building; it can explain, revise, and resume a proposal.
- Photos inform appearance and intent; dimensions require a known scale or explicit confirmation.
- Foundations, wall runs, caps, poles, signs, and landscape occupy the same measured scene.
- Editing or moving a parent updates attached children; deletion never silently reattaches them.
- The model visible in 2D/3D, the takeoff, the BOM, and saved estimate costs agree.
- Missing inventory, unknown rates, invalid geometry, and unresolved engineering inputs are visible.
- Manual design remains available without AI, external assets, or WebGL.
- A generated assembly is editable with the same tools as a manually built assembly.
- Save, reopen, undo, copy, templates, and estimate handoff preserve the entire assembly.
- Completion requires observed results across the scenarios and passes in sections 15-16.

## 3. Engineering And AI Safety Contract

- Separate concept design, estimating, deterministic checks, and professional engineering approval.
- Replace the current unqualified AI `adequate` boolean with explicit review/validation status.
- An LLM must not certify safety, invent verified soil/wind/code data, or approve construction.
- Preliminary sizing rules must be versioned, traceable, unit-aware, and independently checked
  against published methods/examples. They do not replace the real engineer's final design.
- Collect sign dimensions, weight, mounting arrangement, site location, applicable design basis,
  wind/exposure data, soil/bearing/geotechnical information, frost depth, existing conditions,
  and relevant constraints. Mark unknowns; do not substitute plausible-looking facts.
- Unsupported structural cases stay concept-only with a clear engineering-review flag. Allow
  preliminary pricing with disclosed assumptions, allowances/exclusions, and confidence limits;
  block construction-ready claims, not every client estimate.
- Photo-derived measurements and inferred materials carry provenance and require confirmation.
- Uploaded drawings/reference text are untrusted data, never instructions for tool execution.
- AI can propose catalog selections and geometry; deterministic code owns quantities and money.
- Applying an AI proposal is a reviewed, undoable change set, not an automatic business write.
- The lead authors AI instructions, structured-output contracts, and evaluation cases; no delegated
  prompt/rubric authoring. AI output is validated against an allowlisted assembly contract.

## 4. Target Architecture

Keep `FoundationProject` as the aggregate; add an explicit versioned design envelope rather than
introducing a second independent project database. Final schema changes require implementation approval.

- Add `design_version`, stable object IDs, reference metadata, assembly relations, and validation state.
- Foundation items/walls/poles/caps/signs have stable IDs; segments also have IDs.
- Relations use `foundation_id`, `wall_id`, `segment_id`, and `pole_ids`, not array positions.
- Canonical coordinates: inches, X/Z horizontal, Y upward, ground at Y=0; explicit local-to-parent
  transforms, above-grade height, below-grade embedment, cover, rotation, and instance placement.
- Keep existing arrays readable through a versioned adapter. Resolve old index references once;
  ambiguous/dangling links become repairable warnings. Persist upgrades only on explicit save.
- Expand quantity-based footings into identifiable placed instances when attachments need a
  particular footing; do not guess which duplicate instance owns a sign or pole.
- One pure assembly model produces render geometry, quantities, BOM lines, validation issues,
  and cost input lines. Renderers do not calculate independent engineering or monetary totals.
- Preserve `calcProject`, `sourceProjectTotal`, customer-pricing, and Builder sync seams through
  adapters while incrementally replacing inconsistent internals.
- Every calculated line carries source object ID, quantity/unit, rate source, override provenance,
  extended cost, and calculation version. Separate material, labor, equipment, delivery, and waste.
- New AI endpoint: session-authenticated `foundationDesignAction` with `analyze_references`,
  `next_questions`, `propose`, and `revise`. It returns data, not arbitrary entity-write instructions.
- Proposal contract: `proposal_id`, `base_project_version`, `brief`, `questions`, `assumptions`,
  `evidence_refs`, `assembly_patch`, `unresolved_issues`, and `review_status`.
- `validateFoundationProposal(proposal, project, catalogs, rules)` is deterministic and pure.
- `applyFoundationProposal(project, validatedProposal)` checks the base version, applies one
  undoable local transaction, and revalidates. Ordinary guarded save persists it afterward.
- Bound conversation/reference history; store file references, not image bytes, inside the project.
- AI drafts, source snapshots, and validation results are revision-bound so late responses cannot
  overwrite a newer design. Aborted/stale jobs never apply themselves.

## 5. Execution Order And Gates

| Phase | Deliverable | Exit Gate |
|---|---|---|
| 0 | Current-source audit, dependency map, reproducible findings, masterplan | Evidence saved; unknowns labeled |
| 1 | Save integrity, stable identities, geometry contract, catalog/cost repairs; engineering-source research | Recovery + round-trip + pricing tests; documented research gaps |
| 2 | Rebar/support model and shared visual assembly foundation | Geometry/BOM/cost parity; no single-mat automatic ties |
| 3 | Complete walls, poles, sign placement, caps, and scene editor | Manual end-to-end scenarios usable without AI |
| 4 | Interactive reference intake and AI proposal/apply/revise workflow | AI builds only through the validated working model |
| 5 | Higher-quality landscape/assets, presentation, workflow polish | Desktop/touch/accessibility and asset-failure checks |
| 6 | Repeated cross-system regressions and release candidate evidence | All required scenarios proven; no concealed failures |

Fix correctness before visual polish. Build a working manual assembly path before letting AI drive it.
UI/UX implementation approval is separate from correctness repairs. No release authorization is implied.

## 6. Workstream A - Integrity, Data, And Connections

- [ ] CMP-A01 Fix Save & Exit so failed or partial saves keep the editor open with a recoverable error.
- [ ] CMP-A02 Serialize saves; snapshot the edit revision; edits during save remain dirty.
- [ ] CMP-A03 Guard route/project changes and stale load/save responses; prevent cross-project state bleed.
- [ ] CMP-A04 Add dirty-navigation protection, conflict recovery, and explicit partial Builder-sync retry.
- [ ] CMP-A05 Introduce stable IDs and parent/child relations with backward-compatible index adapters.
- [ ] CMP-A06 Handle parent deletion/reordering/duplication explicitly; remap copied child IDs safely.
- [ ] CMP-A07 Full-project save/copy/template round-trip for signs, landscape, caps, AI brief, and links.
- [ ] CMP-A08 Normalize inventory field names/units at one boundary; honor legitimate zero values.
- [ ] CMP-A09 Distinguish missing/deleted/inactive catalog items and unpriced/free materials.
- [ ] CMP-A10 Reconcile module totals, cost categories, customer tiers, overrides, and accepted snapshots.
- [ ] CMP-A11 Extend Builder part extraction for every new component, including supports and landscape.
- [ ] CMP-A12 Verify reopen/quote/revision/WO handoff preserves references, BOM, drawings, and costs.
- [ ] CMP-A13 Prove backend-only RLS, session gateway access, role restrictions, and read-only shares.
- [ ] CMP-A14 Eliminate unsafe silent failures and stale "success" UI; fix the scoped catalog lint error.

## 7. Workstream B - Foundations, Quantities, And Rebar Supports

- [ ] CMP-B01 Retain spread-footing and pillar workflows; add dimension/quantity/unit validation.
- [ ] CMP-B02 Treat single-mat spread-footing horizontal steel separately from inter-layer ties.
- [ ] CMP-B03 Do not remove pillar longitudinal bars merely because a pillar has one hoop layer.
- [ ] CMP-B04 Add explicit cover, mat elevations, spacing, layer count, and valid clearances.
- [ ] CMP-B05 Support a top-mat preset for the requested thick-footing/single-layer workflow.
- [ ] CMP-B06 Make top/bottom/multilayer placement explicit; no universal engineering claim that top
  placement is correct for every footing. Engineer-approved design controls actual structural placement.
- [ ] CMP-B07 Add a `rebar_support` catalog type: chair/stand/bolster, height/range, footprint,
  material, pack size, cost/unit, compatible bar sizes, and placement constraints.
- [ ] CMP-B08 Add support selection modes `auto`, `manual`, `off`; `off` requires an explained
  support condition when a mat otherwise has no support. Do not silently treat it as build-ready.
- [ ] CMP-B09 For bottom-resting stands, feet contact the concrete bottom; support geometry rises to
  the target mat without violating bar cover, wall/pole clearances, or the chosen support limits.
- [ ] CMP-B10 Derive stand height from bottom plane to the mat bearing elevation, including bar
  thickness; choose a compatible catalog support or report no compatible support.
- [ ] CMP-B11 Separate stand geometry/counts from structural vertical reinforcement and inter-mat ties.
- [ ] CMP-B12 Derive support placement/counts from reviewed spacing/edge/support rules, with manual
  overrides; do not invent a universal stand density from the photograph or LLM.
- [ ] CMP-B13 Roll supports into quantities, pack rounding, installation labor, BOM, Builder parts,
  internal cost, customer pricing, purchasing handoff, save/reopen, and 3D.
- [ ] CMP-B14 Handle no-rebar/no-support, one layer, several layers, pillars, obstructions, and
  quantity instances; flag infeasible geometry rather than overlapping objects.
- [ ] CMP-B15 Add rebar cut/bend schedule, stock-length/waste accounting, and exploded/section views.
- [ ] CMP-B16 Add excavation/soil spoil, forming, finishing, concrete delivery, and admixture checks;
  warn on incompatible choices and unsupported assumptions without pretending to engineer them.
- [ ] CMP-B17 Preserve legacy totals until the user accepts a recalculated design and cost delta.

## 8. Workstream C - Shared Scene And Easier Editing

- [ ] CMP-C01 Use identical measured placement in 2D plan, front/side elevation, and 3D.
- [ ] CMP-C02 Render foundations, masonry, caps, poles, signs, reinforcement, supports, and landscape.
- [ ] CMP-C03 Synchronize object tree, selection, properties panel, highlights, and parent breadcrumb.
- [ ] CMP-C04 Add move/rotate/duplicate/delete, typed coordinates, snap/grid, alignment, and dimensions.
- [ ] CMP-C05 Add attach/detach/reparent with world/local position choices and visible mount handles.
- [ ] CMP-C06 Add meaningful layer visibility, locked layers, isolation, transparent concrete, cutaways,
  below-grade views, fit-to-selection, scale labels, and unobscured reinforcement inspection.
- [ ] CMP-C07 Correct screen/world transforms across zoom, aspect ratios, scroll, and responsive SVGs.
- [ ] CMP-C08 Support pointer capture, touch/pen, keyboard manipulation, numeric fallback, and labels.
- [ ] CMP-C09 Coalesce a drag/paint stroke into one undo command; preserve redo and sensible history.
- [ ] CMP-C10 Keep one renderer alive; dispose geometries/materials/textures, handle resize/fullscreen,
  WebGL failure/context loss, demand rendering, and bounded scene complexity.
- [ ] CMP-C11 Add conflict/clearance diagnostics with click-to-object navigation.
- [ ] CMP-C12 Export labeled plan/elevations, assembly details, BOM, and presentation images from the
  same accepted revision; separate attractive concept renders from construction documents.

## 9. Workstream D - Masonry Walls And Wall Caps

- [ ] CMP-D01 Build straight, L/U, closed monument, and multi-run wall layouts tied to foundations.
- [ ] CMP-D02 Add editable vertices, segment lengths, offsets, wall thickness/height, openings, and
  clear handling of open/closed paths, self-intersections, and invalid/zero-length segments.
- [ ] CMP-D03 Normalize brick/CMU/stone dimensions and separate poured concrete from unit masonry.
- [ ] CMP-D04 Add bond/courses, mortar, waste/cuts, corners/returns, and internal/fill options with
  geometry-aware quantities; do not use one segment-reduction shortcut for all polygons.
- [ ] CMP-D05 Make existing/new foundation assignments explicit and track unsupported wall spans.
- [ ] CMP-D06 Implement "Cap this wall/run/all selected" from actual wall geometry, not manual row spam.
- [ ] CMP-D07 Add cap profile, material, width, thickness, overhang, elevation, joints, slope direction,
  and end treatments with visible preview and supported-profile validation.
- [ ] CMP-D08 Generate cap segments, corners/miters/end pieces, cuts, overlaps/gaps, and cut list.
- [ ] CMP-D09 Reject/split a cut longer than available stock and prevent placement without a wall.
- [ ] CMP-D10 Preserve full-stock-per-cut-piece billing as the default. Any offcut reuse/optimization
  is an explicit alternative showing purchased pieces, waste, labor, and pricing changes.
- [ ] CMP-D11 Rebuild cap placement after wall edits without silently destroying locked manual pieces.
- [ ] CMP-D12 Persist cap-to-wall/segment IDs; validate fit and include cap stock, installation supplies,
  cuts/labor, BOM, pricing, production details, and 3D.

## 10. Workstream E - Poles, Signs, And Mounting

- [ ] CMP-E01 Consolidate legacy item-pole and project-pole representations without double charging.
- [ ] CMP-E02 Distinguish total stock length, height above grade, embedment, offset, and actual shape.
- [ ] CMP-E03 Snap poles into assigned footing instances with position, edge/cover, and clash checks.
- [ ] CMP-E04 Support centered/single-pole, twin/multipole signs, and foundation/wall-top mounting.
- [ ] CMP-E05 Add a visual sign editor: dimensions, face count, cabinet/panel shape, depth, orientation,
  mount height, horizontal offset, front/back artwork, trim/body color, and physical envelope.
- [ ] CMP-E06 Add reference/artwork upload, crop/fit/scale controls, undo, replace, and loading failures.
- [ ] CMP-E07 Add typed mount choices, brackets/base plates/anchor assemblies where supported;
  record unsupported connection design as an engineering-review issue, not an invented detail.
- [ ] CMP-E08 Integrate existing estimator sign products where compatible; explicit ownership prevents
  a display-only linked sign from duplicating fabrication/installation charges.
- [ ] CMP-E09 Support several signs per pole/assembly and correct count/placement of repeated signs.
- [ ] CMP-E10 Validate sign/mount collisions, impossible fit, unresolved weight/load inputs, and parents.
- [ ] CMP-E11 Include purchased/fabricated sign costs, mounting hardware, labor, paint, and waste exactly
  once; preserve existing quote and job links when revising the scene.
- [ ] CMP-E12 Show all sign/mount changes immediately in plan/elevation/3D and after save/reopen.

## 11. Workstream F - Landscape And Asset Quality

- [ ] CMP-F01 Replace flat colored-cell-only presentation with realistic materials and placed objects.
- [ ] CMP-F02 Add beds/polygons, paths/borders, ground covers, shrubs, grasses, trees, rocks, and lights.
- [ ] CMP-F03 Keep real scale, rotation, elevation, spacing, clipping/boundaries, and foundation setbacks.
- [ ] CMP-F04 Add brush/erase/fill/selection, object editing, grouped placement, and stroke-level undo.
- [ ] CMP-F05 Allow site-photo/plan backdrops with a user-confirmed scale; preserve manual corrections.
- [ ] CMP-F06 Separate visual-only assets from billable landscaping; use catalog/configured material
  quantities, plant counts, bed depth/volume, labor, waste, and visible unpriced warnings.
- [ ] CMP-F07 Use curated realistic CC0 PBR/model sources in section 17, not a blanket low-poly pack.
- [ ] CMP-F08 Add an asset manifest: source URL, license, author/provenance, original scale, preview,
  optimized file hashes, bounds/pivot, and fallback representation.
- [ ] CMP-F09 Optimize GLB/texture payloads, shared materials, instancing, LOD, caching, and lazy loads;
  keep heavy raw files out of the site bundle/public deployment archive.
- [ ] CMP-F10 Verify transparent foliage, shadows/color consistency, scale, thumbnail quality, CORS,
  unavailable assets, and low-power-device fallback before approving a library entry.

## 12. Workstream G - Interactive AI Design Agent

- [ ] CMP-G01 Make "Start with AI", "Use a template", and "Build manually" the beginning of the module.
- [ ] CMP-G02 Multi-photo intake with thumbnails, reference purpose, reorder/remove, notes, file/type/
  size validation, and explicit upload/privacy consent before external AI processing.
- [ ] CMP-G03 Let the user mark sign/base/pole/wall/landscape details and supply known dimensions.
- [ ] CMP-G04 Maintain a structured brief with confirmed facts, photo observations, preferences,
  missing inputs, conflicts, assumptions, and questions already answered.
- [ ] CMP-G05 Ask grouped, relevant follow-ups about sign style/size/weight, mounting, foundation
  arrangement, wall/cap finishes, site constraints, engineering inputs, scope, and budget.
- [ ] CMP-G06 Accept "I don't know"; explain why a fact matters; allow concept-only progress without
  disguising unknown structural requirements as verified data.
- [ ] CMP-G07 Resolve contradictions between photos, user answers, project geometry, and catalog.
- [ ] CMP-G08 Propose complete assemblies, catalog matches, alternatives, and cost-impact explanations;
  never invent available stock, prices, certification, dimensions, or soil properties.
- [ ] CMP-G09 Display an editable proposal, assumptions, missing costs, validation issues, and object
  additions/changes/deletions before "Apply to design".
- [ ] CMP-G10 Apply only schema-valid, referentially valid, base-version-matching changes; one undo
  restores the prior assembly. Reject unknown fields, nonfinite dimensions, and excessive payloads.
- [ ] CMP-G11 Support conversational revisions such as "two poles", "wider base", "add walls", "cap
  the perimeter", and "keep my manual sign position"; preserve locked/user-authored decisions.
- [ ] CMP-G12 Add cancel/retry/resume, clear rate-limit/network errors, bounded context, and idempotent
  application receipts so retries do not duplicate objects or paid generation work.
- [ ] CMP-G13 Store provenance and review status per generated revision; any material geometry/load
  change invalidates dependent checks and previous approval.
- [ ] CMP-G14 Test misleading/ambiguous images, unsupported designs, hostile reference text, incomplete
  answers, stale responses, multiple revisions, and unavailable catalog/AI services.

## 13. Workstream H - Quality Of Life And Operational Handoff

- [ ] CMP-H01 Guided steps: Brief -> Structure -> Walls/Caps -> Signs/Site -> Review/Pricing.
- [ ] CMP-H02 Plain-language labels, feet/inches entry, dimensional diagram, contextual help, defaults.
- [ ] CMP-H03 Start-from-assembly presets, duplicate/mirror, bulk material changes, and reusable templates.
- [ ] CMP-H04 Autosave status, explicit saved revision, recoverable drafts, and a clear cost-change review.
- [ ] CMP-H05 Sticky totals with separate cost/sell/margin, itemized takeoff, and missing-input checklist.
- [ ] CMP-H06 "Why this quantity/cost?" inspection and click-to-fix validation links.
- [ ] CMP-H07 Responsive editing, keyboard navigation, accessible contrast/labels, and reduced motion.
- [ ] CMP-H08 Revision comparison of geometry, assumptions, material quantities, costs, and review state.
- [ ] CMP-H09 Exportable field/production package: plan/elevations, dimensions, cut lists, BOM, delivery,
  equipment, installation notes, unresolved engineering flags, and accepted revision identity.
- [ ] CMP-H10 Release notes and operator walkthrough using representative synthetic projects, not a demo
  that works only for the one screenshot used during development.

## 14. Workstream I - Research-Backed Preliminary Engineering Basis

This is core scope, not an optional later AI enhancement. Research and rule authoring stay with the
lead. Mechanical capture/execution may be delegated only with an exact approved recipe.

- [ ] CMP-I01 Build a source register by topic: authority, title, edition/date, section, URL, access
  date, permitted use, applicability, limitations, and whether the full requirement was verified.
- [ ] CMP-I02 Separate adopted local code/amendments, referenced structural standards, engineering
  guidance, manufacturer instructions, and shop estimating assumptions. They are not interchangeable.
- [ ] CMP-I03 Capture a project's design-basis edition and locality; do not equate "newest code" with
  the locally adopted code or change an existing project's basis silently.
- [ ] CMP-I04 Define site/hazard inputs with coordinates, units, standard edition, risk category,
  exposure assumptions, and timestamp. Support official report/manual entry before API automation.
- [ ] CMP-I05 Research sign-specific wind methods, force/area/height/eccentricity relationships, solid
  versus open signs, single/twin supports, and explicitly excluded arrangements.
- [ ] CMP-I06 Research spread-footing preliminary bearing, overturning, sliding, uplift, and frost
  constraints; preserve distinct checks and their input assumptions instead of one "adequate" flag.
- [ ] CMP-I07 Research embedded-pole/drilled-shaft methods, constrained/nonconstrained conditions,
  applicable depth/soil limits, and the difference between lateral soil pressure and vertical bearing.
- [ ] CMP-I08 Research soils, groundwater/fill, presumptive-value restrictions, geotechnical exclusions,
  slope/adjacency constraints, and frost requirements. Unknown soil remains an estimating assumption.
- [ ] CMP-I09 Research concrete strength, cast-against-earth versus formed cover, bar sizes/grades,
  spacing, development/lap/bend requirements, and exposure/durability limits by applicable edition.
- [ ] CMP-I10 Research mats, ties, longitudinal pillar bars, chairs/bolsters/high stands, base plates,
  support-height/capacity limits, and manufacturer placement guidance. Do not turn a general article
  into a universal stand-spacing or reinforcement schedule.
- [ ] CMP-I11 Research masonry support, caps/coping/drips/overhangs, mortar/grout, and typical connection
  detailing relevant to quantities and preliminary assemblies.
- [ ] CMP-I12 Build a rule registry with source IDs, input/output units, applicable geometry/soil/load
  domain, equations or decision logic, explicit defaults, and unsupported-case reasons.
- [ ] CMP-I13 Independently reproduce published worked examples and check dimensions, unit conversion,
  boundary cases, monotonic response, and numerical convergence before enabling a sizing method.
- [ ] CMP-I14 Estimate feasible candidate dimensions inside the documented method domain, not an
  unexplained "bigger than current" multiplier. Expose governing preliminary checks and alternatives.
- [ ] CMP-I15 Separate published minima, calculated baseline quantities, and shop/user contingencies;
  show what changed the price and why. Extra concrete alone does not guarantee structural safety.
- [ ] CMP-I16 Provide sensitivity/alternative estimates for uncertain inputs with clear assumptions;
  actual costs come from catalogs or disclosed allowances, not invented internet prices.
- [ ] CMP-I17 Save a preliminary design-basis summary with the estimate and engineer handoff: site,
  signs/loads, geometry, source editions, assumptions, open questions, and quantity/cost revision.
- [ ] CMP-I18 Make "Preliminary estimating only - final engineering required" persistent on generated
  structural concepts, client estimate notes as appropriate, and handoff exports.
- [ ] CMP-I19 Respect source licenses and access restrictions; do not bypass paid standards or embed
  unlicensed full code texts. Obtain permitted excerpts/data or leave the affected method unresolved.
- [ ] CMP-I20 Version updates; show affected projects and optional recalculation rather than changing
  accepted client pricing when a research source or method is updated.

## 15. Repeated Passes - Required Evidence, Not A One-Pass Rewrite

Each pass records scenario, project/design revision, observed result, test exit status, screenshots
where applicable, and remaining defects. A green static test does not close a visual or workflow issue.

| Pass | Required Check |
|---|---|
| P01 Source inventory | Confirm current remote entry points, file ownership, schemas, dependencies, and drift |
| P02 Baseline reproduction | Reproduce existing save, rebar, material, placement, cap, and pricing defects |
| P03 Research correctness | Verify source text/edition/applicability and published numerical examples |
| P04 Model invariants | IDs, units, parent transforms, geometry validity, counts, migration, undo/redo |
| P05 Calculations | Independent quantity/cost fixtures; zero/missing/override/rounding/waste cases |
| P06 Visual geometry | Inspect plan/elevation/3D including rebar, stands, pole embedment, caps, signs |
| P07 User interaction | Drag, snap, input, resize, touch, keyboard, selection, history, copy, templates |
| P08 AI intake | Good/poor/multiple photos, known scale, unknowns, contradictory answers, clarification |
| P09 AI assembly | Full proposal/apply/revise/undo; shared deterministic model; preserve manual decisions |
| P10 Persistence/recovery | Save/reopen, failed/lost response, conflict, dirty-during-save, partial sync |
| P11 Commercial integration | BOM/parts/cost/sell/quote revision/WO parity; no omissions or double charges |
| P12 Failure/security | Untrusted files/text, auth/roles, rate limits, unavailable catalogs/AI/assets/WebGL |
| P13 Performance/accessibility | Large assemblies, repeated edits, memory cleanup, responsive and accessible UI |
| P14 Adversarial regression | Re-run earlier scenarios after later features; vary geometry/materials/mounts |
| P15 Operator acceptance | Several realistic synthetic jobs from blank intake to client pricing |
| P16 Final candidate | Focused tests + one broader estimator integration gate; review exact final diff |

Every changed feature repeats its affected passes. After integration, repeat the complete required
scenario set against the same candidate revision. Do not count identical stale source as new evidence.
A defect is not closed by weakening a test, adding an audit keyword, or hiding UI.

## 16. Scenario Matrix

All rows require calculation, visible geometry, save/reopen, and BOM/estimate consistency where relevant.
These are planned acceptance cases, not claims that they already pass.

| ID | Scenario | Required Result |
|---|---|---|
| S01 | One spread footing, no rebar | No bars/stands or hidden reinforcement charges |
| S02 | One-layer spread-footing mat | No automatically generated inter-layer vertical bars |
| S03 | Thick footing, selected top-mat preset | Correct top cover; bottom-resting compatible stands reach the mat |
| S04 | Two/three mat layers | Correct elevations, separations, supports/ties per selected rules, all quantities |
| S05 | Thin footing or impossible stand height | Visible conflict; no overlap or fictitious compatible product |
| S06 | Pillar with hoops/longitudinal steel | Pillar bars remain distinct from spread-footing inter-layer ties |
| S07 | Several identical footings | Deterministic instances, quantities, placements, attachment ownership |
| S08 | Single pole and cabinet | Embedment below grade, above-grade height correct, sign moves with pole |
| S09 | Twin-pole sign over two foundations | One sign linked to both supports; no duplicated sign charge |
| S10 | Sign directly on foundation/wall | Correct bearing/mount plane and editable offsets |
| S11 | Several signs on one assembly | Distinct heights/faces/artwork; meaningful clash checks |
| S12 | Delete/reorder/duplicate a parent | Stable links or explicit repair; no silent sign/cap reassignment |
| S13 | Open straight/L/U wall | Correct runs, quantities, ends, caps, and unclosed-path behavior |
| S14 | Closed irregular monument wall | Valid interior/fill geometry; correct corners/returns/caps |
| S15 | Caps with short stock/corners/cuts | Fit/joints; overstock rejected/split; full-stock billing preserved |
| S16 | Wall edited after cap placement | Auto pieces update; locked pieces report conflicts |
| S17 | Brick/CMU/stone and poured concrete | Correct dimension/unit adapters and distinct quantity methods |
| S18 | Ready-mix/bagged/mixed supplier cases | Explicit supply grouping, delivery/minimums, no double charge |
| S19 | Missing/retired/unpriced inventory | Unresolved pricing visible; no accidental free parts or data loss |
| S20 | Landscaping only/mixed site | Real scale/materials; visual-only versus billable distinction |
| S21 | Large shrubs/trees/paths near sign | Placement/clearance and performance; fallback if asset unavailable |
| S22 | Photo without scale or hidden foundation | Ask/mark assumptions; never fabricate measured underground geometry |
| S23 | Contradictory reference photos | Resolve conflicts interactively; retain user choices |
| S24 | AI canceled/retried/late reply | No partial automatic mutation, duplicate assembly, stale overwrite |
| S25 | Manual edit after AI proposal | Reject/rebase stale proposal; preserve manual/locked choices |
| S26 | Unknown soil/wind/final engineering | Preliminary pricing with disclosed basis and engineering requirement |
| S27 | Different code editions/site inputs | Traceable method selection; unsupported domains flagged |
| S28 | Save fails/Builder sync partially fails | Stay open; retry completes intended revision once |
| S29 | Edit during save/autosave overlap | New edits stay dirty/recoverable; no lost changes |
| S30 | Copy/template/reopen old project | Retain geometry, artwork refs, landscape, relations, pricing |
| S31 | Customer tier/override/accepted quote | Existing pricing semantics and revision locks preserved |
| S32 | Quote-to-WO/purchasing handoff | Accepted BOM, supports, cuts, assumptions, costs share revision |
| S33 | Resize/zoom/fullscreen/touch/keyboard | Accurate selection/placement across supported viewports |
| S34 | Repeated scene changes and reopen | No accumulating WebGL/material/texture resource leak |
| S35 | Unsupported engineering/sign connection | Honest concept and priced allowance, never false certification |
| S36 | Empty/zero/negative/nonfinite/extreme inputs | Validation; no NaN money or unbounded geometry generation |

## 17. Landscape Asset Shortlist

Research found these candidates and published license information; no files have been purchased,
downloaded into the app, optimized, visually approved, or integrated yet.

- Primary realism sources: Poly Haven models/PBR materials and ambientCG PBR materials, both CC0.
- Plants: [Shrub 03](https://polyhaven.com/a/shrub_03),
  [Shrub Sorrel 01](https://polyhaven.com/a/shrub_sorrel_01),
  [Wild Rooibos Bush](https://polyhaven.com/a/wild_rooibos_bush).
- Ground: [Grass Ground](https://polyhaven.com/a/grass_ground),
  [Gravel Ground 01](https://polyhaven.com/a/gravel_ground_01),
  [Gravel 023](https://ambientcg.com/view?id=Gravel023),
  [Paving Stones 001](https://ambientcg.com/view?id=PavingStones001).
- Verify appearance, botanical/site suitability, scale, formats, and redistribution terms per
  download. These are visual options, not promises of locally appropriate plant species.
- Source files can be tens of MB/high polygon counts; do not ship raw packs inside the application.
- Optimize selected models/textures; use small previews, LOD, shared texture sets, and lazy loading.
- Kenney Nature Kit is a lightweight fallback candidate, not the primary realistic visual style.
- Licenses: https://polyhaven.com/license and https://docs.ambientcg.com/license/

## 18. Preliminary Engineering Research Starting Points

These sources were located during planning, not established as a completed rules database,
verified local adoption determination, or permission to hardcode a universal design.

| Source | Research Use | Important Limitation |
|---|---|---|
| [ASCE Hazard Tool](https://www.asce.org/publications-and-news/asce-hazard-tool) and [usage](https://www.asce.org/publications-and-news/asce-hazard-tool/about) | Location/edition/risk-category hazard inputs and reports | Does not determine sign geometry, soil, exposure, or local adoption automatically |
| [ICC 2024 IBC Chapter 18 embedded posts/poles](https://codes.iccsafe.org/s/IBC2024P1/chapter-18-soils-and-foundations/IBC2024P1-Ch18-Sec1807.3.1) | Applicable embedded-post/pole methods and limitations; related soil/foundation provisions | Verify complete relevant text/edition/amendments; not a method for every foundation |
| [ACI cover FAQ](https://www.concrete.org/frequentlyaskedquestions/faqid/903.aspx) | ACI 318-19 cover for concrete cast against and permanently in contact with ground | Specific condition/edition; not universal top/bottom/formed-cover guidance |
| [CRSI placing bars](https://www.crsi.org/reinforcing-basics/reinforced-concrete/placing-bars/) and [terminology](https://www.crsi.org/reinforcing-basics/reinforced-concrete-terminology/) | Cover, bars, chairs/bolsters/high-chair terminology and placement principles | Not a complete structural design or universal support-spacing schedule |

Further collection is required for sign loads, concrete design, masonry, frost/local amendments,
pole/material specifications, support-manufacturer limits, and full reproducible worked examples.
Access/licensing gaps remain explicit; do not fill them from AI memory or search snippets.

## 19. First Implementation Batch And Definition Of Done

After approval start CMP-A01/A02/A04 (save integrity), stable-ID/migration design, and CMP-I01/I02
source collection with narrowly scoped tests. Next deliver single-mat rebar/support geometry and
catalog integration, then prove manual assembly editing before AI.

For every batch: reproduce -> failing focused regression -> contained fix -> focused verification ->
full diff review -> fresh remote comparison -> sandbox verification/checkpoint when authorized.
Do not run a broad suite on every small batch; reserve one full estimator gate for the final candidate.

Done requires scenario evidence, agreement between BOM/estimates/rendering, working save/recovery,
honest missing-data handling, and preliminary labels on structural concepts. Source-needle tests
alone cannot hide unresolved blocking defects. Publish approval remains separate.

## 20. Current Progress

- [x] CLI/app/branch authentication and read-only access verified.
- [x] Current module/schema/catalog source captured without overwriting local work.
- [x] Source audit, synthetic calculation probes, existing suites, and syntax checks.
- [x] Realistic asset/license shortlist and authoritative engineering research starting points.
- [x] Architecture, workstreams, scenario matrix, repeated passes, and first batch proposed.
- [ ] Plan approval; exact first-batch file ownership and regression cases.
- [ ] Interactive isolated-fixture browser audit and screenshot baselines.
- [ ] Source collection, verified rule registry, benchmarked preliminary sizing methods.
- [ ] Implementation workstreams and their acceptance scenarios.
- [ ] Final candidate review; separate release authorization.
