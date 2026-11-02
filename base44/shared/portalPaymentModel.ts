// Portal payment source model — pure TS, ZERO imports. Safe to bundle into
// Deno functions (base44/functions/*) and frontend modules.
//
// I-06 (BACKLOG_MASTERPLAN): "Payment added from Customer Portal" — the
// portal_source flag (A-15, Payment.jsonc L88-91) stamped by the portal pay
// path, the canonical events-feed label, and the source-filter spec the I-05
// payments register (paymentRegisterModel.ts) gains.
//
// WHERE THE STAMP LANDS — read of the live pay path (w-115):
//   * There is NO portal Payment-creation path today. customerPortalAction
//     action "payment_notice" (entry.ts:1096-1133) only writes a PortalMessage
//     + OpportunityActivity note; the Payment entity is read-only there.
//   * Every real Payment row comes from invoicingAction record_payment
//     (entry.ts:863-900; entity data block lines 880-894), which is gated by
//     authenticateSignShopSession (entry.ts:195) — a portal link token can
//     never satisfy it.
//   * Therefore the stamp lands in ONE of two places (orchestrator's call):
//       a) invoicingAction record_payment — pass the patch fields through the
//          body into the entity `data` block at entry.ts:880-894 (add
//          `...portalSourcePatch`-shaped fields after `created_by: actor`).
//          This is the wire when a privileged caller records "on behalf of"
//          the portal or when record_payment gains a service-token path.
//       b) a NEW portal pay action inside customerPortalAction (adjacent to
//          payment_notice at entry.ts:1096) that writes the Payment row via
//          createFoundationRecordWithRecovery + recompute parity — spread
//          portalSourcePatch({link_kind: link.kind, actor_label: link.label})
//          into that `data` block. This is the true "portal pay path" stamp.
//   * Frontend entry point today: src/pages/CustomerPortal.jsx:785 calls
//     action "payment_notice"; a future "mark as paid"/pay-online submit is
//     the call site that would carry the stamped payload.
//
// PRECEDENCE (paymentSourceClass): the explicit portal_source flag always
// wins — any non-empty value means the row was stamped portal-originated
// (A-15 semantics; 'customer_portal' and the A-15 example 'added from
// Customer Portal' both classify 'portal'), EXCEPT a small staff-sentinel
// set ('staff','manual','internal','none','no','false','0','walk_in',
// 'walk-in','counter','in_house','office') which forces 'staff' so a
// deliberate non-portal marker cannot be overridden by weaker heuristics.
// Only when portal_source is absent/empty do the recorded_via /
// portal_link_* / actor-chain / free-text heuristics run — a heuristic hit
// classifies 'possible_portal' (not definite): the flag was never written,
// so confidence is lower and audit surfaces the class distinctly.
// isPortalPayment = class !== 'staff' — the register 'portal' bucket keeps
// possible-portal rows out of 'staff' so nothing portal-ish hides there.
//
// STORED-FIELD SET (portalSourcePatch): portal_source exists in
// Payment.jsonc (A-15). portal_link_kind, portal_actor, recorded_via (and
// the optional portal_recorded_at) are NOT yet declared properties — spec
// them for the schema owner or let them persist as undeclared fields.
//
// EVENTS FEED: orderHistoryModel.js already treats portal_source as a
// customer-origin signal (L139/L143) and prefers it as the row actor (L243).
// portalEventLabel() supplies the canonical display label for the merged
// feed — 'Payment added from Customer Portal'.

export const PORTAL_SOURCE_VALUE = 'customer_portal';
export const RECORDED_VIA_PORTAL = 'portal';
export const PORTAL_EVENT_LABEL = 'Payment added from Customer Portal';
export const STAFF_EVENT_LABEL = 'Payment recorded';

export type PortalSourceClass = 'portal' | 'possible_portal' | 'staff';
export type SourceFilterOption = 'all' | 'portal' | 'staff';

export const PORTAL_SOURCE_CLASSES: readonly PortalSourceClass[] = [
  'portal', 'possible_portal', 'staff',
];

// Dropdown order for the register's new source filter — 'portal' bucket =
// isPortalPayment(row); 'staff' = its complement.
export const SOURCE_FILTER_OPTIONS: readonly SourceFilterOption[] = [
  'all', 'portal', 'staff',
];

const clean = (v: any): string => String(v ?? '').trim();
const lower = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fb = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

// Explicit portal_source values that mean "definitely NOT portal" — an
// intentional non-portal stamp beats every heuristic below.
const STAFF_SOURCE_SENTINELS = new Set([
  'staff', 'manual', 'internal', 'none', 'no', 'false', '0',
  'walk_in', 'walk-in', 'counter', 'in_house', 'office',
]);

const toIso = (v: any): string => {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : '';
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : '';
  }
  const s = clean(v);
  if (!s) return '';
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

export interface PortalSourcePatchArgs {
  /** CustomerPortalLink.kind that carried the customer in ('invoice'|'customer'|…). */
  link_kind?: any;
  /** Human display name for the portal actor — link.label / contact name. */
  actor_label?: any;
  /** Stamp time — Date | ISO string | epoch ms. Adds portal_recorded_at. */
  now?: Date | string | number;
}

// ── portalSourcePatch ─────────────────────────────────────────────────────
// The full stored-field set for a portal-originated Payment row. Always
// returns the four contracted keys; adds portal_recorded_at when `now` is
// supplied. Missing link/actor store '' (shape-stable, never undefined).
export function portalSourcePatch(args: PortalSourcePatchArgs = {}): Record<string, string> {
  const patch: Record<string, string> = {
    portal_source: PORTAL_SOURCE_VALUE,
    portal_link_kind: clean(args?.link_kind),
    portal_actor: clean(args?.actor_label),
    recorded_via: RECORDED_VIA_PORTAL,
  };
  const ts = toIso(args?.now);
  if (ts) patch.portal_recorded_at = ts;
  return patch;
}

// ── stampPortalSource ─────────────────────────────────────────────────────
// Adds the portal flag to a record_payment-style payload — either the
// invoicingAction invoke body (which the backend then copies into the
// Payment entity data block) or the Payment .create data object inside a
// portal-side action. NON-MUTATING: returns a new object. With no opts the
// stamp is the minimal `portal_source` flag; passing link/actor/now merges
// the full portalSourcePatch stored-field set.
export function stampPortalSource(
  payload: Record<string, any> = {},
  opts?: PortalSourcePatchArgs,
): Record<string, any> {
  const base = { ...(payload || {}) };
  const hasOpts = !!opts && ['link_kind', 'actor_label', 'now']
    .some((k) => (opts as any)[k] !== undefined && (opts as any)[k] !== null && (opts as any)[k] !== '');
  if (!hasOpts) return { ...base, portal_source: PORTAL_SOURCE_VALUE };
  return { ...base, ...portalSourcePatch(opts) };
}

// ── paymentSourceClass ────────────────────────────────────────────────────
// Three-way source classification with explicit-flag precedence:
//   'portal'          — portal_source is stamped (definite)
//   'possible_portal' — flag absent but recorded_via/link/actor/notes
//                       heuristics point at the portal (unverified)
//   'staff'           — no portal signal, or an explicit staff sentinel.
export function paymentSourceClass(payment: any): PortalSourceClass {
  const row = payment && typeof payment === 'object' ? payment : {};
  const flag = lower(row.portal_source);
  if (flag) {
    if (STAFF_SOURCE_SENTINELS.has(flag)) return 'staff';
    // A-15 semantics: any other non-empty portal_source marks a
    // portal-originated row ('customer_portal', 'added from Customer
    // Portal', or a future event-class string).
    return 'portal';
  }
  if (portalHeuristicHit(row)) return 'possible_portal';
  return 'staff';
}

// Identity/origin fields scanned for 'portal' in the actor chain — covers
// the shapes invoicingAction (created_by), customerPortalAction
// (recorded_by_email/name = 'customer_portal'/'Customer Portal'), and
// generic event rows (source/origin/channel) produce.
const PORTAL_ACTOR_FIELDS = [
  'recorded_via', 'created_by', 'updated_by', 'actor', 'actor_name',
  'recorded_by', 'recorded_by_email', 'recorded_by_name', 'performed_by',
  'submitted_via', 'source', 'origin', 'channel', 'entered_by',
];
// Structural portal markers: a link id/kind/actor or boolean flag only a
// portal write would carry.
const PORTAL_LINK_FIELDS = [
  'portal_link_kind', 'portal_link_id', 'portal_actor', 'portal_token',
  'portal_recorded_at', 'customer_portal_link_id',
];
const PORTAL_BOOLEAN_FIELDS = [
  'from_portal', 'portal', 'customer_initiated', 'portal_initiated',
  'is_portal_payment',
];
// Free-text fields — weakest signal; still only ever yields 'possible_portal'.
const PORTAL_TEXT_FIELDS = ['notes', 'reference_number', 'memo', 'description'];

function portalHeuristicHit(row: any): boolean {
  for (const f of PORTAL_LINK_FIELDS) {
    if (clean(row[f])) return true;
  }
  for (const f of PORTAL_BOOLEAN_FIELDS) {
    if (row[f] === true) return true;
  }
  for (const f of PORTAL_ACTOR_FIELDS) {
    if (lower(row[f]).includes('portal')) return true;
  }
  for (const f of PORTAL_TEXT_FIELDS) {
    const s = lower(row[f]);
    if (s.includes('customer portal') || s.includes('via the portal') || s.includes('portal payment')) return true;
  }
  return false;
}

// ── isPortalPayment ───────────────────────────────────────────────────────
// True for definite ('portal') AND heuristic ('possible_portal') rows —
// portal_source flag OR recorded_via/actor-chain heuristics. Explicit flag
// wins over heuristics in both directions (see paymentSourceClass docs);
// callers needing certainty use paymentSourceClass() for the three-way.
export function isPortalPayment(payment: any): boolean {
  return paymentSourceClass(payment) !== 'staff';
}

// ── registerFilterExtension ───────────────────────────────────────────────
// The filter spec the I-05 payments register gains: {key:'source',
// options:['all','portal','staff']} — 'portal' selects isPortalPayment rows
// (definite + possible), 'staff' selects the complement. `match` accepts a
// raw Payment entity row OR a register row carrying the portal fields, and
// fails open on unknown option values so a future option never hides rows.
export interface RegisterSourceFilterSpec {
  key: 'source';
  label: string;
  options: readonly SourceFilterOption[];
  option_labels: Record<string, string>;
  default: SourceFilterOption;
  match: (row: any, option: any) => boolean;
}

export function registerFilterExtension(): RegisterSourceFilterSpec {
  return {
    key: 'source',
    label: 'Source',
    options: [...SOURCE_FILTER_OPTIONS],
    option_labels: {
      all: 'All sources',
      portal: 'Customer portal',
      staff: 'Staff-entered',
    },
    default: 'all',
    match(row: any, option: any): boolean {
      const v = lower(option);
      if (v === '' || v === 'all' || v === '*') return true;
      if (v === 'portal') return isPortalPayment(row);
      if (v === 'staff') return !isPortalPayment(row);
      return true;
    },
  };
}

// ── portalEventLabel ──────────────────────────────────────────────────────
// The events-feed label. Portal-class rows (definite AND possible — the
// class distinguishes confidence for audit) render 'Payment added from
// Customer Portal'; staff rows render the generic 'Payment recorded'.
export function portalEventLabel(payment: any): string {
  return isPortalPayment(payment) ? PORTAL_EVENT_LABEL : STAFF_EVENT_LABEL;
}

// ── paymentDedupeContext ──────────────────────────────────────────────────
// Compact audit-display context: which fields flagged the row portal, plus
// the dedupe identity the server would key on. dedupe_key mirrors the
// findByCreationKey contract — creation_request_key when present, else a
// stable fingerprint of the logical payment (invoice + amount + method +
// paid_date) so a retried portal submit reads as the same row.
export interface PaymentDedupeContext {
  payment_id: string;
  invoice_id: string;
  customer_id: string;
  creation_request_key: string;
  source_class: PortalSourceClass;
  portal_source: string;
  recorded_via: string;
  portal_link_kind: string;
  portal_actor: string;
  created_by: string;
  method: string;
  amount: number;
  paid_date: string;
  status: string;
  matched_fields: string[];
  dedupe_key: string;
}

export function paymentDedupeContext(payment: any): PaymentDedupeContext {
  const row = payment && typeof payment === 'object' ? payment : {};
  const matched: string[] = [];
  if (clean(row.portal_source)) matched.push('portal_source');
  if (lower(row.recorded_via).includes('portal')) matched.push('recorded_via');
  for (const f of PORTAL_LINK_FIELDS) {
    if (clean(row[f])) matched.push(f);
  }
  for (const f of PORTAL_BOOLEAN_FIELDS) {
    if (row[f] === true) matched.push(f);
  }
  for (const f of PORTAL_ACTOR_FIELDS) {
    if (f !== 'recorded_via' && lower(row[f]).includes('portal')) matched.push(f);
  }
  const key = clean(row.creation_request_key)
    || `payment:${clean(row.invoice_id)}:${num(row.amount)}:${lower(row.method) || 'other'}:${clean(row.paid_date).slice(0, 10)}`;
  return {
    payment_id: clean(row.id) || clean(row.payment_id),
    invoice_id: clean(row.invoice_id),
    customer_id: clean(row.customer_id),
    creation_request_key: clean(row.creation_request_key),
    source_class: paymentSourceClass(row),
    portal_source: clean(row.portal_source),
    recorded_via: clean(row.recorded_via),
    portal_link_kind: clean(row.portal_link_kind),
    portal_actor: clean(row.portal_actor),
    created_by: clean(row.created_by),
    method: clean(row.method),
    amount: num(row.amount),
    paid_date: clean(row.paid_date),
    status: clean(row.status),
    matched_fields: matched,
    dedupe_key: key.slice(0, 256),
  };
}
