import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban, CalendarOff, CheckCircle2, Loader2, XCircle } from "lucide-react";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-pto-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

const TYPE_LABELS = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  bereavement: "Bereavement",
  jury_duty: "Jury Duty",
  other: "Other",
};

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-600",
};

export default function TimeOffApprovalPanel({ sessionToken }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [ptoBalances, setPtoBalances] = useState([]);
  const [adminNotes, setAdminNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryDecision, setRetryDecision] = useState(null);

  const loadSeqRef = useRef(0);
  const loadRequests = useCallback(async () => {
    if (!sessionToken) { setRequests([]); return; }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        action: "list_time_off_requests",
        session_token: sessionToken,
        scope: "admin",
        request_id: newRequestId(),
      });
      const data = response?.data || response;
      if (seq !== loadSeqRef.current) return;
      if (!data?.success) throw new Error(data?.error || "Time-off requests could not be loaded.");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err?.response?.data?.error || err?.message || "Time-off requests could not be loaded.");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const openReview = (request) => {
    if (!request?.id) return;
    setSelected(request);
    setAdminNotes(request.admin_notes || "");
    setRetryDecision(null);
    setError("");
  };

  const decide = async (decision) => {
    if (!selected?.id || busy) return;

    const retryingThisRequest = retryDecision?.timeOffRequestId === selected.id;
    let payload;
    if (retryingThisRequest) {
      if (decision !== retryDecision.decision) {
        setError("A time-off decision is already in recovery. Retry the same decision before choosing a different outcome.");
        return;
      }
      payload = { ...retryDecision.payload, session_token: sessionToken };
    } else {
      payload = {
        action: "time_off_decision",
        session_token: sessionToken,
        target_email: selected.user_email,
        request_id: newRequestId(),
        time_off_request_id: selected.id,
        expected_updated_date: selected.updated_date,
        decision,
        admin_notes: adminNotes.trim(),
      };
    }

    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", payload);
      const data = response?.data || response;
      if (!data?.success) {
        const serverError = new Error(data?.error || "The time-off decision was not confirmed by the server.");
        serverError.retrySameRequest = data?.retry_same_request === true;
        throw serverError;
      }
      setRetryDecision(null);
      setSelected(null);
      await loadRequests();
    } catch (err) {
      const responseData = err?.response?.data || err?.data || {};
      const retrySameRequest = err?.retrySameRequest === true || responseData?.retry_same_request === true;
      if (retrySameRequest) {
        const { session_token, ...frozenPayload } = payload;
        void session_token;
        setRetryDecision({
          timeOffRequestId: selected.id,
          decision,
          requestId: payload.request_id,
          payload: frozenPayload,
        });
        setError(`${responseData?.error || err?.message || "The decision was interrupted."} Retry the same decision to recover safely.`);
      } else {
        setRetryDecision(null);
        setError(responseData?.error || err?.message || "The time-off decision could not be completed safely.");
      }
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setPtoBalances([]);
    const email = selected?.user_email;
    if (!email) return;
    let cancelled = false;
    staffEntities.UserPTOBalance.filter({ user_email: email }).then((rows) => {
      if (cancelled || !Array.isArray(rows)) return;
      const all = rows.flatMap(r => Array.isArray(r.balances) ? r.balances : []);
      if (!cancelled) setPtoBalances(all);
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [selected?.user_email]);

  const retryingSelected = retryDecision?.timeOffRequestId === selected?.id;
  const isPending = selected?.status === "pending";
  // Approved requests for the same employee that overlap the selected range.
  const overlappingApproved = isPending && selected ? requests.filter((r) =>
    r.id !== selected.id && r.user_email === selected.user_email && r.status === "approved" &&
    r.start_date && r.end_date && selected.start_date && selected.end_date &&
    r.start_date <= selected.end_date && selected.start_date <= r.end_date
  ) : [];

  if (!sessionToken) return null;

  return (
    <>
      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><CalendarOff className="w-4 h-4 text-blue-600" />Time-Off Requests</h3>
            <p className="text-xs text-gray-500 mt-1">Approvals, denials, and cancellations notify through automation workflows.</p>
          </div>
          <Badge className={pendingCount ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}>{pendingCount} awaiting review</Badge>
        </div>
        {loading ? (
          <div className="py-4 flex items-center justify-center text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading requestsâ€¦</div>
        ) : error && !selected ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No pending or approved time-off requests.</div>
        ) : (
          <div className="space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-sm">{request.user_name || request.user_email}</div>
                    <Badge className="bg-blue-100 text-blue-800">{TYPE_LABELS[request.request_type] || request.request_type || "Time Off"}</Badge>
                    <Badge className={STATUS_BADGE[request.status] || "bg-gray-100 text-gray-700"}>{request.status}</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {request.start_date} â†’ {request.end_date} Â· {request.hours_requested}h requested
                  </div>
                  {request.reason && <div className="text-sm text-gray-700 mt-1 line-clamp-2">{request.reason}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => openReview(request)}>Review</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy && !retryingSelected) { setSelected(null); setRetryDecision(null); } }}>
        <DialogContent className="clay-card border-none max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Time-Off Request</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">{selected.user_name || selected.user_email}</div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">TYPE</div>{TYPE_LABELS[selected.request_type] || selected.request_type}</div>
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">HOURS</div>{selected.hours_requested}h</div>
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">DATES</div>{selected.start_date} â†’ {selected.end_date}</div>
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-500">STATUS</div>{selected.status}</div>
                </div>
                {selected.reason && <p className="text-sm text-gray-600 mt-2"><strong>Employee reason:</strong> {selected.reason}</p>}
              </div>
              {retryingSelected && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  This decision was interrupted after the server began processing it. Values are locked until you retry the same decision so the original idempotent request can finish safely.
                </div>
              )}
              <div>
                <Label>Admin Notes</Label>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Optional â€” recorded on the request and included in automation emails." disabled={busy || retryingSelected} />
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {isPending && (
                  <>
                    <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => decide("denied")} disabled={busy || (retryingSelected && retryDecision.decision !== "denied")}><XCircle className="w-4 h-4 mr-2" />{retryingSelected && retryDecision.decision === "denied" ? "Retry Denial" : "Deny"}</Button>
                    {ptoBalances.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {ptoBalances.map((b, i) => {
                      const short = typeof selected?.hours_requested === "number" && typeof b.available_hours === "number" && b.available_hours < selected.hours_requested;
                      return (
                        <span key={i} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${short ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}
                          title={short ? "Requested hours exceed this balance" : "Current balance"}>
                          {b.type_name || b.type_id}: {b.available_hours ?? "?"}h{short ? " — short" : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {overlappingApproved.length > 0 && (
                  <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    Overlaps {overlappingApproved.length} already-approved request{overlappingApproved.length === 1 ? "" : "s"} ({overlappingApproved.map(r => `${r.start_date} to ${r.end_date}`).join(", ")}) — verify coverage before approving.
                  </div>
                )}
                <Button onClick={() => decide("approved")} disabled={busy || (retryingSelected && retryDecision.decision !== "approved")}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}{retryingSelected && retryDecision.decision === "approved" ? "Retry Approval" : "Approve"}</Button>
                  </>
                )}
                {selected.status === "approved" && (
                  <div className="sm:col-span-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    Approved by {selected.approved_by || "a manager"}.
                  </div>
                )}
                {(isPending || selected.status === "approved") && (
                  <Button variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-50" onClick={() => decide("cancelled")} disabled={busy || (retryingSelected && retryDecision.decision !== "cancelled")}><Ban className="w-4 h-4 mr-2" />{retryingSelected && retryDecision.decision === "cancelled" ? "Retry Cancellation" : "Cancel Request"}</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}