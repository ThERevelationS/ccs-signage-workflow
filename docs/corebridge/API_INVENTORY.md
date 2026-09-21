# CoreBridge API v3 capability inventory

Source of truth for this inventory: the OpenAPI 3.0.1 files supplied for CoreBridge v3 on 2026-09-21.

## Supplied API families

| Family | Source | Base URL | Operations | GET | POST | PUT | PATCH | DELETE |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core API | v3.json | https://corebridgev3.azure-api.net/core | 574 | 516 | 42 | 7 | 1 | 8 |
| Documents API | documents-v3.json | https://corebridgev3.azure-api.net/documents | 16 | 16 | 0 | 0 | 0 | 0 |
| Files API | files-api-v3.json | https://corebridgev3.azure-api.net/files | 36 | 6 | 21 | 3 | 0 | 6 |
| Reports API | reports-v3.json | https://corebridgev3.azure-api.net/reports | 11 | 11 | 0 | 0 | 0 | 0 |
| Search API | search-v3.json | https://corebridgev3.azure-api.net/search | 112 | 112 | 0 | 0 | 0 | 0 |
| Status API | status-v3.json | https://corebridgev3.azure-api.net/status | 14 | 14 | 0 | 0 | 0 | 0 |
| Configuration API | not supplied yet | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

Total supplied operations: 763.

## Authentication

CoreBridge Legacy v3 uses a generated token pair:
- Azure API Management subscription key sent as `Ocp-Apim-Subscription-Key`
- authentication token sent as `Authentication-Token: Bearer <token>`

CCS uses server-side headers only. Store the two values only as Base44 app secrets:
- `COREBRIDGE_SUBSCRIPTION_KEY`
- `COREBRIDGE_AUTHENTICATION_TOKEN`

Neither secret may be stored in an entity, browser state, log, URL, source control, or returned to the client.

## Phase 0 gateway policy

The direct CoreBridge gateway is deliberately constrained:
- signed sign-shop admin session required
- GET only
- fixed `corebridgev3.azure-api.net` base URLs
- fixed server-defined routes only
- no arbitrary URL/path/method forwarding
- no redirects while a subscription key is attached
- 15 second request timeout
- response-size limit for diagnostics
- audit records contain metadata only, never credentials or response bodies

Initial allowed routes:
- Core: `/api/account/validate`
- Core: `/api/account`
- Status: `/server/api`
- Status: `/server/search`
- Status: `/server/document`
- Status: `/server/reports`
- Status: `/server/integration`

## High-value Core API domains confirmed in the supplied specification

- account / identity / rights groups
- companies and contacts
- estimates
- orders, destinations, order items, components
- order statuses and substatuses
- boards and board data
- employees, employee roles, teams and timecards
- CRM tasks, notes and alerts
- assemblies and assembly variables
- materials and material categories
- labor and labor categories
- machines and machine categories
- purchase orders
- payments, credit memos and reconciliation
- taxes, payment methods, payment terms and surcharges
- reporting/document references and miscellaneous configuration objects

## Migration rule

CoreBridge remains authoritative until a CCS domain has:
1. read parity,
2. identity mapping,
3. relationship reconciliation,
4. user testing,
5. write-path safeguards,
6. rollback/recovery,
7. explicit cutover approval.

No direct CoreBridge DELETE operation is enabled during discovery or migration.
