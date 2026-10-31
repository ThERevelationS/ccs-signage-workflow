import React, { useMemo, useState, useCallback } from "react";
import { useAllWorkOrders, refreshAllWorkOrders } from "@/lib/workOrderCache";
import {
  OPERATIONAL_STATUS_CUSTOMER_LABELS,
  OPERATIONAL_STATUS_VALUES,
  transitionProductAndBuilderStatus,
} from "@/components/estimator/workOrderConversion";

const norm = (v) => String(v || "").trim().toLowerCase();
const DAY = 86400000;

const STATUS_OPTIONS = OPERATIONAL_STATUS_VALUES.filter((s) => s !== "none");
const FULFILLMENT_OPTIONS = ["awaiting_pickup", "awaiting_installation", "awaiting_shipping", "awaiting_delivery", "picked_up", "installed", "shipped", "delivered"];
const PROOF_OPTIONS = ["draft", "sent", "awaiting_approval", "approved", "revision_requested"];

const DUE_PRESETS = [
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

const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfWeek = (d) => { const x = endOfDay(d); x.setDate(x.getDate() + (7 - x.getDay())); return x; };

function duePresetMatch(dueStr, preset, now) {
  if (!dueStr) return preset === "all" || preset === "hard_due_only";
  const due = new Date(dueStr);
  if (Number.isNaN(due.getTime())) return preset === "all";
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

const FULFILLMENT_LABELS = {
  awaiting_pickup: "Awaiting Pickup", awaiting_installation: "Awaiting Installation",
  awaiting_shipping: "Awaiting Shipping", awaiting_delivery: "Awaiting Delivery",
  picked_up: "Picked Up", installed: "Installed", shipped: "Shipped", delivered: "Delivered",
};

const badge = (text, tone) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{text}</span>
);
const TONE = {
  estimate: "bg-sky-100 text-sky-800", wip: "bg-amber-100 text-amber-800",
  built: "bg-violet-100 text-violet-800", done: "bg-emerald-100 text-emerald-800",
  blocked: "bg-rose-100 text-rose-800", muted: "bg-gray-100 text-gray-600",
};
const statusTone = (s) => {
  s = norm(s);
  if (["awaiting_customer_action", "awaiting_proof_approval"].includes(s)) return TONE.blocked;
  if (["proof_approved", "in_production", "quality_control"].includes(s)) return TONE.wip;
  if (["permitting", "site_survey", "order_review", "design_review", "in_design"].includes(s)) return TONE.estimate;
  return TONE.muted;
};

// Flatten work orders into CoreBridge-style queue rows: one row per product.
export function flattenQueueRows(workOrders = [], { dueField = "product_due_date" } = {}) {
  const rows = [];
  for (const wo of workOrders || []) {
    if (!wo?.id || wo.deleted === true) continue;
    const products = Array.isArray(wo.products) ? wo.products : [];
    products.forEach((p, idx) => {
      if (!p) return;
      rows.push({
        workOrderId: wo.id,
        product: p,
        productId: p.id || `${wo.id}-${idx}`,
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
        stage: wo.current_stage || "",
        woDue: wo.project_install_date || "",
      });
    });
  }
  return rows;
}

const EMPTY_FILTERS = {
  status: "all", substatus: "", designer: "all", responsibility: "all",
  assignedTo: "all", category: "all", moduleKey: "all", duePreset: "all",
  search: "", pageSize: 50,
};

export default function ProductQueue({
  title = "Product Queue",
  dueField = "product_due_date",
  stageFilter = null, // e.g. ["design","production"] limits which work orders contribute rows
  statusDefault = "all",
  onOpenWorkOrder = null,
}) {
  const { data: workOrders = [], isFetched } = useAllWorkOrders();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: statusDefault });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");
  const now = useMemo(() => new Date(), []);

  const allRows = useMemo(() => {
    let rows = flattenQueueRows(workOrders, { dueField });
    if (stageFilter?.length) rows = rows.filter((r) => stageFilter.includes(r.stage));
    return rows;
  }, [workOrders, dueField, stageFilter]);

  const distinct = useCallback((key) =>
    [...new Set(allRows.map((r) => r[key]).filter(Boolean))].sort(), [allRows]);

  const filtered = useMemo(() => allRows.filter((r) => {
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.substatus && !norm(r.substatus).includes(norm(filters.substatus))) return false;
    if (filters.designer !== "all" && r.designer !== filters.designer) return false;
    if (filters.responsibility !== "all" && r.responsibility !== filters.responsibility) return false;
    if (filters.assignedTo !== "all" && r.assignedTo !== filters.assignedTo) return false;
    if (filters.category !== "all" && r.category !== filters.category) return false;
    if (filters.moduleKey !== "all" && r.moduleKey !== filters.moduleKey) return false;
    if (filters.duePreset === "hard_due_only" && !r.hardDue) return false;
    if (!duePresetMatch(r.due || r.woDue, filters.duePreset, now)) return false;
    const q = norm(filters.search);
    if (q && ![r.ref, r.company, r.productName, r.substatus].some((f) => norm(f).includes(q))) return false;
    return true;
  }).sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return String(a.due || "9999").localeCompare(String(b.due || "9999"));
  }), [allRows, filters, now]);

  const paged = filtered.slice(page * filters.pageSize, (page + 1) * filters.pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));

  const set = (key, value) => { setPage(0); setFilters((f) => ({ ...f, [key]: value })); };

  const transition = async (row, patch) => {
    const key = `${row.workOrderId}:${row.productId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setError("");
    try {
      await transitionProductAndBuilderStatus({
        workOrderId: row.workOrderId, product: row.product, patch, label: "Queue status",
      });
      refreshAllWorkOrders();
    } catch (e) {
      setError(e?.message || "Status update failed.");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const sel = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
  const lab = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-gray-500">{filtered.length} of {allRows.length} products</span>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2">
        <label className="flex flex-col gap-0.5"><span className={lab}>Status</span>
          <select className={sel} value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="all">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Substatus</span>
          <input className={sel} placeholder="contains…" value={filters.substatus} onChange={(e) => set("substatus", e.target.value)} /></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Designer</span>
          <select className={sel} value={filters.designer} onChange={(e) => set("designer", e.target.value)}>
            <option value="all">All</option>{distinct("designer").map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Responsibility</span>
          <select className={sel} value={filters.responsibility} onChange={(e) => set("responsibility", e.target.value)}>
            <option value="all">All</option>{distinct("responsibility").map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Assigned To</span>
          <select className={sel} value={filters.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
            <option value="all">All</option>{distinct("assignedTo").map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Category</span>
          <select className={sel} value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="all">All</option>{distinct("category").map((d) => <option key={d} value={d}>{d}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Due</span>
          <select className={sel} value={filters.duePreset} onChange={(e) => set("duePreset", e.target.value)}>
            {DUE_PRESETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Search</span>
          <input className={sel} value={filters.search} onChange={(e) => set("search", e.target.value)} /></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Per page</span>
          <select className={sel} value={filters.pageSize} onChange={(e) => set("pageSize", Number(e.target.value))}>
            {[15, 30, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
      </div>

      {error && <div className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>}

      <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-100 text-[11px] uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5">Company</th><th className="px-2 py-1.5">Product Name</th>
              <th className="px-2 py-1.5">Status / Substatus</th><th className="px-2 py-1.5">Proof</th>
              <th className="px-2 py-1.5">Fulfillment</th><th className="px-2 py-1.5">Resp.</th>
              <th className="px-2 py-1.5">Due</th><th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const key = `${r.workOrderId}:${r.productId}`;
              const isBusy = !!busy[key];
              return (
                <tr key={key} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button className="text-sky-700 hover:underline" onClick={() => onOpenWorkOrder?.(r.workOrderId)}>{r.ref}</button>
                    <div className="text-[10px] text-gray-400">{r.position}</div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.moduleKey || "—"}</td>
                  <td className="max-w-[140px] truncate px-2 py-1.5">{r.company}</td>
                  <td className="max-w-[200px] truncate px-2 py-1.5" title={r.productName}>{r.productName}</td>
                  <td className="px-2 py-1.5">
                    {badge(OPERATIONAL_STATUS_CUSTOMER_LABELS[r.status] || r.status || "none", statusTone(r.status))}
                    {r.substatus && <div className="mt-0.5 text-[10px] italic text-gray-500">{r.substatus}</div>}
                    {r.hardDue && <div className="mt-0.5 text-[10px] font-semibold text-rose-600">HARD DUE</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={isBusy} value={r.proof === "none" ? "" : r.proof}
                      onChange={(e) => transition(r, { proofStatus: e.target.value })}>
                      <option value="">—</option>
                      {PROOF_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={isBusy} value={r.fulfillment === "none" ? "" : r.fulfillment}
                      onChange={(e) => transition(r, { fulfillmentState: e.target.value })}>
                      <option value="">—</option>
                      {FULFILLMENT_OPTIONS.map((o) => <option key={o} value={o}>{FULFILLMENT_LABELS[o]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.responsibility || r.assignedTo || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{r.due ? new Date(r.due).toLocaleDateString() : <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={isBusy} value=""
                      onChange={(e) => { if (e.target.value) transition(r, { operationalStatus: e.target.value }); e.target.value = ""; }}>
                      <option value="">Set status…</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s}</option>)}
                    </select>
                    {isBusy && <span className="ml-1 text-[10px] text-gray-400">saving…</span>}
                  </td>
                </tr>
              );
            })}
            {!paged.length && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">
                {isFetched ? "No products match these filters." : "Loading…"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Page {page + 1} of {pages}</span>
        <div className="flex gap-1">
          <button className={sel} disabled={page === 0} onClick={() => setPage(0)}>First</button>
          <button className={sel} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className={sel} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          <button className={sel} disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button>
        </div>
      </div>
    </div>
  );
}
