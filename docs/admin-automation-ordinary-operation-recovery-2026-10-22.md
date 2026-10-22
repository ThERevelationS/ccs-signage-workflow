# Admin Automation ordinary-operation recovery

Starting HEAD: a58d1f03e (clean main sandbox; only main branch exists).

Scope: AdminSettings frontend, one browser-safe review helper, synthetic tests. No backend/schema changes, production entity reads/writes, or publishing performed.

Enable/disable and delete now share a synchronous in-memory operation lock, owned by the current Admin session. Pending or uncertain ordinary operations block further Automation writes, including editor saves, while preserving mounted-session drafts. Confirmed receipts require an owned complete list refresh; missing/inconsistent or rejected receipts require explicit read-only recovery. Generic list refresh never clears an uncertain operation.

Read-only recovery checks a complete list and identifies requested/different enabled state, present deletion target, or verified absence. Acknowledgment re-reads and compares the reviewed target snapshot, then adopts exactly that fresh list and invalidates older list requests. Failed, timed-out, changed, or obsolete reads retain the lock. A still-pending timed-out write cannot be acknowledged; late settlement invalidates prior recovery evidence without adopting the receipt or retrying a write. Session changes and unmount invalidate callback authority.

Boundaries: these are mounted-session UI guards layered over the existing server conditional writes. Point-in-time reads do not prove authorship or server cancellation. Guards are not durable across full browser reloads or independent browser sessions.

Verification:
- node --test scripts/test-admin-automation-*.mjs: 30/30 passed.
- node scripts/test-admin-navigation-browser.mjs: 87/87 isolated Chromium checks passed; real AdminSettings JSX, synthetic auth/data/persistence, external requests blocked. Six added checks cover duplicate clicks and parked drafts, interrupted deletion and changed/failed acknowledgment, pending timeout/late receipt, timed-out/late reads, and late toggle/delete after Admin session change.
- npm run build: passed.
- Scoped ESLint: zero errors; existing unused actionType warning remains.
- git diff --check: passed.
