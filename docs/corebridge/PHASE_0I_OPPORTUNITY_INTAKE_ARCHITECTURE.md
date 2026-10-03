# Phase 0I — Opportunity / Intake / Pre-Estimator Architecture

Status: COMPLETE — architecture only. No production business records changed.

## Purpose

Define how work enters CCS before Estimating without replacing the current WorkOrder-based Sales Pipeline in one cutover.

Target flow:

Customer / Prospect
→ Intake source event
→ Opportunity
→ Estimating Request
→ Estimate
→ Quote / Approval
→ WorkOrder / Job

The transition must preserve every currently working path while separating commercial pursuit data from operational job data.

## Verified current-state findings

### 1. Sales Pipeline is WorkOrder-backed

The current Sales Pipeline reads WorkOrder records. A modern open pipeline record is effectively:

- is_rider = false
- completed = false
- in_pipeline = true
- sales_status not in won/lost
- deleted != true

SalesOpportunityDialog is also a WorkOrder editor/history view. Its Sales history is recorded through CellHistory against entity_type = WorkOrder.

There is no first-class Opportunity, Lead, Intake, or EstimatingRequest entity in the current live entity set.

### 2. "New Client" / manual Sales intake immediately creates a WorkOrder

The Sales Pipeline "New Client" action opens the full WorkOrderForm. Saving calls createWorkOrderWithRecovery and creates a WorkOrder with:

- current_stage = sales
- sales_status = lead
- in_pipeline = true
- sales activity/stage timestamps

WorkOrderForm already captures much of the desired future intake packet: customer name, description, representative/contact, site/install address, survey information, permitting possibility, electrical flags, owner/tenant status, installation/removal, budget, origination, notes, files, salesperson, tasks/follow-up, and product hints.

WorkOrderForm also has an AI scan path for the existing sign-shop customer intake form. That is a useful capture capability and should be redirected into the future intake layer rather than discarded.

### 3. Estimate creation also creates/reuses a Sales Pipeline WorkOrder

NewAllInOneEstimate:

1. resolves/creates the shared Customer,
2. creates the AllInOneEstimate,
3. calls syncEstimateToPipeline.

syncEstimateToPipeline finds WorkOrders by estimate_id. If none exists, it creates a WorkOrder with current_stage = estimating and in_pipeline = true. Estimate lifecycle changes continue to update that WorkOrder.

The simpler NewEstimateDialog also creates an AllInOneEstimate and Customer. Subsequent EstimateDetail saves use syncEstimateEverywhere, which synchronizes the estimate to Customer and Sales Pipeline.

### 4. Approved Estimate conversion usually promotes the same WorkOrder

ConvertToWorkOrder first searches WorkOrder by estimate_id. If the Estimate already created a pipeline WorkOrder, conversion updates that same record rather than creating a second one. It marks the Sales outcome won, carries approved products/pricing into the WorkOrder, preserves richer existing notes, and links AllInOneEstimate.work_order_id.

This means one WorkOrder currently serves two meanings:

- pre-job commercial lead/opportunity representation, and
- post-approval operational job.

That behavior must be preserved during migration but should not remain the long-term domain model.

### 5. WorkOrder currently contains most Opportunity/Intake fields

Relevant current WorkOrder fields include:

- customer_id / client_name
- estimate_id
- sales_status / in_pipeline
- sales_rep / lead_source / origination
- estimate_amount
- date_initial_contact / date_estimate_sent
- follow_up_date / expected_close_date / close_date / lost_reason
- current_task_description / deadline / assignee
- contact_name / email / phone / representative / additional_contact
- install_location / billing address
- surveyor / site survey date/time
- permitting / jurisdiction / property owner / parcel / PUD
- electrical flags
- building-owner / tenant / marketing-company flags
- install / removal / service-repair / budget
- notes / work_notes / files
- Smartsheet and spreadsheet-import source identities and snapshots

These fields are evidence for the future upstream model. They must not be blindly deleted from WorkOrder during migration because active production screens and syncs use them.

### 6. Customer is already the canonical account, but contact/location are not yet first-class live entities

Customer is explicitly shared by Estimator and Workflow and is linked by customer_id.

The current live Customer schema still embeds primary/additional contact data and billing/location address fields. The live entity set inspected for this phase does not yet expose separate CustomerContact or CustomerLocation entities.

Phase 0I therefore treats CustomerContact and CustomerLocation as canonical target concepts from the completed CRM architecture, but any implementation must allow those IDs to be nullable until the first-class records are available and resolved. Do not fabricate contact/location IDs from free text.

CustomerInfo is legacy/disabled. Its RLS intentionally uses the disabled legacy role. It should not be revived as the new intake model.

### 7. Smartsheet Sales sync is WorkOrder-based and already has important safety controls

Sales Smartsheet synchronization links records by stable smartsheet_sheet_id and smartsheet_row_id and keeps sync snapshots for conflict detection.

Read-only production verification on 2026-10-03 confirmed the Sales Smartsheet profile is live with global sync enabled, observation mode off, mirror enabled, pull enabled, push enabled, create_base44_from_smartsheet enabled, and create_smartsheet_from_base44 enabled. The separate spreadsheet importer flag is off. This means the compatibility path is not theoretical: Smartsheet can currently create eligible WorkOrders and Base44 can create Sales rows in Smartsheet.

For inbound creation, missing meaningful customer rows are skipped. Existing linked records are updated with conflict/hold behavior. Base44-to-Smartsheet also continues to operate on WorkOrder.

This stable-ID/snapshot behavior must be preserved. Row position and customer-name guessing must never become Opportunity identity. Phase 0J must not redirect or dual-write this live mirror.

### 8. Sales spreadsheet import is operational WorkOrder import, not the historical migration architecture

importSalesPipeline uses ImportJob to control spreadsheet import execution and creates/updates WorkOrders. It has source IDs, canonical spreadsheet fingerprinting, conflict detection, recovery and duplicate-file protection.

ImportJob is therefore an operational import-run entity, not the future general historical/intake provenance model.

PendingImport is the old CoreBridge email/PDF proposal-to-WorkOrder workflow. It should remain retired/legacy and must not be repurposed for Opportunity intake.

## Target domain model

### Opportunity

Opportunity is the canonical commercial pursuit. It exists before an Estimate and is not an operational job.

Core identity/links:

- customer_id — nullable until customer identity is verified
- customer_display_name — captured source/display value; never identity by itself
- contact_id — nullable canonical CustomerContact link when available
- location_id — nullable canonical CustomerLocation/site link when available
- compatibility_work_order_id — transitional link to the existing WorkOrder-based pipeline
- primary_estimating_request_id — optional convenience link only
- source_primary_intake_id — first/primary inbound event
- historical/source identity fields when applicable

Lifecycle:

- stage: new, qualified, estimating, quoted, follow_up, on_hold, won, lost
- opened_at
- stage_changed_at
- last_activity_at
- closed_at
- lost_reason

Commercial/intake facts:

- title / job_description
- salesperson
- lead_source / origination
- budget_amount or budget_note
- desired_completion_date / desired_install_date
- priority
- survey_requirement
- permit_requirement: yes/no/maybe/na
- installation_requirement
- removal_requirement
- electrical_requirement/details
- property_relationship: owner/tenant/agent/unknown
- next_action / next_action_due / next_action_assignee
- notes
- current source metadata summary

Opportunity should reference canonical Customer/Contact/Location data, but point-in-time facts that are specifically about this pursuit remain on Opportunity.

### OpportunityIntake

OpportunityIntake represents an inbound source event or captured request. Multiple Intake records may resolve into one Opportunity.

Supported source_type values should include at least:

- manual
- existing_customer
- phone
- email
- website
- smartsheet
- repeat_customer
- walk_in
- historical
- integration

Provenance fields should include:

- opportunity_id
- source_type
- source_system
- source_external_id
- source_parent_id where needed
- source_received_at
- captured_at / captured_by
- source_fingerprint when a deterministic payload/file exists
- raw_source_reference or preserved raw payload reference
- source_metadata object
- resolution_status: captured, needs_review, linked, rejected
- resolution_notes

Captured-but-unverified values may include customer name, contact details, address/site, job description, requested dates, budget, requirement flags and freeform notes.

OpportunityIntake is provenance, not a second Customer database. Once a value is verified and promoted to canonical Customer/Contact/Location/Opportunity, the raw captured value remains as source history.

Attachments/photos should be referenced, not duplicated into separate copies merely because the record passes from Intake to Opportunity.

### EstimatingRequest

EstimatingRequest is the controlled handoff from Sales/Intake to Estimating. It is not the Estimate itself.

Core links:

- opportunity_id
- customer_id
- contact_id when resolved
- location_id when resolved
- estimate_id / primary_estimate_id once created
- compatibility_work_order_id during transition

Workflow fields:

- status: draft, ready, in_progress, completed, cancelled
- requested_at / requested_by
- assigned_estimator
- priority
- desired_completion_date / desired_install_date
- request_notes
- survey / permitting / install / removal / electrical requirement summary

Historical truth:

EstimatingRequest should store a handoff_snapshot containing the verified information presented to Estimating at the time of submission. Current Customer/Contact/Location data remains live, but the handoff snapshot must not silently change afterward.

This follows the project rule: freeze what must remain historically true; keep current operational data live.

## Ownership boundaries

Customer owns account identity and current account-level data.

CustomerContact owns the person and contact-level roles/authority once first-class contact records are implemented.

CustomerLocation owns reusable physical locations/sites once first-class location records are implemented.

Opportunity owns the commercial pursuit: source, salesperson, lifecycle, budget, desired dates, sales next action and job requirements before approval.

OpportunityIntake owns source provenance and raw/unverified captured facts.

EstimatingRequest owns the verified point-in-time handoff packet and estimating workflow status.

Estimate owns pricing, products/parts/BOM, quote lifecycle and estimate-specific customer-facing commercial history.

WorkOrder owns the operational job after approval/conversion, while retaining compatibility fields until old Sales Pipeline dependencies are retired.

## Compatibility architecture

### Rule 1 — No big-bang Sales Pipeline replacement

The current Sales Pipeline remains operational while the new model is introduced.

Existing WorkOrders keep all current fields and behavior. No migration phase may clear sales fields simply because an Opportunity link exists.

### Rule 2 — Add stable links before moving field authority

The future bridge should use stable IDs, for example:

- WorkOrder.opportunity_id
- AllInOneEstimate.opportunity_id
- AllInOneEstimate.estimating_request_id
- Opportunity.compatibility_work_order_id
- EstimatingRequest.compatibility_work_order_id

All are additive. No existing identifier is repurposed.

### Rule 3 — One field has one write owner at each migration stage

Avoid a permanent dual-master loop.

Initial compatibility authority:

- legacy/existing pipeline record: WorkOrder remains authoritative for Sales fields
- Smartsheet continues to sync WorkOrder exactly as it does now
- Opportunity, when linked during initial rollout, may be a shadow/read model until explicitly promoted

After an individual flow is cut over:

- Opportunity becomes authoritative for Opportunity-owned Sales fields
- a compatibility projector writes only the approved field subset to the linked WorkOrder
- Smartsheet continues seeing the WorkOrder projection until Smartsheet itself is migrated to Opportunity
- inbound Smartsheet changes must pass through one bridge path; they must not independently update both records

### Rule 4 — Existing WorkOrder client_name remains historical/operational text

Linking customer_id, contact_id, location_id or opportunity_id must never rewrite client_name merely to normalize identity.

### Rule 5 — Estimate pipeline sync must converge on the existing compatibility record

When an Estimate comes from an EstimatingRequest/Opportunity, syncEstimateToPipeline must eventually be taught to locate the linked compatibility WorkOrder by stable Opportunity/EstimatingRequest links before creating another WorkOrder.

The existing estimate_id recovery/convergence behavior must remain as a fallback.

### Rule 6 — Approval conversion becomes the semantic boundary to operational Job

Long-term target:

Opportunity / Estimate before approval is not itself a WorkOrder.

On approved conversion, create or promote the operational WorkOrder exactly once and link it back to Opportunity and Estimate.

During compatibility migration, an existing pre-created WorkOrder may still be promoted in place, because that is current behavior and prevents disruption. The compatibility flag/link tells the system that this record began as the legacy pipeline projection.

## Current-to-target field mapping

| Current WorkOrder field | Future owner | Compatibility behavior |
| --- | --- | --- |
| customer_id | Customer link on Opportunity/WorkOrder | preserve on WorkOrder; link Opportunity when verified |
| client_name | historical display text | never normalize destructively |
| contact_* / representative | CustomerContact + Opportunity snapshot | preserve free text until resolved |
| install_location | CustomerLocation + Opportunity site snapshot | preserve WorkOrder value |
| sales_status | Opportunity.stage | WorkOrder remains authority until cutover |
| lead_source / origination | Opportunity | map without collapsing distinct source concepts until translation rules are approved |
| sales_rep | Opportunity | project to WorkOrder during compatibility |
| estimate_amount | Opportunity derived/current quote reference | do not use as accounting truth |
| date_initial_contact | Opportunity opened/source timing | preserve original date |
| date_estimate_sent | Estimate/Opportunity quote timing | preserve existing historical value |
| follow_up_date / current task | Opportunity next action | keep WorkOrder bridge until Sales UI cutover |
| close_date / lost_reason | Opportunity outcome | preserve CellHistory during migration |
| budget_less_than | Opportunity | migrate semantics carefully; field name is legacy |
| survey/permitting/electrical/owner/install/removal | Opportunity + EstimatingRequest snapshot | copy into request snapshot at handoff |
| notes/work_notes/files | source-specific relationship | reference/preserve; do not duplicate blindly |
| smartsheet_* | compatibility integration link | stay on WorkOrder until Smartsheet migration |
| sales_import_* | operational importer identity | stay on WorkOrder; do not reuse as historical migration identity |
| estimate_id | Estimate compatibility link | preserve; later add opportunity_id/request_id |

## Intake source behavior

Manual / walk-in / phone:
Create OpportunityIntake first or atomically with Opportunity. Resolve Customer/Contact/Location with exact/approved evidence. Do not auto-merge by email, phone or fuzzy name.

Email / website / future integrations:
Preserve external message/submission identity and raw-source reference. Parsing may propose structured values but unverified values remain intake provenance until accepted.

Existing/repeat customer:
Start from canonical Customer and optionally Contact/Location. Create a new Opportunity; do not clone an old WorkOrder as the new business identity. Prior jobs may be referenced for context or used to start a new Estimate with current pricing.

Smartsheet:
Initially leave current WorkOrder mirror unchanged. Later create/link Opportunity by stable WorkOrder + Smartsheet row identity, never by row position. No Smartsheet delete may delete an Opportunity or Customer.

Historical opportunity:
Create only from authoritative historical source records. Preserve CoreBridge/source IDs and provenance. Do not fabricate modern BOM/Product data.

## Customer resolution rules

Opportunity intake follows the approved customer-resolution hierarchy:

1. approved source mapping
2. verified customer_id
3. strong Estimate/Invoice/Job relationship
4. exact company name
5. exact approved legacy alias
6. exact normalized comparable company name
7. name plus corroborating email/phone/address/document evidence
8. fuzzy similarity = review only

Email or phone alone is not sufficient to merge Customer accounts.

If evidence is insufficient, Opportunity may remain unresolved/needs_review with captured display values. Do not create duplicate Customer shells merely to satisfy a foreign key.

## Estimating handoff

The Sales user should be able to press a future "Request Estimate" action from Opportunity.

Before submission, the handoff validates what is known versus unresolved:

- Customer
- Contact
- site/location
- job description
- salesperson/source
- desired date
- budget
- survey need
- permit possibility
- install/removal
- electrical
- owner/tenant relationship
- attachments/photos
- notes
- priority

Missing information may be explicitly marked unknown/TBD where business rules allow it rather than forcing fabricated values.

On submission:

1. create or update one EstimatingRequest idempotently;
2. freeze its handoff_snapshot;
3. open/create the AllInOneEstimate using those verified values;
4. set stable opportunity_id / estimating_request_id links;
5. preserve current Estimate creation/recovery protections;
6. keep current Sales Pipeline visibility through the compatibility bridge.

No estimator data should need to be retyped when it already exists upstream.

## Migration waves

### Wave A — additive foundation

Add Opportunity, OpportunityIntake and EstimatingRequest schemas plus nullable stable link fields on WorkOrder and AllInOneEstimate. Add backend-safe persistence helpers and idempotency/recovery contracts. Do not backfill or change current UI authority.

### Wave B — bridge existing pipeline safely

Build a read-only/dry-run matcher from WorkOrder to Opportunity candidate identities. Strong/stable links may be auto-proposed; ambiguous records require review. No destructive Customer merge and no WorkOrder deletion.

### Wave C — new intake path

Introduce a focused Intake/Opportunity form using the useful fields already in WorkOrderForm, including the existing scan capability. New intake writes Opportunity/Intake first and creates the compatibility WorkOrder only through one bridge helper while the old Sales Pipeline still requires it.

### Wave D — Estimating Request handoff

Add Request Estimate action, frozen handoff snapshot and Estimate prefill/linking. Update estimate pipeline sync to converge on the linked compatibility WorkOrder instead of creating duplicates.

### Wave E — Sales Pipeline read migration

Teach Sales Pipeline to read Opportunity for migrated/new records while retaining a legacy WorkOrder view. Move history/filters/insights in controlled slices with parity tests.

### Wave F — Smartsheet authority migration

Only after Opportunity parity is proven, move Sales Smartsheet mapping from WorkOrder to Opportunity or a dedicated adapter. Retain stable row IDs, snapshots, conflict handling, queueing and no-delete behavior.

### Wave G — retire pre-job WorkOrder dependency

After all producers/consumers are migrated and parity is verified, stop creating pre-approval compatibility WorkOrders for new Opportunities. Existing WorkOrders remain historical/operational records.

## Explicit non-goals for Phase 0I

- no Opportunity entity creation yet
- no WorkOrder schema changes
- no Customer schema changes
- no production record backfill
- no Customer dedupe/merge
- no Smartsheet mapping changes
- no Estimate formula changes
- no WorkOrderForm replacement
- no deployment/publish
- no revival of CustomerInfo or PendingImport
- no repurposing of Order, ImportJob or LegacyMigrationMap

## Phase 0I acceptance result

Phase 0I is complete when this architecture is committed and the current live pathways have been verified read-only.

The critical migration principle is:

Opportunity becomes the commercial source of truth gradually.
WorkOrder remains the compatibility source/projection until each consumer is deliberately migrated.
Approval/conversion becomes the long-term boundary where an operational Job begins.

## Exact next phase — 0J

**Phase 0J — Opportunity / Intake / Estimating Request Additive Foundation**

Scope:

- inspect fresh HEAD/status and schemas again;
- define the minimal production-safe JSONC schemas for Opportunity, OpportunityIntake and EstimatingRequest;
- add only nullable stable link fields needed on WorkOrder and AllInOneEstimate;
- define RLS/permissions deliberately before write;
- implement backend/shared persistence helpers with creation receipts, convergence/idempotency and conflict-safe updates;
- add schema/persistence tests and relationship invariants;
- do NOT backfill live WorkOrders;
- do NOT switch Sales Pipeline reads/writes;
- do NOT change Smartsheet ownership;
- do NOT change Estimate formulas;
- run targeted tests + full build;
- verify schemas/live records read-only;
- checkpoint.

Phase 0J should end with the new foundation present but dormant: zero automatic migration and zero behavior change to the current Sales Pipeline until the bridge phase is separately verified.
