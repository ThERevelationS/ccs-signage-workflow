# Claim-safe ledger paragraphs — O-038 / O-039 candidates

> For the lead to adapt into the masterplan when applying. These paragraphs
> claim only what the evidence shows: verified candidates, additive wiring at
> an existing seam, no remote application yet.

## O-038 (CMP-C07) — candidate paragraph

`O-038` **[candidates verified]** (`CMP-C07`) Screen/world transform
foundation landed as candidate `foundationSceneTransforms.js` at remote HEAD
`2083c6dbb` (app `68dfcc5e57bbbc35387da97c`, main): pure, DOM-free
plan↔screen↔world math — inches-internal plan space (480×320 extent,
x-east/z-south), CSS-px screen space (DOMRect-shaped views), feet/Y-up world
space matching the existing 3D preview feed. Covers element-rect views
(canvas parity), uniform contain-fit viewport views, bounds-fit, anchored
zoom with clamp, pan, item-local frames (rotation about footprint center,
CSS direction), percent seam, and plan↔world+elevation.
`foundationLayoutModel.layoutPointInches` now delegates to it (1-import +
1-body diff). Evidence `.audit-work/foundation-o038-input/`: 34 model
assertion groups incl. 20k-point remote-parity sweep at ≤1e-9 drift,
null-verdict parity, round-trips across all view kinds, zoom-anchor
invariance + clamp, 12-rotation frame round-trips, 1000 world round-trips;
0-warning esbuild bundle. Responsive/aspect correctness: viewport-fit views
are uniform-scale letterbox (no distortion); element-rect views preserve the
canvas's existing per-axis mapping for non-3:2 rects (documented, unchanged
behavior). Scroll correctness flows through the already-zoomed/scrolled
element rect — the "never rescale by zoom" contract is now enforced in one
place. Full-screen/responsive SVG adoption by renderers remains for their
own items.

## O-039 (CMP-C08) — candidate paragraph

`O-039` **[candidates verified]** (`CMP-C08`) Input-primitive foundation
landed as candidate `foundationSceneInput.js` + seam wiring at remote HEAD
`2083c6dbb`: pointer normalization (mouse/touch/pen + touch-list fallback),
primary-press guard, hit-testing over the layout model (item
face/edge/vertex incl. rotated frames and pillar rims, pole points, wall
vertex/segment/face incl. wrap segments and the assembly's segment-index
contract), degenerate-geometry handling (zero-length segments, single-point
and bad-vertex outlines, collinear closed polygons, unplaceable items),
drag record/commit/identity+fingerprint primitives, keyboard nudge + patch,
snap candidates/guides + grid snap, position patch (numeric fallback), and
hit/object labels. The canvas's existing input seam is wired to the
primitives — begin/move/commit/keyboard — with provably identical values.
Evidence `.audit-work/foundation-o038-input/`: hit fixtures across the full
degenerate matrix, 5k-commit + 2k-move equivalence corpus vs frozen remote
math, full key×modifier matrix, 11 real-Chromium component scenarios
(drag/keyboard/wiggle/second-pointer/reorder/fingerprint/invalid/zoom-map/
pen/read-only), and a 9-step remote-vs-candidate parity replay with **0
diffs** in emitted patches + DOM rects. Pointer-capture/touch/pen semantics
unchanged (DOM-side, already present); hit-test/snap/normalize primitives
await their O-034–O-042 consumers (anchors in MOUNT-ANCHORS.md). Remainder:
no visual affordances yet — labels/hit kinds are data for future selection
and diagnostics surfaces.
