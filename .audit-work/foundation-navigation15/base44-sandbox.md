# Base44 Sandbox Bridge — local coding agent

You are connecting to a **Base44 app's sandbox** so you can develop in it directly: read
and edit files, search, list directories, and run shell commands. Base44 hosts the
sandbox; you bring the agent. This app is `68dfcc5e57bbbc35387da97c`.


> **⚠️ REQUIRED FIRST STEP — read the Base44 sandbox skill.** Before you write any code,
> run any command, or do any work on this app, you **MUST** read this skill to learn the
> Base44 coding basics (project structure, conventions, entities, integrations, and APIs).
> It — and the references it links — is the **authoritative** source: read it (and those
> references) **before** searching the internet for anything Base44-related.
>
> https://docs.base44.com/developers/skills/base44-sandbox.md
>
> If your agent supports skills, install it locally (e.g. `npx skills add base44/skills`, or
> whatever skill-install method your agent uses) so it's always available — then read it.

## 0. Pick your connection — MCP (preferred) or CLI

There are **two** ways to reach this sandbox. **Before doing anything else, check whether
the Base44 MCP server is already connected in your client. If it is, use MCP — not the CLI.**

- **MCP — preferred when available.** Look at your connected tools/connectors for the Base44
  MCP server (`https://app.base44.com/mcp`). If its sandbox tools (`read_file`, `grep`, `list_directory`,
  `write_file`, `edit_file`, `run_command`, `create_checkpoint`) are present, **use them and
  ignore the CLI instructions below.** MCP needs no local files, no CLI, and no `npx` — it works entirely
  over the connected session. Its full usage (tools, scopes, conventions) is documented here:

  **https://app.base44.com/api/sandbox/68dfcc5e57bbbc35387da97c/web-agent/readme.md**

  Pass `app_id="68dfcc5e57bbbc35387da97c"` on every tool call.

  *Want MCP but it isn't connected yet?* Add it once with
  `claude mcp add --transport http base44 https://app.base44.com/mcp` (then run `/mcp` to authenticate) and
  follow the guide above.

- **CLI — use only if MCP is not connected.** Drive the **Base44 CLI** via `npx base44@latest`. Pass
  **`--json`** on every command so stdout is a single pure-JSON document (status/logs go to
  stderr) — pipe it straight into `jq`. The rest of this document covers the CLI path.

## 1. Authenticate (CLI path only)

The sandbox commands use your **Base44 CLI login**. First, **check whether you are already
logged in** — run a harmless read such as:

```bash
npx base44@latest sandbox ls --app-id 68dfcc5e57bbbc35387da97c --json
```

If it succeeds you are authenticated — skip to the commands. If it fails with a
not-authorized error, log in with:

```bash
npx base44@latest login
```

Note: this read-only check only confirms you are logged in, **not** that your session has the
sandbox **write** permission. If a later `write`, `edit`, or `run` fails with a not-authorized
error (the session lacks `sandbox:write`), re-run `npx base44@latest login` to re-authenticate
and grant sandbox access — older sessions predate this permission.

`login` is **interactive**: it starts a **device/browser flow** that only a human can
complete (it prints a verification URL/code and waits for sign-in). **Do not run it headless
and block waiting for it to finish, and do not try to complete it yourself.** Instead, surface
the step to the user — hand them the URL/code the CLI prints — and continue only once they
confirm they've finished. If you are already logged in, never re-run it.

Your token is scoped to apps you administer. Commands for an app you don't own return a
generic "not found / no permission" error (no existence leakage).

## 2. The commands

To discover branch names, run `npx base44@latest branches list --app-id 68dfcc5e57bbbc35387da97c --json`.
Use a returned name with `--branch <name>` on sandbox commands.
If the user's intended branch is unclear, ask before editing.

Every command targets this app with `--app-id 68dfcc5e57bbbc35387da97c` and takes **`--json`** so stdout is a
single machine-readable JSON document (human status/logs go to stderr) — pipe it into `jq`,
e.g. `npx base44@latest sandbox read src/App.tsx --app-id 68dfcc5e57bbbc35387da97c --json | jq -r '.files[0].content'`.
(You can instead `export BASE44_APP_ID=68dfcc5e57bbbc35387da97c` once and omit the `--app-id` flag.)

### Read files
```bash
npx base44@latest sandbox read src/App.tsx --offset 1 --limit 200 --app-id 68dfcc5e57bbbc35387da97c --json
```
Pass one or more paths. `--offset`/`--limit` are optional 1-based line ranges. Returns
`{ "files": [...] }`; a missing file comes back with a per-file `error` instead of content.

### Search file contents (grep)
```bash
npx base44@latest sandbox grep useEffect --path src --glob "*.tsx" --max-results 200 --app-id 68dfcc5e57bbbc35387da97c --json
```
The pattern is a regex by default — add `--no-regex` for a literal string, `--case-sensitive`
for a case-sensitive match. Returns `{ "matches": [...], "truncated", "returnedMatches" }`.

### List a directory
```bash
npx base44@latest sandbox ls src --recursive --max-depth 3 --include-hidden --app-id 68dfcc5e57bbbc35387da97c --json
```
The path defaults to the app root. Returns `{ "entries": [...], "truncated" }`.

### Create or overwrite a file
```bash
npx base44@latest sandbox write src/components/Hello.tsx --content '...' --app-id 68dfcc5e57bbbc35387da97c --json
# or pipe the body on stdin (preserved verbatim):
cat Hello.tsx | npx base44@latest sandbox write src/components/Hello.tsx --app-id 68dfcc5e57bbbc35387da97c --json
```
Never clobbers an existing file unless you add `--overwrite`. To **create an empty file**,
use `run` (`touch`) — the write path treats empty content as a delete.

### Apply exact-string edits
```bash
npx base44@latest sandbox edit src/App.tsx --edits-json '[{"old_text":"foo","new_text":"bar","replace_all":false}]' --app-id 68dfcc5e57bbbc35387da97c --json
```
Each `old_text` must be unique in the file unless `replace_all` is `true`. Edits apply
all-or-nothing. Add `--dry-run` to get the unified diff without writing. An edit that would
empty the file is rejected — use `run` (`rm`) to delete a file.

### Run a shell command
```bash
npx base44@latest sandbox run "npm run build" --cwd src --timeout-ms 120000 --app-id 68dfcc5e57bbbc35387da97c --json
```
`--cwd` is relative to the app root and does not persist across calls (chain with `&&`).
`--timeout-ms` defaults to 120000, max 600000. The remote exit code is surfaced in the JSON.

### Create a checkpoint
```bash
npx base44@latest sandbox checkpoint --name "Working login flow" --app-id 68dfcc5e57bbbc35387da97c --json
```
Saves a restore point in the builder's version history. `--name` is optional, but a short
summary of what changed helps the user pick the right version. Pending changes are flushed
first so the checkpoint captures your latest code.

**Run this when you finish a unit of work, and always before you stop.** Your writes are
committed but not checkpointed: only checkpoints appear in version history, and a Restore or
Revert there rolls the app back to the last checkpoint and discards everything after it.

## 3. How to work in here

- **Explore first** with `read` / `grep` / `ls`.
- **Make changes** with `write` / `edit`; use `run` for installs, builds,
  and scripted edits.
- Your edits **auto-save** (a debounced git commit, ~5s) and become visible in the Base44
  builder and publishable — you do not run a save command.
- You can work at the same time as the in-app Base44 builder — there is no lock to acquire or
  release.
- **Checkpoint your work.** Run `checkpoint` when you finish a unit of work and before you
  stop. An auto-saved commit is not a checkpoint: a Restore or Revert in the builder rolls the
  app back to the last checkpoint and discards everything after it.

## 4. Errors

Each command exits non-zero on failure; with `--json` the failure is a JSON error envelope on
stdout. The envelope's **top-level `code` is transport-level** (the CLI reports `API_ERROR`
for any backend rejection) — read the condition from the human-readable `message`. The
exception is `read`: a failed file inside a successful batch carries a stable per-file
`error.code`. The backend's stable codes, for interpreting per-file errors and messages:

| Code | Meaning |
|---|---|
| `NOT_AUTHORIZED` | Missing/insufficient credentials |
| `PREMIUM_REQUIRED` | The workspace plan doesn't include the sandbox bridge — the user must upgrade to the Builder plan or above |
| `CREDITS_EXHAUSTED` | The app's workspace is out of integration credits — the user must wait for them to renew or add more; don't retry |
| `APP_NOT_FOUND` | App missing or you lack permission |
| `NOT_FOUND` | File/resource not found |
| `PATH_OUTSIDE_SANDBOX` | Path traversal / invalid path |
| `PROTECTED_PATH` | `.agents/` is off-limits to file tools, except `.agents/skills/` |
| `EDIT_TEXT_NOT_FOUND` | `old_text` not present |
| `EDIT_TEXT_NOT_UNIQUE` | `old_text` matched more than once |
| `EMPTY_EDIT_RESULT` | The edit would empty the file (use `run` to delete) |
| `INVALID_ENTITY_NAME` | An entity file's name is not a valid entity name; name it after the entity (`base44/entities/TeamMember.jsonc`) |
| `OVERWRITE_NOT_ALLOWED` | File exists and `--overwrite` was not set |
| `COMMIT_FLUSH_PENDING` | A recent change is still saving — retry shortly |
| `RATE_LIMITED` | Per-(user, app) rate limit exceeded |
| `SANDBOX_BUSY` | The sandbox is busy saving background changes — retry shortly |
| `BINARY_FILE` | File is not valid UTF-8 |
| `OUTPUT_TRUNCATED` | Command output exceeded the cap |
| `TIMEOUT` | Command exceeded its timeout |
| `BACKEND_ERROR` | Unexpected server error |

