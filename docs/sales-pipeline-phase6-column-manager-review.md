# Phase 6 — Column manager implementation review (no UI edits)

Reviewed current `src/pages/SalesPipeline.jsx` and `src/components/sales/CustomFilterDialog.jsx` at Git `aa4f9d011a58b52562af0e8e1024528be2ceb0de` on 2026-09-27. This is a code review, not authenticated browser acceptance.

## Preserved current behavior

- `CustomFilterDialog` is reused for filter and column management. Column presets are edited in place.
- All column checkboxes remain visible as compact wrapping labels (11px text, 12px native checkbox); Show All, Hide Optional, Reset, Undo and Redo remain available.
- The horizontal table preview stays directly beneath the checkboxes in the same editing screen, scrolls independently, and uses the live table's shared header labels/minimum widths and current saved order.
- Preview arrows provide explicit non-drag reordering. Unsaved-change and column-draft regressions already cover key state transitions.

## Narrow proposal for review before implementation

The preview reordering arrow buttons currently use `h-6 w-5` (24 x 20 px), which may be difficult to tap on narrow phones. Keep the dense visible preview and the arrows; consider expanding the *interactive hit area* to at least 44 x 44 px on touch layouts while preserving compact visible arrow glyphs and the existing horizontally scrolling table. This may require a compact alternate control or spacing treatment rather than widening every column. Do not implement before authenticated mobile screenshots/acceptance confirm fit and the user reviews the proposal.

No changes to WorkOrder data, Smartsheet mapping, pricing, permissions, saved presets, or live UI are part of this review. Phase 5 authenticated phone/tablet/desktop acceptance remains NOT RUN.
