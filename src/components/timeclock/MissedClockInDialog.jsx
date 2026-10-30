import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  TIME_CLOCK_COMPANY_TIME_ZONE,
} from "@/components/timeclock/timeClockCompanyTime";

const MAX_MINUTES_AGO = 12 * 60;
const STEP_MINUTES = 5;
const QUICK_CHOICES = [
  { label: "Just now", minutes: 0 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hr", minutes: 120 },
  { label: "4 hr", minutes: 240 },
  { label: "6 hr", minutes: 360 },
];

const companyClockTime = (date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

const companyDayKey = (date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);

const agoLabel = (minutes) => {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr ago` : `${hours} hr ${rest} min ago`;
};

export default function MissedClockInDialog({
  open,
  userName,
  busy = false,
  error = "",
  onReport,
  onCancel,
}) {
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setMinutesAgo(0);
      setLocalError("");
    }
  }, [open]);

  const arrival = useMemo(
    () => new Date(Date.now() - minutesAgo * 60 * 1000),
    [minutesAgo],
  );
  const arrivalIso = arrival.toISOString();
  const arrivalLabel = companyClockTime(arrival);
  const isToday = companyDayKey(arrival) === companyDayKey(new Date());
  const sliderFill = `${(minutesAgo / MAX_MINUTES_AGO) * 100}%`;

  const chooseMinutes = (minutes) => {
    setMinutesAgo(minutes);
    setLocalError("");
  };

  const submit = async () => {
    setLocalError("");
    try {
      await onReport(arrivalIso);
    } catch (err) {
      setLocalError(err?.message || "The missed Clock In was not confirmed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel?.(); }}>
      <DialogContent className="max-w-md overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 via-white to-white p-0 shadow-2xl dark:border-amber-800 dark:from-amber-950/40 dark:via-slate-950 dark:to-slate-950">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500" />
        <div className="p-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-lg shadow-amber-500/30">
                <Clock3 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Forgot to Clock In{userName ? `, ${userName}` : ""}?
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  Tell us when you actually arrived and we will start your shift from then.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 text-center shadow-sm dark:border-amber-800/60 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                You arrived {isToday ? "today" : "yesterday"} at
              </p>
              <p key={arrivalIso} className="mci-time-pop mt-1 text-4xl font-black tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                {arrivalLabel}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                {agoLabel(minutesAgo)} · {TIME_CLOCK_COMPANY_TIME_LABEL}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {QUICK_CHOICES.map((choice) => {
                const selected = minutesAgo === choice.minutes;
                return (
                  <button type="button"
                    key={choice.minutes}
                    type="button"
                    disabled={busy}
                    onClick={() => chooseMinutes(choice.minutes)}
                    className={`rounded-full px-2 py-1.5 text-xs font-semibold transition-[transform,background-color,color,box-shadow] duration-150 motion-safe:active:scale-95 disabled:opacity-50 ${
                      selected
                        ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                        : "bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-950 dark:hover:text-amber-200"
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Just now</span>
                <span>12 hr ago</span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_MINUTES_AGO}
                step={STEP_MINUTES}
                value={minutesAgo}
                disabled={busy}
                onChange={(event) => chooseMinutes(Number(event.target.value))}
                className="mci-slider mt-2 w-full disabled:opacity-50"
                style={{ "--mci-fill": sliderFill }}
                aria-label="How many minutes ago you arrived"
              />
            </div>

            <Button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/30 transition-[box-shadow,transform] duration-200 hover:from-amber-600 hover:to-orange-600 hover:shadow-xl motion-safe:active:scale-[0.98]"
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
              Start my shift from {arrivalLabel}
            </Button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              You can report an arrival up to 12 hours ago in {TIME_CLOCK_COMPANY_TIME_LABEL} company time.
              A self-reported Clock In is kept in a full audit record and flagged so a manager can review
              the shift; it is never treated as silently approved time.
            </div>

            {(localError || error) && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                {localError || error}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
              className="w-full rounded-xl border-slate-300 bg-white py-4 font-semibold text-slate-600 shadow-sm transition-[background-color,color,transform] duration-150 hover:bg-slate-50 hover:text-slate-800 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Never mind - back to Clock In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
