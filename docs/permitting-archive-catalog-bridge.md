# Archive-to-evidence catalog bridge

Verified 2026-10-04 in CCS Signage Workflow. Production acceptance and validation are recorded in permitting-archive-catalog-live-verification-2026-10-04.json.

## Operation

Scheduled permitting dispatch now performs at most one known downloadable file archive and one evidence-catalog registration per invocation. Registration chooses the oldest eligible verified archive independently of the new download, so earlier archives are not starved. Each backlog scan is bounded to 20 profiles; this is a scan/rate bound, not a total coverage ceiling. No research or extraction LLM call is made for either archival or registration.

Targeted refresh/manual archival can register its newly completed archive. An admin can reconcile an existing verified archive through continueJurisdictionArchives with jurisdiction_id, document_id, and catalog_only: true. This path makes no file fetch/upload or AI call and is available during the automatic dispatcher pause. Manual research is exempt from queued automatic research caps; uncertainty/protection guards still apply to evidence writes.

## Evidence and authority

Both source and stored SHA-256 and byte counts must match, and the archive receipt must be complete. Source links and archive metadata remain in JurisdictionProfile.documents. Catalog registration adds only documents[].catalog_state; it never deletes or replaces the original.

PermittingSourceDocument receives stable jurisdiction/profile-document links, original URL, stored file URL, hash, size, and retrieval time. New rows start needs_verification/unverified. The additive content_status value unknown is now the default for new source records. Existing current/manual/verified rows are not reclassified or updated.

The existing deterministic classifier is reused for document kinds, but optimistic current_adopted/effective-date results are downgraded to unknown_review_required. Draft/proposed title/URL signals remain draft/proposed, and meeting records are legislative evidence. Archival is not evidence of adoption, effective date, issuing office, authority scope, or applicability. No effective dates or regulatory facts are generated.

## Concurrency and uncertain outcomes

Versioned profile updates preserve newer notes, added documents, and manual/pinned protections. A durable creating receipt precedes the catalog create. Concurrent workers cannot acquire the same source claim. A lost acknowledgement can reconcile an existing matching source row without another create. A create with no usable receipt is quarantined as create_uncertain; it is excluded from automatic selection, and explicit targeted reconciliation also cannot blindly create again.

Existing catalog rows are matched by registration identity or scoped original source/profile-document identity. Existing reviews, authority decisions, extracted text, archive versions, and manual notes are preserved. Multiple matching rows or conflicting archive hashes/source identities are retained and flagged for review.

The database has no declared unique constraint on registration keys. The conditional source claim protects these automatic writers; unrelated manual/import writers may still introduce duplicate rows. Such duplicates are detected and preserved as conflicts rather than merged or deleted.

Catalog failure cannot reverse completed archival or cause a second upload. Uncertain archival uploads also remain protected separately. Morrow's original Zoning Permit Application retains upload_uncertain from the earlier timeout and needs receipt reconciliation.

## Verified boundaries

95 permitting tests passed, including compiled function authorization/manual-pause tests, concurrent/lost-acknowledgement tests, oldest-first scheduled registration, archive/authority/Boone regressions. Three backend bundles, targeted lint, diff check, and the full build passed. No frontend was published.

Observed 22 additional scheduled byte-verified archives since the prior checkpoint while the automatic research counter stayed at 40. A deployed scheduled run registered Batavia as unknown/needs_verification. Morrow's already verified variance application was registered using the exact source helper through connected Base44 entity tools: one catalog create, zero downloads/uploads/LLM calls. The sandbox CLI session had expired, so no CLI invocation of the manual backend endpoint was claimed. Dispatcher enabled state was restored; Boone's 36 documents and Morrow's 16 source/archive records remained unchanged apart from Morrow's catalog receipt.

## Next dependency

Build bounded archived-document text extraction with traceable source/page identity. Preserve documents when extraction fails. Keep text availability distinct from current-adopted authority and human review. Do not launch bulk LLM rule extraction or alter active job workflows.
