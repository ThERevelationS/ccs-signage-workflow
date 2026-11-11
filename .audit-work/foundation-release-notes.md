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

## Governance + audit (later pass)

- **Dashboard fixtures (W-006–W-011)**: read-only `.audit-work/` fixtures —
  status parser 6/6, dashboard views 4/4 (next-action/last-verified/
  source-gap/lane-scenario), sandbox-complete-vs-published distinction,
  lead+one-worker cap, dashboard-local/no-secret contract, hooks-preserved
  (no always-running loops). All pass on the remote.
- **Stage taxonomy (W-004)**: `.devin/estimator-stages.md` — the 5-stage
  contract per ledger row.
- **P-lane audit (P-01)**: `.audit-work/channel-lane-audit.md` — remote
  `channelLetterPricingAvailability.js` md5-verified identical to the
  hardened candidate; `verify-channel-model.mjs` 85/0; all 13 P-rows carry
  `**Remaining:**` next-action tails naming the module-session grant.
- **P-13 cost-ownership fixture**: `scripts/test-channel-cost-ownership.mjs`
  — 30 asserts (key uniqueness, split-replaces-base, fab_config
  conservation, labor XOR, qty-once, rollup exact-once), remote-run PASS.
- **DONE-row evidence relabels**: 8 rows' checkpoint ids relabeled to the
  `checkpoint \`<24-hex>\`` convention (21→13 checkpoint-id gaps; the rest
  are honest pre-convention gaps, never fabricated).

## Notable fixes (later pass)

- **`foundationDraftRecovery` truncation restore** @`6af414f5`: the remote
  module had regressed to a 165-line older revision — `summarizeFoundationDraftConflict`,
  the `v.lost` tombstone read path, and the graceful-loss write marker were
  missing and the remote `npm run build` was RED on the missing
  `FoundationSyncConflictDialog` import. Restored the full 427-line module
  with the O-004 `storage_${cls}` classification merged; remote build
  exit 0.
- **Local-tree drift repair**: the local `src/components/estimator/` tree
  carried 19 stale files (severe truncations) + 9 remote-only files — the
  stale-local-write class that caused the remote truncation. All 28 pulled
  remote→local; local now mirrors the remote source of truth.

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
