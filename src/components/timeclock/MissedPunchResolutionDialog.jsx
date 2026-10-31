import { useEffect, useState } from "react";
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
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  formatCompanyDateTime,
  parseCompanyDateTimeInput,
} from "@/components/timeclock/timeClockCompanyTime";

// Kiosk-friendly missed-clock-out picker: most "forgot to clock out" claims
// are "yesterday at shift end". Day chips + big time buttons cover that in two
// taps; the native datetime input stays behind a toggle for odd cases.
const SHIFT_END_TIMES = ["15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];
function TimeQuickPick({ value, onChange, disabled, clockIn }) {
  const [dayOffset, setDayOffset] = useState(1); // 1 = yesterday
  const [showCustom, setShowCustom] = useState(false);
  const clockInDate = clockIn ? new Date(clockIn) : null;
  const clockInDay = clockInDate && !isNaN(clockInDate) ? Math.floor((Date.now() - clockInDate.getTime()) / 86400000) : null;
  const maxDay = clockInDay != null ? Math.min(7, clockInDay) : 7;

  const emit = (offset, time) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`);
  };

  const chips = [];
  for (let d = 1; d <= Math.max(1, maxDay); d += 1) chips.push(d);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((d) => (
          <button key={d} type="button" disabled={disabled} onClick={() => { setDayOffset(d); setShowCustom(false); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${dayOffset === d && !showCustom ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-amber-400"}`}>
            {d === 1 ? "Yesterday" : d === 2 ? "2 days ago" : `${d} days ago`}
          </button>
        ))}
      </div>
      {!showCustom && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {SHIFT_END_TIMES.map((t) => {
            const [h, m] = t.split(":").map(Number);
            const hr12 = h > 12 ? h - 12 : h;
            return (
              <button key={t} type="button" disabled={disabled} onClick={() => emit(dayOffset, t)}
                className="rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:border-amber-500 hover:bg-amber-50 disabled:opacity-50">
                {hr12}:{String(m).padStart(2, "0")} PM
              </button>
            );
          })}
          <button type="button" disabled={disabled} onClick={() => setShowCustom(true)}
            className="rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-amber-400">
            Other time…
          </button>
        </div>
      )}
      {showCustom && (
        <Input
          id="missed-clock-out-time"
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mt-2 bg-white dark:bg-slate-900"
        />
      )}
      {value && !showCustom && (
        <p className="mt-1.5 text-xs font-medium text-amber-800">
          Stopping at {new Date(value.replace("T", " ")).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

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
    const parsed = parseCompanyDateTimeInput(claimedClockOut);
    if (!parsed.ok) {
      setLocalError(parsed.error || `Enter the date and time you actually stopped working in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    try {
      await onMissedClockOut(parsed.iso);
    } catch (err) {
      setLocalError(err?.message || "The missed clock-out was not confirmed.");
    }
  };

  const validClockIn = entry?.clock_in && formatCompanyDateTime(entry.clock_in) !== "Invalid time";

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
              Clocked in {validClockIn ? `${formatCompanyDateTime(entry.clock_in)} (${TIME_CLOCK_COMPANY_TIME_LABEL})` : "at an unavailable time"}.
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
              I forgot to Clock Out — when did you actually stop working? ({TIME_CLOCK_COMPANY_TIME_LABEL})
            </Label>
            <TimeQuickPick
              value={claimedClockOut}
              onChange={(v) => { setClaimedClockOut(v); setLocalError(""); }}
              disabled={busy || resolution?.self_service_blocked}
              clockIn={entry?.clock_in}
            />
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Enter the actual shop/company time in {TIME_CLOCK_COMPANY_TIME_LABEL}. This closes the old shift operationally, creates a manager-review correction for the time you enter, and then lets you Clock In now using server time.
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
