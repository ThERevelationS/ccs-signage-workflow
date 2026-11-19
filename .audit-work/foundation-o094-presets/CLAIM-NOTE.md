# foundation-o094-presets — claim note

**Unit:** `foundation-o094-presets` — O-094 (CMP-H03): start-from-assembly presets, duplicate/mirror, bulk material changes, and reusable templates.
**App:** `68dfcc5e57bbbc35387da97c`, branch `main`, remote HEAD verified `37d401b5aecbafc7ce1773af233efdde22c7ee75` (clean).
**Mode:** LOCAL candidates only. No remote write / checkpoint / deploy performed or claimed.

## Files claimed by this unit (candidates)

- `src/components/estimator/foundation/foundationAssemblyPresets.js` — NEW. 6 frozen named assembly presets (snapshot-shaped `project_data`, all 5 arrays, blank material ids) + `foundationAssemblyPresetTemplateData` + `describeFoundationAssemblyPreset` + `applyFoundationAssemblyPreset` (replace via the real prepare gate; append via collision-guarded clone splice).
- `src/components/estimator/foundation/foundationDuplicateMirror.js` — NEW. `duplicateFoundationAssembly` (id selection + dependent closure + offset), `mirrorFoundationAssembly` (copy / in_place reflect about at / foundation edge / centerline), shared `appendClonedFoundationAssemblies` clone+append engine.
- `src/components/estimator/foundation/foundationBulkMaterialChange.js` — NEW. `FOUNDATION_BULK_MATERIAL_TARGETS` applicability map + `applyFoundationBulkMaterial` (all/replace/fill_blank, scope, project default, custom-price advisory).
- `src/components/estimator/foundation/FoundationTemplateDialog.jsx` — adds the "Start from an assembly preset" pick section + `applyPreset` riding the existing `onApply(data)` lane; "Saved templates" block preserved inside a labeled section.

## Files NOT claimed (explicitly out of scope)

- `src/pages/FoundationEstimator.jsx` (page owner — the `commit(() => patch)` + `newCreationRequestKey` wiring anchors are documented in SPEC.json, not landed), `FoundationToolbar.jsx` (button mounts deferred — dead buttons worse than documented anchors).
- `foundationCalc.js`, `foundationReinforcement*`, `partSync.js`, `FoundationBOM.jsx` (Phase B-3), `FoundationProject.jsonc`/`FoundationSettings.jsx`, `foundationDraftRecovery.js`/`foundationBuilderRecovery.js`/`foundationSaveSession.js`/`foundationSyncRecovery.js` (O-004t cluster), inventory files, `foundationAiReview.js`/`AiEngineeringAssistant.jsx`.
- `foundationAssemblyModel.js`, `foundationLayoutModel.js`, `foundationTemplateModel.js`, `foundationTemplateService.js`, `foundationPreliminaryNotice.js`, `wallCalculator.js`, panels/canvas (`FoundationItemCard`, `FoundationPolesPanel`, `FoundationWallCapsPanel`, `FoundationWallsPanel`, `SignageCabinetsPanel`, `FoundationLayoutCanvas`, `poleCalculator.js`) — pulled/read remotely for the field+geometry contract only; imported, never edited.

## Deferred mounts (documented wiring remainders, SPEC.json `deferred_wiring_remainders`)

- `FoundationEstimator.jsx` — `commit(() => <op>(project, {component_ids, createId: (k) => newCreationRequestKey(`foundation_${k}`)}).patch)` for duplicate/mirror/bulk (+ preset append).
- `FoundationToolbar.jsx` — `onDuplicate`/`onMirror`/`onBulkMaterial` Btn props + pickers for mirror line and bulk target/value/mode.
- Selection plumbing — `component_ids` accepts any array; absent = whole assembly.

## Concurrency

- No other agent/builder activity observed; remote worktree clean at pull time.
