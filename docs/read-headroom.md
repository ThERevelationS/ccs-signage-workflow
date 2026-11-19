# Whole-app cap headroom (M-07)

Companion to `docs/read-budget.md` (the per-surface inventory). This doc answers
the narrower question: **how much of each entity-read budget does our own
traffic consume in normal operation, and can a single user ever approach the
cap alone?**

## The two budgets

| Budget | Magnitude | Enforcement |
|---|---|---|
| `entity_list` per-caller | **~140 reads / 60 s per caller identity** | 429 "entity_list allows 140 requests per 60s for each caller"; retried by `withEntityRateLimitRetry` (counts again per retry) |
| Whole-app rolling entity-read volume | **undisclosed — Base44 platform cap** | `App entity read traffic volume limit exceeded` — fails every function's reads at once |

The whole-app cap's exact size is not exposed. Observed trigger (2026-11):
sustained external `resolvePermittingAddress` script traffic **plus** normal
app use — i.e. our internal traffic plus a large outside spike together crossed
it. Design goal below: keep our own floor low enough that a single user — or a
whole staff team — stays a small fraction of any plausible cap, so external
spikes absorb the margin, not us.

## Steady-state load model (per active user, visible tab)

Summed from `read-budget.md` §3 idle-reads/min:

| Session shape | Components | Est. reads/min | % of per-caller 140/min |
|---|---|---|---|
| **Typical staff session** (workflow/estimating pages open) | AttentionBell ~6–8 + shared WO feed ~1 + status_lite ~1–2 + announcements ~0.7 + misc stale refetches ~1–2 | **~10–14** | **7–10%** (~10–14× headroom) |
| **Heaviest idle surface** (TimeClock admin open) | AdminRosterPanels 8 invokes ~16–40 + everything above | **~25–50** | **18–36%** (~3–5× headroom) |
| **Worst realistic burst** (FleetOverview mount while TimeClock admin idles) | ~20–30 mount burst + ~40 idle | **~60–70 transient** | **~43–50%** |

Conclusion: **no single-user steady state approaches the per-caller budget.**
Even the worst measured idle surface (AdminRosterPanels) tops out near a third
of it, and the global 429 breaker + `usePolling` hidden-tab pauses cap the tail.
The danger has never been steady state — it is *multiplication*: N staff tabs
sharing service-token callers, cold-isolate auth re-reads, 429 retries billing
as fresh reads, and full-table scans in loops.

## Whole-app cap: what we control

The whole-app ceiling is shared by every caller in the app (all staff sessions
+ scheduled workflows + function service-role traffic + external scripts). Our
controllable floor is dominated by four terms:

1. **Idle polling** — currently ~10–14 reads/min/user typical (above). With ~10
   concurrent staff that is ~100–140 app reads/min — small if the cap is in the
   tens-of-thousands/min range typical of shared platform governors, but the
   floor compounds linearly with headcount, which is why the poll-hygiene work
   (M-05 shared registry + hidden-tab suppression) matters.
2. **Mount bursts** — workspace opens (~12 uncached reads), Customer360 (~8–11),
   fleet pages (~20–30). Bounded per open; the `staffDataRead` 45 s cache +
   `staffEntities` 30 s facade absorb repeats.
3. **Full-table scans** — `list_invoices`, `revenue_summary`, `send_digest`,
   `admin_load_all`, `smartsheetSyncAction` pulls (~2 k-row pages each). Each
   scan costs `rows/page_size` reads — the biggest single-action terms.
4. **Scheduled workflows** — sweeps and reminder workers are a constant
   background drain; each is paged and mostly uncached but cadence-limited.

## Mitigations in place (measured)

- `boardFeed` + `workOrderCache`: server projection (152-field allowlist),
  `since` delta cursor, 30 s feed cache, IndexedDB + BroadcastChannel — the
  ~3.1 k-row WorkOrder table now costs ~1 read/2 min/user instead of a full
  re-page per consumer (24 consumer files share one queryKey).
- `staffEntities` facade: 30 ms batching (≤16 entities/invoke) + 30 s positive
  + 403 negative cache + in-flight dedupe.
- `staffDataRead`: 45 s per-entry cache, ≤16-wide batching at concurrency 4.
- `attention_feed`: 120 s isolate cache (its 11-table fan-out is the largest
  steady drain without it).
- `notificationAction`: 5 min scan cache + 10 min eval throttle.
- `signShopSession`: 60 s auth cache (halves the 2-read/invoke surcharge).
- `resolvePermittingAddress`/`findLocalityByAddress`: 5 min catalog + 90 s
  session + 10 min Google-denied cooldown — the external-spike path.
- `usePolling` + `rateLimitCooldown` + `requestGovernor`: hidden-tab pause,
  jitter, in-flight guard, global 429 breaker (20 s→60 s) consulted by ticks.
- `withEntityRateLimitRetry` on 137/183 functions; remaining holdouts are
  auth/oauth-only (zero entity traffic) — audited M-08.

## Remaining headroom risks (ranked)

1. **`fleetDataRead` has no cache** — fleet mount storms pay full price every
   time (~20–30 reads/mount). One 45 s TTL cache (the `staffDataRead` pattern)
   halves this.
2. **`AdminRosterPanels` 8-invoke fan-out/60 s** — needs a single
   `admin_roster_snapshot` aggregate or a server-side cache.
3. **Customer/workspace aggregates uncached** — `customer_workspace` (4 k PO
   scan), `get_customer_360`, `get_opportunity`, `global_search` — a 30–60 s
   per-key isolate cache removes re-open storms.
4. **429 retry multiplication** — each retry is a billable read; under
   saturation retries make it worse (mitigated: maxRetries 1–3 + governor).
5. **`subscribe()` synth-polls per tab** — 1 read/entity/2 min/tab; a
   BroadcastChannel poller-election (workOrderCache already proves the
   pattern) would make this 1 read/entity/2 min per *user*.

## How to measure live

`base44/shared/pagedEntityRows.ts` exports `getReadTelemetry()` /
`resetReadTelemetry()` — per-call pages-fetched counters inside any function
isolate. To quantify a real window: snapshot telemetry before/after a known
session (or add a diagnostic action returning it), multiply page counts by
page size, and compare against 140/60 s. Static counts above are call-site
analysis (`read-budget.md` method) — live telemetry is the confirmation path
if the cap ever trips again.
