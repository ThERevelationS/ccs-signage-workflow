# Unraid File Bridge — Server Setup Walkthrough

This gets the file-bridge agent running on your Unraid servers so the CCS
Signage app can browse, search, open, and upload to your file shares —
**live**, not as a backup dump.

## How it works (read this first)

- The agent is a small Docker container that lives on each Unraid server.
- It connects **outbound only** — HTTPS to the app. No inbound firewall
  holes, no VPN, no Tailscale needed. If the server can reach the internet,
  the bridge works.
- The agent holds **no app login** — only a shared HMAC secret that signs
  its requests. Nobody with the secret can reach anything except the
  agent's own API surface.
- **Primary server** = read/write. Uploads, moves, folder creation land here.
- **Backup server** = read replica. It serves reads if the primary goes
  down and refuses all writes until promoted.
- Nothing is ever truly deleted. App-created files delete to a `.ccs_trash`
  folder on the share (restorable). Files the app didn't create **cannot
  be deleted at all** — the agent refuses.

## What you need before starting

1. Unraid 6.12+ with Docker enabled.
2. The share(s) you want bridged — e.g. your `Customer Files` share.
3. ~10 minutes and terminal access (SSH or the Unraid web terminal).
4. The two agent files from the app repo:
   - `agent/filebridge-agent.mjs`
   - `agent/Dockerfile`
   (Copy them off the sandbox or ask whoever set the app up — they're in
   the `agent/` folder.)

## Step 1 — Decide your roots

A **root** is one share (or folder) the app can see. Decide:

| Root key | Purpose | Example |
|---|---|---|
| `customer_files` | `customer_folders` — top-level dirs get matched to customers | `/mnt/user/Customer Files` |
| `media` | `general` — logos, assets | `/mnt/user/Media` |
| `_Inbound` | `inbound` — drop zone staff move into customer folders | `/mnt/user/_Inbound` |

Rules of thumb:

- One root per share keeps things simple.
- `customer_folders` roots get auto-matched — the top-level folder inside
  each root should be one customer per folder (e.g. `Customer Files/Acme Signs/`).
- `_Inbound` is optional but recommended — a place anyone can drop files
  that staff then attach to the right customer from the web UI.

## Step 2 — Appdata + state directory

On the Unraid flash (or appdata share):

```bash
mkdir -p /mnt/user/appdata/filebridge/state
mkdir -p /mnt/user/appdata/filebridge/secrets
```

`/state` holds the agent's local index (SQLite), the durable retry spool,
and `manifest.json` (the provenance/security record). **Do not delete
`/state`** — losing it just means a re-scan, but the manifest is what
protects file history.

## Step 3 — The shared secret

Generate a strong key once — it's shared between the app and BOTH agents:

```bash
openssl rand -hex 32 > /mnt/user/appdata/filebridge/secrets/fb_hmac.key
chmod 600 /mnt/user/appdata/filebridge/secrets/fb_hmac.key
```

(Any 64-char random hex works — `cat /dev/urandom | xxd -p -l 32` too.)

The same value goes into the app's `FILEBRIDGE_HMAC_KEY` secret — whoever
manages the app sets that once. On the server, mount it as a **file**, not
an env var (env vars are visible in `docker inspect`).

For the backup server: copy the SAME key file over
(`scp /mnt/user/appdata/filebridge/secrets/fb_hmac.key root@backup:/mnt/user/appdata/filebridge/secrets/`).

## Step 4 — Docker Compose

Create `/mnt/user/appdata/filebridge/docker-compose.yml` on the **primary**:

```yaml
services:
  filebridge:
    build: /mnt/user/appdata/filebridge/agent
    container_name: filebridge-agent
    restart: unless-stopped
    environment:
      FB_APP_URL: https://clay-flow-signage-suite-387da97c.base44.app
      FB_AGENT_ID: tower-primary
      FB_ROLE: primary
      FB_HMAC_KEY_FILE: /run/secrets/fb_hmac.key
      FB_ROOTS: /roots/customer_files,/roots/_Inbound
      FB_STATE_DIR: /state
      FB_VERSION: 1.0.0
    secrets:
      fb_hmac.key:
        file: /mnt/user/appdata/filebridge/secrets/fb_hmac.key
    volumes:
      # PRIMARY write roots — mount :rw so uploads/moves can land
      - /mnt/user/Customer Files:/roots/customer_files:rw
      - /mnt/user/_Inbound:/roots/_Inbound:rw
      - /mnt/user/appdata/filebridge/state:/state
```

And on the **backup** — identical except:

```yaml
      FB_AGENT_ID: tower-backup
      FB_ROLE: backup
      FB_ROOTS: /roots/customer_files
    volumes:
      # BACKUP — everything :ro, always. It must never write.
      - /mnt/user/Customer Files:/roots/customer_files:ro
      - /mnt/user/appdata/filebridge/state:/state
```

Put the agent code at `/mnt/user/appdata/filebridge/agent/` (`Dockerfile`
+ `filebridge-agent.mjs`), then:

```bash
cd /mnt/user/appdata/filebridge
docker compose up -d --build
docker logs -f filebridge-agent
```

## Step 5 — Verify mounts BEFORE going live

Run the agent once in scan-only mode — it walks every root, builds the
local index, and reports what it sees **without contacting the app**:

```bash
docker compose run --rm -e FB_SCAN_ONLY=1 filebridge
```

You want lines like:

```json
{"level":"info","msg":"scan_done","root_key":"customer_files","files":4123,"dirs":410}
{"level":"warn","msg":"root_missing","root_key":"_Inbound"}
```

`root_missing`/`skipped` = a mount didn't attach — fix the `volumes:` path
(Unraid share names are case-sensitive; spaces are fine quoted).

## Step 6 — Go live + app-side check

```bash
docker compose up -d
```

In the app, open **Server Files** (hard-drive nav item):

- The health strip should show `tower-primary · online`.
- Root tabs appear per registered root.
- First index takes a few minutes per ~50k files — entries fill in
  progressively; the Recent feed shows scan activity.
- Customer folder suggestions appear in the review queue as matching
  runs (every 5 min): confirm correct ones, reject wrong ones — rejected
  folders never re-suggest.

## Step 7 — The backup server (optional but recommended)

Repeat steps 2–5 on the backup server with the `backup` compose block.
Its files should be a replica of the primary (rsync/Syncthing/your
existing replication — the bridge doesn't copy data itself).

Reads automatically fail over when the primary is stale, and the UI shows
a `backup` badge when that's happening.

### Promotion runbook (primary is dead/gone)

1. App admin: set `fileBridge` GlobalSettings `primary_agent_id =
   "tower-backup"` (Server Files → Admin, or GlobalSettings row).
2. `tower-backup` handshakes as **primary** on next cycle (~seconds).
3. Remount its shares `:rw` when you're sure the old primary won't come
   back writing — split-brain protection: the agent refuses mutations
   while `FB_ROLE=backup` regardless.
4. Old primary returns → it handshakes, sees it's no longer primary,
   and stays read-only. Demote it in compose (`FB_ROLE: backup`) during
   your next maintenance.

## Operations

| Task | How |
|---|---|
| Logs | `docker logs filebridge-agent` or `/state/agent.log` (JSONL) |
| Restart | `docker restart filebridge-agent` — state/index/spool survive |
| Update agent | replace `agent/filebridge-agent.mjs`, `compose up -d --build` |
| Rotate key | put new key in app `FILEBRIDGE_HMAC_KEY`, old key moves to `FILEBRIDGE_HMAC_KEY_PREV`, then update agent key files — rotation is seamless while `PREV` is set |
| Stop serving | `docker stop filebridge-agent` — reads fail over to backup; writes queue for up to TTL |
| Rebuild provenance | after reinstall: queue `rebuild_manifest` — it re-stamps `manifest.json` from the app's upload ledger |

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| `fileBridge disabled` | bridge turned off in app settings | Server Files → Admin → enable |
| `auth_failed` in agent log | bad key or clock skew | verify key file matches app secret; NTP-check server clock (>5min skew = rejected) |
| `root_missing` | mount not attached | fix `volumes:`; the agent never writes outside mounts |
| Spool growing (`spool/` files) | app unreachable — events queued | self-heals when connectivity returns; spool is priority-tiered + capped |
| Upload lands as `name (1).ext` | filename collision | by design — bridge never overwrites |

## What the agent will NOT do

- Delete any file it didn't create (no `origin:bridge` provenance → hard refuse).
- Write to a backup-role agent or outside its mounted roots.
- Create folders/files when the primary agent is unreachable (commands queue).
- Delete non-empty directories, even bridge-created ones (empty only).
