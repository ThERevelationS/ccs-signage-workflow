import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { loadQuoteDefaults } from "@/components/estimator/quoteDefaults";
import { WALK_IN_PAYMENT_METHOD_LABELS } from "./walkInModel";

const clean = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const usd = (n) => `$${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same print approach as components/statements/StatementView.jsx: a
// stmt-print-root overlay + a body class that hides the app shell under
// @media print; window.print() produces the paper/PDF copy.
const RECEIPT_PRINT_CSS = `
@media print {
  body.stmt-printing * { visibility: hidden !important; }
  body.stmt-printing .stmt-print-root,
  body.stmt-printing .stmt-print-root * { visibility: visible !important; }
  .stmt-print-root { position: static !important; overflow: visible !important; }
  .stmt-print-root .stmt-toolbar, .stmt-print-root .stmt-no-print { display: none !important; }
  nav, .top-nav, .side-nav, [data-shell-navigation-handle] { display: none !important; }
}
.stmt-sheet { page-break-after: auto; break-after: auto; }
`;

/**
 * WalkInReceipt — print-formatted counter-sale receipt shown after checkout:
 * company header, line items, tender/change, totals and a thank-you footer.
 * The overlay pattern matches the statement sheets so window.print() yields a
 * clean customer copy without the app chrome.
 */
export default function WalkInReceipt({ receipt, onClose }) {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    document.body.classList.add("stmt-printing");
    return () => document.body.classList.remove("stmt-printing");
  }, []);

  useEffect(() => {
    let live = true;
    loadQuoteDefaults()
      .then((d) => { if (live) setCompany(d || null); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const totals = receipt?.totals || {};
  const items = Array.isArray(totals.items) ? totals.items : [];
  const payments = Array.isArray(receipt?.walkInSale?.payments) ? receipt.walkInSale.payments : [];
  const companyName = clean(company?.company_name) || "CCS Signage";
  const balance = receipt?.noInvoice
    ? num(receipt?.walkInSale?.balance_due)
    : num(receipt?.invoice?.balance_due ?? receipt?.walkInSale?.balance_due);
  const stamp = new Date().toLocaleString();

  return (
    <div className="stmt-print-root fixed inset-0 z-[90] overflow-y-auto bg-slate-100">
      <style>{RECEIPT_PRINT_CSS}</style>
      <div className="stmt-toolbar sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3 shadow-sm">
        <Button type="button" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print receipt
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Close
        </Button>
        <span className="ml-2 text-xs text-slate-400">Receipt {clean(receipt?.docNumber) || ""}</span>
      </div>

      <div className="py-6">
        <div className="stmt-sheet mx-auto max-w-md bg-white p-6 text-slate-900 shadow-sm">
          {/* Company header */}
          <header className="mb-4 border-b-2 border-slate-800 pb-3 text-center">
            {clean(company?.company_logo_url) && (
              <img src={company.company_logo_url} alt={companyName} className="mx-auto mb-2 max-h-12 object-contain" />
            )}
            <h1 className="text-lg font-bold leading-tight">{companyName}</h1>
            <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
              {clean(company?.company_address) && <p className="whitespace-pre-line">{company.company_address}</p>}
              {clean(company?.company_phone) && <p>{company.company_phone}</p>}
              {clean(company?.company_website) && <p>{company.company_website}</p>}
            </div>
          </header>

          <div className="mb-3 text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">Sale receipt</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {clean(receipt?.docNumber) || "Walk-in sale"} · {stamp}
            </p>
            <p className="text-xs text-slate-500">
              {clean(receipt?.customerName) || "Walk-in customer"}
              {clean(receipt?.invoice?.invoice_number) ? ` · Invoice ${receipt.invoice.invoice_number}` : ""}
            </p>
          </div>

          {/* Line items */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-800 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-1.5 pr-2">Item</th>
                <th className="py-1.5 pr-2 text-right">Qty</th>
                <th className="py-1.5 pr-2 text-right">Price</th>
                <th className="py-1.5 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className="border-b border-slate-200 align-top">
                  <td className="py-1.5 pr-2 text-slate-700">
                    {row.description || "Item"}
                    {row.category ? <span className="ml-1 text-[10px] text-slate-400">({row.category})</span> : ""}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">{row.quantity}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">{usd(row.unit_price)}</td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap font-medium">{usd(row.line_total)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-xs text-slate-400">No items.</td></tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-3 space-y-0.5 text-right text-sm">
            <div>Subtotal: <span className="font-medium">{usd(totals.subtotal)}</span></div>
            {num(totals.tax_amount) > 0 && (
              <div>Tax{num(totals.tax_percent) ? ` (${totals.tax_percent}%)` : ""}: <span className="font-medium">{usd(totals.tax_amount)}</span></div>
            )}
            <div className="text-base font-bold">Total: {usd(totals.total)}</div>
          </div>

          {/* Tender */}
          {payments.length > 0 && (
            <div className="mt-3 border-t border-dashed border-slate-300 pt-2 text-sm">
              {payments.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
                  <span className="text-slate-600">
                    {WALK_IN_PAYMENT_METHOD_LABELS[p.method] || p.method || "Payment"}
                    {clean(p.reference_number) ? ` #${p.reference_number}` : ""}
                  </span>
                  <span className="font-medium">{usd(p.amount)}</span>
                </div>
              ))}
              {payments.map((p, i) => (
                p.method === "cash" && p.amount_tendered !== null && p.amount_tendered !== undefined ? (
                  <div key={`t-${i}`} className="flex items-baseline justify-between gap-2 py-0.5 text-xs text-slate-500">
                    <span>Cash tendered</span>
                    <span>
                      {usd(p.amount_tendered)}
                      {num(p.change_due) > 0 ? ` · change ${usd(p.change_due)}` : ""}
                    </span>
                  </div>
                ) : null
              ))}
              <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1.5 text-sm font-bold">
                <span>Balance due</span>
                <span>{usd(balance)}</span>
              </div>
            </div>
          )}

          {receipt?.requiresProduction && (
            <p className="mt-3 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800">
              Some items are still in production — we'll let you know when they're ready.
            </p>
          )}

          <p className="mt-5 text-center text-xs font-semibold text-slate-700">Thank you for your business!</p>
          <p className="mt-1 text-center text-[10px] text-slate-400">{companyName}</p>
        </div>
      </div>
    </div>
  );
}
