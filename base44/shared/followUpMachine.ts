// Follow-up state machine — pure TS, zero entity/io imports. Safe to import
// from Deno functions (base44/functions/*) and from frontend modules.
// (ESTIMATOR_MASTERPLAN H-04; reusable for proof follow-ups H-06 via cfg.)
//
// Model (CoreBridge two-stage estimate follow-up parity):
//   - A record (Estimate; any future record kind) carries `follow_up_state`:
//       { stage, last_sent_at, next_due_at, anchor_at,
//         fu1_sent_at, fu2_sent_at, answered_at, closed_reason }
//     Canonical stage vocabulary is FOLLOW_UP_STAGES. `last_sent_at` /
//     `next_due_at` are the two spec'd scheduling keys; the rest are audit/
//     recovery fields. Legacy rows may carry the flat equivalents
//     `follow_up_stage` / `follow_up_last_sent_at` / `follow_up_next_due_at`
//     (plus flat twins for the aux keys) — followUpState() normalizes both
//     shapes into one object; the stored object wins when both are present,
//     with flat fields backfilling keys the object lacks.
//   - Stage semantics:
//       none      — no follow-up sent yet. Eligible once the record's sent
//                   anchor is at least cfg.fu1_delay_days old.
//       fu1_sent  — FU1 delivered. FU2 becomes due at next_due_at.
//       fu2_sent  — FU2 delivered. Sequence complete; the machine never acts
//                   again (the record stays fu2_sent for reporting).
//       answered  — the customer replied; markAnswered() stamps this. Terminal.
//       closed    — sequence cancelled before completion: a terminal status
//                   (approve/decline/convert/cancel/archive) or cancelFollowUp().
//   - Status gate: only `status === 'sent'` records progress. A terminal
//     status (FOLLOW_UP_TERMINAL_STATUSES — covers the estimate lifecycle's
//     approved/archived/cancelled plus declined/converted/won/lost for reuse)
//     closes the sequence exactly once (action 'close' → stage 'closed'),
//     after which evaluations return 'none'. Non-sent non-terminal statuses
//     (draft, calculated, …) simply do not progress.
//   - Anchor ("when it was sent"): stored follow_up_state.anchor_at wins;
//     otherwise cfg.anchor_field, otherwise the first parseable of
//     FOLLOW_UP_ANCHOR_FIELDS (sent_at / quote_issue_date / sent_date /
//     issued_at / proof-fields / updated_date / created_date fallbacks). FU1
//     freezes the resolved anchor into the patch so FU2 scheduling stays
//     deterministic even if the record's own date fields later change.
//   - cfg knobs (resolveFollowUpConfig, defaults FOLLOW_UP_DEFAULTS):
//       fu1_delay_days      (7)  days after the anchor before FU1 is due.
//       fu2_delay_days      (14) absolute FU2 schedule measured from the
//                                anchor — used to rebuild a missing
//                                next_due_at (legacy rows / partial writes).
//       fu2_after_fu1_days  (7)  minimum FU1→FU2 spacing — when FU1 sends,
//                                next_due_at = now + this.
//     Non-finite values fall back to defaults; negatives clamp to 0.
//     Reuse hooks: cfg.status_field (default 'status'), cfg.sent_statuses
//     (default ['sent']), cfg.terminal_statuses (default
//     FOLLOW_UP_TERMINAL_STATUSES), cfg.anchor_field — proof follow-ups pass
//     e.g. { status_field:'proof_status', sent_statuses:['awaiting_approval'],
//            terminal_statuses:['approved'], anchor_field:'proof_sent_at' }.
//   - Idempotent / non-repeating: sends stamp stage + last_sent_at +
//     next_due_at; re-evaluating the patched record the same day is a no-op
//     ('none'). As defense against a partial write that persisted
//     last_sent_at but lost the stage, stage 'none' + a last_sent_at inside
//     the fu2_after_fu1_days window suppresses an immediate FU1 re-fire.
//   - FU2 recovery: stage fu1_sent with a missing/unparseable next_due_at
//     rebuilds the due instant as
//       max(anchor + fu2_delay_days, last FU1 send + fu2_after_fu1_days)
//     so a corrupted schedule can never fire FU2 earlier than either bound.
//
// Timestamps: inputs may be ISO datetimes, date-only "YYYY-MM-DD" (parsed as
// local midnight, repo convention), epoch ms, or Date; outputs are always
// full ISO UTC strings. Due comparisons are instant comparisons — a delay
// boundary is inclusive (due AT anchor + delay). `now` is always injectable;
// the machine never reads the clock itself.
//
// nextStage({record, now, cfg}) → { action, patch, reason, state, due_at? }
//   action ∈ 'send_fu1' | 'send_fu2' | 'close' | 'none'
//   patch  — the complete follow_up_state object to persist on the record
//            (null when action is 'none'). Unknown extra keys already stored
//            in follow_up_state are preserved through the patch.
//   reason — machine-readable why ('fu1_due', 'fu2_due', 'status_terminal:X',
//            'status_gate:X', 'fu1_not_due', 'fu2_not_due', 'fu1_cooldown',
//            'sequence_complete', 'already_closed', 'already_answered',
//            'anchor_missing', 'fu2_schedule_missing', 'now_invalid').

export const FOLLOW_UP_STAGES = ["none", "fu1_sent", "fu2_sent", "answered", "closed"];

export const FOLLOW_UP_DEFAULTS = {
  fu1_delay_days: 7,
  fu2_delay_days: 14,
  fu2_after_fu1_days: 7,
};

// Statuses that end the sequence on the next evaluation. Covers the
// AllInOneEstimate lifecycle (approved/archived/cancelled) plus the
// declined/converted/won/lost spellings used by legacy rows, quotes, and
// proof-style records.
export const FOLLOW_UP_TERMINAL_STATUSES = [
  "approved",
  "declined",
  "converted",
  "won",
  "lost",
  "archived",
  "cancelled",
  "canceled",
];

// Anchor-field fallback chain, in priority order. The estimate's sent marker
// is quote_issue_date (deliveries carry their own sent_at on a separate
// entity); updated/created dates are last-resort fallbacks so a sent record
// with no explicit send stamp still schedules instead of silently skipping.
export const FOLLOW_UP_ANCHOR_FIELDS = [
  "sent_at",
  "quote_issue_date",
  "sent_date",
  "quote_sent_at",
  "issued_at",
  "proof_sent_at",
  "awaiting_proof_approval_since",
  "follow_up_anchor_at",
  "updated_date",
  "created_date",
];

// Accepted spellings normalized into the canonical vocabulary.
const STAGE_ALIASES: Record<string, string> = {
  pending: "none",
  not_started: "none",
  unsent: "none",
  fu1: "fu1_sent",
  follow_up_1: "fu1_sent",
  first_sent: "fu1_sent",
  first_follow_up_sent: "fu1_sent",
  fu2: "fu2_sent",
  follow_up_2: "fu2_sent",
  second_sent: "fu2_sent",
  second_follow_up_sent: "fu2_sent",
  complete: "fu2_sent",
  replied: "answered",
  reply_received: "answered",
  responded: "answered",
  canceled: "closed",
  cancelled: "closed",
  done: "closed",
  dormant: "closed",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Any parseable input → epoch ms; date-only parses as local midnight (bare
// `new Date(str)` would be UTC — repo convention matches dueDateEngine).
const toInstant = (value: any): number | null => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
};

const toIso = (t: number): string => new Date(t).toISOString();

const isoOrNull = (value: any): string | null => {
  const t = toInstant(value);
  return t === null ? null : toIso(t);
};

const strOrNull = (value: any): string | null => {
  const v = String(value ?? "").trim();
  return v || null;
};

const normalizeStage = (value: any): string => {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return "none";
  if ((FOLLOW_UP_STAGES as string[]).includes(key)) return key;
  return STAGE_ALIASES[key] ?? "none";
};

const storedStateObject = (record: any): any =>
  record?.follow_up_state && typeof record.follow_up_state === "object" && !Array.isArray(record.follow_up_state)
    ? record.follow_up_state
    : null;

// Normalize stored state — `follow_up_state` object wins; flat legacy fields
// (`follow_up_stage`, `follow_up_last_sent_at`, `follow_up_next_due_at`, plus
// flat twins of the aux keys) are read when the object is absent and
// backfill keys the object leaves blank.
export function followUpState(record: any = {}) {
  const raw = storedStateObject(record);
  const pickIso = (objKey: string, flatKey: string): string | null =>
    isoOrNull(raw ? (raw[objKey] ?? record?.[flatKey]) : record?.[flatKey]);
  const stageRaw = raw && raw.stage != null ? raw.stage : record?.follow_up_stage;
  return {
    stage: normalizeStage(stageRaw),
    last_sent_at: pickIso("last_sent_at", "follow_up_last_sent_at"),
    next_due_at: pickIso("next_due_at", "follow_up_next_due_at"),
    anchor_at: pickIso("anchor_at", "follow_up_anchor_at"),
    fu1_sent_at: pickIso("fu1_sent_at", "follow_up_fu1_sent_at"),
    fu2_sent_at: pickIso("fu2_sent_at", "follow_up_fu2_sent_at"),
    answered_at: pickIso("answered_at", "follow_up_answered_at"),
    closed_reason: strOrNull(raw ? (raw.closed_reason ?? record?.follow_up_closed_reason) : record?.follow_up_closed_reason),
  };
}

const dayCount = (value: any, dflt: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : dflt;
};

// cfg normalization — camelCase aliases accepted for frontend callers.
export function resolveFollowUpConfig(cfg: any = {}) {
  const sentStatuses = Array.isArray(cfg.sent_statuses)
    ? cfg.sent_statuses.map((s: any) => String(s ?? "").trim().toLowerCase()).filter(Boolean)
    : ["sent"];
  const terminalStatuses = Array.isArray(cfg.terminal_statuses)
    ? cfg.terminal_statuses.map((s: any) => String(s ?? "").trim().toLowerCase()).filter(Boolean)
    : FOLLOW_UP_TERMINAL_STATUSES;
  return {
    fu1_delay_days: dayCount(cfg.fu1_delay_days ?? cfg.fu1DelayDays, FOLLOW_UP_DEFAULTS.fu1_delay_days),
    fu2_delay_days: dayCount(cfg.fu2_delay_days ?? cfg.fu2DelayDays, FOLLOW_UP_DEFAULTS.fu2_delay_days),
    fu2_after_fu1_days: dayCount(cfg.fu2_after_fu1_days ?? cfg.fu2AfterFu1Days, FOLLOW_UP_DEFAULTS.fu2_after_fu1_days),
    status_field: strOrNull(cfg.status_field ?? cfg.statusField) ?? "status",
    sent_statuses: sentStatuses.length ? sentStatuses : ["sent"],
    terminal_statuses: terminalStatuses,
    anchor_field: strOrNull(cfg.anchor_field ?? cfg.anchorField),
  };
}

// Resolve "when the record entered the follow-up window". Persisted
// follow_up_state.anchor_at wins; then cfg.anchor_field; then the
// FOLLOW_UP_ANCHOR_FIELDS chain. Returns { at (ISO|null), ms, field }.
export function followUpAnchor(record: any = {}, cfg: any = {}) {
  const c = resolveFollowUpConfig(cfg);
  const state = followUpState(record);
  if (state.anchor_at) {
    return { at: state.anchor_at, ms: toInstant(state.anchor_at), field: "follow_up_state.anchor_at" };
  }
  const fields: string[] = [];
  if (c.anchor_field) fields.push(c.anchor_field);
  for (const f of FOLLOW_UP_ANCHOR_FIELDS) if (!fields.includes(f)) fields.push(f);
  for (const field of fields) {
    const ms = toInstant(record?.[field]);
    if (ms !== null) return { at: toIso(ms), ms, field };
  }
  return { at: null, ms: null, field: "" };
}

// Complete follow_up_state patch: stored object's unknown keys preserved,
// every normalized key explicitly set (nulls included) so persisted state
// never carries stale tombstones across a transition.
const statePatch = (record: any, overrides: any) => ({
  ...(storedStateObject(record) ?? {}),
  stage: overrides.stage ?? "none",
  last_sent_at: overrides.last_sent_at ?? null,
  next_due_at: overrides.next_due_at ?? null,
  anchor_at: overrides.anchor_at ?? null,
  fu1_sent_at: overrides.fu1_sent_at ?? null,
  fu2_sent_at: overrides.fu2_sent_at ?? null,
  answered_at: overrides.answered_at ?? null,
  closed_reason: overrides.closed_reason ?? null,
});

// Evaluate the next move for a record. Pure — `now` is injectable (ISO,
// date-only, epoch ms, or Date). Returns { action, patch, reason, state,
// due_at? }; `patch` is the complete follow_up_state to persist on send/
// close actions and null on 'none'.
export function nextStage({ record = {}, now, cfg = {} }: any = {}) {
  const state = followUpState(record);
  const c = resolveFollowUpConfig(cfg);
  const nowMs = toInstant(now);
  const none = (reason: string, extra: any = {}) => ({ action: "none", patch: null, reason, state, ...extra });
  if (nowMs === null) return none("now_invalid");
  const nowIso = toIso(nowMs);

  // Terminal stages never move again.
  if (state.stage === "closed") return none("already_closed");
  if (state.stage === "answered") return none("already_answered");
  if (state.stage === "fu2_sent") return none("sequence_complete");

  // Status gate: terminal status closes an open sequence exactly once;
  // only sent-status records progress; anything else is inert.
  const status = String(record?.[c.status_field] ?? "").trim().toLowerCase();
  if (c.terminal_statuses.includes(status)) {
    return {
      action: "close",
      patch: statePatch(record, { ...state, stage: "closed", next_due_at: null, closed_reason: status }),
      reason: `status_terminal:${status}`,
      state,
    };
  }
  if (!c.sent_statuses.includes(status)) return none(`status_gate:${status || "missing"}`);

  const anchor = followUpAnchor(record, cfg);

  if (state.stage === "fu1_sent") {
    let dueMs = toInstant(state.next_due_at);
    let dueSource = "next_due_at";
    if (dueMs === null) {
      // Missing/corrupt schedule — rebuild as the LATER of the absolute
      // (anchor + fu2_delay_days) and spacing (FU1 send + fu2_after_fu1_days)
      // bounds so recovery can only ever delay FU2, never fire it early.
      const candidates: number[] = [];
      if (anchor.ms !== null) candidates.push(anchor.ms + c.fu2_delay_days * DAY_MS);
      const fu1SentMs = toInstant(state.fu1_sent_at) ?? toInstant(state.last_sent_at);
      if (fu1SentMs !== null) candidates.push(fu1SentMs + c.fu2_after_fu1_days * DAY_MS);
      dueMs = candidates.length ? Math.max(...candidates) : null;
      dueSource = "recovered";
    }
    if (dueMs === null) return none("fu2_schedule_missing");
    if (nowMs < dueMs) return none("fu2_not_due", { due_at: toIso(dueMs), due_source: dueSource });
    return {
      action: "send_fu2",
      patch: statePatch(record, {
        ...state,
        stage: "fu2_sent",
        last_sent_at: nowIso,
        fu2_sent_at: nowIso,
        next_due_at: null,
        closed_reason: null,
      }),
      reason: `fu2_due:${dueSource}`,
      state,
      due_at: toIso(dueMs),
    };
  }

  // stage === 'none'
  const lastSentMs = toInstant(state.last_sent_at) ?? toInstant(state.fu1_sent_at);
  if (lastSentMs !== null && nowMs < lastSentMs + c.fu2_after_fu1_days * DAY_MS) {
    // A send is recorded but the stage marker was lost — suppress an
    // immediate re-fire (double-send guard for partial writes).
    return none("fu1_cooldown", { due_at: toIso(lastSentMs + c.fu2_after_fu1_days * DAY_MS) });
  }
  if (anchor.ms === null) return none("anchor_missing");
  const fu1DueMs = anchor.ms + c.fu1_delay_days * DAY_MS;
  if (nowMs < fu1DueMs) return none("fu1_not_due", { due_at: toIso(fu1DueMs), anchor_field: anchor.field });
  return {
    action: "send_fu1",
    patch: statePatch(record, {
      stage: "fu1_sent",
      last_sent_at: nowIso,
      next_due_at: toIso(nowMs + c.fu2_after_fu1_days * DAY_MS),
      anchor_at: anchor.at,
      fu1_sent_at: nowIso,
      fu2_sent_at: state.fu2_sent_at,
      answered_at: null,
      closed_reason: null,
    }),
    reason: "fu1_due",
    state,
    due_at: toIso(fu1DueMs),
    anchor_field: anchor.field,
  };
}

// Customer replied — stamps stage 'answered' (terminal for the sequence),
// clears next_due_at, keeps send history. `now` optional: when given, the
// reply instant is recorded in answered_at.
export function markAnswered(record: any = {}, now: any = null) {
  const state = followUpState(record);
  return statePatch(record, {
    ...state,
    stage: "answered",
    next_due_at: null,
    answered_at: isoOrNull(now) ?? state.answered_at,
    closed_reason: state.closed_reason,
  });
}

// Cancel the sequence out-of-band (manual stop, status change handled
// elsewhere, record withdrawn). Stamps stage 'closed' with closed_reason;
// send history is preserved for reporting.
export function cancelFollowUp(record: any = {}, reason: any = "manual_cancel") {
  const state = followUpState(record);
  return statePatch(record, {
    ...state,
    stage: "closed",
    next_due_at: null,
    closed_reason: strOrNull(reason) ?? "manual_cancel",
  });
}
