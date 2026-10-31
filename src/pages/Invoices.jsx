import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import {
  AlertCircle,
  ChevronRight,
  Copy,
  DollarSign,
  Download,
  FileText,
  Link2,
  Loader2,
  Mail,
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
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};
const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  void: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
};
const METHOD_LABELS = { cash: "Cash", check: "Check", card: "Card", ach: "ACH", financing: "Financing", other: "Other" };

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

const invokePortal = async (sessionToken, body) => {
  const r = await base44.functions.invoke("customerPortalAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function PortalLinks({ sessionToken, invoiceId }) {
  const [links, setLinks] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await invokePortal(sessionToken, { action: "list_links", invoice_id: invoiceId });
      setLinks(data.links || []);
    } catch (err) {
      setError(err?.message || "Portal links could not load.");
      setLinks([]);
    }
  }, [sessionToken, invoiceId]);

  useEffect(() => { load(); }, [load]);

  const run = async (label, body) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      const data = await invokePortal(sessionToken, body);
      await load();
      const link = data?.link;
      if (link && !link.revoked) {
        const url = `${window.location.origin}/customerportal?token=${encodeURIComponent(link.token || data.token)}`;
        try { await navigator.clipboard.writeText(url); setCopied(link.id || "new"); } catch { /* clipboard unavailable */ }
      }
    } catch (err) {
      setError(err?.message || "Portal link action failed.");
    } finally {
      setBusy("");
    }
  };

  const active = (links || []).find((l) => l.usable && !l.revoked);
  const activeUrl = active ? `${window.location.origin}/customerportal?token=${encodeURIComponent(active.token)}` : "";

  if (links === null) return null;
  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Link2 className="h-4 w-4 text-blue-600" />Customer portal
        </h3>
        {!active && (
          <button type="button" onClick={() => run("create", { action: "create_link", invoice_id: invoiceId, creation_request_key: uuid() })} disabled={Boolean(busy)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create share link
          </button>
        )}
      </div>
      {active && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input readOnly value={activeUrl} onFocus={(e) => e.target.select()}
              className="min-h-9 flex-1 truncate rounded-lg border border-blue-200 bg-white px-2.5 text-xs text-slate-700 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-200" />
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(activeUrl); setCopied(active.id); } catch { /* clipboard unavailable */ } }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-300 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300">
              <Copy className="h-3.5 w-3.5" />{copied === active.id ? "Copied" : "Copy"}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { if (confirm("Revoke this portal link? The customer will no longer be able to open it.")) run("revoke", { action: "revoke_link", link_id: active.id }); }}
              className="inline-flex min-h-9 items-center rounded-lg border border-red-300 px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400">
              {busy === "revoke" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
            </button>
          </div>
          <p className="text-[11px] text-blue-800/70 dark:text-blue-300/60">
            Read-only invoice view · {active.open_count > 0 ? `opened ${active.open_count}×` : "not opened yet"}{active.last_opened_at ? ` · last ${new Date(active.last_opened_at).toLocaleDateString()}` : ""} · expires {active.expires_at ? new Date(active.expires_at).toLocaleDateString() : "never"}
          </p>
        </div>
      )}
      {error && <div className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[s] || STATUS_STYLES.draft}`}>
      {STATUS_LABELS[s] || s}
    </span>
  );
}

function CustomerPicker({ sessionToken, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken, action: "search_customers", query: query.trim(),
        });
        const data = r?.data || r;
        if (!cancelled) setResults(data?.customers || []);
      } catch { if (!cancelled) setResults([]); }
      if (!cancelled) setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, sessionToken]);

  return (
    <div>
      {selected && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <span className="font-semibold text-emerald-800 dark:text-emerald-200">{selected.company_name}</span>
          <button type="button" onClick={() => onSelect(null)} className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" />
      </div>
      {loading && <div className="mt-1 text-xs text-slate-500">Searching…</div>}
      {!loading && results.length > 0 && !selected && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => { onSelect(c); setResults([]); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-100">{c.company_name}</span>
              <span className="text-xs text-slate-500">{c.contact_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LineItemEditor({ items, onChange }) {
  const update = (i, patch) => onChange(items.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1fr_70px_90px_24px_28px] items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>Description</span><span>Qty</span><span>Price</span><span>Tax</span><span />
      </div>
      {items.map((row, i) => (
        <div key={i} className="mb-1.5 grid grid-cols-[1fr_70px_90px_24px_28px] items-center gap-2">
          <input className={inputCls} value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Line item" />
          <input className={inputCls} type="number" min="0" step="any" value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
          <input className={inputCls} type="number" min="0" step="any" value={row.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} />
          <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={row.taxable === true} onChange={(e) => update(i, { taxable: e.target.checked })} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { description: "", quantity: 1, unit_price: "", taxable: true }])}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>
    </div>
  );
}

function InvoiceForm({ sessionToken, invoice, onClose, onSaved }) {
  const editing = Boolean(invoice?.id);
  const [customer, setCustomer] = useState(invoice ? { id: invoice.customer_id, company_name: invoice.customer_display_name || invoice.customer_name || "" } : null);
  const [items, setItems] = useState(
    (invoice?.line_items || []).map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_price: r.unit_price ?? "", taxable: r.taxable === true }))
      .length ? invoice.line_items.map((r) => ({ description: r.description || "", quantity: r.quantity ?? 1, unit_price: r.unit_price ?? "", taxable: r.taxable === true }))
        : [{ description: "", quantity: 1, unit_price: "", taxable: true }]
  );
  const [form, setForm] = useState({
    invoice_number: clean(invoice?.invoice_number),
    discount_amount: invoice?.discount_amount ?? "",
    tax_rate: invoice?.tax_rate ?? "",
    deposit_applied: invoice?.deposit_applied ?? "",
    issue_date: clean(invoice?.issue_date),
    due_date: clean(invoice?.due_date),
    terms: clean(invoice?.terms),
    notes: clean(invoice?.notes),
    internal_notes: clean(invoice?.internal_notes),
    estimate_id: clean(invoice?.estimate_id),
    work_order_id: clean(invoice?.work_order_id),
    opportunity_id: clean(invoice?.opportunity_id),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(uuid());
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const previewSubtotal = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);

  const save = async () => {
    if (!clean(customer?.id)) { setError("Pick a customer."); return; }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fields = {
        customer_id: clean(customer.id),
        customer_display_name: clean(customer.company_name),
        line_items: items
          .filter((r) => clean(r.description))
          .map((r) => ({ description: clean(r.description), quantity: Number(r.quantity) || 0, unit_price: Number(r.unit_price) || 0, taxable: r.taxable === true })),
        invoice_number: clean(form.invoice_number),
        discount_amount: Number(form.discount_amount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        deposit_applied: Number(form.deposit_applied) || 0,
        issue_date: clean(form.issue_date),
        due_date: clean(form.due_date),
        terms: clean(form.terms),
        notes: clean(form.notes),
        internal_notes: clean(form.internal_notes),
        estimate_id: clean(form.estimate_id),
        work_order_id: clean(form.work_order_id),
        opportunity_id: clean(form.opportunity_id),
      };
      if (editing) {
        await invokeAction(sessionToken, { action: "update_invoice", invoice_id: invoice.id, baseline: invoice, fields });
      } else {
        await invokeAction(sessionToken, { action: "create_invoice", creation_request_key: keyRef.current, fields });
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{editing ? `Edit ${invoice.invoice_number}` : "New Invoice"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Customer *</label>
            <CustomerPicker sessionToken={sessionToken} selected={customer} onSelect={setCustomer} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Invoice #</label><input className={inputCls} value={form.invoice_number} onChange={set("invoice_number")} placeholder="Auto" /></div>
            <div><label className={labelCls}>Terms</label><input className={inputCls} value={form.terms} onChange={set("terms")} placeholder="Net 30" /></div>
            <div><label className={labelCls}>Issue date</label><input className={inputCls} type="date" value={form.issue_date} onChange={set("issue_date")} /></div>
            <div><label className={labelCls}>Due date</label><input className={inputCls} type="date" value={form.due_date} onChange={set("due_date")} /></div>
          </div>
        </div>

        <div className="mt-4"><label className={labelCls}>Line items</label><LineItemEditor items={items} onChange={setItems} /></div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><label className={labelCls}>Discount $</label><input className={inputCls} type="number" min="0" step="any" value={form.discount_amount} onChange={set("discount_amount")} /></div>
          <div><label className={labelCls}>Tax rate</label><input className={inputCls} type="number" min="0" step="any" value={form.tax_rate} onChange={set("tax_rate")} placeholder="0.0825" /></div>
          <div><label className={labelCls}>Deposit applied $</label><input className={inputCls} type="number" min="0" step="any" value={form.deposit_applied} onChange={set("deposit_applied")} /></div>
          <div className="flex items-end pb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Subtotal: {usd(previewSubtotal)}</div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div><label className={labelCls}>Customer notes</label><textarea className={`${inputCls} min-h-16`} value={form.notes} onChange={set("notes")} /></div>
          <div><label className={labelCls}>Internal notes</label><textarea className={`${inputCls} min-h-16`} value={form.internal_notes} onChange={set("internal_notes")} /></div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400">Linked records (optional)</summary>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><label className={labelCls}>Estimate ID</label><input className={inputCls} value={form.estimate_id} onChange={set("estimate_id")} /></div>
            <div><label className={labelCls}>WorkOrder ID</label><input className={inputCls} value={form.work_order_id} onChange={set("work_order_id")} /></div>
            <div><label className={labelCls}>Opportunity ID</label><input className={inputCls} value={form.opportunity_id} onChange={set("opportunity_id")} /></div>
          </div>
        </details>

        {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetail({ sessionToken, invoiceId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [pay, setPay] = useState({ amount: "", method: "check", paid_date: "", reference_number: "", notes: "" });
  const payKeyRef = useRef(uuid());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeAction(sessionToken, { action: "get_invoice", invoice_id: invoiceId });
      setDetail(data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, invoiceId]);

  useEffect(() => { load(); }, [load]);

  const inv = detail?.invoice;
  const payments = detail?.payments || [];
  const openBalance = Number(inv?.balance_due) || 0;

  const run = async (label, body, after) => {
    if (busy) return;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      const data = await invokeAction(sessionToken, body);
      payKeyRef.current = uuid();
      await load();
      onChanged?.();
      await after?.(data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Action failed.");
    } finally {
      setBusy("");
    }
  };

  const recordPayment = () => run("pay", {
    action: "record_payment",
    invoice_id: invoiceId,
    creation_request_key: payKeyRef.current,
    amount: Number(pay.amount) || 0,
    method: pay.method,
    paid_date: clean(pay.paid_date),
    reference_number: clean(pay.reference_number),
    notes: clean(pay.notes),
  }, () => setPay((p) => ({ amount: "", method: p.method, paid_date: "", reference_number: "", notes: "" })));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {loading && !detail ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : !inv ? (
          <div className="py-8 text-center text-sm text-red-600">{error || "Invoice not found."}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{inv.invoice_number}</h2>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{inv.customer_display_name || inv.customer_name || inv.customer_id || "Unknown customer"}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {inv.issue_date ? `Issued ${inv.issue_date}` : "Not issued"}{inv.due_date ? ` · Due ${inv.due_date}` : ""}{inv.terms ? ` · ${inv.terms}` : ""}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-center">Tax</th></tr>
                </thead>
                <tbody>
                  {(inv.line_items || []).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{r.description}</td>
                      <td className="px-3 py-2 text-right">{r.quantity}</td>
                      <td className="px-3 py-2 text-right">{usd(r.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{usd((Number(r.quantity) || 0) * (Number(r.unit_price) || 0))}</td>
                      <td className="px-3 py-2 text-center">{r.taxable ? "✓" : ""}</td>
                    </tr>
                  ))}
                  {(inv.line_items || []).length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No line items.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {inv.notes && <div><span className="text-xs font-semibold uppercase text-slate-400">Notes:</span> {inv.notes}</div>}
                {inv.internal_notes && <div><span className="text-xs font-semibold uppercase text-slate-400">Internal:</span> {inv.internal_notes}</div>}
                {(inv.estimate_id || inv.work_order_id || inv.opportunity_id) && (
                  <div className="text-xs text-slate-500">
                    {inv.estimate_id && <div>Estimate: <a className="text-violet-600 hover:underline dark:text-violet-300" href={`/EstimateDetail?id=${inv.estimate_id}`}>{inv.estimate_id}</a></div>}
                    {inv.work_order_id && <div>WorkOrder: {inv.work_order_id}</div>}
                    {inv.opportunity_id && <div>Opportunity: {inv.opportunity_id}</div>}
                  </div>
                )}
              </div>
              <div className="space-y-0.5 text-right text-sm">
                <div>Subtotal: <span className="font-medium">{usd(inv.subtotal)}</span></div>
                {Number(inv.discount_amount) > 0 && <div>Discount: <span className="font-medium">-{usd(inv.discount_amount)}</span></div>}
                {Number(inv.tax_amount) > 0 && <div>Tax ({(Number(inv.tax_rate) * 100).toFixed(2)}%): <span className="font-medium">{usd(inv.tax_amount)}</span></div>}
                {Number(inv.deposit_applied) > 0 && <div>Deposit applied: <span className="font-medium">-{usd(inv.deposit_applied)}</span></div>}
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">Total: {usd(inv.total)}</div>
                <div>Paid: <span className="font-medium text-emerald-600">{usd(inv.amount_paid)}</span></div>
                <div className="text-base font-bold text-violet-700 dark:text-violet-300">Balance due: {usd(inv.balance_due)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Payments</h3>
              {payments.length === 0 && <div className="mt-1 text-xs text-slate-500">None recorded.</div>}
              {payments.map((p) => (
                <div key={p.id} className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm dark:bg-slate-800/60">
                  <span className={p.status === "void" ? "text-slate-400 line-through" : ""}>
                    {usd(p.amount)} · {METHOD_LABELS[p.method] || p.method}{p.paid_date ? ` · ${p.paid_date}` : ""}{p.reference_number ? ` · ${p.reference_number}` : ""}
                  </span>
                  {p.status === "recorded" && (
                    <button type="button" disabled={Boolean(busy)} onClick={() => run("voidpay", { action: "void_payment", payment_id: p.id, void_reason: "Voided from Invoices" })}
                      className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">Void</button>
                  )}
                  {p.status === "void" && <span className="text-xs text-slate-400">void</span>}
                </div>
              ))}
              {["sent", "partially_paid"].includes(inv.status) && (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-[110px_110px_130px_1fr_auto]">
                  <input className={inputCls} type="number" min="0" step="any" placeholder={`Balance ${usd(openBalance)}`} value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} />
                  <select className={inputCls} value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}>
                    {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input className={inputCls} type="date" value={pay.paid_date} onChange={(e) => setPay((p) => ({ ...p, paid_date: e.target.value }))} />
                  <input className={inputCls} placeholder="Check # / reference" value={pay.reference_number} onChange={(e) => setPay((p) => ({ ...p, reference_number: e.target.value }))} />
                  <button type="button" onClick={recordPayment} disabled={Boolean(busy) || !(Number(pay.amount) > 0)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}Record
                  </button>
                </div>
              )}
            </div>

            <PortalLinks sessionToken={sessionToken} invoiceId={invoiceId} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {inv.status === "draft" && (
                  <button type="button" onClick={() => run("send", { action: "mark_sent", invoice_id: invoiceId })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                    {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Mark sent
                  </button>
                )}
                {["draft", "sent"].includes(inv.status) && (
                  <button type="button" onClick={() => setEditing(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    Edit
                  </button>
                )}
                {!["draft", "void"].includes(inv.status) && (
                  <button type="button" onClick={() => run("email", { action: "email_invoice", invoice_id: invoiceId, portal_base: window.location.origin }, (d) => { if (d?.sent_to) setNotice(`Invoice emailed to ${d.sent_to}.`); })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-300 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-400">
                    {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Email to customer
                  </button>
                )}
                {!["draft", "void"].includes(inv.status) && (
                  <button type="button" onClick={() => run("stmt", { action: "email_statement", invoice_id: invoiceId, portal_base: window.location.origin }, (d) => { if (d?.sent_to) setNotice(`Statement emailed to ${d.sent_to} (${d.open_invoices} open · $${Number(d.open_total || 0).toFixed(2)}).`); })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-300 px-4 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:text-sky-400">
                    {busy === "stmt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Email statement
                  </button>
                )}
                {Number(inv.balance_due) > 0 && ["sent", "partially_paid"].includes(inv.status) && inv.due_date && inv.due_date < today() && (
                  <button type="button" onClick={() => run("remind", { action: "send_past_due_reminder", invoice_id: invoiceId, portal_base: window.location.origin }, (d) => { if (d?.sent_to) setNotice(`Past-due reminder sent to ${d.sent_to}.`); })} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-300 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-400">
                    {busy === "remind" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}Send past-due reminder
                  </button>
                )}
                {!["void", "paid"].includes(inv.status) && (
                  <button type="button" onClick={() => { if (confirm(`Void ${inv.invoice_number}?`)) run("void", { action: "void_invoice", invoice_id: invoiceId, void_reason: "Voided from Invoices" }); }} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400">
                    Void invoice
                  </button>
                )}
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            {notice && <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}
            {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          </>
        )}
      </div>
      {editing && inv && (
        <InvoiceForm sessionToken={sessionToken} invoice={inv} onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); onChanged?.(); }} />
      )}
    </div>
  );
}

function FromEstimateDialog({ sessionToken, onClose, onSaved }) {
  const [query, setQuery] = useState("");
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("full");
  const [depositPercent, setDepositPercent] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(uuid());

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await invokeAction(sessionToken, { action: "list_invoiceable_estimates", query });
        if (live) setEstimates(data.estimates || []);
      } catch (err) {
        if (live) setError(err?.response?.data?.error || err?.message || "Load failed.");
      } finally {
        if (live) setLoading(false);
      }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [sessionToken, query]);

  const depositPreview = selected
    ? (Number(depositAmount) > 0 ? Number(depositAmount)
      : Number(depositPercent) > 0 ? selected.quote_total * Number(depositPercent) / 100
      : selected.quote_total * (selected.deposit_percent || 50) / 100)
    : 0;

  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      await invokeAction(sessionToken, {
        action: "create_from_estimate",
        estimate_id: selected.id,
        billing_mode: mode,
        deposit_percent: depositPercent ? Number(depositPercent) : undefined,
        deposit_amount: depositAmount ? Number(depositAmount) : undefined,
        due_date: dueDate || undefined,
        creation_request_key: keyRef.current,
      });
      keyRef.current = uuid();
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Create failed.");
      setSaving(false);
    }
  };

  const MODES = [
    ["full", "Full invoice", "Bill the entire approved total in one invoice."],
    ["deposit", "Deposit", "Bill a percentage or flat amount now; remainder later."],
    ["final", "Final / remainder", "Bill whatever is left after prior invoices."],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invoice from estimate</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>

        {!selected ? (
          <>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search approved estimates…" />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
              ) : estimates.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">No approved estimates found.</div>
              ) : estimates.map((e) => (
                <button type="button" key={e.id} onClick={() => setSelected(e)} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-violet-50/60 last:border-0 dark:border-slate-800 dark:hover:bg-slate-800/60">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{e.project_name || e.estimate_number}</div>
                    <div className="text-xs text-slate-500">{e.client_name} · {e.estimate_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{usd(e.quote_total)}</div>
                    {e.already_billed > 0 && <div className="text-xs text-amber-600">{usd(e.remaining_billable)} left to bill</div>}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.project_name || selected.estimate_number}</div>
                <div className="text-xs text-slate-500">{selected.client_name} · {usd(selected.quote_total)} quote · {usd(selected.remaining_billable)} unbilled</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-violet-600">Change</button>
            </div>

            <div className="mt-3 space-y-2">
              {MODES.map(([value, label, sub]) => (
                <label key={value} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${mode === value ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                  <input type="radio" className="mt-0.5 accent-violet-600" checked={mode === value} onChange={() => setMode(value)} />
                  <span><span className="font-semibold">{label}</span><span className="block text-xs text-slate-500">{sub}</span></span>
                </label>
              ))}
            </div>

            {mode === "deposit" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500">Deposit %</label>
                  <input className={inputCls} type="number" min="1" max="100" placeholder={String(selected.deposit_percent || 50)} value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">…or flat amount</label>
                  <input className={inputCls} type="number" min="0" step="0.01" placeholder={depositPreview.toFixed(2)} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
                <div className="col-span-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Deposit invoice: {usd(depositPreview)}
                </div>
              </div>
            )}
            {mode === "final" && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Final invoice: {usd(selected.remaining_billable)}
              </div>
            )}
            {mode === "full" && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Invoice: {usd(selected.quote_total)}
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-500">Due date (optional)</label>
              <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </>
        )}

        {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          {selected && (
            <button type="button" onClick={submit} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-60 hover:bg-violet-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}Create invoice
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const { sessionToken, isRegistered } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [aging, setAging] = useState(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [viewName, setViewName] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showFromEstimate, setShowFromEstimate] = useState(false);
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("invoice") || "");
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const overdueRows = invoices.filter((i) => Number(i.balance_due) > 0 && ["sent", "partially_paid"].includes(i.status) && i.due_date && i.due_date < today());
  const overdueCount = overdueRows.length;
  const draftIds = invoices.filter((i) => clean(i.status) === "draft").map((i) => i.id);

  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => invoices.some((i) => i.id === id && clean(i.status) === "draft"))));
  }, [invoices]);

  const bulkIssue = async () => {
    const ids = [...selected].filter((id) => draftIds.includes(id));
    if (!ids.length || busy) return;
    if (!confirm(`Mark ${ids.length} draft invoice${ids.length === 1 ? "" : "s"} as sent?`)) return;
    setBusy("issueAll");
    setError(""); setNotice("");
    let ok = 0, failed = 0;
    for (const id of ids) {
      try { await invokeAction(sessionToken, { action: "mark_sent", invoice_id: id }); ok++; }
      catch { failed++; }
    }
    setBusy("");
    setSelected(new Set());
    setNotice(`Issued ${ok} invoice${ok === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
    load();
  };

  const remindAllOverdue = async () => {
    if (busy || overdueCount === 0) return;
    if (!confirm(`Email a past-due reminder for all ${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}?`)) return;
    setBusy("remindAll");
    setError("");
    setNotice("");
    let sent = 0, failed = 0;
    for (const inv of overdueRows) {
      try {
        const d = await invokeAction(sessionToken, {
          action: "send_past_due_reminder",
          invoice_id: inv.id,
          portal_base: window.location.origin,
        });
        if (d?.sent_to) sent += 1; else failed += 1;
      } catch { failed += 1; }
    }
    setBusy("");
    setNotice(`Reminders sent: ${sent}${failed ? ` · failed/skipped: ${failed}` : ""}`);
  };

  const downloadCsv = (filename, text) => {
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "export_ar", status, query });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`invoices-${stamp}.csv`, data.invoices_csv || "");
      downloadCsv(`payments-${stamp}.csv`, data.payments_csv || "");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "list_invoices", status, query });
      setInvoices(data.invoices || []);
      setAging(data.aging || null);
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

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Invoices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Accounts receivable — invoices, payments, aging.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV
          </button>
          <button type="button" onClick={() => setShowFromEstimate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-500 px-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
            <Receipt className="h-4 w-4" />From Estimate
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />New Invoice
          </button>
        </div>
      </div>

      {aging && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["Open", aging.open_balance, `${aging.open_invoices} invoice${aging.open_invoices === 1 ? "" : "s"}`, "text-slate-900 dark:text-slate-100"],
            ["Current", aging.buckets?.current, "", "text-emerald-600"],
            ["1–30 days", aging.buckets?.days_1_30, "", "text-amber-600"],
            ["31–60 days", aging.buckets?.days_31_60, "", "text-orange-600"],
            ["60+ days", (aging.buckets?.days_61_90 || 0) + (aging.buckets?.days_90_plus || 0), "", "text-red-600"],
          ].map(([label, val, sub, cls]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className={`text-lg font-bold ${cls}`}>{usd(val)}</div>
              {sub && <div className="text-xs text-slate-500">{sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search invoice # or customer…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", "draft", "sent", "partially_paid", "paid", "void"].map((s) => (
            <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setViewName(""); setOverdueOnly((v) => !v); }}
          className={`min-h-9 rounded-full px-3 text-xs font-semibold ${overdueOnly ? "bg-red-600 text-white" : "border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"}`}>
          Overdue
        </button>
        {overdueCount > 0 && (
          <button type="button" onClick={remindAllOverdue} disabled={Boolean(busy)}
            title={`Email a past-due reminder for all ${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-300 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-400">
            {busy === "remindAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Remind all ({overdueCount})
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={bulkIssue} disabled={Boolean(busy)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-blue-300 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-400">
            {busy === "issueAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Issue selected ({selected.size})
          </button>
        )}
        <SavedViews
          storageKey="views.invoices"
          getState={() => ({ status, query, overdueOnly })}
          activeName={viewName}
          onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setOverdueOnly(s.overdueOnly === true); setViewName(name || ""); }}
        />
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && invoices.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <FileText className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            No invoices yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-8 px-2 py-2.5">
                  <input type="checkbox" title="Select all drafts" className="h-4 w-4 align-middle accent-blue-600"
                    checked={draftIds.length > 0 && draftIds.every((id) => selected.has(id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(draftIds) : new Set())} />
                </th>
                <th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(overdueOnly ? invoices.filter((i) => Number(i.balance_due) > 0 && ["sent", "partially_paid"].includes(i.status) && i.due_date && i.due_date < today()) : invoices).map((inv) => {
                const overdue = Number(inv.balance_due) > 0 && ["sent", "partially_paid"].includes(inv.status) && inv.due_date && inv.due_date < today();
                return (
                <tr key={inv.id} onClick={() => setOpenId(inv.id)} className={`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${overdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                  <td className="w-8 px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {clean(inv.status) === "draft" ? (
                      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selected.has(inv.id)}
                        onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(inv.id) : n.delete(inv.id); return n; })} />
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{inv.customer_display_name || inv.customer_name || inv.customer_id || "Unknown customer"}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {inv.due_date || "—"}
                    {overdue && <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(inv.total)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${overdue ? "text-red-700 dark:text-red-300" : ""}`}>{usd(inv.balance_due)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <InvoiceForm sessionToken={sessionToken} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {showFromEstimate && <FromEstimateDialog sessionToken={sessionToken} onClose={() => setShowFromEstimate(false)} onSaved={() => { setShowFromEstimate(false); load(); }} />}
      {openId && <InvoiceDetail sessionToken={sessionToken} invoiceId={openId} onClose={() => setOpenId("")} onChanged={load} />}
    </div>
  );
}
