import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import SavedViews from "@/components/workflow/SavedViews";
import ReceivePanel from "@/components/procurement/ReceivePanel";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const uuid = () => crypto.randomUUID();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};
const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
};

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("purchaseOrderAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[s] || STATUS_STYLES.draft}`}>
      {STATUS_LABELS[s] || s}
    </span>
  );
}

function PoItemsEditor({ items, onChange, stockItems = [] }) {
  const update = (i, patch) => onChange(items.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1fr_80px_110px_28px] items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>Item</span><span>Qty</span><span>Unit cost</span><span />
      </div>
      {items.map((row, i) => (
        <div key={i} className="mb-1.5">
          <div className="grid grid-cols-[1fr_80px_110px_28px] items-center gap-2">
            <input className={inputCls} value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Material / service" />
            <input className={inputCls} type="number" min="0" step="any" value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
            <input className={inputCls} type="number" min="0" step="any" value={row.unit_cost} onChange={(e) => update(i, { unit_cost: e.target.value })} />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
          {stockItems.length > 0 && (
            <select className={`${inputCls} mt-1 !min-h-8 py-1 text-xs`} value={row.inventory_item_id || ""}
              onChange={(e) => update(i, { inventory_item_id: e.target.value })}>
              <option value="">No stock link — receipt won't change inventory</option>
              {stockItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {[it.material_type, it.product_type, it.size].filter(Boolean).join(" · ") || it.id}
                  {` (on hand ${it.quantity_on_hand})`}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { description: "", quantity: 1, unit_cost: "" }])}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>
    </div>
  );
}

function PoForm({ sessionToken, purchaseOrder, onClose, onSaved }) {
  const editing = Boolean(purchaseOrder?.id);
  const [form, setForm] = useState({
    po_number: clean(purchaseOrder?.po_number),
    vendor_name: clean(purchaseOrder?.vendor_name),
    vendor_contact: clean(purchaseOrder?.vendor_contact),
    vendor_email: clean(purchaseOrder?.vendor_email),
    vendor_phone: clean(purchaseOrder?.vendor_phone),
    vendor_reference: clean(purchaseOrder?.vendor_reference),
    work_order_id: clean(purchaseOrder?.work_order_id),
    estimate_id: clean(purchaseOrder?.estimate_id),
    opportunity_id: clean(purchaseOrder?.opportunity_id),
    shipping_fee: purchaseOrder?.shipping_fee ?? "",
    order_date: clean(purchaseOrder?.order_date),
    expected_date: clean(purchaseOrder?.expected_date),
    ship_to: clean(purchaseOrder?.ship_to),
    notes: clean(purchaseOrder?.notes),
    internal_notes: clean(purchaseOrder?.internal_notes),
  });
  const [items, setItems] = useState(
    (purchaseOrder?.line_items || []).map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_cost: r.unit_cost ?? "", inventory_item_id: r.inventory_item_id || "" }))
      .length ? purchaseOrder.line_items.map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_cost: r.unit_cost ?? "", inventory_item_id: r.inventory_item_id || "" }))
        : [{ description: "", quantity: 1, unit_cost: "", inventory_item_id: "" }]
  );
  const [stockItems, setStockItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(uuid());
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const subtotal = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0), 0);

  useEffect(() => {
    let live = true;
    base44.functions.invoke("inventoryAction", { session_token: sessionToken, action: "list_stock" })
      .then((r) => { const d = r?.data || r; if (live && d?.success) setStockItems(d.items || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [sessionToken]);

  const save = async () => {
    if (!clean(form.vendor_name)) { setError("A vendor name is required."); return; }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fields = {
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? clean(v) : v])),
        shipping_fee: Number(form.shipping_fee) || 0,
        line_items: items.filter((r) => clean(r.description)).map((r) => ({
          description: clean(r.description), quantity: Number(r.quantity) || 0, unit_cost: Number(r.unit_cost) || 0,
          inventory_item_id: clean(r.inventory_item_id),
        })),
      };
      if (editing) {
        await invokeAction(sessionToken, { action: "update_purchase_order", purchase_order_id: purchaseOrder.id, baseline: purchaseOrder, fields });
      } else {
        await invokeAction(sessionToken, { action: "create_purchase_order", creation_request_key: keyRef.current, fields });
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
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{editing ? `Edit ${purchaseOrder.po_number}` : "New Purchase Order"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className={labelCls}>Vendor *</label><input className={inputCls} value={form.vendor_name} onChange={set("vendor_name")} /></div>
          <div><label className={labelCls}>Contact</label><input className={inputCls} value={form.vendor_contact} onChange={set("vendor_contact")} /></div>
          <div><label className={labelCls}>Email</label><input className={inputCls} value={form.vendor_email} onChange={set("vendor_email")} /></div>
          <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.vendor_phone} onChange={set("vendor_phone")} /></div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div><label className={labelCls}>PO #</label><input className={inputCls} value={form.po_number} onChange={set("po_number")} placeholder="Auto" /></div>
          <div><label className={labelCls}>Vendor ref #</label><input className={inputCls} value={form.vendor_reference} onChange={set("vendor_reference")} /></div>
          <div><label className={labelCls}>Order date</label><input className={inputCls} type="date" value={form.order_date} onChange={set("order_date")} /></div>
          <div><label className={labelCls}>Expected</label><input className={inputCls} type="date" value={form.expected_date} onChange={set("expected_date")} /></div>
        </div>
        <div className="mt-4"><label className={labelCls}>Line items</label><PoItemsEditor items={items} onChange={setItems} stockItems={stockItems} /></div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div><label className={labelCls}>Shipping $</label><input className={inputCls} type="number" min="0" step="any" value={form.shipping_fee} onChange={set("shipping_fee")} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Ship to</label><input className={inputCls} value={form.ship_to} onChange={set("ship_to")} placeholder="Shop / job site" /></div>
          <div className="flex items-end pb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Total: {usd(subtotal + (Number(form.shipping_fee) || 0))}</div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400">Job links (optional)</summary>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><label className={labelCls}>WorkOrder ID</label><input className={inputCls} value={form.work_order_id} onChange={set("work_order_id")} /></div>
            <div><label className={labelCls}>Estimate ID</label><input className={inputCls} value={form.estimate_id} onChange={set("estimate_id")} /></div>
            <div><label className={labelCls}>Opportunity ID</label><input className={inputCls} value={form.opportunity_id} onChange={set("opportunity_id")} /></div>
          </div>
        </details>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><label className={labelCls}>Vendor notes</label><textarea className={`${inputCls} min-h-14`} value={form.notes} onChange={set("notes")} /></div>
          <div><label className={labelCls}>Internal notes</label><textarea className={`${inputCls} min-h-14`} value={form.internal_notes} onChange={set("internal_notes")} /></div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create PO"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PoDetail({ sessionToken, purchaseOrderId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await invokeAction(sessionToken, { action: "get_purchase_order", purchase_order_id: purchaseOrderId }));
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, purchaseOrderId]);

  useEffect(() => { load(); }, [load]);

  const po = detail?.purchase_order;
  const canReceive = ["sent", "partially_received"].includes(clean(po?.status));

  const run = async (label, body) => {
    if (busy) return;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      const data = await invokeAction(sessionToken, body);
      if (Array.isArray(data?.stock_warnings) && data.stock_warnings.length > 0) {
        setNotice(`Received, but ${data.stock_warnings.length} stock update(s) need attention: ${data.stock_warnings.join(" ")}`);
      }
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
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {loading && !detail ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : !po ? (
          <div className="py-8 text-center text-sm text-red-600">{error || "Purchase order not found."}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{po.po_number}</h2>
                  <StatusBadge status={po.status} />
                  {po.payment_status === "paid" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Paid</span>
                  )}
                  {po.payment_status === "invoiced" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">Vendor bill received</span>
                  )}
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{po.vendor_name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {po.order_date ? `Ordered ${po.order_date}` : "Not ordered"}{po.expected_date ? ` · Expected ${po.expected_date}` : ""}{po.vendor_reference ? ` · Ref ${po.vendor_reference}` : ""}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4">
              <ReceivePanel
                po={po}
                sessionToken={sessionToken}
                canReceive={canReceive}
                busy={busy}
                onReceive={(lines) => run("receive", { action: "receive_items", purchase_order_id: po.id, lines })}
              />
            </div>
            <div className="mt-2 text-right text-sm">
              <span className="mr-4">Subtotal: <span className="font-medium">{usd(po.subtotal)}</span></span>
              <span className="mr-4">Shipping: <span className="font-medium">{usd(po.shipping_fee)}</span></span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100">Total: {usd(po.total)}</span>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {po.ship_to && <div>Ship to: {po.ship_to}</div>}
              {po.work_order_id && <div>WorkOrder: {po.work_order_id}</div>}
              {po.estimate_id && <div>Estimate: <a className="text-violet-600 hover:underline dark:text-violet-300" href={`/EstimateDetail?id=${po.estimate_id}`}>{po.estimate_id}</a></div>}
              {po.opportunity_id && <div>Opportunity: {po.opportunity_id}</div>}
              {po.notes && <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{po.notes}</div>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {po.status === "draft" && (
                <>
                  <button type="button" onClick={() => run("send", { action: "mark_sent", purchase_order_id: po.id })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                    {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Mark sent
                  </button>
                  <button type="button" onClick={() => setEditing(true)}
                    className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Edit</button>
                </>
              )}
              {po.payment_status !== "paid" && po.payment_status !== "invoiced" && ["sent", "partially_received", "received"].includes(po.status) && (
                <button type="button" onClick={() => {
                  const vendor_invoice_number = prompt("Vendor invoice/bill number (optional):", po.vendor_invoice_number || "");
                  if (vendor_invoice_number !== null) run("invoice", { action: "mark_invoiced", purchase_order_id: po.id, vendor_invoice_number });
                }} disabled={Boolean(busy)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60">
                  {busy === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}Vendor bill
                </button>
              )}
              {po.payment_status === "invoiced" && (
                <button type="button" onClick={() => {
                  const paid_amount = prompt("Amount paid:", String(po.total || ""));
                  if (paid_amount !== null) run("paid", { action: "mark_paid", purchase_order_id: po.id, paid_amount: Number(paid_amount) || undefined });
                }} disabled={Boolean(busy)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy === "paid" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Mark paid
                </button>
              )}
              {po.payment_status === "paid" && po.paid_amount > 0 && (
                <span className="text-xs font-semibold text-emerald-600">Paid {usd(po.paid_amount)}{po.paid_date ? ` on ${po.paid_date}` : ""}</span>
              )}
              {!["received", "cancelled"].includes(po.status) && (
                <button type="button" onClick={() => { if (confirm(`Cancel ${po.po_number}?`)) run("cancel", { action: "cancel_purchase_order", purchase_order_id: po.id }); }} disabled={Boolean(busy)}
                  className="min-h-10 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400">
                  Cancel PO
                </button>
              )}
            </div>
            {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
            {notice && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{notice}</div>}
     </>
        )}
      </div>
      {editing && po && (
        <PoForm sessionToken={sessionToken} purchaseOrder={po} onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); onChanged?.(); }} />
      )}
    </div>
  );
}

export default function PurchaseOrders() {
  const { sessionToken, isRegistered } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(() => {
    // ?draft_item=<inventory_item_id> opens a new PO prefilled with the
    // low-stock item (linked from the attention feed's low-stock section).
    const id = new URLSearchParams(window.location.search).get("draft_item");
    return Boolean(id && String(id).trim());
  });
  const draftItemId = new URLSearchParams(window.location.search).get("draft_item") || "";
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("po") || "");

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "list_purchase_orders", status, query });
      setPurchaseOrders(data.purchase_orders || []);
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

  if (!isRegistered) return null;

  const openValue = purchaseOrders.filter((p) => ["sent", "partially_received"].includes(p.status)).reduce((s, p) => s + (Number(p.total) || 0), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = (p) => ["sent", "partially_received"].includes(p.status) && p.expected_date && p.expected_date < todayStr;
  const overdueCount = purchaseOrders.filter(isOverdue).length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vendor POs and receiving.{openValue > 0 ? ` Open PO value: ${usd(openValue)}.` : ""}{overdueCount > 0 ? ` ${overdueCount} overdue.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />New PO
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search PO # or vendor…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", "draft", "sent", "partially_received", "received", "cancelled"].map((s) => (
            <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
        <SavedViews
          storageKey="views.purchase_orders"
          getState={() => ({ status, query })}
          activeName={viewName}
          onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
        />
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && purchaseOrders.length === 0 ? (
          <TableSkeleton columns={6} />
        ) : purchaseOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Package className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            No purchase orders yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">PO #</th><th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Expected</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Status</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} onClick={() => setOpenId(po.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{po.po_number}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{po.vendor_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {po.expected_date || "—"}
                    {isOverdue(po) && <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(po.total)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={po.status} /></td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <PoForm sessionToken={sessionToken} purchaseOrder={draftItemId ? { line_items: [{ inventory_item_id: draftItemId, quantity: 1 }] } : undefined} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {openId && <PoDetail sessionToken={sessionToken} purchaseOrderId={openId} onClose={() => setOpenId("")} onChanged={load} />}
    </div>
  );
}