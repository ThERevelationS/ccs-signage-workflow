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
Current phase; verification/checkpoint must be recorded after completion.
Keep All, Overdue, Today, Next 7 Days and Needs Attention visible without horizontal swiping; group the other existing filters into More Filters. Preserve every original filter key, existing counts and click behavior, and expose the active selection and Clear Filters. Do not change the underlying trustworthy Sales summary or WorkOrders.

## Phase 3 — Progressive KPI summary
Planned. Retain four directly visible KPI cards (Open Opportunities, Open Pipeline Value, Follow-ups Due and Needs Attention). Place the existing secondary KPIs in an expandable More Metrics area with their original click-to-filter behavior, titles, coverage and date limitations intact. Do not invent metrics or change calculations.

## Phase 4 — Responsive and contextual finishing
Planned. Test small phones, tablets and wide desktop; avoid horizontal toolbars that hide important controls. Retain Outcome Period only in Outcomes, appropriate views by workspace, real active filter labels and keyboard/touch accessibility. Protect the separate compact checkbox editor and horizontal column preview.

## Phase 5 — Cross-workflow acceptance and regression review
Planned. Verify search, saved filters, attention controls, column presets and column order, WorkOrder loading, view switching, read-only insights, outcomes versus legacy scopes, protected import/export/duplicate cleanup, and browser/mobile behavior. Preserve concurrent work and create verified checkpoints. No live-data mutation as a test fixture.

## Phase 6 — Real UI visual references and professional visual polish
**New phase explicitly requested by the user; start only after the functional phases above.**
Collect *real* public UI references from well-executed modern CRM/pipeline dashboards and established design systems, alongside authenticated desktop and mobile captures of our own current page when available. Inspect their information hierarchy, table density, responsive navigation, KPI layouts, readable typography, micro-spacing, restrained neutral colors, states, and accessible contrast. Use the strongest relevant visual patterns to produce a clear, specific proposal before editing.

Implement restrained, consistent styling in small tested chunks: professional, clean, slick, fast to scan, never decorative or distracting. No stock hero art, excessive gradients, animation, broad page rewrites, or cloning proprietary interfaces. Preserve existing data, permissions, row actions and the user's compact always-visible column checkboxes and horizontal preview. Compare before/after on both desktop and mobile, then checkpoint. Never publish without explicit user approval.
