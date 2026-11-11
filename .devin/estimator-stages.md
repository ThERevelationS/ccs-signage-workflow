# Estimator masterplan — stage taxonomy (W-004 / DASH-04)

The ledger's bounded subunits run five stages. A queued module is never shown
as actively coding while its planning stage is incomplete — the stage names
the subunit's position, not its progress.

## Stages

| Stage | Meaning | Surfaces |
|-------|---------|----------|
| `plan` | The subunit's scope is named — the bounded piece vs the `NEEDS-OPERATOR` tail. No code yet. | `ESTIMATOR_MASTERPLAN.md` §0 lane rows; `.devin/estimator-governance.md` |
| `audit` | The current state is read — the local + remote source, the row's prior evidence, the dependency chain. No edits. | `.audit-work/` readbacks; `sandbox read` outputs |
| `research` | The method/domain is checked — the register's source-authority class, the licensed-source state, the held-seed encoding. No invented values. | `foundationRuleRegistry` `authority`/`citation`; `FOUNDATION_SOURCE_INDEX` |
| `implementation` | The bounded subunit lands — the field/contract/diagnostic/UI surface, syntax-checked locally, transported via `sandbox edit`/`write`. | `src/components/estimator/*`; `base44/shared|functions/*` |
| `verification` | The landed subunit verifies — remote readback (exact or marker-verified), remote esbuild 0-error, checkpoint + ledger evidence. | `sandbox run` esbuild; `sandbox checkpoint`; `ESTIMATOR_MASTERPLAN.md` evidence |

## Rules

- A subunit is `implementation` only after `audit` + `research` read the real
  state — never code from a stale local copy or an assumed contract.
- A subunit is `verification` only after remote readback + esbuild + checkpoint
  — never a claimed verification on local syntax alone.
- The `NEEDS-OPERATOR` tail stays OPEN at `plan`/`research` — the required
  grant is named, never a fabricated `implementation`/`verification`.
- `stage:` markers on ledger entries name the bounded subunit's lane
  (O-###/W-###/CMP-*/Lane-*) — a row's stage names its lane, not a process
  phase it hasn't reached.
