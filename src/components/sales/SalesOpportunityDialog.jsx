import { useEffect, useMemo, useRef, useState } from "react";
import TaskAssigneeSelect from "@/components/sales/TaskAssigneeSelect";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Contact, ExternalLink, FileClock, FileText, FolderOpen, Loader2, Mail, Phone, UserRound, Wrench } from "lucide-react";
import { getStageAgingState } from "@/components/sales/salesStageAging";
import { getQuoteAgingState } from "@/components/sales/salesQuoteAging";
import { getActionableSalesAttentionItems, getSalesAttentionItems } from "@/components/sales/salesAttention";
import { getSalesRecordClassification } from "@/components/sales/salesRecordScopes";
import { classifySalesTaskStatusAudit } from "../../../base44/shared/salesTaskStatusAudit.mjs";
import { planExistingSalesTaskStatusReconciliation } from "@/components/sales/salesTaskStageMapping.mjs";
import { getSalesPlaceholderReason, isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";
import { buildSalesPersonSelectModel } from "@/components/sales/salesPersonIdentity.mjs";
import { salesOpportunityDisplayName } from "@/components/sales/salesOpportunityIdentity.mjs";
import { appendSalesOpportunityHistoryPages } from "../../../base44/shared/salesOpportunityHistory.mjs";
import { isUnverifiedSmartsheetSalesStage, salesStageDisplayValue, salesStageDisplayLabel } from "@/components/sales/salesStageTrust.mjs";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const FIELD_LABELS = {
  sales_status: "Sales status",
  sales_stage_changed_at: "Stage change timestamp",
  sales_rep: "Sales owner",
  lead_source: "Lead source",
  estimate_amount: "Estimate Amount",
  date_estimate_sent: "Estimate sent",
  follow_up_date: "Follow-up date",
  sales_last_follow_up_completed_at: "Follow-up completed",
  sales_last_follow_up_outcome: "Follow-up outcome",
  expected_close_date: "Expected close",
  close_date: "Close date",
  lost_reason: "Lost reason",
  current_task_description: "Next action",
  current_task_deadline: "Task deadline",
  current_task_assigned_to: "Task owner",
  in_pipeline: "Current Pipeline membership",
  sales_neutral_closed_at: "Neutral closure recorded",
};

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const fileMeta = (file) => {
  const bits = [];
  if (file?.uploaded_by) bits.push(file.uploaded_by);
  if (file?.uploaded_at) {
    const parsed = new Date(file.uploaded_at);
    if (!Number.isNaN(parsed.getTime())) bits.push(parsed.toLocaleDateString());
  }
  return bits.join(" · ");
};

const displayValue = (field, value) => {
  if (field === "in_pipeline") return value === true || value === "true" ? "Current Pipeline" : "Not Current Pipeline";
  if (value === undefined || value === null || value === "") return "—";
  if (field === "estimate_amount") return money(value);
  if (field === "sales_last_follow_up_completed_at" || field === "sales_stage_changed_at") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? String(value) : format(parsed, "MMM d, yyyy h:mm a");
  }
  if (field === "sales_status") return String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return String(value);
};

const historyTitle = (entry) => {
  if (entry.field_name === "sales_last_follow_up_completed_at") return "Follow-up completed";
  if (entry.field_name === "sales_last_follow_up_outcome") return "Follow-up outcome recorded";
  if (entry.field_name === "sales_status") return "Sales status changed";
  if (entry.field_name === "sales_stage_changed_at") return "Stage timing recorded";
  if (entry.field_name === "date_estimate_sent") return "Quote sent date changed";
  if (entry.field_name === "follow_up_date") return "Follow-up schedule changed";
  if (entry.field_name === "in_pipeline") return "Current Pipeline membership changed";
  if (entry.field_name === "sales_neutral_closed_at") return "Neutral closure confirmed";
  return `${FIELD_LABELS[entry.field_name] || entry.field_name} changed`;
};

export default function SalesOpportunityDialog({
  workOrder,
  users = [],
  leadSources = [],
  taskDescriptions = [],
  isRegistered,
  isAdmin = false,
  onClose,
  onUpdateFields,
  onReconcileExistingTaskStatus,
  taskStatusCorrectionPending = false,
  taskStatusCorrectionError = '',
  onReloadAfterFailedTaskStatusCorrection,
  onRemoveFromCurrentPipeline,
  onCompleteFollowUp,
  onOpenFullDetails,
  currentSalesOwnerLabel = "",
  queueNavigation = null,
}) {
  const [history, setHistory] = useState([]);
  const [statusTimeline, setStatusTimeline] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPagination, setHistoryPagination] = useState(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyPageError, setHistoryPageError] = useState("");
  const [historyNeedsRefresh, setHistoryNeedsRefresh] = useState(false);
  const [historyAuditPending, setHistoryAuditPending] = useState(false);
  const [historyAuditNeedsReview, setHistoryAuditNeedsReview] = useState(false);
  const [historyReloadNonce, setHistoryReloadNonce] = useState(0);
  const historyRevisionRef = useRef(0);
  const historyPageInFlightRef = useRef(false);
  const historyReviewInFlightRef = useRef(false);
  const [historyReview, setHistoryReview] = useState(null);
  const [historyReviewOpen, setHistoryReviewOpen] = useState(false);
  const [historyReviewBusy, setHistoryReviewBusy] = useState(false);
  const [historyReviewError, setHistoryReviewError] = useState("");
  const [removeFromPipelineOpen, setRemoveFromPipelineOpen] = useState(false);
  const [removeFromPipelineBusy, setRemoveFromPipelineBusy] = useState(false);
  const [removeFromPipelineAction, setRemoveFromPipelineAction] = useState("");
  const [removeFromPipelineError, setRemoveFromPipelineError] = useState("");
  const opportunityDisplayName = salesOpportunityDisplayName(workOrder);

  useEffect(() => {
    const revision = ++historyRevisionRef.current;
    setHistory([]);
    setHistoryPagination(null);
    setHistoryPageError("");
    setHistoryNeedsRefresh(false);
    setHistoryAuditPending(false);
    setHistoryAuditNeedsReview(false);
    setHistoryLoadingMore(false);
    historyPageInFlightRef.current = false;
    historyReviewInFlightRef.current = false;
    setHistoryReview(null);
    setHistoryReviewOpen(false);
    setHistoryReviewBusy(false);
    setHistoryReviewError("");
    if (!workOrder?.id) {
      setHistoryLoading(false);
      return undefined;
    }
    setHistoryLoading(true);
    setHistoryError("");
    base44.functions.invoke("fieldHistoryAction", {
      action: "sales_history",
      session_token: localStorage.getItem("sss_session_token") || "",
      entity_type: "WorkOrder",
      entity_id: workOrder.id,
    })
      .then((response) => {
        if (revision !== historyRevisionRef.current) return;
        const data = response?.data || response;
        if (!data?.success || !Array.isArray(data.entries) || !data.pagination) {
          throw Object.assign(new Error(data?.error || "Verified Sales history could not be loaded."), {code:data?.code});
        }
        setHistory(appendSalesOpportunityHistoryPages([], data.entries));
        setHistoryAuditPending(data.audit_verification_pending === true);
        setHistoryAuditNeedsReview(data.audit_verification_status === "needs_review");
        setHistoryPagination(data.pagination);
      })
      .catch((error) => {
        if (revision !== historyRevisionRef.current) return;
        setHistory([]);
        const stale = error?.code === "SALES_HISTORY_STALE" ||
          error?.response?.data?.code === "SALES_HISTORY_STALE";
        setHistoryNeedsRefresh(stale);
        setHistoryError(stale
          ? "Sales history changed during loading. Refresh Sales history to retrieve a consistent view."
          : error?.response?.data?.error || error?.message || "Sales history could not be loaded.");
      })
      .finally(() => {
        if (revision === historyRevisionRef.current) setHistoryLoading(false);
      });
    return () => { historyRevisionRef.current += 1; };
  }, [workOrder?.id, workOrder?.updated_date, historyReloadNonce]);

  useEffect(() => {
    if (!workOrder?.id) { setStatusTimeline([]); return; }
    let cancelled = false;
    base44.functions.invoke("opportunityWorkspaceAction", {
      action: "status_timeline",
      session_token: localStorage.getItem("sss_session_token") || "",
      opportunity_id: workOrder.id,
    }).then((r) => {
      if (!cancelled) setStatusTimeline(r?.data?.timeline || []);
    }).catch(() => { if (!cancelled) setStatusTimeline([]); });
    return () => { cancelled = true; };
  }, [workOrder?.id]);

  const loadMoreSalesHistory = async () => {
    if (!workOrder?.id || !historyPagination?.has_more || historyLoading ||
        historyNeedsRefresh || historyAuditPending || historyPageInFlightRef.current) return;
    const revision = historyRevisionRef.current;
    historyPageInFlightRef.current = true;
    setHistoryLoadingMore(true);
    setHistoryPageError("");
    try {
      const response = await base44.functions.invoke("fieldHistoryAction", {
        action: "sales_history",
        session_token: localStorage.getItem("sss_session_token") || "",
        entity_type: "WorkOrder",
        entity_id: workOrder.id,
        history_page: historyPagination,
      });
      if (revision !== historyRevisionRef.current) return;
      const data = response?.data || response;
      if (!data?.success || !Array.isArray(data.entries) || !data.pagination) {
        throw Object.assign(new Error(data?.error || "Older Sales history could not be loaded."), {code:data?.code});
      }
      if (data.pagination.work_order_version !== historyPagination.work_order_version) {
        throw Object.assign(new Error("Sales history changed. Refresh Sales history before loading older entries."), {code:"SALES_HISTORY_STALE"});
      }
      if (data.audit_verification_pending === true) {
        setHistoryAuditPending(true);
        setHistoryAuditNeedsReview(data.audit_verification_status === "needs_review");
        setHistoryNeedsRefresh(true);
        setHistoryPageError("A Sales audit is not yet verified. Refresh Sales history before loading more records.");
        return;
      }
      setHistory((current) => appendSalesOpportunityHistoryPages(current, data.entries));
      setHistoryPagination(data.pagination);
    } catch (error) {
      if (revision === historyRevisionRef.current) {
        const stale = error?.code === "SALES_HISTORY_STALE" ||
          error?.response?.data?.code === "SALES_HISTORY_STALE";
        setHistoryNeedsRefresh(stale);
        setHistoryPageError(stale
          ? "Sales history changed during paging. Refresh Sales history to start again with the latest entries."
          : error?.response?.data?.error || error?.message || "Older Sales history could not be loaded.");
      }
    } finally {
      if (revision === historyRevisionRef.current) {
        historyPageInFlightRef.current = false;
        setHistoryLoadingMore(false);
      }
    }
  };

  const inspectPendingSalesAudits = async () => {
    if (!isAdmin || !historyAuditNeedsReview || !workOrder?.id ||
        historyReviewInFlightRef.current) return;
    const revision = historyRevisionRef.current;
    historyReviewInFlightRef.current = true;
    setHistoryReviewOpen(true);
    setHistoryReviewBusy(true);
    setHistoryReviewError("");
    try {
      const response = await base44.functions.invoke("fieldHistoryAction", {
        action: "sales_audit_review",
        session_token: localStorage.getItem("sss_session_token") || "",
        entity_type: "WorkOrder",
        entity_id: workOrder.id,
      });
      if (revision !== historyRevisionRef.current) return;
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true || !Array.isArray(data.entries)) {
        throw new Error(data?.error || "Pending Sales audit review could not be loaded.");
      }
      if (data.work_order_version !== historyPagination?.work_order_version) {
        throw new Error("The WorkOrder changed during review. Refresh Sales history first.");
      }
      setHistoryReview(data);
    } catch (error) {
      if (revision === historyRevisionRef.current) {
        setHistoryReview(null);
        setHistoryReviewError(error?.response?.data?.error || error?.message ||
          "Pending Sales audit review could not be loaded.");
      }
    } finally {
      if (revision === historyRevisionRef.current) {
        historyReviewInFlightRef.current = false;
        setHistoryReviewBusy(false);
      }
    }
  };

  const value = Number(workOrder?.estimate_amount ?? 0) || 0;
  const unverifiedStage = isUnverifiedSmartsheetSalesStage(workOrder);
  const stageDisplayValue = salesStageDisplayValue(workOrder);
  const statusLabel = salesStageDisplayLabel(workOrder);
  const recordNeutralClosure = stageDisplayValue === "closed_neutral";
  const closeout = ["won", "lost"].includes(workOrder?.sales_status) || recordNeutralClosure;

  const stageAging = getStageAgingState(workOrder);
  const quoteAging = getQuoteAgingState(workOrder);
  const allAttentionItems = getSalesAttentionItems(workOrder);
  const attentionItems = getActionableSalesAttentionItems(workOrder);
  const attentionKeys = new Set(allAttentionItems.map((item) => item.key));
  const recordClassification = getSalesRecordClassification(workOrder);
  const taskStatusAudit = classifySalesTaskStatusAudit(workOrder);
  const taskStatusReconciliation = planExistingSalesTaskStatusReconciliation(workOrder);
  const likelyPlaceholder = isLikelySalesPlaceholder(workOrder);
  const placeholderReason = getSalesPlaceholderReason(workOrder);
  const salesOwnerSelect = buildSalesPersonSelectModel(workOrder?.sales_rep, users);
  const clientNotes = useMemo(() => (workOrder?.work_notes || [])
    .filter((note) => ["client", "admin", "other"].includes(note?.type))
    .slice()
    .sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")))
    .slice(0, 5), [workOrder?.work_notes]);

  const attachedFiles = Array.isArray(workOrder?.files) ? workOrder.files : [];
  const previewFiles = attachedFiles.slice(0, 4);
  const coreBridgeUrl = safeExternalHttpUrl(workOrder?.corbridge_link);
  const driveUrl = safeExternalHttpUrl(workOrder?.google_drive_folder_url);

  if (!workOrder) return null;

  const update = (changes) => onUpdateFields?.(workOrder.id, changes);
  const futureDateStamp = (days) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return format(date, "yyyy-MM-dd");
  };
  const todayStamp = futureDateStamp(0);
  const nearCloseStamp = futureDateStamp(14);
  const expectedCloseStamp = String(workOrder.expected_close_date || "").slice(0, 10);
  const expectedCloseOverdue = !closeout && Boolean(expectedCloseStamp && expectedCloseStamp < todayStamp);
  const expectedCloseNear = !closeout && Boolean(expectedCloseStamp && expectedCloseStamp >= todayStamp && expectedCloseStamp <= nearCloseStamp);
  const confirmRemoveFromPipeline = async (advance) => {
    if (!onRemoveFromCurrentPipeline || removeFromPipelineBusy) return;
    setRemoveFromPipelineBusy(true);
    setRemoveFromPipelineAction(advance ? "next" : "only");
    setRemoveFromPipelineError("");
    try {
      const result = await onRemoveFromCurrentPipeline(workOrder, { advance });
      if (result?.ok) {
        setRemoveFromPipelineOpen(false);
        return;
      }
      setRemoveFromPipelineError(result?.message || "This opportunity could not be removed safely.");
    } catch (error) {
      setRemoveFromPipelineError(error?.message || "This opportunity could not be removed safely.");
    } finally {
      setRemoveFromPipelineBusy(false);
      setRemoveFromPipelineAction("");
    }
  };
  const lastFollowUpCompleted = workOrder.sales_last_follow_up_completed_at
    ? new Date(workOrder.sales_last_follow_up_completed_at)
    : null;

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-xl">{opportunityDisplayName}</DialogTitle>
                <Badge variant="outline">{statusLabel}</Badge>
                {recordClassification === "current" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Current Pipeline</Badge>}
                {recordClassification === "outcome" && <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Tracked Outcome</Badge>}
                {recordClassification === "neutral_closed" && <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">Closed without outcome · All Records</Badge>}
                {recordClassification === "legacy_history" && <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">Legacy History</Badge>}
                {recordClassification === "other" && <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Not Current Pipeline</Badge>}
                {likelyPlaceholder && <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">Likely test / placeholder</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-500">{workOrder.description || workOrder.title || "No job description yet"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {workOrder.estimate_id && (
                <Button variant="outline" size="sm" className="h-11 sm:h-8" asChild>
                  <a href={`/EstimateDetail?id=${workOrder.estimate_id}`} target="_blank" rel="noreferrer"><FileText className="mr-1.5 h-4 w-4" />Source Estimate<ExternalLink className="ml-1 h-3 w-3" /></a>
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => onOpenFullDetails?.(workOrder)}><Wrench className="mr-1.5 h-4 w-4" />Full Work Order</Button>
            </div>
          </div>
          {queueNavigation && (
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Current filtered queue</span>
                <span className="ml-1.5">
                  {queueNavigation.index >= 0
                    ? `${queueNavigation.index + 1} of ${queueNavigation.total}`
                    : queueNavigation.total > 0
                      ? `This opportunity is resolved/removed from the queue · ${queueNavigation.total} remaining`
                      : "Queue complete"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button type="button" variant="outline" size="sm" className="h-11 justify-center px-3 sm:h-9" onClick={queueNavigation.onPrevious} disabled={!queueNavigation.canPrevious}>
                  <ChevronLeft className="mr-1 h-4 w-4" />{queueNavigation.index >= 0 ? "Previous" : "Previous remaining"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-11 justify-center px-3 sm:h-9" onClick={queueNavigation.onNext} disabled={!queueNavigation.canNext}>
                  {queueNavigation.index >= 0 ? "Next" : queueNavigation.total > 0 ? "Next remaining" : "Next"}<ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5 p-4 sm:p-6">
          {(taskStatusCorrectionPending || taskStatusCorrectionError) && (
            <section className={`rounded-xl border p-3 text-xs ${taskStatusCorrectionError ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              role={taskStatusCorrectionError ? 'alert' : 'status'} aria-label="Task status correction save state">
              <p className="font-semibold">{taskStatusCorrectionError ? 'Task / Status correction not verified' : 'Saving Task / Status correction'}</p>
              <p className="mt-1">{taskStatusCorrectionError || 'The original mismatch remains visible until Base44 confirms the conflict-safe save and Sales history.'}</p>
              {taskStatusCorrectionError && onReloadAfterFailedTaskStatusCorrection && (
                <Button type="button" variant="outline" size="sm" className="mt-2 h-11 border-rose-300 bg-white text-rose-900 sm:h-9"
                  onClick={onReloadAfterFailedTaskStatusCorrection}>
                  Discard unsaved changes and reload latest
                </Button>
              )}
            </section>
          )}
          {taskStatusAudit.kind !== 'none' && (
            <section className={`rounded-xl border p-3 sm:p-4 ${taskStatusAudit.kind === 'modern_review' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
              aria-label={taskStatusAudit.kind === 'modern_review' ? 'Task and Sales Status need review' : 'Legacy task context'}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${taskStatusAudit.kind === 'modern_review' ? 'text-amber-800' : 'text-slate-600'}`} />
                <div className="min-w-0 text-xs leading-relaxed">
                  <div className="font-semibold text-slate-900">{taskStatusAudit.kind === 'modern_review' ? 'Task / Status review · read-only finding' : 'Legacy task text · not a modern outcome'}</div>
                  <p className="mt-1 text-slate-700">{taskStatusAudit.reason}</p>
                  <p className="mt-1 text-slate-600">Saved status: {statusLabel} · Task: {workOrder.current_task_description || 'Not set'}</p>
                  {taskStatusAudit.mappedStatus && taskStatusAudit.kind === 'modern_review' &&
                    <p className="mt-1 text-slate-600">Task catalog category: {taskStatusAudit.mappedStatus.replace(/_/g, ' ')} (not applied automatically).</p>}
                  <p className="mt-1 text-slate-600">Review the task and existing history before making a protected change. No classification or timestamp was updated by this audit.</p>
                  {isRegistered && taskStatusReconciliation && onReconcileExistingTaskStatus && !taskStatusCorrectionPending && !taskStatusCorrectionError && (
                    <Button type="button" variant="outline" size="sm"
                      className="mt-3 h-11 w-full border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:h-9 sm:w-auto"
                      onClick={() => onReconcileExistingTaskStatus(workOrder)}>
                      Use Current Task to Correct Status
                    </Button>
                  )}
                  {taskStatusReconciliation && taskStatusAudit.kind === 'modern_review' && (
                    <p className="mt-1.5 text-slate-600">This requires an explicit save{taskStatusReconciliation.action === 'confirm_transition' ? ' and outcome/reopening confirmation' : ''}; the task text stays unchanged. Concurrent edits will block the correction.</p>
                  )}
                </div>
              </div>
            </section>
          )}
          {likelyPlaceholder && recordClassification === "current" && (
            <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-rose-900"><AlertTriangle className="h-4 w-4" />Pipeline Hygiene</div>
                  <p className="mt-1 text-xs text-rose-800">{placeholderReason} Review it before cleanup. Removing it from Current Pipeline does not delete the WorkOrder and does not create a Won/Lost outcome.</p>
                </div>
                {isRegistered && <Button type="button" variant="outline" size="sm" className="shrink-0 border-rose-300 bg-white text-rose-800 hover:bg-rose-100 hover:text-rose-900" onClick={() => { setRemoveFromPipelineError(""); setRemoveFromPipelineOpen(true); }}>Remove from Current Pipeline</Button>}
              </div>
            </section>
          )}

          {attentionItems.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-amber-900">Needs Attention</div>
                  <p className="mt-0.5 text-xs text-amber-800">Fix the actionable gaps you know are accurate. Missing historical timing stays missing rather than being guessed.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attentionItems.map((item) => (
                  <div key={item.key} className="rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2">
                    <div className="text-xs font-semibold text-amber-900">{item.label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-amber-800">{item.detail}</div>
                  </div>
                ))}
              </div>
              {isRegistered && !closeout && attentionItems.length > 0 && (
                <div className="mt-3 flex items-center gap-2 overflow-x-auto overscroll-x-contain border-t border-amber-200 pt-3 sm:flex-wrap sm:overflow-visible" aria-label="Opportunity attention quick actions">
                  {attentionKeys.has("owner_missing") && currentSalesOwnerLabel && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ sales_rep: currentSalesOwnerLabel })}>Assign to me</Button>}
                  {attentionKeys.has("next_action") && <span className="shrink-0 text-xs font-medium text-amber-900">Schedule follow-up:</span>}
                  {attentionKeys.has("next_action") && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(1) })}>Tomorrow</Button>}
                  {attentionKeys.has("next_action") && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(3) })}>+3 days</Button>}
                  {attentionKeys.has("next_action") && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(7) })}>+7 days</Button>}
                  {attentionKeys.has("next_action") && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(14) })}>+14 days</Button>}
                  {attentionKeys.has("quote_timing_missing") && workOrder.date_estimate_sent && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ date_estimate_sent: workOrder.date_estimate_sent })}>Confirm stored quote date</Button>}
                  {attentionKeys.has("quote_timing_missing") && !workOrder.date_estimate_sent && <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 border-amber-300 bg-white px-3 text-xs sm:h-7" onClick={() => update({ date_estimate_sent: format(new Date(), "yyyy-MM-dd") })}>Quote sent today</Button>}
                </div>
              )}
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><CircleDollarSign className="h-4 w-4" />Opportunity Value</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{money(value)}</div>
              <div className="mt-1 text-xs text-gray-500">Estimate Amount</div>
            </div>
            <div className={`rounded-xl border bg-white p-3 ${attentionKeys.has("stage_timing_missing") ? "border-amber-300 bg-amber-50/30" : ""}`}>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Status</Label>
              <div className="mt-2 flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 sm:min-h-9"
                role="status" aria-label={`Read-only Sales Status: ${statusLabel}${unverifiedStage ? ". Stage Timing Missing" : ""}`}
                title={unverifiedStage ? "Stage Timing Missing; the displayed status is the stored classification." : "Sales Status is determined by Task Description."}>
                {statusLabel}
              </div>
              {stageAging.tracked ? (
                <div className={`mt-2 text-xs ${stageAging.aged ? "font-semibold text-rose-700" : "text-gray-500"}`}>{stageAging.ageDays} day{stageAging.ageDays === 1 ? "" : "s"} in this stage{workOrder.sales_status === "on_hold" ? " · On Hold is not flagged as stalled" : stageAging.aged ? " · review for stage movement" : ""}</div>
              ) : recordClassification === "current" ? (
                <div className="mt-2 text-xs text-gray-400">{unverifiedStage ? "Stage timing is unverified. Select the appropriate Task Description; no timestamp will be invented." : "Stage age begins tracking after the next verified stage change."}</div>
              ) : (
                <div className="mt-2 text-xs text-gray-400">Stage timing is not treated as authoritative for this non-current record.</div>
              )}
            </div>
            <div className={`rounded-xl border bg-white p-3 ${attentionKeys.has("owner_missing") ? "border-amber-300 bg-amber-50/30" : ""}`}>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Owner</Label>
              <Select value={salesOwnerSelect.canonical || "__unassigned__"} onValueChange={(value) => update({ sales_rep: value === "__unassigned__" ? "" : value })} disabled={!isRegistered}>
                <SelectTrigger className="mt-2 h-9"><SelectValue>{salesOwnerSelect.canonical || "Unassigned"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {salesOwnerSelect.legacy && <SelectItem value={salesOwnerSelect.legacy}>{salesOwnerSelect.legacy}</SelectItem>}
                  {salesOwnerSelect.options.map((user) => <SelectItem key={user.email || user.full_name} value={user.full_name}>{user.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className={`rounded-xl border bg-white p-3 ${attentionKeys.has("source_missing") ? "border-amber-300 bg-amber-50/30" : ""}`}>
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lead Source</Label>
              <Select value={workOrder.lead_source || "__unspecified__"} onValueChange={(value) => update({ lead_source: value === "__unspecified__" ? "" : value })} disabled={!isRegistered}>
                <SelectTrigger className="mt-2 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unspecified__">Unspecified</SelectItem>
                  {workOrder.lead_source && !leadSources.includes(workOrder.lead_source) && <SelectItem value={workOrder.lead_source}>{workOrder.lead_source}</SelectItem>}
                  {leadSources.filter(Boolean).map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-xl border bg-white p-4 ${attentionKeys.has("next_action") ? "border-amber-300 bg-amber-50/20" : ""}`}>
              <div className="flex items-center gap-2 font-semibold text-gray-800"><CalendarClock className="h-4 w-4 text-orange-600" />Next Action</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs text-gray-500">Follow-up date</Label><CcsDateField value={workOrder.follow_up_date || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ follow_up_date: event.target.value })} className="mt-1 h-11 sm:h-9" /></div>
                <div>
                  <Label className="text-xs text-gray-500">{closeout ? "Expected close (planned)" : "Expected close"}</Label>
                  <CcsDateField value={workOrder.expected_close_date || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ expected_close_date: event.target.value })} className={`mt-1 h-11 sm:h-9 ${expectedCloseOverdue ? "border-rose-300 focus-visible:ring-rose-200" : expectedCloseNear ? "border-cyan-300 focus-visible:ring-cyan-200" : ""}`} />
                  {expectedCloseOverdue && <div className="mt-1 text-[11px] font-semibold text-rose-700">Expected close is overdue — confirm the forecast or resolve the opportunity.</div>}
                  {expectedCloseNear && <div className="mt-1 text-[11px] font-medium text-cyan-700">Expected close is within the next 14 days.</div>}
                </div>
                <div><Label className="text-xs text-gray-500">Task deadline</Label><CcsDateField value={workOrder.current_task_deadline || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ current_task_deadline: event.target.value })} className="mt-1 h-11 sm:h-9" /></div>
                <div>
                  <Label className="text-xs text-gray-500">Task owner</Label>
                  <TaskAssigneeSelect key={workOrder.id} value={workOrder.current_task_assigned_to || ""} users={users} disabled={!isRegistered || closeout} onChange={(name) => update({ current_task_assigned_to: name })} className="mt-1 h-11 sm:h-9" context={opportunityDisplayName} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-gray-500">Task Description · controls Sales Status</Label>
                  <Select value={workOrder.current_task_description || undefined}
                    onValueChange={(task) => update({ current_task_description: task })}
                    disabled={!isRegistered || recordNeutralClosure || !["current", "outcome"].includes(recordClassification)}>
                    <SelectTrigger aria-label="Task Description (controls Sales Status)" className="mt-1 h-11 w-full text-left sm:h-9">
                      <SelectValue placeholder="Choose next task" />
                    </SelectTrigger>
                    <SelectContent>
                      {workOrder.current_task_description && !taskDescriptions.some((item) => (typeof item === "string" ? item : item?.text) === workOrder.current_task_description) && (
                        <SelectItem value={workOrder.current_task_description}>{workOrder.current_task_description} (existing task)</SelectItem>
                      )}
                      {Array.from(new Set(taskDescriptions.map((item) => typeof item === "string" ? item : item?.text).filter(Boolean))).map((task) => (
                        <SelectItem key={task} value={task}>{task}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {recordClassification === "outcome" && <p className="mt-1 text-xs text-slate-500">Selecting a different Sales stage task requires reopening confirmation. Won SIPs/WIP tasks remain operational.</p>}
                </div>
              </div>

              {closeout && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Follow-up scheduling is closed. Expected close and task planning remain visible as historical context so the outcome retains its sales trail.
                </div>
              )}

              {!closeout && isRegistered && (
                <div className="mt-3 flex items-center gap-2 overflow-x-auto overscroll-x-contain border-t border-gray-100 pt-3 sm:flex-wrap sm:overflow-visible" aria-label="Opportunity follow-up quick actions">
                  <span className="shrink-0 text-xs font-medium text-gray-500">Quick follow-up:</span>
                  <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(1) })}>Tomorrow</Button>
                  <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(3) })}>+3 days</Button>
                  <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(7) })}>+7 days</Button>
                  <Button type="button" size="sm" variant="outline" className="h-11 shrink-0 px-3 text-xs sm:h-7" onClick={() => update({ follow_up_date: futureDateStamp(14) })}>+14 days</Button>
                  <Button type="button" size="sm" className="h-11 shrink-0 px-3 text-xs sm:h-7" onClick={() => onCompleteFollowUp?.(workOrder)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Complete / Log</Button>
                </div>
              )}

              {workOrder.sales_last_follow_up_outcome && (
                <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <div className="font-semibold">Latest completed follow-up</div>
                  <div className="mt-0.5">{workOrder.sales_last_follow_up_outcome}</div>
                  {lastFollowUpCompleted && !isNaN(lastFollowUpCompleted.getTime()) && <div className="mt-1 text-[11px] text-emerald-700">{format(lastFollowUpCompleted, "MMM d, yyyy h:mm a")}</div>}
                </div>
              )}
              {!closeout && !workOrder.follow_up_date && !workOrder.current_task_deadline && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">This opportunity has no scheduled next action.</div>}
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 font-semibold text-gray-800"><Contact className="h-4 w-4 text-blue-600" />Customer & Contact</div>
                {workOrder.customer_id && (
                  <Button variant="outline" size="sm" className="h-11 justify-center sm:h-8" asChild>
                    <a href={`/Customer360?id=${encodeURIComponent(workOrder.customer_id)}`} target="_blank" rel="noreferrer">Open Customer<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
                  </Button>
                )}
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><div className="text-xs text-gray-400">Primary contact</div><div className="font-medium text-gray-800">{workOrder.contact_name || workOrder.representative || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Phone</div><div className="font-medium text-gray-800">{workOrder.contact_phone || "—"}</div></div>
                <div className="sm:col-span-2"><div className="text-xs text-gray-400">Email</div><div className="break-all font-medium text-gray-800">{workOrder.contact_email || "—"}</div></div>
                <div className="sm:col-span-2"><div className="text-xs text-gray-400">Install location</div><div className="font-medium text-gray-800">{workOrder.install_location || [workOrder.billing_address, workOrder.township_city].filter(Boolean).join(", ") || "—"}</div></div>
                {(workOrder.contact_phone || workOrder.contact_email) && (
                  <div className="flex flex-wrap gap-2 pt-1 sm:col-span-2">
                    {workOrder.contact_phone && <Button variant="outline" size="sm" className="h-11 sm:h-8" asChild><a href={`tel:${workOrder.contact_phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" />Call</a></Button>}
                    {workOrder.contact_email && <Button variant="outline" size="sm" className="h-11 sm:h-8" asChild><a href={`mailto:${workOrder.contact_email}`}><Mail className="mr-1.5 h-3.5 w-3.5" />Email</a></Button>}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className={`rounded-xl border bg-white p-4 ${attentionKeys.has("quote_timing_missing") ? "border-amber-300 bg-amber-50/20" : ""}`}>
              <div className="flex items-center gap-2 font-semibold text-gray-800"><FileText className="h-4 w-4 text-indigo-600" />Quote & Closeout</div>
              {closeout && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Closed {workOrder.close_date || "without a recorded close date"}. Planned close timing is retained below for historical context; active follow-up is no longer scheduled.
                </div>
              )}
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><div className="text-xs text-gray-400">Estimate / invoice</div><div className="font-medium text-gray-800">{workOrder.est_inv_at || "—"}</div></div>
                <div>
                  <div className="text-xs text-gray-400">Quote sent date</div>
                  <div className="mt-1 flex items-center gap-2">
                    <CcsDateField max={todayStamp} value={workOrder.date_estimate_sent || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ date_estimate_sent: event.target.value })} className="h-11 sm:h-9" />
                    {!workOrder.date_estimate_sent && quoteAging.awaitingResponse && isRegistered && !closeout && <Button type="button" size="sm" variant="outline" className="h-11 px-3 text-xs sm:h-9" onClick={() => update({ date_estimate_sent: todayStamp })}>Today</Button>}
                  </div>
                  {quoteAging.awaitingResponse ? (
                    quoteAging.tracked ? <div className={`mt-1 text-xs ${quoteAging.veryAged ? "font-semibold text-rose-700" : quoteAging.aged ? "font-semibold text-amber-700" : "text-gray-500"}`}>Quote age: {quoteAging.ageDays} day{quoteAging.ageDays === 1 ? "" : "s"}</div> : workOrder.date_estimate_sent ? (
                      <div className="mt-1 space-y-1">
                        <div className="text-xs font-medium text-amber-700">Stored legacy quote date is not verified for aging.</div>
                        {isRegistered && !closeout && <Button type="button" size="sm" variant="outline" className="h-8 border-amber-300 bg-white px-2.5 text-xs text-amber-800" onClick={() => update({ date_estimate_sent: workOrder.date_estimate_sent })}>Confirm stored date</Button>}
                      </div>
                    ) : <div className="mt-1 text-xs font-medium text-amber-700">Quote timing is missing. Set the actual sent date to start trustworthy aging.</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-gray-400">{closeout ? "Expected close (planned)" : "Expected close"}</div>
                  <div className={`font-medium ${expectedCloseOverdue ? "text-rose-700" : expectedCloseNear ? "text-cyan-700" : "text-gray-800"}`}>
                    {workOrder.expected_close_date || "—"}{expectedCloseOverdue ? " · overdue" : expectedCloseNear ? " · next 14 days" : ""}
                  </div>
                </div>
                <div><div className="text-xs text-gray-400">Close date</div><div className="font-medium text-gray-800">{workOrder.close_date || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Lost reason</div><div className={`font-medium ${workOrder.sales_status === "lost" ? "text-red-700" : "text-gray-800"}`}>{workOrder.lost_reason || "—"}</div></div>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:flex-wrap">
                {workOrder.estimate_id && (
                  <Button variant="outline" size="sm" className="h-11 justify-center sm:h-8" asChild>
                    <a href={`/EstimateDetail?id=${workOrder.estimate_id}`} target="_blank" rel="noreferrer">Source Estimate<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
                  </Button>
                )}
                {workOrder.corbridge_link && (
                  coreBridgeUrl ? (
                    <Button type="button" variant="outline" size="sm" className="h-11 justify-center sm:h-8" onClick={() => openExternalHttpUrl(coreBridgeUrl)}>
                      Open CoreBridge <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  ) : (
                    <div className="self-center text-xs font-medium text-amber-700">CoreBridge link is present but not a usable http/https URL.</div>
                  )
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 font-semibold text-gray-800"><FolderOpen className="h-4 w-4 text-violet-600" />Files & Notes</div>
                <div className="flex flex-wrap gap-2">
                  {workOrder.google_drive_folder_url && (
                    driveUrl ? (
                      <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => openExternalHttpUrl(driveUrl)}>
                        Open Drive Folder <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="self-center text-xs font-medium text-amber-700">Drive link unavailable</span>
                    )
                  )}
                  <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => onOpenFullDetails?.(workOrder)}>
                    Manage files & notes <Wrench className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">{attachedFiles.length} uploaded file{attachedFiles.length === 1 ? "" : "s"}</div>
              {previewFiles.length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {previewFiles.map((file, index) => {
                    const fileUrl = safeExternalHttpUrl(file?.url);
                    const meta = fileMeta(file);
                    return (
                      <button type="button"
                        key={file?.id || `${file?.name || "file"}-${index}`}
                        type="button"
                        disabled={!fileUrl}
                        onClick={() => openExternalHttpUrl(fileUrl)}
                        className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={fileUrl ? `Open ${file?.name || "file"}` : "This file does not have a usable link"}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-gray-800">{file?.name || "Unnamed file"}</span>
                          {meta && <span className="block truncate text-[11px] text-gray-400">{meta}</span>}
                        </span>
                        {fileUrl && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {attachedFiles.length > previewFiles.length && <div className="mt-2 text-[11px] text-gray-500">+{attachedFiles.length - previewFiles.length} more file{attachedFiles.length - previewFiles.length === 1 ? "" : "s"} available in Full Work Order.</div>}
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recent client/admin notes</div>
                {clientNotes.length === 0 ? <div className="text-xs text-gray-400">No recent client/admin notes.</div> : clientNotes.map((note) => (
                  <div key={note.id || note.timestamp} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    <div>{note.text}</div>
                    <div className="mt-1 text-[11px] text-gray-400">{note.created_by || "Unknown"}{note.timestamp ? ` · ${new Date(note.timestamp).toLocaleDateString()}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 font-semibold text-gray-800"><FileClock className="h-4 w-4 text-slate-600" />Sales Activity</div>
            <p className="mt-1 text-xs text-gray-500">Committed Sales field history and older CellHistory. Legacy records may have incomplete coverage.</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {statusTimeline.length > 0 && (
                <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2" aria-label="Status timeline">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Status timeline</p>
                  <ul className="space-y-1">
                    {statusTimeline.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-gray-700">{String(a.event_type || "").replace(/_/g, " ")}</span>
                        <span className="shrink-0 text-gray-400">{a.created_date ? format(new Date(a.created_date), "MMM d") : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {historyLoading ? <div className="flex items-center justify-center py-8 text-sm text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading history…</div> : historyError ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{historyError}</div> : history.length === 0 ? <div className="py-6 text-center text-sm text-gray-400">No captured sales changes yet.</div> : history.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <UserRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800">{historyTitle(entry)}</div>
                    {entry.field_name === "sales_last_follow_up_completed_at" || entry.field_name === "sales_last_follow_up_outcome" ? (
                      <div className="mt-0.5 text-xs font-medium text-gray-700">{displayValue(entry.field_name, entry.new_value)}</div>
                    ) : (
                      <div className="mt-0.5 text-xs text-gray-500"><span className="line-through">{displayValue(entry.field_name, entry.old_value)}</span> → <span className="font-medium text-gray-700">{displayValue(entry.field_name, entry.new_value)}</span></div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-400">{entry.actor_name || entry.actor_email || entry.changed_by_name || entry.changed_by_email || "Unknown"}{entry.modified_at || entry.created_date ? ` · ${format(new Date(entry.modified_at || entry.created_date), "MMM d, yyyy h:mm a")}` : ""}{entry.source === "Legacy CellHistory" ? " · Legacy record time" : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {historyPageError && <p role="alert" className="mt-2 text-xs text-red-700">{historyPageError}</p>}
            {historyAuditPending && (
              <p role="status" className="mt-2 text-xs text-amber-800">{historyAuditNeedsReview
                ? "Sales history needs administrator review. A matching pending audit is at least 15 minutes old, has uncertain timing, or more pending records exist than can be safely inspected. Do not log the follow-up again; ask an administrator to investigate the WorkOrder. Rechecking does not change audit records."
                : "A Sales audit is not yet confirmed. Recent history may be incomplete; pending changes are not shown as saved activity. Retry history verification."}</p>
            )}
            {(historyNeedsRefresh || historyAuditPending || historyError) && !historyLoading && (
              <Button type="button" variant="outline" size="sm" className="mt-3 h-11 w-full sm:h-9"
                onClick={() => setHistoryReloadNonce((value) => value + 1)}>
                {historyAuditPending ? historyAuditNeedsReview ? "Recheck pending Sales history" : "Retry history verification" : historyError && !historyNeedsRefresh ? "Retry Sales history" : "Refresh Sales history"}
              </Button>
            )}
            {isAdmin && historyAuditNeedsReview && !historyLoading && (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-900">Administrator investigation</p>
                  <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9"
                    disabled={historyReviewBusy} onClick={inspectPendingSalesAudits}>
                    {historyReviewBusy ? "Checking audit evidence…" : "Inspect pending Sales audits"}
                  </Button>
                </div>
                <p className="text-xs text-amber-900">Read-only evidence for this WorkOrder. A matching value does not prove the write completed. These field-level audit events lack a shared save-operation receipt, so the write outcome remains unknown. Do not change audit status based only on this view.</p>
                {historyReviewError && <p role="alert" className="text-xs text-red-700">{historyReviewError}</p>}
                {historyReviewOpen && historyReview && (
                  <div className="space-y-2">
                    {historyReview.entries.length === 0 && (
                      <p className="text-xs text-gray-700">No pending Sales audit records in this read. Recheck Sales history to confirm the warning has cleared.</p>
                    )}
                    {historyReview.entries.map((entry) => (
                      <div key={entry.audit_id || entry.event_key} className="rounded-md border bg-white p-2.5 text-xs text-gray-700">
                        <div className="font-semibold">{FIELD_LABELS[entry.field_name] || entry.field_name}</div>
                        <div className="mt-1">{entry.matching_current_value
                          ? "Pending value matches current WorkOrder (not proof of save)"
                          : "Pending value does not match current WorkOrder or cannot be compared"}</div>
                        <div className="mt-1 font-medium text-amber-900">Save outcome: unknown · no successful-write receipt</div>
                        {entry.save_attempt_id && (
                          <div className="mt-1 break-all text-[11px] text-gray-600">Local save attempt: {entry.save_attempt_id}{entry.save_attempt_baseline_recorded ? " · pre-save version recorded" : " · pre-save version missing"} (correlation only)</div>
                        )}
                        {!entry.save_attempt_id && <div className="mt-1 text-[11px] text-gray-500">No save-attempt correlation available for this audit.</div>}
                        <div className="mt-1 text-gray-500">
                          {entry.timing === "aged" ? "15+ minutes old" : entry.timing === "recent"
                            ? "Recent pending" : "Timing requires review"}
                          {" · "}{entry.source || "Unknown source"}
                          {entry.actor_name ? ` · ${entry.actor_name}` : ""}
                        </div>
                        <div className="mt-1 break-all text-[11px] text-gray-500">
                          Audit ID: {entry.audit_id || "Unavailable"}
                          {entry.created_at ? ` · ${format(new Date(entry.created_at), "MMM d, yyyy h:mm a")}` : ""}
                        </div>
                      </div>
                    ))}
                    {historyReview.has_more && <p className="text-xs font-medium text-amber-900">More pending audit records exist beyond this bounded inspection. Manual review is incomplete.</p>}
                  </div>
                )}
              </div>
            )}
            {historyPagination?.has_more && !historyLoading && !historyNeedsRefresh && !historyAuditPending && (
              <Button type="button" variant="outline" size="sm" className="mt-3 h-11 w-full sm:h-9"
                disabled={historyLoadingMore} onClick={loadMoreSalesHistory}>
                {historyLoadingMore ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {historyLoadingMore ? "Loading older Sales history…" : "Load older Sales history"}
              </Button>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={removeFromPipelineOpen} onOpenChange={(open) => { if (!removeFromPipelineBusy) { setRemoveFromPipelineOpen(open); if (!open) setRemoveFromPipelineError(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this record from Current Pipeline?</AlertDialogTitle>
          <AlertDialogDescription>
            This will set Current Pipeline membership to off for “{opportunityDisplayName}”. The WorkOrder will not be deleted and will remain available in All Records. No Won or Lost outcome will be created. Each record requires its own confirmation. “Remove & Next” advances to the next record in the current filtered queue only after this save succeeds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removeFromPipelineError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{removeFromPipelineError}</div>}
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={removeFromPipelineBusy}>Cancel</AlertDialogCancel>
          <Button type="button" variant="outline" disabled={removeFromPipelineBusy} onClick={() => confirmRemoveFromPipeline(false)} className="border-rose-300 text-rose-800 hover:bg-rose-50 hover:text-rose-900">
            {removeFromPipelineAction === "only" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Remove only
          </Button>
          {queueNavigation && (
            <Button type="button" disabled={removeFromPipelineBusy} onClick={() => confirmRemoveFromPipeline(true)} className="bg-rose-600 text-white hover:bg-rose-700">
              {removeFromPipelineAction === "next" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {queueNavigation.canNext ? <>Remove & Next<ChevronRight className="ml-1 h-4 w-4" /></> : "Remove & Finish"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}