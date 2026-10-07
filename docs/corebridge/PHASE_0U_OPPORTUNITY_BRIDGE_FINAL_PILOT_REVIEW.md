# Phase 0U — Final Single-Record Pilot Review / Explicit Authorization Boundary

Status: REVIEW COMPLETE. NO PRODUCTION MIGRATION AUTHORIZED OR EXECUTED.

## Safety state

This phase is review-only.

Current source locks:

- `OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED = false`
- `OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.EXPLICIT_PILOT_AUTHORIZATION_REQUIRED = true`
- `OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.AUTHORIZED_PILOT_REVIEW_FINGERPRINT = ''`

A normal "Continue", simulation refresh, review-page visit, or `prepare_pilot` request is explicitly **not** production authorization.

The guarded executor now requires all of the following simultaneously:

1. the exact fresh first-batch WorkOrder;
2. a fresh plan;
3. clean/reconciled durable receipt state;
4. exact authenticated admin actor;
5. exact secondary confirmation for the current run and batch;
6. request review fingerprint equals the freshly recomputed pilot review fingerprint;
7. source-authorized review fingerprint equals that same exact fresh review fingerprint;
8. production apply kill switch enabled.

0U intentionally leaves #7 and #8 false.

## Fresh live review

Generated read-only from production data:

`2026-10-07T23:48:13.343Z`

Live population at review:

- WorkOrders: **3,062**
- Customers: **898**
- AllInOneEstimate: **22**
- Opportunities: **0**
- OpportunityBridgeOperationReceipt: **0**
- Sales candidates examined: **3,048**
- Extra-conservative eligible pilot cohort: **2**
- First batch size: **1**
- Unresolved bridge receipts: **0**

The eligible cohort may change as normal production Sales data changes. The first-batch selector remains deterministic and selects the lexicographically first qualifying WorkOrder id.

## Exact first pilot candidate

WorkOrder:

`6ab44487de80f1e43484b7cb`

Receipt key:

`workorder:6ab44487de80f1e43484b7cb:opportunity:v1`

Action:

`proposed_create`

Sales scope:

`current`

Evidence strength:

`strong_stable_anchor`

### Frozen source snapshot

```json
{
  "id": "6ab44487de80f1e43484b7cb",
  "opportunity_id": "",
  "sales_status": "lead",
  "in_pipeline": true,
  "current_task_description": "WIP - Permitting Follow-ups",
  "date_order_created": "2026-02-27",
  "updated_date": "2026-10-01T23:06:04.523000"
}
```

The compare-and-set bridge must stop if this snapshot changes before execution.

## Canonical Customer evidence

Resolved Customer:

- Customer id: `6a958582ba45a19e934401dd`
- Canonical company: **The Dancing Skillet**
- WorkOrder client_name: **The Dancing Skillet**
- WorkOrder customer_id: blank
- Resolution source: `approved_legacy_client_name`
- Approved legacy alias: **The Dancing Skillet**

This is an approved canonical alias resolution. It is not fuzzy/company-name-only identity inference.

## Stable Sales evidence

- Smartsheet sheet id: `8702703019812740`
- Smartsheet row id: `684216396353412`
- Sales status: `lead`
- Salesperson: `Aidin`
- Lead source: `Return Client`
- Current task: `WIP - Permitting Follow-ups`
- Current task due: `2026-10-08`
- Current task assignee: `Twyla Heinlein`
- Initial contact: `2025-09-29`
- Estimate sent: `2026-02-20`
- Order created: `2026-02-27`
- Estimate/invoice reference: `13918`
- Estimate amount: `4001.59`
- Project install date: `2026-10-21`
- Site survey date: `2021-09-17`

No existing Opportunity identity or durable bridge receipt exists for this WorkOrder.

## Exact proposed Opportunity

```json
{
  "creation_request_key": "workorder:6ab44487de80f1e43484b7cb:opportunity:v1",
  "customer_display_name": "The Dancing Skillet",
  "compatibility_work_order_id": "6ab44487de80f1e43484b7cb",
  "title": "2026-12-16",
  "job_description": "",
  "stage": "new",
  "salesperson": "Aidin",
  "lead_source": "Return Client",
  "origination": "",
  "permit_requirement": "unknown",
  "installation_requirement": "unknown",
  "removal_requirement": "unknown",
  "electrical_requirement": "unknown",
  "property_relationship": "unknown",
  "next_action": "WIP - Permitting Follow-ups",
  "next_action_due": "2026-10-08",
  "next_action_assignee": "Twyla Heinlein",
  "source_summary": {
    "bridge_source": "workorder",
    "work_order_id": "6ab44487de80f1e43484b7cb",
    "sales_scope": "current",
    "sales_status": "lead",
    "in_pipeline": true,
    "completed": false,
    "estimate_id": "",
    "work_order_customer_id": "",
    "resolved_customer_source": "approved_legacy_client_name",
    "smartsheet_sheet_id": "8702703019812740",
    "smartsheet_row_id": "684216396353412",
    "sales_import_source_id": "",
    "date_initial_contact": "2025-09-29",
    "date_estimate_sent": "2026-02-20",
    "date_order_created": "2026-02-27",
    "expected_close_date": "",
    "close_date": "",
    "follow_up_date": "",
    "lost_reason": "",
    "budget_less_than": null,
    "install_location": "",
    "contact_name": "",
    "contact_email": "",
    "contact_phone": "",
    "representative": ""
  },
  "customer_id": "6a958582ba45a19e934401dd"
}
```

No internal estimate cost/margin data is placed in the Opportunity proposal.

## Durable identity state

For operation key `workorder:6ab44487de80f1e43484b7cb:opportunity:v1`:

- matching durable receipts: **0**
- matching Opportunities: **0**
- current WorkOrder opportunity_id: blank
- total durable bridge ledger records: **0**
- receipt identity anomalies: **0**
- unresolved receipts: **0**

## Exact review fingerprint

The 0U review fingerprint binds:

- exact WorkOrder source snapshot;
- exact proposed Opportunity;
- canonical Customer evidence;
- durable receipt evidence;
- existing Opportunity identity evidence;
- clean ledger state.

Review fingerprint:

`bca66b326527a614f77e05590d14d4171bfb3233af1e9159a6a089bca5425969`

Any bound source/proposal/customer/receipt/Opportunity state change produces a different fingerprint and invalidates this review.

## Review-only secondary confirmation binding

This binding demonstrates the exact batch/actor contract but is **not executable authorization**.

- actor user id: `68dfcc5e57bbbc35387da97d`
- actor email: `brettheinlein1@gmail.com`
- actor role: `admin`
- run id: `0u-review-6ab44487de80f1e43484b7cb`
- plan generated: `2026-10-07T23:48:13.343Z`
- batch size: **1**
- batch fingerprint: `f6b84489387d3d2e0335d3ce5a468f536531d60b28809e2629070649d32e644d`
- confirmation fingerprint: `512c7f980e7ca961724a1398be00b867bd451e91cb8b5d9f4bc0dd7226f1e254`
- binding expiration: `2026-10-07T23:53:13.343Z`

The confirmation phrase is deliberately not exposed by ordinary `prepare_pilot`. A future `prepare_authorized_pilot` can expose a fresh phrase only when both the source-authorized review fingerprint and production kill switch are explicitly enabled.

Because confirmation bindings expire after five minutes, any future authorized execution must replan and generate a fresh binding.

## Explicit authorization boundary

The exact reviewed fingerprint is **not currently source-authorized**.

Current:

```text
AUTHORIZED_PILOT_REVIEW_FINGERPRINT = ""
APPLY_ENABLED = false
```

Therefore:

- this document does not authorize execution;
- the user's current "Continue" did not authorize execution;
- no production receipt may be claimed;
- no Opportunity may be created;
- no WorkOrder opportunity_id may be written.

A later production pilot requires an explicit user instruction authorizing the exact reviewed WorkOrder/fingerprint. Before executing, the system must re-read production state. If the fresh review fingerprint differs, the prior approval is stale and execution must stop for another review.

## 0U source safeguards

Added:

- deterministic exact pilot review manifest + SHA-256 fingerprint;
- separate requested-review and source-authorized-review gates;
- source authorization is blank by default;
- ordinary preflight no longer exposes the typed confirmation phrase;
- authorized phrase preparation is separately gated behind both exact source authorization and `APPLY_ENABLED=true`;
- Admin review UI explicitly states that reviewing/refreshing is not production authorization.

## Result

Phase 0U decision:

**REVIEWED / NOT AUTHORIZED / NO_GO**

No production bridge records were created or changed in this phase.
