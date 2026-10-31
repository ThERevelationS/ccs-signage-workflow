import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Clock3, History, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  formatCompanyDateTime,
  parseCompanyDateTimeInput,
} from "@/components/timeclock/timeClockCompanyTime";
import TimeQuickPick, { WORKDAY_TIMES } from "@/components/timeclock/TimeQuickPick";

export default function WorkPauseMenu({
  open,
  onClose,
  userName,
  paused = false,
  pausedSince = "",
  totalPausedMinutes = 0,
  canReportMissed = false,
  toggleDisabled = false,
  toggleBusy = false,
  toggleError = "",
  reportBusy = false,
  reportError = "",
  reportedMinutes = 0,
  onToggle,
  onReportMissed,
}) {
  const [showMissed, setShowMissed] = useState(false);
  const [startedInput, setStartedInput] = useState("");
  const [resumedInput, setResumedInput] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open) {
      setShowMissed(false);
      setStartedInput("");
      setResumedInput("");
      setNote("");
      setLocalError("");
      setConfirmText("");
    }
  }, [open]);

  useEffect(() => {
    if (reportedMinutes > 0) {
      setConfirmText(`Missed Work Pause saved: ${reportedMinutes} minute${reportedMinutes === 1 ? "" : "s"} recorded for this shift.`);
    }
  }, [reportedMinutes]);

  const submitMissed = async () => {
    setLocalError("");
    setConfirmText("");
    const started = parseCompanyDateTimeInput(startedInput);
    if (!started.ok) {
      setLocalError(started.error || `Enter a valid pause start in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    const resumed = parseCompanyDateTimeInput(resumedInput);
    if (!resumed.ok) {
      setLocalError(resumed.error || `Enter a valid pause end in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    try {
      await onReportMissed({ started_at: started.iso, resumed_at: resumed.iso, note: note.trim() });
      setStartedInput("");
      setResumedInput("");
      setNote("");
    } catch (err) {
      setLocalError(err?.message || "The missed Work Pause was not saved.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="max-w-xl border-2 border-purple-300 bg-white shadow-2xl dark:border-violet-800 dark:bg-slate-950">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-2xl bg-purple-100 p-3 text-purple-700 dark:bg-violet-950 dark:text-violet-300">
              <Pause className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl">Work Pause</DialogTitle>
              <DialogDescription className="mt-1">
                Pauses counted work time without clocking out for {userName || "you"}. Separate from break and lunch.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className={`rounded-xl border p-4 ${paused ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`font-semibold ${paused ? "text-emerald-900 dark:text-emerald-100" : "text-slate-800 dark:text-slate-100"}`}>
                  {paused ? "Work is paused" : "You are working"}
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {paused && pausedSince ? `Paused since ${formatCompanyDateTime(pausedSince)}. ` : ""}
                  Paused earlier this shift: <span className="font-semibold">{Math.max(0, Number(totalPausedMinutes) || 0)} min</span>
                </div>
              </div>
              <Button
                type="button"
                onClick={onToggle}
                disabled={toggleDisabled || toggleBusy}
                className={paused ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-purple-600 text-white hover:bg-purple-700"}
              >
                {toggleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                {paused ? "Resume Work" : "Pause Work"}
              </Button>
            </div>
            {toggleError && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{toggleError}</p>}
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50/50 dark:border-violet-800 dark:bg-violet-950/20">
            <button
              type="button"
              onClick={() => { setShowMissed((v) => !v); setLocalError(""); }}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 font-semibold text-purple-900 dark:text-violet-100">
                <History className="h-4 w-4" />
                Add a missed Work Pause
              </span>
              {showMissed ? <ChevronUp className="h-4 w-4 text-purple-500" /> : <ChevronDown className="h-4 w-4 text-purple-500" />}
            </button>

            {showMissed && (
              <div className="space-y-3 border-t border-purple-200/60 px-4 pb-4 pt-3 dark:border-violet-800/60">
                {!canReportMissed && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Missed pauses can only be added while you are clocked in, working (not on break or paused), and Work Pause is enabled for you.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="missed-pause-start" className="text-xs font-semibold text-purple-900 dark:text-violet-100">
                      Pause started ({TIME_CLOCK_COMPANY_TIME_LABEL})
                    </Label>
                    <TimeQuickPick
                      value={startedInput}
                      onChange={(v) => { setStartedInput(v); setLocalError(""); }}
                      disabled={reportBusy || !canReportMissed}
                      dayOffsets={[0, 1]}
                      times={WORKDAY_TIMES}
                      confirmLabel="Paused at"
                      inputId="missed-pause-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="missed-pause-end" className="text-xs font-semibold text-purple-900 dark:text-violet-100">
                      Pause ended ({TIME_CLOCK_COMPANY_TIME_LABEL})
                    </Label>
                    <TimeQuickPick
                      value={resumedInput}
                      onChange={(v) => { setResumedInput(v); setLocalError(""); }}
                      disabled={reportBusy || !canReportMissed}
                      dayOffsets={[0, 1]}
                      times={WORKDAY_TIMES}
                      confirmLabel="Resumed at"
                      inputId="missed-pause-end"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="missed-pause-note" className="text-xs font-semibold text-purple-900 dark:text-violet-100">
                    Note (optional)
                  </Label>
                  <Input
                    id="missed-pause-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={reportBusy || !canReportMissed}
                    placeholder="e.g. Stepped away for a delivery"
                    className="mt-1 bg-white dark:bg-slate-900"
                  />
                </div>
                <Button
                  type="button"
                  onClick={submitMissed}
                  disabled={reportBusy || !canReportMissed || !startedInput || !resumedInput}
                  className="w-full bg-purple-600 text-white hover:bg-purple-700"
                >
                  {reportBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
                  Save missed Work Pause
                </Button>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The pause must start after Clock In, end before now, and stay on the same company day. It counts as paused work time right away and is written to the audit trail.
                </p>
              </div>
            )}
          </div>

          {confirmText && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              {confirmText}
            </div>
          )}
          {(localError || reportError) && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {localError || reportError}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

