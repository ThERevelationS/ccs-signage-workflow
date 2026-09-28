# Sales Pipeline Phase 6 — persistent per-user filter selections

Reviewed September 28, 2026 against fresh Base44 Git state.

## Requirement

When a user explicitly selects Sales Pipeline filters or a column layout, those choices should still be applied the next time that same user signs in.

## Implemented

A user-specific `sales_pipeline_preferences` object now lives on the existing AuthorizedEmail record with:
- `information_filter`
- `attention_filter`
- `column_preset_id`

Preferences are read and written only through the existing authenticated `manageSalesFilters` backend using the custom Sign Shop session. AuthorizedEmail RLS remains unchanged.

### Restored on login

- Standard or custom Information Filter, including filters such as `Brett's Assigned Jobs`.
- Attention filter such as Overdue, Today, Next 7 Days, Needs Attention and More Filters entries.
- Default or custom Column Filter / column-layout preset.

A custom filter/preset is restored only if it is still selected/available to that user. Deleted/unshared IDs fail closed to All or Default View rather than applying stale state.

### Saved on explicit user action

- Selecting an Information Filter.
- Selecting/clearing an attention filter.
- Selecting Default View or a custom Column Filter.
- Explicit outcome status buttons retain the same persistence path.

Temporary UI resets caused by switching workspace/view are **not** persisted, so navigating away does not erase the user's remembered Sales filter choices.

Preference writes are serialized in the browser, then backend writes use the authenticated AuthorizedEmail ID plus `updated_date` optimistic concurrency. This prevents rapid selections from being committed out of order and protects concurrent changes to the user record.

## Verified

- New persistence regression: **21/21 PASS**.
- Saved-filter condition validation: **13/13 PASS**.
- Filter save single-flight: **21/21 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Filter/preset accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Canonical person dropdowns: **26/26 PASS**.
- Person/Smartsheet translation: **41/41 PASS**.
- Focused ESLint: **PASS**.
- `manageSalesFilters` backend bundle: **PASS**.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

No WorkOrders or existing AuthorizedEmail records were modified during testing. Nothing published.
