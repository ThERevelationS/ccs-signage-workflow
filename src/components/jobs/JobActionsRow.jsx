// D-07 — Job workspace actions row (CoreBridge "Order.aspx" actions,
// COREBRIDGE_MAP.md §5): Edit, Clone, Print/Email Invoice, Packing Slip,
// Invoice View Settings, Void, Enter Payment.
//
// Every button's visibility/enabled/tooltip comes from jobActionsModel's
// actionStates() — this file only wires the click side. Role × status ×
// confirm rules never live in JSX.
//
//   Void         — admin-only (model); reason-required confirm dialog; write
//                  goes through the canTransition patch + CAS field path.
//   Enter Payment— invoicingAction record_payment against the chosen open
//                  invoice (same contract as src/pages/Invoices.jsx).
//   Print/Email  — invoice picker menu → get_invoice → invoicePrintTemplate
//                  print window, or email_invoice (portal_base stamped).
//   Packing Slip — packingSlipTemplate render → print window (no money ever).
//   Clone        — duplicateEstimate on the source estimate → new draft
//                  estimate at /EstimateDetail (orders clone via their quote).
//   View Settings— localStorage prefs consumed by the invoice print render.

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Pencil, Copy, FileText, Package, Settings2, Ban, DollarSign,
  Loader2, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { duplicateEstimate, newEstimateCreationKey } from "@/components/estimator/estimateCreationService";
import { loadQuoteDefaults } from "@/components/estimator/quoteDefaults";
import { renderPackingSlipHtml } from "./packingSlipTemplate.js";
import {
  renderInvoicePrintHtml,
  buildInvoicePrintModel,
  normalizeInvoiceViewSettings,
  INVOICE_VIEW_SETTINGS_KEY,
  INVOICE_VIEW_SETTING_OPTIONS,
} from "./invoicePrintTemplate.js";
import {
  actionStates,
  liveInvoices,
  payableInvoices,
  primaryInvoice,
} from "./jobActionsModel.js";
import { canTransition } from "./completedVsPaidModel.js";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ACTION_ICONS = {
  edit: Pencil,
  clone: Copy,
  print_email_invoice: FileText,
  packing_slip: Package,
  invoice_view_settings: Settings2,
  void: Ban,
  enter_payment: DollarSign,
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
  { value: "financing", label: "Financing" },
  { value: "other", label: "Other" },
];

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

const companyFromDefaults = (d) => (!d ? {} : {
  name: clean(d.company_name),
  address_lines: clean(d.company_address).split(/\r?\n/).map(clean).filter(Boolean),
  phone: clean(d.company_phone),
  email: clean(d.company_email),
  logo_url: d.show_logo === false ? "" : clean(d.company_logo_url),
});

const openPrintWindow = (html) => {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
};

const loadViewSettings = () => {
  try { return normalizeInvoiceViewSettings(JSON.parse(localStorage.getItem(INVOICE_VIEW_SETTINGS_KEY) || "{}")); }
  catch { return normalizeInvoiceViewSettings(null); }
};

// Tiny modal matching the Invoices page overlay convention (no ui/dialog
// dependency — fixed overlay + stopPropagation card).
function ActionModal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div
        className={`my-8 w-full ${wide ? "max-w-lg" : "max-w-md"} rounded-lg border border-gray-200 bg-white p-4 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function JobActionsRow({
  workOrder,
  invoices = [],
  payments = [],
  financialsLoaded = false,
  sessionToken = "",
  currentUser = null,
  onOrderChanged,
  onOpenOrderDetails,
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceMenu, setInvoiceMenu] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pay, setPay] = useState({ invoice_id: "", amount: "", method: "check", paid_date: "", reference_number: "", notes: "" });
  const [voidReason, setVoidReason] = useState("");
  const [viewSettings, setViewSettings] = useState(loadViewSettings);
  const payKeyRef = useRef("");

  const wo = workOrder && typeof workOrder === "object" ? workOrder : null;
  const states = useMemo(
    () => actionStates({ user: currentUser, sessionToken, workOrder: wo, invoices, payments, financialsLoaded }),
    [currentUser, sessionToken, wo, invoices, payments, financialsLoaded],
  );

  if (!wo) return null;

  const live = liveInvoices(wo, invoices);
  const payable = payableInvoices(wo, invoices);
  const target = primaryInvoice(wo, invoices);

  const runAction = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try { await fn(); }
    catch (e) { setError(e?.response?.data?.error || e?.message || "Action failed."); }
    finally { setBusy(""); }
  };

  // --- handlers ---------------------------------------------------------------

  const onAction = (key) => {
    switch (key) {
      case "edit":
        navigate(`/MainWorkflow?wo=${wo.id}`);
        return;
      case "clone":
        runAction(key, async () => {
          const source = await staffEntities.AllInOneEstimate.get(wo.estimate_id);
          if (!source?.id) throw new Error("The source estimate could not be loaded — it may have been deleted.");
          const created = await duplicateEstimate({
            source, sessionToken, creationKey: newEstimateCreationKey(),
          });
          setNotice(`Cloned to draft estimate ${created.estimate_number || created.id} — convert it to an order from the estimate page.`);
          navigate(`/EstimateDetail?id=${created.id}`);
        });
        return;
      case "print_email_invoice":
        setInvoiceMenu(true);
        return;
      case "packing_slip":
        runAction(key, async () => {
          const defaults = await loadQuoteDefaults().catch(() => null);
          const html = renderPackingSlipHtml(wo, { company: companyFromDefaults(defaults) });
          if (!openPrintWindow(html)) throw new Error("Popup blocked — allow popups to print the packing slip.");
        });
        return;
      case "invoice_view_settings":
        setViewSettings(loadViewSettings());
        setSettingsOpen(true);
        return;
      case "void":
        setVoidReason("");
        setVoidOpen(true);
        return;
      case "enter_payment":
        payKeyRef.current = crypto.randomUUID();
        setPay({
          invoice_id: target?.id || payable[0]?.id || "",
          amount: "",
          method: "check",
          paid_date: "",
          reference_number: "",
          notes: "",
        });
        setPayOpen(true);
        return;
      default:
    }
  };

  const printInvoice = (inv) => runAction("print_invoice", async () => {
    const [detail, defaults] = await Promise.all([
      invokeAction(sessionToken, { action: "get_invoice", invoice_id: inv.id }),
      loadQuoteDefaults().catch(() => null),
    ]);
    const model = buildInvoicePrintModel(detail.invoice || detail, {
      workOrder: wo,
      company: companyFromDefaults(defaults),
      settings: viewSettings,
      payments: detail.payments || [],
    });
    if (!openPrintWindow(renderInvoicePrintHtml(model))) {
      throw new Error("Popup blocked — allow popups to print the invoice.");
    }
    setInvoiceMenu(false);
  });

  const emailInvoice = (inv) => runAction("email_invoice", async () => {
    const d = await invokeAction(sessionToken, {
      action: "email_invoice",
      invoice_id: inv.id,
      portal_base: window.location.origin,
    });
    setNotice(d?.sent_to ? `Invoice ${inv.invoice_number || inv.id} emailed to ${d.sent_to}.` : "Invoice emailed.");
    setInvoiceMenu(false);
  });

  const recordPayment = () => runAction("pay", async () => {
    const amount = Number(pay.amount) || 0;
    if (!(amount > 0)) throw new Error("Enter a payment amount above $0.");
    if (!clean(pay.invoice_id)) throw new Error("Choose an invoice to pay against.");
    await invokeAction(sessionToken, {
      action: "record_payment",
      invoice_id: clean(pay.invoice_id),
      creation_request_key: payKeyRef.current || crypto.randomUUID(),
      amount,
      method: pay.method,
      paid_date: clean(pay.paid_date),
      reference_number: clean(pay.reference_number),
      notes: clean(pay.notes),
    });
    setNotice(`Payment of ${usd(amount)} recorded.`);
    setPayOpen(false);
    onOrderChanged?.();
  });

  const confirmVoid = () => runAction("void", async () => {
    const reason = clean(voidReason);
    const check = canTransition(wo, "voided", {
      reason, actor: clean(currentUser?.email), now: new Date(), invoices,
    });
    if (!check.ok) throw new Error(check.message || "Order cannot be voided.");
    const patch = check.patch;
    await replaceWorkOrderFieldsIfUnchanged({
      workOrderId: wo.id,
      expectedFields: Object.fromEntries(Object.keys(patch).map((k) => [k, wo[k]])),
      nextFields: patch,
    });
    setNotice("Order voided.");
    setVoidOpen(false);
    onOrderChanged?.();
  });

  const saveSettings = () => {
    localStorage.setItem(INVOICE_VIEW_SETTINGS_KEY, JSON.stringify(viewSettings));
    setSettingsOpen(false);
    setNotice("Invoice view settings saved — they apply to printed invoices from this browser.");
  };

  // --- render -----------------------------------------------------------------

  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2" data-actions-row>
      <div className="flex flex-wrap items-center gap-1.5">
        {states.filter((a) => a.visible).map((a) => {
          const Icon = ACTION_ICONS[a.key] || FileText;
          return (
            <button
              key={a.key}
              type="button"
              disabled={!a.enabled || Boolean(busy)}
              title={a.reason || a.label}
              onClick={() => onAction(a.key)}
              className={
                "inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 " +
                (a.dangerous
                  ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                  : "border-gray-300 text-gray-700 hover:bg-sky-50 hover:text-sky-800")
              }
            >
              {busy === a.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {a.label}
            </button>
          );
        })}
        {onOpenOrderDetails && (
          <button
            type="button"
            onClick={onOpenOrderDetails}
            className="ml-auto inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Order Details
          </button>
        )}
      </div>
      {(error || notice) && (
        <div className={`mt-2 rounded border px-2 py-1 text-xs ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error || notice}
        </div>
      )}

      {/* Print/Email Invoice picker */}
      {invoiceMenu && (
        <ActionModal title="Print / Email Invoice" onClose={() => setInvoiceMenu(false)} wide>
          {!live.length && <div className="text-xs text-gray-400">No live invoices on this order.</div>}
          <ul className="divide-y divide-gray-100">
            {live.map((inv) => {
              const mailable = !["void", "draft"].includes(clean(inv.status).toLowerCase());
              return (
                <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <span>
                    <span className="font-medium text-gray-800">{inv.invoice_number || inv.id}</span>
                    <span className="ml-2 text-gray-400">{clean(inv.status)} · {usd(inv.total)}</span>
                    {Number(inv.balance_due) > 0 && <span className="ml-1 text-amber-600">due {usd(inv.balance_due)}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" disabled={Boolean(busy)} onClick={() => printInvoice(inv)}
                      className="rounded border border-gray-300 px-2 py-1 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                      {busy === "print_invoice" ? "…" : "Print"}
                    </button>
                    <button type="button" disabled={Boolean(busy) || !mailable}
                      title={mailable ? "Email to the billing contact" : "Draft/void invoices cannot be emailed"}
                      onClick={() => emailInvoice(inv)}
                      className="rounded border border-gray-300 px-2 py-1 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                      {busy === "email_invoice" ? "…" : "Email"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </ActionModal>
      )}

      {/* Enter Payment */}
      {payOpen && (
        <ActionModal title="Enter Payment" onClose={() => setPayOpen(false)} wide>
          <div className="grid gap-2 text-xs">
            <label className="grid gap-0.5">
              <span className="font-semibold text-gray-500">Invoice</span>
              <select value={pay.invoice_id} onChange={(e) => setPay((p) => ({ ...p, invoice_id: e.target.value }))}
                className="rounded border border-gray-300 px-2 py-1.5">
                {payable.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number || inv.id} — due {usd(inv.balance_due)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-0.5">
                <span className="font-semibold text-gray-500">Amount</span>
                <input type="number" min="0" step="0.01" value={pay.amount}
                  onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1.5" placeholder="0.00" />
              </label>
              <label className="grid gap-0.5">
                <span className="font-semibold text-gray-500">Method</span>
                <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1.5">
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-0.5">
                <span className="font-semibold text-gray-500">Paid date</span>
                <input type="date" value={pay.paid_date}
                  onChange={(e) => setPay((p) => ({ ...p, paid_date: e.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="grid gap-0.5">
                <span className="font-semibold text-gray-500">Reference / check #</span>
                <input type="text" value={pay.reference_number}
                  onChange={(e) => setPay((p) => ({ ...p, reference_number: e.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1.5" />
              </label>
            </div>
            <label className="grid gap-0.5">
              <span className="font-semibold text-gray-500">Notes</span>
              <input type="text" value={pay.notes}
                onChange={(e) => setPay((p) => ({ ...p, notes: e.target.value }))}
                className="rounded border border-gray-300 px-2 py-1.5" />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setPayOpen(false)}
                className="rounded border border-gray-300 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={Boolean(busy)} onClick={recordPayment}
                className="rounded bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                {busy === "pay" ? "Recording…" : "Record payment"}
              </button>
            </div>
          </div>
        </ActionModal>
      )}

      {/* Void — reason-required confirm (role gate already applied upstream). */}
      {voidOpen && (
        <ActionModal title="Void this order?" onClose={() => setVoidOpen(false)}>
          <p className="text-xs leading-snug text-gray-600">
            Voiding marks the order <b>voided</b> — a terminal lifecycle state that only an admin reopen can undo.
          </p>
          {states.find((a) => a.key === "void")?.warn && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {states.find((a) => a.key === "void").warn}
            </p>
          )}
          <label className="mt-2 grid gap-0.5 text-xs">
            <span className="font-semibold text-gray-500">Reason (required — stamped on the record)</span>
            <textarea rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5" placeholder="Why is this order being voided?" />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setVoidOpen(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" disabled={Boolean(busy) || !clean(voidReason)} onClick={confirmVoid}
              className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {busy === "void" ? "Voiding…" : "Void order"}
            </button>
          </div>
        </ActionModal>
      )}

      {/* Invoice View Settings — per-browser prefs for the invoice print. */}
      {settingsOpen && (
        <ActionModal title="Invoice View Settings" onClose={() => setSettingsOpen(false)}>
          <p className="mb-2 text-[11px] text-gray-400">
            Applies to invoices printed from this browser — stored locally, nothing is written to the order.
          </p>
          <div className="grid gap-1.5">
            {INVOICE_VIEW_SETTING_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5"
                  checked={viewSettings[opt.key] === true}
                  onChange={(e) => setViewSettings((s) => ({ ...s, [opt.key]: e.target.checked }))} />
                <span>
                  <span className="font-medium text-gray-700">{opt.label}</span>
                  <span className="block text-[10px] text-gray-400">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setSettingsOpen(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={saveSettings}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">Save</button>
          </div>
        </ActionModal>
      )}
    </div>
  );
}
