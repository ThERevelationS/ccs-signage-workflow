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
import { getPermitGroupProgress, isPermitLineEffectivelyComplete, PERMIT_QUEUE_META } from "./permitQueue";
import { summarizePermitGroupAuthorityCoverage, summarizePermitLineOfficeAuthority, legacyOfficeLinkOptions } from "@/shared/permittingAddressLocality.js";

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
  onLinkLegacyOffice,
  onOpenWorkOrder,
  onShowLocalityInfo,
  onShowJurisdictionInfo,
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
  sharedOfficeCount = 0,
  onSearchLocality,
  queueState,
  expanded: controlledExpanded,
  onExpandedChange
}) {
  const expandKey = `permitting_expanded_${group?.work_order_id || "unknown"}`;
  const [internalExpanded, setInternalExpanded] = useState(() => {
    try { const saved = localStorage.getItem(expandKey); return saved == null ? true : saved === "1"; } catch { return true; }
  });
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const [stageFixOpen, setStageFixOpen] = useState(false);
  const [stageFixSaving, setStageFixSaving] = useState(false);
  const [showAllReadinessIssues, setShowAllReadinessIssues] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (nextExpanded) => {
    if (onExpandedChange) onExpandedChange(nextExpanded);
    else { setInternalExpanded(nextExpanded); try { localStorage.setItem(expandKey, nextExpanded ? "1" : "0"); } catch {} }
  };
  const wo = group.work_order;
  const hasLines = group.lines.length > 0;
  const readiness = group.readiness || { blockers: [], reviews: [], issueCount: 0, hasBlockers: false, hasIssues: false };
  const progress = getPermitGroupProgress(group, today);
  const authorityCoverage = summarizePermitGroupAuthorityCoverage(group.lines, localities);

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
        className="bg-gradient-to-r from-purple-50 to-white border-b px-3 py-2 cursor-pointer hover:from-purple-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Row 1: client name gets the full width — no truncation */}
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-purple-600 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-purple-600 flex-shrink-0" />}
          <div
            className="font-bold text-sm text-purple-900 hover:underline min-w-0 flex-1 leading-snug"
            onClick={(e) => { e.stopPropagation(); onOpenWorkOrder(group.work_order_id); }}
            title={wo?.client_name}
          >
            {wo?.client_name || "—"}
          </div>
          <div className="text-[10px] text-gray-400 flex-shrink-0">
            {hasLines ? `${group.lines.length} line${group.lines.length === 1 ? '' : 's'}` : (expanded ? 'No lines' : 'Tap to set up')}
          </div>
        </div>

        {/* Row 2: job metadata — fields wrap onto their own line instead of clipping */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6">

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

        </div>
      </div>

      {queueState && (
        <div className="px-3 py-2 border-b bg-white flex items-center gap-x-2 gap-y-1 flex-wrap text-xs">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${PERMIT_QUEUE_META[queueState.key]?.className || "border-gray-200 bg-gray-50 text-gray-700"}`}>
            {PERMIT_QUEUE_META[queueState.key]?.label || "Permit"}
          </span>
          {group.lines.some(li => li.urgent) && (
            <span className="inline-flex items-center rounded-full border border-red-400 bg-red-100 px-2 py-0.5 font-bold text-red-800">⚠ URGENT</span>
          )}
          {sharedOfficeCount > 1 && (
            <button
              type="button"
              onClick={() => { const name = String(group.lines[0]?.locality_name || "").trim(); if (name && onSearchLocality) onSearchLocality(name); }}
              className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100"
              title="Show the other jobs that use this same permit office"
            >
              Same office as {sharedOfficeCount - 1} other{sharedOfficeCount - 1 === 1 ? "" : "s"}
            </button>
          )}
          {isRegistered && group.lines.length > 1 && group.lines.some(li => !li.submitted_date && !isPermitLineEffectivelyComplete(li)) && (
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 hover:bg-emerald-100"
              title="Mark every pending line in this job as submitted today"
              onClick={() => {
                const pending = group.lines.filter((li) => !li.submitted_date && !isPermitLineEffectivelyComplete(li));
                if (!window.confirm(`Mark ${pending.length} application${pending.length === 1 ? "" : "s"} as sent to the office today? Only press OK if you really sent ${pending.length === 1 ? "it" : "them all"}.`)) return;
                const today = new Date().toISOString().slice(0, 10);
                for (const li of pending) onUpdateField(li.id, "submitted_date", today);
              }}
            >Mark all submitted</button>
          )}
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
                title="How many lines have everything filled in for handoff — this doesn't change any status."
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
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className={`font-semibold ${readiness.hasBlockers ? "text-red-800" : "text-amber-800"}`}>
                  {readiness.hasBlockers ? "Blocked / missing setup" : "Needs review"} · {readiness.issueCount} item{readiness.issueCount === 1 ? "" : "s"}
                </div>
                {readiness.issueCount > 2 && (
                  <button
                    type="button"
                    onClick={() => setShowAllReadinessIssues((value) => !value)}
                    className={`inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold underline-offset-2 hover:underline ${readiness.hasBlockers ? "text-red-800 hover:bg-red-100" : "text-amber-900 hover:bg-amber-100"}`}
                    aria-expanded={showAllReadinessIssues}
                  >
                    {showAllReadinessIssues ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {showAllReadinessIssues ? "Show less" : `Review all ${readiness.issueCount}`}
                  </button>
                )}
              </div>

              {!showAllReadinessIssues || readiness.issueCount <= 2 ? (
                <div className={`mt-0.5 ${readiness.hasBlockers ? "text-red-700" : "text-amber-700"}`}>
                  {[...readiness.blockers, ...readiness.reviews].slice(0, 2).join(" • ")}
                  {readiness.issueCount > 2 ? ` • +${readiness.issueCount - 2} more` : ""}
                </div>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {readiness.blockers.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-white/70 p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-red-800">Blocking / missing setup</div>
                      <div className="mt-1 space-y-1 text-[11px] leading-snug text-red-700">
                        {readiness.blockers.map((item) => <div key={`blocker-${item}`}>• {item}</div>)}
                      </div>
                    </div>
                  )}
                  {readiness.reviews.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-white/70 p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Review items</div>
                      <div className="mt-1 space-y-1 text-[11px] leading-snug text-amber-800">
                        {readiness.reviews.map((item) => <div key={`review-${item}`}>• {item}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Authority review is derived from the saved permit-line locality IDs, so it
          persists across Apply/reload and reflects subsequent staff verification. */}
      {authorityCoverage.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/70 px-3 py-2 text-xs" role="status">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-950">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Office check — only the offices we have on file; there may be more
          </div>
          {authorityCoverage.map(({ locality_id, locality_name, authority }) => (
            <div key={locality_id || 'unlinked'} className="mt-1 text-amber-950">
              <strong>{locality_name}:</strong>{' '}
              {authority.coverage_status === 'configured_offices_reviewed' ? (
                <span>All offices here are staff-checked — other offices may still be needed.</span>
              ) : authority.coverage_status === 'partial' ? (
                <span>{authority.verified_office_count} office(s) verified — {authority.other_office_count} still need a check.</span>
              ) : authority.coverage_status === 'not_verified' ? (
                <span>No verified offices yet — they still need a check.</span>
              ) : authority.coverage_status === 'not_configured' ? (
                <span>No offices set up — we don't know who issues the permit.</span>
              ) : (
                <span>Locality link missing or unavailable; review this permit line.</span>
              )}
              {authority.verified_roles.length > 0 && (
                <span className="ml-1">Verified roles: {authority.verified_roles.join(', ').replaceAll('_', ' ')}.</span>
              )}
              {authority.roles_needing_review.length > 0 && (
                <span className="ml-1">Roles on offices needing review: {authority.roles_needing_review.join(', ').replaceAll('_', ' ')}.</span>
              )}
            </div>
          ))}
          {authorityCoverage.map(({ locality_id }) => {
            const loc = localities?.find((l) => l.id === locality_id);
            return (loc?.offices || []).map((o) => (
              <div key={`${locality_id}-${o.id || o.name}`} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-950">
                <span className="font-semibold">{o.name || "Office"}</span>
                <span
                  className="text-[9px]"
                  title={o.authority_verification_status === 'staff_verified' ? 'Verified by our team' : o.authority_verification_status ? `Status: ${String(o.authority_verification_status).replaceAll('_', ' ')}` : 'Not verified yet'}
                >
                  {o.authority_verification_status === 'staff_verified' ? '●●●' : o.authority_verification_status ? '●●○' : '●○○'}
                </span>
                {o.contact_phone && <a className="underline" href={`tel:${String(o.contact_phone).replace(/[^+\d]/g, "")}`}>{o.contact_phone}</a>}
                {o.contact_website && <a className="underline" href={o.contact_website} target="_blank" rel="noopener noreferrer">Permit portal ↗</a>}
                {o.contact_address && <a className="underline" href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(o.contact_address)} target="_blank" rel="noopener noreferrer">Directions ↗</a>}
                <button
                  type="button"
                  className="underline"
                  title="Read this office's details aloud"
                  onClick={(e) => { e.stopPropagation(); try { speechSynthesis.speak(new SpeechSynthesisUtterance(`${o.name || "Office"}. Phone ${o.contact_phone || "not on file"}. ${o.contact_address || ""}`)); } catch {} }}
                >
                  Read aloud
                </button>
              </div>
            ));
          })}
          {authorityCoverage.map(({ locality_id }) => {
            const loc = localities?.find((l) => l.id === locality_id);
            const last = (loc?.change_log || []).slice(-1)[0];
            return last ? (
              <p key={`log-${locality_id}`} className="mt-1 text-[10px] text-amber-800">
                Updated {String(last.at || '').slice(0, 10)}{last.by ? ` by ${last.by}` : ''}: {(last.changed_fields || []).join(', ').replaceAll('_', ' ') || 'details'}
              </p>
            ) : null;
          })}
          <button
            type="button"
            className="mt-1.5 text-[10px] font-semibold text-amber-800 underline hover:text-amber-950"
            onClick={() => {
              const blocks = authorityCoverage.map(({ locality_id, locality_name }) => {
                const loc = localities?.find((l) => l.id === locality_id);
                const offices = (loc?.offices || []).map((o) =>
                  `${o.name || "Office"} (${(o.office_types || []).join(", ") || "general"}) — ${o.contact_phone || "no phone"} — ${o.contact_website || "no link"}`
                );
                return `${locality_name}\n${offices.length ? offices.join("\n") : "  (no offices configured)"}`;
              });
              navigator.clipboard?.writeText(blocks.join("\n\n")).catch(() => {});
            }}
          >
            Copy office contact info
          </button>
        </div>
      )}

      {/* EXPANDED BODY */}
      {expanded && (
        <div>
          {hasLines&&<div className="px-4 py-2"><Button type="button" variant="outline" className="min-h-11 text-xs" disabled={!isRegistered} onClick={()=>setShowLocalityPicker(true)}>Find the right office…</Button></div>}
          {!hasLines ? (
            <div className="px-4 py-4 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-xs text-gray-500"><strong className="text-gray-700">Next step:</strong> find which town or township issues this job's permits.</span>
              <Button
                onClick={() => setShowLocalityPicker(true)}
                disabled={!isRegistered}
                size="sm"
                variant="outline"
                className="min-h-11 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <MapPin className="w-3.5 h-3.5" /> Pick the town's office…
              </Button>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {[...group.lines].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((li, idx, sorted) => (
                  <div key={li.id} className="flex items-stretch gap-0">
                    <div className="flex flex-col justify-center pl-1 pr-0.5">
                      <button type="button" disabled={idx === 0 || !isRegistered} className="text-[10px] text-gray-400 hover:text-purple-700 disabled:opacity-20" title="Move up" onClick={() => onUpdateField(li.id, "order", (sorted[idx-1]?.order ?? idx-1) - 0.5)}>▲</button>
                      <button type="button" disabled={idx === sorted.length - 1 || !isRegistered} className="text-[10px] text-gray-400 hover:text-purple-700 disabled:opacity-20" title="Move down" onClick={() => onUpdateField(li.id, "order", (sorted[idx+1]?.order ?? idx+1) + 0.5)}>▼</button>
                    </div>
                    <div className="min-w-0 flex-1">
                  <PermitSpreadsheetRow
                    lineItem={li}
                    onUpdateStep={onUpdateStep}
                    onUpdateField={onUpdateField}
                    onShowLocalityInfo={onShowLocalityInfo}
                    onShowJurisdictionInfo={onShowJurisdictionInfo}
                    localityState={localities?.find((locality) => locality.id === li.locality_id)?.state || ""}
                    officeAuthority={summarizePermitLineOfficeAuthority(li, localities)}
                    legacyOfficeOptions={legacyOfficeLinkOptions(li, localities)}
                    onLinkLegacyOffice={onLinkLegacyOffice}
                    onDeleteLine={onDeleteLine}
                    isRegistered={isRegistered}
                    users={users}
                    currentUser={currentUser}
                    today={today}
                    installDate={wo?.project_install_date || ""}
                  />
                    </div>
                  </div>
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
          initialAddress={[wo?.install_location, wo?.address_line_2, wo?.township_city, wo?.county, wo?.state]
            .filter(v => String(v || '').trim()).join(', ')}
          onApply={(localityId, opts) => {
            onSelectLocalityForWorkOrder(group.work_order_id, localityId, opts);
          }}
        />
      )}
    </div>
  );
}