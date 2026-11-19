// Report drilldown model — ESTIMATOR_MASTERPLAN WS-J / item J-10.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Row → source-record deep links for the J-01 report catalog engine
// (src/components/reports/reportEngine.js). Every J-pack report row keeps
// its entity refs as extra keys (the engine preserves extra row keys for
// drilldowns — arAgingReports/customerReports convention), so a rendered
// cell can link back to the record it came from.
//
// ── Route conventions (VERIFIED against page sources, D-12 family) ──────
// Canonical kind → {path,param} replicated from
//   src/components/kit/recordRoutes.js (RECORD_ROUTES / recordHref) and
//   src/components/jobs/deepLinks.js (DEEP_LINK_ROUTES / deepLinkFor) —
//   this module cannot import them (zero-import rule), so the table is an
//   inline replica kept in sync by comment. Param names verified by
//   reading each page's own query-param reads:
//     invoice   -> /Invoices?invoice=     Invoices.jsx:835 reads "invoice"
//                                        → InvoiceDetail → get_invoice by
//                                        ENTITY ID (invoice_number is NOT
//                                        accepted — it is a label-only ref)
//     work_order-> /JobWorkspace?wo=      components/jobs/JobWorkspace.jsx:190
//                                        reads "wo"; findWorkOrder resolves
//                                        entity id OR corbridge_invoice_number
//                                        (order numbers DO deep-link). The
//                                        "estimate" param resolves a WO by
//                                        estimate id (line 191).
//     estimate  -> /EstimateDetail?id=    EstimateDetail.jsx:111 reads "id"
//                                        (alias "estimate") — entity id only.
//     customer  -> /Customer360?id=       customer360Model.readCustomerIdParam
//                                        reads "id" (alias "customer").
//     product   -> /EstimateDetail?id=<e>&open=<p>
//                                        EstimateDetail.jsx:388-392 reads
//                                        "open" (matches line project_id/id);
//                                        EstimateProductsList.jsx:92-99 also
//                                        honors "open"/"line" — scrolls the
//                                        product into view + highlight flash.
//                                        WO-context fallback: /JobWorkspace
//                                        ?wo=<wo>&product=<p> — "product" is
//                                        carried for forward compatibility
//                                        (JobWorkspace reads only wo/estimate
//                                        today; the link still lands on the
//                                        parent workspace — deepLinks' intake
//                                        convention).
//     payment   -> no /Payments page exists (pages.config.js). Payments
//                                        surface on the parent invoice, so
//                                        context.invoice_id wins →
//                                        /Invoices?invoice=<inv>. A bare
//                                        payment id falls back to
//                                        /Invoices?payment=<id> — forward-
//                                        compat param on the payments surface.
//     part      -> /EstimatorParts        EstimatorParts.jsx:142-146 reads
//                                        "q"/"scope"/"type"/"category"/"status"
//                                        (no /AdminParts page). A part
//                                        number/name → ?q=<term> is the real
//                                        working prefill; a bare part_id →
//                                        ?part=<id> forward-compat.
//     opportunity-> /Opportunities?open=  Opportunities.jsx:1278 reads "open".
//     purchase_order -> /PurchaseOrders?po= PurchaseOrders.jsx:390 reads "po".
//     change_order   -> /ChangeOrders?co=   ChangeOrders.jsx:338 reads "co".
//
// ── Precedence (spec: a row drills to its MOST SPECIFIC ref) ────────────
//   invoice > payment > product > part > work_order > estimate >
//   opportunity > purchase_order > change_order > customer
// invoice_id first (spec chain invoice_id>invoice_number>work_order_id>
// estimate_id>customer_id): invoice_number participates as the display
// label only — an invoice_number without invoice_id cannot open the
// detail (get_invoice keys on entity id), so the chain falls through to
// the next resolvable ref instead of emitting a broken link. product and
// part sit above work_order because they consume the WO/estimate refs as
// CONTEXT (/JobWorkspace?wo=<wo>&product=<p>) — a product row should
// anchor inside its parent record, not just open it.
//
// API:
//   DRILL_TARGETS                        — canonical entity → route table
//   DRILL_ENTITIES / DRILL_PRECEDENCE    — key list / resolution order
//   canonicalDrillType(spelling)         — alias-tolerant entity key
//   rowEntityRefs(row)                   — extract every ref a row carries
//   deepLinkFor(entity_type, ref, {context?}) — "/Page?param=ref" href
//   drillLinkFor(row, {entity_hint?})    — {href,entity_type,label,ref}|null
//   cellDrillLink(row, columnKey)        — drill for ONE cell's entity
//   drillableColumns(spec)               — spec columns that carry refs

// ---------------------------------------------------------------------------
// route table
// ---------------------------------------------------------------------------

export interface DrillRoute {
  path: string;
  param: string;
  label: string;
}

// Canonical entity → { path, param, label }. Mirrors deepLinks.js
// DEEP_LINK_ROUTES plus the report-only product/payment/part targets.
export const DRILL_TARGETS: Record<string, DrillRoute> = {
  invoice:        { path: '/Invoices',       param: 'invoice', label: 'Invoice' },
  work_order:     { path: '/JobWorkspace',   param: 'wo',      label: 'Work Order' },
  estimate:       { path: '/EstimateDetail', param: 'id',      label: 'Estimate' },
  customer:       { path: '/Customer360',    param: 'id',      label: 'Customer' },
  product:        { path: '/EstimateDetail', param: 'open',    label: 'Product' },
  payment:        { path: '/Invoices',       param: 'payment', label: 'Payment' },
  part:           { path: '/EstimatorParts', param: 'part',    label: 'Part' },
  opportunity:    { path: '/Opportunities',  param: 'open',    label: 'Opportunity' },
  purchase_order: { path: '/PurchaseOrders', param: 'po',      label: 'Purchase Order' },
  change_order:   { path: '/ChangeOrders',   param: 'co',      label: 'Change Order' },
};

export const DRILL_ENTITIES: string[] = Object.keys(DRILL_TARGETS);

// Resolution order for drillLinkFor — most specific ref first. product/part
// rank above work_order/estimate because they consume those refs as parent
// context when building the href.
export const DRILL_PRECEDENCE: string[] = [
  'invoice',
  'payment',
  'product',
  'part',
  'work_order',
  'estimate',
  'opportunity',
  'purchase_order',
  'change_order',
  'customer',
];

// ---------------------------------------------------------------------------
// entity-type spelling normalization (deepLinks canonicalEntityType replica)
// ---------------------------------------------------------------------------

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

const DRILL_ALIASES: Record<string, string> = {
  wo: 'work_order',
  workorder: 'work_order',
  workorders: 'work_order',
  work_orders: 'work_order',
  job: 'work_order',
  jobs: 'work_order',
  order: 'work_order',
  orders: 'work_order',
  estimates: 'estimate',
  quote: 'estimate',
  quotes: 'estimate',
  customer_quote: 'estimate',
  invoices: 'invoice',
  customers: 'customer',
  client: 'customer',
  clients: 'customer',
  account: 'customer',
  master: 'customer',
  master_account: 'customer',
  products: 'product',
  line: 'product',
  lines: 'product',
  line_item: 'product',
  line_items: 'product',
  payments: 'payment',
  parts: 'part',
  builder_part: 'part',
  inventory_item: 'part',
  opportunities: 'opportunity',
  sales: 'opportunity',
  pipeline: 'opportunity',
  po: 'purchase_order',
  purchaseorder: 'purchase_order',
  purchase_orders: 'purchase_order',
  purchaseorders: 'purchase_order',
  co: 'change_order',
  changeorder: 'change_order',
  change_orders: 'change_order',
  changeorders: 'change_order',
};

// Any spelling of a drill entity → canonical DRILL_TARGETS key, or ''.
// Case-insensitive; "-" / " " normalized to "_".
export function canonicalDrillType(v: any): string {
  const k = norm(v).replace(/[-\s]+/g, '_');
  if (DRILL_TARGETS[k]) return k;
  const alias = DRILL_ALIASES[k];
  return alias && DRILL_TARGETS[alias] ? alias : '';
}

// ---------------------------------------------------------------------------
// rowEntityRefs — tolerant ref extraction
// ---------------------------------------------------------------------------

// First non-blank value across flat aliases, then nested object forms
// ({invoice:{id}}, {invoice:{_id}}), then camelCase spellings.
const firstRef = (row: any, keys: string[], nested?: string[]): string => {
  for (const k of keys) {
    const s = clean(row?.[k]);
    if (s) return s;
  }
  for (const k of nested || []) {
    const v = row?.[k];
    if (isObj(v)) {
      const s = clean(v.id) || clean(v._id);
      if (s) return s;
    }
  }
  return '';
};
const firstText = (row: any, keys: string[], nested?: string[]): string => {
  for (const k of keys) {
    const s = clean(row?.[k]);
    if (s) return s;
  }
  for (const k of nested || []) {
    const v = row?.[k];
    if (isObj(v)) {
      for (const nk of ['invoice_number', 'order_number', 'work_order_number',
        'corbridge_invoice_number', 'estimate_number', 'part_number', 'number',
        'order_ref', 'name']) {
        const s = clean(v[nk]);
        if (s) return s;
      }
    }
  }
  return '';
};

export interface RowEntityRefs {
  invoice_id?: string;
  invoice_number?: string;
  work_order_id?: string;
  work_order_number?: string;
  estimate_id?: string;
  estimate_number?: string;
  customer_id?: string;
  product_id?: string;
  product_name?: string;
  payment_id?: string;
  part_id?: string;
  part_number?: string;
  opportunity_id?: string;
  purchase_order_id?: string;
  change_order_id?: string;
}

/**
 * rowEntityRefs — pull every drillable entity ref out of a report row.
 *
 * Tolerates the shapes the J-pack specs emit plus raw entity passthroughs:
 *   flat snake_case  {invoice_id, work_order_id, ...}   (all report rows)
 *   camelCase        {invoiceId, workOrderId, ...}      (UI-built rows)
 *   nested objects   {invoice:{id}}, {customer:{_id}}   (entity passthrough)
 *   wo shortcuts     {wo_id, order_id, job_id}
 *   number fields    invoice_number / order_number /
 *                    work_order_number / corbridge_invoice_number /
 *                    order_ref / job_number (work-order display refs —
 *                    JobWorkspace resolves them), estimate_number,
 *                    part_number / mfg_part_number (part search context)
 *   line refs        line_id / estimate_line_id / builder_product_id →
 *                    product_id slot (EstimateDetail "open" matches all of
 *                    these id shapes — EstimateProductsList.jsx:98-99)
 *   master accounts  master_id / master_account_id → customer_id fallback
 *   po/co spellings  po_id, purchase_order_id | co_id, change_order_id
 * Only non-blank keys are returned — a row with no refs yields {}.
 */
export function rowEntityRefs(row: any): RowEntityRefs {
  if (!isObj(row)) return {};
  const refs: RowEntityRefs = {};

  const invoice_id = firstRef(row, ['invoice_id', 'invoiceId'], ['invoice']);
  const invoice_number = firstText(row,
    ['invoice_number', 'invoice_no', 'inv_number'], ['invoice']);
  if (invoice_id) refs.invoice_id = invoice_id;
  if (invoice_number) refs.invoice_number = invoice_number;

  const work_order_id = firstRef(row,
    ['work_order_id', 'workOrderId', 'wo_id', 'order_id', 'job_id'],
    ['work_order', 'workOrder', 'wo', 'order']);
  const work_order_number = firstText(row,
    ['work_order_number', 'order_number', 'corbridge_invoice_number',
      'order_ref', 'job_number', 'wo_number'],
    ['work_order', 'workOrder', 'wo', 'order']);
  if (work_order_id) refs.work_order_id = work_order_id;
  if (work_order_number) refs.work_order_number = work_order_number;

  const estimate_id = firstRef(row, ['estimate_id', 'estimateId'], ['estimate']);
  const estimate_number = firstText(row,
    ['estimate_number', 'estimate_no', 'est_number'], ['estimate']);
  if (estimate_id) refs.estimate_id = estimate_id;
  if (estimate_number) refs.estimate_number = estimate_number;

  // customer: master_id/master_account_id resolve to the master CUSTOMER
  // (customers_by_master rows) — they fill customer_id only when no direct
  // customer ref exists.
  const customer_id = firstRef(row,
    ['customer_id', 'customerId'], ['customer']) ||
    firstRef(row, ['master_id', 'master_account_id'], ['master']);
  if (customer_id) refs.customer_id = customer_id;

  // product: entity/product ids first, then line-level refs EstimateDetail's
  // "open" param also matches (line_id / estimate_line_id /
  // builder_product_id / quick_product_source_id).
  const product_id = firstRef(row,
    ['product_id', 'productId', 'builder_product_id', 'quick_product_source_id',
      'line_id', 'estimate_line_id'],
    ['product', 'line']);
  const product_name = firstText(row, ['product_name', 'product_label'], ['product']);
  if (product_id) refs.product_id = product_id;
  if (product_name) refs.product_name = product_name;

  const payment_id = firstRef(row, ['payment_id', 'paymentId'], ['payment']);
  if (payment_id) refs.payment_id = payment_id;

  const part_id = firstRef(row,
    ['part_id', 'partId', 'builder_part_id', 'saved_part_id'], ['part']);
  const part_number = firstText(row,
    ['part_number', 'mfg_part_number', 'part_no', 'vendor_part_number'], ['part']);
  if (part_id) refs.part_id = part_id;
  if (part_number) refs.part_number = part_number;

  const opportunity_id = firstRef(row,
    ['opportunity_id', 'opportunityId'], ['opportunity']);
  if (opportunity_id) refs.opportunity_id = opportunity_id;

  const purchase_order_id = firstRef(row,
    ['purchase_order_id', 'purchaseOrderId', 'po_id'], ['purchase_order', 'po']);
  if (purchase_order_id) refs.purchase_order_id = purchase_order_id;

  const change_order_id = firstRef(row,
    ['change_order_id', 'changeOrderId', 'co_id'], ['change_order', 'co']);
  if (change_order_id) refs.change_order_id = change_order_id;

  return refs;
}

// ---------------------------------------------------------------------------
// deepLinkFor — entity + ref (+context) → href
// ---------------------------------------------------------------------------

const enc = (v: any): string => encodeURIComponent(clean(v));
const hrefFor = (route: DrillRoute, ref: any, extra?: Record<string, any>): string => {
  const value = clean(ref);
  if (!value) return '';
  const parts = [`${route.param}=${enc(value)}`];
  for (const [k, v] of Object.entries(extra || {})) {
    if (clean(v)) parts.push(`${encodeURIComponent(k)}=${enc(v)}`);
  }
  return `${route.path}?${parts.join('&')}`;
};

/**
 * deepLinkFor(entity_type, ref, {context?}) → "/Page?param=ref" or ''.
 *
 * Simple targets need only entity_type + ref. Context-aware targets:
 *   product  context.estimate_id → /EstimateDetail?id=<est>&open=<ref>
 *            (the real scroll-and-highlight product link); else
 *            context.work_order_id||work_order_number →
 *            /JobWorkspace?wo=<wo>&product=<ref> ("product" forward-compat).
 *            No parent context → '' (a floating product ref can't anchor).
 *   payment  context.invoice_id → /Invoices?invoice=<inv> (payments live on
 *            the invoice detail); else /Invoices?payment=<ref> (forward-
 *            compat — lands on the payments surface, the invoice list).
 *   part     context.part_number||part_name → /EstimatorParts?q=<term>
 *            (the page's real search prefill); else
 *            /EstimatorParts?part=<ref> forward-compat.
 *   work_order  ref may be an entity id OR a display number — findWorkOrder
 *            resolves corbridge_invoice_number too.
 * Unknown entity / blank ref → '' so callers fall back to plain text.
 */
export function deepLinkFor(entityType: any, ref: any, opts: any = {}): string {
  const t = canonicalDrillType(entityType);
  const value = clean(ref);
  if (!t || !value) return '';
  const route = DRILL_TARGETS[t];
  const ctx = isObj(opts?.context) ? opts.context : isObj(opts) ? opts : {};

  if (t === 'product') {
    const est = clean(ctx.estimate_id);
    const wo = clean(ctx.work_order_id) || clean(ctx.work_order_number);
    if (est) return `/EstimateDetail?id=${enc(est)}&open=${enc(value)}`;
    if (wo) return `/JobWorkspace?wo=${enc(wo)}&product=${enc(value)}`;
    return '';
  }
  if (t === 'payment') {
    const inv = clean(ctx.invoice_id);
    if (inv) return `/Invoices?invoice=${enc(inv)}`;
    return `/Invoices?payment=${enc(value)}`;
  }
  if (t === 'part') {
    const term = clean(ctx.part_number) || clean(ctx.part_name) || clean(ctx.mfg_part_number);
    if (term) return `/EstimatorParts?q=${enc(term)}`;
    return `/EstimatorParts?part=${enc(value)}`;
  }
  return hrefFor(route, value);
}

// ---------------------------------------------------------------------------
// drillLinkFor — row → best drill target
// ---------------------------------------------------------------------------

// Entity → {ref fields (primary first), label fields}. Resolution reads the
// first non-blank ref; the label prefers the human-facing number/name.
const ENTITY_REF_SPEC: Record<string, { refs: string[]; labels: string[] }> = {
  invoice:        { refs: ['invoice_id'],                                 labels: ['invoice_number', 'invoice_id'] },
  payment:        { refs: ['payment_id'],                                 labels: ['reference_number', 'payment_id'] },
  product:        { refs: ['product_id'],                                 labels: ['product_name', 'product_id'] },
  part:           { refs: ['part_id', 'part_number'],                     labels: ['part_number', 'part_id'] },
  work_order:     { refs: ['work_order_id', 'work_order_number'],         labels: ['work_order_number', 'work_order_id'] },
  estimate:       { refs: ['estimate_id'],                                labels: ['estimate_number', 'estimate_id'] },
  opportunity:    { refs: ['opportunity_id'],                             labels: ['opportunity_id'] },
  purchase_order: { refs: ['purchase_order_id'],                          labels: ['purchase_order_id'] },
  change_order:   { refs: ['change_order_id'],                            labels: ['change_order_id'] },
  customer:       { refs: ['customer_id'],                                labels: ['customer_name', 'customer_id'] },
};

const drillLabel = (entity: string, refs: RowEntityRefs, row: any): string => {
  const spec = ENTITY_REF_SPEC[entity];
  const base = DRILL_TARGETS[entity]?.label || entity;
  for (const k of spec?.labels || []) {
    const s = clean((refs as any)[k]) || clean(row?.[k]);
    if (s) return `${base} ${s}`;
  }
  return base;
};

const resolveEntity = (entity: string, refs: RowEntityRefs, row: any): { href: string; ref: string } => {
  const spec = ENTITY_REF_SPEC[entity];
  if (!spec) return { href: '', ref: '' };
  let ref = '';
  for (const k of spec.refs) {
    ref = clean((refs as any)[k]) || clean(row?.[k]);
    if (ref) break;
  }
  if (!ref) return { href: '', ref: '' };
  const href = deepLinkFor(entity, ref, { context: { ...refs, ...{ part_name: refs.part_number || clean(row?.part_name) } } });
  return { href, ref };
};

export interface DrillLink {
  href: string;
  entity_type: string;
  label: string;
  ref: string;
}

/**
 * drillLinkFor(row, {entity_hint?}) → { href, entity_type, label, ref } | null
 *
 * Picks the row's most specific resolvable ref. opts.entity_hint (any
 * spelling — canonicalDrillType) tries that entity FIRST; if it resolves
 * nothing the standard precedence still applies, so a hint can never
 * produce a worse link than no hint. Returns null when no ref resolves —
 * the UI renders plain text instead of a broken route.
 */
export function drillLinkFor(row: any, opts: any = {}): DrillLink | null {
  if (!isObj(row)) return null;
  const refs = rowEntityRefs(row);
  const hint = canonicalDrillType(opts?.entity_hint ?? opts?.entityHint ?? opts?.entity);

  const tryEntity = (entity: string): DrillLink | null => {
    const { href, ref } = resolveEntity(entity, refs, row);
    if (!href) return null;
    return { href, entity_type: entity, label: drillLabel(entity, refs, row), ref };
  };

  if (hint) {
    const hit = tryEntity(hint);
    if (hit) return hit;
  }
  for (const entity of DRILL_PRECEDENCE) {
    if (entity === hint) continue;
    const hit = tryEntity(entity);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// drillableColumns — which spec columns carry drill refs
// ---------------------------------------------------------------------------

// Column key → entity the cell should link to. Covers both ref-field keys
// (handled separately below) and the human-facing display keys the J-pack
// specs actually use (ar_aging_detail "number" is the invoice number,
// production "order_ref" is the WO reference, estimate reports
// "estimate_number", master-account "master_name", ...).
const COLUMN_ENTITY_HINTS: Record<string, string> = {
  // invoice
  invoice_number: 'invoice',
  invoice: 'invoice',
  number: 'invoice',
  inv_number: 'invoice',
  // work order
  order_ref: 'work_order',
  order_number: 'work_order',
  work_order_number: 'work_order',
  work_order: 'work_order',
  job_number: 'work_order',
  job: 'work_order',
  wo: 'work_order',
  order: 'work_order',
  // estimate
  estimate_number: 'estimate',
  estimate_name: 'estimate',
  estimate: 'estimate',
  project_name: 'estimate',
  // customer
  customer_name: 'customer',
  customer: 'customer',
  master_name: 'customer',
  master_account: 'customer',
  company_name: 'customer',
  // product
  product: 'product',
  product_name: 'product',
  product_label: 'product',
  open_products: 'product',
  // part
  part: 'part',
  part_number: 'part',
  part_name: 'part',
  mfg_part_number: 'part',
  vendor_part: 'part',
  // payment
  payment: 'payment',
  // opportunity
  opportunity_name: 'opportunity',
  opportunity: 'opportunity',
  // po / co
  po_number: 'purchase_order',
  purchase_order: 'purchase_order',
  co_number: 'change_order',
  change_order: 'change_order',
};

// "<x>_id" / "<x>Id" column keys → entity when <x> canonicalizes.
const refKeyEntity = (key: string): string => {
  const k = clean(key);
  const m = k.match(/^([a-z_]+?)_id$/) || k.match(/^([a-zA-Z]+?)Id$/);
  if (!m) return '';
  const t = canonicalDrillType(m[1]);
  return t || '';
};

/**
 * columnDrillType(column | columnKey) → canonical entity the cell links to,
 * or ''. Ref-field keys (`invoice_id`, `po_id`, ...) win by direct naming;
 * display keys map through COLUMN_ENTITY_HINTS.
 */
export function columnDrillType(col: any): string {
  const key = clean(isObj(col) ? col.key : col);
  if (!key) return '';
  return refKeyEntity(key) || COLUMN_ENTITY_HINTS[norm(key)] || '';
}

export interface DrillableColumn {
  key: string;
  label: string;
  entity_type: string;
  ref_fields: string[];
}

/**
 * drillableColumns(spec) → the columns of a report spec that carry drill
 * refs, each { key, label, entity_type, ref_fields }. Accepts a full spec
 * ({columns:[...]}) or a bare columns array. The UI renders the cell as a
 * link via cellDrillLink(row, col.key) / drillLinkFor(row,{entity_hint}).
 */
export function drillableColumns(spec: any): DrillableColumn[] {
  const cols = Array.isArray(spec) ? spec : Array.isArray(spec?.columns) ? spec.columns : [];
  const out: DrillableColumn[] = [];
  for (const c of cols) {
    if (!isObj(c)) continue;
    const entity = columnDrillType(c);
    if (!entity) continue;
    out.push({
      key: clean(c.key),
      label: clean(c.label) || clean(c.key),
      entity_type: entity,
      ref_fields: [...(ENTITY_REF_SPEC[entity]?.refs || [])],
    });
  }
  return out;
}

/**
 * cellDrillLink(row, columnKey) → {href,entity_type,label,ref} | null.
 * Column-scoped drill: the cell links ITS OWN entity (a customer_name cell
 * → /Customer360 even when the row's primary drill is the invoice). When
 * the column carries no hint, falls back to the row's primary drill.
 */
export function cellDrillLink(row: any, columnKey: any): DrillLink | null {
  const entity = columnDrillType(columnKey);
  if (entity) {
    const hit = drillLinkFor(row, { entity_hint: entity });
    if (hit) return hit;
  }
  return drillLinkFor(row);
}
