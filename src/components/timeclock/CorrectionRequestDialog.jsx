import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Clock3, Loader2 } from "lucide-react";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  companyDateTimeInputFromIso,
  formatMinutes,
  parseCompanyDateTimeInput,
  shiftDurationSummary,
} from "@/components/timeclock/timeClockCompanyTime";
import TimeQuickPick, { SHIFT_START_TIMES } from "@/components/timeclock/TimeQuickPick";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-correction-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function correctionSubmissionKey(entryId) {
  return `ccs_timeclock_correction_request:${String(entryId || "").trim()}`;
}

function storedCorrectionSubmission(entryId) {
  try {
    const raw = sessionStorage.getItem(correctionSubmissionKey(entryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload ? { request_id: requestId, payload: parsed.payload } : null;
  } catch { return null; }
}

function persistCorrectionSubmission(entryId, requestId, payload) {
  try { sessionStorage.setItem(correctionSubmissionKey(entryId), JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearCorrectionSubmission(entryId, expectedRequestId = "") {
  try {
    if (expectedRequestId) {
      const stored = storedCorrectionSubmission(entryId);
      if (!stored || stored.request_id !== expectedRequestId) return;
    }
    sessionStorage.removeItem(correctionSubmissionKey(entryId));
  } catch {}
}

function shouldRetainCorrectionRequest(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

export default function CorrectionRequestDialog({ open, onOpenChange, entry, sessionToken, onSubmitted }) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [clockInSourceIso, setClockInSourceIso] = useState("");
  const [clockOutSourceIso, setClockOutSourceIso] = useState("");
  const [lunchMinutes, setLunchMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (!open || !entry) return;
    const stored = storedCorrectionSubmission(entry.id);
    const payload = stored?.payload || null;
    const requested = payload?.requested_changes || null;
    const sourceClockIn = requested?.clock_in || entry.clock_in || "";
    const sourceClockOut = requested?.clock_out || entry.clock_out || "";
    setClockInSourceIso(sourceClockIn);
    setClockOutSourceIso(sourceClockOut);
    setClockIn(companyDateTimeInputFromIso(sourceClockIn));
    setClockOut(companyDateTimeInputFromIso(sourceClockOut));
    setLunchMinutes(String(requested?.lunch_minutes ?? entry.lunch_minutes ?? 0));
    setNotes(requested?.notes ?? entry.notes ?? "");
    setReason(payload?.reason || "");
    setRequestId(stored?.request_id || newRequestId());
    setError("");
  }, [open, entry]);

  const submit = async () => {
    if (!entry?.id || busy) return;
    if (!sessionToken) { setError("Your signed Time Clock session is no longer available. Sign in again first."); return; }
    if (reason.trim().length < 3) { setError("Please explain what needs to be corrected."); return; }
    if (!correctionPreview.valid) {
      setError(correctionPreview.error || `Enter valid clock-in and clock-out times in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
      return;
    }
    const payload = {
      action: "submit_correction_request",
      target_email: entry.user_email,
      entry_id: entry.id,
      expected_updated_date: entry.updated_date,
      reason: reason.trim(),
      requested_changes: {
        clock_in: correctionPreview.clockInIso,
        clock_out: correctionPreview.clockOutIso,
        lunch_minutes: correctionPreview.lunchMinutes,
        notes,
      },
    };
    const stored = storedCorrectionSubmission(entry.id);
    const activeRequestId = stored?.request_id || requestId || newRequestId();
    if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
      setError("A previous submission may already be saved. Retry the preserved request with its original details before making a different correction.");
      return;
    }
    persistCorrectionSubmission(entry.id, activeRequestId, payload);
    setRequestId(activeRequestId);
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        ...payload,
        session_token: sessionToken,
        request_id: activeRequestId,
      });
      const data = response?.data || response;
      if (!data?.success) {
        const err = new Error(data?.error || "The correction request was not confirmed by the server.");
        err.retrySameRequest = data?.retry_same_request === true;
        err.confirmedServerResponse = true;
        throw err;
      }
      clearCorrectionSubmission(entry.id, activeRequestId);
      onOpenChange(false);
      await onSubmitted?.();
    } catch (err) {
      if (!shouldRetainCorrectionRequest(err)) {
        clearCorrectionSubmission(entry.id, activeRequestId);
        setRequestId(newRequestId());
      }
      setError(err?.response?.data?.error || err?.message || "The correction request could not be submitted safely.");
    } finally {
      setBusy(false);
    }
  };

  const correctionPreview = useMemo(() => {
    if (!clockIn || !clockOut) return { valid: false, error: `Enter both punch times in ${TIME_CLOCK_COMPANY_TIME_LABEL}.` };
    const parsedIn = parseCompanyDateTimeInput(clockIn, clockInSourceIso);
    if (!parsedIn.ok) return { valid: false, error: `Clock In: ${parsedIn.error}` };
    const parsedOut = parseCompanyDateTimeInput(clockOut, clockOutSourceIso);
    if (!parsedOut.ok) return { valid: false, error: `Clock Out: ${parsedOut.error}` };
    const duration = shiftDurationSummary(parsedIn.iso, parsedOut.iso, lunchMinutes);
    if (!duration.valid) return duration;
    return { ...duration, clockInIso: parsedIn.iso, clockOutIso: parsedOut.iso };
  }, [clockIn, clockOut, clockInSourceIso, clockOutSourceIso, lunchMinutes]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="clay-card border-none max-w-lg">
        <DialogHeader><DialogTitle>Request Time Correction</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This does not rewrite your time. A manager must review and approve the request before the stored shift changes.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Requested Clock In ??? {TIME_CLOCK_COMPANY_TIME_LABEL}</Label><TimeQuickPick value={clockIn} onChange={setClockIn} disabled={busy} times={SHIFT_START_TIMES} inputId="req-clock-in" /></div>
            <div><Label>Requested Clock Out ??? {TIME_CLOCK_COMPANY_TIME_LABEL}</Label><TimeQuickPick value={clockOut} onChange={setClockOut} disabled={busy} inputId="req-clock-out" /></div>
          </div>
          <div><Label>Lunch Break (minutes)</Label><Input type="number" min="0" max="240" step="1" value={lunchMinutes} onChange={(e) => setLunchMinutes(e.target.value)} disabled={busy} /></div>
          <div className={`rounded-lg border p-3 text-sm ${correctionPreview.valid ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-800"}`}>
            <div className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              {correctionPreview.valid ? (
                <div><strong>Requested duration:</strong> {formatMinutes(correctionPreview.grossMinutes)} gross ??? {correctionPreview.lunchMinutes}m lunch = <strong>{formatMinutes(correctionPreview.netMinutesBeforeWorkPause)}</strong> before any tracked Work Pause.</div>
              ) : (
                <div><strong>Requested time is not ready:</strong> {correctionPreview.error}</div>
              )}
            </div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} disabled={busy} /></div>
          <div><Label>What needs to be corrected? <span className="text-red-600">*</span></Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} placeholder="Example: I forgot to clock out at the end of my shift. I left at 4:30 PM." disabled={busy} /></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || reason.trim().length < 3 || !correctionPreview.valid}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {busy ? "Submitting..." : "Submit for Manager Review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

