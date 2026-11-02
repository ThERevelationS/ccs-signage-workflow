// In-app BROADCAST MESSAGE model — pure TS, zero entity/io imports. Safe to
// import from Deno functions (base44/functions/*) and frontend modules.
// (Masterplan item H-11 — staff-composed, cohort-targeted banner messages
// with ack/dismiss.)
//
// WHY A NEW ENTITY AND NOT Announcement or Notification:
//   - Announcement is a single-live "blast everyone" broadcast popup (admin
//     composer, is_active singleton convergence, sound/display chrome,
//     target_users = raw email list only, acknowledged_viewers capped 500).
//     It has no staff COHORT vocabulary and its read RLS is open to every
//     signed-in user — fine for all-staff blasts, wrong for "managers only".
//   - Notification is the SYSTEM-generated per-user inbox (recipient_email
//     rows, read/snooze/handled lifecycle) rendered in the notification
//     center — one row per recipient, written by detectors, not composed.
//   - BroadcastMessage is the middle surface: a staff member composes ONE
//     row, the backend resolves the cohort server-side, and recipients see
//     a banner until they ack/dismiss it or it expires.
//
// ENTITY: base44/entities/BroadcastMessage.jsonc — backend-only RLS on ALL
// four ops (__broadcast_message_backend_only__), deliberately TIGHTER than
// Announcement's open read: a cohort-targeted row must never leave the
// backend to a non-recipient, and staff EmailGate sessions cannot satisfy
// entity RLS anyway, so every read/write flows through a session-
// authenticated function (wiring spec: `manageBroadcasts`, mirroring
// manageAnnouncements). Do NOT add this entity to the staffDataRead
// allowlist — raw gateway reads would leak other cohorts' messages.
//
// RECEIPT MODEL (embedded arrays — justified):
//   acked_user_ids[] + dismissed_user_ids[] ride ON the message row,
//   mirroring Announcement.acknowledged_viewers. A separate receipt entity
//   was rejected: (a) staff rosters are tens of users, not thousands, so the
//   Announcement-style 500-cap is unreachable; (b) one row read yields the
//   banner AND the viewer's ack state — a receipt table would double the
//   poll-cycle entity reads against the shared entity_list budget
//   (AGENTS.md app-level read-cap note); (c) the ack write is the proven
//   updateMany({id, updated_date}, {$set}) CAS-retry already used by
//   manageAnnouncements.acknowledge.
//
// VIEWER/TARGET IDENTITY:
//   Staff identity is EMAIL everywhere (session actor.email,
//   Announcement viewerKey `user:<email>`, AuthorizedEmail.email is the
//   roster key). target_user_ids / acked_user_ids / dismissed_user_ids
//   therefore store LOWERCASE STAFF EMAILS. For resilience the matcher
//   also accepts an AuthorizedEmail entity id in target_user_ids (the
//   composer's individual picker hands back directory rows that carry both)
//   — but the canonical stored form is the email.
//
// COHORT → sales_roles MAPPING (judgment call — adjust COHORT_ROLE_MAP, one
// edit point; canonical role vocabulary is SALES_ROLES in
// manageAuthorizedUsers/entry.ts:10-22 and the UserManagement roster
// checkboxes):
//
//   cohort      AuthorizedEmail gate
//   ---------   --------------------------------------------------------
//   everyone    any active staff record (no sales_roles required)
//   design      sales_roles ∋ "Designer"
//   production  sales_roles ∩ {Installer, Fabricator, CNC Router Operator,
//                               CNC Laser Operator, Painter}  (shop floor)
//   sales       sales_roles ∩ {Estimator, Task Assigned}
//   managers    role === "admin"  OR  sales_roles ∩
//               {Project Manager, Office Administration}
//   individual  email (or id) ∈ target_user_ids — sales_roles ignored
//
//   CAVEATS the orchestrator should review:
//   - "Task Assigned" is the pipeline task-ASSIGNEE eligibility flag
//     (smartsheetVocabularyReviewModel eligible-users gate;
//     manageAuthorizedUsers defaults NEW users to ['Task Assigned']), not a
//     sales discriminator — it spans sales AND production. sales includes
//     it per the item brief so pipeline task-owners are reachable as
//     "sales", accepting that broadly-assignable staff may receive sales
//     broadcasts. Tighter alternative: sales = {Estimator} only.
//   - "Accounting" maps to NO cohort (staff who only hold Accounting +
//     Task Assigned still get `sales` broadcasts via Task Assigned; if
//     Accounting should be cohort-free, strip Task Assigned from their
//     roster entry or revisit the sales map).
//   - managers includes role==="admin" so owners/admins with no PM/Office
//     roster flags still receive management broadcasts.
//   - Office Administration lives in managers (front-office coordination),
//     not production.
//
// VISIBILITY (visibleBroadcasts): a message is visible to a user iff
//   status === "sent"  (cancelled rows never render)
//   AND expires_at missing/unparseable OR > now   (open expiry tolerated at
//        read — fail-closed at WRITE via broadcastMessageShape, the same
//        convention as AnnouncementContext's isFinite(exp) && exp <= now)
//   AND the user is ACTIVE staff matching the cohort audience predicate
//        (individual → target list; deactivated viewers see nothing)
//   AND user key ∉ acked_user_ids ∪ dismissed_user_ids
// Output is ordered urgent-first then newest created_at first.
//
// WRITE-SIDE CONTRACT (for the future function): compose →
// broadcastMessageShape (throws on invalid input) → create; retract →
// $set status:'cancelled' via updated_date CAS; ack → ackReceipt patch via
// the same CAS-retry as manageAnnouncements.acknowledge (cap arrays at
// ACK_LIST_CAP).

export const BROADCAST_COHORTS = [
  "everyone",
  "design",
  "production",
  "sales",
  "managers",
  "individual",
] as const;
export type BroadcastCohort = (typeof BROADCAST_COHORTS)[number];

export const BROADCAST_PRIORITIES = ["normal", "urgent"] as const;
export type BroadcastPriority = (typeof BROADCAST_PRIORITIES)[number];

export const BROADCAST_STATUS = ["sent", "cancelled"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUS)[number];

// Cohort → canonical AuthorizedEmail.sales_roles values. `admins` is not a
// sales_roles entry — it keys the role==="admin" gate instead.
export const COHORT_ROLE_MAP: Record<
  Exclude<BroadcastCohort, "everyone" | "individual">,
  { sales_roles: readonly string[]; include_admins: boolean }
> = {
  design: {
    sales_roles: ["Designer"],
    include_admins: false,
  },
  production: {
    sales_roles: [
      "Installer",
      "Fabricator",
      "CNC Router Operator",
      "CNC Laser Operator",
      "Painter",
    ],
    include_admins: false,
  },
  sales: {
    sales_roles: ["Estimator", "Task Assigned"],
    include_admins: false,
  },
  managers: {
    sales_roles: ["Project Manager", "Office Administration"],
    include_admins: true,
  },
};

// Upper bound for the embedded receipt lists — mirrors the
// manageAnnouncements slice(-500) cap; far above any realistic staff count.
export const ACK_LIST_CAP = 500;

const MAX_TARGETS = 500;

// ---------------------------------------------------------------------------
// primitives (same conventions as crmSuggestionModel.ts)
// ---------------------------------------------------------------------------

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

const str = (v: any): string => String(v ?? "").trim();
const norm = (v: any): string => str(v).toLowerCase();

const cleanText = (value: any, max: number): string => str(value).slice(0, max);

// Deduped, trimmed, lowercased, bounded list — same convention as
// manageAnnouncements cleanList, except entries normalize to lowercase
// BEFORE dedupe so 'DES@X.COM' + 'des@x.com' collapse to one
// recipient/receipt (staff identity is email — always stored lowercased).
function cleanEmailList(value: any, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((item) => cleanText(item, maxLen).toLowerCase()).filter(Boolean),
    ),
  ].slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// staff-user gates
// ---------------------------------------------------------------------------

// The viewer/roster rows this model sees come in three shapes — session
// actor (verifySession user: {id,email,full_name,role,sales_roles,...}),
// listAuthorizedUserDirectory rows ({id,email,full_name,sales_roles}), and
// raw AuthorizedEmail entity rows (adds is_deactivated). All accessors are
// tolerant of the thinner shapes.
export const staffUserKey = (user: any): string => norm(user?.email) || norm(user?.id);

export const staffIsActive = (user: any): boolean =>
  Boolean(user) && user?.is_deactivated !== true && user?.is_active !== false;

export const staffIsAdmin = (user: any): boolean => norm(user?.role) === "admin";

const staffRoles = (user: any): string[] =>
  Array.isArray(user?.sales_roles) ? user.sales_roles : [];

// Exact, case-insensitive role membership — roster values are canonical
// ("CNC Router Operator"), never substring-matched.
export const staffHasRole = (user: any, role: any): boolean => {
  const want = norm(role);
  if (!want) return false;
  return staffRoles(user).some((r: any) => norm(r) === want);
};

const staffHasAnyRole = (user: any, roles: readonly string[]): boolean =>
  roles.some((role) => staffHasRole(user, role));

// ---------------------------------------------------------------------------
// cohort resolution
// ---------------------------------------------------------------------------

/**
 * Role/target gate for a cohort — WITHOUT the active-staff check so callers
 * can distinguish "wrong role" from "deactivated". Compose with
 * staffIsActive for the full audience gate (cohortAudiencePredicate).
 *
 *   cohortMatches(user, 'design')
 *   cohortMatches(user, 'individual', { target_user_ids: ['sam@x.com'] })
 */
export function cohortMatches(
  user: any,
  cohort: any,
  { target_user_ids = [] }: any = {},
): boolean {
  if (!user) return false;
  const c = norm(cohort);
  switch (c) {
    case "everyone":
      return true;
    case "design":
    case "production":
    case "sales":
      return staffHasAnyRole(user, COHORT_ROLE_MAP[c].sales_roles);
    case "managers":
      return (
        staffIsAdmin(user) ||
        staffHasAnyRole(user, COHORT_ROLE_MAP.managers.sales_roles)
      );
    case "individual": {
      const targets = new Set(
        (Array.isArray(target_user_ids) ? target_user_ids : []).map(norm).filter(Boolean),
      );
      if (targets.size === 0) return false;
      return targets.has(norm(user?.email)) || targets.has(norm(user?.id));
    }
    default:
      return false;
  }
}

/**
 * Full audience gate: an ACTIVE staff record the cohort targets.
 * Deactivated users are never an audience for any cohort (they cannot sign
 * in, and including them would inflate audienceEstimate).
 */
export const cohortAudiencePredicate =
  (cohort: any, { target_user_ids = [] }: any = {}) =>
  (user: any): boolean =>
    staffIsActive(user) && cohortMatches(user, cohort, { target_user_ids });

/**
 * Audience resolver shared by the composer preview and the send-side
 * function. Returns the matched subset of `users` (input order preserved).
 *
 *   resolveAudience(directoryRows, { cohort: 'production' })
 *   resolveAudience(directoryRows, { cohort: 'individual', target_user_ids })
 */
export function resolveAudience(users: any, { cohort, target_user_ids = [] }: any = {}): any[] {
  if (!Array.isArray(users)) return [];
  const pred = cohortAudiencePredicate(cohort, { target_user_ids });
  return users.filter((u) => pred(u));
}

/**
 * Recipient count for the composer's "will reach N people" preview — a thin
 * count over resolveAudience so the estimate can never diverge from the
 * send-side resolution.
 */
export function audienceEstimate(users: any, { cohort, target_user_ids = [] }: any = {}): number {
  return resolveAudience(users, { cohort, target_user_ids }).length;
}

// ---------------------------------------------------------------------------
// message shape
// ---------------------------------------------------------------------------

function normalizeCohort(value: any): BroadcastCohort {
  const c = norm(value);
  if ((BROADCAST_COHORTS as readonly string[]).includes(c)) return c as BroadcastCohort;
  throw new Error(`Broadcast cohort is invalid ("${str(value)}").`);
}

function normalizePriority(value: any): BroadcastPriority {
  const p = norm(value) || "normal";
  if ((BROADCAST_PRIORITIES as readonly string[]).includes(p)) return p as BroadcastPriority;
  throw new Error(`Broadcast priority is invalid ("${str(value)}").`);
}

function normalizeStatus(value: any): BroadcastStatus {
  const s = norm(value) || "sent";
  if ((BROADCAST_STATUS as readonly string[]).includes(s)) return s as BroadcastStatus;
  throw new Error(`Broadcast status is invalid ("${str(value)}").`);
}

/**
 * Entity-shaped BroadcastMessage row for a composed broadcast. Pure — the
 * caller persists it via the session function (service role).
 *
 *   broadcastMessageShape({
 *     subject, body, cohort, target_user_ids,
 *     sender: {email, name} | actor row,
 *     now, expires_at,               // expires_at REQUIRED & must parse
 *     priority, requires_ack, status, audience_size,
 *   })
 *
 * Fail-closed (mirrors manageAnnouncements' publish gate): subject, body,
 * a valid cohort and a parseable expires_at AFTER `now` are required;
 * cohort 'individual' additionally requires ≥1 target.
 */
export function broadcastMessageShape({
  subject,
  body,
  cohort,
  target_user_ids = [],
  sender = {},
  now,
  expires_at,
  priority,
  requires_ack,
  status,
  audience_size,
  acked_user_ids = [],
  dismissed_user_ids = [],
}: any = {}) {
  const cleanSubject = cleanText(subject, 500);
  const cleanBody = cleanText(body, 20_000);
  if (!cleanSubject) throw new Error("Broadcast subject is required.");
  if (!cleanBody) throw new Error("Broadcast body is required.");

  const c = normalizeCohort(cohort);
  const targets = cleanEmailList(target_user_ids, MAX_TARGETS, 320);
  if (c === "individual" && targets.length === 0) {
    throw new Error("An individual broadcast needs at least one target user.");
  }

  const nowMs = toInstant(now);
  if (nowMs === null) throw new Error("Broadcast send time is required.");
  const expiresMs = toInstant(expires_at);
  if (expiresMs === null) {
    throw new Error("Choose when this broadcast should stop showing before sending.");
  }
  if (expiresMs <= nowMs) {
    throw new Error("The broadcast expiry must be after the send time.");
  }

  const audienceSize = Number(audience_size);
  return {
    subject: cleanSubject,
    body: cleanBody,
    cohort: c,
    // Only meaningful for 'individual'; kept empty for cohort broadcasts so a
    // stale target list can never silently narrow a cohort send.
    target_user_ids: c === "individual" ? targets : [],
    sender_email: norm(sender?.email ?? sender?.sender_email),
    sender_name: cleanText(sender?.name ?? sender?.full_name ?? sender?.sender_name, 500),
    created_at: toIso(nowMs),
    expires_at: toIso(expiresMs),
    priority: normalizePriority(priority),
    status: normalizeStatus(status),
    requires_ack: requires_ack === true,
    audience_size: Number.isFinite(audienceSize) && audienceSize >= 0 ? Math.floor(audienceSize) : 0,
    acked_user_ids: cleanEmailList(acked_user_ids, ACK_LIST_CAP, 320),
    dismissed_user_ids: cleanEmailList(dismissed_user_ids, ACK_LIST_CAP, 320),
  };
}

// ---------------------------------------------------------------------------
// ack / dismiss receipts (embedded-array patches — see header)
// ---------------------------------------------------------------------------

const cappedAppend = (list: any[], key: string): string[] =>
  [...new Set([...list.map((v: any) => norm(v)).filter(Boolean), key])].slice(-ACK_LIST_CAP);

// Viewer key for receipt helpers: a user object's email/id, or the param
// itself when the caller passes a raw email string. Never stringify an
// object — that yields "[object Object]" and would ack a phantom viewer.
const receiptUserKey = (user: any): string =>
  staffUserKey(user) || (typeof user === "string" || typeof user === "number" ? norm(user) : "");

/**
 * Acknowledge receipt for one viewer on one message — the logical RECEIPT
 * shape (what a separate BroadcastAck row would have held had the embedded
 * model not won; handy for an ActivityLog line or ack-report rows).
 * The actual entity write is applyAck's list patch, CAS-anchored by the
 * caller via updateMany({id, updated_date}, {$set}) — the same retry loop
 * as manageAnnouncements.acknowledge.
 *
 *   ackReceipt({ message_id, user_id | user, now })
 *   → { message_id, user_key, acked_at }
 */
export function ackReceipt({ message_id, user_id, user, now }: any = {}) {
  const userKey = receiptUserKey(user_id) || staffUserKey(user);
  const nowMs = toInstant(now);
  return {
    message_id: str(message_id),
    user_key: userKey,
    acked_at: nowMs === null ? "" : toIso(nowMs),
  };
}

/**
 * Ack/dismiss list writes are embedded-array appends computed against the
 * loaded row (CAS-anchored by the caller). These helpers return the next
 * array + a changed flag so the caller can skip no-op writes — repeat acks
 * are idempotent by construction.
 */
export function applyAck(message: any, user: any) {
  const key = receiptUserKey(user);
  if (!key) return { changed: false, next_acked_user_ids: cleanEmailList(message?.acked_user_ids, ACK_LIST_CAP, 320) };
  const current = cleanEmailList(message?.acked_user_ids, ACK_LIST_CAP, 320);
  if (current.includes(key)) return { changed: false, next_acked_user_ids: current };
  return { changed: true, next_acked_user_ids: cappedAppend(current, key) };
}

export function applyDismiss(message: any, user: any) {
  const key = receiptUserKey(user);
  if (!key) return { changed: false, next_dismissed_user_ids: cleanEmailList(message?.dismissed_user_ids, ACK_LIST_CAP, 320) };
  const current = cleanEmailList(message?.dismissed_user_ids, ACK_LIST_CAP, 320);
  if (current.includes(key)) return { changed: false, next_dismissed_user_ids: current };
  return { changed: true, next_dismissed_user_ids: cappedAppend(current, key) };
}

export const hasAcked = (message: any, user: any): boolean => {
  const key = receiptUserKey(user);
  if (!key) return false;
  return cleanEmailList(message?.acked_user_ids, ACK_LIST_CAP, 320).includes(key);
};

export const hasDismissed = (message: any, user: any): boolean => {
  const key = receiptUserKey(user);
  if (!key) return false;
  return cleanEmailList(message?.dismissed_user_ids, ACK_LIST_CAP, 320).includes(key);
};

// ---------------------------------------------------------------------------
// visibility
// ---------------------------------------------------------------------------

const messageCreatedMs = (m: any): number =>
  toInstant(m?.created_at) ?? toInstant(m?.created_date) ?? toInstant(m?.updated_date) ?? 0;

// One message vs one user — the per-row gate visibleBroadcasts maps over.
export function broadcastVisibleTo(message: any, user: any, now: any): boolean {
  if (!message || typeof message !== "object") return false;
  if (norm(message.status) !== "sent" && str(message.status) !== "") {
    // Absent status is tolerated as 'sent' (legacy/partial rows); anything
    // else (cancelled, draft, junk) is hidden.
    return false;
  }
  const nowMs = toInstant(now) ?? Date.now();
  const expiresMs = toInstant(message.expires_at);
  if (expiresMs !== null && expiresMs <= nowMs) return false;
  if (
    !cohortAudiencePredicate(message.cohort, {
      target_user_ids: message.target_user_ids,
    })(user)
  ) {
    return false;
  }
  if (hasAcked(message, user) || hasDismissed(message, user)) return false;
  return true;
}

/**
 * The unexpired, cohort-matching, un-acked/un-dismissed broadcasts for one
 * user, ordered for banner stacking: urgent first, then newest created_at.
 *
 *   visibleBroadcasts(messages, currentUser, Date.now())
 *   visibleBroadcasts(messages, {email, sales_roles, role}, isoNow)
 */
export function visibleBroadcasts(messages: any, user: any, now: any): any[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => broadcastVisibleTo(m, user, now))
    .sort((a, b) => {
      const ap = norm(a?.priority) === "urgent" ? 0 : 1;
      const bp = norm(b?.priority) === "urgent" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return messageCreatedMs(b) - messageCreatedMs(a);
    });
}
