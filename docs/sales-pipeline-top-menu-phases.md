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
- KPI grid completed and checkpointed: `6ab87ccbf89d53287fb24663`, Git `47983eacefe8188c2fdebb71a414d61cce546ddb`. Two-column phone/four-column desktop KPI layout; original metrics and click actions preserved.
- Primary phone toolbar completed and checkpointed: `6ab883eaf662c125c7609793`, Git `ff074c54ed5ebc429ce08c3e81070a1b8abad14c`. Title, contextual workspace/view/outcome period, Search and Tools retain keyboard focus and readable phone touch targets.
- Secondary filter-row changes inspected and independently regression-tested: two-column mobile grid with accessible 44px attention shortcuts, full-width Information/Column selectors, and existing compact desktop layout. Mobile filter-row 14/14, mobile toolbar 26/26, attention 86/86, toolbar 30/30, KPI 30/30 and catalog checks pass; included in this handoff's next verified checkpoint.
- Genuine authenticated phone/tablet/desktop browser acceptance remains outstanding; code-level responsiveness and generated CSS tests are not substitutes for actual browser testing.

## Phase 5 — Cross-workflow acceptance and regression review
**In progress. First contained fix implemented and verified, checkpoint pending:** Duplicate Cleanup replaces the spreadsheet, but the header previously still offered New Client and import/export/history actions against the unmounted spreadsheet. New Client could close after an optional-chained no-op without creating a WorkOrder. New Client and spreadsheet-dependent Tools actions are now hidden during cleanup, while Return to Pipeline remains available. A previously opened New Client form also rejects saves explicitly if its destination disappears, preserving entered data and showing the existing form error. Shared WorkOrder creation and permission checks remain unchanged. Dedicated source-level regression 16/16, mobile toolbar 26/26, toolbar 30/30, filter row 14/14, attention 86/86, KPI 30/30 and catalog checks pass; targeted lint zero errors and production build pass. No live records touched.

**Next contained audit:** examine import/export permission state when users change or authorizations are revoked; current effect appears to grant permission without explicitly resetting it for a different user. Confirm and address in a separate scoped chunk. Continue cross-workflow and genuine browser acceptance where tooling permits. Preserve conflict-safe WorkOrder saves, legacy/outcome scope, the compact checkbox editor and horizontal preview.

## Phase 6 — Real UI visual references and professional visual polish
**New phase explicitly requested by the user; start only after the functional phases above.**
Collect *real* public UI references from well-executed modern CRM/pipeline dashboards and established design systems, alongside authenticated desktop and mobile captures of our own current page when available. Inspect their information hierarchy, table density, responsive navigation, KPI layouts, readable typography, micro-spacing, restrained neutral colors, states, and accessible contrast. Use the strongest relevant visual patterns to produce a clear, specific proposal before editing.

Implement restrained, consistent styling in small tested chunks: professional, clean, slick, fast to scan, never decorative or distracting. No stock hero art, excessive gradients, animation, broad page rewrites, or cloning proprietary interfaces. Preserve existing data, permissions, row actions and the user's compact always-visible column checkboxes and horizontal preview. Compare before/after on both desktop and mobile, then checkpoint. Never publish without explicit user approval.
