# Read-only candidate identity review preview — October 14, 2026

Phase 10 → Milestone 1 of 3 → Task 2 remains partial. No fixed progress counts changed.
Initial HEAD 9f72b2013f6f1415727922b762fd64061e1637a7; clean.

Added previewOfficeCandidateIdentity to base44/shared/permittingOfficeCandidate.mjs and the admin-only identity_preview action to base44/functions/permittingOfficeCandidate/entry.ts. No identity approval/apply action exists.

Request:
- action: identity_preview
- office_id: exact saved candidate ID
- registration_key: immutable saved registration key
- expected_catalog_updated_date: freshly selected Office Catalog version

The preview validates unique catalog IDs/version, exact candidate/canonical identifiers, registration method/key and literal name, and recomputes the historical registration digest. It reuses existing retained-page/archive/profile evidence validation. Derived candidate ID, source/profile/archive IDs, URL/hash/bytes, physical page/exact quote/text hash must match registration lineage.

Historical registration-time purpose stays preserved beside current source-purpose metadata. A later administrative_guidance classification is allowed without overwriting unknown_review_required registration evidence. Source/profile versions are required and captured. Two independent reads compare complete selected snapshots, including candidate contacts/history and saved archive document. Observable same-version candidate mutation, changed source metadata during retrieval and version drift fail closed. Double-read checks are not a provider atomic transaction and do not prevent changes after the response; any future decision must revalidate its snapshot.

Response: dry_run, identity_review_only, review_snapshot, review_snapshot_sha256 and explicit unresolved publisher/parent/child/alias questions. identity_verified, authority_verified, contacts_verified, source_currentness_verified, commercial_sign_scope_verified, delegation_verified and address_authority_resolved are all false. No writes, fetch, LLM, download, upload, source scan or current official HTML proof inference.

Tests:
- 63/63 broad checks passed across preview/candidate/backend, editor guard, identity preservation, catalog and both evidence panels.
- Review then added the derived-ID substitution guard and one negative check; final affected preview/candidate suites passed 27/27.
- git diff --check and one npm run build passed. Compiled actual function handler tested with synthetic SDK responses; admin gate and unknown identity_apply action verified.
- Existing baseline-browser-mapping/Browserslist warnings remain.

No production records changed. No candidate or contact/currentness/role approval. No frontend publication or explicit deployment. Backend resource changes may auto-sync; deployed handler/source comparison and real authenticated identity_preview invocation are NOT verified in this chunk. UI integration and authenticated browser acceptance are pending. No CLI auth/login retries performed.

Next ONE chunk: wire a bounded explicit read-only identity preview action into the candidate evidence panel using a fresh catalog version and exact saved registration. Guard stale selections/results and display historical/current evidence distinctly. Perform safe authenticated live preview/deployed verification if access allows; never verify this candidate, add contacts or change roles as a shortcut.
