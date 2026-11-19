import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import TaskAssigneeSelect from "@/components/sales/TaskAssigneeSelect";
import { CheckCircle2 } from "lucide-react";
import { getStageAgingState } from "@/components/sales/salesStageAging";
import { getQuoteAgingState } from "@/components/sales/salesQuoteAging";
import { getActionableSalesAttentionItems } from "@/components/sales/salesAttention";
import { isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";
import { buildSalesPersonSelectModel } from "@/components/sales/salesPersonIdentity.mjs";
import { salesOpportunityDisplayName } from "@/components/sales/salesOpportunityIdentity.mjs";
import { classifySalesTaskStatusAudit } from "../../../base44/shared/salesTaskStatusAudit.mjs";
import { salesStageDisplayLabel, salesStageDisplayValue } from "@/components/sales/salesStageTrust.mjs";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const SALES_STATUSES = [
  { value: "lead", label: "Lead", color: "bg-blue-100 text-blue-700" },
  { value: "quoted", label: "Quoted", color: "bg-yellow-100 text-yellow-700" },
  { value: "follow_up", label: "Follow Up", color: "bg-orange-100 text-orange-700" },
  { value: "won", label: "Won", color: "bg-green-100 text-green-700" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-700" },
  { value: "on_hold", label: "On Hold", color: "bg-gray-100 text-gray-700" },
];

const safeDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
};

const futureDateStamp = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
};

export default function SalesPipelineMobileCards({ workOrders, onOpenDetails, onUpdateWorkOrder, onCompleteFollowUp, isRegistered, currentSalesOwnerLabel = "", leadSources = [], users = [] }) {
  return (
    <div className="space-y-2 p-1.5">
      {workOrders.map((wo) => {
        const stageDisplayValue = salesStageDisplayValue(wo);
        const stageDisplayLabel = salesStageDisplayLabel(wo);
        const status = stageDisplayValue === "closed_neutral"
          ? { value: "closed_neutral", label: "Closed (Neutral)", color: "bg-slate-100 text-slate-700" }
          : SALES_STATUSES.find(s => s.value === stageDisplayValue);
        const deadline = wo.current_task_deadline ? safeDate(wo.current_task_deadline) : null;
        const followUp = wo.follow_up_date ? safeDate(wo.follow_up_date) : null;
        const expectedClose = wo.expected_close_date ? safeDate(wo.expected_close_date) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOpen = !["won", "lost"].includes(wo.sales_status);
        const followUpDue = followUp && followUp <= today && isOpen;
        const nearClose = safeDate(futureDateStamp(14));
        const expectedCloseOverdue = expectedClose && expectedClose < today && isOpen;
        const expectedCloseNear = expectedClose && expectedClose >= today && expectedClose <= nearClose && isOpen;
        const stageAging = getStageAgingState(wo, today);
        const quoteAging = getQuoteAgingState(wo, today);
        const attentionItems = getActionableSalesAttentionItems(wo, today);
        const attentionKeys = new Set(attentionItems.map((item) => item.key));
        const likelyPlaceholder = isLikelySalesPlaceholder(wo);
        const opportunityDisplayName = salesOpportunityDisplayName(wo);
        const taskStatusAudit = classifySalesTaskStatusAudit(wo);
        const salesOwnerLabel = buildSalesPersonSelectModel(wo.sales_rep, users).canonical;
        return (
          <div
            key={wo.id}
            className="clay-card cursor-pointer p-3 transition-opacity active:opacity-80"
            style={{ minHeight: '44px', fontSize: '14px' }}
            onClick={() => onOpenDetails && onOpenDetails(wo)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-base font-semibold text-gray-800">{opportunityDisplayName}</p>
                  {likelyPlaceholder && <span className="flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">TEST</span>}
                </div>
                {taskStatusAudit.kind !== 'none' && (
                  <div className={`mt-1 rounded-md border px-2 py-1.5 text-[11px] leading-4 ${taskStatusAudit.kind === 'modern_review' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`} role="note">
                    <span className="font-semibold">{taskStatusAudit.kind === 'modern_review' ? 'Task / Status review' : 'Legacy task context'}</span> · {taskStatusAudit.reason}
                  </div>
                )}
                {wo.title && <p className="text-gray-500 text-sm truncate">{wo.title}</p>}
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenDetails?.(wo); }}
                  className="mt-1 inline-flex min-h-11 items-center rounded-md px-1 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label={`Open sales details for ${opportunityDisplayName}`}>
                  Open details
                </button>
              </div>
              {status && (
                <span className={`flex-shrink-0 rounded-md px-2.5 py-2 text-xs font-semibold ${status.color}`}
                  aria-label={`Sales Status: ${stageDisplayLabel}`}
                  title="Read-only Sales Status. Change Task Description in Opportunity Detail to move stages.">
                  {stageDisplayLabel}
                </span>
              )}
            </div>

            <div className="mb-3" onClick={(event) => event.stopPropagation()}>
              <div className="mb-1 text-xs text-muted-foreground">Task assigned to</div>
              <TaskAssigneeSelect value={wo.current_task_assigned_to || ""} users={users} disabled={!isRegistered || !isOpen} onChange={(name) => onUpdateWorkOrder?.(wo.id, "current_task_assigned_to", name)} context={opportunityDisplayName} />
            </div>

            {wo.current_task_description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{wo.current_task_description}</p>
            )}

            {attentionItems.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                <span className="font-semibold">Needs attention:</span>{" "}
                {attentionItems.slice(0, 2).map((item) => item.shortLabel).join(" · ")}{attentionItems.length > 2 ? ` · +${attentionItems.length - 2}` : ""}
                {isRegistered && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-amber-200 pt-2" onClick={(event) => event.stopPropagation()}>
                    {attentionKeys.has("owner_missing") && currentSalesOwnerLabel && (
                      <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "sales_rep", currentSalesOwnerLabel)} className="min-h-[44px] rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-900 active:bg-amber-100">Assign to me</button>
                    )}
                    {attentionKeys.has("source_missing") && leadSources.filter(Boolean).length > 0 && (
                      <Select onValueChange={(value) => onUpdateWorkOrder?.(wo.id, "lead_source", value)}>
                        <SelectTrigger className="h-11 w-[132px] rounded-full border-amber-300 bg-white px-3 text-[11px] font-semibold text-amber-900"><SelectValue placeholder="Set source" /></SelectTrigger>
                        <SelectContent>{leadSources.filter(Boolean).map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              {salesOwnerLabel && <span>Rep: <span className="text-gray-700">{salesOwnerLabel}</span></span>}
              {wo.estimate_amount != null && (
                <span>Est: <span className="text-gray-700">${wo.estimate_amount.toLocaleString()}</span></span>
              )}
              {stageAging.tracked ? (
                <span className={stageAging.aged ? "font-semibold text-rose-700" : ""}>Stage age: <span>{stageAging.ageDays}d{wo.sales_status === "on_hold" ? " · on hold" : stageAging.aged ? " · aged" : ""}</span></span>
              ) : (
                <span className="text-gray-400">Stage age: not tracked</span>
              )}
              {quoteAging.awaitingResponse ? (
                quoteAging.tracked ? (
                  <span className={quoteAging.veryAged ? "font-semibold text-rose-700" : quoteAging.aged ? "font-semibold text-amber-700" : ""}>Quote age: <span>{quoteAging.ageDays}d</span></span>
                ) : (
                  <span className="font-medium text-amber-700">Quote age: sent date missing</span>
                )
              ) : null}
              {deadline && (
                <span>Task due: <span className="text-gray-700">{format(deadline, 'MMM d, yyyy')}</span></span>
              )}
              {followUp && (
                <span className={followUpDue ? "font-semibold text-red-700" : ""}>
                  Follow-up: <span>{format(followUp, 'MMM d, yyyy')}{followUpDue ? " • due" : ""}</span>
                </span>
              )}
              {expectedClose && (
                <span className={expectedCloseOverdue ? "font-semibold text-rose-700" : expectedCloseNear ? "font-semibold text-cyan-700" : ""}>
                  Expected close: <span>{format(expectedClose, 'MMM d, yyyy')}{expectedCloseOverdue ? " · overdue" : expectedCloseNear ? " · next 14d" : ""}</span>
                </span>
              )}
            </div>

            {isRegistered && (expectedCloseOverdue || expectedCloseNear) && (
              <label className={`mt-3 block rounded-lg border p-2.5 ${expectedCloseOverdue ? "border-rose-200 bg-rose-50/70" : "border-cyan-200 bg-cyan-50/70"}`} onClick={(event) => event.stopPropagation()}>
                <span className={`block text-[10px] font-bold uppercase tracking-wide ${expectedCloseOverdue ? "text-rose-800" : "text-cyan-800"}`}>
                  {expectedCloseOverdue ? "Expected close overdue — review timing" : "Expected close within 14 days"}
                </span>
                <CcsDateField
                  value={wo.expected_close_date || ""}
                  onChange={(event) => onUpdateWorkOrder?.(wo.id, "expected_close_date", event.target.value)}
                  className={`mt-1 h-11 w-full rounded-md border bg-white px-2 text-sm text-gray-800 outline-none focus:ring-2 ${expectedCloseOverdue ? "border-rose-200 focus:border-rose-400 focus:ring-rose-100" : "border-cyan-200 focus:border-cyan-400 focus:ring-cyan-100"}`}
                  aria-label={`Expected close date for ${opportunityDisplayName}`}
                />
              </label>
            )}

            {isRegistered && isOpen && quoteAging.awaitingResponse && !quoteAging.tracked && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5" onClick={(event) => event.stopPropagation()}>
                <label>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-800">Actual quote sent date</span>
                  <div className="mt-1 flex items-center gap-2">
                    <CcsDateField
                      max={futureDateStamp(0)}
                      value={wo.date_estimate_sent || ""}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        if (!nextDate || nextDate <= futureDateStamp(0)) onUpdateWorkOrder?.(wo.id, "date_estimate_sent", nextDate);
                      }}
                      className="h-11 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 text-sm text-gray-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      aria-label={`Actual quote sent date for ${opportunityDisplayName}`}
                    />
                    <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "date_estimate_sent", futureDateStamp(0))} className="h-11 shrink-0 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 active:bg-amber-100">Today</button>
                  </div>
                </label>
                <p className="mt-1.5 text-[11px] text-amber-700">Enter the real sent date. Future dates are blocked and quote age is never inferred from record activity.</p>
              </div>
            )}

            {isRegistered && isOpen && (
              <div className="mt-3 flex items-center gap-2 overflow-x-auto overscroll-x-contain border-t border-gray-100 pt-2.5" aria-label="Follow-up quick actions. Swipe horizontally for more actions." onClick={(event) => event.stopPropagation()}>
                <span className="shrink-0 text-xs font-medium text-gray-500">Follow-up:</span>
                <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "follow_up_date", futureDateStamp(1))} className="min-h-[44px] shrink-0 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100">Tomorrow</button>
                <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "follow_up_date", futureDateStamp(3))} className="min-h-[44px] shrink-0 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100">+3 days</button>
                <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "follow_up_date", futureDateStamp(7))} className="min-h-[44px] shrink-0 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100">+7 days</button>
                <button type="button" onClick={() => onUpdateWorkOrder?.(wo.id, "follow_up_date", futureDateStamp(14))} className="min-h-[44px] shrink-0 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100">+14 days</button>
                <button type="button" onClick={() => onCompleteFollowUp?.(wo)} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 active:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Complete</button>
              </div>
            )}
          </div>
        );
      })}
      {workOrders.length === 0 && (
        <div className="text-center text-gray-400 py-10 text-sm">No items found</div>
      )}
    </div>
  );
}