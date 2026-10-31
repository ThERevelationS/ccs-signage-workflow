// Pure queue-model helpers for the product queues. Kept React-free so the
// logic is unit-testable under Node.

const DAY = 86400000;
const norm = (v) => String(v || "").trim().toLowerCase();

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

export const DEFAULT_QUEUE_FILTERS = {
  status: "all", substatus: "", designer: "all", responsibility: "all",
  assignedTo: "all", category: "all", moduleKey: "all", duePreset: "all",
  search: "", pageSize: 50, includeFulfilled: false,
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
        ref: wo.corbridge_invoice_number || wo.title || wo.id,
        company: wo.client_name || "",
        productName: p.description || p.client_product_name || `Product ${idx + 1}`,
        status: p.operational_status || "none",
        substatus: p.operational_substatus || "",
        fulfillment: p.fulfillment_state || "none",
        proof: p.proof_status || "none",
        designer: p.designer || "",
        assignedTo: p.assigned_to || "",
        responsibility: p.responsibility || "",
        priority: Number(p.queue_priority) || 0,
        category: p.category || p.product_type || "",
        moduleKey: p.module_key || "",
        due: p[dueField] || "",
        hardDue: p.hard_due_date === true,
        statusChangedAt: p.operational_status_changed_at || "",
        bp: p.builder_product_id || "",
        stage: wo.current_stage || "",
        woDue: wo.project_install_date || "",
      });
    });
  }
  return rows;
}

export function filterQueueRows(rows = [], filters = DEFAULT_QUEUE_FILTERS, now = new Date()) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
  return (rows || []).filter((r) => {
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.substatus && !norm(r.substatus).includes(norm(f.substatus))) return false;
    if (f.designer !== "all" && r.designer !== f.designer) return false;
    if (f.responsibility !== "all" && r.responsibility !== f.responsibility) return false;
    if (f.assignedTo !== "all" && r.assignedTo !== f.assignedTo) return false;
    if (f.category !== "all" && r.category !== f.category) return false;
    if (f.moduleKey !== "all" && r.moduleKey !== f.moduleKey) return false;
    if (f.duePreset === "hard_due_only" && !r.hardDue) return false;
    if (!duePresetMatch(r.due || r.woDue, f.duePreset, now)) return false;
    const q = norm(f.search);
    if (q && ![r.ref, r.company, r.productName, r.substatus].some((field) => norm(field).includes(q))) return false;
    return true;
  });
}

export function sortQueueRows(rows = []) {
  return [...(rows || [])].sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return String(a.due || "9999").localeCompare(String(b.due || "9999"));
  });
}

const DUE_PRESET_KEYS = new Set(DUE_PRESETS.map((d) => d.key));

export function parseQueueFilters(searchParams) {
  const get = (k) => (searchParams?.get ? searchParams.get(k) : "") || "";
  const filters = { ...DEFAULT_QUEUE_FILTERS };
  const enumOr = (key, allowed, fallback) => {
    const v = norm(get(key));
    return allowed.includes(v) ? v : fallback;
  };
  // status is validated by the caller against OPERATIONAL_STATUS_VALUES; any
  // non-empty value passes through so unknown values simply filter to nothing.
  const status = norm(get("status"));
  if (status && status !== "all") filters.status = status;
  filters.substatus = get("substatus").trim();
  filters.designer = get("designer").trim() || "all";
  filters.responsibility = get("responsibility").trim() || "all";
  filters.assignedTo = get("assignedTo").trim() || "all";
  filters.category = get("category").trim() || "all";
  filters.moduleKey = get("moduleKey").trim() || "all";
  const due = enumOr("due", [...DUE_PRESET_KEYS], "all");
  filters.duePreset = due;
  filters.search = get("q").trim();
  const size = Number(get("size"));
  if (PAGE_SIZES.includes(size)) filters.pageSize = size;
  filters.includeFulfilled = get("fulfilled") === "1";
  return filters;
}

export function serializeQueueFilters(filters = {}) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
  const out = {};
  if (f.status !== DEFAULT_QUEUE_FILTERS.status) out.status = f.status;
  if (f.substatus) out.substatus = f.substatus;
  if (f.designer !== "all") out.designer = f.designer;
  if (f.responsibility !== "all") out.responsibility = f.responsibility;
  if (f.assignedTo !== "all") out.assignedTo = f.assignedTo;
  if (f.category !== "all") out.category = f.category;
  if (f.moduleKey !== "all") out.moduleKey = f.moduleKey;
  if (f.duePreset !== "all") out.due = f.duePreset;
  if (f.search) out.q = f.search;
  if (f.pageSize !== DEFAULT_QUEUE_FILTERS.pageSize) out.size = String(f.pageSize);
  if (f.includeFulfilled) out.fulfilled = "1";
  return out;
}

// Whole days past the local due date; 0 when not overdue or undated.
export function overdueDays(row, now = new Date()) {
  const due = parseLocalDate(row?.due || row?.woDue);
  if (!due) return 0;
  const diff = startOfDay(now).getTime() - startOfDay(due).getTime();
  return diff > 0 ? Math.round(diff / DAY) : 0;
}

export function daysInStatus(row, now = new Date()) {
  const changed = parseLocalDate(row?.statusChangedAt);
  if (!changed) return null;
  const diff = now.getTime() - changed.getTime();
  return Math.max(0, Math.floor(diff / DAY));
}
