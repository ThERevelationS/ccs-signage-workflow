# O-004 tail (CMP-A04) — draft↔source merge-conflict UX + partial Builder-sync retry

**Mode:** audit-candidate only. **No remote writes, no checkpoint, no deploy, no publish, no entity operations.**
App `68dfcc5e57bbbc35387da97c`, branch `main`, remote pulled read-only at HEAD `8b0fcf92171373ea3dec071399f10e203135c00f`, **re-verified at `37d401b5aecbafc7ce1773af233efdde22c7ee75`** via `npx base44@latest sandbox read`.

**Remote drift since first pull (re-verified before packaging):** `FoundationEstimator.jsx` moved to `src/pages/FoundationEstimator.jsx` (1448 lines) and gained `design_basis`/`site_hazard` save-payload fields (O-104/O-105 unit); `foundationDraftRecovery.js` gained the same two `FOUNDATION_DRAFT_FIELDS`. The candidate was rebased onto current remote — it is a verbatim current-remote prefix + appended conflict model, and its unknown-field label fallback already covers future field additions. `foundationSyncRecovery.js`, `foundationBuilderRecovery.js`, `foundationSaveSession.js` are byte-identical to first pull.

## Scope

The O-004 lifecycle item already had (verified in earlier units): owner/source/estimate-scoped sessionStorage draft store with CAS + write-refusal tombstone, pricing fields in drafts, dirty-route-leave guard, source refresh warning, CAS-aware save session, and durable `builder_sync_attempt` receipts.

This unit adds the **last two named remainders**:

1. **Draft↔source merge conflict.** When a browser draft's `baseUpdatedAt` anchor no longer matches the persisted FoundationProject's `updated_date`, the user now gets an honest side-by-side conflict experience — both sides' field values and timestamps — with three explicit choices (keep draft / keep saved / keep both as a re-anchored new draft) plus dismiss. Nothing is ever silently discarded. All resolution stays client-side; callers own entity/storage writes.
2. **Partial Builder-sync retry.** A save whose source CAS write already landed but whose estimate-side Builder sync failed (or never acknowledged) exposes a retry that replays **only** the unsynchronized estimate-side portion through `recordBuilderSave` — stored pending plan verbatim when a `price_acceptance_pending` marker exists, convergent resync by `part_key` identity when it doesn't. The source write is never re-issued; `part_key` identity guarantees no duplicate Parts.

## Workspace layout

```
remote/           remote cluster as of HEAD 37d401b5 (draftRecovery, saveSession, syncRecovery, builderRecovery, FoundationEstimator.jsx = the src/pages copy — ownership-protected, unmodified)
remote-src/       76-file recursive import-closure mirror (builderService, partSync, persistence chain, foundationCalc chain, staffEntities, loadAllEntityRows, base44Client, moduleRegistry, shared pricing wires)
candidates/       the five candidate files (see SPEC.json for export-level detail)
diffs/            remote→candidate unified diffs @ 37d401b5 (draftRecovery +227/-0, syncRecovery +58/-0 both pure appends; builderRecovery +140/-1 one import widened; saveSession +8/-2 conflictDetected tagging)
verify-o004t-model.mjs     model harness (pure candidates + esbuild-bundled REAL recordBuilderSave chain over in-memory entity store)
verify-o004t-model-results.json
verify-o004t-browser.mjs   real-component Chromium harness (real candidates + real Radix dialog + real builderService→partSync chain; boundary stubs only)
browser/          browser-verification.json (16/16), metafile.json, 8 screenshots at 1280/390
SPEC.json         candidate spec + exact deferred page wiring (O-096 pattern)
LEDGER.md         claim-safe masterplan paragraph
tmp-model/        esbuild intermediates + stubs (staffEntitiesStub, base44Stub — the ONLY stubs; everything else is real remote code)
pull.cjs / pull-closure.cjs  read-only pull scripts (sandbox read; never sandbox edit/write)
```

## Verified (model 42/42, real-component browser 16/16)

- Conflict matrix: `in_sync` / `edits_only` / `base_moved_identical` / `conflict` / `unverifiable`, incl. `draft_only` counting, `saved_only` non-escalation honesty, numeric-tolerance + key-order + whitespace value semantics, unreadable sides.
- Rebase ("keep both") mints a verbatim-content draft re-anchored to the **current** saved revision through the real store's CAS write — proven against both acceptance and stale-`expectedRevision` refusal.
- Retry classifier: `resume_pending` / `resync_unacknowledged` / `none_needed` / `blocked_mismatch` / `blocked_unsupported` / `blocked_no_estimate`, each with reason + retryable flag.
- Orchestrator: stale pinned source revision → `conflict` with **zero writes**; `pending_key_changed` → `conflict`; blocked modes never call `recordBuilderSave`; unacknowledged line → `pending` (never claimed `synced`).
- Real `recordBuilderSave` end-to-end: first sync mints parts; acknowledged retry = `already_synced` with zero creates; forced re-sync converges the `part_key` set identically; injected mid-chain death + retry completes with **no duplicate keys**; stored pending plan replays exactly its recorded steps then clears; foreign pending key blocked.
- Real-component browser: both-side field values + all three timestamps, all three choices + dismiss, refused-resolution retention, unverifiable-side honesty, re-anchor copy, save-conflict framing, disabled-choice reason, real retry in-browser (minted unique-key parts + acknowledged line + untouched source), stale-anchor conflict, blocked mismatch, acknowledged-hides-surface, mobile 390 usability.

## Honest limits (claim boundaries)

- This is **candidate verification in an audit workspace** — not live-app deploy evidence, not business-record evidence. The page wiring is **documented, not applied** (`src/pages/FoundationEstimator.jsx` is ownership-protected; see SPEC.json `deferred_wiring` — anchors are current-remote: draft-offer line 1141, save-conflict branch 892, sync banner 1089–1102, template dialog 1426).
- The draft envelope stores a base **revision string**, not base content — there is no true three-way merge. The dialog therefore offers honest whole-draft choices and never claims per-field authorship. `saved_only` fields are shown because a draft restore overlays (a saved-only value survives either choice) and are correctly never counted toward `conflict`.
- `retryFoundationBuilderSync` guarantees no-duplicate-Parts by `part_key` identity + CAS/ownership guards inside the **existing** convergent chain; it does not re-do the already-landed source write and adds no new entity write paths.
- A retry whose final line verification fails returns `pending`, not `synced` — the marker is retained for the next retry, never cleared early.
