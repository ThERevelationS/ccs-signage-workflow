import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle as AlertTriangleIcon, GitCompareArrows as GitCompareIcon, RefreshCw as RefreshIcon } from "lucide-react";
import {
  foundationDraftConflictNeedsReview,
  summarizeFoundationDraftConflict,
} from "./foundationDraftRecovery";
import { retryFoundationBuilderSync } from "./foundationBuilderRecovery";

// ---------------------------------------------------------------------------
// Draft ↔ saved-source merge-conflict dialog + partial Builder-sync retry
// surface (CMP-A04 tail).
//
// Merge-conflict UX: when a draft's base anchor (env.baseUpdatedAt) no longer
// equals the persisted record's updated_date — i.e. a concurrent save moved
// underneath the draft — the ordinary restore/discard banner is not enough:
// this dialog shows which side holds what (per-field draft vs saved rows +
// timestamps) and offers three honest resolutions:
//   keep_draft — the draft's recorded fields win (applied as the ordinary
//                draft overlay; fields it never recorded keep current values);
//   keep_saved — the draft is discarded by explicit choice;
//   keep_both  — the saved project stays open AND the draft is re-anchored to
//                the current revision as a new offer (nothing is dropped).
// Every choice is delegated to the caller — this component never writes
// storage or entities itself. When a side cannot be read, the dialog says so
// and flags the choice that would drop the unseen side.
//
// Deferred page wiring (FoundationEstimator.jsx is ownership-protected):
//   const syncConflict = useFoundationSyncConflict();
//   const syncRetry = useFoundationBuilderSyncRetry(() => ({
//     sourceId: id, estimateId,
//     expectedSourceVersion: acknowledgedVersionRef.current?.updated_date,
//     savedProject: acknowledgedVersionRef.current?.sourceSnapshot,
//     builderCalculation: lastSyncCaptureRef.current?.builderCalculation ?? null,
//     liveTotal: lastSyncCaptureRef.current?.liveTotal,
//   }));
//   — open on the draft offer's "saved project changed" line:
//       syncConflict.openDraftConflict({ draft: draftVisible.draft,
//         draftSavedAt: draftVisible.savedAt, baseUpdatedAt: draftVisible.baseUpdatedAt,
//         savedProject: acknowledgedVersionRef.current?.sourceSnapshot,
//         getSavedProject: () => staffEntities.FoundationProject.get(id) })
//   — open on a CAS save conflict (outcome.status 'conflict' + conflictDetected):
//       syncConflict.openSaveConflict({ draft: <stored draft fields or in-memory
//         draft-shaped edits>, getSavedProject: same })
//   — mount before FoundationTemplateDialog:
//       <FoundationSyncConflictDialog conflict={syncConflict.conflict}
//         busy={saving} disabled={{...}} onKeepDraft={...} onKeepSaved={...}
//         onKeepBoth={...} onDismiss={syncConflict.dismiss} />
//   — retry banner mounts next to the existing "Review and retry Save" button:
//       <FoundationSyncRetryAction retryState={classifyFoundationSyncRetry({
//         project, estimateId, estimate: linkedEstimate })}
//         retrying={syncRetry.retrying} lastOutcome={syncRetry.lastOutcome}
//         onRetry={async () => { const o = await syncRetry.retry();
//           if (o.status === 'synced') { setRecoveryRequired(false); <patch linkedEstimate line> } }} />
// ---------------------------------------------------------------------------

const fmtTs = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t).toLocaleString() : (iso || "unknown");
};

// ---------------------------------------------------------------------------
// useFoundationSyncConflict — owns conflict state. Both openers fetch a FRESH
// saved record when getSavedProject is provided (falling back to the passed
// savedProject snapshot) so the diff judges the draft against the live record,
// never a stale copy. They return {opened, summary}; the conflict stays
// mounted until dismiss()/resolve marks it handled.
// ---------------------------------------------------------------------------
export function useFoundationSyncConflict() {
  const [conflict, setConflict] = useState(null);
  const [resolving, setResolving] = useState(false);
  const openSeq = useRef(0);

  const open = useCallback(async (kind, { draft = null, draftSavedAt = null, baseUpdatedAt = null, savedProject = null, getSavedProject = null, hasUnbackedEdits = false } = {}) => {
    const seq = ++openSeq.current;
    let saved = savedProject && typeof savedProject === "object" ? savedProject : null;
    let savedReadable = null; // null = no live re-read attempted
    if (typeof getSavedProject === "function") {
      try {
        const fresh = await getSavedProject();
        if (fresh && typeof fresh === "object") {
          saved = fresh;
          savedReadable = true;
        } else {
          // A resolved-but-empty read means the record may be gone — do not
          // diff against a possibly-stale snapshot and call it authoritative.
          saved = null;
          savedReadable = false;
        }
      } catch {
        // Read failed: keep the caller's snapshot for display but flag the
        // comparison as against-the-last-known-copy, not the live record.
        savedReadable = false;
      }
    }
    if (seq !== openSeq.current) return { opened: false, summary: null, stale: true };
    const summary = summarizeFoundationDraftConflict({ draft, saved, baseUpdatedAt, draftSavedAt });
    const opened = foundationDraftConflictNeedsReview(summary) || savedReadable === false;
    if (!opened) return { opened: false, summary };
    setConflict({
      kind,
      draft: draft && typeof draft === "object" ? draft : null,
      draftSavedAt,
      baseUpdatedAt,
      savedProject: saved,
      savedReadable,
      hasUnbackedEdits,
      summary,
      openedAt: new Date().toISOString(),
    });
    return { opened: true, summary };
  }, []);

  const openDraftConflict = useCallback(
    (args) => open("draft_vs_saved", args),
    [open],
  );
  const openSaveConflict = useCallback(
    (args) => open("save_conflict", args),
    [open],
  );
  const dismiss = useCallback(() => setConflict(null), []);

  // Wraps a choice handler: marks the conflict resolved, delegates to the
  // caller's routine, and only closes when the routine succeeds (a false/throw
  // leaves the conflict open — a resolution must never silently half-apply).
  const choose = useCallback(async (handler) => {
    if (typeof handler !== "function" || resolving) return false;
    setResolving(true);
    try {
      const result = await handler();
      if (result === false) return false;
      setConflict(null);
      return true;
    } finally {
      setResolving(false);
    }
  }, [resolving]);

  return { conflict, resolving, openDraftConflict, openSaveConflict, choose, dismiss };
}

// ---------------------------------------------------------------------------
// FoundationSyncConflictDialog — presentational dialog. All four actions are
// caller delegates; `disabled` maps choice keys to a disabled reason string.
// ---------------------------------------------------------------------------
const CHOICE_LABELS = {
  keep_draft: "Keep draft edits",
  keep_saved: "Keep saved project",
  keep_both: "Keep both — hold draft as a new offer",
};

const CHOICE_NOTES = {
  draft_vs_saved: {
    keep_draft: "Applies the browser draft's recorded fields over the saved project. Fields the draft never recorded keep their saved values. The newer saved content in the listed fields is replaced in this editor — nothing is written until you save.",
    keep_saved: "Discards the browser draft by your explicit choice. The saved project stays as loaded.",
    keep_both: "Keeps the saved project open AND re-anchors the draft to this saved revision as a new browser draft offer — nothing is dropped; restore it later from the draft banner if you still want it.",
  },
  save_conflict: {
    keep_draft: "Reloads the newer saved project, then re-applies your unsent edits on top so your next save lands on the fresh revision.",
    keep_saved: "Discards your unsent edits by your explicit choice and reloads the newer saved project.",
    keep_both: "Reloads the newer saved project AND re-anchors your unsent edits as a fresh browser draft offer — nothing is dropped; restore it later from the draft banner if you still want it.",
  },
};

export default function FoundationSyncConflictDialog({
  conflict,
  busy = false,
  disabled = {},
  onKeepDraft,
  onKeepSaved,
  onKeepBoth,
  onDismiss,
}) {
  if (!conflict) return null;
  const { summary, kind } = conflict;
  const notes = CHOICE_NOTES[kind] || CHOICE_NOTES.draft_vs_saved;
  const fields = Array.isArray(summary?.fields) ? summary.fields : [];
  const conflictRows = fields.filter((f) => f.status === "diverged" || f.status === "draft_only");
  const savedOnlyRows = fields.filter((f) => f.status === "saved_only");
  const sameCount = fields.filter((f) => f.status === "same").length;
  const savedUnknown = conflict.savedReadable === false;
  const title = kind === "save_conflict"
    ? "Saved project changed while you were editing"
    : summary?.status === "base_moved_identical"
      ? "Browser draft matches the newer save — re-anchor?"
      : "Browser draft conflicts with a newer saved project";
  const reason = summary?.status === "unverifiable" && summary?.reason === "saved_unreadable"
    ? "The saved project record could not be read, so a field-level comparison is unavailable. The choices below still apply — discarding the draft against an unseen record is flagged."
    : null;

  const handlers = { keep_draft: onKeepDraft, keep_saved: onKeepSaved, keep_both: onKeepBoth };
  const renderChoice = (key) => {
    const reasonText = disabled?.[key];
    const handler = handlers[key];
    const off = busy || !!reasonText || typeof handler !== "function";
    return (
      <div key={key} className="rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-800">{CHOICE_LABELS[key]}</div>
            <div className="mt-0.5 text-[12px] text-gray-600">{notes[key]}</div>
            {reasonText && <div className="mt-1 text-[12px] font-semibold text-amber-800">{reasonText}</div>}
          </div>
          <button
            type="button"
            disabled={off}
            onClick={() => handler?.()}
            className={`shrink-0 rounded-sm border px-2 py-1 text-[12px] font-semibold disabled:opacity-50 ${
              key === "keep_draft"
                ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                : key === "keep_saved"
                  ? "border-gray-400 bg-white text-gray-700"
                  : "border-blue-400 bg-blue-50 text-blue-800"
            }`}
          >
            {CHOICE_LABELS[key]}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onDismiss?.(); }}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-[12px] text-gray-700">
          <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 leading-relaxed">
            <div>
              <span className="font-semibold">Browser draft</span>
              {conflict.draftSavedAt ? ` — written ${fmtTs(conflict.draftSavedAt)}` : " — write time unknown"}
              {conflict.baseUpdatedAt ? `, anchored to saved revision ${conflict.baseUpdatedAt}` : ""}
            </div>
            <div>
              <span className="font-semibold">Saved project</span>
              {summary?.savedUpdatedAt
                ? ` — now at revision ${summary.savedUpdatedAt}`
                : savedUnknown
                  ? " — could not be re-read"
                  : " — revision unknown"}
            </div>
            {summary?.baseMoved && (
              <div className="mt-1 text-amber-800">The saved project moved after this draft was written — a concurrent edit was detected.</div>
            )}
            {conflict.kind === "save_conflict" && !summary?.baseMoved && (
              <div className="mt-1 text-amber-800">The save was refused because the stored revision changed; your unsent edits are still held in this tab.</div>
            )}
          </div>

          {reason && <div role="alert" className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">{reason}</div>}

          {conflictRows.length > 0 ? (
            <div className="overflow-hidden rounded-sm border border-gray-200">
              <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <span>Field</span>
                <span className="flex items-center gap-1"><GitCompareIcon className="h-3 w-3" />Browser draft</span>
                <span>Saved project</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {conflictRows.map((row) => (
                  <div
                    key={row.field}
                    data-field={row.field}
                    data-status={row.status}
                    className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] border-t border-gray-100 px-3 py-1.5 ${row.status === "diverged" ? "bg-amber-50/60" : "bg-indigo-50/40"}`}
                  >
                    <span className="pr-2 font-medium text-gray-800">{row.label}</span>
                    <span className="pr-2 text-gray-700">
                      {row.draft?.text ?? "—"}
                      {row.status === "draft_only" && <span className="ml-1 text-[10px] font-semibold uppercase text-indigo-700">draft only</span>}
                    </span>
                    <span className="text-gray-700">{row.saved?.text ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : summary?.status === "base_moved_identical" ? (
            <div className="rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
              Every draft field matches the newer saved revision — only the draft's anchor is stale. Re-anchoring is safe either way; choose below.
            </div>
          ) : null}

          {(sameCount > 0 || savedOnlyRows.length > 0) && (
            <details className="rounded-sm border border-gray-200 px-3 py-2">
              <summary className="cursor-pointer text-[12px] font-semibold text-gray-700">
                {sameCount} identical {sameCount === 1 ? "field" : "fields"}
                {savedOnlyRows.length > 0 ? ` · ${savedOnlyRows.length} saved-only ${savedOnlyRows.length === 1 ? "field" : "fields"} (kept either way)` : ""}
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-gray-600">
                {fields.filter((f) => f.status === "same").map((f) => (
                  <li key={f.field}>{f.label}: {f.draft?.text ?? "—"}</li>
                ))}
                {savedOnlyRows.map((f) => (
                  <li key={f.field}>{f.label}: saved has “{f.saved?.text ?? "—"}”; the draft never recorded it, so restore leaves it untouched.</li>
                ))}
              </ul>
            </details>
          )}

          <div className="space-y-2">
            {renderChoice("keep_draft")}
            {renderChoice("keep_saved")}
            {renderChoice("keep_both")}
          </div>

          {conflict.hasUnbackedEdits && (
            <div role="alert" className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              Unsent in-memory edits could not be backed up to the tab draft store. Choosing “keep saved” drops them — pick “keep draft” or resolve storage first.
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button type="button" onClick={onDismiss} disabled={busy} className="h-[30px] rounded-sm border border-gray-300 px-3 text-[12px] text-gray-700 disabled:opacity-50">
              Decide later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// useFoundationBuilderSyncRetry — owns retry in-flight state for the partial
// Builder-sync surface. `getContext` returns the retryFoundationBuilderSync
// args ({sourceId, estimateId, expectedSourceVersion, savedProject?,
// builderCalculation?, liveTotal?, expectedPendingKey?, deps?}); `impl` is an
// optional override for tests. The last outcome is retained for display.
// ---------------------------------------------------------------------------
export function useFoundationBuilderSyncRetry(getContext, impl = retryFoundationBuilderSync) {
  const [retrying, setRetrying] = useState(false);
  const [lastOutcome, setLastOutcome] = useState(null);
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const implRef = useRef(impl);
  implRef.current = impl;
  const flightRef = useRef(null);

  const retry = useCallback(async () => {
    if (flightRef.current) return flightRef.current;
    const flight = Promise.resolve()
      .then(() => implRef.current(getContextRef.current?.() || {}))
      .then((outcome) => {
        setLastOutcome(outcome || null);
        return outcome;
      })
      .finally(() => {
        if (flightRef.current === flight) flightRef.current = null;
        setRetrying(false);
      });
    flightRef.current = flight;
    setRetrying(true);
    return flight;
  }, []);

  return { retry, retrying, lastOutcome };
}

// ---------------------------------------------------------------------------
// FoundationSyncRetryAction — the retry affordance for a failed/partial sync.
// `retryState` is classifyFoundationSyncRetry's result; `onRetry` delegates to
// the caller's useFoundationBuilderSyncRetry.retry (so the page owns outcome
// handling — linkedEstimate patch, recoveryRequired clear). Honest copy names
// exactly what replays: only the un-synced estimate-side portion, never the
// already-saved project write.
// ---------------------------------------------------------------------------
export function FoundationSyncRetryAction({
  retryState,
  onRetry,
  retrying = false,
  lastOutcome = null,
  estimateHref = null,
  disabled = false,
}) {
  if (!retryState || retryState.mode === "none_needed") return null;
  const attempt = retryState.attempt;
  const modeLabel = retryState.mode === "resume_pending"
    ? "Resume the recorded Builder operation"
    : "Retry the unfinished Builder sync";
  const outcomeLine = lastOutcome
    ? lastOutcome.status === "synced"
      ? { tone: "ok", text: "Builder sync completed — the estimate line now acknowledges this saved revision." }
      : lastOutcome.status === "already_synced"
        ? { tone: "ok", text: "Nothing left to sync — this revision is already acknowledged." }
        : lastOutcome.status === "blocked"
          ? { tone: "warn", text: lastOutcome.reason || "Retry is blocked until the sync receipt is reviewed." }
          : lastOutcome.status === "conflict"
            ? { tone: "warn", text: lastOutcome.error || "The saved revision or pending marker moved — reload before retrying." }
            : lastOutcome.status === "pending"
              ? { tone: "warn", text: lastOutcome.error || "The retry ran but synchronization is still incomplete — review and retry." }
              : lastOutcome.status === "invalid"
                ? { tone: "warn", text: lastOutcome.error || "Retry could not be initialized." }
                : { tone: "warn", text: lastOutcome.error || "Retry failed — the recorded remainder is retained for another attempt." }
    : null;

  return (
    <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0">
          {retryState.retryable ? retryState.reason : retryState.reason || "This Builder sync cannot be retried here."}
          {attempt?.requested_at ? ` Attempt recorded ${fmtTs(attempt.requested_at)}.` : ""}
          {" "}Only the unfinished estimate-side sync replays — the saved project write is not repeated.
        </span>
        {estimateHref && (
          <a className="underline" href={estimateHref}>Open estimate</a>
        )}
        <button
          type="button"
          disabled={disabled || retrying || !retryState.retryable || typeof onRetry !== "function"}
          onClick={() => onRetry?.()}
          className="flex items-center gap-1.5 rounded-sm bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
        >
          <RefreshIcon className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Retrying…" : modeLabel}
        </button>
      </div>
      {outcomeLine && (
        <div className={`mt-1.5 text-[12px] ${outcomeLine.tone === "ok" ? "text-emerald-800" : "text-amber-900"}`}>
          {outcomeLine.text}
        </div>
      )}
    </div>
  );
}
