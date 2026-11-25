# CCS Operations Masterplan — Permit Server, Verification, and App Flow

Owner: Brett. Started 2026-11-24. Scope grant (Brett, 2026-11-24): the permitting
server/fleet, the permitting UI, the estimate creation flow, app-wide UI/UX and
data/indexing work described below. Everything ships through git `main` and the
documented local deploy path (AGENTS.md).

## Operating principle: hands-off by default

The system decides for itself. Every phase below states its **autopilot rules**:
the decision the software makes on its own, the evidence it records, and the
narrow case that is left for a human. A human is only asked when a wrong
automatic answer would put a false fact in front of staff (e.g. marking an
office verified with no evidence). Everything else is automatic, logged and
reversible.

Guardrails that never change:
- No paid calls in automation (Google Places/Geocoding, Base44 InvokeLLM /
  UploadFile) unless a phase explicitly budgets them.
- No destructive data changes: retire (historical / duplicate_of), never delete.
- Every write goes through the outbox + CAS; every automatic decision is
  recorded in a local ledger with its evidence so it can be audited or undone.
- The server protects the PC: it throttles itself before memory runs out (the
  2026-11-24 3 AM reboot was a low-memory crash).

---

## Phase 1 — Permit server: controls, desktop app, verification mode  (NOW)

### Baseline (measured 2026-11-24 from the local mirrors)
- 2,319 active jurisdictions (locality records); 11,313 offices.
- Offices: **3,376 verified, 7,937 need verification**.
- Jurisdictions: 214 fully verified, 1,130 partly, 964 none, 11 with no offices.
- Why the 7,937 are stuck (all three are fixable without a human):
  1. **2,851 offices** belong to jurisdictions linked to a *retired* (historical)
     research profile — the duplicate cleanup retired the copy they point at, so
     the verifier reads stale/empty research (e.g. Mason, OH).
  2. **1,748 offices** have a profile with no office research at all — nothing
     for the verifier to check.
  3. **~5,250 offices** have research entries but fail an evidence check
     (official source / on-topic responsibility quote / role-office fit). The
     reason is never saved: `auto_verification_gaps` / `unproven_roles` are not
     declared in the PermitLocality schema, so the entity layer silently drops
     them. Nobody (and no worker) can see why an office is stuck.

### 1A. One controller, one runtime home
- Code runs from a git worktree on `main` (`D:\DevinProjects\ccs-server`); its
  `.audit-work` is a junction to the existing data folder in
  `ccs-signage-workflow-clean\.audit-work` (mirrors, outbox, ledgers stay put).
  Any script drift between the old checkout and `main` is reconciled into `main`
  first (the running copy wins where it is newer and correct).
- New `scripts/permit-server.mjs` — the single long-running controller. It owns
  every worker process (spawn, stop, restart-on-crash with backoff) and replaces
  `start-permitting-fleet.ps1`, the forever-runner and the dashboard guard as the
  thing that is "running".
- State file `.audit-work/server-control.json`:
  `{ state: running|paused|stopped, verification: on|off, mode, updated_at, by }`.
  The controller is the only writer; the dashboard and desktop app send it
  commands over a local HTTP API (localhost only).

### 1B. Start / Pause / Stop (+ Verification toggle)
- **Start**: launch the worker set for the current mode.
- **Pause**: every worker finishes its current item and idles (workers poll the
  control file between items via `scripts/lib/server-control.mjs`); processes
  stay alive, nothing is lost, resume is instant. The write flusher finishes its
  in-flight batch, then idles too.
- **Stop**: pause, wait for the flusher's in-flight batch, then terminate every
  worker cleanly. The outbox stays on disk.
- **Verification ON/OFF** (independent switch):
  - ON = *verification mode*: only the work that verifies existing jurisdictions
    runs — profile relink, targeted local research, evidence repair, seed scan,
    authority verifier, write flusher, mirror sync. Sweeps that ADD new
    jurisdictions, address resolvers and parcel resolver are off.
  - OFF = verification workers stop; the rest of the fleet follows Start/Pause/Stop.
  - Brett's rule: **no new jurisdictions are added until the current ones are
    verified** — so the default mode is verification ON, expansion OFF, and the
    expansion switch stays locked until verification reaches its done-condition.
- Dashboard (http://localhost:4174) gets a control bar: Start · Pause/Resume ·
  Stop · Verification ON/OFF, live worker list (status, pid, memory, last
  event), and a verification progress panel (verified / remaining / needs-human,
  per state and per reason, ETA from the last hour's rate).

### 1C. Desktop executable
- `CCS Permit Server.exe` on Brett's desktop (small C# launcher compiled with the
  .NET Framework `csc.exe` that ships with Windows — no installs). Opening it:
  starts the controller if it isn't running, then opens the dashboard. A tray
  icon offers Open dashboard / Pause / Resume / Stop / Exit.
- Auto-start at Windows sign-in (Task Scheduler, current user) so a reboot no
  longer silently stops the server; the last state (running/paused/stopped and
  the verification switch) is restored.

### 1D. Resource guard (automatic)
- Controller samples free physical memory and CPU every 15 s.
  - Free RAM < 6 GB → pause the heaviest workers (researchers first), log it.
  - Free RAM < 3 GB → pause everything except the flusher.
  - Recovers automatically when RAM is back above 8 GB for 2 minutes.
- Workers are restarted if their own memory exceeds a cap (default 1.5 GB).

### 1E. Verification pipeline that actually finishes
Autopilot order, all deterministic and free:
1. **Profile relink** — a locality linked to a historical profile is relinked to
   the active profile with the same identity (state + normalized name + type +
   county). Exactly one candidate → relink. Several → pick the one the office
   list already references elsewhere, else the one with the most office
   research, else most documents. None → mark the locality for research (step 3)
   on its current profile. Every relink is logged with the old id (reversible).
   Dry run 2026-11-24 (`.audit-work/relink-plan.json`): 785 localities / 2,845
   stuck offices have exactly one active match; 6 have several candidates and no
   county on the locality (Columbus, Oakwood, Bellevue, Harrison, Rittman…) —
   these are NOT guessed: county is filled first from the Census place→county
   lookup (free), then relinked; 2 have no active match.
   **Research union**: in 18 pairs the retired copy holds the research and the
   active profile has none (Whitewater, Delhi townships). The verifier and
   seed scan therefore read office research from the linked profile PLUS every
   identity-equal profile (active or historical), de-duplicated — no research
   is lost by relinking. Keepers with no research also get the retired copy's
   research copied onto them (same copy-not-move rule as the documents merge).
2. **Gap ledger** — the verifier records, per office per role, why it did not
   promote, in `.audit-work/verification-ledger.jsonl` (+ a compact latest-state
   index). If the schema can be extended (`auto_verification_gaps`,
   `unproven_roles`, `verification_attempts`), the same data is also written to
   the record; until then the ledger is the source of truth for the dashboard.
3. **Targeted research** — the local researcher works a priority queue built
   from the ledger: offices with no research first, then by reason. It is
   pointed at the role that failed (e.g. "find the page naming who issues
   electrical permits in X").
4. **Evidence repair** — for `quote_off_topic` / `no_responsibility_quote`:
   re-fetch the official source page and extract the sentence that names the
   responsibility (sign/zoning/building/electrical/ROW/historic); for
   `no_official_source`: search the jurisdiction's official domain (website_url,
   permitting_url, .gov) for the same office.
5. **Authoritative rosters** — use already-collected official lists as
   evidence: Ohio certified building departments (building/electrical),
   Kentucky electrical inspector roster, county-administered zoning for
   unzoned Ohio townships. A roster hit is an official source by definition.
6. **Role applicability** — a role with no responsible office anywhere after
   steps 3–5 (e.g. historic review in a township with no historic district,
   right-of-way for a jurisdiction with no streets department where the county
   engineer holds ROW) is resolved automatically: reassigned to the office that
   does hold it (county engineer / county building) when evidence shows that,
   or marked `not_applicable` with the evidence of absence recorded. It is never
   marked verified without evidence.
7. **Human list (last resort)** — only offices that fail steps 1–6 after 3 full
   attempts land on the dashboard's "Needs a person" list, each with the exact
   reason and the best source found. Target: under 2% of offices.

**Done condition** for "all current jurisdictions verified": every active
jurisdiction's offices are verified or resolved (reassigned / not applicable),
and the needs-a-person list is under 2% of offices. When reached, the dashboard
shows it and the expansion switch unlocks.

### 1F. Production readiness checklist
- Controller survives worker crashes, reboots (auto-start), and sleep/wake.
- Single-instance locks for controller and singleton workers.
- Logs rotate (cap 50 MB per worker log, keep 3).
- Health endpoint `/health` + dashboard banner when any worker is crash-looping.
- Tests: controller state machine (start/pause/resume/stop/verification toggle,
  restore-after-restart), resource-guard thresholds, relink chooser, ledger
  writer, evidence-repair extractor — `node scripts/test-permit-server.mjs`.

---

## Phase 2 — Permitting page: layout and condensing

Problems today: the board stacks every section (routing warnings, office
check, contacts, permit lines, AI plan, history) in one long column per job;
admins also get duplicate/backlog banners above it.

Plan:
- **Job row → tabs**: each permitting job opens to tabs — *Overview* (status,
  next action, due dates), *Permit lines*, *Offices & contacts*, *Plan*,
  *Documents*, *History*. Only Overview renders on open (lazy-load the rest).
- **One status strip** per job (lines submitted/approved, waiting on, next
  follow-up) replaces the separate warning boxes; details sit behind it.
- **Board-level tabs**: Needs action · Waiting on office · Approved · Setup ·
  All. Counts in the tab labels; the filters row collapses into one menu.
- **Admin banners** (duplicates, routing mismatches, verification progress) move
  to one collapsible "System" panel, closed by default.
- **Jurisdictions view**: summary cards + search first; office details in a
  side drawer instead of inline expansion.
- Autopilot: the page remembers each user's last tab/filter/collapsed state.
- Quick fix carried in now: setup Review says "Permit lines 7" when only 5 are
  selected — count the selected lines.

## Phase 3 — Estimate creation flow: seamless and hands-off

Goals: fewer clicks from request to sent quote; the system fills what it can.
- **Start from anything**: new estimate from a customer, an opportunity, a
  previous estimate (copy), a walk-in, or an emailed request — customer,
  contact, site address and salesperson prefilled from the source.
- **Smart defaults**: tax group from the site address, terms/deposit from the
  customer, quote template from the product mix, expiration from settings.
- **Product intake**: type a description ("2 D/F illuminated cabinets 4x8") →
  the right builder opens with fields prefilled (deterministic parser first; AI
  only on request). Proof/size data from past jobs suggests sizes.
- **Permit hand-off**: an estimate with exterior signs automatically creates the
  permit setup draft (jurisdiction resolved, signs + sizes from the estimate) so
  Permitting starts with everything filled.
- **Background checks** replace blocking dialogs: missing price, missing
  customer data, stale pricing — shown as a checklist the user can clear in any
  order; Send is blocked only by real errors.
- **Convert to work order** carries everything (signs, sizes, permit draft,
  files) with no re-entry.

## Phase 4 — Overall UI/UX

- One design vocabulary (the existing `src/components/kit/`): page header,
  filter bar, status chip tones, empty states, side drawers — applied to the
  pages touched in Phases 2–3 first, then the rest.
- Consistent dialogs: every dialog has a title + description (also clears the
  accessibility warnings), Escape closes, primary action bottom-right.
- Loading: skeletons instead of spinners; no layout jump when data arrives.
- Errors say what happened and what to do, never just a status code (the 403
  fix pattern, applied everywhere).
- Density: compact mode as default for office staff; touch-friendly mode for
  shop/install tablets (already a workspace preference — make it complete).

## Phase 5 — Data planning and indexing

Known costs today: staff reads share one 140/min allowance; batch reads cap at
100 with no truncation flag; `staffDataRead` caches 45 s and writes never
invalidate it; JurisdictionProfile rows are fat (Ohio mirror is 93 MB) and
crash pages > 1,000 rows; the browser loads whole tables for counts.

Plan:
- **Slim summary records**: a per-jurisdiction summary (identity, county, office
  counts, verified counts, last research, duplicate status) maintained by the
  server, so lists and pickers never read full profiles.
- **Server-computed counts** for board/tab badges instead of client full scans.
- **Keyset paging everywhere** (cursor + limit, `truncated` honored), no
  100-row silent caps.
- **Write-through cache invalidation** in `staffDataRead` for point reads after
  writes (needs a working function deploy path; ship as V-next functions as
  with resolvePermittingAddressV3).
- **Split fat fields**: profile documents' page text moves to a separate
  document store keyed by profile; profiles keep metadata only.
- **Local mirrors** stay the only full-table readers; every worker reads
  mirrors, never pages the live API.

---

## Status log
- 2026-11-24: plan written. Phase 1 started.
