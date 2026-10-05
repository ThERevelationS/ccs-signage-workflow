# Permitting Phase 4.8 — native HTML zoning delegation review
Date: 2026-10-05 UTC
Production app: CCS Signage Workflow (`68dfcc5e57bbbc35387da97c`)
Account: `brettheinlein1@gmail.com`

## Result
Native retained HTML can now support an explicit city zoning-department management/review delegation to a separately verified canonical office. The existing immutable PermittingOfficeAuthorityReview ledger, profile CAS reservations, uncertain-create reconciliation, event sequencing, revocation and bounded read pagination are reused.

Alexandria review `6ac30088e65bdaab6db96b07` was recorded exactly once (sequence 2), using retained HTML `6ac2f628a5e8d3e42019f3d7`, block 7, and the direct link to the verified Campbell County office. Fresh editor tester readback returned `staff_verified` for zoning and the prior sign-permit relationship. It did not establish adopted law, building/electrical responsibilities, parcel/address authority, or actual job permit requirements.

## Evidence gates
- Explicit evidence discriminator; HTML never receives fabricated physical PDF pages.
- Original bytes, byte count, SHA-256, projected text and native block hashes are revalidated.
- The target must be the same current canonical publishing city and official hosts; no countywide coverage or postal-city inference.
- A literal management/review delegation must name the exact target city before the receiving-office clause. Incidental role words in the county department name cannot expand the role.
- The quoted block must contain one direct absolute HTTPS link to the unique verified canonical office identity URL. The publishing jurisdiction and responsible office are stored separately.
- One bounded current-page fetch per evidence check confirms unchanged projected text, final URL and exact office link. Fetch failure returns verification_unavailable; changed evidence returns needs_review.
- Volatile raw markup with identical substantive projected text and the exact office destination is tolerated. The retained original raw version remains immutable.
- A changed/uncertain capture receipt for this URL blocks the previous source version.
- Recheck before event creation, request/actor/payload identity, unknown-create protection, and immutable revocation remain intact.
- Missing/changed HTML evidence before any reservation returns a known not_recorded result, allowing a new preview.

## Staff controls
The existing office responsibility panel also opens from a retained website response. Native block, literal receiving-office name, covered city and responsibility confirmation are explicit fields. Preview/confirm, stored pending decision, check/resume and revocation use the same backend. This first path supports the explicit city zoning-department management/review template only. Other delegation wording, roles and jurisdiction types remain blocked pending separate evidence design.

Frontend changes remain unpublished. Sandbox writes auto-sync the affected office-review function/schema; there was no separate production-version deployment. Live testing used the editor preview-version function tester with production entities.

## Validation and preservation
113 focused tests passed (22 native delegation tests plus existing office/source/HTML/archive tests), targeted frontend lint, a 58.3 kB backend bundle, git diff --check and one full npm run build passed. Fresh dist/index.html was verified. Existing browser data age notices were non-blocking; dependencies were not changed.

All three previous relationship events, retained HTML, all eight shared office entries, both target profile document arrays and every non-review profile field exactly matched the pre-change snapshot. Campbell County's full profile was unchanged. Only one new relationship event and Alexandria's office-review receipt were written. No source reclassification, forms/archive replacement, job/work-order change, upload, LLM call, dispatcher pause or automated allowance charge occurred. Automated config was observed enabled with 15m interval, 5/cycle, 20 in-flight, 40/day and retry limit 3.

Fresh starting HEAD was `d4ba37c8b55a90c9a46f104aaadceaf2a9942bd9`; prior Phase 4.7 checkpoint was `6ac2f7c859cafd516447c21c`, Git `3b41320e6dafe77163788c7245330c719354a75f`. Newer Time Clock changes were preserved, including concurrent TimeClockAuditTrail work during this phase. Current HEAD wins over historical checkpoints. Historical Phase 4.2 tests were not rerun or claimed here.

Machine-readable validation: `docs/permitting-phase4-8-html-office-delegation-validation-2026-10-05.json`.

## Next coherent chunk
Verify another missing office identity and its explicit current service area from retained official evidence. Preserve existing trackers/workflows and reviewed relationships. Broader wording/roles require specific evidence gates before use.
