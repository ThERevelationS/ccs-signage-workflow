import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShoppingCart, PackageCheck } from "lucide-react";
import { effectiveOrderStatus, isFulfilledOrder } from "@/shared/smartsheetOrderReceivedState.mjs";
import { safeOrderMobileDate } from "@/components/orders/OrderMobileCards";

const showDate = (value) => {
  const parsed = safeOrderMobileDate(value);
  return parsed ? format(parsed, "MMM d, yyyy") : "";
};

// Mobile Order detail: the warehouse-side view for reading an Order and
// recording ordered/received events. Field edits join the same pending-change
// queue as desktop edits; the mark actions use the same verified writes as
// the desktop quick actions and date pickers.
export default function OrderMobileDetail({
  order,
  workOrder = null,
  vendors = [],
  requestTypes = [],
  onUpdate,
  onMarkOrdered,
  onMarkReceived,
  busy = false,
  isRegistered = true,
  onClose,
}) {
  const [actionErrors, setActionErrors] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  if (!order) return null;

  const fulfilled = isFulfilledOrder(order);
  const cancelled = effectiveOrderStatus(order) === "cancelled";
  const editable = isRegistered && !busy && !fulfilled && !cancelled;

  const runAction = async (handler) => {
    setActionErrors([]);
    setActionBusy(true);
    try {
      const result = await handler(order);
      if (!result?.ok) setActionErrors(result?.fields || ["This Order could not be updated."]);
      else onClose();
    } catch (error) {
      setActionErrors([error?.message || "This Order could not be updated."]);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="clay-card border-none max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {order.customer_name || "Unnamed customer"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {workOrder && (
            <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              Job: <span className="font-medium">{workOrder.title || workOrder.client_name || workOrder.id}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Request Type</span>
            <Select
              value={order.request_type || ""}
              onValueChange={(value) => onUpdate(order.id, "request_type", value)}
              disabled={!editable}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Request type" /></SelectTrigger>
              <SelectContent>
                {requestTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Description</span>
            <textarea
              value={order.description || ""}
              onChange={(e) => onUpdate(order.id, "description", e.target.value)}
              disabled={!editable}
              rows={3}
              className="w-full rounded-md border border-slate-200 p-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Quantity</span>
              <Input
                value={order.quantity || ""}
                onChange={(e) => onUpdate(order.id, "quantity", e.target.value)}
                disabled={!editable}
                className="h-9 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Vendor</span>
              <Select
                value={order.vendor || ""}
                onValueChange={(value) => onUpdate(order.id, "vendor", value)}
                disabled={!editable}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
            <div>
              <div className="font-medium text-slate-500">Needed</div>
              <div>{order.date_needed_option || showDate(order.date_needed) || "—"}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Ordered</div>
              <div>{order.date_ordered_option || showDate(order.date_ordered) || "—"}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Received</div>
              <div>{order.receipt_option || showDate(order.date_received) || "—"}</div>
            </div>
          </div>

          {order.requestor_name && (
            <div className="text-xs text-slate-500">Requested by {order.requestor_name}</div>
          )}

          {actionErrors.length > 0 && (
            <div role="alert" className="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
              <div className="font-medium">Fill these in before continuing:</div>
              <ul className="mt-1 list-inside list-disc">
                {actionErrors.map((field, index) => <li key={index}>{field}</li>)}
              </ul>
            </div>
          )}

          {isRegistered && !fulfilled && !cancelled && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {!order.date_ordered && (
                <Button
                  type="button" variant="outline" size="sm" className="h-10"
                  disabled={busy || actionBusy}
                  onClick={() => runAction(onMarkOrdered)}
                >
                  {actionBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
                  Mark Ordered
                </Button>
              )}
              <Button
                type="button" size="sm" className={`h-10 ${order.date_ordered ? "col-span-2" : ""}`}
                disabled={busy || actionBusy}
                onClick={() => runAction(onMarkReceived)}
              >
                {actionBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1 h-4 w-4" />}
                Mark Received
              </Button>
            </div>
          )}
          {!isRegistered && (
            <p className="text-xs text-slate-400">Sign in to edit this order.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
