## Authoritative progress format — updated October 7, 2026

Use one hierarchy: Phase → Milestone → Task. No decimal subphase identifiers and no numbered levels beneath tasks. Smaller implementation chunks have descriptive names only. Old labels in dated receipts and filenames are historical references, not the current reporting format. This change does not alter scope, evidence, completion status or denominators.

Current: Phase 10 — Ohio/Kentucky coverage; Milestone 1 of 3 — Identity and office reconciliation; 2 of 4 tasks complete. Current task: Task 2, partial; current work: separate electrical permit issuer and inspection provider completeness acceptance.

| Task | Description | Status |
|---|---|---|
| 1 | Measurement audit | Complete |
| 2 | Exhaustive geographic identity and office reconciliation | Partial |
| 3 | Dashboard lifecycle/UI measurement and automated interaction acceptance | Complete |
| 4 | Full read-only live acceptance | Pending |

Phase 10 Milestone 2 of 3: statewide expansion. Milestone 3 of 3: completeness acceptance. Ohio precedes Kentucky. Completing individual work chunks must not imply statewide completion or advance the fixed task count.

## State sequencing — updated October 6, 2026

Prioritize Ohio for new scans, geographic inventory reconciliation and manual acceptance; follow with Kentucky. The scheduled research dispatcher releases eligible Ohio rows first, then Kentucky if capacity remains. This is priority, not cancellation of existing Kentucky work. Known-page/archive/text continuations currently preserve existing safe behavior across both states. Automated cost limits remain intact; manual retrieval has no total record cap. Do not claim statewide Ohio completion based on queue exhaustion; compare against the independent official inventory and authority/office/document gaps.

# Permitting Intelligence — Phased Roadmap

This roadmap records the current implementation sequence for CCS Signage Workflow — Permitting Intelligence. Work should continue in one verified small/medium chunk at a time. Do not publish without explicit approval.

## Phase 1 — Locality foundation
Build the complete Ohio/Kentucky locality inventory and stable canonical locality identities needed by permitting.

## Phase 2 — Government offices and authority

Electrical permit issuance and electrical inspection responsibility require separate coverage checks for each locality/service area. Collect provider identity, delegation, official scope, commercial signage applicability, applications/portals, fees, contractor requirements, inspection stages and scheduling/prerequisites. Preserve downloadable forms and online links. Shared offices may cover multiple roles only with evidence for each. Unknown applicability and missing offices remain gaps; a generic electrical role/contact is insufficient. The reusable office checklist is base44/shared/permittingOfficeResearchRequirements.json. It now drives the live jurisdiction research prompt, saved unverified role findings and selector office-research display. Offline Ohio inventory also consumes it. Recorded coverage dashboard counts and office authority approval remain separate; field-level statewide completeness is not established.

Model distinct permitting, zoning, building, engineering/right-of-way, electrical, planning, and related government offices with verified authority and stable locality-office relationships.

## Phase 3 — Address resolution
Resolve project/job addresses to the correct locality, incorporated/unincorporated context, and applicable permitting authorities without guessing.

## Phase 4 — Research/import foundation
Establish safe research/import structures, provenance, merge behavior, staff ownership, history, and protection against source refreshes overwriting reviewed data.

## Phase 5 — Official-source collection and verified archives
Collect current official permitting sources, forms, online application links, ordinances, fee schedules, checklists, instructions, and related documents. Preserve exact source URLs, file archives, hashes, byte counts, timestamps, extracted text, and evidence boundaries. Never invent missing documents or promote historical material to current policy without evidence.

### Phase 5 — 9 milestones

Report Phase 5 as Milestone N of 9. Tasks are the only level beneath a milestone; work chunks have descriptive names without numbers. Collection completion concerns the reusable pipeline; statewide coverage remains Phase 10. Historical decimal labels are superseded by this table.

| Milestone | Description | Status |
|---|---|---|
| 1 of 9 | Shared discovery, sign ranking and PDF routing | Implemented/tested |
| 2 of 9 | Durable frontier and atomic continuation | Implemented/tested |
| 3 of 9 | Verified byte archives and catalog | Live pilot verified |
| 4 of 9 | Deterministic PDF text | Tested; pilot evidence retained |
| 5 of 9 | Capped-index recovery | Live verified |
| 6 of 9 | Failed-page recovery | Live verified |
| 7 of 9 | Selected depth/sign-gap recovery | Live verified; other gaps retained |
| 8 of 9 | Ohio/Kentucky pipeline acceptance | Discovery passed; archive/text reconciliation remains |
| 9 of 9 | Final collection review and handoff | Outstanding |

Phase 6 development may proceed on retained evidence while Phase 5 Milestones 8 and 9 remain explicitly open; starting Phase 6 does not certify Phase 5 complete.

## Phase 6 — Exact-citation AI extraction
Extract requirements, forms, fees, submission steps, responsible offices, applicability conditions, and conflicts from archived official sources with exact citations and source-version awareness.

### Phase 6 — 9 milestones

| Milestone | Description | Status |
|---|---|---|
| 1 of 9 | Audit and enforce source-purpose/citation eligibility | Category validation tested; broader acceptance at Phase 6 Milestone 9 of 9 |
| 2 of 9 | Retained text and source-version readiness | Tested; 16 live snapshots checked, 2 source exceptions retained |
| 3 of 9 | Structured candidate schema and explicit applicability | Implemented and tested |
| 4 of 9 | Literal citations, numeric units and page validation | Implemented and tested |
| 5 of 9 | Idempotent extraction, continuation and credit accounting | Tested; live OH/KY replay verified |
| 6 of 9 | Conflicts, missing evidence and historical source handling | Safeguards tested; explicit resolution at Phase 6 Milestone 8 of 9 |
| 7 of 9 | Ohio/Kentucky supervised extraction acceptance | Selected-page pilots passed; 3 candidates staged, 4 rejected; none approved |
| 8 of 9 | Review-ready candidate presentation and handoff | Complete: live OH/KY handoff and isolated conflict component interaction checks; browser keyboard check carried to Phase 6 Milestone 9 of 9 |
| 9 of 9 | Final extraction acceptance before Phase 7 | Technical extraction acceptance passed; conflict browser QA carried explicitly to Phase 7 Milestone 3 of 3, not marked passed |

## Phase 7 — Staff-approved regulations
Provide staff review/approval workflows for extracted requirements, conflicts, applicability, superseded material, exceptions, and local knowledge. Preserve review history and source lineage.

## Phase 8 — Source-aware permitting search
Make AI/locality search answer from approved, current, citation-backed data while exposing uncertainty, source dates, conflicts, missing evidence, and staff-review state.

## Phase 9 — Expandable locality experience
Upgrade Localities into an expandable, information-dense but simple interface showing offices, sign rules, forms, fees, source documents, online portals, applicability, review state, and actionable permitting information.

## Phase 10 — Statewide completeness
Scale the collection/review model across all required Ohio and Kentucky localities, zoning authorities, cities, counties, townships, and related departments while preserving completeness tracking and unresolved-source gaps.

## Phase 11 — Low-credit source monitoring
Monitor official locality sources for meaningful changes using a restrained, low-integration-credit design. Detect changed links/files/pages by metadata/hash first, escalate only meaningful differences, and route changes through review instead of silently replacing approved requirements.

## Phase 12 — AI permitting workflow designer
Build an AI-assisted workflow designer that uses destination/locality evidence to propose the permitting steps, required offices, forms, documents, dependencies, and unresolved questions for a project. Staff remains able to review and override generated workflows.

## Phase 13 — Tax-Exempt Status & Documentation
Add tax-exempt handling as a first-class workflow state rather than a simple checkbox.

Required foundation:
- Explicit status such as unknown / taxable / tax-exempt / pending verification / expired / rejected or not applicable.
- Exemption type/category and applicable state/jurisdiction/scope.
- Certificate or exemption identifier when applicable.
- Effective date and expiration date when applicable.
- Certificate/document upload or linked evidence with preserved history.
- Verification status, verified-by, verified-at, verification source/method, and staff notes.
- Customer-level default with a versioned snapshot on each Work Order so later customer edits do not silently rewrite historical jobs.
- Controlled Work Order override with reason, actor, timestamp, and audit history.
- Clear inheritance rules between Customer → Work Order → permitting/fee workflow.
- Visible badges/warnings for unknown, pending, expired, rejected, or overridden status.
- Expiration/re-verification reminders without excessive background-credit use.
- Search/filter/reporting for exempt, expiring, missing-certificate, pending-review, and overridden records.
- Role/permission controls for who can verify, override, replace, or invalidate exemption evidence.
- Safe migration for existing customers/jobs; never assume an existing record is exempt because tax was not previously charged.
- Import/sync compatibility so external systems cannot silently overwrite a verified exemption state.
- Separate treatment of sales-tax exemption from government permit fees, pass-through fees, vendor charges, or other charges whose taxability may follow different rules.
- Do not infer legal tax treatment solely from an exemption status; preserve jurisdiction/evidence and require staff/accounting review where applicability is uncertain.
- Keep exemption documents/history attached to the correct customer/job even if customer names, billing contacts, or locality data later change.

Permitting integration:
- Surface tax-exempt state where permit/fee responsibility is reviewed.
- Allow workflow rules to distinguish government permit fees from taxable company-provided goods/services without treating all permit-related costs as tax-exempt.
- Show missing/expired exemption evidence before downstream estimating/invoicing handoff where appropriate.
- Preserve source and staff decision history for disputes/audits.

Acceptance criteria:
- Historical jobs retain the exemption snapshot that was valid when handled.
- Expired or replaced certificates do not silently alter completed jobs.
- Staff can see why a job is treated as exempt/non-exempt and who verified it.
- No automated workflow can convert unknown/pending evidence into confirmed exemption without an authorized decision.

## Phase 14 — Safe Work Order / PermitLineItem integration
Connect approved locality/workflow intelligence into live Work Orders and PermitLineItems with stable identifiers, version-safe updates, explicit staff control, history, concurrency protection, and safe repair of legacy links.

## Phase 15 — Acceptance and rollout
Run authenticated browser acceptance, permissions/RLS review, concurrency tests, migration checks, source/citation checks, mobile/desktop usability validation, production-data safety review, and controlled rollout. Publishing remains explicit.

## Milestones for the remaining major phases

These define each phase endpoint in advance. Phase 5 and Phase 6 use their detailed tables above. Status for other phases must be established from evidence, not presumed complete.

| Phase | First milestone | Second milestone | Final milestone |
|---|---|---|---|
| 1 | Milestone 1 of 3: Locality inventory | Milestone 2 of 3: Canonical identities/dedupe | Milestone 3 of 3: Inventory acceptance |
| 2 | Milestone 1 of 3: Office inventory | Milestone 2 of 3: Authority relationships | Milestone 3 of 3: Authority acceptance |
| 3 | Milestone 1 of 3: Address matching | Milestone 2 of 3: Boundary/authority ambiguity | Milestone 3 of 3: Resolution acceptance |
| 4 | Milestone 1 of 3: Provenance/import model | Milestone 2 of 3: Merge/history safeguards | Milestone 3 of 3: Import acceptance |
| 7 | Milestone 1 of 3: Review/conflict model | Milestone 2 of 3: Approval/history controls | Milestone 3 of 3: Review acceptance |
| 8 | Milestone 1 of 3: Evidence retrieval | Milestone 2 of 3: Cited answers/uncertainty | Milestone 3 of 3: Search acceptance |
| 9 | Milestone 1 of 3: Expandable locality interface | Milestone 2 of 3: Forms/rules/office integration | Milestone 3 of 3: Desktop/mobile acceptance |
| 10 | Milestone 1 of 3: Coverage inventory/gaps | Milestone 2 of 3: OH/KY collection expansion | Milestone 3 of 3: Statewide completeness review |
| 11 | Milestone 1 of 3: Hash/metadata monitoring | Milestone 2 of 3: Change review/credit controls | Milestone 3 of 3: Monitoring acceptance |
| 12 | Milestone 1 of 3: Evidence-based workflow model | Milestone 2 of 3: AI proposals/staff overrides | Milestone 3 of 3: Workflow acceptance |
| 13 | Milestone 1 of 3: Exemption evidence/status | Milestone 2 of 3: Job snapshots/expiry/sync | Milestone 3 of 3: Tax-exempt acceptance |
| 14 | Milestone 1 of 3: Stable job/permit links | Milestone 2 of 3: Versioned workflow handoff | Milestone 3 of 3: Integration acceptance |
| 15 | Milestone 1 of 3: Permissions/concurrency checks | Milestone 2 of 3: Browser/mobile/migration checks | Milestone 3 of 3: Explicit rollout acceptance |

Report Phase N → Milestone M of the fixed total → Task T with its status. Do not use decimal phase identifiers or number work chunks beneath tasks. A completed work chunk does not advance a milestone or change its fixed task count.
