# Estimator session governance contract

The session's fail-closed governance rules — the markers an unattended run
honors. These are workflow rules, not code edits; the lane list's codeable
subunits land them as contract surfaces where they're codeable.

## Governance markers

- `dashboard-is-local` — the estimator dashboard is a local-only surface
  (`.audit-work/` + `ESTIMATOR_MASTERPLAN.md`); it never publishes to the app.
- `preserve-hooks` — the masterplan's `stage:` markers, checkpoint lines,
  and OPEN/DONE rows are preserved across edits; a ledger update appends,
  never rewrites history.
- `lead+one-worker` — the session runs one lead lane + one bounded worker
  lane at a time; never parallel lanes on the same surface.
- `root-ledger-is-source` — `ESTIMATOR_MASTERPLAN.md` is the root ledger;
  `.audit-work/` fixtures are read-only verification surfaces, never a
  competing completion database.
- `parser-contract` — the status-line parser's shape (`- [ ] \`O-001\`
  **[OPEN]**`) is the contract the fixtures consume; a row's status is the
  `[OPEN]`/`[DONE]`/`[BLOCKED]`/`[HELD]` marker.
- `sandbox-complete-vs-published` — a sandbox checkpoint records the remote
  compile + source state; "published" is a separate deploy action the session
  never performs autonomously.
- `stage:` markers — the ledger's `stage:` prefixes name the bounded subunit's
  lane (O-###/W-###/CMP-*/Lane-*); a row's stage names its lane.

## The fail-closed contract

- An OPEN item stays OPEN until its bounded subunit lands + verifies; never
  auto-marked DONE.
- A `NEEDS-OPERATOR` tail stays OPEN with the required grant named; never a
  silent default.
- A checkpoint records the remote compile + source state; the ledger records
  the checkpoint-id + evidence marker.
