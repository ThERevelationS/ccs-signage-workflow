import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  formatMinutes,
  parseCompanyDateTimeInput,
  shiftDurationSummary,
} from "@/components/timeclock/timeClockCompanyTime";
import { CcsDateTimeField } from "@/components/ui/ccs-date-field";

// Employee claims a shift that was never punched at all - both ends. The
// backend writes it as a completed needs_review entry; a manager only has to
// approve it, never key it by hand.
export default function MissedShiftDialog({
  open,
  userName,
  busy = false,
  error = "",
  onReport,
  onCancel,
}) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [lunchMinutes, setLunchMinutes] = useState("0");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  const parsedIn = useMemo(() => parseCompanyDateTimeInput(clockIn, null), [clockIn]);
  const parsedOut = useMemo(() => parseCompanyDateTimeInput(clockOut, null), [clockOut]);
  const lunch = Math.round(Number(lunchMinutes || 0));

  const preview = useMemo(() => {
    if (!parsedIn?.iso || !parsedOut?.iso) return { valid: false, error: "" };
    return shiftDurationSummary(parsedIn.iso, parsedOut.iso, Number.isFinite(lunch) ? lunch : 0);
  }, [parsedIn, parsedOut, lunch]);

  const shownError = localError || error;

  const submit = async () => {
    setLocalError("");
    if (!parsedIn?.iso || !parsedOut?.iso) {
      setLocalError("Pick the start and end times you actually worked.");
      return;
    }
    if (new Date(parsedOut.iso).getTime() <= new Date(parsedIn.iso).getTime()) {
      setLocalError("Clock Out must be after Clock In.");
      return;
    }
    if (!Number.isFinite(lunch) || lunch < 0 || lunch > 240) {
      setLocalError("Lunch minutes must be between 0 and 240.");
      return;
    }
    if (reason.trim().length < 3) {
      setLocalError("Tell the manager why this shift was missed.");
      return;
    }
    try {
      await onReport({
        claimed_clock_in: parsedIn.iso,
        claimed_clock_out: parsedOut.iso,
        lunch_minutes: lunch,
        reason: reason.trim(),
      });
    } catch (err) {
      setLocalError(err?.message || "The report could not be sent.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy && !next) onCancel?.(); }}>
      <DialogContent className="clay-card border-none max-w-lg">
        <DialogHeader><DialogTitle>Report a missed shift{userName ? ` - ${userName}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This adds a completed shift to your time. A manager reviews and approves it before it counts - no manual entry needed on their side.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Clock In - {TIME_CLOCK_COMPANY_TIME_LABEL}</Label>
              <CcsDateTimeField value={clockIn} onChange={(e) => setClockIn(e.target.value)} disabled={busy} id="missed-shift-in" min={new Date(Date.now() - 7 * 86400000)} max={new Date()} />
            </div>
            <div>
              <Label>Clock Out - {TIME_CLOCK_COMPANY_TIME_LABEL}</Label>
              <CcsDateTimeField value={clockOut} onChange={(e) => setClockOut(e.target.value)} disabled={busy} id="missed-shift-out" min={new Date(Date.now() - 7 * 86400000)} max={new Date()} />
            </div>
          </div>
          <div>
            <Label>Unpaid lunch (minutes)</Label>
            <Input type="number" min="0" max="240" step="1" value={lunchMinutes} onChange={(e) => setLunchMinutes(e.target.value)} disabled={busy} />
          </div>
          {preview.valid && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              <div><strong>Reported duration:</strong> {formatMinutes(preview.netMinutesBeforeWorkPause)} worked ({formatMinutes(preview.grossMinutes)} gross - {lunch}m lunch).</div>
            </div>
          )}
          <div>
            <Label>Why was this shift missed? <span className="text-red-600">*</span></Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Example: I worked the morning shift at the shop but never clocked in or out - I clocked in when I came back at 1 PM." disabled={busy} />
          </div>
          {shownError && <p className="text-sm text-red-600">{shownError}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">Cancel</Button>
            <Button type="button" onClick={submit} disabled={busy} className="flex-1 bg-amber-600 hover:bg-amber-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit for approval"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}