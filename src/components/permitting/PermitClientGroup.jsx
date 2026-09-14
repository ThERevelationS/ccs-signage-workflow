import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Briefcase, User, Clipboard, MapPin, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import PermitSpreadsheetRow from "./PermitSpreadsheetRow";
import PermitLineNotesSection from "./PermitLineNotesSection";
import PermitJobDocuments from "./PermitJobDocuments";
import InlineEditField from "./InlineEditField";
import LocalityPickerDialog from "./LocalityPickerDialog";
import { getPermitGroupProgress, PERMIT_QUEUE_META } from "./permitQueue";

const LIFECYCLE_PROGRESS_TONES = {
  neutral: "border-slate-200 bg-white text-slate-600",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function PermitClientGroup({
  group,
  onUpdateStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onSelectLocalityForWorkOrder,
  onOpenWorkOrder,
  onShowLocalityInfo,
  onDeleteLine,
  onUpdateWorkOrderField,
  onWorkNotesChanged,
  onFixPermittingStage,
  currentUser,
  isRegistered,
  localities,
  users,
  taskDescriptions,
  today,
  queueState
}) {
  const [expanded, setExpanded] = useState(true);
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const [stageFixOpen, setStageFixOpen] = useState(false);
  const [stageFixSaving, setStageFixSaving] = useState(false);
  const wo = group.work_order;
  const hasLines = group.lines.length > 0;
  const readiness = group.readiness || { blockers: [], reviews: [], issueCount: 0, hasBlockers: false, hasIssues: false };
  const progress = getPermitGroupProgress(group);

  // Est/Inv # — prefer corbridge_invoice_number, else est_inv_at
  const estInvNumber = wo?.corbridge_invoice_number || wo?.est_inv_at || "";
  const estInvLink = wo?.corbridge_link || wo?.estimator_app_url || "";

  const saveWO = (field, value) => {
    if (wo && onUpdateWorkOrderField) onUpdateWorkOrderField(wo.id, field, value);
  };

  // Build user options for Assigned / PM
  const userOptions = (users || [])
    .map(u => u.full_name || u.email)
    .filter(Boolean)
    .sort();

  const taskDescOptions = (taskDescriptions || []).filter(Boolean);

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* CLIENT INFO HEADER ROW */}
      <div
        className="bg-gradient-to-r from-purple-50 to-white border-b px-3 py-2 cursor-pointer hover:from-purple-100 transition-colors flex flex-wrap items-center gap-x-3 gap-y-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-purple-600 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-purple-600 flex-shrink-0" />}

        {/* Name */}
        <div
          className="font-bold text-sm text-purple-900 hover:underline min-w-0 w-[calc(100%-2rem)] sm:w-auto sm:max-w-[180px] truncate"
          onClick={(e) => { e.stopPropagation(); onOpenWorkOrder(group.work_order_id); }}
          title={wo?.client_name}
        >
          {wo?.client_name || "—"}
        </div>

        {/* Est/Inv # — editable text + external link */}
        <div className="flex items-center gap-1 text-[11px] flex-shrink-0" onClick={e => e.stopPropagation()}>
          <InlineEditField
            label="Est/Inv:"
            value={wo?.corbridge_invoice_number || wo?.est_inv_at || ""}
            placeholder="—"
            onSave={(v) => saveWO(wo?.corbridge_invoice_number !== undefined && wo?.corbridge_invoice_number !== "" ? 'corbridge_invoice_number' : 'est_inv_at', v)}
            disabled={!isRegistered}
            maxWidth={140}
          />
          {estInvLink && estInvNumber && (
            <a
              href={estInvLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              onClick={e => e.stopPropagation()}
              title="Open in Corebridge"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        {/* Job Description (from Sales Pipeline — wo.description) */}
        <InlineEditField
          icon={<Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
          label="Job:"
          value={wo?.description || ""}
          placeholder="Add job description…"
          onSave={(v) => saveWO('description', v)}
          disabled={!isRegistered}
          maxWidth={420}
          textSizeClass="text-[13px]"
        />

        {/* Task Assigned */}
        <InlineEditField
          icon={<User className="w-3 h-3 text-gray-400" />}
          label="Assigned:"
          value={wo?.current_task_assigned_to || ""}
          placeholder="—"
          onSave={(v) => saveWO('current_task_assigned_to', v)}
          options={userOptions}
          disabled={!isRegistered}
          maxWidth={140}
        />

        {/* Project Manager */}
        <InlineEditField
          label="PM:"
          value={wo?.project_manager || ""}
          placeholder="—"
          onSave={(v) => saveWO('project_manager', v)}
          options={userOptions}
          disabled={!isRegistered}
          maxWidth={120}
        />

        {/* Task Description */}
        <InlineEditField
          icon={<Clipboard className="w-3 h-3 text-gray-400" />}
          value={wo?.current_task_description || ""}
          placeholder="Task…"
          onSave={(v) => saveWO('current_task_description', v)}
          options={taskDescOptions.length ? taskDescOptions : undefined}
          disabled={!isRegistered}
          maxWidth={200}
        />

        <div className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">
          {hasLines ? `${group.lines.length} line${group.lines.length === 1 ? '' : 's'}` : 'No lines'}
        </div>
      </div>

      {queueState && (
        <div className="px-3 py-2 border-b bg-white flex items-center gap-x-2 gap-y-1 flex-wrap text-xs">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${PERMIT_QUEUE_META[queueState.key]?.className || "border-gray-200 bg-gray-50 text-gray-700"}`}>
            {PERMIT_QUEUE_META[queueState.key]?.label || "Permit"}
          </span>
          {queueState.timingLabel && (
            <span className={`inline-flex items-center gap-1 font-semibold ${queueState.key === "overdue" ? "text-red-700" : queueState.key === "due_today" ? "text-amber-700" : "text-gray-500"}`}>
              <Clock className="w-3 h-3" /> {queueState.timingLabel}
            </span>
          )}
          {wo?._permittingRoutingMismatch && (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800"
                title={wo._permittingRoutingWarning}
              >
                <AlertTriangle className="w-3 h-3" /> Stage mismatch
              </span>
              {wo._permittingStageFixAvailable && isRegistered && onFixPermittingStage && (
                <button
                  type="button"
                  onClick={() => setStageFixOpen(true)}
                  className="font-semibold text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                >
                  Fix stage
                </button>
              )}
            </>
          )}
          <span className="font-semibold text-gray-600">Next:</span>
          <span className="text-gray-700">{queueState.nextAction}</span>
        </div>
      )}

      {progress.totalCount > 1 && (
        <div className="border-b bg-slate-50/70 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-700">Permit progress</span>
            <span className="text-slate-500">
              {progress.completedCount}/{progress.totalCount} lines complete
            </span>
            <span className="hidden text-slate-300 sm:inline">•</span>
            <div className="flex flex-wrap items-center gap-1">
              {progress.lifecycleStages.map((stage) => (
                <span
                  key={stage.key}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LIFECYCLE_PROGRESS_TONES[stage.tone] || LIFECYCLE_PROGRESS_TONES.neutral}`}
                  title={`${stage.count} permit line${stage.count === 1 ? "" : "s"} at ${stage.label.toLowerCase()}`}
                >
                  {stage.count > 1 ? `${stage.count} × ` : ""}{stage.shortLabel || stage.label}
                </span>
              ))}
            </div>
            {progress.handoffApplicableCount > 0 && (
              <span
                className={`ml-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:ml-auto ${progress.handoffBlockedCount > 0 ? "border-red-200 bg-red-50 text-red-800" : progress.handoffIssueCount > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                title="Handoff readiness uses only recorded permit facts and does not change workflow status."
              >
                Handoff {progress.handoffReadyCount}/{progress.handoffApplicableCount} ready
              </span>
            )}
          </div>
        </div>
      )}

      {readiness.hasIssues && (
        <div className={`border-b px-3 py-2 text-xs ${readiness.hasBlockers ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${readiness.hasBlockers ? "text-red-600" : "text-amber-600"}`} />
            <div className="min-w-0">
              <div className={`font-semibold ${readiness.hasBlockers ? "text-red-800" : "text-amber-800"}`}>
                {readiness.hasBlockers ? "Blocked / missing setup" : "Needs review"} · {readiness.issueCount} item{readiness.issueCount === 1 ? "" : "s"}
              </div>
              <div className={`mt-0.5 ${readiness.hasBlockers ? "text-red-700" : "text-amber-700"}`}>
                {[...readiness.blockers, ...readiness.reviews].slice(0, 2).join(" • ")}
                {readiness.issueCount > 2 ? ` • +${readiness.issueCount - 2} more` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED BODY */}
      {expanded && (
        <div>
          {!hasLines ? (
            <div className="px-4 py-4 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs text-gray-500">Select a locality to apply its configured line items:</span>
              <Button
                onClick={() => setShowLocalityPicker(true)}
                disabled={!isRegistered}
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <MapPin className="w-3.5 h-3.5" /> Select Locality…
              </Button>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {group.lines.map(li => (
                  <PermitSpreadsheetRow
                    key={li.id}
                    lineItem={li}
                    onUpdateStep={onUpdateStep}
                    onUpdateField={onUpdateField}
                    onShowLocalityInfo={onShowLocalityInfo}
                    onDeleteLine={onDeleteLine}
                    isRegistered={isRegistered}
                    users={users}
                    today={today}
                  />
                ))}
              </div>

              {/* Single shared notes section for the whole project — expanded by default */}
              {wo && (
                <PermitLineNotesSection
                  workOrder={wo}
                  officeLabel=""
                  currentUser={currentUser}
                  disabled={!isRegistered}
                  onUpdated={onWorkNotesChanged}
                />
              )}
            </>
          )}

          {wo && (
            <PermitJobDocuments
              workOrder={wo}
              onManageFiles={() => onOpenWorkOrder(group.work_order_id)}
            />
          )}
        </div>
      )}

      <AlertDialog open={stageFixOpen} onOpenChange={(open) => !stageFixSaving && setStageFixOpen(open)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Set this Work Order stage to Permitting?</AlertDialogTitle>
            <AlertDialogDescription>
              The current task already routes {wo?.client_name || "this job"} to the Permitting page, but the Work Order stage is still {wo?.current_stage || "not set"}. This will change only the workflow stage to Permitting using the normal CCS stage-transition process. Permit lines, task description, notes, customer/job links, and files will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stageFixSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={stageFixSaving}
              onClick={async (event) => {
                event.preventDefault();
                setStageFixSaving(true);
                try {
                  const fixed = await onFixPermittingStage?.(wo?.id);
                  if (fixed) setStageFixOpen(false);
                } finally {
                  setStageFixSaving(false);
                }
              }}
            >
              {stageFixSaving ? "Updating…" : "Set Stage to Permitting"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showLocalityPicker && (
        <LocalityPickerDialog
          isOpen={showLocalityPicker}
          onClose={() => setShowLocalityPicker(false)}
          localities={localities}
          onApply={(localityId, opts) => {
            onSelectLocalityForWorkOrder(group.work_order_id, localityId, opts);
          }}
        />
      )}
    </div>
  );
}