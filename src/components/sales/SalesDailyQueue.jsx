import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarClock, CheckCircle2, ChevronRight, Clock3, UserRound } from "lucide-react";
import { getQuoteAgingState, isQuoteAwaitingResponse } from "@/components/sales/salesQuoteAging";
import { isCurrentPipelineOpportunity } from "@/components/sales/salesRecordScopes";
import { isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";
import { buildSalesPersonSelectModel } from "@/components/sales/salesPersonIdentity.mjs";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const dateLabel = (stamp) => {
  if (!stamp) return "—";
  const [year, month, day] = String(stamp).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return stamp;
  return format(new Date(year, month - 1, day), "MMM d");
};

const ownerKey = (value) => String(value || "").trim().toLowerCase();
const canonicalOwnerKey = (value, users) => ownerKey(buildSalesPersonSelectModel(value, users).canonical);

export default function SalesDailyQueue({
  workOrders = [],
  onOpenDetails,
  onUpdateWorkOrder,
  onCompleteFollowUp,
  isRegistered,
  currentSalesOwnerLabel = "",
  users = [],
}) {
  const [ownerScope, setOwnerScope] = useState("all");
  const [quoteDateErrors, setQuoteDateErrors] = useState({});
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStamp = format(today, "yyyy-MM-dd");
  const nearCloseStamp = format(addDays(today, 14), "yyyy-MM-dd");
  const currentOwnerKey = canonicalOwnerKey(currentSalesOwnerLabel, users);

  const queues = useMemo(() => {
    const eligible = workOrders
      .filter(isCurrentPipelineOpportunity)
      .filter((workOrder) => {
        if (ownerScope === "mine") return currentOwnerKey && canonicalOwnerKey(workOrder.sales_rep, users) === currentOwnerKey;
        if (ownerScope === "unassigned") return !ownerKey(workOrder.sales_rep);
        return true;
      });

    const sections = {
      overdue: [],
      today: [],
      quote_no_followup: [],
      close_overdue: [],
      near_close: [],
    };

    eligible.forEach((workOrder) => {
      const followUp = String(workOrder.follow_up_date || "").slice(0, 10);
      const expectedClose = String(workOrder.expected_close_date || "").slice(0, 10);
      if (followUp && followUp < todayStamp) sections.overdue.push(workOrder);
      else if (followUp === todayStamp) sections.today.push(workOrder);
      else if (!followUp && isQuoteAwaitingResponse(workOrder)) sections.quote_no_followup.push(workOrder);
      else if (expectedClose && expectedClose < todayStamp) sections.close_overdue.push(workOrder);
      else if (expectedClose && expectedClose >= todayStamp && expectedClose <= nearCloseStamp) sections.near_close.push(workOrder);
    });

    const byUrgency = (a, b) => {
      const aDate = a.follow_up_date || a.expected_close_date || "9999-12-31";
      const bDate = b.follow_up_date || b.expected_close_date || "9999-12-31";
      if (aDate !== bDate) return String(aDate).localeCompare(String(bDate));
      const aValue = Number(a.estimate_amount ?? 0) || 0;
      const bValue = Number(b.estimate_amount ?? 0) || 0;
      return bValue - aValue;
    };
    Object.values(sections).forEach((rows) => rows.sort(byUrgency));
    return sections;
  }, [workOrders, ownerScope, currentOwnerKey, todayStamp, nearCloseStamp, users]);

  const sectionDefinitions = [
    { key: "overdue", title: "Overdue Follow-ups", description: "Past-due customer follow-ups that need action first.", tone: "border-red-200 bg-red-50/50", badge: "bg-red-100 text-red-800" },
    { key: "today", title: "Due Today", description: "Follow-ups scheduled for today.", tone: "border-orange-200 bg-orange-50/50", badge: "bg-orange-100 text-orange-800" },
    { key: "quote_no_followup", title: "Quotes Without Follow-up", description: "Quoted / Follow Up opportunities awaiting response with no next follow-up scheduled.", tone: "border-amber-200 bg-amber-50/50", badge: "bg-amber-100 text-amber-800" },
    { key: "close_overdue", title: "Expected Close Overdue", description: "Expected close date has passed while the opportunity remains open.", tone: "border-rose-200 bg-rose-50/40", badge: "bg-rose-100 text-rose-800" },
    { key: "near_close", title: "Closing in the Next 14 Days", description: "Open opportunities with an explicit expected close date coming soon.", tone: "border-cyan-200 bg-cyan-50/50", badge: "bg-cyan-100 text-cyan-800" },
  ];
  const total = sectionDefinitions.reduce((sum, section) => sum + queues[section.key].length, 0);

  const setFollowUpDays = (workOrder, days) => {
    if (!isRegistered) return;
    onUpdateWorkOrder?.(workOrder.id, "follow_up_date", format(addDays(today, days), "yyyy-MM-dd"));
  };

  const setQuoteSentDate = (workOrder, value) => {
    if (!isRegistered || !workOrder?.id) return;
    const nextDate = String(value || "").slice(0, 10);
    if (nextDate && nextDate > todayStamp) {
      setQuoteDateErrors((current) => ({ ...current, [workOrder.id]: "Quote sent date cannot be in the future." }));
      return;
    }
    setQuoteDateErrors((current) => {
      if (!current[workOrder.id]) return current;
      const next = { ...current };
      delete next[workOrder.id];
      return next;
    });
    onUpdateWorkOrder?.(workOrder.id, "date_estimate_sent", nextDate);
  };

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold text-slate-900"><CalendarClock className="h-5 w-5 text-blue-600" />Daily Sales Queue</div>
              <p className="mt-1 text-xs text-slate-500">One operational view over existing Sales fields. Completing or rescheduling here uses the same WorkOrder workflow and history as the rest of Sales Pipeline.</p>
              <div className="mt-1 text-[11px] font-medium text-slate-400">{total} item{total === 1 ? "" : "s"} need attention in this owner view.</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setOwnerScope("all")} className={`h-11 rounded-full border px-3 text-xs font-semibold sm:h-8 ${ownerScope === "all" ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>All</button>
              {currentSalesOwnerLabel && <button type="button" onClick={() => setOwnerScope("mine")} className={`h-11 rounded-full border px-3 text-xs font-semibold sm:h-8 ${ownerScope === "mine" ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"}`}>Mine</button>}
              <button type="button" onClick={() => setOwnerScope("unassigned")} className={`h-11 rounded-full border px-3 text-xs font-semibold sm:h-8 ${ownerScope === "unassigned" ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"}`}>Unassigned</button>
            </div>
          </div>
        </section>

        {total === 0 ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <div className="mt-3 text-base font-semibold text-emerald-900">Daily queue is clear</div>
            <p className="mt-1 text-sm text-emerald-700">No overdue/today follow-ups, quote follow-up gaps, or close-date items match this owner view.</p>
          </section>
        ) : sectionDefinitions.map((section) => {
          const rows = queues[section.key];
          if (rows.length === 0) return null;
          return (
            <section key={section.key} className={`rounded-xl border p-3 shadow-sm sm:p-4 ${section.tone}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Clock3 className="h-4 w-4" />{section.title}<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${section.badge}`}>{rows.length}</span></div>
                  <p className="mt-1 text-xs text-gray-600">{section.description}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {rows.map((workOrder) => {
                  const value = Number(workOrder.estimate_amount ?? 0) || 0;
                  const quoteAging = getQuoteAgingState(workOrder, today);
                  const quoteTimingMissing = quoteAging.awaitingResponse && !quoteAging.tracked;
                  const expectedCloseStamp = String(workOrder.expected_close_date || "").slice(0, 10);
                  const expectedCloseOverdue = Boolean(expectedCloseStamp && expectedCloseStamp < todayStamp);
                  const expectedCloseNear = Boolean(expectedCloseStamp && expectedCloseStamp >= todayStamp && expectedCloseStamp <= nearCloseStamp);
                  const placeholder = isLikelySalesPlaceholder(workOrder);
                  const salesOwnerLabel = buildSalesPersonSelectModel(workOrder.sales_rep, users).canonical;
                  return (
                    <article key={workOrder.id} className="rounded-lg border border-white/80 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => onOpenDetails?.(workOrder)} className="min-w-0 flex-1 text-left">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-blue-700">{workOrder.client_name || "Unnamed opportunity"}</span>
                            {placeholder && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">TEST</span>}
                          </div>
                          {(workOrder.title || workOrder.description) && <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{workOrder.title || workOrder.description}</div>}
                        </button>
                        <button type="button" onClick={() => onOpenDetails?.(workOrder)} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 sm:h-8 sm:w-8" title="Open opportunity" aria-label={`Open ${workOrder.client_name || "opportunity"} details`}><ChevronRight className="h-4 w-4" /></button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">{money(value)}</span>
                        <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{salesOwnerLabel || "Unassigned"}</span>
                        {workOrder.follow_up_date && <span>Follow-up {dateLabel(workOrder.follow_up_date)}</span>}
                        {workOrder.expected_close_date && (
                          <span className={expectedCloseOverdue ? "font-semibold text-rose-700" : expectedCloseNear ? "font-semibold text-cyan-700" : ""}>
                            Close {dateLabel(workOrder.expected_close_date)}{expectedCloseOverdue ? " · overdue" : expectedCloseNear ? " · next 14d" : ""}
                          </span>
                        )}
                        {quoteAging.awaitingResponse && (quoteAging.tracked ? <span>Quote {quoteAging.ageDays}d</span> : <span className="font-medium text-amber-700">Quote Timing Missing</span>)}
                      </div>

                      {isRegistered && (expectedCloseOverdue || expectedCloseNear) && (
                        <div className={`mt-3 rounded-lg border p-2.5 ${expectedCloseOverdue ? "border-rose-200 bg-rose-50/70" : "border-cyan-200 bg-cyan-50/70"}`}>
                          <label>
                            <span className={`block text-[10px] font-bold uppercase tracking-wide ${expectedCloseOverdue ? "text-rose-800" : "text-cyan-800"}`}>
                              {expectedCloseOverdue ? "Expected close overdue — review timing" : "Expected close within 14 days"}
                            </span>
                            <CcsDateField
                              value={expectedCloseStamp}
                              onChange={(event) => onUpdateWorkOrder?.(workOrder.id, "expected_close_date", event.target.value)}
                              aria-label={`Expected close date for ${workOrder.client_name || "opportunity"}`}
                              className={`mt-1 h-11 w-full rounded-md border bg-white px-2 text-sm text-gray-800 outline-none focus:ring-2 sm:h-9 ${expectedCloseOverdue ? "border-rose-200 focus:border-rose-400 focus:ring-rose-100" : "border-cyan-200 focus:border-cyan-400 focus:ring-cyan-100"}`}
                            />
                          </label>
                          <p className={`mt-1.5 text-[11px] ${expectedCloseOverdue ? "text-rose-700" : "text-cyan-700"}`}>
                            Update the forecast here if the expected close has changed; the original value remains in Sales history after save.
                          </p>
                        </div>
                      )}

                      {isRegistered && quoteTimingMissing && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <label className="min-w-0 flex-1">
                              <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-800">Actual quote sent date</span>
                              <CcsDateField
                                max={todayStamp}
                                value={workOrder.date_estimate_sent || ""}
                                onChange={(event) => setQuoteSentDate(workOrder, event.target.value)}
                                aria-label={`Actual quote sent date for ${workOrder.client_name || "opportunity"}`}
                                className="mt-1 h-11 w-full rounded-md border border-amber-200 bg-white px-2 text-sm text-gray-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 sm:h-9"
                              />
                            </label>
                            <button type="button" onClick={() => setQuoteSentDate(workOrder, todayStamp)} className="h-11 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 sm:h-9">Today</button>
                          </div>
                          <p className={`mt-1.5 text-[11px] ${quoteDateErrors[workOrder.id] ? "font-medium text-red-600" : "text-amber-700"}`}>
                            {quoteDateErrors[workOrder.id] || "Enter the real sent date only. Sales Pipeline will not infer it from record activity."}
                          </p>
                        </div>
                      )}

                      {isRegistered && (
                        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain border-t border-gray-100 pt-2.5 sm:flex-wrap sm:overflow-visible" aria-label="Daily queue follow-up actions">
                          <button type="button" onClick={() => onCompleteFollowUp?.(workOrder)} className="inline-flex h-11 shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 sm:h-7"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{workOrder.follow_up_date ? "Complete" : "Log follow-up"}</button>
                          <span className="ml-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{workOrder.follow_up_date ? "Reschedule" : "Schedule"}</span>
                          <button type="button" onClick={() => setFollowUpDays(workOrder, 1)} className="h-11 shrink-0 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 hover:bg-gray-50 sm:h-7">Tomorrow</button>
                          <button type="button" onClick={() => setFollowUpDays(workOrder, 3)} className="h-11 shrink-0 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 hover:bg-gray-50 sm:h-7">+3</button>
                          <button type="button" onClick={() => setFollowUpDays(workOrder, 7)} className="h-11 shrink-0 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 hover:bg-gray-50 sm:h-7">+7</button>
                          <button type="button" onClick={() => setFollowUpDays(workOrder, 14)} className="h-11 shrink-0 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 hover:bg-gray-50 sm:h-7">+14</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
