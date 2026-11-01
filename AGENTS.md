# CCS Signage Workflow — agent notes

**SCOPE (per Brett): work ONLY on the Time Clock module** — `src/components/timeclock/*`, `src/pages/TimeClock*`, `base44/functions/timeClockAction`, `staffDataRead`/`staffEntityWrite` time-clock paths, face/QR clock-in camera. Do NOT touch other modules (estimator, fleet, customer360, orders, SOP, walk-in, etc.) or unpushed local work outside this scope — even to fix, extend, or push them — unless Brett explicitly asks.

Base44 app `68dfcc5e57bbbc35387da97c` (published: https://clay-flow-signage-suite-387da97c.base44.app).
Remote sandbox is the source of truth — pull remote files before editing (`npx base44@latest sandbox read <path> --app-id 68dfcc5e57bbbc35387da97c --branch main --json`). Do not push stale local copies. Writes sometimes report timeouts but land anyway — verify with `sandbox run` grep before retrying.

## SOP module (added 2026-10-29)

- `/sop` page (`src/pages/SOP.jsx` + `src/components/sop/*`) — procedure library w/ AI build (TranscribeAudio dictation, InvokeLLM drafts/polish/photo-to-step), photos/video/links, drag-reorder steps (react-quill + @hello-pangea/dnd), print view, per-version read receipts.
- `Sop` entity: backend-only RLS; ALL access via deployed `manageSops` function (bootstrap/list/get/create/update/set_status/delete/acknowledge/save_settings/ack_report). Drafts hidden from non-editors; delete = admin-only; settings = admin-only.
- Settings live in GlobalSettings `sopModuleSettings` (categories, editor_emails, toggles, upload caps) — edited via the gear-drawer on /sop.
- `sandbox write`/`edit` timeouts ~12s usually still land — always verify with `sandbox run` grep/`wc -l`/`md5sum` before retrying.

## Walk-in counter sale (added 2026-11)

- `/WalkIn` page (`src/pages/WalkIn.jsx` + `src/components/walkin/*`) — CoreBridge "on-the-spot checkout" (COREBRIDGE_MAP.md §6): line-item grid, Walk-in customer default (create-if-missing via `ensureNewCustomer` w/ deterministic key), tax group, tendered/change, receipt.
- Submit chain: `generateDocNumber({doc_type:"order"})` (allocated once per attempt) → `createWorkOrderWithRecovery` (WO `Walk-in sale`, stage `completed`, `completed:false` while items need production) → `invoicingAction` `create_invoice` → `mark_sent` → `record_payment` (Invoice/Payment are backend-only — no staffEntityWrite path). All ids/keys held in a retry-safe attempt ref.
- `walkInModel.js` is pure (totals/tax/tender math, record shapes). Test: `node scripts/test-walk-in.mjs` → `PASS walk-in`.
- Route not registered — needs App.jsx `lazyPage` + PAGES entry + navConfig item.

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
- Publish the app: `sandbox checkpoint` → `POST /api/apps/{id}/app-checkpoints/{checkpoint_id}/retry-build` (waits for `"status":"ready"`) → `POST /api/apps/{id}/deploy` with `{"checkpoint_id":"..."}` (use `MSYS_NO_PATHCONV=1` on Windows; `api fetch` mangles paths otherwise). Deploying a bare `checkpoint_id` before its build is ready → 500 "Failed to load backend function source". `base44 deploy` (local) fails 428 if local entities are missing remote ones — prefer checkpoint deploys.
- `functions pull` writes a MALFORMED `"entry": "base44/functions/<name>/entry.ts"` into function.jsonc (correct: `"entry": "entry.ts"`); it breaks checkpoint builds. If a deploy fails `checkpoint_source_no_longer_compiles`, grep remote `base44/functions/*/function.jsonc` for `base44/functions/` and fix all hits.

## Function deploy gotchas (learned 2026-10-31)

- `functions deploy` uploads ALL `*.{js,ts,json,jsonc}` in the function dir + `base44/shared/` imports — not just `entry.ts`.
- `resolvePermittingAddress` is special: its `function.jsonc` pointed at `main.ts`, a **generated bundle** the runtime actually served. Editing `entry.ts` alone never changed live behavior — live busy responses kept the old shape for ~50min until `main.ts` itself was redeployed. Canonical source is `findLocalityByAddress/handler.ts`; regenerate with `node scripts/build-permitting-address-runtime.mjs`, then copy the output to BOTH `entry.ts` and `main.ts` before deploying. `function.jsonc` now says `"entry": "entry.ts"`.
- `site deploy` archives the BUILD OUTPUT dir (`dist/`), not the repo — 50MB cap. `public/` gets copied into dist by Vite, so fat asset dirs (permitting-evidence ~71MB, fleet-assets ~67MB) blow the cap. Keep evidence blobs out of `public/` or host them in Base44 file storage. **This caused a production outage 2026-10-31**: partial upload published index.html referencing missing hashed assets → blank site. Fix going forward: use `npm run deploy:site` (build → `scripts/strip-site-deploy-assets.mjs` removes the fat dirs → `site deploy --no-build --publish`). Previously-uploaded copies keep serving from the retained asset store, so stripping does not break `/fleet-assets/*` or `/permitting-evidence/*` URLs.
- `sandbox write` on an existing file needs `--overwrite`; content comes via stdin (`cat file | npx base44 sandbox write <path> --overwrite`).
- Rate limits: entity reads share `entity_list allows 140 requests per 60s for each caller` — the whole app's pollers drain one budget. `resolvePermittingAddress` now caches its PermitLocality/JurisdictionProfile catalogs (5min) + session auth (90s) in `handler.ts` so bursts don't multiply reads.
- Diagnose deployed-function behavior with `error_detail` on busy responses; if a response lacks a field the source has, the runtime is serving a stale generated bundle (`main.ts`), not your edited source.
- `boardFeed` uses server-side field projection (SDK `filter(q,sort,limit,skip,fields)`): allowlist lives in generated `base44/shared/boardFeedFields.ts` — rebuild with `node scripts/build-board-feed-fields.mjs` after ANY entity-schema change or FEEDABLE heavy-list change, then redeploy boardFeed. Undeclared stored fields (e.g. WorkOrder `_salesTaskAdoption`) are in `KNOWN_EXTRAS` in the generator — check live rows for extras before trusting a schema-only list.
- App-level cap: `App entity read traffic volume limit exceeded` is a whole-app rolling entity-read volume ceiling, distinct from the per-caller 140/60s — when it trips, every function's entity reads fail simultaneously. Verified contributors: sustained `resolvePermittingAddress` traffic (only LocalityPickerDialog + external scripts call it) and full-table pulls; the projection + 30s feed cache + delta cursors are the mitigations.
- `smartsheetSyncAction` WorkOrder reads use `syncPullFields(dataset, bindings)` (top of entry.ts): derived projection = mappable keys ∪ configured binding keys ∪ sync-meta ∪ audited side fields ∪ system. Extending it? Add any new `record.<field>` reads to `SYNC_PULL_SIDE_FIELDS` — a missed field silently verifies as unchanged/failed. Order pulls stay unprojected (all fields needed).
- Geocode chain in `findLocalityByAddress/handler.ts`: Google (10min REQUEST_DENIED cooldown, `geocode_diagnostic` always probes) → browser census_hint → OSM Nominatim (6s) → US Census (5s, last — worker often can't reach census.gov). `fixedJSON(url, timeoutMs)` accepts a per-call timeout.
- Local repo drifts behind the sandbox fast (builder works continuously): before `npm run build`, diff remote `package.json` + `find src -type f` against local — a stale local tree fails on missing deps/files, not your edits. `sandbox read` accepts MULTIPLE paths in one call — pull missing files in ~10-file chunks.
- Playwright waterfall: `.audit-work/waterfall.mjs /Page` needs `MSYS_NO_PATHCONV=1` on Git Bash (path args get mangled) and `playwright-core` matching `~/AppData/Local/ms-playwright/chromium-*` version.
