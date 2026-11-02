import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatCompanyDateTime,
  formatMinutes,
} from "@/components/timeclock/timeClockCompanyTime";

// Shown after a clock-out (or status restore) when several completed shifts
// all fit inside one 12-hour window. "Same work day" groups them for Time
// Tracker day totals; "Separate" leaves each on its own day. The decision is
// the employee's - the server only records it.
export default function WorkDayGroupDialog({
  open,
  prompt, // { signature, anchor_date, span_minutes, entries: [{id,clock_in,clock_out,total_hours}] }
  userName,
  busy = false,
  error = "",
  onSameDay,
  onSeparate,
  onLater,
}) {
  const [localError, setLocalError] = useState("");
  const shownError = localError || error;
  const entries = Array.isArray(prompt?.entries) ? prompt.entries : [];

  const act = async (fn) => {
    setLocalError("");
    try {
      await fn();
    } catch (err) {
      setLocalError(err?.message || "The answer could not be saved.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* answered explicitly - no idle dismiss */ }}>
      <DialogContent className="clay-card border-none max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Same work day{userName ? ` - ${userName}` : ""}?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            These shifts all fall inside one {prompt?.span_minutes ? formatMinutes(prompt.span_minutes) : "12-hour"} window. If they were really one work day with breaks in between, say so - your tracker will count all of them toward that day.
          </p>
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">
                  {formatCompanyDateTime(entry.clock_in)} <span className="text-slate-400">-&gt;</span> {formatCompanyDateTime(entry.clock_out)}
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-600">
                  {Number.isFinite(Number(entry.total_hours)) ? `${Number(entry.total_hours).toFixed(2)}h` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            This never changes your punches - it only tells the tracker whether to add all of these periods to the same day.
          </div>
          {shownError && <p className="text-sm text-red-600">{shownError}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => act(onSeparate)} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "No, separate days"}
            </Button>
            <Button type="button" onClick={() => act(onSameDay)} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, one work day"}
            </Button>
          </div>
          {typeof onLater === "function" && (
            <button type="button" onClick={onLater} disabled={busy} className="mx-auto block text-xs text-slate-500 underline-offset-2 hover:underline disabled:opacity-50">
              Ask me later
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
