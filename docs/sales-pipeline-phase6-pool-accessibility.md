# Sales Pipeline — Phase 6 pool-selection accessibility correction

Reviewed September 27, 2026. Scope: `src/components/sales/CustomFilterDialog.jsx` standard/custom filter and column-preset pool only. This is a narrowly scoped **functional/accessibility** correction, not approval for the proposed visual redesign. No current authorized UI screenshots were available in the repository, and authenticated browser acceptance remains blocked by missing browser tooling and an authorized test session.

## Found → Fixed

- The standard/custom pool used clickable `<div>` containers with controlled `<input type="checkbox">` elements whose `onChange` callbacks were inert. Tab/Space checkbox activation did not own the selection behavior, and adjacent actions could be confused with the enclosing selection target.
- Both pools now use native labels wrapping the real checkbox and displayed name. `onChange` calls the **existing** standard or conflict-safe custom selection path once. Duplicate/Edit/Delete are separate, named action buttons, not nested inside selection labels. My Presets remove buttons also have accessible names. Phone hit targets are 44px for the selection labels, pool action buttons and selected-chip removal, with compact controls retained at desktop breakpoints. Long names may wrap; no search-only replacement or hidden checkbox inventory.

## Verified at source/build level

- `node scripts/validate-sales-pool-accessibility.mjs`: **21/21 PASS**.
- Existing column draft: **45/45 PASS**; column catalog: **PASS**.
- Focused ESLint: **0 errors, 1 pre-existing unused `setActiveTab` warning**; `git diff --check`: **PASS**.
- `npm run build`: exit 0; nonempty `dist/index.html` verified. Build output includes stale `baseline-browser-mapping` and Browserslist-data advisories only.

## Preserved / Remaining

The compact always-visible **column-settings** checkboxes, horizontally scrolling preview, column order, filter persistence, Saved Filter selection, WorkOrders, Smartsheet, auth/RLS, estimates and downstream handoff were not changed. No production record mutations or publication.

**Blocked:** Actual keyboard/assistive-technology and authenticated phone/tablet/desktop acceptance; capture authorized screenshots and test roles in nonproduction before broad Phase 6 visual changes. Source checks and successful build are not browser evidence.
