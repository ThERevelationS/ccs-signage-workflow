# Claim-safe ledger paragraph — O-035 candidates

> For the lead to adapt into the masterplan when applying. This paragraph
> claims only what the evidence shows: verified candidates, additive wiring
> at the existing seams, no remote application yet.

## O-035 (CMP-C04) — candidate paragraph

`O-035` **[candidates verified]** (`CMP-C04`) Scene edit operations landed as
candidates at remote HEAD `fe0e913da39e646de1394d077eb34effa0f259f0` (app
`68dfcc5e57bbbc35387da97c`, main — owned surfaces byte-identical to the pull
baseline; `foundationSceneEditOps.js` confirmed absent remotely): new pure
`foundationSceneEditOps.js` — a DOM-free operations module where every edit
produces patch-shaped results (`{collection, index, key, before, patch}`) the
existing commit channel applies and undoes. Move translates items, poles, and
wall vertices with object-snap (edges/centers/poles/wall-vertices/plan-bounds
probes) plus uniform-grid fallback — object snap always outranks grid, and
malformed authored wall vertices ride verbatim (never NaN'd, never silently
repaired). Resize runs all 8 handles in the item's rotated local frame with
the opposite edge anchored (a handle flip grows instead of collapsing),
min-size clamp, pillar diameter, and optional aspect lock — including through
`sceneDragCorner`-compatible sessions. Rotate pivots about the footprint
center snapped to 15° (Shift frees; `[`/`]` keys and toolbar steps covered).
Align (6 edges, to primary or to plan) and distribute (3+ rows, equal edge
gaps, outer pair anchored) emit only real deltas — rows already on the line
are noop, not fake patches. Typed coordinates are atomic: any
unknown/inapplicable/non-finite/non-positive field rejects the whole op;
ft/in text parses upstream through the O-093 boundary so the module sees
canonical inches. Delete and duplicate are plan descriptors (removals +
skips, sources + suggested offset) routed to page hooks — the canvas never
mutates business data; clone/remap stays with `foundationDuplicateMirror`.
Every op validates finite + non-degenerate input, honors `isLocked`/
`readOnly`, and records ONE undo command — `recordEdit` for single-row
patches, `beginStroke`+`commitStroke` for multi — with all anchors in the
full-scene CAS domain so a pole/wall write detaches recorded geometry just
like an items write. Multi-row records carry `target:null`: the current
single-row undo apply refuses them explicitly (`'rejected'`, stacks
untouched) instead of fake-applying a no-op; the mounted multi apply
branches on `rev.patch.multi` and round-trips for real. The
`FoundationLayoutCanvas.jsx` candidate adds the surface — 8 resize handles +
rotate handle on the primary selection, an ops toolbar (align/distribute/
rotate/duplicate/delete with honest disabled-state hints), a typed field bar,
live snap guides, a dims chip, multi-drag, and keyboard ops — while
preserving every O-034/O-038/O-039/O-040 seam (unmounted use degrades to
remote behavior exactly). Evidence `.audit-work/foundation-o035-editops/`:
**44 model assertion groups** (op matrix, invalid rejection, locked/read-only,
verbatim vertices, honesty guard, undo round-trips) + **13 real-Chromium
scenarios** (handles, resize/rotate = one command + undo, snap-guided commit,
typed in/ft/invalid, align + distribute through the multi channel, delete +
duplicate hooks, read-only gating, grid snap, multi-drag), 0-warning esbuild
bundle. Page mount deferred to the owner — documented anchors (props at the
existing canvas mount, multi-row commit channel, multi-aware undo apply,
full-domain anchors, delete/duplicate handlers, snap prefs) in
MOUNT-ANCHORS.md. Remainder: `FoundationEstimator.jsx` still mounts only
items/poles/onMoveItem — single-item resize/rotate/typed ops already record +
undo through that channel today; align/distribute/multi-row ops and
delete/duplicate stay honestly disabled until the page channels land; wall
render layers ride their own work item (ops already address wall geometry).
