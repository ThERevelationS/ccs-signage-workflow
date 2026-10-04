# Canonical office role and coverage relationships

Phase 4.2 completed 2026-10-04 in CCS Signage Workflow (68dfcc5e57bbbc35387da97c). This phase implements the authority/office normalization dependency in the current roadmap, following the Phase 4.1 source publisher/scope review. See the accompanying JSON verification record.

## Canonical relationships

PermittingOfficeAuthorityReview is an immutable review-history entity. Each verified decision binds one canonical JurisdictionProfile, one unique shared government office ID, one office role and one explicit covered area. It stores the current source/office/profile snapshots, the source's structured review ID, a literal retained physical-page role quote and text hash, staff responsibility confirmation, notes, reviewer, request identity and monotonically committed sequence.

The role vocabulary remains compatible with existing PermitLocality authority_roles. Scope and role are independent of copied contact information, office types, source publishing and active job workflows. A county record can receive a relationship only for its explicitly quoted unincorporated territory. A city/township/municipality must match an explicitly reviewed named service area in the same state. A county-published form may support service to an explicitly named city; that does not infer county-wide coverage, county parentage, zoning applicability or address authority.

Office identity is resolved by stable IDs in the existing permitOfficeCatalog setting_value.items catalog, with duplicate canonical/catalog IDs rejected. Its current staff-verified publisher name, official source URL, reviewer/time and contact identity are recorded. A copied office name/type cannot establish an identity or jurisdiction relationship. Current role evidence is a staff-reviewed service responsibility claim, not an AI promotion or proof that a permit is required.

Initial relationship verification requires a current administrative source that passed the preceding source-office-scope-v1 review. Adopted-code office review is not silently substituted into this administrative path. The literal role quote must identify the selected role; staff must explicitly confirm this office actually handles that role for this quoted area. An attachment list or publisher name alone is insufficient. The source review's publisher/coverage quotes, physical page hashes, profile identity and optional shared office reference are rechecked.

## Persistence and integrity

The profile's new office_authority_review_state records the exclusive request reservation and highest committed review sequence. The event entity permits admin creation and authenticated staff reading; update/delete are denied. JurisdictionProfile permissions were preserved. No existing record migration or verification reset was run.

Before a non-idempotent event create, the backend reserves a stable request/digest/reviewer with a unique operation ID using a narrow conditional profile update. Concurrent same-request deliveries cannot both create a review or steal a pending reservation. An uncertain create is only read back by exact identity; it is never repeated. A delayed exact event can be explicitly reconciled using the same decision. Uncommitted events are excluded from relationship reads.

A failure before any create is attempted is a known not_recorded outcome. Only that exact reservation is released, with retry_safe=true so staff can preview again. An uncertain create remains quarantined. Lost create or profile-update acknowledgements converge through exact readback; all manual notes, documents and other profile fields remain preserved.

The existing jurisdiction editor uses an explicit editable-field whitelist and does not include the new review ledger. Research refresh also uses narrow source/research field patches. Neither normal save path copies stale review bookkeeping over a live reservation.

Revocation appends a new event for the same office/role/covered-area slot, preserving the earlier decision and source evidence. It requires a committed current review and notes; an obsolete event cannot revoke a newer decision. No existing PermitLocality offices, line items, jobs or workflows are rewritten.

## Fresh evidence reader and API

permittingOfficeAuthorityReview supports:
- context: bounded source/publisher/canonical-profile options with stable IDs and metadata only.
- list: five review events per page with a sequence cursor; each current slot is revalidated against actual source, quote/page, office, source review and target identity.
- preview / preview_revoke: read-only previews.
- verify / revoke: authenticated admin-only decisions with stable request_id, jurisdiction_id and expected_updated_date.
- get_request: read-only saved-event and committed-receipt lookup.

Authenticated staff may read; anonymous/external callers and staff writes are rejected before service access. These routes invoke no LLM. No automated queue quota applies to manual decisions, and no total relationship-history or backlog maximum is introduced. Per-call page sizes bound network/read work.

A fresh list labels the latest committed event for each role/covered-area slot as staff_verified, needs_review, verification_unavailable or revoked. Older decisions remain historical. Source/office/target changes withdraw verified status without deleting evidence. Transient verification failures never appear as verified authority. A recorded decision and a presently verified relationship are deliberately distinct states.

These reads expose review history, not an automatically resolved destination or a complete address-authority result. Address/parcel membership, district differences, parent hierarchy and permit applicability remain separate later phases. Consumers must use fresh review assessment rather than trusting a saved event's creation or an office type.

## Prepared staff controls

PermittingOfficeAuthorityReview.jsx is integrated into the selected-source administrative evidence panel. It offers exact publisher office and canonical target selections, quoted coverage, role/page evidence, responsibility confirmation, preview/confirm, revocation and bounded history reads. Matching jurisdiction names are selection suggestions only; staff chooses a canonical ID and the backend validates the complete relationship.

The exact decision is stored before submission. Check saved relationship review / Resume same relationship decision reuse the original identity and payload after uncertain responses. A recovered decision restores its selected target. Known no-create outcomes allow a fresh preview. Source/version changes preserve earlier immutable history. Parent controls block overlapping selected-source operations and stale async results are ignored after unmount.

The UI is prepared and build-tested; frontend publishing was not performed.

## Validation and actual production state

291 focused/regression tests passed, including 21 new core and compiled-backend handler cases. Coverage includes auth-before-service, zero-write preview/context/read lookup, role vocabulary compatibility, exact office/scope evidence, county boundaries, named city service, cross-state rejection, duplicate office IDs, concurrent deliveries, uncertain creates, delayed events, lost acknowledgements, stale previews, pre-create source changes, source/office/profile/page freshness, immutable revocation and bounded history pagination.

The affected backend bundled successfully. Targeted UI lint, git diff --check and one full npm run build passed. Existing browser-data age warnings were nonblocking.

Live schemas confirmed the profile ledger and immutable entity permissions. There are zero production relationship review events. Seven shared office catalog entries exist, and none presently carries the structured staff-verified office identity required by this new route. Both existing tracker locality records and the entire shared office catalog were exactly preserved from this phase's initial read. Boone's live baseline remains 101 rules and 48 source-catalog records. Dispatcher settings/state and existing jobs were not modified by this phase.

Actual Morrow and Campbell source records were exercised read-only through the current helper. Both remain needs_verification; their archived hashes remain respectively 1d59276a3f0692738cc9eb67dd2853e9faefa457f335d4749090f53c67a5b39f and 77058e0522fe160e2ad42f663d5447fc021da1dc5a6f2cdda2d8dc678802a8ef. Neither unreviewed form could qualify a relationship, and neither jurisdiction acquired a false current/address-authority claim.

No production LLM calls, entity-record writes, file fetches or relationship creates were performed for testing. Acceptance used compiled handlers with isolated SDK repositories and actual production data through current helpers, not a direct production HTTP mutation. Backend/entity resources auto-sync from sandbox writes; frontend was not published. Concurrent Time Clock work was preserved.

## Next dependency

Phase 4.3: register missing canonical office candidates from retained official publisher evidence, keep their identity needs_verification, and provide a safe path to current identity review. Then populate scoped relationships and expose the fresh relationship reader in Localities/jurisdiction details. Do not infer authority from copied legacy offices or automatically alter real jobs.
