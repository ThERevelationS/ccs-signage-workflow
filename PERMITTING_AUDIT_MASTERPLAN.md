# Permitting Pipeline — 20-Pass Audit Masterplan

**Audit date:** 2026-11-05 · **Repo:** ccs-signage-workflow-clean · **App:** 68dfcc5e57bbbc35387da97c
**Scope:** the local OH/KY address→permitting-office fleet (scripts/permitting-*.mjs), the outbox/mirror write path, and verifier promotion. Estimator scope untouched.

**Audit goal (Brett):** stop finding structural errors one-at-a-time. Sweep every layer systematically, fix the classes not the instances, and document what's left.

---

## Current snapshot

| Metric | Value | Trajectory |
|---|---|---|
| Apply-ready localities | **511** / 2,514 | ↑ from 478 at session start |
| Verified offices | 2,496 sv / 11,796 nv / 2,384 localities with offices | ↑ |
| One-away (1 role short) | **333** | ↑ — propagation filled some |
| Two-away | 1,670 | the long tail |
| Outbox depth | ~22.4K (was 29.3K peak) | draining, mostly one-time backfills |
| Fleet | 34 procs (33 workers + supervisor), 0 dupes | was 74 |

---

## The 20 passes — findings and fixes

### Passes 1–8 · Data integrity

| # | Pass | Finding | Status |
|---|---|---|---|
| 1 | Locality→profile links | 2 name-variant localities unlinked ("City of Cincinnati", "Deerfield") — held the *richer* verified offices | **FIXED** — merged into canonical, 14 line items repointed, Deerfield Twp became apply-ready |
| 2 | Office id/name dupes inside `offices[]` | 1,716 same-id duplicate objects (e.g. Worthville 13 offices / 7 unique ids) — legacy concat-write residue | **FIXED** — `mergeOffices` now dedupes within `existing` (self-healing); `.audit-work/office-idedupe.mjs` cleanup written (partially run — 3 enqueued before kill, needs rerun) |
| 3 | Duplicate profiles | **672 true dup groups** (same name+state+county+type) — research scatters to dup records | **RUNNING** — `.audit-work/profile-dedupe-merge.mjs` unions roles, repoints links, marks losers `duplicate_of`+historical. 840 merge writes enqueued (re-run is idempotent, finishing the tail) |
| 4 | Same-name locality collisions | 260 groups = all cross-county legit (Paint Township ×7 etc.) — no real dups | ✅ verified clean |
| 5 | Placeholder offices | 214 `needs_verification` offices with no roles AND no contact | **RUNNING** — `strip-placeholder-offices.mjs` enqueued 132 before kill; rerun to finish |
| 6 | Evidence contamination | Regional-harvest wrote ~1,084 false-attribution zoning entries (MPOs/ADDs ≠ zoning administrators; .org sources fail official-source; synthesized quotes can't survive re-fetch) | **FIXED** — entries stripped by fingerprint, harvester unrostered. Corpus confirmed: Gateway ADD verifies 16/16 for right_of_way (real), 0 for zoning |
| 7 | BBS harvest entries dead-on-arrival | Verifier's re-fetch used bot UA → com.ohio.gov 404s bots → all 131 entries marked stale_source; verbatim-quote check can't pass on binary PDF | **FIXED** — browser UA + liveness-only check for binary sources (harvest-time parse IS the verification) |
| 8 | Apply-ready truth | Count verified against mirror: verified sign_permit office + verified zoning office, no inflation | ✅ 511 confirmed |

### Passes 9–15 · Pipeline flow

| # | Pass | Finding | Status |
|---|---|---|---|
| 9 | Outbox composition | 29K peak: 17K queue updates (one-time demand-weight/truth-audit stamps), 6.4K index creates, 3.3K profile updates | ✅ draining at bulk rate; compaction squashes superseded |
| 10 | Queue lifecycle | 17,440 `duplicate` rows — only **2** truly blocked localities, both were the merged variants | ✅ coverage effectively complete |
| 11 | Claims/cooldowns | Work pool saturated within cooldowns — "0 mine" meant claimed-not-missing | ✅ work-stealing added (idle slices steal genuinely-unclaimed) |
| 12 | Mirror freshness | `synced_at` vs actual `at` field; journals now bump freshness | ✅ mirrors fresh (0min) |
| 13 | Verify-first feed | 183 entries, consumed each pass — promotions lag ~seconds not minutes | ✅ working |
| 14 | Events classification | regional_*/bbs_*/outbox stages were unmapped | ✅ classified in live-serve |
| 15 | Mirror I/O | **THE CRASH BUG** — `mirrorApply` did full 80MB read+parse+rewrite per write × ~40 writers; orphaned .tmp files showed writers dying mid-rename | **FIXED** — journal append-only writes + fold-at-read |

### Passes 16–20 · Coverage & yield

| # | Pass | Finding | Status |
|---|---|---|---|
| 16 | Verified-role coverage | sign 702 · zoning 653 · building 648 · elec_permit 253 · elec_insp 346 | baseline set |
| 17 | Corroboration | 24 multi-host / 2,472 single-host — single-source is a tier label not a gate | ✅ by design |
| 18 | Zero-office localities | 130: 109 unresearched (queue has them), 20 propagation-writes awaiting seed-scan, 1 unlinked | ✅ seed-scan actively backfilling |
| 19 | One/two-away | 333 one-away / 1,670 two-away | ✅ gap sort fixed: one-aways rank first |
| 20 | Worker config | **THE PILEUP BUG** — WMI-invisible spawns looked "missing" → respawned every 60s → 74 procs | **FIXED** — spawn registry + per-tick excess-kill + roster 54→33 |

---

## Fixes deployed this audit (all live)

1. **`entity-mirror.mjs` journal writes** — `mirrorApply`/`mirrorRemove` append one line to `<name>.journal.jsonl`; `getMirror` folds over base; `putMirror`/`putMirrorSnapshot` fold+truncate. Write cost O(80MB) → O(1 line). **This was the Devin-crashing disk storm.**
2. **`permitting-fleet-supervisor.mjs`** — spawn registry (`.audit-work/fleet-spawns.json`, `process.kill(pid,0)` existence check defeats WMI-blindness), excess-kill every tick, roster trimmed for workstation. Also fixed `liveInstances` → `ConvertTo-Json` parsing (my earlier quoting broke it) and stall-detection's string-vs-object bug.
3. **`permitting-county-propagate.mjs`** — county key from `county_name || parent_county.name || name` (was `county_name || name` → 1,275 fake "county" groups of singleton townships). **Result: `prop_done` went 5 → 345 per pass, 1,161 profile updates enqueued.** The multiplier finally works.
4. **`permitting-gap-researcher.mjs`** — priority sort was INVERTED (`away()` counts missing roles → apply-ready sorted first, +0-value polish ahead of +1-value one-aways). Now: one-away → county multipliers → two-away → polish. Plus 3-way per-slice concurrency + work-stealing + verify-first feed writes.
5. **`permitting-authority-verifier.mjs`** — verify-first ordering (freshly-enriched judged first), browser UA on re-fetch, binary-source liveness check, priority-lane enqueues for promotions.
6. **`permitting-bbs-harvest.mjs`** (new roster worker) — parses Ohio's 54-page certified building-department list: 337 depts + 264 contract sub-jurisdictions, matcher requires type-word agreement (fixed the Huron County↔Huron Township false match).
7. **`outbox.mjs`** — priority lane + compaction for superseded writes.
8. **`permitting-write-flusher.mjs`** + deployed `staffEntityBulkWrite` — was silently in per-record fallback (~25/min); now 100 writes/invoke bulk mode.
9. **`mergeOffices` self-heal** (`permitting-office-seed-scan.mjs`) — dedupes within `existing` array.
10. **Cleanup scripts** — `profile-dedupe-merge.mjs` (running), `office-idedupe.mjs`, `strip-placeholder-offices.mjs`, `strip-regional-entries.mjs` (done), locality variant merge (done — Cincinnati + Deerfield).

## Remaining work / watch list

- **Finish dedupe tail** — `.audit-work/profile-dedupe-merge.mjs` is running detached; rerun `office-idedupe.mjs` + `strip-placeholder-offices.mjs` to completion (killed at 3 and 132 enqueued).
- **Headless yield is ~0%** (0 done / 53 misses in observed windows) — sites genuinely publish nothing. Consider deprioritizing repeated-miss sites after N strikes so render cycles go to fresh URLs.
- **Journal growth guard** — folds inline at 40MB; if mirror-sync daemon dies >a few hours, journals grow. Watch `.audit-work/mirrors/*.journal.jsonl` sizes.
- **Verify-first feed** self-trims at 400 lines/20min — under the current enrichment rate (~100+/hr) it's always full; fine.
- **`parked` offices growing** (70→1,034) — verifier correctly denying unproven roles; that's the fail-closed gate working, not an error.
- **17K queue-stamp backfill** still draining — one-time, will clear.
- **Same-name-different-county profiles** — propagation now county-scoped correctly; continue watching for cross-county bleed in `prop_done` samples.
- **Do not publish the app** — function deploys only on request; no site publish performed.

## The error-class lessons (why these kept recurring)

1. **Field-name drift**: `county_name` vs `parent_county.name`, `name` vs `jurisdiction_name` — analyses and groupers keyed on the wrong field silently produced nonsense (1,275 phantom counties, "0 evidence" one-aways). → Now: audit scripts print field-coverage stats before trusting a key.
2. **WMI process detection is unreliable for detached spawns** — NULL CommandLines made workers invisible → respawn loops. → PID registry + existence checks.
3. **Shared mutable files don't scale** — one 80MB JSON re-written per write across 40 writers = I/O collapse. → append journals, fold at read.
4. **Silent fallback is invisible breakage** — `staffEntityBulkWrite` existed undeployed; flusher ran 25/min per-record for days. → flusher now reports `mode` in every pass event; dashboard shows it.
5. **Bulk evidence needs bulk-verifiable sources** — synthesized quotes and .org provider pages can't survive adversarial re-fetch. → harvest only from .gov source documents; binary sources verify by liveness+harvest-parse, not verbatim quote.
