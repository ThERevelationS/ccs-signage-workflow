# Order Form: read-only Smartsheet rowIds acceptance preflight (2026-10-10)

Scope: **Order Form only** in CCS Signage Workflow (Base44 app `68dfcc5e57bbbc35387da97c`).
Previous Order Form checkpoint: `6acaae9031522e81facf2b03` / Git `ac66f681b95d477e2111c6f6e88000697eab9bee`.

## Read-only observations

- Inspected live Base44 `GlobalSettings` for `smartsheetSyncConfig` and `smartsheetOrderPullWriteEvidence` through entity read operations. One sync-config record was returned; **no independent unresolved Order-pull evidence record was returned**.
- Order Request sheet configured by permanent sheet ID `4963691473987460`; ten Order bindings were populated and were decimal numeric strings. The requestor-name and requestor-email bindings point to the same column, consistent with the established Order contact translation; no mapping was changed.
- Saved Order config showed `pull_enabled: true`, `push_enabled: false`, `create_base44_from_smartsheet: false`, and `create_smartsheet_from_base44: false`. These settings were **not changed**. Explicit Save & Sync behavior must be traced separately because the backend has Order-specific paths independent of generic `push_enabled`.
- Sampled two consecutive read-only pages of 500 Orders linked to the configured sheet (1,000 examined; not a comprehensive count). Each page had no missing/nondecimal permanent row IDs, no duplicates **within that page**, and no pending-local-sync markers. Aggregate sample: 780 not soft-deleted and 220 soft-deleted. **Cross-page duplicates and unsampled records were not assessed.**
- The Base44 sandbox process did **not** expose `SMARTSHEET_API_TOKEN`, and no direct authenticated Smartsheet request was performed. This is not evidence that the deployed backend lacks its secret.
- Official API/SDK documentation describes comma-separated `rowIds` and `columnIds` filters for GET Sheet; existing code uses `URLSearchParams`, verifies the permanent sheet ID, and rejects incomplete/unexpected row responses. Documentation is not a substitute for a live authenticated provider response.

## Verified local checks

- `node scripts/validate-order-unresolved-batch-review.mjs` — PASS.
- `node scripts/validate-order-unresolved-row-review.mjs` — PASS.
- `node scripts/validate-order-batch-review-translations.mjs` — PASS.
- Targeted `esbuild` bundle of `smartsheetSyncAction/entry.ts` with platform imports excluded — PASS.
- No Order Form source changes or production data writes made during this audit.

## Live API acceptance limit

The unresolved-batch review endpoint needs **real retained unresolved evidence** and an authenticated admin session; with no evidence record, it must refuse to claim a comparison. Never create synthetic production evidence to force a test. Without a read-only Smartsheet credential/capability, **live `rowIds` response completeness and deployed-endpoint behavior remain unverified**.

## Safe next step

Inspect the actual Order Form Save & Sync dispatch and its Order-specific feature gates against the saved production config in **read-only mode**. Determine precisely which actions are permitted despite generic `push_enabled: false`, with no settings changes and no production writes. Separately, when a user explicitly authorizes deployment and has a real unresolved batch, perform an authenticated admin-only read-only endpoint acceptance; never clear or invent evidence.

## Preservation

Concurrent unrelated CCS commits were left untouched. No publish/deploy command was issued; no real Orders, Smartsheet rows, sync settings, or unresolved evidence were mutated.
