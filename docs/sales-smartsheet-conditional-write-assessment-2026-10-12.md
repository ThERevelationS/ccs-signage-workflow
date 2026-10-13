# Sales Pipeline — Smartsheet conditional-write assessment and 429 retry fence

**Date:** 2026-10-12 (America/New_York)  
**App:** CCS Signage Workflow, Sales Pipeline only  
**Status:** Code-level investigation and synthetic regression validation; no production Smartsheet write was performed.

## Smartsheet API evidence

Official Update Rows API reference: https://developers.smartsheet.com/api/smartsheet/openapi/rows/update-rows

The documented `PUT /sheets/{sheetId}/rows` operation accepts row IDs/cells and the documented access/partial-success/validation query parameters. The documented headers are Authorization, Content-Type, and integration source. The reference does **not** describe a supported `If-Match`, expected `modifiedAt`, or row-version compare-and-set precondition. Row and sheet `version` metadata are read/response attributes, not documented atomic write conditions. Therefore, **do not add invented conditional headers or assert that remote PUTs are atomic.** Recheck vendor capabilities only against current official documentation before changing that decision.

Smartsheet API best practices also recommend serializing writes to the same sheet to reduce collisions:
https://www.smartsheet.com/content-center/best-practices/tips-tricks/api-best-practices

## Contained Phase 6D change

Smartsheet may return definitive HTTP 429 before processing the requested mutation. The existing transport honors `Retry-After` and can retry this definitive outcome, but a delay creates an extended opportunity for an employee to edit the Sales WorkOrder or Smartsheet row after the prior prewrite verification.

Sales now provides a **strict `beforeRateLimitRetry`** callback to the existing no-timeout-retry transport. The callback runs **after the wait and before each 429 retry**. It:

1. Rechecks shared sync-run ownership.
2. Verifies a one-to-one match between exact outgoing permanent row IDs, WorkOrder IDs, and saved row/snapshot plans.
3. Rereads all affected local WorkOrders in bounded groups of 100, rejecting any changed revision or permanent link.
4. Rereads all matching remote rows and mapped columns in bounded groups of 100, rejecting identity anomalies or changes from the original prewrite snapshot.
5. Rechecks run ownership. If evidence is unavailable or differs, it prevents the entire retry and marks every affected WorkOrder as failed for this run.

The strict guard is separate from best-effort progress callbacks. Guard exceptions are propagated rather than swallowed. Existing Order callback behavior is unchanged. An ambiguous timeout is still never automatically replayed.

## Limits and remaining verification

This is **not** a Smartsheet compare-and-swap or cross-system transaction. Another editor could still change a remote row after the final read and before Smartsheet accepts the next PUT. Read-back and Base44 revision fencing remain necessary, but cannot eliminate that atomicity gap. A Base44 uniqueness constraint for permanent-row ownership is a separate problem.

Synthetic tests do not prove behavior against the live Smartsheet account. Authenticated browser, actual rate-limit/read-back, and sheet-permission acceptance checks remain outstanding; they must be performed explicitly under a safe test environment before any live production changes.

**Relevant test:** `scripts/validate-smartsheet-sales-rate-limit-prewrite.mjs`.
