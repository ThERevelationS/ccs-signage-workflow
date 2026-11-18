# CoreBridge incremental sync

**Not ready to schedule or run live.** `corebridgeSyncLock` must be reviewed
and deployed by the lead first. The account detail parser and account-only
scan are not implemented; the lock's create-if-missing election depends on
the SDK's read consistency and has only been tested offline.

Run from a fresh GitHub checkout with Node 20 or newer. Set `CB_USERNAME` and
`CB_PASSWORD` to the CoreBridge credentials, and `CCS_APP_USER` and
`CCS_APP_PASS` to an administrator's CCS staff credentials. `CCS_APP_USER`
must be an admin staff account because the lock function is admin-only. Locally only, the
script falls back to `.cb-creds.json` and `.permit-creds.json`, each containing
`{"user":"...","pass":"..."}`. Do not commit either file.

```sh
node scripts/corebridge-sync/run.mjs
node scripts/corebridge-sync/run.mjs --apply --max-accounts 200 --max-orders 500 --report sync-report.json
node scripts/corebridge-sync/run.mjs --capture-fixture /secure/private/path
node scripts/corebridge-sync/test.mjs
node scripts/corebridge-sync/integration-test.mjs
node scripts/test-corebridge-sync-lock.mjs
```

The default is dry-run: it reads CoreBridge and CCS, performs no app
writes, and does not claim the lock. `--report` saves JSON at the named path and Markdown at `<path>.md`;
Markdown is also written to stdout. `--capture-fixture` attempts to discover
the `hlAccounts` link from the first loaded order and save the next account
ID's raw detail page to the requested directory. The captured file contains private
data and may contain sensitive fields; sanitize it before sharing or adding it
to `fixtures/`. The account parser remains deliberately disabled.

`LegacyMigrationMap` is the append-only cursor and per-create journal.
The first cursor starts at account 3834 and order 11286, with order 11286
queued for the previously unlinked account 3835. Missing account links are
derived from order data where the customer match is unique; ambiguous orders
remain pending for later runs. Account-only scanning is disabled, so
`last_account_id` does not advance. Watches are capped at 200.

Apply uses the `corebridgeSyncLock` 6-hour lease with 10-minute heartbeats,
creation-key checks, and append-only pending/complete markers. Unresolved
pending writes block advancement and are never blindly resent. Before
starting, confirm no other importer is running: the lease only coordinates
clients using this function, not the historical import scripts. Calls are
single-flight and conservatively weighted to budget backend entity reads,
including the migration mapper's full ledger scans. Backend rate-limit
behavior has not been verified live.

`fixtures/orders-sanitized.json` contains numeric, status and date slices from
three historical orders. The tests compare all mapped estimate and line
fields, with textual fields removed or replaced for privacy. No account-detail
HTML fixture is available. Parts inventory is never imported.
No live CoreBridge dry-run or production writes have been performed.

## Automation prompt

To be added after review, lock deployment, parser work and a credentialed
dry-run.
