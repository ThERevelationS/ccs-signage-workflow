# Permitting Intelligence — Phase 4.5

Completed 2026-10-04 in production app 68dfcc5e57bbbc35387da97c under brettheinlein1@gmail.com. Initial Git HEAD: 5895bb9ba29101e2b87019ecdf718c28fc64e95c (Phase 4.4). Phase 4.2 was already recovered/checkpointed; no prior implementation was recreated.

## Result

Recorded one explicit, current, staff-verified relationship for Campbell County Planning, Zoning and Building Inspection: **sign-permit application administration for Unincorporated Campbell County**. Canonical profile 6ac19dcc184935c1391ee468; immutable relationship event 6ac2cfa47d520cab91e9bb0e, sequence 1. Stable request ccs_campbell_sign_unincorp_202407_v1. Profile receipt is complete and committed sequence is 1. Live list returns verified=true, state=staff_verified, is_current_review=true. Address authority remains unresolved.

## Evidence and source version

The current official forms page (https://campbellcountyky.gov/topic/index.php?structureid=78) links Sign Permit Application, document-center item 298. Its redirect serves https://campbellcountyky.gov/egov/documents/1721136718_69637.pdf, printed Rev.07/2024. Both exact PDF bytes and the complete forms-page HTML are retained under docs/official-evidence. The new 169,996-byte PDF is SHA-256 ef0a7045fb835dbf76aa12751d12ced8f1560a75614c0a1125ca9d328b080718. It was archived, cataloged (6ac2cd6ac48508a21056b654), read back with matching bytes/hash, and extracted through the existing no-LLM bounded backend; 2/2 pages complete.

Page 1 names the verified office and explicitly quotes “1. Project Located In:\nUnincorporated Campbell County”. The source review is deliberately limited to this literal scope. Current-source review request ccs_campbell_form_202407_unincorp_v1 saved immutable audit 6ac2ce8a01cbc0a56cbcfbe3. Revalidation completed with zero cited rules and zero LLM calls. The source remains application_form, not adopted law. Relationship role proof is page 1, text SHA-256 a8c6db4b1e90bbbfa18c59864022758958315eff6a2857b40ca6f34f62367849, quoting the sign application heading and publisher.

The March 2022 form (source 6ac25be4207035a2e5be3827) remains archived with all original text/hash/bytes preserved and is now explicitly superseded/historical, linked to the current form. No cited rules referenced it in the bounded pre-change query. The profile's unprotected permitting_url now points to the new PDF; original profile document entries were not rewritten.

The official department page's service-provider link (document-center item 390) redirects to https://campbellcountyky.gov/egov/documents/1615818959_2142.pdf. Retained exact PDF: 96,677 bytes, SHA-256 7bd719d36299c543e240759d8868412a8abef1e6377a0afa161fe976164a842d. Catalog 6ac2cd8586ccf99cac0358f0, archived/read-back verified and extracted 1/1 page. Visual inspection confirms mixed City/County role columns and conditional footnotes. Metadata is from March 2021; no printed revision was confirmed. Flattened extracted text does not preserve reliable column association. The matrix remains unknown/needs_verification and establishes no additional relationship. It must not be used to infer blanket county coverage or current city zoning roles.

## Preservation and validation

- Eight office catalog entries are exactly unchanged, including the seven original offices and the verified Campbell entry.
- Two tracker locality records match by record ID and full content; response ordering differed only. Existing tracker office/workflow copies remain untouched and unlinked.
- Automated dispatch config and state records are exactly unchanged. Manual archival/extraction/review did not consume automated allowance or pause dispatch.
- Campbell profile grew from three to five documents; the original three match exactly. Other profile fields match except documents, unprotected permitting_url, review receipt and updated_date.
- Old form protected archive/text fields match exactly. Only intentional supersession/version-review metadata changed.
- 118 focused tests actually ran this phase and passed; historical test totals were not rerun or claimed.
- One npm run build completed successfully (exit 0), with existing stale browser-data warnings. dist/index.html was regenerated. git diff --check passed. A full phase-range check initially identified original official HTML whitespace; a file-specific .gitattributes rule retains the exact source bytes as evidence (-diff -text), without normalizing or altering the retained page. The phase-range check then passed.
- Authenticated editor preview backend calls verified production entity persistence; this is not a claim of new backend deployment. No source code/schema changes or deployments were needed, and the frontend remains unpublished.
- A concurrent base44/functions/timeClockAction/entry.ts change appeared in live Git HEAD. It was preserved without modification or rollback; no permitting target source changed.

See permitting-phase4-5-campbell-authority-validation-2026-10-04.json for receipts, hashes and validation records. Checkpoint ID and final Git are reported after checkpoint creation and are intentionally not guessed here.

## Next coherent chunk

Review current city-specific responsibilities using official evidence and canonical jurisdiction profiles. Resolve age/conflicts in the matrix before using it. Create only exact role/coverage relationships that current evidence supports; leave postal-city/address resolution and job requirements for their later dependencies.
