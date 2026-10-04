# Administrative source publisher and scope review

Phase 4.1 completed 2026-10-04 in CCS Signage Workflow (68dfcc5e57bbbc35387da97c). This follows Phase 3.3 retained-page rule extraction under the user's current document-first roadmap. Source Git at release validation: c199ad26a6635593d9984ed84ed4cab653625815. See permitting-source-authority-review-live-verification-2026-10-04.json for the actual production evidence checks.

## Evidence purpose

PermittingRule.rule_kind distinguishes regulatory_rule from administrative_instruction. Existing rows without this optional field retain their regulatory behavior; no bulk migration or historical rule rebuild occurred.

Regulatory approval requires reviewed current_adopted evidence and sets is_operational=true. Administrative instruction approval requires a structured, current office/scope review and sets is_workflow_instruction=true while is_operational remains false. The instruction flag is a reviewed-evidence marker; it does not resolve address authority, add steps to real work orders or activate the legacy workflow reader.

Application forms support submittal_requirement, fee_timing and procedure; checklists support submittal_requirement/procedure; fee schedules support fee_timing/procedure; administrative guidance supports all three administrative categories. These source classes cannot support regulatory permit applicability, exemptions, sign dimensions, illumination or electronic-sign rules. Administrative structured numeric units are limited to explicit dollars and day units. Literal quote/value/unit validation remains required; extraction confidence never establishes authority. The extraction prompt now states the source's purpose.

## Structured source review

permittingSourceAuthorityReview is admin-only and accesses service role only after authentication. Its source-office-scope-v1 review binds:
- canonical JurisdictionProfile id, name, state and type;
- source id, jurisdiction, official URL, archive URL, SHA-256, byte count and authority classification;
- literal publisher and covered-area quotes with physical PDF pages and verified text hashes;
- staff current-version confirmation, official evidence URL/reference and review notes;
- reviewer identity/time and stable review request id;
- optional unique, staff-verified publisher office from the existing GlobalSettings permitOfficeCatalog setting_value.items catalog.

The review does not change source class or archive/text fields. Draft, proposed, historical and superseded versions cannot be promoted through this route. Adopted-code review remains separate. County scope cannot use a county name as blanket authority: use explicitly quoted unincorporated territory or listed areas. A named city/village/township scope must match its canonical profile. Each named area must appear literally in its scope quote.

An optional canonical publisher link establishes publisher identity only. It explicitly stores locality_authority_established=false and destination_authority_resolved=false. Shared office identity, locality-to-office regulatory scope and document publication are different relationships. Existing PermitLocality records were preserved; copied county/inspection offices were not assumed to establish city authority.

## API actions and recovery

- preview: read-only verification preview with expected_updated_date; no credits/writes.
- preview_revoke: read-only revocation preview.
- verify: apply the exact saved decision using request_id, source_document_id, expected_updated_date and review.
- revoke: retain the previous source review in immutable history while marking source verification needs_verification.
- get_request: retrieve a stable request's immutable audit and current source receipt. applied is true only when the current archive identity and intended authority fields match. No mutation or LLM.
- revalidate: explicitly check one bounded page of dependent rules using a cursor; no LLM.

PermittingSourceAuthorityReview is an admin-readable/admin-creatable immutable audit entity (update/delete denied). The source authority_review_state records the create intent before an audit create. The create reservation has a unique operation id and authenticated reviewer, so simultaneous deliveries of the same request cannot both create an audit. A read of a still-creating same-request intent does not mutate or steal its reservation. An uncertain audit create is read back by exact identity and never repeated. A delayed audit can be reconciled by resuming the same saved decision. Source application uses narrow conditional updates, rechecks actual profile/office/page evidence and converges on exact readback after a lost acknowledgement. Unknown or conflicting intents remain quarantined for deliberate reconciliation; there is no automatic reset or retry.

Active or uncertain extraction/import intents block a conflicting scope change. The prepared UI stores the exact review request in sessionStorage before submission, freezes the preview decision and offers Check saved review / Resume same decision. A missing local decision is identified explicitly rather than silently generating another request. Source changes clear stale selected-page previews and retain all earlier backend extraction/rule records.

A successful source review is returned as applied even if a following rule recheck fails; the response carries separate revalidation progress. This prevents a partial revalidation error from disguising an already-saved source review as an unsaved decision.

## Approval and invalidation

Administrative approval rechecks canonical profile identity, optional verified office identity, publisher/scope quotes and page hashes immediately before its conditional rule update. Candidate review id, selected-page evidence, archive identity, exact requirement, structured terms and numerical evidence must remain current. A changed source review creates a different extraction key, retaining prior evidence and preventing accidental reuse of stale scoped candidates.

Material edits/rejection clear both is_operational and is_workflow_instruction. Notes-only edits preserve the established evidence decision. Revocation or changed source/profile/scope/office evidence demotes dependent approved rows to needs_review and clears both flags, without replacing requirements/citations.

permittingSourceRuleInvalidation.mjs shares the existing bounded invalidation logic with the new review route. It reads at most 51 rule rows and processes 50 with narrow version updates. Unknown writes check the same operation by readback. On failure resume_after points to the last known completed row, so the failed row is not skipped. A larger backlog requires explicit continuation; no unbounded loop or LLM call is introduced.

## Validation and production boundaries

224 focused permitting tests passed, including 26 new source-review/core/compiled-handler cases. Coverage includes exact quotes, wrong jurisdiction/state, drafts/adoption protection, county scope, office verification revocation, concurrent reviews, stale preview versions, changed pages, lost acknowledgements, uncertain create reconciliation, instruction/regulation separation, bounded invalidation and failed-row cursor recovery.

Four affected backend functions bundled successfully. Targeted UI lint, git diff --check and one full npm run build passed. Existing browser-data age warnings were nonblocking.

Actual Morrow and Campbell retained pages were revalidated with current helpers, including page hashes, Campbell's quoted publisher/covered areas and a literal page-2 instruction candidate. It remained needs_review and nonoperational; approval of the unreviewed source was blocked. Morrow's township/coverage ambiguity remains unresolved. Neither source was declared a current form or adopted law during testing.

Zero production LLM calls, file fetches, entity-record writes or audit creates occurred in this phase. All original fields in Boone's 101 rule records and 48 catalog sources, the Morrow/Campbell sources, both PermitLocality records, the shared office catalog and dispatcher config/state were unchanged. New/affected entity schemas were confirmed live, including immutable audit permissions. Backend resources auto-sync through sandbox writes; tests exercised compiled handlers with isolated SDK repositories, not direct production HTTP mutation acceptance.

The review UI and instruction badges/counts are prepared and build-tested. Frontend publishing was not performed.

## Next dependency

Phase 4.2 should establish explicit canonical locality/profile-to-office authority relationships, including parent county scope, permit types and review provenance. Preserve office publisher identity as a separate relationship. Then add a fresh-evidence reader for reviewed administrative instructions before integrating them into address resolution or real job workflows. The legacy workflow designer does not yet consume is_workflow_instruction and should be audited under the dedicated integration phase.

Manual research has no automated queue quota/backoff. Stable request identity, proof checks and per-invocation processing bounds remain production-integrity controls. Automated research configuration and daily credit accounting remain unchanged.
