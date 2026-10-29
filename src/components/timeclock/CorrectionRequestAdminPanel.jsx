import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Pencil, XCircle } from "lucide-react";
import {
  TIME_CLOCK_COMPANY_TIME_LABEL,
  companyDateTimeInputFromIso,
  formatCompanyDateTime,
  formatMinutes,
  parseCompanyDateTimeInput,
  shiftDurationSummary,
} from "@/components/timeclock/timeClockCompanyTime";

function reviewRetryStorageKey(correctionRequestId) {
  return `ccs_timeclock_review_retry:${String(correctionRequestId || "").trim().toLowerCase()}`;
}

function storedReviewRetry(correctionRequestId) {
  try {
    const raw = sessionStorage.getItem(reviewRetryStorageKey(correctionRequestId));
    const stored = raw ? JSON.parse(raw) : null;
    if (stored?.payload && stored.payload.correction_request_id !== correctionRequestId) return null;
    return stored;
  } catch { return null; }
}

function persistReviewRetry(correctionRequestId, requestId, decision, payload) {
  try {
    sessionStorage.setItem(reviewRetryStorageKey(correctionRequestId), JSON.stringify({ request_id: requestId, decision, payload }));
  } catch {}
}

function clearReviewRetry(correctionRequestId, expectedRequestId = "") {
  try {
    if (expectedRequestId && storedReviewRetry(correctionRequestId)?.request_id !== expectedRequestId) return;
    sessionStorage.removeItem(reviewRetryStorageKey(correctionRequestId));
  } catch {}
}

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-review-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function displayTime(iso) {
  if (!iso) return "—";
  return formatCompanyDateTime(iso);
}

export default function CorrectionRequestAdminPanel({ sessionToken, onEntriesChanged, reviewRequestId = "", onReviewRequestOpened }) {
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
  const [retryReview, setRetryReview] = useState(null);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDecision, setBulkDecision] = useState("approve");
  const [queueFilter, setQueueFilter] = useState("");

  const loadSeqRef = useRef(0);
  const loadRequests = useCallback(async () => {
    if (!sessionToken) { setRequests([]); return; }
    const seq = ++loadSeqRef.current;
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
      if (seq !== loadSeqRef.current) return;
      if (!data?.success) throw new Error(data?.error || "Correction requests could not be loaded.");
      const rows = Array.isArray(data.requests) ? data.requests : [];
      setRequests(rows);
      for (const request of rows) {
        const storedRetry = storedReviewRetry(request.id);
        if (storedRetry?.request_id && storedRetry?.payload) {
          setRetryReview({
            correctionRequestId: request.id,
            decision: storedRetry.payload.decision || "",
            requestId: storedRetry.request_id,
            payload: storedRetry.payload,
          });
          break;
        }
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err?.response?.data?.error || err?.message || "Correction requests could not be loaded.");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const openReview = useCallback((request) => {
    if (!request?.id) return;
    const requested = request.requested_changes || {};
    setSelected(request);
    setClockIn(companyDateTimeInputFromIso(requested.clock_in));
    setClockOut(companyDateTimeInputFromIso(requested.clock_out));
    setLunchMinutes(String(requested.lunch_minutes || 0));
    setNotes(requested.notes || "");
    setReviewReason("");
    setRetryReview(null);
    setError("");
  }, []);

  useEffect(() => {
    if (!reviewRequestId || loading || selected?.id === reviewRequestId) return;
    const requestedReview = requests.find((request) => request.id === reviewRequestId);
    if (!requestedReview) return;
    openReview(requestedReview);
    onReviewRequestOpened?.(reviewRequestId);
  }, [loading, onReviewRequestOpened, openReview, requests, reviewRequestId, selected?.id]);

  /* Kept as a named callback so list review and Needs Attention routing share one path. */
  const openReviewFromList = (request) => {
    openReview(request);
  };

  const review = async (decision) => {
    if (!selected?.id || busy) return;

    const retryingThisRequest = retryReview?.correctionRequestId === selected.id;
    let payload;
    if (retryingThisRequest) {
      if (decision !== retryReview.decision) {
        setError("A manager review is already in recovery. Retry the same decision before choosing a different outcome.");
        return;
      }
      payload = { ...retryReview.payload, session_token: sessionToken };
    } else {
      if (reviewReason.trim().length < 3) { setError("Enter a manager review reason before deciding."); return; }
      payload = {
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
        if (!editedPreview.valid) {
          setError(editedPreview.error || `Enter valid corrected punch times in ${TIME_CLOCK_COMPANY_TIME_LABEL}.`);
          return;
        }
        payload.correction = {
          clock_in: editedPreview.clockInIso,
          clock_out: editedPreview.clockOutIso,
          lunch_minutes: editedPreview.lunchMinutes,
          notes,
        };
      }
    }

    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("timeClockAction", payload);
      const data = response?.data || response;
      if (!data?.success) {
        const serverError = new Error(data?.error || "The manager decision was not confirmed by the server.");
        serverError.retrySameRequest = data?.retry_same_request === true;
        throw serverError;
      }
      clearReviewRetry(selected.id, payload.request_id);
      setRetryReview(null);
      setSelected(null);
      await Promise.all([loadRequests(), onEntriesChanged?.()]);
    } catch (err) {
      const responseData = err?.response?.data || err?.data || {};
      const retrySameRequest = err?.retrySameRequest === true || responseData?.retry_same_request === true;
      if (retrySameRequest) {
        const { session_token, ...frozenPayload } = payload;
        void session_token;
        persistReviewRetry(selected.id, payload.request_id, decision, frozenPayload);
        setRetryReview({
          correctionRequestId: selected.id,
          decision,
          requestId: payload.request_id,
          payload: frozenPayload,
        });
        setError(`${responseData?.error || err?.message || "The manager review was interrupted."} Retry the same manager decision to recover safely.`);
      } else {
        clearReviewRetry(selected.id, payload.request_id);
        setRetryReview(null);
        setError(responseData?.error || err?.message || "The manager decision could not be completed safely.");
      }
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const retryingSelected = retryReview?.correctionRequestId === selected?.id;

  const toggleChecked = (id) => setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChecked = requests.length > 0 && checkedIds.size === requests.length;
  const toggleAll = () => setCheckedIds(allChecked ? new Set() : new Set(requests.map((r) => r.id)));

  // Oldest requests surface first and carry an age badge so stale items can't hide.
  const ageDays = (iso) => {
    const t = Date.parse(String(iso || ""));
    return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
  };
  const visibleRequests = requests
    .filter((r) => {
      const q = queueFilter.trim().toLowerCase();
      if (!q) return true;
      return [r.user_name, r.user_email, r.request_kind, r.employee_reason].some((v) => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => Date.parse(a.requested_at || 0) - Date.parse(b.requested_at || 0));

  const bulkReview = async () => {
    if (bulkBusy || checkedIds.size === 0 || bulkReason.trim().length < 3) {
      if (bulkReason.trim().length < 3) setError("Enter a shared manager review reason (3+ characters) for the bulk decision.");
      return;
    }
    setBulkBusy(true);
    setError("");
    const failed = [];
    for (const request of requests.filter((r) => checkedIds.has(r.id))) {
      try {
        const response = await base44.functions.invoke("timeClockAction", {
          action: "review_correction_request",
          session_token: sessionToken,
          target_email: request.user_email,
          request_id: newRequestId(),
          correction_request_id: request.id,
          expected_request_updated_date: request.updated_date,
          decision: bulkDecision,
          reason: bulkReason.trim(),
        });
        const data = response?.data || response;
        if (!data?.success) failed.push(`${request.user_name || request.user_email}: ${data?.error || "not confirmed"}`);
      } catch (err) {
        failed.push(`${request.user_name || request.user_email}: ${err?.response?.data?.error || err?.message || "failed"}`);
      }
    }
    setCheckedIds(new Set());
    if (failed.length) setError(`Bulk ${bulkDecision} had ${failed.length} failure(s): ${failed.join("; ")}`);
    await Promise.all([loadRequests(), onEntriesChanged?.()]);
    setBulkBusy(false);
  };
  const requestedDuration = useMemo(() => shiftDurationSummary(
    selected?.requested_changes?.clock_in,
    selected?.requested_changes?.clock_out,
    selected?.requested_changes?.lunch_minutes || 0,
  ), [selected]);
  const editedPreview = useMemo(() => {
    if (!clockIn || !clockOut) return { valid: false, error: `Enter Clock In and Clock Out in ${TIME_CLOCK_COMPANY_TIME_LABEL}.` };
    const parsedIn = parseCompanyDateTimeInput(clockIn, selected?.requested_changes?.clock_in);
    if (!parsedIn.ok) return { valid: false, error: `Clock In: ${parsedIn.error}` };
    const parsedOut = parseCompanyDateTimeInput(clockOut, selected?.requested_changes?.clock_out);
    if (!parsedOut.ok) return { valid: false, error: `Clock Out: ${parsedOut.error}` };
    const duration = shiftDurationSummary(parsedIn.iso, parsedOut.iso, lunchMinutes);
    if (!duration.valid) return duration;
    return { ...duration, clockInIso: parsedIn.iso, clockOutIso: parsedOut.iso };
  }, [clockIn, clockOut, lunchMinutes, selected]);

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
        {requests.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5" />
              Select all
            </label>
            <Input
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              placeholder="Filter by name, kind, or reason"
              className="h-8 w-44 text-xs"
              disabled={bulkBusy}
            />
            <select
              value={bulkDecision}
              onChange={(e) => setBulkDecision(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium"
              disabled={bulkBusy}
            >
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
            </select>
            <Input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Shared review reason (required)"
              className="h-8 min-w-40 flex-1 text-xs"
              maxLength={500}
              disabled={bulkBusy || checkedIds.size === 0}
            />
            <Button
              size="sm"
              onClick={bulkReview}
              disabled={bulkBusy || checkedIds.size === 0 || bulkReason.trim().length < 3}
              className={`gap-1.5 ${bulkDecision === "reject" ? "bg-red-600 hover:bg-red-700" : ""}`}
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {bulkDecision === "reject" ? "Reject" : "Approve"} {checkedIds.size || ""} selected
            </Button>
          </div>
        )}
        {loading ? (
          <div className="py-4 flex items-center justify-center text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading requests…</div>
        ) : error && !selected ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No pending correction requests.</div>
        ) : (
          <div className="space-y-2">
            {visibleRequests.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No requests match this filter.</div>
            ) : visibleRequests.map((request) => (
              <div key={request.id} className="rounded-lg border bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(request.id)}
                    onChange={() => toggleChecked(request.id)}
                    className="mt-1 h-4 w-4 shrink-0"
                    aria-label={`Select ${request.user_name || request.user_email}`}
                  />
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-sm">{request.user_name || request.user_email}</div>
                    {request.request_kind === "missed_clock_out" && (
                      <Badge className="bg-amber-100 text-amber-800">Missed Clock Out</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Submitted {displayTime(request.requested_at)} · {TIME_CLOCK_COMPANY_TIME_LABEL}
                    {(() => { const d = ageDays(request.requested_at); return d !== null && d >= 1 ? (
                      <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold ${d >= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{d}d old</span>
                    ) : null; })()}
                  </div>
                  <div className="text-sm text-gray-700 mt-1 line-clamp-2">{request.employee_reason}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openReviewFromList(request)}>Review</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy && !retryingSelected) { setSelected(null); setRetryReview(null); } }}>
        <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.request_kind === "missed_clock_out" ? "Review Missed Clock Out" : "Review Time Correction"}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{selected.request_kind === "missed_clock_out"
                  ? "The employee's reported Clock Out has not been written to the TimeEntry yet. Approval or modification completes the preserved shift through the audited backend; rejection leaves it unresolved."
                  : "Approval changes the preserved TimeEntry through the audited backend. Rejection leaves the original shift unchanged."}</span>
              </div>
              <div>
                <div className="font-semibold">{selected.user_name || selected.user_email}</div>
                <p className="text-sm text-gray-600 mt-1"><strong>Employee reason:</strong> {selected.employee_reason}</p>
              </div>
              {selected.request_kind === "missed_clock_out" && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Employee-reported Clock Out</div>
                  <div className="mt-1 text-2xl font-bold text-amber-950">{displayTime(selected.requested_changes?.clock_out)}</div>
                  <div className="mt-1 text-xs text-amber-800">Employee-attested time. It is not official until this correction is applied through the audited backend.</div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">ORIGINAL · {TIME_CLOCK_COMPANY_TIME_LABEL}</div>
                  <div>In: {displayTime(selected.original_snapshot?.clock_in)}</div>
                  <div>Out: {displayTime(selected.original_snapshot?.clock_out)}</div>
                  <div>Lunch: {selected.original_snapshot?.lunch_minutes || 0} min</div>
                </div>
                <div className="rounded-lg bg-purple-50 p-3">
                  <div className="text-xs font-semibold text-purple-700 mb-2">EMPLOYEE REQUEST · {TIME_CLOCK_COMPANY_TIME_LABEL}</div>
                  <div>In: {displayTime(selected.requested_changes?.clock_in)}</div>
                  <div>Out: {displayTime(selected.requested_changes?.clock_out)}</div>
                  <div>Lunch: {selected.requested_changes?.lunch_minutes || 0} min</div>
                  {requestedDuration.valid && (
                    <div className="mt-2 border-t border-purple-200 pt-2 text-xs text-purple-900">
                      <div>Gross shift: <strong>{formatMinutes(requestedDuration.grossMinutes)}</strong></div>
                      <div>After lunch: <strong>{formatMinutes(requestedDuration.netMinutesBeforeWorkPause)}</strong></div>
                    </div>
                  )}
                </div>
              </div>
              {retryingSelected && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  This review was interrupted after the server began processing it. Values are locked until you retry the same decision so the original idempotent request can finish safely.
                </div>
              )}
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <div className="text-sm font-semibold">Manager-adjusted values · {TIME_CLOCK_COMPANY_TIME_LABEL}</div>
                  <div className="text-xs text-gray-500 mt-1">These fields are used only by <strong>Apply Edited Time</strong>. <strong>Approve Reported Time</strong> uses the employee request above exactly.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Clock In — {TIME_CLOCK_COMPANY_TIME_LABEL}</Label><Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} disabled={busy || retryingSelected} /></div>
                  <div><Label>Clock Out — {TIME_CLOCK_COMPANY_TIME_LABEL}</Label><Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} disabled={busy || retryingSelected} /></div>
                </div>
                <div><Label>Lunch (minutes)</Label><Input type="number" min="0" max="240" step="1" value={lunchMinutes} onChange={(e) => setLunchMinutes(e.target.value)} disabled={busy || retryingSelected} /></div>
                <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} disabled={busy || retryingSelected} /></div>
                <div className={`rounded-lg border p-3 text-sm ${editedPreview.valid ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-800"}`}>
                  <div className="flex items-start gap-2">
                    <Clock3 className="w-4 h-4 mt-0.5 shrink-0" />
                    {editedPreview.valid ? (
                      <div>
                        <div><strong>Edited duration preview:</strong> {formatMinutes(editedPreview.grossMinutes)} gross − {editedPreview.lunchMinutes}m lunch = <strong>{formatMinutes(editedPreview.netMinutesBeforeWorkPause)}</strong>.</div>
                        <div className="text-xs mt-1">Tracked Work Pause time, if any, remains preserved and is also excluded by the authoritative backend calculation.</div>
                      </div>
                    ) : (
                      <div><strong>Edited time is not ready:</strong> {editedPreview.error}</div>
                    )}
                  </div>
                </div>
              </div>
              <div><Label>Manager Review Reason <span className="text-red-600">*</span></Label><Textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={3} maxLength={500} placeholder="Record what was verified and why this request is approved, modified, or rejected." disabled={busy || retryingSelected} /></div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <strong>Correction approval is not shift approval.</strong> Approving the reported or edited punch applies the audited correction and leaves the completed shift at <strong>Needs Review</strong>. A manager must separately approve the completed shift before pay-period finalization.
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => review("reject")} disabled={busy || (!retryingSelected && reviewReason.trim().length < 3) || (retryingSelected && retryReview.decision !== "reject")}><XCircle className="w-4 h-4 mr-2" />{retryingSelected && retryReview.decision === "reject" ? "Retry Reject" : "Reject & Keep Unresolved"}</Button>
                <Button variant="outline" onClick={() => review("approve_modified")} disabled={busy || (!retryingSelected && (reviewReason.trim().length < 3 || !editedPreview.valid)) || (retryingSelected && retryReview.decision !== "approve_modified")}><Pencil className="w-4 h-4 mr-2" />{retryingSelected && retryReview.decision === "approve_modified" ? "Retry Edited Approval" : "Apply Edited Time"}</Button>
                <Button onClick={() => review("approve")} disabled={busy || (!retryingSelected && reviewReason.trim().length < 3) || (retryingSelected && retryReview.decision !== "approve")}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}{retryingSelected && retryReview.decision === "approve" ? "Retry Approval" : "Approve Reported Time"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
