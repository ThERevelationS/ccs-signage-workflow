import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Receipt, ShieldCheck, Clock, Ban } from "lucide-react";

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-800",
  void: "bg-slate-100 text-slate-500",
};

export default function CustomerPortal() {
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("token") || "").trim();
  }, []);
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    document.title = "Customer Portal | CCS Signage";
    if (!token) {
      setState({ loading: false, data: null, error: "This portal link is incomplete. Please use the link exactly as it was sent to you." });
      return;
    }
    let cancelled = false;
    base44.functions.invoke("customerPortalAction", { action: "bootstrap", token })
      .then((response) => {
        if (cancelled) return;
        const data = response?.data;
        if (data?.success) setState({ loading: false, data, error: "" });
        else setState({ loading: false, data: null, error: data?.error || "This portal link is invalid, expired, or revoked." });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, data: null, error: error?.message || "This portal link is invalid, expired, or revoked." });
      });
    return () => { cancelled = true; };
  }, [token]);

  const invoice = state.data?.invoice;
  const payments = state.data?.payments || [];

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">CCS Signage</h1>
            <p className="text-sm text-slate-500">Customer portal</p>
          </div>
        </div>

        {state.loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Loading your document…
          </div>
        )}

        {!state.loading && state.error && (
          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center">
            <Ban className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <p className="font-medium text-slate-900">Link unavailable</p>
            <p className="mt-1 text-sm text-slate-500">{state.error}</p>
            <p className="mt-4 text-xs text-slate-400">If you believe this is a mistake, contact CCS Signage for a new link.</p>
          </div>
        )}

        {!state.loading && invoice && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice</p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {invoice.invoice_number || "Invoice"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{invoice.customer_display_name}</p>
                  {invoice.description && (
                    <p className="mt-2 max-w-xl text-sm text-slate-600">{invoice.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[invoice.status] || STATUS_STYLES.draft}`}>
                    {(invoice.status || "draft").replace(/_/g, " ")}
                  </span>
                  <p className="mt-3 text-3xl font-bold text-slate-900">{money(invoice.total)}</p>
                  {Number(invoice.balance_due) > 0 && (
                    <p className="mt-1 text-sm font-medium text-red-700">{money(invoice.balance_due)} due</p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Issued</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800">{invoice.issue_date || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Due</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-slate-800">
                    {invoice.due_date || "—"}
                    {Number(invoice.balance_due) > 0 && invoice.due_date && new Date(invoice.due_date) < new Date() && (
                      <Clock className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Paid to date</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800">{money(invoice.amount_paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Billing</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800">{(invoice.billing_type || "standard").replace(/_/g, " ")}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.line_items || []).map((item, index) => (
                    <tr key={index} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-800">{item.description || "Item"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{Number(item.quantity) || 0}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{money(item.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{money(item.amount)}</td>
                    </tr>
                  ))}
                  {(!invoice.line_items || invoice.line_items.length === 0) && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No line items on this invoice.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-sm text-slate-500">Subtotal</td>
                    <td className="px-4 py-2.5 text-right text-sm font-medium">{money(invoice.subtotal)}</td>
                  </tr>
                  {Number(invoice.tax) > 0 && (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-4 py-2.5 text-right text-sm text-slate-500">Tax</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium">{money(invoice.tax)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-slate-900">Total</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{money(invoice.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {payments.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Payments received</h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {payments.map((p, index) => (
                    <li key={index} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-600">{p.paid_at || "—"} · {(p.method || "payment").replace(/_/g, " ")}</span>
                      <span className="font-medium text-emerald-700">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Number(invoice.balance_due) > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-sm font-medium text-blue-900">
                  Balance due: <span className="font-bold">{money(invoice.balance_due)}</span>
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  Online payment is coming soon. To pay now, contact CCS Signage and reference invoice {invoice.invoice_number}.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Read-only view — this page reflects live billing records.
              </span>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print / PDF</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
