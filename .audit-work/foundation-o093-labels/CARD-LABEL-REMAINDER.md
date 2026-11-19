# O-093 card-label remainder — owned by B-3 recovery

## What is deliberately NOT in this candidate set

`FoundationItemCard.jsx` renders the foundation-item dimension inputs
(spread-footing `length_inches` / `width_inches` / `depth_inches`, pillar
`diameter`, `grade_offset_inches`). That file is a protected choke point in
this session's file-ownership matrix — B-3 recovery owns it. It was not
modified, and nothing in this candidate set depends on it being modified.

## What IS ready for it

`foundationGeometryInputs.js` now exports
`FOUNDATION_DIMENSION_FIELDS.foundation` with label / help / placeholder /
unit / ftIn / signed metadata for all five card dimension fields, resolved
through `foundationDimensionFieldMeta("foundation", field)`:

| field | label | placeholder | signed |
| --- | --- | --- | --- |
| `length_inches` | Length (in) | `4' 0"` | no |
| `width_inches` | Width (in) | `4' 0"` | no |
| `depth_inches` | Depth (in) — *"must reach below the frost line for your area"* | `3' 0"` | no |
| `diameter` | Diameter (in) | `2' 0"` | no |
| `grade_offset_inches` | Grade offset (in) — *"+ above / − below finished grade"* | `0"` | **yes** |

`foundationFtInEntry.js` exports everything the card needs:
`FoundationDimensionInput` (drop-in controlled widget — the same component
the panels now use), or the bare boundaries `foundationDimensionDraftValue` /
`foundationDimensionStoredText` / `foundationDimensionInputIssue` if the card
keeps its own input element. `grade_offset_inches` is the one `signed: true`
field — the parser accepts `-4'`/`-27` forms for it.

## Expected card-side change shape (for the B-3 owner)

Swap each dimension `<Input type="number">` for `<FoundationDimensionInput
{...foundationDimensionFieldMeta("foundation", field)} value={item[field] ??
""} onCommit={(v) => set(field, v)} invalid={issueFor(field)} describedBy={...} />`
— same pattern as `FoundationPolesPanel.jsx` in this candidate set. Keep the
card's existing issue seam; append, do not replace.

## Also deferred (separate remainder)

- **Dimensional diagram** — the (b-scene) half of O-093; deferred to the
  scene/module phase. No diagram code was attempted.
- **Page help toggle** — `FoundationToolbar`'s `onHelp` seam lives in
  `FoundationEstimator.jsx` (protected); contextual help currently rides the
  `title` tooltip + focused inline-help seams already present.
