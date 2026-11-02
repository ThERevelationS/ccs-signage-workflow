# Unraid File Bridge — Masterplan

Live data feed from the shop's two Unraid servers into CCS Signage Workflow (Base44 app `68dfcc5e57bbbc35387da97c`). Not a backup — a two-way bridge: locate each customer's file folder, index everything, filesystem search, open/read maximum file types, upload to the server from the app, and guarantee externally-created files can never be deleted through the app. Hands-off operation, audit everything, seamless integration.

**Approved plan:** `~/.devin/plans/plan-461ed58c543ce1a5.md` (source of truth for design decisions). This doc is the tracked implementation ledger — workers claim `FB-xx` items via `.masterplan-claims/` (same protocol as ESTIMATOR_MASTERPLAN).

## Decisions (locked unless Brett reopens)

- Bytes fetch = **hybrid**: command queue pull + pre-pushed thumbs/previews for hot files.
- Folder layout = configurable roots + auto-match + review queue + forward convention.
- Permissions = all staff browse/search/open/upload; **delete = app-created files only**.
- Backup server = **read-replica failover agent** (RO), not a write target.
- Transport = **outbound-only**: agent polls/streams outbound to app; nothing inbound, no tunnel. **SSE long-poll `command_wait` = primary wake channel** (spike-proven 55s+ holds, live events); adaptive short-poll = fallback. `FileBridgeHub` actor deferred — spike showed actor runtime only activates on app publish (403 pre-publish, no `.actors` on anonymous request clients). Entity queue is always the truth.
- Provenance = **`FileBridgeUpload` permanent append-only ledger** → `managed_by` (organizable) vs `origin` (deletable) tiers → `/.ccs_trash/` tombstones + `restore_trash`.
- App-loss fail-safe: no provenance → everything treated external → nothing deletable.

## Platform conventions for this feature

- New functions: `base44/functions/<name>/entry.ts` only (sandbox auto-syncs; **no function.jsonc** in sandbox mode — `functions pull`'s malformed entry path is irrelevant here).
- New entities: `base44/entities/<PascalCase>.jsonc` — write syncs schema. All bridge entities are **backend-only RLS** and must NEVER appear in `staffDataRead`/`staffEntityWrite` allowlists or `boardFeedFields` — guard-tested.
- Deferred actor (post-publish only): `base44/actors/FileBridgeHub/entry.ts` — PascalCase folder, class extends `Actor` from `base44:runtime/actors`, **`handleTick() {}` mandatory** (abstract member — won't compile without it). Actors get no secrets — agent auth verified via `functions.invoke('fileBridgeIngest', verify_agent)`.
- Staff-facing reads/writes go through `fileBridgeAction` with `authenticateSignShopSession`; agent traffic through `fileBridgeIngest` with HMAC `{key_id, ts, body}` + timing-safe compare + 5-min replay window (`key_current`/`key_previous` rotation in `GlobalSettings.fileBridge`).
- Idempotency: `path_key` = sha1(agent_id + root + NFC+casefold path) as `creation_request_key` on FileIndex creates; `request_key`/`dedupe_key` on commands/uploads.
- Rate limits: index upserts prefer **by-id updates** (agent persists entity ids in `entity_ids.db`); batched path_key resolution for unknowns; `suggested_batch_size` + 429 backoff. Poll = 1 small read. Deep search = 0 entity reads (results ride command rows).

## Architecture summary

```
PRIMARY Unraid (agent, RW)          BACKUP Unraid (agent, RO replica)
  /mnt/user shares — SQLite FTS5      /mnt/user shares — SQLite FTS5
  manifest · previews · spool         manifest(rebuild-on-promote) · spool
        \  outbound only — SSE command_wait (~45s holds) + adaptive poll fallback
         ▼                            ▼
  fileBridgeIngest (HMAC agent API)   fileBridgeAction (staff session API)
  fileBridgeMaintenance (scheduled)   FileBridgeHub actor (deferred, post-publish)
        ▼
  Entities: FileIndex(hot) · FileShareRoot · CustomerFolderLink ·
    FileBridgeCommand · FileBridgeChunk · FileBridgeUpload(ledger) ·
    FileBridgeRecent(ring) · FileBridgeEvent · FileBridgeHealth · FileBridgeInventory
        ▼
  /ServerFiles page · CustomerFilesPanel (360/estimator/WO/pipeline)
    · _Inbound tray · Admin (health/failover/roots/trash)
```

**Role resolution (split-brain proof):** `GlobalSettings.fileBridge.primary_agent_id` > agent env `ROLE` > **observer** (read-only default). Singleton-primary enforced in `fileBridgeIngest`. On `promote_agent`: pending write commands for the old agent are expired server-side + its agent drops its write queue.

**Routing:** reads → primary-healthy (`FileBridgeHealth.last_seen` < 90s) else backup (`served_by:'backup'` badge). Writes → primary only; queued while down. `mergeServerCopies` merges same-file rows across agents → "2 copies" badge.

## Workstreams & items

### WS-A — FOUNDATION & SPIKES

- [ ] `FB-01` This document + AGENTS.md scope note + `fileBridge.enabled` feature flag wiring. | Verify: doc exists, AGENTS.md updated.
- [x] `FB-02` `fileBridgeSpike` function + `FileBridgeSpike` actor + `FileBridgeSpikeRow` entity: measured (a) body cap ~64MB raw/~89MB b64, 96MB→413 → chunk 32MB; (b) actor connect 403 pre-publish, `.actors` absent on anonymous request client → SSE primary, actor deferred; (c) `UploadFile` works, **no delete API** → `keep_delivered_max_mb` + `secure_download` mandatory; (d) `bulkCreate` present, `deleteMany` works; (e) serial write ~91ms → batching mandatory; (f) SSE 55s holds live → `command_wait` ~45s. | Verify: `docs/filebridge-spike-results.md` recorded ✓. Spike resources marked THROWAWAY, delete before publish.
- [ ] `FB-03` Replication/lag info from Brett (primary→backup mechanism + typical lag) — walkthrough input only.

### WS-B — CONTRACT MODEL & ENTITIES

- [ ] `FB-10` `base44/shared/fileBridgeModel.ts` — pure TS, zero imports: path normalize + NFC/casefold `path_key`/`parent_path`, root-join guard (reject `..`/symlink escape), `sanitizeFolderName`, `matchCustomerFolders` (confidence 0-1, ≥0.85 suggest/≥0.95 auto), `commandSpec` table + state machine, `route_agent` (role+health → agent), `dedupe_key`, chunk math (`deliver_max_mb`/`keep_delivered_max_mb`/chunk size), kind registry (ext→kind→viewer/renderer/open_state), tombstone rules, `origin`/`managed_by` semantics, promotion invariants, qualifier parsing (`ext:`/`folder:`/`path:`), `mergeServerCopies`, delivered-staleness predicate. | Verify: unit coverage in suite.
- [ ] `FB-11` `scripts/test-file-bridge.mjs` — esbuild-bundled Node suite, `PASS file-bridge`: traversal/symlink guards, NFC/casefold dedupe, match scoring thresholds, command transitions+idempotent completion, provenance tiers, chunk assembly, revision naming, stale-delivery detection, routing incl. failover+promotion, `mergeServerCopies`, qualifier parse. | Verify: PASS + green on re-run.
- [ ] `FB-12` Ten entities (backend-only RLS): `FileShareRoot`, `CustomerFolderLink`, `FileIndex`, `FileBridgeRecent`, `FileBridgeCommand`, `FileBridgeChunk`, `FileBridgeUpload`, `FileBridgeEvent`, `FileBridgeHealth`, `FileBridgeInventory` — field set per plan §4 incl. `agent_id` scoping. | Verify: schemas sync; contract test asserts RLS + non-allowlist membership.
- [ ] `FB-13` `GlobalSettings.fileBridge` KV slice + `fileBridgeSettingsModel` normalizer (flags, caps, keys-refs, policies, defaults — `enabled` flag). | Verify: normalize round-trip in suite.

### WS-C — TRANSPORT SPINE

- [ ] `FB-20` `fileBridgeIngest` — agent API: `handshake` (mint/return agent_id, config push by `config_version`, `detect_roots`, role assign + singleton-primary guard), `command_poll`, `command_wait` (SSE ~45s hold = primary wake channel), `command_complete` (idempotent), `index_batch` (`bulkCreate` inserts + entity-id-first updates, batched path_key resolution, adaptive batch), `thumb_push`/`preview_push`, `deliver_chunk`/`deliver_stitch`/`deliver_complete` (32MB chunks, 48MB inline cap), `event`, `recent_batch`, `inventory_report`, `manifest_sync`, `become_primary`. HMAC auth + replay window + key rotation. | Verify: unit-covered auth paths; sandbox curl round-trip.
- [ ] `FB-21` `fileBridgeAction` — staff API skeleton: session auth, `get_health`, `search_hot`, `list_folder`, `queue_*` writers w/ per-actor rate limit + `commandSpec` + `dedupe_key`, event/audit writes. | Verify: session-gated 401s; command rows created w/ lease fields.
- [ ] `FB-22` `command_wait` SSE implementation in `fileBridgeIngest` — ~45s hold, emits pending `FileBridgeCommand` rows for the calling agent on arrival; reconnect = heartbeat. **DEFERRED**: `FileBridgeHub` actor as post-publish wake accelerator (spike: runtime activates only on publish; `handleTick` required). | Verify: curl-held stream delivers queued command <1s after write; fallback poll works with stream dead.
- [ ] `FB-23` `fileBridgeMaintenance` + workflow jsonc: stale-command/lease reaper, `delivered_url` sweep honoring `keep_delivered_max_mb` (**spike: no storage delete API exists → sweep dereferences rows only**; storage grows permanently, so keep-cap stays strict), chunk reaper, trash retention sweep command, stale-health alert, event/recent retention, missing-row purge. FileBridgeUpload exempt from reaping. | Verify: scheduled run logs; reaper drills.
- [ ] `FB-24` Dev harness: `agent/` skeleton (config loader, state dirs, command channel w/ SSE `command_wait` + poll fallback, spool, heartbeat, executor stub) + `docker-compose.dev.yml` (fixture tree + simulated second agent + chaos toggles: drop-cmd, fake clock, kill-channel). | Verify: harness e2e round-trip `echo` command.

### WS-D — INDEX & BROWSE

- [ ] `FB-30` Agent scanner: hot roots first; `(size,mtime_ns)` change keys; resumable checkpoints; `index_batch` push w/ entity-id memory; exclude_patterns (`#recycle`,`.DS_Store`,`Thumbs.db`,`@eadir`,`.ccs_*`); dir-size rollups; `missing:true` 2-sweep rule. | Verify: fixture scan → FileIndex rows; re-scan = by-id updates; missing flag after file removal ×2 sweeps.
- [ ] `FB-31` Reconcile loop (nightly, resumable): drift diff, `customer_ids[]` re-derivation per link prefixes, broken-link detection → `CustomerFolderLink.status:'broken'` + fuzzy re-match candidate. | Verify: renamed folder → link broken → suggestion produced.
- [ ] `FB-32` `list_dir` (paged, dir-cache ~30s for giant folders) + usage-promotion writeback + read failover. | Verify: 50k-child folder pages; backup serves when primary stale w/ badge flag.
- [ ] `FB-33` `/ServerFiles` page + nav (lazyPage/PAGES/navConfig, flag-gated): server selector, breadcrumbs, grid+list w/ thumbs+kind+`dir_size`+pins+"2 copies", two-lane search stub (deep lane pending FB-50), upload+revision buttons, permission-tiered actions, `_Inbound` tray, `package_files`, send-via-email, Open-in-Explorer/copy-UNC, backup/offline banners, empty-state→RootSetupWizard. | Verify: page loads; nav suite green; waterfall within budget.
- [ ] `FB-34` `CustomerFolderLink` auto-match + `UnlinkedFoldersReview` (approve/reject/split; rejected sticky; broken heal) + `configure_roots` wizard (`detect_roots` → checkboxes). | Verify: suggested links appear; manual override wins; broken→heal cycle.
- [ ] `FB-35` `CustomerFilesPanel` + Customer360 tab (root+prefix scoped queries, customer_ids display-only). | Verify: panel lists linked folder; query scoped.

### WS-E — OPEN & PREVIEWS

- [ ] `FB-40` `fetch_bytes` pipeline: `deliver_complete` single-shot ≤inline-cap first; `deliver_chunk`/`deliver_stitch` for large; progress on command row; `delivered_url`/`delivered_mtime` stamp + stale re-fetch on `request_open`. | Verify: ≤cap file opens in one hop; 300MB delivers chunked w/ progress; edit-on-server → re-delivers.
- [ ] `FB-41` `FileViewerDialog` + viewer matrix: image, PDF (pdf.js), text/csv/code highlight, audio/video native, Office via pushed PDF preview, design via thumb+metadata, archives/other → download; encrypted/corrupt → `open_state` honesty. | Verify: each matrix row renders or honest-fallbacks.
- [ ] `FB-42` Thumb/preview pipeline: appdata-only cache, per-job timeouts (`thumb_state:'failed:timeout'`), bounded concurrency, primary eager (customer roots), backup lazy, `.cdr/.ai/.psd` embedded-preview carve via exiftool/ImageMagick. | Verify: thumbs land on FileIndex; timeout → failed state not hung worker.
- [ ] `FB-43` `FileBridgeInventory` report + `openability` map per ext → `docs/filebridge-openability.md` snapshot; drives renderer additions. | Verify: first inventory run published + report rendered in admin.

### WS-F — UPLOAD & MUTATE

- [ ] `FB-50` `queue_upload`/`upload_apply`: `UploadFile`+sha256 → agent pulls → verify → collision-suffix write → `origin:bridge` + FileBridgeUpload ledger + manifest + audit. `upload_as_revision` (`rev-N`, never overwrite). | Verify: round-trip lands on share; hash mismatch rejected+audited; revision names.
- [ ] `FB-51` `queue_mkdir` (customer-folder auto-create) + `queue_move` (managed/origin only) + `queue_delete` (manifest `origin:bridge` → `/.ccs_trash/` tombstone; non-empty dir reject; bulk cap 50) + `restore_trash` + `TrashBrowser` (admin). | Verify: external-file delete rejected at all 3 layers; tombstone→restore round-trips.
- [ ] `FB-52` `_Inbound` watcher + tray (`inbound_restricted`→admin-only) + `inbound_attach` (`managed_by:bridge`, `origin:external`) + filename auto-suggest. | Verify: drop file → tray → attach to customer folder → still not deletable.
- [ ] `FB-53` `package_files` (agent-side zip → delivered `file_url`, `package_ttl_days`) + `send_file_via_email` (sendGmail + link/attachment). | Verify: zip arrives intact; email carries link.
- [ ] `FB-54` `FileBridgeUpload` provenance ledger semantics — append-only, never reaped; `manifest_sync` digest; `rebuild_manifest` on promote sources from ledger. | Verify: cold-root app-file keeps provenance through promote.

### WS-G — DEEP SEARCH & RECENT

- [ ] `FB-60` FTS5 content extraction (throttled, per-root opt-in, hot-first, per-file text cap) + `deep_search` (time-capped ~5s, `partial` flag, cursor paging, qualifiers, snippets) + `content_search` toggle. | Verify: content hits return snippets; cap honors; toggle off = filename-only.
- [ ] `FB-61` `FileBridgeRecent` ring (~2k) + `RecentFilesWidget` ("recently changed in customer folders"). | Verify: ring caps; widget shows newest first.

### WS-H — INTEGRATIONS, FAILOVER & HANDOFF

- [ ] `FB-70` Embed points: EstimateDetail/estimator panel, WorkOrder `attach_server_file` (`source:'unraid'` entries on files[], no migration), SalesPipeline quick-access, `archive_output` (generated PDFs → customer folder). | Verify: WO attach renders + opens; quote PDF lands on share.
- [ ] `FB-71` Failover tooling: `promote_agent`/`demote_agent` (+write-queue drain + `rebuild_manifest` + `become_primary`), `AgentFailoverPanel` (dual health, drift, promote), served-by-backup badges everywhere. | Verify: kill primary → reads fail over + writes queue; promote → provenance intact.
- [ ] `FB-72` Ops extras: `log_tail` remote log fetch, `secure_download` proxy (≤cap, default-on for `inbound_restricted`), `share_to_portal` (off unless Brett asks), IP-allowlist note. | Verify: log_tail returns tail; restricted roots route via proxy.
- [ ] `FB-73` Hardening: `docs/unraid-filebridge-setup.md` (CA template XML / docker save-load / build-from-share; compose caps; `_FILE` secrets; observer-first install order; mounts; first-scan expectations; health; updates; Tailscale option; `.ccs_*` replication policy; promotion procedure; troubleshooting) + `docs/filebridge-openability.md` + soak + failure drills + openability pass 2. | Verify: drill checklist green on dev harness + real boxes.
- [ ] `FB-74` Final gauntlet: all suites + contract + nav-wiring + waterfall budgets + sandbox checkpoint per phase. | Verify: single green run recorded.

## Read-budget rules (non-negotiable)

- `FileIndex` = linked+promoted only; churn lives in `FileBridgeRecent` ring. Hot bound ~50k/agent w/ demote-oldest overflow.
- Index updates are by-id (agent `entity_ids.db`); `index_batch` resolves unknown path_keys in ONE batched lookup + returns id map.
- Deep search and all live browsing ride command rows — zero extra entity reads per user action.
- `FileBridgeEvent`/`FileBridgeRecent`/`FileBridgeChunk` are TTL-swept; `FileBridgeUpload` never reaped.
- New surfaces must be listed in `docs/read-budget.md` and respect projection allowlists.

## Security rules (non-negotiable)

- All bridge entities backend-only RLS; never in `staffDataRead`/`staffEntityWrite` allowlists or `boardFeedFields`.
- Agent auth = HMAC `{key_id,ts,body}`, timing-safe, 5-min window, `key_current`/`key_previous` rotation; `command_wait` stream authenticates the same way per-connection.
- Root allowlist + realpath/`..`/symlink guards enforced IN THE AGENT (not just UI); `commandSpec` validated both sides; per-actor rate limits.
- Deletes require manifest `origin:bridge` → tombstone, reversible via `restore_trash`; moves require `managed_by`/`origin`; non-empty dirs rejected; bulk cap 50; backup agent refuses ALL mutations until promoted.
- UI/events show **root-relative paths only** — `/mnt/user/` never leaks.
- Atomic writes (temp+rename) for everything the agent writes; sha256 verify on uploads and deliveries.
