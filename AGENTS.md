# CCS Signage Workflow — agent notes

Base44 app `68dfcc5e57bbbc35387da97c` (published: https://clay-flow-signage-suite-387da97c.base44.app).
Remote sandbox is the source of truth — pull remote files before editing (`npx base44@latest sandbox read <path> --app-id 68dfcc5e57bbbc35387da97c --branch main --json`). Do not push stale local copies. Writes sometimes report timeouts but land anyway — verify with `sandbox run` grep before retrying.

## Verify

- `node scripts/validate-opportunity-workspace.mjs` — contract checks (backend-only entities, guarded handoff, idempotent creates, routing, feature presence).
- Hardening suites (esbuild-bundled under Node): `node scripts/test-aio-pricing.mjs`, `test-quote-lifecycle.mjs`, `test-customer-quote.mjs`, `test-customer-pricing.mjs`, `test-entity-persistence.mjs`, `test-estimate-cas.mjs`, `test-estimate-lifecycle.mjs`, `test-estimate-save-recovery.mjs`, `test-builder-persistence.mjs`, `test-module-registry.mjs`, `test-sales-activity.mjs`, `test-builder-service.mjs`, `test-builder-recovery.mjs`, `test-quick-price-persistence.mjs`, `test-customer-persistence.mjs` — all print `PASS <name>`.
- JSX/TS syntax: `npx esbuild <file> --loader:.jsx=jsx --outfile=NUL` (TS files need no loader flag).

## Conventions

- Session-authenticated backend actions: `authenticateSignShopSession` + `base44.asServiceRole.entities.*` in `base44/functions/*/entry.ts`.
- Idempotent creates: `createFoundationRecordWithRecovery` / `ensureIdempotentEntityCreate` with `creation_request_key`.
- Concurrency: `replaceFoundationFieldsIfUnchanged` / `replaceEstimateFieldsIfUnchanged` / `deleteBuilderEntityIfUnchanged` — CAS anchored on loaded `updated_date` + baseline fields.
- Frontend lists: `loadAllEntityRows` (paged, rate-limit retry, dedupe, fail-closed).
- Deploy a function: `npx base44@latest functions deploy <name> --app-id <id> --json` (deploys from LOCAL file — pull remote first). Site publishes only on explicit request.
