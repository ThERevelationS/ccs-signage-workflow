import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Ticket, X } from "lucide-react";
import {
  RESTOCK_AVAILABLE,
  RESTOCK_NOTE,
  creditableAmount,
  paymentRefundable,
  usdSigned,
} from "@/components/invoicing/refundMath";
import { filterInputCls } from "@/components/kit";

const inputCls = filterInputCls;
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function Shell({ title, icon, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4" onClick={onClose}>
      <div
        className="my-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            {icon}
            {title}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

// Issue a credit memo: a negative "recorded" Payment row with method
// credit_memo. Reopens the invoice balance so staff can adjust or void it —
// the money trail is preserved rather than deleted.
export function IssueCreditDialog({ payments, busy, onClose, onSubmit }) {
  const max = useMemo(() => creditableAmount(payments), [payments]);
  const [amount, setAmount] = useState(max > 0 ? String(max.toFixed(2)) : "");
  const [reason, setReason] = useState("");
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0 && n <= max + 0.005;

  return (
    <Shell title="Issue credit memo" icon={<Ticket className="h-5 w-5 text-violet-500" />} onClose={onClose}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Credits up to the collected amount ({usdSigned(max)}). The credit reopens the invoice balance — adjust the
        invoice or void it to settle the remainder. The payment trail is preserved.
      </p>
      <div>
        <label className={labelCls}>Credit amount</label>
        <input className={inputCls} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {amount !== "" && !valid && (
          <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
            Enter an amount between $0.01 and {usdSigned(max)}.
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Reason</label>
        <input className={inputCls} placeholder="e.g. Returned banner — order cancelled" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          Cancel
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || !valid}
          onClick={() => onSubmit({ amount: n, reason: reason.trim() })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          Issue credit
        </button>
      </div>
    </Shell>
  );
}

// Refund a recorded payment: writes a negative "refunded" Payment row linked to
// the original via refund_of_payment_id. The original payment is never
// deleted — it accumulates refunded_amount and flips to "refunded" only when
// fully returned.
export function RefundPaymentDialog({ payment, payments, busy, onClose, onSubmit }) {
  const max = useMemo(() => paymentRefundable(payment, payments), [payment, payments]);
  const [amount, setAmount] = useState(max > 0 ? String(max.toFixed(2)) : "");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0 && n <= max + 0.005;

  return (
    <Shell title={`Refund ${usdSigned(payment?.amount)} payment`} icon={<RotateCcw className="h-5 w-5 text-red-500" />} onClose={onClose}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Refunds up to {usdSigned(max)} — the payment's un-refunded remainder, capped by the invoice's collected
        balance. The refund reopens the invoice balance; the original payment stays on record.
      </p>
      <div>
        <label className={labelCls}>Refund amount</label>
        <input className={inputCls} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {amount !== "" && !valid && (
          <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
            Enter an amount between $0.01 and {usdSigned(max)}.
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Reason</label>
        <input className={inputCls} placeholder="e.g. Customer returned materials" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={restock}
          disabled={!RESTOCK_AVAILABLE}
          onChange={(e) => setRestock(e.target.checked)}
        />
        <span className={RESTOCK_AVAILABLE ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}>
          Return invoiced stock to inventory
          <span className="block text-xs font-normal text-slate-400 dark:text-slate-500">{RESTOCK_NOTE}</span>
        </span>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          Cancel
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || !valid}
          onClick={() => onSubmit({ amount: n, reason: reason.trim(), restock: RESTOCK_AVAILABLE && restock })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Refund
        </button>
      </div>
    </Shell>
  );
}
