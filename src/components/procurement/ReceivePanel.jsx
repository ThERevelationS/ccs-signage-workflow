import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, ClipboardCopy, Loader2, Mail, Truck } from "lucide-react";
import {
  LINE_STATUS_LABELS,
  buildReceiptLines,
  derivePoReceipt,
  receivingSummaryText,
  vendorNotifyMailto,
} from "./receivingModel";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LINE_BADGE_STYLES = {
  open: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
};

function LineStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LINE_BADGE_STYLES[status] || LINE_BADGE_STYLES.open}`}>
      {LINE_STATUS_LABELS[status] || status}
    </span>
  );
}

// Receiving history for stock-linked lines is stored as InventoryMovement rows
// (reason "receive", note "Received on <po_number>"). Non-stock lines have no
// per-event history — the entity only keeps cumulative quantity_received.
function useReceiveHistory(sessionToken, po) {
  const [rows, setRows] = useState([]);
  const [failed, setFailed] = useState(false);
  const poNumber = clean(po?.po_number);
  const hasStockLink = (po?.line_items || []).some((l) => clean(l?.inventory_item_id));
  useEffect(() => {
    if (!sessionToken || !poNumber || !hasStockLink) { setRows([]); return; }
    let live = true;
    base44.functions.invoke("inventoryAction", { session_token: sessionToken, action: "list_movements" })
      .then((r) => {
        if (!live) return;
        const d = r?.data || r;
        if (!d?.success) { setFailed(true); return; }
        setRows((d.movements || [])
          .filter((m) => clean(m?.reason) === "receive" && clean(m?.note).includes(poNumber))
          .sort((a, b) => clean(b?.created_date).localeCompare(clean(a?.created_date))));
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [sessionToken, poNumber, hasStockLink]);
  return { rows, failed, hasStockLink };
}

// Per-PO receiving panel: per-line status + backorder tracking + receive inputs
// that call the existing purchaseOrderAction receive_items action via the
// parent's onReceive callback (payload: [{index, quantity}]).
export default function ReceivePanel({ po, sessionToken, canReceive, busy, onReceive }) {
  const [receiveQtys, setReceiveQtys] = useState({});
  const [localError, setLocalError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const receipt = useMemo(() => derivePoReceipt(po), [po]);
  const history = useReceiveHistory(sessionToken, po);

  const submit = () => {
    const { lines, errors } = buildReceiptLines(receiveQtys, receipt);
    if (errors.length > 0) { setLocalError(errors.join(" ")); return; }
    setLocalError("");
    onReceive?.(lines);
    setReceiveQtys({});
  };

  const fillAll = () => setReceiveQtys(
    Object.fromEntries(receipt.lines.filter((l) => l.open > 0).map((l) => [l.index, l.open])),
  );

  const mailto = vendorNotifyMailto(po, receipt);
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(receivingSummaryText(po, receipt));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div>
      {/* Rollup progress strip */}
      <div className="mb-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full rounded-full transition-all ${receipt.complete ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${receipt.percent_received}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {receipt.percent_received}% received
          {receipt.totals.backordered > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">
              Backorder {receipt.totals.backordered}
            </span>
          )}
          {receipt.overdue && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Ordered</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Open / BO</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              {canReceive && (
                <th className="px-3 py-2 text-right">
                  Receive qty
                  <button type="button" title="Fill every line with its full open quantity" onClick={fillAll}
                    className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300">ALL</button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((l) => (
              <tr key={l.index} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                  {l.description}
                  {l.inventory_item_id && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-500" title="Linked to an inventory stock item — receiving posts stock">stock</span>}
                </td>
                <td className="px-3 py-2 text-right">{l.ordered}</td>
                <td className="px-3 py-2 text-right">{l.received}</td>
                <td className="px-3 py-2 text-right">
                  {l.open}
                  {l.backordered > 0 && (
                    <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300" title="Vendor backorder — still owed after a receipt">
                      BO {l.backordered}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{usd(l.unit_cost)}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {usd(l.ordered_cost)}
                  {l.variance_cost !== 0 && (
                    <div className={`text-[10px] font-semibold ${l.variance_cost < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {l.variance_cost < 0 ? "-" : "+"}{usd(Math.abs(l.variance_cost))} recv
                    </div>
                  )}
                </td>
                <td className="px-3 py-2"><LineStatusBadge status={l.status} /></td>
                {canReceive && (
                  <td className="px-3 py-2 text-right">
                    {l.open > 0 ? (
                      <input className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-800"
                        type="number" min="0" max={l.open} step="any" placeholder={String(l.open)}
                        value={receiveQtys[l.index] ?? ""}
                        onChange={(e) => setReceiveQtys((s) => ({ ...s, [l.index]: e.target.value }))} />
                    ) : <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />}
                  </td>
                )}
              </tr>
            ))}
            {receipt.lines.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">No line items.</td></tr>
            )}
          </tbody>
          {receipt.lines.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <td className="px-3 py-2">Totals</td>
                <td className="px-3 py-2 text-right">{receipt.totals.ordered}</td>
                <td className="px-3 py-2 text-right">{receipt.totals.received}</td>
                <td className="px-3 py-2 text-right">{receipt.totals.open}{receipt.totals.backordered > 0 ? ` (BO ${receipt.totals.backordered})` : ""}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right">{usd(receipt.totals.ordered_cost)}</td>
                <td className="px-3 py-2" colSpan={canReceive ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {localError && <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{localError}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canReceive && (
          <button type="button" onClick={submit} disabled={Boolean(busy)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy === "receive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}Record receipt
          </button>
        )}
        {/* Vendor notify: no backend email action exists for POs, so hand the
            operator a prefilled mailto + a clipboard summary instead. */}
        {mailto.to && (
          <a href={mailto.href}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            <Mail className="h-4 w-4" />Email vendor
          </a>
        )}
        <button type="button" onClick={copySummary}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
          <ClipboardCopy className="h-4 w-4" />{copied ? "Copied" : "Copy summary"}
        </button>
        {history.hasStockLink && (
          <button type="button" onClick={() => setShowHistory((s) => !s)}
            className="min-h-10 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            {showHistory ? "Hide receipt history" : `Receipt history (${history.rows.length})`}
          </button>
        )}
      </div>

      {showHistory && (
        <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Stock receipts on this PO</h4>
          {history.rows.length === 0 ? (
            <div className="mt-1 text-xs text-slate-400">
              {history.failed ? "History unavailable." : "No stock receipts recorded yet — only stock-linked lines post history."}
            </div>
          ) : (
            history.rows.map((m) => (
              <div key={m.id} className="mt-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{m.item_label || m.item_id} <span className="text-slate-400">({clean(m.created_date).slice(0, 10)}{m.created_by ? ` · ${m.created_by}` : ""})</span></span>
                <span className="font-semibold text-emerald-600">+{Math.abs(Number(m.delta) || 0)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
