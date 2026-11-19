// Pure queue-model helpers for the product queues. Kept React-free so the
// logic is unit-testable under Node.

const DAY = 86400000;
const norm = (v) => String(v || "").trim().toLowerCase();
// Positive finite number rounded to an int; anything else reads as 0 (unset).
const queuePosNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

export const FULFILLED_STATES = ["picked_up", "installed", "shipped", "delivered"];

export const FULFILLMENT_LABELS = {
  awaiting_pickup: "Awaiting Pickup", awaiting_installation: "Awaiting Installation",
  awaiting_shipping: "Awaiting Shipping", awaiting_delivery: "Awaiting Delivery",
  picked_up: "Picked Up", installed: "Installed", shipped: "Shipped", delivered: "Delivered",
};

export const DUE_PRESETS = [
  { key: "all", label: "All" },
  { key: "past_due", label: "Past Due" },
  { key: "past_due_today", label: "Past Due & Due Today" },
  { key: "past_due_tomorrow", label: "Past Due & Due Tomorrow" },
  { key: "today", label: "Due Today" },
  { key: "tomorrow", label: "Due Tomorrow" },
  { key: "this_week", label: "Due this Week" },
  { key: "next_7", label: "Due next 7 Days" },
  { key: "hard_due_only", label: "Hard Due Dates Only" },
];

export const PAGE_SIZES = [15, 30, 50, 100, 250];

// Row sort options (B-05). "default" keeps the legacy queue order
// (queue priority desc, then earliest due); "priority" is the CB 1-99
// line priority — ascending, unset last; "due" is pure earliest-due-first.
export const QUEUE_SORTS = [
  { key: "default", label: "Queue order" },
  { key: "priority", label: "Priority (1-99)" },
  { key: "due", label: "Due date" },
];

export const DEFAULT_QUEUE_FILTERS = {
  status: "all", substatus: "", designer: "all", responsibility: "all",
  assignedTo: "all", category: "all", moduleKey: "all", duePreset: "all",
  search: "", pageSize: 50, includeFulfilled: false, sort: "default",
};

// "YYYY-MM-DD" must mean that calendar day in local time, not UTC midnight.
export function parseLocalDate(str) {
  const v = String(str || "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfWeek = (d) => { const x = endOfDay(d); x.setDate(x.getDate() + (7 - x.getDay())); return x; };

export function duePresetMatch(dueStr, preset, now = new Date()) {
  if (!dueStr) return preset === "all" || preset === "hard_due_only";
  const due = parseLocalDate(dueStr);
  if (!due) return preset === "all";
  const sod = startOfDay(now), eod = endOfDay(now);
  const eot = endOfDay(new Date(now.getTime() + DAY));
  switch (preset) {
    case "all": return true;
    case "past_due": return due < sod;
    case "past_due_today": return due <= eod;
    case "past_due_tomorrow": return due <= eot;
    case "today": return due >= sod && due <= eod;
    case "tomorrow": return due >= startOfDay(new Date(now.getTime() + DAY)) && due <= eot;
    case "this_week": return due >= sod && due <= endOfWeek(now);
    case "next_7": return due >= sod && due <= endOfDay(new Date(now.getTime() + 7 * DAY));
    default: return true;
  }
}

// Flatten work orders into CoreBridge-style queue rows: one row per product.
// Deleted and completed work orders never contribute rows; fulfilled products
// are excluded unless includeFulfilled is set.
export function flattenQueueRows(workOrders = [], { dueField = "product_due_date", includeFulfilled = false } = {}) {
  const rows = [];
  for (const wo of workOrders || []) {
    if (!wo?.id || wo.deleted === true || wo.completed === true) continue;
    const products = Array.isArray(wo.products) ? wo.products : [];
    products.forEach((p, idx) => {
      if (!p) return;
      if (!includeFulfilled && FULFILLED_STATES.includes(norm(p.fulfillment_state))) return;
      rows.push({
        workOrderId: wo.id,
        product: p,
        productId: p.id || `${wo.id}-${idx}`,
        editable: Boolean(p.id),
        position: `${idx + 1}/${products.length}`,
        positionIndex: idx + 1,
        total_products: products.length,
        totalProducts: products.length,
        ref: wo.corbridge_invoice_number || wo.title || wo.id,
        company: wo.client_name || "",
        customerId: wo.customer_id || "",
        productName: p.description || p.client_product_name || `Product ${idx + 1}`,
        status: p.operational_status || "none",
        substatus: p.operational_substatus || "",
        fulfillment: p.fulfillment_state || "none",
        proof: p.proof_status || "none",
        proofVersion: Number(p.proof_version) || 0,
        proofApprovedVersion: Number(p.proof_approved_version) || 0,
        designer: p.designer || "",
        assignedTo: p.assigned_to || "",
        responsibility: p.responsibility || "",
        responsibilityColor: String(p.responsibility_color || "").trim(),
        // C-02/B-05: the CB 1-99 `priority` field wins when set (A-17);
        // legacy `queue_priority` remains the fallback so older rows still
        // surface an ordering signal. `queuePriority` stays raw for callers
        // that need the queue-order field specifically.
        priority: queuePosNum(p.priority) || queuePosNum(p.queue_priority),
        queuePriority: Number(p.queue_priority) || 0,
        category: p.category || p.product_type || "",
        moduleKey: p.module_key || "",
        due: p[dueField] || "",
        // B-06: both due dates ride the row; `dueField` only picks which one
        // `due` (and therefore the due-preset filter) reads.
        designDue: p.design_due_date || "",
        productDue: p.product_due_date || "",
        hardDue: p.hard_due_date === true,
        statusChangedAt: p.operational_status_changed_at || "",
        bp: p.builder_product_id || "",
        stage: wo.current_stage || "",
        woDue: wo.project_install_date || "",
        // CoreBridge filter keys (QueueFilterBar emits machine/part/
        // salesperson/enteredBy + duePreset "rush"). No dedicated fields exist
        // on products yet — map the honest closest columns and accept explicit
        // flags the moment they land. A "rush" quick-tag or substatus counts
        // as the rush signal today.
        machine: p.machine || p.machine_name || p.assigned_machine || "",
        part: p.part || p.part_name || "",
        salesperson: wo.sales_rep || wo.salesperson || wo.salesperson_email || "",
        enteredBy: wo.created_by || wo.entered_by || "",
        rush: p.is_rush === true || p.rush === true ||
          wo.is_rush === true || wo.rush === true ||
          norm(p.priority_label) === "rush" || norm(wo.order_priority) === "rush" ||
          norm(p.operational_substatus).includes("rush") ||
          (Array.isArray(p.quick_tags) && p.quick_tags.some((t) => norm(t).includes("rush"))),
      });
    });
  }
  return rows;
}

// C-08 — a possibly multi-valued closed-enum filter ("a,b" = a OR b). An
// empty/absent value or an "all" token anywhere means no filter. A single
// value is a one-token list, so scalar callers see identical behavior; the
// comma-list form only ever reaches here from the URL parser (parseQueueFilters)
// or a hand-built state — "all" wins outright either way.
const enumFilterTokens = (v) => String(v ?? "").split(",").map((t) => t.trim()).filter(Boolean);
const enumCellMatch = (cell, filterValue) => {
  const toks = enumFilterTokens(filterValue);
  if (!toks.length || toks.includes("all")) return true;
  return toks.includes(String(cell ?? ""));
};

export function filterQueueRows(rows = [], filters = DEFAULT_QUEUE_FILTERS, now = new Date()) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
  return (rows || []).filter((r) => {
    if (!enumCellMatch(r.status, f.status)) return false;
    if (f.substatus && !norm(r.substatus).includes(norm(f.substatus))) return false;
    if (f.designer !== "all" && r.designer !== f.designer) return false;
    if (f.responsibility !== "all" && r.responsibility !== f.responsibility) return false;
    if (f.assignedTo !== "all" && r.assignedTo !== f.assignedTo) return false;
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.moduleKey !== "all" && r.moduleKey !== f.moduleKey) return false;
    // CB extensions — exact-match keys (absent key === "all", i.e. no-op).
    if ((f.machine ?? "all") !== "all" && r.machine !== f.machine) return false;
    if ((f.part ?? "all") !== "all" && r.part !== f.part) return false;
    if ((f.salesperson ?? "all") !== "all" && r.salesperson !== f.salesperson) return false;
    if ((f.enteredBy ?? "all") !== "all" && r.enteredBy !== f.enteredBy) return false;
    // C-08 extensions — fulfillment/proof are closed enums and accept comma
    // lists ("a,b" = OR); scalar states compare exactly as before.
    if (!enumCellMatch(r.fulfillment, f.fulfillment)) return false;
    if (!enumCellMatch(r.proof, f.proof)) return false;
    if (f.duePreset === "hard_due_only" && !r.hardDue) return false;
    // "rush" is a row flag, not a date window — an undated rush job still
    // matches. It can arrive via the CB "Rush Jobs" due preset or the
    // standalone rush flag (?rush=1); both AND against the other filters.
    if ((f.duePreset === "rush" || f.rush === true) && !r.rush) return false;
    if (f.duePreset !== "rush" && !duePresetMatch(r.due || r.woDue, f.duePreset, now)) return false;
    const q = norm(f.search);
    if (q && ![r.ref, r.company, r.productName, r.substatus].some((field) => norm(field).includes(q))) return false;
    return true;
  });
}

export function sortQueueRows(rows = [], sortKey = "default") {
  const list = [...(rows || [])];
  const dueCmp = (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999"));
  if (sortKey === "priority") {
    // B-05 — CB 1-99 line priority: ascending (1 first); unset rows always
    // last and keep their own earliest-due order; due date breaks ties.
    return list.sort((a, b) => {
      const pa = queuePosNum(a.priority), pb = queuePosNum(b.priority);
      if ((pa > 0) !== (pb > 0)) return pa > 0 ? -1 : 1;
      if (pa !== pb) return pa - pb;
      return dueCmp(a, b);
    });
  }
  if (sortKey === "due") {
    return list.sort((a, b) => dueCmp(a, b) || ((b.priority || 0) - (a.priority || 0)));
  }
  return list.sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return dueCmp(a, b);
  });
}

const DUE_PRESET_KEYS = new Set(DUE_PRESETS.map((d) => d.key));
const QUEUE_SORT_KEYS = new Set(QUEUE_SORTS.map((s) => s.key));
// "rush" is the CB "Rush Jobs" preset — QueueFilterBar emits it on duePreset
// but it lives outside DUE_PRESETS (a row-flag filter, not a date window).
const DUE_PARAM_KEYS = new Set([...DUE_PRESET_KEYS, "rush"]);
// Proof values mirror PROOF_STATUS_VALUES (workOrderConversion) — the model
// stays import-free so the set is duplicated here; keep in sync.
const PROOF_FILTER_KEYS = new Set(["none", "draft", "sent", "awaiting_approval", "approved", "revision_requested"]);
const FULFILLMENT_FILTER_KEYS = new Set(["none", ...Object.keys(FULFILLMENT_LABELS)]);
// `assigned` carries the my-queue marker only — MY_QUEUE_TOKEN ("me") from
// myQueueModel; a literal assignee belongs in `assignedTo`.
const ASSIGNED_TOKENS = new Set(["me"]);

// ── C-08: full filter state <-> URL query params ─────────────────────────
// Every filter key serializes to a query param so a queue URL is
// deep-linkable and back-safe.
//
//   key              param        rule
//   search           q            trimmed text
//   status           status       caller-validated tokens, comma-list OR,
//                                 "all" wildcard anywhere
//   substatus        substatus    trimmed text (substring match)
//   designer         designer     select value or "all"
//   responsibility   responsibility "
//   assignedTo       assignedTo   "
//   category         category     "
//   moduleKey        moduleKey    "
//   machine          machine      " (CB extension key)
//   part             part         "
//   salesperson      salesperson  "
//   enteredBy        enteredBy (+ entered_by read alias)  "
//   duePreset        due          DUE_PRESETS ∪ {rush}
//   fulfillment      fulfillment  FULFILLMENT_LABELS ∪ {none}, comma-list OR
//   proof            proof        PROOF set, comma-list OR
//   rush             rush         "1"/"true" flag
//   assigned         assigned     {"me"} — myQueueModel MY_QUEUE_TOKEN
//   sort             sort         QUEUE_SORTS
//   pageSize         size         PAGE_SIZES
//   includeFulfilled fulfilled    "1"
//   view             view         verbatim preserved token (e.g. named view)
//
// Conventions: only non-default values serialize (serialize(defaults) ===
// {}). Multi-value keys use comma lists (the CustomFilterDialog convention)
// and ALSO accept repeated params on parse — restricted to closed-enum keys
// (status/fulfillment/proof) so free-select keys like person names
// ("Last, First") are never corrupted by a comma. `?view=`/`?assigned=me`
// are preserved pass-through tokens. `queue` is page-owned (the
// ProductQueues tab selector) and deliberately never consumed here —
// components keep it via their URLSearchParams merge.

// Param tokens for a key: every repeated value, each split on commas —
// both multi-value spellings parse identically.
const paramTokens = (searchParams, key) => {
  const raw = searchParams?.getAll
    ? searchParams.getAll(key)
    : [searchParams?.get ? searchParams.get(key) : ""];
  return (raw || [])
    .flatMap((v) => String(v || "").split(","))
    .map((s) => s.trim())
    .filter(Boolean);
};

export function parseQueueFilters(searchParams) {
  const get = (k) => (searchParams?.get ? searchParams.get(k) : "") || "";
  const filters = { ...DEFAULT_QUEUE_FILTERS };
  const enumOr = (key, allowed, fallback) => {
    const v = norm(get(key));
    return allowed.includes(v) ? v : fallback;
  };
  // Scalar select key — trimmed, "all" or blank reads as no filter.
  const scalarOr = (key) => {
    const v = get(key).trim();
    return v && v !== "all" ? v : "all";
  };
  // Closed-enum multi key — normalized tokens, deduped, "all" anywhere wins
  // outright; unknown tokens are dropped and a fully-unknown list falls back.
  const enumMulti = (key, allowed) => {
    const toks = paramTokens(searchParams, key).map(norm);
    if (!toks.length || toks.includes("all")) return "all";
    const valid = [...new Set(toks.filter((t) => allowed.has(t)))];
    return valid.length ? valid.join(",") : "all";
  };
  // status is validated by the caller against OPERATIONAL_STATUS_VALUES; any
  // non-empty value passes through so unknown values simply filter to
  // nothing. Multi-value: comma lists / repeated params OR together.
  const statusToks = paramTokens(searchParams, "status").map(norm);
  filters.status = statusToks.length && !statusToks.includes("all")
    ? [...new Set(statusToks)].join(",")
    : "all";
  filters.substatus = get("substatus").trim();
  filters.designer = scalarOr("designer");
  filters.responsibility = scalarOr("responsibility");
  filters.assignedTo = scalarOr("assignedTo");
  filters.category = scalarOr("category");
  filters.moduleKey = scalarOr("moduleKey");
  // CB extension keys — absent param === "all" (filterQueueRows reads them
  // with ?? "all"). Emitted only when non-default so parse output stays a
  // minimal, round-trip-stable object.
  const machine = scalarOr("machine");
  if (machine !== "all") filters.machine = machine;
  const part = scalarOr("part");
  if (part !== "all") filters.part = part;
  const salesperson = scalarOr("salesperson");
  if (salesperson !== "all") filters.salesperson = salesperson;
  // `entered_by` is accepted as a snake-case alias; camelCase wins when both
  // are present.
  const enteredBy = scalarOr("enteredBy");
  const enteredByAlias = scalarOr("entered_by");
  if (enteredBy !== "all" || enteredByAlias !== "all") {
    filters.enteredBy = enteredBy !== "all" ? enteredBy : enteredByAlias;
  }
  const due = enumOr("due", [...DUE_PARAM_KEYS], "all");
  filters.duePreset = due;
  filters.sort = enumOr("sort", [...QUEUE_SORT_KEYS], DEFAULT_QUEUE_FILTERS.sort);
  filters.search = get("q").trim();
  const size = Number(get("size"));
  if (PAGE_SIZES.includes(size)) filters.pageSize = size;
  filters.includeFulfilled = get("fulfilled") === "1";
  // C-08 additions — all absent-by-default, emitted only when meaningful.
  const fulfillment = enumMulti("fulfillment", FULFILLMENT_FILTER_KEYS);
  if (fulfillment !== "all") filters.fulfillment = fulfillment;
  const proof = enumMulti("proof", PROOF_FILTER_KEYS);
  if (proof !== "all") filters.proof = proof;
  if (get("rush") === "1" || norm(get("rush")) === "true") filters.rush = true;
  const assigned = norm(get("assigned"));
  if (ASSIGNED_TOKENS.has(assigned)) filters.assigned = assigned;
  const view = get("view").trim();
  if (view) filters.view = view;
  return filters;
}

export function serializeQueueFilters(filters = {}) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
  const out = {};
  // Non-"all"/non-blank select value → trimmed param; "all"/blank → omitted.
  const sel = (v) => {
    const s = String(v ?? "").trim();
    return s && s !== "all" ? s : "";
  };
  if (f.status !== DEFAULT_QUEUE_FILTERS.status) out.status = f.status;
  if (f.substatus) out.substatus = f.substatus;
  if (f.designer !== "all") out.designer = f.designer;
  if (f.responsibility !== "all") out.responsibility = f.responsibility;
  if (f.assignedTo !== "all") out.assignedTo = f.assignedTo;
  if (f.category !== "all") out.category = f.category;
  if (f.moduleKey !== "all") out.moduleKey = f.moduleKey;
  for (const k of ["machine", "part", "salesperson", "enteredBy", "fulfillment", "proof"]) {
    const v = sel(f[k]);
    if (v) out[k] = v;
  }
  if (f.duePreset !== "all") out.due = f.duePreset;
  if (f.rush === true) out.rush = "1";
  if (f.sort && f.sort !== DEFAULT_QUEUE_FILTERS.sort) out.sort = f.sort;
  if (f.search) out.q = f.search;
  if (f.pageSize !== DEFAULT_QUEUE_FILTERS.pageSize) out.size = String(f.pageSize);
  if (f.includeFulfilled) out.fulfilled = "1";
  // Preserved tokens — the my-queue marker serializes to its canonical
  // spelling; a view token round-trips verbatim.
  if (norm(f.assigned) === "me") out.assigned = "me";
  if (String(f.view ?? "").trim()) out.view = String(f.view).trim();
  return out;
}

// Whole days past a single local due date (B-06: design_due_date and
// product_due_date flag overdue independently); 0 when not overdue/undated.
export function daysPastDue(dateStr, now = new Date()) {
  const due = parseLocalDate(dateStr);
  if (!due) return 0;
  const diff = startOfDay(now).getTime() - startOfDay(due).getTime();
  return diff > 0 ? Math.round(diff / DAY) : 0;
}

// Whole days past the local due date; 0 when not overdue or undated.
export function overdueDays(row, now = new Date()) {
  return daysPastDue(row?.due || row?.woDue, now);
}

export function daysInStatus(row, now = new Date()) {
  const changed = parseLocalDate(row?.statusChangedAt);
  if (!changed) return null;
  const diff = now.getTime() - changed.getTime();
  return Math.max(0, Math.floor(diff / DAY));
}