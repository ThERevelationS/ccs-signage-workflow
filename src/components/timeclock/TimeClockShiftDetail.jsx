import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Briefcase,
  Clock3,
  Coffee,
  FileText,
  History,
  Home,
  Loader2,
  LockKeyhole,
  Pause,
  RefreshCw,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react";
import { format } from "date-fns";

const TimeClockBreak = base44.entities.TimeClockBreak;
const TimeClockWorkPause = base44.entities.TimeClockWorkPause;
const TimeClockCorrectionRequest = base44.entities.TimeClockCorrectionRequest;
const TimeClockAudit = base44.entities.TimeClockAudit;
const TimeClockPayPeriod = base44.entities.TimeClockPayPeriod;
const TimeClockLaborSegment = base44.entities.TimeClockLaborSegment;

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = safeDate(value);
  return date ? format(date, "MMM d, yyyy h:mm:ss a") : "—";
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function approvalClass(status) {
  if (status === "approved") return "bg-green-100 text-green-800 border-green-200";
  if (status === "needs_review") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function auditClass(outcome) {
  if (outcome === "confirmed") return "bg-green-100 text-green-800 border-green-200";
  if (outcome === "recovered" || outcome === "reused") return "bg-blue-100 text-blue-800 border-blue-200";
  if (outcome === "blocked") return "bg-red-100 text-red-800 border-red-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function correctionClass(status) {
  if (["approved", "approved_modified"].includes(status)) return "bg-green-100 text-green-800 border-green-200";
  if (status === "rejected") return "bg-red-100 text-red-800 border-red-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

export default function TimeClockShiftDetail({ entry, open, onOpenChange }) {
  const [breaks, setBreaks] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [laborSegments, setLaborSegments] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [audits, setAudits] = useState([]);
  const [payPeriod, setPayPeriod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDetails = async () => {
    if (!entry?.id || !open) return;
    setLoading(true);
    setError("");
    try {
      const [breakRows, pauseRows, laborRows, correctionRows, auditRows, periodRows] = await Promise.all([
        TimeClockBreak.filter({ time_entry_id: entry.id }),
        TimeClockWorkPause.filter({ time_entry_id: entry.id }),
        TimeClockLaborSegment.filter({ time_entry_id: entry.id }),
        TimeClockCorrectionRequest.filter({ time_entry_id: entry.id }),
        TimeClockAudit.filter({ time_entry_id: entry.id }),
        entry.pay_period_id ? TimeClockPayPeriod.filter({ id: entry.pay_period_id }) : Promise.resolve([]),
      ]);

      setBreaks((Array.isArray(breakRows) ? breakRows : []).sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0)));
      setPauses((Array.isArray(pauseRows) ? pauseRows : []).sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0)));
      setLaborSegments((Array.isArray(laborRows) ? laborRows : []).sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0)));
      setCorrections((Array.isArray(correctionRows) ? correctionRows : []).sort((a, b) => new Date(a.requested_at || 0) - new Date(b.requested_at || 0)));
      setAudits((Array.isArray(auditRows) ? auditRows : []).sort((a, b) => new Date(a.server_timestamp || 0) - new Date(b.server_timestamp || 0)));
      setPayPeriod(Array.isArray(periodRows) && periodRows.length === 1 ? periodRows[0] : null);
    } catch (err) {
      console.error("Error loading Time Clock shift detail:", err);
      setError(err?.message || "Shift details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && entry?.id) loadDetails();
    if (!open) {
      setBreaks([]);
      setPauses([]);
      setLaborSegments([]);
      setCorrections([]);
      setAudits([]);
      setPayPeriod(null);
      setError("");
    }
  }, [open, entry?.id]);

  const combinedActivity = useMemo(() => {
    const rows = [];
    if (entry?.clock_in) rows.push({ key: "clock-in", at: entry.clock_in, type: "Clock", label: "Clocked in", detail: entry.clock_source ? `Source: ${entry.clock_source}` : "" });
    breaks.forEach(row => {
      rows.push({ key: `break-start-${row.id}`, at: row.started_at, type: "Break", label: `${row.is_paid ? "Paid" : "Unpaid"} ${row.break_type || "break"} started`, detail: "" });
      if (row.ended_at) rows.push({ key: `break-end-${row.id}`, at: row.ended_at, type: "Break", label: `${row.is_paid ? "Paid" : "Unpaid"} ${row.break_type || "break"} ended`, detail: formatMinutes(row.duration_minutes) });
    });
    pauses.forEach(row => {
      rows.push({ key: `pause-start-${row.id}`, at: row.started_at, type: "Pause", label: "Work Paused", detail: "Excluded from tracked work" });
      if (row.resumed_at) rows.push({ key: `pause-end-${row.id}`, at: row.resumed_at, type: "Pause", label: "Work Resumed", detail: formatMinutes(row.duration_minutes) });
    });
    laborSegments.forEach(row => {
      const label = String(row.activity_type || "work").replaceAll("_", " ");
      const job = row.work_order_id ? `${row.client_name || "WorkOrder"}${row.work_order_title ? ` — ${row.work_order_title}` : ""}` : "No WorkOrder attached";
      rows.push({ key: `labor-start-${row.id}`, at: row.started_at, type: "Labor", label: `Started ${label}`, detail: job });
      if (row.ended_at) rows.push({ key: `labor-end-${row.id}`, at: row.ended_at, type: "Labor", label: `Ended ${label}`, detail: `${formatMinutes(row.duration_minutes)} · ${String(row.end_reason || "stopped").replaceAll("_", " ")}` });
    });
    if (entry?.clock_out) rows.push({ key: "clock-out", at: entry.clock_out, type: "Clock", label: "Clocked out", detail: "" });
    return rows
      .filter(row => safeDate(row.at))
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [entry, breaks, pauses, laborSegments]);

  if (!entry) return null;

  const approvalStatus = entry.approval_status || "unreviewed";
  const trackedBreakMinutes = Number(entry.tracked_break_minutes || 0);
  const trackedPauseMinutes = Number(entry.tracked_work_pause_minutes || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Clock3 className="w-5 h-5 text-purple-600" />
            Shift Details
            {entry.pay_period_id && (
              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
                <LockKeyhole className="w-3 h-3" /> Finalized / Locked
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-semibold text-gray-900"><User className="w-4 h-4" />{entry.user_name || entry.user_email}</div>
              <div className="text-xs text-gray-500 mt-1">{entry.user_email}</div>
              <div className="text-sm text-gray-700 mt-2">{formatDateTime(entry.clock_in)} → {entry.clock_out ? formatDateTime(entry.clock_out) : "Active"}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-700">{Number(entry.total_hours || 0).toFixed(2)} hrs</div>
              <div className="text-xs text-gray-500">Tracked worked time</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={loadDetails}><RefreshCw className="w-3.5 h-3.5 mr-1" />Retry</Button>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex items-center justify-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading authoritative shift history…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1"><Coffee className="w-3.5 h-3.5" />Lunch / unpaid</div>
                <div className="text-lg font-semibold mt-1">{formatMinutes(entry.lunch_minutes || entry.tracked_unpaid_break_minutes || 0)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1"><Coffee className="w-3.5 h-3.5" />Tracked breaks</div>
                <div className="text-lg font-semibold mt-1">{formatMinutes(trackedBreakMinutes)}</div>
                <div className="text-[11px] text-gray-400">Paid {formatMinutes(entry.tracked_paid_break_minutes || 0)} · Unpaid {formatMinutes(entry.tracked_unpaid_break_minutes || 0)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-purple-600 flex items-center gap-1"><Pause className="w-3.5 h-3.5" />Work Pause</div>
                <div className="text-lg font-semibold text-purple-800 mt-1">{formatMinutes(trackedPauseMinutes)}</div>
                <div className="text-[11px] text-gray-400">Excluded from worked time</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Approval</div>
                <Badge variant="outline" className={`mt-1 ${approvalClass(approvalStatus)}`}>{approvalStatus.replaceAll("_", " ")}</Badge>
                {entry.approved_by && <div className="text-[11px] text-gray-400 mt-1">{entry.approved_by}</div>}
              </div>
            </div>

            <section className="rounded-xl border p-4">
              <h3 className="font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-600" />Tracked Current Work</h3>
              <div className="mt-3 space-y-2">
                {laborSegments.length === 0 ? <p className="text-sm text-gray-500">No live Current Work segments were recorded for this shift.</p> : laborSegments.map(row => (
                  <div key={row.id} className="rounded-lg bg-gray-50 p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize">{String(row.activity_type || "work").replaceAll("_", " ")}</div>
                      <div className="text-xs text-gray-500 truncate">{row.work_order_id ? `${row.client_name || "WorkOrder"}${row.work_order_title ? ` — ${row.work_order_title}` : ""}` : "No WorkOrder attached"}</div>
                      <div className="text-xs text-gray-400 mt-1">{formatDateTime(row.started_at)} → {row.ended_at ? formatDateTime(row.ended_at) : "Active"}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={row.status === "active" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-200"}>{row.status}</Badge>
                      {row.status === "completed" && <div className="text-xs font-medium text-gray-700 mt-1">{formatMinutes(row.duration_minutes)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold flex items-center gap-2"><History className="w-4 h-4 text-purple-600" />Shift Timeline</h3>
                <div className="mt-3 space-y-3">
                  {combinedActivity.length === 0 ? <p className="text-sm text-gray-500">No timeline activity is available.</p> : combinedActivity.map(item => (
                    <div key={item.key} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-gray-500">{formatDateTime(item.at)}{item.detail ? ` · ${item.detail}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border p-4">
                <h3 className="font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4 text-purple-600" />Labor Allocations</h3>
                <div className="mt-3 space-y-2">
                  {!entry.job_allocations?.length ? <p className="text-sm text-gray-500">No job or in-house labor allocations.</p> : entry.job_allocations.map((job, index) => {
                    const hours = Number(job.hours ?? (Number(job.minutes || 0) / 60));
                    return (
                      <div key={`${job.work_order_id || job.inhouse_task || index}-${index}`} className="rounded-lg bg-gray-50 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          {job.is_inhouse ? <Home className="w-4 h-4 text-amber-600 shrink-0" /> : <Briefcase className="w-4 h-4 text-purple-600 shrink-0" />}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{job.is_inhouse ? (job.inhouse_task || "In-house") : (job.client_name || job.work_order_title || "WorkOrder")}</div>
                            {!job.is_inhouse && job.work_order_title && <div className="text-xs text-gray-500 truncate">{job.work_order_title}</div>}
                          </div>
                        </div>
                        <span className="font-semibold text-sm shrink-0">{hours.toFixed(2)}h</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="rounded-xl border p-4">
              <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" />Correction History</h3>
              <div className="mt-3 space-y-3">
                {corrections.length === 0 ? <p className="text-sm text-gray-500">No correction requests for this shift.</p> : corrections.map(request => (
                  <div key={request.id} className="rounded-lg bg-gray-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Requested {formatDateTime(request.requested_at)}</div>
                      <Badge variant="outline" className={correctionClass(request.status)}>{String(request.status || "unknown").replaceAll("_", " ")}</Badge>
                    </div>
                    <div className="text-sm text-gray-700 mt-2">{request.employee_reason || "No employee reason stored."}</div>
                    {request.reviewer_email && <div className="text-xs text-gray-500 mt-2">Reviewed by {request.reviewer_email} · {formatDateTime(request.reviewed_at || request.review_started_at)}</div>}
                    {request.reviewer_reason && <div className="text-xs text-gray-500 mt-1">Manager note: {request.reviewer_reason}</div>}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border p-4">
              <h3 className="font-semibold flex items-center gap-2"><LockKeyhole className="w-4 h-4 text-slate-600" />Approval & Pay-Period State</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Manager approval</div>
                  <div className="mt-1 font-medium capitalize">{approvalStatus.replaceAll("_", " ")}</div>
                  {entry.approved_at && <div className="text-xs text-gray-500 mt-1">{formatDateTime(entry.approved_at)}</div>}
                  {entry.approval_note && <div className="text-xs text-gray-600 mt-2">{entry.approval_note}</div>}
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Pay-period lock</div>
                  {entry.pay_period_id ? (
                    <>
                      <div className="mt-1 font-medium">{payPeriod?.label || "Finalized period"}</div>
                      {payPeriod && <div className="text-xs text-gray-500">{payPeriod.start_date} → {payPeriod.end_date} · {payPeriod.status}</div>}
                      <div className="text-xs text-gray-500 mt-1">Locked {formatDateTime(entry.pay_period_locked_at)} by {entry.pay_period_locked_by || "manager"}</div>
                    </>
                  ) : <div className="mt-1 text-gray-500">Not locked by a finalized pay period.</div>}
                </div>
              </div>
            </section>

            <section className="rounded-xl border p-4">
              <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" />Authoritative Audit Events</h3>
              <div className="mt-3 space-y-2">
                {audits.length === 0 ? <p className="text-sm text-gray-500">No audit events are linked to this shift.</p> : audits.map(row => (
                  <div key={row.id} className="rounded-lg bg-gray-50 p-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize">{String(row.action || "event").replaceAll("_", " ")}</div>
                      <div className="text-xs text-gray-500">{formatDateTime(row.server_timestamp)} · Actor: {row.actor_email || row.authentication_method || "system"}</div>
                      {row.reason && <div className="text-xs text-gray-600 mt-1">{row.reason}</div>}
                    </div>
                    <Badge variant="outline" className={auditClass(row.outcome)}>{row.outcome || "unknown"}</Badge>
                  </div>
                ))}
              </div>
            </section>

            {entry.notes && (
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-gray-600" />Shift Notes</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{entry.notes}</p>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
