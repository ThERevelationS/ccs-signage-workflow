# Claim-safe ledger paragraph — O-040 candidates

> For the lead to adapt into the masterplan when applying. This paragraph
> claims only what the evidence shows: verified candidates, additive wiring
> at an existing seam, no remote application yet.

## O-040 (CMP-C09) — candidate paragraph

`O-040` **[candidates verified]** (`CMP-C09`) Stroke-level scene undo landed
as candidates at remote HEAD `9a872e9248c57e9b468881baecf7b899248f5c24`
(app `68dfcc5e57bbbc35387da97c`, main — owned surfaces byte-identical to the
`8a4ad456c` pull baseline; concurrent external-agent commits between the two
heads touched only panels/`foundationGeometryInputs`, none of the O-040
surfaces; `foundationSceneHistory.js` confirmed absent remotely): new pure `foundationSceneHistory.js` — a DOM-free undo/redo store
where one continuous gesture is one command (a pointer drag
begin→moves→commit, a keyboard nudge burst inside a configurable
coalesce window, or a multi-commit paint-style stroke via
begin/extend/commit). Entries carry `before`/`after` restore patches plus
caller-computed geometry anchors (`sceneLayoutAnchor` — same fingerprint
fields the drag guards use; component ids and non-geometry fields excluded
so id-minting normalization and price/label edits never look like external
writes). Every undo is CAS-gated: it applies only while the live anchor
chains to the head entry's `afterAnchor`; an external write (other panel,
Builder sync, concurrent save) detaches the chain — entries stay listed but
are never applied and prune on contact, so undo can never resurrect stale
geometry over a concurrent write. Undo/redo is apply-gated through the
consumer's own commit path — a refused commit (`commit` → false) leaves the
stacks untouched (`'rejected'`). Bounded past/future (default 100),
burst-window default 1200ms (0 disables, Infinity always merges adjacent
same-key), `subscribe`/`stateVersion`/`getState`/`entries` for undo UI.
`foundationSceneInput.js` gains the additive seam
(`sceneEditFromDrag`/`sceneEditFromNudge`/`sceneEditCoalesceKey` — gesture →
history-ready edit record; drags never coalesce, nudges coalesce per-row).
`FoundationLayoutCanvas.jsx` wires it at the existing input seam: one
`recordEdit` per committed drag, coalesced `recordEdit` per nudge, an
`observe` effect on `items`, an optional `sceneHistory` prop (internal
store keeps unmounted use byte-identical — 9-step remote-parity replay,
**0 diffs** in emitted patches + DOM rects). Evidence
`.audit-work/foundation-o040-undo/`: **34 model assertion groups**
(coalescing, round-trips, CAS refusal, external invalidation, capacity,
subscription, real-primitive lifecycle) + **10 real-Chromium scenarios**
(drag = one command, undo/redo through the real commit path, burst window,
external detach, mid-gesture interleaved write preserved inside anchors,
refused/read-only/wiggle/second-pointer paths record nothing, zoomed drag,
in-browser module probe), 0-warning esbuild bundle. Page mount deferred to
the B-3 owner — documented anchors (store + `sceneHistory` prop at
~L1487, undo application through `patchItem`, coexistence semantics with the
page's snapshot history, context reset) in MOUNT-ANCHORS.md. Remainder:
page-level undo buttons still drive the existing snapshot history until the
deferred wiring lands; wall/pole/vertex strokes inherit the same store when
their edit surfaces exist (anchors already cover their geometry).
