import { useEffect, useState } from "react";
import { Clock3, Loader2, ShieldCheck } from "lucide-react";
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
  parseCompanyDateTimeInput,
} from "@/components/timeclock/timeClockCompanyTime";

export default function MissedClockInDialog({
  open,
  userName,
  busy = false,
  error = "",
  onReport,
  onCancel,
}) {
  const [claimedClockIn, setClaimedClockIn] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setClaimedClockIn("");
      setLocalError("");
    }
  }, [open]);

  const submit = async () => {
    setLocalError("");
    const parsed = parseCompanyDateTimeInput(claimedClockIn);
    if (!parsed.ok) {
      setLocalError(parsed.error || `Enter the time you actually arrived in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    try {
      await onReport(parsed.iso);
    } catch (err) {
      setLocalError(err?.message || "The missed Clock In was not confirmed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel?.(); }}>
      <DialogContent className="max-w-xl border-2 border-amber-300 bg-white shadow-2xl dark:border-amber-800 dark:bg-slate-950">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Clock3 className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl">Forgot to Clock In, {userName || "there"}?</DialogTitle>
              <DialogDescription className="mt-1">
                Enter the time you actually arrived today and we will start your shift from then.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <Label htmlFor="missed-clock-in-arrival" className="block text-sm font-semibold text-amber-950 dark:text-amber-100">
              What time did you actually arrive today? ({TIME_CLOCK_COMPANY_TIME_LABEL})
            </Label>
            <Input
              id="missed-clock-in-arrival"
              type="datetime-local"
              value={claimedClockIn}
              onChange={(event) => {
                setClaimedClockIn(event.target.value);
                setLocalError("");
              }}
              disabled={busy}
              className="mt-2 bg-white dark:bg-slate-900"
            />
            <Button
              type="button"
              onClick={submit}
              disabled={busy || !claimedClockIn}
              className="mt-3 w-full bg-amber-600 text-white hover:bg-amber-700"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Start my shift from that time
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Only today's arrival can be reported here, in {TIME_CLOCK_COMPANY_TIME_LABEL} company time - not a future or earlier-day time.
            A self-reported Clock In is kept in a full audit record and flagged so a manager can review the shift; it is never treated as
            silently approved time.
          </div>

          {(localError || error) && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {localError || error}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="w-full text-slate-500 hover:text-slate-700"
          >
            Never mind - back to Clock In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

