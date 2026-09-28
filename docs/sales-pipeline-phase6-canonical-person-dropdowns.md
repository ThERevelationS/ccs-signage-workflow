# Sales Pipeline Phase 6 — canonical person dropdowns

Reviewed September 28, 2026 against fresh Base44 Git state and read-only live records.

## Found

The Sales Pipeline still had multiple person-option construction paths. Some fields already resolved legacy short values such as `Brett` against AuthorizedEmail, while Project Manager, Estimator and Opportunity Detail Sales Owner could independently append the raw WorkOrder value. Older/published states could therefore show both a short alias and the canonical full name in the same list.

Read-only live WorkOrder inspection confirmed short legacy values remain in current records across Sales Owner, Task Assigned, Designer, Project Manager and Estimator. The current AuthorizedEmail roster itself is canonical and uses full names such as Brett Heinlein, Carl Heinlein, Kyle Heinlein, Twyla Heinlein, Aidin Gargari, Kay Valentine and Joe Mendoza.

## Fixed

- Added shared `salesPersonIdentity.mjs`.
- The shared canonical roster:
  - excludes inactive/blank users;
  - groups users by first name;
  - when a first name has exactly one distinct full-name identity, collapses short/full duplicates into the full-name record;
  - merges all Sales roles from duplicate short/full records into the canonical record;
  - deduplicates duplicate records with the same full name;
  - does not collapse ambiguous first names with multiple distinct full-name identities.
- Main Sales table now uses the shared canonical model for:
  - Sales Owner
  - Designer
  - Project Manager
  - Estimator
- Task Assigned eligibility now uses the same canonical roster.
- Information Filter user dropdowns now use the same canonical roster.
- Opportunity Detail Sales Owner now uses the same canonical roster.
- A resolved legacy WorkOrder value such as `Brett` displays/selects as `Brett Heinlein` and does not get re-added as a separate legacy option.
- An unresolved historical name with no authorized canonical match is still preserved as the current row's legacy value rather than being silently hidden or reassigned.
- No WorkOrders, AuthorizedEmail rows, permissions or Smartsheet configuration were modified.

## Verified

- New canonical person dropdown regression: **26/26 PASS**.
- Person alias + Smartsheet canonical translation regression: **41/41 PASS**.
- Saved-filter validation: **13/13 PASS**.
- Save single-flight: **21/21 PASS**.
- Responsive filter editor: **26/26 PASS**.
- Filter/preset accessibility: **21/21 PASS**.
- Column draft: **45/45 PASS**.
- Column catalog: **PASS**.
- Focused ESLint: **0 errors**, one pre-existing `setActiveTab` warning in CustomFilterDialog.
- `git diff --check`: PASS.
- Full production build: **PASS**; nonempty `dist/index.html` verified.

## Remaining

Authenticated browser acceptance is still outstanding. The user-provided screenshot reflects a state where duplicate short/full names were visible; source-level validation now proves the option-building logic no longer permits a unique short/full pair to appear twice. A future publish/browser check is still required before claiming the production UI is updated.

Nothing published and no production records modified.
