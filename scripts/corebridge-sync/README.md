# CoreBridge incremental sync

**Not ready to schedule.** `corebridgeSyncLock` must be reviewed and deployed
by the lead first; its create-if-missing election depends on the SDK's read
consistency and has only been tested offline.

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
Markdown is also written to stdout. `--capture-fixture` saves the first loaded
account detail page to the requested directory. The captured file contains private
data and may contain sensitive fields; sanitize it before sharing or adding it
to `fixtures/`.

`LegacyMigrationMap` is the append-only cursor and per-create journal.
The first cursor starts at account 3834 and order 11286, with order 11286
queued for the previously unlinked account 3835. Missing account links are
derived from order data where the customer match is unique; ambiguous orders
remain pending for later runs. Account detail scans advance `last_account_id`
only after each account and its available contacts/addresses are processed.
Accounts with multiple customer matches are held and retried before new account
scans; their orders remain pending while unrelated orders continue. Held accounts
are capped at 200. At capacity, account scanning pauses before another ambiguous
account rather than dropping a hold; orders continue and the report warns.
Only the displayed default shipping address is available on the account page;
additional shipping addresses are reported for review. Watches are capped at 200.
Historical contacts came from a separate CSV, which is not available at runtime.
Contact reference data does not always identify phone types or describe job
authority, fax, and location; untyped secondary numbers and those CSV-only
fields cannot be reproduced from the account page.

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
fields, with textual fields removed or replaced for privacy. An account-detail
HTML fixture has been sanitized as `fixtures/account-synthetic.html`. The optional
`parity-local.mjs` compares private account pages with the archive when those
local paths exist. Parts inventory is never imported.

## Automation prompt

To be added after review, lock deployment, parser work and a credentialed
dry-run.
