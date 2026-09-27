# Sales Pipeline top-menu improvement phases

App: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`).
Only the Sales Pipeline and its directly connected UI; this is a production app with concurrent agents.
Preserve existing filters, workspaces, actions, permissions, KPI meaning, and saved column presets.
Do not publish without explicit user approval. Complete one coherent phase per Continue:
inspect fresh Git state → preserve → modify → targeted test → verify → checkpoint → stop.

## Phase 1 — Responsive primary toolbar
Completed and checkpointed: `6ab7c086ab9544ba3bc7a368`, Git `d37da278d0739e184796a47350eef25806bd0d7d`.
Workspace, views, search, New Client and permission-gated Tools are visible and separated from saved information/column filters. On phones, the desktop view tabs become one selector.

## Phase 2 — Compact attention controls and grouped More Filters
Completed and checkpointed: `6ab8555e463f5ec8f2e89306`, Git `d7ee36afc01a75fb84df7530f5cbe9ef80783239`. 30/30 toolbar and 86/86 attention menu checks, column checks, targeted lint and production build passed.
Keep All, Overdue, Today, Next 7 Days and Needs Attention visible without horizontal swiping; group the other existing filters into More Filters. Preserve every original filter key, existing counts and click behavior, and expose the active selection and Clear Filters. Do not change the underlying trustworthy Sales summary or WorkOrders.

## Phase 3 — Progressive KPI summary
Completed and checkpointed: `6ab871f1d818eebc505182eb`, Git `3c44ed58de0f0961f9bff7fa01597f27e35f06bd`. Four KPI cards are directly visible (Open Opportunities, Open Pipeline Value, Follow-ups Due and Needs Attention), with the original four secondary cards under an accessible, initially collapsed More Metrics control. All seven original card implementations, tooltip coverage, values and click handlers are unchanged. Needs Attention reuses its existing summary count and filter. An active secondary filter remains named in the More Metrics button. No changes to metric calculations, data or permissions.

## Phase 4 — Responsive and contextual finishing
**In progress.** First contained chunk completed and checkpointed: `6ab87ccbf89d53287fb24663`, Git `47983eacefe8188c2fdebb71a414d61cce546ddb`: primary/secondary KPI metrics now use a 2-column grid on phones and 4 columns from medium screens, without hiding metrics behind a swipe. All original metric values, tooltips and actions remain intact.\n\n**Second contained chunk implemented and verified; checkpoint pending:** main toolbar uses three intentional narrow-phone rows: title with New Client (Return to Pipeline when in duplicate cleanup), contextual Workspace with View or Outcome Period, and Search alongside a visibly labeled Tools button. History gets a full-width Workspace; unregistered users have a full-width heading. Controls have 44px phone touch targets, the desktop segmented views expose `aria-pressed` and visible keyboard focus, and contextual options/actions are preserved. Mobile layout regression 26/26, toolbar 30/30, attention 86/86, KPI 30/30, Sales column tests, targeted lint (no errors), production build and generated CSS checks passed. Genuine authenticated mobile/tablet/desktop browser acceptance remains outstanding.\n\n**Third contained chunk implemented and verified; checkpoint pending:** the secondary filter row now uses two deliberate phone columns instead of free-form wrapping. Quick attention shortcuts occupy a full-width 2-column grid with 44px targets; More Filters and Clear Filters remain visible; Information Filters and Column Filters sit side by side at full available width. From small screens upward, the existing compact wrapped desktop layout returns. All filter keys, counts, selected secondary-filter labeling, custom filter sources, admin gate, and dialog entry points are preserved. Mobile filter-row regression 14/14 plus the existing attention, toolbar, mobile-toolbar, KPI and column suites pass; targeted lint has no errors; production build and generated responsive CSS checks pass. Genuine authenticated browser acceptance remains outstanding.\n\n**Next:** Phase 5 cross-workflow acceptance and actual phone/tablet/desktop browser checks where available, preserving the compact column checkbox editor and horizontal preview.

## Phase 5 — Cross-workflow acceptance and regression review
Planned. Verify search, saved filters, attention controls, column presets and column order, WorkOrder loading, view switching, read-only insights, outcomes versus legacy scopes, protected import/export/duplicate cleanup, and browser/mobile behavior. Preserve concurrent work and create verified checkpoints. No live-data mutation as a test fixture.

## Phase 6 — Real UI visual references and professional visual polish
**New phase explicitly requested by the user; start only after the functional phases above.**
Collect *real* public UI references from well-executed modern CRM/pipeline dashboards and established design systems, alongside authenticated desktop and mobile captures of our own current page when available. Inspect their information hierarchy, table density, responsive navigation, KPI layouts, readable typography, micro-spacing, restrained neutral colors, states, and accessible contrast. Use the strongest relevant visual patterns to produce a clear, specific proposal before editing.

Implement restrained, consistent styling in small tested chunks: professional, clean, slick, fast to scan, never decorative or distracting. No stock hero art, excessive gradients, animation, broad page rewrites, or cloning proprietary interfaces. Preserve existing data, permissions, row actions and the user's compact always-visible column checkboxes and horizontal preview. Compare before/after on both desktop and mobile, then checkpoint. Never publish without explicit user approval.
