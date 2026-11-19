# Concrete | Masonry | Pole - Initial Audit Evidence

Date: 2026-11-05.
App: CCS Signage Workflow, `68dfcc5e57bbbc35387da97c`, sandbox branch `main`.
Masterplan: `ESTIMATOR_CONCRETE_MASONRY_POLE_MASTERPLAN.md`.

## Scope And Honesty Of Results

This is the initial current-source and isolated-calculation audit, not a claim that the complete
interactive product, live customer projects, engineering methods, or downstream workflow were tested.
The masterplan keeps browser, persistence-failure, AI-generation, and full integration passes open.
No application code, entity schemas, production data, or sandbox source were changed in this audit.
Only these two local planning/evidence documents were added to the repository.
No publish, deployment, checkpoint, purchase, asset integration, or external AI photo upload occurred.

Brett clarified that the intended output is a researched preliminary estimating basis used to price
client work. There are no supplied engineering schedules. Every structural foundation always goes
to a real engineer. Preliminary pricing must remain possible with disclosed assumptions.

## Source And Environment Evidence

- CLI authentication verified; only active branch returned was `main`.
- Current app-specific README and Base44 sandbox documentation were read.
- Remote snapshot: 47 files, including all 28 module files, four Foundation pages, related inventory
  editors, three schemas, pricing wire, existing tests, package metadata, and agent/masterplan notes.
- Also inspected current remote excerpts of module registry, source-project save, Builder totals,
  customer economics, and foundation cost categorization.
- Snapshot directory: `C:\Users\BrettHeinlein\AppData\Local\Temp\foundation-audit\remote`.
- Raw snapshot responses/listings and hash report: sibling `batch*.json`, `ls-*.json`, `hash-report.txt`.
- The snapshot comparison reported nine byte differences; inspected pricing files had no
  substantive whitespace-insensitive diff, and the project schema showed formatting/Unicode
  escaping differences. A byte difference alone is not evidence of a product regression.
- Isolated verification mirror: `C:\Users\BrettHeinlein\AppData\Local\Temp\foundation-mirror`.
  It overlaid all captured remote files onto local dependency fallbacks without modifying app files.
- Module/page findings below are grounded in the captured remote source. A dependency fallback in
  an isolated test is not proof that the entire remote app was built or its live behavior verified.

## Verified Checks

| Check | Observed Result |
|---|---|
| Existing remote `test-foundation-pricing-wire.mjs` in isolated mirror | Exit 0, 239 assertions |
| Existing remote `test-foundation-schema.mjs` in isolated mirror | Exit 0, 48 assertions |
| Existing remote `test-foundation-reorder.mjs` in isolated mirror | Exit 0, reports 8 cases |
| Syntax-only esbuild of 28 module files + 4 pages | 32/32 compiled |
| Scoped ESLint | Exit 1: unused `base44` import at `src/pages/FoundationCatalog.jsx:3` |
| Lead-authored synthetic source probes | Exit 0; reproductions below |

Logs: `C:\Users\BrettHeinlein\AppData\Local\Temp\foundation-audit\output\mirror\`.
Probe source: `C:\Users\BrettHeinlein\AppData\Local\Temp\foundation-audit\lead-probes.mjs`.
Passing existing pricing/catalog tests does NOT verify photo intake, rendered assemblies,
engineering adequacy, cap placement, reinforcement topology, recovery, or production handoff.

## Findings

Priority: P1 correctness or core capability gap; P2 completeness/UX/performance; P3 cleanup.
"Source-confirmed" means the relevant code path is present/missing in the inspected source.
"Runtime pending" is not a claim that a specific browser symptom was reproduced.

| ID | Priority | Finding And Evidence | Verification State |
|---|---|---|---|
| CMP-AUD01 | P1 | `AiEngineeringAssistant.jsx:11-54` makes one LLM request and saves recommendation text/data. No photos, interview state, assembly proposal, or geometry creation. | Source-confirmed capability gap |
| CMP-AUD02 | P1 | Same component asks for wind/sizing advice and accepts an LLM `adequate` boolean without a deterministic structural method or verified site basis. The UI calls it a calculator. | Source-confirmed; no AI call made |
| CMP-AUD03 | P1 | `legacyFoundationCalc.js:133-145` adds vertical bars at every spread-footing intersection regardless of mat count. | Synthetic reproduction below |
| CMP-AUD04 | P1 | `FoundationInventory.jsonc` and `foundationFieldSchema.js` have rebar but no chair/stand/support type. No support takeoff or geometry path exists in this module. | Source-confirmed gap |
| CMP-AUD05 | P1 | `Foundation3DPreview.jsx:7-86` renders foundation solids, generic poles, and ground only. It does not consume walls, caps, cabinets, landscape, rebar, or supports. | Source-confirmed renderer gap; screenshot pending |
| CMP-AUD06 | P1 | Same preview places footings with `cursorX`, ignoring saved `x_inches`/`z_inches`. Layout canvas edits those coordinates instead. | Source-confirmed disagreement |
| CMP-AUD07 | P1 | `FoundationPolesPanel.jsx:64-88` labels `y_offset_inches` as depth in ground, but preview line 56 uses it as a positive upward offset and renders only `height_inches`. Assigned foundation index is not used by the renderer. | Source-confirmed semantics mismatch |
| CMP-AUD08 | P1 | Cabinets use `foundation_index`/`pole_index`, poles use `foundation_idx`, caps use `wall_index`/`segment_index`. Parent array removal/duplication does not repair dependent links. | Source-confirmed; interactive delete/reorder pending |
| CMP-AUD09 | P1 | `FoundationEstimator.jsx:311-373`: save catches the error without returning failure; Save & Exit awaits it and then closes/navigates unconditionally. | Source-confirmed failed-save control flow |
| CMP-AUD10 | P1 | Same save always calls `setDirty(false)` after async persistence; user editing remains possible. Autosave timer does not serialize against an existing save. | Source-supported race risk; failure-injection/browser test pending |
| CMP-AUD11 | P1 | `foundationFieldSchema.js:51-55` exposes `brick_*` dimensions, and the page allows `brick_stone` wall materials. `wallCalculator.js:9-11` reads only `wall_unit_*`, falling back to defaults. | Synthetic reproduction below |
| CMP-AUD12 | P1 | `normalizeConcreteSupplier` converts missing mix prices to zero. `getConcreteMixes` sees zero as present, so a missing price becomes a zero-price mix rather than unpriced data. | Synthetic reproduction below |
| CMP-AUD13 | P1 | `wallCapCalculator.js:5-15` charges one stock price for any cut length. No stock-length rejection/split exists. Panel only enforces a minimum cut length. | Synthetic reproduction below |
| CMP-AUD14 | P2 | `FoundationWallCapsPanel.jsx` permits add when inventory exists even if no wall exists; it defaults wall/segment to zero and offers no complete segment/position/corner editor or auto-run cap generation. | Source-confirmed incomplete workflow |
| CMP-AUD15 | P2 | Landscape is a 24x16 colored-cell grid with fixed material rates; no realistic asset library, planted objects, bed-depth takeoff, or shared-scene representation exists. | Source-confirmed gap |
| CMP-AUD16 | P2 | Landscape summary respects `cell_size_inches`, but UI claims every cell is always one square foot. Clear resets scale; painting replaces only two fields. | Synthetic scale reproduction; interaction preservation pending |
| CMP-AUD17 | P1 | `FoundationTemplateDialog.jsx:33-42` saves items/walls/poles/caps/equipment but omits cabinets and landscape, so it cannot round-trip the complete designed assembly. | Source-confirmed omission |
| CMP-AUD18 | P2 | `FoundationBOM.jsx` does not receive cabinets/landscape/equipment lines. Its "material total" can contain rebar labor and other combined costs; it is not a complete category-separated project takeoff. | Source-confirmed report limitation |
| CMP-AUD19 | P2 | BOM `qty()` creates text such as `"40 LF"`; `add()` converts that text with `Number()`. Positive-quantity, zero-cost rows can be dropped as if quantity were zero. | Source-confirmed conditional omission; render fixture pending |
| CMP-AUD20 | P2 | Preview creates a renderer/scene again on every project change; cleanup disposes the renderer but not owned geometries/materials. | Source-confirmed lifecycle risk; measured leak/performance not claimed |
| CMP-AUD21 | P2 | Layout conversion divides by zoom although measured width is already zoomed; wall SVG click conversion does not map rendered pixels back through the viewBox. | Source-supported scaling bugs; viewport interaction reproduction pending |
| CMP-AUD22 | P1 | Missing inventory rows become zero-cost poles/caps/equipment without actionable missing-price diagnostics in the calculation result. | Source-confirmed failure mode; affected customer projects not queried |
| CMP-AUD23 | P2 | Item-level selected poles and project-level poles coexist; only project poles are priced by `calcPoles`. Their ownership/migration must be settled to avoid ghost geometry or double charging. | Source-confirmed two representations; legacy usage unknown |
| CMP-AUD24 | P3 | Foundation item removal asks for confirmation in both item card and page; catalog has one unused import. | Source-confirmed cleanup/UX issue |

## Reproducible Synthetic Results

All probes use captured remote pure calculation modules with synthetic objects. They do not validate
an engineered design, access business data, or assert that the illustrative dimensions are suitable.

1. **Single-mat spread footing:** 48 x 48 x 36 inches, quantity 1, 12-inch grid, one layer.
   Current algorithm returns **102.5 LF**: its horizontal component is **40 LF**, plus **62.5 LF**
   of automatic vertical steel. The latter exists despite there being no second mat to connect.
   The 40-LF figure describes the existing algorithm's horizontal component, not a prescribed
   final takeoff; cover/spacing and the engineering basis still need explicit modeling.
2. **Brick dimensions:** 96-inch wall run, 24-inch height, zero mortar gap, synthetic 16 x 8 x 8
   unit. Supplying catalog `brick_*` fields yields **132 units** using defaults. Supplying equivalent
   `wall_unit_*` fields yields **18 units**. No live catalog quantities were read.
3. **Cap stock:** synthetic stock length 48 inches and stock price $50. Both a 48-inch cut and a
   96-inch cut return **$50**. The overlength request is not rejected or split.
4. **Missing concrete rate:** a normalized supplier with no 4000-mix price produces **0** as the
   mix price. Missing and explicitly free pricing are not distinguished.
5. **Landscape scale:** one painted cell produces **1 sqft** at 12-inch cell size and **4 sqft**
   at 24-inch cell size. Calculator scaling works; the unconditional UI description is inaccurate.

## Integration Map - What Exists Versus What Still Needs Proof

| Connection | Source Finding | Still Required |
|---|---|---|
| Estimator registry -> FoundationProject/page | Current remote registry contains the module | Blank-create/embedded/open routing fixture |
| Project/inventory/settings reads | Page uses staff gateway and paged prerequisite loads | Failure/retry/session/role browser fixtures |
| Foundation calculation -> displayed section cost | Page adds cabinets/landscape to core totals | Full line/category/BOM reconciliation |
| Save -> source CAS -> Builder synchronization | Guarded helper and `recordBuilderSave` are wired | Partial failure, conflict, edit-during-save, reopen |
| Split totals -> sourceProjectTotal | Current remote Builder helper sums known foundation fields | Missing/null/legacy snapshot and cost parity fixtures |
| Customer economics -> foundation pricing wire | Current remote economics seam invokes foundation engine | Realistic new-component and accepted-pricing regressions |
| Foundation -> Builder parts/categories | Local part extraction has material/labor/wall/cap/sign/landscape paths; remote categorizer includes foundation categories | Inspect complete fresh remote extractor, extend supports, prove no duplicate/omitted cost |
| Estimate -> quote -> WO/purchasing | Existing estimator chain is outside this narrow initial execution | Synthetic end-to-end accepted-revision handoff |
| 2D -> 3D -> attachments -> BOM | Independent/partial implementations disagree | Shared assembly model and explicit scenario evidence |

## Research And Next Gate

Planning located official ASCE hazard-tool guidance, ICC embedded-post/pole provisions, ACI cover
guidance, CRSI reinforcement/support guidance, and realistic CC0 landscape candidates.
See masterplan sections 14, 17, and 18. Full applicable requirements and worked examples still need
collection, edition/applicability verification, licensed access where necessary, and independent
calculation checks before they become executable preliminary-sizing rules.

Recommended first batch after plan approval: save integrity, revision/identity groundwork, and
source-register construction. Then rebar/support quantities and geometry, shared manual assembly,
walls/caps/signage/site tools, interactive AI, and repeated cross-system validation.
The current product is not declared fully audited, repaired, construction-ready, or publish-ready.
