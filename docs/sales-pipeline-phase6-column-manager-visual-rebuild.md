# Sales Pipeline Phase 6 — Custom Column Manager visual rebuild

Reviewed September 28, 2026 after comparing the current Custom Column Filters UI with the previously approved design.

## What happened

The earlier column-manager work successfully implemented the functional architecture:
- shared 35-column catalog
- compact always-visible column controls
- horizontal live preview using real table labels/minimum widths
- arrow reordering
- Show All / Hide Optional / Reset
- Undo / Redo
- Save & Close / unsaved-change protection
- conflict-safe preset persistence
- legacy unavailable-column preservation

However, the large visual/editor redesign was never completed. The review document explicitly said "implementation review (no UI edits)", and subsequent work mostly hardened the existing dialog rather than replacing its visual layout. That is why the live editor still looked like the older form with additional controls layered into it.

## Fixed in this chunk

The existing editor was visually rebuilt without creating a duplicate V2 system or altering preset data semantics.

- Column mode expands to a near-full-screen workspace: up to 1400px / 96vw and 92vh.
- Preset editor now has a distinct professional workspace surface rather than the old nested clay-card form.
- Added clear visible/hidden column counters.
- Preset name and layout tools share one compact header row on desktop.
- All columns remain visible at once; no search or hidden picker was introduced.
- Replaced the loose flex-wrap checkbox strip with a dense responsive grid:
  - 2 columns on narrow phones
  - 3 on small screens
  - 5 on large screens
  - 6 on extra-large screens
- Selected columns have clear active styling; hidden columns remain visible but muted.
- Checkboxes remain native and directly manipulate the live preview.
- Live horizontal preview has a stronger dedicated visual surface and explicit visible count.
- Reordering remains drag-free through the existing left/right arrows.
- Save/Cancel footer is sticky inside the editor so actions remain reachable.
- Added dark-mode-aware surfaces/borders/text to the column workspace.
- Existing data, saved order, visibility, undo/redo, save semantics, legacy columns and WorkOrders were not changed.

## Verified

- Column draft / Undo / Redo / Save & Close: **45/45 PASS**.
- Shared column catalog / labels / widths / legacy preservation: **PASS**.
- Responsive editor source checks: **26/26 PASS**.
- Filter save-lock: **21/21 PASS**.
- Pool accessibility: **21/21 PASS**.
- Person / Smartsheet translation: **41/41 PASS**.
- Filter condition validation: **13/13 PASS**.
- Delete single-flight: **13/13 PASS**.
- Duplicate single-flight: **16/16 PASS**.
- Selection single-flight: **14/14 PASS**.
- Date-filter regressions: **68/68 PASS**.
- Focused ESLint: **0 errors**, one pre-existing unused `setActiveTab` warning.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

Authenticated browser/mobile acceptance remains outstanding. Nothing published and no production records modified.
