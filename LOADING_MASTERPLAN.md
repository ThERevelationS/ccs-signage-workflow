# LOADING MASTERPLAN — kill the shared-bucket 429s at their sources

Goal: page mounts and steady-state stay comfortably inside the 140 entity-reads/60s
service-token budget at 25-50 concurrent staff — zero user-visible 429s, mounts that
complete even during cron fire-minutes, and no regression of CAS/freshness contracts.

Scope: APP-WIDE (Brett, 2026-11-25 — "Do everything"). This supersedes the
Estimator-only session scope in AGENTS.md for the items in this plan.

## Root cause — measured, not guessed (live census 2026-11-25)

Everything converges on ONE budget: `entity_list allows 140 requests per 60s` on the
app's single service token. Every staff read/write/ambient call goes through
session-authenticated functions that call `asServiceRole` — browser users, crons and
the local permitting fleet all draw from the same bucket.

Live proof (`.audit-work/load-census/census*.json`, playwright census of real page
mounts, one staff session, 2026-11-25 ~09:20 ET):
- EVERY observed 429 body is the entity_list service-token bucket — not the invoke cap.
- Even a SINGLE user mounting pages during business hours got 429s: MyWorkflow 9,
  SOP 3, EstimatorQueues 3 (on writes!), FleetOverview 2, TimeClock 2, OrderForm 1.
- A page mount fires 12-25 invokes across 8-10 DISTINCT functions; staffDataRead
  batches alone report `entity_calls` of ~9-30 per mount (TimeClock: 28). Estimated
  total mount spend ~40-80 entity reads — three simultaneous mounts can saturate.

### Ranked spenders (new findings beyond SCALE_MASTERPLAN)

1. **Auth tax — the invisible multiplier.** `authenticateSignShopSession`
   (base44/shared/signShopSession.ts, used by ~116 functions) costs 2 entity reads
   (AuthorizedEmail + UserSession) on miss. The 15s cache is per-token PER-ISOLATE;
   requests spread across isolates. Live probe: sequential identical calls returned
   entity_calls `2 3 3 0 0 3 0 3 0 2 3 0` → ~2/3 of ALL function calls pay full auth
   cost. ~8-10 distinct functions per mount ≈ 13-20 auth reads per mount alone.
   The Nov load-sims used ONE session token for all N sessions — this cost never
   appeared in them (key caveat for re-runs).

2. **`opportunityWorkspaceAction: attention_feed` full-table scans.** ~16 entity reads
   per cold call: Invoice (4,632 rows) and WorkOrder (3,200) are fetched UNFILTERED
   then filtered in code (logs: 3+2 pages, ~200+ cold calls/28h). Also: partial
   failure → nothing cached → every 60s poll re-runs the full scan under saturation
   (failure amplifier). Predicates are pushable server-side:
   invoices `{status:$in:[sent,partially_paid], due_date:{$lt:today}}`,
   WOs `{current_stage:{$ne:completed}, due_date:{$lt:today}}`, POs status+expected_date,
   Inventory `reorder_point > 0`, PermitLineItem `status != completed`.

3. **`notificationAction: evaluate_triggers` duplicated per user.** ~10 entity reads
   per user per 10-12min for work identical across all users (same scans, same
   dedupe index). One scheduled run replaces N×.

4. **Dead subscribe polls.** `staffEntities.WorkOrder.subscribe` consumers
   (workOrderCache, SalesPipelineSpreadsheet) both ignore the `data:null` events the
   poll emits — a 50-row staffDataRead every 120s per open tab per board, zero effect.
   Announcement subscribe does refetch on event — keep but review.

5. **`EstimatorQueues` syncExpiredFlags write sweep.** Up to 10 individual
   `staffEntityWrite` updateMany invokes PER MOUNT (census: 10-13). Writes ride the
   unthrottled lane AND consume entity budget; they were the EstimatorQueues 429s.

6. **`fleetDataRead` has no batch mode.** FleetOverview fires ~9 invokes at mount
   (avg ~9s each). fleetDataRead only accepts single-entity requests — needs the
   `entities:` batch shape staffDataRead already has.

7. **Global write-epoch cache flush.** Any write anywhere bumps the governor epoch
   and invalidates ALL READ_TTL caches (prefs, feeds, notifications) app-wide.

8. **Per-tab multiplication.** Only the status poll is leader-elected. AttentionBell
   (2 invokes/min), SyncConflictAlert (admin 1/min), AnnouncementContext (+subscribe
   tick), queueFeed refetches (120s) all run per tab.

9. **Fleet discipline.** Supervisor process is NOT running (workers up since ~3:48
   ET 11-24, quiet-mode inactive); ledger paces CALLS not entity reads inside them
   (one batch call = up to 16 entity reads). Currently quiet (~0.7/min) but unguarded.

Already fixed upstream (do NOT redo): memo layer, lite_snapshot, cross-tab status
leader election, mount gates, staffDataRead 45s cache + 16-entity batch, boardFeed
delta cursors + IndexedDB, idle-tab suspension, hidden-tab subscribe skip.

## Workstreams

### WS-1 — Kill the auth tax (biggest single win; ~2 reads × ~2/3 of ALL calls)

`base44/shared/signShopSession.ts` — options, decide at implementation start:

- **1a (recommended): shared staff-session snapshot.** `authenticateSignShopSession`
  reads ONE cached roster+revocation snapshot (a GlobalSettings row refreshed by a
  scheduled job every ~60s, or lazily rebuilt when stale inside staffDataRead).
  Auth cost → ~1 entity read/isolate/min covering ALL users. Deactivation and
  session revocation take effect within ~60s (vs ~15s today) — DECISION: explain
  tradeoff to Brett; default to 1b if he wants faster revocation.
- **1b (safe fallback):** keep per-token cache but raise TTL 15s→45-60s and cache
  the UserSession revocation lookup alongside the user row (it is already inside
  the same try). Halves misses; no new staleness semantics.
- **1c (deepest):** embed non-sensitive claims (email, role, is_deactivated-at-sign)
  in the signed token payload and verify claims server-side, with `session_not_before`
  revocation still enforced via the snapshot — zero reads for auth when combined
  with 1a.

Acceptance: identical-call probe shows entity_calls 0 on ≥80% of warm calls;
`functions deploy` of shared file reaches all ~116 functions without edits (it's a
shared import — redeploy via file-tree resolution/checkpoint).

### WS-2 — attention_feed diet (server-side; the largest per-call spender)

`base44/functions/opportunityWorkspaceAction/entry.ts`:
- Push client-side filters into the queries (invoice/WO/PO/Inventory/PermitLineItem
  predicates above). ~16 → ~7-9 entity reads per cold call, no multi-page scans.
- Cache partial/failed results for ~30s (separate short TTL, marked `partial`) so a
  saturation wave doesn't re-scan the full set every 60s per caller.
- Optional later: GlobalSettings feed snapshot row (write-through on the mutations
  that change sections) → 1 read per cold call. Only if pushdown isn't enough.
Acceptance: `[read-budget]` log lines for Feed invoices/WO show 1 page and <500 rows.

### WS-3 — evaluate_triggers once per app, not once per user

- Add a scheduled workflow (every 10min) calling `notificationAction` evaluate_triggers
  with a service/system caller; the per-user browser call becomes a throttle-row
  check only (or is removed — server dedupe index already prevents duplicates).
Acceptance: evaluate_triggers entity reads stop scaling with user count.

### WS-4 — Mount-burst consolidation v2

- `fleetDataRead`: add `entities:` batch shape mirroring staffDataRead (same auth,
  per-entity allowlist/errors). FleetOverview's ~9 invokes → 1.
- `EstimatorQueues`: replace per-row updateMany expiry sweep with ONE
  staffEntityBulkWrite call per load (or move flagging to the daily
  `checkDeadlineReminders` cron and drop the page-time sweep).
- `appBootstrap` v2: add attention-feed head, unread notifications, announcement
  feed, roster head (kiosk) → collapses the ~75s-gated ambient first calls into the
  mount batch for pages that need them.
Acceptance: mount invoke count ≤10; staffEntityWrite calls at mount = 0.

### WS-5 — Ambient diet per tab

- Extend `pollLeader` to: AttentionBell's (attention_feed + list_mine) pair,
  SyncConflictAlert, AnnouncementContext fetch + subscribe tick.
- Remove dead `WorkOrder.subscribe` consumers (workOrderCache + SalesPipelineSpreadsheet
  retain/release code paths are dead — events carry data:null and are ignored).
- Per-function write epochs in base44Client: bump `fn:<name>`-scoped epoch for write
  invokes and entity-scoped for entity writes so unrelated writes stop flushing all
  TTL caches. (Verify: TTL-keyed reads still invalidate on their own function's
  writes.)
Acceptance: steady-state ambient invokes/tab/min ≤3; two tabs ≈ one tab's spend.

### WS-6 — Fleet discipline

- Restart `permitting-fleet-supervisor` (business-hours quiet mode exists but isn't
  running) or document why it stays off.
- read-ledger paces calls; teach paced functions to report `entity_calls` (they
  already return it) so the ledger can pace entity reads, not just invokes.
Acceptance: fleet contributes ≤30 entity-reads/min business hours INCLUDING batched
calls' internal reads.

### WS-7 — Re-measurement gates

- Re-run `.audit-work/load-census/census2.mjs` after each WS: targets mount
  invokes ≤10, staffDataRead entity_calls total ≤15, 0×429 solo-mount during
  business hours.
- load-sim multi-token rerun: mint 2-3 staff session tokens (or simulate the auth
  multiplier explicitly) — single-token sims CANNOT see the auth tax (established
  2026-11-25). N=25 mount+poll: 0 gaveUp, <15% 429s (synthetic ceiling marker),
  p95 hot action <1.5s.

### WS-8 — Structural (existing plan, unchanged)

READ_IDENTITY_MASTERPLAN continues as the endgame: browser reads land on per-user
allowances. IMPORTANT: WS-1..6 still pay under it — auth, feed scans, triggers,
writes and crons stay on the service token either way. These are complementary,
not competing.

## Execution order

1. WS-1 (auth) — biggest multiplier, touches one shared file.
2. WS-2 (attention_feed) — cheap, big, and the poll cadence makes it continuous.
3. WS-4 (batch + sweep + bootstrap) — kills the mount-spike class.
4. WS-5 (ambient/tab multipliers).
5. WS-3 (trigger cron) + WS-6 (fleet).
6. WS-7 gates after each step; publish only on explicit approval.

## Non-negotiables

- No publishes without explicit approval (checkpoints only).
- CAS contracts, freshness for mutable data, and backend-only RLS are load-bearing —
  every cache/memo stays per-caller-safe and advisory-only where staleness can hurt.
- Pull remote before every edit (local src is a stale pull cache).
- `functions deploy` cannot bundle ../../shared imports — shared-file changes ship
  via file-tree resolution (cold isolates ~30-60min) or a checkpoint build.
- Writes that time out usually land — verify via readback before retrying.

## Evidence archive

- `.audit-work/load-census/census.mjs` + `census2.mjs` + `census-*.json` — page census.
- Probe: staffDataRead entity_calls `2 3 3 0 0 3 0 3 0 2 3 0` (auth-miss pattern).
- Function logs: opportunityWorkspaceAction `[read-budget]` Invoice 4632r/3p, WO 3200r/2p.

## Progress log (2026-11-25)

- **WS-1 — DONE (1a, shared snapshot).** `signShopSession.ts` snapshot rows cloned before the mutation pipeline; auth rides one shared snapshot read/isolate/min. Re-probe `staffDataRead` mid-rollout: `3 0 3 0 0 0 0 0 0 0 0 2` — ~0.67 avg entity_calls (was ~1.83); expected to settle near-0 once all isolates refresh.
- **WS-2 — DONE.** attention_feed predicates pushed into entity queries; partial-failure results now cached briefly instead of re-scanning. Awaiting prod-log confirmation of `[read-budget]` page counts.
- **WS-4 — DONE except appBootstrap v2.** fleetDataRead gained `entities:` batch shape + `entity_calls`; fleetEntityLoaders coalesces mount bursts into one batch invoke (30ms window, 16/chunk, 429s fail closed). Quote-expiry flag moved to a daily sweep inside `checkDeadlineReminders`; `EstimatorQueues.syncExpiredFlags` mount write-burst removed. appBootstrap v2 still open.
- **WS-3, WS-5, WS-6 — open.** WS-6's supervisor-restart is an ops step for Brett/local, not code.

- **WS-5 — partially DONE (leader election + dead polls).** Dead `WorkOrder.subscribe` polls removed from `workOrderCache.js` (retain/release + applyWorkOrderEvent — events never carried ids; 120s refetchInterval unchanged) and `SalesPipelineSpreadsheet.jsx` (60s usePolling unchanged). Leader election extended to: AttentionBell (leader fetches attention_feed+list_mine, broadcasts payload; followers hydrate stores+count; manual refresh bypasses leadership), SyncConflictAlert, AnnouncementContext (poll AND subscribe now leader-only; lease re-evaluated every 30s). SalesPipeline's `SalesFilter.subscribe` kept — it is live (triggers refresh). Remaining WS-5: per-function write epochs in base44Client.

- **WS-3 — analyzed, needs a design decision before implementation.** Finding: evaluate_triggers is NOT purely recipient-agnostic — the #349 watch-rules detector notifies *the caller*, and the throttle is per-user (`last_evaluated_at` on the pref row), so a global/cron eval that skips per-user callers would silently stop persisting watch hits for everyone else. Correct design: scheduled workflow (10min, `_workflow_capability` system caller like the other 19 crons) that evaluates watch rules for ALL subscribed users, plus a global throttle replacing the per-user one so browser calls degrade to a cheap throttle-check. This is a focused ~1-file server change + 1 workflow jsonc — do it as its own task, not batched.

- **WS-3 — DONE (server side, live-verified 2026-11-26).** `evaluate_triggers` reworked: (1) new cron workflow `Notification Trigger Evaluation` (*/10 UTC, `_workflow_capability` system caller, force:true) — hash added to `workflowInvocationCapability.ts`; (2) per-user throttle replaced with a GLOBAL throttle — `notification_eval_state` GlobalSettings row + in-isolate memory fast-gate, so browser eval calls degrade to ≤1 small read and only one scan suite runs per 10min app-wide; (3) watch-rules detector now evaluates ALL subscribed users (recipient per user, 25-read cap per eval) instead of caller-only; per-user pref-row read/write dropped from the eval path. Live probe: first call evaluated (created 40, 153 candidates — backlog draining 40/eval), second throttled 598s; list_mine/unread_count/preferences unaffected; bad capability rejected. NOTE: the capability path 401s until the shared-file rollout reaches isolates (~30-60min) — expected, safe. OPEN: whether sandbox-written workflow jsonc activates without a publish — watch for eval stamps continuing with no browsers open, or confirm at next publish. Browser eval calls left in place deliberately as a fallback.

- **WS-5 — DONE (write-epoch scoping, 2026-11-26).** Governor epochs are now scoped: entity-gateway writes (staffEntityWrite/staffEntityBulkWrite/estimatorProjectWrite/fleetEntityWrite) still bump the global epoch, but every other function write bumps only `fn:<name>` — a clock-in or notification dismissal no longer orphans the attention feed/prefs/announcement/bootstrap TTL caches. TTL read keys fold in global+own-function scope; in-flight dedupe behavior unchanged. Trade-off accepted per plan: cross-function writes (e.g. invoicingAction mutating invoices) leave the feed up to one TTL stale (15-30s) instead of instant.
- **WS-4 appBootstrap v2 — REASSESSED, deprioritized.** After WS-1 (auth now ~free on warm isolates) and WS-5 (ambient first calls are leader-elected — only one tab fires them), bootstrap consolidation would save invokes but NOT entity reads, and invokes are no longer the bottleneck. Recommend skipping unless re-measurement shows mount waves still hurting.
- **Next: WS-7 re-measurement after the frontend batch publishes** — the mount census should be re-run against the published site to verify WS-5 gains and decide whether anything remains for WS-4/WS-8.

- **WS-3 post-deploy verification + fixes (2026-11-26 ~07:30 UTC).** (1) CRON CONFIRMED LIVE: the eval-state row was stamped at exactly 07:30 UTC (a */10 boundary) with no browser eval running — the workflow fires and the capability path works. (2) BUGFIX: `setting_value` is object-typed, not string — the stamp write failed validation ("Input should be a valid dictionary") until fixed; row now writes correctly. (3) BUGFIX: `cachedScan` no longer caches the empty fallback of a FAILED scan — a saturation wave previously poisoned every detector for 5min (likely cause of observed candidates:0 evals during a 429 wave). (4) Isolate rollout of entry.ts changes is mixed for tens of minutes — expect old-stamp warnings to fade. (5) Overnight 429 waves observed even with the local fleet ledger quiet — spending source unidentified (platform crons are suspects); watch in WS-7 re-measurement.

- **WS-6 — code half DONE; restart decision is Brett's (2026-11-26).** The read-ledger now paces ENTITY COST, not just invokes: `reportCallCost(entityCalls)` in `scripts/lib/read-ledger.mjs` appends the real `entity_calls` weight after each call settles, and all 14 fleet workers report it — a 10-read scan now spends 10 tokens instead of 1, so the fleet self-throttles on heavy scans within the same 30/day/80/night-per-minute budgets. Local-only change (fleet scripts don't deploy). Current fleet state: skeleton crew (~7 of ~34 rostered workers, no supervisor) and quiet. RESTART DECISION — documented rather than acted on: restarting the full fleet trades shared entity budget + workstation load for permitting-research throughput; with business-hours budget 30/min and cost-weighting the fleet can no longer starve browsers the way it could, but during the rate-limit recovery the safest course is leaving it as-is until the publish lands and WS-7 re-measurement confirms headroom. To restart later: `node scripts/permitting-fleet-supervisor.mjs` (lean profile default) — the supervisor respawns/stall-checks the roster itself.
