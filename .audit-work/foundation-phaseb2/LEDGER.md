# Claim-safe ledger notes — Phase B step 3 (proposal/editor lifecycle)

Candidate-only; nothing applied to remote. These paragraphs state what the
phase-B-3 candidate set proves and what remains open — written so they can be
dropped into masterplan claims without over-claiming.

## O-016 — reinforcement geometry core & explicit design authoring

**Closed by candidates:** the v2 editor ships explicit authoring for bar
diameter, side/top/bottom cover, per-mat bearing elevation, per-mat max
spacing X/Z, inter-mat ties (from/to mat, position, cut length), pillar hoops
(center-Y, centerline diameter, cut allowance) and pillar longitudinal
(count, radius, bottom/top ends). Geometry is validated by the shipped
`foundationReinforcementModel` — fits, overlaps, and numeric ranges are
errors; malformed rows are surfaced for explicit repair, never silently
rewritten; orphan tie references are preserved and flagged rather than
remapped. Single-mat honesty holds: a mat must be authored; no authored mat
means no inferred steel.

**Remains:** no named top-mat preset (manual mat authoring only); no support
model (O-022+); no scene/3D overlay graft (staged
`foundationReinforcementPreview3D`/`foundationReinforcementThreePreview`
modules exist as verified candidates but their `Foundation3DPreview` consumer
graft is not in this set); no scheduling/procurement linkage.

## O-018 — active reinforcement input validation

**Closed by candidates:** raw draft text is preserved verbatim until
`prepareFoundationReinforcementDraft` — malformed values reach the preview as
severity-tagged issues and can never silently commit; the applied path
inherits the shipped B-1 gates (version-unsupported hold, `include_rebar`
boolean check, version-2 model errors mapped onto `reinforcement_design.*`,
catalog-basis uniqueness/type/rate/diameter checks). Verification: malformed
draft case in `verify-phaseb2.mjs` (issues surfaced, `canAccept:false`), the
15/15 UI fixture (raw "-oops" string preserved, `"0"` override kept, missing
UUID/malformed rows/row caps covered).

**Remains:** same boundary as before — warnings are acknowledgment-gated, not
blockers; supports/weights/connections that are unresolved keep the item on
held saved amounts (`foundation_reinforcement_not_ready`), which is correct
behavior, not a gap.

## O-019 — reinforcement design presets / top mat

**Closed by candidates:** none of the preset surface — the local modules
contain no named top-mat preset helper; mats are authored manually through
`ReinforcementDraftGeometry`/`ReinforcementDraftList`. This phase explicitly
does not claim preset coverage.

**Remains:** a named top-mat (and any other preset) authoring affordance is
still open O-019 scope — the explicit mat model it would write already exists
(`spread.mats` rows with elevation + spacing), so a preset is a pure
draft-authoring convenience layered on the shipped design shape.

## O-031 — reinforcement proposal/editor acceptance

**Closed by candidates:** the full lifecycle is implemented and verified —
start → raw draft → preview (quantities, per-row costs with provenance, issue
list) → stale/context validation → explicit preliminary + per-warning
acknowledgments → re-preview → accept writes
`reinforcement_calculation_version:2` + `reinforcement_design` +
`reinforcement_material` + `reinforcement_cost_snapshot` +
`reinforcement_acceptance` in exactly one page `commit` (undo, dirty,
browser-draft, edit-revision all participate) → Save & Exit persists through
the existing CAS `updateMany` anchored on the acknowledged `updated_date` —
verified end-to-end on the real grafted page at 1280px and 390px (8/8 each).
Delta math verified (`verify-phaseb2.mjs` 14/14): steel/foundation/section
deltas are proposed-minus-current; unpriceable extras report acknowledged
totals while the delta is refused — never a guessed $0. Reject/discard leaves
legacy fields byte-identical; blocked states refuse everything and commit
nothing; concurrent edits mark the preview stale and refuse acceptance;
unsupported versions hold acknowledged snapshots.

**Remains:** pricingBlocked is intentionally not part of the session's
`blocked` (a held item can still be drafted — acceptance only lands through
the normal save path which enforces pricing gates); engineering approval is
false everywhere and remains a downstream, human workflow; support-model
(O-022+), scene, schedule, procurement, and the staged BOM/print/WO consumer
grafts are out of scope for this step.
