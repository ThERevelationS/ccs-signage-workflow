import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { effectiveOrderStatus, isFulfilledOrder } from "@/shared/smartsheetOrderReceivedState.mjs";
import { safeOrderMobileDate } from "@/components/orders/OrderMobileCards";

const showDate = (value) => {
  const parsed = safeOrderMobileDate(value);
  return parsed ? format(parsed, "MMM d, yyyy") : "";
};

const showDateTime = (value) => {
  const parsed = safeOrderMobileDate(value);
  return parsed ? format(parsed, "MMM d, yyyy h:mm a") : "";
};

const COMPARE_FIELDS = [
  { key: "request_type", label: "Request Type", value: (o) => o.request_type },
  { key: "quantity", label: "Quantity", value: (o) => o.quantity },
  { key: "requestor_name", label: "Requestor", value: (o) => o.requestor_name || o.requestor_email },
  {
    key: "date_needed",
    label: "Date Needed",
    value: (o) => o.date_needed_option || showDate(o.date_needed),
  },
  {
    key: "date_ordered",
    label: "Date Ordered",
    value: (o) => o.date_ordered_option || showDate(o.date_ordered),
  },
  {
    key: "date_received",
    label: "Date Received",
    value: (o) => o.receipt_option || showDate(o.date_received),
  },
  { key: "status", label: "Status", value: (o) => effectiveOrderStatus(o) },
  { key: "created_date", label: "Created", value: (o) => showDateTime(o.created_date) },
  {
    key: "smartsheet_row_id",
    label: "Smartsheet Row",
    value: (o) => (o.smartsheet_row_id ? `…${String(o.smartsheet_row_id).slice(-6)}` : "Not linked"),
  },
];

// Duplicate Order review: side-by-side comparison of Orders that share
// customer + description + vendor while open. Actions are explicit and
// auditable — "Keep this one" trashes the other group members through the
// same guarded soft-delete as the grid delete (recoverable, tombstones
// preserved); "Not duplicates" records a verified review decision so the
// group stops flagging. Nothing merges or relinks automatically.
export default function OrderDuplicateReview({
  orders = [],
  workOrdersById = null,
  onKeepOrder,
  onNotDuplicates,
  busy = false,
  onClose,
}) {
  const [error, setError] = useState("");
  if (!orders.length) return null;

  const group = orders;
  const shared = `${group[0]?.customer_name || "Unnamed customer"} · ${group[0]?.vendor || "No vendor"}`;

  const run = async (handler) => {
    setError("");
    try {
      const result = await handler();
      if (result === false) return;
    } catch (err) {
      setError(err?.message || "The review action could not be completed. Reload and retry.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="clay-card border-none max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Possible duplicate Orders ({group.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            These open Orders share the same customer, description, and vendor:{" "}
            <span className="font-medium">{shared}</span>. Keeping one trashes the rest (recoverable
            from Order Trash). Nothing changes in Smartsheet rows or links automatically.
          </div>

          <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <span className="font-medium text-slate-500">Description:</span>{" "}
            {group[0]?.description || "(none)"}
          </div>

          {/* Desktop comparison table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 sm:block">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Field</th>
                  {group.map((order, index) => (
                    <th key={order.id} className="px-3 py-2 text-left font-medium">
                      Order {index + 1}
                      {isFulfilledOrder(order) && (
                        <span className="ml-1 font-normal text-emerald-600">(received)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map((field) => {
                  const values = group.map((order) => field.value(order) || "—");
                  const differing = new Set(values).size > 1;
                  return (
                    <tr key={field.key} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5 font-medium text-slate-500">{field.label}</td>
                      {values.map((value, index) => (
                        <td
                          key={group[index].id}
                          className={`px-3 py-1.5 ${differing ? "font-medium text-amber-700 dark:text-amber-300" : ""}`}
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1.5 font-medium text-slate-500">Linked Job</td>
                  {group.map((order) => {
                    const job = order.work_order_id ? workOrdersById?.get?.(order.work_order_id) : null;
                    return (
                      <td key={order.id} className="px-3 py-1.5">
                        {job ? (
                          <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300">
                            <ExternalLink className="h-3 w-3" />
                            {job.title || job.client_name || "Job"}
                          </span>
                        ) : order.work_order_id ? (
                          "Job linked"
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {group.map((order, index) => (
              <div
                key={order.id}
                className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="mb-2 flex items-center justify-between text-xs font-medium">
                  <span>Order {index + 1}</span>
                  <span className="text-slate-400">{showDateTime(order.created_date)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {COMPARE_FIELDS.slice(0, 7).map((field) => (
                    <div key={field.key}>
                      <dt className="text-slate-400">{field.label}</dt>
                      <dd>{field.value(order) || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {group.map((order, index) => (
                <Button
                  key={order.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => onKeepOrder(order))}
                >
                  {busy ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                  )}
                  Keep Order {index + 1}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(onNotDuplicates)}>
                Not duplicates
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
