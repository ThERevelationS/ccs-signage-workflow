# Permitting Intelligence — Phased Roadmap

This roadmap records the current implementation sequence for CCS Signage Workflow — Permitting Intelligence. Work should continue in one verified small/medium chunk at a time. Do not publish without explicit approval.

## Phase 1 — Locality foundation
Build the complete Ohio/Kentucky locality inventory and stable canonical locality identities needed by permitting.

## Phase 2 — Government offices and authority
Model distinct permitting, zoning, building, engineering/right-of-way, electrical, planning, and related government offices with verified authority and stable locality-office relationships.

## Phase 3 — Address resolution
Resolve project/job addresses to the correct locality, incorporated/unincorporated context, and applicable permitting authorities without guessing.

## Phase 4 — Research/import foundation
Establish safe research/import structures, provenance, merge behavior, staff ownership, history, and protection against source refreshes overwriting reviewed data.

## Phase 5 — Official-source collection and verified archives
Collect current official permitting sources, forms, online application links, ordinances, fee schedules, checklists, instructions, and related documents. Preserve exact source URLs, file archives, hashes, byte counts, timestamps, extracted text, and evidence boundaries. Never invent missing documents or promote historical material to current policy without evidence.

### Phase 5 decimal milestones — endpoint 5.9

Use numerically increasing decimals with one digit after the point. Never extend a phase to .10. If finer detail is needed, use explicit task counts under the milestone. Phase 5 collection completion concerns the reusable pipeline; statewide coverage remains Phase 10. Historical numbering in dated receipts is superseded by this table.

| Decimal | Milestone | Status |
|---|---|---|
| 5.1 | Shared discovery, sign ranking and PDF routing | Implemented/tested |
| 5.2 | Durable frontier and atomic continuation | Implemented/tested |
| 5.3 | Verified byte archives and catalog | Live pilot verified |
| 5.4 | Deterministic PDF text | Tested; pilot evidence retained |
| 5.5 | Capped-index recovery | Live verified |
| 5.6 | Failed-page recovery | Live verified |
| 5.7 | Selected depth/sign-gap recovery | Live verified; other gaps retained |
| 5.8 | Ohio/Kentucky pipeline acceptance | Discovery passed; archive/text reconciliation remains |
| 5.9 | Final collection review and handoff | Outstanding |

Phase 6 development may proceed on retained evidence while 5.8–5.9 remain explicitly open; starting Phase 6 does not certify Phase 5 complete.

## Phase 6 — Exact-citation AI extraction
Extract requirements, forms, fees, submission steps, responsible offices, applicability conditions, and conflicts from archived official sources with exact citations and source-version awareness.

### Phase 6 decimal milestones — endpoint 6.9

| Decimal | Milestone | Status |
|---|---|---|
| 6.1 | Audit and enforce source-purpose/citation eligibility | Active |
| 6.2 | Retained text and source-version readiness | Pending |
| 6.3 | Structured candidate schema and explicit applicability | Pending |
| 6.4 | Literal citations, numeric units and page validation | Pending |
| 6.5 | Idempotent extraction, continuation and credit accounting | Pending |
| 6.6 | Conflicts, missing evidence and historical source handling | Pending |
| 6.7 | Ohio/Kentucky supervised extraction acceptance | Pending |
| 6.8 | Review-ready candidate presentation and handoff | Pending |
| 6.9 | Final extraction acceptance before Phase 7 | Pending |

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
