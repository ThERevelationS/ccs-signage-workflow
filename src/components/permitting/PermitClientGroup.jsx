import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Briefcase, User, Clipboard, MapPin, Clock, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PermitSpreadsheetRow from "./PermitSpreadsheetRow";
import PermitLineNotesSection from "./PermitLineNotesSection";
import PermitJobDocuments from "./PermitJobDocuments";
import InlineEditField from "./InlineEditField";
import LocalityPickerDialog from "./LocalityPickerDialog";
import PermitSetupWizard from "./PermitSetupWizard";
import { useJobSiteAddress } from "./jobSiteAddress";
import { getPermitGroupProgress, isPermitLineEffectivelyComplete, PERMIT_QUEUE_META } from "./permitQueue";
import { summarizePermitGroupAuthorityCoverage, summarizePermitLineOfficeAuthority, legacyOfficeLinkOptions, officeResearchStatusLine } from "@/shared/permittingAddressLocality.js";

const SECTION_ACTIONS = {
  fee: "Review fee",
  inspection: "Review inspection & wrap-up",
  corrections: "Review corrections",
  handoff: "Review closeout",
};

const LIFECYCLE_PROGRESS_TONES = {
  neutral: "border-slate-200 bg-white text-slate-600",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function PermitClientGroup({
  group,
  onOpenStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onSelectLocalityForWorkOrder,
  onQueueLocalityApply,
  onRemoveLocality,
  onRefreshLines,
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
  initialLineId,
  expanded: controlledExpanded,
  onExpandedChange
}) {
  const expandKey = `permitting_expanded_${group?.work_order_id || "unknown"}`;
  const [internalExpanded, setInternalExpanded] = useState(() => {
    try { const saved = localStorage.getItem(expandKey); return saved == null ? true : saved === "1"; } catch { return true; }
  });
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(3);
  const [openLines, setOpenLines] = useState(() => new Set(initialLineId ? [initialLineId] : []));
  const [focusLine, setFocusLine] = useState("");
  const groupRef = useRef(null);
  useEffect(() => {
    if (initialLineId) setOpenLines(previous => new Set([...previous, initialLineId]));
  }, [initialLineId]);
  useEffect(() => {
    if (!focusLine) return;
    const row = groupRef.current?.querySelector(`[data-permit-line="${CSS.escape(String(focusLine.id))}"]`);
    const target = focusLine.section && row?.querySelector(`[data-permit-section="${CSS.escape(focusLine.section)}"]`);
    if (target) {
      // Open the targeted section and its enclosing disclosure without invoking any field actions.
      for (let parent = target.parentElement; parent && parent !== row; parent = parent.parentElement) {
        if (parent.tagName === "DETAILS") parent.open = true;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center" });
    } else {
      row?.querySelector("button[aria-expanded]")?.focus();
    }
    setFocusLine("");
  }, [focusLine]);
  const toggleLine = id => setOpenLines(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setAllLinesExpanded = open => setOpenLines(new Set(open ? group.lines.map(li => li.id) : []));
  const [stageFixOpen, setStageFixOpen] = useState(false);
  const [stageFixSaving, setStageFixSaving] = useState(false);
  const [showAllReadinessIssues, setShowAllReadinessIssues] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  // "Mark all submitted" asks with a styled dialog — never window.confirm.
  const [markSentAsk, setMarkSentAsk] = useState(null);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (nextExpanded) => {
    if (onExpandedChange) onExpandedChange(nextExpanded);
    else { setInternalExpanded(nextExpanded); try { localStorage.setItem(expandKey, nextExpanded ? "1" : "0"); } catch {} }
  };
  const wo = group.work_order;
  // The picker reads its address once on open, so mount it after the job site resolves.
  const pickerSite = useJobSiteAddress(wo, showLocalityPicker);
  const hasLines = group.lines.length > 0;
  // The job's applied office — only defined when every line shares one
  // locality, which is what "remove the office from this job" means.
  const lineLocalityIds = [...new Set(group.lines.map(li => String(li.locality_id || '')).filter(Boolean))];
  const appliedLocality = lineLocalityIds.length === 1 ? (localities || []).find(l => l.id === lineLocalityIds[0]) : null;
  const removeLocalityTargets = lineLocalityIds.map(id => {
    const lines = group.lines.filter(line => String(line.locality_id || "") === id);
    const locality = (localities || []).find(item => String(item.id) === id);
    return {
      id,
      name: locality?.name || lines.find(line => line.locality_name)?.locality_name || "this jurisdiction",
      count: lines.length,
    };
  });
  const pendingLocalityName = String(wo?.pending_permit_locality_name || '').trim();
  const pendingLocalityId = String(wo?.pending_permit_locality_id || '').trim();
  const awaitingOffice = !hasLines && Boolean(pendingLocalityId || pendingLocalityName);
  const startSetup = () => { setWizardStep(0); setShowSetupWizard(true); };
  // Live pending-apply status — a static chip says nothing, so poll the
  // locality: show verification progress, and the moment the worker consumes
  // this job's pending_applies entry reload the page data so the finished
  // lines appear without a manual refresh.
  const [pendStatus, setPendStatus] = useState('');
  const pendFiredRef = useRef(false);
  useEffect(() => { pendFiredRef.current = false; }, [pendingLocalityId]);
  useEffect(() => {
    if (!pendingLocalityId || !group?.work_order_id || !isRegistered) { setPendStatus(''); return; }
    let dead = false;
    const tick = async () => {
      // Hidden tabs don't need the office-watch status line — skip the reads.
      if (document.hidden) return;
      const loc = await staffEntities.PermitLocality.get(pendingLocalityId).catch(() => null);
      if (dead || !loc?.id) return;
      const stillQueued = (Array.isArray(loc.pending_applies) ? loc.pending_applies : [])
        .some(p => String(p?.work_order_id || '') === String(group.work_order_id));
      if (!stillQueued) {
        if (!pendFiredRef.current) { pendFiredRef.current = true; onRefreshLines?.(); }
        return;
      }
      const prof = loc.jurisdiction_profile_id
        ? await staffEntities.JurisdictionProfile.get(loc.jurisdiction_profile_id).catch(() => null)
        : null;
      if (dead) return;
      setPendStatus(officeResearchStatusLine(loc, prof));
    };
    tick();
    const iv = setInterval(tick, 12000);
    return () => { dead = true; clearInterval(iv); };
  }, [pendingLocalityId, group?.work_order_id, isRegistered]);
  const readiness = group.readiness || { blockers: [], reviews: [], issueCount: 0, hasBlockers: false, hasIssues: false };
  const progress = getPermitGroupProgress(group, today);
  const authorityCoverage = summarizePermitGroupAuthorityCoverage(group.lines, localities);
  const authorityNeedsCheck = authorityCoverage.some(
    ({ authority }) => authority?.coverage_status && authority.coverage_status !== 'configured_offices_reviewed'
  );

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
    <section ref={groupRef} className=" [&_input:not([type=checkbox])]:border-slate-500 [&_input:not([type=checkbox])]:bg-white [&_textarea]:border-slate-500 [&_[role=combobox]]:border-slate-500 [&_:focus-visible]:outline [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-sky-800 min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="rounded-t-lg bg-slate-100 grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:gap-4 sm:px-4">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 items-center gap-3 rounded text-left hover:text-purple-800">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <strong className="block break-words text-sm text-slate-900">{wo?.client_name || "Permit job"}</strong>
            <span className="block text-xs text-slate-600">{wo?.current_task_assigned_to ? `Job owner: ${wo.current_task_assigned_to}` : "No job owner"} · {hasLines ? `${progress.completedCount}/${progress.totalCount} permits complete` : "No permits yet"}</span>
          </span>
        </button>
        {queueState && <div className="min-w-0 border-l-2 border-purple-200 pl-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded border px-2 py-0.5 font-semibold ${PERMIT_QUEUE_META[queueState.key]?.className || ""}`}>{awaitingOffice ? "Awaiting office verification" : PERMIT_QUEUE_META[queueState.key]?.label}</span>
            {group.lines.some(li => li.urgent) && <strong className="text-red-700">Urgent</strong>}
            {queueState.followupDate && queueState.key !== "waiting" && <span>{queueState.timingLabel}</span>}
            {!expanded && readiness.hasBlockers && <strong className="text-red-800">Blocked: {readiness.blockers[0]}</strong>}
          </div>
          <div className="mt-1 break-words text-sm font-medium text-slate-900">{awaitingOffice ? <span role="status">{pendStatus || `Setup will continue automatically when ${pendingLocalityName || "the selected jurisdiction"} is verified.`}</span>
              : <><strong>{queueState.key === "waiting" || queueState.key === "completed" ? "" : "Next: "}</strong>{hasLines ? queueState.nextAction : "Confirm the job site and choose the permit offices."}</>}</div>
          {!hasLines && !awaitingOffice && wo && isRegistered && (
            <Button type="button" size="sm" className="mt-2" onClick={startSetup}>Set up permit</Button>
          )}
          {queueState.nextLineId && <button type="button" className="mt-1 rounded py-1 text-xs font-semibold text-purple-800 underline" onClick={() => {
            setExpanded(true); setOpenLines(new Set([queueState.nextLineId])); setFocusLine({ id: queueState.nextLineId, section: queueState.nextSection });
          }}>{SECTION_ACTIONS[queueState.nextSection] || "Open permit"}</button>}
        </div>}
      </div>
      {expanded && <div className="flex flex-wrap items-center gap-2 px-4 text-xs">{wo?._permittingRoutingMismatch && (
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
          )}</div>}
      {expanded && (<>
      {readiness.hasIssues && (
        <div className={`border-b px-3 py-2 text-xs ${readiness.hasBlockers ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${readiness.hasBlockers ? "text-red-600" : "text-amber-600"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className={`font-semibold ${readiness.hasBlockers ? "text-red-800" : "text-amber-800"}`}>
                  Needs attention · {readiness.hasBlockers ? "Blocked" : "Review"} · {readiness.issueCount} item{readiness.issueCount === 1 ? "" : "s"}
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

      </>)}

      {/* EXPANDED BODY */}
      {expanded && (
        <div>
          {pendingLocalityName && !awaitingOffice && (
            <div className="px-4 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {pendStatus || `${pendingLocalityName} — applying automatically when its offices verify`}
              </span>
            </div>
          )}
          {hasLines && <div className="flex flex-wrap items-center gap-2 border-y border-slate-400 bg-[#dce8ed] px-3 py-1">
            <h4 className="mr-auto text-sm font-semibold text-slate-900">Permits</h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button className="border-slate-500 bg-slate-100 text-slate-900" type="button" variant="outline" size="sm">Job actions <ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-slate-500 bg-white text-slate-900 shadow-lg [&_[data-highlighted]]:bg-slate-200 [&_[data-highlighted]]:text-slate-950">
                <DropdownMenuItem disabled={!isRegistered} onSelect={() => { setWizardStep(3); setShowSetupWizard(true); }}>Edit permit setup</DropdownMenuItem>
                {wo && <DropdownMenuItem disabled={!isRegistered} onSelect={() => { setWizardStep(2); setShowSetupWizard(true); }}>Build AI permit plan</DropdownMenuItem>}
                {sharedOfficeCount > 1 && <DropdownMenuItem onSelect={() => onSearchLocality?.(group.lines[0]?.locality_name)}>Show jobs with this office</DropdownMenuItem>}
                {group.lines.length > 2 && <><DropdownMenuItem onSelect={() => setAllLinesExpanded(true)}>Expand all permits</DropdownMenuItem><DropdownMenuItem onSelect={() => setAllLinesExpanded(false)}>Collapse all permits</DropdownMenuItem></>}
                {isRegistered && group.lines.length > 1 && group.lines.some(li => !li.submitted_date && !isPermitLineEffectivelyComplete(li)) &&
                  <DropdownMenuItem onSelect={() => setMarkSentAsk(group.lines.filter(li => !li.submitted_date && !isPermitLineEffectivelyComplete(li)))}>Mark all submitted...</DropdownMenuItem>}
                {onRemoveLocality && removeLocalityTargets.length > 0 && <DropdownMenuSeparator />}
                {onRemoveLocality && removeLocalityTargets.map(target => <DropdownMenuItem key={target.id} disabled={!isRegistered} className="text-red-700" onSelect={() => setRemoveTarget(target)}>Remove {target.name}...</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            {(() => {

              const latest = [...(appliedLocality?.office_change_log || [])].pop();

              if (!latest?.at) return null;

              const fresh = Date.now() - new Date(latest.at).getTime() < 14 * 864e5;

              return (

                <span

                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${fresh ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-500'}`}

                  title={`Office data last changed ${latest.at}`}

                >

                  <AlertTriangle className={`w-3.5 h-3.5 ${fresh ? '' : 'opacity-40'}`} />

                  Office info changed{latest.summary ? ` — ${latest.summary}` : ''}

                </span>

              );

            })()}

          </div>}
          {!hasLines ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-xs text-slate-600">{awaitingOffice ? "Office verification is already queued." : "Permit setup starts with the job site address."}</span>
              {!queueState && !awaitingOffice && wo && isRegistered && <Button size="sm" onClick={startSetup}>Set up permit</Button>}
              {wo && isRegistered && <DropdownMenu>
                <DropdownMenuTrigger asChild><Button className="border-slate-500 bg-slate-100 text-slate-900" type="button" variant="outline" size="sm">Setup options <ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-slate-500 bg-white text-slate-900 shadow-lg [&_[data-highlighted]]:bg-slate-200 [&_[data-highlighted]]:text-slate-950">
                  {awaitingOffice && <DropdownMenuItem onSelect={startSetup}>Review permit setup</DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => setShowLocalityPicker(true)}>Advanced office lookup</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>
          ) : (
            <>
              <div className="space-y-1 bg-slate-100 p-1">
                {[...group.lines].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((li, idx, sorted) => (
                  <div key={li.id} data-permit-line={li.id} className={`flex items-stretch rounded border border-l-4 ${openLines.has(li.id) ? "border-slate-400 border-l-sky-800 bg-[#edf4f6]" : "border-slate-300 border-l-slate-400 bg-white"}`}>
                    <div className="flex flex-col justify-center pl-1 pr-0.5">
                      <button type="button" disabled={idx === 0 || !isRegistered} className="text-[10px] text-gray-400 hover:text-purple-700 disabled:opacity-20" title="Move up" onClick={() => onUpdateField(li.id, "order", (sorted[idx-1]?.order ?? idx-1) - 0.5)}>▲</button>
                      <button type="button" disabled={idx === sorted.length - 1 || !isRegistered} className="text-[10px] text-gray-400 hover:text-purple-700 disabled:opacity-20" title="Move down" onClick={() => onUpdateField(li.id, "order", (sorted[idx+1]?.order ?? idx+1) + 0.5)}>▼</button>
                    </div>
                    <div className="min-w-0 flex-1">
                  <PermitSpreadsheetRow
                    lineItem={li}
                    expanded={openLines.has(li.id)}
                    onToggle={() => toggleLine(li.id)}
                    onOpenStep={onOpenStep}
                    onUpdateField={onUpdateField}
                    onShowLocalityInfo={onShowLocalityInfo}
                    onShowJurisdictionInfo={onShowJurisdictionInfo}
                    localityState={localities?.find((locality) => locality.id === li.locality_id)?.state || ""}
                    locality={localities?.find((locality) => locality.id === li.locality_id) || null}
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

      <h4 className="border-y border-stone-400 bg-stone-200 px-4 py-2 text-sm font-semibold text-slate-800">Reference</h4>
      {/* Authority review is derived from the saved permit-line locality IDs, so it
          persists across Apply/reload and reflects subsequent staff verification. */}
      {authorityCoverage.length > 0 && (
        <details className="border-t border-stone-300 bg-stone-50 px-4 py-3 text-xs"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Offices &amp; contacts{authorityNeedsCheck ? " · Verification needed" : ""}</summary>
          <div className="mt-3 mb-1 flex items-center gap-1.5 font-semibold text-amber-950">
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
              <div
                key={`${locality_id}-${o.id || o.name}`}
                className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-950 ${
                  group.lines.some(line => String(line.locality_id || "") === String(locality_id || "")
                    && String(line.locality_office_id || "") === String(o.id || "")) ? "" : "opacity-60"
                }`}
              >
                <span className="font-semibold">{o.name || "Office"}</span>
                {group.lines.some(line => String(line.locality_id || "") === String(locality_id || "")
                  && String(line.locality_office_id || "") === String(o.id || "")) ? (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">tracked</span>
                ) : (
                  <span className="text-[10px] text-gray-500">no permit line</span>
                )}
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
        </details>
      )}
              {/* Single shared notes section for the whole project — expanded by default */}
              {wo && (<details className="border-t border-stone-300 bg-stone-50 px-4 py-3"><summary className="cursor-pointer text-sm font-semibold">Project notes</summary>
                <PermitLineNotesSection
                  workOrder={wo}
                  officeLabel=""
                  currentUser={currentUser}
                  disabled={!isRegistered}
                  onUpdated={onWorkNotesChanged}
                /></details>
              )}
            </>
          )}

      <details className="border-t border-stone-300 bg-stone-50 px-4 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Job information</summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" className="text-xs text-purple-800 underline" onClick={() => onOpenWorkOrder(group.work_order_id)}>Open work order</button>
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
        {progress.totalCount > 1 && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Permit status breakdown">
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
        </div>}
      </details>

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

      {showLocalityPicker && !pickerSite.loading && (
        <LocalityPickerDialog
          isOpen={showLocalityPicker}
          onClose={() => setShowLocalityPicker(false)}
          localities={localities}
          initialAddress={pickerSite.address}
          onApply={(localityId, opts) => {
            onSelectLocalityForWorkOrder(group.work_order_id, localityId, opts);
          }}
          onPendingApply={(localityId, opts) => {
            onQueueLocalityApply?.(group.work_order_id, localityId, opts);
          }}
        />
      )}

      {showSetupWizard && (
        <PermitSetupWizard
          isOpen={showSetupWizard}
          onClose={() => setShowSetupWizard(false)}
          initialStep={wizardStep}
          workOrder={wo}
          existingLines={group.lines}
          localities={localities}
          onApply={(localityId, opts) => {
            return onSelectLocalityForWorkOrder(group.work_order_id, localityId, opts);
          }}
          onPendingApply={(localityId, opts) => {
            return onQueueLocalityApply?.(group.work_order_id, localityId, opts);
          }}
          onRemoveLocality={onRemoveLocality ? (localityId) => onRemoveLocality(group.work_order_id, localityId) : null}
          onDeleteLines={async ids => {
            for (const id of ids) await onDeleteLine?.(id);
          }}
        />
      )}

      {/* Remove this job's applied office — deletes only this job's permit
          lines for that locality; the office record itself is untouched, so
          searching the address again re-suggests the same office. */}
      {/* Batch "sent today" — a deliberate confirm because this drives the
          permit_submitted automation for every pending line at once. */}
      <AlertDialog open={!!markSentAsk} onOpenChange={(o) => { if (!o) setMarkSentAsk(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {markSentAsk?.length || 0} application{(markSentAsk?.length || 0) === 1 ? '' : 's'} as sent?</AlertDialogTitle>
            <AlertDialogDescription>
              This stamps today's date on every pending permit line for this job. Only confirm if you really sent {(markSentAsk?.length || 0) === 1 ? 'it' : 'them all'} to the office.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                for (const li of markSentAsk || []) onUpdateField(li.id, "submitted_date", today);
                setMarkSentAsk(null);
              }}
            >
              Yes — I sent them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name || 'this jurisdiction'} from this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {removeTarget?.count || 0} permit line{removeTarget?.count === 1 ? '' : 's'} linked to {removeTarget?.name || 'this jurisdiction'} on this job only — the office record itself stays saved, so searching the address again will find it if it is still the right one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep jurisdiction</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target?.id) onRemoveLocality(group.work_order_id, target.id);
              }}
            >
              Remove jurisdiction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}