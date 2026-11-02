# .masterplan-claims — orchestrator claim ledger

`claims.jsonl` is the single coordination point for parallel masterplan execution
(`ESTIMATOR_MASTERPLAN.md` §0.6).

## Rules

- **Append-only** — rows are never edited or deleted; a claim's lifecycle is a
  sequence of appended rows (`claimed` → `integrated`/`failed`/`released`).
- **Orchestrator-written only** — the orchestrator session is the sole writer.
  Subagent workers must never write, read-for-claiming, or edit files here —
  **except** each worker may append progress lines to its own `worker-<id>.log`
  (see below).
- **One JSON object per line**, e.g.:
  `{"ts":"2026-11-02T12:00:00Z","worker":"w-3","item":"F-09","owned_files":["base44/shared/formulaEval.ts","scripts/test-formula-eval.mjs"],"status":"claimed"}`
- `owned_files` is the exclusive write allowlist from the worker brief — the
  orchestrator uses it to revert out-of-scope edits on integration.
- Status values: `claimed` (dispatched), `integrated` (verified + remote-written +
  ledger `[DONE]`), `failed` (worker error/verify fail → re-brief), `released`
  (claim abandoned → item back to `[OPEN]`).

## Invariants the orchestrator enforces

- No two `claimed`-status rows may have overlapping `owned_files`.
- An item marked `[DOING w-N]` in the masterplan always has a live `claimed` row.
- Phase-gate checkpoints require zero live `claimed` rows (all integrated or released).

## events.jsonl — orchestrator telemetry (drives the dashboard)

Same append-only/orchestrator-only rules. One row per orchestrator action:
`{"ts":"...","type":"dispatch|integrate|verify|deploy|checkpoint|live_call|warning|fail|scope_violation|phase_gate","item":"A-01"|null,"detail":"...","note":"..."}`
The live dashboard (`node scripts/masterplan-serve.mjs` → http://localhost:5170)
reads `claims.jsonl` (worker cards), `events.jsonl` (feed), `worker-*.log`
(per-workstream live consoles — last 4 lines each), and the ledger (progress).

## worker-<id>.log — worker narration (the one exception)

Each worker appends plain-text lines to `worker-<its-own-id>.log` only:
`HH:MM:SS <item> :: <what I'm doing>` — one line per meaningful step
(read/write/verify). This is what makes the dashboard's per-workstream
consoles show real live activity. Orchestrator truncates each log to its
last ~20 lines on integration; workers never touch other workers' logs.

## Operator rule (2026-11-02T13:14:28.511876+00:00)

**MAX_WORKERS = 2** — Brett: machine locking up even at 5 (2026-11-02, tightened from 5→2 same day). Dispatch at most 2 concurrent workers; refill seats only as completions free them. This cap is permanent until Brett raises it — do not re-expand on a new session without explicit instruction.
