# Phase B step 3 — reinforcement editor/proposal lifecycle on the hardened page

**CANDIDATE-ONLY.** Everything below lives in `.audit-work/foundation-phaseb2/`.
No remote writes, no checkpoint, no publish/deploy, no entity-record ops.
App `68dfcc5e57bbbc35387da97c`, branch `main`.

## Deliverables

| Artifact | Contents |
|---|---|
| `MANIFEST.md` | Full v2 module-set diff: SHIPPED(6) / NEW-NEEDED(10) / NEW-STAGED(10) / consumer-grafts-held-back; the one session adaptation explained. |
| `candidate-src/` | 19 byte-identical new modules + 1 adapted session + 2 grafted remote files. |
| `candidate-tree-src/` | Remote snapshot + candidate overlay — the tree all verification bundles build against. |
| `remote-src/` | Fresh remote pulls (incl. transitive deps `builderMutationRecovery`, `estimatePersistence`, `builderEntityPersistence`, `builderPartGroupPersistence`). |
| `diff-*.txt` | Exact additive diffs of the two grafted remote files. |
| `SPEC.json` | Machine transport spec (paths, provenance md5s, preserved hardening, invariants, non-goals, authoring coverage). |
| `LEDGER.md` | Claim-safe O-016/O-018/O-019/O-031 paragraphs. |
| `verify-phaseb2.mjs` | Model harness — **14/14 PASS**. |
| `browser-fixture.mjs` | Real-page Playwright fixture — **8/8 @1280px, 8/8 @390px**. |

## The graft

`FoundationEstimator.jsx` (+65/-12): imports `FoundationReinforcementProposalPanel`
+ `useFoundationReinforcementEditor`; a hook block before the loading
early-return supplies `getCurrent` with the full live context the proposal
requires (`loaded`, `ownerId`, `sourceId`, `sourceUpdatedAt`, `estimateId`,
`estimateUpdatedAt`, `generation`, `editRevision`) and a `blocked` flag
mirroring the page's save/copy/catalog/draft/recovery/source-refresh/ack
gates (`pricingBlocked` intentionally excluded — a held item can still be
drafted; acceptance only lands through the normal save path). Each
`FoundationItemCard` in the items map is wrapped with the proposal panel
wired to the session. `FoundationItemCard.jsx` (+15/-1): `legacyReinforcement`
gate hides implicit rebar fields on versioned items and renders the
accepted-design note instead.

## The one adaptation

`foundationReinforcementEditorSession.js` `section()` now reads
`calcProject().totals.{grand_total,total_signage_cabinet_cost,total_landscape_cost}`
— the same held-aware fields the page's `sectionTotal` consumes — instead of
recomputing raw cabinet sums. This is the O-010 parity fix: an unpriceable
extra reports its acknowledged saved total in the section rows while the
delta itself is refused, never a laundered $0.

## Lifecycle verified end-to-end

start (one commit, raw draft only — server state untouched) → author explicit
geometry + catalog material basis → preview (quantities, cost rows with
provenance, issue list; Accept disabled) → acknowledge preliminary + each
warning → re-preview binds acknowledgments → Accept enabled → accept = one
commit writing version-2 fields, clearing the draft → Save & Exit persists via
the existing CAS `updateMany` on the acknowledged `updated_date`.

## Design-authoring coverage vs remaining

- Explicit: cover (3 faces), per-mat elevation + max spacing, inter-mat ties,
  pillar hoops + longitudinal, support mode + reason, catalog/manual material
  basis with explicit diameter/weight, quantity + rate overrides.
- **Not covered:** named top-mat preset (O-019 remains), priced support model
  (O-022+), 3D overlay graft, BOM/print/WO consumer grafts (staged modules
  verified but unapplied).

## Verification totals

- `verify-phaseb2.mjs`: **14/14**
- `browser-fixture.mjs`: **8/8 @1280px**, **8/8 @390px**
- `scripts/foundation-reinforcement-ui-fixture.mjs`: **15/15** (unchanged)
- esbuild bundles: all candidates clean against candidate-tree-src
