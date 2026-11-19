# O-111 — Rebar Support Engineering-Basis Notes (for Phase B-3)

Research distillation only. Nothing here activates a calculation, certifies a
design, or replaces engineer review. Every rule cites a register ID from
`CONCRETE_FOUNDATION_SOURCE_REGISTER.md` (CMP-SUP-xxx). Sources flagged
`candidate` must not become silent defaults.

Date: 2026-11-08. Register corpus: CMP-SUP-001 through CMP-SUP-024.

## 1. What the support model must encode

A rebar support is defined by five independent facts — the catalog
`rebar_support_*` fields already cover most of them; the solver needs the rest:

| Fact | Where it lives | Notes |
|---|---|---|
| Support type/symbol | catalog (`rebar_support_kind` + name) | chair / stand / bolster enum; keep untyped rows legal |
| Working height | `rebar_support_height_inches` (+min/max) | = clearance it maintains at its bearing face (see §4) |
| Bearing mode | placement notes / type | rests on BASE vs rests on LOWER MAT vs clips ONTO bar |
| Substrate compatibility | footprint fields + notes | firm form vs loose soil/sand/fill vs membrane/foam |
| Count rule | NOT a product fact — per-source rule | spacing ceiling, area density, or run-length basis |

Two extra compatibility axes the schema should keep in placement notes /
compatible-bar-size lists: supported-bar size range (e.g., PCC fits up to #8;
Lotel chairs take #3–#5; PEZS #3–#10) and finish class (CRSI corrosion class
1/1A/2/3 — §7).

## 2. Support-type catalog (the type taxonomy)

Symbols are the industry-standard ACI 315 / CRSI letter codes used verbatim by
all three manufacturers (SUP-003, SUP-010, SUP-011, article SUP-019).

### 2a. Continuous supports (bolster family) — `kind: bolster`

| Type | Rests on | Heights (mfr ranges differ!) | Pitch / unit | Duty | Sources |
|---|---|---|---|---|---|
| SB Slab Bolster | base/form | Dayton 3/4"–3"; SureBuilt 3/4"–7" | legs 5" o.c.; 5' len | lower slab steel, continuous top wire replaces chair grid | 003,004,010,011 |
| SBU Slab Bolster Upper | lower mat or soft fill | Dayton TDS 3/4"–5" (handbook says 3/4"–3" — discrepancy) | 5' len | one layer above another; runners ⟂ lower bars, top wire ⟂ upper bars | 003,005,010 |
| SBP Slab Bolster + Plate | loose soil/fill | 3/4"–3" | 5' len | lower steel on soft base | 003 |
| BB Beam Bolster | beam soffit form | 1"–5" in 1/4" (Dayton); SureBuilt 3/4"–4"; MB 1"–5" | legs 2-1/2" o.c.; 5' len; field-cut to soffit | lower beam steel | 003,006,010,011 |
| BBU Beam Bolster Upper | lower steel | same as BB | 5' len | successive beam layers, placed ⟂ on lower steel | 003,010,011 |
| BBP Beam Bolster + Plate | loose soil/sand/uneven | 1"–5" (7-ga 1"–2"; 4-ga 2-1/4"–5") | 5' len; MTO | beam steel on earth bases | 003,007 |
| CHC Continuous High Chair | base (slab form) | Dayton 2"–14" (SKU table to 9"); MB 2"–20"; SureBuilt 4"–12" | legs 7-1/2"–7-3/4" o.c.; 5' len (10' MTO) | UPPER slab steel w/o carrier bars | 003,008,010,011 |
| CHCU CHC Upper | lower mat | 2"–15" (Dayton); 2"–20" (MB); 4"–12" (SureBuilt) | 5' len | upper mat resting on lower mat | 003,010,011 |
| CHCP CHC + Plate | fill/sand | 2"–15" in 1/4" | MTO | upper steel on soft base; does NOT straddle lower steel | 003 |
| CS Continuous Support | layer or soft form | 2"–16" in 1/2"; 2 runner wires ≤7", 3 wires >7" | usable span 7' (bill 8') | layer-above-layer or soft material | 003 |
| PSBB Aztec composite | base/form | 3/4"–3" | 30" interlocking sections (5'/10' packs); qualifies as beam bolster @2-1/2" pitch | slab OR beam duty; side-form spacer too | 012 |
| Tuff Plus SB/SBR (MB) | base / lower mat | composite | true 60" length | slab bolster / upper, composite | 010 |

### 2b. Individual supports (chair family) — `kind: chair` or `stand`

| Type | Rests on | Heights | Duty | Sources |
|---|---|---|---|---|
| BC Bar Chair | base/form | 3/4"–2" in 1/4" (Dayton, MB); SureBuilt 3/4"–1-3/4" | wide-spaced light steel in slabs | 003,010,011 |
| BCP Bar Chair + Plate | loose soil/rock/sand/carton | ~BC range | BC on soft base | 003 |
| SC Speed Chair | loose soil/rock/sand | per catalog | fixed-spaced light steel, slab/footer on soft base | 003 |
| JC Joist Chair | base | 3/4"–1-1/2" | rebar in joist/grid slab ribs | 003 |
| UJC Joist Chair Upper | lower steel | -1" to +3-1/2" | 14" span upper joist steel | 010 |
| **HC Individual High Chair** | **base, legs straddle lower mat** | Dayton 2"–15" in 1/4"; MB 2"–40"; SureBuilt 1"–12" | **upper steel directly or via carrier bar — the canonical bottom-resting stand for top mats** | 003,009,010,011 |
| HCP HC + Plates | loose soil/sand | 2"–12" (page conflict: features say 1/2"–15") | HC bearing on earth | 001 |
| HCM HC for Metal Deck | deck/uneven form | 2"–9", leg span 4-1/2"–10" (Dayton); 2"–15" types A/B (MB, deck-profile-dependent) | on steel deck | 003,010 |
| LC Ledger Chair | — | per catalog | ledger/edge support | 003 |
| CS-family stands | base | 2"–16" | continuous, see 2a | 003 |

### 2c. Plastic / composite chairs — `kind: chair` (material field carries "plastic")

| Type | Rests on | Heights | Duty | Sources |
|---|---|---|---|---|
| PBC Tower Bar Chair | base; straddles lower mat | 3/4"–10" in 1/4" | single mat, bottom layer double mat, tilt, side-form, on-grade w/ plate; fits ≤#8 | 003 |
| PTC Tower Chair | base; straddles lower mat | 2-3/4"–10" in 1/4" | same; ≤#8 | 003 |
| PTCSP Tower Chair + Sand Plate | on-grade | fits PTC/PHC | 5"×5" plate | 003 |
| PHC Hy-Chair (hybrid) | base; straddles lower mats ≤2-3/4" | 10-1/4"–14" | tall mats; rated ≤500 lb load | 003 |
| PEZS EZ Set Chair | base; straddles lower mat | 2-3/4"–14" | single/double mat, slab, side-form, tilt, precast, foundations; #3–#10; has mat tie-off points | 003 |
| PCC Castle Chair | on-grade | 1-1/2"–6-1/4" in 1/4" | single mat or bottom of double mat, tilt-wall, sandwich panels; ≤#8; stable on foam/vapor barrier | 003 |
| PSN / PPMC / PPC paving & mesh chairs | on-grade | PSN 3/4"–2"; PPC 1"–9"; PPMC 2" | DOT on-grade mesh/single mat | 003 |
| Paragon Mesh Chair | on-grade | 1"–4" sizes | mesh panels | 003 |
| Lotel Rebar-ups | on-grade; CLIPS onto bar intersections | 2"(4–5" slab)/3"(5–6")/4"(6–8") | #3–#5 rebar or PT cable; snap-on, no tie; base ring anti-sink | 021 |
| Lotel Mesh-ups | on-grade; clips onto wires | 1"–4" | WWF 10/8/6/4/0-ga; deflects & rebounds | 021 |
| E-Z Chair PEZ / PSP sand plate | base/on-grade | per catalog | single mat, bottom layer, side-form, on-grade | 003 |

### 2d. Cementitious supports (dobies) — untyped or `chair`

| Type | Rests on | Heights | Duty | Sources |
|---|---|---|---|---|
| CPD Plain Dobie | on-grade / below-grade | 1"–18" | 4000-psi precast blocks, D.O.T.; footing bottom-mat support | 003,015 |
| CWD Wire Dobie | on-grade / below-grade | 1"–5" | dobie + two 16-ga cast-in tie wires (fastens to bar) | 003,015 |
| CCD Combination Dobie | on-grade / below-grade | multi-height | 4000 psi | 003 |
| CDD Dowel Dobie | on-grade / below-grade | 3"–5" in 1/2" | #3/#4 dowel receiver | 003 |
| (FDOT rule) | — | blocks ≤4"×4"×required clearance | moist-cured ≥3 days, strength ≥ surrounding concrete, cast-in wires, certified | 015 |

### 2e. Spacers & specialty (keep untyped or notes)

- Side-form spacers (vertical steel): R0 Caisson Bar 15-1/2"; PSW Space Wheel
  3/8"–3"; PLW E-Z Lok Wheel 1-1/2"–6-1/2" (#3–#11); Iowa spec requires
  side-form spacers for vertical bars (003,013,014).
- Drilled-shaft cage positioners: PFW BarTender wheel, Paragon Centralizer
  11"/15" dia, #7–#11 bars — relevant to the pole/caisson workflow (003).
- Accessories: WTW tie wire; Kodi Klip clips (#3–#6) — "patented system" tie
  alternative per Utah 2.2 (003,016,017).
- Mesh chairs: clip-on / single-lock / double-lock paving chairs, double-mat
  extension, shims (Whitacre line) (020).

## 3. The three bearing modes — core model distinction

B-3's "bottom-resting stand" (O-023) is bearing-mode **A**:

- **A. Base-resting ("bottom-resting")** — feet run to the pour bottom
  (form, grade, or plate-on-soil) and cradle the mat. Covers: SB/SBP, BB/BBP,
  CHC/CHCP, BC/BCP, HC/HCP, plastic chairs + plates, dobies.
- **B. Lower-mat-resting ("upper" types)** — runner wires sit on the lower
  mat (or on soft fill) and hold the next layer. Covers: SBU, BBU, CHCU, PSBU,
  UJC. Height = clear inter-layer gap, NOT cover. Orientation: runners ⟂ lower
  bars, top wire ⟂ upper bars (SUP-005).
- **C. Bar-attached ("clip-on")** — snaps onto the bar intersection or mesh;
  the "height" is measured under the clipped bar; no tie needed. Covers: Lotel
  Rebar-ups/Mesh-ups, PSN/PPMC clip chairs, Kodi Klip (connection) (021,003).

Plus a named hybrid worth its own flag: **straddle** — bottom-resting chair
whose legs pass AROUND the lower mat so the feet reach the base while the
cradle holds upper steel (HC/PTC/PBC/PHC explicitly straddle; CHCP explicitly
canNOT straddle due to continuous plates) (003,009,011).

## 4. Height / cover / gap geometry

- Support "height" = the clearance it maintains between its bearing surface and
  the underside of the supported bar (003–012, 021). For a bottom mat on a flat
  base, required support height = specified bottom cover.
- Cover floor (earth-cast footings): 3" against earth; 2"/1-1/2" formed
  earth-or-weather by bar size; 3/4"–1-1/2" interior — values via public
  citations SUP-023/017. A sign footing poured against earth is a 3" class.
- Upper-mat supports: height = clear distance between lower-mat top and
  upper-mat bottom; upper types do NOT reach the base (005).
- Carrier bars: CHC "eliminates the need for carrier bars"; HC supports upper
  steel "directly or by means of a carrier bar" — a carrier bar is a separate
  span piece the chairs hold up, which then carries the mat. If modeled, it is
  its own BOM line (008,009).
- Stand height derivation (O-024): needed_stand_height = target_underside −
  bearing_surface_elevation. Target underside for a top mat = slab_top −
  top_cover − bar_dia. Bearing surface = base (mode A) or lower-mat top
  (mode B). For straddle chairs the feet still land on the base.
- Tolerances worth warning under: Iowa bridge-deck bottom clearance
  −1/8"/+1/4", top-mat depth −1/4", bar spacing ±1/2"–1"; FDOT bar spacing
  ±1", cover −1/4"/+1/2", footing mat ±1/2" vertical / ±1" side (014,015).
  Catalog support heights are nominal — a −1/8" tolerance exists in practice.

## 5. Placement & count rules — with honest provenance

NO universal support density exists (Lotel: "spacing depends on rebar size and
allowed deflection"; Iowa CM: "adequate number ... to maintain clearance";
craftingwithconcrete echo). What exists publicly:

| Rule | Value | Authority level | Source |
|---|---|---|---|
| Bolster/CHC spacing cap | ≤4' each direction | public DOT spec (adopted ceiling, defers to mfr/CRSI MSP if stricter) | 013 |
| Individual bar-chair cap | ≤3' each direction | same | 013 (CM calls them "individual high chairs" 014) |
| Flat-slab chairs ≤#5 bars | ≤3' o.c. | public APWA spec acceptance clause | 016 |
| Flat-slab chairs >#5 | ≤5' o.c. | same | 016 |
| Flat-slab chairs+bolsters | ≤5' o.c. each direction | same spec, placing clause | 016 |
| Beam-bolster spacing | first ≤2' from beam end, then ≤4' o.c. | FDOT | 015 |
| Upper beam bolsters | placed directly over lower supports | FDOT | 015 |
| Footing dobie blocks | ≤4"×4"×clearance; (CRSI-derived: ≥4 per mat ~5' o.c. each way) | FDOT verified / CRSI-quoted candidate | 015 / 019 |
| High chairs (slab temp steel) | #5→4' o.c., #4→3' o.c. "to prevent sagging" | trade-press example, candidate | 019 |
| Lotel Rebar-ups density | 1 per 2 sq ft suggested (1 per 3 sq ft light) | mfr chart for THAT product | 021 |
| Castle ground-chair table | chair spacing f(bar dia × bar spacing): mesh 1m; Y12@200 0.7m; Y25@200 0.25m | foreign mfr chart (context-flagged) | 022 |
| Top-mat tie-down | ≤4' each direction, ≥50% of contacts tied | Iowa CM bridge rule | 014 |
| Mat independence | each mat independently supported — no stacking through | Iowa DOT spec | 013 |
| Carrier/support bars under top steel | concept verified: HC holds upper steel "directly or by means of a carrier bar"; CHC exists to eliminate carrier bars. A public spec excerpt seen in research ("#4 support bars @48" where not supported by perpendicular reinforcement") is a private-document fragment — candidate only, find a public-spec analogue before encoding | mfr-verified concept / candidate spacing | 008,009 + (unregistered private spec) |

Encoding suggestion for the registry: store per-(support-kind, bar-size-class)
max_spacing_inches as `default_ceiling` with `source_ids`, plus
`count_model: 'grid'|'linear_rows'|'per_area'|'per_mat'`. Continuous products
count by **linear feet of support row** (rows at spacing cap + row-length
pieces at unit length 5'/30"/60"/7'usable); individual chairs count by **grid
density** (max(cap, mfr density) × mat area, with edge rows). The Lotel/Castle
charts prove spacing is (bar size, bar spacing, traffic) dependent — expose
those as rule inputs, not hidden constants.

## 6. Tie-wire & fastening model

- Wire: 16-ga black soft-annealed standard; 15/14-ga (or double-strand) for
  heavy mats; ~12 lb wire per ton of bars; tie wire adds NO structural
  strength (017; Utah 2.2 min 16-ga "or acceptable patented system" 016).
- Tie types: snap/simple (slabs), wall tie, double-strand single (heavy —
  FDOT footing-mat periphery+alternate), saddle/U (walls), saddle+twist
  (crane-lifted mats), cross/figure-8 (no bar twist; columns, retaining
  walls) (017,015).
- Density: Iowa/Utah — tie ALL intersections; when spacing <1' each way, tie
  alternate intersections. FDOT footing: double-strand at all periphery +
  alternate interior; walls: every periphery + every third interior; columns:
  every hoop intersection fig-8. Iowa top-mat tie-down ≤4' + ≥50% contacts
  (013,015,016,014).
- Epoxy bars: epoxy/plastic supports AND coated tie wire; epoxy wire may slip —
  double-tie (013,014).
- Dobie-style supports carry cast-in 16-ga wires to fasten the block to the
  bar — a support that also fastens (015,003).

## 7. Corrosion/finish classes (CRSI system, mfr-verified)

- Class 1 plastic-protected: severe exposure / where grinding or sandblasting
  required. Class 1A epoxy/vinyl/plastic-coated: moderate-to-max exposure, no
  grinding; standard with epoxy bars. Class 2A/2B stainless-protected:
  moderate exposure + light grinding <1/16"; non-stainless wire setback from
  face 1/4" (2A) / 3/4" (2B). Class 3 bright basic: no protection, no exposed-
  surface contact. All-plastic/composite supports: all classes (003,010,019;
  class selection by exposure also in the SYNC standards summary).
- Selection rule for the model: coating class is a separate catalog
  attribute driven by (bar coating + exposure surface + ground contact);
  earth-cast footing bottoms argue against bare Class-3 wire feet at a visible
  or corrosion-sensitive face; dobies/plastic sidestep the whole question.
- Coatings offered: plain, plastic-tipped feet, plastic-dipped legs, epoxy,
  galvanized (pre/hot-dip), stainless (ASTM A-493, Type 430/304/316) (003,010).
- Dayton TDS "CRSI Load Category" marks: SB/SBU 200 lb; PSBB 400 lb;
  manufacturer-declared rating class — definition unverified, store as a
  catalog rating field not an engineering value (004,005,012). Point ratings
  seen: BB 2" = 180 lb point / 270 plf (006); PHC ≤500 lb (003); Castle
  chairs 90–300 kg vs AS/NZS 60 kg min (022).

## 8. Base/substrate rules

- Firm formed base: any wire support works; legs turned-up ≥1/8" (003,013).
- Loose soil/sand/fill/carton forms: PLATE variants required — HCP, SBP, BBP,
  CHCP, R28 sand plate (fits 2"–8" HC), PSP, PTCSP (5"×5"); plates keep the
  support at elevation on loose substrate (003,007,001).
- Earth-bearing footing bottom mats: precast concrete dobies are the codified
  public-spec answer (FDOT: ≤4×4×clearance, strength ≥ pour, wired; Dayton
  CPD/CWD to 18"/5" heights; PRB-derived ~4/mat @5' o.c. candidate) (015,003,019).
- Prohibited: bricks, stones, wood blocks/stakes or other embeddable scraps as
  supports (Iowa 2404.03 E.4) (013).
- Membrane/vapor-barrier bases: wide-base/ring plastic chairs reduce puncture
  (Lotel base-ring; PCC stable on foam) — treat membrane protection as a
  substrate input (021,003).
- Alternative footing support: suspend from cross wales or steel stakes into
  subgrade (Iowa culvert-floor clause) (013).

## 9. Limits & unsupported cases — flag list for O-022 `off`/manual/review

- **Tall stands**: HC >12" requires cross-bracing/lacing (009); SureBuilt legs
  ≤20° beyond 12" (011). A target mat >12" above bearing = braced-support or
  different-system flag, never a plain tall chair.
- **Height beyond catalog**: no verified product → incompatibility, not a
  stretched value (001,009; catalog max ~15–40" depending on mfr).
- **Multi-mat (>2 layers)**: each mat independently supported (013); stack
  upper bolsters directly over lower supports (015); SBU/BBU chains with
  inter-layer gap heights — encode per-layer support rows.
- **Variable-depth slabs**: variable-height chairs needed (Iowa CM haunch
  note) — non-constant mat elevation breaks a single-height stand grid (014).
- **Bar-size compatibility**: chairs cradle specific sizes (PCC/PTC/PBC ≤#8;
  Lotel #3–#5; PEZS #3–#10) — incompatible bar → unsupported, not clamped
  (003,021).
- **Deck-profile supports** (HCM/CHCM): need deck profile dims to order —
  flag if base surface is formed deck (010).
- **Subfreezing install**: Lotel snap-ons not recommended (021) — a
  placement-condition note class.
- **Epoxy bars**: coating-compatible supports+wire required (013).
- **Pier/pole drilled shafts**: cage centralizers/wheels, not chairs — the
  support kind differs wholesale (003).
- **No-rebar / mesh-only**: mesh chairs vs bar chairs are different products;
  don't mix compatibility lists (020,021).
- **Weight of evidence for counts**: every public spacing is a CEILING or a
  product-specific suggestion. The model must be able to say "density
  unverified — manual review" rather than minting a number (013,014,021,019).

## 10. Source-ID index for the implementer

| ID | What it authorizes |
|---|---|
| CMP-SUP-001/002 | Dayton HC/HCP product page: heights, >12" bracing, plate use |
| CMP-SUP-003 | Dayton handbook DS98: full type catalog, app matrix, classes, dims |
| CMP-SUP-004/005/006/007/008/009/012 | Dayton TDS: SB/SBU/BB/BBP/CHC/HC/PSBB product facts, loads, install |
| CMP-SUP-010 | Meadow Burke manual: second-mfr ranges, classes, HCMD profile rule |
| CMP-SUP-011 | SureBuilt guide: wire-diameter-by-height table, leg-angle rule |
| CMP-SUP-013/014 | Iowa DOT spec + CM: spacing caps, independent mats, tie rules, tolerances, side-form spacers |
| CMP-SUP-015 | FDOT 415: dobie footing blocks, bolster spacing, tie patterns, tolerances, dowel template |
| CMP-SUP-016 | Utah APWA 03 20 00: flat-slab spacing 3'/5', non-oxidizing supports, 16-ga wire |
| CMP-SUP-017 | NAVEDTRA Steelworker: tie types/gauges, 12 lb/ton, covers, lap rule — public domain |
| CMP-SUP-018 | CRSI PRB TOC + press release: authority marker only — content paid |
| CMP-SUP-019 | Trade article: classes, spacing example, dobie rule — candidate |
| CMP-SUP-020 | Whitacre product line: taxonomy breadth — candidate |
| CMP-SUP-021 | Lotel pages+charts: snap-on class, density rule, sizing — verified |
| CMP-SUP-022 | Castle NZ chart: spacing = f(bar, spacing, load) — foreign example |
| CMP-SUP-023 | ACI 318 cover values via public quotation — verified-as-quoted |
| CMP-SUP-024 | Paid-standard markers: MSP/ACI 315/318/301/RB4.1/ASTMs — not inspected |

## 11. Suggested `foundationRuleRegistry` skeleton shape

```js
// skeleton — field names illustrative, populate from sources above
{
  rule_id: "RSUPPORT-SPACING-IOWADOT-2404",
  domain: "rebar_support.placement",
  subject_kind: "bolster" | "chair" | "stand" | "dobie" | "spacer" | "upper_*",
  bearing_mode: "on_base" | "on_lower_mat" | "clip_on" | "straddle" | "side_form",
  inputs: ["bar_size_class", "member_type", "mat_layer", "substrate", "bar_coating"],
  constraints: { max_spacing_inches_each_way: 48, first_from_end_inches: null, min_per_mat: null },
  applicability: "highway-agency spec ceiling; CRSI MSP may be stricter",
  unsupported_reasons: ["layer>1 requires independent support", ...],
  source_ids: ["CMP-SUP-013"], verified: "public-spec", edition: "rev 10/2026"
}
```

Encode product geometry per catalog row (not per type): height range/increment,
unit length, leg pitch, footprint/plate, material/finish class, bar-size list,
bearing mode, load-rating field. Encode COUNT rules separately per source —
product facts and placement density come from different documents and must
never be conflated into "the product's spacing."
