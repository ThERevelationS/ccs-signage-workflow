# Ohio saved locality-link evidence audit — October 13, 2026

Phase 10 / Milestone 1 / Task 2 remains partial. This chunk is a bounded read-only production/evidence audit. No application behavior change or production relationship write was justified.

Starting HEAD: 3bdaf34d892ba52b5225e3f4be91060d91330c00. Working tree clean.

## Current permission-scoped reads

Live PermitLocality exact-ID query, limit 2:
- 69e62744e1f117de43ba7c75 — City of Cincinnati, OH. Three local office copies; no jurisdiction_profile_id returned.
- 69e67fb1539dbf3b982f791b — Deerfield, OH. One local office copy; no jurisdiction_profile_id returned.

All four visible copies lack returned government_office_id, authority_roles and authority_verification_status. Local copy IDs and names remain intact. Workflow/category/contact descriptions are not reviewed electrical role assignments.

Live JurisdictionProfile exact-ID query for 6ac1a123edda6d8dd942690b returned Cincinnati, OH, city, with 281 saved document entries. No office_authority_review_state returned; verification_status is null. The saved document cincinnati-official-sign-handout-20261005 retains catalog_state.source_document_id 6ac39c0e6657049fb11cd757. This profile receipt was read; the catalog row, archive fingerprints and live official website were not reread in this audit. Do not describe them as newly verified. The profile was selected by the exact ID in the existing evidence packet, not joined to the locality by its name.

Exact-profile electrical authority-event query: jurisdiction_id 6ac1a123edda6d8dd942690b, method office-authority-v1, roles electrical_permit/electrical_inspection, limit 10. Returned zero visible events. This does not prove absence outside read permissions.

Relevant live schemas were rechecked. PermittingOfficeAuthorityReview retains admin create, admin/user read, and update/delete denied. No permissions changed.

## Retained evidence and unresolved relationships

Cincinnati retained files inspected:
- docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/office-identity-audit.json
- docs/official-evidence/ohio-electrical-discovery-2026-10-06/sign-scope/electrical-review-readiness.json
- docs/official-evidence/ohio-electrical-discovery-2026-10-06/electrical-office-review/electrical-office-review-packet.json

The identity audit explicitly identifies locality 69e62744e1f117de43ba7c75 and local office copy 1776693056199-0.29725670755430633, while recording no profile link, no canonical ID and no reviewed roles. Current returned fields remain consistent with those gaps.

The municipal packet identifies profile 6ac1a123edda6d8dd942690b and catalog candidate 1776692961965-0.8021021998915965. That catalog candidate is not a verified canonical government-office ID. The October 7 retained municipal statement supports review/inspection research; the packet explicitly does not establish permit issuance and approves neither role. Its HTTP provider link, unverified redirect/canonical identity and failed provider archival remain historical evidence gaps, not current network findings.

The packets' historical implementation limitations are not a current code-status report: base44/shared/permittingPdfOfficeDelegation.mjs now contains separate electrical_permit/electrical_inspection PDF delegation support with publisher/responsible-office separation. This does not convert the retained HTML statement into eligible PDF evidence or prove the exact current source passes the review gate. Older evidence files were preserved.

Deerfield retained geographic reference: src/components/permitting/officialGeographicInventory.json, source_vintage 2026-01-01. Four OH township name candidates were found:
- Morgan — OH:county_subdivision:3911521182
- Portage — OH:county_subdivision:3913321210
- Ross — OH:county_subdivision:3914121224
- Warren — OH:county_subdivision:3916521238

These are retained Census geographic candidates, not permitting-authority matches. The separate older building-directory reconciliation includes other directory entries and null canonical GEOIDs; directory labels must not be promoted over exact geography. An office contact note referring to Warren County or a shared provider website cannot select the saved locality's identity. No county candidate was chosen or profile link created.

## Required evidence before reconciliation

For Cincinnati: retain explicit staff confirmation of the exact saved locality/profile geographic relationship; independently verify canonical provider identity; obtain current issuer evidence separately from inspection evidence; review responsibility, adopted scope and exact service-area applicability. The retained document reference is available for explicit review, but a fingerprint or catalog receipt alone grants no authority.

For Deerfield: establish the actual saved locality's geographic identity with exact locality evidence before selecting a profile or parent overlay. Then independently establish permit issuer and inspection provider. Names, ZIPs, shared websites and county membership alone are insufficient.

Both locality setups remain unresolved reference records. Missing visible events remain uncertain. No production links, office flags, jobs, history, documents or manual overrides changed. No LLM/research batch, upload, backend deployment, frontend publish or browser/login retry occurred.

## Validation and continuation

22 selected synthetic tests passed: saved-profile link reconciliation and electrical handoff. git diff --check is required at final verification. No production build was repeated because this chunk changes only this audit document; the preceding implementation build remains the last verified build. Authenticated production acceptance remains pending.

Next one contained chunk: review the current exact Cincinnati sign-handout catalog lineage and existing retained responsibility evidence read-only, then determine whether an explicit issuer or inspection review can be prepared without guessing identity or altering production review events. If current evidence is insufficient, document the precise missing source/identity proof rather than approving a role. Ohio remains first.
