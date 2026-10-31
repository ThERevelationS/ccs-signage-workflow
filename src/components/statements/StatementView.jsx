import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";
import { downloadCsv } from "@/components/shared/exportCsv";
import {
  AGING_BUCKET_LABELS,
  STATEMENT_ACTIVITY_HEADERS,
  activityCsvRows,
} from "./statementModel";

const clean = (v) => String(v ?? "").trim();
const usd = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Injected while the view is mounted — keeps print output clean of the app
// shell (same pattern as SopPrint / SOP_PRINT_CSS).
const STATEMENT_PRINT_CSS = `
@media print {
  body.stmt-printing * { visibility: hidden !important; }
  body.stmt-printing .stmt-print-root,
  body.stmt-printing .stmt-print-root * { visibility: visible !important; }
  .stmt-print-root { position: static !important; overflow: visible !important; }
  .stmt-print-root .stmt-toolbar, .stmt-print-root .stmt-no-print { display: none !important; }
  nav, .top-nav, .side-nav, [data-shell-navigation-handle] { display: none !important; }
}
.stmt-sheet { page-break-after: always; break-after: page; }
.stmt-sheet:last-child { page-break-after: auto; break-after: auto; }
`;

const customerName = (c) =>
  clean(c?.company_name) || clean(c?.name) || clean(c?.customer_name) || "Customer";

const billingLines = (c) => {
  const lines = [];
  const contact = [clean(c?.billing_contact_name), ""].filter(Boolean)[0]
    || [clean(c?.contact_first_name), clean(c?.contact_last_name)].filter(Boolean).join(" ");
  if (contact) lines.push(`Attn: ${contact}`);
  if (clean(c?.billing_address_1)) lines.push(c.billing_address_1);
  if (clean(c?.billing_address_2)) lines.push(c.billing_address_2);
  const csz = [clean(c?.billing_city), clean(c?.billing_state), clean(c?.billing_postal_code)]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]*)$/, " $1");
  if (csz) lines.push(csz);
  if (clean(c?.billing_country) && clean(c.billing_country) !== "United States") lines.push(c.billing_country);
  return lines;
};

function AgingStrip({ aging, balance }) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border-2 border-slate-800">
      <div className="grid grid-cols-5 text-center">
        {["current", "d30", "d60", "d90"].map((key) => (
          <div key={key} className="border-r border-slate-300 last:border-r-0 px-2 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {AGING_BUCKET_LABELS[key]}
            </div>
            <div className={`text-sm font-bold ${key === "d90" && aging[key] > 0 ? "text-red-700" : "text-slate-900"}`}>
              {usd(aging[key])}
            </div>
          </div>
        ))}
        <div className="bg-slate-800 px-2 py-2 text-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Balance due</div>
          <div className="text-sm font-bold">{usd(balance)}</div>
        </div>
      </div>
    </div>
  );
}

function StatementSheet({ statement, company }) {
  const name = customerName(statement.customer);
  const billTo = billingLines(statement.customer);
  const companyName = clean(company?.company_name) || "CCS Signage";

  return (
    <div className="stmt-sheet mx-auto max-w-3xl bg-white p-6 text-slate-900">
      {/* Shop header */}
      <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
        <div>
          {clean(company?.company_logo_url) ? (
            <img src={company.company_logo_url} alt={companyName} className="mb-2 max-h-14 max-w-52 object-contain" />
          ) : null}
          <h1 className="text-2xl font-bold leading-tight">{companyName}</h1>
          <div className="mt-1 space-y-0.5 text-xs text-slate-500">
            {clean(company?.company_address) && <p className="whitespace-pre-line">{company.company_address}</p>}
            {clean(company?.company_phone) && <p>{company.company_phone}</p>}
            {clean(company?.company_email) && <p>{company.company_email}</p>}
            {clean(company?.company_website) && <p>{company.company_website}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <h2 className="text-xl font-bold uppercase tracking-widest text-slate-800">Statement</h2>
          <p className="mt-1 text-sm text-slate-600">
            As of <span className="font-semibold">{statement.asOf}</span>
          </p>
        </div>
      </header>

      {/* Customer block */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Statement for</p>
          <p className="mt-1 text-base font-bold">{name}</p>
          {billTo.map((line, i) => (
            <p key={i} className="text-sm text-slate-600">{line}</p>
          ))}
        </div>
        <div className="text-right text-xs text-slate-500">
          {clean(statement.customer?.terms) && <p>Terms: {statement.customer.terms}</p>}
          <p>{statement.invoiceCount} invoice{statement.invoiceCount === 1 ? "" : "s"} · {statement.paymentCount} payment{statement.paymentCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* Activity ledger */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-slate-800 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <th className="py-2 pr-2">Date</th>
            <th className="py-2 pr-2">Type</th>
            <th className="py-2 pr-2">Reference</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-1 text-right">Debit</th>
            <th className="py-2 pl-1 text-right">Credit</th>
            <th className="py-2 pl-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 text-center text-slate-400">
                No account activity on or before {statement.asOf}.
              </td>
            </tr>
          ) : (
            statement.lines.map((line, i) => (
              <tr key={`${line.date}-${line.kind}-${i}`} className="border-b border-slate-200 align-top">
                <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">{line.date}</td>
                <td className="py-1.5 pr-2 capitalize text-slate-600">
                  {line.kind}
                  {line.void && (
                    <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700">
                      {line.status === "refunded" ? "Refunded" : "Void"}
                    </span>
                  )}
                </td>
                <td className={`py-1.5 pr-2 ${line.void ? "text-slate-400 line-through" : "text-slate-700"}`}>{line.ref}</td>
                <td className={`py-1.5 pr-2 ${line.void ? "text-slate-400" : "text-slate-600"}`}>{line.description}</td>
                <td className="py-1.5 pr-1 text-right whitespace-nowrap">
                  {line.void
                    ? (line.kind === "invoice" ? <span className="text-slate-400 line-through">{usd(line.amount)}</span> : "")
                    : line.debit ? usd(line.debit) : ""}
                </td>
                <td className="py-1.5 pl-1 text-right whitespace-nowrap text-emerald-700">
                  {line.void
                    ? (line.kind === "payment" ? <span className="text-slate-400 line-through">{usd(line.amount)}</span> : "")
                    : line.credit ? usd(line.credit) : ""}
                </td>
                <td className="py-1.5 pl-2 text-right whitespace-nowrap font-medium">{usd(line.balance)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-3 flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr><td className="pr-6 py-0.5 text-slate-500">Total billed</td><td className="py-0.5 text-right font-medium">{usd(statement.totalBilled)}</td></tr>
            <tr><td className="pr-6 py-0.5 text-slate-500">Total paid</td><td className="py-0.5 text-right font-medium text-emerald-700">({usd(statement.totalPaid)})</td></tr>
            <tr className="border-t border-slate-300">
              <td className="pr-6 py-1 font-bold">Balance due</td>
              <td className={`py-1 text-right font-bold ${statement.balance > 0 ? "text-red-700" : "text-slate-900"}`}>{usd(statement.balance)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AgingStrip aging={statement.aging} balance={statement.balance} />

      {/* Remittance stub — the CoreBridge-style tear-off */}
      <div className="mt-6 border-t-2 border-dashed border-slate-400 pt-4">
        <div className="flex items-end justify-between gap-4">
          <div className="text-xs text-slate-500">
            <p className="font-bold uppercase tracking-widest text-slate-600">Remittance</p>
            <p className="mt-1">Please return this portion with your payment.</p>
            <p className="mt-2 font-semibold text-slate-800">{name}</p>
          </div>
          <div className="text-right text-xs">
            <p className="text-slate-500">Statement date: <span className="font-semibold text-slate-800">{statement.asOf}</span></p>
            <p className="mt-0.5 text-slate-500">Amount due: <span className="font-bold text-slate-900">{usd(statement.balance)}</span></p>
            <p className="mt-2 border-b border-slate-400 pb-1 text-slate-500">Amount enclosed: ______________</p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[10px] text-slate-400">
        Generated {new Date().toISOString().slice(0, 10)} · {companyName}
      </p>
    </div>
  );
}

/**
 * StatementView — SopPrint-style overlay: a clean, ink-friendly stack of one
 * or more statement sheets. Each sheet page-breaks in @media print.
 *
 * @param {object[]} statements  buildStatement() results, one per customer.
 * @param {object}   company     QuoteDefaults company block (name/address/logo).
 * @param {function} onClose     Dismiss the overlay.
 * @param {function} [onExport]  Optional CSV-export hook; default exports the
 *                               activity ledger of every rendered statement.
 */
export default function StatementView({ statements, company, onClose, onExport }) {
  useEffect(() => {
    document.body.classList.add("stmt-printing");
    return () => document.body.classList.remove("stmt-printing");
  }, []);

  const sheets = (Array.isArray(statements) ? statements : []).filter(Boolean);
  if (!sheets.length) return null;

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    for (const s of sheets) {
      const slug = customerName(s.customer).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer";
      const rows = [
        ...activityCsvRows(s),
        [],
        ["", "", "", "Total billed", s.totalBilled.toFixed(2), "", ""],
        ["", "", "", "Total paid", "", s.totalPaid.toFixed(2), ""],
        ["", "", "", "Balance due", "", "", s.balance.toFixed(2)],
      ];
      downloadCsv(`statement-${slug}-${s.asOf || stamp}.csv`, STATEMENT_ACTIVITY_HEADERS, rows);
    }
  };

  return (
    <div className="stmt-print-root fixed inset-0 z-[80] overflow-y-auto bg-slate-100">
      <style>{STATEMENT_PRINT_CSS}</style>
      <div className="stmt-toolbar sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3 shadow-sm">
        <Button type="button" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onExport || exportAll} className="gap-1.5">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Close
        </Button>
        <span className="ml-2 text-xs text-slate-400">
          {sheets.length} statement{sheets.length === 1 ? "" : "s"} · each prints on its own page
        </span>
      </div>
      <div className="space-y-6 py-6">
        {sheets.map((s, i) => (
          <StatementSheet key={clean(s.customer?.id) || i} statement={s} company={company} />
        ))}
      </div>
    </div>
  );
}
