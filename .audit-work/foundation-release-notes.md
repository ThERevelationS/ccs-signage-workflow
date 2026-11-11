# Foundation estimator — release notes (estimator-modernization-20261105)

Session-scoped release notes for the CCS Signage Workflow foundation
estimator modernization. The full item-by-item ledger is
`ESTIMATOR_MASTERPLAN.md`; this doc is the operator-facing summary of the
landed surfaces.

## Landed lanes

- **Draft recovery + lifecycle (O-004–O-014)**: sessionStorage draft store
  with owner/source/estimate scoping, CAS Restore/Discard, storage
  death/eviction classification (`storage_eviction:`/`storage_death:`),
  conflict-UX dialog + Builder-sync-retry, WO→invoice exact-once
  (`invoice:wo:<woId>`), per-tab boundary consolidation.
- **Geometry + scene (O-031–O-055)**: reinforcement part descriptors,
  elevation strip Side/Front toggle, L/U wall presets with authored leg
  thickness + wing lengths, typed point editing, bond-fraction quantity
  effect, cap auto-fit + bulk re-anchor + locked flag, offcut-detail
  expansion, cap-over-position advisory.
- **Poles + signs (O-058–O-067)**: pole spread on foundation, sign
  `mount_type`/`mount_hardware_model`, letter-mount + horizontal-overlap +
  edge-clearance + mount-mismatch diagnostics, quote/job links, sign-face
  panel, clear artwork, linked-product reference, sign BOM rows.
- **Landscape (O-068–O-077)**: material patterns, bed regions, count-priced
  objects with setback/elevation/rotation/group keys, object nudges +
  group-move (cohort nudge on shared `group`), landscape-waste advisory.
- **AI intake (O-078–O-091)**: structured proposals + bounded
  alternatives/follow-ups, revision locking, concept_only banner,
  mounts_to referential check, schema-version-mismatch gate, locked-item
  preservation, staleBase + apply(force) + apply_receipt_id, photo
  observations + conversational tracking fields, Q&A loop.
- **UX + accessibility (O-092–O-101)**: guided wizard step states,
  click-to-fix data-field focus, issue severity + fix hints, revision
  compare, equipment section, worked-example help.
- **Research + design basis (O-102–O-121)**: source-authority classes,
  FOUNDATION_SOURCE_INDEX + FOUNDATION_METHOD_DOMAIN, METHOD-*-HELD seeds,
  license_class/licensed_source rows, supplier_group/authorization_gate,
  sensitivity + alternative estimates, preliminary-notice persistence.
- **AI workstream (W-013–W-024)**: photo hash/type/scale/units, EXIF
  stripping, stale proposal + parse + apply receipts, certification strip,
  eval-case matrix + network_failure injection, estimatorDesignAction
  dispatch wire.

## Notable fixes

- **`foundationItemSettingIssues` restore** (@`6af4094f`): the
  setting-hardening block was dropped from `legacyFoundationCalc.js` in a
  refactor — `foundationCalc.js` called a missing function (`TypeError` at
  runtime on a v2 item or malformed setting; Vite's loose resolution hid
  it at build). Restored `supplierPriceNumber`/`foundationSettingNumber`/
  `itemSettingConsumption`/`foundationItemSettingIssues`.

## Held / not-claimed

- Licensed research corpora (O-106–O-112's cited sources) — NEEDS-OPERATOR
  source grants.
- Real CC0/PBR assets (O-074–O-077) + sign-product catalog (O-063) —
  NEEDS-OPERATOR real data.
- Vision-pass photo geometry (O-084) — NEEDS-OPERATOR image-extraction.
- Server-owned CAS revision verify (W-017 tail) + `estimatorDesignAction`
  function deploy (W-020) — NEEDS-OPERATOR deploy grant.
- Multi-module rollout (W-012/W-024) — queued modules out of foundation
  scope.
