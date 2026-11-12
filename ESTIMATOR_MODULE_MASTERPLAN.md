# Estimator Module Modernization Masterplan

Complete the detailed masterplan for all eight modules first, then implement and verify them one at a time, beginning with Concrete | Masonry | Pole.

## 1. Confirmed Decisions And Scope

- Brett wants the WHOLE masterplan completed before actual application coding. Do not start
  Concrete implementation while the other seven modules remain generic placeholders.
- Concrete is the first implementation module. Proposed following order is the user's listed order:
  Channel & Dimensional, Sign Maintenance, Paint, Laser, CNC, Metal Fab, Vinyl.
- Each module requires a full audit, working connections, a powerful interactive photo/reference
  assistant, domain-specific generation, deterministic calculations, substantial UX improvements,
  editable results, persistence/recovery, and repeated scenario-based verification.
- Concrete has no provided engineering schedules. Research published requirements to establish
  PRELIMINARY ESTIMATING designs for client pricing; every structural foundation ALWAYS goes to a
  real engineer. Disclosed unknown engineering details must not make preliminary pricing impossible.
- Maximum concurrency: lead plus one implementation worker. Only one module in implementation.
- No publish/deploy/release, production test records, purchases, or external photo processing without
  separate authorization. Testing uses synthetic/offline fixtures and mock AI responses.
- App: CCS Signage Workflow, `68dfcc5e57bbbc35387da97c`, sandbox branch `main`.
- Remote source is authoritative. Protect concurrent work; use the Base44 CLI, current app README,
  fresh source reads, guarded writes, targeted verification, and authorized checkpoints.
- Scope: estimator pages and live calculators/components, their necessary catalogs/schemas,
  shared estimator AI/model/save/pricing/BOM/Builder seams, quote/WO handoff and masterplan dashboard.
- Exclude unrelated Fleet, Time Clock, Permitting, SOP, FileBridge, Walk-In and security-policy changes.
  Domain references to code/permits do not authorize edits to the Permitting module.
- Certified engineering, autonomous machine operation, qualified welding design, production CAM/G-code,
  automatic purchases/payments and construction certification are not features of this estimating plan.
- Earlier eight-worker/deploy/auto-revert execution policies are superseded for this program.
  Historical material in older plans is NOT active authority.

## 2. Concrete Plan And Audit - Preserved In Full

These repository documents form part of this plan; no Concrete requirement is dropped:

- `ESTIMATOR_CONCRETE_MASONRY_POLE_MASTERPLAN.md`: CMP-A01..A14, B01..B17, C01..C12,
  D01..D12, E01..E12, F01..F10, G01..G14, H01..H10, I01..I20.
- `ESTIMATOR_CONCRETE_MASONRY_POLE_AUDIT.md`: initial 24 findings and frozen source/probe evidence.
- Its 16 repeated verification passes and 36 scenarios remain mandatory. Implementation is not done.

Concrete priorities:
1. Save & Exit failure handling, serialized/revision-aware saves, dirty-state and partial sync recovery.
2. Stable foundation/wall/segment/pole/sign/cap IDs, backward-compatible relationships and geometry.
3. Research-backed preliminary wind/site/soil/frost/design methods with sources, units, editions,
   limitations, independent worked examples, explicit assumptions and engineer handoff.
4. Separate horizontal spread-footing mats from vertical reinforcement; preserve pillar longitudinal
   bars. Explicit cover/elevation/layers instead of a top/bottom assumption hidden in rendering.
5. Rebar chairs/stands/supports in inventory, placement/counts, compatible height and bottom contact,
   correct target mat elevation, pack costs, installation labor, BOM, pricing, visuals and handoff.
6. Shared measured 2D/3D assembly including walls, caps, poles, signs, rebar/supports and landscape.
7. Complete wall/cap runs, corners/cuts/stock planning and visual sign mounting/editor/application.
8. Realistic CC0 landscape assets, optimized delivery, catalog-priced quantities and visual-only items.
9. Multi-photo interview -> confirmed brief -> structured proposal -> validate -> edit/apply/revise/undo.
10. Full save/reopen/copy/templates, estimate/Builder/customer-pricing/quote/WO parity and repeated checks.

The initial 47-file remote snapshot, existing suites, syntax checks and pure source probes are
recorded in the audit document. They do not prove complete browser behavior or complete engineering.
Source collection and executable research rules remain future tasks, not completed claims.

## 3. Grounded Live Architecture

Remote page imports and relevant calculator excerpts were inspected using the CLI. Local deeper
reads supplement them. Before repairs, capture complete fresh remote dependency graphs and schemas;
the seven additional module bug audits are NOT already completed.

| Module / Workstream | Live Page / Entity | Actual Calculation And Editor Surfaces |
|---|---|---|
| Concrete / O | `FoundationEstimator.jsx` / `FoundationProject` | `estimator/foundation/*`, `foundationCalc.js`, `legacyFoundationCalc.js`, wall/pole/cap calculators |
| Channel / P | `ChannelLetterEstimator.jsx` / `ChannelLetterInstallation` | `channelLetterInstall/installCalculator.jsx`, `lettersCalculator.jsx`, `LettersPurchaseTab`, `ItemsList`, `PhotoEstimateModal`, `AIInstallScopeModal`, `equipmentSuggester` |
| Maintenance / Q | `MaintenanceEstimator.jsx` / `MaintenanceProject` | `signMaintenance/maintenanceCalculator.jsx`, `maintenanceMaterialRules`, `repaintCalculator`, `ServiceItemRow` |
| Paint / R | `PaintingEstimator.jsx` / `Project` | `estimator/paint/paintCalc.js`, `normalizePaintingItem`, `calculatePaintingProject` |
| Laser / S | `LaserEstimator.jsx` / `LaserProject` | Page-level `calculateTotals`, item update math, `extractLaserDims`, parameter/engraving fields |
| CNC / T | `CNCEstimator.jsx` / `CNCProject` | Live page calculation, settings-driven speeds/multipliers/minimums, `components/cnc/HoldDownAdvisor.jsx` |
| Metal / U | `MetalEstimator.jsx` / `MetalProject` | Live page `calculateTotals`/`getProjectCalculations`, per-unit fabrication components and inventory |
| Vinyl / V | `VinylEstimator.jsx` / `VinylProject` | `vinylEstimator/vinylProjectHelpers.jsx`, `vinylNestingCalculator.jsx`, workflow/parts/artwork/import/layout components |

Page paths above are under `src/pages`; component paths are under `src/components`.

Shared data flow:
`staff/gated reads -> project + inventory + Settings -> live calculator -> internal cost lines ->
categorize*Project/calculateSavedCustomerPricing -> guarded source save -> recordBuilderSave ->
Builder parts/economics -> estimate/quote revision -> accepted WO/purchasing/production snapshot`.

Exact shared seams:
- `src/components/estimator/{moduleRegistry,customerPricing}.js`;
- `src/components/estimator/builder/{builderService,sourceProjectPersistence,partSync}.js`,
  `itemIdentity`, Builder mutation/product persistence and recovery helpers;
- `src/components/markup/projectCategorizer.jsx`, `savedCustomerPricing*`;
- `src/components/estimator/moduleShared/ModuleActionBar`, `ModuleTemplateDialog`, `moduleProjectActions`;
- corresponding `base44/entities/*.jsonc`, `base44/shared/*PricingWire.ts`, authenticated staff gateways.

Existing behaviors to preserve:
- Channel already has photo/scope tools. Upgrade/adapt them; do not create a second unsynchronized AI.
- Maintenance has action/size/material rules and monument repaint logic, not Fleet maintenance.
- Paint uses the live `paintCalc.js` including imperial fractions, mixing, masking and labor tiers.
- Laser speed field names include `*_ipm` while live comments describe mm/sec and square-mm/sec
  conversion. Audit stored units before renaming, converting or changing historical estimates.
- CNC includes settings multipliers, lettering count semantics, carve time and minimums.
  HoldDownAdvisor is advisory, not an unannounced price-changing function.
- Metal totals extend per-unit material/supplies/fabrication/welding/finishing by quantity.
- Vinyl already has multiple workflows, migration and NFDH shelf nesting. Preserve these.
- Old estimator subdirectories can contain unused calculators. Follow actual imports; no "fix" to
  dead code can be reported as a live estimator repair.

## 4. Dashboard Integration Without Unnecessary Code

Observed: `scripts/masterplan-serve.mjs` reads `ESTIMATOR_MASTERPLAN.md`, recognizes single-letter
WS/task prefixes and OPEN/DONE/DOING/BLOCKED/DEFERRED markers, and reads `.masterplan-claims/*`.
Existing workstreams are A-N and Z; O-V are available for the eight module programs.

Complete the all-module plan first, then add its documentation-only rows to the existing ledger.
This is explicitly requested masterplan work, not the start of application coding.
Any dashboard JavaScript/UX changes remain subject to implementation approval:
- DASH-01 Add WS-O Concrete, WS-P Channel, WS-Q Maintenance, WS-R Paint, WS-S Laser,
  WS-T CNC, WS-U Metal and WS-V Vinyl to the existing ledger. Preserve A-N/Z tasks and evidence.
- DASH-02 Use compatible task IDs/status syntax so the current dashboard can display new cards
  without a parser rewrite. Example: `- [ ] \`P-01\` **[OPEN]** ...`.
- DASH-03 Map Concrete CMP tasks one-to-one to O task aliases; keep detailed CMP IDs stable.
  Avoid counting both an alias and its linked acceptance substeps as independent completion.
- DASH-04 Make plan/audit/research/implementation/verification stages explicit in ledger text and
  events. Queued modules are not shown as actively coding while planning is incomplete.
- DASH-05 Root ledger is the status source; module specs contain design/acceptance details, not a
  competing completion database. Only the lead updates status/claims.
- DASH-06 Existing status parser can remain unchanged initially. Later optional dashboard UX adds
  drilldown, scenario/source-gap views, next action, last verified revision and clearer labels.
- DASH-07 Keep sandbox-complete and published distinct. Assertion count, task count and elapsed
  time are not feature-completion evidence.
- DASH-08 Honor lead+one-worker cap. Dashboard worker count excludes the lead; do not confuse a
  two-person total with permission for two additional workers or resurrect the old eight-worker plan.
- DASH-09 Verify exact legacy/new/mixed counts, alias uniqueness, blocked/failed verification,
  complete-but-unpublished state, malformed events and missing documents with read-only fixtures.
- DASH-10 Dashboard remains local; no provider/entity polling, production writes or secret exposure.
  Reuse a running instance if present; do not stop/restart unrelated servers.
- DASH-11 Preserve current hooks/claims and old task states. Do not create always-running loops
  or change global worker policies merely to add module plans.

Ledger publication contract:
- O-001..O-121 are aliases of the existing Concrete CMP tasks in their defined order, one-to-one.
- P/Q/R/S/T/U/V retain the task IDs and requirements in sections 6-12 below.
- WS-W holds shared foundation tasks; W aliases AI/DASH task IDs one-to-one.
- Preserve domain task text, continuation lines, scenario requirements, and test expectations.
- No feature task is marked DONE just because its plan has been written.
- Initial feature status is OPEN with program phase PLANNING COMPLETE / AWAITING IMPLEMENTATION APPROVAL.
- Planning documentation and feature-completion status are separate. Do not add claims for queued work.
- Before appending, verify current file hashes, unused O-W namespaces, no active writer, and absence
  of a duplicate program section. Root ledger is appended, never rebuilt from a stale remote copy.
- This session's dashboard source is local; documentation changes do not imply remote sandbox sync.

## 5. Shared Interview / Reference / Proposal Contract

**Binding 2026-11-06 model decision:** every module's AI uses Base44 `InvokeLLM` with the
shared flagship GPT-6.1 Sol (`gpt_6_sol`), selected explicitly per call from
`base44/shared/estimatorAiModelPolicy.js`. `ESTIMATOR_AI_MODEL_POLICY.md` is part of this plan.
No app-wide default change, direct provider, automatic cheap fallback or increased test-credit
budget. Each module retains specialist prompts; deterministic calculations/shared pricing stay
authoritative. Concrete-first feature sequencing is unchanged.

Build only the minimum proven shared seams while implementing Concrete; adopt them in later modules
sequentially. Do not begin with a framework rewrite or parallel module refactors.

- AI-01 Shared intake shell with module-specific questions; manual/template paths always work.
- AI-02 References: stable ID, purpose, file ref/hash/type, known scale/units, notes, provenance,
  consent and processing state. No image bytes inside project JSON.
- AI-03 Structured brief separates confirmed facts, observations, unknowns, conflicts, assumptions,
  exclusions, user locks, answered questions and evidence references.
- AI-04 Ask relevant unanswered follow-ups, accept "unknown", and explain cost/scope implications.
- AI-05 Proposal shape: `{schema_version,module_key,proposal_id,base_project_revision,brief,
  operations,assumptions,questions,issues,evidence_refs}`. Module-specific operations are an
  allowlisted discriminated union, never arbitrary entity writes, executable code or tool instructions.
- AI-06 Pure `validateModuleProposal({proposal,project,catalogs,rules})` returns field/object issues.
  Pure `applyModuleProposal({project,validatedProposal})` verifies revision and returns one undoable
  local edit. Ordinary guarded save persists accepted edits.
- AI-07 Calculators own quantities and money. AI cannot inject unexplained totals or certification.
  Preview scope/object/cost changes before application.
- AI-08 Cancel/retry/stale-response rejection, idempotent apply receipts, bounded history, request
  limits, network/rate-limit errors and revision-scoped validation are required.
- AI-09 Session-authenticated `estimatorDesignAction` dispatches module/action handlers for reference
  analysis, next_questions, propose and revise. Adapt the initial Concrete endpoint if one exists;
  do not create two competing authoritative assistants.
- AI-10 Secure image/vector/document parsing; bounded types/sizes; no script execution, arbitrary
  remote URL fetching or unconsented third-party photo processing. References are untrusted data.
- AI-11 Lead authors prompts, output contracts, deterministic rules and evaluation cases. Test with
  synthetic inputs, mocked model responses and explicit unexpected-network failures.
- AI-12 Domain source register separates standards, manufacturer limits and shop assumptions;
  preserve edition/applicability/units/unknowns, never "the AI knows" as a source.
- AI-13 Enforce the shared InvokeLLM-only flagship policy in existing and future Estimator AI.
  Unknown module/model availability fails visibly; no silent downgrade or external-provider
  substitution. Verify real requested-model parameters with synthetic spies, preserve model/
  revision provenance and distinguish documented support from live-provider quality evidence.

Concrete interface decisions for implementation:
- Use registry module keys: `foundation`, `channel_letters`, `maintenance`, `painting`, `laser`,
  `cnc`, `metal`, `vinyl`. Validate keys server-side; do not infer them from client-supplied entity names.
- Add one optional `design_assistant` object to each owning project schema. It contains schema version,
  brief revision, reference metadata, confirmed answers, open questions, user locks, pending proposal,
  last applied proposal receipt, and provenance/review state. Bound stored history; no raw image blobs
  or secrets. Legacy fields stay readable; migration is opt-in-on-save, never a destructive backfill.
- Existing project item/workflow/assembly arrays remain authoritative. The assistant stores intent
  and proposals, not a second conflicting priced project model.
- Proposal operations are restricted by module. Foundations: foundation/wall/segment/pole/cap/sign/
  landscape upserts; Channel: letter-set/purchase/install/mount edits; Maintenance: sign/action/
  allowance edits; Paint: item/surface/coating assignments; Laser/CNC: part/operation/stock assignments;
  Metal: stock-part/assembly/operation edits; Vinyl: workflow/part/material/machine/operation edits.
- Remove operations require explicit affected-object preview; referenced children are not silently
  reassigned or deleted. Shared validators reject unknown fields and incompatible/dangling relations.
- Validation returns `{valid, issues, normalizedOperations, baseRevision}`. Issue fields:
  `{code,severity,objectId,field,message,evidenceRefs,blocksApply,blocksProduction}`.
- Preliminary estimating can proceed with explicitly priced assumptions/allowances even when final
  engineering is unresolved. Invalid/nonfinite dimensions, broken refs and unbounded operation
  payloads cannot be applied; review flags are not mislabeled as engineering approval.
- Pure application returns `{project, changeSummary, appliedProposalReceipt}`. It checks exact base
  revision, preserves locked/manual edits and recalculates through the same domain model as manual UI.
- Extract live Laser/CNC/Metal math into small pure modules under their live component paths only
  when needed for testable reuse; fixtures prove parity before intentional changes. Do not activate
  an old dead calculator merely because its filename looks appropriate.
- Common result envelope: `{items,costLines,totals,issues,renderModel,calculationVersion}` through
  adapters. Domain units are explicit; legacy saved fields continue to match existing Builder wires.
- Every cost line carries source object ID, quantity/unit, rate/unit, extended cost, category,
  catalog/version or allowance source, and whether it is owned here or referenced from another product.
- No new dependency is assumed available. Inspect installed packages and version/license/release age
  before adding one. Reuse React, existing Three.js/editor components, guards and persistence helpers.

## 6. Channel & Dimensional - WS-P

Own `ChannelLetterEstimator.jsx`, `channelLetterInstall/*`, `ChannelLetterInstallation` and necessary
inventory/pricing seams. Shared personnel/equipment/travel changes require regression coverage.

- P-01 Audit live purchase/fabrication/install ownership, counts/dimensions/set IDs, rate settings,
  snapshots, source save, Builder mappings and all existing photo/scope entry points.
- P-02 Interview: text/font/artwork, count/height/depth, type, faces/returns/backs, illumination,
  finish/color, mounting substrate, raceway/backer, access/height, electrical scope and location.
  [LANDED: `channelInterviewModel.js` contract + verifier 26/26 local+remote — see root ledger `P-02`]
- P-03 Improve existing photo/scope tools into one brief/proposal workflow with known-scale calibration,
  conflict resolution and explicit unverified wall/electrical/structural assumptions.
  [LANDED: `channelScopeBrief.js` merge/calibration/proposal model + verifier 17/17 local+remote — see root ledger `P-03`]
- P-04 Editable letter-set/layout/elevation preview: overall envelope, spacing, alignment, mounting,
  raceway/backer, front/halo illumination concept, front/back artwork and material/finish selections.
  [LANDED: `channelLayoutModel.js` render contract + verifier 16/16 local+remote - see root ledger `P-04`]
- P-05 Deterministic purchased/fabricated set takeoff for face/return/back, LEDs/power supply from
  product data, trim/raceway/backer/hardware, finish, assembly and installation labor.
  [LANDED: `channelSetTakeoff.js` BOM model + verifier 23/23 local+remote - see root ledger `P-05`]
- P-06 Validate material/mount/illumination compatibility, available size/stock, access/crew/equipment,
  electrical/load assumptions and missing prices. No certification claims.
- P-07 Reconcile letters-to-install synchronization, edits/deletion/duplication, overrides, delivery,
  design/permit allowances, personnel and travel exactly once.
- P-08 Purchased versus fabricated alternatives; optional scopes stay separate from accepted base.
  Linked Concrete/Paint/CNC/Laser products have explicit cost ownership, not duplicated charges.
- P-09 Export quote scope, fabrication takeoff, layout and installation sheet with inclusions,
  exclusions, references and review needs.
- P-10 Bulk sets, duplicate/mirror, substitutions, stock warnings, reusable templates, dimension entry,
  explanation of each charge, keyboard editing and recoverable save.
- P-11 Prove complete copy/template/reopen, manual locks, proposal revision/undo and accepted pricing.
- P-12 Scenarios: flush channel, halo, unlit dimensional, mixed sets, fabrication-only, install-only,
  high facade, unknown scale/electrical access, changed counts, reassigned purchase, raceway change,
  custom zero markup, canceled/stale proposal and linked-product ownership.
- P-13 Tests: existing `test-channel-pricing-wire.mjs`; new pure set/proposal/material/quantity fixtures
  and synthetic layout/recovery/Builder tests. Assert visible placement and exact-once cost ownership.

## 7. Sign Maintenance - WS-Q

Own `MaintenanceEstimator.jsx`, `signMaintenance/*`, relevant Maintenance project/action/material
schemas and estimator handoff seams. Not authority to modify Fleet or unrelated service billing.

- Q-01 Audit action/size/rate lookup, multi-action items, default-material rules, monument repaint,
  overrides, crew/equipment/travel and Builder reconciliation.
- Q-02 Interview: sign type/count/location/size, symptom photos, lighting/system/model, service
  history, access/height, known parts, diagnostic certainty and repair/replacement objective.
- Q-03 Repair map with marked components/defects, references and selected actions. AI proposes
  possible causes/inspections, not a certain remote diagnosis.
- Q-04 Separate diagnostic visit, confirmed repair, optional replacement and return-visit scopes.
  Concealed conditions become allowances and approval points.
- Q-05 Catalog-driven lamps/LEDs/drivers/faces/cabinets/hardware/cleaning/repaint; compatibility
  needs product data or an explicit confirmation flag.
- Q-06 Model minimums/mobilization, technicians, crew/lifts/ladders/travel, several signs/sites,
  return trips, disposal and subcontract allowances without repeated labor/equipment.
- Q-07 Repair sequence, parts readiness, field verification/checklist, quote-to-WO scope and relevant
  repair history/warranty references.
- Q-08 Link repaint/replacement fabrication to other module products with explicit cost ownership.
- Q-09 Grouped actions, repeat-service templates, bulk sign edits, repair-vs-replace comparison,
  photo notes and customer-readable conditions/exclusions.
- Q-10 Save/recovery, accepted optional scope, action/photo IDs and manual/AI changes survive reopen.
- Q-11 Scenarios: LED outage, unknown driver, mixed lamps, face replacement, monument repaint,
  cleaning-only, lift job, multi-action/sign/site, return trip, unpriced part, repair alternatives,
  optional scope excluded, stale proposal and uncertain cause requiring inspection.
- Q-12 Tests: `test-maintenance-pricing-wire.mjs`; pure action/material/repaint/proposal tests and
  repair-map/recovery/Builder fixtures. Unknowns cannot silently turn into zero labor or free parts.

## 8. Paint - WS-R

Own `PaintingEstimator.jsx`, live `estimator/paint/paintCalc.js`, paint settings/catalog adapters and
the `Project` fields used here. Check other consumers before altering a shared entity shape.

- R-01 Audit fraction/dimension/count parsing, faces/edges, masking, mix ratios, coverage/coats,
  labor tiers/minimums, package units and material/labor splits.
- R-02 Interview: substrate/condition, geometry/count, faces/edges, finish/colors, coating system,
  preparation, application method, shop/on-site and conditions.
- R-03 Surface/zone preview with area, finish/color and reference photos. No exact color matching
  or hidden-surface measurement from an uncalibrated photo.
- R-04 Source coating compatibility, coverage, mix/pot-life/cure data and limitations from verified
  technical sheets; missing data stays explicit.
- R-05 Separate cleaning/stripping/sanding/repair/masking, primer/topcoats, waste, reducers/hardeners,
  package rounding and preparation/application labor/equipment.
- R-06 Distinguish elapsed drying/cure time from active billable work and booth occupancy; validate
  gallon/quart/ounce and sqft/sqin conversions.
- R-07 Support zero overrides, partial/multicolor jobs, supplied material, outsourced finish and
  minimums; do not charge Paint twice when another product owns finishing.
- R-08 Coating alternatives, finish schedule, material/mix takeoff, masked zones and quality/handoff
  details tied to the accepted revision and source data.
- R-09 Reusable coating presets, batch edits, friendly dimension entry, coverage explanation, live
  alternatives, AI revision/undo, templates and recoverable saves.
- R-10 Scenarios: panel, dimensional-letter edges, several faces/colors, unknown repaint condition,
  mixed units, small minimum, primer excluded, variable coats, cure versus active hours, legitimate
  zero override, incompatible system, unsupported color match and old saved project.
- R-11 Tests: `test-paint-pricing-wire.mjs`; new coverage/mix/unit/package/proposal fixtures plus
  surface-editor/recovery/Builder parity tests against live `calculatePaintingProject`.

## 9. Laser - WS-S

Own `LaserEstimator.jsx`, live page math, Laser schema/settings/material adapters and pricing seam.
No machine-ready code or autonomous equipment parameter changes.

- S-01 Audit actual stored units, panel/letter/engrave/combined quantities, multipliers,
  setup/handling/minimum/material charges and legacy defaults before extracting pure math.
- S-02 Interview: artwork/vector/raster/reference, known scale, material/spec/thickness, machine,
  part count, engraving/quality intent, finish/tolerance and customer-supplied stock.
- S-03 Harden SVG/DXF import: units/viewBox, bounds, supported paths/holes/cut length, duplicate/open
  geometry, unsupported transforms/entities and honest partial-parsing diagnostics.
- S-04 Preview measured cut/engrave layers and counts; label bounding-box estimates versus supported
  vector-derived geometry.
- S-05 Derive cut length, raster area/fill, passes, setup/handling, stock/waste, finish and active
  machine/operator time using calibrated machine/material information.
- S-06 Material/process and machine-envelope checks; unknown/unsuitable material needs operator
  review or an alternative estimate. AI cannot authorize a cut.
- S-07 Sheet/stock/remnant alternatives; distinguish heuristic rectangle nesting from actual shape
  nesting, and respect rotation/grain constraints.
- S-08 Preserve setup-per-job/part semantics, supplied stock, cut+engrave combination, minimums,
  manual settings and accepted snapshots during intentional calculator improvements.
- S-09 Estimate job sheet with material/scale/process/pass/time basis and layer preview; no
  unvalidated production toolpaths.
- S-10 Bulk parts, layouts, file replace, dimension override, operator rationale, reusable setups,
  templates and save/retry/reopen.
- S-11 Scenarios: cut panel, engrave, combined, letters, inch/mm vector, missing SVG scale, duplicate
  paths, several quantities, unsupported entity, machine-too-small, unpriced/unsuitable stock,
  small minimum, stale AI result and historical speed-unit contract.
- S-12 Tests: `test-laser-pricing-wire.mjs`; live-math/unit/import/proposal fixtures and layer-preview/
  recovery/Builder tests. Capture exact old behavior before accepting changed timing estimates.

## 10. CNC - WS-T

Own `CNCEstimator.jsx`, live `components/cnc/*`, settings/material/schema adapters and pricing.
No machine control, certified toolpaths or AI-approved workholding.

- T-01 Audit live panel/lettering/carving math, thickness, cut multipliers, carve area/depth,
  quantities, setup/minimums and persisted computed fields.
- T-02 Interview: artwork/vector/3D reference, scale, material/thickness/stock, finish/tolerances,
  cut/pocket/carve intent, counts, tooling and machine/workholding limitations.
- T-03 Validated vector/operation preview with outside/inside/pocket assignment, stock orientation,
  pocket depth and estimated area/length; unsupported imports stay visibly partial.
- T-04 Source/calibrate feed/pass/depth/tool-change assumptions per machine/tool/material. Separate
  estimate timings from operator-approved machining parameters.
- T-05 Include passes, pockets, tabs/onion skin where applicable, setup/tool changes, loading,
  finishing, spoilboard/consumables, waste and machine/operator time.
- T-06 Integrate HoldDownAdvisor with small-piece, tool/feature, clamp/vacuum/clearance and loose-part
  warnings; unknown workholding requires operator review.
- T-07 Grain/rotation/stock/remnant-aware estimate nesting with stated algorithm limits.
- T-08 Preserve lettering count semantics; never multiply number of letters twice.
- T-09 Part/operation tree, bulk inputs, presets, alternatives, stock takeoff and estimate setup sheets.
  Advisory checks do not silently become new charges.
- T-10 Complete copy/template/reopen, user operation locks, AI revise/undo, zero overrides and recovery.
- T-11 Scenarios: panel, letters, carve, pocket+cut, multipass, oversized tool, loose parts, vacuum/
  clamp options, grain lock, sheet overflow, unknown material, zero override, quantity change,
  old minimum, repeated import and cross-module finish ownership.
- T-12 Tests: `test-cnc-pricing-wire.mjs`; pure live-math/unit/operation/hold-down/proposal fixtures and
  preview/recovery/Builder handoff scenarios.

## 11. Metal Fab - WS-U

Own `MetalEstimator.jsx`, live page math, Metal project and fabrication inventory adapters.
Estimates do not certify connections, structural design or welding procedures.

- U-01 Audit sheet/tube/angle/bar/assembly representations, stock units/dimensions, per-unit versus
  extended material/supplies/fabrication/welding/finishing and labor hours.
- U-02 Interview: drawing/photo, dimensions/count, alloy/grade/thickness/profile, finish, joining,
  tolerances, purpose, mounting/load context, delivery and supplied stock.
- U-03 Editable part/cut/assembly tree with measured profiles, basic assembly preview, joins/hardware,
  finish and stable parent/child IDs.
- U-04 Derive supported stock/cut length, sheet area, purchased stock, kerf/offcuts/waste, weight when
  density/spec known, hardware and consumables; unknown grade/density stays explicit.
- U-05 Separate cutting/drilling/forming/fitting/welding/grinding/finishing/setup, subcontract
  minimums and active fabrication time.
- U-06 Source bend/stock/machine/process limits from verified shop/manufacturer data. Do not invent
  weld capacity, structural certification or a safe connection.
- U-07 Stock optimization is an explicit alternative; preserve full-stock assumptions until accepted.
- U-08 Link CNC/Laser/Paint operations with explicit cost ownership and revision identity.
- U-09 Quote scope, cut/assembly lists, finish/hardware takeoff, fit/quality checks and engineer/
  operator review flags in handoff.
- U-10 Mixed-unit inputs, duplicate/mirror assemblies, batch finish/material changes, alternatives,
  explained overrides, recovery and full templates.
- U-11 Scenarios: sheet part, tube frame, mixed assembly, cut versus purchased stock, repeated parts,
  bends, weld length, subcontract coat, supplied stock, unknown weight, complex connection, zero
  override, changed quantity, linked paint/laser and declined/accepted cut optimization.
- U-12 Tests: `test-metal-pricing-wire.mjs`; unit/per-unit/extended/stock/assembly/proposal fixtures
  and cut-list/recovery/Builder no-duplicate-cost tests.

## 12. Vinyl - WS-V

Own `VinylEstimator.jsx`, `vinylEstimator/*`, direct `vinylInventory/*` adapters and project schema.
Preserve multi-workflow behavior; do not replace it with a single generic AI item.

- V-01 Audit migration/rollup, per-workflow nesting, margins, print/cut/laminate/tape, ink/blade/
  operator/weeding/install labor, personnel, spoilage and setup floors.
- V-02 Interview: artwork/photos, known scale/count, surface/condition, print versus cut, indoor/
  outdoor/use-life intent, finish/color, removal, seams/tiling, install/access.
- V-03 Propose complete workflows/parts, compatible vinyl/laminate/tape and machines, quality,
  weeding/transfer/application and optional removal/preparation.
- V-04 Artwork/placement preview at confirmed scale, roll nests, seams/tiles, bleed/gutters;
  photo perspective is not a measured installation dimension.
- V-05 Validate manufacturer surface/application compatibility, machine widths/margins, laminate/
  tape sizes, print quality/ink, preparation and unavailable products.
- V-06 Oversize tiling and overlap/registration assumptions; never silently omit an unplaceable
  part or imply NFDH rectangle packing is optimal shape nesting.
- V-07 Reconcile full-roll/per-foot/per-sqft pricing, spoilage-before-nesting, remnants, ink, laminate/
  tape, wear, machine/operator/personnel labor, project supplies, travel and equipment.
- V-08 Material/roll-width/machine alternatives showing yield/cost/time and algorithm limits;
  preserve user-locked material/artwork decisions.
- V-09 Grouped parts, CSV validation, workflow templates, duplication, artwork replace, layer visibility,
  labels, warning navigation and keyboard-accessible editing.
- V-10 Stable workflow/item IDs, legacy migration, repeated sync, complete save/copy/template/artwork
  persistence, accepted optional operations and revision locks.
- V-11 Export roll/material takeoff, print/cut/laminate/application scope, tiling/layout, labor and
  install notes tied to the accepted estimate revision.
- V-12 Scenarios: print-only, cut-only, all operations, several workflows, old saved row, narrow roll,
  oversized tiled part, rotation lock, bleed/gutters/spoilage, contour versus rectangle estimate,
  supplied material, zero setup override, personnel overlap, unavailable artwork/product, canceled AI.
- V-13 Tests: `test-vinyl-helpers.mjs`, `test-vinyl-persistence.mjs`, `test-vinyl-pricing-wire.mjs`;
  pure nesting/unit/compatibility/tiling/proposal and workflow/editor/recovery/handoff fixtures.

## 13. Research And Data Program

For every source: authority/title, edition/date, URL, access date, license, applicability, input/output
units, limitation, verified excerpt/rule reference and unresolved gaps. Current links are starting
points, not already digitized requirements or approved project/machine settings.

- Concrete: ASCE hazard/design basis, ICC soil/pole provisions, ACI reinforcement/cover, CRSI
  supports, manufacturer support limits, local frost/adoption and independently reproduced examples.
- Channel/Maintenance: sign/illumination product specifications and compatibility, mounting/system
  constraints, qualified electrical scope, diagnostics and replacement alternatives.
- Paint: product technical sheets, substrate/primer/coating compatibility, mixes, coverage,
  application conditions and elapsed-versus-active time.
- Laser/CNC: machine/tool/material documentation and calibrated shop timing, working envelopes,
  process restrictions and operator-confirmation boundaries.
- Metal: actual stock profiles/units/densities, shop forming/process data and subcontract limits.
- Vinyl: media/laminate/tape/surface/application/product-life and machine compatibility.
- Do not buy/bypass paid standards, scrape business systems, invent internet prices or claim that
  a search excerpt proves the complete applicable requirement.
- Version research and rules; changes offer reviewed recalculation rather than silently changing
  accepted estimates. Catalog prices and disclosed allowances remain commercial sources of truth.

Located starting sources include:
- https://www.asce.org/publications-and-news/asce-hazard-tool/about
- https://www.concrete.org/frequentlyaskedquestions/faqid/903.aspx
- https://www.crsi.org/reinforcing-basics/reinforced-concrete/placing-bars/
- https://sloanled.com/downloads/DensityGuidelines-ChannelLetter-US-Canada.pdf
- https://sloanled.com/downloads/PowerSupplyCapacityChart-US-Canada.pdf
- https://onsrud.com/Forms/Cutting-Data-Recommendations.asp
- https://www.troteclaser.com/en/resources/faqs/unsuitable-materials-laser-processing
- https://multimedia.3m.com/mws/media/2419614O/3m-instruction-bulletin-application-substrate-selection-and-preparation-ra-pdf.pdf
- https://graphics.averydennison.com/content/dam/averydennison/graphics/na/en/documents/Instructional-Bulletins/General-Information/ib110-substrate-cleaning-preparation.pdf

Matthews technical/training/mixing sheets were also located. Select exact current product sheets
after catalog products are identified; do not apply a generic mix/coverage number to all paints.
Concrete realistic CC0 asset candidates/licenses remain in its preserved masterplan, section 17.

## 14. Shared Acceptance Matrix And Repeated Verification

Every module runs its own domain scenarios PLUS these shared passes:
1. Current remote call graph/schema audit; record source snapshot and confirmed versus suspected bugs.
2. Reproduce accepted defects and write focused failing tests before fixing.
3. Quantity/unit/cost fixtures: zero/missing/negative/nonfinite, fractions/conversions, stock/pack
   rounding, quantities, minimums, overrides and material/labor/equipment ownership.
4. Proposal/model fixtures: stable IDs, invalid/dangling/cross-module refs, scale unknown, conflicting
   answers, schema limits, canceled/stale responses, repeated apply, one-step undo and manual locks.
5. Recovery injection: failed/lost save response, CAS conflict, double save, edits during save,
   partial Builder sync, route switch, copy/template/reopen and accepted-revision guard.
6. Browser fixtures: rendered dimensions/takeoff match, selection/placement/zoom/resize, touch/
   keyboard/numeric fallback, warning navigation, unavailable files/assets and WebGL failure.
7. Commercial chain: cost lines equal project cost; sell unchanged without authored pricing config;
   BOM/parts have no omissions/double charges; quote/revision/WO snapshot identity is consistent.
8. Repeat earlier scenarios after later UI/AI/integration changes; operator walkthrough of several
   varied synthetic jobs. Exact revision, logs and visual evidence required.

Test prerequisites: in-memory catalogs/entity stubs, synthetic files, mocked AI, unexpected network/
entity/provider calls fail. No production customers, invoices, inventory or work orders as fixtures.
No external photo uploads merely to demonstrate a button.

Existing targeted suites are listed in module sections. Changed shared seams also need relevant
`test-builder-service.mjs`, `test-builder-persistence.mjs`, `test-builder-recovery.mjs`,
`test-module-registry.mjs`, `test-customer-pricing.mjs`, `test-estimate-save-recovery.mjs`,
`test-quote-lifecycle.mjs` and the active module's pricing-wire suite.
Inspect current test dependencies before execution; filenames alone do not prove a test is offline.
Use focused gates each batch and one broader estimator integration pass per final module candidate.
No Fleet/Permitting/Admin sweep required, and no weakening tests or audit-wording changes as a fix.

## 15. Implementation Sequence And Gates

G0: Finish all eight module plans, source maps, requirements, interview/proposal design, acceptance
cases, compatibility constraints, research gaps, dashboard mapping and review before application coding.

G1: Integrate completed masterplan/WS-O..W documentation rows into the existing ledger/dashboard
without changing application code or invoking provider/business APIs. Report planning as complete,
features as queued, and stop at the implementation approval gate.

G2: Concrete only, contained batches:
save integrity + source register -> stable model/IDs/catalog -> rebar/support quantities/geometry ->
manual walls/caps/poles/signs/site -> interactive AI -> integration -> repeated verification/review.

G3: Freeze verified Concrete candidate and evidence; close blocking defects, retain honest preliminary
engineering flags, operator acceptance, and sandbox state. This does not authorize deployment.

G4: Repeat audit/research/model/calculation/UI/AI/integration/verification for each following module,
one at a time. Reuse proven shared seams without parallel feature rewrites.

G5: Cross-module synthetic estimate with all eight products, explicit ownership of linked operations,
catalog/rate snapshots, save/reopen, quote changes and accepted production handoff.

G6: Separate release approval. Authorized checkpoints after verified phases; no interpretation of
plan approval or "continue" as publish/deploy authority. UI/UX phase approval remains distinct from
correctness-repair approval under the Base44 workflow.

## 16. Progress, Remaining Review And Deliverables

- Concrete source audit and detailed plan exist; feature implementation has not started for this ask.
- Seven additional live entry/calculation maps inspected; their full defect audits are queued tasks.
- Dashboard parser/available O-V workstreams established; no dashboard code changed.
- User decisions captured: plan ALL modules first; code sequentially; Concrete first; researched
  preliminary estimating; every structural foundation reviewed by a real engineer.
- Before coding, review domain coverage, unique IDs, actual live import targets, data ownership,
  new optional schema fields, backward compatibility and non-network test boundaries.
- Any schema surprise or unsupported requirement returns to planning; do not invent a competing
  source of truth or overwrite stale/concurrent work.
- Blocked/out-of-scope requirements stay visible with the exact blocker and alternatives.

Deliverables after approval: masterplan index/ledger and module specs; compatible dashboard cards;
sequentially verified module changes with full diffs, targeted tests, browser evidence, source/rule
provenance, complete persistence/handoff, authorized checkpoints and explicit deployment state.
The plan does not claim those implementation deliverables are already complete.
