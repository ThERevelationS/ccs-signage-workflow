import { useState } from "react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_COLUMNS = [
  { value: "lead", label: "Lead", header: "border-blue-200 bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  { value: "quoted", label: "Quoted", header: "border-yellow-200 bg-yellow-50", badge: "bg-yellow-100 text-yellow-700" },
  { value: "follow_up", label: "Follow Up", header: "border-orange-200 bg-orange-50", badge: "bg-orange-100 text-orange-700" },
  { value: "on_hold", label: "On Hold", header: "border-gray-300 bg-gray-100", badge: "bg-gray-200 text-gray-700" },
  { value: "won", label: "Won", header: "border-green-200 bg-green-50", badge: "bg-green-100 text-green-700" },
  { value: "lost", label: "Lost", header: "border-red-200 bg-red-50", badge: "bg-red-100 text-red-700" },
];

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const localDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const futureDateStamp = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
};

export default function SalesPipelineKanban({ workOrders = [], onUpdateWorkOrder, onOpenDetails, isRegistered }) {
  const [draggedId, setDraggedId] = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const requestStatusChange = (workOrder, nextStatus) => {
    if (!isRegistered || !workOrder?.id || !nextStatus || workOrder.sales_status === nextStatus) return;
    if (["won", "lost"].includes(nextStatus)) {
      setPendingTransition({ workOrder, nextStatus });
      return;
    }
    onUpdateWorkOrder?.(workOrder.id, "sales_status", nextStatus);
  };

  const confirmTerminalTransition = () => {
    if (!pendingTransition) return;
    onUpdateWorkOrder?.(pendingTransition.workOrder.id, "sales_status", pendingTransition.nextStatus);
    setPendingTransition(null);
  };

  return (
    <>
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2">
        {STATUS_COLUMNS.map((status) => {
          const items = workOrders.filter((workOrder) => (workOrder.sales_status || "lead") === status.value);
          const value = items.reduce((sum, workOrder) => sum + (Number(workOrder.quoted_amount ?? workOrder.estimate_amount ?? 0) || 0), 0);
          return (
            <section
              key={status.value}
              className="flex min-h-0 w-[285px] min-w-[285px] flex-col rounded-xl border border-gray-200 bg-gray-50/70"
              onDragOver={(event) => {
                if (!isRegistered) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!isRegistered) return;
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || draggedId;
                const workOrder = workOrders.find((item) => item.id === id);
                if (workOrder) requestStatusChange(workOrder, status.value);
                setDraggedId(null);
              }}
            >
              <div className={`rounded-t-xl border-b px-3 py-2.5 ${status.header}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-800">{status.label}</div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.badge}`}>{items.length}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">{money(value)}</div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {items.map((workOrder) => {
                  const followUp = localDate(workOrder.follow_up_date);
                  const followUpDue = followUp && followUp <= today && !["won", "lost"].includes(workOrder.sales_status);
                  return (
                    <article
                      key={workOrder.id}
                      draggable={Boolean(isRegistered)}
                      onDragStart={(event) => {
                        if (!isRegistered) return;
                        setDraggedId(workOrder.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", workOrder.id);
                      }}
                      onDragEnd={() => setDraggedId(null)}
                      className={`rounded-lg border bg-white p-3 shadow-sm transition ${draggedId === workOrder.id ? "opacity-60" : "hover:border-gray-300 hover:shadow"}`}
                    >
                      <button type="button" onClick={() => onOpenDetails?.(workOrder)} className="block w-full text-left">
                        <div className="truncate text-sm font-semibold text-blue-700">{workOrder.client_name || "Unnamed opportunity"}</div>
                        {(workOrder.description || workOrder.title) && (
                          <div className="mt-1 line-clamp-2 text-xs text-gray-600">{workOrder.description || workOrder.title}</div>
                        )}
                      </button>

                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{money(workOrder.quoted_amount ?? workOrder.estimate_amount)}</span>
                        <span className="truncate">{workOrder.sales_rep || "Unassigned"}</span>
                      </div>

                      {followUp ? (
                        <div className={`mt-2 rounded-md px-2 py-1 text-xs ${followUpDue ? "bg-red-50 font-semibold text-red-700" : "bg-gray-50 text-gray-600"}`}>
                          Follow-up {format(followUp, "MMM d, yyyy")}{followUpDue ? " · due" : ""}
                        </div>
                      ) : !["won", "lost"].includes(workOrder.sales_status) ? (
                        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">No follow-up scheduled</div>
                      ) : null}

                      {isRegistered && !["won", "lost"].includes(workOrder.sales_status) && (
                        <div className="mt-2 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(1))} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">Tomorrow</button>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(3))} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">+3d</button>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(7))} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">+7d</button>
                        </div>
                      )}

                      <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                        <Select value={workOrder.sales_status || "lead"} onValueChange={(value) => requestStatusChange(workOrder, value)} disabled={!isRegistered}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_COLUMNS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </article>
                  );
                })}

                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white/60 px-3 py-8 text-center text-xs text-gray-400">
                    No opportunities in this stage
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <AlertDialog open={Boolean(pendingTransition)} onOpenChange={(open) => !open && setPendingTransition(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this opportunity {pendingTransition?.nextStatus === "won" ? "Won" : "Lost"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTransition?.workOrder?.client_name || "This opportunity"} will move into the {pendingTransition?.nextStatus === "won" ? "Won" : "Lost"} stage. The record is preserved and can still be reopened later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTerminalTransition}>
              Mark {pendingTransition?.nextStatus === "won" ? "Won" : "Lost"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
