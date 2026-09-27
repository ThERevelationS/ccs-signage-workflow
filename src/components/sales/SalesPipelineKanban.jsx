import { useState } from "react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import { getStageAgingState } from "@/components/sales/salesStageAging";
import { getQuoteAgingState } from "@/components/sales/salesQuoteAging";
import { getActionableSalesAttentionItems } from "@/components/sales/salesAttention";
import { isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";

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

export default function SalesPipelineKanban({ workOrders = [], onUpdateWorkOrder, onRequestStatusChange, onCompleteFollowUp, onOpenDetails, isRegistered, currentSalesOwnerLabel = "", leadSources = [] }) {
  const [draggedId, setDraggedId] = useState(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nearClose = localDate(futureDateStamp(14));

  const requestStatusChange = (workOrder, nextStatus) => {
    if (!isRegistered || !workOrder?.id || !nextStatus || workOrder.sales_status === nextStatus) return;
    onRequestStatusChange?.(workOrder, nextStatus);
  };

  return (
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2">
        {STATUS_COLUMNS.map((status) => {
          const items = workOrders.filter((workOrder) => (workOrder.sales_status || "lead") === status.value);
          const value = items.reduce((sum, workOrder) => sum + (Number(workOrder.estimate_amount ?? 0) || 0), 0);
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
                  const expectedClose = localDate(workOrder.expected_close_date);
                  const isOpen = !["won", "lost"].includes(workOrder.sales_status);
                  const followUpDue = followUp && followUp <= today && isOpen;
                  const expectedCloseOverdue = expectedClose && expectedClose < today && isOpen;
                  const expectedCloseNear = expectedClose && expectedClose >= today && expectedClose <= nearClose && isOpen;
                  const stageAging = getStageAgingState(workOrder, today);
                  const quoteAging = getQuoteAgingState(workOrder, today);
                  const attentionItems = getActionableSalesAttentionItems(workOrder, today);
                  const attentionKeys = new Set(attentionItems.map((item) => item.key));
                  const likelyPlaceholder = isLikelySalesPlaceholder(workOrder);
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
                      <button type="button" onClick={() => onOpenDetails?.(workOrder)}
                        aria-label={`Open sales details for ${workOrder.client_name || 'Unnamed opportunity'}`}
                        className="block min-h-11 w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-blue-700">{workOrder.client_name || "Unnamed opportunity"}</div>
                          {likelyPlaceholder && <span className="flex-shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-800">TEST</span>}
                        </div>
                        {(workOrder.description || workOrder.title) && (
                          <div className="mt-1 line-clamp-2 text-xs text-gray-600">{workOrder.description || workOrder.title}</div>
                        )}
                      </button>

                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{money(workOrder.estimate_amount)}</span>
                        <span className="truncate">{workOrder.sales_rep || "Unassigned"}</span>
                      </div>
                      {attentionItems.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                          <span className="font-semibold">Needs attention:</span>{" "}
                          {attentionItems.slice(0, 2).map((item) => item.shortLabel).join(" · ")}{attentionItems.length > 2 ? ` · +${attentionItems.length - 2}` : ""}
                          {isRegistered && (
                            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-amber-200 pt-2" onClick={(event) => event.stopPropagation()}>
                              {attentionKeys.has("owner_missing") && currentSalesOwnerLabel && <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "sales_rep", currentSalesOwnerLabel)} className="min-h-11 rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 sm:min-h-8">Assign to me</button>}
                              {attentionKeys.has("source_missing") && leadSources.filter(Boolean).length > 0 && (
                                <Select onValueChange={(value) => onUpdateWorkOrder?.(workOrder.id, "lead_source", value)}>
                                  <SelectTrigger aria-label={`Set lead source for ${workOrder.client_name || 'Unnamed opportunity'}`} className="h-11 w-[108px] border-amber-300 bg-white px-2 text-[10px] font-semibold text-amber-900 sm:h-8"><SelectValue placeholder="Set source" /></SelectTrigger>
                                  <SelectContent>{leadSources.filter(Boolean).map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {stageAging.tracked ? (
                        <div className={`mt-1 text-xs ${stageAging.aged ? "font-semibold text-rose-700" : "text-gray-500"}`}>Stage age {stageAging.ageDays}d{workOrder.sales_status === "on_hold" ? " · on hold" : stageAging.aged ? " · aged" : ""}</div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400">Stage age not tracked</div>
                      )}
                      {quoteAging.awaitingResponse ? (
                        quoteAging.tracked ? (
                          <div className={`mt-1 text-xs ${quoteAging.veryAged ? "font-semibold text-rose-700" : quoteAging.aged ? "font-semibold text-amber-700" : "text-gray-500"}`}>Quote age {quoteAging.ageDays}d</div>
                        ) : (
                          <div className="mt-1 text-xs font-medium text-amber-700">Quote sent date missing</div>
                        )
                      ) : null}

                      {followUp ? (
                        <div className={`mt-2 rounded-md px-2 py-1 text-xs ${followUpDue ? "bg-red-50 font-semibold text-red-700" : "bg-gray-50 text-gray-600"}`}>
                          Follow-up {format(followUp, "MMM d, yyyy")}{followUpDue ? " · due" : ""}
                        </div>
                      ) : !["won", "lost"].includes(workOrder.sales_status) ? (
                        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">No follow-up scheduled</div>
                      ) : null}

                      {expectedClose && (
                        <div className={`mt-2 rounded-md px-2 py-1 text-xs ${expectedCloseOverdue ? "bg-rose-50 font-semibold text-rose-700" : expectedCloseNear ? "bg-cyan-50 font-semibold text-cyan-700" : "bg-slate-50 text-slate-600"}`}>
                          Expected close {format(expectedClose, "MMM d, yyyy")}{expectedCloseOverdue ? " · overdue" : expectedCloseNear ? " · next 14d" : ""}
                        </div>
                      )}

                      {isRegistered && (expectedCloseOverdue || expectedCloseNear) && (
                        <label className={`mt-2 block rounded-md border p-2 ${expectedCloseOverdue ? "border-rose-200 bg-rose-50/60" : "border-cyan-200 bg-cyan-50/60"}`} onClick={(event) => event.stopPropagation()}>
                          <span className={`block text-[9px] font-bold uppercase tracking-wide ${expectedCloseOverdue ? "text-rose-800" : "text-cyan-800"}`}>
                            {expectedCloseOverdue ? "Review overdue close" : "Review near close"}
                          </span>
                          <input
                            type="date"
                            value={workOrder.expected_close_date || ""}
                            onChange={(event) => onUpdateWorkOrder?.(workOrder.id, "expected_close_date", event.target.value)}
                            className={`mt-1 h-11 w-full rounded-md border bg-white px-2 text-xs text-gray-800 outline-none focus:ring-2 sm:h-8 ${expectedCloseOverdue ? "border-rose-200 focus:border-rose-400 focus:ring-rose-100" : "border-cyan-200 focus:border-cyan-400 focus:ring-cyan-100"}`}
                            aria-label={`Expected close date for ${workOrder.client_name || "opportunity"}`}
                          />
                        </label>
                      )}

                      {isRegistered && isOpen && quoteAging.awaitingResponse && !quoteAging.tracked && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 p-2" onClick={(event) => event.stopPropagation()}>
                          <label>
                            <span className="block text-[9px] font-bold uppercase tracking-wide text-amber-800">Actual quote sent date</span>
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                type="date"
                                max={futureDateStamp(0)}
                                value={workOrder.date_estimate_sent || ""}
                                onChange={(event) => {
                                  const nextDate = event.target.value;
                                  if (!nextDate || nextDate <= futureDateStamp(0)) onUpdateWorkOrder?.(workOrder.id, "date_estimate_sent", nextDate);
                                }}
                                className="h-11 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:h-8"
                                aria-label={`Actual quote sent date for ${workOrder.client_name || "opportunity"}`}
                              />
                              <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "date_estimate_sent", futureDateStamp(0))} className="h-11 shrink-0 rounded-md border border-amber-300 bg-white px-2 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 sm:h-8">Today</button>
                            </div>
                          </label>
                          <p className="mt-1 text-[10px] text-amber-700">Use the real sent date; future dates are blocked.</p>
                        </div>
                      )}

                      {isRegistered && isOpen && (
                        <div
                          className="mt-2 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0"
                          aria-label="Kanban follow-up quick actions. Swipe horizontally for more actions."
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(1))} className="h-11 shrink-0 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:h-8">Tomorrow</button>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(3))} className="h-11 shrink-0 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:h-8">+3d</button>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(7))} className="h-11 shrink-0 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:h-8">+7d</button>
                          <button type="button" onClick={() => onUpdateWorkOrder?.(workOrder.id, "follow_up_date", futureDateStamp(14))} className="h-11 shrink-0 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:h-8">+14d</button>
                          <button type="button" onClick={() => onCompleteFollowUp?.(workOrder)} className="inline-flex h-11 shrink-0 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 sm:h-8"><CheckCircle2 className="mr-1 h-3 w-3" />Done</button>
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Move stage</span>
                        <Select value={workOrder.sales_status || "lead"} onValueChange={(value) => requestStatusChange(workOrder, value)} disabled={!isRegistered}>
                          <SelectTrigger aria-label={`Move ${workOrder.client_name || 'Unnamed opportunity'} to another sales stage`} className="h-11 flex-1 text-xs sm:h-8">
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
  );
}
