# Phase B step 3 — full v2 module-set classification (local vs fresh remote)

Remote snapshot: `.audit-work/foundation-phaseb2/remote-src/` (fresh pulls).
All local reinforcement modules: `src/components/estimator/foundation/`.

## SHIPPED (Phase B-1 pure chain — do not touch)

| Module | Remote | Verdict |
|---|---|---|
| foundationGeometryInputs.js | present | SHIPPED — verified in B-1 |
| foundationReinforcementModel.js | present | SHIPPED |
| foundationReinforcementBasis.js | present | SHIPPED |
| foundationReinforcementCost.js | present | SHIPPED |
| foundationReinforcementProjection.js | present | SHIPPED |
| foundationReinforcementItemProjection.js | present | SHIPPED |

## NEW-NEEDED (required for the editor/proposal accept path)

| Module | Remote | Verdict |
|---|---|---|
| useFoundationReinforcementEditor.js | absent | NEW-NEEDED — byte-identical candidate |
| foundationReinforcementEditorSession.js | absent | NEW-NEEDED — **adapted** (held-aware section totals) |
| foundationReinforcementProposal.js | absent | NEW-NEEDED — byte-identical |
| foundationReinforcementDraft.js | absent | NEW-NEEDED — byte-identical |
| foundationReinforcementBasisKey.js | absent | NEW-NEEDED — byte-identical |
| FoundationReinforcementProposalPanel.jsx | absent | NEW-NEEDED — byte-identical |
| ReinforcementDraftField.jsx | absent | NEW-NEEDED — byte-identical |
| ReinforcementDraftGeometry.jsx | absent | NEW-NEEDED — byte-identical |
| ReinforcementDraftList.jsx | absent | NEW-NEEDED — byte-identical |
| ReinforcementDraftMaterial.jsx | absent | NEW-NEEDED — byte-identical |

## NEW-STAGED (verified candidates; consumers are Phase B-4+ grafts, nothing on the editor path imports them)

| Module | Remote | Consumer |
|---|---|---|
| foundationReinforcementCatalogMetadata.js | absent | catalog metadata editor surface |
| FoundationReinforcementCatalogMetadataFields.jsx | absent | catalog row editor |
| FoundationReinforcementPricingInfo.jsx | absent | WO/print provenance display |
| foundationReinforcementFrozenPricing.js | absent | work-order part derivation |
| foundationReinforcementPartDescriptors.js | absent | work-order descriptors |
| foundationReinforcementWorkOrderPart.js | absent | estimate→WO handoff |
| foundationReinforcementPrintMaterial.js | absent | print material rows |
| foundationReinforcementBOMRows.js | absent | FoundationBOM v2 rows (local BOM graft exists — staged) |
| foundationReinforcementPreview3D.js | absent | 3D overlay builder (local 3D graft exists — staged) |
| foundationReinforcementThreePreview.js | absent | three.js renderer |

## UNNEEDED / consumer grafts held back

- Local `FoundationBOM.jsx` v2 graft (imports `foundationReinforcementBOMRows`) — staged consumer, not step-3 scope.
- Local `Foundation3DPreview.jsx` v2 graft (imports `foundationReinforcementPreview3D`/`foundationReinforcementThreePreview`) — staged consumer.
- No pole/camera preview modules in the local set.

## Existing remote files receiving additive grafts

| File | Graft |
|---|---|
| `src/pages/FoundationEstimator.jsx` | +65/-12 — imports, `useFoundationReinforcementEditor` hook block, items.map panel wrap |
| `src/components/estimator/foundation/FoundationItemCard.jsx` | +15/-1 — `legacyReinforcement` gate + versioned note |

## The one adaptation (vs local)

`foundationReinforcementEditorSession.js` `section()` previously recomputed
`cabinets.reduce(unit_cost*qty) + landscapeSummary(...)` — a guess-pricing path
that diverges from the hardened page. Adapted to
`calcProject().totals.{grand_total,total_signage_cabinet_cost,total_landscape_cost}`
— identical fields the page's `sectionTotal` consumes (held at acknowledged
saved totals when unpriceable, never raw-sum). `landscapeSummary` import
dropped. Verified by `verify-phaseb2.mjs` case
"section rows report held-aware totals".
