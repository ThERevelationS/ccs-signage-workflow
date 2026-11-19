# Phase B steps 1–4 — Foundation reinforcement-v2 held activation

**CANDIDATE-ONLY.** Everything below lives in `.audit-work/foundation-phaseb1/`.
No remote writes, no checkpoint, no publish/deploy, no entity-record ops.
App `68dfcc5e57bbbc35387da97c`, branch `main`,
remote HEAD baseline `97d37964a8554d7561995975deb0d6096f63e3e3`.

## Deliverables

| Artifact | Contents |
|---|---|
| `MANIFEST.md` | Step 1 reusable-set manifest: every local v2 module classified REUSABLE-AS-IS; import verification against fresh remote; the three required grafts listed. |
| `candidate-src/` | Step 2/3 candidates: 3 grafted files + 6 byte-identical new modules + 2 entity JSONC candidates. |
| `diff-*.txt` | Exact additive diffs vs fresh remote pulls (`remote-src/`). |
| `SPEC.json` | Machine transport spec (paths, provenance md5s, preserved hardening, invariants, non-goals). |
| `verify-phaseb1.mjs` | Verification harness (esbuild API, absolute alias for `@/components/masterInventory`). |
| `phaseb1-verification.{txt,json}` | **PASS 44/44** — 30 remote-identical parity cases + 14 v2-dispatch cases. |
| `remote-calc.bundle.mjs`, `candidate-calc.bundle.mjs` | Build artifacts compared by the suite. |

## Step 1 — module inventory verdicts (summary)

All local `foundationReinforcement*`, editor hooks, panels, fields, info, and
`foundationGeometryInputs.js` verified import-by-import against FRESH remote.
**Every calc-path module is REUSABLE-AS-IS** (byte-identical ports); no
NEEDS-REWIRE symbol substitutions were required and nothing is STALE. The one
missing remote seam (`foundationGeometryInputs.js`, remote `NOT_FOUND`) is
satisfied by a new leaf module — remote inlined those checks inside
`foundationItemInputIssues` with extra excavation-method/override coupling the
v2 model must not inherit. Full per-file table: `MANIFEST.md`.

## Step 2 — additive dispatch graft

`foundationCalc.js` gains `calculateVersionedItem` + a one-line dispatch at the
top of `calcItem` and a per-item pass in `calcProject`. Unmarked/version-1
items return `null` and run the untouched legacy path **byte-for-byte** (30
deep-equal cases prove it). Version-2 items project through the ported pure
chain (`geometry → model → basis → cost → projection → itemProjection`) that
prices common costs via `calcItemCost(include_rebar:false)` + fresh v2 steel
once. Blockers join the shared `inputIssues` channel so itemPricing
availability, the delivery hold, and saved-snapshot totals behave exactly like
legacy held items. The delivery volume scan masks `include_rebar:false` on
version-2 items (local semantics preserved). All remote hardening retained:
O-008 normalization, O-030 `constructionWarnings`, availability/catalog
hardening, `ITEM_SNAPSHOT_FIELDS`/`hasFoundationCostSnapshot`, project-level
delivery + supplier checks, cabinets/landscape/equipment.

Supporting grafts (also additive):
- `foundationInputValidation.js` — unsupported-version issue
  (`foundation_reinforcement_version_unsupported`), `include_rebar` boolean
  check, version-2 model-error mapping onto `reinforcement_design.*` fields,
  legacy rebar-field checks skipped only for version 2.
- `foundationCatalogIntegrity.js` — version-2 catalog basis requires exactly
  one current `rebar`-typed row at `reinforcement_material.inventory_id`;
  early return so legacy `rebar_size` can never substitute for a missing
  selected id.

## Step 3 — schema candidates (ASCII-canonical, additive)

- `FoundationProject.jsonc`: `items[]` gains
  `reinforcement_calculation_version` (integer), `reinforcement_design`,
  `reinforcement_material`, `reinforcement_proposal`,
  `reinforcement_cost_snapshot`, `reinforcement_acceptance` (objects); result
  side gains `rebar_material_cost`, `rebar_labor_cost`, `rebar_labor_hours`,
  `rebar_geometry_feet`, `rebar_geometry_weight_lbs`,
  `rebar_connection_count`. (`items` is `additionalProperties:true` remotely —
  these are preferred-explicit declarations.)
- `FoundationInventory.jsonc`: `material_type` enum + `rebar_support`;
  `rebar_diameter_inches`, `rebar_weight_lb_per_ft`, `rebar_support_kind`
  (`chair|stand|bolster`), `rebar_support_height_inches` + `_min`/`_max`,
  `rebar_support_footprint_{length,width}_inches`, `rebar_support_material`,
  `rebar_support_pack_size`, `rebar_support_compatible_bar_sizes`,
  `rebar_support_placement_notes`. Cost/unit uses the existing
  `cost_per_unit` field — deliberately not duplicated.

## Step 4 — verification evidence

`PASS phaseb1 cases=44 failed=0` (`phaseb1-verification.{txt,json}`,
remote_head pinned in the JSON).

- **Parity (30):** 25 frozen complete-model fixtures + 5 snapshot-mode cases
  run through BOTH the fresh-remote bundle and the candidate bundle with
  deep-equality on the entire `calcProject` output — totals, items, pricing,
  issues, snapshots, delivery, warnings. All remote-identical. (Note: remote
  itself now reproduces 0/25 pre-hardening stored expectations — expected:
  the remote `ratePerYard` 0-vs-201 hardening fix and new output keys like
  `delivery.issues`/`polePricing` legitimately diverge from the old frozen
  values; this is remote behavior drift, not candidate drift.)
- **v2 dispatch (14):** accepted profile (20 ft / $112 steel / $288.25 item
  total); manual v2 selection not requiring an unrelated legacy size;
  unsupported version held (not silently legacy); unconfigured supports keep
  acknowledged amounts + block pricing; valid recalculation mints a fresh
  snapshot; `include_rebar:false` clears steel; zero-priced footage keeps
  physical steel + connection labor; missing/ambiguous selected catalog ids
  held; selected catalog id controls the active rate; inactive legacy fields
  inert under v2; unknown material weight never a zero-weight estimate; no
  acknowledged snapshot → no fabricated values; duplicate component ids can't
  borrow snapshots; explicit v1-vs-v2 divergence accepted as intended
  single-mat honesty (legacy $834.80 vs v2 $694.00 on the same inputs).

## Claim-safe ledger paragraphs

**O-016 (single-mat vs ties).** The versioned candidate prices horizontal mat
steel and inter-layer ties as separate modeled segment kinds — the ported
model emits `horizontal` mat segments and `inter_mat_tie` segments with
independent counts/lengths, so a single-mat footing no longer inherits the
legacy 64 ft (24 ft horizontal + 40 ft assumed vertical) treatment. The 30
byte-identical parity cases prove unmarked items keep legacy totals exactly;
the explicit-divergence case documents v1-vs-v2 divergence only after a
version-2 marker is present. Still OPEN: the editor/acceptance UX that marks
an item version 2 and reconciles the cost delta; engineering approval;
supports for multi-mat spacing (ties are modeled, support hardware is not
yet placed).

**O-018-fields (explicit design carriers).** The candidate schema declares
the field carriers the design work needs: per-item `reinforcement_design`
(covers, `spread.mats[]` with `bearing_elevation_inches` +
`max_spacing_{x,z}_inches`, `spread.inter_mat_ties[]`, pillar
longitudinal/hoops), `reinforcement_material`, `reinforcement_cost_snapshot`,
`reinforcement_acceptance`, plus result-side `rebar_geometry_*`/
`rebar_connection_count`/`rebar_labor_*`. The ported model already validates
clearances (`reinforcement_clearance_invalid`) and mat-envelope overlap
(`reinforcement_mat_overlap`) as model errors mapped onto
`reinforcement_design.*` issue fields. Still OPEN: cover/clearance semantics
beyond the model's own bounds checks, placement presets, editor surfaces,
and any engineering approval — `engineeringApproved` remains `false`.

**O-019 (top-mat preset).** The ported model can price an explicit top-mat
design: each `spread.mats[]` entry carries a `bearing_elevation_inches`
bounded to `covers.bottom ≤ bearing ≤ depth − covers.top − 2·diameter`, so a
single high-elevation mat is a valid priced configuration under the versioned
path. Still OPEN: there is no preset author surface yet — the editor/session
modules are classified REUSABLE-AS-IS but intentionally excluded from this
calc graft; placement policy (when top placement is appropriate, O-020)
remains an engineering decision the calc does not make.

**O-021 (rebar_support catalog type).** The inventory schema candidate adds
`rebar_support` to `material_type` plus the metadata the checklist names:
`rebar_support_kind` (chair/stand/bolster), height + `_min`/`_max` range,
footprint length/width, material, `pack_size`, `compatible_bar_sizes`, and
`placement_notes`; cost/unit rides the existing `cost_per_unit` field.
Still OPEN: nothing consumes these rows yet — support selection modes
(O-022), placement/counts (O-023…O-026), quantities/BOM/labor roll-up
(O-027), and 3D are explicitly deferred; `rebar_diameter_inches` /
`rebar_weight_lb_per_ft` land alongside as explicit bar metadata (missing =
unknown, never guessed).

**O-031 (legacy totals preserved until acceptance).** The graft's whole
shape implements the preserve-until-accepted contract: dispatch keys on an
explicit `reinforcement_calculation_version` marker; absent/1 items produce
byte-identical output vs remote (30 parity cases); unsupported versions are
held, not silently recalculated; unavailable v2 projections keep the
component's acknowledged `reinforcement_cost_snapshot` +
`ITEM_SNAPSHOT_FIELDS` amounts and emit blockers into the same issue/hold
channels legacy items use; a valid v2 recalculation returns a NEW snapshot
rather than mutating acknowledged values. Still OPEN: the acceptance
interaction itself (editor applies the design, records
`reinforcement_acceptance`, reconciles the delta) and the transport of these
candidates to remote.

## Limitations / what this does NOT unlock yet

- Editor/UI, proposal panel, `useFoundationReinforcementEditor` — verified
  REUSABLE-AS-IS but deliberately NOT in this candidate (UI modules excluded
  from the pure calc graft per scope).
- Support placement semantics: `rebar_support` rows exist in the schema
  candidate but no calculator path counts or places supports.
- BOM/work-order/print part extraction for v2 steel (`foundationReinforcementBOMRows`,
  `…WorkOrderPart`, `…PrintMaterial` remain later-phase).
- 3D/scene rendering of modeled steel (`foundationReinforcementPreview3D`,
  `…ThreePreview` later-phase; existing 3D stays incomplete by design).
- `constructionWarnings` do not yet scan v2-specific geometry (O-030 channel
  preserved, extension deferred).
- No engineering/structural approval anywhere; `engineeringApproved:false`.
- Candidate requires the two schema transports before remote activation —
  versioned fields are currently undeclared on remote (`additionalProperties:true`
  means records would still round-trip, but the declared-schema candidate is
  the reviewed form).

## Repro

```
node .audit-work/foundation-phaseb1/verify-phaseb1.mjs   # from repo root → PASS 44/44
```

Candidate files for transport review: `candidate-src/` + `new-modules/`,
diffs in `diff-*.txt`, spec in `SPEC.json`.
