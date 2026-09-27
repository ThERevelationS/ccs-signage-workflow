# Time Clock pay-period creation coordinator — operator runbook

**Status:** one-time production coordinator provisioning completed on 2026-09-27. Independent read-back returned exactly one clean idle company record (ID `6ab9aadd0d7161cf840af039`). This is a dated observation, not a substitute for a fresh complete read before publication or recovery. **Do not provision a second row.** Time entries, historical pay periods, audits, and payroll locks must remain untouched. No Time Clock code was published as part of this step.

## Preconditions and provisioning

The backend uses `TimeClockPayPeriodCreateGate` as one company-wide compare-and-set coordinator. It deliberately NEVER creates a gate row during an employee/admin request: parallel first-use requests could each bootstrap an independent lock. Access remains backend-only by entity RLS; no browser or admin UI may create, edit, or delete the row.

1. Assign **one** authorized operator and suspend other coordinator provisioning/migration activity. Before any write, inspect the current app's exact entity schema and query **all** coordinator rows (empty filter, not just `scope=company`). If the query is incomplete or errors, stop. Do not reuse this procedure blindly in a second environment.
2. If there are zero rows, and only while the operator owns the provisioning window, create exactly ONE coordinator record through an authorized backend/service-role path with the data below. This is an explicit production-control write; obtain production approval first. No code path should call create-on-demand.
3. Read **all** rows again. Require exactly one row with a persisted ID, `scope=company`, `status=idle`, empty `request_id`, `payload_hash`, and `claim_token`, and absent/null `started_at`. If that postwrite verification fails or the write acknowledgment is uncertain, do not retry the create. Re-read and investigate. If multiple rows exist, stop; never guess which to delete.
4. Before publishing, validate the deployed backend's actual updateMany semantics support atomic conditional update with `id`, `updated_date`, `scope`, and `status` and return an authoritative `updated` count. Run guarded two-session Base44 concurrency acceptance without creating real payroll periods. Confirm the single coordinator is still clean and all existing pay periods remain intact.

Approved initial payload (one row only):

```json
{
  "scope": "company",
  "status": "idle",
  "request_id": "",
  "payload_hash": "",
  "claim_token": "",
  "started_at": null
}
```

If a row already exists, **do not provision again**. Validate its complete state first. Missing, duplicate, malformed, or idle-with-stale-metadata coordinators block creation until investigated.

## Held-lock recovery — never assume a timeout means failure

When `status=creating`, preserve the row and all associated business records. Identify its exact `request_id`, `payload_hash`, and `claim_token`. Check both `TimeClockPayPeriod.last_request_id` and `TimeClockAudit` with action `pay_period_create` and the same request ID. Require no duplicate/ambiguous matches. Compare audit hash, label, dates, saved period ID, and outcome.

- **Saved period + matching pending audit:** an authorized retry of the EXACT original request and unchanged payload can finish the audit and release the gate. Do not submit a new request ID.
- **Saved period + confirmed/recovered audit with exactly matching period ID and details:** the backend can safely reclaim the completed lock for another request after a conditional CAS release.
- **No saved period + matching blocked audit:** the backend can conditionally reclaim the blocked lock.
- **No saved period + pending audit, mismatched/missing audit, missing or contradictory lock metadata, unknown write outcome, or duplicate records:** keep blocked. An asynchronous write may still arrive; automatic timeout-based unlock is unsafe. Escalate for evidence-based administrative recovery and preserve an audit of any manual intervention.
- **Idle with stale lock metadata:** block. It could be an interrupted release or a malformed provisioning record. Investigate before any backend-only repair.

Never manually set `status=idle` merely because a request is old. Never delete/recreate the gate to bypass an uncertain outcome. Never create/alter historic periods or audits to make a recovery test pass.

## Release checklist

Run synthetic recovery/concurrency tests, backend bundle, focused lint, management rendering checks, full CCS production build, clean diff/status review, and read-only live integrity queries. Initial provisioning was completed and verified on 2026-09-27; verify exactly one clean idle row again before release, and never bootstrap another. Next, perform guarded two-session acceptance on an authorized nonproduction Base44 environment (or an explicitly approved controlled operational window with a documented rollback and no real payroll test records). Obtain separate publication approval. Code changes/checkpoints alone do not establish live deployment.
