// Per-user alert subscriptions — ESTIMATOR_MASTERPLAN WS-H / item H-12.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// readyTriggerModel / vendorNotifyModel / followUpMachine /
// paymentReminderModel / proofChangeRequestModel.
//
// Extends the NotificationPreference row (backend-only RLS entity, same as
// Notification) with a `subscriptions[]` array — each entry is one user's
// opt-in to one event kind, optionally narrowed by a criteria map:
//
//   { event_key: 'po_created',
//     criteria:  { vendor_id: 'v1' },        // every field must EQUAL the
//                                          // emitted event's field;
//                                          // empty {} = match all of kind
//     delivery:  'feed' | 'digest' | 'both', // feed = immediate Notification
//                                          // row in the attention feed;
//                                          // digest = line item on the
//                                          // once-a-day digest the pref
//                                          // row's digest_opt_in controls;
//                                          // both = feed row + digest line
//     enabled:   true,
//     created_by/created_at/updated_by/updated_at }
//
// SUBSCRIBABLE_EVENTS is the registry the prefs UI renders checkboxes from.
// Coverage is the spec'd ten PLUS every event kind already emitted by the
// sibling WS-H models so a stored subscription key always equals the key
// its emitter writes (matching is literal event_key === event.kind — the
// registry supplies labels/schema, never gates matching):
//   readyTriggerModel.ts   READY_EVENT_KINDS  → estimate_ready, proof_ready
//   vendorNotifyModel.ts   VENDOR_EVENT_KINDS → po_created, quote_request,
//                                               feedback_sent, file_uploaded
//   paymentReminderModel.ts REMINDER_KINDS    → payment_due_5day,
//                                               payment_past_due
//   followUpMachine.ts     FU1/FU2 scheduling → estimate_follow_up_due
//   proofChangeRequestModel.ts                → client_change_request
//   portal/AR emitters                        → client_file_upload,
//                                               customer_payment,
//                                               estimate_approved,
//                                               estimate_declined,
//                                               work_order_stage_change,
//                                               overdue_invoice
//
// Event objects passed to matchesSubscription/deliveriesFor are
//   { kind: <event_key>, ...fields }
// where `kind` (aliases type/event/event_key normalized, case-insensitive,
// '.', '-' and whitespace collapse to '_') is the emitter's kind and the
// remaining fields are what criteria can filter on. criteria_schema.fields
// declares each event's filterable keys for the UI; criteria keys may be
// dotted paths ('customer.id') walking nested event objects.
//
// Criteria semantics (matchesSubscription):
//   - criteria {} or missing → every event of the kind matches.
//   - Every declared criteria field must equal the event's field —
//     normalized equality: strict === first, else trim+case-insensitive
//     string compare ('5' === 5, 'Sent' === 'sent').
//   - A criteria value that is an array is any-of (field ∈ list); an event
//     field that is an array is contains (list ∋ value).
//   - A missing/undefined event field never equals a declared criterion
//     (fail-closed per field) — only empty criteria match all.
//
// Fan-out (deliveriesFor): run one event across every user's
// NotificationPreference row → [{user_id, user_email, delivery}], one row
// per user with deliveries merged (a feed-sub + a digest-sub for the same
// event collapse to 'both'). `user_id` is the pref row's user key — today
// user_email (NotificationPreference.jsonc has no separate id column);
// user_email is emitted alongside for the writer that keys Notification
// rows on recipient_email.
//
// Writes (subscriptionPatch): add/replace against the stored list deduped
// by signature = event_key + canonical-criteria serialization, so two
// subs for the same event with different criteria coexist but identical
// subs never duplicate — the update overwrites delivery/enabled and stamps
// updated_by/updated_at, preserving created_* on the replaced row. The
// list is bounded at SUBSCRIPTIONS_MAX (oldest dropped FIFO past the cap).
// Unknown/never-set event keys are kept (forward-compatible storage) but a
// keyless entry ({} legacy junk) is dropped — it can never match.
//
// API:
//   SUBSCRIBABLE_EVENTS / SUBSCRIPTION_DELIVERIES / SUBSCRIPTIONS_MAX
//   DEFAULT_DELIVERY
//   eventRegistryEntry(key)                 — registry row | null
//   subscribableEventKeys()                 — ['po_created', …]
//   normalizeEventKey(value)                — canonical key or ''
//   normalizeDelivery(value)                — 'feed'|'digest'|'both'
//   normalizeCriteria(value)                — canonical criteria object
//   normalizeSubscription(sub)              — canonical sub (tolerates
//                                             legacy shapes: {event|kind|type},
//                                             {filters|match|when}, disabled)
//   subscriptionSignature(sub)              — dedupe signature
//   subscriptionsForUser(pref_row)          — normalized deduped list
//   matchesSubscription(sub, event)         — bool, fail-closed
//   deliveriesFor(event, all_prefs)         — [{user_id,user_email,delivery}]
//   subscriptionPatch(pref, sub, {actor_id, now})
//                                           — {subscriptions:[…]} to persist

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);
const lower = (v: any): string => clean(v).toLowerCase();

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// Delivery lanes. 'feed' writes the internal Notification row immediately;
// 'digest' queues the event for the once-a-day digest (the pref row's
// digest_opt_in / last_digest_date machinery owns the send cadence — a
// digest-only sub on an opted-out user simply yields nothing at send time);
// 'both' does feed + digest.
export const SUBSCRIPTION_DELIVERIES = ['feed', 'digest', 'both'] as const;

export type SubscriptionDelivery = (typeof SUBSCRIPTION_DELIVERIES)[number];

export const DEFAULT_DELIVERY: SubscriptionDelivery = 'feed';

// Hard bound on stored subs per user — same defensive-cap convention as
// NotificationPreference.dismissed_feed_items ("Bounded to the newest 300").
export const SUBSCRIPTIONS_MAX = 200;

interface SubscribableEvent {
  key: string;
  label: string;
  entity: string;
  criteria_schema: { fields: Array<{ key: string; label: string; type: string; options?: string[] }> };
}

const ref = (key: string, label: string) => ({ key, label, type: 'ref' });
const str = (key: string, label: string) => ({ key, label, type: 'string' });
const en = (key: string, label: string, options: string[]) => ({ key, label, type: 'enum', options });

// The registry. `entity` is the domain the event is about (drives UI
// grouping + which pickers criteria fields resolve against); it is a
// free-form string — the spec'd domains are product/workorder/invoice/
// customer plus estimate/purchase_order for the WS-H emitter kinds.
export const SUBSCRIBABLE_EVENTS: SubscribableEvent[] = [
  {
    key: 'client_change_request',
    label: 'Client change request',
    entity: 'product', // proofChangeRequestModel: product regresses out of awaiting_proof_approval
    criteria_schema: {
      fields: [
        ref('work_order_id', 'Work order'),
        ref('product_id', 'Product'),
        ref('customer_id', 'Customer'),
        en('reason_code', 'Reason', ['text_correction', 'color_change', 'size_change', 'layout_change', 'other']),
        en('actor_type', 'Filed by', ['customer', 'staff']),
      ],
    },
  },
  {
    key: 'client_file_upload',
    label: 'Client uploaded files',
    entity: 'customer', // portal uploads belong to the customer account first
    criteria_schema: {
      fields: [
        ref('customer_id', 'Customer'),
        ref('work_order_id', 'Work order'),
        ref('opportunity_id', 'Opportunity'),
        str('file_kind', 'File kind'),
      ],
    },
  },
  {
    key: 'customer_payment',
    label: 'Customer payment received',
    entity: 'invoice', // payments post against an invoice
    criteria_schema: {
      fields: [
        ref('customer_id', 'Customer'),
        ref('invoice_id', 'Invoice'),
        ref('work_order_id', 'Work order'),
        str('payment_method', 'Payment method'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
  {
    key: 'estimate_approved',
    label: 'Estimate approved',
    entity: 'estimate', // customerPortalAction emits kind 'estimate_approved'
    criteria_schema: {
      fields: [
        ref('estimate_id', 'Estimate'),
        ref('customer_id', 'Customer'),
        ref('opportunity_id', 'Opportunity'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
  {
    key: 'estimate_declined',
    label: 'Estimate declined',
    entity: 'estimate',
    criteria_schema: {
      fields: [
        ref('estimate_id', 'Estimate'),
        ref('customer_id', 'Customer'),
        ref('opportunity_id', 'Opportunity'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
  {
    key: 'proof_ready',
    label: 'Proof ready for customer',
    entity: 'product', // readyTriggerModel proofEntityRef anchors on product id
    criteria_schema: {
      fields: [
        ref('work_order_id', 'Work order'),
        ref('product_id', 'Product'),
        ref('customer_id', 'Customer'),
        str('designer', 'Designer'),
      ],
    },
  },
  {
    key: 'po_created',
    label: 'Purchase order created',
    entity: 'purchase_order', // vendorNotifyModel VENDOR_EVENT_KINDS head
    criteria_schema: {
      fields: [
        ref('po_id', 'Purchase order'),
        ref('vendor_id', 'Vendor'),
        ref('work_order_id', 'Work order'),
        str('created_by', 'Buyer'),
      ],
    },
  },
  {
    key: 'work_order_stage_change',
    label: 'Work order stage change',
    entity: 'workorder',
    criteria_schema: {
      fields: [
        ref('work_order_id', 'Work order'),
        ref('customer_id', 'Customer'),
        str('from_stage', 'From stage'),
        str('to_stage', 'To stage'),
        str('assigned_to', 'Assignee'),
      ],
    },
  },
  {
    key: 'overdue_invoice',
    label: 'Invoice went overdue',
    entity: 'invoice',
    criteria_schema: {
      fields: [
        ref('customer_id', 'Customer'),
        ref('invoice_id', 'Invoice'),
        str('salesperson', 'Salesperson'),
        str('aging_bucket', 'Aging bucket'),
      ],
    },
  },
  {
    key: 'estimate_follow_up_due',
    label: 'Estimate follow-up due',
    entity: 'estimate', // followUpMachine FU1/FU2 scheduling
    criteria_schema: {
      fields: [
        ref('estimate_id', 'Estimate'),
        ref('customer_id', 'Customer'),
        str('salesperson', 'Salesperson'),
        en('follow_up_stage', 'Touch', ['fu1', 'fu2']),
      ],
    },
  },
  // -- Extended coverage: every kind already emitted by sibling WS-H models --
  {
    key: 'estimate_ready',
    label: 'Estimate ready for customer',
    entity: 'estimate', // readyTriggerModel READY_EVENT_KINDS
    criteria_schema: {
      fields: [
        ref('estimate_id', 'Estimate'),
        ref('customer_id', 'Customer'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
  {
    key: 'quote_request',
    label: 'Vendor quote request sent',
    entity: 'purchase_order', // vendorNotifyModel VENDOR_EVENT_KINDS
    criteria_schema: {
      fields: [
        ref('po_id', 'Purchase order'),
        ref('vendor_id', 'Vendor'),
        str('created_by', 'Buyer'),
      ],
    },
  },
  {
    key: 'feedback_sent',
    label: 'Vendor feedback sent',
    entity: 'purchase_order',
    criteria_schema: {
      fields: [
        ref('po_id', 'Purchase order'),
        ref('vendor_id', 'Vendor'),
        str('created_by', 'Buyer'),
      ],
    },
  },
  {
    key: 'file_uploaded',
    label: 'Vendor file uploaded',
    entity: 'purchase_order',
    criteria_schema: {
      fields: [
        ref('po_id', 'Purchase order'),
        ref('vendor_id', 'Vendor'),
        str('uploaded_by', 'Uploaded by'),
      ],
    },
  },
  {
    key: 'payment_due_5day',
    label: 'Payment due in 5 days',
    entity: 'invoice', // paymentReminderModel REMINDER_KINDS
    criteria_schema: {
      fields: [
        ref('customer_id', 'Customer'),
        ref('invoice_id', 'Invoice'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
  {
    key: 'payment_past_due',
    label: 'Payment past due reminder',
    entity: 'invoice',
    criteria_schema: {
      fields: [
        ref('customer_id', 'Customer'),
        ref('invoice_id', 'Invoice'),
        str('salesperson', 'Salesperson'),
      ],
    },
  },
];

const EVENT_REGISTRY: ReadonlyMap<string, SubscribableEvent> = new Map(
  SUBSCRIBABLE_EVENTS.map((e) => [e.key, e]),
);

// Registry lookup — null for unknown keys (matching does NOT consult the
// registry: a stored sub for a kind this build doesn't know still matches an
// event emitted under the same key — forward-compatible).
export function eventRegistryEntry(key: any): SubscribableEvent | null {
  return EVENT_REGISTRY.get(normalizeEventKey(key)) ?? null;
}

export function subscribableEventKeys(): string[] {
  return SUBSCRIBABLE_EVENTS.map((e) => e.key);
}

// ---------------------------------------------------------------------------
// normalization
// ---------------------------------------------------------------------------

// Canonical event key: lowercase, '.', '-', whitespace → '_', collapse
// repeats ('PO.Created' → 'po_created'). '' when nothing usable remains.
export function normalizeEventKey(value: any): string {
  const k = lower(value).replace(/[\s.\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return k;
}

const DELIVERY_ALIASES: Record<string, SubscriptionDelivery> = {
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

// Canonical delivery. Unknown/blank degrade to DEFAULT_DELIVERY — a typo'd
// stored value still lands in the feed (fail-visible), never silently drops.
export function normalizeDelivery(value: any): SubscriptionDelivery {
  const d = DELIVERY_ALIASES[normalizeEventKey(value)];
  return d ?? DEFAULT_DELIVERY;
}

// Canonical criteria: object-ish input (legacy aliases handled by the
// caller), keys normalized like event keys but per-SEGMENT so dots survive
// as path separators ('Customer.ID' → 'customer.id' — a nested-path
// criterion, not a flat 'customer_id' key). Empty-string/null/undefined
// values dropped (an unset UI filter is not a constraint — and would never
// match anyway since missing event fields fail closed). Arrays survive
// (any-of semantics); nested plain objects survive for deep equality.
export function normalizeCriteria(value: any): Record<string, any> {
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

// Pick the event_key out of a stored sub — canonical event_key first, then
// the legacy spellings ({event|kind|type}, bare strings).
function subEventKey(sub: any): string {
  if (typeof sub === 'string') return normalizeEventKey(sub);
  if (!isObj(sub)) return '';
  return normalizeEventKey(sub.event_key ?? sub.event ?? sub.kind ?? sub.type ?? sub.event_type);
}

// Canonical subscription. Tolerates legacy shapes:
//   'po_created'                                → {event_key:'po_created',…}
//   {event|kind|type|event_type: 'po_created'}
//   {filters|match|when|criteria: {…}}          → criteria
//   {channel|via|delivery|deliver: 'digest'}    → delivery
//   {enabled:false} | {disabled:true}           → enabled:false
//   {active:false}                              → enabled:false
// Audit fields (created_by/created_at/updated_by/updated_at) are carried
// through verbatim when present so patch round-trips don't lose history.
export function normalizeSubscription(sub: any) {
  const src = isObj(sub) ? sub : {};
  const criteria = normalizeCriteria(
    src.criteria ?? src.filters ?? src.match ?? src.when,
  );
  const enabled =
    src.enabled === false || src.disabled === true || src.active === false
      ? false
      : true;
  const out: any = {
    event_key: subEventKey(sub),
    criteria,
    delivery: normalizeDelivery(src.delivery ?? src.channel ?? src.via ?? src.deliver),
    enabled,
  };
  for (const k of ['created_by', 'created_at', 'updated_by', 'updated_at']) {
    const v = clean(src[k]);
    if (v) out[k] = v;
  }
  return out;
}

// Deterministic dedupe identity: event_key + criteria serialized with
// sorted keys and canonical values. Two subs on the same event with
// different criteria are DIFFERENT subs; identical subs collapse.
export function subscriptionSignature(sub: any): string {
  const n = normalizeSubscription(sub);
  const keys = Object.keys(n.criteria).sort();
  const body = keys
    .map((k) => `${k}=${JSON.stringify(n.criteria[k])}`)
    .join('&');
  return `${n.event_key}|${body}`;
}

// ---------------------------------------------------------------------------
// read paths
// ---------------------------------------------------------------------------

// All normalized subs on a NotificationPreference row (or a bare
// subscriptions array / {subscriptions:[…]} wrapper / legacy
// alert_subscriptions field). Keyless junk entries are dropped; identical
// signatures dedupe with the LAST copy winning (Map overwrites at the key's
// first-seen slot, so order is stable and the newest write survives).
export function subscriptionsForUser(pref_row: any): any[] {
  const rows = Array.isArray(pref_row)
    ? pref_row
    : isObj(pref_row)
      ? (Array.isArray(pref_row.subscriptions)
          ? pref_row.subscriptions
          : list(pref_row.alert_subscriptions))
      : [];
  const seen = new Map<string, any>();
  for (const raw of rows) {
    const n = normalizeSubscription(raw);
    if (!n.event_key) continue; // '{}' legacy junk can never match — drop
    seen.set(subscriptionSignature(n), n);
  }
  return [...seen.values()];
}

// Walk a dotted criteria path on the event object — same convention as
// readyTriggerModel settingAt. Missing/odd hops → undefined.
function eventAt(event: any, path: string): any {
  let cur = event;
  for (const key of path.split('.')) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = cur?.[key];
  }
  return cur;
}

// Normalized equality: strict === fast path, then trim+case-insensitive
// string compare so '5'≈5, 'Sent'≈'sent', 'A@B.co'≈'a@b.co'.
function valuesEqual(expected: any, actual: any): boolean {
  if (expected === actual) return true;
  if (expected === undefined || actual === undefined) return false;
  if (expected === null || actual === null) return false;
  if (typeof expected === 'object' || typeof actual === 'object') {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  return lower(expected) === lower(actual);
}

// One criterion vs the event field: array criterion = any-of, array event
// field = contains, otherwise normalized equality.
function criterionMatches(expected: any, actual: any): boolean {
  if (Array.isArray(expected)) {
    return expected.some((x) => criterionMatches(x, actual));
  }
  if (Array.isArray(actual)) {
    return actual.some((x) => valuesEqual(expected, x));
  }
  return valuesEqual(expected, actual);
}

function eventKindOf(event: any): string {
  if (typeof event === 'string') return normalizeEventKey(event);
  if (!isObj(event)) return '';
  return normalizeEventKey(event.kind ?? event.event_key ?? event.type ?? event.event ?? event.event_type);
}

// Does one subscription fire for one event? Fail-closed: disabled subs,
// keyless subs, keyless events and kind mismatches never fire; every
// declared criterion must match (empty criteria = match all of kind).
export function matchesSubscription(sub: any, event: any): boolean {
  const n = normalizeSubscription(sub);
  if (!n.enabled || !n.event_key) return false;
  const kind = eventKindOf(event);
  if (!kind || kind !== n.event_key) return false;
  for (const key of Object.keys(n.criteria)) {
    const actual = eventAt(event, key);
    if (actual === undefined) return false; // missing event field never satisfies a constraint
    if (!criterionMatches(n.criteria[key], actual)) return false;
  }
  return true;
}

// Fan-out: which users receive this event, and on which lane. all_prefs is
// an array of NotificationPreference rows ({user_email, subscriptions}) —
// user identity resolves user_email → user_id → user → email (lowercased).
// Deliveries merge per user across matching subs: feed+digest collapse to
// 'both'. Rows with no resolvable user identity contribute nothing.
// Output is sorted by user_id for deterministic persistence/tests.
export function deliveriesFor(event: any, all_prefs: any): Array<{ user_id: string; user_email: string; delivery: SubscriptionDelivery }> {
  const lanes = new Map<string, { feed: boolean; digest: boolean }>();
  for (const pref of list(all_prefs)) {
    const user = lower(
      isObj(pref) ? (pref.user_email ?? pref.user_id ?? pref.user ?? pref.email) : pref,
    );
    if (!user) continue;
    for (const sub of subscriptionsForUser(pref)) {
      if (!matchesSubscription(sub, event)) continue;
      const acc = lanes.get(user) ?? { feed: false, digest: false };
      if (sub.delivery === 'feed' || sub.delivery === 'both') acc.feed = true;
      if (sub.delivery === 'digest' || sub.delivery === 'both') acc.digest = true;
      lanes.set(user, acc);
    }
  }
  return [...lanes.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([user_id, acc]) => ({
      user_id,
      user_email: user_id,
      delivery: (acc.feed && acc.digest ? 'both' : acc.digest ? 'digest' : 'feed') as SubscriptionDelivery,
    }));
}

// ---------------------------------------------------------------------------
// write path
// ---------------------------------------------------------------------------

// Add or replace a subscription on a pref row. Dedupe is by signature
// (event_key + canonical criteria) — an existing identical sub is replaced
// in place (delivery/enabled refresh, updated_* stamped, created_* kept);
// anything else appends. Over SUBSCRIPTIONS_MAX the oldest entries drop
// FIFO. `now` may be an ISO string / epoch ms / Date — emitted stamps are
// ISO strings; absent `now` falls back to the real clock (callers in tests
// inject it for determinism, matching the repo's injectable-now convention).
// Returns ONLY the patch — {subscriptions:[…]} — ready for
// NotificationPreference.update; never mutates the input row.
export function subscriptionPatch(pref: any, sub: any, arg: any = {}): { subscriptions: any[] } {
  const actor = clean(arg?.actor_id ?? arg?.actor ?? arg?.updated_by);
  const nowRaw = arg?.now;
  const nowIso = (() => {
    if (nowRaw === undefined || nowRaw === null || nowRaw === '') {
      return new Date().toISOString();
    }
    if (typeof nowRaw === 'number') return new Date(nowRaw).toISOString();
    if (nowRaw instanceof Date) return nowRaw.toISOString();
    const s = clean(nowRaw);
    return s || new Date().toISOString();
  })();

  const n = normalizeSubscription(sub);
  if (actor) n.updated_by = actor;
  n.updated_at = nowIso;

  const subs = subscriptionsForUser(pref);
  const sig = subscriptionSignature(n);
  const idx = subs.findIndex((s) => subscriptionSignature(s) === sig);
  if (idx >= 0) {
    // Replace: preserve the prior created_* stamps; when the prior was a
    // legacy un-stamped row, backfill from the incoming sub, then actor/now
    // — after ANY patch write every stored sub carries created_at.
    const prior = subs[idx];
    const createdBy = clean(prior.created_by) || clean(n.created_by) || actor;
    if (createdBy) n.created_by = createdBy;
    n.created_at = clean(prior.created_at) || clean(n.created_at) || nowIso;
    subs[idx] = n;
  } else {
    if (!n.created_by && actor) n.created_by = actor;
    if (!n.created_at) n.created_at = nowIso;
    subs.push(n);
  }
  while (subs.length > SUBSCRIPTIONS_MAX) subs.shift(); // FIFO bound
  return { subscriptions: subs };
}
