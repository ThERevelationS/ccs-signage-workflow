import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2 } from "lucide-react";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-correction-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function localDateTime(iso) {
  if (!iso) return "";
  try { return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
}

export default function CorrectionRequestDialog({ open, onOpenChange, entry, sessionToken, onSubmitted }) {
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [lunchMinutes, setLunchMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    setClockIn(localDateTime(entry.clock_in));
    setClockOut(localDateTime(entry.clock_out));
    setLunchMinutes(String(entry.lunch_minutes || 0));
    setNotes(entry.notes || "");
    setReason("");
    setError("");
  }, [open, entry]);

  const submit = async () => {
    if (!entry?.id || busy) return;
    if (!sessionToken) { setError("Your signed Time Clock session is no longer available. Sign in again first."); return; }
    if (reason.trim().length < 3) { setError("Please explain what needs to be corrected."); return; }
    const parsedIn = new Date(clockIn);
    const parsedOut = new Date(clockOut);
    if (!Number.isFinite(parsedIn.getTime()) || !Number.isFinite(parsedOut.getTime()) || parsedOut < parsedIn) {
      setError("Enter valid clock-in and clock-out times.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "submit_correction_request",
        session_token: sessionToken,
        target_email: entry.user_email,
        request_id: newRequestId(),
        entry_id: entry.id,
        expected_updated_date: entry.updated_date,
        reason: reason.trim(),
        requested_changes: {
          clock_in: parsedIn.toISOString(),
          clock_out: parsedOut.toISOString(),
          lunch_minutes: Math.max(0, Number(lunchMinutes) || 0),
          notes,
        },
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "The correction request was not confirmed by the server.");
      onOpenChange(false);
      await onSubmitted?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The correction request could not be submitted safely.");
    } finally {
      setBusy(false);
    }
  };

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
            <div><Label>Requested Clock In</Label><Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} disabled={busy} /></div>
            <div><Label>Requested Clock Out</Label><Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} disabled={busy} /></div>
          </div>
          <div><Label>Lunch Break (minutes)</Label><Input type="number" min="0" max="240" value={lunchMinutes} onChange={(e) => setLunchMinutes(e.target.value)} disabled={busy} /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} disabled={busy} /></div>
          <div><Label>What needs to be corrected? <span className="text-red-600">*</span></Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} placeholder="Example: I forgot to clock out at the end of my shift. I left at 4:30 PM." disabled={busy} /></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || reason.trim().length < 3}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {busy ? "Submitting..." : "Submit for Manager Review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
