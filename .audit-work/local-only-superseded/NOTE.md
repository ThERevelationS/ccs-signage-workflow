# Local-only superseded estimator files (archived 2026-11-14)

These six files existed only in the local tree — never transported to the
remote sandbox and never imported by any remote file. Their concepts all
landed remotely under different surfaces, so they are superseded duplicates
archived here rather than deleted (the remote is the source of truth; a
stale local copy is what previously truncated a remote module).

- `foundationReinforcementCatalogMetadata.js` +
  `FoundationReinforcementCatalogMetadataFields.jsx` — preliminary rebar
  catalog metadata fields (`rebar_diameter_inches`/`rebar_weight_lb_per_ft`).
  Remote equivalent: `ReinforcementDraftMaterial.jsx` renders the same
  authored metadata (`meta("rebar_diameter_inches")`,
  `meta("rebar_weight_lb_per_ft")`, `cost_per_unit`/`unit`).
- `FoundationReinforcementPricingInfo.jsx` — reinforcement pricing
  presentation; remote equivalent rides `foundationReinforcementFrozenPricing`
  + `FoundationReinforcementPricingInfo`-equivalent display in the BOM/proposal
  surfaces.
- `foundationPolePreview3D.js` — pole marker preview; remote equivalent is
  inline in `Foundation3DPreview.jsx` (`CylinderGeometry`/`BoxGeometry` pole
  meshes).
- `foundationPreviewCamera.js` — bounding-sphere camera fit; remote
  equivalent is inline in `Foundation3DPreview.jsx`'s camera block.
- `foundationReinforcementPrintMaterial.js` — WO-part print material;
  remote equivalent rides `foundationReinforcementWorkOrderPart` +
  `foundationReinforcementPrintMaterial`-equivalent consumers.

If a future item needs one of these surfaces, re-derive from this archive
against the REMOTE equivalent — never reintroduce a parallel implementation.
