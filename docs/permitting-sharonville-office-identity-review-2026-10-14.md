# Sharonville publisher office — read-only identity review

Phase 10 → Milestone 1 of 3 → Task 2 (partial). No task count changes.

## Decision

Prepared for staff review only. No identity verification, alias equivalence, rename, contact update, currentness confirmation, locality relationship, role, scope, commercial-sign applicability or delegation approval has been made. No production records changed. This summary is a repository review artifact, not an in-app review workflow.

## Supported review path and its limits

Permitting Settings → Office Catalog → expand office → Canonical office verification offers an official source URL, verification notes and a “Mark staff verified” toggle. In `OfficeCatalogEditor.jsx`, that toggle calls `updateGovernmentOfficeVerification` with reviewer “staff”. The helper records status/time/reviewer; it does not require a safe official URL, exact name proof, alias/parent-child resolution, retained evidence or immutable identity review event. Normalization preserves extra metadata and existing histories; identity/contact/source changes invalidate prior verification.

The inspected candidate registration path retains source/profile/archive/page evidence and explicitly requires later identity review. No structured alias or identity-review action was found in the inspected office candidate/shared office modules and office UI. Historical catalog entries contain manually retained identity evidence and `office_identity_reviews`; that existing data is not a structured approval path for this candidate. This audit is scoped to these files, not a claim that every app module was exhaustively searched.

Do not use the toggle to resolve this naming ambiguity. Do not omit the candidate reference to bypass the source-authority identity gate.

## Exact live lineage

Fresh connector readback: `docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json`. Reads are permission-scoped, not evidence of global absence.

| Record | Exact identity/version |
|---|---|
| Profile | 6ac19f0e23bd8a65822f6d51 · Sharonville / OH / city · updated 2026-10-14T01:16:36.556000 |
| Saved guide | 19bc3643-d404-4bcf-8cde-92c91897fd21 |
| Source catalog | 6aced7f49bda8d3e61944a9d · updated 2026-10-14T12:17:05.372000 |
| Office catalog | 69e14b004e01bf082f0f8c75 · updated 2026-10-14T12:07:33.616000 · 10 visible items |
| Candidate / government office ID | office-candidate-3bec03c01bca831b10be20e83ee1fe0df109206adb02acec76b6613d352e8c9c |
| Registration key | d5b8a1aaaea47ec6b916ee5458f3f0d353f23a70a3514712322c74933b440475 |
| Registration proof | Physical PDF page 7; exact excerpt: City of Sharonville Community Development Department Office |
| Page text hash at registration | cc95889e7d21c9fadb22e381711193952bd5c8888c6e782e6720cf4761481141 |
| Archive SHA-256 / bytes | 4086899c8a7bceb4ebc12bc891bc2107729d17616503e4941c60390ed62104d9 / 11002258 |

[Official guide](https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026). Archived URL is retained in the readback. Profile canonical permitting URL remains https://www.sharonville.org/394/Sign-Application.

The historical registration snapshot retains classification `unknown_review_required`. The current source is `administrative_guidance`; this is a later purpose classification, not an identity or authority approval. Preserve both. Source currentness is unknown, verification needs_verification, confidence unverified, issuing office/scope/review null. Text is partial: 10 of 28 physical pages, next page 11, no pending segment. No new PDF extraction was performed for this review.

## Printed and current naming evidence

“Current” below means observed on the official website at the cited retrieval time; it does not certify current law or continuing legal authority.

| Name / context | Evidence | Supported conclusion | Still unresolved |
|---|---|---|---|
| City of Sharonville Community Development Department Office | Guide physical page 7; candidate's exact retained publisher excerpt/hash | Printed office identity candidate | Whether “Office” denotes the parent department, child division or intake function |
| Department of Community Development / Community Development Department | [Parent official page](https://www.sharonville.org/122/Community-Development), retrieved 2026-10-14T12:22:43.754Z | Official parent department labels; links to exact child page and guide | Literal alias equivalence with the registered printed office |
| Building & Zoning Division | [Child official page](https://www.sharonville.org/123/Building-Zoning-and-Planning), retrieved 2026-10-14T12:22:43.224Z; page title Building, Zoning and Planning | Child division label within the parent department's linked structure | Whether this division is the intended printed publisher; no conflation with parent |

Retained original HTML: `publisher-current-page-0-2026-10-14.html` (child) and `publisher-current-page-1-2026-10-14.html` (parent), under the evidence directory above. Their audit is `publisher-current-listing-audit-2026-10-14.json`.

Child: SHA-256 8d05afea47f4c70798d9bc882c8f64ff27b977498ab74748034bffa2069b4129, 113675 bytes.
Parent: SHA-256 214c824df3d8235d4a160ba6cc68c90d9f22d993d5038ec0920eda7eea7826b5, 110421 bytes.
Both returned 200 and linked the exact guide. These retained observations were checked here; the official pages were not fetched again in this chunk.

## Contacts remain evidence-specific

| Contact | Evidence | Boundary |
|---|---|---|
| Andy Meyer, Community Development Director; ameyer@cityofsharonville.com | Both retained official HTML contact sections / mailto hrefs | Director contact; not a permit inbox |
| 513-563-0033; Municipal Building, 10900 Reading Road | Both retained official HTML contact sections | Department contact location/phone; not delegation proof |
| permits@cityofsharonville.com; 513-563-0033 | Guide physical page 2 (also page 5 form/instructions) | Guide permitting contact; inbox not corroborated by these two HTML contact sections |
| 513-563-1144 | City footer | City Administration; not department phone |

No contact was copied to the candidate. Candidate identity and contacts are separate decisions. Guide wording concerning residents/businesses and a commercial certification note does not establish commercial-sign applicability. NIC electrical references require separate identity, current contract, service-area and role evidence; Duke Energy remains a utility.

## Evidence needed before a future decision

A future structured review must retain printed/current variants as separate evidence, explicitly resolve the relationship intended by the printed name, and bind the reviewer decision to this exact candidate/profile/source/archive/page and refreshed catalog/source versions. If alias equivalence remains ambiguous, keep needs_verification. Preserve registration snapshot and prior items/history unchanged.

Identity-only review must state its exclusions: no commercial-sign scope, permit issuer, inspector, delegation, adopted law or source-currentness approval. A current official guide listing supports present publication, not all those claims. Source-authority review still requires its own explicit current-source confirmation, exact publisher/scope quotes and bounded named scope; an unverified candidate does not satisfy its office gate.

## Validation and next chunk

Fresh HEAD/status initially matched b3237cf09fc1a8af21c7a5d69d5b6275d3a72da2 and was clean. Exact live profile/candidate/source readback matched expected lineage and unapproved state. Retained HTML hashes and registration linkage are checked before checkpointing. Documentation/evidence only; no runtime/UI changes, build, LLM, upload, scan or deployment. Authenticated browser acceptance remains pending. CLI whoami timed out before a result; this does not establish authentication failure, and no new login was started.

Next: implement one reusable read-only Office Catalog candidate evidence panel, exposing immutable registration lineage and unresolved printed/current identity variants before staff verification. Keep approval/alias persistence outside that chunk unless independently designed and authorized. Test missing/stale lineage and unsafe links without production writes.
