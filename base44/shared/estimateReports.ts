// Estimate report suite — ESTIMATOR_MASTERPLAN WS-J / item J-07.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Nine report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   estimates_current           — open/pending pipeline detail w/ age
//   estimate_activity           — status-change counts by type in a period
//   conversions_by_salesperson  — converted ÷ sent, rate, avg days-to-convert
//   estimates_by_customer       — per-customer rollup
//   estimates_by_salesperson    — per-rep rollup
//   estimates_by_entered_by     — per-EnteredBy rollup (CoreBridge parity)
//   estimates_by_industry       — per Customer.industry_type rollup
//   estimates_by_origination    — per Customer origination rollup
//   estimates_by_customer_type  — per Customer.customer_type rollup
//
// ESTIMATE_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads
// data.estimates / data.customers(ById) / data.revisions /
// data.work_orders(ById) only — the engine owns data injection.
//
// ── Entity contract (AllInOneEstimate.jsonc — read before writing) ──────
//   status enum: draft | calculated | sent | approved | archived | cancelled
//     — there is NO 'converted' status; conversion is the approved+WO-link
//     state (recordEstimateAcceptance rejects re-conversion when
//     work_order_id is set) plus legacy/quote spellings (followUpMachine
//     terminal set adds declined/converted/won/lost/canceled).
//   sales_stage: lead|quoted|follow_up|won|lost|on_hold + sales_stage_changed_at
//     (pipeline mirror written back from the linked WorkOrder).
//   Money: quote_total is the CUSTOMER-FACING total after the pricing
//     waterfall; total_cost is the raw section sum. quote_total wins the
//     total ladder.
//   Sent marker: quote_issue_date stamps the first transition into 'sent'
//     (historical sent rows are NOT backfilled — the ladder below covers
//     them). follow_up_state.anchor_at is the machine's stored send anchor.
//   Grouping dims NOT on the estimate: industry_type / customer_origination /
//     origination_path / customer_type live on the linked Customer and are
//     resolved through the injected customer map. entered_by_display is the
//     CoreBridge 'Entered By' stamp.
//   status_history is NOT declared on the entity — products carry it
//     (workOrderConversion.applyProductOperationalPatch {at,field,from,to,by}
//     entries, capped 50) and estimate rows may grow the same shape later;
//     the activity report consumes estimate.status_history[] when present,
//     EstimateRevision rows (data.revisions) second, and the estimate's own
//     date stamps as the gap-filling fallback.
//
// ── Conversion detection precedence (first match wins — `via` records it) ──
//   1. 'converted_at'      — parseable converted_at stamp (quote/order rows).
//   2. 'converted_flag'    — converted_to_work_order / converted_to_order
//                            boolean flag true (task-listed defensive field).
//   3. 'status'            — status ∈ {converted, won} (legacy spellings).
//   4. 'approved+wo'       — status 'approved' AND work_order_id linked —
//                            the canonical lifecycle conversion.
//   5. 'sales_stage_won'   — sales_stage 'won' pipeline mirror.
//   6. 'work_order_link'   — any work_order_id link (weakest but valid: the
//                            back-link only exists after conversion).
//   converted_day ladder (avg days-to-convert anchor):
//     converted_at → EstimateRevision(revision_type 'conversion').completed_at
//     → linked WorkOrder.created_date (data.work_orders) → accepted_at
//     → sales_stage_changed_at → updated_date → created_date.
//
// ── Conversion math (masterplan J-07 verify) ────────────────────────────
//   conversion_rate = estimates CONVERTED in window ÷ estimates SENT in
//   window. Numerator and denominator are measured independently on their
//   own event days (converted_day / sent_day), so a slow backlog conversion
//   can put the rate over 1.0 — reported honestly, never clamped. Division
//   by zero → 0. avg_days_to_convert = whole days created_day →
//   converted_day, averaged over conversions with both days parseable.
//
// ── sent_day ladder ──────────────────────────────────────────────────────
//   quote_issue_date → sent_at → sent_date → quote_sent_at → issued_at →
//   earliest status_history transition-to-'sent' → follow_up_state.anchor_at
//   → (current status ∈ {sent,approved,converted,won,declined} ⇒ updated_date
//      as the closest recorded lower bound) → ''. Undated rows drop out of
//   bounded windows (dayInRange rule) and survive unbounded runs.
//
// ── Activity event sources (estimates_activity) ──────────────────────────
//   Per estimate and event type, ONE source wins so a stored trail is never
//   double-counted with the stamp it substantiates:
//     estimate.status_history[] entries (each counts — repeats captured)
//     else EstimateRevision rows joined by estimate_id (each counts;
//          status_transition maps on new_status, conversion→converted,
//          cancel→cancelled, manual_revision/revert→revised)
//     else the estimate's own day stamp (created_date / sent_day /
//          accepted_at / converted_day / cancelled_at / archived_at) → 1.
//   'created' only comes from the created stamp. Revisions for estimates
//   not in the injected set are ignored — events must stay attributable.
//
// Money: integer cents end-to-end (toCents → int sums → no float dust);
// run() converts cents → dollars once at the boundary because engine
// column format 'money' expects dollar values. *_cents extras ride the
// rows for drilldowns. Days are 'YYYY-MM-DD' UTC comparisons (toDay
// convention — DST-immune); engine-resolved date_range bounds are LOCAL
// Dates bridged through localDay. As-of is a text param (no bare 'date'
// param type exists — J-03/J-04 convention).
//
// Age buckets (estimates_current): days since created at the as-of day —
//   ≤7 → '0-7' | ≤14 → '8-14' | ≤30 → '15-30' | ≤60 → '31-60'
//   | ≤90 → '61-90' | else '90+'. Pipeline-freshness scheme — deliberately
//   NOT the AR past-due buckets (there is no due date on an estimate).
//
// API:
//   ESTIMATE_OPEN_STATUSES / ESTIMATE_TERMINAL_STATUSES / ESTIMATE_STATUSES
//   ESTIMATE_AGE_BUCKETS / ESTIMATE_AGE_BUCKET_LABELS / estimateAgeBucket
//   ESTIMATE_ACTIVITY_EVENTS / ESTIMATE_ACTIVITY_EVENT_LABELS
//   isLiveEstimate / isOpenEstimate / estimateTotalCents
//   estimateSentDay / conversionInfo / estimateRows
//   activityRows / conversionSalespersonRows / rollupEstimateRows
//   ESTIMATE_REPORTS / ESTIMATE_REPORTS_BY_ID

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

// Dollar-ish field → integer cents (statementBatchModel.toCents convention —
// strips currency decoration so imported rows parse too). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;

// Normalize any date-ish value to 'YYYY-MM-DD'. Leading-date prefix wins so
// ISO timestamps never shift days across timezones; Date instances fall back
// to their UTC calendar date (statementBatch toDay convention).
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

// LOCAL calendar day of a Date — the engine resolves date_range bounds into
// local-midnight Date objects, so report windows compare the local day.
const localDay = (d: any): string => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Whole days from → to on 'YYYY-MM-DD' strings (UTC — DST-immune). null when
// either side is unparseable so callers distinguish 0 days from unknown.
const daysBetween = (fromDay: string, toDayStr: string): number | null => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY_MS);
};

// Resolved date_range param → {from,to} 'YYYY-MM-DD' bounds (either may be
// ''). Engine-resolved values arrive as {preset, from:Date, to:Date}; raw
// 'YYYY-MM-DD' / {from:'YYYY-MM-DD'} shapes tolerated for direct callers. A
// bare preset string reaching run() unresolved is treated as unbounded —
// param resolution is the engine's job.
const rangeBounds = (p: any): { from: string; to: string } => {
  if (isObj(p)) {
    const from = localDay(p.from) || toDay(p.from);
    const to = localDay(p.to) || toDay(p.to);
    return { from, to };
  }
  const d = toDay(p);
  return d ? { from: d, to: d } : { from: '', to: '' };
};

// Day ∈ [from,to], engine convention: unbounded keeps everything (undated
// rows included); any bound drops undated rows — an undatable event can't be
// attributed to a period.
const dayInRange = (day: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

const asOfDay = (v: any): string => toDay(v) || new Date().toISOString().slice(0, 10);

// --- lookups --------------------------------------------------------------

// Map | {id:row} | row[] → Map keyed by clean id (arAging normalizeCustomerMap).
const indexById = (input: any): Map<string, any> => {
  if (input instanceof Map) {
    const out = new Map<string, any>();
    for (const [k, v] of input) if (clean(k)) out.set(clean(k), v);
    return out;
  }
  const out = new Map<string, any>();
  if (Array.isArray(input)) {
    for (const r of input) if (isObj(r) && clean(r.id)) out.set(clean(r.id), r);
  } else if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) if (clean(k)) out.set(clean(k), v);
  }
  return out;
};

// EstimateRevision[] → Map estimate_id → revisions (newest last, stable).
const indexRevisionsByEstimate = (input: any): Map<string, any[]> => {
  const out = new Map<string, any[]>();
  for (const r of Array.isArray(input) ? input : []) {
    if (!isObj(r)) continue;
    const id = clean(r.estimate_id);
    if (!id) continue;
    const list = out.get(id) || [];
    list.push(r);
    out.set(id, list);
  }
  return out;
};

// Customer display name — statementBatch chain (company_name → name →
// company) then the estimate's own client_name fallback is handled by the
// caller (a frozen name beats '(unassigned)').
const customerDisplayName = (c: any): string => {
  for (const v of [c?.company_name, c?.name, c?.company]) {
    if (clean(v)) return clean(v);
  }
  const contact = [clean(c?.contact_first_name), clean(c?.contact_last_name)]
    .filter(Boolean)
    .join(' ');
  return contact || '';
};

const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Text param match: case-insensitive substring on label OR exact id —
// the arAgingReports agingContext rule.
const matchesLabel = (text: string, { id, name }: { id: string; name: string }): boolean => {
  const t = norm(text);
  if (!t) return true;
  return norm(name).includes(t) || norm(id) === t;
};

// --- lifecycle --------------------------------------------------------------

// Canonical entity enum (AllInOneEstimate.jsonc) — the declared lifecycle.
export const ESTIMATE_STATUSES = [
  'draft', 'calculated', 'sent', 'approved', 'archived', 'cancelled',
] as const;

// Open/pending pipeline — work not yet decided. The "Current Estimates"
// membership set (CoreBridge 'Current' = still open).
export const ESTIMATE_OPEN_STATUSES = ['draft', 'calculated', 'sent'] as const;

// Terminal statuses: declared enum members plus the declined/converted/won/
// lost/canceled spellings used by legacy rows, quotes, and the follow-up
// machine's terminal set.
export const ESTIMATE_TERMINAL_STATUSES = [
  'approved', 'converted', 'won', 'lost', 'declined',
  'archived', 'cancelled', 'canceled',
] as const;

const OPEN_SET = new Set<string>(ESTIMATE_OPEN_STATUSES);
const TERMINAL_SET = new Set<string>(ESTIMATE_TERMINAL_STATUSES);

// Void-ish rows never existed for reporting purposes — reportEngine
// isVoidRow alias set plus the entity's deleted/deleted_at fields.
const isVoidishEstimate = (est: any): boolean => {
  if (!isObj(est)) return true;
  if (norm(est.status) === 'void') return true;
  if (est.void === true || est.voided === true || est.is_void === true || est.deleted === true) return true;
  return Boolean(clean(est.voided_date) || clean(est.deleted_at));
};

/** isLiveEstimate — reportable estimate row: an object, not void-ish, not a
 *  reusable template (templates are never pipeline estimates). */
export function isLiveEstimate(est: any): boolean {
  if (!isObj(est)) return false;
  if (isVoidishEstimate(est)) return false;
  if (est.is_template === true) return false;
  return true;
}

/** isOpenEstimate — member of the open/pending pipeline (live + status in
 *  {draft, calculated, sent}). */
export function isOpenEstimate(est: any): boolean {
  return isLiveEstimate(est) && OPEN_SET.has(norm(est?.status));
}

/** estimateTotalCents — the report money basis. quote_total (customer-facing
 *  waterfall result) is canonical; legacy/imported rows fall back through
 *  total → grand_total → total_cost (raw section sum) so older estimates
 *  still price out. */
export function estimateTotalCents(est: any): number {
  for (const v of [est?.quote_total, est?.total, est?.grand_total, est?.total_cost]) {
    if (v != null && Number.isFinite(Number(v))) return toCents(v);
  }
  return 0;
}

const estimateNumber = (est: any): string =>
  firstText(est?.estimate_number, est?.number, est?.estimate_no, est?.id);

// --- day ladders ---------------------------------------------------------------

// The day the estimate record was created — created_date → created_at →
// updated_date (a row that can't even be created-dated gets its last edit).
const estimateCreatedDay = (est: any): string =>
  toDay(est?.created_date) || toDay(est?.created_at) || toDay(est?.updated_date);

// Normalized status_history entries — workOrderConversion shape
// {at, field, from, to, by} plus tolerant aliases ({date,status,new_status}).
const historyEntries = (est: any): any[] => {
  const raw = Array.isArray(est?.status_history) ? est.status_history : [];
  const out: any[] = [];
  for (const h of raw) {
    if (!isObj(h)) continue;
    const day = toDay(h.at ?? h.date ?? h.at_iso ?? h.created_date);
    const to = firstText(h.to, h.new_status, h.status, h.value);
    const field = firstText(h.field, h.key);
    out.push({ day, at: clean(h.at ?? h.date), field, from: clean(h.from), to, by: clean(h.by) });
  }
  return out;
};

// History entries that touched the status field (bare entries without a
// field name count — a status_history on an estimate IS a status trail).
const statusHistory = (est: any): any[] =>
  historyEntries(est).filter((h) => !h.field || norm(h.field) === 'status');

// Sent statuses — the estimate made it to the customer at least once. Used
// by the updated_date sent_day fallback (a live sent-ish row was sent
// sometime before its last edit).
const SENT_LIKE_STATUSES = new Set(['sent', 'approved', 'converted', 'won', 'declined']);

/**
 * estimateSentDay — when the estimate reached the customer. Ladder:
 *   quote_issue_date (canonical first-send stamp) → sent_at → sent_date →
 *   quote_sent_at → issued_at → earliest status_history transition-to-sent →
 *   follow_up_state.anchor_at (the machine's stored send anchor) →
 *   updated_date when the current status implies it was sent → ''.
 */
export function estimateSentDay(est: any): string {
  for (const v of [est?.quote_issue_date, est?.sent_at, est?.sent_date, est?.quote_sent_at, est?.issued_at]) {
    const d = toDay(v);
    if (d) return d;
  }
  const sentHist = statusHistory(est).filter((h) => norm(h.to) === 'sent' && h.day);
  if (sentHist.length) return sentHist.map((h) => h.day).sort()[0];
  const anchor = toDay(est?.follow_up_state?.anchor_at ?? est?.follow_up_anchor_at);
  if (anchor) return anchor;
  if (SENT_LIKE_STATUSES.has(norm(est?.status))) return toDay(est?.updated_date);
  return '';
}

// --- conversion --------------------------------------------------------------

// First completed EstimateRevision of a given type for this estimate
// (completed_at → started_at → created_date ladder; earliest wins — the
// FIRST conversion is the conversion event, later rows are audits of edits).
const revisionDayFor = (revisions: any[] | undefined, type: string): string => {
  const days = (Array.isArray(revisions) ? revisions : [])
    .filter((r) => isObj(r) && norm(r.revision_type) === type)
    .map((r) => toDay(r.completed_at) || toDay(r.started_at) || toDay(r.created_date))
    .filter(Boolean)
    .sort();
  return days[0] || '';
};

/**
 * conversionInfo — {converted, via, day} under the documented precedence:
 *   converted_at stamp → converted_to_work_order/converted_to_order flag →
 *   status converted|won → approved+work_order_id → sales_stage won →
 *   bare work_order_id link.
 * ctx: {revisions?: EstimateRevision[] for THIS estimate, workOrdersById}.
 * The day runs its own ladder — converted_at → conversion revision
 * completed_at → work order created_date → accepted_at →
 * sales_stage_changed_at → updated_date → created_date — independent of
 * which `via` fired, so the earliest trustworthy stamp always anchors
 * days-to-convert.
 */
export function conversionInfo(est: any, ctx: any = {}): { converted: boolean; via: string; day: string } {
  if (!isObj(est)) return { converted: false, via: '', day: '' };
  const status = norm(est.status);
  const woId = clean(est.work_order_id);
  const revisions = Array.isArray(ctx?.revisions) ? ctx.revisions : [];
  const workOrders = ctx?.workOrdersById instanceof Map
    ? ctx.workOrdersById
    : indexById(ctx?.workOrdersById ?? ctx?.work_orders);

  let via = '';
  if (toDay(est.converted_at)) via = 'converted_at';
  else if (est.converted_to_work_order === true || est.converted_to_order === true) via = 'converted_flag';
  else if (status === 'converted' || status === 'won') via = 'status';
  else if (status === 'approved' && woId) via = 'approved+wo';
  else if (norm(est.sales_stage) === 'won') via = 'sales_stage_won';
  else if (woId) via = 'work_order_link';
  if (!via) return { converted: false, via: '', day: '' };

  const wo = woId ? workOrders.get(woId) : null;
  const day =
    toDay(est.converted_at) ||
    revisionDayFor(revisions, 'conversion') ||
    toDay(wo?.created_date) ||
    toDay(est.accepted_at) ||
    (norm(est.sales_stage) === 'won' ? toDay(est.sales_stage_changed_at) : '') ||
    toDay(est.updated_date) ||
    estimateCreatedDay(est);
  return { converted: true, via, day };
}

// --- normalized estimate rows ---------------------------------------------------

/** estimateAgeBucket — pipeline-freshness bucket on whole days of age:
 *  ≤7 → '0-7' | ≤14 → '8-14' | ≤30 → '15-30' | ≤60 → '31-60' |
 *  ≤90 → '61-90' | else '90+'. Non-finite/negative → '0-7'. */
export const ESTIMATE_AGE_BUCKETS = ['0-7', '8-14', '15-30', '31-60', '61-90', '90+'] as const;
export type EstimateAgeBucket = (typeof ESTIMATE_AGE_BUCKETS)[number];
export const ESTIMATE_AGE_BUCKET_LABELS: Record<EstimateAgeBucket, string> = {
  '0-7': '0–7 days',
  '8-14': '8–14 days',
  '15-30': '15–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
};

export function estimateAgeBucket(daysOld: any): EstimateAgeBucket {
  const days = num(daysOld, 0);
  if (days <= 7) return '0-7';
  if (days <= 14) return '8-14';
  if (days <= 30) return '15-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const historyDayFor = (est: any, targets: Set<string>, pick: 'first' | 'last' = 'first'): string => {
  const days = statusHistory(est)
    .filter((h) => targets.has(norm(h.to)) && h.day)
    .map((h) => h.day)
    .sort();
  if (!days.length) return '';
  return pick === 'last' ? days[days.length - 1] : days[0];
};

/**
 * estimateRows — one normalized row per LIVE estimate with every report dim
 * resolved (customer-linked fields pulled through the injected customer
 * map). This is the shared row source for every spec below.
 *
 * @param estimates  AllInOneEstimate rows (any superset — reads defensive).
 * @param opts.asOf  'YYYY-MM-DD' | ISO | Date — drives age_days/age_bucket.
 *                   Defaults to today (UTC day).
 * @param opts.customersById  Customer lookup — Map | {id:row} | Customer[]
 *                            (opts.customers accepted as alias).
 * @param opts.revisions      EstimateRevision rows (all estimates — joined
 *                            internally by estimate_id). Alias: revisionsByEstimate
 *                            (pre-indexed Map).
 * @param opts.workOrdersById WorkOrder lookup for the created_date step of
 *                            the converted_day ladder. Alias: work_orders.
 * @returns rows sorted estimate_number → estimate_id, each:
 *   {estimate_id, estimate_number, project_name, customer_id, customer_name,
 *    salesperson, entered_by, industry, origination, customer_type, status,
 *    created_day, sent_day, approved_day, converted, converted_via,
 *    converted_day, days_to_convert, cancelled_day, archived_day, age_days,
 *    age_bucket, total_cents}
 */
export function estimateRows(estimates: any[] = [], opts: any = {}) {
  const asOf = toDay(opts?.asOf) || new Date().toISOString().slice(0, 10);
  const customersById = indexById(opts?.customersById ?? opts?.customers);
  const revisionsByEstimate = opts?.revisionsByEstimate instanceof Map
    ? opts.revisionsByEstimate
    : indexRevisionsByEstimate(opts?.revisions);
  const workOrdersById = indexById(opts?.workOrdersById ?? opts?.work_orders);

  const rows: any[] = [];
  for (const est of Array.isArray(estimates) ? estimates : []) {
    if (!isLiveEstimate(est)) continue;
    const cust = customersById.get(clean(est.customer_id));
    const revisions = revisionsByEstimate.get(clean(est.id)) || [];
    const conv = conversionInfo(est, { revisions, workOrdersById });
    const created = estimateCreatedDay(est);
    const sent = estimateSentDay(est);
    const approved =
      toDay(est.accepted_at) ||
      historyDayFor(est, new Set(['approved'])) ||
      (norm(est.status) === 'approved' ? toDay(est.updated_date) : '');
    const age = created ? daysBetween(created, asOf) : null;
    const daysToConvert =
      conv.converted && created && conv.day ? daysBetween(created, conv.day) : null;

    rows.push({
      estimate_id: clean(est.id),
      estimate_number: estimateNumber(est),
      project_name: clean(est.project_name),
      customer_id: clean(est.customer_id),
      customer_name: customerDisplayName(cust) || clean(est.client_name) || '(unassigned)',
      salesperson: clean(est.salesperson) || clean(cust?.salesperson),
      entered_by: firstText(est.entered_by_display, est.entered_by, est.created_by),
      industry: firstText(cust?.industry_type, cust?.industry, est.industry_type, est.industry),
      origination: firstText(
        cust?.origination_path, cust?.customer_origination,
        est.origination_path, est.customer_origination, est.origination
      ),
      customer_type: firstText(cust?.customer_type, est.customer_type),
      status: norm(est.status),
      created_day: created,
      sent_day: sent,
      approved_day: approved,
      converted: conv.converted,
      converted_via: conv.via,
      converted_day: conv.day,
      days_to_convert: daysToConvert, // null when either day is unparseable
      cancelled_day: toDay(est.cancelled_at) || historyDayFor(est, new Set(['cancelled', 'canceled'])),
      archived_day: toDay(est.archived_at) || historyDayFor(est, new Set(['archived'])),
      age_days: Math.max(0, age ?? 0),
      age_bucket: estimateAgeBucket(age ?? 0),
      total_cents: estimateTotalCents(est),
      _revisions: revisions, // internal — kept for activityRows source precedence
      _status_history: statusHistory(est),
    });
  }
  rows.sort(
    (a, b) =>
      a.estimate_number.localeCompare(b.estimate_number) ||
      a.estimate_id.localeCompare(b.estimate_id)
  );
  return rows;
}

// --- activity events ---------------------------------------------------------------

// Canonical event ordering for the activity report. 'other' catches custom
// statuses (K-11) and any new_status spelling the map doesn't know.
export const ESTIMATE_ACTIVITY_EVENTS = [
  'created', 'sent', 'approved', 'converted', 'revised', 'reopened',
  'declined', 'lost', 'cancelled', 'archived', 'other',
] as const;
export type EstimateActivityEvent = (typeof ESTIMATE_ACTIVITY_EVENTS)[number];
export const ESTIMATE_ACTIVITY_EVENT_LABELS: Record<EstimateActivityEvent, string> = {
  created: 'Created',
  sent: 'Sent',
  approved: 'Approved',
  converted: 'Converted',
  revised: 'Revised',
  reopened: 'Reopened',
  declined: 'Declined',
  lost: 'Lost',
  cancelled: 'Cancelled',
  archived: 'Archived',
  other: 'Other Status',
};

// new_status spelling → event type (status transitions TO draft/calculated
// are reopens — a stored transition always has a prior status).
const STATUS_EVENT_MAP: Record<string, EstimateActivityEvent> = {
  sent: 'sent',
  approved: 'approved',
  converted: 'converted',
  won: 'converted',
  draft: 'reopened',
  calculated: 'reopened',
  declined: 'declined',
  lost: 'lost',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  archived: 'archived',
};
const eventForStatus = (status: any): EstimateActivityEvent =>
  STATUS_EVENT_MAP[norm(status)] || 'other';

// EstimateRevision → {event, day} | null. revision_type wins where it is
// explicit (conversion/cancel/manual_revision/revert); status_transition
// maps on new_status.
const revisionEvent = (rev: any): { event: EstimateActivityEvent; day: string } | null => {
  if (!isObj(rev)) return null;
  const day = toDay(rev.completed_at) || toDay(rev.started_at) || toDay(rev.created_date);
  const type = norm(rev.revision_type);
  let event: EstimateActivityEvent | null = null;
  if (type === 'conversion') event = 'converted';
  else if (type === 'cancel') event = 'cancelled';
  else if (type === 'manual_revision' || type === 'revert') event = 'revised';
  else if (type === 'status_transition') event = eventForStatus(rev.new_status);
  else if (clean(rev.new_status)) event = eventForStatus(rev.new_status);
  if (!event) return null;
  return { event, day };
};

// Day stamp per event type straight off the normalized row — the fallback
// when neither status_history nor a revision recorded the transition.
const STAMP_DAY: Partial<Record<EstimateActivityEvent, (r: any) => string>> = {
  created: (r) => r.created_day,
  sent: (r) => r.sent_day,
  approved: (r) => r.approved_day,
  converted: (r) => (r.converted ? r.converted_day : ''),
  cancelled: (r) => r.cancelled_day,
  archived: (r) => r.archived_day,
};

/**
 * activityRows — status-change counts by event type inside [from,to].
 * Input is estimateRows() output (it carries _status_history + _revisions).
 * Source precedence per (estimate, event type): status_history entries each
 * count → else revision events each count → else the estimate's day stamp
 * counts once. Rows come back in canonical ESTIMATE_ACTIVITY_EVENTS order,
 * zero-count types omitted. Each row:
 *   {event_type, event_label, estimate_count, event_count}
 * event_count ≥ estimate_count (repeat transitions count every time).
 */
export function activityRows(rows: any[] = [], opts: any = {}) {
  const from = clean(opts?.from) || toDay(opts?.from);
  const to = clean(opts?.to) || toDay(opts?.to);
  const buckets = new Map<EstimateActivityEvent, { events: number; ids: Set<string> }>();
  const bump = (event: EstimateActivityEvent, id: string, n = 1) => {
    let b = buckets.get(event);
    if (!b) { b = { events: 0, ids: new Set<string>() }; buckets.set(event, b); }
    b.events += n;
    if (clean(id)) b.ids.add(clean(id));
  };

  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const hist = Array.isArray(r._status_history) ? r._status_history : statusHistory(r);
    const revs = Array.isArray(r._revisions) ? r._revisions : [];
    const seen = new Set<EstimateActivityEvent>();

    // 1. status_history entries — every recorded transition counts.
    for (const h of hist) {
      const event = eventForStatus(h.to);
      seen.add(event);
      if (dayInRange(h.day, from, to)) bump(event, r.estimate_id);
    }
    // 2. revision events — count only types the history trail didn't cover.
    for (const rev of revs) {
      const e = revisionEvent(rev);
      if (!e) continue;
      if (seen.has(e.event)) continue;
      seen.add(e.event);
      if (dayInRange(e.day, from, to)) bump(e.event, r.estimate_id);
    }
    // 3. day stamps fill types neither trail recorded (one per estimate).
    for (const [event, get] of Object.entries(STAMP_DAY) as [EstimateActivityEvent, (r: any) => string][]) {
      if (seen.has(event)) continue;
      const day = get(r);
      if (!day) continue;
      seen.add(event);
      if (dayInRange(day, from, to)) bump(event, r.estimate_id);
    }
  }

  return ESTIMATE_ACTIVITY_EVENTS
    .filter((e) => buckets.has(e))
    .map((e) => ({
      event_type: e,
      event_label: ESTIMATE_ACTIVITY_EVENT_LABELS[e],
      estimate_count: buckets.get(e)!.ids.size,
      event_count: buckets.get(e)!.events,
    }));
}

// --- shared estimate rollup ----------------------------------------------------

/**
 * rollupEstimateRows — group normalized estimateRows by a key fn over a
 * [from,to] window. Group membership = created_day inside the window
 * (created-date basis — the "estimates written this period" semantics every
 * by-X report shares). sent/converted counts measure THEIR OWN event days
 * in the same window; conversion_rate = converted ÷ sent (verify formula —
 * can exceed 1.0, div-zero → 0). avg_days_to_convert averages members
 * converted in-window with parseable days_to_convert.
 * Returns {groups, grand} — groups sorted total_cents desc → label → key.
 * Each group: {key, label, estimate_count, sent_count, converted_count,
 *   conversion_rate, avg_days_to_convert, total_cents, converted_cents,
 *   sent_cents, _conv_days_sum, _conv_days_n, customer_ids:Set}.
 */
export function rollupEstimateRows(rows: any[] = [], opts: any = {}) {
  const from = clean(opts?.from) || toDay(opts?.from);
  const to = clean(opts?.to) || toDay(opts?.to);
  const keyFn = typeof opts?.key === 'function' ? opts.key : (r: any) => r?.customer_id || r?.customer_name;
  const labelFn = typeof opts?.label === 'function' ? opts.label : keyFn;

  const groups = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    if (!dayInRange(r.created_day, from, to)) continue; // created-date basis
    const key = clean(keyFn(r)) || '(unassigned)';
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: clean(labelFn(r)) || key,
        estimate_count: 0,
        sent_count: 0,
        converted_count: 0,
        total_cents: 0,
        sent_cents: 0,
        converted_cents: 0,
        _conv_days_sum: 0,
        _conv_days_n: 0,
        customer_ids: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.estimate_count += 1;
    g.total_cents += Math.round(num(r.total_cents));
    // sent_count needs send evidence — an undated (never-sent) row counts
    // under unbounded windows only if dayInRange is called bare; require the
    // day itself so drafts don't inflate the bucket (N-04.1).
    if (r.sent_day && dayInRange(r.sent_day, from, to)) {
      g.sent_count += 1;
      g.sent_cents += Math.round(num(r.total_cents));
    }
    if (r.converted && dayInRange(r.converted_day, from, to)) {
      g.converted_count += 1;
      g.converted_cents += Math.round(num(r.total_cents));
      if (Number.isFinite(r.days_to_convert)) {
        g._conv_days_sum += num(r.days_to_convert);
        g._conv_days_n += 1;
      }
    }
    if (clean(r.customer_id)) g.customer_ids.add(clean(r.customer_id));
  }

  const shape = (g: any) => ({
    key: g.key,
    label: g.label,
    estimate_count: g.estimate_count,
    sent_count: g.sent_count,
    converted_count: g.converted_count,
    conversion_rate: g.sent_count > 0 ? g.converted_count / g.sent_count : 0,
    avg_days_to_convert: g._conv_days_n > 0 ? Math.round((g._conv_days_sum / g._conv_days_n) * 10) / 10 : null,
    total_cents: g.total_cents,
    sent_cents: g.sent_cents,
    converted_cents: g.converted_cents,
    _conv_days_sum: g._conv_days_sum,
    _conv_days_n: g._conv_days_n,
    customer_ids: g.customer_ids,
  });

  const list = [...groups.values()].map(shape).sort(
    (a, b) =>
      b.total_cents - a.total_cents ||
      a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
      a.key.localeCompare(b.key)
  );
  const grand = list.reduce(
    (acc, g) => {
      acc.estimate_count += g.estimate_count;
      acc.sent_count += g.sent_count;
      acc.converted_count += g.converted_count;
      acc.total_cents += g.total_cents;
      acc.sent_cents += g.sent_cents;
      acc.converted_cents += g.converted_cents;
      acc._conv_days_sum += g._conv_days_sum;
      acc._conv_days_n += g._conv_days_n;
      for (const id of g.customer_ids) acc.customer_ids.add(id);
      return acc;
    },
    {
      key: '', label: 'Total', estimate_count: 0, sent_count: 0, converted_count: 0,
      total_cents: 0, sent_cents: 0, converted_cents: 0,
      _conv_days_sum: 0, _conv_days_n: 0, customer_ids: new Set<string>(),
    }
  );
  grand.conversion_rate = grand.sent_count > 0 ? grand.converted_count / grand.sent_count : 0;
  grand.avg_days_to_convert = grand._conv_days_n > 0
    ? Math.round((grand._conv_days_sum / grand._conv_days_n) * 10) / 10
    : null;
  return { groups: list, grand };
}

/**
 * conversionSalespersonRows — conversions_by_salesperson model rows from
 * estimateRows() output. Unlike rollupEstimateRows there is NO created-date
 * membership gate: sent_count counts estimates sent in the window and
 * converted_count counts estimates converted in the window — the
 * verify-formula denominator/numerator pair on independent event days.
 * Sorted converted_count desc → converted_cents desc → salesperson.
 */
export function conversionSalespersonRows(rows: any[] = [], opts: any = {}) {
  const from = clean(opts?.from) || toDay(opts?.from);
  const to = clean(opts?.to) || toDay(opts?.to);
  const groups = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    const sentIn = Boolean(r.sent_day) && dayInRange(r.sent_day, from, to);
    const convIn = r.converted === true && dayInRange(r.converted_day, from, to);
    if (!sentIn && !convIn) continue;
    const key = clean(r.salesperson) || '(unassigned)';
    let g = groups.get(key);
    if (!g) {
      g = {
        salesperson: key,
        sent_count: 0,
        sent_cents: 0,
        converted_count: 0,
        converted_cents: 0,
        _conv_days_sum: 0,
        _conv_days_n: 0,
        estimate_ids: new Set<string>(),
      };
      groups.set(key, g);
    }
    if (sentIn) {
      g.sent_count += 1;
      g.sent_cents += Math.round(num(r.total_cents));
    }
    if (convIn) {
      g.converted_count += 1;
      g.converted_cents += Math.round(num(r.total_cents));
      if (Number.isFinite(r.days_to_convert)) {
        g._conv_days_sum += num(r.days_to_convert);
        g._conv_days_n += 1;
      }
    }
    if (clean(r.estimate_id)) g.estimate_ids.add(clean(r.estimate_id));
  }
  return [...groups.values()]
    .map((g) => ({
      salesperson: g.salesperson,
      sent_count: g.sent_count,
      sent_cents: g.sent_cents,
      converted_count: g.converted_count,
      converted_cents: g.converted_cents,
      conversion_rate: g.sent_count > 0 ? g.converted_count / g.sent_count : 0,
      avg_days_to_convert: g._conv_days_n > 0 ? Math.round((g._conv_days_sum / g._conv_days_n) * 10) / 10 : null,
      _conv_days_sum: g._conv_days_sum,
      _conv_days_n: g._conv_days_n,
      estimate_count: g.estimate_ids.size,
    }))
    .sort(
      (a, b) =>
        b.converted_count - a.converted_count ||
        b.converted_cents - a.converted_cents ||
        a.salesperson.toLowerCase().localeCompare(b.salesperson.toLowerCase())
    );
}

// --- report specs ---------------------------------------------------------------

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const num1Col = (key: string, label: string) => ({ key, label, align: 'right', format: 'num1' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const pctCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'percent' });

// Param specs (engine types only — no bare 'date' type exists; as_of is a
// YYYY-MM-DD text param, blank = today; date_range is the engine type).
const AS_OF_PARAM = { key: 'as_of', type: 'text', label: 'As-of Date', default: '' };
const DATE_RANGE_PARAM = { key: 'date_range', type: 'date_range', label: 'Date Range', default: 'this_month' };
const SALESPERSON_PARAM = { key: 'salesperson', type: 'text', label: 'Salesperson', default: '' };
const CUSTOMER_PARAM = { key: 'customer', type: 'text', label: 'Customer', default: '' };
const ENTERED_BY_PARAM = { key: 'entered_by', type: 'text', label: 'Entered By', default: '' };
const INDUSTRY_PARAM = { key: 'industry', type: 'text', label: 'Industry', default: '' };
const ORIGINATION_PARAM = { key: 'origination', type: 'text', label: 'Origination', default: '' };
const CUSTOMER_TYPE_PARAM = { key: 'customer_type', type: 'text', label: 'Customer Type', default: '' };
const STATUSES_PARAM = {
  key: 'statuses',
  type: 'multiselect',
  label: 'Statuses',
  options: ESTIMATE_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
  default: [] as string[],
};
const EVENTS_PARAM = {
  key: 'events',
  type: 'multiselect',
  label: 'Event Types',
  options: ESTIMATE_ACTIVITY_EVENTS.map((e) => ({ value: e, label: ESTIMATE_ACTIVITY_EVENT_LABELS[e] })),
  default: [] as string[],
};

// Shared run() context: normalized estimate rows + window + text filters.
const rowsContext = (params: any, data: any, asOf?: string) => {
  const { from, to } = rangeBounds(params?.date_range);
  const rows = estimateRows(data?.estimates, {
    asOf: asOf || to,
    customersById: data?.customersById ?? data?.customers,
    revisions: data?.revisions,
    revisionsByEstimate: data?.revisionsByEstimate,
    workOrdersById: data?.workOrdersById ?? data?.work_orders,
  });
  const rep = norm(params?.salesperson);
  const cust = norm(params?.customer);
  const entered = norm(params?.entered_by);
  const industry = norm(params?.industry);
  const origination = norm(params?.origination);
  const ctype = norm(params?.customer_type);
  const filtered = rows.filter((r) => {
    if (rep && !norm(r.salesperson).includes(rep)) return false;
    if (cust && !matchesLabel(cust, { id: r.customer_id, name: r.customer_name })) return false;
    if (entered && !norm(r.entered_by).includes(entered)) return false;
    if (industry && !norm(r.industry).includes(industry)) return false;
    if (origination && !norm(r.origination).includes(origination)) return false;
    if (ctype && !norm(r.customer_type).includes(ctype)) return false;
    return true;
  });
  return { from, to, rows, filtered };
};

// Group row (cents) → report row (dollars); cent extras preserved.
const groupRowToDollars = (g: any, labelKey: string, outLabel?: string) => ({
  [labelKey]: outLabel ?? g.label,
  estimate_count: g.estimate_count,
  sent_count: g.sent_count,
  converted_count: g.converted_count,
  conversion_rate: g.conversion_rate,
  avg_days_to_convert: g.avg_days_to_convert,
  total: fromCents(g.total_cents),
  converted_total: fromCents(g.converted_cents),
  sent_total: fromCents(g.sent_cents),
  total_cents: g.total_cents,
  converted_cents: g.converted_cents,
  sent_cents: g.sent_cents,
  customer_ids: g.customer_ids instanceof Set ? [...g.customer_ids] : [],
});

const rollupTotals = (rows: any[], labelKey: string) => {
  const sum = (k: string) => Math.round(rows.reduce((s, r) => s + num(r[k]), 0) * 100) / 100;
  const sent = rows.reduce((s, r) => s + num(r.sent_count), 0);
  const conv = rows.reduce((s, r) => s + num(r.converted_count), 0);
  // Weighted avg days-to-convert across rows (never an avg of avgs).
  let dsum = 0;
  let dn = 0;
  for (const r of rows) {
    if (Number.isFinite(r?.avg_days_to_convert) && num(r?.converted_count) > 0) {
      // rows carry the group-level mean; weight by the group's dated count.
      const n = num(r?._conv_days_n, num(r.converted_count));
      dsum += num(r.avg_days_to_convert) * n;
      dn += n;
    }
  }
  return {
    totals: {
      [labelKey]: 'Total',
      estimate_count: rows.reduce((s, r) => s + num(r.estimate_count), 0),
      sent_count: sent,
      converted_count: conv,
      conversion_rate: sent > 0 ? conv / sent : 0,
      avg_days_to_convert: dn > 0 ? Math.round((dsum / dn) * 10) / 10 : null,
      total: sum('total'),
      converted_total: sum('converted_total'),
      sent_total: sum('sent_total'),
    },
  };
};

const ROLLUP_COLUMNS = (labelKey: string, label: string) => [
  textCol(labelKey, label),
  intCol('estimate_count', 'Estimates'),
  intCol('sent_count', 'Sent'),
  intCol('converted_count', 'Converted'),
  pctCol('conversion_rate', 'Conv. Rate'),
  num1Col('avg_days_to_convert', 'Avg Days to Convert'),
  moneyCol('total', 'Estimate Total'),
  moneyCol('converted_total', 'Converted Total'),
];

// Shared runner for the six by-X rollups — same semantics, different key.
const rollupRun = (params: any, data: any, keyFn: (r: any) => string, labelFn: (r: any) => string, labelKey: string) => {
  const { from, to, filtered } = rowsContext(params, data);
  const { groups } = rollupEstimateRows(filtered, { from, to, key: keyFn, label: labelFn });
  return { rows: groups.map((g) => groupRowToDollars(g, labelKey)) };
};

const ESTIMATE_REPORT_DESCRIPTIONS: Record<string, string> = {
  estimates_current:
    'Open/pending estimate pipeline at an as-of date — every draft/calculated/sent estimate with its age and freshness bucket.',
  estimate_activity:
    'Status-change activity in a period — event counts by type (created/sent/approved/converted/revised/reopened/declined/lost/cancelled/archived) from status_history, EstimateRevision rows, then date stamps.',
  conversions_by_salesperson:
    'Conversion performance per salesperson — estimates converted ÷ estimates sent in the window, conversion rate, converted value, and average days-to-convert.',
  estimates_by_customer:
    'Estimates written in the period grouped by customer — counts, send/convert totals, conversion rate, and pipeline value.',
  estimates_by_salesperson:
    'Estimates written in the period grouped by salesperson — counts, send/convert totals, conversion rate, and pipeline value.',
  estimates_by_entered_by:
    "Estimates written in the period grouped by the 'Entered By' staff member — counts, send/convert totals, conversion rate, and pipeline value.",
  estimates_by_industry:
    'Estimates written in the period grouped by the linked customer industry (Customer.industry_type).',
  estimates_by_origination:
    "Estimates written in the period grouped by the linked customer's origination (origination_path → customer_origination).",
  estimates_by_customer_type:
    'Estimates written in the period grouped by the linked customer type (Customer.customer_type).',
};

export const ESTIMATE_REPORTS = [
  {
    id: 'estimates_current',
    name: 'Current Estimates',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_current,
    params: [AS_OF_PARAM, SALESPERSON_PARAM, CUSTOMER_PARAM, STATUSES_PARAM],
    columns: [
      textCol('estimate_number', 'Estimate #'),
      textCol('project_name', 'Project'),
      textCol('customer_name', 'Customer'),
      textCol('salesperson', 'Salesperson'),
      textCol('status', 'Status'),
      dateCol('created_date', 'Created'),
      dateCol('sent_date', 'Sent'),
      intCol('age_days', 'Age (Days)'),
      textCol('age_bucket', 'Age Bucket'),
      moneyCol('total', 'Total'),
    ],
    run: (params: any, data: any) => {
      const asOf = asOfDay(params?.as_of);
      const { filtered } = rowsContext(params, data, asOf);
      const wanted = new Set(
        (Array.isArray(params?.statuses) ? params.statuses : []).map(norm).filter(Boolean)
      );
      // Default (no explicit pick) = open pipeline AND undecided — a
      // converted estimate still wearing a stale 'sent' status is decided,
      // not pending. An explicit statuses pick is a raw status match so a
      // user CAN list converted-but-sent rows on purpose.
      const keep = (r: any) =>
        wanted.size
          ? wanted.has(norm(r.status))
          : OPEN_SET.has(norm(r.status)) && r.converted !== true;
      const rows = filtered
        .filter(keep)
        .sort(
          (a, b) =>
            b.age_days - a.age_days ||
            b.total_cents - a.total_cents ||
            a.estimate_number.localeCompare(b.estimate_number)
        )
        .map((r) => ({
          estimate_id: r.estimate_id,
          estimate_number: r.estimate_number,
          project_name: r.project_name,
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          salesperson: r.salesperson,
          entered_by: r.entered_by,
          status: r.status,
          created_date: r.created_day,
          sent_date: r.sent_day,
          age_days: r.age_days,
          age_bucket: r.age_bucket,
          total: fromCents(r.total_cents),
          total_cents: r.total_cents,
        }));
      return { rows };
    },
    summarize: (rows: any[]) => ({
      totals: {
        estimate_number: `${rows.length} estimate${rows.length === 1 ? '' : 's'}`,
        age_days: rows.reduce((m, r) => Math.max(m, num(r.age_days)), 0),
        total: Math.round(rows.reduce((s, r) => s + num(r.total), 0) * 100) / 100,
      },
    }),
  },
  {
    id: 'estimate_activity',
    name: 'Estimate Activity',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimate_activity,
    params: [DATE_RANGE_PARAM, SALESPERSON_PARAM, EVENTS_PARAM],
    columns: [
      textCol('event_label', 'Event'),
      intCol('estimate_count', 'Estimates'),
      intCol('event_count', 'Events'),
    ],
    run: (params: any, data: any) => {
      const { from, to, filtered } = rowsContext(params, data);
      const wanted = new Set(
        (Array.isArray(params?.events) ? params.events : []).map(norm).filter(Boolean)
      );
      const rows = activityRows(filtered, { from, to }).filter(
        (r) => !wanted.size || wanted.has(norm(r.event_type))
      );
      return { rows };
    },
    summarize: (rows: any[]) => ({
      totals: {
        event_label: 'Total',
        estimate_count: rows.reduce((s, r) => s + num(r.estimate_count), 0),
        event_count: rows.reduce((s, r) => s + num(r.event_count), 0),
      },
    }),
  },
  {
    id: 'conversions_by_salesperson',
    name: 'Estimate Conversions by Salesperson',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.conversions_by_salesperson,
    params: [DATE_RANGE_PARAM, SALESPERSON_PARAM],
    columns: [
      textCol('salesperson', 'Salesperson'),
      intCol('sent_count', 'Sent'),
      intCol('converted_count', 'Converted'),
      pctCol('conversion_rate', 'Conv. Rate'),
      num1Col('avg_days_to_convert', 'Avg Days to Convert'),
      moneyCol('sent_total', 'Sent Total'),
      moneyCol('converted_total', 'Converted Total'),
    ],
    run: (params: any, data: any) => {
      const { from, to, filtered } = rowsContext(params, data);
      const rows = conversionSalespersonRows(filtered, { from, to }).map((g) => ({
        salesperson: g.salesperson,
        sent_count: g.sent_count,
        converted_count: g.converted_count,
        conversion_rate: g.conversion_rate,
        avg_days_to_convert: g.avg_days_to_convert,
        sent_total: fromCents(g.sent_cents),
        converted_total: fromCents(g.converted_cents),
        sent_cents: g.sent_cents,
        converted_cents: g.converted_cents,
        estimate_count: g.estimate_count,
        _conv_days_sum: g._conv_days_sum,
        _conv_days_n: g._conv_days_n,
      }));
      return { rows };
    },
    summarize: (rows: any[]) => {
      const sent = rows.reduce((s, r) => s + num(r.sent_count), 0);
      const conv = rows.reduce((s, r) => s + num(r.converted_count), 0);
      const dsum = rows.reduce((s, r) => s + num(r._conv_days_sum), 0);
      const dn = rows.reduce((s, r) => s + num(r._conv_days_n), 0);
      return {
        totals: {
          salesperson: 'Total',
          sent_count: sent,
          converted_count: conv,
          conversion_rate: sent > 0 ? conv / sent : 0,
          avg_days_to_convert: dn > 0 ? Math.round((dsum / dn) * 10) / 10 : null,
          sent_total: Math.round(rows.reduce((s, r) => s + num(r.sent_total), 0) * 100) / 100,
          converted_total: Math.round(rows.reduce((s, r) => s + num(r.converted_total), 0) * 100) / 100,
        },
      };
    },
  },
  {
    id: 'estimates_by_customer',
    name: 'Estimates by Customer',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_customer,
    params: [DATE_RANGE_PARAM, CUSTOMER_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('customer_name', 'Customer'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.customer_id || r.customer_name, (r) => r.customer_name, 'customer_name'),
    summarize: (rows: any[]) => rollupTotals(rows, 'customer_name'),
  },
  {
    id: 'estimates_by_salesperson',
    name: 'Estimates by Salesperson',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_salesperson,
    params: [DATE_RANGE_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('salesperson', 'Salesperson'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.salesperson, (r) => r.salesperson, 'salesperson'),
    summarize: (rows: any[]) => rollupTotals(rows, 'salesperson'),
  },
  {
    id: 'estimates_by_entered_by',
    name: 'Estimates by Entered By',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_entered_by,
    params: [DATE_RANGE_PARAM, ENTERED_BY_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('entered_by', 'Entered By'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.entered_by, (r) => r.entered_by, 'entered_by'),
    summarize: (rows: any[]) => rollupTotals(rows, 'entered_by'),
  },
  {
    id: 'estimates_by_industry',
    name: 'Estimates by Industry',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_industry,
    params: [DATE_RANGE_PARAM, INDUSTRY_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('industry', 'Industry'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.industry, (r) => r.industry, 'industry'),
    summarize: (rows: any[]) => rollupTotals(rows, 'industry'),
  },
  {
    id: 'estimates_by_origination',
    name: 'Estimates by Origination',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_origination,
    params: [DATE_RANGE_PARAM, ORIGINATION_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('origination', 'Origination'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.origination, (r) => r.origination, 'origination'),
    summarize: (rows: any[]) => rollupTotals(rows, 'origination'),
  },
  {
    id: 'estimates_by_customer_type',
    name: 'Estimates by Customer Type',
    category: 'estimates',
    description: ESTIMATE_REPORT_DESCRIPTIONS.estimates_by_customer_type,
    params: [DATE_RANGE_PARAM, CUSTOMER_TYPE_PARAM, SALESPERSON_PARAM],
    columns: ROLLUP_COLUMNS('customer_type', 'Customer Type'),
    run: (params: any, data: any) =>
      rollupRun(params, data, (r) => r.customer_type, (r) => r.customer_type, 'customer_type'),
    summarize: (rows: any[]) => rollupTotals(rows, 'customer_type'),
  },
];

export const ESTIMATE_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  ESTIMATE_REPORTS.map((spec) => [spec.id, spec])
);
