// Pure order-history model for the Job Workspace Order History tab
// (CoreBridge "Order.aspx" history, COREBRIDGE_MAP.md §5): one chronological
// feed per order with actor-type coloring — staff black / customer green /
// vendor blue (system events gray) — plus a downloadable CSV. Kept
// React/base44-free so the classification + merge logic is unit-testable under
// Node (scripts/test-order-waterfall-history.mjs) and D-03/D-07 can wire any
// panel to the same rows.
//
// Event sources merged here:
//   OpportunityActivity rows — audit + CRM events; actor in `actor`, origin in
//     `source` (manual | auto_followup | system), type in `event_type`.
//   ProductActivity rows (B-12 product audit trail) — canonical `actor_type`.
//   Payment rows — portal payments carry `portal_source` ("added from Customer
//     Portal") → customer actor; staff-entered rows carry `created_by`.
//   Email events — `direction` inbound → customer, outbound → staff, automated
//     sends → system.

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const firstText = (...vals) => {
  for (const v of vals) {
    if (typeof v === "string" && clean(v)) return clean(v);
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
};

export const ORDER_HISTORY_ACTOR_TYPES = ["staff", "customer", "vendor", "system"];

export const ORDER_HISTORY_ACTOR_LABELS = {
  staff: "Staff",
  customer: "Customer",
  vendor: "Vendor",
  system: "System",
};

// Tailwind text-color classes matching the CB color rule (staff black /
// customer green / vendor blue); system rows render neutral gray.
export const ORDER_HISTORY_ACTOR_CSS = {
  staff: "text-black",
  customer: "text-green-600",
  vendor: "text-blue-600",
  system: "text-gray-500",
};

const ACTOR_TYPE_SYNONYMS = {
  staff: "staff",
  user: "staff",
  employee: "staff",
  internal: "staff",
  team: "staff",
  rep: "staff",
  salesperson: "staff",
  admin: "staff",
  csr: "staff",
  customer: "customer",
  client: "customer",
  portal: "customer",
  customer_portal: "customer",
  buyer: "customer",
  contact: "customer",
  vendor: "vendor",
  supplier: "vendor",
  subcontractor: "vendor",
  purchase_order: "vendor",
  po: "vendor",
  system: "system",
  auto: "system",
  automated: "system",
  automation: "system",
  auto_followup: "system",
  import: "system",
  imported: "system",
  sync: "system",
  scheduler: "system",
  scheduled: "system",
  workflow: "system",
  integration: "system",
};

const normalizeActorType = (value) => {
  const key = norm(value).replace(/[\s-]+/g, "_");
  return ACTOR_TYPE_SYNONYMS[key] || null;
};

// Origin strings that prove the actor class without an explicit actor_type:
// portal/customer origins → customer; automation origins → system; vendor
// origins → vendor. "manual" deliberately maps to nothing — a manual row is
// staff-entered by default, handled by the identity fallback below.
const SYSTEM_ORIGIN = /^(system|auto|automation|automated|auto_followup|import|imported|sync|scheduler|scheduled|workflow|integration|digest|notification_engine)/;
const CUSTOMER_ORIGIN = /(portal|customer|client|public)/;
const VENDOR_ORIGIN = /(vendor|supplier|purchase_order|\bpo\b|subcontract)/;

// Classify one history event into {actorType, cssClass}. Cascade, most
// authoritative first:
//   1. explicit actor_type field (ProductActivity canonical, incl. nested
//      details/meta copies + camelCase/actor_kind aliases)
//   2. explicit boolean/id markers (automated/system flags, vendor links)
//   3. email direction (inbound = customer, outbound = staff)
//   4. source/origin strings (portal → customer, system/auto → system,
//      vendor → vendor)
//   5. actor-name text markers ("Customer Portal", "system", "vendor")
//   6. fallback: any human identity present → staff; bare rows → system.
export function classifyOrderHistoryEvent(evt) {
  const row = evt && typeof evt === "object" ? evt : {};
  const details = row.details && typeof row.details === "object" ? row.details : {};
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};

  const explicit =
    normalizeActorType(row.actor_type) ||
    normalizeActorType(row.actorType) ||
    normalizeActorType(row.actor_kind) ||
    normalizeActorType(details.actor_type) ||
    normalizeActorType(meta.actor_type);
  if (explicit) return { actorType: explicit, cssClass: ORDER_HISTORY_ACTOR_CSS[explicit] };

  if (row.from_customer === true || row.customer_actor === true) {
    return { actorType: "customer", cssClass: ORDER_HISTORY_ACTOR_CSS.customer };
  }
  if (
    row.automated === true || row.is_automated === true ||
    row.system === true || row.is_system === true || row.system_event === true
  ) {
    return { actorType: "system", cssClass: ORDER_HISTORY_ACTOR_CSS.system };
  }
  if (clean(row.vendor_id) || clean(row.vendor_name) || clean(row.vendor)) {
    return { actorType: "vendor", cssClass: ORDER_HISTORY_ACTOR_CSS.vendor };
  }

  const direction = norm(row.direction || row.email_direction || row.message_direction);
  if (["inbound", "received", "incoming", "in", "from_customer"].includes(direction)) {
    return { actorType: "customer", cssClass: ORDER_HISTORY_ACTOR_CSS.customer };
  }
  if (["outbound", "sent", "outgoing", "out", "to_customer"].includes(direction)) {
    return { actorType: "staff", cssClass: ORDER_HISTORY_ACTOR_CSS.staff };
  }

  for (const source of [row.actor_type, row.source, row.origin, row.channel, row.portal_source]) {
    const s = norm(source);
    if (!s) continue;
    if (SYSTEM_ORIGIN.test(s)) return { actorType: "system", cssClass: ORDER_HISTORY_ACTOR_CSS.system };
    if (CUSTOMER_ORIGIN.test(s)) return { actorType: "customer", cssClass: ORDER_HISTORY_ACTOR_CSS.customer };
    if (VENDOR_ORIGIN.test(s)) return { actorType: "vendor", cssClass: ORDER_HISTORY_ACTOR_CSS.vendor };
  }

  const actor = norm(row.actor || row.actor_name || row.performed_by_name);
  if (actor) {
    if (CUSTOMER_ORIGIN.test(actor) || actor.includes("portal")) {
      return { actorType: "customer", cssClass: ORDER_HISTORY_ACTOR_CSS.customer };
    }
    if (SYSTEM_ORIGIN.test(actor) || actor === "auto") {
      return { actorType: "system", cssClass: ORDER_HISTORY_ACTOR_CSS.system };
    }
    if (VENDOR_ORIGIN.test(actor)) {
      return { actorType: "vendor", cssClass: ORDER_HISTORY_ACTOR_CSS.vendor };
    }
  }

  const identity = firstText(
    row.actor, row.actor_email, row.actor_name, row.created_by, row.updated_by,
    row.performed_by, row.performed_by_email, row.performed_by_name,
    row.sent_by, row.from, row.completed_by,
  );
  const actorType = identity ? "staff" : "system";
  return { actorType, cssClass: ORDER_HISTORY_ACTOR_CSS[actorType] };
}

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  ach: "ACH",
  financing: "Financing",
  other: "Other",
  credit_memo: "Credit Memo",
};

const moneyLabel = (v) => `$${Math.abs(num(v)).toFixed(2)}`;

// occurred_at || created_date — the sort key for the merged feed.
const eventTime = (row, ...extra) =>
  firstText(row?.occurred_at, row?.at, ...extra, row?.created_date, row?.created_on, row?.date, row?.timestamp);

function normalizeActivity(row, index) {
  const eventType = firstText(row?.event_type, row?.type, row?.action);
  return {
    _source: "activity",
    _index: index,
    raw: row,
    id: firstText(row?.id, `activity-${index}`),
    occurred_at: eventTime(row, row?.due_at),
    actor: firstText(row?.actor, row?.created_by, row?.completed_by, row?.assigned_to),
    event_type: eventType,
    label: firstText(row?.summary, row?.subject, eventType, "Activity"),
    amount: null,
    product: "",
  };
}

function normalizeProductEvent(row, index) {
  const eventType = firstText(row?.event_type, row?.action, row?.type, row?.field);
  const product = firstText(
    row?.product_name,
    row?.product_label,
    typeof row?.product === "string" ? row.product : row?.product?.description,
  );
  return {
    _source: "product",
    _index: index,
    raw: row,
    id: firstText(row?.id, `product-${index}`),
    occurred_at: eventTime(row),
    actor: firstText(row?.actor, row?.actor_name, row?.actor_email, row?.by, row?.created_by),
    event_type: eventType,
    label: firstText(
      row?.summary,
      row?.label,
      row?.description,
      [product, eventType].filter(Boolean).join(" — "),
      "Product event",
    ),
    amount: null,
    product,
  };
}

function normalizePayment(row, index) {
  const status = norm(row?.status);
  const method = PAYMENT_METHOD_LABELS[norm(row?.method)] || firstText(row?.method, "Payment");
  const amount = Number.isFinite(Number(row?.amount)) ? num(row.amount) : null;
  const prefix = status === "void"
    ? "Voided payment"
    : (status === "refunded" || (amount !== null && amount < 0))
      ? "Refund"
      : "Payment";
  return {
    _source: "payment",
    _index: index,
    raw: row,
    id: firstText(row?.id, `payment-${index}`),
    occurred_at: eventTime(row, row?.paid_date),
    actor: firstText(row?.portal_source, row?.created_by),
    event_type: status === "void" ? "payment_voided" : (status === "refunded" || (amount ?? 0) < 0) ? "refund" : "payment",
    label: `${prefix} — ${method} ${amount !== null ? moneyLabel(amount) : ""}`.trim(),
    amount,
    product: "",
  };
}

function normalizeEmail(row, index) {
  return {
    _source: "email",
    _index: index,
    raw: row,
    id: firstText(row?.id, `email-${index}`),
    occurred_at: eventTime(row, row?.sent_at, row?.received_at),
    actor: firstText(row?.actor, row?.from, row?.sent_by, row?.created_by, row?.to),
    event_type: "email",
    label: firstText(row?.subject, row?.label, row?.title, "Email"),
    amount: null,
    product: "",
  };
}

// Merge every history source into one chronological list. Rows are
// normalized to {id, source, occurred_at, actor, actor_type, cssClass,
// event_type, label, amount, product, raw} then sorted stably by
// occurred_at||created_date ascending — undated events sort last in entry
// order (Array#sort is stable; the index tiebreak makes it explicit).
export function mergeOrderHistorySources({
  activities = [],
  productEvents = [],
  payments = [],
  emails = [],
} = {}) {
  const sources = [
    ["activity", activities, normalizeActivity],
    ["product", productEvents, normalizeProductEvent],
    ["payment", payments, normalizePayment],
    ["email", emails, normalizeEmail],
  ];
  const rows = [];
  let seq = 0;
  for (const [source, list, normalize] of sources) {
    (Array.isArray(list) ? list : []).forEach((raw, i) => {
      if (!raw || typeof raw !== "object") return;
      const base = normalize(raw, i);
      const { actorType, cssClass } = classifyOrderHistoryEvent(raw);
      rows.push({
        ...base,
        id: base.id || `${source}-${i}`,
        source,
        actor_type: actorType,
        cssClass,
        _seq: seq++,
      });
    });
  }
  rows.sort((a, b) => {
    const ka = a.occurred_at || "\uffff";
    const kb = b.occurred_at || "\uffff";
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a._seq - b._seq;
  });
  return rows.map(({ _seq, _source, _index, ...row }) => row);
}

const csvCell = (value) => {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Downloadable order history: one row per merged event. `amount` is only set
// on payment rows; signed dollars fixed-2 so refunds export negative.
export function historyToCsv(rows) {
  const header = "occurred_at,actor_type,actor,source,event_type,label,amount";
  const lines = (Array.isArray(rows) ? rows : []).map((r) =>
    [
      r?.occurred_at,
      r?.actor_type,
      r?.actor,
      r?.source,
      r?.event_type,
      r?.label,
      r?.amount === null || r?.amount === undefined || r?.amount === ""
        ? ""
        : (Number.isFinite(Number(r.amount)) ? num(r.amount).toFixed(2) : ""),
    ].map(csvCell).join(",")
  );
  return [header, ...lines].join("\n");
}
