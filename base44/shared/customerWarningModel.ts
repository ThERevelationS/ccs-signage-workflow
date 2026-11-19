// Customer warning-flag model — ESTIMATOR_MASTERPLAN G-11.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Storage contract (base44/entities/Customer.jsonc — A-10, w-6):
//   Customer.warning_flags   array of string — "Warning flags raised on this
//                            account (e.g. credit_hold, do_not_mail,
//                            tax_expired) — surfaced as badges on customer
//                            views." The schema item type is `string`, so the
//                            canonical stored entry is a flag KEY; this model
//                            also tolerates object entries
//                            ({flag|kind|type, note|detail}) and a single bare
//                            string on read, because import/UI paths may have
//                            already written them.
//   Customer.warning_flag_details  (sidecar written by setFlagPatch) — object
//                            keyed by flag: {note?, set_by, set_at}. Bare
//                            string flags pull their badge `detail` from here.
//   Customer.credit_hold     boolean — schema-declared "new estimates warn
//                            that the customer is on credit hold" → derives
//                            the credit_hold flag.
//   Customer.po_required / require_purchase_order  booleans — G-10 parallel
//                            flags → derive requires_po.
//
// Surfaces: customer pickers (flagSummary worst-tone chip), estimate header
// and customer workspace (warningBadges / autoWarningFlags badge list).
//
// Derivation rules (autoWarningFlags / derivedWarningFlags):
//   past_due    — the customer has ≥1 open invoice past its due_date at the
//                 as-of date. Open-AR membership replicates arAgingReports
//                 EXACTLY (keep in sync): status ∉ {draft, void, refunded,
//                 cancelled, canceled}, no void-ish flags, remaining balance
//                 > 0 (balance_due/balance/amount_due authoritative, else
//                 total − paid), issue date (issue_date→sent_date→
//                 created_date) on/before as-of when parseable, due_date
//                 strictly before as-of. Invoices attribute by customer_id
//                 (creditTermsModel.creditUsage convention).
//   credit_hold — customer.credit_hold === true OR the credit-terms record's
//                 status is a hold spelling ('hold'/'on_hold'/'credit_hold',
//                 or hold/on_hold === true). opts.creditTerms (opts.terms
//                 alias) is that record; a bare 'hold' string works.
//   requires_po — customer.po_required === true OR
//                 customer.require_purchase_order === true (G-10
//                 poRequirement parity). po_required_note becomes the detail.
//
// Merge semantics: STORED flags always win — a derived flag is only added
// when no stored entry normalizes to the same canonical key (aliases
// included, so a stored 'po_required' string suppresses the derived
// 'requires_po' twin). Every merged badge carries source:'stored'|'derived'.
//
// API:
//   WARNING_FLAG_KINDS / WARNING_TONES / WARNING_FLAG_LABELS — registry
//   WARNING_TONE_SEVERITY                    — worst-tone ladder
//   normalizeFlagKey(v) / isKnownFlag(key)   — key normalization + registry
//   warningFlagLabel(flag) / warningFlagTone(flag)
//   warningBadges(customer)                  → stored badges only
//   derivedWarningFlags(customer, ctx)       → derived badges only
//   autoWarningFlags(customer, ctx)          → merged (stored wins)
//   flagSummary(customer|badges)             → {count, highest_tone}
//   setFlagPatch(customer, flag, opts)       → Customer update patch

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Dollar-ish field → integer cents (statementBatch/arAgingReports toCents —
// strips currency decoration so imported rows parse). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};

// Any date-ish value → 'YYYY-MM-DD' (arAgingReports.toDay / statementBatch
// convention: leading-date prefix wins so ISO timestamps never shift days
// across timezones; Date/epoch fall back to the UTC calendar date).
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

// Whole days between two 'YYYY-MM-DD' strings (UTC — DST-immune). null when
// either side is unparseable (arAgingReports.daysBetween).
const daysBetween = (fromDay: string, toDayStr: string): number | null => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY_MS);
};

const usd = (cents: number): string => `$${(Math.round(num(cents)) / 100).toFixed(2)}`;

// --- flag registry ------------------------------------------------------------

// Canonical flag kinds. The first eight are the spec-canonical set;
// do_not_mail + tax_expired are extensions justified by the Customer.jsonc
// warning_flags description, which documents both as example stored values
// (the only existing-data evidence — no other writer exists yet).
export const WARNING_FLAG_KINDS: readonly string[] = Object.freeze([
  'credit_hold',
  'tax_exempt_verify',
  'bad_debt',
  'do_not_quote',
  'vip',
  'requires_po',
  'past_due',
  'custom',
  'do_not_mail',
  'tax_expired',
]);

export type WarningTone = 'red' | 'amber' | 'blue' | 'emerald' | 'slate';

// Spec-canonical tone map verbatim; do_not_mail is an informational
// suppression (slate, like custom) and tax_expired an action-needed verify
// (amber, like tax_exempt_verify).
export const WARNING_TONES: Record<string, WarningTone> = {
  credit_hold: 'red',
  bad_debt: 'red',
  do_not_quote: 'red',
  past_due: 'amber',
  tax_exempt_verify: 'amber',
  tax_expired: 'amber',
  requires_po: 'blue',
  vip: 'emerald',
  custom: 'slate',
  do_not_mail: 'slate',
};

// Worst-tone ladder for flagSummary.highest_tone — a picker chip surfaces
// the most alarming tone present. red (danger) > amber (action needed) >
// blue (operational rule) > emerald (positive flag) > slate (neutral/custom).
export const WARNING_TONE_SEVERITY: Record<WarningTone, number> = {
  slate: 0,
  emerald: 1,
  blue: 2,
  amber: 3,
  red: 4,
};

const WARNING_FLAG_LABELS: Record<string, string> = {
  credit_hold: 'Credit hold',
  tax_exempt_verify: 'Verify tax exemption',
  tax_expired: 'Tax exemption expired',
  bad_debt: 'Bad debt',
  do_not_quote: 'Do not quote',
  vip: 'VIP',
  requires_po: 'PO required',
  past_due: 'Past due',
  custom: 'Custom',
  do_not_mail: 'Do not mail',
};

// Stored-spelling → canonical key. normalizeFlagKey already lowercases and
// folds spaces/dashes to '_'; this table folds the known drift spellings
// (parallel schema fields, CoreBridge import vocabulary, obvious synonyms)
// onto the registry keys so merge/dedupe treats them as one flag.
const FLAG_ALIASES: Record<string, string> = {
  po_required: 'requires_po',
  require_purchase_order: 'requires_po',
  requires_purchase_order: 'requires_po',
  po_needed: 'requires_po',
  overdue: 'past_due',
  pastdue: 'past_due',
  on_credit_hold: 'credit_hold',
  creditheld: 'credit_hold',
  collections: 'bad_debt',
  write_off: 'bad_debt',
  no_quote: 'do_not_quote',
  no_quotes: 'do_not_quote',
  do_not_bid: 'do_not_quote',
  tax_exempt_expired: 'tax_expired',
  exemption_expired: 'tax_expired',
  tax_verify: 'tax_exempt_verify',
  verify_tax_exempt: 'tax_exempt_verify',
  no_mail: 'do_not_mail',
};

// One flag-ish value → canonical key, or ''. Scalars normalize to lowercase
// snake_case then resolve through FLAG_ALIASES; objects resolve the first
// non-blank of flag|kind|type|key|name (the tolerated stored shapes).
export function normalizeFlagKey(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const f of ['flag', 'kind', 'type', 'key', 'name']) {
      const k = normalizeFlagKey((v as any)[f]);
      if (k) return k;
    }
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const key = norm(v).replace(/[\s\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return '';
  return FLAG_ALIASES[key] ?? key;
}

export const isKnownFlag = (key: any): boolean =>
  WARNING_FLAG_KINDS.includes(normalizeFlagKey(key));

// Human label for a badge. Registry labels win; unknown keys title-case.
export function warningFlagLabel(flag: any): string {
  const key = normalizeFlagKey(flag);
  if (!key) return '';
  if (WARNING_FLAG_LABELS[key]) return WARNING_FLAG_LABELS[key];
  return key
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Badge tone — registry tone, else the 'custom' tone (slate) so an
// unrecognized stored flag still renders as a quiet badge, never crashes.
export function warningFlagTone(flag: any): WarningTone {
  const key = normalizeFlagKey(flag);
  return WARNING_TONES[key] ?? WARNING_TONES.custom;
}

// --- stored-flag reading --------------------------------------------------------

export type WarningBadge = {
  flag: string; // canonical normalized key (aliases resolved)
  label: string; // display label
  tone: WarningTone; // badge color family
  detail?: string; // optional note text — omitted when blank
  known: boolean; // flag is inside WARNING_FLAG_KINDS
  source: 'stored' | 'derived';
};

// warning_flags → raw entry list. Tolerates: array, a single object entry,
// or a single string (comma-separated lists split too — 'a,b' is two flags).
const rawFlagEntries = (customer: any): any[] => {
  const raw = customer?.warning_flags;
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') return raw.split(',');
  return [raw];
};

// First non-blank of the tolerated note slots on an object entry.
const entryNote = (entry: any): string => {
  if (!isObj(entry)) return '';
  for (const f of ['note', 'detail', 'message', 'text']) {
    const s = clean((entry as any)[f]);
    if (s) return s;
  }
  return '';
};

// Detail sidecar lookup — setFlagPatch writes {flag: {note, set_by, set_at}}.
const sidecarNote = (customer: any, flag: string): string => {
  const details = isObj(customer?.warning_flag_details) ? customer.warning_flag_details : {};
  const d = (details as any)[flag];
  if (!isObj(d)) return '';
  return clean(d.note) || clean((d as any).detail);
};

const badgeFor = (flag: string, detail: string, source: 'stored' | 'derived'): WarningBadge => {
  const badge: WarningBadge = {
    flag,
    label: warningFlagLabel(flag),
    tone: warningFlagTone(flag),
    known: isKnownFlag(flag),
    source,
  };
  if (clean(detail)) badge.detail = clean(detail);
  return badge;
};

/**
 * warningBadges — normalized badge list for a customer's STORED flags.
 * Entries dedupe on canonical key (aliases fold — 'po_required' and
 * 'requires_po' collide); first stored occurrence wins so admin ordering is
 * preserved. Object entries contribute their note|detail|message|text;
 * bare strings fall back to warning_flag_details[flag].note. Blank/garbage
 * entries are skipped.
 */
export function warningBadges(customer: any): WarningBadge[] {
  const out: WarningBadge[] = [];
  const seen = new Set<string>();
  for (const entry of rawFlagEntries(customer)) {
    const key = normalizeFlagKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(badgeFor(key, entryNote(entry) || sidecarNote(customer, key), 'stored'));
  }
  return out;
}

// --- derived flags --------------------------------------------------------------

// Open-AR membership — replicated EXACTLY from arAgingReports (keep in
// sync): void-ish statuses, void-ish flags, balance>0 chain.
const VOIDISH_STATUSES = new Set(['void', 'refunded', 'cancelled', 'canceled']);
const isVoidishInvoice = (inv: any): boolean => {
  if (!isObj(inv)) return true;
  if (VOIDISH_STATUSES.has(norm(inv.status))) return true;
  if (inv.void === true || inv.voided === true || inv.is_void === true || inv.deleted === true) return true;
  return Boolean(clean(inv.voided_date));
};
const isDraftInvoice = (inv: any): boolean => norm(inv?.status) === 'draft';

// w-63 invoicePaidCents chain: amount_paid → paid_amount/total_paid →
// payments[] row sum (voided entries skipped).
const invoicePaidCents = (inv: any): number => {
  for (const v of [inv?.amount_paid, inv?.paid_amount, inv?.total_paid]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  if (Array.isArray(inv?.payments) && inv.payments.length) {
    return inv.payments
      .filter((p: any) => p && !VOIDISH_STATUSES.has(norm(p.status)))
      .reduce((sum: number, p: any) => sum + toCents(p.amount ?? p.value ?? p.total ?? p.paid_amount), 0);
  }
  return 0;
};

// w-63 invoiceBalanceCents: balance_due/balance/amount_due authoritative,
// else total − paid floored at 0.
const invoiceBalanceCents = (inv: any): number => {
  const balance = inv?.balance_due ?? inv?.balance ?? inv?.amount_due;
  if (balance != null && Number.isFinite(Number(balance))) return toCents(balance);
  return Math.max(0, toCents(inv?.total) - invoicePaidCents(inv));
};

// Billed day chain (arAgingReports.invoiceIssueDay).
const invoiceIssueDay = (inv: any): string =>
  toDay(inv?.issue_date) || toDay(inv?.sent_date) || toDay(inv?.created_date);

// Does the credit-terms record say the account is on hold? Accepts the
// record (status spelling or hold/on_hold boolean), or a bare status string.
const HOLD_STATUSES = new Set(['hold', 'on_hold', 'credit_hold']);
const creditTermsOnHold = (terms: any): boolean => {
  if (typeof terms === 'string') return HOLD_STATUSES.has(norm(terms).replace(/[\s\-]+/g, '_'));
  if (!isObj(terms)) return false;
  if (terms.hold === true || terms.on_hold === true) return true;
  const status = norm(terms.status).replace(/[\s\-]+/g, '_');
  return HOLD_STATUSES.has(status);
};

const creditTermsNote = (terms: any): string => {
  if (!isObj(terms)) return '';
  for (const f of ['note', 'reason', 'status_note', 'detail', 'hold_reason']) {
    const s = clean((terms as any)[f]);
    if (s) return s;
  }
  return '';
};

/**
 * derivedWarningFlags — flags the model can derive from account state even
 * when nothing is stored: past_due (open overdue AR), credit_hold (account
 * flag or credit-terms status 'hold'), requires_po (G-10 parallel fields).
 * ctx: {invoices, creditTerms|terms, asOf|now}. Returns badges marked
 * source:'derived'.
 */
export function derivedWarningFlags(customer: any, ctx: any = {}): WarningBadge[] {
  const c = isObj(customer) ? customer : {};
  const out: WarningBadge[] = [];
  const cid = clean((c as any).id);

  // past_due — open balance past due_date at as-of (open-AR membership per
  // arAgingReports; attribution per creditUsage's customer_id match).
  const asOf = toDay(ctx?.asOf) || toDay(ctx?.now) || new Date().toISOString().slice(0, 10);
  let overdueCount = 0;
  let overdueCents = 0;
  let oldestDue = '';
  for (const inv of Array.isArray(ctx?.invoices) ? ctx.invoices : []) {
    if (!isObj(inv)) continue;
    // Attribution requires the customer's id (creditUsage convention — a
    // blank id can never match, so unresolved customers derive no past_due).
    if (!cid || clean(inv.customer_id) !== cid) continue;
    if (isVoidishInvoice(inv) || isDraftInvoice(inv)) continue;
    const balance = invoiceBalanceCents(inv);
    if (balance <= 0) continue;
    const issued = invoiceIssueDay(inv);
    if (issued && issued > asOf) continue; // not billed yet at as-of
    const dueDay = toDay(inv.due_date);
    if (!dueDay) continue; // undated invoices can't be past due
    const daysPast = daysBetween(dueDay, asOf);
    if (daysPast == null || daysPast <= 0) continue;
    overdueCount += 1;
    overdueCents += balance;
    if (!oldestDue || dueDay < oldestDue) oldestDue = dueDay;
  }
  if (overdueCount > 0) {
    const noun = overdueCount === 1 ? 'invoice' : 'invoices';
    out.push(
      badgeFor(
        'past_due',
        `${overdueCount} open ${noun} past due — ${usd(overdueCents)} total (oldest due ${oldestDue})`,
        'derived',
      ),
    );
  }

  // credit_hold — schema boolean on the customer OR the credit-terms
  // record's status ('hold' spellings). opts.terms accepted as alias.
  const terms = ctx?.creditTerms ?? ctx?.terms;
  const onHold = (c as any).credit_hold === true || creditTermsOnHold(terms);
  if (onHold) {
    const detail =
      creditTermsNote(terms) ||
      ((c as any).credit_hold === true
        ? 'Credit hold flag set on this account'
        : 'Credit terms status: hold');
    out.push(badgeFor('credit_hold', detail, 'derived'));
  }

  // requires_po — G-10 poRequirement parallel flags.
  if ((c as any).po_required === true || (c as any).require_purchase_order === true) {
    out.push(badgeFor('requires_po', clean((c as any).po_required_note), 'derived'));
  }

  return out;
}

/**
 * autoWarningFlags — stored badges + derived badges, merged on canonical
 * key. STORED WINS: a derived flag is appended only when no stored entry
 * normalizes to it (aliases included). Every badge carries source so the
 * UI can distinguish "admin set this" from "state implies this".
 */
export function autoWarningFlags(customer: any, ctx: any = {}): WarningBadge[] {
  const stored = warningBadges(customer);
  const storedKeys = new Set(stored.map((b) => b.flag));
  const merged = [...stored];
  for (const d of derivedWarningFlags(customer, ctx)) {
    if (!storedKeys.has(d.flag)) merged.push(d);
  }
  return merged;
}

// --- summary -------------------------------------------------------------------

/**
 * flagSummary — picker-chip contract: {count, highest_tone}. Accepts a
 * customer (stored badges via warningBadges) or a precomputed badge array
 * (e.g. autoWarningFlags output for the merged view). highest_tone is the
 * most severe tone present per WARNING_TONE_SEVERITY, null when no flags.
 */
export function flagSummary(input: any): { count: number; highest_tone: WarningTone | null } {
  const badges = Array.isArray(input) ? input : warningBadges(input);
  let highest: WarningTone | null = null;
  let best = -1;
  for (const b of badges) {
    const tone: WarningTone = WARNING_TONES[normalizeFlagKey(b?.flag)] ?? WARNING_TONES.custom;
    const sev = WARNING_TONE_SEVERITY[tone] ?? 0;
    if (sev > best) {
      best = sev;
      highest = tone;
    }
  }
  return { count: badges.length, highest_tone: highest };
}

// --- mutation patch -------------------------------------------------------------

/**
 * setFlagPatch — Customer update adding/removing ONE stored flag while
 * preserving every other entry verbatim (existing entries keep their stored
 * shape — strings stay strings, objects stay objects).
 *   add (opts.on !== false): appends the canonical string key when no stored
 *     entry already normalizes to it, and stamps
 *     warning_flag_details[flag] = {note?, set_by, set_at}.
 *   remove (opts.on === false): drops every entry normalizing to the flag
 *     and deletes its warning_flag_details slot.
 * Returns {warning_flags, warning_flag_details}. Throws on a blank flag.
 */
export function setFlagPatch(
  customer: any,
  flag: any,
  opts: any = {},
): { warning_flags: any[]; warning_flag_details: Record<string, any> } {
  const key = normalizeFlagKey(flag);
  if (!key) {
    throw new Error('warning flag is required — pass a flag key string or {flag|kind|type} object');
  }
  const c = isObj(customer) ? customer : {};
  const existing = rawFlagEntries(c);
  const details: Record<string, any> = isObj((c as any).warning_flag_details)
    ? { ...(c as any).warning_flag_details }
    : {};

  if (opts?.on === false) {
    return {
      warning_flags: existing.filter((e) => normalizeFlagKey(e) !== key),
      warning_flag_details: (() => {
        delete details[key];
        return details;
      })(),
    };
  }

  const already = existing.some((e) => normalizeFlagKey(e) === key);
  const now = opts?.now;
  const at =
    now instanceof Date
      ? now.toISOString()
      : now != null && now !== ''
        ? String(now)
        : new Date().toISOString();
  const detail: Record<string, any> = { set_by: opts?.actor_id ?? opts?.actor ?? null, set_at: at };
  const note = clean(opts?.note);
  if (note) detail.note = note;
  details[key] = detail;

  return {
    warning_flags: already ? [...existing] : [...existing, key],
    warning_flag_details: details,
  };
}
