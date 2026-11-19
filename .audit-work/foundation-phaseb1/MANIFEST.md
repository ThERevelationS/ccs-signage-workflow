# Phase B1 — Reusable-module manifest (Step 1)

Scope: local `src/components/estimator/foundation/foundationReinforcement*`,
`useFoundationReinforcementEditor.js`, `FoundationReinforcement*Panel.jsx`,
`FoundationReinforcement*Fields.jsx`, `FoundationReinforcement*Info.jsx`,
`foundationGeometryInputs.js`. Remote HEAD verified `97d37964a8554d7561995975deb0d6096f63e3e3`
(= `d04cbe54d`+ junk cleanup landed), main branch, clean tree.

Remote verification: every imported symbol was checked against the FRESH remote
copy of its module (`.audit-work/foundation-phaseb1/remote-src/…`).

## Import-resolution findings

- Remote has NO `foundationGeometryInputs.js` (NOT_FOUND). Remote superseded the
  validation seam: geometry/type/quantity/dimension checks are inlined inside
  `foundationInputValidation.foundationItemInputIssues`, which also checks
  `excavation_method` and the `custom_*` override fields, plus
  `signageCabinetInputIssues` / `foundationProjectInputIssues` (project-method
  inheritance, landscape).
- `foundationInputNumber` ≡ remote `inventoryFiniteNumber` and
  `foundationPositiveWholeNumber` ≡ `inventoryIsPositiveWhole`
  (byte-equivalent semantics, `masterInventory/inventoryNormalization.js`).
  `foundationGeometryValidation` / `foundationItemGeometryIssues` have NO remote
  equivalent — the leaf must be ported as a new module (rewiring to
  `foundationItemInputIssues` would drag excavation-method/override checks into
  the v2 model's geometry gate and change verified v2 issue codes).
- `legacyFoundationCalc.calcItemCost(item, inventory, settings)` — exists
  remotely, same signature (remote line 153). `calcConcreteDelivery`,
  `foundationItemSettingIssues`, `normalizeConcreteSupplier` also present.
- `foundationCatalogIntegrity.foundationItemCatalogIssues(item, inventory,
  index)` — exists remotely, same signature. NOTE: remote lacks the v2
  rebar-material branch (`reinforcement_material.inventory_id` check vs legacy
  `rebar_size`); the candidate graft adds it (Step 2). Import resolves
  regardless.
- `foundationLayoutModel.layoutPositionInches` — exists remotely (line 42).
- `landscapeMaterials.landscapeSummary` — exists remotely (line 77).
- `idempotentEntityCreate.newCreationRequestKey` — exists remotely (line 44).
- `three` ^0.171.0 — present in remote `package.json` dependencies.

## Per-file verdicts

### Calc-path set (ported in Phase B step 2)

| File | Verdict | Imports → resolution |
|---|---|---|
| `foundationGeometryInputs.js` | **REUSABLE-AS-IS** (new remote file, leaf) | none |
| `foundationReinforcementModel.js` | **REUSABLE-AS-IS** | `./foundationGeometryInputs` → leaf port |
| `foundationReinforcementBasis.js` | **REUSABLE-AS-IS** | `./foundationGeometryInputs` → leaf port |
| `foundationReinforcementCost.js` | **REUSABLE-AS-IS** | none |
| `foundationReinforcementProjection.js` | **REUSABLE-AS-IS** | `./foundationReinforcement{Model,Basis,Cost}` → ported set |
| `foundationReinforcementItemProjection.js` | **REUSABLE-AS-IS** | `./legacyFoundationCalc` `calcItemCost` ✓ remote; `./foundationCatalogIntegrity` `foundationItemCatalogIssues` ✓ remote (v2 branch grafted in candidate); `./foundationGeometryInputs` → leaf port; `./foundationReinforcementProjection` → ported set |

### Editor / proposal set (Phase B later steps — NOT ported now)

| File | Verdict | Imports → resolution |
|---|---|---|
| `foundationReinforcementDraft.js` | REUSABLE-AS-IS | `./foundationGeometryInputs` → leaf port |
| `foundationReinforcementBasisKey.js` | REUSABLE-AS-IS | none |
| `foundationReinforcementProposal.js` | REUSABLE-AS-IS once calc/validation/integrity candidates land | `./foundationCalc` `calcItem` ✓; `./foundationInputValidation` `foundationItemInputIssues` ✓; `./foundationCatalogIntegrity` `foundationItemCatalogIssues` ✓; `./foundationReinforcement{Draft,ItemProjection,BasisKey}` → ported later |
| `foundationReinforcementEditorSession.js` | REUSABLE-AS-IS | `./foundationCalc` `calcProject` ✓; `./landscapeMaterials` `landscapeSummary` ✓ remote; `./foundationReinforcement{Draft,Proposal}` → later |
| `useFoundationReinforcementEditor.js` | REUSABLE-AS-IS | `react` ✓; `./foundationReinforcementEditorSession` → later; `@/components/estimator/idempotentEntityCreate` `newCreationRequestKey` ✓ remote |
| `foundationReinforcementCatalogMetadata.js` | REUSABLE-AS-IS | `./foundationGeometryInputs` → leaf port |
| `FoundationReinforcementProposalPanel.jsx` | REUSABLE-AS-IS | `./ReinforcementDraft{Geometry,Material}` → later |
| `FoundationReinforcementCatalogMetadataFields.jsx` | REUSABLE-AS-IS | `./foundationReinforcementCatalogMetadata`, `./ReinforcementDraftField` → later |
| `FoundationReinforcementPricingInfo.jsx` | REUSABLE-AS-IS | none |
| `ReinforcementDraftField.jsx` | REUSABLE-AS-IS | none |
| `ReinforcementDraftGeometry.jsx` | REUSABLE-AS-IS | `./ReinforcementDraft{Field,List}` → later |
| `ReinforcementDraftList.jsx` | REUSABLE-AS-IS | `react`, `./ReinforcementDraftField` |
| `ReinforcementDraftMaterial.jsx` | REUSABLE-AS-IS | `./ReinforcementDraftField` |

### Downstream handoff set (Phase B later steps — NOT ported now)

| File | Verdict | Imports → resolution |
|---|---|---|
| `foundationReinforcementBOMRows.js` | REUSABLE-AS-IS | none |
| `foundationReinforcementFrozenPricing.js` | REUSABLE-AS-IS | none |
| `foundationReinforcementPartDescriptors.js` | REUSABLE-AS-IS | none |
| `foundationReinforcementWorkOrderPart.js` | REUSABLE-AS-IS | `./foundationReinforcement{PartDescriptors,FrozenPricing}` |
| `foundationReinforcementPrintMaterial.js` | REUSABLE-AS-IS | `./foundationReinforcementWorkOrderPart` |
| `foundationReinforcementPreview3D.js` | REUSABLE-AS-IS | `./foundationGeometryInputs` → leaf port; `./foundationLayoutModel` `layoutPositionInches` ✓ remote; `./foundationReinforcementModel` → ported |
| `foundationReinforcementThreePreview.js` | REUSABLE-AS-IS | `three` ✓ remote package.json |

## Existing-file edits required by the calc path (Step 2 candidates)

- `foundationCalc.js` — graft `calculateVersionedItem`, versioned dispatch in
  `calcItem`/`calcProject`, `include_rebar:false` delivery strip for v2 items,
  `REINFORCEMENT_SNAPSHOT_FIELDS`, itemProjection import.
- `foundationInputValidation.js` — graft the v2 gate: unsupported-version issue,
  `include_rebar` boolean check, skip legacy include_rebar field checks for
  version 2, model error scan (`geometryLimit:0`). All additive for v1 items.
- `foundationCatalogIntegrity.js` — graft the v2 `reinforcement_material`
  catalog check (`catalog` kind → unique rebar-typed inventory row), early
  return for versioned items. Legacy branch untouched.

No module is STALE: every local v2 module's imports resolve verbatim against
current remote + the leaf port + the three grafted candidates. No NEEDS-REWIRE
symbols were required — rewiring `foundationInputNumber` to
`inventoryFiniteNumber` remains an available simplification but was rejected to
keep ported bytes identical to the verified local sources.
