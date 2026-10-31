import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const uuid = () => crypto.randomUUID();
const usd = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const STATUS_LABELS = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  cancelled: "Cancelled",
};
const STATUS_STYLES = {
  proposed: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
  applied: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("changeOrderAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function StatusBadge({ status }) {
  const s = clean(status) || "proposed";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[s] || STATUS_STYLES.proposed}`}>
      {STATUS_LABELS[s] || s}
    </span>
  );
}

function DeltaItemsEditor({ items, onChange }) {
  const update = (i, patch) => onChange(items.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1fr_80px_110px_28px] items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>Description</span><span>Qty</span><span>Unit price</span><span />
      </div>
      {items.map((row, i) => (
        <div key={i} className="mb-1.5 grid grid-cols-[1fr_80px_110px_28px] items-center gap-2">
          <input className={inputCls} value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Scope change" />
          <input className={inputCls} type="number" step="any" value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
          <input className={inputCls} type="number" step="any" value={row.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} placeholder="- for credit" />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { description: "", quantity: 1, unit_price: "" }])}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>
    </div>
  );
}

function ChangeOrderForm({ sessionToken, changeOrder, onClose, onSaved }) {
  const editing = Boolean(changeOrder?.id);
  const [form, setForm] = useState({
    title: clean(changeOrder?.title),
    description: clean(changeOrder?.description),
    reason: clean(changeOrder?.reason),
    customer_display_name: clean(changeOrder?.customer_display_name),
    estimate_id: clean(changeOrder?.estimate_id),
    work_order_id: clean(changeOrder?.work_order_id),
    opportunity_id: clean(changeOrder?.opportunity_id),
    invoice_id: clean(changeOrder?.invoice_id),
    schedule_impact_days: changeOrder?.schedule_impact_days ?? "",
    notes: clean(changeOrder?.notes),
    internal_notes: clean(changeOrder?.internal_notes),
  });
  const [items, setItems] = useState(
    (changeOrder?.line_items || []).map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_price: r.unit_price ?? "" }))
      .length ? changeOrder.line_items.map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_price: r.unit_price ?? "" }))
        : [{ description: "", quantity: 1, unit_price: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(uuid());
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const delta = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);

  const save = async () => {
    if (!clean(form.title)) { setError("A title is required."); return; }
    if (!clean(form.estimate_id) && !clean(form.work_order_id) && !clean(form.opportunity_id)) {
      setError("Link at least one parent: estimate, work order, or opportunity."); return;
    }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fields = {
        title: clean(form.title),
        description: clean(form.description),
        reason: clean(form.reason),
        customer_display_name: clean(form.customer_display_name),
        estimate_id: clean(form.estimate_id),
        work_order_id: clean(form.work_order_id),
        opportunity_id: clean(form.opportunity_id),
        invoice_id: clean(form.invoice_id),
        schedule_impact_days: Number(form.schedule_impact_days) || 0,
        notes: clean(form.notes),
        internal_notes: clean(form.internal_notes),
        line_items: items.filter((r) => clean(r.description)).map((r) => ({
          description: clean(r.description), quantity: Number(r.quantity) || 0, unit_price: Number(r.unit_price) || 0,
        })),
      };
      if (editing) {
        await invokeAction(sessionToken, { action: "update_change_order", change_order_id: changeOrder.id, baseline: changeOrder, fields });
      } else {
        await invokeAction(sessionToken, { action: "create_change_order", creation_request_key: keyRef.current, fields });
      }
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{editing ? `Edit ${changeOrder.change_order_number}` : "New Change Order"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><label className={labelCls}>Title *</label><input className={inputCls} value={form.title} onChange={set("title")} placeholder="e.g. Add second wall sign" /></div>
          <div className="md:col-span-2"><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-16`} value={form.description} onChange={set("description")} /></div>
          <div><label className={labelCls}>Reason</label><input className={inputCls} value={form.reason} onChange={set("reason")} placeholder="Customer request, site condition…" /></div>
          <div><label className={labelCls}>Customer</label><input className={inputCls} value={form.customer_display_name} onChange={set("customer_display_name")} /></div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Parent links — at least one required</label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><label className={labelCls}>Estimate ID</label><input className={inputCls} value={form.estimate_id} onChange={set("estimate_id")} /></div>
            <div><label className={labelCls}>WorkOrder ID</label><input className={inputCls} value={form.work_order_id} onChange={set("work_order_id")} /></div>
            <div><label className={labelCls}>Opportunity ID</label><input className={inputCls} value={form.opportunity_id} onChange={set("opportunity_id")} /></div>
            <div><label className={labelCls}>Invoice ID</label><input className={inputCls} value={form.invoice_id} onChange={set("invoice_id")} /></div>
          </div>
        </div>
        <div className="mt-4"><label className={labelCls}>Scope delta (use negative price for credits)</label><DeltaItemsEditor items={items} onChange={setItems} /></div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><label className={labelCls}>Schedule impact (days)</label><input className={inputCls} type="number" step="1" value={form.schedule_impact_days} onChange={set("schedule_impact_days")} /></div>
          <div className="flex items-end pb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Delta: <span className={delta < 0 ? "text-red-600" : "text-emerald-600"}>{usd(delta)}</span></div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><label className={labelCls}>Customer notes</label><textarea className={`${inputCls} min-h-14`} value={form.notes} onChange={set("notes")} /></div>
          <div><label className={labelCls}>Internal notes</label><textarea className={`${inputCls} min-h-14`} value={form.internal_notes} onChange={set("internal_notes")} /></div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create change order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeOrderDetail({ sessionToken, changeOrderId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await invokeAction(sessionToken, { action: "get_change_order", change_order_id: changeOrderId }));
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, changeOrderId]);

  useEffect(() => { load(); }, [load]);

  const co = detail?.change_order;
  const run = async (label, body) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await invokeAction(sessionToken, body);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {loading && !detail ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : !co ? (
          <div className="py-8 text-center text-sm text-red-600">{error || "Change order not found."}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{co.change_order_number}</h2>
                  <StatusBadge status={co.status} />
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{co.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {co.customer_display_name || "No customer"}{co.proposed_by ? ` · proposed by ${co.proposed_by}` : ""}{co.proposed_at ? ` ${clean(co.proposed_at).slice(0, 10)}` : ""}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            {co.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{co.description}</p>}
            {co.reason && <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Reason:</span> {co.reason}</p>}

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Delta</th></tr>
                </thead>
                <tbody>
                  {(co.line_items || []).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-right">{r.quantity}</td>
                      <td className="px-3 py-2 text-right">{usd(r.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{usd((Number(r.quantity) || 0) * (Number(r.unit_price) || 0))}</td>
                    </tr>
                  ))}
                  {(co.line_items || []).length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No delta lines.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-slate-500">{Number(co.schedule_impact_days) ? `Schedule impact: ${co.schedule_impact_days} day(s)` : ""}</span>
              <span className="text-base font-bold">Total delta: <span className={Number(co.amount_delta) < 0 ? "text-red-600" : "text-emerald-600"}>{usd(co.amount_delta)}</span></span>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {co.estimate_id && <div>Estimate: <a className="text-violet-600 hover:underline dark:text-violet-300" href={`/EstimateDetail?id=${co.estimate_id}`}>{co.estimate_id}</a></div>}
              {co.work_order_id && <div>WorkOrder: {co.work_order_id}</div>}
              {co.opportunity_id && <div>Opportunity: {co.opportunity_id}</div>}
              {co.invoice_id && <div>Invoice: {co.invoice_id}</div>}
              {co.approved_by && <div>Approved by {co.approved_by} {clean(co.approved_at).slice(0, 10)}</div>}
              {co.rejected_by && <div>Rejected by {co.rejected_by} {clean(co.rejected_at).slice(0, 10)}{co.rejection_reason ? ` — ${co.rejection_reason}` : ""}</div>}
              {co.applied_at && <div>Applied {clean(co.applied_at).slice(0, 10)}{co.applied_note ? ` — ${co.applied_note}` : ""}</div>}
            </div>

            {co.status === "proposed" && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => run("approve", { action: "approve_change_order", change_order_id: co.id })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve
                  </button>
                  <button type="button" onClick={() => setEditing(true)}
                    className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Edit</button>
                  <button type="button" onClick={() => run("cancel", { action: "cancel_change_order", change_order_id: co.id })} disabled={Boolean(busy)}
                    className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel CO</button>
                </div>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button type="button" onClick={() => run("reject", { action: "reject_change_order", change_order_id: co.id, rejection_reason: clean(reason) })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400">
                    <XCircle className="h-4 w-4" />Reject
                  </button>
                </div>
              </div>
            )}
            {co.status === "approved" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => run("apply", { action: "apply_change_order", change_order_id: co.id, applied_note: "Applied from Change Orders" })} disabled={Boolean(busy)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Mark applied
                </button>
                <button type="button" onClick={() => run("cancel", { action: "cancel_change_order", change_order_id: co.id })} disabled={Boolean(busy)}
                  className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel CO</button>
              </div>
            )}
            {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          </>
        )}
      </div>
      {editing && co && (
        <ChangeOrderForm sessionToken={sessionToken} changeOrder={co} onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); onChanged?.(); }} />
      )}
    </div>
  );
}

export default function ChangeOrders() {
  const { sessionToken, isRegistered } = useAuth();
  const [changeOrders, setChangeOrders] = useState([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("co") || "");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "list_change_orders", status, query });
      setChangeOrders(data.change_orders || []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, status, query]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => changeOrders.some((c) => c.id === id))));
  }, [changeOrders]);

  const proposedIds = changeOrders.filter((c) => clean(c.status) === "proposed").map((c) => c.id);
  const toggleSelect = (id, on) =>
    setSelected((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  const bulkApprove = async () => {
    const ids = [...selected].filter((id) => proposedIds.includes(id));
    if (!ids.length) return;
    if (!window.confirm(`Approve ${ids.length} proposed change order${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const id of ids) {
      try { await invokeAction(sessionToken, { action: "approve_change_order", change_order_id: id }); ok++; }
      catch { failed++; }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed) setError(`Approved ${ok}; ${failed} failed (may no longer be proposed).`);
    load();
  };

  const bulkReject = async () => {
    const ids = [...selected].filter((id) => proposedIds.includes(id));
    if (!ids.length) return;
    const reason = window.prompt(`Reject ${ids.length} proposed change order${ids.length === 1 ? "" : "s"} — reason sent to all:`, "");
    if (reason === null) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const id of ids) {
      try { await invokeAction(sessionToken, { action: "reject_change_order", change_order_id: id, rejection_reason: clean(reason) }); ok++; }
      catch { failed++; }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed) setError(`Rejected ${ok}; ${failed} failed (may no longer be proposed).`);
    load();
  };

  if (!isRegistered) return null;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Change Orders</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Priced scope changes with approval tracking.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />New Change Order
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search #, title, or customer…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", "proposed", "approved", "applied", "rejected", "cancelled"].map((s) => (
            <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
        <SavedViews
          storageKey="views.change_orders"
          getState={() => ({ status, query })}
          activeName={viewName}
          onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
        />
        {selected.size > 0 && (
          <button type="button" onClick={bulkApprove} disabled={bulkBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve selected ({selected.size})
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={bulkReject} disabled={bulkBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject selected ({selected.size})
          </button>
        )}
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && changeOrders.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading change orders…</div>
        ) : changeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <FileText className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            No change orders yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-8 px-2 py-2.5">
                  <input type="checkbox" title="Select all proposed" className="h-4 w-4 align-middle accent-emerald-600"
                    checked={proposedIds.length > 0 && proposedIds.every((id) => selected.has(id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(proposedIds) : new Set())} />
                </th>
                <th className="px-4 py-2.5">CO #</th><th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5 text-right">Delta</th>
                <th className="px-4 py-2.5">Status</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <tr key={co.id} onClick={() => setOpenId(co.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="w-8 px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {clean(co.status) === "proposed" ? (
                      <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={selected.has(co.id)}
                        onChange={(e) => toggleSelect(co.id, e.target.checked)} />
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{co.change_order_number}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{co.title}</td>
                  <td className="px-4 py-2.5 text-slate-500">{co.customer_display_name || "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${Number(co.amount_delta) < 0 ? "text-red-600" : "text-emerald-600"}`}>{usd(co.amount_delta)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={co.status} /></td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <ChangeOrderForm sessionToken={sessionToken} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {openId && <ChangeOrderDetail sessionToken={sessionToken} changeOrderId={openId} onClose={() => setOpenId("")} onChanged={load} />}
    </div>
  );
}
