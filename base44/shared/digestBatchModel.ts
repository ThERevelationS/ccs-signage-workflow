// Per-user daily digest batching — ESTIMATOR_MASTERPLAN WS-H / item H-13.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// alertSubscriptionsModel / paymentReminderModel / vendorNotifyModel /
// readyTriggerModel / delivery.
//
// H-12 (alertSubscriptionsModel) gives every user's NotificationPreference
// row a subscriptions[] list — each normalized sub
//   {event_key, criteria:{...}, delivery:'feed'|'digest'|'both', enabled}.
// This model is the batching half: given emitted events
// ({kind:<event_key>, ...fields}) and every pref row, it splits each event
// into per-user lanes:
//
//   feed    → an immediate Notification row (the "individual send") — one
//             row per user per event, deduped by eventDedupeKey.
//   digest  → a line item inside the user's once-a-day digest row.
//   both    → BOTH lanes: the user gets the immediate feed row AND the
//             event appears as a digest line item.
//
// THE 'both' RESOLUTION (dedupe rule): the invariant is ONE Notification
// row per user per event, plus at most ONE digest row per user per day —
// never a per-event notification AND a per-event send for the same event.
// A 'both' sub therefore does NOT emit two sends for the event: the feed
// row is the send; the digest entry is a line item inside the single daily
// digest Notification (dedupe_key digest:<user>:<day>), not its own row.
// 'digest' = digest item only (no feed row); 'feed' = feed row only (never
// a digest item — the immediate lane owns it).
//
// normalize/match semantics below are a PARITY COPY of
// alertSubscriptionsModel.ts (the shared-model contract keeps this file
// import-free): event_key casing with '.'/'-'/whitespace → '_', per-segment
// criteria keys, normalized equality incl. any-of arrays + dotted event
// paths, delivery aliases (in_app→feed, daily→digest, all→both, unknown→
// feed), enabled:false fail-closed, and the per-user lane merge where a
// feed-sub plus a digest-sub for the same event collapses to 'both'.
// Changes there must be mirrored here.
//
// Composed digest rows mirror the deployed notificationAction daily_digest
// shape (category 'digest', source_event + created_by 'daily_digest',
// deep_link '/MainWorkflow', dedupe_key, creation_request_key
// 'notif:<key>', meta.counts/total) so either writer — the in-app
// daily_digest action or a server sweep — produces rows alreadyDigested
// recognizes. The canonical key is 'digest:<user>:<YYYY-MM-DD>' per spec;
// alreadyDigested ALSO matches the deployed '<user>:digest:<day>' shape and
// the record()-prefixed '<user>:digest:<user>:<day>', plus marker fallbacks
// (meta.day / created_date day on digest-marked rows) so history written
// under any convention suppresses a second digest for the same user+day.
//
// digest_opt_in: pref rows carry the H-12 opt-in flag (entity default
// false). Per the H-12 contract the pref row owns the send cadence — a
// digest-only sub on an opted-out user "simply yields nothing at send
// time". digestCandidates therefore surfaces each user's opted_in +
// last_digest_date for the writer to gate on, and
// {require_opt_in:true} filters to opted-in users only. The default stays
// spec-literal: subscription delivery alone decides lane membership.
//
// Dates: `day`/`now` accept 'YYYY-MM-DD' (passes verbatim — UTC-sliced
// server days included), ISO datetimes, epoch ms, or Date. Datetimes
// resolve to the LOCAL calendar day (repo convention — same as
// paymentReminderModel dayKey).
//
// API:
//   DIGEST_KIND / DIGEST_CATEGORY / DIGEST_SOURCE_EVENT /
//     DIGEST_DEEP_LINK / DIGEST_SEVERITY /
//     DIGEST_BODY_ITEM_CAP / DIGEST_META_ITEM_CAP / DIGEST_KIND_LABELS
//   normalizeDay(value)               — 'YYYY-MM-DD' (local calendar day)
//   userKeyFor(pref_or_user)          — canonical lowercase user id (email)
//   digestDedupeKey(user, day)        — 'digest:<user>:<YYYY-MM-DD>'
//   eventDedupeKey(user, event)       — 'alert:<user>:<kind>:<ref>'
//   digestItemFor(event)              — {title, deep_link, kind}
//   eventLanes(event, all_prefs)      — {digest_users, feed_users, overlap}
//   immediateCandidates(events, all_prefs)
//     → [{user, user_id, user_email, event, event_key, dedupe_key}]
//   digestCandidates(events, all_prefs, {now|day, require_opt_in})
//     → [{user, user_id, user_email, events, items, day, dedupe_key,
//         opted_in, last_digest_date}]
//   composeDigest(user, events, {now|day})
//     → {subject, body, items, context:{items,user,date,count}, day,
//        dedupe_key, notification_row}
//   alreadyDigested(notification_rows, user, day) → bool

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);
const lower = (v: any): string => clean(v).toLowerCase();

// ---------------------------------------------------------------------------
// vocabulary / constants
// ---------------------------------------------------------------------------

// Marker kind + Notification.category the composed row carries. Notification
// has no `kind` column — `kind:'daily_digest'` is a spec'd marker field
// (tolerated as a stored extra, same as H-10/H-14 extras) and is what
// delivery.ts buildDeliveryPlan maps to internalRow.kind; `category:'digest'`
// is the deployed NOTIF_CATEGORIES bucket the record action validates.
export const DIGEST_KIND = 'daily_digest';
export const DIGEST_CATEGORY = 'digest';
export const DIGEST_SOURCE_EVENT = 'daily_digest';
export const DIGEST_CREATED_BY = 'daily_digest';

// Parity with the deployed daily_digest row (notificationAction/entry.ts).
export const DIGEST_DEEP_LINK = '/MainWorkflow';
export const DIGEST_SEVERITY = 'info';

// Per-event immediate-row dedupe key prefix — 'alert:<user>:<kind>:<ref>'.
export const EVENT_DEDUPE_PREFIX = 'alert';

// Item caps — the notification body lists the first few titles then
// '+N more'; meta.items is bounded so a busy day can't bloat the row.
export const DIGEST_BODY_ITEM_CAP = 8;
export const DIGEST_META_ITEM_CAP = 50;

// Registry-label parity with alertSubscriptionsModel.SUBSCRIBABLE_EVENTS —
// item titles fall back to the same human labels the prefs UI renders, so a
// digest line reads like the subscription it came from. Unknown kinds
// humanize ('foo_bar' → 'Foo bar').
export const DIGEST_KIND_LABELS: Record<string, string> = {
  client_change_request: 'Client change request',
  client_file_upload: 'Client uploaded files',
  customer_payment: 'Customer payment received',
  estimate_approved: 'Estimate approved',
  estimate_declined: 'Estimate declined',
  proof_ready: 'Proof ready for customer',
  po_created: 'Purchase order created',
  work_order_stage_change: 'Work order stage change',
  overdue_invoice: 'Invoice went overdue',
  estimate_follow_up_due: 'Estimate follow-up due',
  estimate_ready: 'Estimate ready for customer',
  quote_request: 'Vendor quote request sent',
  feedback_sent: 'Vendor feedback sent',
  file_uploaded: 'Vendor file uploaded',
  payment_due_5day: 'Payment due in 5 days',
  payment_past_due: 'Payment past due reminder',
};

// ---------------------------------------------------------------------------
// PARITY COPY — alertSubscriptionsModel.ts normalize/match/read-path.
// Kept verbatim (minus exports) so lane membership is identical to H-12.
// ---------------------------------------------------------------------------

// Canonical event key: lowercase, '.', '-', whitespace → '_', collapse
// repeats ('PO.Created' → 'po_created'). '' when nothing usable remains.
function normalizeEventKey(value: any): string {
  return lower(value).replace(/[\s.\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

const DELIVERY_ALIASES: Record<string, 'feed' | 'digest' | 'both'> = {
  feed: 'feed',
  notification: 'feed',
  notifications: 'feed',
  in_app: 'feed',
  inapp: 'feed',
  alert: 'feed',
  immediate: 'feed',
  digest: 'digest',
  daily: 'digest',
  daily_digest: 'digest',
  both: 'both',
  all: 'both',
  feed_and_digest: 'both',
  feed_digest: 'both',
};

// Canonical delivery. Unknown/blank degrade to 'feed' — a typo'd stored
// value still lands in the feed (fail-visible), never silently drops.
function normalizeDelivery(value: any): 'feed' | 'digest' | 'both' {
  return DELIVERY_ALIASES[normalizeEventKey(value)] ?? 'feed';
}

// Canonical criteria: keys normalized per-SEGMENT so dots survive as path
// separators; empty values dropped (an unset filter is not a constraint);
// arrays survive as any-of; nested objects survive for deep equality.
function normalizeCriteria(value: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!isObj(value)) return out;
  for (const rawKey of Object.keys(value)) {
    const key =
      clean(rawKey)
        .split('.')
        .map((seg) => normalizeEventKey(seg))
        .filter(Boolean)
        .join('.') || clean(rawKey);
    if (!key) continue;
    let v = (value as any)[rawKey];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v = v
        .map((x) => (typeof x === 'string' ? clean(x) : x))
        .filter((x) => x !== undefined && x !== null && x !== '');
      if (!v.length) continue;
    } else if (typeof v === 'string') {
      v = clean(v);
      if (v === '') continue;
    }
    out[key] = v;
  }
  return out;
}

function subEventKey(sub: any): string {
  if (typeof sub === 'string') return normalizeEventKey(sub);
  if (!isObj(sub)) return '';
  return normalizeEventKey(sub.event_key ?? sub.event ?? sub.kind ?? sub.type ?? sub.event_type);
}

// Canonical subscription — tolerates the H-12 legacy spellings
// ('po_created' bare string, {event|kind|type}, {filters|match|when},
// {channel|via|deliver}, {disabled|active:false}).
function normalizeSubscription(sub: any) {
  const src = isObj(sub) ? sub : {};
  const criteria = normalizeCriteria(src.criteria ?? src.filters ?? src.match ?? src.when);
  const enabled =
    src.enabled === false || src.disabled === true || src.active === false ? false : true;
  return { event_key: subEventKey(sub), criteria, delivery: normalizeDelivery(src.delivery ?? src.channel ?? src.via ?? src.deliver), enabled };
}

function subscriptionSignature(sub: any): string {
  const n = normalizeSubscription(sub);
  const keys = Object.keys(n.criteria).sort();
  const body = keys.map((k) => `${k}=${JSON.stringify(n.criteria[k])}`).join('&');
  return `${n.event_key}|${body}`;
}

// All normalized subs on a pref row (or bare array / {subscriptions} /
// legacy alert_subscriptions); keyless junk dropped, identical signatures
// dedupe last-wins.
function subscriptionsForUser(pref_row: any): any[] {
  const rows = Array.isArray(pref_row)
    ? pref_row
    : isObj(pref_row)
      ? (Array.isArray(pref_row.subscriptions) ? pref_row.subscriptions : list(pref_row.alert_subscriptions))
      : [];
  const seen = new Map<string, any>();
  for (const raw of rows) {
    const n = normalizeSubscription(raw);
    if (!n.event_key) continue;
    seen.set(subscriptionSignature(n), n);
  }
  return [...seen.values()];
}

function eventAt(event: any, path: string): any {
  let cur = event;
  for (const key of path.split('.')) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = cur?.[key];
  }
  return cur;
}

function valuesEqual(expected: any, actual: any): boolean {
  if (expected === actual) return true;
  if (expected === undefined || actual === undefined) return false;
  if (expected === null || actual === null) return false;
  if (typeof expected === 'object' || typeof actual === 'object') {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  return lower(expected) === lower(actual);
}

function criterionMatches(expected: any, actual: any): boolean {
  if (Array.isArray(expected)) return expected.some((x) => criterionMatches(x, actual));
  if (Array.isArray(actual)) return actual.some((x) => valuesEqual(expected, x));
  return valuesEqual(expected, actual);
}

function eventKindOf(event: any): string {
  if (typeof event === 'string') return normalizeEventKey(event);
  if (!isObj(event)) return '';
  return normalizeEventKey(event.kind ?? event.event_key ?? event.type ?? event.event ?? event.event_type);
}

// Does one subscription fire for one event? Fail-closed (disabled subs,
// keyless subs/events, kind mismatch, missing criteria fields never fire).
function matchesSubscription(sub: any, event: any): boolean {
  const n = normalizeSubscription(sub);
  if (!n.enabled || !n.event_key) return false;
  const kind = eventKindOf(event);
  if (!kind || kind !== n.event_key) return false;
  for (const key of Object.keys(n.criteria)) {
    const actual = eventAt(event, key);
    if (actual === undefined) return false;
    if (!criterionMatches(n.criteria[key], actual)) return false;
  }
  return true;
}

// Canonical user key for a pref row (or a raw user value): user_email →
// user_id → user → email, lowercased — parity with deliveriesFor. '' when
// nothing resolvable (those rows can never own a lane).
export function userKeyFor(pref_or_user: any): string {
  if (isObj(pref_or_user)) {
    return lower(
      pref_or_user.user_email ??
        pref_or_user.user_id ??
        pref_or_user.user ??
        pref_or_user.email ??
        pref_or_user.recipient_email,
    );
  }
  return lower(pref_or_user);
}

// Per-user merged lane flags for one event across one pref row — the
// deliveriesFor merge ({feed,digest} from matching subs; a feed-sub plus a
// digest-sub collapses to both lanes).
function laneForPref(pref: any, event: any): { feed: boolean; digest: boolean } {
  const acc = { feed: false, digest: false };
  for (const sub of subscriptionsForUser(pref)) {
    if (!matchesSubscription(sub, event)) continue;
    if (sub.delivery === 'feed' || sub.delivery === 'both') acc.feed = true;
    if (sub.delivery === 'digest' || sub.delivery === 'both') acc.digest = true;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// dates / identity helpers
// ---------------------------------------------------------------------------

// Local calendar 'YYYY-MM-DD' — same convention as paymentReminderModel
// dayKey (a 'YYYY-MM-DD' input round-trips to itself; ISO datetimes and
// epoch ms resolve to their local day). '' for unparseable input.
export function normalizeDay(value: any): string {
  let ms: number | null = null;
  if (value instanceof Date) {
    const t = value.getTime();
    ms = Number.isNaN(t) ? null : t;
  } else if (typeof value === 'number') {
    ms = Number.isFinite(value) ? value : null;
  } else {
    const s = clean(value);
    if (!s) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`; // date-only/ISO prefix passes verbatim
    const t = Date.parse(s);
    ms = Number.isFinite(t) ? t : null;
  }
  if (ms === null) return '';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The day a compose/evaluation call runs on: opts.now → opts.day → real
// clock (injectable like every sibling model — tests pass it explicitly).
function resolveDay(arg: any): string {
  const o = isObj(arg) ? arg : {};
  return normalizeDay(o.day ?? o.now ?? new Date()) || 'nodate';
}

// Deterministic FNV-1a-ish hash → base36. Used when an event carries no
// stable id — identity derives from the rendered item text.
function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Stable per-event ref for dedupe keys: the row id first, then the
// source/entity handles emitters stamp, then a content hash so two
// id-less events with different payloads don't collapse.
function eventRef(event: any): string {
  if (!isObj(event)) return '';
  return (
    clean(event.id) ||
    clean(event.source_id) ||
    clean(event.entity_id) ||
    clean(event.record_id) ||
    clean(event.notification_id)
  );
}

// 'Foo bar' from 'foo_bar' — title fallback for kinds outside the registry.
function humanizeKind(kind: string): string {
  const words = clean(kind).split('_').filter(Boolean);
  if (!words.length) return '';
  const s = words.join(' ');
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// items — the {title, deep_link, kind} line one event contributes
// ---------------------------------------------------------------------------

// Normalize one event (or an already-shaped item) into a digest line item.
// Title chain: event.title/summary/label/name/message → registry label →
// humanized kind → 'Notification'. deep_link chain: deep_link/deepLink/
// link/url/href (first non-empty; '' is legal — the row still lists).
export function digestItemFor(event: any): { title: string; deep_link: string; kind: string } {
  const kind = eventKindOf(event);
  const src = isObj(event) ? event : {};
  const title =
    clean(src.title) ||
    clean(src.summary) ||
    clean(src.label) ||
    clean(src.name) ||
    clean(src.message) ||
    DIGEST_KIND_LABELS[kind] ||
    humanizeKind(kind) ||
    'Notification';
  const deep_link =
    clean(src.deep_link) ||
    clean(src.deepLink) ||
    clean(src.link) ||
    clean(src.url) ||
    clean(src.href);
  return { title, deep_link, kind };
}

// Within-digest identity: ref'd events dedupe on kind+ref; id-less events
// dedupe on the rendered line (same line twice = the same logical event).
function eventIdentity(event: any): string {
  const kind = eventKindOf(event) || 'event';
  const ref = eventRef(event);
  if (ref) return `${kind}:${ref}`;
  const item = digestItemFor(event);
  return `${kind}:h${stableHash(`${item.title}|${item.deep_link}`)}`;
}

// ---------------------------------------------------------------------------
// lane split
// ---------------------------------------------------------------------------

// Per-event lane split across every pref row. 'feed'/'digest' subs land in
// exactly one lane; 'both' lands in BOTH (feed row immediately + digest
// line item — see header: the digest entry is an item, not a second send).
// `overlap` lists users in both lanes — whether via one 'both' sub or a
// matching feed-sub plus a matching digest-sub (the deliveriesFor merge).
// All three lists are sorted user keys for deterministic output.
export function eventLanes(event: any, all_prefs: any) {
  const digest_users: string[] = [];
  const feed_users: string[] = [];
  const overlap: string[] = [];
  for (const pref of list(all_prefs)) {
    const user = userKeyFor(pref);
    if (!user) continue;
    const lane = laneForPref(pref, event);
    if (lane.digest) digest_users.push(user);
    if (lane.feed) feed_users.push(user);
    if (lane.feed && lane.digest) overlap.push(user);
  }
  digest_users.sort();
  feed_users.sort();
  overlap.sort();
  return { digest_users, feed_users, overlap };
}

// The immediate lane: one {user, event} pair per user whose merged
// delivery includes feed ('feed' or 'both' subs — a 'both' user still gets
// exactly ONE immediate row per event). Sorted by user then input order.
// dedupe_key is the per-user-per-event identity the writer stamps on the
// Notification row so re-scans never double-send.
export function immediateCandidates(events: any, all_prefs: any) {
  const out: any[] = [];
  list(events).forEach((event, idx) => {
    for (const pref of list(all_prefs)) {
      const user = userKeyFor(pref);
      if (!user) continue;
      const lane = laneForPref(pref, event);
      if (!lane.feed) continue;
      out.push({
        user,
        user_id: user,
        user_email: user,
        event,
        event_key: eventKindOf(event),
        dedupe_key: eventDedupeKey(user, event),
        _idx: idx,
      });
    }
  });
  out.sort((a, b) => (a.user < b.user ? -1 : a.user > b.user ? 1 : a._idx - b._idx));
  return out.map(({ _idx, ...rest }) => rest);
}

// The digest lane: events grouped per user where the merged delivery
// includes digest ('digest' or 'both'). Events matching only 'feed' subs
// never appear — the immediate lane owns them. Each group dedupes repeat
// events by identity, carries items ready for composeDigest, and stamps
// day/dedupe_key for the digest row the writer persists. `opted_in` and
// `last_digest_date` surface the pref row's digest_opt_in gate; pass
// {require_opt_in:true} to enforce it here (default off — subscription
// delivery alone decides membership, per spec).
export function digestCandidates(events: any, all_prefs: any, arg: any = {}) {
  const opts = isObj(arg) ? arg : {};
  const requireOptIn = opts.require_opt_in === true;
  const day = resolveDay(opts);
  const perUser = new Map<string, { events: any[]; seen: Set<string>; opted_in: boolean; last_digest_date: string }>();
  for (const pref of list(all_prefs)) {
    const user = userKeyFor(pref);
    if (!user) continue;
    const optedIn = isObj(pref) ? pref.digest_opt_in === true : false;
    const lastDigest = normalizeDay(isObj(pref) ? pref.last_digest_date : '');
    for (const event of list(events)) {
      const lane = laneForPref(pref, event);
      if (!lane.digest) continue;
      let acc = perUser.get(user);
      if (!acc) {
        acc = { events: [], seen: new Set(), opted_in: optedIn, last_digest_date: lastDigest };
        perUser.set(user, acc);
      }
      const ident = eventIdentity(event);
      if (acc.seen.has(ident)) continue;
      acc.seen.add(ident);
      acc.events.push(event);
    }
  }
  return [...perUser.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([user, acc]) => ({
      user,
      user_id: user,
      user_email: user,
      events: acc.events,
      items: acc.events.map(digestItemFor),
      day,
      dedupe_key: digestDedupeKey(user, day),
      opted_in: acc.opted_in,
      last_digest_date: acc.last_digest_date,
    }))
    .filter((c) => !requireOptIn || c.opted_in);
}

// ---------------------------------------------------------------------------
// dedupe keys
// ---------------------------------------------------------------------------

// One digest per user per day: 'digest:<user>:<YYYY-MM-DD>'. The writer
// stamps this as the Notification row's dedupe_key; alreadyDigested
// re-derives it (plus the deployed '<user>:digest:<day>' and the
// record()-prefixed '<user>:digest:<user>:<day>' spellings).
export function digestDedupeKey(user: any, day: any): string {
  const u = userKeyFor(user) || 'unknown';
  const d = normalizeDay(day) || 'nodate';
  return `digest:${u}:${d}`;
}

// Per-user-per-event identity for the immediate lane —
// 'alert:<user>:<kind>:<ref>' where ref is the event's stable id (id →
// source_id → entity_id → record_id) or a content hash for id-less events.
// The record action prefixes the recipient again (`<u>:alert:...`), which
// stays unique — this key only needs to be deterministic.
export function eventDedupeKey(user: any, event: any): string {
  const u = userKeyFor(user) || 'unknown';
  const kind = eventKindOf(event) || 'event';
  const ref = eventRef(event) || `h${stableHash(eventIdentity(event))}`;
  return `${EVENT_DEDUPE_PREFIX}:${u}:${kind}:${ref}`;
}

// Is a stored Notification row a digest row? kind/source_event
// 'daily_digest' or category 'digest' — covers this model's rows and the
// deployed daily_digest writer's.
function isDigestRow(row: any): boolean {
  return (
    lower(row?.kind) === DIGEST_KIND ||
    lower(row?.source_event) === DIGEST_KIND ||
    lower(row?.category) === DIGEST_CATEGORY ||
    lower(row?.kind) === DIGEST_CATEGORY
  );
}

// Has a digest row already been written for this user+day? Matches, in
// order: the canonical dedupe key, the deployed writer's key, the
// record()-prefixed canonical key; then (on rows marked as digests for the
// same user) a meta day stamp, the row's created day, or a key ending in
// the day — so any writer convention suppresses a same-day resend.
export function alreadyDigested(notification_rows: any, user: any, day: any): boolean {
  const u = userKeyFor(user);
  const d = normalizeDay(day);
  if (!u || !d) return false;
  const canonical = digestDedupeKey(u, d); // digest:<u>:<d>
  const keys = new Set<string>([
    canonical,
    `${u}:digest:${d}`,   // deployed daily_digest writer (notificationAction)
    `${u}:${canonical}`,  // canonical + record() recipient prefix
  ]);
  for (const row of list(notification_rows)) {
    if (!isObj(row)) continue;
    const recipient = userKeyFor(row);
    if (recipient && recipient !== u) continue; // another user's row
    const dk = clean(row.dedupe_key);
    if (dk && keys.has(dk)) return true;
    if (!isDigestRow(row) || recipient !== u) continue;
    const metaDay = normalizeDay(row?.meta?.day ?? row?.meta?.date ?? row?.meta?.digest_date);
    if (metaDay && metaDay === d) return true;
    const createdDay = normalizeDay(row?.created_date ?? row?.created_at ?? row?.sent_at);
    if (createdDay && createdDay === d) return true;
    if (dk && dk.endsWith(`:${d}`)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// compose
// ---------------------------------------------------------------------------

// Resolve the recipient identity from a user string / {user,…} candidate /
// {user_email,display_name,…} object for the rendered context.
function userIdentity(user: any): { user_id: string; email: string; display_name: string } {
  if (!isObj(user)) {
    const u = userKeyFor(user);
    return { user_id: u, email: u, display_name: u };
  }
  const id = userKeyFor(user);
  const display =
    clean(user.display_name) ||
    clean(user.full_name) ||
    clean(user.name) ||
    clean(user.user_name) ||
    id;
  return { user_id: id, email: id, display_name: display };
}

// Compose one user's digest for `day`. `events` may be raw emitted events
// or pre-normalized items (digestItemFor normalizes either). Returns:
//   subject          — 'Daily digest — <N> item[s]'
//   body             — count line + '· <title>' bullets (+N more past cap)
//   items            — [{title, deep_link, kind}] deduped by event identity
//   context          — {items, user:{user_id,email,display_name}, date,
//                       count} — the templateRender binding a
//                       NotificationTemplate 'daily_digest' row renders
//   day, dedupe_key  — digestDedupeKey(user, day)
//   notification_row — the Notification-entity row to persist (kind
//                      'daily_digest', category 'digest', recipient_email,
//                      title/body, deep_link '/MainWorkflow', source_event
//                      'daily_digest', dedupe_key, creation_request_key
//                      'notif:<key>', meta {day,date,counts,total,items},
//                      created_by 'daily_digest', severity 'info')
// `user` may be the canonical key, a digestCandidates entry, or a pref-ish
// object — identity resolves the same chain as userKeyFor + display fields.
export function composeDigest(user: any, events: any, arg: any = {}) {
  const ident = userIdentity(user);
  const day = resolveDay(arg);
  const seen = new Set<string>();
  const items: Array<{ title: string; deep_link: string; kind: string }> = [];
  for (const event of list(events)) {
    const id = eventIdentity(event);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(digestItemFor(event));
  }
  const n = items.length;
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = item.kind || 'other';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const subject = `Daily digest — ${n} item${n === 1 ? '' : 's'}`;
  const body =
    n === 0
      ? `Nothing new needs attention — ${day}`
      : [
          `${n} item${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention — ${day}:`,
          ...items.slice(0, DIGEST_BODY_ITEM_CAP).map((i) => `· ${i.title}`),
          ...(n > DIGEST_BODY_ITEM_CAP ? [`· +${n - DIGEST_BODY_ITEM_CAP} more`] : []),
        ].join('\n');
  const dedupeKey = digestDedupeKey(ident.user_id, day);
  const context = {
    items,
    user: { user_id: ident.user_id, email: ident.email, display_name: ident.display_name },
    date: day,
    count: n,
  };
  const notification_row = {
    kind: DIGEST_KIND,
    category: DIGEST_CATEGORY,
    recipient_email: ident.email,
    severity: DIGEST_SEVERITY,
    title: subject,
    body,
    deep_link: DIGEST_DEEP_LINK,
    source_event: DIGEST_SOURCE_EVENT,
    dedupe_key: dedupeKey,
    creation_request_key: `notif:${dedupeKey}`.slice(0, 256),
    meta: {
      day,
      date: day,
      counts,
      total: n,
      items: items.slice(0, DIGEST_META_ITEM_CAP),
    },
    created_by: DIGEST_CREATED_BY,
  };
  return { subject, body, items, context, day, dedupe_key: dedupeKey, notification_row };
}
