# Sales Pipeline — Phase 6 duplicate single-flight guard

Reviewed September 28, 2026 against fresh Base44 Git state.

## Found

The saved filter/preset Duplicate action called the backend copy helper directly with no synchronous in-flight guard. Because copy names are intentionally made unique, two very rapid clicks could create two separate copies before the UI had any chance to discourage the second click.

## Fixed

- Added a duplicate-only synchronous `copyInFlightRef`.
- Added `isCopying` render state so both Standard and Custom Duplicate buttons disable while one copy request is running.
- The copy lock is acquired before async persistence and released in `finally` on both success and failure.
- Existing standard-preset type/column translation, custom-record copy path, session token, backend copy helper, error display, and pool reload remain intact.
- Save single-flight protection remains separate.
- No changes to filters themselves, WorkOrders, schemas, permissions, Smartsheet sync, compact column checkboxes, or horizontal preview.

## Verified

- New `scripts/validate-sales-filter-duplicate-lock.mjs`: **16/16 PASS**.
- Save lock: **21/21 PASS**.
- Saved-filter condition validation: **13/13 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Date filters: **68/68 PASS**.
- Filter/preset pool accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Focused ESLint: **0 errors**, one pre-existing unused `setActiveTab` warning.
- `git diff --check`: PASS.
- Full `npm run build`: PASS; nonempty `dist/index.html` verified.

## Remaining

Authenticated phone/tablet/desktop browser acceptance remains blocked by unavailable browser tooling / authorized test session. Source-level tests and build checks do not replace live browser acceptance.

Nothing published and no production records modified.
