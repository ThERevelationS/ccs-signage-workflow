import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Clock3, Loader2, ShieldCheck } from "lucide-react";
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

export default function MissedPunchResolutionDialog({
  open,
  entry,
  userName,
  resolution,
  busy = false,
  error = "",
  onMissedClockOut,
  onWorkedThrough,
}) {
  const [claimedClockOut, setClaimedClockOut] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setClaimedClockOut("");
      setLocalError("");
    }
  }, [open, entry?.id]);

  const submitMissedClockOut = async () => {
    setLocalError("");
    const parsed = new Date(claimedClockOut);
    if (!claimedClockOut || !Number.isFinite(parsed.getTime())) {
      setLocalError("Enter the date and time you actually stopped working.");
      return;
    }
    try {
      await onMissedClockOut(parsed.toISOString());
    } catch (err) {
      setLocalError(err?.message || "The missed clock-out was not confirmed.");
    }
  };

  const clockIn = entry?.clock_in ? new Date(entry.clock_in) : null;
  const validClockIn = clockIn && Number.isFinite(clockIn.getTime());

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-xl border-2 border-amber-300 bg-white shadow-2xl dark:border-amber-700 dark:bg-slate-950"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl">Previous shift is still open</DialogTitle>
              <DialogDescription className="mt-1">
                Before starting a new shift, tell us what happened so none of your worked time is silently lost.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Clock3 className="h-4 w-4" />
              {userName || "Employee"}
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Clocked in {validClockIn ? format(clockIn, "EEEE, MMM d 'at' h:mm a") : "at an unavailable time"}.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This window does not invent a clock-out time. Your response is recorded with a server timestamp and audit history.
            </p>
          </div>

          {resolution?.self_service_blocked && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              <div className="font-semibold">Missed Clock Out needs manager help</div>
              <div className="mt-1 text-xs">{resolution.self_service_blocked_reason}</div>
              <div className="mt-2 text-xs">If you are actually still working this same continuous shift, you can still confirm that below.</div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <Label htmlFor="missed-clock-out-time" className="font-semibold text-slate-900 dark:text-slate-100">
              I forgot to Clock Out — when did you actually stop working?
            </Label>
            <Input
              id="missed-clock-out-time"
              type="datetime-local"
              value={claimedClockOut}
              onChange={(event) => {
                setClaimedClockOut(event.target.value);
                setLocalError("");
              }}
              disabled={busy || resolution?.self_service_blocked}
              className="mt-3 bg-white dark:bg-slate-900"
            />
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              This closes the old shift operationally, creates a manager-review correction for the time you enter, and then lets you Clock In now using server time.
            </p>
            <Button
              type="button"
              onClick={submitMissedClockOut}
              disabled={busy || !claimedClockOut || resolution?.self_service_blocked}
              className="mt-3 w-full bg-amber-600 text-white hover:bg-amber-700"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Save missed Clock Out & Clock In now
            </Button>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="font-semibold text-emerald-900 dark:text-emerald-100">No — I actually worked this whole time</div>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
              Keep the original shift continuously open. No clock-out or replacement shift will be created.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onWorkedThrough}
              disabled={busy}
              className="mt-3 w-full border-emerald-400 bg-white text-emerald-800 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-200"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Keep my existing shift open
            </Button>
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
