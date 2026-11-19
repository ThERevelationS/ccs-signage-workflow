# FB-02 platform spike results — 2026-11-02

Probe vehicle: `fileBridgeSpike` function + `FileBridgeSpike` actor + `FileBridgeSpikeRow` entity
(runner: `.audit-work/fb-spike.mjs`, sandbox preview host `preview-sandbox--68dfcc5e57bbbc35387da97c.base44.app`).
All probe resources are THROWAWAY — delete before publish.

## Measured

| # | Question | Result |
|---|----------|--------|
| a | Function request body cap | **~64 MB raw bytes OK** (~89 MB base64-JSON), 96 MB raw → **413**. → chunk size **32 MB** (safe margin); `deliver_complete` single-shot up to ~48 MB viable |
| b | `asServiceRole.integrations.Core.UploadFile` | **Works.** Returns public `file_url` (`https://base44.app/api/apps/<app>/files/mp/public/...`); fetched back byte-identical. |
| c | Storage delete API | **NONE.** `DeleteFile`/`deleteFile`/`RemoveFile`/`Delete` on `integrations.Core` all 404. Uploaded bytes are **permanent** → `keep_delivered_max_mb` cap + `secure_download` proxy are mandatory, not optional; "TTL reap" becomes dereference-only |
| d | Bulk write API | **`bulkCreate` exists** (returns created array). `createMany`/`insertMany`/`bulkInsert` absent. `deleteMany` works (`{success, deleted}`). |
| e | Entity write speed | ~**91 ms/write serial** (~11/s) → by-id `index_batch` writes MUST use `bulkCreate`/batched updates |
| f | SSE / held request | **Works.** 5s/25s/55s holds all complete with live event delivery (no proxy buffering, events arrive as written). → **SSE long-poll is the wake channel** (~45 s holds) |
| g | Actors — external anonymous connect | **403 "not been published"** on every host (preview-sandbox AND published domain), even after `actors deploy` reports clean. Actor runtime only activates on app publish → unusable for the agent now |
| h | Actors — function→room | Dead. `createClientFromRequest(req)` anonymous client has **no `.actors` accessor** (`actor_keys: []`) |
| i | Storage quota | No signal surfaced; treat Base44 storage as precious (no delete = whatever lands, stays) |

## Design consequences (applied to masterplan)

1. **Transport = SSE long-poll primary**, adaptive short-poll fallback. `command_wait` action on `fileBridgeIngest` holds ~45 s; agent reconnects = its heartbeat. Dispatch latency <1 s with zero extra infra. `FileBridgeHub` actor demoted to optional post-publish accelerator (FB-22 deferred).
2. **Chunk size 32 MB**; `deliver_complete` inline cap 48 MB.
3. **No storage delete** → `keep_delivered_max_mb` enforced; reaping = dereference rows, files persist; `secure_download` default-on for `inbound_restricted` roots; thumbnails/previews kept small (webp ≤ ~150 KB).
4. `index_batch` must batch: `bulkCreate` for inserts; unknown-path_key resolution stays one batched read.
