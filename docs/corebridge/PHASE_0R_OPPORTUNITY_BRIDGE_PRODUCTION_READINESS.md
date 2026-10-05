# Phase 0R — Opportunity Bridge Production Apply Readiness Gate / Final Preflight

Status: VERIFIED READ-ONLY PRE-FLIGHT. PRODUCTION APPLY REMAINS HARD-DISABLED.

## Purpose

Phase 0R defines the exact production-readiness contract for the WorkOrder → Opportunity compatibility bridge without enabling or executing any production bridge write.

The output is deliberately a go/no-go gate, not an apply function.

## Production policy

Source of truth:

`base44/shared/opportunityBridgeProductionReadiness.mjs`

Policy version: `0R-v1`

- production apply enabled: **false**
- first pilot batch size: **1**
- later maximum batch size: **5**
- plan freshness ceiling: **5 minutes**
- stop on first non-success: **true**
- fresh re-plan required before every batch: **true**
- admin role required: **true**
- secondary confirmation required before any future production apply: **true**
- retry policy: **replan_and_reconcile_before_retry**
- rollback policy: **forward_correction_only**

No destructive Opportunity deletion or WorkOrder rollback is part of the migration plan.

## Why the first pilot is one record

The live safe cohort is larger, but the pilot applies stricter criteria than ordinary bridge eligibility:

- action must be `proposed_create`;
- Sales scope must be current;
- receipt state must be clear;
- evidence strength must be `strong_stable_anchor`;
- canonical Customer must already be resolved;
- no historical outcome reconciliation may be involved.

Fresh production data currently contains exactly **one** row satisfying all of those pilot constraints.

The criteria were not weakened merely to produce a larger batch.

## Live production preflight

Fresh read-only production verification found:

- non-rider, non-deleted WorkOrders examined: **3,061**
- Customers: **898**
- AllInOneEstimates: **21**
- Opportunities: **0**
- true Sales candidates: **3,047**
- proposed creates: **430**
- proposed recover-link: **0**
- already linked: **0**
- held: **2,617**
- excluded Smartsheet/import-shell rows: **14**
- deterministic historical Won rows inside the safe cohort: **272**
- receipt identity anomalies: **0**
- unexpected/conflicting Opportunity links: **0**

The current safe cohort remains **430**.

## Exact first pilot candidate

Planning only — no write occurred.

- WorkOrder: `6ab44487de80f1e43484b7cb`
- immutable receipt key: `workorder:6ab44487de80f1e43484b7cb:opportunity:v1`
- canonical Customer: `6a958582ba45a19e934401dd`
- Customer resolution evidence: approved `legacy_client_names` mapping
- Smartsheet identity: `8702703019812740:684216396353412`
- Estimate id: blank
- evidence strength: `strong_stable_anchor`
- historical reconciliation: none
- current receipt state: clear

This is the only currently available row meeting the extra-conservative pilot contract.

## Technical go/no-go checks

The readiness gate evaluates:

1. fresh plan within five minutes;
2. zero duplicate/split/incomplete/invalid bridge receipt identities;
3. zero unexpected/conflicting Opportunity links;
4. held rows excluded from apply eligibility;
5. historical reconciliation rule unchanged;
6. required first pilot candidate available;
7. durable receipt schema activated;
8. secondary confirmation configured;
9. production apply explicitly enabled in source.

The first six are technical preflight checks.

The final three are rollout gates.

At the end of 0R:

- **technical readiness: READY**
- **rollout readiness: LOCKED**
- **overall decision: NO_GO**

That NO_GO state is intentional.

## Historical reconciliation invariant

The machine-check verifies that:

- Completed Sale + valid Order Created date => deterministic proposed Won;
- Completed Sale without a valid Order Created date remains review-only;
- Lost without authoritative loss evidence remains review-only.

The 2,617 held historical rows remain excluded.

## Proposed durable operation receipt

A proposed schema now exists only at:

`docs/corebridge/proposed/OpportunityBridgeOperationReceipt.jsonc`

It is **not** in `base44/entities` and therefore is not activated as a production entity in 0R.

The proposed ledger follows the existing CCS durable-operation pattern used by Fleet but remains a separate Opportunity migration system.

It records:

- deterministic operation key;
- rollout run id;
- WorkOrder id;
- Opportunity id;
- Opportunity creation receipt key;
- operation status;
- exact pre-apply WorkOrder source snapshot;
- proposal fingerprint;
- compact proposal summary;
- attempt count;
- actor identity;
- non-secret secondary-confirmation fingerprint/reference;
- started / attempted / applied / held / failed timestamps;
- result code and result summary;
- append-preserving attempt history.

It explicitly does not store passwords, confirmation secrets, card data, or payment authentication material.

## Receipt lifecycle

Proposed statuses:

- planned
- started
- opportunity_ready
- linked
- already_linked
- held
- failed
- cancelled

A future backend must reconcile existing receipt state before any create or link attempt.

Uncertain outcomes are recovered by re-read; they are never handled by blind duplicate writes.

## Batch execution contract

### Pilot

Exactly one record.

### After a verified pilot

No automatic escalation.

A later authorized phase may allow batches up to five records only after the pilot is independently verified.

### Stop condition

Stop immediately on the first row that does not return a verified `linked` or `already_linked` result.

Do not continue the batch after:

- stale source;
- duplicate receipt;
- mismatched existing Opportunity;
- uncertain create outcome;
- uncertain link outcome;
- compare-and-set conflict;
- unexpected existing relationship;
- audit receipt conflict.

### Resume

Never resume from an in-memory offset.

For every restart:

1. read the durable receipt ledger;
2. freshly re-plan production;
3. reconcile Opportunities by both immutable identities;
4. re-read the WorkOrder;
5. continue only rows whose current state is safe.

## Secondary confirmation requirement

Future production apply must require both:

1. authenticated Base44 admin role; and
2. a separate explicit confirmation bound to the exact rollout run / batch.

A request parameter such as `apply:true` is never sufficient.

The server must establish the confirmation independently and must not store the confirmation secret itself.

## Rollback / correction

Rollback is **forward corrective only**.

Never delete a correctly created Opportunity merely to reproduce a pre-migration state.

If a bridge is later found incorrect:

- preserve the Opportunity and durable operation receipt;
- preserve original WorkOrder source facts;
- record the corrective action;
- repair the canonical relationship through a separately authorized, auditable operation.

## UI / simulation integration

The existing simulation endpoint now includes the readiness object and server generation timestamp.

The Admin Opportunity Bridge review displays:

- overall GO / NO_GO;
- technical readiness;
- rollout readiness;
- each readiness check;
- the planning-only first pilot candidate.

There is still no Apply button.

## Explicitly unchanged

- no Opportunity records created;
- no WorkOrder opportunity_id written;
- no active OpportunityBridgeOperationReceipt entity;
- no Customer changes;
- no Estimate changes;
- no Smartsheet changes;
- no historical WorkOrder source facts rewritten;
- no production apply endpoint;
- no publish/deploy.

## Exact next phase — 0S

**Phase 0S — Activate Durable Bridge Receipt Foundation + Secondary Confirmation Contract**

0S should still perform **no WorkOrder→Opportunity bridge migration**.

It should:

1. activate the reviewed `OpportunityBridgeOperationReceipt` schema as a backend-only entity;
2. verify zero records are auto-created by schema activation;
3. implement retry-safe receipt persistence helpers;
4. implement a server-side secondary-confirmation contract bound to one run/batch;
5. keep the production apply executor hard-disabled;
6. extend the simulation/readiness UI to prove both rollout gates are configured;
7. run a nonproduction receipt/confirmation harness;
8. checkpoint with overall production apply still NO_GO until an explicitly authorized later phase enables execution.

Only after 0S is fully verified should a later phase consider enabling the single-record pilot.
