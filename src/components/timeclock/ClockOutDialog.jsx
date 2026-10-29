import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Clock, Coffee, Briefcase, Home, FileText, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";
import CurrentWorkCard from "@/components/timeclock/CurrentWorkCard";

const WorkOrder = base44.entities.WorkOrder;

const INHOUSE_TASKS = [
  "Fabrication",
  "CNC",
  "Laser",
  "Paint",
  "Welding",
  "Electrical",
  "Installation",
  "Service",
  "Survey",
  "Design",
  "Permitting",
  "Estimating",
  "Admin",
  "Shop",
  "Travel",
  "Shop Cleaning",
  "Equipment Maintenance",
  "Inventory Management",
  "Training",
  "Administrative Work",
  "Safety Meeting",
  "Tool Organization",
  "Material Prep",
  "Vehicle Maintenance",
  "Other"
];

export default function ClockOutDialog({
  isOpen,
  onClose,
  timeEntry,
  onClockOut,
  breakStatus = "working",
  activeBreak = null,
  breakSummary = { count: 0, total_minutes: 0, paid_minutes: 0, unpaid_minutes: 0 },
  workPauseSummary = { count: 0, total_minutes: 0 },
  onStartBreak,
  onEndBreak,
  activeLabor = null,
  laborSummary = { count: 0, total_minutes: 0 },
  onStartLabor,
  onChangeLabor,
  onStopLabor,
  onLoadLaborAllocationPreview,
  pendingClockOutRecovery = null,
}) {
  const [lunchMinutes, setLunchMinutes] = useState("");
  const [jobAllocations, setJobAllocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [displayNow, setDisplayNow] = useState(() => new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [breakActionBusy, setBreakActionBusy] = useState(false);
  // Preview responses belong to the exact employee shift and open dialog.
  // Do not allow an old asynchronous snapshot to replace a newer shift.
  const shiftKey = timeEntry?.id ? JSON.stringify([
    String(timeEntry.user_email || "").trim().toLowerCase(), String(timeEntry.id),
  ]) : "";
  const previewScope = isOpen ? shiftKey : "";
  const previewScopeRef = useRef(previewScope);
  previewScopeRef.current = previewScope;
  const previewRequestRef = useRef({ scope: "", id: 0, pending: false });
  const submitRequestRef = useRef({ scope: "", id: 0, pending: false });
  // An interrupted Clock Out may already have committed. Retry its original
  // body instead of recomputing server duration or silently changing totals.
  const uncertainClockOutRef = useRef(null);
  const draftShiftRef = useRef("");
  const [previewSnapshot, setPreviewSnapshot] = useState({ scope: "", value: null });
  const laborPreview = previewSnapshot.scope === previewScope ? previewSnapshot.value : null;
  const [laborPreviewBusy, setLaborPreviewBusy] = useState(false);
  const [laborPreviewError, setLaborPreviewError] = useState("");
  const [, setAllocationsReviewed] = useState(false);
  const allocationEditedRef = useRef(false);
  const previewAppliedRef = useRef(false);

  // Display time is refreshed while the dialog is open. The backend still owns
  // the official clock-out timestamp and recalculates the final duration.
  const clockInTime = timeEntry ? new Date(timeEntry.clock_in) : new Date();
  const clockOutTime = displayNow;
  const totalMinutesWorked = Math.floor((clockOutTime - clockInTime) / (1000 * 60));
  const hasServerReconciliation = Boolean(laborPreview) && Number.isFinite(Number(laborPreview?.elapsed_minutes));
  const trackedUnpaidMinutes = Math.max(0, Number(hasServerReconciliation ? laborPreview?.tracked_unpaid_minutes : breakSummary?.unpaid_minutes) || 0);
  const trackedPaidMinutes = Math.max(0, Number(breakSummary?.paid_minutes || 0));
  const trackedBreakMinutes = Math.max(0, Number(breakSummary?.total_minutes || 0));
  const hasTrackedUnpaid = trackedUnpaidMinutes > 0;
  const manualLunchMins = lunchMinutes === "" ? 0 : parseInt(lunchMinutes) || 0;
  const lunchMins = hasTrackedUnpaid ? trackedUnpaidMinutes : manualLunchMins;
  const trackedWorkPauseMinutes = Math.max(0, Number(hasServerReconciliation ? laborPreview?.work_pause_minutes : workPauseSummary?.total_minutes) || 0);
  const reconciliationElapsedMinutes = hasServerReconciliation ? Math.max(0, Number(laborPreview.elapsed_minutes)) : totalMinutesWorked;
  const workableMinutes = reconciliationElapsedMinutes - lunchMins - trackedWorkPauseMinutes;
  const workableHours = Math.max(0, workableMinutes / 60);
  const onBreak = breakStatus === "on_break";
  const activeBreakMinutes = activeBreak?.started_at
    ? Math.max(0, Math.floor((displayNow - new Date(activeBreak.started_at)) / (1000 * 60)))
    : 0;
  
  const lunchEntered = hasTrackedUnpaid || (lunchMinutes !== "" && lunchMinutes !== null);
  const jobsEntered = jobAllocations.length > 0 && jobAllocations.every(j => (j.minutes || 0) > 0);

  // Calculate total allocated minutes
  const totalAllocatedMinutes = jobAllocations.reduce((sum, job) => sum + (parseInt(job.minutes) || 0), 0);
  // workableMinutes already has lunch subtracted, so don't subtract again
  const remainingMinutes = workableMinutes - totalAllocatedMinutes;
  // Preserve the exact employee-reviewed draft across asynchronous server
  // reconciliation. Edits after submission starts must require a new review.
  const draftFingerprint = JSON.stringify([lunchMinutes, jobAllocations, notes]);
  const draftFingerprintRef = useRef(draftFingerprint);
  draftFingerprintRef.current = draftFingerprint;

  useEffect(() => {
    if (!isOpen) return undefined;
    setDisplayNow(new Date());
    const timer = setInterval(() => setDisplayNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const loadLaborPreview = async ({ allowAutoApply = false, invalidateReview = false } = {}) => {
    if (!onLoadLaborAllocationPreview || !previewScope) return null;
    if (previewRequestRef.current.pending && previewRequestRef.current.scope === previewScope) return null;
    const request = {
      scope: previewScope, id: previewRequestRef.current.id + 1, pending: true,
    };
    previewRequestRef.current = request;
    const isCurrent = () => previewScopeRef.current === request.scope &&
      previewRequestRef.current === request;
    setLaborPreviewBusy(true);
    setLaborPreviewError("");
    try {
      const data = await onLoadLaborAllocationPreview();
      if (!isCurrent()) return null;
      const preview = data?.preview || null;
      setPreviewSnapshot({ scope: request.scope, value: preview });
      if (invalidateReview) setAllocationsReviewed(false);
      if (allowAutoApply && preview?.suggested_allocations?.length) {
        setJobAllocations((current) => {
          if (current.length > 0 || allocationEditedRef.current || previewAppliedRef.current) return current;
          previewAppliedRef.current = true;
          return preview.suggested_allocations.map((allocation) => ({ ...allocation }));
        });
      }
      return preview;
    } catch (err) {
      if (isCurrent()) setLaborPreviewError(err?.message || "Tracked Current Work suggestions could not be loaded.");
      return null;
    } finally {
      if (isCurrent()) {
        request.pending = false;
        setLaborPreviewBusy(false);
      }
    }
  };

  useEffect(() => {
    // Invalidate prior shift or prior open-cycle requests without erasing the
    // employee's unsaved draft when merely reopening the same active shift.
    previewRequestRef.current = {
      scope: previewScope, id: previewRequestRef.current.id + 1, pending: false,
    };
    submitRequestRef.current = {
      scope: previewScope, id: submitRequestRef.current.id + 1, pending: false,
    };
    if (uncertainClockOutRef.current?.scope !== previewScope) uncertainClockOutRef.current = null;
    setIsSubmitting(false);
    setLaborPreviewBusy(false);
    setLaborPreviewError("");
    setPreviewSnapshot({ scope: previewScope, value: null });
    if (!previewScope) return undefined;
    if (draftShiftRef.current !== shiftKey) {
      draftShiftRef.current = shiftKey;
      const pendingBody = pendingClockOutRecovery?.entryId === String(timeEntry.id)
        ? pendingClockOutRecovery.body : null;
      setLunchMinutes(pendingBody ? String(pendingBody.lunch_minutes) : "");
      setJobAllocations(pendingBody ? pendingBody.job_allocations.map((row) => ({ ...row })) : []);
      setNotes(pendingBody ? pendingBody.notes : "");
      setSearchTerm("");
      setSearchResults([]);
      setShowSearch(false);
      setError("");
      allocationEditedRef.current = Boolean(pendingClockOutRecovery);
      previewAppliedRef.current = Boolean(pendingClockOutRecovery);
      setAllocationsReviewed(false);
    }
    if (onLoadLaborAllocationPreview) void loadLaborPreview({ allowAutoApply: !pendingClockOutRecovery });
    return () => {
      previewRequestRef.current = {
        scope: "", id: previewRequestRef.current.id + 1, pending: false,
      };
      submitRequestRef.current = {
        scope: "", id: submitRequestRef.current.id + 1, pending: false,
      };
    };
  }, [isOpen, shiftKey]);

  const applyLaborPreview = () => {
    const suggestions = laborPreview?.suggested_allocations || [];
    if (!suggestions.length) return;
    allocationEditedRef.current = true;
    previewAppliedRef.current = true;
    setAllocationsReviewed(false);
    setJobAllocations(suggestions.map((allocation) => ({ ...allocation })));
    setError("");
  };

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchWorkOrders();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const searchWorkOrders = async () => {
    setIsSearching(true);
    try {
      const allWorkOrders = await fetchAllWorkOrders().then((rows) =>
          (rows || [])
            .filter((wo) => wo.completed !== true && wo.deleted !== true)
            .sort((a, b) => (a.created_date || "").localeCompare(b.created_date || "")));
      const search = searchTerm.toLowerCase();
      const filtered = allWorkOrders.filter(wo => {
        const searchable = [wo.title, wo.client_name, wo.description].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(search);
      });
      setSearchResults(filtered.slice(0, 20));
    } catch (err) {
      console.error("Search error:", err);
    }
    setIsSearching(false);
  };

  const addJobAllocation = (workOrder) => {
    if (jobAllocations.find(j => j.work_order_id === workOrder.id)) {
      return; // Already added
    }
    allocationEditedRef.current = true;
    setAllocationsReviewed(false);
    setJobAllocations([...jobAllocations, {
      work_order_id: workOrder.id,
      work_order_title: workOrder.title,
      client_name: workOrder.client_name,
      hours: 0,
      minutes: 0,
      is_inhouse: false,
      inhouse_task: ""
    }]);
    setSearchTerm("");
    setShowSearch(false);
  };

  const addInhouseAllocation = () => {
    allocationEditedRef.current = true;
    setAllocationsReviewed(false);
    setJobAllocations([...jobAllocations, {
      work_order_id: `inhouse_${Date.now()}`,
      work_order_title: "In House Projects",
      client_name: "Internal",
      hours: 0,
      minutes: 0,
      is_inhouse: true,
      inhouse_task: ""
    }]);
  };

  const updateAllocation = (index, field, value) => {
    allocationEditedRef.current = true;
    setAllocationsReviewed(false);
    const updated = [...jobAllocations];
    updated[index][field] = value;
    setJobAllocations(updated);
  };

  const removeAllocation = (index) => {
    allocationEditedRef.current = true;
    setAllocationsReviewed(false);
    setJobAllocations(jobAllocations.filter((_, i) => i !== index));
  };

  const handleStartTrackedBreak = async (breakType, isPaid) => {
    if (!onStartBreak || breakActionBusy) return;
    setError("");
    setBreakActionBusy(true);
    try {
      await onStartBreak({ breakType, isPaid });
      setAllocationsReviewed(false);
    } catch (err) {
      setError(err?.message || "Break start was not confirmed by the server.");
    } finally {
      setBreakActionBusy(false);
    }
  };

  const handleEndTrackedBreak = async () => {
    if (!onEndBreak || breakActionBusy) return;
    setError("");
    setBreakActionBusy(true);
    try {
      await onEndBreak();
      setAllocationsReviewed(false);
    } catch (err) {
      setError(err?.message || "Break end was not confirmed by the server.");
    } finally {
      setBreakActionBusy(false);
    }
  };

  const handleLaborMutation = async (handler, payload) => {
    if (!handler) return null;
    const result = await handler(payload);
    // A stale acknowledgement is intentionally ignored by Quick Clock.
    // Do not fetch labor suggestions for an obsolete employee/shift dialog.
    if (!result) return null;
    setAllocationsReviewed(false);
    await loadLaborPreview({ invalidateReview: true });
    return result;
  };

  const handleClockOut = async () => {
    if (!previewScope || isSubmitting ||
        (submitRequestRef.current.pending && submitRequestRef.current.scope === previewScope)) return;
    setError("");

    if (breakStatus !== "working" || activeBreak?.id) {
      setError("End the active break before clocking out.");
      return;
    }

    if (!hasTrackedUnpaid && (lunchMinutes === "" || lunchMinutes === null)) {
      setError("Please enter your lunch break time");
      return;
    }

    if (!hasTrackedUnpaid && (lunchMins < 0 || lunchMins > 240)) {
      setError("Lunch break must be between 0 and 240 minutes");
      return;
    }

    if (jobAllocations.length === 0) {
      setError("Please add at least one job allocation");
      return;
    }

    for (const job of jobAllocations) {
      if (job.is_inhouse && !job.inhouse_task) {
        setError("Please select a task for all In House Projects");
        return;
      }
      if (!job.minutes || job.minutes <= 0) {
        setError("All job allocations must have minutes greater than 0");
        return;
      }
    }

    const request = {
      scope: previewScope, id: submitRequestRef.current.id + 1, pending: true,
    };
    submitRequestRef.current = request;
    const isCurrent = () => previewScopeRef.current === request.scope &&
      submitRequestRef.current === request;
    const reviewedDraft = draftFingerprint;
    // Supersede a pending auto-preview so it cannot reapply old suggestions
    // while the final authoritative Clock Out reconciliation is running.
    previewRequestRef.current = {
      scope: previewScope, id: previewRequestRef.current.id + 1, pending: false,
    };
    setLaborPreviewBusy(false);
    setIsSubmitting(true);
    try {
      const uncertain = uncertainClockOutRef.current?.scope === request.scope
        ? uncertainClockOutRef.current : null;
      const restoredBody = pendingClockOutRecovery?.entryId === String(timeEntry.id)
        ? pendingClockOutRecovery.body : null;
      if (uncertain || restoredBody) {
        const retryPayload = uncertain?.payload || {
          lunchMinutes: restoredBody.lunch_minutes,
          jobAllocations: restoredBody.job_allocations,
          notes: restoredBody.notes,
        };
        const currentBody = {
          lunchMinutes: restoredBody ? Number(lunchMinutes) : retryPayload.lunchMinutes,
          jobAllocations: jobAllocations.map(({ suggested_from_current_work: _suggested, ...row }) => row),
          notes: notes.trim(),
        };
        if ((uncertain && uncertain.draft !== reviewedDraft) ||
            JSON.stringify(currentBody) !== JSON.stringify(retryPayload)) {
          throw new Error("An earlier Clock Out is unconfirmed. Restore the original allocations, lunch, and notes before retrying the same request. Do not submit revised payroll time until its outcome is verified.");
        }
        await onClockOut(retryPayload);
        if (isCurrent()) uncertainClockOutRef.current = null;
        return;
      }
      if (!onLoadLaborAllocationPreview) {
        throw new Error("Authoritative Clock Out reconciliation is unavailable. Close this dialog and identify again.");
      }

      // Refresh immediately before submit so final reconciliation uses the
      // backend clock, including any still-active Current Work segment. The
      // employee device clock remains display-only and is never authoritative.
      const previewResult = await onLoadLaborAllocationPreview();
      if (!isCurrent()) return;
      if (draftFingerprintRef.current !== reviewedDraft) {
        throw new Error("Clock Out allocations changed during server reconciliation. Review the latest values and submit again.");
      }
      const freshPreview = previewResult?.preview || null;
      const authoritativeElapsedMinutes = Number(freshPreview?.elapsed_minutes);
      if (!freshPreview || !Number.isFinite(authoritativeElapsedMinutes)) {
        throw new Error("Authoritative Clock Out time could not be refreshed. Nothing was submitted.");
      }
      setPreviewSnapshot({ scope: request.scope, value: freshPreview });
      setLaborPreviewError("");

      const authoritativeTrackedUnpaidMinutes = Math.max(0, Number(freshPreview.tracked_unpaid_minutes) || 0);
      const authoritativeWorkPauseMinutes = Math.max(0, Number(freshPreview.work_pause_minutes) || 0);
      const authoritativeLunchMinutes = authoritativeTrackedUnpaidMinutes > 0 ? authoritativeTrackedUnpaidMinutes : manualLunchMins;
      const authoritativeWorkableMinutes = authoritativeElapsedMinutes - authoritativeLunchMinutes - authoritativeWorkPauseMinutes;
      const finalAllocatedMinutes = jobAllocations.reduce((sum, job) => sum + (parseInt(job.minutes) || 0), 0);
      const finalRemainingMinutes = authoritativeWorkableMinutes - finalAllocatedMinutes;

      if (authoritativeWorkableMinutes < 0) {
        throw new Error("Lunch and Work Pause time cannot exceed the authoritative shift duration.");
      }
      if (Math.abs(finalRemainingMinutes) > 5) {
        throw new Error(`All time must be allocated using the refreshed server duration. ${formatDuration(Math.abs(finalRemainingMinutes))}${finalRemainingMinutes < 0 ? " is over-allocated" : " remains"}. Review or refresh tracked suggestions before Clock Out.`);
      }

      const submittedPayload = {
        lunchMinutes: authoritativeLunchMinutes,
        jobAllocations: jobAllocations.map(({ suggested_from_current_work: _suggested, ...allocation }) => allocation),
        notes: notes.trim(),
      };
      try {
        await onClockOut(submittedPayload);
      } catch (err) {
        if (isCurrent() && (err?.retrySameRequest === true || err?.ambiguousOutcome === true)) {
          uncertainClockOutRef.current = {
            scope: request.scope, draft: reviewedDraft, payload: submittedPayload,
          };
        }
        throw err;
      }
    } catch (err) {
      if (isCurrent()) setError(err?.message || "Clock-out was not confirmed by the server. Nothing was shown as successful.");
    } finally {
      if (isCurrent()) {
        request.pending = false;
        setIsSubmitting(false);
      }
    }
  };

  const formatTime = (date) => format(date, "h:mm a");
  const formatDuration = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            Clock Out
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Time Summary */}
          <div className="clay-card p-4 bg-blue-50">
            <h3 className="font-semibold mb-3">Time Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">Clock In</p>
                <p className="text-lg font-bold text-green-600">{formatTime(clockInTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Clock Out</p>
                <p className="text-lg font-bold text-red-600">{formatTime(clockOutTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Time</p>
                <p className="text-lg font-bold text-blue-600">{formatDuration(totalMinutesWorked)}</p>
              </div>
            </div>
          </div>

          <CurrentWorkCard
            activeLabor={activeLabor}
            laborSummary={laborSummary}
            disabled={onBreak || breakActionBusy || isSubmitting}
            disabledReason={onBreak ? "End the current break before changing Current Work." : ""}
            onStart={(payload) => handleLaborMutation(onStartLabor, payload)}
            onChange={(payload) => handleLaborMutation(onChangeLabor, payload)}
            onStop={() => handleLaborMutation(onStopLabor)}
          />

          {/* Break / Lunch Tracking */}
          <div className={`clay-card p-4 ${onBreak ? 'border-2 border-amber-400 bg-amber-50' : !lunchEntered ? 'border-2 border-red-400' : ''}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-600" />
                <Label className="font-semibold">Break & Lunch</Label>
              </div>
              {onBreak && <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">On Break</span>}
            </div>

            {onBreak ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-white/80 p-3">
                  <p className="font-medium text-amber-900">
                    {activeBreak?.is_paid ? "Paid Break" : activeBreak?.break_type === "lunch" ? "Unpaid Lunch" : "Unpaid Break"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {activeBreak?.started_at && <span>Started {formatTime(new Date(activeBreak.started_at))}</span>}
                    <span>{formatDuration(activeBreakMinutes)} elapsed</span>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleEndTrackedBreak}
                  disabled={breakActionBusy || isSubmitting}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                >
                  {breakActionBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  End Break
                </Button>
                <p className="text-xs text-amber-800">Clock Out is disabled until this break is ended and confirmed by the server.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStartTrackedBreak("lunch", false)}
                  disabled={breakActionBusy || isSubmitting}
                  className="border-amber-300 hover:bg-amber-50"
                >
                  {breakActionBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coffee className="w-4 h-4 mr-2" />}
                  Start Unpaid Lunch
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStartTrackedBreak("break", true)}
                  disabled={breakActionBusy || isSubmitting}
                  className="border-blue-300 hover:bg-blue-50"
                >
                  Start Paid Break
                </Button>
              </div>
            )}

            {trackedBreakMinutes > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center">
                <div><p className="text-xs text-gray-500">Tracked</p><p className="font-semibold">{trackedBreakMinutes} min</p></div>
                <div><p className="text-xs text-gray-500">Paid</p><p className="font-semibold text-blue-700">{trackedPaidMinutes} min</p></div>
                <div><p className="text-xs text-gray-500">Unpaid</p><p className="font-semibold text-amber-700">{trackedUnpaidMinutes} min</p></div>
              </div>
            )}

            {hasTrackedUnpaid ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-900">Unpaid time is server-tracked: {trackedUnpaidMinutes} minutes</p>
                <p className="mt-1 text-xs text-green-800">This authoritative value replaces the manual lunch entry for this shift.</p>
              </div>
            ) : (
              <div>
                <Label className={`font-semibold ${!lunchEntered ? 'text-red-600' : ''}`}>
                  Manual Unpaid Lunch (minutes) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="240"
                  value={lunchMinutes}
                  onChange={(e) => {
                    setLunchMinutes(e.target.value);
                    setAllocationsReviewed(false);
                  }}
                  placeholder="Enter 0 if none"
                  disabled={breakActionBusy || onBreak}
                  className={`mt-2 w-36 ${!lunchEntered ? 'border-red-400 text-red-600 placeholder:text-red-400' : ''}`}
                />
                <p className="text-xs text-gray-500 mt-2">Use this fallback only when unpaid lunch was not tracked with Start Unpaid Lunch.</p>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Workable hours after unpaid time: <span className="font-bold text-blue-600">{lunchEntered ? workableHours.toFixed(2) : '--'} hrs</span>. Paid breaks do not reduce worked hours.
            </p>
          </div>

          {/* Job Allocations */}
          <div className={`clay-card p-4 ${!jobsEntered ? 'border-2 border-red-400' : ''}`}>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-600" />
                <Label className={`font-semibold ${!jobsEntered ? 'text-red-600' : ''}`}>
                  Job Time Allocations <span className="text-red-500">*</span>
                </Label>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addInhouseAllocation}
                  className="h-8 gap-1"
                >
                  <Home className="w-3 h-3" />
                  In House
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowSearch(true)}
                  className="h-8 gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Job
                </Button>
              </div>
            </div>

            {onLoadLaborAllocationPreview && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Tracked Current Work suggestions</p>
                    {laborPreview?.tracked_minutes > 0 ? (
                      <p className="text-xs text-blue-800 mt-1">
                        Server snapshot covers {formatDuration(laborPreview.tracked_minutes)} across {laborPreview.segment_count || 0} tracked segment{laborPreview.segment_count === 1 ? "" : "s"}. Review and reconcile any untracked time before Clock Out.
                      </p>
                    ) : (
                      <p className="text-xs text-blue-800 mt-1">No completed Current Work time is available to suggest yet. Manual allocations remain available.</p>
                    )}
                    {laborPreview?.generated_at && (
                      <p className="text-[11px] text-blue-600 mt-1">Snapshot {format(new Date(laborPreview.generated_at), "h:mm:ss a")}. Active work continues after this snapshot until stopped, changed, paused, broken, or clocked out.</p>
                    )}
                    {laborPreviewError && <p className="text-xs text-red-700 mt-1">{laborPreviewError}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    <Button type="button" size="sm" variant="outline" onClick={() => loadLaborPreview({ invalidateReview: true })} disabled={laborPreviewBusy || isSubmitting}>
                      {laborPreviewBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                      Refresh
                    </Button>
                    <Button type="button" size="sm" onClick={applyLaborPreview} disabled={laborPreviewBusy || isSubmitting || !laborPreview?.suggested_allocations?.length} className="bg-blue-600 hover:bg-blue-700">
                      Apply Tracked Suggestions
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Panel */}
            {showSearch && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search by client or project name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {searchTerm.length >= 2 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {isSearching ? (
                      <p className="text-sm text-gray-500 text-center py-2">Searching...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-2">No results found</p>
                    ) : (
                      searchResults.map(wo => (
                        <div
                          key={wo.id}
                          onClick={() => addJobAllocation(wo)}
                          className="p-2 bg-white rounded cursor-pointer hover:bg-blue-50 border"
                        >
                          <p className="font-medium text-sm">{wo.client_name}</p>
                          <p className="text-xs text-gray-500">{wo.title}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {setShowSearch(false); setSearchTerm("");}}
                  className="mt-2"
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Allocations List */}
            <div className="space-y-3">
              {jobAllocations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No jobs added. Click "Add Job" to allocate time.
                </p>
              ) : (
                jobAllocations.map((job, index) => (
                  <div key={index} className="p-3 bg-white rounded-lg border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {job.is_inhouse ? (
                            <span className="flex items-center gap-1">
                              <Home className="w-3 h-3 text-amber-600" />
                              In House Projects
                            </span>
                          ) : (
                            job.client_name
                          )}
                        </p>
                        {!job.is_inhouse && (
                          <p className="text-xs text-gray-500">{job.work_order_title}</p>
                        )}
                        {job.suggested_from_current_work && (
                          <p className="text-[11px] text-blue-600 mt-1">Suggested from authoritative Current Work tracking — editable before Clock Out</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAllocation(index)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>

                    {job.is_inhouse && (
                      <div className="mt-2">
                        <Select
                          value={job.inhouse_task}
                          onValueChange={(val) => updateAllocation(index, "inhouse_task", val)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select task..." />
                          </SelectTrigger>
                          <SelectContent>
                            {INHOUSE_TASKS.map(task => (
                              <SelectItem key={task} value={task}>{task}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Label className={`text-xs ${!job.minutes || job.minutes <= 0 ? 'text-red-600' : ''}`}>Time:</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          value={job.minutes ? Math.floor(job.minutes / 60) : ""}
                          onChange={(e) => {
                            allocationEditedRef.current = true;
                            setAllocationsReviewed(false);
                            const hrs = parseInt(e.target.value) || 0;
                            const currentMins = job.minutes ? job.minutes % 60 : 0;
                            let totalMins = hrs * 60 + currentMins;
                            const otherAllocations = jobAllocations.reduce((sum, j, i) => i !== index ? sum + (parseInt(j.minutes) || 0) : sum, 0);
                            // workableMinutes already has lunch subtracted
                            const maxAllowed = Math.max(0, workableMinutes - otherAllocations);
                            if (totalMins > maxAllowed) totalMins = maxAllowed;
                            const updated = [...jobAllocations];
                            updated[index] = { ...updated[index], minutes: totalMins, hours: totalMins / 60 };
                            setJobAllocations(updated);
                          }}
                          placeholder="0"
                          className={`w-16 h-8 text-center ${!job.minutes || job.minutes <= 0 ? 'border-red-400 text-red-600' : ''}`}
                        />
                        <span className="text-xs text-gray-500">hrs</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          step="5"
                          value={job.minutes ? job.minutes % 60 : ""}
                          onChange={(e) => {
                            allocationEditedRef.current = true;
                            setAllocationsReviewed(false);
                            const mins = Math.min(59, parseInt(e.target.value) || 0);
                            const currentHrs = job.minutes ? Math.floor(job.minutes / 60) : 0;
                            let totalMins = currentHrs * 60 + mins;
                            const otherAllocations = jobAllocations.reduce((sum, j, i) => i !== index ? sum + (parseInt(j.minutes) || 0) : sum, 0);
                            // workableMinutes already has lunch subtracted
                            const maxAllowed = Math.max(0, workableMinutes - otherAllocations);
                            if (totalMins > maxAllowed) totalMins = maxAllowed;
                            const updated = [...jobAllocations];
                            updated[index] = { ...updated[index], minutes: totalMins, hours: totalMins / 60 };
                            setJobAllocations(updated);
                          }}
                          placeholder="0"
                          className={`w-16 h-8 text-center ${!job.minutes || job.minutes <= 0 ? 'border-red-400 text-red-600' : ''}`}
                        />
                        <span className="text-xs text-gray-500">min</span>
                      </div>
                      <span className="text-xs text-gray-400 ml-2">({((job.minutes || 0) / 60).toFixed(2)} hrs total)</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Allocation Summary */}
            {jobAllocations.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span>Allocatable Work Time (after unpaid time & Work Pause):</span>
                  <span className="font-bold">{formatDuration(workableMinutes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Allocated:</span>
                  <span className={`font-bold ${Math.abs(remainingMinutes) <= 5 ? 'text-green-600' : 'text-orange-600'}`}>
                    {formatDuration(totalAllocatedMinutes)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Remaining:</span>
                  <span className={`font-bold ${remainingMinutes < 0 ? 'text-red-600' : remainingMinutes > 5 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatDuration(Math.abs(remainingMinutes))}{remainingMinutes < 0 ? ' over' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes for Admin */}
          <div className="clay-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <Label className="font-semibold">Notes for Admin (Optional)</Label>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500">Leaving early?</span>
              {["Appointment", "Site call", "Sick", "Family", "Slow day"].map((r) => (
                <button
                  key={r} type="button"
                  onClick={() => setNotes((prev) => (prev.includes(`Early out: ${r}`) ? prev : `${prev.trim() ? prev.trim() + " " : ""}Early out: ${r}.`))}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700"
                >{r}</button>
              ))}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about your work day that you'd like admin to see..."
              rows={3}
              className="resize-none"
            />
          </div>

          {pendingClockOutRecovery?.entryId === String(timeEntry?.id) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              An earlier Clock Out has not been confirmed. Your original allocations are restored for an exact retry. Confirm your identity and retry the original request; do not revise payroll time until its outcome is verified.
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting || breakActionBusy} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleClockOut} disabled={isSubmitting || breakActionBusy || onBreak} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
              {isSubmitting ? "Confirming..." : onBreak ? "End Break First" : pendingClockOutRecovery?.entryId === String(timeEntry?.id) ? "Retry Original Clock Out" : "Clock Out"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}