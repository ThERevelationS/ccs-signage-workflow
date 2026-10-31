import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, X } from "lucide-react";
import { derivePoReceipt } from "./receivingModel";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same print approach as components/statements/StatementView.jsx: a
// stmt-print-root overlay + a body class that hides the app shell under
// @media print; window.print() produces the paper/PDF copy.
const VENDOR_STATEMENT_PRINT_CSS = `
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

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("purchaseOrderAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

// list_purchase_orders returns header snapshots only — expected-vs-received
// line detail ships on get_purchase_order. Open/detail fetches are capped and
// fetched in small batches, same as OpsReportView's Parts Needed load.
const DETAIL_CAP = 40;
const DETAIL_BATCH = 5;

/**
 * VendorStatement — per-vendor aggregated account view: every PO on the
 * vendor, open expected-vs-received quantities/costs, status rollup and
 * totals, rendered as a printable sheet (window.print pattern).
 */
export default function VendorStatement({ sessionToken, vendorName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pos, setPos] = useState([]);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    document.body.classList.add("stmt-printing");
    return () => document.body.classList.remove("stmt-printing");
  }, []);

  const vendor = clean(vendorName);

  useEffect(() => {
    let live = true;
    if (!sessionToken || !vendor) { setLoading(false); return; }
    setLoading(true);
    setError("");
    (async () => {
      const listed = await invokeAction(sessionToken, { action: "list_purchase_orders", query: vendor });
      const all = Array.isArray(listed?.purchase_orders) ? listed.purchase_orders : [];
      // The list action searches PO # + vendor text; narrow to this vendor
      // client-side (exact normalized match first, prefix/contains fallback).
      const nk = (v) => clean(v).toLowerCase();
      let mine = all.filter((p) => nk(p?.vendor_name) === nk(vendor));
      if (!mine.length) mine = all.filter((p) => nk(p?.vendor_name).includes(nk(vendor)) || nk(vendor).includes(nk(p?.vendor_name)));
      const trimmed = mine.slice(0, DETAIL_CAP);
      const out = [];
      for (let i = 0; i < trimmed.length; i += DETAIL_BATCH) {
        // eslint-disable-next-line no-await-in-loop -- intentional small batches
        const chunk = await Promise.all(trimmed.slice(i, i + DETAIL_BATCH).map((p) =>
          invokeAction(sessionToken, { action: "get_purchase_order", purchase_order_id: p.id })
            .then((d) => d?.purchase_order || null)
            .catch(() => null)));
        out.push(...chunk.filter(Boolean));
      }
      if (live) { setPos(out); setCapped(mine.length > DETAIL_CAP || all.length > trimmed.length); }
    })()
      .catch((e) => { if (live) setError(e?.response?.data?.error || e?.message || "Vendor statement could not be loaded."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [sessionToken, vendor]);

  const statement = useMemo(() => {
    const rows = pos.map((po) => ({ po, receipt: derivePoReceipt(po) }));
    rows.sort((a, b) => clean(b.po?.order_date || b.po?.created_date).localeCompare(clean(a.po?.order_date || a.po?.created_date)));
    const byStatus = {};
    const totals = { ordered: 0, received: 0, open: 0, backordered: 0, ordered_cost: 0, received_cost: 0, open_cost: 0, po_total: 0, paid: 0 };
    for (const { po, receipt } of rows) {
      const s = clean(po?.status) || "draft";
      byStatus[s] = (byStatus[s] || 0) + 1;
      totals.ordered += receipt.totals.ordered;
      totals.received += receipt.totals.received;
      totals.open += receipt.totals.open;
      totals.backordered += receipt.totals.backordered;
      totals.ordered_cost += receipt.totals.ordered_cost;
      totals.received_cost += receipt.totals.received_cost;
      totals.open_cost += receipt.totals.open_cost;
      totals.po_total += Number(po?.total) || 0;
      totals.paid += Number(po?.paid_amount) || 0;
    }
    const contact = pos.find((p) => clean(p?.vendor_contact) || clean(p?.vendor_email) || clean(p?.vendor_phone)) || {};
    const openCount = rows.filter(({ po }) => ["sent", "partially_received"].includes(clean(po?.status))).length;
    return { rows, byStatus, totals, openCount, contact };
  }, [pos]);

  const asOf = new Date().toISOString().slice(0, 10);
  const pctReceived = statement.totals.ordered > 0
    ? Math.min(100, Math.round((statement.totals.received / statement.totals.ordered) * 1000) / 10)
    : 0;

  return (
    <div className="stmt-print-root fixed inset-0 z-[90] overflow-y-auto bg-slate-100">
      <style>{VENDOR_STATEMENT_PRINT_CSS}</style>
      <div className="stmt-toolbar sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3 shadow-sm">
        <Button type="button" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Close
        </Button>
        <span className="ml-2 text-xs text-slate-400">Vendor statement — {vendor || "vendor"}</span>
      </div>

      <div className="py-6">
        <div className="stmt-sheet mx-auto max-w-3xl bg-white p-6 text-slate-900 shadow-sm">
          <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div>
              <h1 className="text-xl font-bold leading-tight">Vendor statement</h1>
              <p className="mt-1 text-base font-semibold">{vendor || "—"}</p>
              <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                {clean(statement.contact?.vendor_contact) && <p>{statement.contact.vendor_contact}</p>}
                {clean(statement.contact?.vendor_email) && <p>{statement.contact.vendor_email}</p>}
                {clean(statement.contact?.vendor_phone) && <p>{statement.contact.vendor_phone}</p>}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm text-slate-600">
              <p>As of <span className="font-semibold">{asOf}</span></p>
              <p className="mt-1">{statement.rows.length} purchase order{statement.rows.length === 1 ? "" : "s"}</p>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center justify-center py-14 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading vendor history…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : statement.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No purchase orders found for {vendor || "this vendor"}.</p>
          ) : (
            <>
              {/* Rollup strip */}
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["POs on file", String(statement.rows.length)],
                  ["Open POs", String(statement.openCount)],
                  ["Ordered", usd(statement.totals.po_total)],
                  ["Received", `${pctReceived}%`],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-slate-300 p-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                    <div className="mt-0.5 text-sm font-bold text-slate-900">{val}</div>
                  </div>
                ))}
              </div>

              {/* POs by status */}
              <div className="mb-5 flex flex-wrap gap-1.5">
                {Object.entries(statement.byStatus).map(([s, count]) => (
                  <span key={s} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {STATUS_LABELS[s] || s}: {count}
                  </span>
                ))}
              </div>

              {/* PO ledger */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y-2 border-slate-800 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-2">PO</th>
                    <th className="py-2 pr-2">Ordered</th>
                    <th className="py-2 pr-2">Expected</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-1 text-right">Ordered qty</th>
                    <th className="py-2 px-1 text-right">Received qty</th>
                    <th className="py-2 pl-1 text-right">Open / BO</th>
                    <th className="py-2 pl-2 text-right">PO total</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map(({ po, receipt }) => {
                    const s = clean(po?.status) || "draft";
                    return (
                      <tr key={po.id} className="border-b border-slate-200 align-top">
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{clean(po?.po_number) || "PO"}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">{clean(po?.order_date) || "—"}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">
                          {clean(po?.expected_date) || "—"}
                          {receipt.overdue && <span className="ml-1 text-[10px] font-bold uppercase text-red-700">overdue</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{STATUS_LABELS[s] || s}</td>
                        <td className="py-1.5 pr-1 text-right whitespace-nowrap">{receipt.totals.ordered}</td>
                        <td className="py-1.5 px-1 text-right whitespace-nowrap">{receipt.totals.received}</td>
                        <td className="py-1.5 pl-1 text-right whitespace-nowrap">
                          {receipt.totals.open}
                          {receipt.totals.backordered > 0 && <span className="ml-1 text-[10px] font-bold text-red-700">BO {receipt.totals.backordered}</span>}
                        </td>
                        <td className="py-1.5 pl-2 text-right whitespace-nowrap font-medium">{usd(po?.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-800 text-sm font-bold">
                    <td className="py-2 pr-2" colSpan={4}>Totals</td>
                    <td className="py-2 pr-1 text-right">{statement.totals.ordered}</td>
                    <td className="py-2 px-1 text-right">{statement.totals.received}</td>
                    <td className="py-2 pl-1 text-right">{statement.totals.open}{statement.totals.backordered > 0 ? ` (BO ${statement.totals.backordered})` : ""}</td>
                    <td className="py-2 pl-2 text-right">{usd(statement.totals.po_total)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* Cost rollup */}
              <div className="mt-3 flex justify-end">
                <table className="text-sm">
                  <tbody>
                    <tr><td className="pr-6 py-0.5 text-slate-500">Ordered cost</td><td className="py-0.5 text-right font-medium">{usd(statement.totals.ordered_cost)}</td></tr>
                    <tr><td className="pr-6 py-0.5 text-slate-500">Received cost</td><td className="py-0.5 text-right font-medium">{usd(statement.totals.received_cost)}</td></tr>
                    <tr><td className="pr-6 py-0.5 text-slate-500">Still to receive</td><td className="py-0.5 text-right font-medium">{usd(statement.totals.open_cost)}</td></tr>
                    {statement.totals.paid > 0 && (
                      <tr><td className="pr-6 py-0.5 text-slate-500">Paid to vendor</td><td className="py-0.5 text-right font-medium">{usd(statement.totals.paid)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {capped && (
                <p className="stmt-no-print mt-3 text-[11px] text-amber-700">
                  Vendor history truncated at {DETAIL_CAP} purchase orders — narrow the vendor filter for a complete statement.
                </p>
              )}
              <p className="mt-6 text-center text-[10px] text-slate-400">
                Generated {asOf} · CCS Signage
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
