# SCALE MASTERPLAN — many concurrent users, zero loading stalls

Goal: 25-50 staff online at once (CONFIRMED target) — kiosk + office + managers + cron + fleet, no
user-visible 429s, no "app is busy" banners, and page loads that stay fast under
concurrency — not just fast for one user.

## Root cause (measured, not guessed)

ALL entity traffic in this app converges on ONE bucket:

- Every frontend read goes `staffDataRead` → `asServiceRole` → **the app's single
  service-token caller budget** (140 entity calls / 60s).
- Every frontend write goes `staffEntityWrite` → same bucket.
- Every backend function action (`timeClockAction`, `smartsheetSyncAction`,
  `queueFeed`, `notificationAction`, etc.) → same bucket.
- Every cron → same bucket. The local permitting fleet (~16 workers, running on
  Brett's own session token) → same bucket.

**Per-user capacity does not scale today: N users do not multiply the budget —
they divide it.** 20 staff polling status + opening pages while a cron and the
fleet run = guaranteed saturation → retry waves → "loading issues."

The fix is not one thing; it is reducing service-bucket spend per user until
50 concurrent sessions fit inside ~60% of the ceiling.

## Budget math (targets)

| Source | Today (est.) | Target |
|---|---|---|
| Page mount burst | 16-24 calls | ≤10 (batch + bootstrap feed) |
| Ambient polls / tab / min | ~8-12 | ≤4 (leader election + longer TTLs) |
| `status`/`status_lite` call | 3-12 entity reads | 0-1 (memo layer) |
| Fleet (all workers) | saturates pool for stretches | ≤30 calls/60s hard cap during work hours (DECIDED) |
| Cron fire-minutes | wave (100+ inside 60s) | paced ≤40/min each |

Sustained interactive budget available for staff: ≥100 calls/60s at all times.

---

## WS-0 — Instrumentation & load harness (do first; everything else is measured against it)

- [x] Server-side per-invocation entity-call counter: `entityCallIsolateStats()`
      added to `withEntityRateLimitRetry`; `entity_calls` delta now returned in
      `staffDataRead` (batch + single) and `timeClockAction` (`status_lite`,
      `status` clocked_in/clocked_out) responses. **Visible after next publish
      only** — the app URL serves the last published function build.
- [ ] `window.__ccsRequestStats` already reports logical calls/retries/gaveUp —
      add a per-action breakdown dump helper for field measurement.
- [x] Load harness: `scripts/load-sim.mjs` — N concurrent sessions
      (roster → status_lite → status → corrections, 4s think time), reports
      p50/p95/p99, HTTP status mix, entity_calls where visible.
- [x] Baseline recorded 2026-11-07: **N=10 → 78/120 calls 429'd, p50 1.7s,
      p95 3.9s, p99 5.2s** — the shared bucket saturates even at 10 sessions
      (fleet night-budget 80/min was also spending during the run).
- [x] Post-memo re-run 2026-11-09: **429s 78→18, p50 1.7s→239ms, p95 3.9s→1.76s.
      Live-verified: 12 concurrent status_lite → 2 entity reads.**
      NOTE: the api/apps/functions route serves the DEPLOYED build (not just
      published) — all function-side memos are live for real users already.

## WS-1 — In-function memo layer (biggest single win for read scale)

Deno function isolates persist module state across warm invocations. A short-TTL
in-memory response memo absorbs concurrent bursts for ADVISORY reads at near-zero
entity cost.

- [x] `base44/shared/invokeMemo.ts`: per-key memo (scope+key), TTL per action,
      `bust(scope)` on write paths, `bypass: true` flag honored.
- [x] Applied to: `status_lite` (5s TTL), `list_correction_requests` (10s),
      `who_is_in` (8s). `staffDataRead` already had a 45s in-isolate cache —
      covered.
- [x] Write bust: pre-dispatch bust for every action not on the read allowlist
      (`TIME_CLOCK_READS`); frontend `timeClockReadCache` sends `bypass: true`
      on reads within 10s of a write so post-write reads always refetch —
      closes the mid-mutation re-cache race.
- [x] Extended (2026-11-09): `status` ensureState+recovery chain memoized 3s
      (`tcstate`, read-only + non-bypass only — mutations get fresh state);
      status advisory summaries memoized 15s (`tcreview`: unresolved punch
      review, corrected shift review, work-day prompt); `manageTraining`
      bootstrap reads memoized (mine 10s, items/assignments 15s, roster 60s,
      settings 60s). **Remaining spend: `status` full payload ~9 reads —
      mutable punch state, bounded by WS-2.**
- [ ] Guard: NEVER memo actions whose response can differ by caller on the same
      payload (scope key already includes session token where relevant — verify).
- [ ] Honest limit: cold isolates still read; burst absorption only. This is
      why WS-2 exists for the truly hot shared datasets.

## WS-2 — Server read-through snapshots for shared datasets

The expensive surfaces are per-user status and shared collections. Replace
N-table reads-per-invoke with a single maintained snapshot read.

- [x] `status_lite` read-model on `TimeClockEmployeeState.lite_snapshot`
      (DEPLOYED 2026-11-13, activates when the schema field publishes):
      steady lite responses are stored back on the state row (CAS-guarded
      updateMany) with `fp_state` = hash of every state field except
      `updated_date`/`lite_snapshot` and `fp_entry` = active entry's
      `updated_date`. Readers: 1 call clocked-out, 2 calls clocked-in
      (was 4-6). Break/pause rows covered by fp_state — their only write
      sites sit inside state-bracketed transitions. The time-dependent
      missed-punch gate is re-evaluated at serve time with a fresh clock,
      so no expiry math and no staleness. FULL/transitional results are
      never cached. Until the `lite_snapshot` field provisions, the store
      is a silent no-op and the path behaves exactly as the old build —
      verified `updated_date` unchanged, zero CAS risk.
- [ ] `who_is_in` live-status tile: already 1 filtered read + 8s memo —
      no snapshot needed.
- [ ] `staffDataRead` hot entities (AuthorizedEmail roster, GlobalSettings
      configs): entity-level snapshot with write-through invalidation in
      `staffEntityWrite` — reads hit 1 record instead of a table scan.
- [x] Snapshot staleness contract implemented: version-pinned fingerprints,
      mutable inputs verified per-read (entry.updated_date), fresh-time
      re-evaluation of time gates, any doubt → live build path.

## WS-3 — Frontend concurrency multipliers

- [x] Cross-tab leader election for ambient polls: `src/lib/pollLeader.js`
      (BroadcastChannel `ccs-poll-leader` + localStorage lease ~1.5×interval,
      crash-safe) wired into `TimeClockStatusContext` — the 180s status poll
      now runs in one tab and broadcasts; followers apply the result.
      Leader releases on hide/unmount for fast handoff. Kills the N-tabs
      multiplier on the hottest ambient poll.
- [~] Mount bootstrap: consolidate the 16-24 mount calls into the existing
      `entities:` batch + a single "app bootstrap" payload (session verify +
      prefs + counts + feed head) — one invoke instead of a burst.
      **v1 shipped 2026-11-09:** new `appBootstrap` function returns session
      identity + workspace prefs/profiles + notification unread in ONE
      invoke; `primeReadResponse(fn,payload,data)` seeds the read-lane TTL
      cache so `prefs_get` and `unread_count` callers resolve client-side.
      WorkspacePreferencesProvider consumes it at ~3-5s with a prefs_get
      fallback. Remaining v2 candidates: announcements active_feed (70s gate
      outlives TTL — needs longer TTL or event-driven invalidate), roster
      head for kiosks, attention_feed head for AttentionBell's 15s gate.
- [x] Read-lane audit 2026-11-09 (PUBLISHED): every frontend-invoked gateway
      classified. `queueFeed` (pure feed, no actions) added to unconditional
      reads; `manageSops` (bootstrap/list/get/ack_report) and `manageTraining`
      (bootstrap/report) added per-action — all three previously rode the
      unthrottled write lane (no pool, no dedupe, no 429 retry) and were the
      top 429s in the observed mount wave. Bootstrap TTLs 15s added. Remaining
      unclassified fns are write/admin surfaces or low-frequency page calls.
- [~] Confirm every ambient poll sits behind the ~75s `enabled` gate
      (AttentionBell, SyncConflictAlert done — sweep for stragglers).
      Partial: `TrainingSection` bootstrap and `SmartsheetSyncWidget` first
      read now defer ~4-7s w/ jitter past the mount burst (invoke-cap wave
      observed on preview mount: boardFeed/staffDataRead/timeClockAction/
      manageTraining/notificationAction/opportunityWorkspaceAction all at
      t=0). Mount-time page reads (queueFeed/staffDataRead/boardFeed) still
      fire at t=0 — those ARE the page data, only consolidation fixes them.
- [x] Idle-tab full suspension: tabs hidden >10min stop ALL ambient work
      (partial coverage exists via `pauseWhenHidden` — extend to everything
      that isn't user-visible). **Verified done 2026-11-09: `usePolling`'s
      `isHidden()` check skips every network tick in hidden tabs (default
      `pauseWhenHidden: true`), and the only raw `setInterval` that touches
      the network (SmartsheetSyncWidget) also guards `document.hidden`.
      Remaining unguarded intervals are UI-only ticks (timers, progress
      bars, countdowns) — zero entity spend.**

## WS-4 — Fleet isolation & budget ceiling (storm source)

The fleet is the single largest discretionary spender and it shares the same
bucket as every user.

- [x] Hard fleet ceiling (DECIDED: 30 calls/60s): **already implemented** —
      `scripts/lib/read-ledger.mjs` `paceCall()` is a fleet-wide cooperative
      token bucket (`.audit-work/.call-ledger.jsonl`) called before every
      gateway invoke in all 13 workers. Business-hours budget lowered
      40→30 (`PERMIT_CALL_BUDGET_DAY`), night stays 80. NOTE: only NEW worker
      spawns pick up the change — running processes hold the old constant.
- [ ] Fleet "business hours quiet mode": during work hours the big spenders
      (authority verifier, office researchers, local resolver sweeps) run
      `--once` hourly passes instead of continuous loops.
- [x] ~~Second service-token/identity for the fleet~~ — **CLOSED 2026-11-07:
      impossible.** Secrets inventory shows one service identity (the app's
      implicit service role) — `secrets list` holds only env vars
      (SMARTSHEET_API_TOKEN, FILEBRIDGE_HMAC_KEY, etc.), no second caller
      token. All entities are backend-only RLS, so NO non-service caller can
      even read them — a "fleet identity" could not bypass the bucket even if
      it existed. The 30-call cap + business-hours quiet mode IS the isolation.

## WS-5 — Hot-path latency (continue the status parallelization)

- [ ] `clock_in`/`clock_out`/break/labor actions: audit sequential entity reads;
      batch independent ones like `status` (done: ~10 serial → ~3 waves).
- [ ] `boardFeed`/`queueFeed`/`staffDataRead` internals: same treatment where
      reads are independent.
- [ ] `monitor_stale_shifts` (Time Clock cron): confirm it reads only
      clocked-in states, not a full-table scan.

## WS-6 — Payload diet

- [ ] `fields` projection on the fat reads: TimeEntry history, WorkOrder board,
      roster (project only fields the surface renders). `staffDataRead` already
      supports `fields` — the calls just don't pass it.
- [ ] Response trimming inside hot functions: drop fields the client never
      reads from `status`/feed payloads (smaller bodies = faster parse on
      low-end kiosk hardware).

## WS-7 — Data hygiene (the "one bad row breaks a batch" class)

- [ ] Validation sweep script: scan every entity for values that violate its
      schema (like the `assigned_to: ["name"]` array-vs-string case) BEFORE
      they poison a batch write. Fix list → CAS repairs.
- [ ] Write-time coercion guards in `staffEntityWrite` for the known offender
      shapes (tasks/work_notes nested `assigned_to`).

## WS-8 — Verification gates

- [~] `scripts/load-sim.mjs` at N=10, N=25: **0 gaveUp, 0 user-visible errors,
      p95 hot-action <800ms, sustained spend <70% of bucket**.
      **N=10 PASSED post-publish 2026-11-09: 120/120 HTTP 200, 0×429, 0×5xx,
      p50 255ms, p95 740ms, p99 1041ms; status 11.3→2.4 avg entity calls,
      status_lite 0.9, ~280/min est. spend (~50% of 140 bucket under burst
      replay — real steady-state is far lower).**
      **N=25 post-publish 2026-11-09: 300 calls → 206×200, 94×429, 0×5xx,
      p50 250ms, p95 1793ms; entity spend ~166/min (memo holds: 0.1-2.0 avg
      calls). The remaining 429s are the platform INVOKE cap (POST count),
      not the entity bucket — WS-3 mount consolidation is the fix.**
- [ ] Real-world check: all kiosks + 5 office sessions during a cron
      fire-minute → no banners.
- [x] Published 2026-11-09T09:15Z checkpoint `6af182a3` (user-authorized
      "ship it"): memo layer all gateways live, mount gates, leader election,
      lazy face-api, instrumentation visible on published route.

---

## Execution order

1. **WS-0** — numbers first (a day of instrumentation pays for itself).
2. **WS-1 + WS-4** — the two biggest, cheapest wins: memo absorbs bursts,
      fleet cap stops the storms at the source.
3. **WS-3** — kills the per-tab multiplier (easy, high ratio).
4. **WS-2** — structural work for the datasets that outgrow memo.
5. **WS-5/6/7** — latency polish + hygiene.
6. **WS-8** — prove it, then publish with the gates green.

## Decisions (answered 2026-11-07)

- Fleet business-hours ceiling: **30 calls/60s** during 07:00-19:00 ET.
- Second service identity for fleet: **does not exist** — one app service role
  only; RLS requires it for all entities. Fleet isolation = the 30-call cap.
- Target concurrency: **25-50 confirmed**.

## Non-negotiables

- No publishes without explicit approval (checkpoints only).
- Never weaken freshness for mutable operational data — staleness is only for
  advisory/config reads.
- CAS contracts (`expected_updated_date`, creation_request_key, markers) are
  load-bearing — every optimization preserves them verbatim.

## Incident log — 2026-11-10/11 Smartsheet freeze + recurring-restock fix

- ~86h of zero scheduled runs traced to `insufficient_credits` — every
  `workflows/runs` entry `cancelled` (Order sync, Sales sync, stale-shift,
  fleet queue, File Bridge). Interactive invokes unaffected. Credits restored
  → jobs resumed same hour.
- Held row `2030447462973316` (CCS / Vinyl / 54" 8519 Luster Lam, needed
  11/11): a real restock entered in the sheet, held by
  `duplicate_looking_historical` because a *received* Sept order matched.
  Recurring supply reorders would hold forever.
- Fix: `smartsheetOrderLinkIntegrity.mjs` excludes `isFulfilledOrder` rows
  from duplicate candidates — fulfilled = delivered, a same-text row is a
  restock. Open-order duplicates still hold. Verified live: pull auto-created
  Order `6af3bb38` (linked, received) at 00:47Z; banner cleared.
- Deploy lesson: `functions deploy` fails on `../../shared/` refs missing from
  the local tree — shared modules ship via checkpoint builds (or take effect
  via file-tree resolution on cold isolates). See AGENTS.md.
- Order classifier hold kinds: `duplicate_looking_historical` (normalized
  customer+description match to an open linked order — resolved above),
  `create_attempts_unresolved`, `row_id_already_claimed`, `create_cap_reached`.
  Held rows have no approve-create API — resolution = fix/relocate the row or
  let a corrected pull create it.
