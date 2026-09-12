import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, XCircle } from "lucide-react";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-review-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function localDateTime(iso) {
  if (!iso) return "";
  try { return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
}

function displayTime(iso) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy h:mm a"); } catch { return "Invalid time"; }
}

export default function CorrectionRequestAdminPanel({ sessionToken, onEntriesChanged }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [lunchMinutes, setLunchMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!sessionToken) { setRequests([]); return; }
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "list_correction_requests",
        session_token: sessionToken,
        scope: "admin",
        request_id: newRequestId(),
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Correction requests could not be loaded.");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Correction requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const openReview = (request) => {
    const requested = request.requested_changes || {};
    setSelected(request);
    setClockIn(localDateTime(requested.clock_in));
    setClockOut(localDateTime(requested.clock_out));
    setLunchMinutes(String(requested.lunch_minutes || 0));
    setNotes(requested.notes || "");
    setReviewReason("");
    setError("");
  };

  const review = async (decision) => {
    if (!selected?.id || busy) return;
    if (reviewReason.trim().length < 3) { setError("Enter a manager review reason before deciding."); return; }
    const payload = {
      action: "review_correction_request",
      session_token: sessionToken,
      target_email: selected.user_email,
      request_id: newRequestId(),
      correction_request_id: selected.id,
      expected_request_updated_date: selected.updated_date,
      decision,
      reason: reviewReason.trim(),
    };
    if (decision === "approve_modified") {
      const parsedIn = new Date(clockIn);
      const parsedOut = new Date(clockOut);
      if (!Number.isFinite(parsedIn.getTime()) || !Number.isFinite(parsedOut.getTime()) || parsedOut < parsedIn) {
        setError("Enter valid corrected clock-in and clock-out times.");
        return;
      }
      payload.correction = {
        clock_in: parsedIn.toISOString(),
        clock_out: parsedOut.toISOString(),
        lunch_minutes: Math.max(0, Number(lunchMinutes) || 0),
        notes,
      };
    }
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", payload);
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "The manager decision was not confirmed by the server.");
      setSelected(null);
      await Promise.all([loadRequests(), onEntriesChanged?.()]);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The manager decision could not be completed safely.");
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  if (!sessionToken) return null;

  return (
    <>
      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Pencil className="w-4 h-4 text-purple-600" />Correction Requests</h3>
            <p className="text-xs text-gray-500 mt-1">Employee requests do not change time until a manager approves them.</p>
          </div>
          <Badge className={requests.length ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}>{requests.length} awaiting review</Badge>
        </div>
        {loading ? (
          <div className="py-4 flex items-center justify-center text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading requests…</div>
        ) : error && !selected ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No pending correction requests.</div>
        ) : (
          <div className="space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{request.user_name || request.user_email}</div>
                  <div className="text-xs text-gray-500">Submitted {displayTime(request.requested_at)}</div>
                  <div className="text-sm text-gray-700 mt-1 line-clamp-2">{request.employee_reason}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openReview(request)}>Review</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
        <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Time Correction</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Approval changes the preserved TimeEntry through the audited backend. Rejection leaves the original shift unchanged.</span>
              </div>
              <div>
                <div className="font-semibold">{selected.user_name || selected.user_email}</div>
                <p className="text-sm text-gray-600 mt-1"><strong>Employee reason:</strong> {selected.employee_reason}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">ORIGINAL</div>
                  <div>In: {displayTime(selected.original_snapshot?.clock_in)}</div>
                  <div>Out: {displayTime(selected.original_snapshot?.clock_out)}</div>
                  <div>Lunch: {selected.original_snapshot?.lunch_minutes || 0} min</div>
                </div>
                <div className="rounded-lg bg-purple-50 p-3">
                  <div className="text-xs font-semibold text-purple-700 mb-2">EMPLOYEE REQUEST</div>
                  <div>In: {displayTime(selected.requested_changes?.clock_in)}</div>
                  <div>Out: {displayTime(selected.requested_changes?.clock_out)}</div>
                  <div>Lunch: {selected.requested_changes?.lunch_minutes || 0} min</div>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <div className="text-sm font-semibold">Manager-adjusted values</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Clock In</Label><Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} disabled={busy} /></div>
                  <div><Label>Clock Out</Label><Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} disabled={busy} /></div>
                </div>
                <div><Label>Lunch (minutes)</Label><Input type="number" min="0" max="240" value={lunchMinutes} onChange={(e) => setLunchMinutes(e.target.value)} disabled={busy} /></div>
                <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} disabled={busy} /></div>
              </div>
              <div><Label>Manager Review Reason <span className="text-red-600">*</span></Label><Textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={3} maxLength={500} placeholder="Record what was verified and why this request is approved, modified, or rejected." disabled={busy} /></div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => review("reject")} disabled={busy || reviewReason.trim().length < 3}><XCircle className="w-4 h-4 mr-2" />Reject</Button>
                <Button variant="outline" onClick={() => review("approve_modified")} disabled={busy || reviewReason.trim().length < 3}><Pencil className="w-4 h-4 mr-2" />Approve Edited</Button>
                <Button onClick={() => review("approve")} disabled={busy || reviewReason.trim().length < 3}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Approve Requested</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
