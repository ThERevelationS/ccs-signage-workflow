// Production report suite — ESTIMATOR_MASTERPLAN WS-J / item J-06.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Eight report specs for the J-01 report catalog engine
// (src/components/reports/reportEngine.js — w-49):
//
//   wip_by_product_status    — open products grouped by operational_status
//                              (count + quoted value per status)
//   wip_by_order_status      — open work orders grouped by current_stage
//   wip_by_salesperson       — open products rolled up by order salesperson
//   wip_by_responsibility    — open products grouped by product.responsibility
//                              w/ CB 1–99 priority columns
//   wip_by_built_date        — built-phase products grouped by built day
//   addresses_by_disposition — install/site addresses grouped by fulfillment
//                              disposition (pickup/install/ship/deliver)
//   built_report             — products that reached `built` inside a period
//   part_amount_needed       — part quantity demand across open products
//                              (products[] embedded parts/line_items; qty ×
//                              open count, w/ dims + vendor — purchasing)
//
// PRODUCTION_REPORTS holds RAW spec objects in defineReport() shape
// ({id,name,category,params,columns,run,summarize}) — this module cannot
// import defineReport (zero-import rule), so the catalog wiring passes each
// spec through defineReport() itself. run(resolvedParams, data) reads
// data.work_orders (+ optional data.responsibilities registry for ordering)
// only — the engine owns data injection.
//
// ── Semantics replicated from sibling models (zero-import → inline copies) ──
//
// WIP membership (productStatusModel — B-01/B-02, replicated verbatim):
//   WIP_STATUSES = order_review · site_survey · awaiting_customer_action ·
//     awaiting_proof_approval · proof_changes_requested · permitting ·
//     proof_approved · in_production · install_removal_only ·
//     quality_control · design_review · service_repair
//   TERMINAL_STATUSES = built · completed · voided — excluded from WIP.
//   Normalization: trim/lowercase, spaces & hyphens fold to underscores.
//   Legacy aliases still present on stored rows fold to their canonical
//   successor BEFORE membership checks (the model's integration-pass map):
//     in_design              → design_review   (WIP)
//     install_or_removal_only → install_removal_only (WIP)
//     vended                 → built           (terminal — same slot the
//                            legacy "vended" held in PRODUCT_TO_STAGE)
//   Products with a blank/unrecognized status on an open order are
//   UNCLASSIFIED-open: not WIP, not terminal. They never silently drop off
//   the WIP reports — they group under '(no status)' so the shop still sees
//   the work. Strict isWipStatus() stays available for exact-membership
//   callers.
//
// Order openness (productQueueModel.flattenQueueRows): a work order
// contributes nothing when deleted === true or completed === true — a
// finished/deleted job is not WIP regardless of what its products say.
//
// Product value (opsReportModel.productValue): quoted_total is authoritative
// at conversion; quoted_unit_price × quantity is the fallback for products
// priced before totals were stamped. Money is integer CENTS at the model
// layer (toCents → int sums, statementBatch/arAging convention) and converts
// to dollars once at the report boundary — engine 'money' columns expect
// dollar values; *_cents extras stay on rows for drilldowns.
//
// Salesperson (flattenQueueRows): wo.sales_rep → wo.salesperson →
//   wo.salesperson_email → '(unassigned)'.
//
// Priority (C-02/B-05): the CB 1–99 `priority` field wins when set;
//   legacy `queue_priority` is the fallback. Positive ints only — 0/blank
//   means unset. "Best" priority = smallest set value (1 is most urgent).
//
// Built day (opsReportModel.productCompletedAt precedent — products carry
//   no dedicated built_at field, so status_history is the evidence):
//   1. latest status_history entry {field:'operational_status', to:'built'}
//      (legacy 'vended' folds to built) → its `at` day;
//   2. else, when the product currently IS built →
//      operational_status_changed_at;
//   3. else, earliest status_history entry {field:'fulfillment_state',
//      to: awaiting_*|terminal} — a product must be built to enter
//      fulfillment;
//   4. else '' (undated — never fabricated).
//
// Built-phase membership (wip_by_built_date): product is physically still
//   in the shop past production — canonical status 'built' OR
//   fulfillment_state awaiting_* — AND NOT fulfillment-terminal
//   (picked_up/installed/shipped/delivered) and NOT ops completed/voided.
//
// Disposition (E-08 fulfillmentModel.resolveFulfillmentMethod +
//   queueBucketFor): product.fulfillment_method → method implied by
//   product.fulfillment_state → workOrder.fulfillment_method → ''.
//   Same alias table as the model (pick_up/will_call→pickup, install→
//   installation, ship/shipment→shipping, deliver→delivery).
//
// Site address (packingSlipTemplate.buildShipTo site chain): install_location
//   → address_line_2 → city (city|township_city) → state (state|county) →
//   zip (zip|postal_code|zip_code); billing_address as last resort.
//
// Part demand (J-06 + productsToPartsModel D-10 precedence): a product's
//   embedded part list is the first non-empty of
//   parts|part_list|builder_parts|line_items|materials|components, then the
//   builder_snapshot.* sub-lists; inactive/deleted rows drop. When the
//   product carries no embedded list, the WO-level materials[] manifest rows
//   linked by builder_product_id / estimate_line_id / product id answer
//   (estimateConversionService flattened the same BOM at conversion).
//   Demand = part.quantity × product.quantity summed across open products.
//
// Days are 'YYYY-MM-DD' UTC-day strings ('YYYY-MM-DD' prefix wins so ISO
//   timestamps never shift days — statementBatch/toDay convention).
//   Engine-resolved date_range bounds are LOCAL Date objects; localDay()
//   extracts their local calendar day.
//
// API:
//   WIP_STATUSES / TERMINAL_STATUSES / OPERATIONAL_STATUS_LABELS /
//   WORK_ORDER_STAGES / WORK_ORDER_STAGE_LABELS / FULFILLMENT_METHODS /
//   DISPOSITION_LABELS / LEGACY_STATUS_ALIASES / NO_STATUS_KEY
//   canonicalStatus / isWipStatus / isTerminalStatus / isOpenProduct /
//   isBuiltPhaseProduct
//   productValueCents / workOrderValueCents / productPriority /
//   salespersonFor / orderRefFor / builtDay / dispositionFor /
//   siteAddressLines / productPartRows
//   wipProductRows / wipByStatusRows / wipByStageRows /
//   wipBySalespersonRows / wipByResponsibilityRows / wipByBuiltDateRows /
//   addressRows / builtRows / partNeededRows
//   PRODUCTION_REPORTS / PRODUCTION_REPORTS_BY_ID   — 8 engine-ready specs

const DAY_MS = 86400000;

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const normStatus = (v: any): string => clean(v).toLowerCase().replace(/[\s-]+/g, '_');
const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const pad2 = (n: number): string => String(n).padStart(2, '0');
const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Dollar-ish field → integer cents (strips currency decoration so imported
// rows parse too — statementBatchModel.toCents). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (c: any): number => Math.round(num(c)) / 100;
// Quantity display precision — part quantities can be fractional (sqft,
// sheets); 3 decimals is the opsReportModel.qty convention.
const qtyRound = (n: any): number => Math.round(num(n) * 1000) / 1000;

// Normalize any date-ish value to 'YYYY-MM-DD' (UTC day — DST-immune).
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

// LOCAL calendar day of a Date — engine-resolved date_range bounds are local
// startOfDay/endOfDay Dates, so their intended day is the local one.
const localDay = (d: any): string => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Whole days from → to on 'YYYY-MM-DD' strings (UTC). null when unparseable.
const daysBetween = (fromDay: string, toDayStr: string): number | null => {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDayStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY_MS);
};

// Resolved date_range param → {from,to} 'YYYY-MM-DD' bounds (either may be
// ''). Engine-resolved values arrive as {preset, from:Date, to:Date}; raw
// 'YYYY-MM-DD' strings / {from,to} shapes are tolerated for direct callers.
// A bare preset string that reaches run() unresolved is treated as unbounded
// — param resolution is the engine's job.
const rangeBounds = (p: any): { from: string; to: string } => {
  if (isObj(p)) {
    const from = localDay(p.from) || toDay(p.from);
    const to = localDay(p.to) || toDay(p.to);
    return { from, to };
  }
  const d = toDay(p);
  return d ? { from: d, to: d } : { from: '', to: '' };
};

// Day ∈ [from,to]; unbounded keeps everything (undated included), any bound
// drops undated rows (engine filterByDateRange convention).
const dayInRange = (day: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

const asOfDay = (v: any): string => toDay(v) || new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Status vocabulary — replicated from base44/shared/productStatusModel.ts
// ---------------------------------------------------------------------------

export const WIP_STATUSES = [
  'order_review',
  'site_survey',
  'awaiting_customer_action',
  'awaiting_proof_approval',
  'proof_changes_requested',
  'permitting',
  'proof_approved',
  'in_production',
  'install_removal_only',
  'quality_control',
  'design_review',
  'service_repair',
] as const;

export const TERMINAL_STATUSES = ['built', 'completed', 'voided'] as const;

// Full locked set in declaration order (WIP block then terminal wrappers) —
// drives canonical sort order on the by-status report.
export const OPERATIONAL_STATUS_SET = [...WIP_STATUSES, ...TERMINAL_STATUSES] as const;

export const OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  order_review: 'Order Review',
  site_survey: 'Site Survey',
  awaiting_customer_action: 'Awaiting Customer Action',
  awaiting_proof_approval: 'Awaiting Proof Approval',
  proof_changes_requested: 'Proof Changes Requested',
  permitting: 'Permitting',
  proof_approved: 'Proof Approved',
  design_review: 'Design Review',
  in_production: 'In Production',
  install_removal_only: 'Install/Removal Only',
  quality_control: 'Quality Control',
  service_repair: 'Service/Repair',
  built: 'Built',
  completed: 'Completed',
  voided: 'Voided',
};

// Retired stored values → canonical successor (productStatusModel migration
// note: consumers map legacy values onto the locked set). 'vended' held the
// built slot in the legacy model → terminal here.
export const LEGACY_STATUS_ALIASES: Record<string, string> = {
  in_design: 'design_review',
  install_or_removal_only: 'install_removal_only',
  vended: 'built',
};

const WIP_SET = new Set<string>(WIP_STATUSES);
const TERMINAL_SET = new Set<string>(TERMINAL_STATUSES);

// Group key for products whose status is blank or outside the locked+legacy
// set — '(no status)' renders last on the by-status report.
export const NO_STATUS_KEY = 'no_status';
const NO_STATUS_LABEL = '(no status)';

// Normalized + legacy-folded canonical status; '' when nothing resolves.
export function canonicalStatus(s: any): string {
  const v = normStatus(s);
  if (!v) return '';
  return LEGACY_STATUS_ALIASES[v] ?? v;
}

export function isWipStatus(s: any): boolean {
  return WIP_SET.has(canonicalStatus(s));
}

export function isTerminalStatus(s: any): boolean {
  return TERMINAL_SET.has(canonicalStatus(s));
}

const statusLabelFor = (key: string): string =>
  key === NO_STATUS_KEY ? NO_STATUS_LABEL : OPERATIONAL_STATUS_LABELS[key] ||
  clean(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// WorkOrder.current_stage vocabulary (WorkOrder.jsonc enum — same eight
// values productStatusModel.WORK_ORDER_STAGE_SET declares).
export const WORK_ORDER_STAGES = [
  'estimating',
  'sales',
  'permitting',
  'design',
  'production',
  'fabrication',
  'installation',
  'completed',
] as const;

export const WORK_ORDER_STAGE_LABELS: Record<string, string> = {
  estimating: 'Estimating',
  sales: 'Sales',
  permitting: 'Permitting',
  design: 'Design',
  production: 'Production',
  fabrication: 'Fabrication',
  installation: 'Installation',
  completed: 'Completed',
};

// ---------------------------------------------------------------------------
// Fulfillment / disposition vocabulary — replicated from fulfillmentModel.ts
// ---------------------------------------------------------------------------

export const FULFILLMENT_METHODS = ['pickup', 'installation', 'shipping', 'delivery'] as const;

export const DISPOSITION_LABELS: Record<string, string> = {
  pickup: 'Pickup',
  installation: 'Installation',
  shipping: 'Shipping',
  delivery: 'Delivery',
};

export const FULFILLMENT_AWAITING = [
  'awaiting_pickup',
  'awaiting_installation',
  'awaiting_shipping',
  'awaiting_delivery',
] as const;

export const FULFILLMENT_TERMINAL = ['picked_up', 'installed', 'shipped', 'delivered'] as const;

export const FULFILLMENT_STATE_LABELS: Record<string, string> = {
  none: 'Not Fulfilled',
  awaiting_pickup: 'Awaiting Pickup',
  awaiting_installation: 'Awaiting Installation',
  awaiting_shipping: 'Awaiting Shipping',
  awaiting_delivery: 'Awaiting Delivery',
  picked_up: 'Picked Up',
  installed: 'Installed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const METHOD_ALIASES: Record<string, string> = {
  pickup: 'pickup',
  pick_up: 'pickup',
  customer_pickup: 'pickup',
  will_call: 'pickup',
  willcall: 'pickup',
  install: 'installation',
  installation: 'installation',
  ship: 'shipping',
  shipping: 'shipping',
  shipment: 'shipping',
  deliver: 'delivery',
  delivery: 'delivery',
};

const STATE_METHOD: Record<string, string> = {
  awaiting_pickup: 'pickup',
  awaiting_installation: 'installation',
  awaiting_shipping: 'shipping',
  awaiting_delivery: 'delivery',
  picked_up: 'pickup',
  installed: 'installation',
  shipped: 'shipping',
  delivered: 'delivery',
};

const methodFrom = (v: any): string => METHOD_ALIASES[normStatus(v)] ?? '';
const isAwaitingFulfillment = (v: any): boolean =>
  (FULFILLMENT_AWAITING as readonly string[]).includes(normStatus(v));
const isTerminalFulfillment = (v: any): boolean =>
  (FULFILLMENT_TERMINAL as readonly string[]).includes(normStatus(v));

// ---------------------------------------------------------------------------
// Row-level derivations
// ---------------------------------------------------------------------------

// Open product = status not terminal (completed/voided/built are out of WIP;
// 'built' is terminal-wrapper — fulfillment takes over). Blank/unknown →
// still open (unclassified).
export function isOpenProduct(product: any): boolean {
  if (!isObj(product)) return false;
  return !isTerminalStatus(product.operational_status);
}

// Open order = not deleted, not completed (flattenQueueRows membership).
const isOpenOrder = (wo: any): boolean =>
  isObj(wo) && wo.deleted !== true && wo.completed !== true;

// Built-phase product: produced but not yet out the door — canonical 'built'
// status or a fulfillment awaiting state; never fulfillment-terminal or ops
// completed/voided.
export function isBuiltPhaseProduct(product: any): boolean {
  if (!isObj(product)) return false;
  const st = canonicalStatus(product.operational_status);
  if (st === 'completed' || st === 'voided') return false;
  if (isTerminalFulfillment(product.fulfillment_state)) return false;
  return st === 'built' || isAwaitingFulfillment(product.fulfillment_state);
}

// Product value in cents — quoted_total authoritative, unit × qty fallback
// (opsReportModel.productValue).
export function productValueCents(product: any): number {
  if (!isObj(product)) return 0;
  const total = toCents(product.quoted_total);
  if (total) return total;
  const unit = toCents(product.quoted_unit_price);
  const q = num(product.quantity, 1) || 1;
  return Math.round(unit * q);
}

// Order value = Σ product values; estimate_amount is the fallback for orders
// whose products carry no pricing (opsReportModel.workOrderValue).
export function workOrderValueCents(wo: any): number {
  const products = (Array.isArray(wo?.products) ? wo.products : []).filter(isObj);
  if (products.length) return products.reduce((s, p) => s + productValueCents(p), 0);
  return toCents(wo?.estimate_amount);
}

// CB 1–99 line priority: positive `priority` wins; legacy `queue_priority`
// is the fallback; 0 when unset (queuePosNum convention).
export function productPriority(product: any): number {
  const p = num(product?.priority);
  if (p > 0) return Math.round(p);
  const q = num(product?.queue_priority);
  return q > 0 ? Math.round(q) : 0;
}

// Order salesperson — flattenQueueRows chain.
export function salespersonFor(wo: any): string {
  return firstText(wo?.sales_rep, wo?.salesperson, wo?.salesperson_email);
}

// Order display ref — flattenQueueRows `ref` chain.
export function orderRefFor(wo: any): string {
  return firstText(wo?.corbridge_invoice_number, wo?.title, wo?.id);
}

// Best-available day the product reached `built` — see header for the
// four-step evidence chain. '' when no built evidence exists.
export function builtDay(product: any, wo?: any): string {
  if (!isObj(product)) return '';
  const history = Array.isArray(product.status_history) ? product.status_history : [];
  // 1. newest explicit operational_status → built stamp.
  let builtAt = '';
  for (const h of history) {
    if (!isObj(h)) continue;
    if (normStatus(h.field) !== 'operational_status') continue;
    if (canonicalStatus(h.to) !== 'built') continue;
    const at = clean(h.at);
    if (at > builtAt) builtAt = at;
  }
  let day = toDay(builtAt);
  if (day) return day;
  // 2. product currently IS built → its changed-at stamp.
  if (canonicalStatus(product.operational_status) === 'built') {
    day = toDay(product.operational_status_changed_at);
    if (day) return day;
  }
  // 3. earliest fulfillment stamp — entering fulfillment implies built.
  let firstFulfill = '';
  for (const h of history) {
    if (!isObj(h)) continue;
    if (normStatus(h.field) !== 'fulfillment_state') continue;
    const to = normStatus(h.to);
    if (!isAwaitingFulfillment(to) && !isTerminalFulfillment(to)) continue;
    const at = clean(h.at);
    if (at && (!firstFulfill || at < firstFulfill)) firstFulfill = at;
  }
  day = toDay(firstFulfill);
  if (day) return day;
  // 4. current fulfillment already past none → the status change that
  //    carried it there is the only remaining proxy.
  if (normStatus(product.fulfillment_state) && normStatus(product.fulfillment_state) !== 'none') {
    return toDay(product.operational_status_changed_at);
  }
  return '';
}

// Product disposition (E-08 precedence): explicit product method → method
// implied by fulfillment_state → order-level method. '' when unresolved.
export function dispositionFor(wo: any, product?: any): string {
  const explicit = methodFrom(product?.fulfillment_method);
  if (explicit) return explicit;
  const fromState = STATE_METHOD[normStatus(product?.fulfillment_state)] ?? '';
  if (fromState) return fromState;
  return methodFrom(wo?.fulfillment_method);
}

// Site address lines (packingSlipTemplate site chain → billing fallback).
export function siteAddressLines(wo: any): string[] {
  const lines = (v: any): string[] => {
    if (Array.isArray(v)) return v.map(clean).filter(Boolean);
    const s = clean(v);
    return s ? [s] : [];
  };
  const cityState = [firstText(wo?.city, wo?.township_city), firstText(wo?.state, wo?.county)]
    .filter(Boolean)
    .join(', ');
  const site = [
    ...lines(wo?.install_location),
    ...lines(wo?.address_line_2),
    ...lines([cityState, firstText(wo?.zip, wo?.postal_code, wo?.zip_code)].filter(Boolean).join(' ')),
  ];
  const billing = [...lines(wo?.billing_address), ...lines(wo?.billing_address_line_2)];
  return site.length ? site : billing;
}

export const siteAddressText = (wo: any): string => siteAddressLines(wo).join(', ');

// ---------------------------------------------------------------------------
// Flattened WIP rows — one per contributing product on an open order
// ---------------------------------------------------------------------------

export type WipProductRow = {
  work_order_id: string;
  order_ref: string;
  company: string;
  customer_id: string;
  salesperson: string;
  stage: string;
  product: any;
  product_id: string;
  product_name: string;
  status: string;        // canonical status or NO_STATUS_KEY
  substatus: string;
  responsibility: string;
  priority: number;      // 0 = unset
  quantity: number;
  value_cents: number;
  product_due: string;
  design_due: string;
  hard_due: boolean;
  fulfillment_state: string;
  disposition: string;
  built_day: string;
};

// Flatten open work orders into one row per OPEN product. Membership mirrors
// flattenQueueRows (deleted/completed orders out) + the WIP-suite terminal
// rule (completed/voided/built products out — 'built' lives on the
// built-date report). opts.includeTerminal=true returns every product for
// callers that need the built/completed population (builtRows uses it).
export function wipProductRows(workOrders: any[] = [], opts: any = {}): WipProductRow[] {
  const includeTerminal = opts?.includeTerminal === true;
  const includeBuiltPhase = opts?.includeBuiltPhase === true;
  const out: WipProductRow[] = [];
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isOpenOrder(wo)) continue;
    const rep = salespersonFor(wo);
    const ref = orderRefFor(wo);
    const company = clean(wo.client_name) || clean(wo.customer_name);
    const products = Array.isArray(wo.products) ? wo.products : [];
    products.forEach((p, idx) => {
      if (!isObj(p)) return;
      const canon = canonicalStatus(p.operational_status);
      const terminal = TERMINAL_SET.has(canon);
      if (!includeTerminal && terminal) return;
      // Terminal fulfillment = already out the door; excluded from WIP and
      // built-phase alike even when ops status lags behind.
      if (!includeTerminal && isTerminalFulfillment(p.fulfillment_state)) return;
      // For the strict-WIP callers opts.strictWip narrows to WIP_SET.
      if (opts?.strictWip === true && !WIP_SET.has(canon)) return;
      const status = canon || NO_STATUS_KEY;
      out.push({
        work_order_id: clean(wo.id),
        order_ref: ref,
        company,
        customer_id: clean(wo.customer_id),
        salesperson: rep,
        stage: normStatus(wo.current_stage) || '',
        product: p,
        product_id: clean(p.id) || `${clean(wo.id)}-${idx}`,
        product_name:
          firstText(p.description, p.client_product_name, p.customer_description, p.product_type) ||
          `Product ${idx + 1}`,
        status,
        substatus: clean(p.operational_substatus),
        responsibility: clean(p.responsibility),
        priority: productPriority(p),
        quantity: num(p.quantity, 1) || 1,
        value_cents: productValueCents(p),
        product_due: clean(p.product_due_date),
        design_due: clean(p.design_due_date),
        hard_due: p.hard_due_date === true,
        fulfillment_state: normStatus(p.fulfillment_state) || 'none',
        disposition: dispositionFor(wo, p),
        built_day: builtDay(p, wo),
      });
    });
  }
  // Deterministic order: canonical status rank → priority asc (unset last,
  // CB 1–99) → earliest product due → order ref → product id.
  const rank = (s: string) => {
    const i = (OPERATIONAL_STATUS_SET as readonly string[]).indexOf(s);
    return i === -1 ? OPERATIONAL_STATUS_SET.length : i;
  };
  out.sort((a, b) =>
    rank(a.status) - rank(b.status) ||
    ((a.priority > 0) !== (b.priority > 0) ? (a.priority > 0 ? -1 : 1) : a.priority - b.priority) ||
    (a.product_due || '9999').localeCompare(b.product_due || '9999') ||
    a.order_ref.localeCompare(b.order_ref) ||
    a.product_id.localeCompare(b.product_id)
  );
  return out;
}

const matchesStatusPick = (rowStatus: string, wanted: Set<string>): boolean =>
  !wanted.size || wanted.has(rowStatus);

const wantedSet = (param: any): Set<string> =>
  new Set((Array.isArray(param) ? param : []).map((v) => normStatus(v) || norm(v)).filter(Boolean));

// ---------------------------------------------------------------------------
// Group builders (model rows → report rows, money stays in cents)
// ---------------------------------------------------------------------------

// One row per operational-status group, canonical WIP order first.
export function wipByStatusRows(rows: WipProductRow[] = []) {
  const groups = new Map<string, any>();
  for (const r of rows) {
    const key = r.status || NO_STATUS_KEY;
    let g = groups.get(key);
    if (!g) {
      g = { key, count: 0, value_cents: 0, orders: new Set<string>(), products: [] };
      groups.set(key, g);
    }
    g.count += 1;
    g.value_cents += r.value_cents;
    if (r.work_order_id) g.orders.add(r.work_order_id);
    g.products.push(r.product_id);
  }
  const rank = (s: string) => {
    const i = (OPERATIONAL_STATUS_SET as readonly string[]).indexOf(s);
    return i === -1 ? OPERATIONAL_STATUS_SET.length : i;
  };
  return [...groups.values()]
    .sort((a, b) => rank(a.key) - rank(b.key) || b.count - a.count || a.key.localeCompare(b.key))
    .map((g) => ({
      status: g.key,
      status_label: statusLabelFor(g.key),
      product_count: g.count,
      order_count: g.orders.size,
      value_cents: g.value_cents,
      order_ids: [...g.orders],
      product_ids: g.products,
    }));
}

// One row per WO stage; orders counted once even when products span stages
// (they can't — stage is order-level).
export function wipByStageRows(workOrders: any[] = []) {
  const groups = new Map<string, any>();
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isOpenOrder(wo)) continue;
    const key = normStatus(wo.current_stage) || 'none';
    let g = groups.get(key);
    if (!g) {
      g = { key, orders: 0, open_products: 0, product_count: 0, value_cents: 0 };
      groups.set(key, g);
    }
    g.orders += 1;
    const products = (Array.isArray(wo.products) ? wo.products : []).filter(isObj);
    g.product_count += products.length;
    g.open_products += products.filter(isOpenProduct).length;
    g.value_cents += workOrderValueCents(wo);
  }
  const rank = (s: string) => {
    const i = (WORK_ORDER_STAGES as readonly string[]).indexOf(s);
    return i === -1 ? WORK_ORDER_STAGES.length : i;
  };
  return [...groups.values()]
    .sort((a, b) => rank(a.key) - rank(b.key) || b.orders - a.orders || a.key.localeCompare(b.key))
    .map((g) => ({
      stage: g.key,
      stage_label: WORK_ORDER_STAGE_LABELS[g.key] || (g.key === 'none' ? '(no stage)' : g.key),
      order_count: g.orders,
      open_product_count: g.open_products,
      product_count: g.product_count,
      value_cents: g.value_cents,
    }));
}

export function wipBySalespersonRows(rows: WipProductRow[] = []) {
  const groups = new Map<string, any>();
  for (const r of rows) {
    const key = clean(r.salesperson) || '(unassigned)';
    let g = groups.get(key);
    if (!g) {
      g = { key, count: 0, value_cents: 0, orders: new Set<string>() };
      groups.set(key, g);
    }
    g.count += 1;
    g.value_cents += r.value_cents;
    if (r.work_order_id) g.orders.add(r.work_order_id);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.value_cents - a.value_cents ||
        b.count - a.count ||
        a.key.toLowerCase().localeCompare(b.key.toLowerCase())
    )
    .map((g) => ({
      salesperson: g.key,
      product_count: g.count,
      order_count: g.orders.size,
      value_cents: g.value_cents,
      order_ids: [...g.orders],
    }));
}

export const NO_RESPONSIBILITY_LABEL = '(no responsibility)';

// Responsibility groups ordered by registry.sort when the caller injects the
// Responsibility registry (data.responsibilities — tagResponsibilityModel
// responsibilityGroups ordering), else alphabetical; unassigned last.
export function wipByResponsibilityRows(rows: WipProductRow[] = [], registryRows: any[] = []) {
  const registryOrder = new Map<string, number>();
  (Array.isArray(registryRows) ? registryRows : [])
    .filter((r) => isObj(r) && norm(r.status ?? 'active') !== 'archived')
    .forEach((r, idx) => {
      const key = clean(r.name).toLowerCase();
      if (key && !registryOrder.has(key)) {
        const sort = num(r.sort);
        registryOrder.set(key, (Number.isFinite(sort) ? sort : 0) * 100000 + idx);
      }
    });
  const groups = new Map<string, any>();
  for (const r of rows) {
    const label = clean(r.responsibility);
    const key = label.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { key, label: label || NO_RESPONSIBILITY_LABEL, count: 0, value_cents: 0, orders: new Set<string>(), priorities: [] };
      groups.set(key, g);
    }
    g.count += 1;
    g.value_cents += r.value_cents;
    if (r.work_order_id) g.orders.add(r.work_order_id);
    if (r.priority > 0) g.priorities.push(r.priority);
  }
  const sortKey = (g: any) =>
    g.label === NO_RESPONSIBILITY_LABEL
      ? Number.MAX_SAFE_INTEGER
      : registryOrder.get(g.key) ?? 500000;
  return [...groups.values()]
    .sort(
      (a, b) =>
        sortKey(a) - sortKey(b) ||
        a.label.toLowerCase().localeCompare(b.label.toLowerCase()) ||
        a.key.localeCompare(b.key)
    )
    .map((g) => {
      const prs = g.priorities.slice().sort((a: number, b: number) => a - b);
      const best = prs.length ? prs[0] : null;
      const avg = prs.length ? Math.round((prs.reduce((s, p) => s + p, 0) / prs.length) * 10) / 10 : null;
      return {
        responsibility: g.label,
        product_count: g.count,
        order_count: g.orders.size,
        value_cents: g.value_cents,
        prioritized_count: prs.length,
        min_priority: best,
        avg_priority: avg,
        order_ids: [...g.orders],
      };
    });
}

// Built-phase rows grouped by built day (ascending). `asOf` anchors the
// days-waiting math.
export function wipByBuiltDateRows(workOrders: any[] = [], opts: any = {}) {
  const asOf = asOfDay(opts?.asOf);
  const rows = wipProductRows(workOrders, { includeTerminal: true })
    .filter((r) => isBuiltPhaseProduct(r.product));
  const { from, to } = rangeBounds(opts?.range);
  const groups = new Map<string, any>();
  const undated: any = { key: '', count: 0, value_cents: 0, orders: new Set<string>(), waits: [] };
  for (const r of rows) {
    const day = r.built_day;
    if (!dayInRange(day, from, to)) continue;
    const wait = day ? Math.max(0, daysBetween(day, asOf) ?? 0) : null;
    if (!day) {
      undated.count += 1;
      undated.value_cents += r.value_cents;
      if (r.work_order_id) undated.orders.add(r.work_order_id);
      continue;
    }
    let g = groups.get(day);
    if (!g) {
      g = { key: day, count: 0, value_cents: 0, orders: new Set<string>(), waits: [] };
      groups.set(day, g);
    }
    g.count += 1;
    g.value_cents += r.value_cents;
    if (r.work_order_id) g.orders.add(r.work_order_id);
    if (wait != null) g.waits.push(wait);
  }
  const shape = (g: any, key: string, label: string) => ({
    built_date: key,
    built_date_label: label,
    product_count: g.count,
    order_count: g.orders.size,
    value_cents: g.value_cents,
    avg_days_waiting: g.waits.length
      ? Math.round((g.waits.reduce((s: number, w: number) => s + w, 0) / g.waits.length) * 10) / 10
      : null,
    max_days_waiting: g.waits.length ? Math.max(...g.waits) : null,
    order_ids: [...g.orders],
  });
  const out = [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => shape(g, g.key, g.key));
  if (undated.count) out.push(shape(undated, '', '(undated)'));
  return out;
}

// One row per (order, disposition) over open orders that still have product
// to fulfill. Products needing fulfillment = not ops completed/voided and
// not fulfillment-terminal.
export function addressRows(workOrders: any[] = []) {
  const out: any[] = [];
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isOpenOrder(wo)) continue;
    const products = (Array.isArray(wo.products) ? wo.products : []).filter(isObj);
    const pending = products.filter(
      (p) => canonicalStatus(p.operational_status) !== 'completed' &&
        canonicalStatus(p.operational_status) !== 'voided' &&
        !isTerminalFulfillment(p.fulfillment_state)
    );
    if (!pending.length && !products.length) {
      // Order with no products at all still has an address worth routing.
    }
    const byDisp = new Map<string, number>();
    const targets = pending.length ? pending : products;
    for (const p of targets) {
      const d = dispositionFor(wo, p) || '';
      byDisp.set(d, (byDisp.get(d) || 0) + 1);
    }
    if (!byDisp.size) byDisp.set(methodFrom(wo.fulfillment_method), 0);
    const lines = siteAddressLines(wo);
    for (const [disp, count] of byDisp) {
      out.push({
        disposition: disp || 'unassigned',
        disposition_label: DISPOSITION_LABELS[disp] || '(unassigned)',
        order_ref: orderRefFor(wo),
        work_order_id: clean(wo.id),
        company: clean(wo.client_name) || clean(wo.customer_name),
        contact_name: firstText(wo.contact_name, wo.additional_contact),
        contact_phone: clean(wo.contact_phone),
        address: lines.join(', '),
        address_lines: lines,
        product_count: count,
        install_date: toDay(wo.project_install_date) || toDay(wo.due_date),
      });
    }
  }
  const rank = (d: string) => {
    const i = (FULFILLMENT_METHODS as readonly string[]).indexOf(d);
    return i === -1 ? FULFILLMENT_METHODS.length : i;
  };
  out.sort(
    (a, b) =>
      rank(a.disposition) - rank(b.disposition) ||
      a.company.toLowerCase().localeCompare(b.company.toLowerCase()) ||
      a.order_ref.localeCompare(b.order_ref)
  );
  return out;
}

// Products that reached `built` inside a day range — any current status
// (the transition already happened; products since picked up / completed
// still count).
export function builtRows(workOrders: any[] = [], opts: any = {}) {
  const { from, to } = rangeBounds(opts?.range);
  const out: any[] = [];
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isObj(wo) || wo.deleted === true) continue; // completed orders count — their products were built
    const rep = salespersonFor(wo);
    const products = Array.isArray(wo.products) ? wo.products : [];
    products.forEach((p, idx) => {
      if (!isObj(p)) return;
      const day = builtDay(p, wo);
      if (!day || !dayInRange(day, from, to)) return;
      const created = toDay(wo.date_order_created) || toDay(wo.created_date);
      const dtb = created ? daysBetween(created, day) : null;
      const fs = normStatus(p.fulfillment_state) || 'none';
      out.push({
        built_date: day,
        order_ref: orderRefFor(wo),
        work_order_id: clean(wo.id),
        company: clean(wo.client_name) || clean(wo.customer_name),
        salesperson: rep,
        product: firstText(p.description, p.client_product_name, p.customer_description, p.product_type) || `Product ${idx + 1}`,
        product_id: clean(p.id) || `${clean(wo.id)}-${idx}`,
        status: canonicalStatus(p.operational_status) || NO_STATUS_KEY,
        fulfillment_state: fs,
        fulfillment_label: FULFILLMENT_STATE_LABELS[fs] || fs,
        disposition: dispositionFor(wo, p),
        days_to_build: dtb != null && dtb >= 0 ? dtb : null,
        value_cents: productValueCents(p),
      });
    });
  }
  out.sort(
    (a, b) =>
      a.built_date.localeCompare(b.built_date) ||
      a.company.toLowerCase().localeCompare(b.company.toLowerCase()) ||
      a.order_ref.localeCompare(b.order_ref) ||
      a.product_id.localeCompare(b.product_id)
  );
  return out;
}

// ---------------------------------------------------------------------------
// Part demand — products[] embedded part lists (+ WO materials[] fallback)
// ---------------------------------------------------------------------------

const TOP_LEVEL_PART_KEYS = ['parts', 'part_list', 'builder_parts', 'line_items', 'materials', 'components'];
const SNAPSHOT_PART_KEYS = ['parts', 'part_list', 'builder_parts', 'materials', 'line_items'];

const listFrom = (value: any): any[] => {
  if (Array.isArray(value)) return value.filter(isObj);
  if (isObj(value)) return Object.values(value).filter(isObj);
  return [];
};

// The product's embedded part rows + which field supplied them (D-10
// precedence — first non-empty list wins, mixed lists never merge).
export function embeddedPartRows(product: any): { rows: any[]; field: string } {
  const p = isObj(product) ? product : {};
  for (const key of TOP_LEVEL_PART_KEYS) {
    const rows = listFrom(p[key]);
    if (rows.length) return { rows, field: key };
  }
  const snap = isObj(p.builder_snapshot) ? p.builder_snapshot : {};
  for (const key of SNAPSHOT_PART_KEYS) {
    const rows = listFrom(snap[key]);
    if (rows.length) return { rows, field: `builder_snapshot.${key}` };
  }
  return { rows: [], field: '' };
}

// WO materials[] manifest rows linked to this product (D-10 fallback —
// buildEstimateMaterialsManifest flattens the same BOM at conversion).
function manifestPartRows(wo: any, product: any): any[] {
  const manifest = Array.isArray(wo?.materials) ? wo.materials.filter(isObj) : [];
  if (!manifest.length) return [];
  const bp = clean(product?.builder_product_id);
  const line = clean(product?.estimate_line_id);
  const pid = clean(product?.id ?? product?.product_id);
  return manifest.filter((row) => {
    const linked =
      (bp && clean(row.builder_product_id) === bp) ||
      (line && (clean(row.estimate_line_id) === line || clean(row.line_id) === line)) ||
      (pid && (clean(row.product_id) === pid || clean(row.builder_product_id) === pid || clean(row.estimate_line_id) === pid || clean(row.line_id) === pid));
    return linked;
  });
}

// Part rows for one product: embedded list first, WO materials[] manifest
// fallback. Inactive/deleted rows drop on both paths (D-10 rule).
export function productPartRows(product: any, wo?: any): { rows: any[]; source: string } {
  const { rows, field } = embeddedPartRows(product);
  if (rows.length) {
    return { rows: rows.filter((r) => r.is_active !== false && r.deleted !== true), source: field };
  }
  const manifest = manifestPartRows(wo, product);
  return {
    rows: manifest.filter((r) => r.is_active !== false && r.deleted !== true),
    source: manifest.length ? 'materials' : '',
  };
}

const partQtyOf = (r: any): number =>
  num(r?.quantity ?? r?.part_qty ?? r?.qty ?? r?.count, 1);

const partNameOf = (r: any): string =>
  firstText(r?.part_name, r?.name, r?.client_label, r?.item_label, r?.inventory_item_name, r?.material_name, r?.description, r?.part_key) || '(unnamed part)';

// Cost in cents: extended wins, else unit × qty (BuilderPart/materials rows
// are dollar-stamped; *_cents fields pass through as integer cents).
const partCostCents = (r: any, perProductQty: number): number | null => {
  const directExt = [r?.extended_cents, r?.ext_cost_cents, r?.extendedCostCents, r?.total_cost_cents]
    .find((v) => Number.isFinite(Number(v)));
  if (directExt !== undefined) return Math.round(Number(directExt));
  const directUnit = [r?.unit_cost_cents, r?.unitCostCents, r?.cost_cents]
    .find((v) => Number.isFinite(Number(v)));
  if (directUnit !== undefined) return Math.round(Number(directUnit) * perProductQty);
  const ext = [r?.extended_cost, r?.ext_cost, r?.extCost, r?.frozen_extended_cost, r?.current_extended_cost, r?.total_cost, r?.line_total]
    .find((v) => Number.isFinite(Number(v)));
  if (ext !== undefined) return toCents(ext);
  const unit = [r?.unit_cost, r?.frozen_unit_cost, r?.current_unit_cost, r?.unit_price, r?.cost_per_unit, r?.price]
    .find((v) => Number.isFinite(Number(v)));
  if (unit !== undefined) return Math.round(toCents(unit) * perProductQty);
  return null;
};

const partVendorOf = (r: any): string =>
  firstText(r?.vendor_name, r?.vendor, r?.supplier_name, r?.supplier, r?.vendor_id);

const partDimsOf = (r: any): string => {
  const explicit = firstText(r?.dimensions, r?.dims, r?.size_label, r?.cut_size, r?.size);
  if (explicit) return explicit;
  const snap = isObj(r?.pricing_basis_snapshot) ? r.pricing_basis_snapshot : {};
  const w = [r?.width_in, r?.width, r?.w, snap?.width_in, snap?.width]
    .find((v) => Number.isFinite(Number(v)));
  const h = [r?.height_in, r?.height, r?.h, snap?.height_in, snap?.height]
    .find((v) => Number.isFinite(Number(v)));
  if (w !== undefined && h !== undefined) return `${num(w)} × ${num(h)}`;
  const sqft = [r?.sqft, r?.area_sqft, snap?.sqft, snap?.area_sqft]
    .find((v) => Number.isFinite(Number(v)));
  if (sqft !== undefined) return `${qtyRound(sqft)} sqft`;
  return '';
};

// Aggregation identity: strongest stored id first, then name+unit so
// unnamed-but-identical parts still collapse (partsNeededReport's
// item:/name: key scheme).
const partIdentityOf = (r: any): string => {
  const id = firstText(r?.inventory_item_id, r?.part_id, r?.builder_part_id, r?.id, r?.part_key);
  if (id) return `id:${id}`;
  return `name:${norm(partNameOf(r))}|${norm(firstText(r?.unit, r?.uom, r?.pricing_mode))}`;
};

/**
 * partNeededRows — aggregated part demand across OPEN products.
 *
 * @param workOrders  WorkOrder rows (deleted/completed orders skipped).
 * @param opts.statuses   Set/array of canonical statuses to include;
 *                        default = every open (non-terminal) product.
 * @param opts.basis      'created' (WO date_order_created/created_date) |
 *                        'due' (product_due_date → project_install_date →
 *                        due_date). Applies opts.range to that day.
 * @param opts.range      {from,to} | resolved date_range param | day string.
 * @returns [{key, part, part_id, part_key, unit, needed, open_products,
 *            order_count, qty_per_product, needed_cents|null, costed_parts,
 *            dimensions, vendor, mfg_part_number}]
 *   needed = Σ part.quantity × product.quantity ("qty × open count" when
 *   product quantity is 1). qty_per_product only populated when every
 *   contributing member uses the same per-product quantity; needed_cents is
 *   null when any contributing part row is uncosted.
 */
export function partNeededRows(workOrders: any[] = [], opts: any = {}) {
  const wanted = opts?.statuses instanceof Set
    ? opts.statuses
    : new Set((Array.isArray(opts?.statuses) ? opts.statuses : []).map(canonicalStatus).filter(Boolean));
  const basis = norm(opts?.basis) === 'created' ? 'created' : 'due';
  const { from, to } = rangeBounds(opts?.range);

  const groups = new Map<string, any>();
  for (const wo of Array.isArray(workOrders) ? workOrders : []) {
    if (!isOpenOrder(wo)) continue;
    const products = Array.isArray(wo.products) ? wo.products : [];
    products.forEach((p, idx) => {
      if (!isObj(p)) return;
      const canon = canonicalStatus(p.operational_status);
      if (TERMINAL_SET.has(canon)) return; // built/completed/voided — demand consumed
      if (wanted.size && !(wanted.has(canon) || (!canon && wanted.has(NO_STATUS_KEY)))) return;
      const day = basis === 'created'
        ? (toDay(wo.date_order_created) || toDay(wo.created_date))
        : (toDay(p.product_due_date) || toDay(wo.project_install_date) || toDay(wo.due_date));
      if (!dayInRange(day, from, to)) return;
      const { rows } = productPartRows(p, wo);
      if (!rows.length) return;
      const productQty = num(p.quantity, 1) || 1;
      const productId = clean(p.id) || `${clean(wo.id)}-${idx}`;
      for (const part of rows) {
        const key = partIdentityOf(part);
        let g = groups.get(key);
        if (!g) {
          g = {
            key,
            part: partNameOf(part),
            part_id: firstText(part?.part_id, part?.builder_part_id, part?.inventory_item_id, part?.id),
            part_key: clean(part?.part_key),
            unit: firstText(part?.unit, part?.uom, part?.pricing_mode),
            needed: 0,
            per_product_qtys: new Set<number>(),
            products: new Set<string>(),
            orders: new Set<string>(),
            needed_cents: 0,
            uncosted: false,
            costed_parts: 0,
            part_rows: 0,
            dimensions: partDimsOf(part),
            vendor: partVendorOf(part),
            mfg_part_number: clean(part?.mfg_part_number),
          };
          groups.set(key, g);
        }
        const perProduct = partQtyOf(part) * productQty;
        g.needed += perProduct;
        g.per_product_qtys.add(partQtyOf(part));
        g.products.add(productId);
        if (clean(wo.id)) g.orders.add(clean(wo.id));
        g.part_rows += 1;
        const cost = partCostCents(part, perProduct);
        if (cost == null) g.uncosted = true;
        else { g.needed_cents += cost; g.costed_parts += 1; }
        if (!g.dimensions) g.dimensions = partDimsOf(part);
        if (!g.vendor) g.vendor = partVendorOf(part);
        if (!g.mfg_part_number) g.mfg_part_number = clean(part?.mfg_part_number);
      }
    });
  }

  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      part: g.part,
      part_id: g.part_id,
      part_key: g.part_key,
      unit: g.unit,
      needed: qtyRound(g.needed),
      open_products: g.products.size,
      order_count: g.orders.size,
      qty_per_product: g.per_product_qtys.size === 1 ? qtyRound([...g.per_product_qtys][0]) : null,
      needed_cents: g.uncosted ? null : g.needed_cents,
      costed_parts: g.costed_parts,
      part_rows: g.part_rows,
      dimensions: g.dimensions,
      vendor: g.vendor,
      mfg_part_number: g.mfg_part_number,
      uncosted: g.uncosted,
    }))
    .sort(
      (a, b) =>
        b.needed - a.needed ||
        a.part.toLowerCase().localeCompare(b.part.toLowerCase()) ||
        a.key.localeCompare(b.key)
    );
}

// ---------------------------------------------------------------------------
// Report specs (defineReport shape — category 'production')
// ---------------------------------------------------------------------------

const moneyCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'money' });
const intCol = (key: string, label: string) => ({ key, label, align: 'right', format: 'int' });
const textCol = (key: string, label: string, align = 'left') => ({ key, label, align, format: 'text' });
const dateCol = (key: string, label: string) => ({ key, label, align: 'left', format: 'date' });
const num1Col = (key: string, label: string) => ({ key, label, align: 'right', format: 'num1' });

const STATUS_PICK_PARAM = {
  key: 'statuses',
  type: 'multiselect',
  label: 'Product Statuses',
  options: WIP_STATUSES.map((s) => ({ value: s, label: OPERATIONAL_STATUS_LABELS[s] })),
  default: [] as string[],
};
const STAGE_PICK_PARAM = {
  key: 'stages',
  type: 'multiselect',
  label: 'Order Stages',
  options: WORK_ORDER_STAGES.map((s) => ({ value: s, label: WORK_ORDER_STAGE_LABELS[s] })),
  default: [] as string[],
};
const DATE_RANGE_PARAM = {
  key: 'date_range',
  type: 'date_range',
  label: 'Date Range',
  default: 'this_month',
};
// Unbounded-by-default range for "current state" reports (custom w/ no
// bounds resolves open-ended — every qualifying row shows).
const OPEN_RANGE_PARAM = {
  key: 'date_range',
  type: 'date_range',
  label: 'Date Range',
  default: { preset: 'custom' },
};
const AS_OF_PARAM = {
  key: 'as_of',
  type: 'text',
  label: 'As-of Date',
  default: '',
};
const DISPOSITION_PICK_PARAM = {
  key: 'dispositions',
  type: 'multiselect',
  label: 'Dispositions',
  options: [
    ...FULFILLMENT_METHODS.map((m) => ({ value: m, label: DISPOSITION_LABELS[m] })),
    { value: 'unassigned', label: '(unassigned)' },
  ],
  default: [] as string[],
};
const DEMAND_BASIS_PARAM = {
  key: 'basis',
  type: 'select',
  label: 'Date Basis',
  options: [
    { value: 'due', label: 'Due date (product → install)' },
    { value: 'created', label: 'Order created date' },
  ],
  default: 'due',
};

const WIP_DESCRIPTIONS: Record<string, string> = {
  wip_by_product_status:
    'Open products grouped by CoreBridge operational status — count and quoted value per WIP status. Terminal statuses (built/completed/voided) and deleted/completed orders are excluded.',
  wip_by_order_status:
    'Open work orders grouped by current stage — order count, open product count and quoted value per stage.',
  wip_by_salesperson:
    'Open products rolled up by the order salesperson (sales_rep → salesperson → salesperson_email). Unassigned work groups under (unassigned).',
  wip_by_responsibility:
    'Open products grouped by product responsibility (department/person/group) with CoreBridge 1–99 priority stats — best and average priority per group.',
  wip_by_built_date:
    'Built-phase products (status built or awaiting fulfillment, still in the shop) grouped by the day they reached built, with days-waiting stats.',
  addresses_by_disposition:
    'Install/site addresses for open orders, grouped by fulfillment disposition — pickup, installation, shipping, delivery (product method → state-implied → order method).',
  built_report:
    'Products that reached the built status inside the selected period — the day built, disposition, days from order creation to built, and quoted value.',
  part_amount_needed:
    'Part quantity needed to finish open products — each product\'s embedded parts/line_items (or the work order materials manifest) × product quantity, aggregated by part with dimensions and vendor for purchasing.',
};

export const PRODUCTION_REPORTS = [
  {
    id: 'wip_by_product_status',
    name: 'WIP by Product Status',
    category: 'production',
    description: WIP_DESCRIPTIONS.wip_by_product_status,
    params: [STATUS_PICK_PARAM],
    columns: [
      textCol('status_label', 'Product Status'),
      intCol('product_count', 'Products'),
      intCol('order_count', 'Orders'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const wanted = wantedSet(params?.statuses);
      const rows = wipProductRows(data?.work_orders).filter((r) => matchesStatusPick(r.status, wanted));
      return { rows: wipByStatusRows(rows).map((r) => ({ ...r, value: fromCents(r.value_cents) })) };
    },
    summarize: (rows: any[]) => {
      const orders = new Set<string>();
      for (const r of rows) for (const id of r?.order_ids || []) if (clean(id)) orders.add(clean(id));
      return {
        totals: {
          status_label: 'Total',
          product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
          order_count: orders.size || rows.reduce((s, r) => s + num(r.order_count), 0),
          value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
        },
      };
    },
  },
  {
    id: 'wip_by_order_status',
    name: 'WIP by Order Status',
    category: 'production',
    description: WIP_DESCRIPTIONS.wip_by_order_status,
    params: [STAGE_PICK_PARAM],
    columns: [
      textCol('stage_label', 'Order Stage'),
      intCol('order_count', 'Orders'),
      intCol('open_product_count', 'Open Products'),
      intCol('product_count', 'All Products'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const wanted = wantedSet(params?.stages);
      const rows = wipByStageRows(data?.work_orders).filter(
        (r) => !wanted.size || wanted.has(r.stage === 'none' ? 'none' : r.stage)
      );
      return { rows: rows.map((r) => ({ ...r, value: fromCents(r.value_cents) })) };
    },
    summarize: (rows: any[]) => ({
      totals: {
        stage_label: 'Total',
        order_count: rows.reduce((s, r) => s + num(r.order_count), 0),
        open_product_count: rows.reduce((s, r) => s + num(r.open_product_count), 0),
        product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
        value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
      },
    }),
  },
  {
    id: 'wip_by_salesperson',
    name: 'WIP by Salesperson',
    category: 'production',
    description: WIP_DESCRIPTIONS.wip_by_salesperson,
    params: [STATUS_PICK_PARAM],
    columns: [
      textCol('salesperson', 'Salesperson'),
      intCol('product_count', 'Products'),
      intCol('order_count', 'Orders'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const wanted = wantedSet(params?.statuses);
      const rows = wipProductRows(data?.work_orders).filter((r) => matchesStatusPick(r.status, wanted));
      return { rows: wipBySalespersonRows(rows).map((r) => ({ ...r, value: fromCents(r.value_cents) })) };
    },
    summarize: (rows: any[]) => {
      const orders = new Set<string>();
      for (const r of rows) for (const id of r?.order_ids || []) if (clean(id)) orders.add(clean(id));
      return {
        totals: {
          salesperson: 'Total',
          product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
          order_count: orders.size || rows.reduce((s, r) => s + num(r.order_count), 0),
          value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
        },
      };
    },
  },
  {
    id: 'wip_by_responsibility',
    name: 'WIP by Responsibility',
    category: 'production',
    description: WIP_DESCRIPTIONS.wip_by_responsibility,
    params: [STATUS_PICK_PARAM],
    columns: [
      textCol('responsibility', 'Responsibility'),
      intCol('product_count', 'Products'),
      intCol('order_count', 'Orders'),
      intCol('prioritized_count', 'Prioritized'),
      intCol('min_priority', 'Best Priority'),
      num1Col('avg_priority', 'Avg Priority'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const wanted = wantedSet(params?.statuses);
      const rows = wipProductRows(data?.work_orders).filter((r) => matchesStatusPick(r.status, wanted));
      return {
        rows: wipByResponsibilityRows(rows, data?.responsibilities).map((r) => ({
          ...r,
          value: fromCents(r.value_cents),
        })),
      };
    },
    summarize: (rows: any[]) => {
      const orders = new Set<string>();
      for (const r of rows) for (const id of r?.order_ids || []) if (clean(id)) orders.add(clean(id));
      const prs = rows.filter((r) => num(r.prioritized_count) > 0);
      return {
        totals: {
          responsibility: 'Total',
          product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
          order_count: orders.size || rows.reduce((s, r) => s + num(r.order_count), 0),
          prioritized_count: rows.reduce((s, r) => s + num(r.prioritized_count), 0),
          min_priority: prs.length ? Math.min(...prs.map((r) => num(r.min_priority))) : null,
          value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
        },
      };
    },
  },
  {
    id: 'wip_by_built_date',
    name: 'WIP by Built Date',
    category: 'production',
    description: WIP_DESCRIPTIONS.wip_by_built_date,
    params: [OPEN_RANGE_PARAM, AS_OF_PARAM],
    columns: [
      dateCol('built_date', 'Built Date'),
      intCol('product_count', 'Products'),
      intCol('order_count', 'Orders'),
      num1Col('avg_days_waiting', 'Avg Days Waiting'),
      intCol('max_days_waiting', 'Max Days Waiting'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const rows = wipByBuiltDateRows(data?.work_orders, {
        range: params?.date_range,
        asOf: params?.as_of,
      });
      return {
        rows: rows.map((r) => ({
          ...r,
          // '(undated)' renders through the date column as plain text —
          // built-phase products with no evidence stay visible, not blank.
          built_date: r.built_date || '(undated)',
          value: fromCents(r.value_cents),
        })),
      };
    },
    summarize: (rows: any[]) => {
      const orders = new Set<string>();
      for (const r of rows) for (const id of r?.order_ids || []) if (clean(id)) orders.add(clean(id));
      const waits = rows.filter((r) => r.max_days_waiting != null).map((r) => num(r.max_days_waiting));
      return {
        totals: {
          built_date: 'Total',
          product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
          order_count: orders.size || rows.reduce((s, r) => s + num(r.order_count), 0),
          max_days_waiting: waits.length ? Math.max(...waits) : null,
          value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
        },
      };
    },
  },
  {
    id: 'addresses_by_disposition',
    name: 'Addresses by Disposition',
    category: 'production',
    description: WIP_DESCRIPTIONS.addresses_by_disposition,
    params: [DISPOSITION_PICK_PARAM],
    columns: [
      textCol('disposition_label', 'Disposition'),
      textCol('order_ref', 'Order'),
      textCol('company', 'Company'),
      textCol('contact_name', 'Contact'),
      textCol('contact_phone', 'Phone'),
      textCol('address', 'Site Address'),
      intCol('product_count', 'Products'),
      dateCol('install_date', 'Install Date'),
    ],
    run: (params: any, data: any) => {
      const wanted = new Set(
        (Array.isArray(params?.dispositions) ? params.dispositions : []).map(norm).filter(Boolean)
      );
      const rows = addressRows(data?.work_orders).filter(
        (r) => !wanted.size || wanted.has(norm(r.disposition))
      );
      return { rows };
    },
    summarize: (rows: any[]) => ({
      totals: {
        disposition_label: `Total — ${rows.length} stop${rows.length === 1 ? '' : 's'}`,
        product_count: rows.reduce((s, r) => s + num(r.product_count), 0),
      },
    }),
  },
  {
    id: 'built_report',
    name: 'Built Report',
    category: 'production',
    description: WIP_DESCRIPTIONS.built_report,
    params: [DATE_RANGE_PARAM],
    columns: [
      dateCol('built_date', 'Built Date'),
      textCol('order_ref', 'Order'),
      textCol('company', 'Company'),
      textCol('product', 'Product'),
      textCol('disposition_label', 'Disposition'),
      textCol('fulfillment_label', 'Fulfillment'),
      intCol('days_to_build', 'Days to Build'),
      moneyCol('value', 'Quoted Value'),
    ],
    run: (params: any, data: any) => {
      const rows = builtRows(data?.work_orders, { range: params?.date_range }).map((r) => ({
        ...r,
        disposition_label: DISPOSITION_LABELS[r.disposition] || '(unassigned)',
        value: fromCents(r.value_cents),
      }));
      return { rows };
    },
    summarize: (rows: any[]) => {
      const dtbs = rows.map((r) => r.days_to_build).filter((d) => Number.isFinite(d));
      return {
        totals: {
          built_date: `Total — ${rows.length} built`,
          days_to_build: dtbs.length
            ? Math.round(dtbs.reduce((s, d) => s + d, 0) / dtbs.length)
            : null,
          value: Math.round(rows.reduce((s, r) => s + num(r.value), 0) * 100) / 100,
        },
        avg_days_to_build: dtbs.length
          ? Math.round((dtbs.reduce((s, d) => s + d, 0) / dtbs.length) * 10) / 10
          : null,
      };
    },
  },
  {
    id: 'part_amount_needed',
    name: 'Part Amount Needed',
    category: 'production',
    description: WIP_DESCRIPTIONS.part_amount_needed,
    params: [STATUS_PICK_PARAM, DEMAND_BASIS_PARAM, OPEN_RANGE_PARAM],
    columns: [
      textCol('part', 'Part'),
      textCol('unit', 'Unit'),
      num1Col('needed', 'Qty Needed'),
      intCol('open_products', 'Products'),
      intCol('order_count', 'Orders'),
      num1Col('qty_per_product', 'Qty per Product'),
      moneyCol('needed_value', 'Extended Cost'),
      textCol('dimensions', 'Dimensions'),
      textCol('vendor', 'Vendor'),
      textCol('mfg_part_number', 'Mfg Part #'),
    ],
    run: (params: any, data: any) => {
      const wanted = wantedSet(params?.statuses);
      const rows = partNeededRows(data?.work_orders, {
        statuses: wanted,
        basis: params?.basis,
        range: params?.date_range,
      });
      return {
        rows: rows.map((r) => ({
          ...r,
          needed_value: r.needed_cents == null ? null : fromCents(r.needed_cents),
        })),
      };
    },
    summarize: (rows: any[]) => {
      const costed = rows.filter((r) => r.needed_value != null);
      const uncosted = rows.length - costed.length;
      return {
        totals: {
          part: `Total — ${rows.length} part${rows.length === 1 ? '' : 's'}`,
          open_products: rows.reduce((s, r) => s + num(r.open_products), 0),
          order_count: rows.reduce((s, r) => s + num(r.order_count), 0),
          needed_value: costed.length
            ? Math.round(costed.reduce((s, r) => s + num(r.needed_value), 0) * 100) / 100
            : null,
          vendor: uncosted ? `${uncosted} uncosted` : '',
        },
      };
    },
  },
];

export const PRODUCTION_REPORTS_BY_ID: Record<string, any> = Object.fromEntries(
  PRODUCTION_REPORTS.map((spec) => [spec.id, spec])
);
