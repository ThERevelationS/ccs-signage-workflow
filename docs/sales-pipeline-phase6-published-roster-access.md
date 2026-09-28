# Sales Pipeline Phase 6 — published-app person roster access

Reviewed September 28, 2026 after comparing Builder Preview with the latest published app.

## Confirmed production-only bug

The same custom Information Filter, `Brett's Assigned Jobs`, was selected in both Builder Preview and the published app.

Builder Preview correctly showed rows stored as `current_task_assigned_to = Brett` under the canonical identity `Brett Heinlein`.

The published app still displayed raw legacy person labels such as `Brett` and then failed to include those rows in the `Brett Heinlein` custom filter.

The filter definition itself was correct. The environment-specific difference was the person roster:

- `SalesPipelineSpreadsheet.jsx` and `CustomFilterDialog.jsx` directly queried `AuthorizedEmail` from the browser.
- `AuthorizedEmail` RLS permits reads only for the matching Base44 user email or Base44 admins.
- The application uses a separate custom Sign Shop session through `EmailGate`.
- Builder Preview/admin context could read the full roster.
- Published Sign Shop sessions could receive an empty/incomplete AuthorizedEmail result even though the custom Sign Shop login was valid.
- Without the roster, the canonical-person layer could not safely resolve `Brett` to `Brett Heinlein`, causing both the wrong displayed name and the missing custom-filter rows.

## Fixed

- Added an authenticated `roster` action to the existing `manageSalesFilters` backend.
- The action authenticates the existing custom Sign Shop session first.
- Only after authentication, it reads AuthorizedEmail through service role.
- Response projection is intentionally limited to assignment-safe fields only:
  - id
  - email
  - full_name
  - sales_roles
  - is_active
- Credential, HR, face, token and other private AuthorizedEmail fields are not returned.
- AuthorizedEmail RLS was not weakened.
- Added `loadSalesPersonRosterSafely` to existing Sales persistence.
- Sales Pipeline spreadsheet now uses the authenticated backend roster instead of direct AuthorizedEmail browser reads.
- Custom Information Filter editor uses the exact same authenticated roster.
- Sales Pipeline load now reruns when the Sign Shop session token becomes available, preventing a startup/session-restoration race.
- Existing canonical-person matching, full-name display, filter equality, Smartsheet first-name translation, compact column controls and horizontal preview remain unchanged.

## Verified

- New published-roster access regression: **14/14 PASS**.
- Canonical person dropdown regression: **26/26 PASS**.
- Person alias + Smartsheet translation: **41/41 PASS**.
- Date filters: **68/68 PASS**.
- Saved-filter condition validation: **13/13 PASS**.
- Save single-flight: **21/21 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Filter/preset accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Focused ESLint: **0 errors**, six existing unused-variable warnings.
- `manageSalesFilters` backend bundle: **PASS**.
- `git diff --check`: **PASS**.
- Full production build: **PASS**; nonempty `dist/index.html` verified.

## Safety

No WorkOrders, SalesFilters, AuthorizedEmail records, schemas, Smartsheet config or production data were modified. Nothing was published.
