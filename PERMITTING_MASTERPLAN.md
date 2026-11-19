# Permitting Pipeline — Masterplan (road to <1% in-app review)

**Updated:** 2026-11-05 · **Repo:** ccs-signage-workflow-clean · **App:** 68dfcc5e57bbbc35387da97c
**North star (Brett):** every locality ends in exactly one state — apply-ready, actively laddering, or dark-listed *with reasons* — and the human review surface stays under ~25 jurisdictions.
**Evidence strategy (Brett):** keep going until information is found — crawl harder → bulk sources → manual list, in fallback tiers. Nothing parks permanently.
**Corroboration (Brett):** single-source promotes *if the data is complete* — official source + on-topic quote + domain + ≥1 contact channel.

Baseline at plan start: apply-ready **511→514** / 2,514 · one-away **333** · two-away **1,670** (OH 1,229 / KY 441) · fleet 34 procs (roster-capped) · outbox draining ~22K.

---

## WS-1 — Evidence fallback ladder  ✅ built

Claim records are now `{result, at, misses}` — every miss bumps `misses`, tier = `min(misses,4)`, cooldown scales `12h→24h→36h→48h→72h`, `enriched` resets to tier 0. **Nothing ever exits the work pool** — tier-4 keeps retrying at 72h.

| Tier | Sources | Status |
|---|---|---|
| 0 | Local site + county site, 8pg (existing) | live |
| 1 | Same sites, `deep:true` + **24pg** + `DEEP_KEY` links (minutes/agendas/trustee/ordinance/fee-schedules — where small-jurisdiction evidence hides) | ✅ `office-research.mjs` + `gap-researcher.mjs` |
| 2 | Tier-1 + alternate-domain discovery (role-biased DDG search already in `discoverSite`) | ✅ via deep+search chain |
| 3 | **County-doc scan** — crawled county pages scanned for the jurisdiction BY NAME + permitting language; matched sentence becomes the responsibility quote | ✅ `gap-researcher.mjs` |
| 4 | Association/directory — OTA/OML/KLC/KACo rosters via `rosterContact` (existing local-researcher path; seeds offices, never sole role-proof) | ✅ existing |
| — | **Dark list** — misses≥8 → `research_status:'dark'` + `dark_reasons`, keeps 72h retry, auto-clears on enrich | ✅ built |

## WS-2 — Bulk source harvests

| ID | Source | Status |
|---|---|---|
| W2.1 | OH BBS non-residential certified list | ⏸ **blocked** — doc GUID undiscoverable via plain fetch (WCM portal renders doc links via AJAX; the residential GUID serves the residential file regardless of filename). Residential list already covers building/electrical/sign statewide. |
| W2.2 | OH state electrical-inspection agencies | folded into W2.1 note |
| W2.3 | KY DHBC statutory roster (KRS 227.480) | ⏸ **blocked** — dhbc.ky.gov is a JS SPA; MP-5.1 verbatim re-fetch can't find any quote → would die as `stale_source` (the regional-harvest failure repeated). `kyElectricalRoster()` still adds corroboration hosts for KY electrical evidence. Script kept, unrostered, header documents the block. |
| W2.4 | KY county planning-commission member lists | ✅ covered organically by tier-3 county-doc scan (county pages naming member jurisdictions) |
| W2.5 | OH county planning depts | ✅ same tier-3 mechanism |
| W2.6 | County engineer/ODOT ROW | backlog — next bulk source |

## WS-3 — '?' county identity backfill  ✅ built, running

Root cause: Ohio's municipal GIS layer carries **no county attribute** (`county:''` by design) — 206 OH city/village profiles lacked `parent_county`; 2,512 localities lacked `county_name`.
`.audit-work/county-backfill.mjs`: geocode (Nominatim, ≤1/s) → TIGER county point-in-polygon → write `parent_county`/`county_name` on unambiguous result only; localities inherit linked-profile county (no geocode). Ambiguous → flagged, never guessed.

## WS-4 — Data integrity verification  ✅

| Check | Result |
|---|---|
| Duplicate profile groups (unmarked) | **0** (dedupe merge landed: +4,433 roles re-unified) |
| Same-id office dupes | **582→0** — found a *stale-writer regression*: workers writing pre-dedupe arrays re-corrupted after the cleanup. **Fixed at the write boundary**: `dedupeOfficeRows` runs inside `enqueue` + `mirrorApply` — every write path self-heals, can't regrow. |
| Pure placeholder offices | ~12 residual (strip ran) |
| Journal health | profiles-oh journal ~16MB, folding correctly; 40MB inline-fold valve armed |

## WS-5 — Verification completeness  ✅

- `completeness_flag:'no_contact'` on verified offices with zero contact channels — stays verified (evidence is real) but joins the review surface + queues a contact-fill.
- `parked` offices = denied-unproven (the gate working), not failures.

## WS-6 — Yield & ops  ✅

- **Headless N-strike**: `hl-` claims track `misses`; 3+ consecutive render-empty misses → 7-day deprioritize (still retried weekly). Render cycles go to fresh sites.
- Supervisor: spawn registry + per-tick excess-kill + roster ≤33 (was 74).
- Mirrors: journal append-only writes (was 80MB rewrite per write — the crash cause).

## WS-7 — Dashboard + tracking

- Gap-miss events carry `t{tier}` — dashboard can show ladder distribution.
- `gap_res_dark` events surface dark-list adds.
- `county_backfill_done` / `roster_harvest` / `fleet_cull` stages classified.

## Still open / watch

- **W2.1/W2.3** blocked on verbatim-verifiable sources (documented above).
- Outbox ~22K→31K transient (dedupe+prop+backfill writes); drains at bulk rate.
- KY electrical_inspection coverage low (346) — needs the DHBC source or per-jurisdiction county-page hits.
- Non-residential BBS cert distinction — residential entries currently cover the roles; revisit if a fetchable non-res doc appears.

## Error-class guards (won't regress)

1. **Field-name drift** — audits print key-coverage stats before trusting (`county_name` vs `parent_county.name` etc.)
2. **WMI-blind respawns** — spawn registry, existence-checked
3. **Shared-file rewrites** — journal append, fold at read
4. **Silent fallback** — flusher reports `mode` per pass
5. **Unverifiable bulk sources** — no entry ships unless its quote survives MP-5.1 re-fetch (or binary-liveness); provenance-flagged directories can't promote alone
6. **Stale-writer regression** — offices[] deduped at the write boundary; array writes from stale workers can't re-corrupt
7. **Never-merge** — type-word agreement + county scoping in every matcher/harvest/merge path

---

# LP — LOCAL PIPELINE (2026-11-05): move gather/scan/store off Base44

**Why:** `UploadFile` + `InvokeLLM` are the two integration-credit meters. The document gather → archive → OCR/text → rule-extraction chain ran server-side on every source. Local compute is free; Base44 should only see controlled writes + a bounded upload trickle.

**Control flag:** `GlobalSettings[permittingPipelineMode].mode = 'local'` (created 2026-11-05 via staffPermittingDocWrite). `permittingResearchBacklogDispatch` + `sourceMonitorScan` auto-cycles early-return `{skipped:'local_pipeline_mode'}` when set; **manual admin invocations still run the full server-side path** — staff clicks keep working and act as the slow-burn fallback.

## LP-1 — Local doc pipeline (`scripts/permitting-doc-pipeline.mjs`, rostered ×1)

Drives the REAL `archiveKnownJurisdictionSource` + `extractKnownSourceText` shared code with local adapters:
- fetch via `safeExternalFetch`-equivalent local fetch, sha256+bytes computed locally, bytes → `.audit-work/source-files/<sha256>.<ext>`
- `uploadFile` adapter writes the local file (no UploadFile call) — `file_url` is a `local://` marker the uploader later swaps for the real one
- profile CAS via `staffEntityWrite update` + `expected_updated_date`; catalog/segment/run rows via `staffPermittingDocWrite`
- **Singleton PID-file** (two instances CAS-war each other's claims — learned the hard way)
- **Contention policy:** one transition attempt per profile per pass; conflict → in-memory defer 12m (30m on rate-limit), move on. Hot township rows quiet down; the pass revisits. Never hammers the shared 140/60s budget.

## LP-2 — Devin-local extraction (`scripts/permitting-rule-extractor.mjs` + `scripts/lib/devin-llm.mjs`)

- Queue units: `.audit-work/devin-queue/*.json` `{id,kind,prompt,schema}` → outputs `.audit-work/devin-out/<id>.json`
- `runBatch()` stages ≤25 units into a session dir, spawns local `devin.exe -p` (NO `--cloud` — local binary only), watchdog 20m, ≤2 concurrent sessions via mkdir-slot lock
- Extraction contract: existing `extractionPrompt` + `EXTRACTION_RESPONSE_SCHEMA`, `method='literal-page-v1'` — imported from `base44/shared/permittingRuleEvidence*.mjs` (byte-exact, no reimplementation)
- Every candidate validated through `validateRuleCandidates` — verbatim citations in page text or rejected (`rx_out_bad`)
- Runs write `PermittingRuleExtractionRun` via `staffPermittingDocWrite`; admin review/import path unchanged

## LP-3 — Bounded upload lane (`staffArchiveFile` fn + `scripts/permitting-file-uploader.mjs`)

- `staffArchiveFile`: session-authed, bytes→`UploadFile`→`file_url` (the only sanctioned UploadFile consumer)
- Uploader drains `.audit-work/source-files/` at ≤15/min, sha256-dedupe index `.audit-work/upload-index.json`, swaps `local://` markers → real `file_url` on PermittingSourceDocument via CAS, emits `up_ok`
- In-app PDF viewer keeps working — files land in real Base44 storage, just at a controlled trickle

## LP-4 — Local source monitor (`scripts/permitting-source-monitor.mjs`)

- Port of `sourceMonitorScanner.ts` (cheapFetch/detectChange/link-diff — 183 LOC, same semantics)
- Fetch+hash local; `changed` → devin-llm assessment (replaces InvokeLLM `assessRegulatoryImpact`)
- Writes SourceMonitorState + RegulationAlert + PermittingSourceDocument hash via `staffPermittingDocWrite`; `permittingRuleInvalidate` still invoked (it's not an integration credit)
- Conservative on failure: `mayAffect:true` + review flag, never erases

## LP-5 — App-side gate

- `permittingPipelineMode:'local'` flag checked in `permittingResearchBacklogDispatch` (before collection-cycle claim) + `sourceMonitorScan` (before scan) — `!manual`/`isScheduledRun` only
- `staffPermittingDocWrite` allowlist: PermittingSourceDocument/TextSegment/RuleExtractionRun/PermittingRule/SourceMonitorState/RegulationAlert + GlobalSettings **restricted to `permittingPipelineMode` key only**
- All InvokeLLM functions stay deployed (review path, manual fallback, post-Dec-1 slow-burn)

## LP-6 — Per-office file ownership (2026-11-05)

Every office — new or existing — owns a nested dossier; file pipeline state is per-office visible on the dashboard; the app stores a durable office→file link.

**Layout** (`scripts/lib/office-files.mjs` is the only writer):
```
.audit-work/office-files/<st>/<jurisdiction-slug>--<id4>/<office-slug>--<id4>/
  jurisdiction.json          (per jurisdiction dir)
  office.json                (dossier: ids, roles, verification, contact)
  sources/<sha256>.<ext>     (fetched bytes, hash-named → dedupe intact)
  text/<sha256>.txt          (extracted page text, appended per batch)
  extraction/unit-|out-|evidence-<id>.json
.audit-work/office-files/index.json   (dashboard rollup — best-effort, rebuildable)
.audit-work/source-files/    (flat pool = spillover only when owner unresolvable)
.audit-work/office-files/zz/zz-unassigned--none/unassigned/  (unmatched → visible, never guessed)
```

**Resolution order** (`resolveOffice` in office-files.mjs): `issuing_office` name → `offices[].name` normalized match (exact then unique containment) → doc-url host vs `contact_website` host. Ambiguous → `unassigned/` under the jurisdiction dir. NEVER merges offices or guesses.

**Stage vocabulary** (per file in the index): `fetched → extracted → queued → analyzed → validated → uploaded → rules`, plus terminal **`link_only`** — docs that hit `archive_state` `blocked`/`failed` terminal keep `official_url` and surface as link-only (the app's "Open official source link" fallback already renders them; nothing to upload).

**Wiring**:
- doc-pipeline: `uploadFile` writes into owning office `sources/` (ctx captures doc.url from archive onProgress); `readAndExtract` appends `text/<sha>.txt` + indexes `extracted`; `link_only` scan each pass; catalog registration stamps `office_id`+`issuing_office` on new PermittingSourceDocument rows (CAS update post-create — the durable app-side link for the InvokeLLM hand-off)
- file-uploader: indexes `uploaded` on verified swap (key recovered from path via `keyFromPath`, else re-resolved)
- rule-extractor: `unit-|out-|evidence-*.json` into office `extraction/`; indexes `queued`/`analyzed`/`validated`/`rules`; run rows now carry `claim_token` (was missing — every write was being rejected)
- dashboard (`live-serve.tmp.mjs`): `officeFiles` in `status()` (index read, 15s TTL, zero remote calls) + "OFFICE FILES" card — totals strip + per-office stage chips, top 24 by recency
- migration (`.audit-work/migrate-office-files.mjs`, one-shot): created 14,042 dossier skeletons for ALL locality offices; hardlinked 10 flat files into office dirs (flat paths stay valid for in-flight uploads); stamped `office_id` on 49 existing catalog rows; 44 orphan downloads → `zz-unassigned` (archived bytes whose markers never CAS-persisted — they re-archive on their own)

**Permanence (deployed 2026-11-05):** checkpoint `6aec6dbc94285d0d41b7e59b` shipped to live — `staffPermittingDocWrite`, `staffArchiveFile`, the two pipelineMode gates, and the `office_id` field are now in the published bundle (functions no longer expire off the live URL).

**Rollback:** delete `.audit-work/office-files/` + `index.json` — nothing else depends on it (index is pure UI state, rebuildable from entity data + tree). To disable the whole local pipeline: set GlobalSettings `permittingPipelineMode.setting_value.mode` to anything but `local` → server auto-cycles resume; local workers can be stopped or left (their writes remain valid). Pending `local://` markers drain via file-uploader or re-archive server-side. The `office_id` field is additive — safe to leave populated forever.

## LP-7 — Error & review backlog burn-down (2026-11-05)

Once in-queue work drains, `scripts/permitting-review-burn.mjs` (rostered, 10-min cycles, drain-gated heavy passes) works everything stuck — "everything stuck" per Brett: evidence-ready `needs_verification` offices, research-needed offices, `office_res_review`, archive errors, geocode misses, blocked/not_started queue rows, rule candidates, persistent address failures. Irreducibles land in a **ranked human queue** (`.audit-work/human-review-queue.json`, scored by unblock impact + apply-ready distance); evidence-pass = resolved, no per-item human click.

**Passes:**
- **P1** impact-orders localities (1 missing apply-role first, evidence-backed only) into `.audit-work/verify-first.jsonl` — the existing verifier already honors that file; no duplicate writer
- **P2** queue triage — `blocked` rows: sweep-cleanup paper/remnant townships are **already terminal at `blocked`** (enum has no `closed`; `resolved` is invalid — see incident below) → skipped as `parked`; other rows requeue `not_started` when `retry_count<3`, else ranked
- **P3** dead-URL rediscovery — `office_res_review` events re-probed live first (stale events lie: Onton KY's "dead" PDF was alive → requeued); then www/bare/http→https alternates with HEAD→GET fallback (gov sites 403 HEAD); live alternate → `contact_website` fix + row requeue; dead → wayback snapshot lookup → ranked queue
- **P4/P5** geocode misses (deterministic — Nominatim+Census both failed → parcel-by-address or manual) + queue-hygiene fix-list → ranked queue
- **P6** rule-candidate auto-import — claims-ledger enumeration (`rule-extract-claims-*.json`; extractor now stores `run_id` on writes), orphan runs resolved via `permittingRuleReview action:'run_by_key'` (deployed — the only session-token read path for backend-only `PermittingRuleExtractionRun`), then **`candidate_handoff`** (the app's own `verifyRuleForApproval`+`assertApprovalSourcesCurrent` gates) → `import_candidate` only for `evidence_ready:true`. Import ledger `.audit-work/rule-import-claims.json` makes it idempotent; `import_uncertain`/conflicts/not-ready stay human (grouped one-item-per-run)
- **P7** ranked queue — deduped by surface|jurisdiction|item, `pick_hint` carries the `--pick` command for geocode items

**Verified live (first fixed-code cycle):** `parked:30 requeued:2` · `dead urls fixed:1 to-human-queue:12` (incl. one stale-event recovery) · `runs:25 ids-resolved:25 rules imported:0 held-for-human:148` · queue depth 319 (geocode 217, hygiene 70, rule_import 20, office_review 12)

**Upstream finding:** 100% of extraction-complete `PermittingSourceDocument`s sit at `verification_status:'needs_verification'` → every candidate fails `candidate_handoff` ("Citation source is unverified, changed, or belongs to another authority"). Source authority review (`permittingSourceAuthorityReview`) requires literal page quotes + `current_source_confirmed` staff attestation **by design** — it is the dominant human-queue dependency; once a doc is verified, its run's imports unblock automatically next cycle.

**Incident + fix (2026-11-05):** early P2 wrote `status:'resolved'` for paper townships — **not a valid enum** — and closed 21 cleanup-parked rows. All restored to `blocked` + canonical cleanup `missing_next` via CAS updateMany (point-verified: RIDGEVILLE reads `blocked` with correct message). P2 now treats the cleanup signature as already-terminal. Lesson recorded: check entity enums before writing status fields.

**Deployed:** checkpoint `6aec81ad044ffa745ee54065` — additive `run_by_key` action on `permittingRuleReview` (admin-gated, returns run_id/status only, regex-bounded request_key).

**Dashboard:** "backlog burn-down" card — needsVerif vs verifiedOffices, queue not_started/blocked, auto-import ledger count, human-queue depth (red when >0); `reviewBurn` producer heartbeat.

**Rollback:** stop/remove the `permitting-review-burn` roster line (supervisor respawns nothing); delete `.audit-work/human-review-queue.json` + `rule-import-claims.json` + `verify-first.jsonl` (all rebuildable); `run_by_key` is read-only additive — safe to leave. Requeued queue rows self-heal via normal researcher passes.

## LP — operational notes

- **Devin login:** `devin.exe` standalone needs ONE browser login before the fleet can call it headless — until then `rx_auth_needed` events fire and units queue
- Roster +5: doc-pipeline, rule-extractor, file-uploader, source-monitor, review-burn (supervisor manages them like the rest)
- Dashboard: producer cards + heartbeat rows + stage labels for all LP events
- `public/permitting/sources/` rejected as archive store — deploy 50MB `dist/` cap
- `.ts` shared files aren't directly importable — monitor ported to `.mjs`; extraction imports are all `.mjs` already
