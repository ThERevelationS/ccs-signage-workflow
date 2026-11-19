import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAllWorkOrders, refreshAllWorkOrders } from "@/lib/workOrderCache";
import { useAuth } from "@/components/auth/EmailGate";
import {
  OPERATIONAL_STATUS_CUSTOMER_LABELS,
  OPERATIONAL_STATUS_VALUES,
  PROOF_STATUS_VALUES,
  FULFILLMENT_STATE_VALUES,
  transitionProductAndBuilderStatus,
} from "@/components/estimator/workOrderConversion";
import {
  DUE_PRESETS,
  FULFILLMENT_LABELS,
  PAGE_SIZES,
  DEFAULT_QUEUE_FILTERS,
  flattenQueueRows,
  filterQueueRows,
  sortQueueRows,
  parseQueueFilters,
  serializeQueueFilters,
  overdueDays,
  daysInStatus,
  parseLocalDate,
} from "./productQueueModel";

export { flattenQueueRows };

const norm = (v) => String(v || "").trim().toLowerCase();

const STATUS_OPTIONS = OPERATIONAL_STATUS_VALUES.filter((s) => s !== "none");
const FULFILLMENT_OPTIONS = FULFILLMENT_STATE_VALUES.filter((s) => s !== "none");
const PROOF_OPTIONS = PROOF_STATUS_VALUES.filter((s) => s !== "none");

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

const NO_ID_TOOLTIP = "Product has no id — reopen the Work Order to repair it";

const dateInputValue = (v) => String(v || "").slice(0, 10);

function RowEditor({ row, actor, onSaved, disabled }) {
  const p = row.product || {};
  const [form, setForm] = useState({
    operationalSubstatus: p.operational_substatus || "",
    designer: p.designer || "",
    assignedTo: p.assigned_to || "",
    responsibility: p.responsibility || "",
    queuePriority: Number.isFinite(Number(p.queue_priority)) ? Number(p.queue_priority) : 0,
    designDueDate: dateInputValue(p.design_due_date),
    productDueDate: dateInputValue(p.product_due_date),
    hardDueDate: p.hard_due_date === true,
  });
  const [overrideHardDue, setOverrideHardDue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const inp = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
  const lab = "text-[10px] font-semibold uppercase tracking-wide text-gray-500";

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await transitionProductAndBuilderStatus({
        workOrderId: row.workOrderId,
        product: row.product,
        actor,
        overrideHardDue,
        patch: { ...form, queuePriority: Number(form.queuePriority) },
        label: "Queue product edit",
      });
      refreshAllWorkOrders();
      onSaved?.();
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-t border-gray-100 bg-sky-50/40">
      <td colSpan={10} className="px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5"><span className={lab}>Substatus</span>
            <input className={inp} disabled={disabled} value={form.operationalSubstatus} onChange={(e) => set("operationalSubstatus", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Designer</span>
            <input className={inp} disabled={disabled} value={form.designer} onChange={(e) => set("designer", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Assigned To</span>
            <input className={inp} disabled={disabled} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Responsibility</span>
            <input className={inp} disabled={disabled} value={form.responsibility} onChange={(e) => set("responsibility", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Priority (0-99)</span>
            <input className={inp} type="number" min="0" max="99" disabled={disabled} value={form.queuePriority} onChange={(e) => set("queuePriority", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Design Due</span>
            <input className={inp} type="date" disabled={disabled} value={form.designDueDate} onChange={(e) => set("designDueDate", e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className={lab}>Product Due</span>
            <input className={inp} type="date" disabled={disabled} value={form.productDueDate} onChange={(e) => set("productDueDate", e.target.value)} /></label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" disabled={disabled} checked={form.hardDueDate} onChange={(e) => set("hardDueDate", e.target.checked)} />
            Hard due date</label>
          {p.hard_due_date === true && (
            <label className="flex items-center gap-1 text-xs text-rose-700">
              <input type="checkbox" disabled={disabled} checked={overrideHardDue} onChange={(e) => setOverrideHardDue(e.target.checked)} />
              Override hard due date</label>
          )}
          <button className={`${inp} font-semibold text-sky-700`} disabled={disabled || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}
      </td>
    </tr>
  );
}

export default function ProductQueue({
  title = "Product Queue",
  dueField = "product_due_date",
  stageFilter = null, // e.g. ["design","production"] limits which work orders contribute rows
  statusDefault = "all",
  onOpenWorkOrder = null,
}) {
  const { data: workOrders = [], isFetched } = useAllWorkOrders();
  const { currentUser } = useAuth();
  const actor = String(currentUser?.email || "").trim();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [expanded, setExpanded] = useState({});
  const now = useMemo(() => new Date(), []);

  // Filters live in the URL so a queue view can be shared or bookmarked.
  const filters = useMemo(() => {
    const parsed = parseQueueFilters(searchParams);
    if (statusDefault !== "all" && !searchParams.get("status")) parsed.status = statusDefault;
    return parsed;
  }, [searchParams, statusDefault]);

  const setFilters = useCallback((updater) => {
    setPage(0);
    setSearchParams((prev) => {
      const nextFilters = typeof updater === "function" ? updater(parseQueueFilters(prev)) : updater;
      const next = new URLSearchParams(prev);
      for (const key of ["status", "substatus", "designer", "responsibility", "assignedTo", "category", "moduleKey", "due", "q", "size", "fulfilled"]) {
        next.delete(key);
      }
      for (const [key, value] of Object.entries(serializeQueueFilters(nextFilters))) {
        next.set(key, value);
      }
      return next;
    });
  }, [setSearchParams]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters(() => ({ ...DEFAULT_QUEUE_FILTERS }));

  const allRows = useMemo(() => {
    let rows = flattenQueueRows(workOrders, { dueField, includeFulfilled: filters.includeFulfilled });
    if (stageFilter?.length) rows = rows.filter((r) => stageFilter.includes(r.stage));
    return rows;
  }, [workOrders, dueField, stageFilter, filters.includeFulfilled]);

  const distinct = useCallback((key) =>
    [...new Set(allRows.map((r) => r[key]).filter(Boolean))].sort(), [allRows]);

  const filtered = useMemo(
    () => sortQueueRows(filterQueueRows(allRows, filters, now)),
    [allRows, filters, now]
  );

  useEffect(() => { setPage(0); }, [filters]);

  const paged = filtered.slice(page * filters.pageSize, (page + 1) * filters.pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));

  const transition = async (row, patch) => {
    const key = `${row.workOrderId}:${row.productId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      await transitionProductAndBuilderStatus({
        workOrderId: row.workOrderId, product: row.product, patch, actor, label: "Queue status",
      });
      refreshAllWorkOrders();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e?.message || "Status update failed." }));
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
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <label className="flex items-center gap-1 pb-1 text-xs text-gray-600">
          <input type="checkbox" checked={filters.includeFulfilled} onChange={(e) => set("includeFulfilled", e.target.checked)} />
          Include fulfilled</label>
        <button className={sel} onClick={clearFilters}>Clear</button>
      </div>

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
              const locked = !r.editable || isBusy;
              const overdue = overdueDays(r, now);
              const inStatus = daysInStatus(r, now);
              const rowError = errors[key];
              return (
                <React.Fragment key={key}>
                <tr className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {onOpenWorkOrder ? (
                      <button className="text-sky-700 hover:underline" onClick={() => onOpenWorkOrder(r.workOrderId)}>{r.ref}</button>
                    ) : (
                      <Link className="text-sky-700 hover:underline" to={`/JobWorkspace?wo=${r.workOrderId}`}>{r.ref}</Link>
                    )}
                    <div className="text-[10px] text-gray-400">{r.position}</div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.moduleKey || "—"}</td>
                  <td className="max-w-[140px] truncate px-2 py-1.5">{r.company}</td>
                  <td className="max-w-[200px] truncate px-2 py-1.5" title={r.productName}>{r.productName}</td>
                  <td className="px-2 py-1.5">
                    {badge(OPERATIONAL_STATUS_CUSTOMER_LABELS[r.status] || r.status || "none", statusTone(r.status))}
                    {r.substatus && <div className="mt-0.5 text-[10px] italic text-gray-500">{r.substatus}</div>}
                    {r.hardDue && <div className="mt-0.5 text-[10px] font-semibold text-rose-600">HARD DUE</div>}
                    {inStatus != null && <div className="mt-0.5 text-[10px] text-gray-400">{inStatus}d in status</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value={r.proof === "none" ? "" : r.proof}
                      onChange={(e) => transition(r, { proofStatus: e.target.value })}>
                      <option value="">—</option>
                      {PROOF_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value={r.fulfillment === "none" ? "" : r.fulfillment}
                      onChange={(e) => transition(r, { fulfillmentState: e.target.value })}>
                      <option value="">—</option>
                      {FULFILLMENT_OPTIONS.map((o) => <option key={o} value={o}>{FULFILLMENT_LABELS[o]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.responsibility || r.assignedTo || "—"}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${overdue > 0 ? "font-semibold text-rose-700" : ""}`}>
                    {r.due && parseLocalDate(r.due) ? parseLocalDate(r.due).toLocaleDateString() : <span className="text-gray-400">—</span>}
                    {overdue > 0 && <div className="text-[10px]">{overdue}d overdue</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value=""
                      onChange={(e) => { if (e.target.value) transition(r, { operationalStatus: e.target.value }); e.target.value = ""; }}>
                      <option value="">Set status…</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s}</option>)}
                    </select>
                    <button className={`${sel} ml-1`} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP}
                      onClick={() => setExpanded((x) => ({ ...x, [key]: !x[key] }))}>
                      {expanded[key] ? "Close" : "Edit"}
                    </button>
                    <Link className="ml-1 text-[11px] text-sky-700 hover:underline" title="Open in Main Workflow" to={`/MainWorkflow?wo=${r.workOrderId}`}>WO</Link>
                    {isBusy && <span className="ml-1 text-[10px] text-gray-400">saving…</span>}
                    {rowError && <div className="mt-0.5 max-w-[220px] text-[10px] text-rose-700">{rowError}</div>}
                  </td>
                </tr>
                {expanded[key] && (
                  <RowEditor
                    row={r}
                    actor={actor}
                    disabled={!r.editable}
                    onSaved={() => setExpanded((x) => ({ ...x, [key]: false }))}
                  />
                )}
                </React.Fragment>
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