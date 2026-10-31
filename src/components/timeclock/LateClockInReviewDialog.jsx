import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  parseCompanyDateTimeInput,
} from "@/components/timeclock/timeClockCompanyTime";
import TimeQuickPick, { SHIFT_START_TIMES } from "@/components/timeclock/TimeQuickPick";

export default function LateClockInReviewDialog({
  open,
  userName,
  review,
  busy = false,
  error = "",
  onRecoverMissedClockIn,
  onClockInNow,
}) {
  const [claimedClockIn, setClaimedClockIn] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setClaimedClockIn("");
      setLocalError("");
    }
  }, [open, review?.detected_at]);

  const submitRecovery = async () => {
    setLocalError("");
    const parsed = parseCompanyDateTimeInput(claimedClockIn);
    if (!parsed.ok) {
      setLocalError(parsed.error || `Enter the date and time you actually arrived in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    try {
      await onRecoverMissedClockIn(parsed.iso);
    } catch (err) {
      setLocalError(err?.message || "The missed Clock In was not confirmed.");
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-xl border-2 border-blue-300 bg-white shadow-2xl dark:border-blue-800 dark:bg-slate-950"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Clock3 className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl">Before you Clock Out...</DialogTitle>
              <DialogDescription className="mt-1">
                It is after 3:00 PM and the Time Clock shows no active shift for {userName || "you"}.
                Did you work earlier today and forget to Clock In?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              Yes ??? I forgot to Clock In
            </div>
            <Label htmlFor="missed-clock-in-time" className="mt-3 block text-sm text-slate-800 dark:text-slate-100">
              What time did you actually arrive today? ({TIME_CLOCK_COMPANY_TIME_LABEL})
            </Label>
            <TimeQuickPick
              value={claimedClockIn}
              onChange={(v) => {
                setClaimedClockIn(v);
                setLocalError("");
              }}
              disabled={busy}
              dayOffsets={[0]}
              times={SHIFT_START_TIMES}
              confirmLabel="Arrived at"
              inputId="missed-clock-in-time"
            />
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Enter the actual shop/company arrival time in {TIME_CLOCK_COMPANY_TIME_LABEL}. We will reconstruct the missing start from your answer, mark the shift Needs Review, keep a full audit record,
              and take you directly to the normal Clock Out screen so you can reconcile lunch and job time.
            </p>
            <Button
              type="button"
              onClick={submitRecovery}
              disabled={busy || !claimedClockIn}
              className="mt-3 w-full bg-amber-600 text-white hover:bg-amber-700"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Restore my Clock In & Continue to Clock Out
            </Button>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="font-semibold text-emerald-900 dark:text-emerald-100">No ??? I am actually starting work now</div>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
              Use the current server time as a normal Clock In. No earlier time will be added.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onClockInNow}
              disabled={busy}
              className="mt-3 w-full border-emerald-400 bg-white text-emerald-800 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-200"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              Clock In now
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            The 3:00 PM check is based on company/server time, not the device clock. A reconstructed Clock In is never silently treated as manager-approved time.
          </div>

          {(localError || error) && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {localError || error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

