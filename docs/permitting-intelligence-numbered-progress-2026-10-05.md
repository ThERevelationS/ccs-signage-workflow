# Current authoritative progression — supersedes historical labels below

Active work: **6.8 of 6.9**, Phase 6 exact-citation extraction. Phase 5 uses **5.1 through 5.9**; 5.8 archive/text reconciliation and 5.9 closeout remain open. Starting Phase 6 is authorized by the user and does not falsely certify Phase 5 complete. Canonical decimal milestones for all 15 phases are in permitting-intelligence-phased-roadmap.md. Earlier 5.01–5.10 references below are dated history, not current numbering.

6.7 selected-page supervised acceptance passed: minimal provider control succeeded; original response schema failed even with a minimal prompt. Extraction now requests bounded JSON text and retains local exact-citation validation, with no automatic retry. Live Campbell page 2 staged 2 candidates; Cincinnati page 1 staged 1. Four nonliteral proposed quotes were rejected. Both stable-request replays made zero additional AI calls. No rules imported or approved. 52 tests, backend bundle, build (exit 0), and diff checks passed. Receipt: permitting-6-7-live-json-acceptance-2026-10-06.json. Next active milestone: 6.8 review-ready presentation/handoff and evidence-backed conflict resolution. 6.9 final extraction acceptance and Phase 5 closeout remain open.

6.7 usage/configuration check: authenticated app usage showed 15,264 of 20,000 workspace integration credits remaining; zero builder-message credits is a separate balance. Integration exhaustion is not indicated. Integrations UI exposes Gmail/Drive connections but no AI provider configuration. No new AI calls/record writes. Next: minimal tracked AI control request to distinguish general integration/provider failure from extraction-specific request failure. Active milestone remains 6.7; root cause unresolved. Receipt: permitting-6-7-integration-usage-2026-10-05.json.

6.7 diagnostics improvement: authenticated extraction log viewer reported No logs found. Handled provider failures now emit bounded stage/run/attempt/http-status/provider-code diagnostics, never SDK error objects, credentials or source prompts. 50 tests (including secret exclusion), backend bundle, full build and diff checks passed. No new AI attempts or production record writes this chunk. Provider root cause remains unresolved; next inspect integration usage/configuration and use diagnostics for a justified fresh request. Active milestone stays 6.7.

6.7 diagnosis update: two fresh tracked attempts tested maxItems removal and basic schema shapes; both returned the identical provider 400 INVALID_ARGUMENT. Original response schema restored; no unproven compatibility change retained. Zero candidates/rules created. Active milestone remains 6.7. Next: provider/integration diagnostics before further AI attempts. See permitting-6-7-provider-diagnosis-2026-10-05.json.

6.7 authenticated progress: Campbell application page 2 preview passed (zero AI calls). Actual extraction failed at provider with 400 INVALID_ARGUMENT; durable run 6ac45a044aa03583060f4401 records one attempt, zero candidates/rules. Same-request replay returned failed/replayed with zero new AI calls. Source reservation and run receipt were written; no rules imported/approved. Active milestone remains 6.7: diagnose provider request compatibility before a fresh explicit request. Receipt: permitting-6-7-authenticated-2026-10-05.json.

6.7 partial acceptance: fresh live snapshots for Campbell County application (2 pages) and Cincinnati sign handout (3 pages) passed retained-page and exact literal candidate validation. Wrong-page citations were rejected; Campbell administrative-purpose category guard passed. Candidates remain nonoperational. Cincinnati current authority is unverified; Campbell approval was not assessed because canonical profile/settings dependencies were deliberately absent from this snapshot harness. No actual AI calls, candidate-run writes, imports or approvals occurred. This is snapshot/manual candidate validation, NOT authenticated endpoint or actual AI extraction acceptance. Keep active milestone at 6.7 until those steps are verified. Receipt: permitting-6-7-snapshot-acceptance-2026-10-05.json. Phase 5 closeout remains open.

6.6 safeguards verified: conflicting_sources blocks ordinary approval; material edits preserve conflicting_sources and historical status. Missing retained text/OCR/current authority gates remain intact. 49 focused/compiled-handler tests, both bundles, build and diff checks passed. No actual AI calls or production record edits. Explicit evidence-backed conflict-resolution workflow remains open for 6.8 review handoff; no source conflict is declared resolved. Next: 6.7 Ohio/Kentucky supervised extraction acceptance. Phase 5 closeout remains open.

6.5 implementation verified: replay reconciles durable complete/failed/llm_uncertain run receipts with a stale source ledger for the same request only. Known failed requests can then accept an explicit fresh manual request; uncertain AI outcomes remain blocked from implicit retry. Reconciliation makes zero additional AI calls. 47 evidence/compiled-handler tests, both backend bundles, full build and diff checks passed. Attempt counts are execution reservations, not provider billing totals. No real AI calls or production record edits during validation. Next: 6.6 conflicts, missing evidence and historical handling. Phase 5 closeout and live/browser acceptance remain open.

6.4 implementation verified: shared numeric validation now requires a complete numeric expression inside the literal requirement. Numeric substrings (50 within 150, decimal tails, missing currency markers, negative-sign stripping, unit-word prefixes) and malformed comma grouping are rejected. Candidate physical pages must be positive safe integers. 45 evidence/compiled-handler tests, extraction/review bundles, full build and diff checks passed. Zero actual AI calls or production record edits in validation. Live/browser acceptance remains open at 6.7–6.9. Next: 6.5 idempotent extraction continuation and credit accounting. Phase 5 closure remains open.

6.3 implementation verified: deterministic quoted-applicability-v1 evidence records sign type, zoning district, trigger and exceptions as quoted or not_established_in_excerpt. Address applicability always requires_review. Candidate import preserves applicability metadata and staff edits; approval rejects inconsistent metadata. Existing records remain unchanged. 43 focused tests, both affected backend bundles, app build and diff checks passed. No real LLM calls or production record writes. Browser/reviewer presentation acceptance remains at 6.7–6.9. Next: 6.4 literal citation/numeric unit/physical-page validation. Phase 5 reconciliation and closeout remain open.

6.1 progress: enforced administrative source-category eligibility before candidate staging, reusing the existing shared source-purpose policy. Forms/checklists/fee schedules cannot stage unsupported regulatory categories even if AI returns them. Literal submission/procedure candidates remain review-only. 40 focused evidence/compiled-handler tests passed. No real LLM calls, rule imports, approvals, or production record edits for this validation. Next: 6.2 retained-text/source-version readiness; continue carrying Phase 5 closure checks explicitly.

# Permitting Intelligence — numbered progress
Updated 2026-10-05. The canonical phase numbers are the 15 whole-number phases in permitting-intelligence-phased-roadmap.md. Prior Phase 3.x/4.x labels were implementation chunks using a different sequence, not milestones in that roadmap. Historical receipts remain unchanged.
Current primary work: **Phase 5 — Official-source collection and verified archives**.
Foundation implemented does not mean statewide completeness or final browser acceptance. Do not claim a numerical completion percentage without a defined inventory and acceptance denominator.

| Phase | Original scope | Evidence-based position |
|---|---|---|
| 1 | Locality foundation | Existing foundation; statewide completeness remains open |
| 2 | Government offices and authority | Canonical office/role/coverage model implemented; locality verification continues |
| 3 | Address resolution | Existing resolver; final authority-aware acceptance remains open |
| 4 | Research/import foundation | Existing provenance, merge and preservation controls implemented |
| 5 | Official-source collection and verified archives | CURRENT: Cincinnati evidence, OCR gaps and conflicting instructions |
| 6 | Exact-citation AI extraction | Page/segment/citation foundation implemented; source-specific extraction continues |
| 7 | Staff-approved regulations | Authority/review gates implemented; approval is source-specific, not blanket |
| 8 | Source-aware permitting search | Approved/fresh evidence integration and acceptance remain |
| 9 | Expandable locality experience | Final UI completion and acceptance remain |
| 10 | Statewide completeness | Open; no statewide completion claim |
| 11 | Low-credit source monitoring | Existing budget/dispatch controls; monitoring acceptance remains |
| 12 | AI permitting workflow designer | Evidence-aware integration remains |
| 13 | Tax-Exempt Status & Documentation | Completion not established by current evidence |
| 14 | Safe Work Order / PermitLineItem integration | Protected, version-aware integration remains |
| 15 | Acceptance and rollout | Final authenticated acceptance and explicitly authorized rollout remain |

Recent Phase 5 progression: Cincinnati direct sign PDFs registered and all 4 pages extracted → building/site-plan forms archived → building application 2 pages extracted → official electronic-submission HTML retained and exact-block citation verified → linked submission PDF and site-plan visual/OCR evidence (current chunk).
Related Phase 2 work: canonical office identities, role/coverage relationships, Campbell/Alexandria evidence and Cincinnati office identity work.
Related Phases 6–7 work: bounded source/page extraction, segmented evidence, literal citation checks, source/currentness/authority gates.

Phase 5 exit gate: target-source inventory reconciled; official bytes/hash archives verified; PDF text/OCR coverage accounted for; conflicts and missing/currentness evidence explicitly recorded. This is a gate for a locality baseline, not automatic completion of every locality in Ohio and Kentucky.
Next gate: use complete retained evidence for exact-citation extraction (Phase 6), then authorized staff decisions (Phase 7); do not advance unreviewed evidence into live job instructions.
Every update uses a whole-number phase plus a named task and one verified checkpoint. No decimal phases.

Phase 5 update: supported OCR retention and explicit staff read/citation path implemented. Cincinnati site-plan page 1 is retained unreviewed in the app; source PDF extraction remains needs_ocr. Next: version-bound visual transcription/review evidence, then applicability and authority review. Upload deadline conflict remains unresolved. See permitting-phase5-ocr-evidence.md and its live verification JSON.

Phase 5 update: visual transcription candidates now retain corrected instruction excerpts with PDF/OCR snapshot identity and page regions. Cincinnati site-plan has two retained instruction spans pending staff review; original OCR and extraction gaps remain intact. Next: Cincinnati sign/application applicability and office coverage review. See permitting-phase5-visual-transcription.md.

Phase 5 update: Cincinnati applicability/office evidence mapped into nine review-pending branches. Five additional official PDFs (9 pages) and COA guidance HTML retained with literal citation/hash evidence. App archive/catalog registration of the new documents is next; source conflicts and adopted-code/address authority remain open. See permitting-phase5-cincinnati-applicability-review.md.

Phase 5 update: all five Cincinnati applicability PDFs are archived in app storage, registered in the source catalog and fully extracted (9 pages). COA guidance is retained as immutable unreviewed HTML evidence with live block citation. Profile now has 19 links; 13 prior entries were kept. Next: current zoning HTML and adopted Chapters 1427/895 evidence. See permitting-phase5-cincinnati-app-registration-live-2026-10-05.json.

Phase 5 update: zoning-administration and Clerk code-status HTML retained in the app (2 immutable records; literal citations verified). Primary legislative originals retained with hash checks: passed Ordinance 0380-2020 (4 PDF pages, amendment markup review required), its status, and indefinitely postponed proposal 202301577. All 19 prior profile document links unchanged. City-referred Municode capture contains only an application shell; complete current Chapters 1427/895 remain open. No rules approved. Next: complete published chapters with publication cutoff and amendment history, followed by visual markup review. See permitting-phase5-cincinnati-code-authority-live-2026-10-05.json and official-evidence/cincinnati-code-authority-2026-10-05/manifest.json.

Phase 5 update: priority shifted to the reusable scanner. Shared multi-page deterministic discovery is integrated into refresh; nonempty partial AI answers no longer suppress official-page harvesting. Pending links/failures and discovery provenance are explicit; 49 targeted checks and backend/build verification passed. Three-locality retained-HTML replay exposed extensionless file discovery and durable-frontier gaps. Next: content-type classification plus protected cross-run frontier and download/catalog handoff. Full end-to-end scanner acceptance remains open. See permitting-phase5-reusable-scanner-2026-10-05.md.

Phase 5 update: extensionless PDF routing now joins discovery to immediate/scheduled byte-verified archival, catalog registration and PDF extraction. MIME + signature classification is a routing hint, not authority. 94 tests passed, including an isolated end-to-end PDF pipeline; three affected backend bundles and build passed. Production records were not used for test mutations. Next: protected durable crawl frontier across requests/cycles, followed by varied OH/KY live pipeline acceptance. See permitting-phase5-extensionless-pdf-pipeline-2026-10-05.md.

Phase 5 update: shared scanner now saves and resumes its frontier, commits cursor/documents atomically, and exposes one-page no-LLM continuation through the existing scheduled dispatcher. 72 checks, both affected backend bundles and build passed. Live read-only query found no pending saved frontier yet; real scheduled advancement remains unverified. Existing automation settings unchanged. Next: supervised varied OH/KY live pipeline acceptance, including resumed discovery and archive/catalog/text handoff. See permitting-phase5-resumable-discovery-2026-10-05.md.

## Phase 5 shared scanner correction

Sign resources now survive crowded alphabetical link caps; saved frontiers use resource-label ranking. Verified 54 tests, backend bundles and app build. Phase 5 remains active. Next: guarded recovery of already-capped pages and live PDF handoff. See `permitting-phase5-sign-resource-selection-2026-10-05.md`.

## Phase 5 capped-page recovery

Admin discovery-only recovery now resumes saved link-limit gaps across requests, preserving completed scans, pending work and documents. Page hashes guard against skipped links after source changes. Verified 58 tests, backend bundles and app build. Next: live Cincinnati recovery and PDF archive handoff. See `permitting-phase5-capped-page-recovery-2026-10-05.md`.

## Phase 5 live recovery acceptance

Cincinnati capped index recovered 169 links across two portions, clearing its link-limit gap; 64 additional resource records retained, all prior document IDs and archive identities preserved. Recovery uses ordered resource-list hashes; 59 tests and build pass. Fetch/depth gaps remain. See `permitting-phase5-live-capped-recovery-2026-10-05.md`.

## Phase 5 live archive handoff

Selected official COA PDF archived and cataloged: 158,030 bytes, matching source/stored SHA-256; source `6ac3e5b86c944422b102d089` remains needs_verification. Content matches an older COA archive, so no new revision/currentness claim. Phase 5 remains active: remaining depth/fetch gaps and varied OH/KY shared-pipeline acceptance precede Phase 6 exact-citation AI extraction. No frontend publish or approved-rule changes.

## Phase 5 rediscovery metadata persistence

Fixed shared document merge losing newly observed discovery page/depth for already-known URLs. Deterministic harvest may fill an absent pair; existing observations, document IDs, archived bytes/hashes, manual and pinned records remain preserved. AI or malformed metadata cannot supply recovery depth. This prevents future rediscovery metadata loss; it does not retroactively establish legacy depth or clear existing gaps. 45 focused tests pass, refresh and batch-update backend bundles pass, full build passes. Phase 5 remains active. Next: guarded legacy gap recovery and varied Ohio/Kentucky discovery/archive/text acceptance, before Phase 6 exact-citation AI extraction. Backend/shared changes auto-sync; no frontend publish.

## Phase 5 failed-page recovery

Added explicit admin discovery-only `recover_fetch_failures:true` mode to refreshJurisdiction. Retries saved page_fetch_failed gaps without draining normal pending work or resetting visited history. New failures retain depth; legacy unknown depth stays conservatively at the existing maximum. Successful HTML/PDF classification clears its gap; repeated failure preserves it and stops this request. Link-cap and fetch-recovery modes cannot combine. No LLM calls or automated retry activation; existing scoped fetching, atomic profile writes and manual protections remain. 44 focused tests and affected refresh/dispatcher bundles passed. Live acceptance of this new retry mode remains outstanding. Phase 5 remains active: next supervised fetch-gap retry and guarded depth-gap recovery, then varied OH/KY pipeline acceptance before Phase 6.

## Phase 5 retry handler acceptance

Compiled refresh-handler acceptance now verifies that successful fetch-gap recovery adds the discovered form, clears only its gap, preserves unrelated pending pages and manual archived evidence, and makes zero research calls. Fixed scanner success reporting: a failed attempt with an empty ordinary frontier no longer reports success. Saved failures retain their gap and attempt count; profile response success is not locality coverage. 36 focused tests and refresh/dispatcher bundles passed. Live retry acceptance remains outstanding. Next: supervised live fetch-gap retry, followed by guarded depth-gap recovery and varied OH/KY pipeline acceptance. Phase 5 remains active; Phase 6 follows source-collection acceptance.

## Phase 5 live fetch-gap acceptance

Authenticated discovery-only retry of Cincinnati's saved application-forms fetch failure succeeded: one attempted page, redirected to the current same-host application-forms URL, 100 resources observed, zero research/LLM calls. Live readback confirms fetch failures reduced to zero, 189 retained documents unchanged in count, all prior IDs and uploaded archive identities preserved, and all 91 unrelated pending pages retained. The returned page remains capped: a new ordered-resource-list pagination gap is saved at offset 100. Legacy unknown depth remains conservatively 2; this is not full traversal or locality coverage. Attempted total readback was 17; concurrent scheduled progression means total delta is not attributed solely to this one retry. No new files archived during this request. Next: recover the saved cap, then guarded depth-gap recovery and varied OH/KY pipeline acceptance. Phase 5 remains active. Existing 36-test handler/scanner acceptance and full build passed in the preceding checkpoint; this turn performed live acceptance and documentation only.

## Phase 5 redirected index pagination acceptance

Live authenticated recovery resumed the redirected application-forms index at offset 100 and collected its remaining 69 resources. Ordered-list hash guard passed; page_link_limit gaps are now zero. Zero research/LLM calls. Independent live readback confirms 189 documents, all prior IDs/archive identities retained, and 91 unrelated pending pages unchanged. No new unique document records or uploads in this recovery: the resources were already retained from the alphabetical-index run. 69 depth_frontier gaps remain, including five sign-related URLs (some protocol aliases). Next: explicit guarded depth-gap recovery, prioritizing sign application/handout URLs, without inventing legacy depth or resetting progress. Phase 5 remains active; varied OH/KY collection acceptance precedes Phase 6. Documentation/live verification only this turn; source unchanged from previously tested checkpoint.

## Phase 5 selected depth-gap recovery

Added explicit admin discovery-only `recover_depth_url` to inspect one selected saved same-host depth_frontier gap. It cannot select arbitrary unsaved URLs, combine recovery modes, consume ordinary pending work, or reinterpret legacy depth. One page is fetched per selection; successful PDF classification or static HTML scan clears that selected gap, failures retain it, newly linked pages remain explicit depth gaps, and downloadable files enter the existing archive routing. Existing cursor/source validation, SSRF-safe fetch and atomic profile merge remain. Zero LLM calls. 38 focused checks and refresh/dispatcher bundles passed. Live acceptance of this new mode remains outstanding. Next: select the saved outdoor-advertising sign-application gap and verify PDF discovery/archive handoff. Phase 5 remains active; full depth-gap and varied OH/KY acceptance precede Phase 6. Backend/shared changes auto-sync; no frontend publish.

## Phase 5 live selected depth-gap acceptance

Selected Cincinnati outdoor-advertising-sign-application extensionless URL classified as PDF through live MIME/signature inspection. Its saved depth_frontier gap cleared; 69 to 68 depth gaps. Independent live readback retained all 189 document IDs and archive identities and all 90 pending pages present at this turn's start. Pending count was already 90 before this action (previous turn 91); concurrent progression is not attributed to selected recovery. Zero research/LLM calls. Existing retained application archive was reused: 63,094 source/stored bytes, matching SHA-256 df1691dba89b795e8f339a82cdf00a35074925a5398d468fe3809fb0ed1bd40a. No new upload this turn. Recovery adds PDF routing classification without replacing verified file identity or approving regulatory requirements. Next: shared continuation of remaining sign-related gaps and varied OH/KY pipeline acceptance. Phase 5 remains active; Phase 6 exact-citation extraction follows collection acceptance. This turn changed live discovery metadata and documentation only, using the previously tested 38-check implementation.

## Numbered milestone progression requested by user

Reporting now uses fixed Phase 5 milestones 5.01–5.10 in the canonical roadmap. Current step: 5.09 of 5.10 (step 9 of 10). No percent-complete inference. 5.08 live sign-gap acceptance verified: four remaining saved Cincinnati sign URLs classified PDF, including HTTP-to-HTTPS redirects; sign-related depth gaps zero, other depth gaps 64. All 189 prior document IDs and archive identities preserved; 90 ordinary pending pages retained. Zero research calls. Existing handout/renewal archives reused, no uploads.

5.09 Kentucky acceptance started: Alexandria zoning → forms index → online temporary-sign application, with 14 additional resource records (4 to 18), all four prior IDs preserved, four pending pages saved, zero research calls. Known cross-host county referral requires separate established scope; this scan does not establish complete local authority or current requirements. Remaining shared-pipeline acceptance and final gap review are required before 5.10/Phase 6.

### 5.09 live discovery pattern results

Alexandria completed four supervised discovery-only requests: 10 pages attempted, 4 to 24 retained resource records, zero pending pages and zero saved same-host gaps. All original IDs and both archived county sign PDFs retained unchanged. This establishes bounded same-host traversal, not jurisdiction coverage, authority approval, or completion of cross-host referrals. Temporary-sign, encroachment and electrical online forms are retained as links. Some links contain source-provided Divi/PageSpeed query parameters; canonicalization remains a source-quality review item.

Campbell County direct-PDF seed classified successfully with zero research calls. A terminal PDF seed cannot discover the county forms index; multi-seed/department-scope collection remains an explicit limitation. Cincinnati sign-gap acceptance plus Alexandria HTML/online-form traversal and Campbell direct-PDF classification exercise Ohio/Kentucky source patterns through the same scanner. 5.09 remains active pending archive/catalog/text evidence reconciliation; 5.10 is the final collection acceptance and Phase 6 handoff. No frontend publish, LLM research batches or new uploads in this turn.

## 6.2 — retained archive readiness

Added explicit readiness validation at loadRuleEvidence before AI calls, extraction reservations or candidate import: valid SHA-256, positive safe-integer byte count and HTTP(S) archive URL without embedded credentials. Existing retained-page identity, text hash, missing page, OCR/truncation and concurrent source snapshot checks remain. Invalid legacy evidence is retained and requires repair; no source records are deleted or automatically rewritten. 41 focused evidence/compiled-handler checks passed, including zero AI/writes for malformed archive identity. Affected extraction/review bundles passed. No real LLM calls, rule imports or approvals were used in verification. 6.2 remains active pending live retained-text/source-version readiness reconciliation; next validate pilot page evidence before moving to 6.3 structured applicability. Phase 5 closeout remains explicitly open.

## 6.2 live snapshot readiness acceptance

Queried 16 live Cincinnati/Campbell/Alexandria source records through Base44, then ran the exact loadRuleEvidence implementation against their unmodified retained-text snapshots for physical page 1 in the remote sandbox. 14 passed; two correctly blocked: new COA source 6ac3e5b86c944422b102d089 lacks retained text, and site-plan source 6ac3a54ac1ce2adba5b92cb8 requires OCR. This is live-record snapshot validation, not authenticated endpoint/browser acceptance; browser session expired and no login was initiated. No AI calls, extraction reservations, source-record writes or approvals. Page-1 readiness does not certify later pages, whole-document completion, current authority or draft applicability. Draft form-based source remains draft and partial despite readable first page. Source version must be rechecked by the live endpoint before any later extraction. Receipt: permitting-6-2-live-readiness-2026-10-05.json.

6.2 implementation/snapshot checks are verified with source exceptions explicitly retained; end-to-end browser acceptance remains part of 6.7/6.9. Current next milestone 6.3 structured schema/applicability. Phase 5 reconciliation remains open. Source code unchanged this turn; previously passed 41 tests/build retained, git diff check passed.
