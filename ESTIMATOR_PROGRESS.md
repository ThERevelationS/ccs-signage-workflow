
## 2026-11-01 21:45Z — Full-app sweep (99 routes headless + MCP verify) + 5 live fixes

**Sweep:** scripted all 99 app routes (33 base + 46 estimator + 17 fleet + literals) via headless Chromium against localhost dev→prod backend; rechecked 19 EMPTY flags at 20s (all false positives — 7s cap too short under rate budget). 29 flagged → all resolved or identified.

**Real defects found & fixed (all verified live):**
1. **WO-board infinite render loop** (Design/Estimating/Fabrication/InstallationDeliver/Production + ProductQueues): `data: x = []` default made a fresh array identity every render while useAllWorkOrders was unfetched → useEffect([x]) → setState → loop → 100+ 'Maximum update depth' warnings. Fixed in one place: useAllWorkOrders returns stable EMPTY_WORK_ORDERS when data undefined (workOrderCache.js).
2. **Badge missing forwardRef**: every Radix asChild trigger (Tooltip on ProjectHealthBadge etc.) couldn't anchor + warned. Added forwardRef+displayName (badge.jsx).
3. **EstimatorCustomers unhandled rejection**: loadAllCustomers() unguarded + load() uncaught → pageerror + stuck spinner. Now try/finally + loadError banner.
4. **EstimatorTools duplicate React key**: two links to /EstimatorQueues keyed by l.to → key={l.label}.
5. **CustomerPortal crash on estimate links**: InvoiceView mounted for kind!=='staff_view' but estimate bootstraps have no invoice → TypeError. Guard now data.invoice &&. Verified portal renders quote end-to-end ($1,579.35, approve/respond).

**Backend fixes (customerPortalAction, deployed):**
- estimatePortalView scope bug (previous round) — rotated LIVE, bootstrap verified 200.
- **revoke_link CAS bug**: expectedFields lacked revoked_at baseline → revoke always errored. Fixed; live on next rotation.
- **bumpOpen CAS bug (silent)**: expectedFields lacked last_opened_at → open_count silently never incremented (catch-swallowed). Fixed; live on next rotation.

**Non-defects confirmed:** notificationAction 500s (transient rate pressure — all actions verified 200), manageFeatureReports list (works both scopes), 'Report could not be changed safely' = generic wrapper for transient fails, manifest.json (dev-only), remaining 429s (systemic entity budget).

**Test artifact:** estimate portal link for test estimate 6a95bbea... minted during pass (link 6ae76a75...) — revoke pending bundle rotation (fix deployed).

**Update (later same pass):** customerPortalAction rotated — revoke_link verified live (success:true), revoked token now correctly rejects bootstrap ("invalid, expired, or revoked"). Test link 6ae76a75 revoked. bumpOpen CAS fix live in same bundle. All pending items closed.
