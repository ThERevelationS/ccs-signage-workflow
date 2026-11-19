# Signage Intelligence — Masterplan

**Status:** PLANNING — not yet implemented.
**Date:** 2026-11-06
**Owner:** Brett

## One-line summary

A signage-facts intelligence layer: every downloaded jurisdiction document is scanned by local agent workers, its sign-relevant facts extracted into a per-jurisdiction index, and presented in-app as fact cards + a plain-English ask box with click-to-source citations — on the client panel, on each jurisdiction card, and on a dedicated search page.

## Goal

A staff member (or a client, eventually) should be able to open any jurisdiction or client context and instantly see or ask:

- "What are the sign rules in Allen City, KY?"
- "Does Boone County require a permit for a 6×8 monument sign?"
- "What's the max height for a freestanding sign in West Chester Township?"

…and get a direct answer with the official source document + page + link next to it. No digging through PDFs, no guessing.

## Non-goals

- No live remote-LLM calls in the answer path — answers come from the prebuilt index (fast, works when the PC's LLM lane is down).
- No merging of jurisdiction identities — every fact stays pinned to its exact jurisdiction (county vs city vs township).
- No schema churn on existing permitting entities — new entities only.
- No replacing the existing document pipeline — this builds ON it.

## Architecture — 5 layers

```
┌─────────────────────────────────────────────────────────────────┐
│  UI      Jurisdiction card · Client panel · Signage Search page  │
│          fact cards + ask box + click-to-source citations         │
├─────────────────────────────────────────────────────────────────┤
│  SERVE   staffDataRead queries on the index + templated answers   │
├─────────────────────────────────────────────────────────────────┤
│  INDEX   SignageFact + SignageFactIndex entities (new)            │
│          every fact carries: quote · source doc · page · URL      │
├─────────────────────────────────────────────────────────────────┤
│  EXTRACT Deterministic pattern pass + Devin-agent semantic pass   │
│          local workers emit structured fact JSON → outbox → CAS   │
├─────────────────────────────────────────────────────────────────┤
│  CORPUS  PermittingSourceDocument + PermittingSourceTextSegment   │
│          + .audit-work/office-files/**/*.txt (already built)      │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Corpus layer (exists)

- `PermittingSourceDocument` — one row per official file (title, issuing_office, office_id, official_url, archived_file_url, sha, bytes, retrieval status).
- `PermittingSourceTextSegment` — page-level extracted text per document, with `page`, `text`, `source_sha256`, `needs_ocr_review`.
- Local mirror: `.audit-work/office-files/<state>/<jurisdiction>/<office>/sources/<sha>.<ext>` + sibling `.txt`.
- ~29k eligible docs; pipeline already fetches/extracts continuously.

## 2. Signage fact taxonomy

The extraction targets a fixed fact schema — every fact is one `SignageFact` row. **Every sign type is in scope** — the enum is exhaustive AND extensible (`other_<label>` slots for jurisdiction-specific types, never dropped):

**Sign types** (the `sign_type` enum):
- By form: `wall`, `fascia`, `projecting`, `awning`, `canopy`, `marquee`, `roof`, `parapet`, `window`, `suspended`, `painted`
- Freestanding: `pole`, `pylon`, `monument`, `post_and_panel`, `multi_tenant_pylon`, `billboard_offpremise`
- Portable/temporary: `temporary`, `banner`, `a_frame`, `feather_flag`, `inflatable`, `portable_changeable`, `construction`, `real_estate`, `political`, `yard`, `garage_sale`, `directional`, `window_temporary`
- Electronic/specialty: `emc_digital`, `readerboard`, `neon`, `LED_channel`, `backlit`, `halo_lit`, `exposed_neon`, `projection_light`
- Functional: `menu_board`, `drive_thru`, `wayfinding`, `address`, `regulatory`, `nameplate`, `mural`, `vehicle_wrap`, `other_<label>`

**Fact keys** (per sign type where applicable):

| Group | Facts |
|---|---|
| **Permit** | `permit_required`, `permit_exempt`, `application_steps`, `required_materials`, `review_time`, `inspection`, `electrical_permit` |
| **Fees** | `permit_fee`, `plan_review_fee`, `per_sqft_fee`, `inspection_fee`, `annual_fee`, `bond` |
| **Dimensions** | `max_height`, `max_area`, `max_count`, `min_setback`, `min_clearance`, `min_separation`, `area_rule` (aggregate/per-face/per-frontage), `depth_projection`, `height_from_grade` |
| **Illumination/EMC** | `illumination_allowed`, `brightness_nits`, `illumination_hours`, `emc_dwell_time`, `emc_animation`, `emc_transition`, `dimming_required` |
| **Placement** | `allowed_zones`, `overlay_restrictions`, `row_prohibited`, `multi_tenant_rule`, `frontage_req` |
| **Prohibited** | `prohibited_types`, `nonconforming_amortization`, `abandoned_rule` |
| **Process** | `variance_path`, `appeal_path`, `penalties`, `who_issues` (+contact) |
| **Timing** | `temporary_duration`, `display_period`, `removal_deadline` |

Unknown/unstated facts are simply absent — never invented.

## 3. Extraction lane — local agent workers

New worker `scripts/permitting-signage-facts-worker.mjs` (fleet-rostered, slice-partitioned like the office researchers):

**Pass A — deterministic harvest (free, runs on every box, no LLM):**
- Scan each source `.txt`: regex/keyword patterns for `sign`, `§`, `feet|ft|sq\s*ft|square`, `height|setback|clearance`, `permit`, `fee|\$\d`, `illuminat|electronic|LED|EMC`, `prohibit`, `variance|appeal`, `billboard`.
- Emit candidate snippets: `{ jurisdiction, source_doc, page, snippet, pattern_hits[] }` → `.audit-work/signage-facts/candidates/<jurisdiction>.jsonl`.
- Only jurisdictions whose docs contain sign-relevant text proceed — no LLM time wasted on irrelevant docs.

**Pass B — Devin-agent semantic extraction (local LLM = Devin on this PC):**
- `devin-desktop chat` passes each jurisdiction's candidate bundle to a Devin agent with a fixed extraction brief: "From these official snippets, extract structured signage facts. Output JSON per the taxonomy; include exact quote + source + page for every fact; omit facts not stated. Never invent."
- Agents are dispatched per-jurisdiction (never cross-jurisdiction — identity isolation preserved), batch-bounded (e.g. 3 concurrent `chat` sessions, like the worker fleet).
- Output lands in `.audit-work/signage-facts/extracted/<jurisdiction>.json` → outbox → CAS-write into `SignageFact` rows.
- Deterministic fallback: when no Devin session is available, the pass-A pattern hits still produce high-confidence facts (heights/fees/prohibitions with quoted text) marked `confidence: 'pattern'`.

**Pass C — local AI verification gate (replaces staff gating):**
- Facts do NOT wait on staff verification — a local Devin-agent pass reviews each extracted fact batch for obvious extraction errors (quote doesn't support the claim, wrong sign type, unit misread, contradicting duplicate).
- `confidence` ladder: `pattern` → `agent` → `ai_verified` → `verified` (staff can still promote/flag; it just isn't required to display).
- The gate runs on the same PC — the in-app UI can display facts as soon as the local gate clears them, marked with their confidence tier.

**Freshness:** a fact row keys on `jurisdiction + fact_key + sign_type + source_sha` — a re-scanned file that changed supersedes the old fact (supersession chain like the doc archive already uses).

## 4. Index entities (new — additive)

```
SignageFact
  jurisdiction_name, jurisdiction_id, state
  sign_type            // 'wall'|'freestanding'|'monument'|...|'general'
  fact_key             // 'max_height'|'permit_required'|'permit_fee'|...
  value_json           // {value, unit, condition} — structured, not prose
  evidence_quote       // verbatim text the fact came from
  source_document_id   // → PermittingSourceDocument
  page_ref             // page # in source
  confidence           // 'pattern'|'agent'|'ai_verified'|'verified' (local-AI gate advances pattern/agent→ai_verified; staff promotes to verified)
  ai_gate              // {verdict:'pass'|'flag', checked_at, note} — local-AI review record
  active               // false when superseded
  supersedes_id, superseded_by_id

SignageFactIndex            // keyword index — instant lookup substrate
  jurisdiction_id
  term                     // normalized keyword from fact/evidence
  fact_id, weight
```

`staffDataRead`-readable. Writes flow through the existing outbox→CAS path (no new write contract).

## 5. Serving — the search is index-driven, not live-LLM

The "smart pull" is **precomputed + keyword-indexed**, so it answers in milliseconds and never depends on the LLM lane being up:

- **Fact lookup:** `staffDataRead SignageFact { jurisdiction_id, sign_type?, fact_key? }` → grouped fact cards.
- **Ask box:** parse the question → extract terms (sign type words, "height"/"fee"/"permit"/dimension words, jurisdiction name) → `SignageFactIndex` term match → ranked `SignageFact` rows + top `PermittingSourceTextSegment` hits with page refs → render as an answer card (facts + citations). Templated composition — no generative call.
- **Source links:** every fact's `source_document_id` → official_url + archived_file_url + page — rendered as a "pulled from" chip that opens the document viewer.

## 6. UI / UX

Three surfaces — all uncluttered by design:

**A. Jurisdiction card (permitting section, existing card)** — gains a "Signage facts" strip: sign-type chips (wall/monument/EMC…), each expanding to its facts with a source icon per row. Compact, collapsible, invisible when no facts exist.

**B. Client panel** — the client's site address (`Customer.location_address_1/city/state`) resolves via `PermitLookupIndex.address_key` → `jurisdiction_name` → that jurisdiction's facts render as a compact "Signage — <Jurisdiction>" card; same fact layout; a direct "View all" link to the search page pre-scoped to that jurisdiction. When the lookup index misses, the panel offers a one-click resolve (`resolvePermittingAddress`) rather than a dead end.

**C. Signage Search page (`/PermittingSearch`)** — the flagship UX:
- Top: a single large field — "Ask anything: 'pole sign height in Boone County'"
- Below: an answer card (extracted facts, quoted, sourced) + a per-sign-type fact grid + a "Sources" rail with click-through documents
- Jurisdiction picker when the question doesn't name one
- Zero clutter: one input, grouped result cards, nothing else on the page

Fact rows always show: value → quote → doc title + page → external link. If a fact isn't in the index, the UI says so plainly rather than hallucinating.

## 7. Phases

| Phase | Work | Exit gate |
|---|---|---|
| **P1 — Foundation** | `SignageFact` + `SignageFactIndex` entity schemas; taxonomy constants; `permitting-signage-facts-worker` skeleton emitting `sf_scan` events | Entities live; worker claims a jurisdiction slice |
| **P2 — Deterministic harvest** | Pass-A pattern scan across all extracted `.txt`; candidate files per jurisdiction; high-confidence pattern facts flowing into `SignageFact` | Count of pattern-facts per jurisdiction on dashboard |
| **P3 — Devin agent lane** | `devin-desktop chat` extraction prompts per jurisdiction; structured JSON output → index; dedupe/supersession | Agent-extracted facts with quotes+pages landing for a test jurisdiction |
| **P4 — Index + serve** | `SignageFactIndex` build; staffDataRead queries; ask-box term parser + ranked results | Query returns ranked facts <200ms |
| **P5 — Jurisdiction card + client panel** | Fact strip on jurisdiction cards; client-context panel | Visible in app on a real jurisdiction |
| **P6 — Search page** | `/PermittingSearch` — ask box + answer cards + source rail | Page live; ask-box answers with citations |
| **P7 — Freshness + verification** | Re-extract on sha change; supersession; `verified` flag UI; needs_ocr_review handling | Facts re-verify on source updates |

## 8. Constraints & conventions

- Follows the existing worker/mirror/outbox/CAS topology (AGENTS.md §permitting worker topology) — no new full-table reads inside workers; use `entity-mirror.mjs`.
- Devin-agent passes are bounded by the fleet supervisor — never unbounded `chat` sessions.
- `staffDataRead`-readable entities only; writes through `staffEntityWrite`/`staffPermittingDocWrite` as the entity allows.
- Never cross-jurisdiction fact contamination — extraction inputs are always scoped to a single jurisdiction's docs.
- No publish/deploy; entities + UI land in-sandbox only until explicitly released.

## 9. Decisions (resolved 2026-11-06)

1. **Sign type enum** — EVERY type; the enum is exhaustive across form/placement/lighting/function and extensible via `other_<label>` slots.
2. **Client linkage** — `Customer.location_address_1/city/state` → `PermitLookupIndex.address_key` → `jurisdiction_name` → `SignageFact.jurisdiction_name`. One index read when the address was previously resolved; falls back to a live `resolvePermittingAddress` call on miss.
3. **Fact verification** — facts display through the local-AI gate on this PC: pattern/agent-extracted → `ai_verified` → rendered. Staff verification is a promotion, not a gate.
