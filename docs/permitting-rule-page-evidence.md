# Selected-page permitting requirement evidence

Phase 3.3 completed 2026-10-04 in CCS Signage Workflow (68dfcc5e57bbbc35387da97c). This implements the structured-knowledge dependency in the user's current document-first roadmap. The older phased roadmap document remains historical reference; its phase numbers differ. See permitting-rule-page-evidence-live-verification-2026-10-04.json for exact production evidence and release checks.

## Manual analysis contract

permittingRuleExtraction is admin-only. A manual analysis selects one catalog source, one to five retained physical PDF pages, and a stable request_id. The range has a 25,000-character context budget and at most 40 candidate results per invocation; choose fewer pages when needed. These processing bounds protect a live function and do not impose a daily/manual research quota or cap total source coverage. Manual requests do not use automatic queue credit caps, retry limits or backoff. Automatic/queued flags are rejected until a separate explicit credit-reservation contract is implemented.

The source must be canonically linked to a JurisdictionProfile. Exact page/archive identity, SHA-256 hashes, committed segment ownership and completeness come from readSourceEvidencePages. Missing, truncated or OCR-gap selected pages are rejected before AI. Source text is supplied as untrusted data, with no internet context or authority inference.

Actions:
- sources: twenty source metadata records per page, actual SDK positional array pagination, no document text/AI.
- preview: read-only validated physical page evidence, zero AI calls/writes.
- extract: one durably reserved manual AI attempt, staged candidates only.
- get_run: inspect an existing request/run without another AI call.
- permittingRuleReview / import_candidate: import one selected staged candidate, zero AI calls.

The old jurisdiction-only all-document extraction caller now requires source selection instead of starting a jurisdiction-wide AI batch. There are no automatic extraction callers in this phase.

## Literal evidence and staging

Every candidate must quote a contiguous 15–1,000-character excerpt on the selected physical page. The requirement must be a contiguous literal portion of that excerpt, at least ten characters. Physical page, optional section, sign/district/trigger/exception terms and optional numeric literal are checked deterministically. Numeric values and units are derived from explicit supported literals; unsupported numbers are omitted/rejected rather than inferred or calculated. AI confidence describes extraction quality and cannot establish adopted law.

Candidates retain canonical jurisdiction, office, exact official/archive URLs, archive hash, page text hash, physical page and literal section/excerpt. Their evidence context explicitly says selected_pdf_pages / full_code_review false. Draft/historical/unknown authority remains explicit. All imported candidates are non-operational needs_review (historical stays historical).

PermittingRuleExtractionRun stores the request identity, authority/page snapshot, one-attempt receipt, checked candidate array/checksum and bounded import receipts. A conditional source reservation precedes non-idempotent run creation. Attempt count is persisted before InvokeLLM. Known failure, timeout/uncertainty and completed replay never retry implicitly. The 60-second AI timeout retains an uncertain receipt; it cannot prove whether the remote integration ultimately charged/completed.

Unknown run/rule creates retain their intent, and exact delayed records can be reconciled without another create. A source-wide rule_import_state reservation spans different analysis runs as well as their individual receipts. Starting a new manual analysis cannot bypass an uncertain import or create a duplicate literal candidate. Active leases, narrow conditional versions, readback after lost acknowledgements and immutable candidate checksums protect concurrent staff/worker actions. Previously imported staff decisions and edits are preserved.

A genuinely missing uncertain create or crashed/unresolved AI attempt still requires deliberate reconciliation. No abandon/reset UI was added, and the implementation intentionally never repeats an unknown create or started AI attempt. This unresolved recovery dependency remains explicit.

## Review and source-change safety

permittingRuleReview fixes the actual SDK array filter signatures and aggregate.rows handling. List pagination has no total coverage cap. Approve/reject/edit use id + updated_date + version conditional updates and a unique operation receipt; lost acknowledgements converge without blindly issuing another mutation.

Approval rechecks every bounded citation against a current, verified, adopted source in the same canonical jurisdiction, exact current hash/URL and physical page text. New page-evidence rules require complete retained document text with no global OCR/truncation gaps, literal requirement/structured terms, numeric consistency, archive/page hashes and unchanged authority scope. Available text is not a full-code review. Reviewed legacy HTML/manual evidence stays intact; its retained quote/hash is checked before a new approval, with no forced PDF reconstruction. New approval of a legacy numeric rule also requires an explicit literal numeric/unit match; existing records are not rewritten.

Approval persists the reviewed source snapshots. A material staff edit demotes an approved rule to non-operational needs_review / under_review; a notes-only edit preserves approval. Source checks occur again immediately before the conditional rule write. Cross-entity changes are not a database transaction; saved source snapshots and invalidation remain necessary for subsequent changes.

permittingRuleInvalidate now uses bounded fifty-record keyset pages and citation-specific hashes. It detects changed archive, verified authority or reviewed source scope/snapshot, conditionally flags affected rules for re-review, and preserves original requirement/citations/history. Concurrent reviewer changes count as conflicts rather than being overwritten. Caller-supplied new_hash must match the catalog; this route does not manufacture a source version or fetch an official document. It is an explicit admin operation, not a newly scheduled whole-catalog scan.

The old supersede action could create an unvalidated approved replacement. It is blocked before any writes pending a durable reviewed-replacement/reconciliation workflow. No existing UI caller uses it. Superseded history remains retained.

## Prepared admin controls

PermittingRuleEvidenceExtraction provides source pagination, physical page selection/preview, stable session request IDs, read-only saved-result recovery and one-candidate import. Another manual analysis is explicit after a known completion/failure. Unknown outcomes show reconciliation status and are not automatically retried. Legacy sources without retained PDF pages remain visible with an actionable gap.

PermittingRulesReview uses these controls, surfaces backend evidence errors, fixes empty Select values, refreshes counts after edits and rejects stale filter/list/count responses. Frontend code was built but NOT published. Consequently the currently published older extraction button cannot operate the new source/page selection contract until an authorized frontend rollout.

## Production verification and preservation

Read-only remote Deno validation used the freshly queried retained Morrow variance form (source 6ac2593367c75c73d83cf39b) and Campbell sign application (6ac25be4207035a2e5be3827). Literal page-two excerpts and original archive/page hashes validated; invented requirements were rejected. A Morrow conditional fee literal preserved its entire property-owner condition and derived 125 dollars. Campbell's “Two sets of Sign Plans” remained literal submittal evidence. These test candidates were only in memory, were not inserted, and could not be approved from their unverified application-form classifications.

This was validation of actual production evidence using current core helpers, not direct backend HTTP/InvokeLLM acceptance. Compiled handler tests exercised auth, SDK pagination, staging/import, approval/edit, concurrent/lost writes and invalidation with isolated repositories. No production AI calls, file fetches, rule/run creates or record updates were performed in this phase. Entity schemas and backend resources auto-sync through sandbox writes; all three updated entity schemas were confirmed live.

Boone's 101 PermittingRule records and 48 source catalog records compare equal in every original field before/after; no pilot reconstruction occurred. Additive nullable schema fields do not replace existing evidence. Morrow/Campbell retained archive/text/hash/authority evidence was not changed. Dispatcher config/state compare exactly equal, enabled with 15 minutes / 5 research / 20 in flight / 40 attempts daily / retry 3, dispatched_today 40. No pause was needed for read-only acceptance. Real jobs/work orders and frontend publication were untouched.

A post-Phase-3.2 scheduled Batavia segment was observed at 2026-10-04T16:30:33.600Z: segment 6ac27f290c2121f715476345 retained pages 11–15 and advanced the committed cursor to page 16, with two segments and all five original inline pages preserved. This closes the preceding phase's unobserved scheduled-segment caveat without another research call.

198 targeted tests, three production backend bundles, targeted helper/admin lint, one full npm run build and git diff --check pass. Existing browser-data warnings remain non-blocking. Concurrent unrelated Git changes were preserved.

## Next dependencies

Next highest-value phase: reviewable source authority and responsible-office/scope normalization. Distinguish current adopted code from verified current administrative forms/checklists/fee instructions without treating posted forms as adopted law. Preserve county/city/township boundaries and evidence conflicts; do not mark the entire county as controlling every incorporated address. This will unblock supported operational instructions and later workflow generation.

Also pending within the extraction/review subsystem: explicit uncertain-request reconciliation/abandon auditing, durable reviewed replacements/supersession, selected evidence beyond current PDF/text/OCR bounds, and an authorized frontend rollout. Later source monitoring must separate observed official hashes from retained archive hashes and invoke bounded re-review linkage rather than silently replacing reviewed sources or requirements. Do not start statewide AI extraction batches.
